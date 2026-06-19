// appsail/src/lib/sallaApi.ts
// Thin fetch wrapper for the Salla Merchant API v2. One place for base URL, auth header,
// JSON (de)serialisation and typed errors. Callers wrap in retryWithBackoff for 429/5xx.
import { env } from "../env";

export type SallaFetchOptions = {
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
  signal?: AbortSignal;
  timeoutMs?: number;
};

export class SallaApiError extends Error {
  public status: number;
  public responseText?: string;
  constructor(message: string, status: number, responseText?: string) {
    super(message);
    this.name = "SallaApiError";
    this.status = status;
    this.responseText = responseText;
  }
}

function joinUrl(base: string, path: string): string {
  const b = base.replace(/\/+$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${b}${p}`;
}

export async function sallaFetchJson<T>(
  accessToken: string,
  path: string,
  opts: SallaFetchOptions = {}
): Promise<T> {
  const url = joinUrl(env.SALLA_API_BASE_URL, path);

  const controller = new AbortController();
  const timeoutMs = opts.timeoutMs ?? 15000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    Accept: "application/json",
    ...(opts.headers ?? {}),
  };

  let body: string | undefined;
  if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.body);
  }

  try {
    const res = await fetch(url, {
      method: opts.method ?? "GET",
      headers,
      body,
      signal: opts.signal ?? controller.signal,
    });
    const text = await res.text().catch(() => "");
    if (!res.ok) {
      throw new SallaApiError(`Salla API ${res.status} for ${opts.method ?? "GET"} ${path}`, res.status, text);
    }
    try {
      return (text ? JSON.parse(text) : {}) as T;
    } catch {
      throw new SallaApiError(`Invalid JSON from Salla for ${path}`, res.status, text);
    }
  } finally {
    clearTimeout(timer);
  }
}
