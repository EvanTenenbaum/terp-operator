/**
 * Shared helper for persisting customer sheet snapshots (#62).
 *
 * Customer-facing snapshots (mode = 'catalog') must NEVER contain cost,
 * margin, or other internal operator fields. This rule mirrors the CSV
 * export boundary in `src/client/utils/salesExport.ts` and the on-screen
 * margin toggle in `useUiStore.showMargin`.
 *
 * The Recent Sheets tab (#62) opens these snapshots and lets operators
 * add items back to the current draft. Each retained field has a purpose:
 *   - batchId, batchCode  → re-resolve against live inventory at "Add" time
 *   - name, category, tags, vendor → display in the snapshot detail
 *   - availableQty (at snapshot time) and unitPrice → context the operator quoted
 *
 * Internal snapshots additionally retain unitCost, estimatedMargin, and
 * reason so the operator can revisit pricing/buyer-fit rationale.
 */

export const CUSTOMER_SHEET_MODES = ['internal', 'catalog'] as const;
export type CustomerSheetMode = (typeof CUSTOMER_SHEET_MODES)[number];

/**
 * Fields kept on customer-facing (catalog) snapshot rows.
 *
 * IMPORTANT: keep this list cost/margin-free. Adding fields with names like
 * `unitCost`, `estimatedMargin`, `internalMargin`, or anything containing
 * "cost" or "margin" leaks operator-only data into customer-shared rows.
 */
const CATALOG_FIELDS: readonly string[] = [
  'batchId',
  'batchCode',
  'name',
  'itemAlias',
  'displayName',
  'category',
  'vendor',
  'availableQty',
  'unitPrice',
  'tags'
];

/**
 * Fields kept on internal (operator) snapshot rows. Adds cost/margin and
 * the internal "why shown" reason to the catalog allowlist.
 */
const INTERNAL_FIELDS: readonly string[] = [
  ...CATALOG_FIELDS,
  'unitCost',
  'estimatedMargin',
  'reason'
];

export function catalogSnapshotFields(): string[] {
  return [...CATALOG_FIELDS];
}

export function internalSnapshotFields(): string[] {
  return [...INTERNAL_FIELDS];
}

export function snapshotFieldsFor(mode: CustomerSheetMode): string[] {
  return mode === 'catalog' ? catalogSnapshotFields() : internalSnapshotFields();
}

/**
 * Build a sanitized snapshot row array for persistence.
 *
 * Only fields in the allowlist for the given mode are copied. Missing values
 * are dropped (not coerced to null/undefined) so the shape of the persisted
 * JSON stays compact and predictable.
 */
export function buildCustomerSheetSnapshotRows(
  rows: ReadonlyArray<Record<string, unknown>>,
  mode: CustomerSheetMode
): Array<Record<string, unknown>> {
  const fields = mode === 'catalog' ? CATALOG_FIELDS : INTERNAL_FIELDS;
  return rows.map((row) => {
    const out: Record<string, unknown> = {};
    for (const field of fields) {
      if (row[field] !== undefined) {
        out[field] = row[field];
      }
    }
    return out;
  });
}

/**
 * Persisted snapshot envelope as returned by the customer_sheet_snapshots
 * table (the `customerSheetSnapshotById` query). `rows` corresponds to the
 * `rows_json` column.
 */
export interface PersistedCustomerSheetSnapshot {
  id: string;
  customerId: string;
  mode: CustomerSheetMode | string;
  actorId?: string | null;
  actorName?: string | null;
  itemCount: number;
  notes?: string | null;
  createdAt: string | Date;
  rows: Array<Record<string, unknown>> | null | undefined;
}

const VIEWER_ROLE = 'viewer';

/**
 * Read-side privacy guard for customer sheet snapshots (#62/#63 reviewer fix).
 *
 * Two responsibilities:
 *
 *   1. Viewer privacy: a `viewer` role must NEVER receive an internal
 *      (operator) snapshot. We return null instead of leaking cost/margin
 *      data through stale rows_json or a future leak vector.
 *
 *   2. Belt-and-suspenders re-sanitization: even though createCustomerSheetSnapshot
 *      sanitizes on write, rows_json sitting in the DB could be polluted by
 *      older snapshots written before sanitization, hand-edited rows, or a
 *      bug in a future write path. We re-run `buildCustomerSheetSnapshotRows`
 *      on the way out so catalog reads can never carry cost/margin even if
 *      the stored JSON is dirty.
 */
