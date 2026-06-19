// appsail/src/services/webhooks.service.ts
// Salla webhook event handler. Signature is verified + idempotency recorded in the route BEFORE
// this runs; this function does the domain work. Lifecycle events (authorize/uninstall/
// subscription) are handled synchronously-but-fast; order events reconcile return state.
//
// NOTE: the route returns HTTP 200 immediately and invokes this without awaiting, so heavy work
// never blocks Salla's response-timeout (which would trigger its 3x retry).
import { AppError } from "../lib/errors";
import { nowCatalyst } from "../lib/datetime";
import { logger } from "../lib/logger";
import { TenantsRepo } from "../repositories/tenants.repo";
import { SallaOauthTokensRepo } from "../repositories/sallaOauthTokens.repo";
import { SallaOAuthService } from "./sallaOAuth.service";
import { ReturnsSync } from "./returnsSync.service";

export type SallaWebhookEvent = {
  event?: string;
  type?: string;
  action?: string;
  merchant?: string | number;
  store_id?: string | number;
  created_at?: string;
  data?: any;
  [k: string]: any;
};

function eventType(evt: SallaWebhookEvent): string {
  return String(evt.event ?? evt.type ?? evt.action ?? "").trim().toLowerCase();
}
function storeIdOf(evt: SallaWebhookEvent): string | null {
  const v = evt.merchant ?? evt.store_id ?? evt.data?.merchant ?? evt.data?.store_id ?? evt.data?.store?.id;
  const s = v == null ? "" : String(v).trim();
  return s || null;
}
function orderIdOf(evt: SallaWebhookEvent): string | null {
  const v = evt.data?.id ?? evt.data?.order_id ?? evt.data?.order?.id;
  const s = v == null ? "" : String(v).trim();
  return s || null;
}
function tokensOf(evt: SallaWebhookEvent) {
  const d = evt.data ?? {};
  const access_token = String(d.access_token ?? "").trim();
  if (!access_token) return null;
  return {
    access_token,
    refresh_token: String(d.refresh_token ?? "").trim() || undefined,
    expires_in: Number(d.expires_in ?? 0),
    token_type: d.token_type ? String(d.token_type) : null,
    scope: d.scope ? String(d.scope) : null,
  };
}

export type WebhookResult = { handled: string; tenant?: string | null; [k: string]: any };

export async function handleSallaWebhook(req: any, event: SallaWebhookEvent): Promise<WebhookResult> {
  const t = eventType(event);
  const storeId = storeIdOf(event);

  // ---- app.store.authorize (Easy Mode install) ----
  if (t === "app.store.authorize" || (t.includes("app") && t.includes("authorize"))) {
    if (!storeId) throw new AppError(400, "authorize missing merchant id", "AUTHORIZE_MISSING_MERCHANT");
    const tokens = tokensOf(event);
    if (!tokens) throw new AppError(400, "authorize missing tokens", "AUTHORIZE_MISSING_TOKENS");

    const tenant = await TenantsRepo.ensureByStoreId(req, storeId, { status: "connected" });
    await SallaOAuthService.persistAuthorizeTokens(req, tenant.ROWID, tokens, storeId);
    await TenantsRepo.updateConnectionFields(req, tenant.ROWID, { salla_store_id: storeId, status: "connected" });

    // Best-effort: sync real store name + subscribe to order webhooks. Never block authorize.
    (async () => {
      try {
        const profile = await SallaOAuthService.fetchStoreProfile(tokens.access_token);
        if (profile?.name || profile?.domain) {
          await TenantsRepo.updateConnectionFields(req, tenant.ROWID, {
            ...(profile.name ? { store_name: profile.name } : {}),
            ...(profile.domain ? { store_domain: profile.domain } : {}),
          });
        }
      } catch (err) {
        logger.warn({ err: (err as any)?.message }, "store profile sync failed");
      }
      await SallaOAuthService.subscribeToWebhookEvents(req, tenant.ROWID, tokens.access_token).catch(() => {});
    })().catch(() => {});

    return { handled: "app.store.authorize", tenant: tenant.ROWID, store_id: storeId };
  }

  // ---- uninstall ----
  if (t.includes("uninstall")) {
    if (!storeId) return { handled: "uninstall", tenant: null };
    const tenant = await TenantsRepo.findBySallaStoreId(req, storeId);
    if (!tenant) return { handled: "uninstall", tenant: null };
    await SallaOauthTokensRepo.revoke(req, tenant.ROWID, nowCatalyst());
    await TenantsRepo.updateConnectionFields(req, tenant.ROWID, { status: "uninstalled" });
    return { handled: "uninstall", tenant: tenant.ROWID };
  }

  // ---- billing (App Subscriptions) ----
  if (t.startsWith("app.subscription")) {
    const tenant = storeId ? await TenantsRepo.findBySallaStoreId(req, storeId) : null;
    // Plan gating wired in P4/billing; record the lifecycle marker for now.
    if (tenant) {
      const planCode = String(event.data?.plan_name ?? event.data?.plan ?? "").trim();
      await TenantsRepo.mergeFlagsObject(req, tenant.ROWID, {
        billing: { last_event: t, plan: planCode || undefined, at: nowCatalyst() },
      }).catch(() => {});
    }
    logger.info({ tenant: tenant?.ROWID ?? null, event: t }, "subscription event");
    return { handled: t, tenant: tenant?.ROWID ?? null };
  }

  // ---- order lifecycle → return reconciliation ----
  // Domain reconciliation (auto-reject on cancel, sync→resolved on refund, window calc on shipment)
  // is implemented in the returns service (P2/P3). Here we resolve tenant + log; ReturnsSync hook
  // is invoked when available.
  if (t.startsWith("order.")) {
    const tenant = storeId ? await TenantsRepo.findBySallaStoreId(req, storeId) : null;
    const orderId = orderIdOf(event);
    try {
      if (tenant) await ReturnsSync.onOrderEvent(req, tenant.ROWID, t, event);
    } catch (err) {
      logger.warn({ err: (err as any)?.message, event: t }, "order event reconciliation failed");
    }
    logger.info({ tenant: tenant?.ROWID ?? null, event: t, orderId }, "order event received");
    return { handled: t, tenant: tenant?.ROWID ?? null };
  }

  return { handled: "ignored", type: t || null };
}
