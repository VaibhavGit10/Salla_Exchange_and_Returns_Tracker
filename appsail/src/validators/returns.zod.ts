import { z } from "zod";

export const returnItemSchema = z.object({
  order_item_id_external: z.string().min(1).optional(),
  sku: z.string().min(1),
  product_name: z.string().max(255).optional(),
  variant_name: z.string().max(255).optional(),
  category_id_external: z.string().max(64).optional(),
  category_name: z.string().max(255).optional(),
  quantity: z.number().int().min(1).default(1),
  unit_price: z.number().nonnegative().optional(),
  reason_code: z.enum(["defective", "wrong_item", "not_as_described", "changed_mind", "size_issue", "other"]),
  reason_note: z.string().max(500).optional(),
  exchange_variant_id: z.string().max(64).optional(),
});

export const createReturnSchema = z
  .object({
    requested_resolution: z.enum(["refund", "exchange", "store_credit"]),
    notes_customer: z.string().max(2000).optional(),
    order_id_external: z.string().min(1).optional(),
    is_warranty: z.boolean().default(false),
    customer_email: z.string().email().optional(),
    bank_iban: z.string().min(10).max(40).optional(),
    items: z.array(returnItemSchema).min(1).max(50),
  })
  .superRefine((v, ctx) => {
    for (const [i, it] of v.items.entries()) {
      if (it.reason_code === "other" && !it.reason_note?.trim()) {
        ctx.addIssue({ code: "custom", path: ["items", i, "reason_note"], message: "reason_note is required when reason_code is 'other'" });
      }
    }
    if (v.requested_resolution === "exchange" && !v.items.some((it) => it.exchange_variant_id)) {
      ctx.addIssue({ code: "custom", path: ["items"], message: "exchange requires an exchange_variant_id on at least one item" });
    }
  });

export const returnNumberParamSchema = z.object({
  return_number: z.string().min(6).max(50),
});

export const cancelReturnSchema = z.object({ reason: z.string().max(500).optional() }).optional();
