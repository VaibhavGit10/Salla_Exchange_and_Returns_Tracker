// appsail/src/services/otp.service.ts
// OTP issuance for the off-store portal fallback. Channel = email (Catalyst Email) at launch;
// the channel layer (notifications/) lets SMS/WhatsApp drop in later. Generic responses prevent
// account/order enumeration. Two-layer rate limiting (in-memory burst + DataStore authoritative).
import { env, isProd } from "../env";
import { generateOtp6, hashContact, hashOtp } from "../lib/crypto";
import { catalystDateTimeIn } from "../lib/datetime";
import { normalizeEmail, normalizePhone } from "../security/pii";
import { checkRateLimit } from "../lib/rateLimit";
import { OtpSessionsRepo } from "../repositories/otpSessions.repo";
import { NotificationsService } from "./notifications";
import { logger } from "../lib/logger";

export type OtpChannel = "sms" | "email";

function normalizeContact(channel: OtpChannel, value: string): string {
  return channel === "email" ? normalizeEmail(value) : normalizePhone(value);
}

const GENERIC = { ok: true as const, message: "If your details are correct, a verification code has been sent." };

export class OtpService {
  static async requestOtp(
    req: any,
    args: { tenantId: string; orderNumber: string; channel: OtpChannel; contact: string; requestIp?: string; userAgent?: string }
  ): Promise<{ ok: true; message: string; otp_dev?: string; expires_at?: string }> {
    const { tenantId, orderNumber, channel, contact, requestIp, userAgent } = args;
    const normalized = normalizeContact(channel, contact);
    const contactHash = hashContact(tenantId, channel, normalized);

    // L1 burst limiter
    const memKey = `otp:${tenantId}:${channel}:${contactHash}:${requestIp ?? "na"}`;
    if (!checkRateLimit(memKey, env.OTP_RATE_LIMIT_WINDOW_SECONDS * 1000, env.OTP_RATE_LIMIT_MAX_IN_WINDOW).allowed) {
      return GENERIC;
    }
    // L2 authoritative limiter
    const windowStart = new Date(Date.now() - env.OTP_RATE_LIMIT_WINDOW_SECONDS * 1000);
    const recent = await OtpSessionsRepo.countRecentRequests(req, tenantId, channel, contactHash, windowStart);
    if (recent >= env.OTP_RATE_LIMIT_MAX_IN_WINDOW) return GENERIC;

    const otp = generateOtp6();
    const expiresAt = catalystDateTimeIn(env.OTP_TTL_SECONDS);
    await OtpSessionsRepo.insert(req, {
      tenant_id: tenantId,
      channel,
      contact_hash: contactHash,
      order_number: orderNumber,
      otp_hash: hashOtp(tenantId, orderNumber, contactHash, otp),
      expires_at: expiresAt,
      attempt_count: 0,
      max_attempts: env.OTP_MAX_ATTEMPTS,
      locked_until: null,
      verified_at: null,
      request_ip: requestIp ?? null,
      user_agent: userAgent ?? null,
    });

    if (channel === "email") {
      await NotificationsService.sendOtp(req, normalized, otp).catch((err) =>
        logger.error({ err: (err as any)?.message }, "failed to send OTP email")
      );
    } else {
      logger.warn({ channel }, "SMS OTP not enabled at launch — email is the supported channel");
    }

    // Non-prod convenience only — never returned in production.
    return isProd ? GENERIC : { ...GENERIC, otp_dev: otp, expires_at: expiresAt };
  }
}
