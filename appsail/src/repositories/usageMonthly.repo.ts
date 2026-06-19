// appsail/src/repositories/usageMonthly.repo.ts
// Per-tenant monthly counters (returns_created, attachments_uploaded, auto_approved_count).
// These survive the 200-row ZCQL cap so the dashboard reports REAL totals/automation %.
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
function currentYearMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export type UsageRow = {
  ROWID: string;
  tenant_id: string;
  year_month: string;
  tenant_month_key: string;
  returns_created: number;
  attachments_uploaded: number;
  auto_approved_count: number;
  last_aggregated_at?: string | null;
};

type CounterField = "returns_created" | "attachments_uploaded" | "auto_approved_count";

export class UsageMonthlyRepo {
  static tableName = "usage_monthly";

  static keyFor(tenantId: string, yearMonth: string): string {
    return `${tenantId}:${yearMonth}`;
  }

  static async findByKey(req: any, key: string): Promise<UsageRow | null> {
    const res = await getCatalystApp(req)
      .zcql()
      .executeZCQLQuery(`SELECT * FROM ${this.tableName} WHERE tenant_month_key = ${q(key)} LIMIT 1`);
    if (!res?.length) return null;
    const row = res[0][this.tableName];
    return { ...row, ROWID: String(row.ROWID), tenant_id: String(row.tenant_id) } as UsageRow;
  }

  static async getForMonth(req: any, tenantId: string | number, yearMonth?: string): Promise<UsageRow | null> {
    return this.findByKey(req, this.keyFor(assertRowIdDigits(tenantId), yearMonth ?? currentYearMonth()));
  }

  /** Atomic-ish increment: read-modify-write (single writer per tenant/month in practice). */
  static async increment(req: any, tenantId: string | number, field: CounterField, by = 1): Promise<void> {
    const tid = assertRowIdDigits(tenantId);
    const ym = currentYearMonth();
    const key = this.keyFor(tid, ym);
    const table = getCatalystApp(req).datastore().table(this.tableName);
    const existing = await this.findByKey(req, key);
    if (!existing) {
      await table.insertRow({
        tenant_id: tid,
        year_month: ym,
        tenant_month_key: key,
        returns_created: field === "returns_created" ? by : 0,
        attachments_uploaded: field === "attachments_uploaded" ? by : 0,
        auto_approved_count: field === "auto_approved_count" ? by : 0,
        last_aggregated_at: nowCatalyst(),
      }).catch(async (e: any) => {
        // race: another writer inserted first → fall back to update
        const again = await this.findByKey(req, key);
        if (again) await this.bump(req, again, field, by);
        else throw e;
      });
      return;
    }
    await this.bump(req, existing, field, by);
  }

  private static async bump(req: any, row: UsageRow, field: CounterField, by: number): Promise<void> {
    await getCatalystApp(req)
      .datastore()
      .table(this.tableName)
      .updateRow({ ROWID: row.ROWID, [field]: Number(row[field] ?? 0) + by, last_aggregated_at: nowCatalyst() });
  }
}
