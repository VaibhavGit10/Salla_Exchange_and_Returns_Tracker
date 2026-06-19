// appsail/src/middlewares/authEmbedded.ts
// Merchant auth for the embedded console. The store identity comes ONLY from the signed session
// (minted after Salla introspection) — never from the client. We derive req.tenantId from it and
// force-overwrite any store_id/tenant the client tried to send. This is the core of tenant isolation.
import type { Request, Response, NextFunction } from "express";
import { verifySession } from "../lib/session";
import { TenantsRepo } from "../repositories/tenants.repo";
import { AppError } from "../lib/errors";

export async function authEmbedded(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const header = String(req.headers["authorization"] || "").trim();
    const match = /^Bearer\s+(.+)$/i.exec(header);
    const payload = match ? verifySession(match[1]) : null;
    if (!payload) throw new AppError(401, "Unauthorized", "MERCHANT_UNAUTHORIZED");

    const storeId = String(payload.store_id);
    const tenant = await TenantsRepo.ensureByStoreId(req, storeId);

    (req as any).storeId = storeId;
    (req as any).tenantId = String(tenant.ROWID);
    (req as any).tenant = tenant;
    (req as any).merchantUserId = payload.user_id || null;

    // Force the verified identity onto the request; a merchant can never act on another store.
    if (req.query && typeof req.query === "object") (req.query as any).store_id = storeId;
    if (req.body && typeof req.body === "object") (req.body as any).store_id = storeId;
    if (req.params && "store_id" in (req.params as any)) (req.params as any).store_id = storeId;

    next();
  } catch (e) {
    next(e);
  }
}
