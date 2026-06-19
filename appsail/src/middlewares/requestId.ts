// appsail/src/middlewares/requestId.ts
// Tag every request with a stable id (echoes an inbound X-Request-Id if present) for tracing.
import type { Request, Response, NextFunction } from "express";
import crypto from "crypto";

export function requestId(req: Request, res: Response, next: NextFunction): void {
  const incoming = String((req.headers["x-request-id"] as string) || "").trim();
  const id = incoming || crypto.randomUUID();
  (req as any).requestId = id;
  res.setHeader("X-Request-Id", id);
  next();
}
