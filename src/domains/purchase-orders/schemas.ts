/**
 * Purchase Orders domain — command payload schemas.
 *
 * Moved from src/server/services/commandBus.ts per the command-registry
 * migration. These are pure Zod schemas with zero dependencies on
 * commandBus internals.
 *
 * Future: when schemas.ts is deduplicated, commandBus.ts imports from here
 * instead of defining its own copies.
 */

import { z } from 'zod';

export const createPurchaseOrderPayloadSchema = z.object({
  vendorId: z.string().uuid(),
  expectedDate: z.string().optional(),
  paymentTerms: z.string().optional(),
  prepaymentAmount: z.coerce.number().optional(),
  buyerNotes: z.string().optional(),
  internalNotes: z.string().optional(),
  externalNotes: z.string().optional(),
});

export const updatePurchaseOrderPayloadSchema = z.object({
  purchaseOrderId: z.string().uuid().optional(),
  id: z.string().uuid().optional(),
}).passthrough();

export const finalizePurchaseOrderPayloadSchema = z.object({
  purchaseOrderId: z.string().uuid().optional(),
  id: z.string().uuid().optional(),
});

export const unfinalizePurchaseOrderPayloadSchema = z.object({
  purchaseOrderId: z.string().uuid().optional(),
  id: z.string().uuid().optional(),
});

export const addPurchaseOrderLinePayloadSchema = z.object({
  purchaseOrderId: z.string().uuid(),
  productName: z.string().optional(),
  name: z.string().optional(),
  category: z.string().optional(),
  qty: z.coerce.number(),
  unitCost: z.coerce.number().optional(),
  costRangeLow: z.coerce.number().optional(),
  costRangeHigh: z.coerce.number().optional(),
  uom: z.string().optional(),
  tags: z.array(z.string()).optional(),
  shorthand: z.string().optional(),
  sourceCode: z.string().optional(),
  subcategory: z.string().optional(),
  notes: z.string().optional(),
  internalNotes: z.string().optional(),
  externalNotes: z.string().optional(),
  legacyMarker: z.string().optional(),
  ownershipStatus: z.string().optional(),
});

export const updatePurchaseOrderLinePayloadSchema = z.object({
  lineId: z.string().uuid().optional(),
  id: z.string().uuid().optional(),
}).passthrough();

export const removePurchaseOrderLinePayloadSchema = z.object({
  lineId: z.string().uuid().optional(),
  id: z.string().uuid().optional(),
});

export const approvePurchaseOrderPayloadSchema = z.object({
  purchaseOrderId: z.string().uuid().optional(),
  id: z.string().uuid().optional(),
});

export const receivePurchaseOrderPayloadSchema = z.object({
  purchaseOrderId: z.string().uuid().optional(),
  id: z.string().uuid().optional(),
  lineIds: z.array(z.string().uuid()).optional(),
  lineQuantities: z.record(z.coerce.number().positive()).optional(),
});

export const cancelPurchaseOrderPayloadSchema = z.object({
  purchaseOrderId: z.string().uuid().optional(),
  id: z.string().uuid().optional(),
});

export const postPurchaseReceiptPayloadSchema = z.object({
  batchIds: z.array(z.string().uuid()).optional(),
  selectedIds: z.array(z.string().uuid()).optional(),
  discrepancyNotes: z.record(z.unknown()).optional(),
});

export const recordVendorPrepaymentPayloadSchema = z.object({
  purchaseOrderId: z.string().uuid(),
  amount: z.coerce.number(),
  method: z.string().optional(),
  reference: z.string().optional(),
});
