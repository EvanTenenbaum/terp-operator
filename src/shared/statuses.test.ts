/**
 * statuses.test.ts — static-analysis drift guard for the canonical status registry.
 *
 * Purpose: assert that every status literal written by `commandBus.ts` via
 * `tx.update(<table>).set({ status: '<value>' })` or
 * `tx.insert(<table>).values({ status: '<value>' })` is a valid member of
 * the corresponding entity's `z.enum([...])` declared in `src/shared/statuses.ts`.
 *
 * Mitigation for risk R-4 (Phase 0a audit — status enum drift):
 *   The command bus is the runtime source of truth for status transitions;
 *   `statuses.ts` is the declarative source of truth for what each entity
 *   may be in. They must agree. This test runs purely on source text so it
 *   does not require a database and is safe in the default Vitest run.
 *
 * What this test catches:
 *   - A new `commandBus.ts` write `set({ status: 'foo' })` that adds a value
 *     missing from the matching `statuses.ts` enum.
 *   - A typo (`'reveresd'` instead of `'reversed'`) in a `set/values` write.
 *
 * What this test intentionally does NOT catch (informational warning only):
 *   - Statuses declared in `statuses.ts` that the command bus never writes
 *     (some statuses are schema defaults set at insert time without an
 *      explicit `status: '...'` write, or are terminal/historical values
 *      consumed only by views/filters). These are reported via `console.warn`.
 *   - Dynamic writes via a `status` variable (e.g. `.set({ status })` where
 *     `status` is validated upstream by a Zod parse). Those are guarded by
 *     the corresponding `*PayloadSchema` at intake.
 *
 * Implementation notes:
 *   - Pure text parsing of `commandBus.ts`. No transpile, no tsc.
 *   - Brace-aware scanner extracts every `.set({...})` / `.values({...})`
 *     body. For each body, the nearest preceding `.update(<table>)` or
 *     `.insert(<table>)` call associates the write with a table identifier.
 *   - String-literal `status: '<value>'` patterns are extracted, including
 *     both branches of `status: <expr> ? '<a>' : '<b>'` ternaries.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import * as Statuses from './statuses';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const COMMAND_BUS_PATH = resolve(__dirname, '../server/services/commandBus.ts');

// ─────────────────────────────────────────────────────────────────────────────
// Drizzle table identifier (as referenced in `tx.update(...)` / `tx.insert(...)`
// inside commandBus.ts) → canonical entity status enum from statuses.ts.
//
// Add to this map when you introduce a new entity that has a lifecycle status
// column AND is written by the command bus. If commandBus.ts writes a status
// literal to a table missing from this map, the registry-completeness test
// fails with the unmapped table name so the gap is visible.
// ─────────────────────────────────────────────────────────────────────────────
const TABLE_TO_ENUM: Record<string, z.ZodEnum<[string, ...string[]]>> = {
  purchaseOrders: Statuses.PurchaseOrderStatus,
  purchaseOrderLines: Statuses.PurchaseOrderLineStatus,
  purchaseReceipts: Statuses.PurchaseReceiptStatus,
  salesOrders: Statuses.SalesOrderStatus,
  salesOrderLines: Statuses.SalesOrderLineStatus,
  batches: Statuses.BatchStatus,
  invoices: Statuses.InvoiceStatus,
  payments: Statuses.PaymentStatus,
  vendorBills: Statuses.VendorBillStatus,
  vendorPayments: Statuses.VendorPaymentStatus,
  pickLists: Statuses.PickListStatus,
  fulfillmentLines: Statuses.FulfillmentLineStatus,
  connectorRequests: Statuses.ConnectorRequestStatus,
  customerNeeds: Statuses.CustomerNeedStatus,
  vendorSupply: Statuses.VendorSupplyStatus,
  matchmakingMatches: Statuses.MatchmakingMatchStatus,
  invoiceDisputes: Statuses.InvoiceDisputeStatus,
  correctionJournalEntries: Statuses.CorrectionJournalEntryStatus,
  periodLocks: Statuses.PeriodLockStatus,
  archiveRuns: Statuses.ArchiveRunStatus,
  photographyQueue: Statuses.PhotographyQueueStatus,
  refereeCredits: Statuses.RefereeCreditStatus,
  batchMedia: Statuses.BatchMediaStatus,
  items: Statuses.ItemStatus,
  appointments: Statuses.AppointmentStatus,
  commandJournal: Statuses.CommandJournalStatus,
};

interface StatusWrite {
  table: string;
  status: string;
  line: number;
}

/**
 * Scan commandBus.ts source for `.set({...})` and `.values({...})` calls,
 * brace-aware. Return one StatusWrite per literal status value found.
 */
