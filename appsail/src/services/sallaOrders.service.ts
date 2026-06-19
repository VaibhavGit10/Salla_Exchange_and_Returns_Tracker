// appsail/src/services/sallaOrders.service.ts
// Read order data from the Salla Merchant API v2 (orders, items, lookup-by-reference, status update).
import { sallaFetchJson } from "../lib/sallaApi";
import { retryWithBackoff } from "../lib/retryWithBackoff";
import { SallaOAuthService } from "./sallaOAuth.service";
import { cacheGet, cachePut } from "../lib/catalystCache";
import { AppError } from "../lib/errors";

export type SallaOrderStatus = { id: number; name: string; slug: string; customized?: { id: number; name: string } };
export type SallaOrderCustomer = { id: number; full_name?: string; first_name?: string; last_name?: string; email?: string; mobile?: string; mobile_code?: string; country?: string; country_code?: string; city?: string; lang?: string };
export type SallaMoney = { amount: number; currency: string };
export type SallaOrderItemProduct = { id: number; name?: string; sku?: string; thumbnail?: string; url?: string };
export type SallaItemAmounts = {
  original_price?: SallaMoney;
  price_without_tax?: SallaMoney;
  total_discount?: SallaMoney;
  tax?: { percent?: string; amount?: SallaMoney };
  total?: SallaMoney;
};

export type SallaOrderItem = {
  id: number;
  product?: SallaOrderItemProduct;
  product_id?: number;
  quantity: number;
  amounts?: SallaItemAmounts; // real per-item pricing lives here (not `price`)
  price?: { amount: number; currency: string };
  sku?: string;
  name?: string;
  thumbnail?: string;
  product_thumbnail?: string;
  options?: Array<{ name: string; value: string }>;
  categories?: Array<{ id: number; name: string }>;
};

/** Per-UNIT charged amount. `item.amounts.total` is the LINE total (qty-multiplied), so divide by qty. */
export function itemUnitPrice(it: SallaOrderItem): SallaMoney {
  const m: any = it?.amounts?.total ?? it?.amounts?.price_without_tax ?? it?.price;
  const qty = Math.max(1, Number(it?.quantity) || 1);
  const lineCurrency = (m && typeof m === "object" && m.currency) || "SAR";
  const lineAmount = m && typeof m === "object" ? Number(m.amount) || 0 : Number(m) || 0;
  return { amount: Math.round((lineAmount / qty) * 100) / 100, currency: String(lineCurrency) };
}

/** Order channel/source (e.g. "merchant-dashboard", "web", "mobile-app"). */
export function orderSource(o: SallaOrder): string | null {
  const s: any = (o as any)?.source;
  if (!s) return null;
  return typeof s === "object" ? String(s.name ?? s.type ?? JSON.stringify(s)) : String(s);
}

/** Best customer display name across payload shapes. */
export function orderCustomerName(o: SallaOrder): string | null {
  const c = o?.customer;
  if (!c) return null;
  return c.full_name || [c.first_name, c.last_name].filter(Boolean).join(" ").trim() || null;
}

/** Ship-to receiver — top-level `receiver` (list/detail) or `shipping.receiver` (order.created webhook). */
export function orderReceiver(o: SallaOrder): SallaReceiver | null {
  return (o as any)?.receiver ?? (o as any)?.shipping?.receiver ?? null;
}
export type SallaOrderAmounts = {
  total?: { amount: number; currency: string };
  subtotal?: { amount: number; currency: string };
  tax?: { amount: number; currency: string };
  shipping?: { amount: number; currency: string };
};
export type SallaReceiver = { name?: string; email?: string; phone?: string };

// Salla embeds refund capability directly on the order detail (readable with the orders scope,
// which we already hold). This is the authoritative signal for whether a programmatic refund is
// possible — for offline methods (bank/COD) `can_refund_to_wallet` is false and there is no gateway,
// so the only path is the merchant refunding manually. Verified live on demo store 1563867830.
export type SallaRefundAction = {
  refunded_transactions?: any[];
  pending_refund_amount?: SallaMoney | null;
  has_refund_amount?: boolean;
  payment_method_label?: string;
  paid_amount?: SallaMoney;
  refund_amount?: SallaMoney;
  can_refund_to_wallet?: boolean;
};
export type SallaPaymentActions = { refund_action?: SallaRefundAction };

