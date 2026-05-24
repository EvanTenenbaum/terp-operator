// @vitest-environment jsdom
/**
 * Tests for SalesSourcePane tab strip (#62).
 *
 * Wraps the existing Inventory Finder pane with a tab strip:
 *   [ Inventory Finder | Recent Sheets ]
 *
 * Active tab determines which panel renders. Switching tabs preserves the
 * underlying customer/order context. RecentSheets is only meaningful with a
 * selected customer.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// --- mock trpc & nested components so the tab strip can be tested in isolation ---
vi.mock('../api/trpc', () => ({
  trpc: {
    auth: {
      me: { useQuery: () => ({ data: { id: 'test-user', role: 'owner', email: 'owner@test.local' }, isLoading: false }) }
    },
    queries: {
      reference: { useQuery: () => ({ data: { availableBatches: [], vendors: [] } }) },
      recentCustomerSheets: { useQuery: () => ({ data: [], isLoading: false }) },
      customerSheetSnapshotById: { useQuery: () => ({ data: null, isLoading: false }) }
    },
    filters: {
      listSavedFilters: { useQuery: () => ({ data: [] }) },
      saveFilter: { useMutation: () => ({ mutateAsync: vi.fn() }) }
    },
    useContext: () => ({ filters: { listSavedFilters: { invalidate: vi.fn() } } })
  }
}));

import { SalesSourcePane } from './SalesSourcePane';

beforeEach(() => {
  // nothing to reset
});

describe('SalesSourcePane — tab strip', () => {
  it('renders both Inventory Finder and Recent Sheets tab buttons', () => {
    render(
      <SalesSourcePane
        customerId="cust-1"
        selectedOrderId="order-1"
        onAddBatch={vi.fn().mockResolvedValue(undefined)}
      />
    );
    expect(screen.getByRole('tab', { name: /inventory finder/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /recent sheets/i })).toBeInTheDocument();
  });

  it('defaults to the Inventory Finder tab', () => {
    render(
      <SalesSourcePane
        customerId="cust-1"
        selectedOrderId="order-1"
        onAddBatch={vi.fn().mockResolvedValue(undefined)}
      />
    );
    expect(screen.getByRole('tab', { name: /inventory finder/i })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: /recent sheets/i })).toHaveAttribute('aria-selected', 'false');
  });

  it('clicking Recent Sheets activates that tab', async () => {
    const user = userEvent.setup();
    render(
      <SalesSourcePane
        customerId="cust-1"
        selectedOrderId="order-1"
        onAddBatch={vi.fn().mockResolvedValue(undefined)}
      />
    );
    await user.click(screen.getByRole('tab', { name: /recent sheets/i }));
    expect(screen.getByRole('tab', { name: /recent sheets/i })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: /inventory finder/i })).toHaveAttribute('aria-selected', 'false');
  });

  it('Recent Sheets panel renders the empty state when customer has no snapshots', async () => {
    const user = userEvent.setup();
    render(
      <SalesSourcePane
        customerId="cust-1"
        selectedOrderId="order-1"
        onAddBatch={vi.fn().mockResolvedValue(undefined)}
      />
    );
    await user.click(screen.getByRole('tab', { name: /recent sheets/i }));
    expect(screen.getByText(/no recent sheets/i)).toBeInTheDocument();
  });

  it('keeps the Inventory Finder mounted when switching to Recent Sheets (#62 reviewer fix)', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <SalesSourcePane
        customerId="cust-1"
        selectedOrderId="order-1"
        onAddBatch={vi.fn().mockResolvedValue(undefined)}
      />
    );
    // Both tabpanels must exist in the DOM; the inactive one is hidden via the
    // `hidden` attribute (so its state — search text, scroll position, AG Grid —
    // survives the tab switch).
    const finderPanel = container.querySelector('#sales-source-panel-finder');
    expect(finderPanel).not.toBeNull();
    await user.click(screen.getByRole('tab', { name: /recent sheets/i }));
    // After switching, finder panel still in the DOM but with hidden=true.
    const finderPanelAfter = container.querySelector('#sales-source-panel-finder');
    expect(finderPanelAfter).not.toBeNull();
    expect(finderPanelAfter).toHaveAttribute('hidden');
    // Recent Sheets panel is now visible (no hidden attribute).
    const recentPanel = container.querySelector('#sales-source-panel-recent');
    expect(recentPanel).not.toBeNull();
    expect(recentPanel).not.toHaveAttribute('hidden');
  });

  it('supports ArrowRight / ArrowLeft keyboard navigation between tabs (#62 reviewer fix)', async () => {
    const user = userEvent.setup();
    render(
      <SalesSourcePane
        customerId="cust-1"
        selectedOrderId="order-1"
        onAddBatch={vi.fn().mockResolvedValue(undefined)}
      />
    );
    const finderTab = screen.getByRole('tab', { name: /inventory finder/i });
    finderTab.focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: /recent sheets/i })).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('{ArrowLeft}');
    expect(screen.getByRole('tab', { name: /inventory finder/i })).toHaveAttribute('aria-selected', 'true');
  });
});
