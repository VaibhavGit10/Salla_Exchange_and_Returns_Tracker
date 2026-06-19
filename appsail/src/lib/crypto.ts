// appsail/src/lib/crypto.ts
// Application-layer cryptography:
//  - HMAC-SHA256 (peppered) for non-reversible contact/OTP hashing
//  - AES-256-GCM authenticated encryption for tokens / PII at rest
import crypto from "crypto";
import { env } from "../env";

function hmac(data: string): Buffer {
  return crypto.createHmac("sha256", env.SECURITY_PEPPER).update(data).digest();
}

function timingSafeEqualHex(aHex: string, bHex: string): boolean {
  try {
    const a = Buffer.from(aHex, "hex");
    const b = Buffer.from(bHex, "hex");
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/** Deterministic, peppered hash of a customer contact, scoped per tenant + channel. */
export function hashContact(tenantId: string, channel: string, normalizedContact: string): string {
  return hmac(`${tenantId}:${channel}:${normalizedContact.toLowerCase()}`).toString("hex");
}

export function hashToken(rawToken: string): string {
  return hmac(`portal_token:${rawToken}`).toString("hex");
}

export function hashOtp(tenantId: string, orderNumber: string, contactHash: string, otp: string): string {
  const salt = crypto.randomBytes(16).toString("base64url");
  const digestHex = hmac(`otp:v1:${tenantId}:${orderNumber}:${contactHash}:${salt}:${otp}`).toString("hex");
  return `v1$${salt}$${digestHex}`;
}

export function verifyOtpHash(
  tenantId: string,
  orderNumber: string,
  contactHash: string,
  otp: string,
  expectedHash: string
): boolean {
  const parts = String(expectedHash).split("$");
  if (parts.length !== 3) return false;
  const [version, salt, digestHex] = parts;
  if (version !== "v1" || !salt || !digestHex) return false;
  const expected = hmac(`otp:v1:${tenantId}:${orderNumber}:${contactHash}:${salt}:${otp}`).toString("hex");
  return timingSafeEqualHex(expected, digestHex);
}

export function generateOtp6(): string {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
}

export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString("base64url");
}

function getEncKey(): Buffer {
  const key = Buffer.from(env.ENCRYPTION_KEY_B64, "base64");
  if (key.length !== 32) throw new Error("ENCRYPTION_KEY_B64 must decode to 32 bytes");
  return key;
}

/** AES-256-GCM encrypt → "v1:iv:tag:ciphertext" (all base64url). */
export function encryptText(plain: string): string {
  const key = getEncKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64url")}:${tag.toString("base64url")}:${enc.toString("base64url")}`;
}

export function decryptText(payload: string): string {
  const [v, ivB64, tagB64, dataB64] = String(payload).split(":");
  if (v !== "v1" || !ivB64 || !tagB64 || !dataB64) throw new Error("Invalid encrypted payload");
  const key = getEncKey();
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64url"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
  const dec = Buffer.concat([decipher.update(Buffer.from(dataB64, "base64url")), decipher.final()]);
  return dec.toString("utf8");
}

/** Encrypt only if non-empty; returns null otherwise (keeps optional columns clean). */
export function encryptOptional(plain: string | null | undefined): string | null {
  const s = typeof plain === "string" ? plain.trim() : "";
  return s ? encryptText(s) : null;
}
