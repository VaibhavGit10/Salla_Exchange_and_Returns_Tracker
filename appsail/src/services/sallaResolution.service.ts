// appsail/src/services/sallaResolution.service.ts
// THE differentiator: execute a resolution against Salla instead of just recording it.
//   refund       → Salla order refund API (COD → uses stored IBAN out-of-band / store credit)
//   store_credit → Salla coupon/credit if available, else issue an internal voucher code
//   exchange     → record the replacement order reference (auto-creation is Phase-2/verify)
//
// Every path writes a return_outcomes ledger row and is capability-gated: if the merchant supplies
// a reference (they did it in Salla), we record it; otherwise we attempt the API and fall back
// cleanly. ⚠️ Salla refund/coupon endpoints are PHASE-0 unverified — confirm on the demo store.
import crypto from "crypto";
import { env } from "../env";
import { AppError } from "../lib/errors";
import { nowCatalyst } from "../lib/datetime";
import { assertTransition } from "../lib/statusMachine";
import { sallaFetchJson, SallaApiError } from "../lib/sallaApi";
import { retryWithBackoff } from "../lib/retryWithBackoff";
import { logger } from "../lib/logger";
import { ReturnRequestsRepo, ReturnRequestRow } from "../repositories/returnRequests.repo";
import { ReturnOutcomesRepo } from "../repositories/returnOutcomes.repo";
import { AuditEventsRepo } from "../repositories/auditEvents.repo";
import { SallaOAuthService } from "./sallaOAuth.service";
import { SallaOrdersService, orderRefundCapability } from "./sallaOrders.service";
import { NotificationsService } from "./notifications";

function assertRowIdDigits(id: string | number): string {
  const v = String(id);
  if (!/^\d+$/.test(v)) throw new Error("ROWID/FK must be digits");
  return v;
}
function customerEmailOf(rr: ReturnRequestRow): string | null {
  try {
    const p = rr.policy_snapshot_json ? JSON.parse(rr.policy_snapshot_json) : null;
    return p?.email ? String(p.email) : null;
  } catch {
    return null;
  }
}
function genCreditCode(): string {
  return `RXC-${crypto.randomBytes(5).toString("hex").toUpperCase()}`;
}

export type ResolveArgs = {
  type: "refund" | "exchange" | "store_credit";
  amount?: number;
  exchange_variant_id?: string;
  reference?: string; // merchant-supplied (manual confirmation) reference
  currency?: string;
  notes_internal?: string;
  actor_id?: string | null;
};

export class SallaResolutionService {
  static async resolve(req: any, tenantId: string | number, returnNumber: string, args: ResolveArgs) {
    const tid = assertRowIdDigits(tenantId);
    const rr = await ReturnRequestsRepo.findByReturnNumber(req, tid, returnNumber);
    if (!rr) throw new AppError(404, "Return not found", "RETURN_NOT_FOUND");
    assertTransition(rr.status, "resolved");

    const currency = args.currency || "SAR";
    const amount = typeof args.amount === "number" ? args.amount : Number(rr.total_request_value ?? 0);

    const outcome: any = await ReturnOutcomesRepo.insert(req, {
      tenant_id: tid,
      return_request_id: rr.ROWID,
      outcome_type: args.type,
      outcome_amount: amount,
      currency,
      status: "pending",
    });
    const outcomeId = String(outcome?.ROWID ?? "");

    let reference = args.reference ? String(args.reference).trim() : "";
    let providerResponse: any = null;
    let mode: "manual" | "auto" | "internal" = reference ? "manual" : "auto";

    try {
      if (!reference) {
        if (args.type === "refund") {
          reference = await this.executeRefund(req, tid, rr, amount, currency).then((r) => {
            providerResponse = r.raw;
            return r.reference;
          });
        } else if (args.type === "store_credit") {
          const r = await this.executeStoreCredit(req, tid, rr, amount, currency);
          reference = r.reference;
          providerResponse = r.raw;
          mode = r.mode;
        } else {
          // exchange: auto-creation not verified → require a reference
          throw new AppError(422, "Exchange requires a replacement order reference (auto-creation pending Salla verification)", "EXCHANGE_REFERENCE_REQUIRED");
        }
      }
    } catch (err: any) {
      await ReturnOutcomesRepo.update(req, outcomeId, { status: "failed", failure_reason: String(err?.message ?? "resolution failed").slice(0, 250) });
      if (err instanceof AppError) throw err;
      throw new AppError(502, "Resolution failed at Salla", "RESOLUTION_FAILED", err?.message);
    }

    const now = nowCatalyst();
    await ReturnOutcomesRepo.update(req, outcomeId, {
      status: "completed",
      completed_at: now,
      reference_id_external: reference || null,
      raw_provider_response_json: providerResponse ? JSON.stringify(providerResponse).slice(0, 5000) : null,
    });

    const patch: any = { ROWID: rr.ROWID, tenant_id: tid, status: "resolved", resolved_at: now, notes_internal: args.notes_internal ?? rr.notes_internal ?? null };
    if (args.type === "refund") patch.refund_transaction_id_external = reference || null;
    if (args.type === "store_credit") patch.store_credit_ref_external = reference || null;
    if (args.type === "exchange") patch.exchange_order_id_external = reference || null;
    await ReturnRequestsRepo.update(req, patch);

    await AuditEventsRepo.log(req, {
      tenant_id: tid,
      entity_type: "return_requests",
      entity_rowid: rr.ROWID,
      event_type: "return_resolved",
      actor_type: args.actor_id ? "merchant" : "system",
      actor_id: args.actor_id ?? null,
      before: { status: rr.status },
      after: { status: "resolved", resolution_type: args.type, mode, reference: reference || null },
    });

    NotificationsService.onResolved(req, {
      toEmail: customerEmailOf(rr),
      returnNumber: rr.return_number,
      orderNumber: rr.order_number,
      storeName: req?.tenant?.store_name,
      resolutionType: args.type,
      reference: reference || undefined,
    }).catch((e) => logger.error({ err: (e as any)?.message }, "resolve notify failed"));

    return { ok: true, return_number: rr.return_number, status: "resolved", resolution_type: args.type, mode, reference: reference || null, amount, currency };
  }

