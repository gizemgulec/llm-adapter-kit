// src/domain/llm/timeout.ts
import { ProviderTimeoutError } from "./errors.js";

// Runs `fn` with a time limit. When the limit passes, it aborts `fn`'s signal (so a provider
// that supports it cancels the HTTP request) and rejects with ProviderTimeoutError, even if
// `fn` ignores the signal. Pass `controller` to abort the same request again later.
export async function withTimeout<T>(
  ms: number,
  fn: (signal: AbortSignal) => Promise<T>,
  controller = new AbortController()
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const error = new ProviderTimeoutError(ms);
      controller.abort(error);
      reject(error);
    }, ms);
  });

  try {
    return await Promise.race([fn(controller.signal), timeout]);
  } finally {
    clearTimeout(timer);
  }
}
