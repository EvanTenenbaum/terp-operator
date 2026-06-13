/**
 * UX-F07 — buying-pattern pre-scoping chips for the Inventory Finder (MR-029).
 *
 * Builds 2–3 suggested filter chips from the customer's purchase history
 * (the EXISTING `queries.customerPurchaseHistory` data — the same query
 * CustomerPurchaseHistoryPanel renders; no new procedures). Each chip carries
 * its reason inline ("Bought Flower ×4 this month"); clicking one seeds the
 * finder search box with the chip's search term, pre-filtering results.
 */

export interface PurchaseHistoryChipRow {
  category?: string | null;
  itemName?: string | null;
  createdAt?: string | null;
}

export interface PurchaseHistoryChip {
  /** Inline reason — also the visible chip label. */
  label: string;
  /** Term placed in the finder search box when the chip is clicked. */
  search: string;
  /** Number of history lines backing the chip. */
  count: number;
}

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
export const MAX_HISTORY_CHIPS = 3;

/**
 * Group recent purchase-history lines (trailing 30 days of `now`) by category
 * (falling back to canonical item name) and return the top `MAX_HISTORY_CHIPS`
 * groups by line count, descending. Ties break alphabetically for stability.
 */
export function buildPurchaseHistoryChips(
  rows: ReadonlyArray<PurchaseHistoryChipRow>,
  now: Date = new Date()
): PurchaseHistoryChip[] {
  const cutoff = now.getTime() - THIRTY_DAYS_MS;
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (!row.createdAt) continue;
    const ts = new Date(row.createdAt).getTime();
    if (!Number.isFinite(ts) || ts < cutoff || ts > now.getTime()) continue;
    const key = String(row.category ?? '').trim() || String(row.itemName ?? '').trim();
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, MAX_HISTORY_CHIPS)
    .map(([key, count]) => ({
      label: `Bought ${key} ×${count} this month`,
      search: key,
      count
    }));
}
