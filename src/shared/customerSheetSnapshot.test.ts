/**
 * Tests for shared customer sheet snapshot helpers (#62).
 *
 * Persisted customer sheet snapshots must respect the same internal vs
 * customer-facing data boundary as the CSV export path (#63):
 *   - mode = 'catalog'  -> NEVER stores cost/margin/internal reason fields
 *   - mode = 'internal' -> may store cost/margin for operator reference
 *
 * Snapshots also keep enough row identity (batchId, batchCode, name) so a
 * later "Open snapshot" + "Add item to draft" flow can re-resolve current
 * availability against the live inventory.
 */
import { describe, it, expect } from 'vitest';
import {
  buildCustomerSheetSnapshotRows,
  catalogSnapshotFields,
  internalSnapshotFields,
  getViewerSafeSnapshot,
  redactCustomerSheetSnapshotJournalPayload,
  CUSTOMER_SHEET_MODES,
  type CustomerSheetMode
} from './customerSheetSnapshot';

const sample = {
  id: 'row-1',
  batchId: 'batch-1',
  batchCode: 'BC001',
  name: 'Flower A',
  category: 'Flower',
  vendor: 'Acme',
  availableQty: 100,
  unitPrice: 50,
  unitCost: 30,
  estimatedMargin: 0.4,
  internalMargin: 0.38,
  tags: ['indoor'],
  reason: 'Top seller'
};

describe('CUSTOMER_SHEET_MODES', () => {
  it('exposes the two supported modes', () => {
    expect(CUSTOMER_SHEET_MODES).toEqual(['internal', 'catalog']);
  });
});

describe('catalogSnapshotFields — customer-facing snapshot regression (#62/#63)', () => {
  const fields = catalogSnapshotFields();
  it('does not include unitCost', () => {
    expect(fields).not.toContain('unitCost');
  });
  it('does not include estimatedMargin', () => {
    expect(fields).not.toContain('estimatedMargin');
  });
  it('does not include internalMargin', () => {
    expect(fields).not.toContain('internalMargin');
  });
  it('does not include any field whose name contains cost or margin', () => {
    const lower = fields.map((f) => f.toLowerCase());
    expect(lower.every((f) => !f.includes('cost'))).toBe(true);
    expect(lower.every((f) => !f.includes('margin'))).toBe(true);
  });
  it('does not include internal-only reason field', () => {
    expect(fields).not.toContain('reason');
  });
  it('includes customer-facing identifying fields needed for Add-to-draft', () => {
    expect(fields).toContain('batchId');
    expect(fields).toContain('batchCode');
    expect(fields).toContain('name');
    expect(fields).toContain('category');
    expect(fields).toContain('availableQty');
    expect(fields).toContain('unitPrice');
  });
});

describe('internalSnapshotFields — operator snapshot', () => {
  const fields = internalSnapshotFields();
  it('includes cost and margin for operator reference', () => {
    expect(fields).toContain('unitCost');
    expect(fields).toContain('estimatedMargin');
  });
  it('includes batch identifying fields', () => {
    expect(fields).toContain('batchId');
    expect(fields).toContain('batchCode');
  });
});

