import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { withRetry } from "../src/domain/llm/retry.js";
import { httpError, silenceLogs } from "./helpers.js";

silenceLogs();

// Fails with the given errors in order, then succeeds.
function failing(errors: Error[]) {
  let calls = 0;
  const fn = async () => {
    const error = errors[calls++];
    if (error) throw error;
    return "ok";
  };
  return { fn, calls: () => calls };
}

describe("withRetry", () => {
  it("returns the result without retrying when the first call succeeds", async () => {
    const op = failing([]);
    assert.equal(await withRetry(op.fn, 3, 1), "ok");
    assert.equal(op.calls(), 1);
  });

  for (const [label, error] of [
    ["503", httpError(503)],
    ["500", httpError(500)],
    ["429 rate limit", httpError(429)],
    ["408 timeout", httpError(408)],
    ["network error without a status", new TypeError("fetch failed")],
  ] as const) {
    it(`retries a transient error: ${label}`, async () => {
      const op = failing([error]);
      assert.equal(await withRetry(op.fn, 3, 1), "ok");
      assert.equal(op.calls(), 2);
    });
  }

  for (const status of [400, 401, 403, 404]) {
    it(`does not retry a permanent ${status} error`, async () => {
      const error = httpError(status);
      const op = failing([error, error]);
      await assert.rejects(withRetry(op.fn, 3, 1), (err) => err === error);
      assert.equal(op.calls(), 1);
    });
  }

  it("gives up after maxAttempts and throws the last error", async () => {
    const last = httpError(503, "last");
    const op = failing([httpError(503), httpError(503), last]);
    await assert.rejects(withRetry(op.fn, 3, 1), (err) => err === last);
    assert.equal(op.calls(), 3);
  });

  it("doubles the wait after each attempt", async () => {
    const op = failing([httpError(503), httpError(503), httpError(503)]);
    const start = Date.now();
    await assert.rejects(withRetry(op.fn, 3, 20));
    // waits 20ms + 40ms between the three attempts (no wait after the last one)
    assert.ok(Date.now() - start >= 55, `waited only ${Date.now() - start}ms`);
  });
});
