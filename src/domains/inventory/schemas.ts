/**
 * Inventory domain — command payload schemas.
 *
 * Extracted from commandBus.ts per the command-registry migration.
 * Pure Zod schemas with zero dependencies on commandBus internals.
 *
 * The 3 inventory commands previously used inline validation
 * (requiredId/requiredString) in the switch case. These minimal
 * schemas provide Zod-level validation at the registry boundary.
 */
import { z } from 'zod';

export const setInventoryStatusPayloadSchema = z.object({
  batchId: z.string().uuid().optional(),
  id: z.string().uuid().optional(),
  status: z.string().min(1),
  reason: z.string().optional(),
}).passthrough();

export const transferInventoryLocationPayloadSchema = z.object({
  batchId: z.string().uuid().optional(),
  id: z.string().uuid().optional(),
  location: z.string().min(1),
  reason: z.string().optional(),
}).passthrough();

export const transferInventoryOwnershipPayloadSchema = z.object({
  batchId: z.string().uuid().optional(),
  id: z.string().uuid().optional(),
  ownershipStatus: z.string().min(1),
  vendorId: z.string().uuid().nullable().optional(),
  reason: z.string().optional(),
}).passthrough();
