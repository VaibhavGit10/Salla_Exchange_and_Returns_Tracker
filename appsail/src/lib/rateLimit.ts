// appsail/src/lib/rateLimit.ts
// In-memory L1 burst limiter (per instance). Authoritative limit lives in DataStore (L2).
type Entry = { count: number; resetAt: number };

const bucket = new Map<string, Entry>();
const MAX_BUCKET_SIZE = 10000;
let lastCleanup = Date.now();

function maybeCleanup() {
  const now = Date.now();
  if (now - lastCleanup < 60000 || bucket.size < MAX_BUCKET_SIZE / 2) return;
  lastCleanup = now;
  for (const [k, v] of bucket) if (v.resetAt <= now) bucket.delete(k);
}

export function checkRateLimit(key: string, windowMs: number, max: number): { allowed: boolean; retryAfterSec?: number } {
  maybeCleanup();
  const now = Date.now();
  const e = bucket.get(key);
  if (!e || e.resetAt <= now) {
    bucket.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true };
  }
  if (e.count >= max) return { allowed: false, retryAfterSec: Math.ceil((e.resetAt - now) / 1000) };
  e.count += 1;
  return { allowed: true };
}
