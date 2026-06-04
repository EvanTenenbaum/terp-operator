// @vitest-environment jsdom
/**
 * TER-1626 / F-26: Compare moves out of finder rows into SelectionSummary
 *
 * Tests cover:
 *  1. No "Compare" column header — header is a screen-reader-only "Select" label
 *  2. Row checkboxes are labeled "Select <batchCode>" not "Add to compare list"
 *  3. Selection summary bar does NOT appear when no rows are selected
 *  4. Selection summary bar APPEARS with "Copy N rows as offer" when rows are selected
 *  5. Selecting multiple rows updates the count in the button label
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// ─── Stubs ───────────────────────────────────────────────────────────────────

const BATCHES = [
  {
    id: 'b1',
    batchCode: 'BATCH-001',
    name: 'Test Flower',
    availableQty: 10,
    unitPrice: 25,
    uom: 'g',
    mediaStatus: 'done',
    category: 'Flower',
  },
  {
    id: 'b2',
    batchCode: 'BATCH-002',
    name: 'Test Concentrate',
    availableQty: 5,
    unitPrice: 50,
    uom: 'g',
    mediaStatus: 'done',
    category: 'Concentrate',
  },
];

vi.mock('../api/trpc', () => ({
  trpc: {
    queries: {
      reference: {
        useQuery: () => ({
          data: { availableBatches: BATCHES, vendors: [] },
          isLoading: false,
        }),
      },
    },
    useQueries: () => [],
    filters: {
      listSavedFilters: { useQuery: () => ({ data: [] }) },
      saveFilter: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
      getFacets: {
        useQuery: () => ({
          data: { categories: [], vendors: [], tags: [], locations: [], ownership: [] },
        }),
      },
    },
    auth: { me: { useQuery: () => ({ data: { id: 'u1', role: 'operator' } }) } },
    useContext: () => ({ filters: { listSavedFilters: { invalidate: vi.fn() } } }),
  },
}));

import { InventoryFinderPanel } from './InventoryFinderPanel';

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('InventoryFinderPanel Compare → SelectionSummary (TER-1626)', () => {
  it('does not render a "Compare" column header', () => {
    render(<InventoryFinderPanel onAddBatch={vi.fn()} />);
    // The word "Compare" should not appear as a visible column header
    const headers = screen.getAllByRole('columnheader');
    const headerTexts = headers.map((h) => h.textContent ?? '');
    expect(headerTexts).not.toContain('Compare');
  });

  it('row checkboxes are labeled "Select <batchCode>" not "add to compare list"', () => {
    render(<InventoryFinderPanel onAddBatch={vi.fn()} />);
    // Should find "Select BATCH-001" and "Select BATCH-002"
    expect(screen.getByRole('checkbox', { name: /select batch-001/i })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /select batch-002/i })).toBeInTheDocument();
    // Should NOT find the old "compare list" aria-label
    expect(screen.queryByRole('checkbox', { name: /compare list/i })).toBeNull();
  });

  it('selection summary bar is absent when no rows are checked', () => {
    render(<InventoryFinderPanel onAddBatch={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /rows as offer/i })).toBeNull();
  });

  it('selection summary bar appears with correct count when one row is selected', async () => {
    const user = userEvent.setup();
    render(<InventoryFinderPanel onAddBatch={vi.fn()} />);

    await user.click(screen.getByRole('checkbox', { name: /select batch-001/i }));

    // Summary bar shows copy button with count
    expect(screen.getByRole('button', { name: /copy 1 rows as offer/i })).toBeInTheDocument();
    // "1 selected" pill should appear
    expect(screen.getByText('1 selected')).toBeInTheDocument();
  });

  it('copy button updates count when two rows are selected', async () => {
    const user = userEvent.setup();
    render(<InventoryFinderPanel onAddBatch={vi.fn()} />);

    await user.click(screen.getByRole('checkbox', { name: /select batch-001/i }));
    await user.click(screen.getByRole('checkbox', { name: /select batch-002/i }));

    expect(screen.getByRole('button', { name: /copy 2 rows as offer/i })).toBeInTheDocument();
    expect(screen.getByText('2 selected')).toBeInTheDocument();
  });

  it('deselecting a row updates the count', async () => {
    const user = userEvent.setup();
    render(<InventoryFinderPanel onAddBatch={vi.fn()} />);

    await user.click(screen.getByRole('checkbox', { name: /select batch-001/i }));
    await user.click(screen.getByRole('checkbox', { name: /select batch-002/i }));
    // Deselect one
    await user.click(screen.getByRole('checkbox', { name: /select batch-001/i }));

    expect(screen.getByRole('button', { name: /copy 1 rows as offer/i })).toBeInTheDocument();
    expect(screen.getByText('1 selected')).toBeInTheDocument();
  });

  it('selection bar disappears after all rows are deselected', async () => {
    const user = userEvent.setup();
    render(<InventoryFinderPanel onAddBatch={vi.fn()} />);

    await user.click(screen.getByRole('checkbox', { name: /select batch-001/i }));
    await user.click(screen.getByRole('checkbox', { name: /select batch-001/i })); // deselect

    expect(screen.queryByRole('button', { name: /rows as offer/i })).toBeNull();
  });
});
