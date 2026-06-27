// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const externalQueryMock = vi.fn();
const internalQueryMock = vi.fn();
const signalTextQueryMock = vi.fn();
const salesExternalQueryMock = vi.fn();
const salesInternalQueryMock = vi.fn();
const salesSignalTextQueryMock = vi.fn();
const paymentExternalQueryMock = vi.fn();
const paymentInternalQueryMock = vi.fn();
const paymentSignalTextQueryMock = vi.fn();
const vendorPaymentExternalQueryMock = vi.fn();
const vendorPaymentInternalQueryMock = vi.fn();
const vendorPaymentSignalTextQueryMock = vi.fn();
const poPrintHtmlQueryMock = vi.fn();
const soPrintHtmlQueryMock = vi.fn();
const payPrintHtmlQueryMock = vi.fn();
const vpPrintHtmlQueryMock = vi.fn();
const meQueryMock = vi.fn();

vi.mock('../api/trpc', () => ({
  trpc: {
    purchaseOrders: {
      purchaseOrderExternalReceipt: { useQuery: (input: unknown, options?: unknown) => externalQueryMock(input, options) },
      purchaseOrderInternalReceipt: { useQuery: (input: unknown, options?: unknown) => internalQueryMock(input, options) },
      purchaseOrderSignalText: { useQuery: (input: unknown, options?: unknown) => signalTextQueryMock(input, options) },
      purchaseOrderPrintHtml: { useQuery: (input: unknown, options?: unknown) => poPrintHtmlQueryMock(input, options) },
    },
    salesOrders: {
      salesOrderExternalReceipt: { useQuery: (input: unknown, options?: unknown) => salesExternalQueryMock(input, options) },
      salesOrderInternalReceipt: { useQuery: (input: unknown, options?: unknown) => salesInternalQueryMock(input, options) },
      salesOrderSignalText: { useQuery: (input: unknown, options?: unknown) => salesSignalTextQueryMock(input, options) },
      salesOrderPrintHtml: { useQuery: (input: unknown, options?: unknown) => soPrintHtmlQueryMock(input, options) },
    },
    payments: {
      paymentExternalReceipt: { useQuery: (input: unknown, options?: unknown) => paymentExternalQueryMock(input, options) },
      paymentInternalReceipt: { useQuery: (input: unknown, options?: unknown) => paymentInternalQueryMock(input, options) },
      paymentSignalText: { useQuery: (input: unknown, options?: unknown) => paymentSignalTextQueryMock(input, options) },
      paymentPrintHtml: { useQuery: (input: unknown, options?: unknown) => payPrintHtmlQueryMock(input, options) },
      vendorPaymentExternalReceipt: { useQuery: (input: unknown, options?: unknown) => vendorPaymentExternalQueryMock(input, options) },
      vendorPaymentInternalReceipt: { useQuery: (input: unknown, options?: unknown) => vendorPaymentInternalQueryMock(input, options) },
      vendorPaymentSignalText: { useQuery: (input: unknown, options?: unknown) => vendorPaymentSignalTextQueryMock(input, options) },
      vendorPaymentPrintHtml: { useQuery: (input: unknown, options?: unknown) => vpPrintHtmlQueryMock(input, options) }
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
  paymentExternalQueryMock.mockReset();
  paymentInternalQueryMock.mockReset();
  paymentSignalTextQueryMock.mockReset();
  vendorPaymentExternalQueryMock.mockReset();
  vendorPaymentInternalQueryMock.mockReset();
  vendorPaymentSignalTextQueryMock.mockReset();
  poPrintHtmlQueryMock.mockReset();
  soPrintHtmlQueryMock.mockReset();
  payPrintHtmlQueryMock.mockReset();
  vpPrintHtmlQueryMock.mockReset();
  poPrintHtmlQueryMock.mockReturnValue({ data: undefined, isLoading: false });
  soPrintHtmlQueryMock.mockReturnValue({ data: undefined, isLoading: false });
  payPrintHtmlQueryMock.mockReturnValue({ data: undefined, isLoading: false });
  vpPrintHtmlQueryMock.mockReturnValue({ data: undefined, isLoading: false });
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

  it('shows a disabled Print button when no print HTML is available', () => {
    externalQueryMock.mockReturnValue({ data: externalProjection, isLoading: false });
    internalQueryMock.mockReturnValue({ data: null, isLoading: false });
    signalTextQueryMock.mockReturnValue({ data: 'text', isLoading: false });
    // printHtml returns null (no snapshot)
    poPrintHtmlQueryMock.mockReturnValue({ data: null, isLoading: false });
    render(<ReceiptPanel purchaseOrderId={PO_ID} />);
    const printBtn = screen.getByTestId('receipt-print');
    expect(printBtn).toBeInTheDocument();
    expect(printBtn).toBeDisabled();
  });

  it('calls window.open with the print HTML when Print is clicked on external tab', () => {
    const mockHtml = '<!doctype html><html><body><p>Purchase Order PO-1001</p></body></html>';
    externalQueryMock.mockReturnValue({ data: externalProjection, isLoading: false });
    internalQueryMock.mockReturnValue({ data: null, isLoading: false });
    signalTextQueryMock.mockReturnValue({ data: 'text', isLoading: false });
    poPrintHtmlQueryMock.mockReturnValue({ data: mockHtml, isLoading: false });

    const mockDoc = { open: vi.fn(), write: vi.fn(), close: vi.fn() };
    const mockWin = { document: mockDoc, focus: vi.fn(), print: vi.fn() };
    vi.spyOn(window, 'open').mockReturnValue(mockWin as unknown as Window);

    render(<ReceiptPanel purchaseOrderId={PO_ID} />);
    fireEvent.click(screen.getByTestId('receipt-print'));

    // Note: renderPrintHtml escaping (esc() for all user-controlled fields) is
    // comprehensively tested in documentSnapshots.test.ts. This test validates
    // the ReceiptPanel wiring: HTML from the print procedure is correctly passed
    // to document.write.
    expect(window.open).toHaveBeenCalledWith('', '_blank');
    expect(mockDoc.write).toHaveBeenCalledWith(mockHtml);
    expect(mockWin.print).toHaveBeenCalled();
  });

  it('calls window.open with the internal print HTML (with watermark text) when Print is clicked on Internal tab', () => {
    const internalHtml = '<!doctype html><html><body><div data-testid="watermark">INTERNAL — DO NOT SEND</div><p>test</p></body></html>';
    const externalHtml = '<!doctype html><html><body><p>Purchase Order PO-1001</p></body></html>';
    externalQueryMock.mockReturnValue({ data: externalProjection, isLoading: false });
    internalQueryMock.mockReturnValue({ data: internalProjection, isLoading: false });
    signalTextQueryMock.mockReturnValue({ data: 'text', isLoading: false });
    // Return HTML based on the audience arg so we can assert the correct value was passed
    poPrintHtmlQueryMock.mockImplementation((input: { purchaseOrderId: string; audience?: string }) => ({
      data: input.audience === 'internal' ? internalHtml : externalHtml,
      isLoading: false
    }));

    const mockDoc = { open: vi.fn(), write: vi.fn(), close: vi.fn() };
    const mockWin = { document: mockDoc, focus: vi.fn(), print: vi.fn() };
    vi.spyOn(window, 'open').mockReturnValue(mockWin as unknown as Window);

    render(<ReceiptPanel purchaseOrderId={PO_ID} />);
    // Switch to internal tab
    fireEvent.click(screen.getByTestId('receipt-tab-internal'));
    // Click print
    fireEvent.click(screen.getByTestId('receipt-print'));

    expect(mockDoc.write).toHaveBeenCalledWith(internalHtml);
    // The written HTML must contain watermark text
    const writtenHtml = mockDoc.write.mock.calls[0][0] as string;
    expect(writtenHtml).toContain('INTERNAL — DO NOT SEND');
    expect(writtenHtml).not.toMatch(/<script/i);
    // Verify audience was passed correctly to the print hook
    const printCalls = poPrintHtmlQueryMock.mock.calls;
    const lastCallInput = printCalls[printCalls.length - 1][0] as { audience?: string };
    expect(lastCallInput.audience).toBe('internal');
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

const PAY_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const VP_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

const externalPaymentProjection = {
  kind: 'payment_received',
  header: { title: 'Payment Received', counterparty: 'Big Buyer Co', dateISO: '2026-05-22T12:00:00.000Z', documentNo: 'CHK-1234' },
  lines: [], totals: { subtotal: 500, total: 500 }, projectionVersion: 1
};
const internalPaymentProjection = { ...externalPaymentProjection, internalNotes: 'partial allocation — 2 open invoices' };
const externalVendorPayoutProjection = {
  kind: 'vendor_payout',
  header: { title: 'Vendor Payout', counterparty: 'Acme Farms', dateISO: '2026-05-22T15:30:00.000Z', documentNo: 'WIRE-7788' },
  lines: [], totals: { subtotal: 300, total: 300 }, projectionVersion: 1
};
const internalVendorPayoutProjection = { ...externalVendorPayoutProjection, internalNotes: 'check stub mismatched by $0.50' };

function setIdleAllOtherMocks() {
  externalQueryMock.mockReturnValue({ data: undefined, isLoading: false });
  internalQueryMock.mockReturnValue({ data: undefined, isLoading: false });
  signalTextQueryMock.mockReturnValue({ data: undefined, isLoading: false });
  salesExternalQueryMock.mockReturnValue({ data: undefined, isLoading: false });
  salesInternalQueryMock.mockReturnValue({ data: undefined, isLoading: false });
  salesSignalTextQueryMock.mockReturnValue({ data: undefined, isLoading: false });
  poPrintHtmlQueryMock.mockReturnValue({ data: undefined, isLoading: false });
  soPrintHtmlQueryMock.mockReturnValue({ data: undefined, isLoading: false });
  payPrintHtmlQueryMock.mockReturnValue({ data: undefined, isLoading: false });
  vpPrintHtmlQueryMock.mockReturnValue({ data: undefined, isLoading: false });
}

describe('ReceiptPanel — payment mode', () => {
  it('routes to the payment tRPC procedures when kind="payment"', () => {
    setIdleAllOtherMocks();
    vendorPaymentExternalQueryMock.mockReturnValue({ data: undefined, isLoading: false });
    vendorPaymentInternalQueryMock.mockReturnValue({ data: undefined, isLoading: false });
    vendorPaymentSignalTextQueryMock.mockReturnValue({ data: undefined, isLoading: false });
    paymentExternalQueryMock.mockReturnValue({ data: externalPaymentProjection, isLoading: false });
    paymentInternalQueryMock.mockReturnValue({ data: internalPaymentProjection, isLoading: false });
    paymentSignalTextQueryMock.mockReturnValue({ data: 'Payment Received CHK-1234\nTo: Big Buyer Co', isLoading: false });
    render(<ReceiptPanel kind="payment" paymentId={PAY_ID} />);
    expect(paymentExternalQueryMock).toHaveBeenCalled();
    expect(paymentExternalQueryMock.mock.calls[0][0]).toEqual({ paymentId: PAY_ID });
    expect(externalQueryMock.mock.calls[0][1]).toMatchObject({ enabled: false });
    expect(salesExternalQueryMock.mock.calls[0][1]).toMatchObject({ enabled: false });
    expect(vendorPaymentExternalQueryMock.mock.calls[0][1]).toMatchObject({ enabled: false });
    expect(screen.getByText('Big Buyer Co')).toBeInTheDocument();
    expect(screen.getByText('CHK-1234')).toBeInTheDocument();
  });

  it('hides the Internal tab in payment mode for operator role', () => {
    meQueryMock.mockReturnValue({ data: { role: 'operator' } });
    setIdleAllOtherMocks();
    vendorPaymentExternalQueryMock.mockReturnValue({ data: undefined, isLoading: false });
    vendorPaymentInternalQueryMock.mockReturnValue({ data: undefined, isLoading: false });
    vendorPaymentSignalTextQueryMock.mockReturnValue({ data: undefined, isLoading: false });
    paymentExternalQueryMock.mockReturnValue({ data: externalPaymentProjection, isLoading: false });
    paymentInternalQueryMock.mockReturnValue({ data: null, isLoading: false });
    paymentSignalTextQueryMock.mockReturnValue({ data: 'text', isLoading: false });
    render(<ReceiptPanel kind="payment" paymentId={PAY_ID} />);
    expect(screen.queryByTestId('receipt-tab-internal')).not.toBeInTheDocument();
  });

  it('shows internalNotes on the Internal tab for manager role', () => {
    setIdleAllOtherMocks();
    vendorPaymentExternalQueryMock.mockReturnValue({ data: undefined, isLoading: false });
    vendorPaymentInternalQueryMock.mockReturnValue({ data: undefined, isLoading: false });
    vendorPaymentSignalTextQueryMock.mockReturnValue({ data: undefined, isLoading: false });
    paymentExternalQueryMock.mockReturnValue({ data: externalPaymentProjection, isLoading: false });
    paymentInternalQueryMock.mockReturnValue({ data: internalPaymentProjection, isLoading: false });
    paymentSignalTextQueryMock.mockReturnValue({ data: 'text', isLoading: false });
    render(<ReceiptPanel kind="payment" paymentId={PAY_ID} />);
    fireEvent.click(screen.getByTestId('receipt-tab-internal'));
    expect(screen.getByText(/partial allocation/i)).toBeInTheDocument();
    expect(screen.getByText(/INTERNAL.*DO NOT SEND/i)).toBeInTheDocument();
  });
});

describe('ReceiptPanel — vendor_payment mode', () => {
  it('routes to the vendor_payment tRPC procedures when kind="vendor_payment"', () => {
    setIdleAllOtherMocks();
    paymentExternalQueryMock.mockReturnValue({ data: undefined, isLoading: false });
    paymentInternalQueryMock.mockReturnValue({ data: undefined, isLoading: false });
    paymentSignalTextQueryMock.mockReturnValue({ data: undefined, isLoading: false });
    vendorPaymentExternalQueryMock.mockReturnValue({ data: externalVendorPayoutProjection, isLoading: false });
    vendorPaymentInternalQueryMock.mockReturnValue({ data: internalVendorPayoutProjection, isLoading: false });
    vendorPaymentSignalTextQueryMock.mockReturnValue({ data: 'Vendor Payout WIRE-7788\nTo: Acme Farms', isLoading: false });
    render(<ReceiptPanel kind="vendor_payment" vendorPaymentId={VP_ID} />);
    expect(vendorPaymentExternalQueryMock).toHaveBeenCalled();
    expect(vendorPaymentExternalQueryMock.mock.calls[0][0]).toEqual({ vendorPaymentId: VP_ID });
    expect(externalQueryMock.mock.calls[0][1]).toMatchObject({ enabled: false });
    expect(salesExternalQueryMock.mock.calls[0][1]).toMatchObject({ enabled: false });
    expect(paymentExternalQueryMock.mock.calls[0][1]).toMatchObject({ enabled: false });
    expect(screen.getByText('Acme Farms')).toBeInTheDocument();
    expect(screen.getByText('WIRE-7788')).toBeInTheDocument();
  });

  it('copies the vendor_payment signal text when Copy is clicked', () => {
    setIdleAllOtherMocks();
    paymentExternalQueryMock.mockReturnValue({ data: undefined, isLoading: false });
    paymentInternalQueryMock.mockReturnValue({ data: undefined, isLoading: false });
    paymentSignalTextQueryMock.mockReturnValue({ data: undefined, isLoading: false });
    vendorPaymentExternalQueryMock.mockReturnValue({ data: externalVendorPayoutProjection, isLoading: false });
    vendorPaymentInternalQueryMock.mockReturnValue({ data: internalVendorPayoutProjection, isLoading: false });
    vendorPaymentSignalTextQueryMock.mockReturnValue({ data: 'Vendor Payout WIRE-7788\nTo: Acme Farms', isLoading: false });
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    render(<ReceiptPanel kind="vendor_payment" vendorPaymentId={VP_ID} />);
    fireEvent.click(screen.getByTestId('receipt-copy-signal'));
    expect(writeText).toHaveBeenCalledWith('Vendor Payout WIRE-7788\nTo: Acme Farms');
  });

  it('still passes existing PO tests with purchaseOrderId prop', () => {
    paymentExternalQueryMock.mockReturnValue({ data: undefined, isLoading: false });
    paymentInternalQueryMock.mockReturnValue({ data: undefined, isLoading: false });
    paymentSignalTextQueryMock.mockReturnValue({ data: undefined, isLoading: false });
    vendorPaymentExternalQueryMock.mockReturnValue({ data: undefined, isLoading: false });
    vendorPaymentInternalQueryMock.mockReturnValue({ data: undefined, isLoading: false });
    vendorPaymentSignalTextQueryMock.mockReturnValue({ data: undefined, isLoading: false });
    salesExternalQueryMock.mockReturnValue({ data: undefined, isLoading: false });
    salesInternalQueryMock.mockReturnValue({ data: undefined, isLoading: false });
    salesSignalTextQueryMock.mockReturnValue({ data: undefined, isLoading: false });
    externalQueryMock.mockReturnValue({ data: externalPaymentProjection, isLoading: false });
    internalQueryMock.mockReturnValue({ data: internalPaymentProjection, isLoading: false });
    signalTextQueryMock.mockReturnValue({ data: 'text', isLoading: false });
    render(<ReceiptPanel purchaseOrderId="po-1" />);
    expect(externalQueryMock.mock.calls[0][0]).toEqual({ purchaseOrderId: 'po-1' });
    expect(paymentExternalQueryMock.mock.calls[0][1]).toMatchObject({ enabled: false });
    expect(vendorPaymentExternalQueryMock.mock.calls[0][1]).toMatchObject({ enabled: false });
  });
});
