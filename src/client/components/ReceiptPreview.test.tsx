// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReceiptPreview } from './ReceiptPreview';

type RoleOverride = 'owner' | 'manager' | 'operator' | 'viewer';
let currentRole: RoleOverride = 'operator';
let currentMode: 'external' | 'internal' = 'external';

const recordedInputs: Array<{ mode: 'external' | 'internal'; includeDrafts?: boolean; subjectId: string }> = [];

vi.mock('../api/trpc', () => ({
  trpc: {
    auth: {
      me: { useQuery: () => ({ data: { id: 'u-1', role: currentRole, name: 'Op' }, isSuccess: true, isLoading: false }) }
    },
    documentSnapshots: {
      getReceiptText: {
        useQuery: (input: { mode: 'external' | 'internal'; subjectId: string; includeDrafts?: boolean }) => {
          recordedInputs.push({ mode: input.mode, includeDrafts: input.includeDrafts, subjectId: input.subjectId });
          const text = input.mode === 'internal'
            ? 'INTERNAL — DO NOT SEND\nPurchase Order PO-2026-001 for Acme Farms.\nInternal notes: margin target 30%.\nResale/markup: $1800.00'
            : 'Purchase Order PO-2026-001 for Acme Farms.\nLines:\n1. Mendo Breath — Flower, 1 lb at Vendor unit price $1200.00.';
          return { data: { text, version: 1, projectionVersion: 1 }, isLoading: false, error: null };
        }
      }
    }
  }
}));

vi.mock('../store/uiStore', () => ({
  useUiStore: (selector: any) => selector({ pushToast: vi.fn() })
}));

function ReceiptPreviewWrapper(props: {
  subjectId?: string;
  initialMode?: 'external' | 'internal';
  roleOverride?: RoleOverride;
  onClose?: () => void;
}) {
  currentRole = props.roleOverride ?? 'operator';
  currentMode = props.initialMode ?? 'external';
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <ReceiptPreview
        documentType="purchase_order"
        subjectId={props.subjectId ?? '11111111-1111-4111-8111-111111111111'}
        initialMode={currentMode}
        onClose={props.onClose ?? (() => {})}
      />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
  recordedInputs.length = 0;
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('ReceiptPreview', () => {
  it('renders the external plain text by default and hides internal watermark (hidden class)', async () => {
    render(<ReceiptPreviewWrapper initialMode="external" />);
    await waitFor(() => expect(screen.getByTestId('receipt-preview-body')).toHaveTextContent(/Purchase Order/));
    // Watermark is always in DOM; hidden class conceals it in external mode
    const watermark = screen.getByTestId('internal-watermark');
    expect(watermark).toBeInTheDocument();
    expect(watermark).toHaveClass('hidden');
  });
  it('switching to Internal shows the INTERNAL — DO NOT SEND banner (removes hidden class)', async () => {
    render(<ReceiptPreviewWrapper initialMode="external" />);
    await waitFor(() => expect(screen.getByTestId('receipt-preview-body')).toBeInTheDocument());
    // In external mode watermark is hidden
    expect(screen.getByTestId('internal-watermark')).toHaveClass('hidden');
    fireEvent.click(screen.getByRole('button', { name: /Internal/i }));
    // After switching, hidden class is removed and selection-pill danger is applied
    await waitFor(() => expect(screen.getByTestId('internal-watermark')).not.toHaveClass('hidden'));
    expect(screen.getByTestId('internal-watermark')).toHaveClass('selection-pill');
  });
  it('disables the Internal toggle for viewer role', async () => {
    render(<ReceiptPreviewWrapper roleOverride="viewer" />);
    await waitFor(() => expect(screen.getByRole('button', { name: /Internal/i })).toBeDisabled());
  });
  it('Copy button writes displayed text to clipboard', async () => {
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);
    render(<ReceiptPreviewWrapper initialMode="external" />);
    await waitFor(() => expect(screen.getByTestId('receipt-preview-body')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Copy/i }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(expect.stringContaining('Purchase Order')));
    writeText.mockRestore();
  });
  it('Copy in internal mode includes the watermark line in the copied text', async () => {
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);
    render(<ReceiptPreviewWrapper initialMode="internal" />);
    await waitFor(() => expect(screen.getByTestId('receipt-preview-body')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Copy/i }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(expect.stringMatching(/^INTERNAL — DO NOT SEND/)));
    writeText.mockRestore();
  });
  it('Print button calls window.print after setting body class (internal mode keeps watermark present)', async () => {
    const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {});
    render(<ReceiptPreviewWrapper initialMode="internal" />);
    await waitFor(() => expect(screen.getByTestId('receipt-preview-body')).toBeInTheDocument());
    // In internal mode watermark is in DOM without hidden class
    expect(screen.getByTestId('internal-watermark')).not.toHaveClass('hidden');
    fireEvent.click(screen.getByRole('button', { name: /Print/i }));
    expect(document.body.classList.contains('print-receipt-only')).toBe(true);
    expect(printSpy).toHaveBeenCalledTimes(1);
    printSpy.mockRestore();
  });
  it('Close button calls onClose', async () => {
    const onClose = vi.fn();
    render(<ReceiptPreviewWrapper onClose={onClose} />);
    await waitFor(() => expect(screen.getByTestId('receipt-preview-body')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Close/i }));
    expect(onClose).toHaveBeenCalled();
  });
  it('renders the overlay as a DIRECT child of document.body (React portal — required for print stylesheet)', async () => {
    render(
      <ReceiptPreviewWrapper roleOverride="operator" initialMode="external" />,
      { container: document.body.appendChild(document.createElement('div')) }
    );
    await waitFor(() => expect(screen.getByTestId('receipt-preview-overlay')).toBeInTheDocument());
    const overlay = screen.getByTestId('receipt-preview-overlay');
    expect(overlay.parentElement).toBe(document.body);
  });
  it('operator role passes includeDrafts=true to getReceiptText (so active drafts are previewable)', async () => {
    render(<ReceiptPreviewWrapper roleOverride="operator" initialMode="external" />);
    await waitFor(() => expect(recordedInputs.length).toBeGreaterThan(0));
    const last = recordedInputs[recordedInputs.length - 1];
    expect(last.includeDrafts).toBe(true);
  });
  it('viewer role does NOT pass includeDrafts to getReceiptText (viewer never sees drafts)', async () => {
    render(<ReceiptPreviewWrapper roleOverride="viewer" initialMode="external" />);
    await waitFor(() => expect(recordedInputs.length).toBeGreaterThan(0));
    const last = recordedInputs[recordedInputs.length - 1];
    expect(last.includeDrafts).toBeUndefined();
  });
});
