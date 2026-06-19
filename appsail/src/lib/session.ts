// appsail/src/lib/session.ts
// Minimal HS256 (JWT-compatible) session tokens for the embedded merchant session.
//
// After Salla's short-lived embedded token is verified via the Introspection API, we mint one
// of these bound to the verified store_id. Every merchant API request carries it as
// `Authorization: Bearer <token>` and authEmbedded derives store_id from it — the client never
// supplies the store id, so it cannot act on another merchant's store.
import crypto from "crypto";
import { SESSION_SIGNING_SECRET, env } from "../env";

const TTL_SECONDS = env.SESSION_TTL_SECONDS;

export interface MerchantSession {
  store_id: string;
  user_id: string | null;
  iat: number;
  exp: number;
}

function b64urlJson(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj), "utf8").toString("base64url");
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

export function signSession(input: { store_id: string; user_id?: string | null; ttlSeconds?: number }): string {
  if (!SESSION_SIGNING_SECRET) throw new Error("Session signing secret not configured");
  if (!input.store_id) throw new Error("signSession: store_id required");

  const head = b64urlJson({ alg: "HS256", typ: "JWT" });
  const iat = nowSeconds();
  const body = b64urlJson({
    store_id: String(input.store_id),
    user_id: input.user_id ? String(input.user_id) : null,
    iat,
    exp: iat + (input.ttlSeconds ?? TTL_SECONDS),
  });
  const data = `${head}.${body}`;
  const sig = crypto.createHmac("sha256", SESSION_SIGNING_SECRET).update(data).digest("base64url");
  return `${data}.${sig}`;
}

export function verifySession(token: string): MerchantSession | null {
  if (!SESSION_SIGNING_SECRET || !token) return null;
  const parts = String(token).split(".");
  if (parts.length !== 3) return null;

  const [head, body, sig] = parts;
  const expected = crypto.createHmac("sha256", SESSION_SIGNING_SECRET).update(`${head}.${body}`).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  let payload: any;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (!payload?.store_id) return null;
  if (payload.exp && nowSeconds() > Number(payload.exp)) return null;
  return payload as MerchantSession;
}
