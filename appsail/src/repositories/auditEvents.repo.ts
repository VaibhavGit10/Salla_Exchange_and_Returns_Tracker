// appsail/src/repositories/auditEvents.repo.ts
// Matches the real audit_events schema: entity_type, entity_rowid (bigint), event_type,
// actor_type, actor_id, before_json, after_json, meta_json, event_time. Best-effort (never breaks
// the main flow).
import { getCatalystApp } from "../lib/catalyst";
import { logger } from "../lib/logger";
import { nowCatalyst } from "../lib/datetime";

function q(value: string): string {
  return `'${String(value).replace(/'/g, "''")}'`;
}
function assertRowIdDigits(id: string | number): string {
  const v = String(id);
  if (!/^\d+$/.test(v)) throw new Error("ROWID/FK must be digits");
  return v;
}

export type AuditLogInput = {
  tenant_id: string | number;
  entity_type: string;
  entity_rowid: string | number;
  event_type: string;
  actor_type?: string;
  actor_id?: string | null;
  before?: any;
  after?: any;
  meta?: any;
};

export class AuditEventsRepo {
  static tableName = "audit_events";

  static async log(req: any, input: AuditLogInput): Promise<any | null> {
    try {
      const payload: Record<string, any> = {
        tenant_id: assertRowIdDigits(input.tenant_id),
        entity_type: String(input.entity_type),
        entity_rowid: assertRowIdDigits(input.entity_rowid),
        event_type: String(input.event_type),
        actor_type: String(input.actor_type ?? "system"),
        actor_id: input.actor_id != null ? String(input.actor_id) : null,
        before_json: input.before != null ? JSON.stringify(input.before) : null,
        after_json: input.after != null ? JSON.stringify(input.after) : null,
        meta_json: input.meta != null ? JSON.stringify(input.meta) : null,
        event_time: nowCatalyst(),
      };
      return await getCatalystApp(req).datastore().table(this.tableName).insertRow(payload);
    } catch (e: any) {
      logger.warn({ requestId: req?.requestId, err: e?.message }, "audit insert failed (ignored)");
      return null;
    }
  }

  static async listByEntity(req: any, tenantId: string | number, entityType: string, entityRowId: string | number): Promise<any[]> {
    try {
      const tid = assertRowIdDigits(tenantId);
      const eid = assertRowIdDigits(entityRowId);
      const res = await getCatalystApp(req)
        .zcql()
        .executeZCQLQuery(
          `SELECT * FROM ${this.tableName} WHERE tenant_id = ${tid} AND entity_type = ${q(entityType)} AND entity_rowid = ${eid} ORDER BY CREATEDTIME ASC LIMIT 200`
        );
      return (res ?? []).map((r: any) => {
        const row = r[this.tableName];
        row.ROWID = String(row.ROWID);
        return row;
      });
    } catch {
      return [];
    }
  }
}
