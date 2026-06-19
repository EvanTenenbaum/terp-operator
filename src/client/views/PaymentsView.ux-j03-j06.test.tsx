// @vitest-environment jsdom
/**
 * UX-J03 + UX-J06 — Payments view unapplied preset/count-pill and
 * payment inspector "Linked Orders" cross-link tab.
 *
 * UX-J03: FilterPresetStrip gains "Unapplied" preset; UnappliedCountBadge
 *   renders the live count from grid data already on the wire.
 * UX-J06: Payment inspector extraTabs include a "Linked Orders" tab that
 *   uses setGridFilter/setDrawerEntity/navigate to open the orders view.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type React from 'react';
import type { GridRow } from '../../shared/types';

// ── react-router-dom ────────────────────────────────────────────────────────
const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({
  useLocation: () => ({ pathname: '/payments' }),
  useNavigate: () => mockNavigate,
  BrowserRouter: ({ children }: { children: React.ReactNode }) => children
}));

// ── trpc mock ───────────────────────────────────────────────────────────────
// queryData allows per-test control of what each useQuery returns.
const queryData: Record<string, unknown> = {};
vi.mock('../api/trpc', () => {
  const makeQueries = () =>
    new Proxy(
      {},
      {
        get: (_target, name: string) => ({
          useQuery: (_input?: unknown) => ({
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

// ── uiStore mock ─────────────────────────────────────────────────────────────
const mockSetSelectedRows = vi.fn();
const mockSetGridFilter = vi.fn();
const mockSetActiveView = vi.fn();
const mockSetDrawerState = vi.fn();
const mockSetDrawerEntity = vi.fn();
let storedGridFilter = '';

vi.mock('../store/uiStore', () => ({
  useUiStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      selectedRows: {},
      setSelectedRows: mockSetSelectedRows,
      setDrawerState: mockSetDrawerState,
      setDrawerEntity: mockSetDrawerEntity,
      setActiveView: mockSetActiveView,
      pushToast: vi.fn(),
      gridFilters: { payments: storedGridFilter },
      setGridFilter: mockSetGridFilter,
      gridAdvancedFilters: {},
      setGridAdvancedFilter: vi.fn(),
      clearGridAdvancedFilter: vi.fn(),
      collapsedPanels: {},
      focusedPanelId: null,
      togglePanelCollapsed: vi.fn(),
      setFocusedPanel: vi.fn(),
      pickQueueFilters: new Set<string>(),
      setPickQueueFilter: vi.fn(),
      clearPickQueueFilters: vi.fn(),
      activeQuickLaunch: null,
      setDrilldownMetric: vi.fn()
    })
}));

// ── useCommandRunner mock ────────────────────────────────────────────────────
const mockRunCommand = vi.fn();
vi.mock('../components/useCommandRunner', () => ({
  useCommandRunner: () => ({
    runCommand: mockRunCommand,
    isRunning: false,
    setNextSuccessActions: vi.fn()
  })
}));

// ── OperatorGrid stub: renders actions bar with controllable rows ─────────────
let stubRows: GridRow[] = [];
vi.mock('../components/OperatorGrid', () => ({
  OperatorGrid: (props: {
    title?: string;
    actions?: React.ReactNode;
    selectionActions?: (rows: GridRow[]) => React.ReactNode;
    inspectorTabs?: (row: GridRow) => unknown;
  }) => {
    // Render actions, selection actions on stubRows, AND expose inspectorTabs
    // so J06 tests can invoke the tab render function.
    const tabs = stubRows[0] ? props.inspectorTabs?.(stubRows[0]) : undefined;
    return (
      <div data-testid={`grid-${props.title ?? 'untitled'}`}>
        {typeof props.actions === 'function' ? null : props.actions}
        {props.selectionActions ? props.selectionActions(stubRows) : null}
        {Array.isArray(tabs)
          ? tabs.map((tab: { key: string; label: string; render: () => React.ReactNode }) => (
              <div key={tab.key} data-testid={`tab-${tab.key}`}>
                <span data-testid={`tab-label-${tab.key}`}>{tab.label}</span>
                {tab.render()}
              </div>
            ))
          : null}
      </div>
    );
  }
}));

// ── chrome stubs ──────────────────────────────────────────────────────────────
vi.mock('../components/WorkspacePanel', () => ({
  WorkspacePanel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>
}));
vi.mock('../components/QuickLedgerGrid', () => ({ QuickLedgerGrid: () => null }));
vi.mock('../components/ReceiptPanel', () => ({
  ReceiptPanel: () => <div data-testid="receipt-panel" />
}));

import { PaymentsView } from './PaymentsView';

beforeEach(() => {
  stubRows = [];
  for (const key of Object.keys(queryData)) delete queryData[key];
  mockRunCommand.mockReset().mockResolvedValue({ ok: true });
  mockSetGridFilter.mockReset();
  mockSetActiveView.mockReset();
  mockSetDrawerEntity.mockReset();
  mockSetDrawerState.mockReset();
  mockNavigate.mockReset();
  storedGridFilter = '';
});

// ────────────────────────────────────────────────────────────────────────────
// UX-J03: FilterPresetStrip "Unapplied" preset and count pill
// ────────────────────────────────────────────────────────────────────────────
describe('UX-J03 — Payments "Unapplied" preset and count badge', () => {
  it('renders an "Unapplied" preset button in the FilterPresetStrip', () => {
    render(<PaymentsView />);
    expect(screen.getByRole('button', { name: 'Unapplied' })).toBeTruthy();
  });

  it('clicking the Unapplied preset calls setGridFilter with unappliedAmount:>0', () => {
    render(<PaymentsView />);
    fireEvent.click(screen.getByRole('button', { name: 'Unapplied' }));
    expect(mockSetGridFilter).toHaveBeenCalledWith('payments', 'allocationIntent:unapplied');
  });

  it('does NOT render the count badge when the grid has no unapplied rows', () => {
    queryData.grid = [
      { id: 'p1', status: 'posted', amount: 100, unappliedAmount: 0 },
      { id: 'p2', status: 'reversed', amount: 50, unappliedAmount: 50 }
    ];
    render(<PaymentsView />);
    // The reversed row is excluded; p1 has 0 unapplied → badge not rendered
    expect(screen.queryByLabelText(/unapplied payment/i)).toBeNull();
  });

  it('renders the count badge with the correct count when unapplied rows exist', () => {
    queryData.grid = [
      { id: 'p1', status: 'posted', amount: 100, unappliedAmount: 80 },
      { id: 'p2', status: 'posted', amount: 200, unappliedAmount: 200 },
      { id: 'p3', status: 'posted', amount: 50, unappliedAmount: 0 },
      { id: 'p4', status: 'reversed', amount: 60, unappliedAmount: 60 } // excluded
    ];
    render(<PaymentsView />);
    // 2 rows are posted with unapplied > 0 (p1 and p2)
    const badge = screen.getByLabelText('2 unapplied payments');
    expect(badge).toBeTruthy();
  });

  it('badge shows singular label for exactly 1 unapplied payment', () => {
    queryData.grid = [
      { id: 'p1', status: 'posted', amount: 100, unappliedAmount: 100 }
    ];
    render(<PaymentsView />);
    const badge = screen.getByLabelText('1 unapplied payment');
    expect(badge).toBeTruthy();
  });

  it('the Unapplied preset button toggles off the filter when already active', () => {
    storedGridFilter = 'allocationIntent:unapplied';
    render(<PaymentsView />);
    fireEvent.click(screen.getByRole('button', { name: 'Unapplied' }));
    expect(mockSetGridFilter).toHaveBeenCalledWith('payments', '');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// UX-J06: Payment inspector "Linked Orders" tab
// ────────────────────────────────────────────────────────────────────────────
describe('UX-J06 — Payment inspector "Linked Orders" cross-link tab', () => {
  it('inspector includes a "Linked Orders" tab when a payment row is selected', () => {
    stubRows = [{ id: 'pay1', status: 'posted', amount: 100, unappliedAmount: 0 } as unknown as GridRow];
    render(<PaymentsView />);
    expect(screen.getByTestId('tab-label-linked-orders')).toBeTruthy();
  });

  it('"Linked Orders" tab renders "No allocations" when paymentAllocations is empty', () => {
    stubRows = [{ id: 'pay1', status: 'posted', amount: 100, unappliedAmount: 0 } as unknown as GridRow];
    queryData.paymentAllocations = [];
    render(<PaymentsView />);
    expect(screen.getByText(/No allocations yet/i)).toBeTruthy();
  });

  it('"Linked Orders" tab renders invoice rows with "Open order" buttons', () => {
    stubRows = [{ id: 'pay1', status: 'posted', amount: 100, unappliedAmount: 0 } as unknown as GridRow];
    queryData.paymentAllocations = [
      { id: 'alloc1', paymentId: 'pay1', invoiceId: 'inv-uuid-1', invoiceNo: 'INV-001', amount: '100.00' }
    ];
    render(<PaymentsView />);
    // INV-001 appears in both the Allocations tab and Linked Orders tab —
    // scope the query to the linked-orders tab.
    const linkedOrdersTab = screen.getByTestId('tab-linked-orders');
    expect(linkedOrdersTab.textContent).toContain('INV-001');
    // Button accessible name is its text content "Open order"; title provides
    // the tooltip with the invoice context (not the aria-label).
    const openBtn = screen.getByRole('button', { name: 'Open order' });
    expect(openBtn).toBeTruthy();
    expect(openBtn.getAttribute('title')).toBe('Open order for invoice INV-001');
  });

  it('"Open order" button calls setGridFilter, setDrawerEntity, setDrawerState, setActiveView, and navigate', () => {
    stubRows = [{ id: 'pay1', status: 'posted', amount: 100, unappliedAmount: 0 } as unknown as GridRow];
    queryData.paymentAllocations = [
      { id: 'alloc1', paymentId: 'pay1', invoiceId: 'inv-uuid-1', invoiceNo: 'INV-001', amount: '100.00' }
    ];
    render(<PaymentsView />);
    fireEvent.click(screen.getByRole('button', { name: 'Open order' }));
    expect(mockSetGridFilter).toHaveBeenCalledWith('orders', 'invoiceId:inv-uuid-1');
    expect(mockSetDrawerEntity).toHaveBeenCalledWith('orders', 'order', 'inv-uuid-1');
    expect(mockSetDrawerState).toHaveBeenCalledWith('orders', 'standard');
    expect(mockSetActiveView).toHaveBeenCalledWith('orders');
    expect(mockNavigate).toHaveBeenCalledWith('/orders');
  });

  it('"Linked Orders" tab shows "No order linked" when invoiceId is missing', () => {
    stubRows = [{ id: 'pay1', status: 'posted', amount: 100, unappliedAmount: 0 } as unknown as GridRow];
    queryData.paymentAllocations = [
      { id: 'alloc1', paymentId: 'pay1', invoiceId: null, invoiceNo: null, amount: '50.00' }
    ];
    render(<PaymentsView />);
    expect(screen.getByText('No order linked')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Open order/i })).toBeNull();
  });
});
