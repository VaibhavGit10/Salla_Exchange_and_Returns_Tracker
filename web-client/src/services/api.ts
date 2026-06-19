import { http } from "./http";
import { portalSession } from "../lib/session";

function toQuery(q: Record<string, any> = {}): string {
  const p = new URLSearchParams();
  Object.entries(q).forEach(([k, v]) => {
    if (v != null && v !== "") p.set(k, String(v));
  });
  const s = p.toString();
  return s ? `?${s}` : "";
}

export const MerchantApi = {
  me: () => http.get("/auth/me", "merchant"),
  overview: () => http.get("/merchant/overview", "merchant"),
  analytics: () => http.get("/merchant/analytics", "merchant"),
  listReturns: (q: Record<string, any> = {}) => http.get(`/merchant/returns${toQuery(q)}`, "merchant"),
  getReturn: (rma: string) => http.get(`/merchant/returns/${encodeURIComponent(rma)}`, "merchant"),
  approve: (rma: string, body: any = {}) => http.post(`/merchant/returns/${encodeURIComponent(rma)}/approve`, body, "merchant"),
  reject: (rma: string, body: any) => http.post(`/merchant/returns/${encodeURIComponent(rma)}/reject`, body, "merchant"),
  receive: (rma: string, body: any = {}) => http.post(`/merchant/returns/${encodeURIComponent(rma)}/receive`, body, "merchant"),
  resolve: (rma: string, body: any) => http.post(`/merchant/returns/${encodeURIComponent(rma)}/resolve`, body, "merchant"),
  decisions: (rma: string, items: any[]) => http.post(`/merchant/returns/${encodeURIComponent(rma)}/decisions`, { items }, "merchant"),
  getRules: () => http.get("/merchant/rules", "merchant"),
  putRules: (body: any) => http.put("/merchant/rules", body, "merchant"),
  // dev-only (404s in production)
  devSeed: () => http.post("/dev/seed", {}, "none"),
  devUnseed: () => http.post("/dev/unseed", {}, "none"),
};

export const PortalApi = {
  requestOtp: (body: any) => http.post("/portal/request-otp", body, "none"),
  verifyOtp: async (body: any) => {
    const r = await http.post("/portal/verify-otp", body, "none");
    if (r?.session_token) portalSession.set(r.session_token);
    return r;
  },
  me: () => http.get("/portal/me", "portal"),
  orderItems: () => http.get("/portal/order-items", "portal"),
  createReturn: (body: any) => http.post("/portal/returns", body, "portal"),
  listReturns: () => http.get("/portal/returns", "portal"),
  getReturn: (rma: string) => http.get(`/portal/returns/${encodeURIComponent(rma)}`, "portal"),
  cancel: (rma: string, reason?: string) => http.post(`/portal/returns/${encodeURIComponent(rma)}/cancel`, { reason }, "portal"),
  uploadAttachment: (rma: string, file: File) => {
    const f = new FormData();
    f.append("file", file);
    return http.postForm(`/portal/returns/${encodeURIComponent(rma)}/attachments`, f, "portal");
  },
};
