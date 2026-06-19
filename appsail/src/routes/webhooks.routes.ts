// appsail/src/routes/webhooks.routes.ts
// POST /webhooks/salla — verify HMAC on the RAW body, dedup via idempotency_key, then process.
// Successfully-processed events are deduped; pending/failed events are reprocessed on Salla's retry
// (Salla retries 3x at ~5-min intervals on non-2xx).
import { Router } from "express";
import { createHash } from "crypto";
import { env } from "../env";
import { AppError } from "../lib/errors";
import { logger } from "../lib/logger";
import { extractSallaSignature, verifyWebhookSignature } from "../security/signature";
import { WebhookEventsRepo } from "../repositories/webhookEvents.repo";
import { TenantsRepo } from "../repositories/tenants.repo";
import { handleSallaWebhook } from "../services/webhooks.service";

export const webhooksRoutes = Router();

function getRawBody(req: any): Buffer {
  if (req?.rawBody && Buffer.isBuffer(req.rawBody)) return req.rawBody;
  return Buffer.from(JSON.stringify(req.body ?? {}), "utf8");
}
function eventTypeOf(body: any): string {
  return String(body?.event ?? body?.type ?? body?.action ?? "unknown").trim();
}
function storeIdOf(body: any): string | null {
  const v = body?.merchant ?? body?.store_id ?? body?.data?.merchant ?? body?.data?.store_id ?? body?.data?.store?.id;
  const s = v == null ? "" : String(v).trim();
  return s || null;
}
function externalIdOf(body: any, rawBody: Buffer): string {
  const v = body?.id ?? body?.event_id ?? body?.data?.id ?? body?.data?.event_id;
  const s = v == null ? "" : String(v).trim();
  if (s) return s;
  // No natural id → derive a stable one from the raw payload so retries dedup consistently.
  return createHash("sha1").update(rawBody).digest("hex");
}

webhooksRoutes.post("/salla", async (req: any, res, next) => {
  try {
    const rawBody = getRawBody(req);
    const signature = extractSallaSignature(req);
    if (!signature) throw new AppError(401, "Missing webhook signature", "WEBHOOK_SIGNATURE_MISSING");
    if (!verifyWebhookSignature({ rawBody, signature, secret: env.SALLA_WEBHOOK_SECRET })) {
      throw new AppError(401, "Invalid webhook signature", "WEBHOOK_SIGNATURE_INVALID");
    }

    const body = req.body ?? {};
    const eventType = eventTypeOf(body);
    const storeId = storeIdOf(body);
    const externalId = externalIdOf(body, rawBody);
    const idempotencyKey = WebhookEventsRepo.makeIdempotencyKey(storeId, eventType, externalId);

    // Dedup: only skip events we ALREADY processed successfully.
    const existing = await WebhookEventsRepo.findByIdempotencyKey(req, idempotencyKey).catch(() => null);
    if (existing && existing.process_status === "processed") {
      return res.status(200).json({ ok: true, deduplicated: true });
    }

    const tenant = storeId ? await TenantsRepo.findBySallaStoreId(req, storeId).catch(() => null) : null;

    let rowId: string | null = existing?.ROWID ?? null;
    if (!rowId) {
      const inserted = await WebhookEventsRepo.insertPending(req, {
        tenant_id: tenant?.ROWID ?? null,
        event_type: eventType,
        event_id_external: externalId,
        idempotency_key: idempotencyKey,
        signature_valid: true,
        payload_json: JSON.stringify(body),
      });
      rowId = inserted ? String(inserted.ROWID) : null;
    }

    // Process. Heavy/slow sub-tasks (store-profile sync, webhook subscribe) are detached inside the
    // handler, so this stays well under Salla's response timeout.
    try {
      const result = await handleSallaWebhook(req, body);
      if (rowId) await WebhookEventsRepo.markProcessed(req, rowId, "processed", undefined);
      if (!tenant) logger.warn({ eventType, storeId, handled: result.handled }, "webhook tenant not resolved");
      return res.status(200).json({ ok: true });
    } catch (procErr: any) {
      if (rowId) await WebhookEventsRepo.markProcessed(req, rowId, "failed", procErr?.message);
      logger.error({ err: procErr?.message, eventType, storeId }, "webhook processing failed");
      // 500 → Salla retries; the stored event is 'failed' so it is NOT dedup-skipped on retry.
      return res.status(500).json({ ok: false, code: "WEBHOOK_PROCESSING_FAILED" });
    }
  } catch (e) {
    next(e);
  }
});
