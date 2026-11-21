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

export function describeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
