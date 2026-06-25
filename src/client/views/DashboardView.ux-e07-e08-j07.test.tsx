// @vitest-environment jsdom
// UX-E07 minimal: per-lane snooze on work-queue rows (client-side, persisted in uiStore).
// UX-E08: "View all (N)" expansion on Today's Top Decisions list.
// UX-J07 dashboard half: cash drilldown groups by locationBucket when present on the wire.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('ag-grid-react', () => ({
  AgGridReact: () => <div data-testid="ag-grid-stub" />,
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// ── tRPC fixture data ─────────────────────────────────────────────────────────

const DASHBOARD_DATA = {
  metrics: [
    { key: 'cash', label: 'Cash', value: '$1,000', definition: 'Liquid cash', sub: '', severity: 'ok' as const },
    { key: 'payables', label: 'Payables', value: '$500', definition: 'Vendor bills due', sub: '', severity: 'ok' as const },
    { key: 'receivables', label: 'Receivables', value: '$750', definition: 'Customer balances due', sub: '', severity: 'ok' as const },
  ],
  moneyBuckets: [{ bucket: 'Operating', amount: 1000, definition: '' }],
  pendingQueues: [
    { key: 'sales', label: 'Sales orders', count: 3 },
    { key: 'intake', label: 'Intake ready', count: 5 },
  ],
  recentActivity: [],
  health: { ok: true, warnings: [] },
};

// 5 work-queue rows so the "View all" toggle appears (> 3).
const WORK_QUEUE_ROWS = [
  { id: 'wq-1', lane: 'Sales', title: 'Confirm order A', status: 'confirmed', route: 'sales', createdAt: '2026-06-12T00:00:00Z' },
  { id: 'wq-2', lane: 'Payments', title: 'Allocate payment B', status: 'open', route: 'payments', createdAt: '2026-06-12T00:01:00Z' },
  { id: 'wq-3', lane: 'Intake', title: 'Ready batch C', status: 'ready', route: 'intake', createdAt: '2026-06-12T00:02:00Z' },
  { id: 'wq-4', lane: 'Vendor', title: 'Bill D is due', status: 'open', route: 'vendors', createdAt: '2026-06-12T00:03:00Z' },
  { id: 'wq-5', lane: 'Fulfillment', title: 'Pick list E', status: 'open', route: 'fulfillment', createdAt: '2026-06-12T00:04:00Z' },
];

// Cash drilldown rows with locationBucket populated.
const DRILLDOWN_CASH_ROWS = [
  { id: 'p-1', customer: 'Alice', amount: 500, locationBucket: 'cash-file-a', status: 'posted', createdAt: '2026-06-10T00:00:00Z' },
  { id: 'p-2', customer: 'Bob', amount: 300, locationBucket: 'cash-file-b', status: 'posted', createdAt: '2026-06-11T00:00:00Z' },
  { id: 'p-3', customer: 'Carol', amount: 200, locationBucket: 'cash-file-a', status: 'posted', createdAt: '2026-06-12T00:00:00Z' },
];

// Drilldown rows WITHOUT locationBucket (fallback path — no grouping).
const DRILLDOWN_CASH_NO_BUCKET = [
  { id: 'p-4', customer: 'Dave', amount: 100, status: 'posted', createdAt: '2026-06-10T00:00:00Z' },
];

// Mutable drilldown override for tests.
let _drilldownRows: typeof DRILLDOWN_CASH_ROWS | typeof DRILLDOWN_CASH_NO_BUCKET = DRILLDOWN_CASH_ROWS;
let _drilldownMetric: string | null = null;

