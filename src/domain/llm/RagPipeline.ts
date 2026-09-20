// src/domain/llm/RagPipeline.ts
import type { LLMProvider } from "./types.js";
import { retrieve } from "./knowledgeBase.js";

export class RagPipeline {
  constructor(private readonly provider: LLMProvider) {}

  async ask(question: string): Promise<string> {
    // --- 1. RETRIEVAL: İlgili belgeyi bul ---
    const context = retrieve(question);
    console.log("[Bulunan belge]:", context ?? "(eşleşen belge yok)");

    // --- 2. AUGMENTED: Belgeyi soruyla birlikte AI'a ver ---
    let prompt: string;
    if (context) {
      prompt =
        `Aşağıdaki bilgiye dayanarak soruyu yanıtla. ` +
        `Eğer bilgi soruyu yanıtlamaya yetmiyorsa, "Bu konuda bilgim yok" de.\n\n` +
        `BİLGİ:\n${context}\n\n` +
        `SORU: ${question}`;
    } else {
      // Belge bulunamadıysa, AI'ı uydurmaması için uyar
      prompt =
        `SORU: ${question}\n\n` +
        `Bu konuda elimde belge yok. Emin değilsen tahmin etme, "Bu konuda bilgim yok" de.`;
    }

    // --- 3. GENERATION: AI belgeye bakarak cevap üretsin ---
    const result = await this.provider.complete({
      system: "Sen bir Aksigorta destek asistanısın. Sadece verilen bilgiye dayan, uydurma.",
      messages: [{ role: "user", content: prompt }],
    });

    return result.text.trim();
  }
}