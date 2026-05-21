// @vitest-environment jsdom
/**
 * Tests for RecentSheetsPanel (#62).
 *
 * Lists customer-scoped sheet snapshots (newest first). Selecting one opens a
 * detail view of the snapshot rows where the operator can Add per-row or
 * Add all to the current draft via the existing addSalesOrderLine pathway.
 *
 * Out-of-stock / unavailable snapshot items are disabled — no silent
 * substitution. Customer-facing (catalog) snapshots never carry cost or margin
 * fields; the panel must not render any such column even if the data is
 * tampered with.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const recentCustomerSheetsUseQuery = vi.fn();
const customerSheetSnapshotByIdUseQuery = vi.fn();
const referenceUseQuery = vi.fn();

vi.mock('../api/trpc', () => ({
  trpc: {
    queries: {
      recentCustomerSheets: { useQuery: (...args: unknown[]) => recentCustomerSheetsUseQuery(...args) },
      customerSheetSnapshotById: { useQuery: (...args: unknown[]) => customerSheetSnapshotByIdUseQuery(...args) },
      reference: { useQuery: (...args: unknown[]) => referenceUseQuery(...args) }
    }
  }
}));

import { RecentSheetsPanel } from './RecentSheetsPanel';

const snapshots = [
  {
    id: 'snap-1',
    customerId: 'cust-1',
    mode: 'catalog',
    actorId: 'u1',
    actorName: 'Sam Sales',
    itemCount: 3,
    createdAt: '2026-04-12T14:30:00Z'
  },
  {
    id: 'snap-2',
    customerId: 'cust-1',
    mode: 'internal',
    actorId: 'u1',
    actorName: 'Sam Sales',
    itemCount: 1,
    createdAt: '2026-04-10T10:00:00Z'
  }
];

const snapshotDetail = {
  id: 'snap-1',
  customerId: 'cust-1',
  mode: 'catalog' as const,
  actorName: 'Sam Sales',
  itemCount: 3,
  createdAt: '2026-04-12T14:30:00Z',
  rows: [
    // qty intentionally included so the reviewer fix (use snapshot qty, not
    // hardcoded 1) can be verified. Snapshot has 5; live availableQty is 80,
    // so the call should send min(5, 80) = 5.
    { batchId: 'batch-a', batchCode: 'BC-A', name: 'Skywalker OG', category: 'Flower', availableQty: 100, unitPrice: 1200, qty: 5 },
    { batchId: 'batch-b', batchCode: 'BC-B', name: 'Wedding Cake', category: 'Flower', availableQty: 0, unitPrice: 900 },
    { batchId: 'batch-c', batchCode: 'BC-C', name: 'Ghost Lot', category: 'Flower', availableQty: 0, unitPrice: 800 }
  ] as Array<Record<string, unknown>>
};

beforeEach(() => {
  recentCustomerSheetsUseQuery.mockReset();
  customerSheetSnapshotByIdUseQuery.mockReset();
  referenceUseQuery.mockReset();
  referenceUseQuery.mockReturnValue({
    data: {
      // Live inventory matches batch-a (100 available). batch-b and batch-c are not available.
      availableBatches: [
        { id: 'batch-a', batchCode: 'BC-A', availableQty: 80, unitPrice: 1200, name: 'Skywalker OG' }
      ]
    }
  });
});

describe('RecentSheetsPanel — list view', () => {
  it('shows empty state when there are no snapshots', () => {
    recentCustomerSheetsUseQuery.mockReturnValue({ data: [], isLoading: false });
    customerSheetSnapshotByIdUseQuery.mockReturnValue({ data: null, isLoading: false });
    render(
      <RecentSheetsPanel
        customerId="cust-1"
        selectedOrderId="order-1"
        onAddBatch={vi.fn().mockResolvedValue(undefined)}
      />
    );
    expect(screen.getByText(/no recent sheets/i)).toBeInTheDocument();
  });

  it('lists recent snapshots newest first with mode, actor, and item count', () => {
    recentCustomerSheetsUseQuery.mockReturnValue({ data: snapshots, isLoading: false });
    customerSheetSnapshotByIdUseQuery.mockReturnValue({ data: null, isLoading: false });
    render(
      <RecentSheetsPanel
        customerId="cust-1"
        selectedOrderId="order-1"
        onAddBatch={vi.fn().mockResolvedValue(undefined)}
      />
    );
    expect(screen.getAllByText(/Sam Sales/i).length).toBe(2);
    expect(screen.getByText(/catalog/i)).toBeInTheDocument();
    expect(screen.getByText(/· internal ·/i)).toBeInTheDocument();
    expect(screen.getByText(/3 items/i)).toBeInTheDocument();
    expect(screen.getByText(/1 item/i)).toBeInTheDocument();
  });

  it('prompts to select a customer when none is selected', () => {
    recentCustomerSheetsUseQuery.mockReturnValue({ data: [], isLoading: false });
    customerSheetSnapshotByIdUseQuery.mockReturnValue({ data: null, isLoading: false });
    render(
      <RecentSheetsPanel
        customerId=""
        selectedOrderId=""
        onAddBatch={vi.fn().mockResolvedValue(undefined)}
      />
    );
    expect(screen.getByText(/choose a customer/i)).toBeInTheDocument();
  });
});

describe('RecentSheetsPanel — open snapshot detail', () => {
  it('opening a snapshot shows its rows', async () => {
    recentCustomerSheetsUseQuery.mockReturnValue({ data: snapshots, isLoading: false });
    customerSheetSnapshotByIdUseQuery.mockReturnValue({ data: snapshotDetail, isLoading: false });
    const user = userEvent.setup();
    render(
      <RecentSheetsPanel
        customerId="cust-1"
        selectedOrderId="order-1"
        onAddBatch={vi.fn().mockResolvedValue(undefined)}
      />
    );
    // Click on the first snapshot list item
    await user.click(screen.getAllByRole('button', { name: /open/i })[0]);
    expect(screen.getByText('Skywalker OG')).toBeInTheDocument();
    expect(screen.getByText('Wedding Cake')).toBeInTheDocument();
  });

  it('catalog snapshot detail does NOT render cost or margin columns (regression #63/#62)', async () => {
    recentCustomerSheetsUseQuery.mockReturnValue({ data: snapshots, isLoading: false });
    customerSheetSnapshotByIdUseQuery.mockReturnValue({ data: snapshotDetail, isLoading: false });
    const user = userEvent.setup();
    const { container } = render(
      <RecentSheetsPanel
        customerId="cust-1"
        selectedOrderId="order-1"
        onAddBatch={vi.fn().mockResolvedValue(undefined)}
      />
    );
    await user.click(screen.getAllByRole('button', { name: /open/i })[0]);
    const text = container.textContent ?? '';
    expect(text.toLowerCase()).not.toMatch(/unitcost/);
    expect(text.toLowerCase()).not.toMatch(/estimatedmargin/);
    expect(text.toLowerCase()).not.toMatch(/internalmargin/);
    // Visible column headers should not include cost/margin
    const headers = screen.queryAllByRole('columnheader').map((el) => (el.textContent ?? '').toLowerCase());
    expect(headers.every((h) => !h.includes('cost'))).toBe(true);
    expect(headers.every((h) => !h.includes('margin'))).toBe(true);
  });

  it('disables Add for snapshot rows whose batch is unavailable in current inventory', async () => {
    recentCustomerSheetsUseQuery.mockReturnValue({ data: snapshots, isLoading: false });
    customerSheetSnapshotByIdUseQuery.mockReturnValue({ data: snapshotDetail, isLoading: false });
    const user = userEvent.setup();
    render(
      <RecentSheetsPanel
        customerId="cust-1"
        selectedOrderId="order-1"
        onAddBatch={vi.fn().mockResolvedValue(undefined)}
      />
    );
    await user.click(screen.getAllByRole('button', { name: /open/i })[0]);

    // The available-batch Add (batch-a) should be enabled
    const addButtons = screen.getAllByRole('button', { name: /^add$/i });
    // At least one enabled Add and at least one disabled Add
    const enabledAdds = addButtons.filter((btn) => !btn.hasAttribute('disabled'));
    const disabledAdds = addButtons.filter((btn) => btn.hasAttribute('disabled'));
    expect(enabledAdds.length).toBeGreaterThan(0);
    expect(disabledAdds.length).toBeGreaterThan(0);
  });

  it('Add calls onAddBatch with the snapshot row mapped to a batch and uses the snapshot qty capped by live availability (#62 reviewer fix)', async () => {
    recentCustomerSheetsUseQuery.mockReturnValue({ data: snapshots, isLoading: false });
    customerSheetSnapshotByIdUseQuery.mockReturnValue({ data: snapshotDetail, isLoading: false });
    const onAddBatch = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(
      <RecentSheetsPanel
        customerId="cust-1"
        selectedOrderId="order-1"
        onAddBatch={onAddBatch}
      />
    );
    await user.click(screen.getAllByRole('button', { name: /open/i })[0]);
    const enabledAdd = screen.getAllByRole('button', { name: /^add$/i }).find((btn) => !btn.hasAttribute('disabled'));
    expect(enabledAdd).toBeTruthy();
    await user.click(enabledAdd!);
    expect(onAddBatch).toHaveBeenCalled();
    const callArgs = onAddBatch.mock.calls[0];
    // first arg should be a batch with id "batch-a", second arg is qty number
    expect(callArgs[0]).toMatchObject({ id: 'batch-a' });
    // Snapshot qty=5, live availableQty=80 → expect snapshot qty (5).
    expect(callArgs[1]).toBe(5);
  });

  it('Add carries the snapshot unitPrice forward on the batch passed to onAddBatch (#62 reviewer fix)', async () => {
    recentCustomerSheetsUseQuery.mockReturnValue({ data: snapshots, isLoading: false });
    customerSheetSnapshotByIdUseQuery.mockReturnValue({ data: snapshotDetail, isLoading: false });
    const onAddBatch = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(
      <RecentSheetsPanel
        customerId="cust-1"
        selectedOrderId="order-1"
        onAddBatch={onAddBatch}
      />
    );
    await user.click(screen.getAllByRole('button', { name: /open/i })[0]);
    const enabledAdd = screen.getAllByRole('button', { name: /^add$/i }).find((btn) => !btn.hasAttribute('disabled'));
    await user.click(enabledAdd!);
    const callArgs = onAddBatch.mock.calls[0];
    // Snapshot unitPrice for batch-a is 1200; the live row also has 1200.
    // The contract: snapshot price wins when present so the operator quote sticks.
    expect(Number(callArgs[0].unitPrice)).toBe(1200);
  });

  it('Add all skips unavailable rows and only adds in-stock items with the snapshot qty (#62 reviewer fix)', async () => {
    recentCustomerSheetsUseQuery.mockReturnValue({ data: snapshots, isLoading: false });
    customerSheetSnapshotByIdUseQuery.mockReturnValue({ data: snapshotDetail, isLoading: false });
    const onAddBatch = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(
      <RecentSheetsPanel
        customerId="cust-1"
        selectedOrderId="order-1"
        onAddBatch={onAddBatch}
      />
    );
    await user.click(screen.getAllByRole('button', { name: /open/i })[0]);
    await user.click(screen.getByRole('button', { name: /add all/i }));
    // Only 1 of 3 rows is in stock (batch-a), so onAddBatch is called exactly once
    expect(onAddBatch).toHaveBeenCalledTimes(1);
    expect(onAddBatch.mock.calls[0][0]).toMatchObject({ id: 'batch-a' });
    expect(onAddBatch.mock.calls[0][1]).toBe(5);
  });

  it('Add all continues after an onAddBatch rejection and shows a partial failure status', async () => {
    recentCustomerSheetsUseQuery.mockReturnValue({ data: snapshots, isLoading: false });
    customerSheetSnapshotByIdUseQuery.mockReturnValue({ data: snapshotDetail, isLoading: false });
    // Make batch-b available in live inventory so there are 2 eligible rows
    referenceUseQuery.mockReturnValue({
      data: {
        availableBatches: [
          { id: 'batch-a', batchCode: 'BC-A', availableQty: 80, unitPrice: 1200, name: 'Skywalker OG' },
          { id: 'batch-b', batchCode: 'BC-B', availableQty: 10, unitPrice: 900, name: 'Wedding Cake' }
        ]
      }
    });
    const onAddBatch = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('Batch add failed'));
    const user = userEvent.setup();
    render(
      <RecentSheetsPanel
        customerId="cust-1"
        selectedOrderId="order-1"
        onAddBatch={onAddBatch}
      />
    );
    await user.click(screen.getAllByRole('button', { name: /open/i })[0]);
    await user.click(screen.getByRole('button', { name: /add all/i }));
    // batch-a succeeds, batch-b fails, batch-c is skipped (out of stock)
    expect(onAddBatch).toHaveBeenCalledTimes(2);
    const status = screen.getByTestId('add-all-status');
    expect(status.textContent).toMatch(/added 1 of 2; 1 failed/i);
  });

  it('Add and Add all are disabled when no selectedOrderId is set', async () => {
    recentCustomerSheetsUseQuery.mockReturnValue({ data: snapshots, isLoading: false });
    customerSheetSnapshotByIdUseQuery.mockReturnValue({ data: snapshotDetail, isLoading: false });
    const user = userEvent.setup();
    render(
      <RecentSheetsPanel
        customerId="cust-1"
        selectedOrderId=""
        onAddBatch={vi.fn()}
      />
    );
    await user.click(screen.getAllByRole('button', { name: /open/i })[0]);
    expect(screen.getByRole('button', { name: /add all/i })).toBeDisabled();
    screen.getAllByRole('button', { name: /^add$/i }).forEach((btn) => {
      expect(btn).toBeDisabled();
    });
  });

  it('renders a stale-price warning when snapshot unitPrice differs from live batch unitPrice', async () => {
    const divergentSnapshot = {
      ...snapshotDetail,
      rows: [
        { batchId: 'batch-a', batchCode: 'BC-A', name: 'Skywalker OG', category: 'Flower', availableQty: 100, unitPrice: 1200, qty: 5 }
      ]
    };
    // Live inventory price diverged from the snapshot price.
    referenceUseQuery.mockReturnValue({
      data: {
        availableBatches: [
          { id: 'batch-a', batchCode: 'BC-A', availableQty: 80, unitPrice: 1400, name: 'Skywalker OG' }
        ]
      }
    });
    recentCustomerSheetsUseQuery.mockReturnValue({ data: snapshots, isLoading: false });
    customerSheetSnapshotByIdUseQuery.mockReturnValue({ data: divergentSnapshot, isLoading: false });
    const user = userEvent.setup();
    render(
      <RecentSheetsPanel
        customerId="cust-1"
        selectedOrderId="order-1"
        onAddBatch={vi.fn().mockResolvedValue(undefined)}
      />
    );
    await user.click(screen.getAllByRole('button', { name: /open/i })[0]);
    expect(screen.getByTestId('price-divergence-warning')).toBeInTheDocument();
    expect(screen.getByText(/live/)).toBeInTheDocument();
  });
});
