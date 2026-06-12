/**
 * UX-F02 / UX-F04 — pre-post confidence strip + duplicate-source helpers for
 * the Sale Builder (audit §F, Wave 4 "Pre-post confidence" / U03 epic).
 *
 * The checks below mirror EXACTLY what the server enforces in
 * `src/server/services/commandBus.ts` — no more, no less:
 *
 *  - confirmSalesOrder (commandBus.ts:3523-3573) refuses when:
 *      · any line fails salesLineValidationIssues (commandBus.ts:7602-7609 —
 *        item name missing, qty <= 0, unitPrice < 0, batchId missing)
 *      · any line has unitCostResolved = false (unresolved landed COGS,
 *        commandBus.ts:3532-3533)
 *    Credit limit is ADVISORY ONLY (TER-1659, commandBus.ts:3541-3546): the
 *    server emits a warning and proceeds.
 *
 *  - postSalesOrder (commandBus.ts:3619-3677) additionally refuses when:
 *      · two lines share a source key, where sourceKey = sourceRowKey ||
 *        batchId (commandBus.ts:3636-3644)
 *      · a line has no batchId, or batch.availableQty < line.qty
 *        (commandBus.ts:3646-3650)
 *    Credit limit is again ADVISORY ONLY (commandBus.ts:3664-3669).
 *
 * The strip is purely informational: it surfaces the refusal BEFORE the
 * attempt and never adds disabled state to any button.
 */

export interface SalePrePostLine {
  id?: unknown;
  itemName?: unknown;
  qty?: unknown;
  unitPrice?: unknown;
  batchId?: unknown;
  batchCode?: unknown;
  sourceRowKey?: unknown;
  unitCostResolved?: unknown;
  availableQty?: unknown;
}

export interface SalePrePostCheck {
  key: 'credit' | 'duplicates' | 'priced' | 'inventory';
  label: string;
  ok: boolean;
  /** True when the server only WARNS for this check (never refuses). */
  advisory: boolean;
  /** Shown as the failure explanation / fix-link title. */
  detail: string | null;
  /** Line ids the deep-link should focus (empty for the credit check). */
  failingLineIds: string[];
}

function str(value: unknown): string {
  if (value == null) return '';
  return String(value).trim();
}

/**
 * Mirror of the server's per-line source key: `line.sourceRowKey || line.batchId`
 * (commandBus.ts:3638). Returns null when the line has neither — the server
 * skips such lines in the duplicate guard.
 */
export function saleLineSourceKey(line: SalePrePostLine): string | null {
  return str(line.sourceRowKey) || str(line.batchId) || null;
}

/**
 * UX-F04 — line ids whose source key appears on MORE THAN ONE line of the
 * same order. Mirrors the postSalesOrder duplicate-source refusal
 * (commandBus.ts:3636-3644); the finder pane's addedBatchIds guard is the
 * add-time half, this is the line-grid mirror.
 */
export function duplicateSourceLineIds(lines: SalePrePostLine[]): Set<string> {
  const byKey = new Map<string, string[]>();
  for (const line of lines) {
    const key = saleLineSourceKey(line);
    if (!key) continue;
    const ids = byKey.get(key) ?? [];
    ids.push(str(line.id));
    byKey.set(key, ids);
  }
  const duplicates = new Set<string>();
  for (const ids of byKey.values()) {
    if (ids.length > 1) for (const id of ids) duplicates.add(id);
  }
  return duplicates;
}

export interface BuildSalePrePostChecksInput {
  /** Order total — same figure the server reads (sales_orders.total). */
  orderTotal: number;
  /** customers.balance / customers.credit_limit — the same columns the
   *  confirm/post credit warnings read (commandBus.ts:3542 / 3665). */
  customerBalance: number;
  creditLimit: number;
  lines: SalePrePostLine[];
}

