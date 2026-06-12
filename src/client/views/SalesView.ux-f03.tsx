/**
 * UX-F03 — inline line-cell inventory resolution (MR-006).
 *
 * The sale-line item entry becomes an async typeahead over the EXISTING
 * finder resolver: it reuses the finder pane's search semantics
 * (`parseFinderSearch` + `buildFinderHaystack`, exported from
 * InventoryFinderPanel) against the already-loaded `queries.reference`
 * availableBatches — the same data the finder pane searches. No new tRPC
 * procedures; the finder pane path is untouched.
 *
 * Two wiring points in SalesView:
 *  1. The "Request / item" entry input renders <SaleLineItemTypeahead>:
 *     typing shorthand ("m15") lists matching posted batches; picking one
 *     binds inventory (addSalesOrderLine with batchId). Enter with no pick
 *     falls through to the existing unresolved-draft-line path, which
 *     persists a needs_resolution row feeding the validation panel and the
 *     Wave-4 pre-post strip's "inventory resolved" check.
 *  2. Grid edits to the `unresolvedSourceText` cell are intercepted on
 *     commit: a UNIQUE finder match binds the line to that batch
 *     (updateSalesOrderLine { batchId, sourceRowKey, itemName }); zero or
 *     ambiguous matches persist as unresolved text (needs_resolution stays).
 */
import { useId, useMemo, useState } from 'react';
import type { KeyboardEvent } from 'react';
import {
  buildFinderHaystack,
  parseFinderSearch,
  type InventoryFinderBatch
} from '../components/InventoryFinderPanel';

export const TYPEAHEAD_MIN_CHARS = 2;
export const TYPEAHEAD_MAX_RESULTS = 6;

/**
 * Search available batches with the finder's exact semantics: every parsed
 * term must hit the haystack; an "under $N" clause caps unitPrice; rows with
 * no available stock are excluded; results sort by availableQty descending.
 */
export function searchFinderBatches(
  batches: ReadonlyArray<InventoryFinderBatch>,
  query: string,
  limit: number = TYPEAHEAD_MAX_RESULTS
): InventoryFinderBatch[] {
  const trimmed = query.trim();
  if (trimmed.length < TYPEAHEAD_MIN_CHARS) return [];
  const { terms, maxPrice } = parseFinderSearch(trimmed);
  if (!terms.length && maxPrice == null) return [];
  return batches
    .filter((row) => {
      if (Number(row.availableQty ?? 0) <= 0) return false;
      const tags = Array.isArray(row.tags)
        ? row.tags
        : String(row.tags ?? '').split(',').map((t) => t.trim()).filter(Boolean);
      const haystack = buildFinderHaystack(row, tags);
      if (terms.length && !terms.every((term) => haystack.includes(term))) return false;
      if (maxPrice != null && Number(row.unitPrice ?? 0) > maxPrice) return false;
      return true;
    })
    .sort((a, b) => Number(b.availableQty ?? 0) - Number(a.availableQty ?? 0))
    .slice(0, limit);
}

/**
 * Returns the batch a committed item-cell text resolves to — only when the
 * finder search yields EXACTLY ONE match. Ambiguous or empty results return
 * null so the line persists as needs_resolution (operator resolves via the
 * validation panel or the finder pane).
 */
export function resolveUniqueBatch(
  batches: ReadonlyArray<InventoryFinderBatch>,
  text: string
): InventoryFinderBatch | null {
  const matches = searchFinderBatches(batches, text, 2);
  return matches.length === 1 ? matches[0] : null;
}

/**
 * updateSalesOrderLine payload that binds an existing (unresolved) line to a
 * batch. Clears unresolvedSourceText, sets the duplicate-source guard key
 * (sourceRowKey = batchCode — same key addFinderBatch uses), and only adopts
 * the batch unitPrice when the line has no price yet (never overwrites an
 * operator-entered price).
 */
