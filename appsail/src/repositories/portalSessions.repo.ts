// appsail/src/repositories/portalSessions.repo.ts
import { getCatalystApp } from "../lib/catalyst";
import { nowCatalyst } from "../lib/datetime";

function q(value: string): string {
  return `'${String(value).replace(/'/g, "''")}'`;
}

export type PortalSessionRow = {
  ROWID: string;
  tenant_id: string;
  session_token_hash: string;
  contact_hash: string;
  order_number: string;
  expires_at: string;
  created_ip?: string | null;
  last_seen_at?: string | null;
};

export class PortalSessionsRepo {
  static tableName = "portal_sessions";

  static async insert(req: any, row: Record<string, any>) {
    return getCatalystApp(req).datastore().table(this.tableName).insertRow(row);
  }

  /** Lookup by token hash only; expiry validated in Node to avoid TZ mismatch. */
  static async findByTokenHash(req: any, tokenHash: string): Promise<PortalSessionRow | null> {
    const res = await getCatalystApp(req)
      .zcql()
      .executeZCQLQuery(`SELECT * FROM ${this.tableName} WHERE session_token_hash = ${q(tokenHash)} ORDER BY CREATEDTIME DESC LIMIT 1`);
    if (!res?.length) return null;
    const row = res[0][this.tableName] as any;
    return {
      ...row,
      ROWID: String(row.ROWID),
      tenant_id: String(row.tenant_id),
      expires_at: String(row.expires_at),
      order_number: String(row.order_number),
      session_token_hash: String(row.session_token_hash),
      contact_hash: String(row.contact_hash),
    } as PortalSessionRow;
  }

  static async touchLastSeen(req: any, rowId: string) {
    return getCatalystApp(req).datastore().table(this.tableName).updateRow({ ROWID: rowId, last_seen_at: nowCatalyst() });
  }
}
