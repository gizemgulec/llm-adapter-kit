import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { AllProvidersFailedError, FallbackProvider } from "../src/domain/llm/FallbackProvider.js";
import { ProviderUnavailableError } from "../src/domain/llm/errors.js";
import { collect, httpError, scriptedProvider, silenceLogs, streamingProvider } from "./helpers.js";

silenceLogs();

const input = { messages: [{ role: "user" as const, content: "soru" }] };
// 400 is not retried, so these tests fall back immediately instead of waiting for backoff.
const permanent = () => httpError(400);

describe("FallbackProvider", () => {
  it("requires at least one provider", () => {
    assert.throws(() => new FallbackProvider([]));
  });

  describe("complete", () => {
    it("uses the first provider when it succeeds", async () => {
      const first = scriptedProvider("first", [{ text: "birinci", model: "a" }]);
      const second = scriptedProvider("second", [{ text: "ikinci", model: "b" }]);
      const result = await new FallbackProvider([first, second]).complete(input);
      assert.equal(result.text, "birinci");
      assert.equal(second.inputs.length, 0);
    });

    it("falls back to the next provider when one fails", async () => {
      const first = scriptedProvider("first", [permanent()]);
      const second = scriptedProvider("second", [{ text: "ikinci", model: "b" }]);
      const result = await new FallbackProvider([first, second]).complete(input);
      assert.equal(result.text, "ikinci");
    });

    it("throws AllProvidersFailedError, a ProviderUnavailableError, when every provider fails", async () => {
      const last = httpError(401, "son hata");
      const provider = new FallbackProvider([
        scriptedProvider("first", [permanent()]),
        scriptedProvider("second", [last]),
      ]);
      await assert.rejects(provider.complete(input), (err) => {
        assert.ok(err instanceof AllProvidersFailedError);
        assert.ok(err instanceof ProviderUnavailableError);
        assert.equal(err.lastError, last);
        assert.match(err.message, /son hata/);
        return true;
      });
    });
  });

  describe("stream", () => {
    it("streams the chunks of the first provider", async () => {
      const chunks = await collect(new FallbackProvider([streamingProvider("a", ["Mer", "haba"])]).stream(input));
      assert.deepEqual(chunks, ["Mer", "haba"]);
    });

    it("falls back when a provider fails before its first chunk", async () => {
      const broken = streamingProvider("broken", [], { failBeforeFirst: permanent() });
      const healthy = streamingProvider("healthy", ["ok"]);
      const chunks = await collect(new FallbackProvider([broken, healthy]).stream(input));
      assert.deepEqual(chunks, ["ok"]);
    });

    it("passes a mid-stream error to the caller instead of switching providers", async () => {
      const midError = httpError(500, "kesildi");
      const flaky = streamingProvider("flaky", ["a", "b", "c"], { failAfter: { count: 1, error: midError } });
      const backup = streamingProvider("backup", ["x"]);
      const received: string[] = [];
      await assert.rejects(
        (async () => {
          for await (const chunk of new FallbackProvider([flaky, backup]).stream(input)) received.push(chunk);
        })(),
        (err) => err === midError
      );
      assert.deepEqual(received, ["a"]);
      assert.equal(backup.calls(), 0, "switching providers mid-stream would duplicate text");
    });

    it("closes the provider's stream when the caller stops early", async () => {
      const inner = streamingProvider("inner", ["a", "b", "c", "d"]);
      for await (const chunk of new FallbackProvider([inner]).stream(input)) {
        if (chunk === "b") break; // e.g. the client disconnected
      }
      assert.ok(inner.closed());
    });

    it("handles a stream with no chunks", async () => {
      assert.deepEqual(await collect(new FallbackProvider([streamingProvider("empty", [])]).stream(input)), []);
    });

    it("throws AllProvidersFailedError when every provider fails before its first chunk", async () => {
      const provider = new FallbackProvider([streamingProvider("a", [], { failBeforeFirst: permanent() })]);
      await assert.rejects(collect(provider.stream(input)), AllProvidersFailedError);
    });
  });
});
