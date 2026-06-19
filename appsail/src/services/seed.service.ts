// appsail/src/services/seed.service.ts
// DEV-ONLY sample data. Populates a tenant with varied returns so the console looks fully
// functional for testing. Every seeded row is marked notes_internal="__seed__" so unseed() can
// remove exactly what was added. Never exposed in production (route is gated by DEV_DIRECT_LOGIN).
import crypto from "crypto";
import { getCatalystApp } from "../lib/catalyst";
import { nowCatalyst, catalystDateTimeDaysAgo } from "../lib/datetime";
import { hashContact } from "../lib/crypto";
import { maskEmail } from "../security/pii";
import { ReturnRequestsRepo } from "../repositories/returnRequests.repo";
import { ReturnItemsRepo } from "../repositories/returnItems.repo";
import { ReturnOutcomesRepo } from "../repositories/returnOutcomes.repo";
import { ReturnShipmentsRepo } from "../repositories/returnShipments.repo";
import { AuditEventsRepo } from "../repositories/auditEvents.repo";
import { UsageMonthlyRepo } from "../repositories/usageMonthly.repo";
import { logger } from "../lib/logger";

const SEED_MARK = "__seed__";

function rma(): string {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  return `RMA-${ymd}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
}

type Seed = {
  status: string;
  resolution: "refund" | "exchange" | "store_credit";
  value: number;
  warranty?: boolean;
  reqDaysAgo: number;
  resolvedDaysAgo?: number;
  email: string;
  items: Array<{ sku: string; name: string; reason: string; qty: number; price: number }>;
  reject?: string;
};

const DATA: Seed[] = [
  { status: "requested", resolution: "refund", value: 349, reqDaysAgo: 1, email: "ahmed@example.com", items: [{ sku: "THB-BLU-L", name: "Blue Thobe", reason: "defective", qty: 1, price: 349 }] },
  { status: "requested", resolution: "exchange", value: 120, reqDaysAgo: 1, email: "sara@example.com", items: [{ sku: "ABY-BLK-M", name: "Abaya — Black", reason: "size_issue", qty: 1, price: 120 }] },
  { status: "requested", resolution: "store_credit", value: 80, warranty: true, reqDaysAgo: 2, email: "noura@example.com", items: [{ sku: "WCH-STR-01", name: "Smart Watch Strap", reason: "not_as_described", qty: 1, price: 80 }] },
  { status: "approved", resolution: "refund", value: 540, reqDaysAgo: 3, email: "khalid@example.com", items: [{ sku: "SNK-WHT-44", name: "Sneakers 44", reason: "wrong_item", qty: 1, price: 540 }] },
  { status: "approved", resolution: "exchange", value: 210, reqDaysAgo: 3, email: "lina@example.com", items: [{ sku: "BAG-TAN", name: "Tote Bag", reason: "changed_mind", qty: 1, price: 210 }] },
  { status: "in_transit", resolution: "refund", value: 99, reqDaysAgo: 4, email: "omar@example.com", items: [{ sku: "PRF-50ML", name: "Oud Perfume 50ml", reason: "defective", qty: 1, price: 99 }] },
  { status: "received", resolution: "refund", value: 460, reqDaysAgo: 5, email: "huda@example.com", items: [{ sku: "DRS-RED-S", name: "Evening Dress", reason: "not_as_described", qty: 1, price: 460 }] },
  { status: "resolved", resolution: "refund", value: 349, reqDaysAgo: 6, resolvedDaysAgo: 4, email: "faisal@example.com", items: [{ sku: "THB-WHT-XL", name: "White Thobe XL", reason: "defective", qty: 1, price: 349 }] },
  { status: "resolved", resolution: "exchange", value: 180, reqDaysAgo: 5, resolvedDaysAgo: 3, email: "mona@example.com", items: [{ sku: "SHO-BRN-42", name: "Leather Shoes 42", reason: "size_issue", qty: 1, price: 180 }] },
  { status: "resolved", resolution: "store_credit", value: 75, reqDaysAgo: 8, resolvedDaysAgo: 7, email: "yousef@example.com", items: [{ sku: "CAP-NVY", name: "Navy Cap", reason: "changed_mind", qty: 1, price: 75 }] },
  { status: "rejected", resolution: "refund", value: 999, reqDaysAgo: 9, resolvedDaysAgo: 8, email: "rana@example.com", reject: "Outside the 14-day return window", items: [{ sku: "TV-55-OLED", name: '55" OLED TV', reason: "changed_mind", qty: 1, price: 999 }] },
  { status: "cancelled", resolution: "refund", value: 60, reqDaysAgo: 7, email: "tariq@example.com", items: [{ sku: "SOX-3PK", name: "Socks 3-pack", reason: "other", qty: 1, price: 60 }] },
];

export class SeedService {
  static async unseed(req: any, tenantId: string): Promise<number> {
    const app = getCatalystApp(req);
    const rows = await ReturnRequestsRepo.listByTenant(req, tenantId, { limit: 200 }).catch(() => []);
    const seeded = rows.filter((r) => String(r.notes_internal || "").includes(SEED_MARK));
    for (const r of seeded) {
      await ReturnItemsRepo.deleteByReturnRequestId(req, tenantId, r.ROWID).catch(() => {});
      // outcomes + shipments by FK
      for (const tbl of ["return_outcomes", "return_shipments"]) {
        const res = await app.zcql().executeZCQLQuery(`SELECT ROWID FROM ${tbl} WHERE tenant_id = ${tenantId} AND return_request_id = ${r.ROWID} LIMIT 200`).catch(() => []);
        for (const row of res ?? []) {
          const id = String((row as any)[tbl]?.ROWID ?? (row as any).ROWID);
          await app.datastore().table(tbl).deleteRow(id as any).catch(() => {});
        }
      }
      await ReturnRequestsRepo.deleteById(req, r.ROWID).catch(() => {});
    }
    return seeded.length;
  }

  /** Hard reset — delete ALL returns (+ children) for a tenant. Used by /dev/reset for a clean slate. */
  static async purgeAll(req: any, tenantId: string): Promise<number> {
    const app = getCatalystApp(req);
    const rows = await ReturnRequestsRepo.listByTenant(req, tenantId, { limit: 200 }).catch(() => []);
    for (const r of rows) {
      await ReturnItemsRepo.deleteByReturnRequestId(req, tenantId, r.ROWID).catch(() => {});
      for (const tbl of ["return_outcomes", "return_shipments", "return_attachments"]) {
        const res = await app.zcql().executeZCQLQuery(`SELECT ROWID FROM ${tbl} WHERE tenant_id = ${tenantId} AND return_request_id = ${r.ROWID} LIMIT 200`).catch(() => []);
        for (const row of res ?? []) {
          const id = String((row as any)[tbl]?.ROWID ?? (row as any).ROWID);
          await app.datastore().table(tbl).deleteRow(id as any).catch(() => {});
        }
      }
      await ReturnRequestsRepo.deleteById(req, r.ROWID).catch(() => {});
    }
    logger.info({ tenantId, purged: rows.length }, "purgeAll complete");
    return rows.length;
  }

  static async seed(req: any, tenantId: string): Promise<{ created: number; cleared: number }> {
    const cleared = await this.unseed(req, tenantId); // idempotent re-seed

    let created = 0;
    for (const s of DATA) {
      const reqAt = catalystDateTimeDaysAgo(s.reqDaysAgo);
      const resolvedAt = s.resolvedDaysAgo != null ? catalystDateTimeDaysAgo(s.resolvedDaysAgo) : null;
      const contactHash = hashContact(tenantId, "email", s.email);
      const totalItems = s.items.reduce((n, it) => n + it.qty, 0);

      const row: any = {
        tenant_id: tenantId,
        return_number: rma(),
        order_number: `ORD-${1000 + created}`,
        order_id_external: String(50000 + created),
        customer_contact_masked: maskEmail(s.email),
        customer_contact_hash: contactHash,
        requested_resolution: s.resolution,
        status: s.status,
        status_reason: s.reject ?? null,
        requested_at: reqAt,
        approved_at: ["approved", "in_transit", "received", "resolved"].includes(s.status) ? catalystDateTimeDaysAgo(Math.max(0, s.reqDaysAgo - 1)) : null,
        received_at: ["received", "resolved"].includes(s.status) ? catalystDateTimeDaysAgo(Math.max(0, s.reqDaysAgo - 2)) : null,
        resolved_at: resolvedAt,
        policy_snapshot_json: JSON.stringify({ email: s.email }),
        notes_internal: SEED_MARK,
        notes_customer: null,
        total_items_count: totalItems,
        total_request_value: s.value,
        is_warranty: !!s.warranty,
      };
      if (s.status === "resolved") {
        if (s.resolution === "refund") row.refund_transaction_id_external = `rf_${crypto.randomBytes(4).toString("hex")}`;
        if (s.resolution === "exchange") row.exchange_order_id_external = String(60000 + created);
        if (s.resolution === "store_credit") row.store_credit_ref_external = `RXC-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
      }

      let inserted: any;
      try {
        inserted = await ReturnRequestsRepo.insert(req, row);
      } catch (e) {
        logger.warn({ err: (e as any)?.message }, "seed insert failed");
        continue;
      }
      const rid = String(inserted?.ROWID);
      created++;

      await ReturnItemsRepo.bulkInsert(
        req,
        s.items.map((it) => ({
          tenant_id: tenantId,
          return_request_id: rid,
          order_item_id_external: String(70000 + created),
          sku: it.sku,
          product_name: it.name,
          quantity: it.qty,
          unit_price: it.price,
          reason_code: it.reason,
          decision: s.status === "resolved" ? "approved" : "pending",
        })),
        4
      ).catch(() => {});

      if (s.status === "resolved") {
        await ReturnOutcomesRepo.insert(req, { tenant_id: tenantId, return_request_id: rid, outcome_type: s.resolution, outcome_amount: s.value, currency: "SAR", status: "completed" })
          .then((o: any) => ReturnOutcomesRepo.update(req, String(o?.ROWID), { completed_at: resolvedAt!, reference_id_external: row.refund_transaction_id_external || row.exchange_order_id_external || row.store_credit_ref_external || null }))
          .catch(() => {});
      }
      if (["approved", "in_transit", "received"].includes(s.status)) {
        await ReturnShipmentsRepo.insert(req, { tenant_id: tenantId, return_request_id: rid, mode: s.status === "in_transit" ? "auto" : "manual", carrier_name: s.status === "in_transit" ? "SMSA" : null, tracking_number: s.status === "in_transit" ? `SMSA${1000 + created}` : null, status: s.status === "in_transit" ? "in_transit" : "awaiting_customer" }).catch(() => {});
      }

      await AuditEventsRepo.log(req, { tenant_id: tenantId, entity_type: "return_requests", entity_rowid: rid, event_type: "return_requested", actor_type: "customer", after: { return_number: row.return_number } });
      if (s.status !== "requested") {
        await AuditEventsRepo.log(req, { tenant_id: tenantId, entity_type: "return_requests", entity_rowid: rid, event_type: `return_${s.status}`, actor_type: "merchant", after: { status: s.status } });
      }
    }

    // usage_monthly so automation % is non-zero
    await UsageMonthlyRepo.increment(req, tenantId, "returns_created", created).catch(() => {});
    await UsageMonthlyRepo.increment(req, tenantId, "auto_approved_count", 3).catch(() => {});

    logger.info({ tenantId, created, cleared }, "seed complete");
    return { created, cleared };
  }
}
