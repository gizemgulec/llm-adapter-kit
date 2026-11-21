import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Retriever, knowledgeBase, MIN_RELEVANCE_SCORE } from "../src/domain/llm/knowledgeBase.js";
import { ProviderUnavailableError } from "../src/domain/llm/errors.js";
import type { EmbeddingProvider } from "../src/domain/llm/types.js";
import { httpError, silenceLogs } from "./helpers.js";

silenceLogs();

const [cam, hasar, trafik] = knowledgeBase.map((doc) => doc.id);

// Each document gets its own axis, so a question's similarity to it is easy to control.
// Questions are looked up in `questions`.
function fakeEmbedder(questions: Record<string, number[]>, options: { failFirst?: Error } = {}) {
  let calls = 0;
  let failed = false;
  const docVectors = new Map(knowledgeBase.map((doc, i) => [doc.content, knowledgeBase.map((_, j) => (i === j ? 1 : 0))]));
  const embedder: EmbeddingProvider & { calls: () => number } = {
    name: "fake",
    calls: () => calls,
    async embed(text) {
      calls++;
      if (options.failFirst && !failed) {
        failed = true;
        throw options.failFirst;
      }
      const vector = docVectors.get(text) ?? questions[text];
      if (!vector) throw new Error(`no vector for "${text}"`);
      return vector;
    },
  };
  return embedder;
}

const ids = (docs: { id: string }[]) => docs.map((doc) => doc.id);

describe("Retriever", () => {
  it("returns the document the question is about", async () => {
    const retriever = new Retriever(fakeEmbedder({ q: [1, 0.1, 0] }));
    assert.deepEqual(ids(await retriever.retrieve("q")), [cam]);
  });

  it(`returns nothing when no document reaches MIN_RELEVANCE_SCORE (${MIN_RELEVANCE_SCORE})`, async () => {
    // cosine similarity 0.707 with two documents: related, but not relevant enough
    const retriever = new Retriever(fakeEmbedder({ q: [1, 1, 0] }));
    assert.deepEqual(await retriever.retrieve("q"), []);
  });

  it("sorts by score and keeps the best topN", async () => {
    const retriever = new Retriever(fakeEmbedder({ q: [1, 3, 2] }));
    const docs = await retriever.retrieve("q", 2, 0);
    assert.deepEqual(ids(docs), [hasar, trafik]);
    assert.ok(Math.abs(docs[0]!.score - 3 / Math.sqrt(14)) < 1e-9);
  });

  it("embeds the documents once and reuses them for later questions", async () => {
    const embedder = fakeEmbedder({ a: [1, 0, 0], b: [0, 1, 0] });
    const retriever = new Retriever(embedder);
    await retriever.retrieve("a");
    await retriever.retrieve("b");
    assert.equal(embedder.calls(), knowledgeBase.length + 2);
  });

  it("shares one document computation between concurrent first requests", async () => {
    const embedder = fakeEmbedder({ q: [1, 0, 0] });
    const retriever = new Retriever(embedder);
    await Promise.all(Array.from({ length: 5 }, () => retriever.retrieve("q")));
    assert.equal(embedder.calls(), knowledgeBase.length + 5);
  });

  it("throws ProviderUnavailableError when embedding fails, and doesn't cache the failure", async () => {
    const retriever = new Retriever(fakeEmbedder({ q: [1, 0, 0] }, { failFirst: httpError(400) }));
    await assert.rejects(retriever.retrieve("q"), ProviderUnavailableError);
    assert.deepEqual(ids(await retriever.retrieve("q")), [cam]);
  });
});
