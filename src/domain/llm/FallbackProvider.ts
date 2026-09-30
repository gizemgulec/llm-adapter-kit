import type { LLMProvider, CompletionInput, CompletionResult } from "./types.js";
import { withRetry } from "./retry.js";

// Moves to the next provider if the primary provider still fails after retries.
export class FallbackProvider implements LLMProvider {
  readonly name = "fallback";

  constructor(private readonly providers: LLMProvider[]) {
    if (providers.length === 0) {
      throw new Error("FallbackProvider en az bir provider gerektirir.");
    }
  }

  async complete(input: CompletionInput): Promise<CompletionResult> {
    let lastError: unknown;

    for (const provider of this.providers) {
      try {
        console.log(`[Fallback] Deneniyor: ${provider.name}`);
        return await withRetry(() => provider.complete(input));
      } catch (err) {
        lastError = err;
        console.log(`[Fallback] ${provider.name} başarısız, sıradakine geçiliyor.`);
      }
    }

    const errorMessage = lastError instanceof Error ? lastError.message : String(lastError);
    throw new Error(`Tüm provider'lar başarısız oldu. Son hata: ${errorMessage}`);
  }
}