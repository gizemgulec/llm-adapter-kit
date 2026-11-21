// src/main.ts
import "dotenv/config";
import { ModelStrategy } from "./domain/llm/ModelStrategy.js";
import { RagPipeline } from "./domain/llm/RagPipeline.js";
import { Retriever } from "./domain/llm/knowledgeBase.js";
import { GeminiEmbeddingAdapter } from "./domain/llm/adapters/GeminiEmbeddingAdapter.js";

async function run() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error(".env dosyasında GEMINI_API_KEY bulunamadı.");

  const strategy = new ModelStrategy(apiKey);
  const provider = strategy.select("cheap");
  const rag = new RagPipeline(provider, new Retriever(new GeminiEmbeddingAdapter(apiKey)));

  const questions = [
    "Kasko poliçesinde cam kırılması karşılanıyor mu?",              // 1 document
    "Kasko hasar başvurusunu kaç gün içinde ve nasıl yapmalıyım?",   // 1 document (claim deadline)
    "Evcil hayvan sigortası yapıyor musunuz?",                       // 0 documents
  ];

  for (const q of questions) {
    console.log("\n=== SORU ===");
    console.log(q);
    const result = await rag.ask(q);
    console.log("[Cevap]:", result.answer);
    console.log("[Kaynaklar]:", result.sources.map((source) => source.id));
  }
}

run();