/**
 * Inventory domain — command handlers.
 *
 * Extracted from src/server/services/commandBus.ts in P1.INV.EXTRACT.
 *
 * NOTE: this module intentionally imports helpers and the Payload type from
 * `@/server/services/commandBus`. commandBus.ts in turn re-imports the 3
 * inventory command handlers from this module via `@/domains/inventory`,
 * which creates a circular import. This is safe under ESM because every
 * reference to those imported bindings lives inside a function body — by the
 * time runCommand() invokes an inventory handler, commandBus.ts has fully
 * evaluated and the live bindings are resolved (same pattern as the
 * P1.PO / P1.PAY / P1.SAL / P1.CRED extractions).
 *
 * The `inventoryStatus` enum-guard was only used by `setInventoryStatus`, so
 * it moved with the handlers into this module. The `ownership` guard remains
 * exported from commandBus.ts because other domains/handlers use it (e.g.
 * createBatch / updateBatch).
 *
 * Future cleanup (P2+): hoist the remaining shared helpers
 * (requiredId / requiredString / stringValue / qtyScale / ownership) to
 * `@/domains/shared/...` and remove the cycle entirely.
 */

import { eq, sql } from 'drizzle-orm';

import { batches, inventoryMovements } from '@/server/schema';
import type { Tx } from '@/server/db';

import type { CommandResult } from '../../shared/types';

// Helpers and the Payload type are kept in commandBus.ts for this phase
// (see header comment).
import {
  // Helpers
  ownership,
  requiredId,
  requiredString,
  stringValue,
  // Types
  type Payload,
} from '@/server/services/commandBus';

// ---------------------------------------------------------------------------
// Inventory-domain-internal helpers.
// ---------------------------------------------------------------------------

function inventoryStatus(value: unknown) {
  const text = stringValue(value);
  if (['posted', 'held', 'damaged', 'returned', 'in_transit'].includes(text)) return text;
  throw new Error('Inventory status must be posted, held, damaged, returned, or in_transit.');
}

// ---------------------------------------------------------------------------
// Command handlers.
// ---------------------------------------------------------------------------

export async function setInventoryStatus(tx: Tx, payload: Payload, commandId: string, reason?: string): Promise<CommandResult> {
  const batchId = requiredId(payload.batchId ?? payload.id, 'batchId');
  const status = inventoryStatus(payload.status);
  const movementReason = requiredString(reason || payload.reason, 'reason');
  const [row] = await tx.select().from(batches).where(eq(batches.id, batchId)).limit(1);
  if (!row) throw new Error('Batch not found.');
  if (!['posted', 'held', 'damaged', 'returned', 'in_transit'].includes(row.status)) {
    throw new Error('Only posted inventory rows can move through inventory state transitions.');
  }
  if (row.status === status) {
    return { ok: true, commandId, affectedIds: [batchId], toast: `${row.name} is already ${status}.`, delta: { status, unchanged: true } };
  }
  await tx.update(batches).set({ status, updatedAt: new Date() }).where(eq(batches.id, batchId));
  await tx.insert(inventoryMovements).values({ batchId, commandId, kind: 'status_transfer', qtyDelta: '0.000', reason: `${row.status} -> ${status}: ${movementReason}` });
  return { ok: true, commandId, affectedIds: [batchId], toast: `${row.name} moved from ${row.status} to ${status}.`, delta: { fromStatus: row.status, toStatus: status } };
}

export async function transferInventoryLocation(tx: Tx, payload: Payload, commandId: string, reason?: string): Promise<CommandResult> {
  const batchId = requiredId(payload.batchId ?? payload.id, 'batchId');
  const location = requiredString(payload.location, 'location');
  const movementReason = requiredString(reason || payload.reason, 'reason');

  // Lock batch row to prevent concurrent location transfer races
  const batchRows = await tx.execute(
    sql`SELECT * FROM ${batches} WHERE ${batches.id} = ${batchId} FOR UPDATE`
  );
  const row = batchRows.rows[0];
  if (!row) throw new Error('Batch not found.');
  if (row.location === location) {
    return { ok: true, commandId, affectedIds: [batchId], toast: `${row.name} is already in ${location}.`, delta: { location, unchanged: true } };
  }
  await tx.update(batches).set({ location, updatedAt: new Date() }).where(eq(batches.id, batchId));
  await tx.insert(inventoryMovements).values({ batchId, commandId, kind: 'location_transfer', qtyDelta: '0.000', reason: `${row.location} -> ${location}: ${movementReason}` });
  return { ok: true, commandId, affectedIds: [batchId], toast: `${row.name} moved to ${location}.`, delta: { fromLocation: row.location, toLocation: location } };
}

export async function transferInventoryOwnership(tx: Tx, payload: Payload, commandId: string, reason?: string): Promise<CommandResult> {
  const batchId = requiredId(payload.batchId ?? payload.id, 'batchId');
  const ownershipStatus = ownership(payload.ownershipStatus);
  const movementReason = requiredString(reason || payload.reason, 'reason');
  const vendorId = payload.vendorId != null ? stringValue(payload.vendorId) || null : undefined;

  // Lock batch row to prevent concurrent ownership transfer races.
  // Raw `SELECT *` returns Postgres column names (snake_case), so multi-word
  // columns like `vendor_id` and `ownership_status` must be read via bracket
  // notation — camelCase access would silently produce `undefined`.
  const batchRows = await tx.execute(
    sql`SELECT * FROM ${batches} WHERE ${batches.id} = ${batchId} FOR UPDATE`
  );
  const row = batchRows.rows[0];
  if (!row) throw new Error('Batch not found.');
  if (ownershipStatus === 'C' && !(vendorId ?? row['vendor_id'])) throw new Error('Consigned inventory needs a vendor before ownership transfer.');
  if (row['ownership_status'] === ownershipStatus && (vendorId === undefined || row['vendor_id'] === vendorId)) {
    return { ok: true, commandId, affectedIds: [batchId], toast: `${row.name} already has ${ownershipStatus} ownership.`, delta: { ownershipStatus, unchanged: true } };
  }
  const values: Record<string, unknown> = { ownershipStatus, updatedAt: new Date() };
  if (vendorId !== undefined) values.vendorId = vendorId;
  await tx.update(batches).set(values).where(eq(batches.id, batchId));
  await tx.insert(inventoryMovements).values({ batchId, commandId, kind: 'ownership_transfer', qtyDelta: '0.000', reason: `${row['ownership_status']} -> ${ownershipStatus}: ${movementReason}` });
  return { ok: true, commandId, affectedIds: [batchId], toast: `${row.name} ownership moved to ${ownershipStatus}.`, delta: { fromOwnershipStatus: row['ownership_status'], toOwnershipStatus: ownershipStatus } };
}

