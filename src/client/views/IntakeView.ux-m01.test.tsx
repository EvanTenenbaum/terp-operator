// @vitest-environment jsdom
/**
 * UX-M01 — IntakeView: posted intake batches get a row-level
 * "History / Reverse receipt" affordance that deep-links Recovery
 * prefiltered to the batch's commands.
 *
 * Verifies:
 *  - The button is present for posted batches.
 *  - Clicking the button sets the recovery grid filter to the batch UUID
 *    and navigates to /recovery.
 *  - The button is absent for non-posted batches (draft, ready, needs_fix).
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

vi.mock('../store/uiStore', () => ({
  useUiStore: (selector: (s: Record<string, unknown>) => unknown) => {
    const store: Record<string, unknown> = {
      pushToast: vi.fn(),
      setSelectedRows: mockSetSelectedRows,
      setDrawerEntity: mockSetDrawerEntity,
      setGridFilter: mockSetGridFilter,
    };
    return selector(store);
  },
}));

// --- trpc mock ---
const mockIntakeQueue = vi.fn().mockReturnValue({
  data: [{
    id: 'po-uuid-001',
    poNo: 'PO-001',
    vendor: 'Test Vendor',
    status: 'approved',
    expectedTotalQty: '10',
    receivedTotalQty: '10',
    expectedTotal: '100',
    total: '100',
    batches: [
      {
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
      },
      {
        id: 'batch-draft-002',
        batchCode: 'B-002',
        name: 'Draft Item',
        status: 'draft',
        intakeQty: '5',
        expectedQty: '5',
        discrepancyReason: null,
        notes: null,
        itemId: 'item-002',
        itemAlias: null,
      },
    ],
  }],
  isLoading: false,
  isError: false,
  refetch: vi.fn(),
});

vi.mock('../api/trpc', () => ({
  trpc: {
    auth: { me: { useQuery: () => ({ data: { role: 'operator', name: 'Test' } }) } },
    queries: {
      intakeQueue: { useQuery: (_: unknown, _opts: unknown) => mockIntakeQueue() },
    },
    useUtils: () => ({ queries: { intakeQueue: { invalidate: vi.fn() } } }),
  },
}));

// --- useCommandRunner mock ---
vi.mock('../components/useCommandRunner', () => ({
  useCommandRunner: () => ({ runCommand: vi.fn().mockResolvedValue({ ok: true }), isRunning: false }),
}));

// --- useConfirm mock ---
vi.mock('../hooks/useConfirm', () => ({
  useConfirm: () => vi.fn().mockResolvedValue(true),
}));

// --- WorkspacePanel stub ---
vi.mock('../components/WorkspacePanel', () => ({
  WorkspacePanel: ({ children }: { children: React.ReactNode }) => <div data-testid="workspace-panel">{children}</div>,
}));

// --- ReceiptPreviewDrawer stub ---
vi.mock('../components/ReceiptPreviewDrawer', () => ({
  ReceiptPreviewDrawer: () => null,
}));

// --- VerifyAllPreviewBody stub ---
vi.mock('../components/VerifyAllPreviewBody', () => ({
  VerifyAllPreviewBody: () => null,
}));

// --- AgGridReact stub — renders batch rows as flat cells for testing ---
vi.mock('ag-grid-react', () => ({
  AgGridReact: ({ rowData, detailCellRendererParams, getRowId }: {
    rowData: Array<{ id: string; batches?: Array<Record<string, unknown>> }>;
    detailCellRendererParams?: {
      detailGridOptions?: { columnDefs?: Array<{ headerName?: string; cellRenderer?: (params: Record<string, unknown>) => React.ReactNode }> };
      getDetailRowData?: (params: { data: unknown; successCallback: (rows: unknown[]) => void }) => void;
    };
    getRowId?: (params: { data: { id: string } }) => string;
  }) => (
    <div data-testid="ag-grid">
      {rowData?.map((row) =>
        row.batches?.map((batch) => {
          // Find the Actions column and render its cellRenderer for each batch
          const actionCol = detailCellRendererParams?.detailGridOptions?.columnDefs?.find(
            (col) => col.headerName === 'Actions'
          );
          const rendered = actionCol?.cellRenderer?.({ data: batch, context: { busy: false, isRunning: false } });
          return (
            <div key={String(batch.id)} data-testid={`batch-row-${String(batch.id)}`}>
              {rendered}
            </div>
          );
        })
      )}
    </div>
  ),
}));

import { IntakeView } from './IntakeView';

beforeEach(() => {
  mockNavigate.mockReset();
  mockSetGridFilter.mockReset();
  vi.clearAllMocks();
});

describe('UX-M01 — IntakeView: posted batch "History / Reverse receipt" affordance', () => {
  it('renders "History / Reverse receipt" button for a posted batch', () => {
    render(<IntakeView />);
    const btn = screen.queryByTestId('batch-history-link');
    expect(btn).not.toBeNull();
    expect(btn?.textContent).toMatch(/History.*Reverse receipt/i);
  });

  it('does NOT render "History / Reverse receipt" for a non-posted (draft) batch', () => {
    render(<IntakeView />);
    // draft batch B-002 should not have the history button
    const batchRow = screen.queryByTestId('batch-row-batch-draft-002');
    const btn = batchRow?.querySelector('[data-testid="batch-history-link"]');
    expect(btn).toBeNull();
  });

  it('clicking the button calls setGridFilter("recovery", batchId) then navigates to /recovery', () => {
    render(<IntakeView />);
    const btn = screen.getByTestId('batch-history-link');
    fireEvent.click(btn);
    expect(mockSetGridFilter).toHaveBeenCalledWith('recovery', 'batch-posted-001');
    expect(mockNavigate).toHaveBeenCalledWith('/recovery');
  });
});
