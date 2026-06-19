// appsail/src/repositories/returnAttachments.repo.ts
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

export type ReturnAttachmentRow = {
  ROWID: string;
  tenant_id: string;
  return_request_id: string;
  file_role: string;
  filestore_path: string;
  content_type: string;
  file_size_bytes: number;
  checksum_sha256?: string | null;
  uploaded_by_actor_type?: string | null;
  uploaded_by_actor_id?: string | null;
  is_deleted?: boolean;
  deleted_at?: string | null;
  meta_json?: string | null;
};

export class ReturnAttachmentsRepo {
  static tableName = "return_attachments";

  static async insert(req: any, row: Record<string, any>) {
    if (row.tenant_id != null) row.tenant_id = assertRowIdDigits(row.tenant_id);
    if (row.return_request_id != null) row.return_request_id = assertRowIdDigits(row.return_request_id);
    if (row.is_deleted == null) row.is_deleted = false;
    return getCatalystApp(req).datastore().table(this.tableName).insertRow(row);
  }

  static async countByReturnRequest(req: any, tenantId: string | number, returnRequestId: string | number): Promise<number> {
    const tid = assertRowIdDigits(tenantId);
    const rrid = assertRowIdDigits(returnRequestId);
    const res = await getCatalystApp(req)
      .zcql()
      .executeZCQLQuery(
        `SELECT COUNT(ROWID) FROM ${this.tableName} WHERE tenant_id = ${tid} AND return_request_id = ${rrid} AND is_deleted = false`
      );
    const rowObj = res?.[0]?.[this.tableName] ?? res?.[0];
    return Number(rowObj?.["COUNT(ROWID)"] ?? 0);
  }

  static async listByReturnRequest(req: any, tenantId: string | number, returnRequestId: string | number): Promise<ReturnAttachmentRow[]> {
    const tid = assertRowIdDigits(tenantId);
    const rrid = assertRowIdDigits(returnRequestId);
    const res = await getCatalystApp(req)
      .zcql()
      .executeZCQLQuery(
        `SELECT * FROM ${this.tableName} WHERE tenant_id = ${tid} AND return_request_id = ${rrid} AND is_deleted = false ORDER BY CREATEDTIME ASC LIMIT 50`
      );
    return (res ?? []).map((r: any) => {
      const row = r[this.tableName];
      return { ...row, ROWID: String(row.ROWID), tenant_id: String(row.tenant_id ?? ""), return_request_id: String(row.return_request_id ?? "") } as ReturnAttachmentRow;
    });
  }

  static async findByFilestorePath(req: any, tenantId: string | number, filestorePath: string): Promise<ReturnAttachmentRow | null> {
    const tid = assertRowIdDigits(tenantId);
    const res = await getCatalystApp(req)
      .zcql()
      .executeZCQLQuery(`SELECT * FROM ${this.tableName} WHERE tenant_id = ${tid} AND filestore_path = ${q(filestorePath)} LIMIT 1`);
    if (!res?.length) return null;
    const row = res[0][this.tableName];
    return { ...row, ROWID: String(row.ROWID), tenant_id: String(row.tenant_id ?? "") } as ReturnAttachmentRow;
  }

  static async softDelete(req: any, rowId: string | number) {
    return getCatalystApp(req)
      .datastore()
      .table(this.tableName)
      .updateRow({ ROWID: assertRowIdDigits(rowId), is_deleted: true, deleted_at: nowCatalyst() });
  }
}
