// appsail/src/index.ts — AppSail entrypoint.
// Load .env FIRST (local dev only; in production Catalyst injects env_variables and dotenv
// never overrides already-set vars). Must run before any module that reads env at import time.
import "dotenv/config";
import { app } from "./app";
import { logger } from "./lib/logger";

const portStr = process.env.X_ZOHO_CATALYST_LISTEN_PORT?.trim() || process.env.PORT?.trim() || "9000";
const port = Number.parseInt(portStr, 10);
if (!Number.isFinite(port) || port <= 0) throw new Error(`Invalid port: "${portStr}"`);

app.listen(port, "0.0.0.0", () => {
  logger.info({ port }, "Salla Returns v2 AppSail listening");
});
