// src/domain/llm/errors.ts

// Thrown when an external AI service (LLM or embeddings) keeps failing or can't be reached.
// The server maps it to 503 "try again later"; any other error is treated as a bug (500).
export class ProviderUnavailableError extends Error {
  constructor(
    message: string,
    readonly lastError?: unknown
  ) {
    super(message);
    this.name = "ProviderUnavailableError";
  }
}

// Thrown when a provider call takes longer than its time limit. It's a kind of "unavailable",
// so the server answers with the same "try again later" message.
export class ProviderTimeoutError extends ProviderUnavailableError {
  constructor(readonly timeoutMs: number) {
    super(`Provider ${timeoutMs} ms içinde cevap vermedi.`);
    this.name = "ProviderTimeoutError";
  }
}

export function describeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
