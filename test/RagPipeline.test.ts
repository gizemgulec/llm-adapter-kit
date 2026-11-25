import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { RagPipeline, citedSources } from "../src/domain/llm/RagPipeline.js";
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

  describe("cited sources", () => {
    const trafik: RetrievedDocument = { id: "trafik-zorunlu", content: "Trafik sigortası zorunludur.", score: 0.8 };

    it("returns only the retrieved documents the answer cites", async () => {
      const provider = scriptedProvider("llm", [{ text: "Evet [kasko-cam]", model: "m" }]);
      const result = await new RagPipeline(provider, retrieverReturning([doc, trafik])).ask("Cam?");
      assert.deepEqual(result.sources, [doc]);
    });

    it("returns no sources when the answer cites nothing", async () => {
      const provider = scriptedProvider("llm", [{ text: "Bu konuda bilgim yok.", model: "m" }]);
      const result = await new RagPipeline(provider, retrieverReturning([doc])).ask("Evcil hayvan?");
      assert.deepEqual(result.sources, []);
    });

    for (const [label, answer] of [
      ["[id]", "Evet [kasko-cam]. Zorunlu [trafik-zorunlu]."],
      ["[id, id]", "Evet [kasko-cam, trafik-zorunlu]."],
      ["[Kaynak: id]", "Evet [Kaynak: kasko-cam] ve [Kaynak: trafik-zorunlu]."],
    ] as const) {
      it(`recognizes citations written as ${label}`, () => {
        assert.deepEqual(citedSources(answer, [doc, trafik]), [doc, trafik]);
      });
    }

    it("matches whole ids only", () => {
      const longer: RetrievedDocument = { id: "kasko-cam-2", content: "x", score: 0.8 };
      assert.deepEqual(citedSources("Bkz. [kasko-cam-2]", [doc, longer]), [longer]);
    });
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
      const provider = scriptedProvider("llm", [{ text: "Hayır [kasko-cam]", model: "m" }]);
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

    it("uses an earlier question when the last one doesn't help (cam → evcil hayvan → muafiyet)", async () => {
      const { retriever } = topicRetriever();
      const provider = scriptedProvider("llm", [{ text: "Hayır [kasko-cam]", model: "m" }]);
      const conversation = [
        ...history,
        { role: "user" as const, content: "Evcil hayvan sigortası var mı?" },
        { role: "assistant" as const, content: "Bu konuda bilgim yok." },
      ];
      const result = await new RagPipeline(provider, retriever).ask("Muafiyet var mı?", conversation);
      assert.deepEqual(result.sources, [doc]);
    });

    it("prefers the newest earlier question that finds documents", async () => {
      const trafik: RetrievedDocument = { id: "trafik-zorunlu", content: "Zorunlu.", score: 0.8 };
      const retriever = {
        retrieve: async (query: string) => {
          if (query.startsWith("Trafik?\n")) return [trafik];
          if (query.startsWith("Cam?\n")) return [doc];
          return [];
        },
      } as unknown as Retriever;
      const provider = scriptedProvider("llm", [{ text: "[trafik-zorunlu]", model: "m" }]);
      const conversation = [
        { role: "user" as const, content: "Cam?" },
        { role: "assistant" as const, content: "Evet." },
        { role: "user" as const, content: "Trafik?" },
        { role: "assistant" as const, content: "Zorunlu." },
      ];
      const result = await new RagPipeline(provider, retriever).ask("Peki muafiyet?", conversation);
      assert.deepEqual(result.sources, [trafik]);
    });

    it("looks back at most 3 questions", async () => {
      const { retriever, queries } = topicRetriever();
      const provider = scriptedProvider("llm", [{ text: "Bilmiyorum", model: "m" }]);
      const conversation = ["Cam?", "A?", "B?", "C?"].flatMap((content) => [
        { role: "user" as const, content },
        { role: "assistant" as const, content: "..." },
      ]);
      await new RagPipeline(provider, retriever).ask("Muafiyet?", conversation);
      // "Cam?" is 4 questions back, so it's not used
      assert.deepEqual(queries.slice(1).sort(), ["A?\nMuafiyet?", "B?\nMuafiyet?", "C?\nMuafiyet?"]);
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
