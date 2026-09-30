// src/domain/llm/ProviderFactory.ts
import type { LLMProvider } from "./types.js";
import { GeminiAdapter } from "./adapters/GeminiAdapter.js";
import { MockAdapter } from "./adapters/MockAdapter.js";

// Which providers do we support?
export type ProviderName = "gemini" | "mock";

// A factory that creates adapters.
// Information about which adapter to use and how to configure it is centralized here,
// so the upper layer (main.ts) does not need to know those details.
export class ProviderFactory {
  constructor(private apiKey: string) {}

  create(name: ProviderName): LLMProvider {
    switch (name) {
      case "gemini":
        return new GeminiAdapter(this.apiKey);
      case "mock":
        return new MockAdapter();
      default:
        // Report a clear error if an unknown name is provided
        throw new Error(`Bilinmeyen provider: ${name}`);
    }
  }
}