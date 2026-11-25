// server/app.ts
// The Express app, separate from index.ts (which wires real providers and listens on a port),
// so the routes can be tested with a fake pipeline.
import express from "express";
import cors from "cors";
import { citedSources, type RagPipeline } from "../src/domain/llm/RagPipeline.js";
import type { ChatTurn } from "../src/domain/llm/types.js";
import { ProviderUnavailableError } from "../src/domain/llm/errors.js";

export const MAX_QUESTION_LENGTH = 1000;
// Only the most recent turns are sent to the model, to keep the prompt (and its cost) bounded.
export const MAX_HISTORY_MESSAGES = 10;
// Answers are longer than questions, so turns get a larger limit than MAX_QUESTION_LENGTH.
export const MAX_HISTORY_MESSAGE_LENGTH = 4000;
export const UNAVAILABLE_MESSAGE = "Şu anda cevap veremiyorum. Lütfen biraz sonra tekrar deneyin.";

// The part of RagPipeline the routes use.
export type AskService = Pick<RagPipeline, "ask" | "askStream">;

type ParsedRequest = { question: string; history: ChatTurn[] } | { error: string };

// Validates the request body: { question, history? }.
function parseRequest(body: unknown): ParsedRequest {
  const parsedQuestion = parseQuestion((body as { question?: unknown } | undefined)?.question);
  if ("error" in parsedQuestion) return parsedQuestion;

  const parsedHistory = parseHistory((body as { history?: unknown } | undefined)?.history);
  if ("error" in parsedHistory) return parsedHistory;

  return { question: parsedQuestion.question, history: parsedHistory.history };
}

// History comes from the client: [{ role: "user" | "assistant", content }], oldest first.
function parseHistory(value: unknown): { history: ChatTurn[] } | { error: string } {
  if (value === undefined) return { history: [] };
  if (!Array.isArray(value)) return { error: "history bir dizi olmalı." };

  const history: ChatTurn[] = [];
  for (const item of value as unknown[]) {
    const { role, content } = (item ?? {}) as { role?: unknown; content?: unknown };
    if ((role !== "user" && role !== "assistant") || typeof content !== "string") {
      return { error: "history öğeleri { role: 'user' | 'assistant', content: string } olmalı." };
    }
    if (content.length > MAX_HISTORY_MESSAGE_LENGTH) {
      return { error: `history mesajları en fazla ${MAX_HISTORY_MESSAGE_LENGTH} karakter olabilir.` };
    }
    // Skip empty turns (e.g. an answer that failed before any text arrived): providers reject them.
    if (content.trim()) history.push({ role, content });
  }

  // Keep the most recent turns, starting on a user turn so the conversation reads in order.
  const recent = history.slice(-MAX_HISTORY_MESSAGES);
  const firstUser = recent.findIndex((turn) => turn.role === "user");
  return { history: firstUser === -1 ? [] : recent.slice(firstUser) };
}

function parseQuestion(question: unknown): { question: string } | { error: string } {
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
      const parsed = parseRequest(req.body);
      if ("error" in parsed) {
        return res.status(400).json({ error: parsed.error });
      }

      console.log("[Gelen soru]:", parsed.question);
      const result = await rag.ask(parsed.question, parsed.history);
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
  //   {"type":"delta","text":"..."}        zero or more answer chunks
  //   {"type":"sources","sources":[...]}   once, after the answer: the documents it cites
  //   {"type":"done"}                      the answer is complete
  //   {"type":"error","error":"..."}       the stream failed after it started
  app.post("/ask/stream", async (req, res) => {
    const parsed = parseRequest(req.body);
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
      const { answer, sources } = await rag.askStream(parsed.question, parsed.history);

      res.status(200);
      res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache");
      res.flushHeaders();

      let fullAnswer = "";
      for await (const text of answer) {
        if (clientClosed) break; // stop generating if the app disconnected
        fullAnswer += text;
        send({ type: "delta", text });
      }

      console.log("[Dönen cevap (stream)]:", fullAnswer.trim());
      if (!clientClosed) {
        // Sent last: which documents the answer cites is only known once it's complete.
        send({ type: "sources", sources: citedSources(fullAnswer, sources) });
        send({ type: "done" });
      }
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
