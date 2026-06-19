// appsail/src/services/returns.service.ts
// Customer-facing return lifecycle: create (with eligibility + auto-approval), list, detail, cancel.
import crypto from "crypto";
import { AppError } from "../lib/errors";
import { nowCatalyst } from "../lib/datetime";
import { encryptOptional } from "../lib/crypto";
import { maskEmail, normalizeEmail } from "../security/pii";
import { logger } from "../lib/logger";
import { ReturnRequestsRepo } from "../repositories/returnRequests.repo";
import { ReturnItemsRepo } from "../repositories/returnItems.repo";
import { ReturnOutcomesRepo } from "../repositories/returnOutcomes.repo";
import { ReturnShipmentsRepo } from "../repositories/returnShipments.repo";
import { ReturnAttachmentsRepo } from "../repositories/returnAttachments.repo";
import { AuditEventsRepo } from "../repositories/auditEvents.repo";
import { UsageMonthlyRepo } from "../repositories/usageMonthly.repo";
import { RulesService } from "./rules.service";
import { MerchantReturnsService } from "./merchantReturns.service";
import { orderCustomerName, orderCreatedAt, orderSource, orderReceiver } from "./sallaOrders.service";

function assertRowIdDigits(id: string | number): string {
  const v = String(id);
  if (!/^\d+$/.test(v)) throw new Error("ROWID/FK must be digits");
  return v;
}

