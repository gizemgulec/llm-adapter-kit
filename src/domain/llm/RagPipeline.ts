// src/domain/llm/RagPipeline.ts
import type { ChatTurn, CompletionInput, LLMProvider } from "./types.js";
import type { Retriever, RetrievedDocument } from "./knowledgeBase.js";

// `history` holds the earlier turns of the conversation, oldest first, without the current question.
// The pipeline is stateless: the caller (the mobile app) keeps the conversation and sends it each time.
export class RagPipeline {
  constructor(
    private readonly provider: LLMProvider,
    private readonly retriever: Retriever
  ) {}

  async ask(
    question: string,
    history: ChatTurn[] = []
  ): Promise<{ answer: string; sources: RetrievedDocument[] }> {
    const { input, sources } = await this.prepare(question, history);

    // --- 3. GENERATION: Have the AI generate an answer based on the documents ---
    const result = await this.provider.complete(input);
    return { answer: result.text.trim(), sources };
  }

  // Same flow as ask(), but the answer is streamed chunk by chunk.
  // Retrieval finishes first, so the sources are known before the first chunk.
  async askStream(
    question: string,
    history: ChatTurn[] = []
  ): Promise<{ answer: AsyncIterable<string>; sources: RetrievedDocument[] }> {
    const { input, sources } = await this.prepare(question, history);
    return { answer: this.provider.stream(input), sources };
  }

  // Follow-up questions like "Nereden yapabilirim?" don't name their topic, so on their own they
  // find no document. In that case, search again with the previous question for context.
  // This runs only when the question alone finds nothing: always adding the previous question
  // pulled the previous topic's document into unrelated questions. Rewriting the question with
  // an LLM call was more accurate, but added ~13s per follow-up in testing.
  private async findDocuments(question: string, history: ChatTurn[]): Promise<RetrievedDocument[]> {
    const docs = await this.retriever.retrieve(question);
    const previousQuestion = history.findLast((turn) => turn.role === "user")?.content;
    if (docs.length > 0 || !previousQuestion) return docs;

    console.log("[Takip sorusu]: önceki soruyla birlikte aranıyor");
    return this.retriever.retrieve(`${previousQuestion}\n${question}`);
  }

  private async prepare(
    question: string,
    history: ChatTurn[]
  ): Promise<{ input: CompletionInput; sources: RetrievedDocument[] }> {
    // --- 1. RETRIEVAL: Find the most relevant documents (now multiple) ---
    const docs = await this.findDocuments(question, history);
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
        // Earlier turns let the model understand the follow-up. Only the current question carries
        // documents; earlier answers already contain what was taken from theirs.
        messages: [...history, { role: "user", content: prompt }],
      },
      sources: docs,
    };
  }
}
