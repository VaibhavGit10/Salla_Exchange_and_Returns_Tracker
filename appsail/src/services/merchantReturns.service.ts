// appsail/src/services/merchantReturns.service.ts
// Merchant operations on returns: inbox, detail, item decisions, approve/reject/receive, and KPIs.
// resolve() (auto-execute via Salla) is added in P3 in sallaResolution.service + a thin wrapper here.
import { z } from "zod";
import { AppError } from "../lib/errors";
import { nowCatalyst, parseCatalystDateTime } from "../lib/datetime";
import { assertTransition } from "../lib/statusMachine";
import { ReturnRequestsRepo, ReturnRequestRow } from "../repositories/returnRequests.repo";
import { ReturnItemsRepo } from "../repositories/returnItems.repo";
import { ReturnAttachmentsRepo } from "../repositories/returnAttachments.repo";
import { ReturnOutcomesRepo } from "../repositories/returnOutcomes.repo";
import { ReturnShipmentsRepo } from "../repositories/returnShipments.repo";
import { AuditEventsRepo } from "../repositories/auditEvents.repo";
import { UsageMonthlyRepo } from "../repositories/usageMonthly.repo";
import { NotificationsService } from "./notifications";
import { SallaShipmentsService } from "./sallaShipments.service";
import { SallaResolutionService, ResolveArgs } from "./sallaResolution.service";
import { logger } from "../lib/logger";

function assertRowIdDigits(id: string | number): string {
  const v = String(id);
  if (!/^\d+$/.test(v)) throw new Error("ROWID/FK must be digits");
  return v;
}
function actorFrom(req: any, override?: string): { actor_type: string; actor_id: string | null } {
  return { actor_type: override ?? "merchant", actor_id: req?.merchantUserId ? String(req.merchantUserId) : req?.storeId ? `store:${req.storeId}` : null };
}
function snapshotOf(rr: ReturnRequestRow): any {
  try {
    return rr.policy_snapshot_json ? JSON.parse(rr.policy_snapshot_json) : {};
  } catch {
    return {};
  }
}
function customerEmailOf(rr: ReturnRequestRow): string | null {
  const e = snapshotOf(rr).email;
  return e ? String(e) : null;
}

const itemDecisionSchema = z.object({ return_item_id: z.string().min(1), decision: z.string().min(1), decision_reason: z.string().optional() });

export class MerchantReturnsService {
  static async getReturnWithItems(req: any, tenantId: string | number, returnNumber: string) {
    const tid = assertRowIdDigits(tenantId);
    const rr = await ReturnRequestsRepo.findByReturnNumber(req, tid, returnNumber);
    if (!rr) throw new AppError(404, "Return not found", "RETURN_NOT_FOUND");
    const items = await ReturnItemsRepo.listByReturnRequestId(req, tid, rr.ROWID);
    return { rr, items };
  }

  static async listInbox(req: any, tenantId: string | number, filters?: { status?: string; search?: string; limit?: number }) {
    const tid = assertRowIdDigits(tenantId);
    const rows = await ReturnRequestsRepo.listByTenant(req, tid, filters);
    return rows.map((r) => ({
      return_number: r.return_number,
      order_number: r.order_number,
      customer_name: snapshotOf(r).customer_name ?? null,
      status: r.status,
      requested_resolution: r.requested_resolution,
      requested_at: r.requested_at,
      resolved_at: r.resolved_at ?? null,
      total_items_count: Number(r.total_items_count ?? 0),
      total_request_value: r.total_request_value == null ? null : Number(r.total_request_value),
      is_warranty: Boolean(r.is_warranty),
    }));
  }

