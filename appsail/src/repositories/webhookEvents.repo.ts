// appsail/src/repositories/webhookEvents.repo.ts
// Webhook idempotency + audit log → table `webhook_events_salla`.
// Dedup key = store_id + event_type + event_id_external (stored in idempotency_key, which is UNIQUE).
// The unique index makes the insert itself the dedup gate; we also pre-check to short-circuit.
import { getCatalystApp } from "../lib/catalyst";
import { nowCatalyst } from "../lib/datetime";

function q(value: string): string {
  return `'${String(value).replace(/'/g, "''")}'`;
}
function assertRowIdDigits(id: string | number): string {
  const v = String(id ?? "").trim();
  if (!/^\d+$/.test(v)) throw new Error("ROWID/FK must be digits");
  return v;
}
function clamp(s: string, max: number): string {
  const v = String(s ?? "");
  return v.length <= max ? v : v.slice(0, max);
}

export type WebhookEventRow = {
  ROWID: string;
  tenant_id?: string | null;
  event_type: string;
  event_id_external?: string | null;
  idempotency_key: string;
  signature_valid: boolean;
  process_status?: string | null;
  payload_json?: string | null;
  received_at?: string | null;
  processed_at?: string | null;
  failure_reason?: string | null;
  retry_count?: number | null;
};

export class WebhookEventsRepo {
  static tableName = "webhook_events_salla";

  static makeIdempotencyKey(storeId: string | null, eventType: string, externalId: string): string {
    return clamp(`${storeId ?? "unknown"}:${eventType}:${externalId}`, 240);
  }

  static async findByIdempotencyKey(req: any, key: string): Promise<WebhookEventRow | null> {
    const res = await getCatalystApp(req)
      .zcql()
      .executeZCQLQuery(`SELECT * FROM ${this.tableName} WHERE idempotency_key = ${q(key)} LIMIT 1`);
    if (!res?.length) return null;
    const row = res[0][this.tableName] as any;
    return { ...row, ROWID: String(row.ROWID) } as WebhookEventRow;
  }

  /** Insert a pending event. Returns the inserted row, or null if it's a duplicate (unique violation). */
  static async insertPending(req: any, args: {
    tenant_id?: string | null;
    event_type: string;
    event_id_external?: string | null;
    idempotency_key: string;
    signature_valid: boolean;
    payload_json: string;
  }): Promise<any | null> {
    const row: Record<string, any> = {
      event_type: clamp(String(args.event_type ?? "unknown"), 200),
      event_id_external: args.event_id_external ? clamp(String(args.event_id_external), 200) : null,
      idempotency_key: clamp(String(args.idempotency_key), 240),
      signature_valid: Boolean(args.signature_valid),
      payload_json: String(args.payload_json ?? "{}"),
      received_at: nowCatalyst(),
      process_status: "pending",
      retry_count: 0,
    };
    if (args.tenant_id) row.tenant_id = assertRowIdDigits(args.tenant_id);

    try {
      return await getCatalystApp(req).datastore().table(this.tableName).insertRow(row);
    } catch (e: any) {
      const msg = String(e?.message ?? "").toLowerCase();
      if (msg.includes("unique") || msg.includes("duplicate")) return null; // already recorded → dedup
      throw e;
    }
  }

  static async markProcessed(req: any, rowId: string | number, status: "processed" | "failed" | "skipped", failureReason?: string): Promise<void> {
    await getCatalystApp(req)
      .datastore()
      .table(this.tableName)
      .updateRow({
        ROWID: assertRowIdDigits(rowId),
        process_status: status,
        processed_at: nowCatalyst(),
        ...(failureReason ? { failure_reason: clamp(failureReason, 250) } : {}),
      })
      .catch(() => {});
  }
}
