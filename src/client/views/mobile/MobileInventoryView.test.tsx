// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

vi.mock('../../api/trpc', () => ({
  trpc: {
    queries: { grid: { useQuery: vi.fn() } },
    auth: { me: { useQuery: vi.fn() } },
  },
}));

const runCommandMock = vi.fn().mockResolvedValue({ ok: true });
vi.mock('../../components/useCommandRunner', () => ({
  useCommandRunner: () => ({ runCommand: runCommandMock, isRunning: false }),
}));

import { trpc } from '../../api/trpc';
import { MobileInventoryView } from './MobileInventoryView';

const mockGrid = trpc.queries.grid.useQuery as ReturnType<typeof vi.fn>;
const mockMe = trpc.auth.me.useQuery as ReturnType<typeof vi.fn>;

const ROWS = [
  { id: '1', batchCode: 'BL-01', name: 'Blue Dream',   vendor: 'Green Valley', availableQty: 48, uom: 'lb', unitPrice: 1850, unitCost: 1620, status: 'ready',       category: 'flower', location: 'Vault A', tags: 'hybrid,fast-ship', expirationDate: null, casePack: 12, draftReservedQty: 5 },
  { id: '2', batchCode: 'OG-08', name: 'OG Kush',      vendor: 'Summit',       availableQty: 12, uom: 'lb', unitPrice: 2100, unitCost: 1900, status: 'low_stock',   category: 'flower', location: 'Vault B', tags: 'indica',        expirationDate: null, casePack: null, draftReservedQty: 0 },
  { id: '3', batchCode: 'GE-03', name: 'Gelato #33',   vendor: 'Pacific',      availableQty:  0, uom: 'lb', unitPrice: 2400, unitCost: 2100, status: 'consignment', category: 'flower', location: 'Vault C', tags: '',              expirationDate: null, casePack: null, draftReservedQty: 0 },
];

beforeEach(() => {
  mockGrid.mockReturnValue({ data: ROWS, isLoading: false });
  mockMe.mockReturnValue({ data: { id: 'u1', role: 'manager' } });
  runCommandMock.mockClear();
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

  // Task 5: new fields
  it('shows casePack in expanded detail when > 0', () => {
    renderView();
    fireEvent.click(screen.getByRole('button', { name: /blue dream/i }));
    expect(screen.getByText(/case pack/i)).toBeInTheDocument();
    expect(screen.getByText(/12 lb per case/i)).toBeInTheDocument();
  });

  it('shows draftReservedQty in expanded detail when > 0', () => {
    renderView();
    fireEvent.click(screen.getByRole('button', { name: /blue dream/i }));
    expect(screen.getByText(/draft reserved/i)).toBeInTheDocument();
    expect(screen.getByText(/5 lb/i)).toBeInTheDocument();
  });

  it('does not show casePack section when casePack is null or 0', () => {
    renderView();
    fireEvent.click(screen.getByRole('button', { name: /og kush/i }));
    expect(screen.queryByText(/case pack/i)).not.toBeInTheDocument();
  });

  // Task 6: action buttons
  it('shows Adjust qty and Flag for review buttons in expanded detail', () => {
    renderView();
    fireEvent.click(screen.getByRole('button', { name: /blue dream/i }));
    expect(screen.getByRole('button', { name: /adjust qty/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /flag for review/i })).toBeInTheDocument();
  });

  it('does not show Call vendor button', () => {
    renderView();
    fireEvent.click(screen.getByRole('button', { name: /blue dream/i }));
    expect(screen.queryByRole('button', { name: /call vendor/i })).not.toBeInTheDocument();
  });

  it('shows inline adjust form when Adjust qty is clicked', () => {
    renderView();
    fireEvent.click(screen.getByRole('button', { name: /blue dream/i }));
    fireEvent.click(screen.getByRole('button', { name: /adjust qty/i }));
    expect(screen.getByLabelText(/delta quantity/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/reason/i)).toBeInTheDocument();
  });

  it('shows confirm sheet for Flag for review', () => {
    renderView();
    fireEvent.click(screen.getByRole('button', { name: /blue dream/i }));
    fireEvent.click(screen.getByRole('button', { name: /flag for review/i }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(/flag batch for review/i)).toBeInTheDocument();
  });

  it('Adjust qty is disabled for non-manager role', () => {
    mockMe.mockReturnValue({ data: { id: 'u1', role: 'viewer' } });
    renderView();
    fireEvent.click(screen.getByRole('button', { name: /blue dream/i }));
    expect(screen.getByRole('button', { name: /adjust qty/i })).toBeDisabled();
  });
});