describe('buildCustomerSheetSnapshotRows — catalog mode does not leak cost/margin', () => {
  it('catalog rows omit unitCost', () => {
    const rows = buildCustomerSheetSnapshotRows([sample], 'catalog');
    expect(rows[0]).not.toHaveProperty('unitCost');
  });
  it('catalog rows omit estimatedMargin', () => {
    const rows = buildCustomerSheetSnapshotRows([sample], 'catalog');
    expect(rows[0]).not.toHaveProperty('estimatedMargin');
  });
  it('catalog rows omit internalMargin', () => {
    const rows = buildCustomerSheetSnapshotRows([sample], 'catalog');
    expect(rows[0]).not.toHaveProperty('internalMargin');
  });
  it('catalog rows omit internal-only reason field', () => {
    const rows = buildCustomerSheetSnapshotRows([sample], 'catalog');
    expect(rows[0]).not.toHaveProperty('reason');
  });
  it('catalog rows keep batchId, batchCode, name, unitPrice, availableQty', () => {
    const rows = buildCustomerSheetSnapshotRows([sample], 'catalog');
    expect(rows[0]).toMatchObject({
      batchId: 'batch-1',
      batchCode: 'BC001',
      name: 'Flower A',
      availableQty: 100,
      unitPrice: 50
    });
  });
  it('catalog mode never contains a serialized cost or margin value as a property value', () => {
    const rows = buildCustomerSheetSnapshotRows([sample], 'catalog');
    const json = JSON.stringify(rows[0]);
    // 30 is the unitCost in sample; assert no key uses it
    expect(json).not.toMatch(/"unitCost"/);
    expect(json).not.toMatch(/"estimatedMargin"/);
    expect(json).not.toMatch(/"internalMargin"/);
  });
});

describe('buildCustomerSheetSnapshotRows — internal mode keeps operator fields', () => {
  it('internal rows include unitCost', () => {
    const rows = buildCustomerSheetSnapshotRows([sample], 'internal');
    expect(rows[0]).toHaveProperty('unitCost', 30);
  });
  it('internal rows include estimatedMargin', () => {
    const rows = buildCustomerSheetSnapshotRows([sample], 'internal');
    expect(rows[0]).toHaveProperty('estimatedMargin', 0.4);
  });
  it('internal rows include reason for operator triage', () => {
    const rows = buildCustomerSheetSnapshotRows([sample], 'internal');
    expect(rows[0]).toHaveProperty('reason', 'Top seller');
  });
});

describe('buildCustomerSheetSnapshotRows — edge cases', () => {
  it('returns empty array for empty input', () => {
    expect(buildCustomerSheetSnapshotRows([], 'catalog')).toEqual([]);
    expect(buildCustomerSheetSnapshotRows([], 'internal')).toEqual([]);
  });
  it('drops keys not in the allowlist (no extraneous fields)', () => {
    const noisy = { ...sample, randomKey: 'should-not-survive' } as Record<string, unknown>;
    const rows = buildCustomerSheetSnapshotRows([noisy], 'catalog');
    expect(rows[0]).not.toHaveProperty('randomKey');
  });
  it('handles missing optional fields without throwing', () => {
    const sparse = { id: 'r', batchCode: 'X', name: 'Y' };
    const rows = buildCustomerSheetSnapshotRows([sparse], 'catalog');
    expect(rows[0]).toMatchObject({ batchCode: 'X', name: 'Y' });
  });
  it('round-trips with both modes (type-safe in TS)', () => {
    const modes: CustomerSheetMode[] = ['internal', 'catalog'];
    for (const mode of modes) {
      const rows = buildCustomerSheetSnapshotRows([sample], mode);
      expect(rows).toHaveLength(1);
    }
  });
});

