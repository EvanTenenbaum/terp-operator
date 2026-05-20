// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const useQueryMock = vi.fn();
vi.mock('../api/trpc', () => ({
  trpc: {
    queries: {
      refereeCredits: {
        useQuery: () => useQueryMock()
      }
    }
  }
}));
vi.mock('./VoidRefereeCreditDialog', () => ({
  VoidRefereeCreditDialog: () => <div data-testid="void-credit-dialog" />
}));

import { RefereeCreditsList } from './RefereeCreditsList';

describe('RefereeCreditsList', () => {
  it('shows loading state when query is loading', () => {
    useQueryMock.mockReturnValueOnce({ data: undefined, isLoading: true });
    render(<RefereeCreditsList refereeId="ref-1" />);
    expect(screen.getByText(/loading credits/i)).toBeInTheDocument();
  });

  it('shows empty state when no credits', () => {
    useQueryMock.mockReturnValueOnce({ data: [], isLoading: false });
    render(<RefereeCreditsList refereeId="ref-1" />);
    expect(screen.getByText(/no credits accrued yet/i)).toBeInTheDocument();
  });

  it('renders accrued credit with Void button; voided credit has no Void button', () => {
    useQueryMock.mockReturnValueOnce({
      data: [
        {
          id: 'cred-1',
          transactionType: 'invoice',
          transactionNo: 'INV-001',
          transactionTotal: '1000.00',
          creditAmount: '50.00',
          amountPaid: '0.00',
          status: 'accrued',
          voidedAt: null,
          voidedReason: null,
          createdAt: '2026-05-01'
        },
        {
          id: 'cred-2',
          transactionType: 'invoice',
          transactionNo: 'INV-002',
          transactionTotal: '500.00',
          creditAmount: '25.00',
          amountPaid: '0.00',
          status: 'accrued',
          voidedAt: '2026-05-02T00:00:00Z',
          voidedReason: 'duplicate entry',
          createdAt: '2026-05-02'
        }
      ],
      isLoading: false
    });
    render(<RefereeCreditsList refereeId="ref-1" />);
    expect(screen.getByText('INV-001')).toBeInTheDocument();
    expect(screen.getByText('INV-002')).toBeInTheDocument();
    // Only one Void button exists (for the accrued one)
    const voidButtons = screen.getAllByRole('button', { name: /void/i });
    expect(voidButtons).toHaveLength(1);
    // Voided cell label exists
    expect(screen.getByText(/voided/i)).toBeInTheDocument();
  });
});
