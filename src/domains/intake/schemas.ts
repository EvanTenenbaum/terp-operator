/**
 * Intake domain — Zod payload schemas.
 *
 * Extracted from src/server/services/commandBus.ts during P1.INT.REGISTER migration.
 * All schemas use .passthrough() for backward compatibility with existing callers
 * that may include extra fields.
 */
import { z } from 'zod';

export const createBatchPayloadSchema = z.object({
  name: z.string().optional(),
  category: z.string().optional(),
  vendorId: z.string().uuid().optional(),
  shorthand: z.string().optional(),
  tags: z.array(z.string()).optional(),
  status: z.string().optional(),
  brandId: z.string().uuid().optional(),
  purchaseOrderId: z.string().uuid().optional(),
  purchaseOrderLineId: z.string().uuid().optional(),
  sourceCode: z.string().optional(),
  subcategory: z.string().optional(),
  intakeQty: z.coerce.number().optional(),
  availableQty: z.coerce.number().optional(),
  uom: z.string().optional(),
  unitCost: z.coerce.number().optional(),
  unitPrice: z.coerce.number().optional(),
  location: z.string().optional(),
  lotCode: z.string().optional(),
  intakeDate: z.string().optional(),
  ticketCost: z.coerce.number().optional(),
  priceRange: z.string().optional(),
  notes: z.string().optional(),
  legacyMarker: z.string().optional(),
  ownershipStatus: z.string().optional(),
  expirationDate: z.string().optional(),
  arrivalConfirmed: z.boolean().optional(),
  arrivalStatus: z.string().optional(),
  mediaStatus: z.string().optional(),
}).passthrough();

export const updateBatchPayloadSchema = z.object({
  batchId: z.string().uuid().optional(),
  id: z.string().uuid().optional(),
}).passthrough();

export const deleteBatchPayloadSchema = z.object({
  batchId: z.string().uuid().optional(),
  id: z.string().uuid().optional(),
}).passthrough();

export const rejectBatchPayloadSchema = z.object({
  batchId: z.string().uuid().optional(),
  id: z.string().uuid().optional(),
  reason: z.string().min(1),
}).passthrough();

export const flagBatchPayloadSchema = z.object({
  batchId: z.string().uuid().optional(),
  id: z.string().uuid().optional(),
}).passthrough();

export const verifyAllIntakePayloadSchema = z.object({
  purchaseOrderId: z.string().uuid().optional(),
  id: z.string().uuid().optional(),
}).passthrough();

export const adjustBatchQuantityPayloadSchema = z.object({
  batchId: z.string().uuid().optional(),
  id: z.string().uuid().optional(),
  deltaQty: z.coerce.number().optional(),
  qtyDelta: z.coerce.number().optional(),
  reason: z.string().optional(),
}).passthrough();

export const setBatchPricePayloadSchema = z.object({
  batchId: z.string().uuid().optional(),
  id: z.string().uuid().optional(),
  unitPrice: z.coerce.number(),
}).passthrough();

export const setBatchLotInfoPayloadSchema = z.object({
  batchId: z.string().uuid().optional(),
  id: z.string().uuid().optional(),
}).passthrough();

export const importBatchesCsvPayloadSchema = z.object({}).passthrough();

export const createCustomerSheetSnapshotPayloadSchema = z.object({
  customerId: z.string().uuid(),
  mode: z.string().optional(),
  rows: z.array(z.unknown()).optional(),
  notes: z.string().optional(),
}).passthrough();
