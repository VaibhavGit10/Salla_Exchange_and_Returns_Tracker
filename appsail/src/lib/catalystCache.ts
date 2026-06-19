// appsail/src/lib/catalystCache.ts
// Thin wrapper over a Catalyst Cache segment. Used to avoid repeat DataStore/Salla lookups
// (tenant resolution, etc.). Values are strings → JSON (de)serialised here. Never fatal.
import { getCatalystApp } from "./catalyst";
import { env } from "../env";

const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes

function segmentId(override?: string | number): string | number | null {
  const id = override ?? env.TENANT_CACHE_SEGMENT_ID;
  return id ? id : null;
}

export async function cacheGet<T = any>(req: any, key: string, override?: string | number): Promise<T | null> {
  const seg = segmentId(override);
  if (!seg) return null;
  try {
    const value = await getCatalystApp(req).cache().segment(seg).getValue(key);
    return value ? (JSON.parse(value) as T) : null;
  } catch {
    return null;
  }
}

export async function cachePut(req: any, key: string, value: any, ttlMs = DEFAULT_TTL_MS, override?: string | number): Promise<void> {
  const seg = segmentId(override);
  if (!seg) return;
  try {
    await getCatalystApp(req).cache().segment(seg).put(key, JSON.stringify(value), ttlMs);
  } catch {
    /* non-fatal */
  }
}

export async function cacheDelete(req: any, key: string, override?: string | number): Promise<void> {
  const seg = segmentId(override);
  if (!seg) return;
  try {
    await getCatalystApp(req).cache().segment(seg).delete(key);
  } catch {
    /* non-fatal */
  }
}
