// src/domain/llm/RagPipeline.ts
import type { ChatTurn, CompletionInput, LLMProvider } from "./types.js";
import type { Retriever, RetrievedDocument } from "./knowledgeBase.js";

// How many earlier questions a follow-up is searched together with (see findDocuments).
const MAX_CONTEXT_QUESTIONS = 3;

// The documents the answer actually cites. The prompt asks the model to cite each claim as
// [kaynak-id]. Retrieval can return a document that turns out to be irrelevant (e.g. the previous
// topic's document for an unrelated follow-up); the model doesn't cite it, so it isn't shown.
// An answer that cites nothing (e.g. "Bu konuda bilgim yok") shows no sources: showing none
// is better than showing a wrong one.
export function citedSources(answer: string, sources: RetrievedDocument[]): RetrievedDocument[] {
  return sources.filter((doc) => {
    const id = doc.id.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
    // The id as a whole token, so "kasko-cam" doesn't match inside "kasko-cam-2"
    return new RegExp(String.raw`(?<![\w-])${id}(?![\w-])`).test(answer);
  });
}

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
    const answer = result.text.trim();
    return { answer, sources: citedSources(answer, sources) };
  }

  // Same flow as ask(), but the answer is streamed chunk by chunk.
  // `sources` are all the retrieved documents. The caller should show only the ones the
  // answer cites: pass them through citedSources() once the answer is complete.
  async askStream(
    question: string,
    history: ChatTurn[] = []
  ): Promise<{ answer: AsyncIterable<string>; sources: RetrievedDocument[] }> {
    const { input, sources } = await this.prepare(question, history);
    return { answer: this.provider.stream(input), sources };
  }

  // Follow-up questions like "Nereden yapabilirim?" don't name their topic, so on their own they
  // find no document. In that case, search again with an earlier question for context: the most
  // recent one that finds documents, among the last MAX_CONTEXT_QUESTIONS. Not just the last one:
  // after "Kasko cam?" → "Evcil hayvan?" (no documents), "Muafiyet var mı?" is about the cam
  // question, two turns back.
  // This runs only when the question alone finds nothing: always adding the previous question
  // pulled the previous topic's document into unrelated questions. A document pulled in by
  // mistake isn't shown, because only cited sources are (see citedSources). Rewriting the
  // question with an LLM call was more accurate, but added ~13s per follow-up in testing.
  private async findDocuments(question: string, history: ChatTurn[]): Promise<RetrievedDocument[]> {
    const docs = await this.retriever.retrieve(question);
    if (docs.length > 0) return docs;

    const earlierQuestions = history
      .filter((turn) => turn.role === "user")
      .map((turn) => turn.content)
      .slice(-MAX_CONTEXT_QUESTIONS)
      .reverse(); // newest first
    if (earlierQuestions.length === 0) return [];

    console.log("[Takip sorusu]: önceki sorularla birlikte aranıyor");
    // Searched in parallel; the newest question that finds documents wins.
    const results = await Promise.all(
      earlierQuestions.map((earlier) => this.retriever.retrieve(`${earlier}\n${question}`))
    );
    return results.find((found) => found.length > 0) ?? [];
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
