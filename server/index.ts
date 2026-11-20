// server/index.ts
import "dotenv/config";
import express from "express";
import cors from "cors";
import { RagPipeline } from "../src/domain/llm/RagPipeline.js";
import { FallbackProvider } from "../src/domain/llm/FallbackProvider.js";
import { GeminiAdapter } from "../src/domain/llm/adapters/GeminiAdapter.js";
import { MockAdapter } from "../src/domain/llm/adapters/MockAdapter.js";

const MAX_QUESTION_LENGTH = 1000;
const app = express();

// --- Middleware ---
app.use(cors());          // Allow the mobile app to access this server
app.use(express.json());  // Automatically parse incoming JSON requests

// --- Initialize the API key and pipeline once ---
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  throw new Error(".env dosyasında GEMINI_API_KEY bulunamadı.");
}
const provider = new FallbackProvider([
  new GeminiAdapter(apiKey),
  new MockAdapter(),
]);
const rag = new RagPipeline(provider, apiKey);

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
    res.status(500).json({ error: "Sunucu hatası oluştu." });
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
    if (res.headersSent) {
      send({ type: "error", error: "Cevap üretilirken hata oluştu." });
      res.end();
    } else {
      res.status(500).json({ error: "Sunucu hatası oluştu." });
    }
  }
});

// --- Start the server ---
const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, () => {
  console.log(`✅ Backend proxy çalışıyor: http://localhost:${PORT}`);
});
