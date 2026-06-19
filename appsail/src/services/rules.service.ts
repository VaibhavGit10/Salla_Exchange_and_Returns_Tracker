// appsail/src/services/rules.service.ts
// Rules engine — eligibility + auto-approval. Backed by the return_rules table.
import { ReturnRulesRepo } from "../repositories/returnRules.repo";
import { ReturnRequestsRepo } from "../repositories/returnRequests.repo";
import { SallaOrdersService, SallaOrder, SallaOrderItem, orderCreatedAt } from "./sallaOrders.service";
import { AppError } from "../lib/errors";
import { logger } from "../lib/logger";

const DAY_MS = 24 * 60 * 60 * 1000;

export type CategoryRule = { category_id?: string; category_name?: string; rule: "NON_RETURNABLE" | "DAY_LIMIT" | "STANDARD"; day_limit?: number };

export type MerchantRules = {
  return_window_days: number;
  auto_approve_enabled: boolean;
  auto_approve_max_value: number | null;
  auto_approve_reasons: string[];
  exchange_allowed: boolean;
  store_credit_allowed: boolean;
  refund_allowed: boolean;
  category_rules: CategoryRule[];
  require_images_for_reasons: string[];
  sku_restrictions: string[];
};

const DEFAULTS: MerchantRules = {
  return_window_days: 14,
  auto_approve_enabled: false,
  auto_approve_max_value: null,
  auto_approve_reasons: [],
  exchange_allowed: true,
  store_credit_allowed: true,
  refund_allowed: true,
  category_rules: [],
  require_images_for_reasons: ["defective", "wrong_item"],
  sku_restrictions: [],
};

function parseJson<T>(s: any, def: T): T {
  if (s == null) return def;
  try {
    const v = typeof s === "string" ? JSON.parse(s) : s;
    return (v ?? def) as T;
  } catch {
    return def;
  }
}

export type IneligibleItem = { item_id?: string; sku?: string; reason: string };
export type EligibilityResult = {
  eligible: boolean;
  ineligible_items: IneligibleItem[];
  rules: MerchantRules;
  order?: SallaOrder;
  order_items?: SallaOrderItem[];
};

export class RulesService {
  static async getRules(req: any, tenantId: string): Promise<MerchantRules> {
    const row = await ReturnRulesRepo.getByTenant(req, tenantId);
    if (!row) return { ...DEFAULTS };
    return {
      return_window_days: Number(row.default_return_window_days ?? DEFAULTS.return_window_days),
      auto_approve_enabled: Boolean(row.auto_approve_enabled),
      auto_approve_max_value: row.auto_approve_max_value == null ? null : Number(row.auto_approve_max_value),
      auto_approve_reasons: parseJson<string[]>(row.auto_approve_reason_whitelist_json, []),
      exchange_allowed: Boolean(row.exchange_allowed),
      store_credit_allowed: Boolean(row.store_credit_allowed),
      refund_allowed: Boolean(row.refund_allowed),
      category_rules: parseJson<CategoryRule[]>(row.category_rules_json, []),
      require_images_for_reasons: parseJson<string[]>(row.require_images_for_reasons_json, DEFAULTS.require_images_for_reasons),
      sku_restrictions: parseJson<string[]>(row.sku_restrictions_json, []),
    };
  }

