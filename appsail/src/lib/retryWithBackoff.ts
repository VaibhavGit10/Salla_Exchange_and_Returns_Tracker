// appsail/src/lib/retryWithBackoff.ts
// Exponential backoff with jitter for transient Salla failures (429 + 5xx + network).
// Other 4xx are not retried (they won't succeed on retry).
import { SallaApiError } from "./sallaApi";

export interface RetryOptions {
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  factor?: number;
}

function isRetryable(err: unknown): boolean {
  if (err instanceof SallaApiError) return err.status === 429 || err.status >= 500;
  // AbortError / network errors (no status) are retryable
  if (err instanceof Error && !("status" in err)) return true;
  return false;
}

function jitter(delayMs: number): number {
  const range = delayMs * 0.25;
  return delayMs + (Math.random() * range * 2 - range);
}

function parseRetryAfter(text?: string): number {
  if (!text) return 0;
  try {
    const json = JSON.parse(text);
    const n = Number(json?.retry_after ?? json?.retryAfter);
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

export async function retryWithBackoff<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const maxRetries = opts.maxRetries ?? 3;
  const initialDelay = opts.initialDelayMs ?? 1000;
  const maxDelay = opts.maxDelayMs ?? 60000;
  const factor = opts.factor ?? 2;

  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt >= maxRetries || !isRetryable(err)) throw err;

      let delayMs = Math.min(initialDelay * Math.pow(factor, attempt), maxDelay);
      delayMs = jitter(delayMs);
      if (err instanceof SallaApiError && err.status === 429) {
        const ra = parseRetryAfter(err.responseText);
        if (ra > 0) delayMs = Math.max(delayMs, ra * 1000);
      }
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw lastError;
}
