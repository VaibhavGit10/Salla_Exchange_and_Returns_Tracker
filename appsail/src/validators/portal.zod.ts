import { z } from "zod";

export const requestOtpSchema = z.object({
  portal_public_slug: z.string().min(1).optional(),
  tenant_id: z.string().regex(/^\d+$/).optional(),
  order_number: z.string().min(1).max(64),
  channel: z.enum(["email", "sms"]).default("email"),
  contact: z.string().min(3).max(160),
});

export const verifyOtpSchema = requestOtpSchema.extend({
  otp: z.string().regex(/^\d{6}$/, "OTP must be 6 digits"),
});
