/**
 * Sales Orders domain — command payload schemas.
 *
 * Pure Zod schemas extracted for the command registry migration.
 * Zero dependencies on commandBus internals.
 */
import { z } from 'zod';

export const createSalesOrderPayloadSchema = z.object({
  customerId: z.string().uuid(),
  notes: z.string().optional(),
}).passthrough();

export const addSalesOrderLinePayloadSchema = z.object({
  orderId: z.string().uuid(),
  productName: z.string().optional(),
  name: z.string().optional(),
  category: z.string().optional(),
  qty: z.coerce.number(),
  unitPrice: z.coerce.number().optional(),
  batchId: z.string().uuid().optional(),
  uom: z.string().optional(),
  tags: z.array(z.string()).optional(),
  shorthand: z.string().optional(),
  sourceCode: z.string().optional(),
  subcategory: z.string().optional(),
  notes: z.string().optional(),
  internalNotes: z.string().optional(),
  externalNotes: z.string().optional(),
  legacyMarker: z.string().optional(),
  lineId: z.string().uuid().optional(),
  id: z.string().uuid().optional(),
  itemName: z.string().optional(),
  sourceRowKey: z.string().optional(),
  unresolvedSourceText: z.string().optional(),
  legacyStatusMarker: z.string().optional(),
  legacyStatusMarkers: z.string().optional(),
}).passthrough();

export const updateSalesOrderLinePayloadSchema = z.object({
  lineId: z.string().uuid().optional(),
  id: z.string().uuid().optional(),
  orderId: z.string().uuid().optional(),
  batchId: z.string().uuid().nullable().optional(),
  itemName: z.string().optional(),
  qty: z.coerce.number().optional(),
  unitPrice: z.coerce.number().optional(),
  status: z.string().optional(),
  sourceRowKey: z.string().optional(),
  unresolvedSourceText: z.string().optional(),
  legacyStatusMarker: z.string().optional(),
  legacyStatusMarkers: z.string().optional(),
  packed: z.boolean().optional(),
  inventoryPosted: z.boolean().optional(),
  paymentFollowup: z.boolean().optional(),
  deliveryWindow: z.string().optional(),
  notes: z.string().optional(),
}).passthrough();

export const removeSalesOrderLinePayloadSchema = z.object({
  lineId: z.string().uuid().optional(),
  id: z.string().uuid().optional(),
}).passthrough();

export const reserveInventoryForOrderPayloadSchema = z.object({
  orderId: z.string().uuid().optional(),
  id: z.string().uuid().optional(),
}).passthrough();

export const priceSalesOrderPayloadSchema = z.object({
  orderId: z.string().uuid().optional(),
  id: z.string().uuid().optional(),
  strategy: z.string().optional(),
}).passthrough();

export const confirmSalesOrderPayloadSchema = z.object({
  orderId: z.string().uuid().optional(),
  id: z.string().uuid().optional(),
}).passthrough();

export const cancelSalesOrderPayloadSchema = z.object({
  orderId: z.string().uuid(),
}).passthrough();

export const postSalesOrderPayloadSchema = z.object({
  orderId: z.string().uuid(),
}).passthrough();

export const setDeliveryWindowPayloadSchema = z.object({
  orderId: z.string().uuid(),
  deliveryWindow: z.string().min(1),
}).passthrough();

export const setLineLandedCostPayloadSchema = z.object({
  lineId: z.string().uuid().optional(),
  id: z.string().uuid().optional(),
  landedCost: z.coerce.number().min(0),
  basis: z.string().optional(),
  reason: z.string().optional(),
}).passthrough();

export const setLineBelowFloorReasonPayloadSchema = z.object({
  lineId: z.string().uuid().optional(),
  id: z.string().uuid().optional(),
  reason: z.string().min(1),
  note: z.string().optional(),
}).passthrough();

export const resolveVendorApprovalPayloadSchema = z.object({
  lineId: z.string().uuid().optional(),
  orderId: z.string().optional(),
  state: z.string().min(1),
  note: z.string().optional(),
}).passthrough();

export const setCustomerPricingRulePayloadSchema = z.object({
  customerId: z.string().uuid().optional(),
  id: z.string().uuid().optional(),
  value: z.unknown().optional(),
}).passthrough();

export const setDefaultPricingRulePayloadSchema = z.object({
  value: z.unknown().optional(),
}).passthrough();

export const repriceOrderPayloadSchema = z.object({
  orderId: z.string().uuid().optional(),
  id: z.string().uuid().optional(),
}).passthrough();
