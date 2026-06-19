// appsail/src/routes/auth.routes.ts
// Merchant auth: embedded login (Salla SDK token → introspect → session JWT), session introspection,
// and OAuth install/callback (Easy Mode primary; Custom Mode fallback).
import { Router } from "express";
import { z } from "zod";
import { introspectEmbeddedToken } from "../lib/embeddedIntrospect";
import { signSession } from "../lib/session";
import { authEmbedded } from "../middlewares/authEmbedded";
import { TenantsRepo } from "../repositories/tenants.repo";
import { SallaOauthTokensRepo } from "../repositories/sallaOauthTokens.repo";
import { SallaOAuthService } from "../services/sallaOAuth.service";
import { SallaOrdersService } from "../services/sallaOrders.service";
import { sallaFetchJson } from "../lib/sallaApi";
import { getCatalystApp } from "../lib/catalyst";
import { logger } from "../lib/logger";
import { AppError } from "../lib/errors";
import { env } from "../env";

export const authRoutes = Router();

const embeddedSchema = z.object({ token: z.string().min(1) });

/** POST /auth/embedded — verify Salla embedded token, mint a store-bound session JWT. */
authRoutes.post("/embedded", async (req, res, next) => {
  try {
    const { token } = embeddedSchema.parse(req.body);
    const { store_id, user_id } = await introspectEmbeddedToken(token);
    await TenantsRepo.ensureByStoreId(req, store_id); // tenant exists before first dashboard call
    const session = signSession({ store_id, user_id });
    res.json({ ok: true, token: session, store_id });
  } catch (e) {
    next(e);
  }
});

/**
 * POST /auth/dev-login — LOCAL PREVIEW ONLY. Mints a merchant session for DEV_DIRECT_STORE_ID so the
 * embedded console can be viewed without the Salla iframe. 404s unless DEV_DIRECT_LOGIN === "true"
 * (never set that in production). Creates the tenant row in DataStore if absent.
 */
authRoutes.post("/dev-login", async (req, res, next) => {
  try {
    if (env.DEV_DIRECT_LOGIN !== "true" || !env.DEV_DIRECT_STORE_ID) {
      throw new AppError(404, "Not found", "NOT_FOUND");
    }
    const storeId = String(env.DEV_DIRECT_STORE_ID);
    logger.warn({ storeId }, "⚠️ DEV_DIRECT_LOGIN used — must NEVER be enabled in production");
    const tenant = await TenantsRepo.ensureByStoreId(req, storeId, { store_name: "Dev Store", status: "connected" });
    const session = signSession({ store_id: storeId, user_id: "dev" });
    res.json({ ok: true, dev: true, token: session, store_id: storeId, tenant_id: tenant.ROWID, portal_public_slug: tenant.portal_public_slug });
  } catch (e) {
    next(e);
  }
});

/** GET /auth/me — current merchant/store (from the signed session). */
authRoutes.get("/me", authEmbedded, async (req: any, res) => {
  const t = req.tenant;
  res.json({
    ok: true,
    data: {
      store_id: req.storeId,
      tenant_id: req.tenantId,
      store_name: t?.store_name || null,
      store_domain: t?.store_domain || null,
      status: t?.status || null,
      plan_code: t?.plan_code || null,
      dev_tools: env.DEV_DIRECT_LOGIN === "true",
    },
  });
});

/**
 * GET /auth/connections — ops/debug: list connected stores + token status.
 * Gated by the X-Cron-Secret header (CRON_SECRET). Lets us verify a real install landed without
 * digging through DataStore tables. Never exposes tokens themselves.
 */
authRoutes.get("/connections", async (req: any, res, next) => {
  try {
    const provided = String(req.headers["x-cron-secret"] || "").trim();
    if (!provided || provided !== env.CRON_SECRET) throw new AppError(401, "Unauthorized", "UNAUTHORIZED");

    const rows = await getCatalystApp(req)
      .zcql()
      .executeZCQLQuery("SELECT * FROM tenants ORDER BY CREATEDTIME DESC LIMIT 50");
    const out: any[] = [];
    for (const r of rows ?? []) {
      const t = (r as any).tenants;
      const tk = await SallaOauthTokensRepo.findByTenantId(req, String(t.ROWID)).catch(() => null);
      out.push({
        store_id: String(t.salla_store_id ?? ""),
        store_name: t.store_name ?? null,
        store_domain: t.store_domain ?? null,
        status: t.status ?? null,
        portal_slug: t.portal_public_slug ?? null,
        connected_at: t.CREATEDTIME ?? null,
        token_status: tk ? tk.token_status : "none",
        has_refresh: !!(tk && tk.refresh_token_enc && tk.refresh_token_enc !== "__revoked__"),
      });
    }
    res.json({ ok: true, count: out.length, tenants: out });
  } catch (e) {
    next(e);
  }
});

