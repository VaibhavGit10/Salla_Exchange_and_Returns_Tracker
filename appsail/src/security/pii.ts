// appsail/src/security/pii.ts
// PII normalisation + masking helpers. Storage hashing uses crypto.hashContact (peppered HMAC);
// these helpers normalise inputs first and provide display masking.
import crypto from "crypto";

export function normalizeEmail(email: string | null | undefined): string {
  return String(email ?? "").trim().toLowerCase();
}

/** Best-effort E.164-ish normalisation for KSA/GCC numbers (strips spaces/dashes, keeps leading +). */
export function normalizePhone(phone: string | null | undefined): string {
  let p = String(phone ?? "").trim().replace(/[\s\-()]/g, "");
  if (!p) return "";
  if (p.startsWith("00")) p = `+${p.slice(2)}`;
  // Saudi local 05XXXXXXXX → +9665XXXXXXXX
  if (/^0?5\d{8}$/.test(p)) p = `+966${p.replace(/^0/, "")}`;
  return p;
}

export function isEmail(v: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(v ?? "").trim());
}

/** Mask an email for display/storage: a***@d***.com */
export function maskEmail(email: string): string {
  const e = normalizeEmail(email);
  const [user, domain] = e.split("@");
  if (!user || !domain) return "";
  const mu = user.length <= 2 ? `${user[0] ?? ""}*` : `${user.slice(0, 2)}***`;
  return `${mu}@${domain}`;
}

export function maskPhone(phone: string): string {
  const p = normalizePhone(phone);
  if (p.length < 4) return "***";
  return `${p.slice(0, 4)}***${p.slice(-2)}`;
}

/** Plain SHA-256 hex (for non-peppered external uses, e.g. future ad-platform CAPI). */
export function sha256Hex(input: string): string {
  return crypto.createHash("sha256").update(String(input)).digest("hex");
}
