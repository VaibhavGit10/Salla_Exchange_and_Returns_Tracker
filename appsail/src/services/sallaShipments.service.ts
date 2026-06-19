// appsail/src/services/sallaShipments.service.ts
// Reverse logistics. On approval we create a return shipment: AUTO via Salla AWB when a carrier is
// available, else a MANUAL record (merchant return instructions shown to the customer).
//
// ⚠️ Salla shipment endpoints/payloads are PHASE-0 unverified — every call degrades to manual mode
// on error so approval never fails because of shipping.
import { env } from "../env";
import { sallaFetchJson } from "../lib/sallaApi";
import { retryWithBackoff } from "../lib/retryWithBackoff";
import { SallaOAuthService } from "./sallaOAuth.service";
import { ReturnShipmentsRepo } from "../repositories/returnShipments.repo";
import { logger } from "../lib/logger";

export type SallaShippingCompany = { id: number; name: string; logo?: string };
export type SallaShipment = { id: number; tracking_number?: string; tracking_link?: string; shipping_company?: SallaShippingCompany; status?: { id: number; name: string; slug: string } };
type SallaApiResponse<T> = { status: number; success: boolean; data: T };

export class SallaShipmentsService {
  static async getShippingCompanies(req: any, tenantId: string): Promise<SallaShippingCompany[]> {
    if (!env.SALLA_RETURN_AWB_AUTO) return []; // shippings scope not granted yet → don't fire a 401
    try {
      const token = await SallaOAuthService.getValidAccessTokenForTenant(req, tenantId);
      const resp = await retryWithBackoff(() => sallaFetchJson<SallaApiResponse<SallaShippingCompany[]>>(token, "/admin/v2/shipping/companies"));
      return resp?.data ?? [];
    } catch {
      return [];
    }
  }

  /** Try to create a Salla return AWB. Returns the shipment or null (→ caller uses manual mode). */
  static async tryCreateSallaReturnShipment(
    req: any,
    tenantId: string,
    args: { order_id: string | number; shipping_company_id?: number }
  ): Promise<SallaShipment | null> {
    // Phase-0: shipments/shipping APIs need `shippings.read_write` (currently 401). Skip the doomed
    // call until SALLA_RETURN_AWB_AUTO is enabled (scope granted + endpoint verified) → manual mode.
    if (!env.SALLA_RETURN_AWB_AUTO) return null;
    if (!args.shipping_company_id) return null;
    try {
      const token = await SallaOAuthService.getValidAccessTokenForTenant(req, tenantId);
      const resp = await retryWithBackoff(() =>
        sallaFetchJson<SallaApiResponse<SallaShipment>>(token, "/admin/v2/shipments", {
          method: "POST",
          body: { order_id: args.order_id, shipping_company_id: args.shipping_company_id, type: "return" },
        })
      );
      return resp?.data ?? null;
    } catch (err) {
      logger.warn({ err: (err as any)?.message }, "Salla return shipment creation failed → manual mode");
      return null;
    }
  }

  /**
   * Ensure a return_shipments row exists for an approved return.
   * Auto mode if a shipping_company_id is configured + Salla accepts; otherwise manual.
   */
  static async ensureOnApproval(
    req: any,
    tenantId: string,
    rr: { ROWID: string; order_id_external?: string | null; order_number: string },
    opts?: { shipping_company_id?: number }
  ): Promise<void> {
    const existing = await ReturnShipmentsRepo.findByReturnRequest(req, tenantId, rr.ROWID).catch(() => null);
    if (existing) return;

    const orderId = rr.order_id_external || rr.order_number;
    const shipment = opts?.shipping_company_id
      ? await this.tryCreateSallaReturnShipment(req, tenantId, { order_id: orderId, shipping_company_id: opts.shipping_company_id })
      : null;

    if (shipment) {
      await ReturnShipmentsRepo.insert(req, {
        tenant_id: tenantId,
        return_request_id: rr.ROWID,
        mode: "auto",
        carrier_name: shipment.shipping_company?.name ?? null,
        tracking_number: shipment.tracking_number ?? null,
        tracking_url: shipment.tracking_link ?? null,
        shipment_id_external: shipment.id != null ? String(shipment.id) : null,
        status: shipment.status?.slug ?? "created",
        raw_tracking_json: JSON.stringify(shipment),
      });
    } else {
      await ReturnShipmentsRepo.insert(req, { tenant_id: tenantId, return_request_id: rr.ROWID, mode: "manual", status: "awaiting_customer" });
    }
  }
}