export function buildSalePrePostChecks({ orderTotal, customerBalance, creditLimit, lines }: BuildSalePrePostChecksInput): SalePrePostCheck[] {
  // 1) Credit — ADVISORY: same arithmetic as commandBus.ts:3542/3665. The
  //    server warns and proceeds (TER-1659); the copy must not claim a block.
  const creditOk = !(customerBalance + orderTotal > creditLimit);

  // 2) Duplicate source rows — POST refusal (commandBus.ts:3636-3644).
  const dupIds = duplicateSourceLineIds(lines);

  // 3) All lines priced — refusals on BOTH confirm and post: negative price
  //    (salesLineValidationIssues, commandBus.ts:7606) and unresolved landed
  //    COGS (commandBus.ts:3532-3533 / 3630-3631).
  const unpricedIds = lines
    .filter((line) => Number(line.unitPrice ?? 0) < 0 || line.unitCostResolved === false)
    .map((line) => str(line.id));

  // 4) Inventory resolved — confirm+post refusals from salesLineValidationIssues
  //    (item name commandBus.ts:7604, qty>0 7605, batchId 7607) plus the
  //    post-only availability refusal batch.availableQty < line.qty
  //    (commandBus.ts:3646-3650).
  const inventoryIds = lines
    .filter((line) => {
      if (!str(line.itemName)) return true;
      if (Number(line.qty ?? 0) <= 0) return true;
      if (!str(line.batchId)) return true;
      const available = line.availableQty;
      if (available != null && Number.isFinite(Number(available)) && Number(line.qty ?? 0) > Number(available)) return true;
      return false;
    })
    .map((line) => str(line.id));

  return [
    {
      key: 'credit',
      label: 'Credit ok',
      ok: creditOk,
      advisory: true,
      detail: creditOk
        ? null
        : `Balance $${customerBalance.toFixed(2)} + order $${orderTotal.toFixed(2)} exceeds credit limit $${creditLimit.toFixed(2)}. The server will post a warning but will NOT refuse (advisory, TER-1659).`,
      failingLineIds: []
    },
    {
      key: 'duplicates',
      label: 'No duplicate source rows',
      ok: dupIds.size === 0,
      advisory: false,
      detail: dupIds.size === 0
        ? null
        : 'A source row appears on more than one line of this order. The server will refuse Post until the duplicate is removed or the source is split.',
      failingLineIds: [...dupIds]
    },
    {
      key: 'priced',
      label: 'All lines priced',
      ok: unpricedIds.length === 0,
      advisory: false,
      detail: unpricedIds.length === 0
        ? null
        : 'A line has a negative price or unresolved landed COGS. The server will refuse Confirm and Post until it is resolved.',
      failingLineIds: unpricedIds
    },
    {
      key: 'inventory',
      label: 'Inventory resolved',
      ok: inventoryIds.length === 0,
      advisory: false,
      detail: inventoryIds.length === 0
        ? null
        : 'A line is missing an item name, quantity, or exact inventory source — or asks for more than the source batch has available. The server will refuse Confirm/Post (availability is checked at Post).',
      failingLineIds: inventoryIds
    }
  ];
}

/**
 * Map of lineId → human-readable pre-post reasons, for surfacing the same
 * check text inside the Line validation panel when a ✗ deep-links there.
 */
export function prePostIssuesByLineId(checks: SalePrePostCheck[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const check of checks) {
    if (check.ok || !check.detail) continue;
    for (const id of check.failingLineIds) {
      const existing = map.get(id) ?? [];
      existing.push(check.detail);
      map.set(id, existing);
    }
  }
  return map;
}

/** UX-F04 — line-grid mirror of the finder pane's "Already in order" chip. */
export function AlreadyInOrderChip({ isDuplicate }: { isDuplicate: boolean }) {
  if (!isDuplicate) return null;
  return (
    <span
      className="selection-pill warning"
      style={{ fontSize: 11, marginLeft: 6 }}
      title="This line's source row appears on another line of this order. The server will refuse Post until the duplicate is removed (duplicate-source guard)."
    >
      Already in order
    </span>
  );
}

export interface SalePrePostStripProps {
  /** 'draft' shows "before Confirm"; 'confirmed' shows "before Post". */
  orderStatus: string;
  checks: SalePrePostCheck[];
  /** Deep-link: focus the offending line(s) — opens the Line validation panel. */
  onFocusLines: (check: SalePrePostCheck) => void;
  /** Deep-link: open the customer credit/balance panel. */
  onOpenCredit: () => void;
}

/**
 * UX-F02 — compact pre-post checklist strip. Informational only: it never
 * disables the Confirm/Post primaries beyond their existing disabled logic.
 */
export function SalePrePostStrip({ orderStatus, checks, onFocusLines, onOpenCredit }: SalePrePostStripProps) {
  const stage = orderStatus === 'confirmed' ? 'Post' : 'Confirm';
  return (
    <div className="control-band subtle-band mt-2" data-testid="sale-pre-post-strip" role="group" aria-label={`Pre-${stage.toLowerCase()} checks`}>
      <span className="text-xs font-medium text-zinc-600">Before {stage}:</span>
      {checks.map((check) => {
        if (check.ok) {
          return (
            <span key={check.key} className="selection-pill success" style={{ fontSize: 11 }} data-testid={`pre-post-${check.key}-ok`}>
              ✓ {check.label}
            </span>
          );
        }
        return (
          <button
            key={check.key}
            type="button"
            className={`selection-pill ${check.advisory ? 'warning' : 'danger'}`}
            style={{ fontSize: 11, cursor: 'pointer' }}
            data-testid={`pre-post-${check.key}-fix`}
            title={check.detail ?? undefined}
            onClick={() => (check.key === 'credit' ? onOpenCredit() : onFocusLines(check))}
          >
            ✗ {check.label}
            {check.failingLineIds.length ? ` (${check.failingLineIds.length})` : ''}
            {check.advisory ? ' — advisory' : ''}
          </button>
        );
      })}
    </div>
  );
}
