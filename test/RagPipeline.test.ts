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

  describe("with conversation history", () => {
    const history = [
      { role: "user" as const, content: "Kasko cam kırılmasını karşılar mı?" },
      { role: "assistant" as const, content: "Evet [kasko-cam]." },
    ];

    // Finds the cam document only when the query mentions "cam"; records every query.
    function topicRetriever() {
      const queries: string[] = [];
      const retriever = {
        retrieve: async (query: string) => {
          queries.push(query);
          return query.includes("cam") ? [doc] : [];
        },
      } as unknown as Retriever;
      return { retriever, queries };
    }

    it("sends the earlier turns to the model before the current question", async () => {
      const provider = scriptedProvider("llm", [{ text: "Hayır", model: "m" }]);
      await new RagPipeline(provider, retrieverReturning([doc])).ask("Muafiyet var mı?", history);

      const messages = provider.inputs[0]?.messages ?? [];
      assert.equal(messages.length, 3);
      assert.deepEqual(messages.slice(0, 2), history);
      const current = messages[2];
      assert.equal(current?.role, "user");
      assert.match(current && "content" in current ? current.content : "", /SORU: Muafiyet var mı\?/);
    });

    it("searches again with the previous question when a follow-up finds nothing on its own", async () => {
      const { retriever, queries } = topicRetriever();
      const provider = scriptedProvider("llm", [{ text: "Hayır", model: "m" }]);
      const result = await new RagPipeline(provider, retriever).ask("Muafiyet var mı?", history);

      assert.deepEqual(queries, ["Muafiyet var mı?", "Kasko cam kırılmasını karşılar mı?\nMuafiyet var mı?"]);
      assert.deepEqual(result.sources, [doc]);
    });

    it("doesn't add the previous question when the question finds documents on its own", async () => {
      const { retriever, queries } = topicRetriever();
      const provider = scriptedProvider("llm", [{ text: "Evet", model: "m" }]);
      await new RagPipeline(provider, retriever).ask("Arka cam dahil mi?", history);
      assert.deepEqual(queries, ["Arka cam dahil mi?"]);
    });

    it("searches only once when there is no history", async () => {
      const { retriever, queries } = topicRetriever();
      const provider = scriptedProvider("llm", [{ text: "Bilmiyorum", model: "m" }]);
      await new RagPipeline(provider, retriever).ask("Muafiyet var mı?");
      assert.deepEqual(queries, ["Muafiyet var mı?"]);
    });

    it("askStream uses the history too", async () => {
      const { retriever } = topicRetriever();
      const provider = streamingProvider("llm", ["ok"]);
      const { sources } = await new RagPipeline(provider, retriever).askStream("Muafiyet var mı?", history);
      assert.deepEqual(sources, [doc]);
    });
  });

  it("askStream returns the sources and streams the answer", async () => {
    const provider = streamingProvider("llm", ["Ev", "et"]);
    const { sources, answer } = await new RagPipeline(provider, retrieverReturning([doc])).askStream("Cam kırıldı?");
    assert.deepEqual(sources, [doc]);
    assert.deepEqual(await collect(answer), ["Ev", "et"]);
  });
});
