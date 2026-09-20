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

// RETRIEVAL: Soruya en uygun belgeyi bul.
// Basit yöntem: sorudaki kelimelerle belge anahtar kelimelerini eşleştir.
// (Gerçek RAG'de bu kısım "vektör arama" ile daha akıllı yapılır.)
export function retrieve(question: string): string | null {
  const lowerQuestion = question.toLowerCase();

  // Her belge için kaç anahtar kelime eşleşiyor say
  let bestMatch = { doc: null as (typeof knowledgeBase)[0] | null, score: 0 };

  for (const doc of knowledgeBase) {
    const score = doc.keywords.filter((kw) => lowerQuestion.includes(kw)).length;
    if (score > bestMatch.score) {
      bestMatch = { doc, score };
    }
  }

  // Hiç eşleşme yoksa null dön
  return bestMatch.doc ? bestMatch.doc.content : null;
}