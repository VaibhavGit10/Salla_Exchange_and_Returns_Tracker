// appsail/src/routes/health.routes.ts
// GET /health — liveness + DataStore connectivity (used by uptime checks and deploy smoke tests).
import { Router } from "express";
import { getCatalystApp } from "../lib/catalyst";
import { nowCatalyst } from "../lib/datetime";

export const healthRoutes = Router();

healthRoutes.get("/", async (req: any, res) => {
  const out: any = { status: "healthy", timestamp: nowCatalyst(), version: "2.0.0", services: { datastore: "unknown" } };
  try {
    await getCatalystApp(req).zcql().executeZCQLQuery("SELECT ROWID FROM tenants LIMIT 1");
    out.services.datastore = "healthy";
  } catch {
    out.services.datastore = "unreachable";
    out.status = "degraded";
  }
  res.status(out.status === "healthy" ? 200 : 503).json(out);
});
