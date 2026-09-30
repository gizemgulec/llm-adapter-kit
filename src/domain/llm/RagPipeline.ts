// src/domain/llm/RagPipeline.ts
import type { LLMProvider } from "./types.js";
import { retrieve } from "./knowledgeBase.js";

export class RagPipeline {
  constructor(private readonly provider: LLMProvider) {}

  async ask(question: string): Promise<string> {
    // --- 1. RETRIEVAL: Find the most relevant documents (now multiple) ---
    const docs = retrieve(question);
    console.log(`[Bulunan belge sayısı]: ${docs.length}`);
    docs.forEach((d, i) => console.log(`  Belge ${i + 1}: ${d.slice(0, 50)}...`));

    // --- 2. AUGMENTED: Send the documents to the AI along with the question ---
    let prompt: string;
    if (docs.length > 0) {
      // Number multiple documents and combine them into a single text
      const context = docs.map((d, i) => `[Belge ${i + 1}] ${d}`).join("\n\n");
      prompt =
        `Aşağıdaki bilgilere dayanarak soruyu yanıtla. ` +
        `Eğer bilgiler soruyu yanıtlamaya yetmiyorsa, "Bu konuda bilgim yok" de.\n\n` +
        `BİLGİLER:\n${context}\n\n` +
        `SORU: ${question}`;
    } else {
      prompt =
        `SORU: ${question}\n\n` +
        `Bu konuda elimde belge yok. Emin değilsen tahmin etme, "Bu konuda bilgim yok" de.`;
    }

    // --- 3. GENERATION: Have the AI generate an answer based on the documents ---
    const result = await this.provider.complete({
      system: "Sen bir Sigorta destek asistanısın. Sadece verilen bilgilere dayan, uydurma.",
      messages: [{ role: "user", content: prompt }],
    });

    return result.text.trim();
  }
}