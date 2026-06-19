// appsail/src/routes/merchant.routes.ts
// Embedded merchant console API. authEmbedded derives tenant from the Salla session — the client
// never passes a store/tenant id. (resolve→auto-execute is added in P3.)
import { Router } from "express";
import { authEmbedded } from "../middlewares/authEmbedded";
import { listReturnsQuery, approveSchema, rejectSchema, receiveSchema, decisionsSchema, resolveSchema, rulesUpdateSchema } from "../validators/merchant.zod";
import { returnNumberParamSchema } from "../validators/returns.zod";
import { MerchantReturnsService } from "../services/merchantReturns.service";
import { RulesService } from "../services/rules.service";
import { SallaOrdersService } from "../services/sallaOrders.service";

export const merchantRoutes = Router();
merchantRoutes.use(authEmbedded);

/** Store's live order statuses (incl. custom), cached — for the Rules screen's returnable-status picker. */
merchantRoutes.get("/statuses", async (req: any, res, next) => {
  try {
    res.json({ ok: true, statuses: await SallaOrdersService.listOrderStatuses(req, req.tenantId) });
  } catch (e) {
    next(e);
  }
});

merchantRoutes.get("/overview", async (req: any, res, next) => {
  try {
    res.json({ ok: true, kpis: await MerchantReturnsService.computeKpis(req, req.tenantId) });
  } catch (e) {
    next(e);
  }
});

merchantRoutes.get("/analytics", async (req: any, res, next) => {
  try {
    res.json({ ok: true, kpis: await MerchantReturnsService.computeKpis(req, req.tenantId) });
  } catch (e) {
    next(e);
  }
});

merchantRoutes.get("/returns", async (req: any, res, next) => {
  try {
    const query = listReturnsQuery.parse(req.query);
    res.json({ ok: true, returns: await MerchantReturnsService.listInbox(req, req.tenantId, query) });
  } catch (e) {
    next(e);
  }
});

merchantRoutes.get("/returns/:return_number", async (req: any, res, next) => {
  try {
    const { return_number } = returnNumberParamSchema.parse(req.params);
    res.json({ ok: true, ...(await MerchantReturnsService.getDetail(req, req.tenantId, return_number)) });
  } catch (e) {
    next(e);
  }
});

merchantRoutes.post("/returns/:return_number/decisions", async (req: any, res, next) => {
  try {
    const { return_number } = returnNumberParamSchema.parse(req.params);
    const body = decisionsSchema.parse(req.body);
    res.json({ ok: true, ...(await MerchantReturnsService.setItemDecisions(req, req.tenantId, return_number, body.items)) });
  } catch (e) {
    next(e);
  }
});

merchantRoutes.post("/returns/:return_number/approve", async (req: any, res, next) => {
  try {
    const { return_number } = returnNumberParamSchema.parse(req.params);
    const body = approveSchema.parse(req.body ?? {});
    res.json({ ok: true, ...(await MerchantReturnsService.approve(req, req.tenantId, return_number, body)) });
  } catch (e) {
    next(e);
  }
});

merchantRoutes.post("/returns/:return_number/reject", async (req: any, res, next) => {
  try {
    const { return_number } = returnNumberParamSchema.parse(req.params);
    const body = rejectSchema.parse(req.body ?? {});
    res.json({ ok: true, ...(await MerchantReturnsService.reject(req, req.tenantId, return_number, body)) });
  } catch (e) {
    next(e);
  }
});

merchantRoutes.post("/returns/:return_number/receive", async (req: any, res, next) => {
  try {
    const { return_number } = returnNumberParamSchema.parse(req.params);
    const body = receiveSchema.parse(req.body ?? {});
    res.json({ ok: true, ...(await MerchantReturnsService.markReceived(req, req.tenantId, return_number, body)) });
  } catch (e) {
    next(e);
  }
});

merchantRoutes.post("/returns/:return_number/resolve", async (req: any, res, next) => {
  try {
    const { return_number } = returnNumberParamSchema.parse(req.params);
    const body = resolveSchema.parse(req.body ?? {});
    res.json(await MerchantReturnsService.resolve(req, req.tenantId, return_number, body));
  } catch (e) {
    next(e);
  }
});

merchantRoutes.get("/rules", async (req: any, res, next) => {
  try {
    res.json({ ok: true, rules: await RulesService.getRules(req, req.tenantId) });
  } catch (e) {
    next(e);
  }
});

merchantRoutes.put("/rules", async (req: any, res, next) => {
  try {
    const body = rulesUpdateSchema.parse(req.body ?? {});
    const rules = await RulesService.updateRules(req, req.tenantId, body, { actor_type: "merchant", actor_id: req.merchantUserId ?? null });
    res.json({ ok: true, rules });
  } catch (e) {
    next(e);
  }
});