describe('getViewerSafeSnapshot — read-side sanitizer / viewer privacy (#62/#63)', () => {
  const dbInternalRow = {
    id: 'snap-1',
    customerId: 'cust-1',
    mode: 'internal' as const,
    actorId: 'actor-1',
    actorName: 'Sam Sales',
    itemCount: 1,
    notes: null,
    createdAt: '2026-05-01T12:00:00Z',
    // rows_json may contain rogue cost/margin fields (e.g. from older snapshots
    // written before sanitization, or hand-edited / corrupted rows). The
    // read-side sanitizer must strip them on the way out.
    rows: [
      {
        batchId: 'b-1',
        batchCode: 'BC-1',
        name: 'Skywalker OG',
        availableQty: 12,
        unitPrice: 1000,
        // Cost leak that must be stripped from a catalog re-read.
        unitCost: 800,
        estimatedMargin: 0.2,
        internalMargin: 0.18,
        reason: 'top seller'
      }
    ]
  };

  const dbCatalogRow = {
    ...dbInternalRow,
    id: 'snap-2',
    mode: 'catalog' as const,
    // Even if rows_json was historically polluted, catalog rows must come out clean.
    rows: [
      {
        batchId: 'b-1',
        batchCode: 'BC-1',
        name: 'Skywalker OG',
        availableQty: 12,
        unitPrice: 1000,
        unitCost: 800, // rogue field — must be stripped on read
        estimatedMargin: 0.2 // rogue field — must be stripped on read
      }
    ]
  };

  it('returns null when a viewer requests an internal snapshot', () => {
    const result = getViewerSafeSnapshot(dbInternalRow, 'viewer');
    expect(result).toBeNull();
  });

  it('returns the snapshot with re-sanitized catalog rows for a viewer on a catalog snapshot', () => {
    const result = getViewerSafeSnapshot(dbCatalogRow, 'viewer');
    expect(result).not.toBeNull();
    expect(result!.rows).toBeDefined();
    // Rogue cost/margin fields stripped on read.
    expect(result!.rows![0]).not.toHaveProperty('unitCost');
    expect(result!.rows![0]).not.toHaveProperty('estimatedMargin');
    expect(result!.rows![0]).toMatchObject({ batchCode: 'BC-1', name: 'Skywalker OG' });
  });

  it('re-sanitizes rogue cost fields on read for non-viewer roles on a catalog snapshot', () => {
    const result = getViewerSafeSnapshot(dbCatalogRow, 'operator');
    expect(result).not.toBeNull();
    expect(result!.rows![0]).not.toHaveProperty('unitCost');
    expect(result!.rows![0]).not.toHaveProperty('estimatedMargin');
  });

  it('keeps internal fields for an operator/manager/owner reading an internal snapshot (after read-side re-sanitize)', () => {
    for (const role of ['operator', 'manager', 'owner', 'admin']) {
      const result = getViewerSafeSnapshot(dbInternalRow, role);
      expect(result, `role=${role} should see the snapshot`).not.toBeNull();
      expect(result!.rows![0]).toHaveProperty('unitCost', 800);
      expect(result!.rows![0]).toHaveProperty('estimatedMargin', 0.2);
      // internalMargin is not in the internal allowlist (only unitCost/estimatedMargin/reason are).
      expect(result!.rows![0]).not.toHaveProperty('internalMargin');
    }
  });

  it('returns null for a null/undefined snapshot', () => {
    expect(getViewerSafeSnapshot(null, 'operator')).toBeNull();
    expect(getViewerSafeSnapshot(undefined, 'manager')).toBeNull();
  });

  it('handles snapshots whose rows_json is missing or not an array', () => {
    const bad = { ...dbCatalogRow, rows: null as unknown as Array<Record<string, unknown>> };
    const result = getViewerSafeSnapshot(bad, 'operator');
    expect(result).not.toBeNull();
    expect(result!.rows).toEqual([]);
  });
});

