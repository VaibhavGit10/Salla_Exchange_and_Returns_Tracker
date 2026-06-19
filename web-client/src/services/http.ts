import { API_BASE } from "../config";
import { merchantSession, portalSession } from "../lib/session";

export class ApiError extends Error {
  status: number;
  code?: string;
  details?: any;
  constructor(message: string, status: number, code?: string, details?: any) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

type Auth = "merchant" | "portal" | "none";

async function request(path: string, opts: { method?: string; body?: any; auth?: Auth; form?: FormData } = {}): Promise<any> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (opts.auth === "merchant") {
    const t = merchantSession.get();
    if (t) headers.Authorization = `Bearer ${t}`;
  } else if (opts.auth === "portal") {
    const t = portalSession.get();
    if (t) headers.Authorization = `Bearer ${t}`;
  }

  let body: any;
  if (opts.form) {
    body = opts.form;
  } else if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.body);
  }

  const res = await fetch(`${API_BASE}${path}`, { method: opts.method || "GET", headers, body });
  const text = await res.text().catch(() => "");
  let json: any = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = {};
  }
  if (!res.ok) throw new ApiError(json?.error || `Request failed (${res.status})`, res.status, json?.code, json?.details);
  return json;
}

export const http = {
  get: (p: string, auth: Auth = "none") => request(p, { auth }),
  post: (p: string, body?: any, auth: Auth = "none") => request(p, { method: "POST", body, auth }),
  put: (p: string, body?: any, auth: Auth = "none") => request(p, { method: "PUT", body, auth }),
  postForm: (p: string, form: FormData, auth: Auth = "none") => request(p, { method: "POST", form, auth }),
};
