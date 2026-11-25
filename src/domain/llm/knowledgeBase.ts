// src/domain/llm/knowledgeBase.ts
import type { EmbeddingProvider } from "./types.js";
import { cosineSimilarity } from "./embeddings.js";
import { ProviderUnavailableError, describeError } from "./errors.js";
import { withRetry } from "./retry.js";
import { withTimeout } from "./timeout.js";

// Time limit for one embedding call. Embeddings are much faster than generating an answer.
export const EMBEDDING_TIMEOUT_MS = 10_000;

// A mock knowledge base. In a real application, this would contain the insurer's policy text,
// documents, and so on. For now, we are starting with a few short "documents."
export const knowledgeBase = [
  {
    id: "kasko-cam",
    keywords: ["cam", "kırılma", "kasko"],
    content:
      "Kasko poliçesinde cam kırılması teminatı standart olarak dahildir. " +
      "Ön cam, yan camlar ve arka cam, muafiyet uygulanmadan karşılanır.",
  },
  {
    id: "kasko-hasar-sure",
    keywords: ["hasar", "başvuru", "süre", "kaç gün"],
    content:
      "Hasar başvurusu, olayın gerçekleşmesinden itibaren 5 iş günü içinde yapılmalıdır. " +
      "Başvurular mobil uygulama veya çağrı merkezi üzerinden alınır.",
  },
  {
    id: "trafik-zorunlu",
    keywords: ["trafik", "zorunlu", "yasal"],
    content:
      "Trafik sigortası yasal olarak zorunludur ve üçüncü şahıslara verilen zararları karşılar. " +
      "Aracın kendi hasarını kapsamaz; onun için kasko gerekir.",
  },
];

export interface RetrievedDocument {
  id: string;
  content: string;
  score: number;
}

// Minimum cosine similarity for a document to count as relevant.
// Measured with gemini-embedding-001 on 15 sample questions: every question's main document
// scored >= 0.766, while unrelated documents scored 0.52–0.73 (with gemini-embedding-001,
// even off-topic text scores above 0.5). Re-measure when the documents or the embedding model change.
export const MIN_RELEVANCE_SCORE = 0.75;

type DocVector = { id: string; content: string; vector: number[] };

// VEKTÖR ARAMA: Soruyu embedding'e çevir, en anlamca yakın belgeleri bul.
// Artık kelime eşleşmesine değil, ANLAM yakınlığına bakıyor.
export class Retriever {
  // Document vectors are computed once and cached. Caching the promise (not the result)
  // means concurrent first requests share one computation instead of each embedding every document.
  private docVectors: Promise<DocVector[]> | null = null;

  private readonly timeoutMs: number;

  constructor(
    private readonly embedder: EmbeddingProvider,
    options: { timeoutMs?: number } = {}
  ) {
    this.timeoutMs = options.timeoutMs ?? EMBEDDING_TIMEOUT_MS;
  }

  async retrieve(
    question: string,
    topN = 2,
    minScore = MIN_RELEVANCE_SCORE
  ): Promise<RetrievedDocument[]> {
    const [docVectors, questionVector] = await Promise.all([
      this.getDocVectors(),
      this.embed(question),
    ]);

    // Her belge için benzerlik skorunu hesapla
    const scored = docVectors.map((doc) => ({
      id: doc.id,
      content: doc.content,
      score: cosineSimilarity(questionVector, doc.vector),
    }));

    // Skora göre sırala, eşiğin üstündekilerden en iyi N tanesini al
    return scored
      .sort((a, b) => b.score - a.score)
      .filter((item) => item.score >= minScore)
      .slice(0, topN);
  }

  private getDocVectors(): Promise<DocVector[]> {
    this.docVectors ??= Promise.all(
      knowledgeBase.map(async (doc) => ({
        id: doc.id,
        content: doc.content,
        vector: await this.embed(doc.content),
      }))
    ).catch((err: unknown) => {
      this.docVectors = null; // don't cache a failure; the next request tries again
      throw err;
    });
    return this.docVectors;
  }

  // Retries transient errors, but never falls back to another embedding model:
  // its vectors wouldn't be comparable with the cached document vectors.
  private async embed(text: string): Promise<number[]> {
    try {
      return await withRetry(() =>
        withTimeout(this.timeoutMs, (signal) => this.embedder.embed(text, signal))
      );
    } catch (err) {
      throw new ProviderUnavailableError(
        `Embedding servisi (${this.embedder.name}) başarısız oldu: ${describeError(err)}`,
        err
      );
    }
  }
}