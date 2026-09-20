// src/domain/llm/knowledgeBase.ts

// Sahte bir bilgi deposu — gerçekte bunlar Aksigorta'nın poliçe metinleri,
// dokümanları vs. olurdu. Şimdilik birkaç kısa "belge" ile başlıyoruz.
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

// RETRIEVAL: Soruya en uygun EN İYİ N belgeyi bul (tek değil, birden çok).
// Her belgeyi eşleşme sayısına göre puanla, en yüksek puanlıları döndür.
export function retrieve(question: string, topN = 2): string[] {
  const lowerQuestion = question.toLowerCase();

  // Her belgeyi puanla
  const scored = knowledgeBase.map((doc) => ({
    content: doc.content,
    score: doc.keywords.filter((kw) => lowerQuestion.includes(kw)).length,
  }));

  // Sadece en az 1 eşleşme olanları al, puana göre sırala, ilk N'i döndür
  return scored
    .filter((item) => item.score > 0)      // hiç eşleşmeyeni ele
    .sort((a, b) => b.score - a.score)     // yüksek puan önce
    .slice(0, topN)                        // en iyi N tanesi
    .map((item) => item.content);          // sadece metinleri dön
}