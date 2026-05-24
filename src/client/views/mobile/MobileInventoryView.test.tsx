// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

vi.mock('../../api/trpc', () => ({
  trpc: { queries: { grid: { useQuery: vi.fn() } } },
}));

import { trpc } from '../../api/trpc';
import { MobileInventoryView } from './MobileInventoryView';

const mockGrid = trpc.queries.grid.useQuery as ReturnType<typeof vi.fn>;

const ROWS = [
  { id: '1', batchCode: 'BL-01', name: 'Blue Dream',   vendor: 'Green Valley', availableQty: 48, uom: 'lb', unitPrice: 1850, unitCost: 1620, status: 'ready',       category: 'flower', location: 'Vault A', tags: 'hybrid,fast-ship', expirationDate: null },
  { id: '2', batchCode: 'OG-08', name: 'OG Kush',      vendor: 'Summit',       availableQty: 12, uom: 'lb', unitPrice: 2100, unitCost: 1900, status: 'low_stock',   category: 'flower', location: 'Vault B', tags: 'indica',        expirationDate: null },
  { id: '3', batchCode: 'GE-03', name: 'Gelato #33',   vendor: 'Pacific',      availableQty:  0, uom: 'lb', unitPrice: 2400, unitCost: 2100, status: 'consignment', category: 'flower', location: 'Vault C', tags: '',              expirationDate: null },
];

beforeEach(() => {
  mockGrid.mockReturnValue({ data: ROWS, isLoading: false });
});

function renderView(path = '/mobile/inventory') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/mobile/inventory" element={<MobileInventoryView />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('MobileInventoryView', () => {
  it('renders all batch names', () => {
    renderView();
    expect(screen.getByText('Blue Dream')).toBeInTheDocument();
    expect(screen.getByText('OG Kush')).toBeInTheDocument();
    expect(screen.getByText('Gelato #33')).toBeInTheDocument();
  });

  it('filters by search text — matching rows visible, others hidden', () => {
    renderView();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Blue' } });
    expect(screen.getByText('Blue Dream')).toBeInTheDocument();
    expect(screen.queryByText('OG Kush')).not.toBeInTheDocument();
  });

  it('shows empty state when search matches nothing', () => {
    renderView();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'zzz' } });
    expect(screen.getByText(/no batches match/i)).toBeInTheDocument();
  });

  it('Ready chip hides non-ready rows', () => {
    renderView();
    fireEvent.click(screen.getByRole('button', { name: 'Ready' }));
    expect(screen.getByText('Blue Dream')).toBeInTheDocument();
    expect(screen.queryByText('OG Kush')).not.toBeInTheDocument();
  });

  it('expands a batch row on click and shows details', () => {
    renderView();
    fireEvent.click(screen.getByRole('button', { name: /blue dream/i }));
    expect(screen.getByText(/vault a/i)).toBeInTheDocument();
  });

  it('auto-expands the batch matching ?expand param', () => {
    renderView('/mobile/inventory?expand=1');
    expect(screen.getByText(/vault a/i)).toBeInTheDocument();
  });
});
