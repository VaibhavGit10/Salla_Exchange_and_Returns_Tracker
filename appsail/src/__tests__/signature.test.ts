import "./setupEnv";
import crypto from "crypto";
import { verifyWebhookSignature, extractSallaSignature } from "../security/signature";

const SECRET = "whsec_test_secret";
function sign(body: string): string {
  return crypto.createHmac("sha256", SECRET).update(Buffer.from(body, "utf8")).digest("hex");
}

describe("webhook signature", () => {
  it("verifies a correct signature on the raw body", () => {
    const body = JSON.stringify({ event: "order.refunded", merchant: 123 });
    expect(verifyWebhookSignature({ rawBody: Buffer.from(body), signature: sign(body), secret: SECRET })).toBe(true);
  });

  it("rejects a wrong signature", () => {
    const body = JSON.stringify({ event: "x" });
    expect(verifyWebhookSignature({ rawBody: Buffer.from(body), signature: sign("other"), secret: SECRET })).toBe(false);
  });

  it("rejects malformed / empty signatures", () => {
    const body = "{}";
    expect(verifyWebhookSignature({ rawBody: Buffer.from(body), signature: "nothex", secret: SECRET })).toBe(false);
    expect(verifyWebhookSignature({ rawBody: Buffer.from(body), signature: "", secret: SECRET })).toBe(false);
  });

  it("extracts signature from headers (x-salla-signature, sha256=, bearer)", () => {
    const sig = "a".repeat(64);
    expect(extractSallaSignature({ headers: { "x-salla-signature": sig } })).toBe(sig);
    expect(extractSallaSignature({ headers: { "x-salla-signature": `sha256=${sig}` } })).toBe(sig);
    expect(extractSallaSignature({ headers: { authorization: `Bearer ${sig}` } })).toBe(sig);
    expect(extractSallaSignature({ headers: { authorization: "Bearer not-a-sig" } })).toBe("");
  });
});
