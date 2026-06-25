/**
 * Payments domain — Zod payload schemas.
 *
 * Extracted from src/server/services/commandBus.ts (lines 438-531)
 * with .passthrough() so the registry dispatch allows extra keys
 * that may be added by middleware or frontend pipelines.
 */
import { z } from 'zod';

export const applyClientCreditPayloadSchema = z.object({
  customerId: z.string().uuid(),
  amount: z.coerce.number(),
  reason: z.string().optional(),
}).passthrough();

export const logPaymentPayloadSchema = z.object({
  customerId: z.string().uuid(),
  amount: z.coerce.number(),
  method: z.enum(['cash', 'check', 'other']).optional(),
  date: z.string().optional(),
  createdAt: z.string().optional(),
  reference: z.string().optional(),
  locationBucket: z.string().optional(),
  notes: z.string().optional(),
  direction: z.string().optional(),
  category: z.string().optional(),
  allocationIntent: z.string().optional(),
  invoiceId: z.string().uuid().optional(),
}).passthrough();

export const allocatePaymentPayloadSchema = z.object({
  paymentId: z.string().uuid(),
  invoiceId: z.string().uuid().optional(),
  amount: z.coerce.number().optional(),
}).passthrough();

export const unallocatePaymentPayloadSchema = z.object({
  allocationId: z.string().uuid(),
}).passthrough();

export const refundPaymentPayloadSchema = z.object({
  paymentId: z.string().uuid(),
}).passthrough();

export const markPaymentUnappliedPayloadSchema = z.object({
  paymentId: z.string().uuid(),
}).passthrough();

export const applyDiscountPayloadSchema = z.object({
  invoiceId: z.string().uuid(),
  amount: z.coerce.number(),
  reason: z.string().optional(),
}).passthrough();

export const markUserFeeCollectedPayloadSchema = z.object({
  userId: z.string().uuid().optional(),
  id: z.string().uuid().optional(),
  processorId: z.string().uuid().optional(),
  amount: z.coerce.number().optional(),
  notes: z.string().optional(),
}).passthrough();
