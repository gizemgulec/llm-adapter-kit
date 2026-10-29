// src/domain/llm/knowledgeBase.ts
import { embed, cosineSimilarity } from "./embeddings.js";

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

// Belgelerin embedding'lerini önbellekte tutarız (her seferinde yeniden hesaplamamak için)
let cachedDocEmbeddings: { content: string; vector: number[] }[] | null = null;

// Belgeleri bir kez embedding'e çevirip sakla
async function getDocEmbeddings(apiKey: string) {
  if (cachedDocEmbeddings) return cachedDocEmbeddings;

  cachedDocEmbeddings = await Promise.all(
    knowledgeBase.map(async (doc) => ({
      content: doc.content,
      vector: await embed(doc.content, apiKey),
    }))
  );
  return cachedDocEmbeddings;
}

// VEKTÖR ARAMA: Soruyu embedding'e çevir, en anlamca yakın belgeleri bul.
// Artık kelime eşleşmesine değil, ANLAM yakınlığına bakıyor.
export async function retrieve(
  question: string,
  apiKey: string,
  topN = 2,
  minScore = 0.5
): Promise<string[]> {
  const docEmbeddings = await getDocEmbeddings(apiKey);

  // Soruyu embedding'e çevir
  const questionVector = await embed(question, apiKey);

  // Her belge için benzerlik skorunu hesapla
  const scored = docEmbeddings.map((doc) => ({
    content: doc.content,
    score: cosineSimilarity(questionVector, doc.vector),
  }));

  // Skora göre sırala, eşiğin üstündekilerden en iyi N tanesini al
  return scored
    .sort((a, b) => b.score - a.score)
    .filter((item) => item.score >= minScore)
    .slice(0, topN)
    .map((item) => item.content);
}