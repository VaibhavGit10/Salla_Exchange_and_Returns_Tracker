// appsail/src/repositories/returnRequests.repo.ts
import { getCatalystApp } from "../lib/catalyst";

function q(value: string): string {
  return `'${String(value).replace(/'/g, "''")}'`;
}
function assertRowIdDigits(id: string | number): string {
  const v = String(id);
  if (!/^\d+$/.test(v)) throw new Error("ROWID/FK must be digits");
  return v;
}

export type ReturnRequestRow = {
  ROWID: string;
  tenant_id: string;
  return_number: string;
  order_number: string;
  order_id_external?: string | null;
  customer_contact_masked?: string | null;
  customer_contact_hash: string;
  requested_resolution: string;
  status: string;
  status_reason?: string | null;
  requested_at: string;
  approved_at?: string | null;
  received_at?: string | null;
  resolved_at?: string | null;
  policy_snapshot_json?: string | null;
  notes_internal?: string | null;
  notes_customer?: string | null;
  total_items_count: number;
  total_request_value?: number | null;
  exchange_order_id_external?: string | null;
  refund_transaction_id_external?: string | null;
  store_credit_ref_external?: string | null;
  bank_iban_enc?: string | null;
  is_warranty: boolean;
  customer_cancelled_at?: string | null;
};

function normalize(row: any): ReturnRequestRow {
  return { ...row, ROWID: String(row.ROWID), tenant_id: String(row.tenant_id) } as ReturnRequestRow;
}

export class ReturnRequestsRepo {
  static tableName = "return_requests";

  static async insert(req: any, row: Record<string, any>) {
    if (row.tenant_id != null) row.tenant_id = assertRowIdDigits(row.tenant_id);
    return getCatalystApp(req).datastore().table(this.tableName).insertRow(row);
  }

  static async update(req: any, row: Record<string, any> & { ROWID: string | number }) {
    row.ROWID = assertRowIdDigits(row.ROWID);
    if (row.tenant_id != null) row.tenant_id = assertRowIdDigits(row.tenant_id);
    return getCatalystApp(req).datastore().table(this.tableName).updateRow(row);
  }

  static async deleteById(req: any, rowId: string | number) {
    return getCatalystApp(req).datastore().table(this.tableName).deleteRow(assertRowIdDigits(rowId) as any);
  }

  static async findByReturnNumber(req: any, tenantId: string | number, returnNumber: string): Promise<ReturnRequestRow | null> {
    const tid = assertRowIdDigits(tenantId);
    const res = await getCatalystApp(req)
      .zcql()
      .executeZCQLQuery(`SELECT * FROM ${this.tableName} WHERE tenant_id = ${tid} AND return_number = ${q(returnNumber)} LIMIT 1`);
    return res?.length ? normalize(res[0][this.tableName]) : null;
  }

  static async listByOrderNumber(req: any, tenantId: string | number, orderNumber: string): Promise<ReturnRequestRow[]> {
    const tid = assertRowIdDigits(tenantId);
    const res = await getCatalystApp(req)
      .zcql()
      .executeZCQLQuery(
        `SELECT * FROM ${this.tableName} WHERE tenant_id = ${tid} AND order_number = ${q(orderNumber)} ORDER BY CREATEDTIME DESC LIMIT 200`
      );
    return (res ?? []).map((r: any) => normalize(r[this.tableName]));
  }

  static async listByTenant(
    req: any,
    tenantId: string | number,
    args?: { status?: string; limit?: number; search?: string }
  ): Promise<ReturnRequestRow[]> {
    const tid = assertRowIdDigits(tenantId);
    const limit = Math.max(1, Math.min(200, Number(args?.limit ?? 200)));
    const where: string[] = [`tenant_id = ${tid}`];
    const status = String(args?.status ?? "").trim();
    if (status) where.push(`status = ${q(status)}`);
    const search = String(args?.search ?? "").trim();
    if (search) where.push(`(return_number like ${q(`%${search}%`)} OR order_number like ${q(`%${search}%`)})`);
    const res = await getCatalystApp(req)
      .zcql()
      .executeZCQLQuery(`SELECT * FROM ${this.tableName} WHERE ${where.join(" AND ")} ORDER BY CREATEDTIME DESC LIMIT ${limit}`);
    return (res ?? []).map((r: any) => normalize(r[this.tableName]));
  }

  static async countByTenant(req: any, tenantId: string | number, status?: string): Promise<number> {
    const tid = assertRowIdDigits(tenantId);
    const where = status ? `tenant_id = ${tid} AND status = ${q(status)}` : `tenant_id = ${tid}`;
    const res = await getCatalystApp(req).zcql().executeZCQLQuery(`SELECT COUNT(ROWID) FROM ${this.tableName} WHERE ${where}`);
    const rowObj = res?.[0]?.[this.tableName] ?? res?.[0];
    return Number(rowObj?.["COUNT(ROWID)"] ?? 0);
  }
}
