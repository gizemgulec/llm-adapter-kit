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

    throw new AllProvidersFailedError(lastError);
  }

  // Retry and fallback apply only until the first chunk arrives. After that, switching
  // providers would repeat or mix text, so a mid-stream error is passed to the caller.
  async *stream(input: CompletionInput): AsyncIterable<string> {
    let lastError: unknown;

    for (const provider of this.providers) {
      let opened: Awaited<ReturnType<typeof openStream>>;
      try {
        console.log(`[Fallback] Deneniyor (stream): ${provider.name}`);
        opened = await withRetry(() => openStream(provider, input));
      } catch (err) {
        lastError = err;
        console.log(`[Fallback] ${provider.name} başarısız, sıradakine geçiliyor.`);
        continue;
      }

      const { iterator, first } = opened;
      try {
        if (first.done) return;
        yield first.value;
        for (let next = await iterator.next(); !next.done; next = await iterator.next()) {
          yield next.value;
        }
        return;
      } finally {
        // If the caller stops early (e.g. the client disconnected), close the provider's
        // stream too, so the model stops generating tokens nobody will read.
        await iterator.return?.();
      }
    }

    throw new AllProvidersFailedError(lastError);
  }
}

// Thrown when every provider failed, so callers can tell "LLM unavailable" apart from bugs.
export class AllProvidersFailedError extends Error {
  constructor(readonly lastError: unknown) {
    const errorMessage = lastError instanceof Error ? lastError.message : String(lastError);
    super(`Tüm provider'lar başarısız oldu. Son hata: ${errorMessage}`);
    this.name = "AllProvidersFailedError";
  }
}

// Starts a stream and waits for its first chunk, so connection errors surface here.
async function openStream(provider: LLMProvider, input: CompletionInput) {
  const iterator = provider.stream(input)[Symbol.asyncIterator]();
  const first = await iterator.next();
  return { iterator, first };
}