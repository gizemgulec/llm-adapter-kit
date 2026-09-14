// src/main.ts
import "dotenv/config";
import { ModelStrategy, type TaskType } from "./domain/llm/ModelStrategy.js";

async function run() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(".env dosyasında GEMINI_API_KEY bulunamadı.");
  }

  const strategy = new ModelStrategy(apiKey);

  // İşin tipini söylüyoruz; hangi model olduğuna strateji karar veriyor.
  const task: TaskType = "reasoning"; // "cheap" veya "reasoning" olabilir
  const provider = strategy.select(task);

  const result = await provider.complete({
    messages: [{ role: "user", content: "Strategy pattern'i bir cümlede açıkla." }],
  });

  console.log("Task tipi:", task);
  console.log("Provider:", provider.name);
  console.log("Model:", result.model);
  console.log("Cevap:", result.text);
}

run();