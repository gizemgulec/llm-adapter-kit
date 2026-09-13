// src/main.ts
import "dotenv/config";
import { ProviderFactory, type ProviderName } from "./domain/llm/ProviderFactory.js";

async function run() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(".env dosyasında GEMINI_API_KEY bulunamadı.");
  }

  // Hangi provider? Tek bir yerden, isimle seçiyoruz.
  const selected: ProviderName = "gemini";

  const factory = new ProviderFactory(apiKey);
  const provider = factory.create(selected);

  const result = await provider.complete({
    messages: [{ role: "user", content: "Factory pattern'i bir cümlede açıkla." }],
  });

  console.log("Provider:", provider.name);
  console.log("Model:", result.model);
  console.log("Cevap:", result.text);
}

run();