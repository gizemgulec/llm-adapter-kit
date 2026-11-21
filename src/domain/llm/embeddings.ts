// src/domain/llm/embeddings.ts
// Embedding vectors come from an EmbeddingProvider (see adapters/GeminiEmbeddingAdapter.ts).

// İki vektörün ne kadar benzediğini ölçer (cosine similarity).
// 1'e yakın = çok benzer, 0'a yakın = alakasız.
export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;      // iki vektörün çarpımlarının toplamı
  let normA = 0;    // a'nın uzunluğu
  let normB = 0;    // b'nin uzunluğu

  for (let i = 0; i < a.length; i++) {
    const valueA = a[i]!;
    const valueB = b[i]!;
    dot += valueA * valueB;
    normA += valueA * valueA;
    normB += valueB * valueB;
  }

  // Sıfıra bölme koruması
  if (normA === 0 || normB === 0) return 0;

  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
