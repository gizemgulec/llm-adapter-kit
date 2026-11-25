import type { LLMProvider, CompletionInput, CompletionResult } from "./types.js";
import { withRetry } from "./retry.js";
import { withTimeout } from "./timeout.js";
import { ProviderTimeoutError, ProviderUnavailableError, describeError } from "./errors.js";

// Time limit for one provider call. For streams, it applies to the first chunk and to every gap
// between chunks, not to the whole answer, so a long answer that keeps arriving isn't cut off.
// Gemini usually answers in 2–10s, but took up to ~36s in testing and sometimes hung entirely.
export const LLM_TIMEOUT_MS = 30_000;

// Moves to the next provider if the primary provider still fails after retries.
export class FallbackProvider implements LLMProvider {
  readonly name = "fallback";
  private readonly timeoutMs: number;

  constructor(
    private readonly providers: LLMProvider[],
    options: { timeoutMs?: number } = {}
  ) {
    if (providers.length === 0) {
      throw new Error("FallbackProvider en az bir provider gerektirir.");
    }
    this.timeoutMs = options.timeoutMs ?? LLM_TIMEOUT_MS;
  }

  async complete(input: CompletionInput): Promise<CompletionResult> {
    let lastError: unknown;

    for (const provider of this.providers) {
      try {
        console.log(`[Fallback] Deneniyor: ${provider.name}`);
        return await withRetry(() =>
          withTimeout(this.timeoutMs, (signal) => provider.complete({ ...input, signal }))
        );
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
      let opened: Awaited<ReturnType<FallbackProvider["openStream"]>>;
      try {
        console.log(`[Fallback] Deneniyor (stream): ${provider.name}`);
        opened = await withRetry(() => this.openStream(provider, input));
      } catch (err) {
        lastError = err;
        console.log(`[Fallback] ${provider.name} başarısız, sıradakine geçiliyor.`);
        continue;
      }

      const { iterator, first, controller } = opened;
      let timedOut = false;
      try {
        if (first.done) return;
        yield first.value;
        for (
          let next = await this.nextChunk(iterator, controller);
          !next.done;
          next = await this.nextChunk(iterator, controller)
        ) {
          yield next.value;
        }
        return;
      } catch (err) {
        timedOut = err instanceof ProviderTimeoutError;
        throw err;
      } finally {
        // If the caller stops early (e.g. the client disconnected) or a chunk timed out, stop the
        // provider's request too, so the model stops generating tokens nobody will read.
        controller.abort();
        if (timedOut) {
          // The timed-out read may never settle if the provider ignores the signal; don't wait for it.
          void Promise.resolve(iterator.return?.()).catch(() => {});
        } else {
          await iterator.return?.();
        }
      }
    }

    throw new AllProvidersFailedError(lastError);
  }

  // Starts a stream and waits for its first chunk, so connection errors and timeouts surface here.
  private async openStream(provider: LLMProvider, input: CompletionInput) {
    const controller = new AbortController();
    const iterator = provider.stream({ ...input, signal: controller.signal })[Symbol.asyncIterator]();
    const first = await this.nextChunk(iterator, controller);
    return { iterator, first, controller };
  }

  private nextChunk(iterator: AsyncIterator<string>, controller: AbortController) {
    return withTimeout(this.timeoutMs, () => iterator.next(), controller);
  }
}

// Thrown when every provider failed, so callers can tell "LLM unavailable" apart from bugs.
export class AllProvidersFailedError extends ProviderUnavailableError {
  constructor(lastError: unknown) {
    super(`Tüm provider'lar başarısız oldu. Son hata: ${describeError(lastError)}`, lastError);
    this.name = "AllProvidersFailedError";
  }
}
