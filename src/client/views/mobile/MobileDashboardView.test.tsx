// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';

vi.mock('../../api/trpc', () => ({
  trpc: {
    queries: {
      dashboard: { useQuery: vi.fn() },
      workQueue:  { useQuery: vi.fn() },
    },
  },
}));

import { trpc } from '../../api/trpc';
import { MobileDashboardView } from './MobileDashboardView';

const mockDashboard = trpc.queries.dashboard.useQuery as ReturnType<typeof vi.fn>;
const mockWorkQueue  = trpc.queries.workQueue.useQuery  as ReturnType<typeof vi.fn>;

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

beforeEach(() => {
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
  mockWorkQueue.mockReturnValue({ data: QUEUES, isLoading: false });
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

  it('renders work queue with counts', () => {
    renderView();
    expect(screen.getByText('Sales to confirm')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText('Payments to apply')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
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
});
