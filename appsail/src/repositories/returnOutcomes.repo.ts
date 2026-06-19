// appsail/src/repositories/returnOutcomes.repo.ts
// Resolution-execution ledger (table return_outcomes). One row per resolution attempt; records
// the Salla provider response and final status. sallaResolution (P3) writes here.
import { getCatalystApp } from "../lib/catalyst";

function assertRowIdDigits(id: string | number): string {
  const v = String(id);
  if (!/^\d+$/.test(v)) throw new Error("ROWID/FK must be digits");
  return v;
}

export type OutcomeType = "refund" | "exchange" | "store_credit";
export type OutcomeStatus = "pending" | "completed" | "failed";

export type ReturnOutcomeRow = {
  ROWID: string;
  tenant_id: string;
  return_request_id: string;
  outcome_type: string;
  outcome_amount?: number | null;
  currency?: string | null;
  status: string;
  completed_at?: string | null;
  reference_id_external?: string | null;
  raw_provider_response_json?: string | null;
  failure_reason?: string | null;
};

export class ReturnOutcomesRepo {
  static tableName = "return_outcomes";

  static async insert(req: any, row: {
    tenant_id: string | number;
    return_request_id: string | number;
    outcome_type: OutcomeType;
    outcome_amount?: number | null;
    currency?: string;
    status?: OutcomeStatus;
  }): Promise<any> {
    return getCatalystApp(req).datastore().table(this.tableName).insertRow({
      tenant_id: assertRowIdDigits(row.tenant_id),
      return_request_id: assertRowIdDigits(row.return_request_id),
      outcome_type: row.outcome_type,
      outcome_amount: row.outcome_amount ?? null,
      currency: row.currency ?? "SAR",
      status: row.status ?? "pending",
    });
  }

  static async update(req: any, rowId: string | number, patch: Partial<Pick<ReturnOutcomeRow, "status" | "completed_at" | "reference_id_external" | "raw_provider_response_json" | "failure_reason">>) {
    return getCatalystApp(req).datastore().table(this.tableName).updateRow({ ROWID: assertRowIdDigits(rowId), ...patch });
  }

  static async listByReturnRequest(req: any, tenantId: string | number, returnRequestId: string | number): Promise<ReturnOutcomeRow[]> {
    const tid = assertRowIdDigits(tenantId);
    const rrid = assertRowIdDigits(returnRequestId);
    const res = await getCatalystApp(req)
      .zcql()
      .executeZCQLQuery(`SELECT * FROM ${this.tableName} WHERE tenant_id = ${tid} AND return_request_id = ${rrid} ORDER BY CREATEDTIME DESC LIMIT 50`);
    return (res ?? []).map((r: any) => {
      const row = r[this.tableName];
      return { ...row, ROWID: String(row.ROWID), tenant_id: String(row.tenant_id), return_request_id: String(row.return_request_id) } as ReturnOutcomeRow;
    });
  }
}
