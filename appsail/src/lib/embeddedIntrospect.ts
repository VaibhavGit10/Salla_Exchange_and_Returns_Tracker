// appsail/src/lib/embeddedIntrospect.ts
// Verify a Salla embedded-app token via the Introspection API.
//
// The embedded SDK (embedded.auth.getToken()) hands the iframe a short-lived `em_tok_…`. We POST
// it here with our App ID in the S-Source header; Salla returns the verified { merchant_id, ... }.
// merchant_id is the TRUSTED store id — the client cannot forge it. This is the root of merchant
// tenant isolation.
import { env } from "../env";
import { AppError } from "./errors";

export interface IntrospectResult {
  store_id: string;
  user_id: string | null;
  exp: number | null;
}

export async function introspectEmbeddedToken(token: string): Promise<IntrospectResult> {
  if (!token) throw new AppError(401, "Missing embedded token", "EMBEDDED_TOKEN_MISSING");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const resp = await fetch(env.SALLA_INTROSPECT_URL, {
      method: "POST",
      headers: {
        "S-Source": String(env.SALLA_APP_ID),
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ token }),
      signal: controller.signal,
    });

    const text = await resp.text().catch(() => "");
    if (!resp.ok) {
      throw new AppError(401, "Embedded token introspection failed", "EMBEDDED_INTROSPECT_FAILED", `HTTP ${resp.status}`);
    }

    let body: any = {};
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      body = {};
    }
    const d = body.data ?? {};
    if (body.success === false || !d.merchant_id) {
      throw new AppError(401, "Introspection returned no merchant_id", "EMBEDDED_INTROSPECT_INVALID");
    }

    return {
      store_id: String(d.merchant_id),
      user_id: d.user_id != null ? String(d.user_id) : null,
      exp: d.exp ?? null,
    };
  } finally {
    clearTimeout(timer);
  }
}
