// src/domain/llm/RagPipeline.ts
import type { CompletionInput, LLMProvider } from "./types.js";
import { retrieve, type RetrievedDocument } from "./knowledgeBase.js";

export class RagPipeline {
  constructor(
    private readonly provider: LLMProvider,
    private readonly apiKey: string
  ) {}

  async ask(question: string): Promise<{ answer: string; sources: RetrievedDocument[] }> {
    const { input, sources } = await this.prepare(question);

    // --- 3. GENERATION: Have the AI generate an answer based on the documents ---
    const result = await this.provider.complete(input);
    return { answer: result.text.trim(), sources };
  }

  // Same flow as ask(), but the answer is streamed chunk by chunk.
  // Retrieval finishes first, so the sources are known before the first chunk.
  async askStream(
    question: string
  ): Promise<{ answer: AsyncIterable<string>; sources: RetrievedDocument[] }> {
    const { input, sources } = await this.prepare(question);
    return { answer: this.provider.stream(input), sources };
  }

  private async prepare(
    question: string
  ): Promise<{ input: CompletionInput; sources: RetrievedDocument[] }> {
    // --- 1. RETRIEVAL: Find the most relevant documents (now multiple) ---
    const docs = await retrieve(question, this.apiKey);
    console.log(`[Bulunan belge sayısı]: ${docs.length}`);
    docs.forEach((doc) => console.log(`  Kaynak: ${doc.id}`));

    // --- 2. AUGMENTED: Send the documents to the AI along with the question ---
    let prompt: string;
    if (docs.length > 0) {
      // Number multiple documents and combine them into a single text
      const context = docs.map((doc) => `[Kaynak: ${doc.id}] ${doc.content}`).join("\n\n");
      prompt =
        `Aşağıdaki bilgilere dayanarak soruyu yanıtla. ` +
        `İddialarını ilgili kaynak kimliğiyle [kaynak-id] biçiminde belirt. ` +
        `Eğer bilgiler soruyu yanıtlamaya yetmiyorsa, "Bu konuda bilgim yok" de.\n\n` +
        `BİLGİLER:\n${context}\n\n` +
        `SORU: ${question}`;
    } else {
      prompt =
        `SORU: ${question}\n\n` +
        `Bu konuda elimde belge yok. Emin değilsen tahmin etme, "Bu konuda bilgim yok" de.`;
    }

    return {
      input: {
        system: "Sen bir Sigorta destek asistanısın. Sadece verilen bilgilere dayan, uydurma.",
        messages: [{ role: "user", content: prompt }],
      },
      sources: docs,
    };
  }
}
