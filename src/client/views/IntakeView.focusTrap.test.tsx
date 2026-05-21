// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Track every call to useFocusTrap so we can assert the inline confirm
// panels in IntakeView wire it up correctly. Each call corresponds to one
// panel mount — when the CSV import panel or the "Verify all" confirm panel
// opens, useFocusTrap should be called with (true, <cancel handler>).
//
// Use separate refs for each call site so double-wiring bugs are visible:
// call index 0 = csvImportFocusRef, call index 1 = confirmVerifyAllFocusRef.
const csvFocusRef = { current: null };
const confirmFocusRef = { current: null };
let focusTrapCallCount = 0;
const useFocusTrapMock = vi.fn(
  (_isOpen: boolean, _onClose?: () => void) => {
    // Return a distinct ref per call site within each render cycle
    const idx = focusTrapCallCount % 2;
    focusTrapCallCount++;
    return idx === 0 ? csvFocusRef : confirmFocusRef;
  }
);
vi.mock('../hooks/useFocusTrap', () => ({
  useFocusTrap: (isOpen: boolean, onClose?: () => void) =>
    useFocusTrapMock(isOpen, onClose)
}));

const runCommand = vi.fn().mockResolvedValue({ ok: true, toast: 'done' });
vi.mock('../components/useCommandRunner', () => ({
  useCommandRunner: () => ({ runCommand, isRunning: false }),
  // Some IntakeView imports may need this — keep it harmless.
  invalidateAffectedQueries: vi.fn()
}));

// AgGrid does heavy work in jsdom; replace with a stub that renders the
// action-column cell renderer for each row so we can click "Verify all"
// and exercise the confirmVerifyAllFor panel.
vi.mock('ag-grid-react', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  AgGridReact: ({ rowData, columnDefs }: { rowData?: any[]; columnDefs?: any[] }) => {
    const actionsCol = columnDefs?.find((c: any) => c.headerName === 'Actions');
    return (
      <div data-testid="ag-grid-stub">
        {rowData?.map((row: any, i: number) => (
          <div key={i}>
            {actionsCol?.cellRenderer?.({ data: row, node: null, value: null })}
          </div>
        ))}
      </div>
    );
  }
}));

// Stub the trpc surface IntakeView consumes. We only need shapes; behaviour
// of the queries isn't exercised here.
const intakeQueueData = [
  {
    id: 'po-1',
    poNo: 'PO-1001',
    vendor: 'Vendor One',
    vendorId: 'v-1',
    status: 'approved',
    expectedDate: null,
    orderedAt: null,
    receivedAt: null,
    total: '0',
    expectedTotal: '0',
    expectedTotalQty: '0',
    receivedTotalQty: '0',
    internalNotes: null,
    buyerNotes: null,
    createdAt: '2024-01-01T00:00:00Z',
    batches: [
      {
        id: 'b-1',
        purchaseOrderId: 'po-1',
        purchaseOrderLineId: null,
        batchCode: 'B-1',
        name: 'Batch 1',
        category: 'flower',
        intakeQty: '1',
        availableQty: '1',
        unitCost: '1',
        unitPrice: '1',
        uom: 'g',
        status: 'draft',
        notes: null,
        validationIssues: [],
        mediaStatus: 'none',
        arrivalStatus: 'pending',
        vendorId: 'v-1',
        tags: [],
        location: '',
        lotCode: null,
        expectedQty: '1',
        expectedUnitCost: '1',
        createdAt: '2024-01-01T00:00:00Z'
      }
    ]
  }
];

vi.mock('../api/trpc', () => ({
  trpc: {
    auth: {
      me: { useQuery: () => ({ data: { id: 'u-1', name: 'op', role: 'operator' } }) }
    },
    queries: {
      intakeQueue: {
        useQuery: () => ({
          data: intakeQueueData,
          isLoading: false,
          isError: false
        })
      },
      receiptPreview: {
        useQuery: () => ({ data: undefined, isLoading: false, isError: false })
      }
    }
  }
}));

import { IntakeView } from './IntakeView';

describe('IntakeView inline confirm panels — focus trap (#21 slice 3 / UX-A9)', () => {
  beforeEach(() => {
    useFocusTrapMock.mockClear();
    runCommand.mockClear();
    focusTrapCallCount = 0;
  });

  it('does NOT activate a focus trap when no inline confirm panel is open', () => {
    render(<IntakeView />);
    // The mock returns the same ref each invocation; only inline-panel mounts
    // should trigger it. With both panels closed, none of the calls should be
    // for an *open* panel (first arg true).
    const openCalls = useFocusTrapMock.mock.calls.filter(([open]) => open === true);
    expect(openCalls).toHaveLength(0);
  });

  it('activates a focus trap when the CSV import panel is opened', async () => {
    const user = userEvent.setup();
    render(<IntakeView />);

    await user.click(screen.getByRole('button', { name: /csv import/i }));

    // Now the CSV panel is mounted — useFocusTrap should have been called with
    // open === true and a cancel/close function so Escape collapses the panel.
    const openCalls = useFocusTrapMock.mock.calls.filter(([open]) => open === true);
    expect(openCalls.length).toBeGreaterThanOrEqual(1);
    const firstOpenCall = openCalls[0]!;
    expect(typeof firstOpenCall[1]).toBe('function');
  });

  it('activates a focus trap when the confirmVerifyAll panel is opened', async () => {
    // The AG Grid mock renders the Actions cell renderer for each row, which
    // includes the "Verify all" button. Clicking it sets confirmVerifyAllFor
    // (call site #2 of useFocusTrap) to open=true.
    const user = userEvent.setup();
    render(<IntakeView />);

    // "Verify all" button is rendered by the stub grid for the fixture PO row.
    const verifyAllBtn = screen.getByRole('button', { name: /verify all/i });
    await user.click(verifyAllBtn);

    // After the state update the confirm panel is mounted. useFocusTrap call
    // site #2 (confirmVerifyAllFocusRef) should now have been called with
    // open === true and a cancel handler (so Escape dismisses the panel).
    const openCalls = useFocusTrapMock.mock.calls.filter(([open]) => open === true);
    expect(openCalls.length).toBeGreaterThanOrEqual(1);
    // The open call should carry a close callback so Escape works
    const openCall = openCalls[0]!;
    expect(typeof openCall[1]).toBe('function');

    // Confirm the actual panel UI is visible
    expect(screen.getByText(/verify all intake for PO-1001/i)).toBeInTheDocument();
  });
});