export type SallaOrder = {
  id: number;
  reference_id?: string;
  status: SallaOrderStatus;
  payment_method?: string;
  gateway?: string | null;
  amounts?: SallaOrderAmounts;
  total?: SallaMoney; // list endpoint puts total at top-level (no `amounts`)
  customer?: SallaOrderCustomer;
  receiver?: SallaReceiver;
  items?: SallaOrderItem[];
  payment_actions?: SallaPaymentActions;
  urls?: { customer?: string; admin?: string; rating?: string; checkout?: string };
  date?: { date?: string; timezone?: string };
  completed_at?: string;
  created_at?: string;
};

export type RefundCapability = {
  /** True only when Salla exposes a programmatic refund path (store wallet or an online gateway). */
  auto: boolean;
  method: string | null;
  paidAmount: number;
  alreadyRefunded: number;
  /** Human-readable reason when auto === false (shown to the merchant for the manual path). */
  reason: string | null;
};

/**
 * Decide whether a refund can be auto-executed via Salla, from the order's own `payment_actions`.
 * Costs no extra API call beyond the order detail we already fetch. Offline methods (bank/COD) and
 * orders with no online gateway are NOT auto-refundable → assisted-manual.
 */
export function orderRefundCapability(o: SallaOrder): RefundCapability {
  const ra = o?.payment_actions?.refund_action;
  const method = o?.payment_method ?? null;
  const paidAmount = Number(ra?.paid_amount?.amount ?? 0);
  const alreadyRefunded = Number(ra?.refund_amount?.amount ?? 0);
  const hasGateway = !!(o?.gateway && String(o.gateway).trim());
  const canWallet = ra?.can_refund_to_wallet === true;
  const auto = canWallet || hasGateway;
  const reason = auto
    ? null
    : `Payment method "${ra?.payment_method_label || method || "unknown"}" has no Salla-side refund (offline/COD or no online gateway) — refund the customer directly and record the reference.`;
  return { auto, method, paidAmount, alreadyRefunded, reason };
}

type SallaApiResponse<T> = { status: number; success: boolean; data: T };

// ---- payload normalizers (handle list vs detail shape differences) ----

/** Order total works for both shapes: detail `amounts.total` and list top-level `total`. */
export function orderTotal(o: SallaOrder): SallaMoney {
  const t: any = o?.amounts?.total ?? o?.total;
  if (t && typeof t === "object") return { amount: Number(t.amount) || 0, currency: String(t.currency || "SAR") };
  return { amount: Number(t) || 0, currency: "SAR" };
}

/** Best available "order placed/completed" timestamp across payload shapes. */
export function orderCreatedAt(o: SallaOrder): string | null {
  return o?.completed_at || o?.created_at || o?.date?.date || null;
}

/** All customer contact strings (email + E.164 mobile), for ownership/notification. */
export function orderCustomerContacts(o: SallaOrder): string[] {
  const c = o?.customer;
  if (!c) return [];
  const mobile = c.mobile ? `${c.mobile_code ?? ""}${c.mobile}`.replace(/\s+/g, "") : null;
  return [c.email, c.mobile, mobile].filter(Boolean) as string[];
}

export class SallaOrdersService {
  static async getOrder(req: any, tenantId: string, orderId: string | number): Promise<SallaOrder> {
    const token = await SallaOAuthService.getValidAccessTokenForTenant(req, tenantId);
    const resp = await retryWithBackoff(() => sallaFetchJson<SallaApiResponse<SallaOrder>>(token, `/admin/v2/orders/${orderId}`));
    if (!resp?.data) throw new AppError(404, "Order not found in Salla", "SALLA_ORDER_NOT_FOUND");
    return resp.data;
  }