/**
 * GET /auth/orders?slug=…|store_id=… — ops/debug: list a connected store's recent orders via the
 * Salla API (uses the stored token; also exercises token refresh). Gated by X-Cron-Secret.
 * Lets us discover real reference_ids for testing the customer portal.
 */
authRoutes.get("/orders", async (req: any, res, next) => {
  try {
    const provided = String(req.headers["x-cron-secret"] || "").trim();
    if (!provided || provided !== env.CRON_SECRET) throw new AppError(401, "Unauthorized", "UNAUTHORIZED");

    const slug = String(req.query.slug || "").trim();
    const storeId = String(req.query.store_id || "").trim();
    const tenant = storeId ? await TenantsRepo.findBySallaStoreId(req, storeId) : slug ? await TenantsRepo.findByPortalSlug(req, slug) : null;
    if (!tenant) throw new AppError(404, "Tenant not found", "TENANT_NOT_FOUND");

    // ?items_for=<orderId> → raw Salla line-item payload (verify price/category/sku fields).
    if (req.query.items_for) {
      const token = await SallaOAuthService.getValidAccessTokenForTenant(req, String(tenant.ROWID));
      const raw = await sallaFetchJson<any>(token, `/admin/v2/orders/items?order_id=${encodeURIComponent(String(req.query.items_for))}`);
      return res.json({ ok: true, store_id: tenant.salla_store_id, raw });
    }
    // ?raw=1 → full raw Salla order payloads (for aligning our types/mappers).
    if (String(req.query.raw || "") === "1") {
      const token = await SallaOAuthService.getValidAccessTokenForTenant(req, String(tenant.ROWID));
      const raw = await sallaFetchJson<any>(token, `/admin/v2/orders?per_page=${Number(req.query.per_page || 2)}`);
      return res.json({ ok: true, store_id: tenant.salla_store_id, raw });
    }
    const orders = await SallaOrdersService.listOrders(req, String(tenant.ROWID), Number(req.query.per_page || 10));
    res.json({
      ok: true,
      store_id: tenant.salla_store_id,
      count: orders.length,
      orders: orders.map((o) => ({
        id: o.id,
        reference_id: o.reference_id,
        status: o.status?.slug,
        total: o.amounts?.total,
        customer: o.customer?.email || o.customer?.mobile,
        created_at: o.created_at,
      })),
    });
  } catch (e) {
    next(e);
  }
});

/** GET /auth/store?slug=…|store_id=… — ops/debug: raw store profile (exact store id, name, domain). */
authRoutes.get("/store", async (req: any, res, next) => {
  try {
    const provided = String(req.headers["x-cron-secret"] || "").trim();
    if (!provided || provided !== env.CRON_SECRET) throw new AppError(401, "Unauthorized", "UNAUTHORIZED");
    const slug = String(req.query.slug || "").trim();
    const storeId = String(req.query.store_id || "").trim();
    const tenant = storeId ? await TenantsRepo.findBySallaStoreId(req, storeId) : slug ? await TenantsRepo.findByPortalSlug(req, slug) : null;
    if (!tenant) throw new AppError(404, "Tenant not found", "TENANT_NOT_FOUND");
    const token = await SallaOAuthService.getValidAccessTokenForTenant(req, String(tenant.ROWID));
    const raw = await sallaFetchJson<any>(token, "/admin/v2/store/info").catch((e) => ({ error: String(e?.message || e) }));
    res.json({ ok: true, tenant_store_id: tenant.salla_store_id, store_info: raw });
  } catch (e) {
    next(e);
  }
});

/** GET /auth/statuses?slug=…|store_id=… — ops/debug: the store's order statuses (incl. custom). */
authRoutes.get("/statuses", async (req: any, res, next) => {
  try {
    const provided = String(req.headers["x-cron-secret"] || "").trim();
    if (!provided || provided !== env.CRON_SECRET) throw new AppError(401, "Unauthorized", "UNAUTHORIZED");
    const slug = String(req.query.slug || "").trim();
    const storeId = String(req.query.store_id || "").trim();
    const tenant = storeId ? await TenantsRepo.findBySallaStoreId(req, storeId) : slug ? await TenantsRepo.findByPortalSlug(req, slug) : null;
    if (!tenant) throw new AppError(404, "Tenant not found", "TENANT_NOT_FOUND");
    const statuses = await SallaOrdersService.listOrderStatuses(req, String(tenant.ROWID));
    res.json({ ok: true, store_id: tenant.salla_store_id, count: statuses.length, statuses });
  } catch (e) {
    next(e);
  }
});