function parseStatusWrites(source: string): StatusWrite[] {
  // ── Pre-compute newline offsets for line numbering ──────────────────────
  const lineStarts: number[] = [0];
  for (let i = 0; i < source.length; i++) {
    if (source[i] === '\n') lineStarts.push(i + 1);
  }
  const offsetToLine = (off: number): number => {
    let lo = 0;
    let hi = lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (lineStarts[mid] <= off) lo = mid;
      else hi = mid - 1;
    }
    return lo + 1;
  };

  // ── Index every `.update(<table>)` / `.insert(<table>)` call ────────────
  const tableCalls: Array<{ offset: number; table: string }> = [];
  for (const m of source.matchAll(/\.(?:update|insert)\(\s*(\w+)\s*\)/g)) {
    tableCalls.push({ offset: m.index!, table: m[1] });
  }
  // Binary search: latest tableCall whose offset is < target.
  const nearestTable = (target: number): string | null => {
    let lo = 0;
    let hi = tableCalls.length - 1;
    let best = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (tableCalls[mid].offset < target) {
        best = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    return best >= 0 ? tableCalls[best].table : null;
  };

  // ── Find every `.set({` / `.values({` call and walk its body ────────────
  const writes: StatusWrite[] = [];
  const callRegex = /\.(?:set|values)\s*\(\s*\{/g;
  let m: RegExpExecArray | null;
  while ((m = callRegex.exec(source)) !== null) {
    const braceOpen = m.index + m[0].length - 1; // index of `{`
    // Brace-aware scan for matching close brace.
    let depth = 1;
    let i = braceOpen + 1;
    while (i < source.length && depth > 0) {
      const c = source[i];
      if (c === '{') depth++;
      else if (c === '}') depth--;
      i++;
    }
    if (depth !== 0) continue; // unbalanced (shouldn't happen in valid TS)
    const body = source.slice(braceOpen + 1, i - 1);
    const bodyAbsOffset = braceOpen + 1;

    const table = nearestTable(m.index);
    if (!table) continue;

    // Direct literal: `status: 'X'` or `status: "X"`.
    const literalRegex = /\bstatus\s*:\s*['"]([a-z_]+)['"]/g;
    let s: RegExpExecArray | null;
    while ((s = literalRegex.exec(body)) !== null) {
      writes.push({
        table,
        status: s[1],
        line: offsetToLine(bodyAbsOffset + s.index),
      });
    }
    // Ternary literal: `status: <expr> ? 'X' : 'Y'` (or `: <var>`).
    // The pre-`?` segment may not contain commas, newlines, or close-brace.
    const ternaryRegex =
      /\bstatus\s*:\s*[^,\n}]*?\?\s*['"]([a-z_]+)['"]\s*:\s*(?:['"]([a-z_]+)['"])?/g;
    while ((s = ternaryRegex.exec(body)) !== null) {
      if (s[1]) writes.push({ table, status: s[1], line: offsetToLine(bodyAbsOffset + s.index) });
      if (s[2]) writes.push({ table, status: s[2], line: offsetToLine(bodyAbsOffset + s.index) });
    }
  }
  return writes;
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('commandBus.ts ↔ statuses.ts (R-4: status enum drift guard)', () => {
  const source = readFileSync(COMMAND_BUS_PATH, 'utf8');
  const writes = parseStatusWrites(source);

  it('parses a plausible number of status writes from commandBus.ts (parser sanity)', () => {
    // We currently see ~60 literal writes. If this collapses to <30 the parser
    // is silently missing matches (e.g. a regex regression) and the drift
    // guard would pass vacuously. Tripwire it.
    expect(writes.length).toBeGreaterThan(30);
  });

  it('every table written with a status literal has an enum mapping in TABLE_TO_ENUM', () => {
    const unmapped = new Set<string>();
    for (const w of writes) {
      if (!(w.table in TABLE_TO_ENUM)) unmapped.add(w.table);
    }
    if (unmapped.size > 0) {
      throw new Error(
        `commandBus.ts writes status to tables with no TABLE_TO_ENUM mapping: ` +
          `${[...unmapped].sort().join(', ')}. ` +
          `Add an entry in src/shared/statuses.test.ts so the drift guard can ` +
          `validate the literal against a canonical enum.`,
      );
    }
  });

  it('every status literal written by commandBus.ts is a member of its entity enum (R-4)', () => {
    const failures: string[] = [];
    for (const w of writes) {
      const enumSchema = TABLE_TO_ENUM[w.table];
      if (!enumSchema) continue; // covered by mapping test above
      const allowed = enumSchema.options as readonly string[];
      if (!allowed.includes(w.status)) {
        failures.push(
          `  commandBus.ts:${w.line}  ${w.table}.status = '${w.status}' ` +
            `(enum members: [${allowed.join(', ')}])`,
        );
      }
    }
    if (failures.length > 0) {
      throw new Error(
        `Status enum drift detected — commandBus.ts writes status literals ` +
          `not present in src/shared/statuses.ts:\n${failures.join('\n')}\n\n` +
          `Either add the value to the entity's z.enum([...]) in statuses.ts ` +
          `(if the new transition is intentional) or fix the typo in commandBus.ts.`,
      );
    }
  });

  it('reports statuses.ts enum values never written by commandBus.ts (informational)', () => {
    // Build set of (table, status) pairs actually written.
    const usedByTable = new Map<string, Set<string>>();
    for (const w of writes) {
      if (!usedByTable.has(w.table)) usedByTable.set(w.table, new Set());
      usedByTable.get(w.table)!.add(w.status);
    }
    const warnings: string[] = [];
    for (const [table, enumSchema] of Object.entries(TABLE_TO_ENUM)) {
      const used = usedByTable.get(table) ?? new Set<string>();
      const allowed = enumSchema.options as readonly string[];
      for (const value of allowed) {
        if (!used.has(value)) {
          warnings.push(`${table}.status='${value}'`);
        }
      }
    }
    // Soft warning only. Many of these are legitimate schema defaults
    // (set at INSERT time without an explicit `status: '...'` literal in
    // the .values({...}) call — e.g. column .default('open')) or are
    // historical/read-only statuses driven by intake flows that route
    // through dynamic `status` variables rather than literals.
    if (warnings.length > 0) {
      // eslint-disable-next-line no-console
      console.warn(
        `[R-4 informational] ${warnings.length} statuses declared in ` +
          `src/shared/statuses.ts are not written as literals by commandBus.ts ` +
          `(may be schema defaults, intake-side values, or variable assignments):\n  - ` +
          warnings.join('\n  - '),
      );
    }
    // Intentionally do NOT fail: this is a discovery aid, not a contract.
    expect(true).toBe(true);
  });
});
