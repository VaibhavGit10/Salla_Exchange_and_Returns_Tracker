// appsail/src/repositories/returnItems.repo.ts
import { getCatalystApp } from "../lib/catalyst";

function assertRowIdDigits(id: string | number): string {
  const v = String(id);
  if (!/^\d+$/.test(v)) throw new Error("ROWID/FK must be digits");
  return v;
}

export type ReturnItemRow = {
  ROWID: string;
  tenant_id: string;
  return_request_id: string;
  order_item_id_external?: string | null;
  sku: string;
  product_name?: string | null;
  variant_name?: string | null;
  category_id_external?: string | null;
  quantity: number;
  unit_price?: number | null;
  reason_code: string;
  reason_note?: string | null;
  decision: string;
  exchange_variant_id?: string | null; // additive (see DATASTORE_SCHEMA.md)
};

export class ReturnItemsRepo {
  static tableName = "return_items";

  static async insert(req: any, row: Record<string, any>) {
    if (row.tenant_id != null) row.tenant_id = assertRowIdDigits(row.tenant_id);
    if (row.return_request_id != null) row.return_request_id = assertRowIdDigits(row.return_request_id);
    return getCatalystApp(req).datastore().table(this.tableName).insertRow(row);
  }

  static async bulkInsert(req: any, rows: Record<string, any>[], concurrency = 5) {
    const queue = [...rows];
    const results: any[] = [];
    await Promise.all(
      new Array(Math.max(1, concurrency)).fill(0).map(async () => {
        while (queue.length) {
          const row = queue.shift();
          if (!row) break;
          results.push(await this.insert(req, row));
        }
      })
    );
    return results;
  }

  static async update(req: any, row: Record<string, any> & { ROWID: string | number }) {
    const payload: any = { ...row, ROWID: assertRowIdDigits(row.ROWID) };
    if (payload.tenant_id != null) payload.tenant_id = assertRowIdDigits(payload.tenant_id);
    if (payload.return_request_id != null) payload.return_request_id = assertRowIdDigits(payload.return_request_id);
    return getCatalystApp(req).datastore().table(this.tableName).updateRow(payload);
  }

  static async bulkUpdate(req: any, rows: Array<Record<string, any> & { ROWID: string | number }>, concurrency = 5) {
    const queue = [...rows];
    const results: any[] = [];
    await Promise.all(
      new Array(Math.max(1, concurrency)).fill(0).map(async () => {
        while (queue.length) {
          const row = queue.shift();
          if (!row) break;
          results.push(await this.update(req, row));
        }
      })
    );
    return results;
  }

  static async listByReturnRequestId(req: any, tenantId: string | number, returnRequestId: string | number): Promise<ReturnItemRow[]> {
    const tid = assertRowIdDigits(tenantId);
    const rrid = assertRowIdDigits(returnRequestId);
    const res = await getCatalystApp(req)
      .zcql()
      .executeZCQLQuery(
        `SELECT * FROM ${this.tableName} WHERE tenant_id = ${tid} AND return_request_id = ${rrid} ORDER BY CREATEDTIME ASC LIMIT 200`
      );
    return (res ?? []).map((r: any) => {
      const row = r[this.tableName];
      return { ...row, ROWID: String(row.ROWID), tenant_id: String(row.tenant_id ?? ""), return_request_id: String(row.return_request_id ?? "") } as ReturnItemRow;
    });
  }

  static async deleteByReturnRequestId(req: any, tenantId: string | number, returnRequestId: string | number) {
    const rows = await this.listByReturnRequestId(req, tenantId, returnRequestId);
    const table = getCatalystApp(req).datastore().table(this.tableName);
    for (const r of rows) await table.deleteRow(String(r.ROWID) as any);
  }
}
