// appsail/src/services/portalAuth.service.ts
// Verify an OTP and mint a customer portal session (token hashed at rest, scoped to order+tenant).
import { env } from "../env";
import { AppError } from "../lib/errors";
import { hashContact, hashToken, randomToken, verifyOtpHash } from "../lib/crypto";
import { catalystDateTimeIn, nowCatalyst } from "../lib/datetime";
import { normalizeEmail, normalizePhone } from "../security/pii";
import { OtpSessionsRepo } from "../repositories/otpSessions.repo";
import { PortalSessionsRepo } from "../repositories/portalSessions.repo";

export type OtpChannel = "sms" | "email";

function normalizeContact(channel: OtpChannel, value: string): string {
  return channel === "email" ? normalizeEmail(value) : normalizePhone(value);
}

export class PortalAuthService {
  static async verifyOtpAndCreateSession(
    req: any,
    args: { tenantId: string; orderNumber: string; channel: OtpChannel; contact: string; otp: string; createdIp?: string }
  ): Promise<{ session_token: string; expires_at: string; order_number: string }> {
    const { tenantId, orderNumber, channel, contact, otp, createdIp } = args;
    const normalized = normalizeContact(channel, contact);
    const contactHash = hashContact(tenantId, channel, normalized);

    const otpRow = await OtpSessionsRepo.findLatestActive(req, tenantId, channel, contactHash, orderNumber);
    if (!otpRow) throw new AppError(400, "Invalid or expired code", "OTP_INVALID");

    if (!verifyOtpHash(tenantId, orderNumber, contactHash, otp, otpRow.otp_hash)) {
      const nextAttempt = (otpRow.attempt_count ?? 0) + 1;
      const lockedUntil = nextAttempt >= (otpRow.max_attempts ?? env.OTP_MAX_ATTEMPTS) ? catalystDateTimeIn(env.OTP_LOCKOUT_SECONDS) : null;
      await OtpSessionsRepo.incrementAttempt(req, otpRow.ROWID, nextAttempt, lockedUntil);
      throw new AppError(400, "Invalid or expired code", "OTP_INVALID");
    }

    await OtpSessionsRepo.markVerified(req, otpRow.ROWID);

    const rawToken = randomToken(32);
    const expiresAt = catalystDateTimeIn(env.PORTAL_SESSION_TTL_SECONDS);
    await PortalSessionsRepo.insert(req, {
      tenant_id: tenantId,
      session_token_hash: hashToken(rawToken),
      contact_hash: contactHash,
      order_number: orderNumber,
      expires_at: expiresAt,
      created_ip: createdIp ?? null,
      last_seen_at: nowCatalyst(),
    });

    return { session_token: rawToken, expires_at: expiresAt, order_number: orderNumber };
  }
}
