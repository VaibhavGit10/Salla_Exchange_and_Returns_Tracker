// appsail/src/repositories/returnRules.repo.ts
// Per-tenant return policy (table return_rules, keyed by unique tenant_rules_key).
import { getCatalystApp } from "../lib/catalyst";
import { nowCatalyst } from "../lib/datetime";

function q(value: string): string {
  return `'${String(value).replace(/'/g, "''")}'`;
}
function assertRowIdDigits(id: string | number): string {
  const v = String(id);
  if (!/^\d+$/.test(v)) throw new Error("ROWID/FK must be digits");
  return v;
}

export type ReturnRulesRow = {
  ROWID: string;
  tenant_id: string;
  tenant_rules_key: string;
  rules_version: number;
  default_return_window_days: number;
  auto_approve_enabled: boolean;
  auto_approve_max_value?: number | null;
  auto_approve_reason_whitelist_json?: string | null;
  category_rules_json?: string | null;
  exchange_allowed: boolean;
  store_credit_allowed: boolean;
  refund_allowed: boolean;
  require_images_for_reasons_json?: string | null;
  sku_restrictions_json?: string | null;
  updated_by_actor_type?: string | null;
  updated_by_actor_id?: string | null;
  last_updated_at?: string | null;
};

const UPDATABLE = new Set([
  "default_return_window_days",
  "auto_approve_enabled",
  "auto_approve_max_value",
  "auto_approve_reason_whitelist_json",
  "category_rules_json",
  "exchange_allowed",
  "store_credit_allowed",
  "refund_allowed",
  "require_images_for_reasons_json",
  "sku_restrictions_json",
  "updated_by_actor_type",
  "updated_by_actor_id",
]);

export class ReturnRulesRepo {
  static tableName = "return_rules";

  static keyFor(tenantId: string): string {
    return `${tenantId}:rules`;
  }

  static async getByTenant(req: any, tenantId: string | number): Promise<ReturnRulesRow | null> {
    const tid = assertRowIdDigits(tenantId);
    const res = await getCatalystApp(req)
      .zcql()
      .executeZCQLQuery(`SELECT * FROM ${this.tableName} WHERE tenant_id = ${tid} LIMIT 1`);
    if (!res?.length) return null;
    const row = res[0][this.tableName];
    return { ...row, ROWID: String(row.ROWID), tenant_id: String(row.tenant_id) } as ReturnRulesRow;
  }

  /** Create the row with defaults if absent, then patch. Returns the resulting row. */
  static async upsert(req: any, tenantId: string | number, patch: Record<string, any>): Promise<ReturnRulesRow> {
    const tid = assertRowIdDigits(tenantId);
    const table = getCatalystApp(req).datastore().table(this.tableName);
    const existing = await this.getByTenant(req, tid);

    const clean: Record<string, any> = {};
    for (const [k, v] of Object.entries(patch)) if (UPDATABLE.has(k) && v !== undefined) clean[k] = v;

    if (!existing) {
      await table.insertRow({
        tenant_id: tid,
        tenant_rules_key: this.keyFor(tid),
        rules_version: 1,
        default_return_window_days: 14,
        auto_approve_enabled: false,
        exchange_allowed: true,
        store_credit_allowed: true,
        refund_allowed: true,
        last_updated_at: nowCatalyst(),
        ...clean,
      });
    } else {
      await table.updateRow({
        ROWID: existing.ROWID,
        rules_version: Number(existing.rules_version ?? 1) + 1,
        last_updated_at: nowCatalyst(),
        ...clean,
      });
    }
    return (await this.getByTenant(req, tid))!;
  }
}
