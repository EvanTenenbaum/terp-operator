// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const navigateMock = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

vi.mock('../../api/trpc', () => ({
  trpc: {
    queries: {
      dashboard: { useQuery: vi.fn() },
      workQueue:  { useQuery: vi.fn() },
      myDrafts:   { useQuery: vi.fn() },
    },
  },
}));

import { trpc } from '../../api/trpc';
import { MobileDashboardView } from './MobileDashboardView';

const mockDashboard = trpc.queries.dashboard.useQuery as ReturnType<typeof vi.fn>;
const mockWorkQueue  = trpc.queries.workQueue.useQuery  as ReturnType<typeof vi.fn>;
const mockMyDrafts = trpc.queries.myDrafts.useQuery as ReturnType<typeof vi.fn>;

const METRICS = [
  { key: 'cash',        label: 'Cash on Hand', value: '$142,400', definition: 'Operating accounts', severity: 'good'    as const },
  { key: 'receivables', label: 'Receivables',   value: '$89,200',  definition: 'Owed by buyers',     severity: 'watch'   as const },
  { key: 'payables',    label: 'Payables',      value: '$34,100',  definition: 'Bills due',           severity: 'bad'     as const },
  { key: 'margin',      label: 'Margin',        value: '31%',      definition: '30-day gross margin', severity: 'good'    as const },
];

const QUEUES = [
  { key: 'sales',    label: 'Sales to confirm',  count: 4,  route: 'sales'    },
  { key: 'payments', label: 'Payments to apply', count: 7,  route: 'payments' },
];

const WORK_QUEUE_ROWS = [
  { id: 'so-1', route: 'orders',   lane: 'Sales',    title: 'SO-1001', status: 'draft', detail: 'Green Leaf / $11,200',   createdAt: new Date().toISOString() },
  { id: 'so-2', route: 'orders',   lane: 'Sales',    title: 'SO-1002', status: 'draft', detail: 'Blue River / $4,300',    createdAt: new Date().toISOString() },
  { id: 'inv-1', route: 'payments', lane: 'Payments', title: 'INV-9001', status: 'open',  detail: 'Acme / due $1,200',     createdAt: new Date().toISOString() },
];

beforeEach(() => {
  navigateMock.mockClear();
  mockDashboard.mockReturnValue({
    data: {
      metrics: METRICS,
      pendingQueues: QUEUES,
      moneyBuckets: [],
      recentActivity: [
        { id: '1', commandName: 'logPayment', actorName: 'Maya R.', createdAt: new Date().toISOString(), toast: 'Received $11,200' },
      ],
      health: { ok: true, warnings: [] },
    },
    isLoading: false,
    refetch: vi.fn(),
  });
  mockWorkQueue.mockReturnValue({ data: WORK_QUEUE_ROWS, isLoading: false });
  mockMyDrafts.mockReturnValue({ data: [], isLoading: false });
});

function renderView() {
  return render(<MemoryRouter><MobileDashboardView /></MemoryRouter>);
}

describe('MobileDashboardView', () => {
  it('renders all 4 KPI values', () => {
    renderView();
    expect(screen.getByText('$142,400')).toBeInTheDocument();
    expect(screen.getByText('$89,200')).toBeInTheDocument();
    expect(screen.getByText('$34,100')).toBeInTheDocument();
    expect(screen.getByText('31%')).toBeInTheDocument();
  });

  it('renders KPI labels', () => {
    renderView();
    expect(screen.getByText('Cash on Hand')).toBeInTheDocument();
    expect(screen.getByText('Receivables')).toBeInTheDocument();
  });

  it('renders work queue grouped by lane with counts and previews', () => {
    renderView();
    expect(screen.getByText('Sales')).toBeInTheDocument();
    expect(screen.getByText('Green Leaf / $11,200')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('Payments')).toBeInTheDocument();
    expect(screen.getByText('Acme / due $1,200')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('navigates to the lane route when a work queue row is clicked', () => {
    renderView();
    fireEvent.click(screen.getByRole('button', { name: /sales: 2 items/i }));
    expect(navigateMock).toHaveBeenCalledWith('/orders');
  });

  it('renders health banner when health is ok', () => {
    renderView();
    expect(screen.getByText(/all systems healthy/i)).toBeInTheDocument();
  });

  it('renders skeletons when loading', () => {
    mockDashboard.mockReturnValue({ data: undefined, isLoading: true, refetch: vi.fn() });
    mockWorkQueue.mockReturnValue({ data: undefined, isLoading: true });
    renderView();
    expect(screen.getAllByTestId('skeleton').length).toBeGreaterThan(0);
  });

  it('hides My Drafts section when no drafts', () => {
    mockMyDrafts.mockReturnValue({ data: [], isLoading: false });
    renderView();
    expect(screen.queryByText(/my drafts/i)).not.toBeInTheDocument();
  });

  it('shows My Drafts section when drafts exist', () => {
    mockMyDrafts.mockReturnValue({
      data: [
        { id: 'd1', lane: 'Sales', title: 'SO-2001', route: 'sales', status: 'draft' },
        { id: 'd2', lane: 'Purchase Order', title: 'PO-1002', route: 'purchaseOrders', status: 'draft' },
      ],
      isLoading: false,
    });
    renderView();
    expect(screen.getByText(/my drafts/i)).toBeInTheDocument();
    expect(screen.getByText(/sales.*SO-2001/i)).toBeInTheDocument();
    expect(screen.getByText(/purchase order.*PO-1002/i)).toBeInTheDocument();
  });

  it('navigates to desktop route and sets prefer-desktop flag when a draft is clicked', () => {
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');
    mockMyDrafts.mockReturnValue({
      data: [{ id: 'd1', lane: 'Sales', title: 'SO-2001', route: 'sales', status: 'draft' }],
      isLoading: false,
    });
    renderView();
    fireEvent.click(screen.getByRole('button', { name: /sales.*SO-2001/i }));
    expect(setItemSpy).toHaveBeenCalledWith('terp-prefer-desktop', 'true');
    expect(navigateMock).toHaveBeenCalledWith('/sales');
    setItemSpy.mockRestore();
  });
});
