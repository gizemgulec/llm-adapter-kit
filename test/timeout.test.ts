import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { withTimeout } from "../src/domain/llm/timeout.js";
import { withRetry } from "../src/domain/llm/retry.js";
import { ProviderTimeoutError, ProviderUnavailableError } from "../src/domain/llm/errors.js";
import { FallbackProvider } from "../src/domain/llm/FallbackProvider.js";
import { Retriever } from "../src/domain/llm/knowledgeBase.js";
import type { LLMProvider } from "../src/domain/llm/types.js";
import { collect, hangingProvider, scriptedProvider, silenceLogs, streamingProvider } from "./helpers.js";

silenceLogs();

const input = { messages: [{ role: "user" as const, content: "soru" }] };
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("withTimeout", () => {
  it("returns the result when it arrives in time", async () => {
    assert.equal(await withTimeout(50, async () => "ok"), "ok");
  });

  it("rejects with ProviderTimeoutError and aborts the signal when the limit passes", async () => {
    let signal: AbortSignal | undefined;
    await assert.rejects(
      withTimeout(20, (s) => {
        signal = s;
        return new Promise(() => {}); // never settles
      }),
      (err) => err instanceof ProviderTimeoutError && err instanceof ProviderUnavailableError
    );
    assert.ok(signal?.aborted);
  });

  it("is not retried", async () => {
    let calls = 0;
    await assert.rejects(
      withRetry(() => {
        calls++;
        return withTimeout(10, () => new Promise(() => {}));
      }, 3, 1),
      ProviderTimeoutError
    );
    assert.equal(calls, 1);
  });
});

describe("FallbackProvider timeouts", () => {
  it("cancels a hung complete() and falls back to the next provider", async () => {
    const hung = hangingProvider("hung");
    const backup = scriptedProvider("backup", [{ text: "yedek", model: "b" }]);
    const result = await new FallbackProvider([hung, backup], { timeoutMs: 20 }).complete(input);
    assert.equal(result.text, "yedek");
    assert.ok(hung.aborted(), "the hung request was cancelled");
  });

  it("falls back when a stream sends no first chunk in time", async () => {
    const hung = hangingProvider("hung");
    const chunks = await collect(
      new FallbackProvider([hung, streamingProvider("backup", ["ok"])], { timeoutMs: 20 }).stream(input)
    );
    assert.deepEqual(chunks, ["ok"]);
    assert.ok(hung.aborted());
  });

  it("times out when a stream stalls between chunks, without falling back", async () => {
    let aborted = false;
    const stalls: LLMProvider = {
      name: "stalls",
      complete: async () => ({ text: "", model: "s" }),
      async *stream(input) {
        yield "ilk ";
        await new Promise((_, reject) =>
          input.signal?.addEventListener("abort", () => {
            aborted = true;
            reject(input.signal?.reason);
          })
        );
      },
    };
    const backup = streamingProvider("backup", ["x"]);
    const received: string[] = [];
    await assert.rejects(
      (async () => {
        for await (const chunk of new FallbackProvider([stalls, backup], { timeoutMs: 20 }).stream(input)) {
          received.push(chunk);
        }
      })(),
      ProviderTimeoutError
    );
    assert.deepEqual(received, ["ilk "]);
    assert.ok(aborted, "the stalled request was cancelled");
    assert.equal(backup.calls(), 0);
  });

  it("doesn't cut off a long answer whose chunks keep arriving", async () => {
    const slowButSteady: LLMProvider = {
      name: "steady",
      complete: async () => ({ text: "", model: "s" }),
      async *stream() {
        for (const chunk of ["a", "b", "c", "d"]) {
          await delay(15); // each gap is under the limit; the whole answer (~60ms) is over it
          yield chunk;
        }
      },
    };
    const chunks = await collect(new FallbackProvider([slowButSteady], { timeoutMs: 30 }).stream(input));
    assert.deepEqual(chunks, ["a", "b", "c", "d"]);
  });

  it("aborts the provider's request when the caller stops reading", async () => {
    let signal: AbortSignal | undefined;
    const provider: LLMProvider = {
      name: "p",
      complete: async () => ({ text: "", model: "p" }),
      async *stream(input) {
        signal = input.signal;
        yield* ["a", "b", "c"];
      },
    };
    for await (const chunk of new FallbackProvider([provider]).stream(input)) {
      if (chunk === "a") break;
    }
    assert.ok(signal?.aborted);
  });
});

describe("Retriever timeouts", () => {
  it("throws ProviderUnavailableError when embedding hangs, and cancels every request", async () => {
    // The question and the documents are embedded in parallel, each with its own time limit.
    const signals: (AbortSignal | undefined)[] = [];
    const retriever = new Retriever(
      {
        name: "hung",
        embed: (_text, signal) => {
          signals.push(signal);
          return new Promise(() => {});
        },
      },
      { timeoutMs: 20 }
    );
    await assert.rejects(retriever.retrieve("q"), ProviderUnavailableError);
    await delay(20); // the first timeout rejects retrieve(); give the others time to fire
    assert.ok(signals.length > 1);
    assert.ok(signals.every((signal) => signal?.aborted));
  });
});