  /**
   * Refund execution, capability-gated.
   *
   * Phase-0 reality (verified live on demo store 1563867830, 2026-06-19): the app token lacks the
   * `transactions.read_write` scope, so Salla's refund API 401s for every order, and Salla refunds
   * are transaction-based — there is no `POST /orders/{id}/refund`. Additionally, the order's own
   * `payment_actions.refund_action` shows offline methods (bank/COD, no gateway) cannot be refunded
   * via Salla at all (`can_refund_to_wallet:false`).
   *
   * So we read the (already-authorized) order detail to decide auto vs manual WITHOUT firing a
   * doomed call, and only attempt the live refund when SALLA_REFUND_AUTO is enabled (i.e. the scope
   * has been granted and the endpoint verified). Otherwise → assisted-manual (merchant refunds and
   * records the reference). This never claims auto-execution it cannot deliver.
   */
  private static async executeRefund(req: any, tenantId: string, rr: ReturnRequestRow, amount: number, currency: string): Promise<{ reference: string; raw: any }> {
    let orderId = rr.order_id_external ? String(rr.order_id_external) : "";
    let order = orderId
      ? await SallaOrdersService.getOrder(req, tenantId, orderId).catch(() => null)
      : await SallaOrdersService.findOrderByReference(req, tenantId, rr.order_number).catch(() => null);
    if (order && !orderId) orderId = String(order.id);
    if (!orderId) throw new AppError(422, "Cannot resolve refund: Salla order id unknown", "ORDER_ID_UNKNOWN");

    const cap = order ? orderRefundCapability(order) : null;

    // Not auto-capable for this payment method, or the verified auto path isn't enabled yet → manual.
    if (!env.SALLA_REFUND_AUTO || !cap?.auto) {
      const why = !env.SALLA_REFUND_AUTO
        ? "Salla auto-refund is not enabled (pending transactions.read_write scope grant + endpoint verification)."
        : cap?.reason || "This order is not auto-refundable via Salla.";
      logger.info({ orderId, autoFlag: env.SALLA_REFUND_AUTO, capable: cap?.auto, method: cap?.method }, "refund → assisted-manual");
      throw new AppError(422, `${why} Issue the refund in Salla and record the reference to resolve.`, "MANUAL_REFUND_REQUIRED");
    }

    // Verified auto path (flag on): refunds are transaction-based — find the refundable transaction
    // for this order, then issue the refund against it.
    const token = await SallaOAuthService.getValidAccessTokenForTenant(req, tenantId);
    const txResp: any = await sallaFetchJson(token, `/admin/v2/transactions?order_id=${encodeURIComponent(orderId)}`).catch(() => null);
    const txns: any[] = Array.isArray(txResp?.data) ? txResp.data : [];
    const refundable = txns.find((t) => Array.isArray(t?.available_actions) && t.available_actions.includes("refund"));
    if (!refundable?.id) {
      throw new AppError(422, "No refundable Salla transaction found — issue the refund manually and record the reference.", "MANUAL_REFUND_REQUIRED");
    }

    const resp: any = await retryWithBackoff(() =>
      sallaFetchJson(token, `/admin/v2/transactions/${refundable.id}/refund`, { method: "POST", body: { amount, currency } })
    ).catch((err) => {
      if (err instanceof SallaApiError && err.status >= 400 && err.status < 500) {
        throw new AppError(422, "Salla rejected the refund — issue it manually and record the reference.", "SALLA_REFUND_REJECTED", err.responseText?.slice(0, 200));
      }
      throw err;
    });
    const ref = String(resp?.data?.id ?? resp?.data?.refund_id ?? resp?.id ?? `refund-${refundable.id}`);
    return { reference: ref, raw: resp };
  }

  /**
   * Store credit. Phase-0: the coupons API needs `marketing.read_write` (currently 401). Until
   * SALLA_STORE_CREDIT_AUTO is enabled we skip the (doomed) Salla call entirely and issue an internal
   * voucher recorded in the outcomes ledger — the merchant honors it. No wasted API call.
   */
  private static async executeStoreCredit(req: any, tenantId: string, _rr: ReturnRequestRow, amount: number, currency: string): Promise<{ reference: string; raw: any; mode: "auto" | "internal" }> {
    if (env.SALLA_STORE_CREDIT_AUTO) {
      try {
        const token = await SallaOAuthService.getValidAccessTokenForTenant(req, tenantId);
        const resp: any = await retryWithBackoff(() =>
          sallaFetchJson(token, "/admin/v2/coupons", { method: "POST", body: { type: "fixed", amount, currency, code: genCreditCode(), free_shipping: false } })
        );
        const code = String(resp?.data?.code ?? resp?.data?.id ?? "");
        if (code) return { reference: code, raw: resp, mode: "auto" };
        logger.warn("Salla coupon response had no code → internal voucher");
      } catch (err) {
        logger.warn({ err: (err as any)?.message }, "Salla store-credit API failed → internal voucher");
      }
    }
    // Internal voucher fallback (default path until the marketing scope is verified).
    return { reference: genCreditCode(), raw: { provider: "internal", amount, currency }, mode: "internal" };
  }
}
