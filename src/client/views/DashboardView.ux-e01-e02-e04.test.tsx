// @vitest-environment jsdom
// UX-E01, UX-E02, UX-E04 — DashboardView navigation fixes.
//
// UX-E01: Credit Watch rows deep-link (setGridFilter + setDrawerEntity + setDrawerState + navigate)
//   instead of bare navigate('/clients').
// UX-E02: "Open Orders" navigates to /orders with status:confirmed filter; "Intake ready"
//   navigates to /intake with status:ready filter — matching QUEUE_FILTER semantics.
// UX-E04: When dashboard OR workQueue errors, only that panel shows a PanelError; the
//   other panels remain rendered.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('ag-grid-react', () => ({
  AgGridReact: () => <div data-testid="ag-grid-stub" />,
}));

// ── Router mock for asserting navigation ─────────────────────────────────────
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// ── Shared tRPC fixture data ──────────────────────────────────────────────────
const DASHBOARD_DATA = {
  metrics: [
    { key: 'cash', label: 'Cash', value: '$1,000', definition: 'Liquid cash', sub: '', severity: 'ok' as const },
    { key: 'payables', label: 'Payables', value: '$500', definition: 'Vendor bills due', sub: '', severity: 'ok' as const },
    { key: 'receivables', label: 'Receivables', value: '$750', definition: 'Customer balances due', sub: '', severity: 'ok' as const },
  ],
  moneyBuckets: [{ bucket: 'Operating', amount: 1000 }],
  pendingQueues: [
    { key: 'sales', label: 'Sales orders', count: 3 },
    { key: 'intake', label: 'Intake ready', count: 5 },
  ],
  recentActivity: [],
  health: { ok: true, warnings: [] },
};

const CREDIT_WATCH_DATA = [
  {
    customerId: 'cust-111',
    customerName: 'Acme Corp',
    balance: 9500,
    creditLimit: 10000,
    overallScore: 72,
    risk: 'watch' as const,
  },
];

// ── Mutable error flags (toggled per test) ────────────────────────────────────
let _dashboardError = false;
let _workQueueError = false;

vi.mock('../api/trpc', () => {
  const getQueryResult = (name: string) => {
    if (name === 'dashboard') {
      return _dashboardError
        ? { data: undefined, isLoading: false, isError: true, refetch: vi.fn() }
        : { data: DASHBOARD_DATA, isLoading: false, isError: false, refetch: vi.fn() };
    }
    if (name === 'workQueue') {
      return _workQueueError
        ? { data: undefined, isLoading: false, isError: true, refetch: vi.fn() }
        : { data: [], isLoading: false, isError: false, refetch: vi.fn() };
    }
    if (name === 'creditWatchlist') {
      return { data: CREDIT_WATCH_DATA, isLoading: false, isError: false, refetch: vi.fn() };
    }
    if (name === 'myDrafts') return { data: [], isLoading: false, isError: false, refetch: vi.fn() };
    if (name === 'drilldown') return { data: [], isLoading: false, isError: false };
    if (name === 'me') return { data: { id: 'u-1', name: 'op', email: 'op@test', role: 'operator' } };
    return { data: undefined, isLoading: false, isError: false };
  };

  const noopMutation = {
    mutate: () => {}, mutateAsync: async () => ({}),
    isLoading: false, isPending: false, isError: false, isSuccess: false,
    reset: () => {}, data: undefined, error: null,
  };

  const procProxy: unknown = new Proxy(
    {},
    {
      get(_target, prop: string) {
        return {
          useQuery: (..._args: unknown[]) => getQueryResult(prop),
          useMutation: () => noopMutation,
          useInfiniteQuery: () => ({ data: undefined, isLoading: false }),
        };
      },
    }
  );

  return {
    trpc: {
      auth: {
        me: { useQuery: () => getQueryResult('me') },
        logout: { useMutation: () => noopMutation },
      },
      queries: procProxy,
      credit: procProxy,
      commands: procProxy,
      useContext: () => ({ auth: { me: { invalidate: () => {} } } }),
    },
  };
});

// Import store AFTER the vi.mock calls so spies are attached post-hoist.
import { useUiStore } from '../store/uiStore';
import { DashboardView } from './DashboardView';

