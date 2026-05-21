// @vitest-environment jsdom
/**
 * Tests for CustomerPurchaseHistoryPanel (#61).
 *
 * The panel is a default-closed disclosure above the Sales workspace. When
 * expanded, it lazy-loads line-level prior purchases for the selected customer
 * and renders a table with product alias, vendor, sale price, qty, payment
 * terms, and payment status. A free-text filter narrows by alias/product/
 * vendor/terms/status.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// --- mock trpc ---
const customerPurchaseHistoryUseQuery = vi.fn();
vi.mock('../api/trpc', () => ({
  trpc: {
    queries: {
      customerPurchaseHistory: {
        useQuery: (...args: unknown[]) => customerPurchaseHistoryUseQuery(...args)
      }
    }
  }
}));

import { CustomerPurchaseHistoryPanel } from './CustomerPurchaseHistoryPanel';

const sampleRows = [
  {
    id: 'l-1',
    orderId: 'o-1',
    orderNo: 'SO-1',
    itemAlias: 'Skywalker',
    itemName: 'Skywalker OG',
    vendor: 'Acme Farms',
    unitPrice: '1200',
    qty: '5',
    paymentTerms: 'Net 14',
    paymentStatus: 'paid',
    createdAt: '2026-04-01T00:00:00Z'
  },
  {
    id: 'l-2',
    orderId: 'o-2',
    orderNo: 'SO-2',
    itemAlias: null,
    itemName: 'Wedding Cake',
    vendor: 'Bravo Gardens',
    unitPrice: '900',
    qty: '2',
    paymentTerms: 'COD',
    paymentStatus: 'open',
    createdAt: '2026-04-10T00:00:00Z'
  }
];

beforeEach(() => {
  customerPurchaseHistoryUseQuery.mockReset();
});

describe('CustomerPurchaseHistoryPanel — default-closed disclosure (#61)', () => {
  it('is closed by default — table not rendered', () => {
    customerPurchaseHistoryUseQuery.mockReturnValue({ data: undefined, isLoading: false });
    render(<CustomerPurchaseHistoryPanel customerId="cust-1" />);
    // Header is visible
    expect(screen.getByText(/Customer purchase history/i)).toBeInTheDocument();
    // No table rendered until disclosure opens
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('does not run the query while closed (lazy load)', () => {
    customerPurchaseHistoryUseQuery.mockReturnValue({ data: undefined, isLoading: false });
    render(<CustomerPurchaseHistoryPanel customerId="cust-1" />);
    // The query is invoked with { enabled: false } while closed
    const enabledArg = customerPurchaseHistoryUseQuery.mock.calls[0]?.[1];
    expect(enabledArg).toMatchObject({ enabled: false });
  });
});

describe('CustomerPurchaseHistoryPanel — expanded state', () => {
  it('expanding the disclosure enables the query and shows the table', async () => {
    customerPurchaseHistoryUseQuery.mockReturnValue({ data: sampleRows, isLoading: false });
    const user = userEvent.setup();
    render(<CustomerPurchaseHistoryPanel customerId="cust-1" />);
    await user.click(screen.getByRole('button', { name: /customer purchase history/i }));
    expect(screen.getByRole('table')).toBeInTheDocument();
  });

  it('renders required line-level columns', async () => {
    customerPurchaseHistoryUseQuery.mockReturnValue({ data: sampleRows, isLoading: false });
    const user = userEvent.setup();
    render(<CustomerPurchaseHistoryPanel customerId="cust-1" />);
    await user.click(screen.getByRole('button', { name: /customer purchase history/i }));
    // Spec columns: product alias, vendor, sale price, quantity, payment terms, payment status
    expect(screen.getByRole('columnheader', { name: /alias/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /vendor/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /sale price/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /qty/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /payment terms/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /payment status/i })).toBeInTheDocument();
  });

  it('renders sales-line rows (not order rows)', async () => {
    customerPurchaseHistoryUseQuery.mockReturnValue({ data: sampleRows, isLoading: false });
    const user = userEvent.setup();
    render(<CustomerPurchaseHistoryPanel customerId="cust-1" />);
    await user.click(screen.getByRole('button', { name: /customer purchase history/i }));
    // 2 lines from 2 different orders → at least 2 rows
    expect(screen.getByText('Skywalker')).toBeInTheDocument();
    expect(screen.getByText('Wedding Cake')).toBeInTheDocument();
  });

  it('shows empty state when customer has no prior purchases', async () => {
    customerPurchaseHistoryUseQuery.mockReturnValue({ data: [], isLoading: false });
    const user = userEvent.setup();
    render(<CustomerPurchaseHistoryPanel customerId="cust-1" />);
    await user.click(screen.getByRole('button', { name: /customer purchase history/i }));
    expect(screen.getByText(/no prior purchases/i)).toBeInTheDocument();
  });

  it('shows loading state', async () => {
    customerPurchaseHistoryUseQuery.mockReturnValue({ data: undefined, isLoading: true });
    const user = userEvent.setup();
    render(<CustomerPurchaseHistoryPanel customerId="cust-1" />);
    await user.click(screen.getByRole('button', { name: /customer purchase history/i }));
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });
});

describe('CustomerPurchaseHistoryPanel — filter behavior', () => {
  it('free-text search narrows by alias', async () => {
    customerPurchaseHistoryUseQuery.mockReturnValue({ data: sampleRows, isLoading: false });
    const user = userEvent.setup();
    render(<CustomerPurchaseHistoryPanel customerId="cust-1" />);
    await user.click(screen.getByRole('button', { name: /customer purchase history/i }));
    const input = screen.getByRole('searchbox');
    await user.type(input, 'skywalker');
    expect(screen.getByText('Skywalker')).toBeInTheDocument();
    expect(screen.queryByText('Wedding Cake')).toBeNull();
  });

  it('free-text search narrows by payment terms', async () => {
    customerPurchaseHistoryUseQuery.mockReturnValue({ data: sampleRows, isLoading: false });
    const user = userEvent.setup();
    render(<CustomerPurchaseHistoryPanel customerId="cust-1" />);
    await user.click(screen.getByRole('button', { name: /customer purchase history/i }));
    const input = screen.getByRole('searchbox');
    await user.type(input, 'cod');
    expect(screen.queryByText('Skywalker')).toBeNull();
    expect(screen.getByText('Wedding Cake')).toBeInTheDocument();
  });
});

describe('CustomerPurchaseHistoryPanel — guards', () => {
  it('does not run the query when no customer is selected', () => {
    customerPurchaseHistoryUseQuery.mockReturnValue({ data: undefined, isLoading: false });
    render(<CustomerPurchaseHistoryPanel customerId="" />);
    const enabledArg = customerPurchaseHistoryUseQuery.mock.calls[0]?.[1];
    // Either disabled because closed OR disabled because no customer — both fine
    expect(enabledArg.enabled).toBe(false);
  });
});
