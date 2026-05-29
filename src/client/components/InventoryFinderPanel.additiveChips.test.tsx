// @vitest-environment jsdom
/**
 * TER-1625 / F-24: Additive (combinable) inventory finder filter chips
 *
 * Tests cover:
 *  1. Activating a chip sets aria-pressed and applies its filter conditions
 *  2. Activating a second chip (AND logic) merges both chips' conditions; both
 *     chips show aria-pressed="true" simultaneously
 *  3. Deactivating one chip removes its exclusive conditions, leaving the other intact
 *  4. Global "Clear" removes all chip state and all filter pills
 *  5. Clicking an active chip a second time toggles it off
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// ─── Stubs ───────────────────────────────────────────────────────────────────

const SAVED_FILTERS = [
  {
    id: 'aging-premium',
    name: 'Aging premium',
    filterDefinition: {
      logic: 'AND' as const,
      conditions: [
        { field: 'ageDays', operator: 'gte', value: 30 },
      ],
    },
  },
  {
    id: 'low-stock',
    name: 'Low stock',
    filterDefinition: {
      logic: 'AND' as const,
      conditions: [
        { field: 'availableQty', operator: 'lte', value: 5 },
      ],
    },
  },
];

vi.mock('../api/trpc', () => ({
  trpc: {
    queries: {
      reference: { useQuery: () => ({ data: { availableBatches: [], vendors: [] }, isLoading: false }) },
    },
    filters: {
      listSavedFilters: { useQuery: () => ({ data: SAVED_FILTERS }) },
      saveFilter: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
      getFacets: {
        useQuery: () => ({ data: { categories: [], vendors: [], tags: [], locations: [], ownership: [] } }),
      },
    },
    auth: { me: { useQuery: () => ({ data: { id: 'u1', role: 'operator' } }) } },
    useContext: () => ({ filters: { listSavedFilters: { invalidate: vi.fn() } } }),
  },
}));

import { InventoryFinderPanel } from './InventoryFinderPanel';

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('InventoryFinderPanel additive filter chips (TER-1625)', () => {
  it('clicking a chip activates it (aria-pressed=true) and applies its filters', async () => {
    const user = userEvent.setup();
    render(<InventoryFinderPanel onAddBatch={vi.fn()} />);

    const agingChip = screen.getByRole('button', { name: /aging premium/i });
    expect(agingChip).toHaveAttribute('aria-pressed', 'false');

    await user.click(agingChip);

    expect(agingChip).toHaveAttribute('aria-pressed', 'true');
    // ageDays condition should produce a filter pill
    expect(screen.getByRole('button', { name: /remove filter: ageDays/i })).toBeInTheDocument();
  });

  it('activating a second chip merges both filter sets; both chips show aria-pressed=true', async () => {
    const user = userEvent.setup();
    render(<InventoryFinderPanel onAddBatch={vi.fn()} />);

    const agingChip = screen.getByRole('button', { name: /aging premium/i });
    const lowStockChip = screen.getByRole('button', { name: /low stock/i });

    await user.click(agingChip);
    await user.click(lowStockChip);

    expect(agingChip).toHaveAttribute('aria-pressed', 'true');
    expect(lowStockChip).toHaveAttribute('aria-pressed', 'true');

    // Both condition pills should be present
    expect(screen.getByRole('button', { name: /remove filter: ageDays/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /remove filter: availableQty/i })).toBeInTheDocument();
  });

  it('deactivating one chip removes only its conditions, leaving the other chip intact', async () => {
    const user = userEvent.setup();
    render(<InventoryFinderPanel onAddBatch={vi.fn()} />);

    const agingChip = screen.getByRole('button', { name: /aging premium/i });
    const lowStockChip = screen.getByRole('button', { name: /low stock/i });

    await user.click(agingChip);
    await user.click(lowStockChip);

    // Both active — deactivate aging
    await user.click(agingChip);

    expect(agingChip).toHaveAttribute('aria-pressed', 'false');
    expect(lowStockChip).toHaveAttribute('aria-pressed', 'true');
    // ageDays pill gone; availableQty pill remains
    expect(screen.queryByRole('button', { name: /remove filter: ageDays/i })).toBeNull();
    expect(screen.getByRole('button', { name: /remove filter: availableQty/i })).toBeInTheDocument();
  });

  it('global Clear removes all chip state and all filter pills', async () => {
    const user = userEvent.setup();
    render(<InventoryFinderPanel onAddBatch={vi.fn()} />);

    const agingChip = screen.getByRole('button', { name: /aging premium/i });
    await user.click(agingChip);
    expect(screen.getByRole('button', { name: /remove filter: ageDays/i })).toBeInTheDocument();

    // Activate clear
    const clearBtn = screen.getByRole('button', { name: /clear all/i });
    await user.click(clearBtn);

    expect(agingChip).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByRole('button', { name: /remove filter: ageDays/i })).toBeNull();
  });

  it('clicking an active chip a second time toggles it off (clears its filters)', async () => {
    const user = userEvent.setup();
    render(<InventoryFinderPanel onAddBatch={vi.fn()} />);

    const agingChip = screen.getByRole('button', { name: /aging premium/i });
    await user.click(agingChip);
    expect(agingChip).toHaveAttribute('aria-pressed', 'true');

    await user.click(agingChip);
    expect(agingChip).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByRole('button', { name: /remove filter: ageDays/i })).toBeNull();
  });
});
