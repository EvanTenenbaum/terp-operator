// @vitest-environment jsdom
/**
 * TER-1619 / F-25: Per-pill × removal in Inventory Finder filter stack
 *
 * Tests cover:
 *  1. Active filter pills render with individual × remove buttons
 *  2. Removing one pill leaves all other active filters intact
 *  3. Global "Clear" button still removes all filters in one click
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// ─── Stubs ───────────────────────────────────────────────────────────────────

vi.mock('../api/trpc', () => ({
  trpc: {
    queries: {
      reference: { useQuery: () => ({ data: { availableBatches: [], vendors: [] }, isLoading: false }) },
    },
    filters: {
      listSavedFilters: { useQuery: () => ({ data: [] }) },
      saveFilter: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
      // AdvancedFilterBuilder needs getFacets
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

    const searchInput = screen.getByPlaceholderText(/search code/i);
    await user.type(searchInput, 'floral');

    // The search pill should be a button with the correct aria-label
    const removeBtn = screen.getByRole('button', { name: /remove search: floral filter/i });
    expect(removeBtn).toBeInTheDocument();
  });

  it('removes only the clicked filter pill, leaving others intact', async () => {
    const user = userEvent.setup();
    render(<InventoryFinderPanel onAddBatch={vi.fn()} />);

    // Activate two filters: search text and aging toggle
    // Aging checkbox is in the advanced section — open it first
    await user.click(screen.getByRole('button', { name: /more filters/i }));
    const agingCheckbox = screen.getByRole('checkbox');
    await user.click(agingCheckbox);

    const searchInput = screen.getByPlaceholderText(/search code/i);
    await user.type(searchInput, 'floral');

    // Both filter pills should be present
    expect(screen.getByRole('button', { name: /remove search: floral filter/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /remove 30\+ days filter/i })).toBeInTheDocument();

    // Remove only the search filter pill
    await user.click(screen.getByRole('button', { name: /remove search: floral filter/i }));

    // Search pill is gone; aging pill remains
    expect(screen.queryByRole('button', { name: /remove search: floral filter/i })).toBeNull();
    expect(screen.getByRole('button', { name: /remove 30\+ days filter/i })).toBeInTheDocument();
  });

  it('removing a second pill (C from [A, B, C]) leaves A and B intact', async () => {
    const user = userEvent.setup();
    render(<InventoryFinderPanel onAddBatch={vi.fn()} />);

    // Open advanced section to access aging checkbox and minQty input
    await user.click(screen.getByRole('button', { name: /more filters/i }));

    // Activate three filters
    const searchInput = screen.getByPlaceholderText(/search code/i);
    await user.type(searchInput, 'premium');

    // minQty is in the advanced controls panel (visible after More filters)
    const minQtyInput = screen.getByLabelText(/finder minimum quantity/i);
    await user.type(minQtyInput, '5');

    const agingCheckbox = screen.getByRole('checkbox');
    await user.click(agingCheckbox);

    // All three pills present
    expect(screen.getByRole('button', { name: /remove search: premium filter/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /remove >= 5 filter/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /remove 30\+ days filter/i })).toBeInTheDocument();

    // Remove the minQty pill (middle one)
    await user.click(screen.getByRole('button', { name: /remove >= 5 filter/i }));

    // minQty gone; search and aging intact
    expect(screen.queryByRole('button', { name: /remove >= 5 filter/i })).toBeNull();
    expect(screen.getByRole('button', { name: /remove search: premium filter/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /remove 30\+ days filter/i })).toBeInTheDocument();
  });

  it('global Clear button removes all active filter pills', async () => {
    const user = userEvent.setup();
    render(<InventoryFinderPanel onAddBatch={vi.fn()} />);

    const searchInput = screen.getByPlaceholderText(/search code/i);
    await user.type(searchInput, 'premium');

    expect(screen.getByRole('button', { name: /remove search: premium filter/i })).toBeInTheDocument();

    // Click the global Clear button
    await user.click(screen.getByRole('button', { name: /^clear$/i }));

    // No filter pills remain
    expect(screen.queryAllByRole('button', { name: /^remove .+ filter$/i })).toHaveLength(0);
  });
});
