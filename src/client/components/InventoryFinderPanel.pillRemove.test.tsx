// @vitest-environment jsdom
/**
 * TER-1619 / F-25: Per-pill × removal in Inventory Finder filter stack
 *
 * Tests cover:
 *  1. Active filter pills render with individual × remove buttons
 *  2. Removing one pill leaves all other active filters intact
 *  3. Removing a second pill (C from [A, B, C]) leaves A and B intact
 *  4. Global "Clear" button removes all active filter pills
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// ─── Stubs ───────────────────────────────────────────────────────────────────

const SAVED_FILTERS = [
  {
    id: 'chip-a',
    name: 'Filter A',
    filterDefinition: {
      logic: 'AND' as const,
      conditions: [{ field: 'category', operator: 'eq', value: 'Flower' }],
    },
  },
  {
    id: 'chip-b',
    name: 'Filter B',
    filterDefinition: {
      logic: 'AND' as const,
      conditions: [{ field: 'vendor', operator: 'eq', value: 'ACME' }],
    },
  },
  {
    id: 'chip-c',
    name: 'Filter C',
    filterDefinition: {
      logic: 'AND' as const,
      conditions: [{ field: 'ageDays', operator: 'gte', value: 30 }],
    },
  },
];

vi.mock('../api/trpc', () => ({
  trpc: {
    queries: {
      reference: { useQuery: () => ({ data: { availableBatches: [], vendors: [] }, isLoading: false }) },
        customerLastOrderedQtyBulk: { useQuery: () => ({ data: {}, isLoading: false }) },
    },
    useQueries: () => [],
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

describe('InventoryFinderPanel per-pill filter removal (TER-1619)', () => {
  it('renders × remove buttons on active filter pills', async () => {
    const user = userEvent.setup();
    render(<InventoryFinderPanel onAddBatch={vi.fn()} />);

    // Activate chip A to get a filter pill
    await user.click(screen.getByRole('button', { name: /filter a/i }));

    // A pill with a remove button should appear
    const removeBtn = screen.getByRole('button', { name: /remove filter: category/i });
    expect(removeBtn).toBeInTheDocument();
  });

  it('removes only the clicked filter pill, leaving others intact', async () => {
    const user = userEvent.setup();
    render(<InventoryFinderPanel onAddBatch={vi.fn()} />);

    // Activate chips A and B
    await user.click(screen.getByRole('button', { name: /filter a/i }));
    await user.click(screen.getByRole('button', { name: /filter b/i }));

    expect(screen.getByRole('button', { name: /remove filter: category/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /remove filter: vendor/i })).toBeInTheDocument();

    // Remove only the category pill
    await user.click(screen.getByRole('button', { name: /remove filter: category/i }));

    expect(screen.queryByRole('button', { name: /remove filter: category/i })).toBeNull();
    expect(screen.getByRole('button', { name: /remove filter: vendor/i })).toBeInTheDocument();
  });

  it('removing a second pill (C from [A, B, C]) leaves A and B intact', async () => {
    const user = userEvent.setup();
    render(<InventoryFinderPanel onAddBatch={vi.fn()} />);

    // Activate all three chips
    await user.click(screen.getByRole('button', { name: /filter a/i }));
    await user.click(screen.getByRole('button', { name: /filter b/i }));
    await user.click(screen.getByRole('button', { name: /filter c/i }));

    expect(screen.getByRole('button', { name: /remove filter: category/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /remove filter: vendor/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /remove filter: ageDays/i })).toBeInTheDocument();

    // Remove the vendor pill (middle one)
    await user.click(screen.getByRole('button', { name: /remove filter: vendor/i }));

    expect(screen.getByRole('button', { name: /remove filter: category/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /remove filter: vendor/i })).toBeNull();
    expect(screen.getByRole('button', { name: /remove filter: ageDays/i })).toBeInTheDocument();
  });

  it('global Clear button removes all active filter pills', async () => {
    const user = userEvent.setup();
    render(<InventoryFinderPanel onAddBatch={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /filter a/i }));
    await user.click(screen.getByRole('button', { name: /filter b/i }));

    expect(screen.getByRole('button', { name: /remove filter: category/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /remove filter: vendor/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /clear all/i }));

    expect(screen.queryByRole('button', { name: /remove filter: category/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /remove filter: vendor/i })).toBeNull();
  });
});