  static async getDetail(req: any, tenantId: string | number, returnNumber: string) {
    const tid = assertRowIdDigits(tenantId);
    const { rr, items } = await this.getReturnWithItems(req, tid, returnNumber);
    const [attachments, outcomes, shipment, timeline] = await Promise.all([
      ReturnAttachmentsRepo.listByReturnRequest(req, tid, rr.ROWID),
      ReturnOutcomesRepo.listByReturnRequest(req, tid, rr.ROWID),
      ReturnShipmentsRepo.findByReturnRequest(req, tid, rr.ROWID),
      AuditEventsRepo.listByEntity(req, tid, "return_requests", rr.ROWID),
    ]);
    const snap = snapshotOf(rr);
    return {
      return: {
        ...rr,
        bank_iban_enc: undefined, // never expose
        customer_email: customerEmailOf(rr),
        customer_name: snap.customer_name ?? null,
        order_date: snap.order_date ?? null,
        order_source: snap.order_source ?? null,
        receiver: snap.receiver ?? null,
      },
      items,
      attachments: attachments.map((a) => ({ filestore_path: a.filestore_path, content_type: a.content_type, file_size_bytes: a.file_size_bytes })),
      outcomes,
      shipment,
      timeline: timeline.map((t: any) => ({ event_type: t.event_type, actor_type: t.actor_type, event_time: t.event_time, meta: t.meta_json })),
    };
  }

  static async setItemDecisions(req: any, tenantId: string | number, returnNumber: string, decisions: Array<z.infer<typeof itemDecisionSchema>>) {
    const tid = assertRowIdDigits(tenantId);
    const { rr, items } = await this.getReturnWithItems(req, tid, returnNumber);
    const byId = new Map(items.map((it) => [String(it.ROWID), it]));
    const updates = decisions.map((d) => {
      if (!byId.has(String(d.return_item_id))) throw new AppError(400, "Invalid return_item_id for this return", "RETURN_ITEM_INVALID");
      return { ROWID: String(d.return_item_id), decision: String(d.decision), decision_reason: d.decision_reason ?? null };
    });
    await ReturnItemsRepo.bulkUpdate(req, updates, 5);
    await AuditEventsRepo.log(req, { tenant_id: tid, entity_type: "return_requests", entity_rowid: rr.ROWID, event_type: "return_items_updated", ...actorFrom(req), meta: { count: updates.length } });
    return this.getReturnWithItems(req, tid, returnNumber);
  }

  static async approve(req: any, tenantId: string | number, returnNumber: string, args?: { status_reason?: string; notes_internal?: string; actor_type?: string; items?: any[] }) {
    const tid = assertRowIdDigits(tenantId);
    const now = nowCatalyst();
    const { rr } = await this.getReturnWithItems(req, tid, returnNumber);
    assertTransition(rr.status, "approved");

    if (Array.isArray(args?.items)) {
      await this.setItemDecisions(req, tid, returnNumber, z.array(itemDecisionSchema).parse(args!.items));
    }

    await ReturnRequestsRepo.update(req, { ROWID: rr.ROWID, tenant_id: tid, status: "approved", status_reason: args?.status_reason ?? null, notes_internal: args?.notes_internal ?? rr.notes_internal ?? null, approved_at: now });
    await AuditEventsRepo.log(req, { tenant_id: tid, entity_type: "return_requests", entity_rowid: rr.ROWID, event_type: "return_approved", ...actorFrom(req, args?.actor_type), before: { status: rr.status }, after: { status: "approved" } });

    NotificationsService.onApproved(req, { toEmail: customerEmailOf(rr), returnNumber: rr.return_number, orderNumber: rr.order_number, storeName: req?.tenant?.store_name, instructions: args?.status_reason }).catch((err) => logger.error({ err: (err as any)?.message }, "approve notify failed"));

    // Reverse logistics: create a return shipment (auto AWB if a carrier is configured, else manual).
    SallaShipmentsService.ensureOnApproval(req, tid, { ROWID: rr.ROWID, order_id_external: rr.order_id_external, order_number: rr.order_number }).catch((err) => logger.warn({ err: (err as any)?.message }, "shipment ensure failed"));

    return this.getReturnWithItems(req, tid, returnNumber);
  }

  /** Resolve = auto-execute the chosen outcome via Salla (refund/exchange/store credit). */
  static async resolve(req: any, tenantId: string | number, returnNumber: string, args: ResolveArgs) {
    return SallaResolutionService.resolve(req, tenantId, returnNumber, { ...args, actor_id: req?.merchantUserId ?? (req?.storeId ? `store:${req.storeId}` : null) });
  }

