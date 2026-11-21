import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { RagPipeline } from "../src/domain/llm/RagPipeline.js";
import type { Retriever, RetrievedDocument } from "../src/domain/llm/knowledgeBase.js";
import { collect, scriptedProvider, silenceLogs, streamingProvider } from "./helpers.js";

silenceLogs();

const doc: RetrievedDocument = { id: "kasko-cam", content: "Cam kırılması teminatı dahildir.", score: 0.9 };

function retrieverReturning(docs: RetrievedDocument[]): Retriever {
  return { retrieve: async () => docs } as unknown as Retriever;
}

const promptOf = (provider: ReturnType<typeof scriptedProvider>) => {
  const message = provider.inputs[0]?.messages[0];
  return message && "content" in message ? message.content : "";
};

describe("RagPipeline", () => {
  it("puts the retrieved documents and the question in the prompt", async () => {
    const provider = scriptedProvider("llm", [{ text: "Evet [kasko-cam]", model: "m" }]);
    await new RagPipeline(provider, retrieverReturning([doc])).ask("Cam kırıldı?");

    const prompt = promptOf(provider);
    assert.match(prompt, /\[Kaynak: kasko-cam\] Cam kırılması teminatı dahildir\./);
    assert.match(prompt, /SORU: Cam kırıldı\?/);
    assert.ok(provider.inputs[0]?.system, "a system prompt is set");
  });

  it("tells the model to say it doesn't know when no document was found", async () => {
    const provider = scriptedProvider("llm", [{ text: "Bu konuda bilgim yok", model: "m" }]);
    const result = await new RagPipeline(provider, retrieverReturning([])).ask("Evcil hayvan?");

    assert.match(promptOf(provider), /elimde belge yok/);
    assert.deepEqual(result.sources, []);
  });

  it("returns the trimmed answer with its sources", async () => {
    const provider = scriptedProvider("llm", [{ text: "  Evet [kasko-cam]\n", model: "m" }]);
    const result = await new RagPipeline(provider, retrieverReturning([doc])).ask("Cam kırıldı?");
    assert.deepEqual(result, { answer: "Evet [kasko-cam]", sources: [doc] });
  });

  it("askStream returns the sources and streams the answer", async () => {
    const provider = streamingProvider("llm", ["Ev", "et"]);
    const { sources, answer } = await new RagPipeline(provider, retrieverReturning([doc])).askStream("Cam kırıldı?");
    assert.deepEqual(sources, [doc]);
    assert.deepEqual(await collect(answer), ["Ev", "et"]);
  });
});
