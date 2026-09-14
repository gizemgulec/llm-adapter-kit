// src/main.ts
import "dotenv/config";
import { ModelStrategy } from "./domain/llm/ModelStrategy.js";
import { ComplaintPipeline } from "./domain/llm/ComplaintPipeline.js";

async function run() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(".env dosyasında GEMINI_API_KEY bulunamadı.");
  }

  // Strategy'den bir provider alıyoruz (tüm katmanlar birlikte çalışıyor)
  const strategy = new ModelStrategy(apiKey);
  const provider = strategy.select("cheap");

  // Pipeline'a provider'ı veriyoruz
  const pipeline = new ComplaintPipeline(provider);

  const complaint =
    "Geçen ay kasko poliçemi yeniledim ama hasar başvurumda 3 haftadır dönüş alamıyorum. " +
    "Aracım serviste bekliyor, kimse ilgilenmiyor. Bu kadar gecikme kabul edilemez, çok mağdurum.";

  const result = await pipeline.run(complaint);

  console.log("--- ŞİKAYET İŞLENDİ ---");
  console.log("Özet:", result.summary);
  console.log("Aciliyet:", result.urgency);
}

run();