describe('redactCustomerSheetSnapshotJournalPayload — command_journal payload redaction (final-review repair)', () => {
  // The handler that writes a customer sheet snapshot receives an
  // executeCommand input payload like:
  //
  //   { customerId, mode: 'internal' | 'catalog', rows: [ { ...cost/margin... } ], notes? }
  //
  // executeCommand persists that same payload into command_journal.input_payload
  // and recoverySearch returns the raw input_payload. Internal rows therefore
  // leak operator-only cost/margin/reason fields through the recovery surface
  // even though the persisted snapshot rows themselves are sanitized.
  //
  // The redactor strips/replaces `rows` with a safe summary on its way to the
  // command journal, while keeping enough identity (customerId, mode,
  // itemCount, notes) to keep recovery search useful.

  const internalPayload = {
    customerId: 'cust-1',
    mode: 'internal' as const,
    notes: 'Quoted for buyer X',
    rows: [
      {
        batchId: 'b-1',
        batchCode: 'BC-1',
        name: 'Skywalker OG',
        availableQty: 12,
        unitPrice: 1000,
        unitCost: 800,
        estimatedMargin: 0.2,
        internalMargin: 0.18,
        reason: 'top seller'
      },
      {
        batchId: 'b-2',
        batchCode: 'BC-2',
        name: 'GG4',
        availableQty: 5,
        unitPrice: 1200,
        unitCost: 900,
        estimatedMargin: 0.25,
        reason: 'aged'
      }
    ]
  };

  it('replaces internal rows with a safe summary (itemCount) instead of leaking cost/margin', () => {
    const redacted = redactCustomerSheetSnapshotJournalPayload(internalPayload);
    expect(redacted).not.toBe(internalPayload); // not a mutated reference
    expect(redacted.customerId).toBe('cust-1');
    expect(redacted.mode).toBe('internal');
    expect(redacted.notes).toBe('Quoted for buyer X');
    expect(redacted.itemCount).toBe(2);
    // The raw rows array must not survive into the journal payload.
    expect(redacted).not.toHaveProperty('rows');
    const json = JSON.stringify(redacted);
    expect(json).not.toMatch(/unitCost/);
    expect(json).not.toMatch(/estimatedMargin/);
    expect(json).not.toMatch(/internalMargin/);
    expect(json).not.toMatch(/"reason":"top seller"/);
    expect(json).not.toMatch(/"reason":"aged"/);
  });

  it('also redacts catalog mode rows (defense in depth: never journal raw rows)', () => {
    const catalogPayload = { ...internalPayload, mode: 'catalog' as const };
    const redacted = redactCustomerSheetSnapshotJournalPayload(catalogPayload);
    expect(redacted.mode).toBe('catalog');
    expect(redacted.itemCount).toBe(2);
    expect(redacted).not.toHaveProperty('rows');
  });

  it('handles a payload with no rows field gracefully', () => {
    const noRows = { customerId: 'c', mode: 'internal' as const };
    const redacted = redactCustomerSheetSnapshotJournalPayload(noRows);
    expect(redacted.customerId).toBe('c');
    expect(redacted.mode).toBe('internal');
    expect(redacted.itemCount).toBe(0);
    expect(redacted).not.toHaveProperty('rows');
  });

  it('does not mutate the input payload (handler still sees original rows)', () => {
    const before = JSON.stringify(internalPayload);
    redactCustomerSheetSnapshotJournalPayload(internalPayload);
    expect(JSON.stringify(internalPayload)).toBe(before);
  });

  it('preserves miscellaneous non-row scalar payload fields', () => {
    const noisy = { ...internalPayload, requestId: 'req-99', traceId: 'trace-aa' };
    const redacted = redactCustomerSheetSnapshotJournalPayload(noisy);
    expect(redacted.requestId).toBe('req-99');
    expect(redacted.traceId).toBe('trace-aa');
  });
});

