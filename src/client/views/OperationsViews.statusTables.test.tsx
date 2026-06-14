// @vitest-environment jsdom
/**
 * Phase 1 StatusActionBar adoption — behavior tests for the spec §10 decision
 * tables added to VendorPayablesView (§10.6), ConnectorsView (§10.8),
 * RecoveryView (§10.9), PaymentsView (§10.5), and CloseoutView (§10.10).
 *
 * Per templates.md: view-level tests assert behavior (which command fires for
 * which row status), not template chrome. Status values asserted here are the
 * REAL schema/commandBus values, not the spec's names.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type React from 'react';
import type { GridRow } from '../../shared/types';

// --- react-router-dom mock ---
const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({
  useLocation: () => ({ pathname: '/x' }),
  useNavigate: () => mockNavigate,
  BrowserRouter: ({ children }: { children: React.ReactNode }) => children
}));

// --- trpc mock: proxy returns safe defaults for every query; per-test data via queryData ---
const queryData: Record<string, unknown> = {};
vi.mock('../api/trpc', () => {
  const makeQueries = () =>
    new Proxy(
      {},
      {
        get: (_target, name: string) => ({
          useQuery: () => ({
            data: queryData[name],
            isLoading: false,
            isError: false,
            refetch: vi.fn()
          })
        })
      }
    );
  return {
    trpc: {
      queries: makeQueries(),
      auth: { me: { useQuery: () => ({ data: { role: 'owner' } }) } }
    }
  };
});

// --- uiStore mock ---
// UX-H04: selectedRows is configurable per test so PurchaseOrdersView can
// render its selected-PO lines grid (defaults to {} — prior behavior).
let mockSelectedRows: Record<string, GridRow[]> = {};
const mockSetSelectedRows = vi.fn();
const mockSetGridFilter = vi.fn();
const mockSetActiveView = vi.fn();
const mockSetActiveSettingsTab = vi.fn();
const mockSetDrawerState = vi.fn();
const mockSetDrawerEntity = vi.fn();
const mockPushToast = vi.fn();
vi.mock('../store/uiStore', () => ({
  useUiStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      selectedRows: mockSelectedRows,
      setSelectedRows: mockSetSelectedRows,
      setDrawerState: mockSetDrawerState,
      setDrawerEntity: mockSetDrawerEntity,
      pushToast: mockPushToast,
      gridFilters: {},
      setGridFilter: mockSetGridFilter,
      collapsedPanels: {},
      focusedPanelId: null,
      togglePanelCollapsed: vi.fn(),
      setFocusedPanel: vi.fn(),
      setActiveView: mockSetActiveView,
      setActiveSettingsTab: mockSetActiveSettingsTab,
      pickQueueFilters: new Set<string>(),
      setPickQueueFilter: vi.fn(),
      clearPickQueueFilters: vi.fn(),
      activeQuickLaunch: null
    })
}));

// --- useCommandRunner mock ---
const mockRunCommand = vi.fn();
vi.mock('../components/useCommandRunner', () => ({
  useCommandRunner: () => ({ runCommand: mockRunCommand, isRunning: false })
}));

// --- OperatorGrid stub: renders selectionActions with controllable rows ---
// UX-H04 addition: grids with onSelectionChange expose a test-only
// "select all rows" button that selects the grid's own rows (used to select
// PO lines in the partial-receiving tests). Existing assertions unaffected.
let stubRows: GridRow[] = [];
vi.mock('../components/OperatorGrid', () => ({
  OperatorGrid: (props: {
    title?: string;
    rows?: GridRow[];
    actions?: React.ReactNode;
    selectionActions?: (rows: GridRow[]) => React.ReactNode;
    onSelectionChange?: (rows: GridRow[]) => void;
  }) => (
    <div data-testid={`grid-${props.title ?? 'untitled'}`}>
      {typeof props.actions === 'function' ? null : props.actions}
      {props.selectionActions ? props.selectionActions(stubRows) : null}
      {props.onSelectionChange ? (
        <button
          type="button"
          data-testid={`select-all-${props.title ?? 'untitled'}`}
          onClick={() => props.onSelectionChange?.(props.rows ?? [])}
        >
          select all {props.title ?? 'untitled'} rows
        </button>
      ) : null}
    </div>
  )
}));

// --- chrome stubs ---
vi.mock('../components/WorkspacePanel', () => ({
  WorkspacePanel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>
}));
vi.mock('../components/QuickLedgerGrid', () => ({ QuickLedgerGrid: () => null }));
vi.mock('../components/drawerTabs/CommandReversalTab', () => ({
  CommandReversalTab: () => <div data-testid="command-reversal-tab" />
}));
// UX-H04: ReceiptPanel mounts whenever a receivable PO is selected — stub it
// so the partial-receiving tests exercise only the decision table behavior.
vi.mock('../components/ReceiptPanel', () => ({ ReceiptPanel: () => null }));

import { VendorPayablesView, ConnectorsView, RecoveryView, PaymentsView, CloseoutView, PurchaseOrdersView } from './OperationsViews';
import {
  buildReceiveLineQuantities,
  poLineOutstandingQty,
  purchaseOrderLineColumnsFor
} from './PurchaseOrdersView';

beforeEach(() => {
  stubRows = [];
  mockSelectedRows = {};
  for (const key of Object.keys(queryData)) delete queryData[key];
  mockRunCommand.mockReset().mockResolvedValue({ ok: true });
  mockSetGridFilter.mockReset();
  mockSetActiveView.mockReset();
  mockNavigate.mockReset();
});

describe('VendorPayablesView §10.6 status table (real bill statuses)', () => {
  it('open bill → Approve primary fires approveVendorBill', () => {
    stubRows = [{ id: 'b1', status: 'open' } as unknown as GridRow];
    render(<VendorPayablesView />);
    fireEvent.click(screen.getByRole('button', { name: /^Approve$/ }));
    expect(mockRunCommand).toHaveBeenCalledWith('approveVendorBill', { vendorBillId: 'b1' }, expect.any(String));
  });

  it('scheduled bill → Pay primary records payment without re-scheduling', async () => {
    stubRows = [{ id: 'b2', status: 'scheduled' } as unknown as GridRow];
    render(<VendorPayablesView />);
    fireEvent.click(screen.getByRole('button', { name: /^Pay$/ }));
    await waitFor(() => expect(mockRunCommand).toHaveBeenCalledWith('recordVendorPayment', { vendorBillId: 'b2' }, expect.any(String)));
    expect(mockRunCommand).not.toHaveBeenCalledWith('scheduleVendorPayment', expect.anything(), expect.anything());
  });

  it('partial bill → Pay remaining schedules first, then records', async () => {
    stubRows = [{ id: 'b3', status: 'partial' } as unknown as GridRow];
    render(<VendorPayablesView />);
    fireEvent.click(screen.getByRole('button', { name: /^Pay remaining$/ }));
    await waitFor(() => expect(mockRunCommand).toHaveBeenCalledWith('recordVendorPayment', { vendorBillId: 'b3' }, expect.any(String)));
    const calls = mockRunCommand.mock.calls.map((call) => call[0]);
    expect(calls.indexOf('scheduleVendorPayment')).toBeGreaterThanOrEqual(0);
    expect(calls.indexOf('scheduleVendorPayment')).toBeLessThan(calls.indexOf('recordVendorPayment'));
  });

  it('paid bill → no primary and no tray', () => {
    stubRows = [{ id: 'b4', status: 'paid' } as unknown as GridRow];
    render(<VendorPayablesView />);
    expect(screen.queryByRole('button', { name: /^Approve$|^Schedule$|^Pay/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^More$/ })).toBeNull();
  });

  it('mixed selection → catch-all keeps every verb reachable from the tray', () => {
    stubRows = [{ id: 'b1', status: 'open' } as unknown as GridRow, { id: 'b4', status: 'paid' } as unknown as GridRow];
    render(<VendorPayablesView />);
    // No status-matched primary for a mixed selection…
    expect(screen.queryByRole('button', { name: /^Approve$/ })).toBeNull();
    // …but the catch-all rule exposes the full verb set in More.
    fireEvent.click(screen.getByRole('button', { name: /^More$/ }));
    expect(screen.getByRole('menuitem', { name: /^Approve$/ })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: /^Schedule$/ })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: /^Pay \(schedules first\)$/ })).toBeTruthy();
  });
});

describe('ConnectorsView §10.8 status table (open is the real initial status)', () => {
  it('open request → Route primary disabled-with-reason until a destination is entered', () => {
    stubRows = [{ id: 'r1', status: 'open' } as unknown as GridRow];
    render(<ConnectorsView />);
    const route = screen.getByRole('button', { name: /^Route$/ });
    expect(route.hasAttribute('disabled')).toBe(true);
    expect(route.getAttribute('title')).toMatch(/Route to/);
    fireEvent.change(screen.getByLabelText(/Route to/), { target: { value: 'warehouse-team' } });
    const enabledRoute = screen.getByRole('button', { name: /^Route$/ });
    expect(enabledRoute.hasAttribute('disabled')).toBe(false);
    fireEvent.click(enabledRoute);
    expect(mockRunCommand).toHaveBeenCalledWith(
      'routeConnectorRequest',
      expect.objectContaining({ requestId: 'r1', routedTo: 'warehouse-team' }),
      expect.any(String)
    );
  });

  it('open request → Approve and Reject live in the More tray', () => {
    stubRows = [{ id: 'r1', status: 'open' } as unknown as GridRow];
    render(<ConnectorsView />);
    fireEvent.click(screen.getByRole('button', { name: /^More$/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: /^Approve$/ }));
    expect(mockRunCommand).toHaveBeenCalledWith('approveConnectorRequest', expect.objectContaining({ requestId: 'r1' }), expect.any(String));
  });

  it('rejected request → no primary; Approve reachable from the tray', () => {
    stubRows = [{ id: 'r2', status: 'rejected' } as unknown as GridRow];
    render(<ConnectorsView />);
    expect(screen.queryByRole('button', { name: /^Approve$/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /^More$/ }));
    expect(screen.getByRole('menuitem', { name: /^Approve$/ })).toBeTruthy();
  });
});

describe('RecoveryView §10.9 status table (pending | ok | failed)', () => {
  it('failed command → Retry primary replays the stored command + payload', () => {
    stubRows = [
      { id: 'c1', status: 'failed', commandName: 'postSalesOrder', inputPayload: { orderId: 'o1' } } as unknown as GridRow
    ];
    render(<RecoveryView />);
    fireEvent.click(screen.getByRole('button', { name: /^Retry$/ }));
    expect(mockRunCommand).toHaveBeenCalledWith('postSalesOrder', { orderId: 'o1' }, expect.any(String));
  });

  it('ok command → no Retry surfaced (reversal flows through the confirm panel)', () => {
    stubRows = [{ id: 'c2', status: 'ok', commandName: 'postSalesOrder' } as unknown as GridRow];
    render(<RecoveryView />);
    expect(screen.queryByRole('button', { name: /^Retry$/ })).toBeNull();
  });
});

describe('PaymentsView §10.5 predicate table (applied-ness derived from unappliedAmount)', () => {
  it('fully unapplied payment → Auto-apply oldest primary fires allocatePayment', () => {
    stubRows = [{ id: 'p1', status: 'posted', amount: 100, unappliedAmount: 100 } as unknown as GridRow];
    render(<PaymentsView />);
    fireEvent.click(screen.getByRole('button', { name: /^Auto-apply oldest$/ }));
    expect(mockRunCommand).toHaveBeenCalledWith('allocatePayment', { paymentId: 'p1' }, expect.any(String));
  });

  it('partially applied payment → Allocate remaining primary', () => {
    stubRows = [{ id: 'p2', status: 'posted', amount: 100, unappliedAmount: 40 } as unknown as GridRow];
    render(<PaymentsView />);
    fireEvent.click(screen.getByRole('button', { name: /^Allocate remaining$/ }));
    expect(mockRunCommand).toHaveBeenCalledWith('allocatePayment', { paymentId: 'p2' }, expect.any(String));
  });

  it('fully applied payment → no allocation primary', () => {
    stubRows = [{ id: 'p3', status: 'posted', amount: 100, unappliedAmount: 0 } as unknown as GridRow];
    render(<PaymentsView />);
    expect(screen.queryByRole('button', { name: /Auto-apply|Allocate/ })).toBeNull();
  });

  it('reversed payment → no allocation primary', () => {
    stubRows = [{ id: 'p4', status: 'reversed', amount: 100, unappliedAmount: 100 } as unknown as GridRow];
    render(<PaymentsView />);
    expect(screen.queryByRole('button', { name: /Auto-apply|Allocate/ })).toBeNull();
  });
});

describe('CloseoutView §10.10 period status table', () => {
  it('open period with open work → amber Fix unsafe rows (N) primary routes to the first blocker', () => {
    queryData.closeoutPreview = {
      locked: false,
      openWorkCount: 3,
      blockers: [{ id: 'unsafeBatches', label: 'Unsafe batches', count: 3 }],
      controlTotals: {},
      eligible: false
    };
    render(<CloseoutView />);
    fireEvent.click(screen.getByRole('button', { name: /^Fix unsafe rows \(3\)$/ }));
    expect(mockSetActiveView).toHaveBeenCalledWith('intake');
    expect(mockSetGridFilter).toHaveBeenCalledWith('intake', 'status:draft,needs_fix');
    expect(mockRunCommand).not.toHaveBeenCalledWith('lockPeriod', expect.anything(), expect.anything());
  });

  it('open period, no open work → Lock period primary fires lockPeriod', () => {
    queryData.closeoutPreview = { locked: false, openWorkCount: 0, blockers: [], controlTotals: {}, eligible: true };
    render(<CloseoutView />);
    fireEvent.click(screen.getByRole('button', { name: /^Lock period$/ }));
    expect(mockRunCommand).toHaveBeenCalledWith('lockPeriod', expect.objectContaining({ period: expect.any(String) }), expect.any(String));
  });

  it('locked period, no open work → Archive primary fires archivePeriod with verified flag', () => {
    queryData.closeoutPreview = { locked: true, openWorkCount: 0, blockers: [], controlTotals: {}, eligible: true };
    render(<CloseoutView />);
    fireEvent.click(screen.getByRole('button', { name: /^Archive$/ }));
    expect(mockRunCommand).toHaveBeenCalledWith('archivePeriod', expect.objectContaining({ verified: true }), expect.any(String));
  });

  it('locked period with open work → Lock and Archive stay reachable (disabled) in the tray', () => {
    queryData.closeoutPreview = {
      locked: true,
      openWorkCount: 2,
      blockers: [{ id: 'openFulfillment', label: 'Open fulfillment', count: 2 }],
      controlTotals: {},
      eligible: false
    };
    render(<CloseoutView />);
    expect(screen.getByRole('button', { name: /^Fix unsafe rows \(2\)$/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^More$/ }));
    const archiveItem = screen.getByRole('menuitem', { name: /^Archive$/ });
    expect(archiveItem.hasAttribute('disabled')).toBe(true);
  });
});

describe('PurchaseOrdersView UX-H01 status table (real PO statuses: draft → finalized → approved → ordered → partially_received → received, + cancelled)', () => {
  it('draft PO → Finalize PO primary fires finalizePurchaseOrder; Cancel PO in tray', () => {
    stubRows = [{ id: 'po1', status: 'draft' } as unknown as GridRow];
    render(<PurchaseOrdersView />);
    fireEvent.click(screen.getByRole('button', { name: /^Finalize PO$/ }));
    expect(mockRunCommand).toHaveBeenCalledWith('finalizePurchaseOrder', { purchaseOrderId: 'po1' }, expect.any(String));
    fireEvent.click(screen.getByRole('button', { name: /^More$/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: /^Cancel PO$/ }));
    expect(mockRunCommand).toHaveBeenCalledWith('cancelPurchaseOrder', { purchaseOrderId: 'po1' }, expect.any(String));
  });

  it('finalized PO → Approve PO primary; Unfinalize reachable from the tray', () => {
    stubRows = [{ id: 'po2', status: 'finalized' } as unknown as GridRow];
    render(<PurchaseOrdersView />);
    fireEvent.click(screen.getByRole('button', { name: /^Approve PO$/ }));
    expect(mockRunCommand).toHaveBeenCalledWith('approvePurchaseOrder', { purchaseOrderId: 'po2' }, expect.any(String));
    fireEvent.click(screen.getByRole('button', { name: /^More$/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: /^Unfinalize$/ }));
    expect(mockRunCommand).toHaveBeenCalledWith('unfinalizePurchaseOrder', { purchaseOrderId: 'po2' }, expect.any(String));
  });

  it('approved PO → Receive PO primary fires receivePurchaseOrder', () => {
    stubRows = [{ id: 'po3', status: 'approved' } as unknown as GridRow];
    render(<PurchaseOrdersView />);
    fireEvent.click(screen.getByRole('button', { name: /^Receive PO$/ }));
    expect(mockRunCommand).toHaveBeenCalledWith('receivePurchaseOrder', { purchaseOrderId: 'po3' }, expect.any(String));
  });

  it('approved PO with a prepayment amount → Record prepayment enabled in the tray', () => {
    stubRows = [{ id: 'po3', status: 'approved', prepaymentAmount: 500 } as unknown as GridRow];
    render(<PurchaseOrdersView />);
    fireEvent.click(screen.getByRole('button', { name: /^More$/ }));
    const prepay = screen.getByRole('menuitem', { name: /^Record prepayment$/ });
    expect(prepay.hasAttribute('disabled')).toBe(false);
  });

  it('approved PO without a prepayment amount → Record prepayment disabled with reason', () => {
    stubRows = [{ id: 'po3', status: 'approved', prepaymentAmount: 0 } as unknown as GridRow];
    render(<PurchaseOrdersView />);
    fireEvent.click(screen.getByRole('button', { name: /^More$/ }));
    const prepay = screen.getByRole('menuitem', { name: /^Record prepayment$/ });
    expect(prepay.hasAttribute('disabled')).toBe(true);
    expect(prepay.getAttribute('title')).toMatch(/no prepayment amount/);
  });

  it('ordered PO → Receive PO primary', () => {
    stubRows = [{ id: 'po4', status: 'ordered' } as unknown as GridRow];
    render(<PurchaseOrdersView />);
    fireEvent.click(screen.getByRole('button', { name: /^Receive PO$/ }));
    expect(mockRunCommand).toHaveBeenCalledWith('receivePurchaseOrder', { purchaseOrderId: 'po4' }, expect.any(String));
  });

  it('partially_received PO → Receive PO primary', () => {
    stubRows = [{ id: 'po5', status: 'partially_received' } as unknown as GridRow];
    render(<PurchaseOrdersView />);
    fireEvent.click(screen.getByRole('button', { name: /^Receive PO$/ }));
    expect(mockRunCommand).toHaveBeenCalledWith('receivePurchaseOrder', { purchaseOrderId: 'po5' }, expect.any(String));
  });

  it('received PO → no primary and no tray (terminal)', () => {
    stubRows = [{ id: 'po6', status: 'received' } as unknown as GridRow];
    render(<PurchaseOrdersView />);
    expect(screen.queryByRole('button', { name: /^Finalize PO$|^Approve PO$|^Receive PO$|^Cancel PO$/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^More$/ })).toBeNull();
  });

  it('cancelled PO → no primary and no tray (terminal)', () => {
    stubRows = [{ id: 'po7', status: 'cancelled' } as unknown as GridRow];
    render(<PurchaseOrdersView />);
    expect(screen.queryByRole('button', { name: /^Finalize PO$|^Approve PO$|^Receive PO$|^Cancel PO$/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^More$/ })).toBeNull();
  });

  it('mixed selection → catch-all keeps every PO verb reachable from the tray', () => {
    stubRows = [
      { id: 'po1', status: 'draft' } as unknown as GridRow,
      { id: 'po6', status: 'received' } as unknown as GridRow
    ];
    render(<PurchaseOrdersView />);
    // No status-matched primary for a mixed selection…
    expect(screen.queryByRole('button', { name: /^Finalize PO$|^Approve PO$|^Receive PO$/ })).toBeNull();
    // …but the catch-all rule exposes the full verb set in More.
    fireEvent.click(screen.getByRole('button', { name: /^More$/ }));
    expect(screen.getByRole('menuitem', { name: /^Finalize PO$/ })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: /^Approve PO$/ })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: /^Receive PO$/ })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: /^Unfinalize$/ })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: /^Record prepayment$/ })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: /^Cancel PO$/ })).toBeTruthy();
  });

  it('exactly one ⌘↵-committable primary — the StatusActionBar one (no double-fire)', () => {
    stubRows = [{ id: 'po1', status: 'draft' } as unknown as GridRow];
    const { container } = render(<PurchaseOrdersView />);
    expect(container.querySelectorAll('[data-status-action-primary]').length).toBe(1);
  });
});

describe('PurchaseOrdersView UX-H04 partial receiving (BE-009 lineage, Execution Decision 5)', () => {
  const approvedPo = { id: 'po3', poNo: 'PO-9', status: 'approved' } as unknown as GridRow;

  function selectApprovedPoWithLines(lines: Array<Record<string, unknown>>) {
    stubRows = [approvedPo];
    mockSelectedRows = { purchaseOrders: [approvedPo] };
    queryData.purchaseOrderLines = lines;
  }

  it('selected lines → tray "Receive selected qty" sends per-line outstanding quantities (default = qty − receivedQty)', () => {
    selectApprovedPoWithLines([
      { id: 'l1', qty: 10, receivedQty: 4, status: 'partially_received' },
      { id: 'l2', qty: 5, receivedQty: 0, status: 'planned' }
    ]);
    render(<PurchaseOrdersView />);
    // SX-F02: PO lines grid is gated behind a Show/Hide toggle.
    fireEvent.click(screen.getByRole('button', { name: /^Show lines$/ }));
    fireEvent.click(screen.getByTestId('select-all-PO-9 Lines'));
    fireEvent.click(screen.getByRole('button', { name: /^More$/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: /^Receive selected qty$/ }));
    expect(mockRunCommand).toHaveBeenCalledWith(
      'receivePurchaseOrder',
      { purchaseOrderId: 'po3', lineQuantities: { l1: 6, l2: 5 } },
      expect.any(String)
    );
  });

  it('no lines selected → "Receive selected qty" is disabled with a reason; full Receive PO primary unchanged', () => {
    selectApprovedPoWithLines([{ id: 'l1', qty: 10, receivedQty: 0, status: 'planned' }]);
    render(<PurchaseOrdersView />);
    fireEvent.click(screen.getByRole('button', { name: /^More$/ }));
    const partial = screen.getByRole('menuitem', { name: /^Receive selected qty$/ });
    expect(partial.hasAttribute('disabled')).toBe(true);
    expect(partial.getAttribute('title')).toMatch(/Select PO lines/);
    // The full receive primary still fires the legacy payload (no lineQuantities key).
    fireEvent.click(screen.getByRole('button', { name: /^Receive PO$/ }));
    expect(mockRunCommand).toHaveBeenCalledWith('receivePurchaseOrder', { purchaseOrderId: 'po3' }, expect.any(String));
  });

  it('lines with nothing outstanding are skipped from the partial payload', () => {
    selectApprovedPoWithLines([
      { id: 'l1', qty: 10, receivedQty: 10, status: 'received' },
      { id: 'l2', qty: 3, receivedQty: 1, status: 'partially_received' }
    ]);
    render(<PurchaseOrdersView />);
    // SX-F02: PO lines grid is gated behind a Show/Hide toggle.
    fireEvent.click(screen.getByRole('button', { name: /^Show lines$/ }));
    fireEvent.click(screen.getByTestId('select-all-PO-9 Lines'));
    fireEvent.click(screen.getByRole('button', { name: /^More$/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: /^Receive selected qty$/ }));
    expect(mockRunCommand).toHaveBeenCalledWith(
      'receivePurchaseOrder',
      { purchaseOrderId: 'po3', lineQuantities: { l2: 2 } },
      expect.any(String)
    );
  });

  it('"Receive selected qty" lives in the tray for ordered/partially_received POs too', () => {
    stubRows = [{ id: 'po5', status: 'partially_received' } as unknown as GridRow];
    render(<PurchaseOrdersView />);
    fireEvent.click(screen.getByRole('button', { name: /^More$/ }));
    expect(screen.getByRole('menuitem', { name: /^Receive selected qty$/ })).toBeTruthy();
  });

  describe('helpers', () => {
    it('poLineOutstandingQty: ordered − received, floored at 0, 3dp', () => {
      expect(poLineOutstandingQty({ id: 'x', qty: 10, receivedQty: 4 } as unknown as GridRow)).toBe(6);
      expect(poLineOutstandingQty({ id: 'x', qty: 2, receivedQty: 5 } as unknown as GridRow)).toBe(0);
      expect(poLineOutstandingQty({ id: 'x', qty: '1.500', receivedQty: '0.250' } as unknown as GridRow)).toBe(1.25);
    });

    it('buildReceiveLineQuantities: respects positive overrides, clamps to outstanding, skips zero-outstanding lines', () => {
      const lines = [
        { id: 'a', qty: 10, receivedQty: 0 },
        { id: 'b', qty: 8, receivedQty: 5 },
        { id: 'c', qty: 4, receivedQty: 4 }
      ] as unknown as GridRow[];
      expect(buildReceiveLineQuantities(lines, { a: 2.5, b: 99 })).toEqual({ a: 2.5, b: 3 });
      expect(buildReceiveLineQuantities(lines, {})).toEqual({ a: 10, b: 3 });
    });

    it('purchaseOrderLineColumnsFor: editable Receive qty column only on receivable PO statuses', () => {
      for (const status of ['approved', 'ordered', 'partially_received']) {
        const col = purchaseOrderLineColumnsFor(status).find((c) => c.field === 'receiveQty');
        expect(col, `expected receiveQty column for ${status}`).toBeTruthy();
        expect(col?.editable).toBe(true);
      }
      for (const status of ['draft', 'finalized', 'received', 'cancelled']) {
        expect(purchaseOrderLineColumnsFor(status).some((c) => c.field === 'receiveQty')).toBe(false);
      }
    });
  });
});
