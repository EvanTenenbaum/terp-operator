/**
 * Pick domain — command payload schemas.
 *
 * Extracted from commandBus.ts per the command-registry migration.
 * Pure Zod schemas with zero dependencies on commandBus internals.
 */
import { z } from 'zod';

export const allocateOrderToFulfillmentPayloadSchema = z.object({
  orderId: z.string().uuid().optional(),
  id: z.string().uuid().optional(),
}).passthrough();

export const recordWeighAndPackPayloadSchema = z.object({
  fulfillmentLineId: z.string().uuid().optional(),
  id: z.string().uuid().optional(),
  actualQty: z.coerce.number().optional(),
  actualWeight: z.coerce.number().optional(),
  bagCode: z.string().optional(),
}).passthrough();

export const releaseLineForPickingPayloadSchema = z.object({
  lineId: z.string().uuid().optional(),
  id: z.string().uuid().optional(),
}).passthrough();

export const releaseLinesForPickingPayloadSchema = z.object({
  lineIds: z.array(z.string().uuid()).optional(),
  ids: z.array(z.string().uuid()).optional(),
}).passthrough();

export const recallLineFromPickingPayloadSchema = z.object({
  lineId: z.string().uuid().optional(),
  id: z.string().uuid().optional(),
}).passthrough();

export const returnPickedUnitsPayloadSchema = z.object({
  fulfillmentLineId: z.string().uuid().optional(),
  id: z.string().uuid().optional(),
  qty: z.coerce.number().optional(),
  reason: z.string().optional(),
}).passthrough();

export const printLabelsPayloadSchema = z.object({
  pickListId: z.string().uuid().optional(),
  id: z.string().uuid().optional(),
  labelFormat: z.string().optional(),
}).passthrough();

// Aliases
export const createPickListPayloadSchema = allocateOrderToFulfillmentPayloadSchema;
export const adjustFulfillmentLinePayloadSchema = recordWeighAndPackPayloadSchema;