describe('redactCustomerSheetSnapshotJournalPayload — rowsHash for idempotency (regression fix)', () => {
  // The journal-safe payload must include a stable, content-bound hash of the
  // canonicalized rows so the idempotency-key guard can detect "same key,
  // different rows" replays without ever materializing the raw cost/margin
  // values into the journal.
  const payloadA = {
    customerId: 'cust-1',
    mode: 'internal' as const,
    rows: [
      { batchId: 'b-1', name: 'Skywalker OG', unitCost: 800, estimatedMargin: 0.2 },
      { batchId: 'b-2', name: 'GG4', unitCost: 900, estimatedMargin: 0.25 }
    ]
  };

  it('includes a rowsHash string in the redacted journal payload', () => {
    const redacted = redactCustomerSheetSnapshotJournalPayload(payloadA);
    expect(typeof redacted.rowsHash).toBe('string');
    expect((redacted.rowsHash as string).length).toBeGreaterThan(0);
  });

  it('produces the same rowsHash for identical row arrays', () => {
    const a = redactCustomerSheetSnapshotJournalPayload(payloadA);
    const b = redactCustomerSheetSnapshotJournalPayload({
      ...payloadA,
      rows: [...payloadA.rows]
    });
    expect(a.rowsHash).toBe(b.rowsHash);
  });

  it('produces the same rowsHash regardless of key order within a row (canonicalized)', () => {
    const reordered = {
      ...payloadA,
      rows: payloadA.rows.map((row) => {
        // Rebuild the row with keys in reverse order
        const reversed: Record<string, unknown> = {};
        for (const key of Object.keys(row).reverse()) {
          reversed[key] = (row as Record<string, unknown>)[key];
        }
        return reversed;
      })
    };
    const a = redactCustomerSheetSnapshotJournalPayload(payloadA);
    const b = redactCustomerSheetSnapshotJournalPayload(reordered);
    expect(a.rowsHash).toBe(b.rowsHash);
  });

  it('changes rowsHash when a row unitCost changes', () => {
    const a = redactCustomerSheetSnapshotJournalPayload(payloadA);
    const changed = {
      ...payloadA,
      rows: [
        { ...payloadA.rows[0], unitCost: 850 },
        payloadA.rows[1]
      ]
    };
    const b = redactCustomerSheetSnapshotJournalPayload(changed);
    expect(b.rowsHash).not.toBe(a.rowsHash);
  });

  it('changes rowsHash when a row name changes', () => {
    const a = redactCustomerSheetSnapshotJournalPayload(payloadA);
    const renamed = {
      ...payloadA,
      rows: [
        { ...payloadA.rows[0], name: 'Skywalker OG Premium' },
        payloadA.rows[1]
      ]
    };
    const b = redactCustomerSheetSnapshotJournalPayload(renamed);
    expect(b.rowsHash).not.toBe(a.rowsHash);
  });

  it('changes rowsHash when the row set differs but the count is identical', () => {
    // The whole point: same itemCount must NOT be treated as identical.
    const a = redactCustomerSheetSnapshotJournalPayload(payloadA);
    const swappedItems = {
      ...payloadA,
      rows: [
        { batchId: 'b-9', name: 'Different A', unitCost: 800, estimatedMargin: 0.2 },
        { batchId: 'b-8', name: 'Different B', unitCost: 900, estimatedMargin: 0.25 }
      ]
    };
    const b = redactCustomerSheetSnapshotJournalPayload(swappedItems);
    expect(a.itemCount).toBe(b.itemCount);
    expect(b.rowsHash).not.toBe(a.rowsHash);
  });

  it('rowsHash does not leak raw cost/margin/reason strings', () => {
    const redacted = redactCustomerSheetSnapshotJournalPayload(payloadA);
    const hash = String(redacted.rowsHash);
    expect(hash).not.toMatch(/unitCost/i);
    expect(hash).not.toMatch(/estimatedMargin/i);
    expect(hash).not.toMatch(/internalMargin/i);
    expect(hash).not.toMatch(/reason/i);
    expect(hash).not.toMatch(/Skywalker/);
    expect(hash).not.toMatch(/GG4/);
    // Should be only hex-ish digest characters
    expect(hash).toMatch(/^[0-9a-f]+$/);
    // And shouldn't accidentally encode the raw cost numbers verbatim
    expect(hash).not.toMatch(/800/);
    expect(hash).not.toMatch(/900/);
  });

  it('rowsHash is stable for an empty rows array', () => {
    const empty = { customerId: 'c', mode: 'internal' as const, rows: [] };
    const a = redactCustomerSheetSnapshotJournalPayload(empty);
    const b = redactCustomerSheetSnapshotJournalPayload(empty);
    expect(a.rowsHash).toBe(b.rowsHash);
  });

  it('whole journal-safe payload JSON never contains raw cost/margin/reason values', () => {
    const redacted = redactCustomerSheetSnapshotJournalPayload(payloadA);
    const json = JSON.stringify(redacted);
    expect(json).not.toMatch(/"unitCost"/);
    expect(json).not.toMatch(/"estimatedMargin"/);
    expect(json).not.toMatch(/"internalMargin"/);
    expect(json).not.toMatch(/"reason"/);
    // And no literal cost numbers from the rows
    expect(json).not.toMatch(/\b800\b/);
    expect(json).not.toMatch(/\b900\b/);
  });
});
