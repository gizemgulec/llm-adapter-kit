// Retries an operation a few times, doubling the wait after each attempt (exponential backoff).
// Only transient errors are retried; permanent ones (e.g. 400 invalid API key) fail immediately.
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
  baseDelayMs = 500
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (!isRetryable(err)) {
        console.log("[Retry] Kalıcı hata, yeniden denenmiyor.");
        throw err;
      }
      console.log(`[Retry] Deneme ${attempt}/${maxAttempts} başarısız.`);

      if (attempt < maxAttempts) {
        const delay = baseDelayMs * 2 ** (attempt - 1); // 500ms, 1000ms, ...
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}

// Transient: rate limits (429), timeouts (408), server errors (5xx), and network errors
// that carry no HTTP status. Any other HTTP status is a problem retrying won't fix.
function isRetryable(err: unknown): boolean {
  const status = (err as { status?: unknown } | null)?.status;
  if (typeof status !== "number") return true;
  return status === 408 || status === 429 || status >= 500;
}