function Wrap({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return (
    <MemoryRouter>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </MemoryRouter>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

beforeEach(() => {
  _dashboardError = false;
  _workQueueError = false;
  mockNavigate.mockClear();
  // Reset store slices so tests don't bleed state into each other.
  useUiStore.setState({
    gridFilters: {},
    activeDrawerEntityByView: {},
    drawerByView: {},
  });
});

// ── UX-E01 ────────────────────────────────────────────────────────────────────

describe('UX-E01 — Credit Watch deep-link navigation', () => {
  it('clicking a Credit Watch row calls setGridFilter("clients", "name:Acme Corp")', () => {
    render(
      <Wrap>
        <DashboardView />
      </Wrap>
    );

    const creditButton = screen.getByRole('button', { name: /Acme Corp/i });
    fireEvent.click(creditButton);

    const gridFilters = useUiStore.getState().gridFilters;
    expect(gridFilters['clients']).toBe('name:Acme Corp');
  });

  it('clicking a Credit Watch row sets the drawer entity for clients to the customer id', () => {
    render(
      <Wrap>
        <DashboardView />
      </Wrap>
    );

    const creditButton = screen.getByRole('button', { name: /Acme Corp/i });
    fireEvent.click(creditButton);

    const drawerEntity = useUiStore.getState().activeDrawerEntityByView['clients'];
    expect(drawerEntity).toMatchObject({ entityType: 'customer', entityId: 'cust-111' });
  });

  it('clicking a Credit Watch row opens the standard drawer', () => {
    render(
      <Wrap>
        <DashboardView />
      </Wrap>
    );

    const creditButton = screen.getByRole('button', { name: /Acme Corp/i });
    fireEvent.click(creditButton);

    // setDrawerState sets the drawer on the key derived from view + entity.
    // Verify at least one drawer entry has state 'standard' for the clients view.
    const drawerByView = useUiStore.getState().drawerByView;
    const clientsDrawerEntry = Object.entries(drawerByView).find(([key]) =>
      key.startsWith('clients:')
    );
    expect(clientsDrawerEntry).toBeDefined();
    expect(clientsDrawerEntry![1].state).toBe('standard');
  });

  it('clicking a Credit Watch row navigates to /clients', () => {
    render(
      <Wrap>
        <DashboardView />
      </Wrap>
    );

    const creditButton = screen.getByRole('button', { name: /Acme Corp/i });
    fireEvent.click(creditButton);

    expect(mockNavigate).toHaveBeenCalledWith('/clients');
  });
});

// ── UX-E02 ────────────────────────────────────────────────────────────────────

describe('UX-E02 — Today-Focus tile filtered navigation', () => {
  it('"Open Orders" tile applies status:confirmed filter on the orders view', () => {
    render(
      <Wrap>
        <DashboardView />
      </Wrap>
    );

    const openOrdersBtn = screen.getByRole('button', { name: /view open orders/i });
    fireEvent.click(openOrdersBtn);

    expect(useUiStore.getState().gridFilters['orders']).toBe('status:confirmed');
  });

  it('"Open Orders" tile navigates to /orders (not /sales)', () => {
    render(
      <Wrap>
        <DashboardView />
      </Wrap>
    );

    const openOrdersBtn = screen.getByRole('button', { name: /view open orders/i });
    fireEvent.click(openOrdersBtn);

    expect(mockNavigate).toHaveBeenCalledWith('/orders');
    expect(mockNavigate).not.toHaveBeenCalledWith('/sales');
  });

  it('"Intake ready" tile applies status:ready filter on the intake view', () => {
    render(
      <Wrap>
        <DashboardView />
      </Wrap>
    );

    const intakeBtn = screen.getByRole('button', { name: /view intake ready/i });
    fireEvent.click(intakeBtn);

    expect(useUiStore.getState().gridFilters['intake']).toBe('status:ready');
  });

  it('"Intake ready" tile navigates to /intake', () => {
    render(
      <Wrap>
        <DashboardView />
      </Wrap>
    );

    const intakeBtn = screen.getByRole('button', { name: /view intake ready/i });
    fireEvent.click(intakeBtn);

    expect(mockNavigate).toHaveBeenCalledWith('/intake');
  });
});

// ── UX-E04 ────────────────────────────────────────────────────────────────────

describe('UX-E04 — Per-panel error state (healthy panels remain live)', () => {
  it('when workQueue errors, Today Focus panel shows a retry banner', () => {
    _workQueueError = true;

    render(
      <Wrap>
        <DashboardView />
      </Wrap>
    );

    // There should be an alert role element from PanelError.
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });

  // SX-C01: Money Buckets panel was removed from the dashboard.
  it.skip('when workQueue errors, the Money Buckets panel remains visible', () => {
    _workQueueError = true;

    render(
      <Wrap>
        <DashboardView />
      </Wrap>
    );

    // Money Buckets heading should still be in the DOM.
    expect(screen.getByRole('heading', { name: /money buckets/i })).toBeInTheDocument();
  });

  it('when workQueue errors, the page title and Refresh button remain visible', () => {
    _workQueueError = true;

    render(
      <Wrap>
        <DashboardView />
      </Wrap>
    );

    expect(screen.getByRole('heading', { level: 1, name: /owner daily decision view/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /refresh/i })).toBeInTheDocument();
  });

  it('when dashboard errors, an inline panel error appears (not a full-page takeover)', () => {
    _dashboardError = true;

    render(
      <Wrap>
        <DashboardView />
      </Wrap>
    );

    // The page heading must still be present — full-page replacement has no page heading.
    expect(screen.getByRole('heading', { level: 1, name: /owner daily decision view/i })).toBeInTheDocument();

    // An alert/error panel appears for the failed KPI section.
    expect(screen.getByRole('alert')).toBeInTheDocument();

    // The Refresh button stays present in the page header.
    expect(screen.getByRole('button', { name: /refresh/i })).toBeInTheDocument();
  });

  it('when dashboard errors, the Today Focus section remains rendered', () => {
    _dashboardError = true;

    render(
      <Wrap>
        <DashboardView />
      </Wrap>
    );

    expect(screen.getByRole('heading', { name: /today focus/i })).toBeInTheDocument();
  });
});
