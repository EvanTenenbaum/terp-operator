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
const mockSetSelectedRows = vi.fn();
const mockSetGridFilter = vi.fn();
const mockSetActiveView = vi.fn();
const mockSetActiveSettingsTab = vi.fn();
vi.mock('../store/uiStore', () => ({
  useUiStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      selectedRows: {},
      setSelectedRows: mockSetSelectedRows,
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
let stubRows: GridRow[] = [];
vi.mock('../components/OperatorGrid', () => ({
  OperatorGrid: (props: {
    title?: string;
    actions?: React.ReactNode;
    selectionActions?: (rows: GridRow[]) => React.ReactNode;
  }) => (
    <div data-testid={`grid-${props.title ?? 'untitled'}`}>
      {typeof props.actions === 'function' ? null : props.actions}
      {props.selectionActions ? props.selectionActions(stubRows) : null}
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

import { VendorPayablesView, ConnectorsView, RecoveryView, PaymentsView, CloseoutView } from './OperationsViews';

beforeEach(() => {
  stubRows = [];
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
