import "./setupEnv";
import { encryptText, decryptText, hashContact, hashOtp, verifyOtpHash, generateOtp6, encryptOptional } from "../lib/crypto";

describe("crypto", () => {
  it("encrypts and decrypts round-trip (AES-256-GCM)", () => {
    const secret = "salla-access-token-xyz";
    const enc = encryptText(secret);
    expect(enc).toMatch(/^v1:/);
    expect(enc).not.toContain(secret);
    expect(decryptText(enc)).toBe(secret);
  });

  it("fails to decrypt tampered ciphertext (auth tag)", () => {
    const enc = encryptText("hello");
    const tampered = enc.slice(0, -2) + (enc.endsWith("AA") ? "BB" : "AA");
    expect(() => decryptText(tampered)).toThrow();
  });

  it("encryptOptional returns null for empty", () => {
    expect(encryptOptional("")).toBeNull();
    expect(encryptOptional(undefined)).toBeNull();
    expect(encryptOptional("x")).toMatch(/^v1:/);
  });

  it("hashContact is deterministic + tenant-scoped", () => {
    const a = hashContact("1", "email", "USER@x.com");
    const b = hashContact("1", "email", "user@x.com");
    const c = hashContact("2", "email", "user@x.com");
    expect(a).toBe(b); // case-insensitive
    expect(a).not.toBe(c); // tenant-scoped
  });

  it("verifies OTP hash correctly", () => {
    const otp = generateOtp6();
    const ch = hashContact("1", "email", "user@x.com");
    const h = hashOtp("1", "ORD-1", ch, otp);
    expect(verifyOtpHash("1", "ORD-1", ch, otp, h)).toBe(true);
    expect(verifyOtpHash("1", "ORD-1", ch, "000000", h)).toBe(false);
    expect(verifyOtpHash("1", "ORD-2", ch, otp, h)).toBe(false);
  });

  it("generateOtp6 is always 6 digits", () => {
    for (let i = 0; i < 50; i++) expect(generateOtp6()).toMatch(/^\d{6}$/);
  });
});
