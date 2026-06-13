// @vitest-environment jsdom
// UX-J02 / UX-J04: Quick Ledger negative-amount labeling, balance-effect
// preview, and the one-line ledger impact preview ("Estimated: allocates $X to
// INV-123; $Y unapplied; balance → $Z"). The client estimate mirrors the
// server FIFO order (commandBus.ts allocatePayment: open/partial invoices by
// created_at ASC — reference.openInvoices arrives in that order).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('./useCommandRunner', () => ({
  useCommandRunner: () => ({ runCommand: vi.fn(), isRunning: false })
}));

const harness = vi.hoisted(() => ({
  reference: undefined as unknown,
  draftSyncStatus: 'synced' as string
}));

vi.mock('../api/trpc', () => {
  const empty = () => ({ data: undefined, isLoading: false });
  const emptyMutation = () => ({ mutate: vi.fn(), isLoading: false });
  const procProxy: unknown = new Proxy(
    {},
    {
      get(_t, prop: string) {
        if (prop === 'reference') return { useQuery: () => ({ data: harness.reference, isLoading: false }) };
        return { useQuery: empty, useMutation: emptyMutation };
      }
    }
  );
  return {
    trpc: {
      auth: { me: { useQuery: () => ({ data: { id: 'u-1', role: 'owner' } }) } },
      queries: procProxy
    }
  };
});

vi.mock('../hooks/useQuickLedgerDraftSync', () => ({
  useQuickLedgerDraftSync: () => ({ status: harness.draftSyncStatus })
}));

import { QuickLedgerGrid, ledgerImpact, customerBalance, formatServerAllocationPreview } from './QuickLedgerGrid';
import type { AllocationPreviewData } from './QuickLedgerGrid';
import { useUiStore } from '../store/uiStore';
import type { LedgerDraft } from '../store/uiStore';

const CUSTOMER_ID = '11111111-1111-1111-1111-111111111111';

function draft(overrides: Partial<LedgerDraft> = {}): LedgerDraft {
  return {
    id: 'row-1',
    date: '2026-06-12',
    direction: 'receiving',
    entityType: 'customer',
    entityId: CUSTOMER_ID,
    entityName: '',
    transactionType: 'client_payment',
    allocationTargetType: 'fifo',
    allocationTargetId: '',
    amount: '500',
    method: 'cash',
    bucket: 'cash-file-a',
    reference: '',
    notes: '',
    status: 'draft',
    ...overrides
  };
}

// Two open invoices in server FIFO order (created_at ASC): INV-001 first.
const referenceData = {
  customers: [{ id: CUSTOMER_ID, name: 'Big Buyer Co', balance: '1500.00' }],
  openInvoices: [
    { id: 'inv-1', invoiceNo: 'INV-001', customerId: CUSTOMER_ID, total: '400.00', amountPaid: '0.00', status: 'open' },
    { id: 'inv-2', invoiceNo: 'INV-002', customerId: CUSTOMER_ID, total: '300.00', amountPaid: '100.00', status: 'partial' }
  ]
};

beforeEach(() => {
  harness.reference = referenceData;
  harness.draftSyncStatus = 'synced';
});

describe('ledgerImpact — UX-J04 FIFO estimate', () => {
  it('itemizes FIFO allocation in server order with unapplied remainder and balance effect', () => {
    const text = ledgerImpact(draft({ amount: '500' }), referenceData, []);
    // $400 fills INV-001, $100 partially fills INV-002 (open $200), $0 unapplied.
    expect(text).toBe('Estimated: allocates $400.00 to INV-001, $100.00 to INV-002; $0.00 unapplied; balance → $1,000.00');
  });

  it('reports the unapplied remainder when the amount exceeds open invoices', () => {
    const text = ledgerImpact(draft({ amount: '700' }), referenceData, []);
    // Open total = 400 + 200 = 600 → $100 unapplied; balance drops by allocated 600 only.
    expect(text).toBe('Estimated: allocates $400.00 to INV-001, $200.00 to INV-002; $100.00 unapplied; balance → $900.00');
  });

  it('previews a selected invoice allocation with residual unapplied', () => {
    const text = ledgerImpact(draft({ amount: '500', allocationTargetType: 'selected_invoice', allocationTargetId: 'inv-2' }), referenceData, []);
    expect(text).toBe('Estimated: allocates $200.00 to INV-002; $300.00 unapplied; balance → $1,300.00');
  });

  it('states FIFO falls back to unapplied when the customer has no open invoices', () => {
    const reference = { ...referenceData, openInvoices: [] };
    const text = ledgerImpact(draft({ amount: '500' }), reference, []);
    expect(text).toBe('No open invoices — $500.00 unapplied; balance unchanged ($1,500.00)');
  });

  it('states balance is unchanged for explicitly unapplied money', () => {
    const text = ledgerImpact(draft({ amount: '500', allocationTargetType: 'unapplied' }), referenceData, []);
    expect(text).toBe('Leaves $500.00 unapplied; balance unchanged ($1,500.00)');
  });
});

