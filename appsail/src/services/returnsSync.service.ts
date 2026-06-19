// appsail/src/services/returnsSync.service.ts
// Reconciles return state from Salla order webhooks (authoritative external events).
//   order.cancelled → auto-reject still-pending (requested) returns for that order
//   order.refunded  → mark active returns resolved (refund recorded in the outcomes ledger)
//   order.shipment.created / order.updated → logged (window basis); no state change
import { nowCatalyst } from "../lib/datetime";
import { logger } from "../lib/logger";
import { ReturnRequestsRepo, ReturnRequestRow } from "../repositories/returnRequests.repo";
import { ReturnOutcomesRepo } from "../repositories/returnOutcomes.repo";
import { AuditEventsRepo } from "../repositories/auditEvents.repo";

export type OrderEventType = "order.cancelled" | "order.refunded" | "order.shipment.created" | "order.updated" | string;

function orderRefOf(event: any): string | null {
  const v = event?.data?.reference_id ?? event?.data?.order?.reference_id ?? event?.data?.id ?? event?.data?.order_id;
  const s = v == null ? "" : String(v).trim();
  return s || null;
}
function orderIdOf(event: any): string | null {
  const v = event?.data?.id ?? event?.data?.order_id ?? event?.data?.order?.id;
  const s = v == null ? "" : String(v).trim();
  return s || null;
}

export class ReturnsSync {
  static async onOrderEvent(req: any, tenantId: string, eventType: OrderEventType, event: any): Promise<void> {
    const orderRef = orderRefOf(event);
    const orderId = orderIdOf(event);
    if (!orderRef && !orderId) return;

    const slug = String(event?.data?.status?.slug || "").toLowerCase();
    const isCancelled = eventType === "order.cancelled" || slug === "canceled" || slug === "cancelled";
    const isRefunded = eventType === "order.refunded" || slug === "refunded";

    // Salla often signals a cancel/refund as an `order.updated` / `order.status.updated` with the
    // new status.slug rather than a dedicated event — reconcile on the slug too.
    if (isCancelled) return this.onCancelled(req, tenantId, orderRef, orderId, event);
    if (isRefunded) return this.onRefunded(req, tenantId, orderRef, orderId, event);
    logger.debug({ tenantId, eventType, slug, orderRef }, "order event logged (no state change)");
  }

  private static async matchingReturns(req: any, tenantId: string, orderRef: string | null, orderId: string | null): Promise<ReturnRequestRow[]> {
    const rows = orderRef ? await ReturnRequestsRepo.listByOrderNumber(req, tenantId, orderRef).catch(() => []) : [];
    if (rows.length) return rows;
    // Fallback: scan recent tenant returns and match by external order id.
    if (orderId) {
      const recent = await ReturnRequestsRepo.listByTenant(req, tenantId, { limit: 200 }).catch(() => []);
      return recent.filter((r) => String(r.order_id_external ?? "") === orderId);
    }
    return [];
  }

  private static async onCancelled(req: any, tenantId: string, orderRef: string | null, orderId: string | null, _event: any): Promise<void> {
    const rows = (await this.matchingReturns(req, tenantId, orderRef, orderId)).filter((r) => String(r.status).toLowerCase() === "requested");
    const now = nowCatalyst();
    for (const r of rows) {
      await ReturnRequestsRepo.update(req, { ROWID: r.ROWID, tenant_id: tenantId, status: "rejected", status_reason: "Order cancelled", resolved_at: now }).catch((e) => logger.error({ err: (e as any)?.message, rid: r.ROWID }, "auto-reject failed"));
      await AuditEventsRepo.log(req, { tenant_id: tenantId, entity_type: "return_requests", entity_rowid: r.ROWID, event_type: "return_auto_rejected", actor_type: "system", after: { reason: "order.cancelled" } });
    }
    logger.info({ tenantId, orderRef, rejected: rows.length }, "order.cancelled reconciled");
  }

  private static async onRefunded(req: any, tenantId: string, orderRef: string | null, orderId: string | null, event: any): Promise<void> {
    const active = ["requested", "approved", "in_transit", "received"];
    const rows = (await this.matchingReturns(req, tenantId, orderRef, orderId)).filter((r) => active.includes(String(r.status).toLowerCase()));
    const now = nowCatalyst();
    const refundRef = event?.data?.refund_id ? String(event.data.refund_id) : event?.data?.id ? String(event.data.id) : null;
    for (const r of rows) {
      await ReturnRequestsRepo.update(req, { ROWID: r.ROWID, tenant_id: tenantId, status: "resolved", status_reason: "Refund issued in Salla", resolved_at: now, refund_transaction_id_external: refundRef }).catch((e) => logger.error({ err: (e as any)?.message, rid: r.ROWID }, "refund sync failed"));
      await ReturnOutcomesRepo.insert(req, { tenant_id: tenantId, return_request_id: r.ROWID, outcome_type: "refund", outcome_amount: Number(r.total_request_value ?? 0), status: "completed" })
        .then((o: any) => ReturnOutcomesRepo.update(req, String(o?.ROWID ?? ""), { completed_at: now, reference_id_external: refundRef, raw_provider_response_json: JSON.stringify({ source: "order.refunded" }) }))
        .catch(() => {});
      await AuditEventsRepo.log(req, { tenant_id: tenantId, entity_type: "return_requests", entity_rowid: r.ROWID, event_type: "return_resolved", actor_type: "system", after: { resolution_type: "refund", source: "order.refunded", reference: refundRef } });
    }
    logger.info({ tenantId, orderRef, resolved: rows.length }, "order.refunded reconciled");
  }
}
