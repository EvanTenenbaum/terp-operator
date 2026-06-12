// @vitest-environment jsdom
/**
 * UX-F03 — inline line-cell inventory resolution.
 *
 * Covers:
 *  - searchFinderBatches reuses the finder's search semantics (shorthand,
 *    multi-term AND, "under $N" price cap, zero-stock exclusion).
 *  - resolveUniqueBatch binds only on an EXACT-ONE match.
 *  - buildBindLinePayload binds batch identity, clears unresolvedSourceText,
 *    and never overwrites an operator-entered price.
 *  - SaleLineItemTypeahead keyboard/mouse flows: pick binds, Enter-with-no-
 *    pick submits the unresolved path, Escape closes.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../api/trpc', () => ({
  trpc: {
    queries: {
      reference: { useQuery: () => ({ data: { availableBatches: [], vendors: [] } }) },
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

import {
  SaleLineItemTypeahead,
  buildBindLinePayload,
  resolveUniqueBatch,
  searchFinderBatches,
} from './SalesView.ux-f03';
import type { InventoryFinderBatch } from '../components/InventoryFinderPanel';

const BATCHES: InventoryFinderBatch[] = [
  {
    id: 'b-m15',
    batchCode: 'M15',
    name: 'Mango Kush',
    category: 'Flower',
    availableQty: 12,
    unitPrice: 110,
    unitCost: 70,
    tags: ['indoor'],
  } as InventoryFinderBatch,
  {
    id: 'b-gel',
    batchCode: 'GL-7',
    name: 'Gelato',
    category: 'Flower',
    availableQty: 30,
    unitPrice: 90,
    unitCost: 55,
    tags: ['gelato'],
  } as InventoryFinderBatch,
  {
    id: 'b-gel2',
    batchCode: 'GL-8',
    name: 'Gelato Cake',
    category: 'Flower',
    availableQty: 4,
    unitPrice: 240,
    unitCost: 150,
    tags: [],
  } as InventoryFinderBatch,
  {
    id: 'b-zero',
    batchCode: 'M15-OLD',
    name: 'Mango Kush (sold out)',
    category: 'Flower',
    availableQty: 0,
    unitPrice: 100,
    tags: [],
  } as InventoryFinderBatch,
];

describe('searchFinderBatches (UX-F03)', () => {
  it('matches shorthand against the finder haystack (batch code)', () => {
    const result = searchFinderBatches(BATCHES, 'm15');
    expect(result.map((b) => b.id)).toEqual(['b-m15']);
  });

  it('excludes rows with no available stock', () => {
    const result = searchFinderBatches(BATCHES, 'm15');
    expect(result.find((b) => b.id === 'b-zero')).toBeUndefined();
  });

  it('AND-combines multiple terms like the finder', () => {
    const result = searchFinderBatches(BATCHES, 'gelato cake');
    expect(result.map((b) => b.id)).toEqual(['b-gel2']);
  });

  it('honors the finder "under $N" price cap', () => {
    const result = searchFinderBatches(BATCHES, 'gelato under $100');
    expect(result.map((b) => b.id)).toEqual(['b-gel']);
  });

  it('sorts by available qty descending', () => {
    const result = searchFinderBatches(BATCHES, 'gl-');
    expect(result.map((b) => b.id)).toEqual(['b-gel', 'b-gel2']);
  });

  it('returns nothing below the minimum query length', () => {
    expect(searchFinderBatches(BATCHES, 'm')).toEqual([]);
    expect(searchFinderBatches(BATCHES, '  ')).toEqual([]);
  });
});

describe('resolveUniqueBatch (UX-F03)', () => {
  it('returns the batch on an exact-one match', () => {
    expect(resolveUniqueBatch(BATCHES, 'm15')?.id).toBe('b-m15');
  });

  it('returns null when the query is ambiguous (line stays needs_resolution)', () => {
    expect(resolveUniqueBatch(BATCHES, 'gelato')).toBeNull();
  });

  it('returns null when nothing matches', () => {
    expect(resolveUniqueBatch(BATCHES, 'zzz-not-here')).toBeNull();
  });
});

describe('buildBindLinePayload (UX-F03)', () => {
  const batch = BATCHES[0];

  it('binds batch identity and clears the unresolved text', () => {
    const payload = buildBindLinePayload('line-1', batch, 0);
    expect(payload.lineId).toBe('line-1');
    expect(payload.batchId).toBe('b-m15');
    expect(payload.itemName).toBe('Mango Kush');
    expect(payload.sourceRowKey).toBe('M15');
    expect(payload.unresolvedSourceText).toBe('');
  });

  it('adopts the batch price when the line has no price yet', () => {
    const payload = buildBindLinePayload('line-1', batch, 0);
    expect(payload.unitPrice).toBe(110);
  });

  it('NEVER overwrites an operator-entered price', () => {
    const payload = buildBindLinePayload('line-1', batch, 95);
    expect('unitPrice' in payload).toBe(false);
  });
});

describe('SaleLineItemTypeahead (UX-F03)', () => {
  function setup(value = '') {
    const onChange = vi.fn();
    const onPickBatch = vi.fn();
    const onSubmitUnresolved = vi.fn();
    const view = render(
      <SaleLineItemTypeahead
        value={value}
        onChange={onChange}
        batches={BATCHES}
        onPickBatch={onPickBatch}
        onSubmitUnresolved={onSubmitUnresolved}
        placeholder="Type item, source code, note, or shorthand"
      />
    );
    return { onChange, onPickBatch, onSubmitUnresolved, view };
  }

  it('typing opens a listbox with matching inventory options', async () => {
    const user = userEvent.setup();
    const { onChange } = setup('gel');
    const input = screen.getByRole('combobox');
    await user.type(input, 'a');
    expect(onChange).toHaveBeenCalled();
    // Controlled component: with value 'gel' and the list opened by typing,
    // both Gelato batches are listed.
    expect(screen.getByRole('listbox')).toBeTruthy();
    expect(screen.getAllByRole('option')).toHaveLength(2);
    expect(screen.getByText('GL-7')).toBeTruthy();
    expect(screen.getByText('GL-8')).toBeTruthy();
  });

  it('clicking an option binds that batch (onPickBatch)', async () => {
    const user = userEvent.setup();
    const { onPickBatch, onSubmitUnresolved } = setup('m15');
    const input = screen.getByRole('combobox');
    await user.type(input, '{ArrowDown}'); // open + highlight
    const option = screen.getByRole('option');
    await user.click(option);
    expect(onPickBatch).toHaveBeenCalledTimes(1);
    expect(onPickBatch.mock.calls[0][0].id).toBe('b-m15');
    expect(onSubmitUnresolved).not.toHaveBeenCalled();
  });

  it('ArrowDown + Enter picks the highlighted option', async () => {
    const user = userEvent.setup();
    const { onPickBatch } = setup('m15');
    const input = screen.getByRole('combobox');
    await user.click(input);
    await user.keyboard('{ArrowDown}{Enter}');
    expect(onPickBatch).toHaveBeenCalledTimes(1);
    expect(onPickBatch.mock.calls[0][0].id).toBe('b-m15');
  });

  it('Enter with no highlighted option submits the unresolved path', async () => {
    const user = userEvent.setup();
    const { onPickBatch, onSubmitUnresolved } = setup('custom request text zzz');
    const input = screen.getByRole('combobox');
    await user.click(input);
    await user.keyboard('{Enter}');
    expect(onSubmitUnresolved).toHaveBeenCalledTimes(1);
    expect(onPickBatch).not.toHaveBeenCalled();
  });

  it('Escape closes the listbox without losing the typed text', async () => {
    const user = userEvent.setup();
    setup('gel');
    const input = screen.getByRole('combobox');
    await user.click(input);
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('listbox')).toBeTruthy();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect((input as HTMLInputElement).value).toBe('gel');
  });
});
