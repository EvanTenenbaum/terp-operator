// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const externalQueryMock = vi.fn();
const internalQueryMock = vi.fn();
const signalTextQueryMock = vi.fn();
const salesExternalQueryMock = vi.fn();
const salesInternalQueryMock = vi.fn();
const salesSignalTextQueryMock = vi.fn();
const meQueryMock = vi.fn();

vi.mock('../api/trpc', () => ({
  trpc: {
    queries: {
      purchaseOrderExternalReceipt: { useQuery: (input: unknown, options?: unknown) => externalQueryMock(input, options) },
      purchaseOrderInternalReceipt: { useQuery: (input: unknown, options?: unknown) => internalQueryMock(input, options) },
      purchaseOrderSignalText: { useQuery: (input: unknown, options?: unknown) => signalTextQueryMock(input, options) },
      salesOrderExternalReceipt: { useQuery: (input: unknown, options?: unknown) => salesExternalQueryMock(input, options) },
      salesOrderInternalReceipt: { useQuery: (input: unknown, options?: unknown) => salesInternalQueryMock(input, options) },
      salesOrderSignalText: { useQuery: (input: unknown, options?: unknown) => salesSignalTextQueryMock(input, options) }
    },
    auth: { me: { useQuery: () => meQueryMock() } }
  }
}));

import { ReceiptPanel } from './ReceiptPanel';

const PO_ID = '11111111-1111-1111-1111-111111111111';

const externalProjection = {
  kind: 'purchase_finalization',
  header: { title: 'Purchase Order', counterparty: 'Acme Farms', dateISO: '2026-05-21T00:00:00.000Z', documentNo: 'PO-1001' },
  lines: [{ name: 'Sunset OG', qty: 2, unitPrice: 50, subtotal: 100 }],
  totals: { subtotal: 100, total: 100 },
  projectionVersion: 1
};

const internalProjection = {
  ...externalProjection,
  internalNotes: 'paid in cash',
  cogs: { perLine: [{ name: 'Sunset OG', landedCost: 40 }], total: 80 }
};

beforeEach(() => {
  externalQueryMock.mockReset();
  internalQueryMock.mockReset();
  signalTextQueryMock.mockReset();
  salesExternalQueryMock.mockReset();
  salesInternalQueryMock.mockReset();
  salesSignalTextQueryMock.mockReset();
  meQueryMock.mockReset();
  meQueryMock.mockReturnValue({ data: { role: 'manager' } });
});

