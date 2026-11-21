// src/domain/llm/adapters/GeminiEmbeddingAdapter.ts
import { GoogleGenAI } from "@google/genai";
import type { EmbeddingProvider } from "../types.js";

// An adapter that maps Gemini embeddings to our common EmbeddingProvider interface.
export class GeminiEmbeddingAdapter implements EmbeddingProvider {
  readonly name = "gemini-embedding";
  private readonly client: GoogleGenAI;

  constructor(
    apiKey: string,
    private readonly model = "gemini-embedding-001"
  ) {
    this.client = new GoogleGenAI({ apiKey });
  }

  async embed(text: string): Promise<number[]> {
    const result = await this.client.models.embedContent({
      model: this.model,
      contents: text,
    });

    // An empty vector would silently score 0 against every document ("no documents found"),
    // so treat it as an error instead.
    const values = result.embeddings?.[0]?.values;
    if (!values?.length) {
      throw new Error(`${this.model} boş embedding döndürdü.`);
    }
    return values;
  }
}
