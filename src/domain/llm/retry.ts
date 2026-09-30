// Retries an operation a few times, waiting longer after each attempt (exponential backoff).
// Useful for transient errors such as 503 responses.
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
      console.log(`[Retry] Deneme ${attempt}/${maxAttempts} başarısız.`);

      if (attempt < maxAttempts) {
        const delay = baseDelayMs * attempt;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}