describe('ledgerImpact — UX-J02 buyer credit / balance effect', () => {
  it('previews the balance effect for a negative amount (buyer credit)', () => {
    const text = ledgerImpact(draft({ amount: '-250' }), referenceData, []);
    expect(text).toBe('Buyer credit / down payment — no invoice allocation; balance → $1,250.00');
  });

  it('previews the balance effect for buyer-credit transaction types with positive amounts', () => {
    // commandBus.ts postTransactionLedgerRow flips the sign for these types.
    const text = ledgerImpact(draft({ amount: '250', transactionType: 'down_payment' }), referenceData, []);
    expect(text).toBe('Buyer credit / down payment — no invoice allocation; balance → $1,250.00');
  });

  it('omits the balance arrow when the customer is unknown', () => {
    const text = ledgerImpact(draft({ amount: '-250', entityId: 'missing' }), referenceData, []);
    expect(text).toBe('Buyer credit / down payment — no invoice allocation');
  });

  it('customerBalance reads the balance from reference data', () => {
    expect(customerBalance(draft(), referenceData)).toBe(1500);
    expect(customerBalance(draft({ entityId: '' }), referenceData)).toBeNull();
  });
});

describe('formatServerAllocationPreview — UX-J04 server-walk formatting', () => {
  it('formats the server FIFO preview rows into the estimated line', () => {
    const preview: AllocationPreviewData = {
      kind: 'fifo',
      label: 'Auto-apply to oldest invoices',
      rows: [
        { invoiceId: 'inv-1', invoiceNo: 'INV-001', open: '400.00', applied: '400.00' },
        { invoiceId: 'inv-2', invoiceNo: 'INV-002', open: '200.00', applied: '100.00' }
      ],
      unapplied: '0.00'
    };
    expect(formatServerAllocationPreview(preview, 1500)).toBe(
      'Estimated: allocates $400.00 to INV-001, $100.00 to INV-002; $0.00 unapplied; balance → $1,000.00'
    );
  });

  it('formats the buyer-credit preview with the balance effect', () => {
    const preview: AllocationPreviewData = { kind: 'buyer_credit', label: 'Buyer credit / down payment', rows: [], unapplied: '250.00' };
    expect(formatServerAllocationPreview(preview, 1500)).toBe('Buyer credit / down payment — no invoice allocation; balance → $1,250.00');
  });

  it('returns undefined when there is nothing to preview (falls back to client estimate)', () => {
    const preview: AllocationPreviewData = { kind: 'fifo', label: 'Auto-apply to oldest invoices', rows: [], unapplied: '0.00' };
    expect(formatServerAllocationPreview(preview, 1500)).toBeUndefined();
  });
});

describe('QuickLedgerGrid rendering — UX-J02 label flip + UX-A04 sync indicator', () => {
  it('shows the buyer credit pill and balance preview when the amount is negative', () => {
    useUiStore.setState({ ledgerDrafts: [draft({ amount: '-250' })] });
    render(<QuickLedgerGrid />);
    expect(screen.getByText('Buyer credit / Down payment')).toBeTruthy();
    expect(screen.getByText('Buyer credit / down payment — no invoice allocation; balance → $1,250.00')).toBeTruthy();
  });

  it('renders the impact preview cell for a FIFO draft row', () => {
    useUiStore.setState({ ledgerDrafts: [draft({ amount: '500' })] });
    render(<QuickLedgerGrid />);
    expect(screen.getByText('Estimated: allocates $400.00 to INV-001, $100.00 to INV-002; $0.00 unapplied; balance → $1,000.00')).toBeTruthy();
  });

  it('shows the truthful "not synced" indicator when draft sync fails (UX-A04)', () => {
    harness.draftSyncStatus = 'error';
    useUiStore.setState({ ledgerDrafts: [draft()] });
    render(<QuickLedgerGrid />);
    expect(screen.getByRole('status').textContent).toContain('Drafts not synced');
  });

  it('does not show the sync indicator when drafts are synced', () => {
    useUiStore.setState({ ledgerDrafts: [draft()] });
    render(<QuickLedgerGrid />);
    expect(screen.queryByText(/Drafts not synced/)).toBeNull();
  });
});
