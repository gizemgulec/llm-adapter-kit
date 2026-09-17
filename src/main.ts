// src/main.ts
import "dotenv/config";
import { ModelStrategy } from "./domain/llm/ModelStrategy.js";
import { MultiTurnAgent } from "./domain/llm/MultiTurnAgent.js";

async function run() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error(".env dosyasında GEMINI_API_KEY bulunamadı.");

  const strategy = new ModelStrategy(apiKey);
  const provider = strategy.select("cheap");
  const agent = new MultiTurnAgent(provider);

  // Bu hedef İKİ araç gerektiriyor: hem poliçe bilgisi hem iletişim
  const goal =
    "12345 numaralı poliçenin hem bitiş tarihini hem de sahibinin iletişim bilgisini öğren.";
  console.log("=== HEDEF ===");
  console.log(goal);

  const answer = await agent.run(goal);
  console.log("\n=== FİNAL CEVAP ===");
  console.log(answer);
}

run();