export function getViewerSafeSnapshot(
  snapshot: PersistedCustomerSheetSnapshot | null | undefined,
  role: string | null | undefined
): PersistedCustomerSheetSnapshot | null {
  if (!snapshot) return null;
  const mode = snapshot.mode === 'catalog' ? 'catalog' : 'internal';
  if (role === VIEWER_ROLE && mode === 'internal') {
    return null;
  }
  const rawRows = Array.isArray(snapshot.rows) ? snapshot.rows : [];
  const sanitized = buildCustomerSheetSnapshotRows(rawRows, mode);
  return {
    ...snapshot,
    mode,
    rows: sanitized
  };
}

/**
 * Canonicalize a JSON-ish value by sorting object keys recursively. This is a
 * shared-bundle-safe (no node:crypto, no Buffer) helper so the journal-safe
 * row hash stays identical whether it is computed in the server bus or in a
 * test harness importing the shared module directly.
 */
function canonicalizeForHash(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(canonicalizeForHash);
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    sorted[key] = canonicalizeForHash((value as Record<string, unknown>)[key]);
  }
  return sorted;
}

/**
 * Stable, non-cryptographic 53-bit string hash (cyrb53). Returned as a 0-padded
 * hex string so two different inputs almost never collide for idempotency-key
 * misuse detection. We intentionally avoid `node:crypto` here because this
 * module is bundled into the browser client (SalesView.tsx imports it). The
 * output is a digest only — it does not contain any of the input characters,
 * so feeding raw cost/margin numbers in still keeps them out of the journal.
 */
function stableStringHash(input: string): string {
  let h1 = 0xdeadbeef ^ 0;
  let h2 = 0x41c6ce57 ^ 0;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const hi = (2097151 & h2) >>> 0;
  const lo = h1 >>> 0;
  return hi.toString(16).padStart(6, '0') + lo.toString(16).padStart(8, '0');
}

/**
 * Final-review repair (#62/#63 follow-up): redact the createCustomerSheetSnapshot
 * input payload before it lands in command_journal.input_payload.
 *
 * executeCommand stores the raw input payload alongside the command record,
 * and recoverySearch returns that raw payload back to operator/admin surfaces.
 * For createCustomerSheetSnapshot the input payload contains the live row
 * array — including unitCost / estimatedMargin / internalMargin / reason for
 * internal-mode snapshots. Even though the persisted snapshot itself goes
 * through buildCustomerSheetSnapshotRows on its way to customer_sheet_snapshots,
 * the journal copy is untouched and re-exposes the very cost/margin fields the
 * snapshot pipeline is built to keep behind a viewer-role + sanitize gate.
 *
 * This helper returns a journal-safe view of the payload: customerId + mode
 * + itemCount + notes + any other scalar fields, with the raw `rows` array
 * removed entirely. We deliberately drop `rows` rather than re-sanitize them
 * because the command_journal does not need per-row identity to be useful;
 * itemCount + customerId + mode + reason text (e.g. "Quoted for buyer X") is
 * already enough for recoverySearch to navigate back to the persisted snapshot
 * row via affected_ids.
 *
 * The original payload is not mutated — the snapshot handler still receives
 * the untouched payload (with real rows) so the database insert keeps full
 * row context.
 *
 * Idempotency regression (May 2026): the redacted payload also carries a
 * stable `rowsHash` digest derived from the canonicalized rows. The hash
 * itself is content-bound but does not contain any raw cost/margin/reason
 * characters, so it stays journal-safe. The command bus compares this same
 * journal-safe representation on both sides of the idempotency check, which
 * means "same idempotency key, different rows" is correctly rejected even
 * when the new rows happen to share the old itemCount.
 */
export function redactCustomerSheetSnapshotJournalPayload(
  payload: Record<string, unknown> | null | undefined
): Record<string, unknown> {
  const safe: Record<string, unknown> = {};
  const rows = payload && Array.isArray((payload as Record<string, unknown>).rows)
    ? ((payload as Record<string, unknown>).rows as unknown[])
    : [];
  if (payload) {
    for (const [key, value] of Object.entries(payload)) {
      if (key === 'rows') continue;
      safe[key] = value;
    }
  }
  safe.itemCount = rows.length;
  safe.rowsHash = stableStringHash(JSON.stringify(canonicalizeForHash(rows)));
  return safe;
}
