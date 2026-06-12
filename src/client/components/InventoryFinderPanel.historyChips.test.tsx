// @vitest-environment jsdom
/**
 * UX-F07 — buying-pattern pre-scoping chips (MR-029).
 *
 * 1. buildPurchaseHistoryChips: trailing-30-day grouping by category
 *    (itemName fallback), top-3 by count, inline reason label.
 * 2. InventoryFinderPanel renders the chips and clicking one seeds the
 *    finder search box (toggle off restores the empty search).
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  MAX_HISTORY_CHIPS,
  buildPurchaseHistoryChips,
} from './InventoryFinderPanel.historyChips';

vi.mock('../api/trpc', () => ({
  trpc: {
    queries: {
      reference: { useQuery: () => ({ data: { availableBatches: [], vendors: [] }, isLoading: false }) },
    },
    useQueries: () => [],
    filters: {
      listSavedFilters: { useQuery: () => ({ data: [] }) },
      saveFilter: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
    },
    auth: { me: { useQuery: () => ({ data: { id: 'u1', role: 'operator' } }) } },
    useContext: () => ({ filters: { listSavedFilters: { invalidate: vi.fn() } } }),
  },
}));

import { InventoryFinderPanel } from './InventoryFinderPanel';

const NOW = new Date('2026-06-12T12:00:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000).toISOString();

describe('buildPurchaseHistoryChips (UX-F07)', () => {
  it('groups trailing-30-day lines by category with the reason inline', () => {
    const chips = buildPurchaseHistoryChips(
      [
        { category: 'Flower', createdAt: daysAgo(2) },
        { category: 'Flower', createdAt: daysAgo(5) },
        { category: 'Flower', createdAt: daysAgo(12) },
        { category: 'Flower', createdAt: daysAgo(29) },
        { category: 'Vape', createdAt: daysAgo(3) },
      ],
      NOW
    );
    expect(chips[0]).toEqual({ label: 'Bought Flower ×4 this month', search: 'Flower', count: 4 });
    expect(chips[1]).toEqual({ label: 'Bought Vape ×1 this month', search: 'Vape', count: 1 });
  });

  it('excludes lines older than 30 days', () => {
    const chips = buildPurchaseHistoryChips(
      [
        { category: 'Flower', createdAt: daysAgo(31) },
        { category: 'Flower', createdAt: daysAgo(90) },
      ],
      NOW
    );
    expect(chips).toEqual([]);
  });

  it('falls back to itemName when category is missing', () => {
    const chips = buildPurchaseHistoryChips(
      [{ category: null, itemName: 'Gelato', createdAt: daysAgo(1) }],
      NOW
    );
    expect(chips).toEqual([{ label: 'Bought Gelato ×1 this month', search: 'Gelato', count: 1 }]);
  });

  it(`caps at ${MAX_HISTORY_CHIPS} chips ordered by count descending`, () => {
    const rows = [
      ...Array.from({ length: 4 }, () => ({ category: 'Flower', createdAt: daysAgo(1) })),
      ...Array.from({ length: 3 }, () => ({ category: 'Vape', createdAt: daysAgo(1) })),
      ...Array.from({ length: 2 }, () => ({ category: 'Extract', createdAt: daysAgo(1) })),
      { category: 'Pre-roll', createdAt: daysAgo(1) },
    ];
    const chips = buildPurchaseHistoryChips(rows, NOW);
    expect(chips).toHaveLength(MAX_HISTORY_CHIPS);
    expect(chips.map((c) => c.search)).toEqual(['Flower', 'Vape', 'Extract']);
  });

  it('skips rows without a usable date or key', () => {
    const chips = buildPurchaseHistoryChips(
      [
        { category: 'Flower', createdAt: null },
        { category: '', itemName: '', createdAt: daysAgo(1) },
        { category: 'Flower', createdAt: 'not-a-date' },
      ],
      NOW
    );
    expect(chips).toEqual([]);
  });
});

describe('InventoryFinderPanel history chips rendering (UX-F07)', () => {
  const CHIPS = [
    { label: 'Bought Flower ×4 this month', search: 'Flower' },
    { label: 'Bought Vape ×2 this month', search: 'Vape' },
  ];

  it('renders the suggested chips with their inline reason labels', () => {
    render(<InventoryFinderPanel onAddBatch={vi.fn()} historyChips={CHIPS} />);
    expect(screen.getByTestId('finder-history-chips')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Bought Flower ×4 this month' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Bought Vape ×2 this month' })).toBeTruthy();
  });

  it('clicking a chip seeds the finder search box (pre-filters results)', async () => {
    const user = userEvent.setup();
    render(<InventoryFinderPanel onAddBatch={vi.fn()} historyChips={CHIPS} />);
    const chip = screen.getByRole('button', { name: 'Bought Flower ×4 this month' });
    expect(chip).toHaveAttribute('aria-pressed', 'false');
    await user.click(chip);
    expect(chip).toHaveAttribute('aria-pressed', 'true');
    const search = screen.getByPlaceholderText('Search code, notes, lot, vendor, tag…') as HTMLInputElement;
    expect(search.value).toBe('Flower');
  });

  it('clicking an active chip toggles it off and clears the seeded search', async () => {
    const user = userEvent.setup();
    render(<InventoryFinderPanel onAddBatch={vi.fn()} historyChips={CHIPS} />);
    const chip = screen.getByRole('button', { name: 'Bought Vape ×2 this month' });
    await user.click(chip);
    await user.click(chip);
    expect(chip).toHaveAttribute('aria-pressed', 'false');
    const search = screen.getByPlaceholderText('Search code, notes, lot, vendor, tag…') as HTMLInputElement;
    expect(search.value).toBe('');
  });

  it('renders no chip strip when no history chips are provided (finder unchanged)', () => {
    render(<InventoryFinderPanel onAddBatch={vi.fn()} />);
    expect(screen.queryByTestId('finder-history-chips')).toBeNull();
  });
});