  static async reject(req: any, tenantId: string | number, returnNumber: string, args?: { status_reason?: string; notes_internal?: string }) {
    const tid = assertRowIdDigits(tenantId);
    const now = nowCatalyst();
    const { rr } = await this.getReturnWithItems(req, tid, returnNumber);
    assertTransition(rr.status, "rejected");
    if (!args?.status_reason) throw new AppError(400, "A rejection reason is required", "REJECT_REASON_REQUIRED");

    await ReturnRequestsRepo.update(req, { ROWID: rr.ROWID, tenant_id: tid, status: "rejected", status_reason: args.status_reason, notes_internal: args?.notes_internal ?? rr.notes_internal ?? null, resolved_at: now });
    await AuditEventsRepo.log(req, { tenant_id: tid, entity_type: "return_requests", entity_rowid: rr.ROWID, event_type: "return_rejected", ...actorFrom(req), before: { status: rr.status }, after: { status: "rejected", reason: args.status_reason } });

    NotificationsService.onRejected(req, { toEmail: customerEmailOf(rr), returnNumber: rr.return_number, orderNumber: rr.order_number, storeName: req?.tenant?.store_name, reason: args.status_reason }).catch((err) => logger.error({ err: (err as any)?.message }, "reject notify failed"));

    return this.getReturnWithItems(req, tid, returnNumber);
  }

  static async markReceived(req: any, tenantId: string | number, returnNumber: string, args?: { status_reason?: string; notes_internal?: string }) {
    const tid = assertRowIdDigits(tenantId);
    const now = nowCatalyst();
    const { rr } = await this.getReturnWithItems(req, tid, returnNumber);
    assertTransition(rr.status, "received");

    await ReturnRequestsRepo.update(req, { ROWID: rr.ROWID, tenant_id: tid, status: "received", status_reason: args?.status_reason ?? rr.status_reason ?? null, notes_internal: args?.notes_internal ?? rr.notes_internal ?? null, received_at: now });
    await AuditEventsRepo.log(req, { tenant_id: tid, entity_type: "return_requests", entity_rowid: rr.ROWID, event_type: "return_received", ...actorFrom(req), before: { status: rr.status }, after: { status: "received" } });

    NotificationsService.onReceived(req, { toEmail: customerEmailOf(rr), returnNumber: rr.return_number, storeName: req?.tenant?.store_name }).catch(() => {});
    return this.getReturnWithItems(req, tid, returnNumber);
  }

  /** Real KPIs — status breakdown from rows, totals/automation from usage_monthly (survives 200-row cap). */
  static async computeKpis(req: any, tenantId: string | number) {
    const tid = assertRowIdDigits(tenantId);
    const [rows, usage] = await Promise.all([ReturnRequestsRepo.listByTenant(req, tid, { limit: 200 }), UsageMonthlyRepo.getForMonth(req, tid)]);

    let awaiting = 0, inTransit = 0, resolved = 0, exchanges = 0, refundValue = 0, creditValue = 0, resTimeMs = 0, resCount = 0;
    for (const r of rows) {
      const s = String(r.status).toLowerCase();
      if (s === "requested") awaiting++;
      if (s === "approved" || s === "in_transit") inTransit++;
      if (s === "resolved") {
        resolved++;
        const v = Number(r.total_request_value ?? 0);
        if (r.exchange_order_id_external) exchanges++;
        else if (r.store_credit_ref_external) creditValue += v;
        else if (r.refund_transaction_id_external) refundValue += v;
        const a = parseCatalystDateTime(r.requested_at);
        const b = parseCatalystDateTime(r.resolved_at);
        if (Number.isFinite(a) && Number.isFinite(b) && b > a) { resTimeMs += b - a; resCount++; }
      }
    }

    const monthCreated = Number(usage?.returns_created ?? 0);
    const monthAuto = Number(usage?.auto_approved_count ?? 0);

    return {
      awaiting_action: awaiting,
      in_transit: inTransit,
      resolved_recent: resolved,
      sample_size: rows.length,
      this_month: { returns_created: monthCreated, auto_approved: monthAuto, automation_pct: monthCreated > 0 ? Math.round((monthAuto / monthCreated) * 100) : 0 },
      retention: { exchanges, store_credit_value: Math.round(creditValue), cash_refunded_value: Math.round(refundValue) },
      avg_resolution_hours: resCount > 0 ? Math.round(resTimeMs / resCount / 3_600_000) : 0,
    };
  }
}
