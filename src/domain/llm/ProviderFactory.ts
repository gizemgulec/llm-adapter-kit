// src/domain/llm/ProviderFactory.ts
import type { LLMProvider } from "./types.js";
import { GeminiAdapter } from "./adapters/GeminiAdapter.js";
import { MockAdapter } from "./adapters/MockAdapter.js";

// Hangi provider'ları destekliyoruz?
export type ProviderName = "gemini" | "mock";

// Adapter üreten fabrika.
// "Hangi adapter, nasıl kurulur" bilgisi artık burada toplanıyor;
// üst katman (main.ts) bunu bilmek zorunda kalmıyor.
export class ProviderFactory {
  constructor(private apiKey: string) {}

  create(name: ProviderName): LLMProvider {
    switch (name) {
      case "gemini":
        return new GeminiAdapter(this.apiKey);
      case "mock":
        return new MockAdapter();
      default:
        // Bilinmeyen bir isim gelirse net hata ver
        throw new Error(`Bilinmeyen provider: ${name}`);
    }
  }
}