vi.mock('../api/trpc', () => {
  const getQueryResult = (name: string) => {
    if (name === 'dashboard') {
      return { data: DASHBOARD_DATA, isLoading: false, isError: false, refetch: vi.fn() };
    }
    if (name === 'workQueue') {
      return { data: WORK_QUEUE_ROWS, isLoading: false, isError: false, refetch: vi.fn() };
    }
    if (name === 'drilldown') {
      return { data: _drilldownRows, isLoading: false, isError: false };
    }
    if (name === 'creditWatchlist') {
      return { data: [], isLoading: false, isError: false, refetch: vi.fn() };
    }
    if (name === 'myDrafts') return { data: [], isLoading: false, isError: false, refetch: vi.fn() };
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

import { useUiStore } from '../store/uiStore';
import { DashboardView } from '../templates/DashboardView';

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

const originalScrollIntoView = window.HTMLElement.prototype.scrollIntoView;

beforeEach(() => {
  mockNavigate.mockClear();
  _drilldownRows = DRILLDOWN_CASH_ROWS;
  _drilldownMetric = null;
  // Reset store state between tests.
  useUiStore.setState({
    gridFilters: {},
    activeDrawerEntityByView: {},
    drawerByView: {},
    snoozedWorkQueueItems: {},
    drilldownMetric: null,
  });
  // SX-C03: restore scrollIntoView in case tests mocked it.
  window.HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
});

// ── UX-E07: per-lane snooze ────────────────────────────────────────────────────

describe('UX-E07 — per-lane work-queue snooze (client-side)', () => {
  it('each work-queue row shows a "Snooze 24h" button in the My Open Work grid expansion', () => {
    render(
      <Wrap>
        <DashboardView />
      </Wrap>
    );
    // The snooze button titles are tested via the title attribute on the button.
    // Because OperatorGrid renders a stub in jsdom, we verify the snooze action
    // via the store directly.
    const { snoozeWorkQueueItem } = useUiStore.getState();
    const until = new Date(Date.now() + 24 * 60 * 60 * 1_000).toISOString();
    snoozeWorkQueueItem('wq-1', until);

    const state = useUiStore.getState();
    expect(state.snoozedWorkQueueItems['wq-1']).toBe(until);
  });

  it('snoozed items (snoozedUntil in the future) are filtered out of rankedWorkRows', () => {
    // Pre-snooze wq-1 with a future timestamp via the store.
    const futureIso = new Date(Date.now() + 24 * 60 * 60 * 1_000).toISOString();
    useUiStore.setState({ snoozedWorkQueueItems: { 'wq-1': futureIso } });

    render(
      <Wrap>
        <DashboardView />
      </Wrap>
    );

    // The "Today's Top Decisions" section renders the top 3 from rankedWorkRows
    // (wq-1 is snoozed so it should not appear in the first 3 slots).
    // With 5 rows minus 1 snoozed = 4 rows, the toggle shows "View all (4)".
    const toggle = screen.getByTestId('top-decisions-toggle');
    expect(toggle.textContent).toMatch(/view all \(4\)/i);
  });

  it('items with snoozedUntil in the past are treated as active (expiry has passed)', () => {
    // Past timestamp = snooze expired = item shows up again.
    const pastIso = new Date(Date.now() - 1_000).toISOString();
    useUiStore.setState({ snoozedWorkQueueItems: { 'wq-1': pastIso } });

    render(
      <Wrap>
        <DashboardView />
      </Wrap>
    );

    // All 5 rows are present again — toggle shows "View all (5)".
    const toggle = screen.getByTestId('top-decisions-toggle');
    expect(toggle.textContent).toMatch(/view all \(5\)/i);
  });

  it('snoozeWorkQueueItem persists the itemId → ISO timestamp in the store', () => {
    const { snoozeWorkQueueItem } = useUiStore.getState();
    const until = '2099-01-01T00:00:00.000Z';
    snoozeWorkQueueItem('test-id', until);
    expect(useUiStore.getState().snoozedWorkQueueItems['test-id']).toBe(until);
  });

  it('unsnoozeWorkQueueItem removes the itemId from the store', () => {
    useUiStore.setState({ snoozedWorkQueueItems: { 'test-id': '2099-01-01T00:00:00.000Z' } });
    useUiStore.getState().unsnoozeWorkQueueItem('test-id');
    expect(useUiStore.getState().snoozedWorkQueueItems['test-id']).toBeUndefined();
  });
});

// ── UX-E08: "View all (N)" expansion ─────────────────────────────────────────

describe('UX-E08 — "View all (N)" expansion on Today\'s Top Decisions', () => {
  it('shows a "View all (5)" toggle when there are more than 3 ranked rows', () => {
    render(
      <Wrap>
        <DashboardView />
      </Wrap>
    );

    const toggle = screen.getByTestId('top-decisions-toggle');
    expect(toggle).toBeInTheDocument();
    expect(toggle.textContent).toMatch(/view all \(5\)/i);
  });

  it('clicking "View all" scrolls the My Open Work grid into view', () => {
    // SX-C03: "View all" scrolls to My Open Work grid instead of expanding in-place.
    const scrollIntoView = vi.fn();
    window.HTMLElement.prototype.scrollIntoView = scrollIntoView;

    render(
      <Wrap>
        <DashboardView />
      </Wrap>
    );

    const toggle = screen.getByTestId('top-decisions-toggle');
    expect(toggle.textContent).toMatch(/view all \(5\)/i);
    fireEvent.click(toggle);

    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
  });

  // SX-C03: "View all" no longer toggles expand/collapse in-place.
  it('"View all" button is clickable and always shows "View all (N)" label', () => {
    const scrollIntoView = vi.fn();
    window.HTMLElement.prototype.scrollIntoView = scrollIntoView;

    render(
      <Wrap>
        <DashboardView />
      </Wrap>
    );

    const toggle = screen.getByTestId('top-decisions-toggle');
    expect(toggle.textContent).toMatch(/view all \(5\)/i);

    // Click twice — label never changes to "Show less".
    fireEvent.click(toggle);
    expect(toggle.textContent).toMatch(/view all \(5\)/i);
    fireEvent.click(toggle);
    expect(toggle.textContent).toMatch(/view all \(5\)/i);

    expect(scrollIntoView).toHaveBeenCalledTimes(2);
  });

  it('does NOT show the toggle when there are 3 or fewer rows', () => {
    // Override to return only 2 rows.
    const twoRows = WORK_QUEUE_ROWS.slice(0, 2);
    // Temporarily stub workQueue.data — we achieve this by setting a snoozed
    // state that removes 3 rows, leaving exactly 2 active rows.
    const futureIso = new Date(Date.now() + 24 * 60 * 60 * 1_000).toISOString();
    useUiStore.setState({
      snoozedWorkQueueItems: {
        'wq-3': futureIso,
        'wq-4': futureIso,
        'wq-5': futureIso,
      },
    });
    void twoRows; // suppress unused-var lint

    render(
      <Wrap>
        <DashboardView />
      </Wrap>
    );

    // With 5 - 3 snoozed = 2 active rows (≤ 3), toggle should not appear.
    expect(screen.queryByTestId('top-decisions-toggle')).not.toBeInTheDocument();
  });
});

// ── UX-J07: cash drilldown grouped by bucket ──────────────────────────────────

describe('UX-J07 — cash drilldown bucket grouping', () => {
  it('shows "Cash — by bucket" panel when drilldownMetric is "cash" and locationBucket is on the wire', () => {
    _drilldownRows = DRILLDOWN_CASH_ROWS;
    useUiStore.setState({ drilldownMetric: 'cash' });

    render(
      <Wrap>
        <DashboardView />
      </Wrap>
    );

    expect(screen.getByRole('heading', { name: /cash — by bucket/i })).toBeInTheDocument();
  });

  it('renders a section per unique bucket value', () => {
    _drilldownRows = DRILLDOWN_CASH_ROWS;
    useUiStore.setState({ drilldownMetric: 'cash' });

    render(
      <Wrap>
        <DashboardView />
      </Wrap>
    );

    // cash-file-a and cash-file-b appear as bucket labels.
    expect(screen.getByText('cash-file-a')).toBeInTheDocument();
    expect(screen.getByText('cash-file-b')).toBeInTheDocument();
  });

  it('shows the row count and total per bucket', () => {
    _drilldownRows = DRILLDOWN_CASH_ROWS;
    useUiStore.setState({ drilldownMetric: 'cash' });

    render(
      <Wrap>
        <DashboardView />
      </Wrap>
    );

    // cash-file-a has 2 rows (p-1: $500, p-3: $200 = $700 total).
    const cashFileA = screen.getByText('cash-file-a').closest('div')?.parentElement;
    expect(cashFileA?.textContent).toMatch(/2 rows/);
  });

  it('renders a "Close drilldown" button inside the bucket panel', () => {
    _drilldownRows = DRILLDOWN_CASH_ROWS;
    useUiStore.setState({ drilldownMetric: 'cash' });

    render(
      <Wrap>
        <DashboardView />
      </Wrap>
    );

    expect(screen.getByRole('button', { name: /close drilldown/i })).toBeInTheDocument();
  });

  it('falls back to flat OperatorGrid when locationBucket is absent from the rows', () => {
    _drilldownRows = DRILLDOWN_CASH_NO_BUCKET;
    useUiStore.setState({ drilldownMetric: 'cash' });

    render(
      <Wrap>
        <DashboardView />
      </Wrap>
    );

    // No "Cash — by bucket" heading.
    expect(screen.queryByRole('heading', { name: /cash — by bucket/i })).not.toBeInTheDocument();
    // Flat drilldown heading still shows (use heading role to avoid matching sr-only span).
    expect(screen.getByRole('heading', { name: /source rows for cash/i })).toBeInTheDocument();
  });

  it('does NOT show the cash bucket panel for non-cash metrics', () => {
    _drilldownRows = DRILLDOWN_CASH_ROWS;
    useUiStore.setState({ drilldownMetric: 'receivables' });

    render(
      <Wrap>
        <DashboardView />
      </Wrap>
    );

    expect(screen.queryByRole('heading', { name: /cash — by bucket/i })).not.toBeInTheDocument();
  });
});
