// src/main.ts
import "dotenv/config";
import { ModelStrategy } from "./domain/llm/ModelStrategy.js";
import { RequestRouter } from "./domain/llm/RequestRouter.js";

async function run() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(".env dosyasında GEMINI_API_KEY bulunamadı.");
  }

  const strategy = new ModelStrategy(apiKey);
  const provider = strategy.select("cheap");
  const router = new RequestRouter(provider);

  // İki farklı mesaj: biri şikayet, biri soru
  const messages = [
    "Hasar başvurumda 3 haftadır dönüş alamıyorum, aracım serviste bekliyor, çok mağdurum!",
    "Kasko poliçemi online olarak nasıl yenileyebilirim?",
  ];

  for (const message of messages) {
    console.log("\n=== GELEN MESAJ ===");
    console.log(message);
    const result = await router.route(message);
    console.log(`\n[Yönlendirildi: ${result.type}]`);
    console.log(result.output);
  }
}

run();