  static async evaluateEligibility(
    req: any,
    tenantId: string,
    orderId: string | number,
    requestedItems: Array<{ order_item_id_external?: string; sku: string; quantity: number; category_name?: string; category_id?: string }>
  ): Promise<EligibilityResult> {
    const rules = await this.getRules(req, tenantId);
    const ineligible: IneligibleItem[] = [];

    let order: SallaOrder;
    try {
      order = await SallaOrdersService.getOrder(req, tenantId, orderId);
    } catch (err) {
      if (err instanceof AppError && err.code === "SALLA_ORDER_NOT_FOUND") {
        return { eligible: false, ineligible_items: [{ reason: "Order not found" }], rules };
      }
      throw err;
    }

    // Denylist (not allowlist): Salla stores rename/add custom statuses freely, so we must NOT require a
    // fixed set of slugs — that would wrongly block returns on any custom status. Instead we block only
    // states where a return is logically impossible (not yet paid, cancelled, already refunded, draft).
    const status = order.status?.slug?.toLowerCase() ?? "";
    const NON_RETURNABLE_STATES = new Set([
      "canceled", "cancelled", "refunded", "fully_refunded", "partially_refunded",
      "draft", "deleted", "restored", "restoring",
      "pending", "payment_pending", "pending_payment", "awaiting_payment", "in_progress_refund",
      "request_quote", "quote", // pre-sale quote requests — nothing purchased/delivered to return
    ]);
    if (NON_RETURNABLE_STATES.has(status)) {
      ineligible.push({ reason: `Order status '${order.status?.name || status}' is not eligible for returns` });
    }

    const completedAt = orderCreatedAt(order);
    if (completedAt && rules.return_window_days > 0) {
      const end = new Date(completedAt).getTime() + rules.return_window_days * DAY_MS;
      if (Date.now() > end) ineligible.push({ reason: `Return window of ${rules.return_window_days} days has expired` });
    }

    let orderItems: SallaOrderItem[] = [];
    try {
      orderItems = await SallaOrdersService.getOrderItems(req, tenantId, order.id);
    } catch {
      logger.warn({ tenantId, orderId }, "could not fetch order items for eligibility");
    }

    const nonReturnableCats = rules.category_rules.filter((c) => c.rule === "NON_RETURNABLE");
    for (const item of requestedItems) {
      const catName = (item.category_name ?? "").toLowerCase();
      const catId = String(item.category_id ?? "");

      if (rules.sku_restrictions.map((s) => s.toLowerCase()).includes(String(item.sku).toLowerCase())) {
        ineligible.push({ item_id: item.order_item_id_external, sku: item.sku, reason: `SKU ${item.sku} is non-returnable` });
        continue;
      }
      const nrMatch = nonReturnableCats.find((c) => (c.category_name && c.category_name.toLowerCase() === catName) || (c.category_id && c.category_id === catId));
      if (nrMatch) {
        ineligible.push({ item_id: item.order_item_id_external, sku: item.sku, reason: `Category is non-returnable` });
        continue;
      }
      const dayLimit = rules.category_rules.find((c) => c.rule === "DAY_LIMIT" && ((c.category_name && c.category_name.toLowerCase() === catName) || (c.category_id && c.category_id === catId)));
      if (dayLimit?.day_limit != null && completedAt) {
        const end = new Date(completedAt).getTime() + dayLimit.day_limit * DAY_MS;
        if (Date.now() > end) ineligible.push({ item_id: item.order_item_id_external, sku: item.sku, reason: `Category has a ${dayLimit.day_limit}-day return limit (expired)` });
      }
      if (orderItems.length && item.order_item_id_external) {
        const oi = orderItems.find((o) => String(o.id) === item.order_item_id_external);
        if (oi && item.quantity > oi.quantity) {
          ineligible.push({ item_id: item.order_item_id_external, sku: item.sku, reason: `Return quantity (${item.quantity}) exceeds ordered (${oi.quantity})` });
        }
      }
    }

    const existing = await ReturnRequestsRepo.listByOrderNumber(req, tenantId, String(order.reference_id ?? order.id)).catch(() => []);
    const active = existing.filter((r) => !["rejected", "cancelled"].includes(String(r.status).toLowerCase()));
    if (active.length) ineligible.push({ reason: `An active return (${active[0].return_number}) already exists for this order` });

    return { eligible: ineligible.length === 0, ineligible_items: ineligible, rules, order, order_items: orderItems };
  }

  static async updateRules(
    req: any,
    tenantId: string,
    patch: Record<string, any>,
    actor?: { actor_type?: string; actor_id?: string | null }
  ): Promise<MerchantRules> {
    const col: Record<string, any> = {};
    if (patch.default_return_window_days !== undefined) col.default_return_window_days = patch.default_return_window_days;
    if (patch.auto_approve_enabled !== undefined) col.auto_approve_enabled = patch.auto_approve_enabled;
    if (patch.auto_approve_max_value !== undefined) col.auto_approve_max_value = patch.auto_approve_max_value;
    if (patch.auto_approve_reasons !== undefined) col.auto_approve_reason_whitelist_json = JSON.stringify(patch.auto_approve_reasons);
    if (patch.category_rules !== undefined) col.category_rules_json = JSON.stringify(patch.category_rules);
    if (patch.exchange_allowed !== undefined) col.exchange_allowed = patch.exchange_allowed;
    if (patch.store_credit_allowed !== undefined) col.store_credit_allowed = patch.store_credit_allowed;
    if (patch.refund_allowed !== undefined) col.refund_allowed = patch.refund_allowed;
    if (patch.require_images_for_reasons !== undefined) col.require_images_for_reasons_json = JSON.stringify(patch.require_images_for_reasons);
    if (patch.sku_restrictions !== undefined) col.sku_restrictions_json = JSON.stringify(patch.sku_restrictions);
    col.updated_by_actor_type = actor?.actor_type ?? "merchant";
    col.updated_by_actor_id = actor?.actor_id ?? null;
    await ReturnRulesRepo.upsert(req, tenantId, col);
    return this.getRules(req, tenantId);
  }

  static async evaluateAutoApproval(req: any, tenantId: string, args: { total_request_value?: number | null; reason_codes?: string[] }): Promise<boolean> {
    const rules = await this.getRules(req, tenantId);
    if (!rules.auto_approve_enabled) return false;
    const value = Number(args.total_request_value ?? 0);
    if (rules.auto_approve_max_value != null && value > rules.auto_approve_max_value) return false;
    if (rules.auto_approve_reasons.length) {
      const reasons = (args.reason_codes ?? []).map((r) => r.toLowerCase());
      const allWhitelisted = reasons.length > 0 && reasons.every((r) => rules.auto_approve_reasons.map((x) => x.toLowerCase()).includes(r));
      if (!allWhitelisted) return false;
    }
    return value > 0;
  }
}