function generateReturnNumber(): string {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  return `RMA-${ymd}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
}

export type CreateReturnItem = {
  order_item_id_external?: string;
  sku: string;
  product_name?: string;
  variant_name?: string;
  category_id_external?: string;
  category_name?: string;
  quantity: number;
  unit_price?: number;
  reason_code: string;
  reason_note?: string;
  exchange_variant_id?: string;
};

export type CreateReturnPayload = {
  requested_resolution: "refund" | "exchange" | "store_credit";
  notes_customer?: string;
  order_id_external?: string;
  is_warranty?: boolean;
  customer_email?: string;
  bank_iban?: string; // COD refund
  items: CreateReturnItem[];
};

export class ReturnsService {
  static async createPortalReturn(req: any, payload: CreateReturnPayload) {
    const tenantId = assertRowIdDigits(req.tenantId);
    const session = req.portalSession;
    if (!session?.order_number || !session?.contact_hash) throw new AppError(401, "Unauthorized", "PORTAL_UNAUTHORIZED");

    const orderNumber = String(session.order_number);
    const contactHash = String(session.contact_hash);

    // Re-validate eligibility server-side when we can resolve the order; also capture order meta.
    let elOrder: any = null;
    if (payload.order_id_external) {
      const elig = await RulesService.evaluateEligibility(
        req,
        tenantId,
        payload.order_id_external,
        payload.items.map((i) => ({ order_item_id_external: i.order_item_id_external, sku: i.sku, quantity: i.quantity, category_name: i.category_name, category_id: i.category_id_external }))
      ).catch((err) => {
        logger.warn({ err: (err as any)?.message }, "eligibility check failed; proceeding to manual review");
        return null;
      });
      if (elig && !elig.eligible) {
        throw new AppError(422, "Return is not eligible", "RETURN_INELIGIBLE", elig.ineligible_items);
      }
      elOrder = elig?.order ?? null;
    }

    const totalItems = payload.items.reduce((s, it) => s + (it.quantity || 0), 0);
    const totalValue = payload.items.reduce((s, it) => s + (typeof it.unit_price === "number" ? it.unit_price : 0) * (it.quantity || 0), 0);

    let returnNumber = generateReturnNumber();
    for (let i = 0; i < 3; i++) {
      if (!(await ReturnRequestsRepo.findByReturnNumber(req, tenantId, returnNumber))) break;
      returnNumber = generateReturnNumber();
    }

    const now = nowCatalyst();
    const email = payload.customer_email ? normalizeEmail(payload.customer_email) : null;

    let inserted: any;
    try {
      inserted = await ReturnRequestsRepo.insert(req, {
        tenant_id: tenantId,
        return_number: returnNumber,
        order_number: orderNumber,
        order_id_external: payload.order_id_external ?? null,
        customer_contact_masked: email ? maskEmail(email) : null,
        customer_contact_hash: contactHash,
        requested_resolution: payload.requested_resolution,
        status: "requested",
        requested_at: now,
        // bank_iban_enc + exchange variants live in policy_snapshot_json until those columns are
        // added to DataStore (see DATASTORE_SCHEMA.md). This keeps inserts valid on the live schema.
        policy_snapshot_json: JSON.stringify({
          email: email ?? undefined,
          bank_iban_enc: encryptOptional(payload.bank_iban) ?? undefined,
          customer_name: elOrder ? orderCustomerName(elOrder) ?? undefined : undefined,
          order_date: elOrder ? orderCreatedAt(elOrder) ?? undefined : undefined,
          order_source: elOrder ? orderSource(elOrder) ?? undefined : undefined,
          receiver: elOrder ? orderReceiver(elOrder) ?? undefined : undefined,
          exchange_variants: payload.items.filter((i) => i.exchange_variant_id).map((i) => ({ sku: i.sku, variant: i.exchange_variant_id })),
        }),
        notes_customer: payload.notes_customer ?? null,
        total_items_count: totalItems,
        total_request_value: totalValue,
        is_warranty: Boolean(payload.is_warranty),
      });
    } catch (e: any) {
      throw new AppError(500, "Failed to create return request", "RETURN_CREATE_FAILED", e?.message);
    }

    const returnRequestId = assertRowIdDigits(inserted?.ROWID);

    try {
      await ReturnItemsRepo.bulkInsert(
        req,
        payload.items.map((it) => ({
          tenant_id: tenantId,
          return_request_id: returnRequestId,
          order_item_id_external: it.order_item_id_external ?? null,
          sku: it.sku,
          product_name: it.product_name ?? null,
          variant_name: it.variant_name ?? null,
          category_id_external: it.category_id_external ?? null,
          quantity: it.quantity,
          unit_price: typeof it.unit_price === "number" ? it.unit_price : null,
          reason_code: it.reason_code,
          reason_note: it.reason_note ?? null,
          decision: "pending",
        })),
        5
      );
    } catch (e: any) {
      await ReturnItemsRepo.deleteByReturnRequestId(req, tenantId, returnRequestId).catch(() => {});
      await ReturnRequestsRepo.deleteById(req, returnRequestId).catch(() => {});
      throw new AppError(500, "Failed to create return items", "RETURN_ITEMS_CREATE_FAILED", e?.message);
    }

    await AuditEventsRepo.log(req, {
      tenant_id: tenantId,
      entity_type: "return_requests",
      entity_rowid: returnRequestId,
      event_type: "return_requested",
      actor_type: "customer",
      after: { return_number: returnNumber, order_number: orderNumber, total_items_count: totalItems, total_request_value: totalValue },
    });

    UsageMonthlyRepo.increment(req, tenantId, "returns_created").catch((err) => logger.warn({ err: (err as any)?.message }, "usage increment failed"));

    // Auto-approval (fire-and-forget; never block the customer response).
    RulesService.evaluateAutoApproval(req, tenantId, { total_request_value: totalValue, reason_codes: payload.items.map((i) => i.reason_code) })
      .then(async (auto) => {
        if (!auto) return;
        await MerchantReturnsService.approve(req, tenantId, returnNumber, { status_reason: "Auto-approved by rules", actor_type: "system" }).catch((err) => logger.warn({ err: (err as any)?.message, returnNumber }, "auto-approve failed"));
        await UsageMonthlyRepo.increment(req, tenantId, "auto_approved_count").catch(() => {});
      })
      .catch(() => {});

    return { ok: true, return_request_id: returnRequestId, return_number: returnNumber, status: "requested", requested_at: now, total_items_count: totalItems, total_request_value: totalValue };
  }

  static async listPortalReturns(req: any) {
    const tenantId = assertRowIdDigits(req.tenantId);
    const session = req.portalSession;
    if (!session?.order_number) throw new AppError(401, "Unauthorized", "PORTAL_UNAUTHORIZED");
    const rows = await ReturnRequestsRepo.listByOrderNumber(req, tenantId, String(session.order_number));
    return {
      ok: true,
      order_number: String(session.order_number),
      returns: rows.map((r) => ({
        return_number: r.return_number,
        status: r.status,
        status_reason: r.status_reason ?? null,
        requested_resolution: r.requested_resolution,
        requested_at: r.requested_at,
        resolved_at: r.resolved_at ?? null,
        total_items_count: Number(r.total_items_count ?? 0),
        total_request_value: r.total_request_value == null ? null : Number(r.total_request_value),
        is_warranty: Boolean(r.is_warranty),
      })),
    };
  }

  static async getPortalReturnDetails(req: any, args: { returnNumber: string }) {
    const tenantId = assertRowIdDigits(req.tenantId);
    const session = req.portalSession;
    if (!session?.order_number) throw new AppError(401, "Unauthorized", "PORTAL_UNAUTHORIZED");

    const rr = await ReturnRequestsRepo.findByReturnNumber(req, tenantId, args.returnNumber);
    if (!rr || String(rr.order_number) !== String(session.order_number)) throw new AppError(404, "Return not found", "RETURN_NOT_FOUND");

    const [items, attachments, shipment] = await Promise.all([
      ReturnItemsRepo.listByReturnRequestId(req, tenantId, rr.ROWID),
      ReturnAttachmentsRepo.listByReturnRequest(req, tenantId, rr.ROWID),
      ReturnShipmentsRepo.findByReturnRequest(req, tenantId, rr.ROWID),
    ]);

    return {
      ok: true,
      return: {
        return_number: rr.return_number,
        order_number: rr.order_number,
        requested_resolution: rr.requested_resolution,
        status: rr.status,
        status_reason: rr.status_reason ?? null,
        requested_at: rr.requested_at,
        approved_at: rr.approved_at ?? null,
        received_at: rr.received_at ?? null,
        resolved_at: rr.resolved_at ?? null,
        notes_customer: rr.notes_customer ?? null,
        total_items_count: rr.total_items_count,
        total_request_value: rr.total_request_value ?? null,
        is_warranty: rr.is_warranty,
        shipment: shipment
          ? { mode: shipment.mode, status: shipment.status, carrier_name: shipment.carrier_name, tracking_number: shipment.tracking_number, tracking_url: shipment.tracking_url }
          : null,
        attachments_count: attachments.length,
        items: items.map((it) => ({ sku: it.sku, product_name: it.product_name ?? null, variant_name: it.variant_name ?? null, quantity: Number(it.quantity ?? 0), reason_code: it.reason_code, reason_note: it.reason_note ?? null, decision: it.decision })),
      },
    };
  }

  static async cancelPortalReturn(req: any, args: { returnNumber: string; reason?: string }) {
    const tenantId = assertRowIdDigits(req.tenantId);
    const session = req.portalSession;
    if (!session?.order_number || !session?.contact_hash) throw new AppError(401, "Unauthorized", "PORTAL_UNAUTHORIZED");

    const rr = await ReturnRequestsRepo.findByReturnNumber(req, tenantId, args.returnNumber);
    if (!rr || String(rr.order_number) !== String(session.order_number) || String(rr.customer_contact_hash || "") !== String(session.contact_hash)) {
      throw new AppError(404, "Return not found", "RETURN_NOT_FOUND");
    }
    if (String(rr.status).toLowerCase() !== "requested") {
      throw new AppError(400, "Return cannot be cancelled at this stage", "RETURN_CANCEL_NOT_ALLOWED", { status: rr.status });
    }

    const now = nowCatalyst();
    await ReturnRequestsRepo.update(req, { ROWID: rr.ROWID, tenant_id: tenantId, status: "cancelled", status_reason: args.reason ?? rr.status_reason ?? null, customer_cancelled_at: now });
    await AuditEventsRepo.log(req, { tenant_id: tenantId, entity_type: "return_requests", entity_rowid: rr.ROWID, event_type: "return_cancelled", actor_type: "customer", before: { status: rr.status }, after: { status: "cancelled", reason: args.reason ?? null } });

    return { ok: true, return_number: rr.return_number, status: "cancelled", customer_cancelled_at: now };
  }
}
