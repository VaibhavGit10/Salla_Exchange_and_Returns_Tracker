// appsail/src/repositories/returnShipments.repo.ts
// Reverse-logistics records (table return_shipments). mode = auto (Salla AWB) | manual (instructions).
import { getCatalystApp } from "../lib/catalyst";
import { nowCatalyst } from "../lib/datetime";

function assertRowIdDigits(id: string | number): string {
  const v = String(id);
  if (!/^\d+$/.test(v)) throw new Error("ROWID/FK must be digits");
  return v;
}

export type ReturnShipmentRow = {
  ROWID: string;
  tenant_id: string;
  return_request_id: string;
  mode: string;
  carrier_name?: string | null;
  tracking_number?: string | null;
  tracking_url?: string | null;
  shipment_id_external?: string | null;
  status: string;
  status_last_updated_at?: string | null;
  label_attachment_id?: string | null;
  raw_tracking_json?: string | null;
};

export class ReturnShipmentsRepo {
  static tableName = "return_shipments";

  static async insert(req: any, row: {
    tenant_id: string | number;
    return_request_id: string | number;
    mode: "auto" | "manual";
    carrier_name?: string | null;
    tracking_number?: string | null;
    tracking_url?: string | null;
    shipment_id_external?: string | null;
    status?: string;
    raw_tracking_json?: string | null;
  }): Promise<any> {
    return getCatalystApp(req).datastore().table(this.tableName).insertRow({
      tenant_id: assertRowIdDigits(row.tenant_id),
      return_request_id: assertRowIdDigits(row.return_request_id),
      mode: row.mode,
      carrier_name: row.carrier_name ?? null,
      tracking_number: row.tracking_number ?? null,
      tracking_url: row.tracking_url ?? null,
      shipment_id_external: row.shipment_id_external ?? null,
      status: row.status ?? "created",
      status_last_updated_at: nowCatalyst(),
      raw_tracking_json: row.raw_tracking_json ?? null,
    });
  }

  static async update(req: any, rowId: string | number, patch: Partial<Pick<ReturnShipmentRow, "status" | "tracking_number" | "tracking_url" | "shipment_id_external" | "carrier_name" | "raw_tracking_json">>) {
    return getCatalystApp(req).datastore().table(this.tableName).updateRow({ ROWID: assertRowIdDigits(rowId), ...patch, status_last_updated_at: nowCatalyst() });
  }

  static async findByReturnRequest(req: any, tenantId: string | number, returnRequestId: string | number): Promise<ReturnShipmentRow | null> {
    const tid = assertRowIdDigits(tenantId);
    const rrid = assertRowIdDigits(returnRequestId);
    const res = await getCatalystApp(req)
      .zcql()
      .executeZCQLQuery(`SELECT * FROM ${this.tableName} WHERE tenant_id = ${tid} AND return_request_id = ${rrid} ORDER BY CREATEDTIME DESC LIMIT 1`);
    if (!res?.length) return null;
    const row = res[0][this.tableName];
    return { ...row, ROWID: String(row.ROWID), tenant_id: String(row.tenant_id), return_request_id: String(row.return_request_id) } as ReturnShipmentRow;
  }
}
