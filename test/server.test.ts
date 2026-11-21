import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { createApp, MAX_QUESTION_LENGTH, UNAVAILABLE_MESSAGE, type AskService } from "../server/app.js";
import { ProviderUnavailableError } from "../src/domain/llm/errors.js";
import type { RetrievedDocument } from "../src/domain/llm/knowledgeBase.js";
import { silenceLogs } from "./helpers.js";

silenceLogs();

const source: RetrievedDocument = { id: "kasko-cam", content: "Cam kırılması dahildir.", score: 0.9 };

// The fake pipeline's behavior is picked per question, so one server serves every test.
async function* chunks(...parts: string[]) {
  yield* parts;
}
async function* failAfterFirst(error: Error) {
  yield "Ev";
  throw error;
}
const unavailable = () => new ProviderUnavailableError("Gemini down");

const fakeRag: AskService = {
  async ask(question) {
    if (question === "unavailable") throw unavailable();
    if (question === "bug") throw new Error("bug");
    return { answer: "Evet", sources: [source] };
  },
  async askStream(question) {
    if (question === "unavailable") throw unavailable();
    if (question === "bug") throw new Error("bug");
    if (question === "unavailable mid-stream") return { sources: [source], answer: failAfterFirst(unavailable()) };
    if (question === "bug mid-stream") return { sources: [source], answer: failAfterFirst(new Error("bug")) };
    return { sources: [source], answer: chunks("Ev", "et") };
  },
};

let server: Server;
let baseUrl: string;

before(async () => {
  server = createApp(fakeRag).listen(0);
  await once(server, "listening");
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => server.close());

const post = (path: string, body: unknown) =>
  fetch(baseUrl + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

const events = async (res: Response) =>
  (await res.text()).trim().split("\n").map((line) => JSON.parse(line) as Record<string, unknown>);

describe("server", () => {
  it("GET /health", async () => {
    const res = await fetch(baseUrl + "/health");
    assert.deepEqual(await res.json(), { status: "ok" });
  });

  for (const path of ["/ask", "/ask/stream"]) {
    describe(`${path} validation`, () => {
      for (const [label, body, error] of [
        ["missing question", {}, "question alanı gerekli (string)."],
        ["non-string question", { question: 42 }, "question alanı gerekli (string)."],
        ["blank question", { question: "   " }, "Soru boş olamaz."],
        ["too long", { question: "a".repeat(MAX_QUESTION_LENGTH + 1) }, `Soru en fazla ${MAX_QUESTION_LENGTH} karakter olabilir.`],
      ] as const) {
        it(`rejects a ${label} with 400`, async () => {
          const res = await post(path, body);
          assert.equal(res.status, 400);
          assert.deepEqual(await res.json(), { error });
        });
      }
    });
  }

  describe("POST /ask", () => {
    it("returns the trimmed question, answer, and sources", async () => {
      const res = await post("/ask", { question: "  Cam kırıldı?  " });
      assert.equal(res.status, 200);
      assert.deepEqual(await res.json(), { question: "Cam kırıldı?", answer: "Evet", sources: [source] });
    });

    it("returns 503 with a try-again message when a provider is unavailable", async () => {
      const res = await post("/ask", { question: "unavailable" });
      assert.equal(res.status, 503);
      assert.deepEqual(await res.json(), { error: UNAVAILABLE_MESSAGE });
    });

    it("returns 500 for any other error", async () => {
      const res = await post("/ask", { question: "bug" });
      assert.equal(res.status, 500);
    });
  });

  describe("POST /ask/stream", () => {
    it("streams NDJSON: sources, then deltas, then done", async () => {
      const res = await post("/ask/stream", { question: "Cam kırıldı?" });
      assert.equal(res.status, 200);
      assert.match(res.headers.get("content-type") ?? "", /application\/x-ndjson/);
      assert.deepEqual(await events(res), [
        { type: "sources", sources: [source] },
        { type: "delta", text: "Ev" },
        { type: "delta", text: "et" },
        { type: "done" },
      ]);
    });

    // Regression: this used to return 500 (fixed in #19).
    it("returns 503 JSON when a provider is unavailable before streaming starts", async () => {
      const res = await post("/ask/stream", { question: "unavailable" });
      assert.equal(res.status, 503);
      assert.deepEqual(await res.json(), { error: UNAVAILABLE_MESSAGE });
    });

    it("returns 500 JSON for any other error before streaming starts", async () => {
      const res = await post("/ask/stream", { question: "bug" });
      assert.equal(res.status, 500);
    });

    it("ends with an error event when the provider fails mid-stream", async () => {
      const res = await post("/ask/stream", { question: "unavailable mid-stream" });
      assert.deepEqual((await events(res)).slice(1), [
        { type: "delta", text: "Ev" },
        { type: "error", error: UNAVAILABLE_MESSAGE },
      ]);
    });

    it("uses a generic message for other mid-stream errors", async () => {
      const res = await post("/ask/stream", { question: "bug mid-stream" });
      assert.deepEqual((await events(res)).at(-1), { type: "error", error: "Cevap üretilirken hata oluştu." });
    });
  });
});
