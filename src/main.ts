// src/main.ts
import "dotenv/config";
import { ModelStrategy } from "./domain/llm/ModelStrategy.js";
import { SimpleAgent } from "./domain/llm/SimpleAgent.js";

async function run() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(".env dosyasında GEMINI_API_KEY bulunamadı.");
  }

  const strategy = new ModelStrategy(apiKey);
  const provider = strategy.select("cheap");
  const agent = new SimpleAgent(provider);

  const goal = "12345 numaralı poliçemin bitiş tarihi ne zaman?";
  console.log("=== HEDEF ===");
  console.log(goal, "\n");

  const answer = await agent.run(goal);
  console.log("\n=== FİNAL CEVAP ===");
  console.log(answer);
}

run();