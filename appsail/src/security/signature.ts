// appsail/src/security/signature.ts
// Salla webhook signature verification. Salla signs the payload with HMAC-SHA256 and sends the
// 64-char hex digest in `X-Salla-Signature` (sometimes as `Authorization: Bearer <hex>` or
// `sha256=<hex>`). We verify against the RAW request body (never the re-serialised JSON).
import crypto from "crypto";

function normalizeSignature(sig: string): string {
  return String(sig || "")
    .replace(/^Bearer\s+/i, "")
    .replace(/^sha256=/i, "")
    .trim();
}

/** Extract the provided signature from headers. Authorization is only used if it's a 64-hex string. */
export function extractSallaSignature(req: any): string {
  const xSig = req.headers?.["x-salla-signature"];
  const auth = req.headers?.["authorization"];
  const fromX = normalizeSignature(Array.isArray(xSig) ? xSig[0] : xSig);
  if (fromX) return fromX;
  const fromAuth = normalizeSignature(Array.isArray(auth) ? auth[0] : auth);
  return /^[a-f0-9]{64}$/i.test(fromAuth) ? fromAuth : "";
}

export function verifyWebhookSignature(args: { rawBody: Buffer | string | undefined; signature: string; secret: string }): boolean {
  const { rawBody, signature, secret } = args;
  if (!rawBody || !signature || !secret) return false;

  const buf = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody), "utf8");
  const got = normalizeSignature(signature);
  if (!/^[a-f0-9]{64}$/i.test(got)) return false; // reject malformed early

  const expected = crypto.createHmac("sha256", secret).update(buf).digest("hex");
  // Equal-length hex buffers → safe to timing-compare.
  return crypto.timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(got, "hex"));
}
