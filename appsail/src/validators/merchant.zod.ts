import { z } from "zod";

export const listReturnsQuery = z.object({
  status: z.enum(["requested", "approved", "in_transit", "received", "resolved", "rejected", "cancelled"]).optional(),
  search: z.string().max(64).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

export const decisionsSchema = z.object({
  items: z.array(z.object({ return_item_id: z.string().min(1), decision: z.enum(["approved", "rejected", "pending"]), decision_reason: z.string().max(500).optional() })).min(1),
});

export const approveSchema = z.object({
  status_reason: z.string().max(500).optional(),
  notes_internal: z.string().max(2000).optional(),
  items: z.array(z.object({ return_item_id: z.string().min(1), decision: z.enum(["approved", "rejected", "pending"]), decision_reason: z.string().max(500).optional() })).optional(),
});

export const rejectSchema = z.object({ status_reason: z.string().min(1).max(500), notes_internal: z.string().max(2000).optional() });

export const receiveSchema = z.object({ status_reason: z.string().max(500).optional(), notes_internal: z.string().max(2000).optional() });

export const resolveSchema = z.object({
  type: z.enum(["refund", "exchange", "store_credit"]),
  amount: z.number().nonnegative().optional(),
  exchange_variant_id: z.string().max(64).optional(),
  reference: z.string().max(128).optional(),
  notes_internal: z.string().max(2000).optional(),
});

export const rulesUpdateSchema = z.object({
  default_return_window_days: z.number().int().min(0).max(365).optional(),
  auto_approve_enabled: z.boolean().optional(),
  auto_approve_max_value: z.number().nonnegative().nullable().optional(),
  auto_approve_reasons: z.array(z.string()).optional(),
  exchange_allowed: z.boolean().optional(),
  store_credit_allowed: z.boolean().optional(),
  refund_allowed: z.boolean().optional(),
  category_rules: z
    .array(z.object({ category_id: z.string().optional(), category_name: z.string().optional(), rule: z.enum(["NON_RETURNABLE", "DAY_LIMIT", "STANDARD"]), day_limit: z.number().int().min(0).max(365).optional() }))
    .optional(),
  require_images_for_reasons: z.array(z.string()).optional(),
  sku_restrictions: z.array(z.string()).optional(),
});
