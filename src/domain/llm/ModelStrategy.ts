// src/domain/llm/ModelStrategy.ts
import type { LLMProvider } from "./types.js";
import { GeminiAdapter } from "./adapters/GeminiAdapter.js";

// İşin tipi: ne kadar "ağır" bir iş?
export type TaskType = "cheap" | "reasoning";

// Strategy: task tipine göre HANGİ modelin kullanılacağına karar verir.
// "Basit iş -> ucuz model, zor iş -> güçlü model" kuralı tek yerde.
export class ModelStrategy {
  constructor(private apiKey: string) {}

  select(task: TaskType): LLMProvider {
    switch (task) {
      case "cheap":
        // Basit işler: hızlı ve ucuz model
        return new GeminiAdapter(this.apiKey, "gemini-3.6-flash");
      case "reasoning":
        // Zor işler: daha güçlü model
        return new GeminiAdapter(this.apiKey, "gemini-3.7-flash");
      default:
        throw new Error(`Bilinmeyen task tipi: ${task}`);
    }
  }
}