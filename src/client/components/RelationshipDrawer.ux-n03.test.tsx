// @vitest-environment jsdom
/**
 * UX-N03 — RelationshipSummaryBody: directional AR/AP display, no netting.
 *
 * JY-07 "do not net" rule: for dual-role counterparties the Relationship tab
 * must show AR ("Owes us") and AP ("We owe them") as separate directional
 * figures. The legacy "Net position" row must NOT be rendered — a single
 * net number silently conceals the gross obligations on each side.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

// Stub PricingPanel so the N03 test focuses on the relationship display only.
vi.mock('./PricingPanel', () => ({
  CustomerPricingPanel: () => <div data-testid="pricing-panel-stub" />,
}));

const CUSTOMER_OPEN = 4500;
const VENDOR_OPEN = 2000;

vi.mock('../api/trpc', () => {
  const makeQuery = (data: unknown) => ({ data, isLoading: false, isError: false });
  const procProxy: unknown = new Proxy({}, {
    get(_t, prop: string) {
      if (prop === 'relationshipSummary') {
        return {
          useQuery: () => makeQuery({
            customer: { id: 'c-1', name: 'Acme Corp' },
            vendor: { id: 'v-1', name: 'Acme Corp' },
            invoices: [{ id: 'i-1', invoiceNo: 'INV-01', status: 'open', total: CUSTOMER_OPEN, amountPaid: 0 }],
            bills: [{ id: 'b-1', billNo: 'B001', status: 'open', amount: VENDOR_OPEN, amountPaid: 0, dueReason: 'purchase' }],
            payments: [],
            orders: [],
            receipts: [],
            vendorPayments: [],
            ledger: [],
            creditOverrides: [],
            disputes: [],
            commands: [],
          }),
        };
      }
      if (prop === 'customerPricingRule') return { useQuery: () => makeQuery(null) };
      return { useQuery: () => makeQuery(undefined) };
    },
  });
  return {
    trpc: {
      queries: procProxy,
      auth: { me: { useQuery: () => makeQuery({ id: 'u1', role: 'operator', name: 'op', email: 'op@x' }) } },
      useContext: () => ({ auth: { me: { invalidate: () => {} } } }),
    },
  };
});

import { RelationshipSummaryBody } from './RelationshipDrawer';

function Wrap({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('UX-N03 — Directional AR/AP display, no silent netting', () => {
  it('shows "Owes us" (AR) directional figure', () => {
    render(
      <Wrap>
        <RelationshipSummaryBody row={{ id: 'c-1', customerId: 'c-1', vendorId: 'v-1' } as never} view="clients" />
      </Wrap>
    );
    expect(screen.getByText(/owes us/i)).toBeInTheDocument();
  });

  it('shows "We owe them" (AP) directional figure', () => {
    render(
      <Wrap>
        <RelationshipSummaryBody row={{ id: 'c-1', customerId: 'c-1', vendorId: 'v-1' } as never} view="clients" />
      </Wrap>
    );
    expect(screen.getByText(/we owe them/i)).toBeInTheDocument();
  });

  it('does NOT render a "Net position" row for dual-role counterparties (JY-07)', () => {
    render(
      <Wrap>
        <RelationshipSummaryBody row={{ id: 'c-1', customerId: 'c-1', vendorId: 'v-1' } as never} view="clients" />
      </Wrap>
    );
    // "Net position" silently combines AR and AP — must not appear per JY-07.
    expect(screen.queryByText(/net position/i)).toBeNull();
  });

  it('AR and AP amounts are rendered separately as non-zero values', () => {
    render(
      <Wrap>
        <RelationshipSummaryBody row={{ id: 'c-1', customerId: 'c-1', vendorId: 'v-1' } as never} view="clients" />
      </Wrap>
    );
    // Both directional amounts must appear; a single netted value (2500) must not
    // be the only money figure visible.
    expect(screen.getByText('$4,500.00')).toBeInTheDocument();
    expect(screen.getByText('$2,000.00')).toBeInTheDocument();
    expect(screen.queryByText('$2,500.00')).toBeNull();
  });
});
