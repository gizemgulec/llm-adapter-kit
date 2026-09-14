// src/domain/llm/RequestRouter.ts
import type { LLMProvider } from "./types.js";
import { ComplaintPipeline } from "./ComplaintPipeline.js";

// Gelen isteğin tipi
export type RequestType = "complaint" | "question";

// Router: gelen mesaja bakıp tipini belirler, doğru akışa yönlendirir.
// Trafik polisi gibi: isteği doğru şeride sokar.
export class RequestRouter {
  constructor(private provider: LLMProvider) {}

  // --- ADIM 1: Sınıflandır (bu bir şikayet mi, soru mu?) ---
  private async classify(message: string): Promise<RequestType> {
    const result = await this.provider.complete({
      system:
        "Sana bir müşteri mesajı verilecek. Bu bir şikayet mi yoksa bilgi sorusu mu? " +
        "SADECE tek kelimeyle cevap ver: SIKAYET veya SORU.",
      messages: [{ role: "user", content: message }],
    });

    const answer = result.text.trim().toUpperCase();
    // Cevaba göre tip belirle
    return answer.includes("SIKAYET") ? "complaint" : "question";
  }

  // --- ADIM 2: Tipe göre yönlendir ---
  async route(message: string): Promise<{ type: RequestType; output: string }> {
    const type = await this.classify(message);

    if (type === "complaint") {
      // Şikayet -> daha önce yazdığımız pipeline'a yönlendir
      const pipeline = new ComplaintPipeline(this.provider);
      const result = await pipeline.run(message);
      return {
        type,
        output: `Özet: ${result.summary}\nAciliyet: ${result.urgency}`,
      };
    } else {
      // Soru -> basit, tek adımlı hızlı cevap
      const result = await this.provider.complete({
        system: "Sen bir sigorta destek asistanısın. Soruyu kısa ve net yanıtla.",
        messages: [{ role: "user", content: message }],
      });
      return { type, output: result.text.trim() };
    }
  }
}