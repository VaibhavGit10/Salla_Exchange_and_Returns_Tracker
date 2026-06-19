// appsail/src/repositories/tenants.repo.ts
// Tenant = one Salla store. Keyed by salla_store_id (from the introspected embedded token /
// authorize webhook). ROWID is the internal FK used by every other table.
// Two-layer cache (L1 in-memory + L2 Catalyst Cache) keeps tenant resolution off the hot path
// so we never re-query DataStore for the same store within the 5-min TTL.
import { getCatalystApp } from "../lib/catalyst";
import { cacheGet, cachePut, cacheDelete } from "../lib/catalystCache";
import { nowCatalyst } from "../lib/datetime";

const CACHE_TTL_MS = 5 * 60 * 1000;

function q(value: string): string {
  return `'${String(value).replace(/'/g, "''")}'`;
}
function assertRowIdDigits(id: string | number): string {
  const v = String(id ?? "").trim();
  if (!/^\d+$/.test(v)) throw new Error("ROWID/FK must be digits");
  return v;
}
function slugify(input: string): string {
  return String(input || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}
function safeJsonParse(input: any): any {
  if (input == null) return null;
  if (typeof input === "object") return input;
  try {
    return JSON.parse(String(input));
  } catch {
    return null;
  }
}
function deepMerge(target: any, patch: any): any {
  if (!patch || typeof patch !== "object") return target;
  const out = Array.isArray(target) ? [...target] : { ...(target ?? {}) };
  for (const [k, v] of Object.entries(patch)) {
    out[k] = v && typeof v === "object" && !Array.isArray(v) ? deepMerge(out[k], v) : v;
  }
  return out;
}

export type TenantRow = {
  ROWID: string;
  salla_store_id: string;
  store_name: string;
  store_domain?: string | null;
  timezone?: string | null;
  plan_code: string;
  flags_json?: string | null;
  status: string;
  portal_public_slug: string;
};

const ALLOWED_CONNECTION_COLUMNS = new Set(["salla_store_id", "store_name", "store_domain", "status", "plan_code"]);

export class TenantsRepo {
  static tableName = "tenants";
  private static memCache = new Map<string, { row: TenantRow; exp: number }>();

  private static normalize(match: any): TenantRow {
    return {
      ROWID: String(match.ROWID),
      salla_store_id: String(match.salla_store_id ?? ""),
      store_name: String(match.store_name ?? ""),
      store_domain: match.store_domain ?? null,
      timezone: match.timezone ?? null,
      plan_code: String(match.plan_code ?? "free"),
      flags_json: match.flags_json ?? null,
      status: String(match.status ?? ""),
      portal_public_slug: String(match.portal_public_slug ?? ""),
    };
  }

  private static async setCache(req: any, key: string, row: TenantRow): Promise<void> {
    this.memCache.set(key, { row, exp: Date.now() + CACHE_TTL_MS });
    await cachePut(req, `tenant:${key}`, row, CACHE_TTL_MS);
  }
  private static async getCache(req: any, key: string): Promise<TenantRow | null> {
    const mem = this.memCache.get(key);
    if (mem && mem.exp > Date.now()) return mem.row;
    const cached = await cacheGet<TenantRow>(req, `tenant:${key}`);
    if (cached) {
      this.memCache.set(key, { row: cached, exp: Date.now() + CACHE_TTL_MS });
      return cached;
    }
    return null;
  }
  private static async invalidate(req: any, tenantId: string): Promise<void> {
    for (const [key, cached] of this.memCache.entries()) {
      if (cached.row.ROWID === tenantId) {
        this.memCache.delete(key);
        await cacheDelete(req, `tenant:${key}`);
      }
    }
  }

  static async findBySallaStoreId(req: any, sallaStoreId: string | number): Promise<TenantRow | null> {
    const target = String(sallaStoreId ?? "").trim();
    if (!target) return null;
    const cacheKey = `store:${target}`;
    const cached = await this.getCache(req, cacheKey);
    if (cached) return cached;

    const res = await getCatalystApp(req)
      .zcql()
      .executeZCQLQuery(`SELECT * FROM ${this.tableName} WHERE salla_store_id = ${q(target)} LIMIT 1`);
    if (!res?.length) return null;
    const row = this.normalize(res[0][this.tableName]);
    await this.setCache(req, cacheKey, row);
    return row;
  }

  static async findByPortalSlug(req: any, slug: string): Promise<TenantRow | null> {
    const key = slugify(slug);
    if (!key) return null;
    const cached = await this.getCache(req, `slug:${key}`);
    if (cached) return cached;

    const res = await getCatalystApp(req)
      .zcql()
      .executeZCQLQuery(`SELECT * FROM ${this.tableName} WHERE portal_public_slug = ${q(key)} LIMIT 1`);
    if (!res?.length) return null;
    const row = this.normalize(res[0][this.tableName]);
    await this.setCache(req, `slug:${key}`, row);
    return row;
  }

  static async getById(req: any, tenantId: string | number): Promise<TenantRow | null> {
    const tid = assertRowIdDigits(tenantId);
    const row = await getCatalystApp(req).datastore().table(this.tableName).getRow(tid as any).catch(() => null);
    return row ? this.normalize(row) : null;
  }

  /** Resolve a tenant by store id, creating a minimal row on first sight (idempotent). */
  static async ensureByStoreId(
    req: any,
    sallaStoreId: string | number,
    seed?: { store_name?: string; store_domain?: string | null; status?: string }
  ): Promise<TenantRow> {
    const storeId = String(sallaStoreId ?? "").trim();
    if (!storeId) throw new Error("ensureByStoreId: store id required");

    const existing = await this.findBySallaStoreId(req, storeId);
    if (existing) return existing;

    const slugBase = slugify(seed?.store_name || "") || `store-${storeId}`;
    const portal_public_slug = `${slugBase}-${storeId}`.slice(0, 60);

    const table = getCatalystApp(req).datastore().table(this.tableName);
    const inserted: any = await table.insertRow({
      salla_store_id: storeId,
      store_name: seed?.store_name ?? "",
      store_domain: seed?.store_domain ?? null,
      timezone: "Asia/Riyadh",
      plan_code: "free",
      status: seed?.status ?? "pending",
      portal_public_slug,
      flags_json: null,
    });
    const row = this.normalize({ ...inserted, salla_store_id: storeId, portal_public_slug });
    await this.invalidate(req, row.ROWID);
    return row;
  }

  static async updateConnectionFields(
    req: any,
    tenantId: string | number,
    patch: Partial<Pick<TenantRow, "salla_store_id" | "store_name" | "store_domain" | "status" | "plan_code">>
  ): Promise<void> {
    const tid = assertRowIdDigits(tenantId);
    const payload: Record<string, any> = { ROWID: tid };
    for (const [k, v] of Object.entries(patch)) {
      if (ALLOWED_CONNECTION_COLUMNS.has(k) && v !== undefined) payload[k] = v;
    }
    await getCatalystApp(req).datastore().table(this.tableName).updateRow(payload as any);
    await this.invalidate(req, tid);
  }

  static async getFlagsObject(req: any, tenantId: string | number): Promise<Record<string, any>> {
    const row = await this.getById(req, tenantId);
    const flags = safeJsonParse(row?.flags_json);
    return flags && typeof flags === "object" && !Array.isArray(flags) ? flags : {};
  }

  static async mergeFlagsObject(req: any, tenantId: string | number, patch: Record<string, any>): Promise<Record<string, any>> {
    const tid = assertRowIdDigits(tenantId);
    const merged = deepMerge(await this.getFlagsObject(req, tid), patch);
    await getCatalystApp(req).datastore().table(this.tableName).updateRow({ ROWID: tid, flags_json: JSON.stringify(merged) });
    await this.invalidate(req, tid);
    return merged;
  }

  static async touchInstalledAt(req: any, tenantId: string | number): Promise<void> {
    // best-effort marker in flags (avoids needing a dedicated column)
    await this.mergeFlagsObject(req, tenantId, { lifecycle: { last_authorized_at: nowCatalyst() } }).catch(() => {});
  }
}
