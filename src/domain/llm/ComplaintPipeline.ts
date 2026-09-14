// src/domain/llm/ComplaintPipeline.ts
import type { LLMProvider } from "./types.js";

// Bir müşteri şikayetini işleyen çok adımlı zincir (chain).
// Her adım bir önceki adımın çıktısını kullanır.
export class ComplaintPipeline {
  // Dikkat: pipeline hangi provider olduğunu bilmiyor, sadece LLMProvider alıyor.
  // Yani adapter/factory/strategy'nin ürettiği HERHANGİ bir provider'la çalışır.
  constructor(private provider: LLMProvider) {}

  async run(complaint: string): Promise<{ summary: string; urgency: string }> {
    // --- ADIM 1: Özetle ---
    const summaryResult = await this.provider.complete({
      system: "Sen bir sigorta destek asistanısın. Verilen şikayeti en fazla 2 cümlede özetle.",
      messages: [{ role: "user", content: complaint }],
    });
    const summary = summaryResult.text.trim();

    // --- ADIM 2: Aciliyet belirle (Adım 1'in çıktısını kullanıyor) ---
    const urgencyResult = await this.provider.complete({
      system:
        "Sana bir şikayet özeti verilecek. Aciliyetini SADECE tek kelimeyle söyle: DÜŞÜK, ORTA veya YÜKSEK.",
      messages: [{ role: "user", content: summary }],
    });
    const urgency = urgencyResult.text.trim();

    return { summary, urgency };
  }
}