export function buildBindLinePayload(
  lineId: string,
  batch: InventoryFinderBatch,
  currentUnitPrice: number
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    lineId,
    batchId: batch.id,
    itemName: String(batch.name ?? ''),
    sourceRowKey: String(batch.batchCode ?? ''),
    unresolvedSourceText: ''
  };
  if (!(Number.isFinite(currentUnitPrice) && currentUnitPrice > 0)) {
    payload.unitPrice = Number(batch.unitPrice ?? 0);
  }
  return payload;
}

function moneyish(value: unknown): string {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n.toLocaleString('en-US', { maximumFractionDigits: 2 }) : '0';
}

export interface SaleLineItemTypeaheadProps {
  value: string;
  onChange: (value: string) => void;
  /** The finder's batch list (queries.reference availableBatches). */
  batches: ReadonlyArray<InventoryFinderBatch>;
  /** Picking a match binds inventory (existing addSalesOrderLine path). */
  onPickBatch: (batch: InventoryFinderBatch) => void;
  /** Enter with no highlighted match → existing unresolved-line path. */
  onSubmitUnresolved: () => void;
  placeholder?: string;
  disabled?: boolean;
}

/**
 * Async typeahead for the sale-line item entry. Combobox pattern: results
 * render as a listbox; ↑/↓ move the active option, Enter picks it (or, with
 * nothing highlighted, submits the text as an unresolved line), Escape
 * closes the list without losing the typed text.
 */
export function SaleLineItemTypeahead({
  value,
  onChange,
  batches,
  onPickBatch,
  onSubmitUnresolved,
  placeholder,
  disabled
}: SaleLineItemTypeaheadProps) {
  const listboxId = useId();
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const matches = useMemo(
    () => searchFinderBatches(batches, value),
    [batches, value]
  );
  const showList = open && matches.length > 0;

  function pick(batch: InventoryFinderBatch) {
    setOpen(false);
    setActiveIndex(-1);
    onPickBatch(batch);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' && matches.length) {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((index) => (index + 1) % matches.length);
      return;
    }
    if (event.key === 'ArrowUp' && matches.length) {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((index) => (index <= 0 ? matches.length - 1 : index - 1));
      return;
    }
    if (event.key === 'Escape') {
      setOpen(false);
      setActiveIndex(-1);
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      if (showList && activeIndex >= 0 && activeIndex < matches.length) {
        pick(matches[activeIndex]);
      } else {
        setOpen(false);
        setActiveIndex(-1);
        onSubmitUnresolved();
      }
    }
  }

  return (
    <div className="relative grow" data-testid="sale-line-item-typeahead">
      <input
        className="input w-full"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-activedescendant={
          showList && activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined
        }
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
          setActiveIndex(-1);
        }}
        onKeyDown={onKeyDown}
        onBlur={() => {
          // Delay close so option mousedown/click can land first.
          window.setTimeout(() => setOpen(false), 150);
        }}
      />
      {showList ? (
        <ul
          id={listboxId}
          role="listbox"
          aria-label="Matching inventory"
          className="absolute left-0 right-0 top-full z-30 mt-1 max-h-64 overflow-auto border border-line bg-white shadow-lg"
        >
          {matches.map((batch, index) => (
            <li
              key={String(batch.id)}
              id={`${listboxId}-option-${index}`}
              role="option"
              aria-selected={index === activeIndex}
              className={`flex cursor-pointer items-baseline gap-2 px-2 py-1.5 text-sm ${
                index === activeIndex ? 'bg-zinc-100' : ''
              }`}
              onMouseDown={(event) => {
                event.preventDefault();
                pick(batch);
              }}
              onMouseEnter={() => setActiveIndex(index)}
            >
              <span className="font-medium text-ink">{String(batch.batchCode ?? '')}</span>
              <span className="text-zinc-700">{String(batch.itemAlias ?? batch.name ?? '')}</span>
              <span className="ml-auto text-xs text-zinc-500">
                {moneyish(batch.availableQty)} {String(batch.uom ?? '')} · ${moneyish(batch.unitPrice)}
              </span>
            </li>
          ))}
          <li className="border-t border-line px-2 py-1 text-[11px] text-zinc-500" role="presentation">
            Enter with no selection keeps the text as an unresolved line (needs resolution).
          </li>
        </ul>
      ) : null}
    </div>
  );
}
