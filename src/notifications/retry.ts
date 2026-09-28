/** Retries an async operation with linear backoff. Resolves false (never throws) if all attempts fail. */
export async function withRetry(fn: () => Promise<void>, attempts = 3, delayMs = 1500): Promise<boolean> {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      await fn();
      return true;
    } catch {
      if (attempt === attempts) return false;
      await new Promise((resolve) => setTimeout(resolve, delayMs * attempt));
    }
  }
  return false;
}