describe('ReceiptPanel', () => {
  it('shows loading state while the external query is pending', () => {
    externalQueryMock.mockReturnValue({ data: undefined, isLoading: true });
    internalQueryMock.mockReturnValue({ data: undefined, isLoading: false });
    signalTextQueryMock.mockReturnValue({ data: undefined, isLoading: true });
    render(<ReceiptPanel purchaseOrderId={PO_ID} />);
    expect(screen.getByTestId('receipt-panel')).toBeInTheDocument();
    expect(screen.getByText(/Loading receipt/i)).toBeInTheDocument();
  });

  it('shows empty state when no receipt has been finalized yet', () => {
    externalQueryMock.mockReturnValue({ data: null, isLoading: false });
    internalQueryMock.mockReturnValue({ data: null, isLoading: false });
    signalTextQueryMock.mockReturnValue({ data: null, isLoading: false });
    render(<ReceiptPanel purchaseOrderId={PO_ID} />);
    expect(screen.getByText(/No receipt generated yet/i)).toBeInTheDocument();
  });

  it('renders the external projection on the External tab by default', () => {
    externalQueryMock.mockReturnValue({ data: externalProjection, isLoading: false });
    internalQueryMock.mockReturnValue({ data: internalProjection, isLoading: false });
    signalTextQueryMock.mockReturnValue({ data: 'Purchase Order PO-1001\nTo: Acme Farms', isLoading: false });
    render(<ReceiptPanel purchaseOrderId={PO_ID} />);
    expect(screen.getByTestId('receipt-tab-external')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Acme Farms')).toBeInTheDocument();
    expect(screen.getByText('Sunset OG')).toBeInTheDocument();
    // External tab must NOT show internalNotes / cogs.
    expect(screen.queryByText(/paid in cash/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/landedCost/i)).not.toBeInTheDocument();
  });

  it('switches to the internal tab and shows internal-only fields when role is manager', () => {
    externalQueryMock.mockReturnValue({ data: externalProjection, isLoading: false });
    internalQueryMock.mockReturnValue({ data: internalProjection, isLoading: false });
    signalTextQueryMock.mockReturnValue({ data: 'text', isLoading: false });
    render(<ReceiptPanel purchaseOrderId={PO_ID} />);
    fireEvent.click(screen.getByTestId('receipt-tab-internal'));
    expect(screen.getByTestId('receipt-tab-internal')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText(/paid in cash/i)).toBeInTheDocument();
    expect(screen.getByText(/INTERNAL.*DO NOT SEND/i)).toBeInTheDocument();
  });

  it('hides the Internal tab when role is operator', () => {
    meQueryMock.mockReturnValue({ data: { role: 'operator' } });
    externalQueryMock.mockReturnValue({ data: externalProjection, isLoading: false });
    internalQueryMock.mockReturnValue({ data: null, isLoading: false });
    signalTextQueryMock.mockReturnValue({ data: 'text', isLoading: false });
    render(<ReceiptPanel purchaseOrderId={PO_ID} />);
    expect(screen.queryByTestId('receipt-tab-internal')).not.toBeInTheDocument();
  });

  it('copies the signal text via navigator.clipboard.writeText when Copy is clicked', async () => {
    externalQueryMock.mockReturnValue({ data: externalProjection, isLoading: false });
    internalQueryMock.mockReturnValue({ data: internalProjection, isLoading: false });
    signalTextQueryMock.mockReturnValue({ data: 'Purchase Order PO-1001\nTo: Acme Farms', isLoading: false });
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    render(<ReceiptPanel purchaseOrderId={PO_ID} />);
    fireEvent.click(screen.getByTestId('receipt-copy-signal'));
    expect(writeText).toHaveBeenCalledWith('Purchase Order PO-1001\nTo: Acme Farms');
  });
});

const SO_ID = '99999999-9999-9999-9999-999999999999';

const externalInvoiceProjection = {
  kind: 'invoice',
  header: { title: 'Invoice', counterparty: 'Acme Buyers', dateISO: '2026-05-21T00:00:00.000Z', documentNo: 'INV-9001' },
  lines: [{ name: 'Sunset OG', qty: 2, unitPrice: 100, subtotal: 200 }],
  totals: { subtotal: 200, total: 200 },
  footer: { reference: '2026-05-28T00:00:00.000Z' },
  projectionVersion: 1
};

const internalInvoiceProjection = {
  ...externalInvoiceProjection,
  cogs: { perLine: [{ name: 'Sunset OG', unitCost: 50 }], total: 100 },
  margin: { perLine: [{ name: 'Sunset OG', marginAbs: 100, marginPct: 50 }], total: 100 }
};

describe('ReceiptPanel — sales_order mode', () => {
  it('routes to the sales tRPC procedures when kind="sales_order"', () => {
    salesExternalQueryMock.mockReturnValue({ data: externalInvoiceProjection, isLoading: false });
    salesInternalQueryMock.mockReturnValue({ data: internalInvoiceProjection, isLoading: false });
    salesSignalTextQueryMock.mockReturnValue({ data: 'Invoice INV-9001\nTo: Acme Buyers', isLoading: false });
    externalQueryMock.mockReturnValue({ data: undefined, isLoading: false });
    internalQueryMock.mockReturnValue({ data: undefined, isLoading: false });
    signalTextQueryMock.mockReturnValue({ data: undefined, isLoading: false });

    render(<ReceiptPanel kind="sales_order" salesOrderId={SO_ID} />);

    expect(salesExternalQueryMock).toHaveBeenCalled();
    expect(salesExternalQueryMock.mock.calls[0][0]).toEqual({ salesOrderId: SO_ID });
    expect(salesSignalTextQueryMock).toHaveBeenCalled();
    // PO hooks called but disabled
    expect(externalQueryMock).toHaveBeenCalled();
    expect(externalQueryMock.mock.calls[0][1]).toMatchObject({ enabled: false });
    expect(internalQueryMock.mock.calls[0][1]).toMatchObject({ enabled: false });
    expect(signalTextQueryMock.mock.calls[0][1]).toMatchObject({ enabled: false });

    expect(screen.getByText('Acme Buyers')).toBeInTheDocument();
    expect(screen.getByText('INV-9001')).toBeInTheDocument();
  });

  it('hides the Internal tab in sales_order mode for operator role', () => {
    meQueryMock.mockReturnValue({ data: { role: 'operator' } });
    salesExternalQueryMock.mockReturnValue({ data: externalInvoiceProjection, isLoading: false });
    salesInternalQueryMock.mockReturnValue({ data: null, isLoading: false });
    salesSignalTextQueryMock.mockReturnValue({ data: 'text', isLoading: false });
    externalQueryMock.mockReturnValue({ data: undefined, isLoading: false });
    internalQueryMock.mockReturnValue({ data: undefined, isLoading: false });
    signalTextQueryMock.mockReturnValue({ data: undefined, isLoading: false });

    render(<ReceiptPanel kind="sales_order" salesOrderId={SO_ID} />);
    expect(screen.queryByTestId('receipt-tab-internal')).not.toBeInTheDocument();
  });

  it('copies the sales signal text when Copy is clicked in sales_order mode', () => {
    salesExternalQueryMock.mockReturnValue({ data: externalInvoiceProjection, isLoading: false });
    salesInternalQueryMock.mockReturnValue({ data: internalInvoiceProjection, isLoading: false });
    salesSignalTextQueryMock.mockReturnValue({ data: 'Invoice INV-9001\nTo: Acme Buyers', isLoading: false });
    externalQueryMock.mockReturnValue({ data: undefined, isLoading: false });
    internalQueryMock.mockReturnValue({ data: undefined, isLoading: false });
    signalTextQueryMock.mockReturnValue({ data: undefined, isLoading: false });

    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    render(<ReceiptPanel kind="sales_order" salesOrderId={SO_ID} />);
    fireEvent.click(screen.getByTestId('receipt-copy-signal'));
    expect(writeText).toHaveBeenCalledWith('Invoice INV-9001\nTo: Acme Buyers');
  });

  it('still passes existing PO tests with purchaseOrderId prop (no kind specified)', () => {
    externalQueryMock.mockReturnValue({ data: externalInvoiceProjection, isLoading: false });
    internalQueryMock.mockReturnValue({ data: internalInvoiceProjection, isLoading: false });
    signalTextQueryMock.mockReturnValue({ data: 'text', isLoading: false });
    salesExternalQueryMock.mockReturnValue({ data: undefined, isLoading: false });
    salesInternalQueryMock.mockReturnValue({ data: undefined, isLoading: false });
    salesSignalTextQueryMock.mockReturnValue({ data: undefined, isLoading: false });

    render(<ReceiptPanel purchaseOrderId="po-1" />);

    expect(externalQueryMock).toHaveBeenCalled();
    expect(externalQueryMock.mock.calls[0][0]).toEqual({ purchaseOrderId: 'po-1' });
    expect(salesExternalQueryMock.mock.calls[0][1]).toMatchObject({ enabled: false });
  });
});
