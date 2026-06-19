// appsail/src/routes/dev.routes.ts
// DEV-ONLY tools (sample data). 404s unless DEV_DIRECT_LOGIN === "true" — never active in production.
// Scoped to the DEV_DIRECT_STORE_ID tenant (the same store dev-login signs into).
import { Router } from "express";
import { env } from "../env";
import { AppError } from "../lib/errors";
import { TenantsRepo } from "../repositories/tenants.repo";
import { SeedService } from "../services/seed.service";

export const devRoutes = Router();

devRoutes.use((_req, _res, next) => {
  if (env.DEV_DIRECT_LOGIN !== "true" || !env.DEV_DIRECT_STORE_ID) return next(new AppError(404, "Not found", "NOT_FOUND"));
  next();
});

async function devTenantId(req: any): Promise<string> {
  const tenant = await TenantsRepo.ensureByStoreId(req, String(env.DEV_DIRECT_STORE_ID), { store_name: "Dev Store", status: "connected" });
  return String(tenant.ROWID);
}

devRoutes.post("/seed", async (req, res, next) => {
  try {
    const result = await SeedService.seed(req, await devTenantId(req));
    res.json({ ok: true, ...result });
  } catch (e) {
    next(e);
  }
});

devRoutes.post("/unseed", async (req, res, next) => {
  try {
    const removed = await SeedService.unseed(req, await devTenantId(req));
    res.json({ ok: true, removed });
  } catch (e) {
    next(e);
  }
});

/** POST /dev/reset — delete ALL returns for the dev store (clean slate; not just seeded rows). */
devRoutes.post("/reset", async (req, res, next) => {
  try {
    const purged = await SeedService.purgeAll(req, await devTenantId(req));
    res.json({ ok: true, purged });
  } catch (e) {
    next(e);
  }
});
