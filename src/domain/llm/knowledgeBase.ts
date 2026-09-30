// src/domain/llm/knowledgeBase.ts

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

// RETRIEVAL: Find the top N documents most relevant to the question, not just one.
// Score each document by the number of matches and return the highest-scoring ones.
export function retrieve(question: string, topN = 2): string[] {
  const lowerQuestion = question.toLowerCase();

  // Score each document
  const scored = knowledgeBase.map((doc) => ({
    content: doc.content,
    score: doc.keywords.filter((kw) => lowerQuestion.includes(kw)).length,
  }));

  // Keep documents with at least one match, sort by score, and return the first N
  return scored
    .filter((item) => item.score > 0)      // discard documents with no matches
    .sort((a, b) => b.score - a.score)     // highest scores first
    .slice(0, topN)                        // take the top N
    .map((item) => item.content);          // return only the text
}