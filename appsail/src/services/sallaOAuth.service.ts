// appsail/src/services/sallaOAuth.service.ts
// Salla OAuth + access-token lifecycle. Easy Mode is primary (tokens arrive via the
// app.store.authorize webhook); Custom Mode (code exchange) is supported as a fallback.
//
// Optimization: getValidAccessTokenForTenant only refreshes when the token is within the skew
// window of expiry — it does NOT hit Salla on every call. Tokens are stored AES-256-GCM encrypted.
import { env } from "../env";
import { AppError } from "../lib/errors";
import { encryptText, decryptText, encryptOptional } from "../lib/crypto";
import { nowCatalyst, catalystDateTimeIn } from "../lib/datetime";
import { sallaFetchJson, SallaApiError } from "../lib/sallaApi";
import { retryWithBackoff } from "../lib/retryWithBackoff";
import { logger } from "../lib/logger";
import { SallaOauthTokensRepo } from "../repositories/sallaOauthTokens.repo";

// Canonical Salla event identifiers relevant to returns reconciliation (verified against docs.salla.dev).
// order.status.updated drives eligibility/sync; refunded→resolved; cancelled→auto-reject; return-shipment
// events relay reverse-logistics tracking. (Easy Mode also pre-wires events from the Partners portal;
// this programmatic call is a best-effort backup — our handler matches the `order.` prefix generically.)
const WEBHOOK_EVENTS = [
  "order.status.updated",
  "order.refunded",
  "order.cancelled",
  "order.shipment.created",
  "order.shipment.return.created",
];

function assertDigits(v: any): string {
  const s = String(v ?? "").trim();
  if (!/^\d+$/.test(s)) throw new Error("Expected ROWID digits");
  return s;
}

function expiresAtFrom(expiresIn: number): string | null {
  return Number.isFinite(expiresIn) && expiresIn > 0 ? catalystDateTimeIn(expiresIn) : null;
}

function shouldRefresh(expiresAt: string | null | undefined): boolean {
  if (!expiresAt) return true;
  const t = Date.parse(String(expiresAt).replace(" ", "T"));
  if (!Number.isFinite(t)) return true;
  return Date.now() + env.SALLA_TOKEN_REFRESH_SKEW_SECONDS * 1000 >= t;
}

async function postForm(url: string, form: URLSearchParams): Promise<{ ok: boolean; status: number; json: any; text: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: form.toString(),
      signal: controller.signal,
    });
    const text = await resp.text().catch(() => "");
    let json: any = {};
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      json = {};
    }
    return { ok: resp.ok, status: resp.status, json, text };
  } finally {
    clearTimeout(timer);
  }
}

export class SallaOAuthService {
  static mode(): "easy" | "custom" {
    return env.SALLA_OAUTH_MODE;
  }

  static buildInstallUrl(): string {
    const base = String(env.SALLA_INSTALL_URL_BASE).replace(/\/+$/, "");
    return `${base}/${encodeURIComponent(env.SALLA_APP_ID)}`;
  }

  /** Persist tokens received from the authorize webhook (Easy Mode). */
  static async persistAuthorizeTokens(
    req: any,
    tenantId: string,
    tokens: { access_token: string; refresh_token?: string; expires_in?: number; token_type?: string | null; scope?: string | null },
    storeId: string
  ): Promise<void> {
    const tid = assertDigits(tenantId);
    const existing = await SallaOauthTokensRepo.findByTenantId(req, tid).catch(() => null);
    await SallaOauthTokensRepo.upsertByTenant(req, tid, {
      tenant_unique_key: existing?.tenant_unique_key || `store:${storeId}`,
      token_status: "active",
      access_token_enc: encryptText(tokens.access_token),
      refresh_token_enc: tokens.refresh_token ? encryptText(tokens.refresh_token) : existing?.refresh_token_enc ?? null,
      token_type: tokens.token_type || "Bearer",
      scopes: tokens.scope ?? null,
      access_token_expires_at: expiresAtFrom(Number(tokens.expires_in ?? 0)),
      last_token_refresh_at: nowCatalyst(),
      installed_at: existing?.installed_at || nowCatalyst(),
      uninstalled_at: null,
    });
  }

