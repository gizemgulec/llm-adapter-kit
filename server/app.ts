// server/app.ts
// The Express app, separate from index.ts (which wires real providers and listens on a port),
// so the routes can be tested with a fake pipeline.
import express from "express";
import cors from "cors";
import type { RagPipeline } from "../src/domain/llm/RagPipeline.js";
import { ProviderUnavailableError } from "../src/domain/llm/errors.js";

export const MAX_QUESTION_LENGTH = 1000;
export const UNAVAILABLE_MESSAGE = "Şu anda cevap veremiyorum. Lütfen biraz sonra tekrar deneyin.";

// The part of RagPipeline the routes use.
export type AskService = Pick<RagPipeline, "ask" | "askStream">;

// Validates the request body. Returns the normalized question, or an error message.
function parseQuestion(body: unknown): { question: string } | { error: string } {
  const question: unknown = (body as { question?: unknown } | undefined)?.question;

  if (typeof question !== "string") {
    return { error: "question alanı gerekli (string)." };
  }
  const normalizedQuestion = question.trim();
  if (!normalizedQuestion) {
    return { error: "Soru boş olamaz." };
  }
  if (normalizedQuestion.length > MAX_QUESTION_LENGTH) {
    return { error: `Soru en fazla ${MAX_QUESTION_LENGTH} karakter olabilir.` };
  }
  return { question: normalizedQuestion };
}

export function createApp(rag: AskService) {
  const app = express();

  // --- Middleware ---
  app.use(cors());          // Allow the mobile app to access this server
  app.use(express.json());  // Automatically parse incoming JSON requests

  // --- Health check (is the server running?) ---
  app.get("/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // --- Main endpoint: accept a question, run it through RAG, and return the answer ---
  app.post("/ask", async (req, res) => {
    try {
      const parsed = parseQuestion(req.body);
      if ("error" in parsed) {
        return res.status(400).json({ error: parsed.error });
      }

      console.log("[Gelen soru]:", parsed.question);
      const result = await rag.ask(parsed.question);
      console.log("[Dönen cevap]:", result.answer);

      res.json({ question: parsed.question, ...result });
    } catch (err) {
      console.error("[Hata]:", err);
      if (err instanceof ProviderUnavailableError) {
        res.status(503).json({ error: UNAVAILABLE_MESSAGE });
      } else {
        res.status(500).json({ error: "Sunucu hatası oluştu." });
      }
    }
  });

  // --- Streaming endpoint: same as /ask, but the answer arrives chunk by chunk ---
  // Response is NDJSON (one JSON object per line):
  //   {"type":"sources","sources":[...]}   once, before the answer
  //   {"type":"delta","text":"..."}        zero or more answer chunks
  //   {"type":"done"}                      the answer is complete
  //   {"type":"error","error":"..."}       the stream failed after it started
  app.post("/ask/stream", async (req, res) => {
    const parsed = parseQuestion(req.body);
    if ("error" in parsed) {
      return res.status(400).json({ error: parsed.error });
    }

    let clientClosed = false;
    res.on("close", () => {
      clientClosed = true;
    });

    const send = (event: object) => res.write(JSON.stringify(event) + "\n");

    try {
      console.log("[Gelen soru (stream)]:", parsed.question);
      const { answer, sources } = await rag.askStream(parsed.question);

      res.status(200);
      res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache");
      res.flushHeaders();
      send({ type: "sources", sources });

      let fullAnswer = "";
      for await (const text of answer) {
        if (clientClosed) break; // stop generating if the app disconnected
        fullAnswer += text;
        send({ type: "delta", text });
      }

      console.log("[Dönen cevap (stream)]:", fullAnswer.trim());
      if (!clientClosed) send({ type: "done" });
      res.end();
    } catch (err) {
      console.error("[Hata]:", err);
      const unavailable = err instanceof ProviderUnavailableError;
      if (res.headersSent) {
        // The stream has started: report the error as an event
        send({ type: "error", error: unavailable ? UNAVAILABLE_MESSAGE : "Cevap üretilirken hata oluştu." });
        res.end();
      } else if (unavailable) {
        // Failed before streaming (e.g. during retrieval): a normal JSON error
        res.status(503).json({ error: UNAVAILABLE_MESSAGE });
      } else {
        res.status(500).json({ error: "Sunucu hatası oluştu." });
      }
    }
  });

  return app;
}
