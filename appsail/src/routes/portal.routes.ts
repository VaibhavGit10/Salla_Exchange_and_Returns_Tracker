// appsail/src/routes/portal.routes.ts
// Customer return flow. Entry = storefront App-Snippet (loads this portal) or off-store link.
// Auth = order# + email OTP → portal session. Tenant resolved from portal_public_slug (never trusted
// for cross-tenant access — all reads/writes scope by the session's tenant_id).
import { Router } from "express";
import multer from "multer";
import { requestOtpSchema, verifyOtpSchema } from "../validators/portal.zod";
import { createReturnSchema, returnNumberParamSchema } from "../validators/returns.zod";
import { OtpService } from "../services/otp.service";
import { PortalAuthService } from "../services/portalAuth.service";
import { ReturnsService } from "../services/returns.service";
import { SallaOrdersService, orderTotal, orderCreatedAt, itemUnitPrice, orderSource, orderCustomerName, orderReceiver } from "../services/sallaOrders.service";
import { FileStoreService } from "../services/filestore.service";
import { ReturnRequestsRepo } from "../repositories/returnRequests.repo";
import { TenantsRepo } from "../repositories/tenants.repo";
import { authPortal } from "../middlewares/authPortal";
import { AppError } from "../lib/errors";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
export const portalRoutes = Router();

async function resolveTenantRowId(req: any, body: any): Promise<string> {
  if (body.tenant_id) return String(body.tenant_id);
  const slug = String(body.portal_public_slug ?? "").trim();
  if (!slug) throw new AppError(400, "portal_public_slug is required", "TENANT_REQUIRED");
  const tenant = await TenantsRepo.findByPortalSlug(req, slug);
  if (!tenant) throw new AppError(404, "Unknown store portal", "TENANT_NOT_FOUND");
  return String(tenant.ROWID);
}

portalRoutes.post("/request-otp", async (req: any, res, next) => {
  try {
    const body = requestOtpSchema.parse(req.body);
    const tenantId = await resolveTenantRowId(req, body);
    const result = await OtpService.requestOtp(req, {
      tenantId,
      orderNumber: body.order_number,
      channel: body.channel,
      contact: body.contact,
      requestIp: req.ip,
      userAgent: String(req.headers["user-agent"] || ""),
    });
    res.json(result);
  } catch (e) {
    next(e);
  }
});

portalRoutes.post("/verify-otp", async (req: any, res, next) => {
  try {
    const body = verifyOtpSchema.parse(req.body);
    const tenantId = await resolveTenantRowId(req, body);
    const result = await PortalAuthService.verifyOtpAndCreateSession(req, {
      tenantId,
      orderNumber: body.order_number,
      channel: body.channel,
      contact: body.contact,
      otp: body.otp,
      createdIp: req.ip,
    });
    res.json({ ok: true, ...result });
  } catch (e) {
    next(e);
  }
});

portalRoutes.get("/me", authPortal, (req: any, res) => {
  res.json({ ok: true, tenant_id: req.portalSession.tenant_id, order_number: req.portalSession.order_number, expires_at: req.portalSession.expires_at });
});

portalRoutes.get("/order-items", authPortal, async (req: any, res, next) => {
  try {
    const tenantId = String(req.tenantId);
    const orderNumber = String(req.portalSession.order_number);
    let order = await SallaOrdersService.findOrderByReference(req, tenantId, orderNumber);
    // Fallback: customer may have entered the internal Salla order id rather than the reference number.
    if (!order && /^\d+$/.test(orderNumber)) {
      order = await SallaOrdersService.getOrder(req, tenantId, orderNumber).catch(() => null as any);
    }
    if (!order) throw new AppError(404, "Order not found", "ORDER_NOT_FOUND");
    const items = await SallaOrdersService.getOrderItems(req, tenantId, order.id);
    res.json({
      ok: true,
      order: {
        id: order.id,
        reference_id: order.reference_id,
        status: order.status,
        // normalized total works for both list (top-level `total`) and detail (`amounts.total`)
        total: orderTotal(order),
        amounts: order.amounts,
        payment_method: order.payment_method,
        created_at: orderCreatedAt(order),
        source: orderSource(order),
        customer: {
          name: orderCustomerName(order),
          email: order.customer?.email ?? null,
          mobile: order.customer?.mobile ? `${order.customer?.mobile_code ?? ""}${order.customer?.mobile}` : null,
          country: order.customer?.country ?? null,
          lang: order.customer?.lang ?? null,
        },
        receiver: orderReceiver(order),
      },
      items: items.map((it) => ({
        id: it.id,
        product_id: it.product?.id ?? it.product_id,
        product_name: it.product?.name ?? it.name,
        sku: it.sku ?? it.product?.sku,
        thumbnail: it.thumbnail ?? it.product_thumbnail ?? it.product?.thumbnail,
        quantity: it.quantity,
        price: itemUnitPrice(it), // real per-item amount (from item.amounts.total)
        options: it.options ?? [],
        categories: it.categories ?? [],
      })),
    });
  } catch (e) {
    next(e);
  }
});

portalRoutes.post("/returns", authPortal, async (req: any, res, next) => {
  try {
    const body = createReturnSchema.parse(req.body);
    res.json(await ReturnsService.createPortalReturn(req, body));
  } catch (e) {
    next(e);
  }
});

portalRoutes.get("/returns", authPortal, async (req: any, res, next) => {
  try {
    res.json(await ReturnsService.listPortalReturns(req));
  } catch (e) {
    next(e);
  }
});

portalRoutes.get("/returns/:return_number", authPortal, async (req: any, res, next) => {
  try {
    const params = returnNumberParamSchema.parse(req.params);
    res.json(await ReturnsService.getPortalReturnDetails(req, { returnNumber: params.return_number }));
  } catch (e) {
    next(e);
  }
});

portalRoutes.post("/returns/:return_number/cancel", authPortal, async (req: any, res, next) => {
  try {
    const params = returnNumberParamSchema.parse(req.params);
    const reason = req.body?.reason ? String(req.body.reason).trim() : undefined;
    res.json(await ReturnsService.cancelPortalReturn(req, { returnNumber: params.return_number, reason }));
  } catch (e) {
    next(e);
  }
});

portalRoutes.post("/returns/:return_number/attachments", authPortal, upload.single("file"), async (req: any, res, next) => {
  try {
    const tenantId = String(req.tenantId);
    const returnNumber = String(req.params.return_number || "").trim();
    const rr = await ReturnRequestsRepo.findByReturnNumber(req, tenantId, returnNumber);
    if (!rr || String(rr.order_number) !== String(req.portalSession.order_number)) throw new AppError(404, "Return not found", "RETURN_NOT_FOUND");
    if (!req.file) throw new AppError(400, "No file uploaded", "NO_FILE");
    const record = await FileStoreService.uploadReturnImage(
      req,
      tenantId,
      rr.ROWID,
      { originalname: req.file.originalname, mimetype: req.file.mimetype, size: req.file.size, buffer: req.file.buffer },
      { type: "customer" }
    );
    res.json({ ok: true, attachment: { filestore_path: record.filestore_path, content_type: record.content_type, file_size_bytes: record.file_size_bytes } });
  } catch (e) {
    next(e);
  }
});
