// appsail/src/middlewares/authPortal.ts
// Customer portal auth: validates the session token (hashed at rest), sets req.tenantId +
// req.portalSession. Expiry checked in Node (avoids ZCQL TZ pitfalls). Touch is throttled.
import type { Request, Response, NextFunction } from "express";
import { env } from "../env";
import { AppError } from "../lib/errors";
import { hashToken } from "../lib/crypto";
import { catalystDtAfter, nowCatalyst, parseCatalystDateTime } from "../lib/datetime";
import { PortalSessionsRepo } from "../repositories/portalSessions.repo";

function extractToken(req: Request): string {
  const hdr = String(req.headers.authorization || "");
  if (hdr.startsWith("Bearer ")) return hdr.slice(7).trim();
  const x = req.headers["x-portal-session"];
  return String(Array.isArray(x) ? x[0] : x || "").trim();
}

export async function authPortal(req: any, _res: Response, next: NextFunction): Promise<void> {
  try {
    const token = extractToken(req);
    if (!token) throw new AppError(401, "Unauthorized", "PORTAL_UNAUTHORIZED");

    const session = await PortalSessionsRepo.findByTokenHash(req, hashToken(token));
    if (!session) throw new AppError(401, "Unauthorized", "PORTAL_UNAUTHORIZED");
    if (!catalystDtAfter(session.expires_at, nowCatalyst())) throw new AppError(401, "Session expired", "PORTAL_SESSION_EXPIRED");

    req.tenantId = String(session.tenant_id);
    req.portalSession = session;

    const last = session.last_seen_at ? parseCatalystDateTime(session.last_seen_at) : NaN;
    if (!Number.isFinite(last) || Date.now() - last > env.PORTAL_SESSION_TOUCH_INTERVAL_SECONDS * 1000) {
      PortalSessionsRepo.touchLastSeen(req, session.ROWID).catch(() => {});
    }
    next();
  } catch (e) {
    next(e);
  }
}