  /**
   * The store's order statuses (incl. custom ones) from Salla, cached 1h. Used to drive
   * return eligibility dynamically instead of a hardcoded slug list.
   */
  static async listOrderStatuses(req: any, tenantId: string): Promise<Array<{ id?: number; name?: string; slug?: string; type?: string }>> {
    const key = `order_statuses:${tenantId}`;
    const cached = await cacheGet<any[]>(req, key);
    if (cached) return cached;
    const token = await SallaOAuthService.getValidAccessTokenForTenant(req, tenantId);
    const resp = await retryWithBackoff(() => sallaFetchJson<SallaApiResponse<any[]>>(token, "/admin/v2/orders/statuses"));
    const list = (resp?.data ?? []).map((s: any) => ({ id: s.id, name: typeof s.name === "object" ? s.name.en || s.name.ar : s.name, slug: s.slug, type: s.type }));
    await cachePut(req, key, list, 60 * 60 * 1000);
    return list;
  }

  /** List recent orders for a store (debug/testing — discover real reference_ids). */
  static async listOrders(req: any, tenantId: string, perPage = 10): Promise<SallaOrder[]> {
    const token = await SallaOAuthService.getValidAccessTokenForTenant(req, tenantId);
    const resp = await retryWithBackoff(() =>
      sallaFetchJson<SallaApiResponse<SallaOrder[]>>(token, `/admin/v2/orders?per_page=${perPage}`)
    );
    return resp?.data ?? [];
  }

  static async getOrderItems(req: any, tenantId: string, orderId: string | number): Promise<SallaOrderItem[]> {
    const token = await SallaOAuthService.getValidAccessTokenForTenant(req, tenantId);
    const resp = await retryWithBackoff(() =>
      sallaFetchJson<SallaApiResponse<SallaOrderItem[]>>(token, `/admin/v2/orders/items?order_id=${encodeURIComponent(String(orderId))}`)
    );
    return resp?.data ?? [];
  }

  static async findOrderByReference(req: any, tenantId: string, referenceId: string): Promise<SallaOrder | null> {
    const token = await SallaOAuthService.getValidAccessTokenForTenant(req, tenantId);
    const ref = String(referenceId).trim().replace(/^#/, "");
    const resp = await retryWithBackoff(() =>
      sallaFetchJson<SallaApiResponse<SallaOrder[]>>(token, `/admin/v2/orders?reference_id=${encodeURIComponent(ref)}`)
    );
    const orders = resp?.data ?? [];
    return orders.find((o) => String(o.reference_id ?? "").trim() === ref) ?? null;
  }

  /** Update an order's status. Salla's documented contract is POST .../status with { slug } (or { status_id }). */
  static async updateOrderStatus(req: any, tenantId: string, orderId: string | number, statusSlug: string): Promise<void> {
    const token = await SallaOAuthService.getValidAccessTokenForTenant(req, tenantId);
    await retryWithBackoff(() => sallaFetchJson(token, `/admin/v2/orders/${orderId}/status`, { method: "POST", body: { slug: statusSlug } }));
  }

  /** Verify a contact hash matches the order's customer (for portal order-lookup binding). */
  static async validateOrderOwnership(
    req: any,
    tenantId: string,
    orderId: string | number,
    contactHash: string,
    hashFn: (value: string) => string
  ): Promise<SallaOrder> {
    const order = await this.getOrder(req, tenantId, orderId);
    const c = order.customer;
    if (!c) throw new AppError(404, "Order has no customer data", "ORDER_NO_CUSTOMER");
    const contacts = [c.email, c.mobile, c.mobile_code && c.mobile ? `${c.mobile_code}${c.mobile}` : null].filter(Boolean) as string[];
    if (!contacts.some((x) => hashFn(x.toLowerCase().trim()) === contactHash)) {
      throw new AppError(403, "Contact does not match order", "ORDER_CONTACT_MISMATCH");
    }
    return order;
  }
}
