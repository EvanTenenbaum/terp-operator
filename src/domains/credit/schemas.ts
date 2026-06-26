/**
 * Credit domain — command payload schemas.
 *
 * Extracted from src/server/services/commandBus.ts per the command-registry
 * migration. These are pure Zod schemas with zero dependencies on
 * commandBus internals.
 */

import { z } from 'zod';

export const setCustomerCreditLimitPayloadSchema = z.object({
  customerId: z.string().uuid(),
  amount: z.coerce.number().min(0, 'amount must be greater than or equal to zero'),
  reason: z.string().min(4, 'reason must be at least 4 characters'),
}).passthrough();

export const revertCustomerCreditToEnginePayloadSchema = z.object({
  customerId: z.string().uuid(),
}).passthrough();

export const snoozeCustomerCreditReminderPayloadSchema = z.object({
  customerId: z.string().uuid(),
}).passthrough();

export const setCustomerEngineMaxPayloadSchema = z.object({
  customerId: z.string().uuid(),
  maxAmount: z.coerce.number().optional(),
}).passthrough();

export const setCustomerStancePayloadSchema = z.object({
  customerId: z.string().uuid(),
  stanceId: z.string().uuid().optional(),
}).passthrough();

export const disableCreditEngineForCustomerPayloadSchema = z.object({
  customerId: z.string().uuid(),
  reason: z.string().min(4),
}).passthrough();

export const enableCreditEngineForCustomerPayloadSchema = z.object({
  customerId: z.string().uuid(),
}).passthrough();

export const createCreditEngineStancePayloadSchema = z.object({
  name: z.string().min(1),
  multiplier: z.coerce.number().optional(),
  minLimit: z.coerce.number().optional(),
  maxLimit: z.coerce.number().optional(),
  notes: z.string().optional(),
}).passthrough();

export const updateCreditEngineStancePayloadSchema = z.object({
  stanceId: z.string().uuid(),
}).passthrough();

export const deleteCreditEngineStancePayloadSchema = z.object({
  stanceId: z.string().uuid(),
}).passthrough();

export const setCreditEngineConfigPayloadSchema = z.object({
  key: z.string().min(1),
  value: z.unknown(),
}).passthrough();

export const bulkRevertCustomersToEnginePayloadSchema = z.object({
  filter: z.unknown().optional(),
}).passthrough();
