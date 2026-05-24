// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../api/trpc', () => ({
  trpc: {
    queries: { grid: { useQuery: vi.fn() } },
    auth:    { me: { useQuery: vi.fn() } },
  },
}));
vi.mock('../../components/useCommandRunner', () => ({
  useCommandRunner: () => ({ runCommand: vi.fn().mockResolvedValue({}) }),
}));
vi.mock('../../components/mobile/MobileToast', () => ({
  useMobileToast: () => ({ addToast: vi.fn() }),
}));

import { trpc } from '../../api/trpc';
import { MobilePaymentsView } from './MobilePaymentsView';

const mockGrid = trpc.queries.grid.useQuery as ReturnType<typeof vi.fn>;
const mockMe   = trpc.auth.me.useQuery   as ReturnType<typeof vi.fn>;

const INVOICES = [
  { id: 'i1', customer: 'Green Leaf',  invoiceNo: 'INV-2041', unappliedAmount: 28400, total: 28400, status: 'open', createdAt: new Date(Date.now() - 5 * 86400000).toISOString() },
  { id: 'i2', customer: 'Riverside',   invoiceNo: 'INV-2002', unappliedAmount: 44000, total: 44000, status: 'open', createdAt: new Date(Date.now() - 14 * 86400000).toISOString() },
];
const BILLS = [
  { id: 'b1', vendor: 'Green Valley', billNo: 'BILL-734', amount: 31200, amountPaid: 0, status: 'open', dueDate: new Date(Date.now() - 3 * 86400000).toISOString() },
];

beforeEach(() => {
  mockMe.mockReturnValue({ data: { id: 'u1', role: 'owner' } });
  mockGrid.mockImplementation(({ view }: { view: string }) => {
    if (view === 'payments') return { data: INVOICES, isLoading: false };
    if (view === 'vendors')  return { data: BILLS,    isLoading: false };
    return { data: [], isLoading: false };
  });
});

function renderView() {
  return render(<MemoryRouter><MobilePaymentsView /></MemoryRouter>);
}

describe('MobilePaymentsView', () => {
  it('renders receive tab invoices by default', () => {
    renderView();
    expect(screen.getByText('Green Leaf')).toBeInTheDocument();
    expect(screen.getByText('Riverside')).toBeInTheDocument();
  });

  it('switches to Pay Vendor tab', () => {
    renderView();
    fireEvent.click(screen.getByRole('button', { name: /pay vendor/i }));
    expect(screen.getByText('Green Valley')).toBeInTheDocument();
  });

  it('expands invoice row on click showing form', () => {
    renderView();
    fireEvent.click(screen.getByRole('button', { name: /green leaf/i }));
    expect(screen.getByRole('textbox', { name: /reference/i })).toBeInTheDocument();
  });

  it('shows confirm sheet when receive amount >= 20000', () => {
    renderView();
    fireEvent.click(screen.getByRole('button', { name: /green leaf/i }));
    fireEvent.click(screen.getByRole('button', { name: /^ach$/i }));
    fireEvent.click(screen.getByRole('button', { name: /record receipt/i }));
    expect(screen.getByRole('dialog', { name: /confirm action/i })).toBeInTheDocument();
  });

  it('always shows confirm sheet for vendor payments', () => {
    renderView();
    fireEvent.click(screen.getByRole('button', { name: /pay vendor/i }));
    fireEvent.click(screen.getByRole('button', { name: /green valley/i }));
    fireEvent.click(screen.getByRole('button', { name: /^ach$/i }));
    fireEvent.click(screen.getByRole('button', { name: /record payment/i }));
    expect(screen.getByRole('dialog', { name: /confirm action/i })).toBeInTheDocument();
  });

  it('disables Record Payment for operator role', () => {
    mockMe.mockReturnValue({ data: { id: 'u1', role: 'operator' } });
    renderView();
    fireEvent.click(screen.getByRole('button', { name: /pay vendor/i }));
    fireEvent.click(screen.getByRole('button', { name: /green valley/i }));
    const btn = screen.getByRole('button', { name: /record payment/i });
    expect(btn).toBeDisabled();
  });
});
