// appsail/src/routes/cron.routes.ts
// Maintenance jobs, protected by X-Cron-Secret. Wire to Catalyst Cron (or call manually).
//   /cron/cleanup-sessions  — delete expired portal/otp sessions
//   /cron/purge-attachments — soft-delete return images older than ATTACHMENT_RETENTION_DAYS (PDPL)
//   /cron/refresh-tokens    — proactively refresh Salla tokens nearing expiry
import { Router } from "express";
import { env } from "../env";
import { AppError } from "../lib/errors";
import { logger } from "../lib/logger";
import { getCatalystApp } from "../lib/catalyst";
import { nowCatalyst, catalystDateTimeDaysAgo } from "../lib/datetime";

export const cronRoutes = Router();

cronRoutes.use((req: any, _res, next) => {
  const provided = String(req.headers["x-cron-secret"] || "").trim();
  if (!provided || provided !== env.CRON_SECRET) return next(new AppError(401, "Unauthorized", "CRON_UNAUTHORIZED"));
  next();
});

function q(value: string): string {
  return `'${String(value).replace(/'/g, "''")}'`;
}

async function deleteExpired(req: any, table: string, before: string): Promise<number> {
  const app = getCatalystApp(req);
  const res = await app.zcql().executeZCQLQuery(`SELECT ROWID FROM ${table} WHERE expires_at < ${q(before)} LIMIT 200`);
  const ids = (res ?? []).map((r: any) => String(r[table]?.ROWID ?? r.ROWID)).filter(Boolean);
  const t = app.datastore().table(table);
  let n = 0;
  for (const id of ids) {
    await t.deleteRow(id as any).then(() => n++).catch(() => {});
  }
  return n;
}

cronRoutes.post("/cleanup-sessions", async (req: any, res, next) => {
  try {
    const now = nowCatalyst();
    const portal = await deleteExpired(req, "portal_sessions", now);
    const otp = await deleteExpired(req, "otp_sessions", now);
    logger.info({ portal, otp }, "cron cleanup-sessions");
    res.json({ ok: true, deleted: { portal_sessions: portal, otp_sessions: otp } });
  } catch (e) {
    next(e);
  }
});

cronRoutes.post("/purge-attachments", async (req: any, res, next) => {
  try {
    const cutoff = catalystDateTimeDaysAgo(env.ATTACHMENT_RETENTION_DAYS);
    const app = getCatalystApp(req);
    const rows = await app
      .zcql()
      .executeZCQLQuery(`SELECT ROWID FROM return_attachments WHERE CREATEDTIME < ${q(cutoff)} AND is_deleted = false LIMIT 200`);
    const t = app.datastore().table("return_attachments");
    let n = 0;
    for (const r of rows ?? []) {
      const id = String((r as any).return_attachments?.ROWID ?? (r as any).ROWID);
      await t.updateRow({ ROWID: id, is_deleted: true, deleted_at: nowCatalyst() }).then(() => n++).catch(() => {});
    }
    logger.info({ purged: n, cutoff }, "cron purge-attachments");
    res.json({ ok: true, purged: n });
  } catch (e) {
    next(e);
  }
});

cronRoutes.post("/refresh-tokens", async (req: any, res, next) => {
  try {
    // Lazy import to keep cron independent of the OAuth service's load order.
    const { SallaOAuthService } = await import("../services/sallaOAuth.service");
    const app = getCatalystApp(req);
    const rows = await app
      .zcql()
      .executeZCQLQuery(`SELECT tenant_id FROM salla_oauth_tokens WHERE token_status = 'active' LIMIT 200`);
    let refreshed = 0;
    for (const r of rows ?? []) {
      const tid = String((r as any).salla_oauth_tokens?.tenant_id ?? (r as any).tenant_id);
      if (!/^\d+$/.test(tid)) continue;
      await SallaOAuthService.getValidAccessTokenForTenant(req, tid).then(() => refreshed++).catch(() => {});
    }
    logger.info({ checked: (rows ?? []).length, refreshed }, "cron refresh-tokens");
    res.json({ ok: true, refreshed });
  } catch (e) {
    next(e);
  }
});
