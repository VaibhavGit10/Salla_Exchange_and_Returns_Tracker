// appsail/src/repositories/otpSessions.repo.ts
import { getCatalystApp } from "../lib/catalyst";
import { toCatalystDateTime, nowCatalyst } from "../lib/datetime";

function q(value: string): string {
  return `'${String(value).replace(/'/g, "''")}'`;
}
function assertRowIdDigits(id: string): string {
  if (!/^\d+$/.test(id)) throw new Error("tenant_id must be tenants.ROWID digits");
  return id;
}

export type OtpSessionRow = {
  ROWID: number;
  tenant_id: string;
  channel: string;
  contact_hash: string;
  order_number: string;
  otp_hash: string;
  expires_at: string;
  attempt_count: number;
  max_attempts: number;
  locked_until?: string | null;
  verified_at?: string | null;
  request_ip?: string | null;
  user_agent?: string | null;
};

export class OtpSessionsRepo {
  static tableName = "otp_sessions";

  static async insert(req: any, row: Record<string, any>) {
    row.tenant_id = assertRowIdDigits(String(row.tenant_id));
    return getCatalystApp(req).datastore().table(this.tableName).insertRow(row);
  }

  static async countRecentRequests(req: any, tenantId: string, channel: string, contactHash: string, windowStart: Date): Promise<number> {
    const tid = assertRowIdDigits(tenantId);
    const res = await getCatalystApp(req)
      .zcql()
      .executeZCQLQuery(
        `SELECT COUNT(ROWID) FROM ${this.tableName} WHERE tenant_id = ${tid} AND channel = ${q(channel)} AND contact_hash = ${q(contactHash)} AND CREATEDTIME >= ${q(toCatalystDateTime(windowStart))}`
      );
    const rowObj = res?.[0]?.[this.tableName] ?? res?.[0];
    return Number(rowObj?.["COUNT(ROWID)"] ?? 0);
  }

  static async findLatestActive(req: any, tenantId: string, channel: string, contactHash: string, orderNumber: string): Promise<OtpSessionRow | null> {
    const tid = assertRowIdDigits(tenantId);
    const nowStr = nowCatalyst();
    const res = await getCatalystApp(req)
      .zcql()
      .executeZCQLQuery(
        `SELECT * FROM ${this.tableName} WHERE tenant_id = ${tid} AND channel = ${q(channel)} AND contact_hash = ${q(contactHash)} AND order_number = ${q(orderNumber)} AND expires_at > ${q(nowStr)} AND verified_at IS NULL AND (locked_until IS NULL OR locked_until <= ${q(nowStr)}) ORDER BY CREATEDTIME DESC LIMIT 1`
      );
    if (!res?.length) return null;
    const row = res[0][this.tableName] as any;
    row.tenant_id = String(row.tenant_id);
    return row as OtpSessionRow;
  }

  static async incrementAttempt(req: any, rowId: number, nextAttempt: number, lockedUntil: string | null) {
    const update: any = { ROWID: rowId, attempt_count: nextAttempt };
    if (lockedUntil !== null) update.locked_until = lockedUntil;
    return getCatalystApp(req).datastore().table(this.tableName).updateRow(update);
  }

  static async markVerified(req: any, rowId: number) {
    return getCatalystApp(req).datastore().table(this.tableName).updateRow({ ROWID: rowId, verified_at: nowCatalyst() });
  }
}
