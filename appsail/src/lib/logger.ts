// appsail/src/lib/logger.ts
// Pino logger. Object-first API: logger.info({ data }, "message").
// Secrets/PII are redacted and removed so they never reach logs.
import pino from "pino";
import { env } from "../env";

export const logger = pino({
  level: env.NODE_ENV === "production" ? "info" : "debug",
  base: undefined,
  redact: {
    paths: [
      "req.headers.authorization",
      "headers.authorization",
      "*.authorization",
      "*.otp",
      "*.otp_hash",
      "*.access_token",
      "*.refresh_token",
      "*.access_token_enc",
      "*.refresh_token_enc",
      "*.bank_iban",
      "*.bank_iban_enc",
      "*.token",
      "*.session",
      "*.SALLA_CLIENT_SECRET",
      "*.SALLA_WEBHOOK_SECRET",
      "*.ENCRYPTION_KEY_B64",
      "*.SESSION_SECRET",
      "*.SECURITY_PEPPER",
      "*.CRON_SECRET",
    ],
    remove: true,
  },
});
