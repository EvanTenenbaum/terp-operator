// @vitest-environment jsdom
/**
 * TER-1625 / F-24: Additive (combinable) inventory finder filter chips
 *
 * Tests cover:
 *  1. Activating a chip sets aria-pressed and applies its filters
 *  2. Activating a second chip (AND logic) merges both chips' filters; both
 *     show aria-pressed="true" simultaneously
 *  3. Deactivating one chip removes its exclusive filters while leaving the
 *     other chip's filters intact
 *  4. Global "Clear" removes all chip state and all filter pills
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
    // aging-premium contributes: agingOnly=true (30+ days pill), minQty=1, maxPrice=100
    expect(screen.getByRole('button', { name: /remove 30\+ days filter/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /remove >= 1 filter/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /remove <= \$100 filter/i })).toBeInTheDocument();
  });

  it('activating a second chip merges both filter sets; both chips show aria-pressed=true', async () => {
    const user = userEvent.setup();
    render(<InventoryFinderPanel onAddBatch={vi.fn()} />);

    const agingChip = screen.getByRole('button', { name: /aging premium/i });
    const lowStockChip = screen.getByRole('button', { name: /low stock/i });

    // Activate "Aging premium": agingOnly=true, minQty='1', maxPrice='100'
    await user.click(agingChip);
    // Activate "Low stock": search='reorder low', minQty='1' (minQty same value, search new)
    await user.click(lowStockChip);

    // Both chips should be pressed
    expect(agingChip).toHaveAttribute('aria-pressed', 'true');
    expect(lowStockChip).toHaveAttribute('aria-pressed', 'true');

    // Combined filter pills: 30+ days (aging), >= 1 (minQty), <= $100 (maxPrice), search: reorder low
    expect(screen.getByRole('button', { name: /remove 30\+ days filter/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /remove >= 1 filter/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /remove <= \$100 filter/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /remove search: reorder low filter/i })).toBeInTheDocument();
  });

  it('deactivating one chip removes only its exclusive filters, leaving the other chip intact', async () => {
    const user = userEvent.setup();
    render(<InventoryFinderPanel onAddBatch={vi.fn()} />);

    const agingChip = screen.getByRole('button', { name: /aging premium/i });
    const lowStockChip = screen.getByRole('button', { name: /low stock/i });

    // Activate both chips
    await user.click(agingChip);
    await user.click(lowStockChip);

    // Deactivate "Aging premium"
    await user.click(agingChip);

    // "Aging premium" chip is no longer pressed
    expect(agingChip).toHaveAttribute('aria-pressed', 'false');
    // "Low stock" chip remains pressed
    expect(lowStockChip).toHaveAttribute('aria-pressed', 'true');

    // agingOnly (30+ days) and maxPrice ($100) contributed only by aging-premium → gone
    expect(screen.queryByRole('button', { name: /remove 30\+ days filter/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /remove <= \$100 filter/i })).toBeNull();

    // minQty ('>=1') and search ('reorder low') contributed by low-stock → still present
    expect(screen.getByRole('button', { name: /remove >= 1 filter/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /remove search: reorder low filter/i })).toBeInTheDocument();
  });

  it('global Clear removes all chip state and all filter pills', async () => {
    const user = userEvent.setup();
    render(<InventoryFinderPanel onAddBatch={vi.fn()} />);

    const agingChip = screen.getByRole('button', { name: /aging premium/i });
    const lowStockChip = screen.getByRole('button', { name: /low stock/i });

    // Activate both chips
    await user.click(agingChip);
    await user.click(lowStockChip);

    // Both chips are active; some pills are present
    expect(agingChip).toHaveAttribute('aria-pressed', 'true');
    expect(lowStockChip).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getAllByRole('button', { name: /^remove .+ filter$/i }).length).toBeGreaterThan(0);

    // Click global Clear
    await user.click(screen.getByRole('button', { name: /^clear$/i }));

    // All chips are no longer pressed
    expect(agingChip).toHaveAttribute('aria-pressed', 'false');
    expect(lowStockChip).toHaveAttribute('aria-pressed', 'false');

    // No active filter pills remain
    expect(screen.queryAllByRole('button', { name: /^remove .+ filter$/i })).toHaveLength(0);
  });

  it('clicking an active chip a second time toggles it off (clears its filters)', async () => {
    const user = userEvent.setup();
    render(<InventoryFinderPanel onAddBatch={vi.fn()} />);

    const officeChip = screen.getByRole('button', { name: /office owned/i });
    expect(officeChip).toHaveAttribute('aria-pressed', 'false');

    await user.click(officeChip);
    expect(officeChip).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /remove ofc filter/i })).toBeInTheDocument();

    // Toggle off
    await user.click(officeChip);
    expect(officeChip).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByRole('button', { name: /remove ofc filter/i })).toBeNull();
  });
});
