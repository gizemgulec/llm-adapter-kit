// src/main.ts
import "dotenv/config";
import { GeminiAdapter } from "./domain/llm/adapters/GeminiAdapter.js";

async function run() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(".env dosyasında GEMINI_API_KEY bulunamadı.");
  }

  const provider = new GeminiAdapter(apiKey);

  const result = await provider.complete({
    messages: [{ role: "user", content: "Adapter pattern'i bir cümlede açıkla." }],
  });

  console.log("Provider:", provider.name);
  console.log("Model:", result.model);
  console.log("Cevap:", result.text);
}

run();