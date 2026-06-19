// Minimal env so modules that import ../env don't fail validation during unit tests.
import crypto from "crypto";

process.env.NODE_ENV = process.env.NODE_ENV || "test";
process.env.SALLA_APP_ID = process.env.SALLA_APP_ID || "1047822871";
process.env.SALLA_CLIENT_ID = process.env.SALLA_CLIENT_ID || "test-client";
process.env.SALLA_CLIENT_SECRET = process.env.SALLA_CLIENT_SECRET || "test-secret";
process.env.SALLA_WEBHOOK_SECRET = process.env.SALLA_WEBHOOK_SECRET || "whsec_test_secret";
process.env.SECURITY_PEPPER = process.env.SECURITY_PEPPER || crypto.randomBytes(32).toString("hex");
process.env.ENCRYPTION_KEY_B64 = process.env.ENCRYPTION_KEY_B64 || crypto.randomBytes(32).toString("base64");
process.env.CRON_SECRET = process.env.CRON_SECRET || "cron_test";
process.env.SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(48).toString("base64url");

export {};
