// appsail/src/app.ts
// Express app wiring: security headers, CORS (Catalyst ZGS-aware), raw-body capture for webhook
// HMAC, route mounts, and centralized error handling.
import express, { type Request, type Response, type NextFunction } from "express";
import helmet from "helmet";

import { requestId } from "./middlewares/requestId";
import { logger } from "./lib/logger";
import { AppError } from "./lib/errors";
import { env, isProd } from "./env";

import { healthRoutes } from "./routes/health.routes";
import { authRoutes } from "./routes/auth.routes";
import { webhooksRoutes } from "./routes/webhooks.routes";
import { portalRoutes } from "./routes/portal.routes";
import { merchantRoutes } from "./routes/merchant.routes";
import { snippetRoutes } from "./routes/snippet.routes";
import { cronRoutes } from "./routes/cron.routes";
import { devRoutes } from "./routes/dev.routes";

function rawBodySaver(req: any, _res: any, buf: Buffer) {
  if (buf?.length) req.rawBody = buf;
}

export const app = express();

app.disable("x-powered-by");
app.use(
  helmet({
    // App runs inside the Salla dashboard iframe → must allow framing by Salla.
    frameguard: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
    crossOriginOpenerPolicy: false,
    contentSecurityPolicy: false,
  })
);

const allowedOrigins = String(env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// CORS — Catalyst ZGS sets Allow-Origin/Allow-Credentials; we only add the headers it doesn't.
app.use((req, res, next) => {
  const origin = req.headers.origin as string | undefined;
  if (!origin) return next();
  const allowed = allowedOrigins.length === 0 || allowedOrigins.includes(origin);
  if (!allowed) return next(new AppError(403, "CORS not allowed", "CORS_NOT_ALLOWED"));
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Request-Id, X-Portal-Session");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  if (req.method === "OPTIONS") return res.status(204).end();
  next();
});

app.use(requestId);
app.set("json replacer", (_k: string, v: unknown) => (typeof v === "bigint" ? (v as bigint).toString() : v));

// Webhook routes need the raw body for HMAC — capture it before JSON parsing.
app.use("/webhooks", express.json({ limit: "2mb", verify: rawBodySaver }));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

app.use("/health", healthRoutes);
app.use("/auth", authRoutes);
app.use("/webhooks", webhooksRoutes);
app.use("/portal", portalRoutes);
app.use("/merchant", merchantRoutes);
app.use("/snippet", snippetRoutes);
app.use("/cron", cronRoutes);
app.use("/dev", devRoutes);

app.get("/", (_req: Request, res: Response) => {
  res.json({ ok: true, service: "returnxchange-appsail", routes: ["/health", "/auth", "/webhooks", "/portal", "/merchant", "/snippet", "/cron", "/dev"] });
});

app.use((_req: Request, _res: Response, next: NextFunction) => next(new AppError(404, "Not found", "NOT_FOUND")));

// Centralized error handler — never leaks internals in production.
app.use((err: any, req: any, res: any, _next: NextFunction) => {
  const status = err instanceof AppError ? err.status : 500;
  logger.error(
    {
      requestId: req?.requestId,
      status,
      code: err?.code || "UNHANDLED",
      msg: err?.message || "Unhandled error",
      stack: status === 500 ? err?.stack : undefined,
      path: req?.path,
      method: req?.method,
    },
    "request_failed"
  );
  if (res.headersSent) return;
  res.status(status).json({
    ok: false,
    request_id: req?.requestId,
    code: err?.code || "INTERNAL",
    error: status === 500 && isProd ? "Internal error" : err?.message,
    ...(err instanceof AppError && err.details ? { details: err.details } : {}),
  });
});
