// @vitest-environment jsdom
// UX-Q06(a) — credit-ledger totals strip on RefereeDetailPanel
// UX-Q06(c) — bulk "Pay accrued credits": disabled-with-reason action

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

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

// Sample data: 2 accrued credits ($50 + $30), 1 voided ($25), 1 paid ($40)
const sampleCredits = [
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
    transactionTotal: '600.00',
    creditAmount: '30.00',
    amountPaid: '0.00',
    status: 'accrued',
    voidedAt: null,
    voidedReason: null,
    createdAt: '2026-05-02'
  },
  {
    id: 'cred-3',
    transactionType: 'invoice',
    transactionNo: 'INV-003',
    transactionTotal: '500.00',
    creditAmount: '25.00',
    amountPaid: '0.00',
    status: 'accrued',
    voidedAt: '2026-05-03T00:00:00Z',
    voidedReason: 'error',
    createdAt: '2026-05-03'
  },
  {
    id: 'cred-4',
    transactionType: 'invoice',
    transactionNo: 'INV-004',
    transactionTotal: '800.00',
    creditAmount: '40.00',
    amountPaid: '40.00',
    status: 'paid',
    voidedAt: null,
    voidedReason: null,
    createdAt: '2026-05-04'
  }
];

describe('UX-Q06(a) — credit-ledger totals strip', () => {
  it('renders the totals strip when credits are present', () => {
    useQueryMock.mockReturnValue({ data: sampleCredits, isLoading: false });
    render(<RefereeCreditsList refereeId="ref-1" />);
    expect(screen.getByTestId('credits-totals-strip')).toBeInTheDocument();
  });

  it('shows accrued total = sum of non-voided accrued credits', () => {
    useQueryMock.mockReturnValue({ data: sampleCredits, isLoading: false });
    render(<RefereeCreditsList refereeId="ref-1" />);
    // cred-1 ($50) + cred-2 ($30) = $80 accrued; cred-3 is voided so excluded
    const accruedEl = screen.getByTestId('credits-total-accrued');
    expect(accruedEl.textContent).toContain('80');
  });

  it('shows paid total = sum of amountPaid for non-voided rows with payment', () => {
    useQueryMock.mockReturnValue({ data: sampleCredits, isLoading: false });
    render(<RefereeCreditsList refereeId="ref-1" />);
    // cred-4 has amountPaid = $40
    const paidEl = screen.getByTestId('credits-total-paid');
    expect(paidEl.textContent).toContain('40');
  });

  it('shows void total = sum of creditAmount for voided credits', () => {
    useQueryMock.mockReturnValue({ data: sampleCredits, isLoading: false });
    render(<RefereeCreditsList refereeId="ref-1" />);
    // cred-3 ($25) voided
    const voidEl = screen.getByTestId('credits-total-void');
    expect(voidEl.textContent).toContain('25');
  });

  it('does not render totals strip when there are no credits', () => {
    useQueryMock.mockReturnValue({ data: [], isLoading: false });
    render(<RefereeCreditsList refereeId="ref-1" />);
    expect(screen.queryByTestId('credits-totals-strip')).not.toBeInTheDocument();
  });
});

describe('UX-Q06(c) — bulk pay accrued credits: disabled-with-reason', () => {
  it('does NOT show bulk pay strip when no credits are selected', () => {
    useQueryMock.mockReturnValue({ data: sampleCredits, isLoading: false });
    render(<RefereeCreditsList refereeId="ref-1" />);
    expect(screen.queryByTestId('credits-bulk-pay-strip')).not.toBeInTheDocument();
  });

  it('shows bulk pay strip when an accrued credit is selected', () => {
    useQueryMock.mockReturnValue({ data: sampleCredits, isLoading: false });
    render(<RefereeCreditsList refereeId="ref-1" />);

    const checkbox = screen.getByTestId('credit-checkbox-cred-1');
    fireEvent.click(checkbox);

    expect(screen.getByTestId('credits-bulk-pay-strip')).toBeInTheDocument();
  });

  it('bulk pay button is disabled with payout-not-available reason', () => {
    useQueryMock.mockReturnValue({ data: sampleCredits, isLoading: false });
    render(<RefereeCreditsList refereeId="ref-1" />);

    const checkbox = screen.getByTestId('credit-checkbox-cred-1');
    fireEvent.click(checkbox);

    const payButton = screen.getByTestId('bulk-pay-credits-button');
    expect(payButton).toBeDisabled();
    expect(payButton.title).toMatch(/payout command not yet available/i);
    expect(payButton.title).toMatch(/CAP-039/i);
  });

  it('shows selection total in bulk pay strip', () => {
    useQueryMock.mockReturnValue({ data: sampleCredits, isLoading: false });
    render(<RefereeCreditsList refereeId="ref-1" />);

    // Select cred-1 ($50)
    fireEvent.click(screen.getByTestId('credit-checkbox-cred-1'));
    // Select cred-2 ($30)
    fireEvent.click(screen.getByTestId('credit-checkbox-cred-2'));

    const strip = screen.getByTestId('credits-bulk-pay-strip');
    // Combined: $80
    expect(strip.textContent).toContain('80');
  });

  it('voided credits do not have a checkbox (cannot be selected for payout)', () => {
    useQueryMock.mockReturnValue({ data: sampleCredits, isLoading: false });
    render(<RefereeCreditsList refereeId="ref-1" />);
    // cred-3 is voided — it should have no checkbox
    expect(screen.queryByTestId('credit-checkbox-cred-3')).not.toBeInTheDocument();
  });

  it('shows tracked-reason text alongside the disabled button', () => {
    useQueryMock.mockReturnValue({ data: sampleCredits, isLoading: false });
    render(<RefereeCreditsList refereeId="ref-1" />);

    fireEvent.click(screen.getByTestId('credit-checkbox-cred-1'));

    const strip = screen.getByTestId('credits-bulk-pay-strip');
    expect(strip.textContent).toMatch(/CAP-039/i);
  });
});
