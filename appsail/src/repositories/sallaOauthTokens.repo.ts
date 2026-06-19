// appsail/src/repositories/sallaOauthTokens.repo.ts
// Encrypted Salla OAuth tokens, one row per tenant. access/refresh stored AES-256-GCM encrypted.
import { getCatalystApp } from "../lib/catalyst";

function assertRowIdDigits(id: string | number): string {
  const v = String(id ?? "").trim();
  if (!/^\d+$/.test(v)) throw new Error("ROWID/FK must be digits");
  return v;
}

const ALLOWED_COLUMNS = new Set([
  "tenant_id",
  "access_token_enc",
  "refresh_token_enc",
  "token_type",
  "scopes",
  "access_token_expires_at",
  "last_token_refresh_at",
  "token_status",
  "installed_at",
  "uninstalled_at",
  "tenant_unique_key",
]);

function pickAllowed(patch: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(patch)) if (ALLOWED_COLUMNS.has(k)) out[k] = v;
  return out;
}

export type SallaOauthTokenRow = {
  ROWID: string;
  tenant_id: string;
  access_token_enc: string;
  refresh_token_enc?: string | null;
  token_type?: string | null;
  scopes?: string | null;
  access_token_expires_at?: string | null;
  last_token_refresh_at?: string | null;
  token_status: string;
  installed_at?: string | null;
  uninstalled_at?: string | null;
  tenant_unique_key?: string | null;
};

export class SallaOauthTokensRepo {
  static tableName = "salla_oauth_tokens";

  static async findByTenantId(req: any, tenantId: string | number): Promise<SallaOauthTokenRow | null> {
    const tid = assertRowIdDigits(tenantId);
    const res = await getCatalystApp(req)
      .zcql()
      .executeZCQLQuery(`SELECT * FROM ${this.tableName} WHERE tenant_id = ${tid} LIMIT 1`);
    if (!res?.length) return null;
    const row = res[0][this.tableName] as any;
    return { ...row, ROWID: String(row.ROWID), tenant_id: String(row.tenant_id) } as SallaOauthTokenRow;
  }

  static async insert(req: any, row: Record<string, any>) {
    const payload = pickAllowed(row);
    if (payload.tenant_id != null) payload.tenant_id = assertRowIdDigits(payload.tenant_id);
    return getCatalystApp(req).datastore().table(this.tableName).insertRow(payload);
  }

  static async update(req: any, row: Record<string, any> & { ROWID: string | number }) {
    const payload = pickAllowed(row);
    payload.ROWID = assertRowIdDigits(row.ROWID);
    if (payload.tenant_id != null) payload.tenant_id = assertRowIdDigits(payload.tenant_id);
    return getCatalystApp(req).datastore().table(this.tableName).updateRow(payload as any);
  }

  static async upsertByTenant(req: any, tenantId: string | number, patch: Record<string, any>) {
    const tid = assertRowIdDigits(tenantId);
    const existing = await this.findByTenantId(req, tid);
    if (!existing) return this.insert(req, { tenant_id: tid, ...patch });
    return this.update(req, { ROWID: existing.ROWID, tenant_id: tid, ...patch });
  }

  static async revoke(req: any, tenantId: string | number, uninstalledAt?: string) {
    const tid = assertRowIdDigits(tenantId);
    return this.upsertByTenant(req, tid, {
      token_status: "revoked",
      access_token_enc: "__revoked__",
      refresh_token_enc: "__revoked__",
      ...(uninstalledAt ? { uninstalled_at: uninstalledAt } : {}),
    });
  }
}