  /** Return a valid access token, refreshing only if near/!past expiry. Throws if not connected. */
  static async getValidAccessTokenForTenant(req: any, tenantId: string): Promise<string> {
    const tid = assertDigits(tenantId);
    const row = await SallaOauthTokensRepo.findByTenantId(req, tid);
    if (!row || !row.access_token_enc || row.access_token_enc === "__revoked__") {
      throw new AppError(409, "Salla not connected", "SALLA_NOT_CONNECTED");
    }

    if (row.token_status === "active" && !shouldRefresh(row.access_token_expires_at)) {
      return decryptText(String(row.access_token_enc));
    }

    const refreshEnc = row.refresh_token_enc && row.refresh_token_enc !== "__revoked__" ? String(row.refresh_token_enc) : "";
    if (!refreshEnc) {
      await SallaOauthTokensRepo.upsertByTenant(req, tid, { token_status: "missing_refresh_token" });
      throw new AppError(409, "Refresh token missing; reconnect required", "REFRESH_TOKEN_MISSING");
    }

    const form = new URLSearchParams({
      grant_type: "refresh_token",
      client_id: env.SALLA_CLIENT_ID,
      client_secret: env.SALLA_CLIENT_SECRET,
      refresh_token: decryptText(refreshEnc),
    });
    const { ok, status, json, text } = await postForm(env.SALLA_OAUTH_TOKEN_URL, form);
    if (!ok || !json.access_token) {
      await SallaOauthTokensRepo.upsertByTenant(req, tid, { token_status: "refresh_failed" });
      throw new AppError(502, "Token refresh failed", "OAUTH_REFRESH_FAILED", `HTTP ${status}: ${text.slice(0, 200)}`);
    }

    await SallaOauthTokensRepo.upsertByTenant(req, tid, {
      token_status: "active",
      access_token_enc: encryptText(String(json.access_token)),
      refresh_token_enc: json.refresh_token ? encryptText(String(json.refresh_token)) : row.refresh_token_enc ?? null,
      access_token_expires_at: expiresAtFrom(Number(json.expires_in ?? 0)),
      last_token_refresh_at: nowCatalyst(),
    });
    return String(json.access_token);
  }

  /** Fetch store profile (name/domain). Localized name may be { ar, en }. */
  static async fetchStoreProfile(accessToken: string): Promise<{ id?: string; name?: string; domain?: string | null } | null> {
    const endpoints = ["/admin/v2/store/info", "/admin/v2/settings/store"];
    const pickName = (d: any): string | null => {
      let n = d?.name ?? d?.store_name ?? d?.branch_name ?? null;
      if (n && typeof n === "object") n = n.en || n.ar || Object.values(n).find(Boolean) || null;
      return n ? String(n).trim() : null;
    };
    for (const ep of endpoints) {
      try {
        const resp = await sallaFetchJson<any>(accessToken, ep);
        const d = resp?.data ?? {};
        const name = pickName(d);
        if (name || d?.id) {
          return { id: d?.id != null ? String(d.id) : undefined, name: name ?? undefined, domain: d?.domain ?? d?.store_domain ?? null };
        }
      } catch (err) {
        if (err instanceof SallaApiError && err.status !== 404) logger.warn({ ep, status: err.status }, "fetchStoreProfile endpoint failed");
      }
    }
    return null;
  }

  /** Best-effort programmatic webhook subscription after authorize (Easy Mode often pre-wires these). */
  static async subscribeToWebhookEvents(req: any, tenantId: string, accessToken: string): Promise<void> {
    const callbackUrl = `${String(env.APP_BASE_URL || "").replace(/\/+$/, "")}/webhooks/salla`;
    for (const event of WEBHOOK_EVENTS) {
      try {
        await retryWithBackoff(
          () =>
            sallaFetchJson(accessToken, "/admin/v2/webhooks/subscribe", {
              method: "POST",
              // version is an integer (1|2) per Salla docs; signature security uses the app-level webhook
              // secret configured in the Partners portal (verified in our HMAC check), not a per-sub field.
              body: { name: `returns-${event}`, event, version: 2, url: callbackUrl },
            }),
          { maxRetries: 2, initialDelayMs: 500 }
        );
        logger.info({ tenantId, event }, "subscribed to webhook event");
      } catch (err) {
        logger.warn({ tenantId, event, err: (err as any)?.message }, "webhook subscribe failed (non-fatal)");
      }
    }
  }

  // ---- Custom Mode (fallback; Easy Mode is primary) ----
  static async exchangeCodeForToken(code: string, redirectUri: string): Promise<any> {
    const form = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: env.SALLA_CLIENT_ID,
      client_secret: env.SALLA_CLIENT_SECRET,
      code,
      redirect_uri: redirectUri,
    });
    const { ok, status, json, text } = await postForm(env.SALLA_OAUTH_TOKEN_URL, form);
    if (!ok || !json.access_token) {
      throw new AppError(400, "Token exchange failed", "OAUTH_TOKEN_EXCHANGE_FAILED", `HTTP ${status}: ${text.slice(0, 200)}`);
    }
    return json;
  }

  static resolveRedirectUri(): string {
    if (env.SALLA_OAUTH_REDIRECT_URI?.trim()) return env.SALLA_OAUTH_REDIRECT_URI.trim();
    const base = String(env.APP_BASE_URL || "").replace(/\/+$/, "");
    return `${base}/auth/callback`;
  }
}

export { encryptOptional };
