// @vitest-environment jsdom
/**
 * Wave-7 IntakeView tests covering:
 *  UX-H03 — selection totals strip (count, qty sum, cost sum, Preview receipt)
 *  UX-H05 — arrivalStatus column is editable (agSelectCellEditor)
 *  UX-S03 — warning glyphs present on tinted cells (qty mismatch, reason required)
 *  UX-C09 — keystroke labels shown next to action shortcuts in the totals strip
 *  UX-C02 — TSV clipboard paste produces summary toast
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type React from 'react';

// --- react-router-dom mock ---
const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useLocation: () => ({ pathname: '/intake' }),
}));

// --- uiStore mock ---
const mockSetGridFilter = vi.fn();
const mockSetSelectedRows = vi.fn();
const mockSetDrawerEntity = vi.fn();
const mockPushToast = vi.fn();

vi.mock('../store/uiStore', () => ({
  useUiStore: (selector: (s: Record<string, unknown>) => unknown) => {
    const store: Record<string, unknown> = {
      pushToast: mockPushToast,
      setSelectedRows: mockSetSelectedRows,
      setDrawerEntity: mockSetDrawerEntity,
      setGridFilter: mockSetGridFilter,
    };
    return selector(store);
  },
}));

// --- trpc mock ---
const mockBatchPosted = {
  id: 'batch-posted-001',
  batchCode: 'B-001',
  name: 'Test Item',
  status: 'posted',
  intakeQty: '10',
  expectedQty: '10',
  discrepancyReason: null,
  notes: null,
  itemId: 'item-001',
  itemAlias: null,
  unitCost: '5',
  arrivalStatus: 'pending',
  mediaStatus: 'none',
};

const mockBatchMismatch = {
  id: 'batch-mismatch-002',
  batchCode: 'B-002',
  name: 'Mismatch Item',
  status: 'draft',
  intakeQty: '8',
  expectedQty: '10',
  discrepancyReason: '',
  notes: null,
  itemId: 'item-002',
  itemAlias: null,
  unitCost: '3',
  arrivalStatus: 'arrived',
  mediaStatus: 'none',
};

const mockOrderRow = {
  id: 'po-uuid-001',
  poNo: 'PO-001',
  vendor: 'Test Vendor',
  vendorId: 'vendor-001',
  status: 'approved',
  expectedTotalQty: '18',
  receivedTotalQty: '18',
  expectedTotal: '140',
  total: '140',
  batches: [mockBatchPosted, mockBatchMismatch],
};

vi.mock('../api/trpc', () => ({
  trpc: {
    auth: { me: { useQuery: () => ({ data: { role: 'operator', name: 'Test' } }) } },
    queries: {
      intakeQueue: { useQuery: () => ({
        data: [mockOrderRow],
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      }) },
    },
    useUtils: () => ({ queries: { intakeQueue: { invalidate: vi.fn() } } }),
  },
}));

vi.mock('../components/useCommandRunner', () => ({
  useCommandRunner: () => ({ runCommand: vi.fn().mockResolvedValue({ ok: true }), isRunning: false }),
}));

vi.mock('../hooks/useConfirm', () => ({
  useConfirm: () => vi.fn().mockResolvedValue(true),
}));

vi.mock('../components/WorkspacePanel', () => ({
  WorkspacePanel: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="workspace-panel">{children}</div>
  ),
}));

vi.mock('../components/ReceiptPreviewDrawer', () => ({
  ReceiptPreviewDrawer: ({ order, onClose }: { order: unknown; onClose: () => void }) =>
    order ? <div data-testid="receipt-preview-drawer"><button onClick={onClose}>Close</button></div> : null,
}));

vi.mock('../components/VerifyAllPreviewBody', () => ({
  VerifyAllPreviewBody: () => null,
}));

// AG Grid stub — renders batch rows as flat cells, exposes column defs for inspection
let capturedDetailColDefs: Array<{ field?: string; headerName?: string; editable?: boolean; cellEditor?: string; cellEditorParams?: unknown; cellRenderer?: (params: Record<string, unknown>) => React.ReactNode }> = [];

vi.mock('ag-grid-react', () => ({
  AgGridReact: ({
    rowData,
    detailCellRendererParams,
    onRowClicked,
  }: {
    rowData: Array<{ id: string; batches?: Array<Record<string, unknown>> }>;
    detailCellRendererParams?: {
      detailGridOptions?: {
        columnDefs?: Array<{
          field?: string;
          headerName?: string;
          editable?: boolean;
          cellEditor?: string;
          cellEditorParams?: unknown;
          cellRenderer?: (params: Record<string, unknown>) => React.ReactNode;
        }>;
      };
      getDetailRowData?: (params: { data: unknown; successCallback: (rows: unknown[]) => void }) => void;
    };
    onRowClicked?: (params: { data: unknown }) => void;
  }) => {
    // Capture column defs from detail grid for inspection
    capturedDetailColDefs = detailCellRendererParams?.detailGridOptions?.columnDefs ?? [];
    return (
      <div data-testid="ag-grid">
        {rowData?.map((row) => (
          <div
            key={String(row.id)}
            data-testid={`order-row-${String(row.id)}`}
            onClick={() => onRowClicked?.({ data: row })}
          >
            <button data-testid={`click-order-${String(row.id)}`} onClick={() => onRowClicked?.({ data: row })}>
              Select
            </button>
            {row.batches?.map((batch) => {
              const actionCol = capturedDetailColDefs.find((col) => col.headerName === 'Actions');
              const intakeQtyCol = capturedDetailColDefs.find((col) => col.field === 'intakeQty');
              const discrepancyCol = capturedDetailColDefs.find((col) => col.field === 'discrepancyReason');
              const rendered = actionCol?.cellRenderer?.({ data: batch, context: { busy: false, isRunning: false } });
              const intakeQtyRendered = intakeQtyCol?.cellRenderer?.({ data: batch, value: batch.intakeQty });
              const discrepancyRendered = discrepancyCol?.cellRenderer?.({ data: batch, value: batch.discrepancyReason });
              return (
                <div key={String(batch.id)} data-testid={`batch-row-${String(batch.id)}`}>
                  <div data-testid={`batch-actions-${String(batch.id)}`}>{rendered}</div>
                  <div data-testid={`batch-intakeqty-${String(batch.id)}`}>{intakeQtyRendered}</div>
                  <div data-testid={`batch-discrepancy-${String(batch.id)}`}>{discrepancyRendered}</div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    );
  },
}));

import { IntakeView } from './IntakeView';

beforeEach(() => {
  mockNavigate.mockReset();
  mockSetGridFilter.mockReset();
  mockPushToast.mockReset();
  capturedDetailColDefs = [];
  vi.clearAllMocks();
});

// ─── UX-H05: arrivalStatus column ──────────────────────────────────────────

describe('UX-H05 — arrivalStatus editable select cell', () => {
  it('arrivalStatus column is present in detail grid columns', () => {
    render(<IntakeView />);
    const arrivalCol = capturedDetailColDefs.find((col) => col.field === 'arrivalStatus');
    expect(arrivalCol).toBeDefined();
  });

  it('arrivalStatus column has editable=true', () => {
    render(<IntakeView />);
    const arrivalCol = capturedDetailColDefs.find((col) => col.field === 'arrivalStatus');
    expect(arrivalCol?.editable).toBe(true);
  });

  it('arrivalStatus column uses agSelectCellEditor', () => {
    render(<IntakeView />);
    const arrivalCol = capturedDetailColDefs.find((col) => col.field === 'arrivalStatus');
    expect(arrivalCol?.cellEditor).toBe('agSelectCellEditor');
  });

  it('arrivalStatus editor params include the three expected values', () => {
    render(<IntakeView />);
    const arrivalCol = capturedDetailColDefs.find((col) => col.field === 'arrivalStatus');
    const params = arrivalCol?.cellEditorParams as { values: string[] } | undefined;
    expect(params?.values).toContain('pending');
    expect(params?.values).toContain('arrived');
    expect(params?.values).toContain('canceled');
  });
});

// ─── UX-S03: warning glyphs ─────────────────────────────────────────────────

describe('UX-S03 — warning glyph in tinted cells', () => {
  it('renders a qty-warning icon for a mismatch batch in intakeQty cell', () => {
    render(<IntakeView />);
    const cell = screen.queryByTestId('batch-intakeqty-batch-mismatch-002');
    expect(cell).not.toBeNull();
    // The mismatch batch (expected=10, actual=8) should have the warning glyph
    const icon = cell?.querySelector('[data-testid="intake-qty-warning"]');
    expect(icon).not.toBeNull();
  });

  it('does NOT render qty-warning icon when expected matches actual', () => {
    render(<IntakeView />);
    // Posted batch has expected=10, intakeQty=10 — no mismatch
    const cell = screen.queryByTestId('batch-intakeqty-batch-posted-001');
    const icon = cell?.querySelector('[data-testid="intake-qty-warning"]');
    expect(icon).toBeNull();
  });

  it('renders a reason-warning icon when mismatch and no reason', () => {
    render(<IntakeView />);
    // Mismatch batch has discrepancyReason='' → warning should be shown
    const cell = screen.queryByTestId('batch-discrepancy-batch-mismatch-002');
    const icon = cell?.querySelector('[data-testid="intake-reason-warning"]');
    expect(icon).not.toBeNull();
  });

  it('warning icon has an aria-label for accessibility', () => {
    render(<IntakeView />);
    const cell = screen.queryByTestId('batch-discrepancy-batch-mismatch-002');
    const icon = cell?.querySelector('[data-testid="intake-reason-warning"]');
    expect(icon?.getAttribute('aria-label')).toMatch(/discrepancy reason required/i);
  });
});

// ─── UX-H03: selection totals strip ─────────────────────────────────────────

describe('UX-H03 — selection totals strip', () => {
  it('does NOT render the totals strip when no order is selected', () => {
    render(<IntakeView />);
    expect(screen.queryByTestId('intake-selection-totals')).toBeNull();
  });

  it('renders the totals strip after clicking a PO row', () => {
    render(<IntakeView />);
    fireEvent.click(screen.getByTestId('click-order-po-uuid-001'));
    const strip = screen.queryByTestId('intake-selection-totals');
    expect(strip).not.toBeNull();
  });

  it('totals strip shows batch count', () => {
    render(<IntakeView />);
    fireEvent.click(screen.getByTestId('click-order-po-uuid-001'));
    const strip = screen.getByTestId('intake-selection-totals');
    expect(strip.textContent).toMatch(/2 batches/i);
  });

  it('totals strip shows qty sum', () => {
    render(<IntakeView />);
    fireEvent.click(screen.getByTestId('click-order-po-uuid-001'));
    const strip = screen.getByTestId('intake-selection-totals');
    // intakeQty: 10 + 8 = 18
    expect(strip.textContent).toMatch(/18\.000/);
  });

  it('totals strip has a Preview receipt button', () => {
    render(<IntakeView />);
    fireEvent.click(screen.getByTestId('click-order-po-uuid-001'));
    const strip = screen.getByTestId('intake-selection-totals');
    const btn = strip.querySelector('button');
    expect(btn?.textContent).toMatch(/Preview receipt/i);
  });
});

// ─── UX-C09: keystroke labels ────────────────────────────────────────────────

describe('UX-C09 — keystroke labels in the totals strip', () => {
  it('shows Duplicate shortcut label after order selection', () => {
    render(<IntakeView />);
    fireEvent.click(screen.getByTestId('click-order-po-uuid-001'));
    const strip = screen.getByTestId('intake-selection-totals');
    // The combo comes from the registry; at minimum "Duplicate" label is present
    expect(strip.textContent).toMatch(/Duplicate/i);
  });

  it('shows Ready shortcut label after order selection', () => {
    render(<IntakeView />);
    fireEvent.click(screen.getByTestId('click-order-po-uuid-001'));
    const strip = screen.getByTestId('intake-selection-totals');
    expect(strip.textContent).toMatch(/Ready/i);
  });

  it('shows Process shortcut label after order selection', () => {
    render(<IntakeView />);
    fireEvent.click(screen.getByTestId('click-order-po-uuid-001'));
    const strip = screen.getByTestId('intake-selection-totals');
    expect(strip.textContent).toMatch(/Process/i);
  });
});

// ─── UX-C02: TSV clipboard paste summary toast ──────────────────────────────

describe('UX-C02 — TSV clipboard paste in IntakeView', () => {
  it('intercepts TSV paste (with tabs) and shows a summary toast', () => {
    const { container } = render(<IntakeView />);
    const wrapper = container.firstChild as HTMLElement;
    const tsvText = 'Flower A\t5\t\t\nFlower B\t10\t\t';
    fireEvent.paste(wrapper, {
      clipboardData: {
        getData: (type: string) => (type === 'text/plain' ? tsvText : ''),
      },
    });
    expect(mockPushToast).toHaveBeenCalledWith(
      expect.stringContaining('TSV paste'),
      'info'
    );
  });

  it('does NOT intercept paste when content has no tabs', () => {
    const { container } = render(<IntakeView />);
    const wrapper = container.firstChild as HTMLElement;
    fireEvent.paste(wrapper, {
      clipboardData: {
        getData: (type: string) => (type === 'text/plain' ? 'plain text no tabs' : ''),
      },
    });
    // No TSV to intercept — pushToast should not have been called from the paste handler
    const tsvCalls = mockPushToast.mock.calls.filter(
      (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('TSV paste')
    );
    expect(tsvCalls).toHaveLength(0);
  });
});