/**
 * GET /auth/probe?store_id=…&path=/admin/v2/… — ops/debug READ-ONLY Salla proxy. Gated by
 * X-Cron-Secret. Forces GET (never mutates the demo store) and only allows /admin/v2/* paths.
 * Used for Phase-0 capability discovery (transactions, coupons, shipments shapes).
 * ⚠️ PRE-PROD: remove together with the other /auth/* debug endpoints + DEV_DIRECT_LOGIN.
 */
authRoutes.get("/probe", async (req: any, res, next) => {
  try {
    const provided = String(req.headers["x-cron-secret"] || "").trim();
    if (!provided || provided !== env.CRON_SECRET) throw new AppError(401, "Unauthorized", "UNAUTHORIZED");

    const storeId = String(req.query.store_id || "").trim();
    const path = String(req.query.path || "").trim();
    if (!storeId) throw new AppError(400, "store_id required", "STORE_ID_REQUIRED");
    // Read-only guard: only GET, only the documented admin namespace, no traversal.
    if (!path.startsWith("/admin/v2/") || path.includes("..")) {
      throw new AppError(400, "path must start with /admin/v2/ (read-only probe)", "PATH_NOT_ALLOWED");
    }

    const tenant = await TenantsRepo.findBySallaStoreId(req, storeId);
    if (!tenant) throw new AppError(404, "Tenant not found", "TENANT_NOT_FOUND");
    const token = await SallaOAuthService.getValidAccessTokenForTenant(req, String(tenant.ROWID));
    const raw = await sallaFetchJson<any>(token, path).catch((e: any) => ({
      probe_error: true,
      status: e?.status ?? null,
      message: String(e?.message ?? e),
      response_text: e?.responseText ? String(e.responseText).slice(0, 2000) : null,
    }));
    res.json({ ok: true, store_id: storeId, path, raw });
  } catch (e) {
    next(e);
  }
});

/** GET /auth/install — kick off install (Easy Mode → install URL; Custom → authorize URL). */
authRoutes.get("/install", (_req, res) => {
  if (SallaOAuthService.mode() === "easy") return res.redirect(SallaOAuthService.buildInstallUrl());
  const params = new URLSearchParams({
    response_type: "code",
    client_id: env.SALLA_CLIENT_ID,
    redirect_uri: SallaOAuthService.resolveRedirectUri(),
  });
  if (env.SALLA_OAUTH_SCOPE) params.set("scope", env.SALLA_OAUTH_SCOPE);
  return res.redirect(`${env.SALLA_OAUTH_AUTHORIZE_URL}?${params.toString()}`);
});

/** GET /auth/callback — Custom Mode OAuth code exchange (Easy Mode tokens arrive via webhook). */
authRoutes.get("/callback", async (req: any, res) => {
  const dashboard = String(env.DASHBOARD_URL || env.APP_BASE_URL || "/").replace(/\/+$/, "");
  try {
    if (SallaOAuthService.mode() === "easy") return res.redirect(`${dashboard}/?oauth=easy`);

    const code = String(req.query.code || "").trim();
    if (!code) return res.redirect(`${dashboard}/?oauth=skipped`);

    const tok = await SallaOAuthService.exchangeCodeForToken(code, SallaOAuthService.resolveRedirectUri());
    const profile = await SallaOAuthService.fetchStoreProfile(tok.access_token).catch(() => null);
    const storeId = String(req.query.store_id || req.query.merchant || profile?.id || "").trim();
    if (!storeId) return res.redirect(`${dashboard}/?oauth=failed&reason=no_store_id`);

    const tenant = await TenantsRepo.ensureByStoreId(req, storeId, {
      store_name: profile?.name,
      store_domain: profile?.domain ?? null,
      status: "connected",
    });
    await SallaOAuthService.persistAuthorizeTokens(
      req,
      tenant.ROWID,
      { access_token: tok.access_token, refresh_token: tok.refresh_token, expires_in: tok.expires_in, scope: tok.scope },
      storeId
    );
    await SallaOAuthService.subscribeToWebhookEvents(req, tenant.ROWID, tok.access_token).catch(() => {});
    return res.redirect(`${dashboard}/?oauth=success&store_id=${encodeURIComponent(storeId)}`);
  } catch (err: any) {
    logger.error({ err: err?.message }, "oauth callback failed");
    return res.redirect(`${dashboard}/?oauth=failed`);
  }
});
