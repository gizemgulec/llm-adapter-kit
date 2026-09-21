// server/index.ts
import "dotenv/config";
import express from "express";
import cors from "cors";
import { ModelStrategy } from "../src/domain/llm/ModelStrategy.js";
import { RagPipeline } from "../src/domain/llm/RagPipeline.js";

const app = express();

// --- Ara katmanlar (middleware) ---
app.use(cors());          // Mobil uygulamanın bu sunucuya erişebilmesi için izin
app.use(express.json());  // Gelen JSON isteklerini otomatik ayrıştır

// --- API key ve pipeline'ı bir kez kur ---
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  throw new Error(".env dosyasında GEMINI_API_KEY bulunamadı.");
}
const strategy = new ModelStrategy(apiKey);
const provider = strategy.select("cheap");
const rag = new RagPipeline(provider);

// --- Sağlık kontrolü (sunucu ayakta mı?) ---
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// --- Asıl endpoint: soru al, RAG'den geçir, cevabı dön ---
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

// --- Sunucuyu başlat ---
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`✅ Backend proxy çalışıyor: http://localhost:${PORT}`);
});
