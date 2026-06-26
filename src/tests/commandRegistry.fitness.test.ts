/**
 * Architecture fitness test: command registry integrity.
 *
 * Prevents the shotgun-surgery regression described in docs/engineering-plans/
 * grid-rows-repair-split/04-backend-command-registry.md. A 30-line test
 * outlasts a 3-page convention doc.
 *
 * Phase 1 (current): parity check for migrated purchase-orders commands.
 * Phase 2+ (after domain-by-domain rollout): tighten to forbid switch(name)
 *   in commandBus.ts and enforce full catalog↔registry parity.
 *
 * Pattern: same spirit as scripts/check-backend-frontend-parity.mjs but
 * as a proper Vitest test so CI catches drift immediately.
 */

import { describe, it, expect, vi, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// Short-circuit DB import chain so the test doesn't need Postgres.
vi.mock('@/server/db', () => ({
  db: { select: vi.fn(), insert: vi.fn(), update: vi.fn(), delete: vi.fn(), execute: vi.fn(), transaction: vi.fn() },
  pool: { query: vi.fn().mockResolvedValue({ rows: [] }) },
  getDb: vi.fn(),
}));

// ── Migrated commands (purchase-orders domain) ────────────────────────────────

const PO_COMMAND_NAMES = [
  'addPurchaseOrderLine',
  'approvePurchaseOrder',
  'cancelPurchaseOrder',
  'createPurchaseOrder',
  'finalizePurchaseOrder',
  'postPurchaseReceipt',
  'receivePurchaseOrder',
  'recordVendorPrepayment',
  'removePurchaseOrderLine',
  'unfinalizePurchaseOrder',
  'updatePurchaseOrder',
  'updatePurchaseOrderLine',
];

// ── Catalog parity ───────────────────────────────────────────────────────────

describe('command registry ↔ catalog parity (PO domain)', () => {
  let registryNames: string[];
  let catalogNames: string[];

  beforeAll(async () => {
    // Import triggers defineCommand side effects (populates registry).
    await import('@/domains/purchase-orders/commandDefs');
    const { getRegisteredNames } = await import('@/server/services/commandRegistry');
    registryNames = getRegisteredNames();

    // Read catalog from source to avoid circular imports.
    const catalogPath = path.resolve(__dirname, '../shared/commandCatalog.ts');
    const catalogSource = fs.readFileSync(catalogPath, 'utf-8');
    const match = catalogSource.match(/export const commandNames = \[([\s\S]*?)\]/);
    if (!match) throw new Error('Could not parse commandNames from catalog.');
    catalogNames = [...match[1].matchAll(/'([^']+)'/g)].map(m => m[1]);
  });

  it('every registered PO command exists in the catalog', () => {
    const registeredPO = registryNames.filter(n => PO_COMMAND_NAMES.includes(n));
    for (const name of registeredPO) {
      expect(catalogNames).toContain(name);
    }
  });

  it('every PO catalog entry has a registered handler', () => {
    const catalogPO = catalogNames.filter(n => PO_COMMAND_NAMES.includes(n));
    for (const name of catalogPO) {
      expect(registryNames).toContain(name);
    }
  });

  it('no registered command is duplicated', () => {
    const poRegistered = registryNames.filter(n => PO_COMMAND_NAMES.includes(n));
    const unique = new Set(poRegistered);
    expect(unique.size).toBe(poRegistered.length);
  });
});

// ── Future gates (disabled until full migration) ─────────────────────────────

describe.skip('command registry — full migration gates (disabled)', () => {
  it('commandBus.ts contains no switch(name) statement');
  it('every catalog command has a registered handler');
  it('no registered command is missing from the catalog');
});
