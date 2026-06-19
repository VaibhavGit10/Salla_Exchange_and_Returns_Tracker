// appsail/src/services/notifications/channels/email.ts
// Email channel via Catalyst Email. The pluggable Channel boundary — SMS/WhatsApp implement the
// same shape later without touching callers.
import { getCatalystApp } from "../../../lib/catalyst";
import { env } from "../../../env";
import { logger } from "../../../lib/logger";

export interface Channel {
  send(req: any, to: string, subject: string, html: string): Promise<boolean>;
}

export const EmailChannel: Channel = {
  async send(req: any, to: string, subject: string, html: string): Promise<boolean> {
    const from = env.OTP_FROM_EMAIL;
    if (!from) {
      logger.warn("OTP_FROM_EMAIL not configured — email not sent");
      return false;
    }
    if (!to) return false;
    try {
      await (getCatalystApp(req) as any).email().sendMail({
        from_email: from,
        to_email: [to],
        subject,
        content: html,
        html_mode: true,
      });
      return true;
    } catch (err) {
      logger.error({ err: (err as any)?.message }, "email send failed");
      return false;
    }
  },
};
