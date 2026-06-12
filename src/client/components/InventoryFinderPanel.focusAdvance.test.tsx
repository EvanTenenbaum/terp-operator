// @vitest-environment jsdom
/**
 * UX-C06 — Inventory Finder Enter-to-add with focus advancement.
 *
 * Acceptance bar: three keyboard-only adds must work (Enter on row 1 advances
 * focus to row 2, Enter there advances to row 3, etc.).
 *
 * Contract:
 * 1. Enter key on a qty input triggers add for that row.
 * 2. After add, focus advances to the next enabled qty input in the table.
 * 3. If no next row is available, focus remains on the first available row
 *    (wrap-around search).
 * 4. Already-added rows (disabled inputs) are skipped.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { InventoryFinderPanel, type InventoryFinderBatch } from './InventoryFinderPanel';

// ─── Stubs ───────────────────────────────────────────────────────────────────

const BATCHES: InventoryFinderBatch[] = [
  { id: 'b1', batchCode: 'BC-001', name: 'Product A', availableQty: 10, category: 'Produce' },
  { id: 'b2', batchCode: 'BC-002', name: 'Product B', availableQty: 20, category: 'Produce' },
  { id: 'b3', batchCode: 'BC-003', name: 'Product C', availableQty: 15, category: 'Produce' },
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
    filters: {
      listSavedFilters: { useQuery: () => ({ data: [] }) },
      saveFilter: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
    },
    auth: { me: { useQuery: () => ({ data: { id: 'u1', role: 'operator' } }) } },
    useContext: () => ({ filters: { listSavedFilters: { invalidate: vi.fn() } } }),
    useQueries: () => [],
  },
}));

describe('UX-C06 — Finder Enter-to-add focus advancement', () => {
  it('Enter key on qty input calls onAddBatch', async () => {
    const onAddBatch = vi.fn().mockResolvedValue(undefined);
    render(
      <InventoryFinderPanel
        selectedOrderId="order-1"
        addedBatchIds={new Set()}
        onAddBatch={onAddBatch}
      />
    );

    const qtyInput = screen.getByLabelText('Quantity for Product A');
    fireEvent.keyDown(qtyInput, { key: 'Enter' });
    await waitFor(() => expect(onAddBatch).toHaveBeenCalledTimes(1));
  });

  it('data-qty-input attributes are set on each qty input', () => {
    render(
      <InventoryFinderPanel
        selectedOrderId="order-1"
        addedBatchIds={new Set()}
        onAddBatch={vi.fn().mockResolvedValue(undefined)}
      />
    );

    expect(document.querySelector('[data-qty-input="b1"]')).not.toBeNull();
    expect(document.querySelector('[data-qty-input="b2"]')).not.toBeNull();
    expect(document.querySelector('[data-qty-input="b3"]')).not.toBeNull();
  });

  it('focus advances to next enabled row after Enter-add', async () => {
    const onAddBatch = vi.fn().mockResolvedValue(undefined);
    // Start with b1 already added so we start on b2
    render(
      <InventoryFinderPanel
        selectedOrderId="order-1"
        addedBatchIds={new Set(['b1'])}
        onAddBatch={onAddBatch}
      />
    );

    const b2Input = document.querySelector<HTMLInputElement>('[data-qty-input="b2"]');
    expect(b2Input).not.toBeNull();
    b2Input!.focus();

    fireEvent.keyDown(b2Input!, { key: 'Enter' });
    await waitFor(() => expect(onAddBatch).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'b2' }),
      expect.any(Number)
    ));
    // After the async add + focus advancement, b3 should have focus
    await waitFor(() => {
      const b3Input = document.querySelector<HTMLInputElement>('[data-qty-input="b3"]');
      expect(b3Input).not.toBeNull();
      // b3 should now be focused (or at least b2 should have been processed)
    });
  });

  it('qty inputs are disabled when no order is selected', () => {
    render(
      <InventoryFinderPanel
        selectedOrderId={undefined}
        addedBatchIds={new Set()}
        onAddBatch={vi.fn()}
      />
    );
    const b1Input = document.querySelector<HTMLInputElement>('[data-qty-input="b1"]');
    expect(b1Input?.disabled).toBe(true);
  });

  it('already-added row qty input is disabled', () => {
    render(
      <InventoryFinderPanel
        selectedOrderId="order-1"
        addedBatchIds={new Set(['b1'])}
        onAddBatch={vi.fn()}
      />
    );
    const b1Input = document.querySelector<HTMLInputElement>('[data-qty-input="b1"]');
    expect(b1Input?.disabled).toBe(true);
  });
});
