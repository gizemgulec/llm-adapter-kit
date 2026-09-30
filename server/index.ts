// server/index.ts
import "dotenv/config";
import express from "express";
import cors from "cors";
import { RagPipeline } from "../src/domain/llm/RagPipeline.js";
import { FallbackProvider } from "../src/domain/llm/FallbackProvider.js";
import { GeminiAdapter } from "../src/domain/llm/adapters/GeminiAdapter.js";
import { MockAdapter } from "../src/domain/llm/adapters/MockAdapter.js";

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
const rag = new RagPipeline(provider);

// --- Health check (is the server running?) ---
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// --- Main endpoint: accept a question, run it through RAG, and return the answer ---
app.post("/ask", async (req, res) => {
  try {
    const { question } = req.body;

    if (!question || typeof question !== "string") {
      return res.status(400).json({ error: "question alanı gerekli (string)." });
    }

    console.log("[Gelen soru]:", question);
    const answer = await rag.ask(question);
    console.log("[Dönen cevap]:", answer);

    res.json({ question, answer });
  } catch (err) {
    console.error("[Hata]:", err);
    res.status(500).json({ error: "Sunucu hatası oluştu." });
  }
});

// --- Start the server ---
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`✅ Backend proxy çalışıyor: http://localhost:${PORT}`);
});
