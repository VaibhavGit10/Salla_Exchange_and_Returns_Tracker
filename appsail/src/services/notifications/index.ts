// appsail/src/services/notifications/index.ts
// Customer notifications (ReturnXchange brand). Fire-and-forget; email at launch via the pluggable
// channel. To add SMS/WhatsApp later, implement the Channel and route by tenant preference here.
import { EmailChannel } from "./channels/email";
import { env } from "../../env";

const BRAND = "ReturnXchange";

function shell(title: string, bodyHtml: string, storeName?: string): string {
  const store = storeName ? `<p style="color:#667">${storeName}</p>` : "";
  return `<div style="font-family:system-ui,Segoe UI,Arial,sans-serif;max-width:520px;margin:auto">
    <h2 style="margin:0 0 4px">${title}</h2>${store}
    <div style="font-size:15px;line-height:1.6;color:#222">${bodyHtml}</div>
    <hr style="border:none;border-top:1px solid #eee;margin:20px 0"/>
    <p style="font-size:12px;color:#99a">Powered by ${BRAND}</p>
  </div>`;
}

export class NotificationsService {
  static async sendOtp(req: any, toEmail: string, otp: string): Promise<void> {
    const minutes = Math.round(env.OTP_TTL_SECONDS / 60);
    await EmailChannel.send(
      req,
      toEmail,
      `${BRAND} verification code`,
      shell(
        "Verify your return request",
        `<p>Your verification code is:</p>
         <p style="font-size:28px;font-weight:700;letter-spacing:4px">${otp}</p>
         <p>It is valid for ${minutes} minutes. Do not share this code with anyone.</p>`
      )
    );
  }

  static async onApproved(req: any, a: { toEmail?: string | null; returnNumber: string; orderNumber: string; storeName?: string; instructions?: string }): Promise<void> {
    if (!a.toEmail) return;
    await EmailChannel.send(
      req,
      a.toEmail,
      `Your return ${a.returnNumber} is approved`,
      shell(
        "Return approved ✅",
        `<p>Your return request <strong>${a.returnNumber}</strong> for order <strong>${a.orderNumber}</strong> has been approved.</p>
         ${a.instructions ? `<p>${a.instructions}</p>` : "<p>You'll receive return shipping instructions shortly.</p>"}`,
        a.storeName
      )
    );
  }

  static async onRejected(req: any, a: { toEmail?: string | null; returnNumber: string; orderNumber: string; storeName?: string; reason?: string }): Promise<void> {
    if (!a.toEmail) return;
    await EmailChannel.send(
      req,
      a.toEmail,
      `Update on your return ${a.returnNumber}`,
      shell("Return request update", `<p>Your return <strong>${a.returnNumber}</strong> for order <strong>${a.orderNumber}</strong> could not be approved.</p>${a.reason ? `<p><strong>Reason:</strong> ${a.reason}</p>` : ""}`, a.storeName)
    );
  }

  static async onResolved(req: any, a: { toEmail?: string | null; returnNumber: string; orderNumber: string; storeName?: string; resolutionType: string; reference?: string }): Promise<void> {
    if (!a.toEmail) return;
    const label = a.resolutionType === "refund" ? "Refund issued" : a.resolutionType === "exchange" ? "Exchange dispatched" : "Store credit issued";
    await EmailChannel.send(
      req,
      a.toEmail,
      `Your return ${a.returnNumber} is resolved`,
      shell("Return resolved 🎉", `<p><strong>${label}</strong> for return <strong>${a.returnNumber}</strong> (order ${a.orderNumber}).</p>${a.reference ? `<p>Reference: ${a.reference}</p>` : ""}`, a.storeName)
    );
  }

  static async onReceived(req: any, a: { toEmail?: string | null; returnNumber: string; storeName?: string }): Promise<void> {
    if (!a.toEmail) return;
    await EmailChannel.send(req, a.toEmail, `We received your return ${a.returnNumber}`, shell("Return received 📦", `<p>We've received your returned item(s) for <strong>${a.returnNumber}</strong> and are inspecting them now.</p>`, a.storeName));
  }
}
