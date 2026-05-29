// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const divergenceQueryMock = vi.fn();
const refetchMock = vi.fn();

vi.mock('../../api/trpc', () => ({
  trpc: {
    credit: {
      divergenceReport: {
        useQuery: (input: unknown, options: unknown) => divergenceQueryMock(input, options),
      },
    },
  },
}));

import { CreditDivergencePanel } from './CreditDivergencePanel';

function makeKpi(overrides: Record<string, unknown> = {}) {
  return {
    withinTolerance: 8,
    outsideTolerance: 2,
    pctWithinTolerance: 80,
    blockerCount: 0,
    noConfidenceApplied: 0,
    passes: true,
    reasons: [] as string[],
    ...overrides,
  };
}

function makeReport(kpiOverrides: Record<string, unknown> = {}, rowsOverride: unknown[] = []) {
  return {
    rows: rowsOverride,
    generatedAt: new Date(),
    totalCustomers: 10,
    customersWithRecommendation: 8,
    customersInTolerance: 8,
    customersWithoutRecommendation: 2,
    kpi: makeKpi(kpiOverrides),
  };
}

describe('CreditDivergencePanel', () => {
  beforeEach(() => {
    divergenceQueryMock.mockReset();
    refetchMock.mockReset();
  });

  it('shows loading text while fetching', () => {
    divergenceQueryMock.mockReturnValue({ data: undefined, isLoading: true, isError: false, refetch: refetchMock });
    render(<CreditDivergencePanel />);
    expect(screen.getByText(/loading divergence report/i)).toBeInTheDocument();
  });

  it('shows error message on failure', () => {
    divergenceQueryMock.mockReturnValue({ data: undefined, isLoading: false, isError: true, refetch: refetchMock });
    render(<CreditDivergencePanel />);
    expect(screen.getByText(/failed to load/i)).toBeInTheDocument();
  });

  it('renders KPI tiles when data is available', () => {
    divergenceQueryMock.mockReturnValue({ data: makeReport(), isLoading: false, isError: false, refetch: refetchMock });
    render(<CreditDivergencePanel />);
    expect(screen.getByText('Total customers')).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument();
    expect(screen.getByText('80.0%')).toBeInTheDocument();
  });

  it('shows green pass banner when kpi.passes is true', () => {
    divergenceQueryMock.mockReturnValue({ data: makeReport(), isLoading: false, isError: false, refetch: refetchMock });
    render(<CreditDivergencePanel />);
    expect(screen.getByText(/meets criteria for live-mode flip/i)).toBeInTheDocument();
  });

  it('shows red fail banner when kpi.passes is false', () => {
    divergenceQueryMock.mockReturnValue({
      data: makeReport({ passes: false, reasons: ['< 75% within tolerance', 'blockerCount > 0'] }),
      isLoading: false, isError: false, refetch: refetchMock,
    });
    render(<CreditDivergencePanel />);
    expect(screen.getByText(/not ready to flip/i)).toBeInTheDocument();
    expect(screen.getByText('< 75% within tolerance')).toBeInTheDocument();
  });

  it('shows blocker warning when blockerCount > 0', () => {
    divergenceQueryMock.mockReturnValue({
      data: makeReport({ blockerCount: 3, passes: false, reasons: ['blockerCount > 0'] }),
      isLoading: false, isError: false, refetch: refetchMock,
    });
    render(<CreditDivergencePanel />);
    expect(screen.getByText(/3 customers with open orders/i)).toBeInTheDocument();
  });

  it('calls refetch on Refresh button click', async () => {
    const user = userEvent.setup();
    divergenceQueryMock.mockReturnValue({ data: makeReport(), isLoading: false, isError: false, refetch: refetchMock });
    render(<CreditDivergencePanel />);
    await user.click(screen.getByRole('button', { name: /refresh/i }));
    expect(refetchMock).toHaveBeenCalledTimes(1);
  });

  it('renders divergence rows in a table', () => {
    const rows = [
      {
        customerId: 'c1', customerName: 'Acme Corp', currentLimit: 5000,
        source: 'manual' as const, engineRecommendation: 6000,
        recommendationConfidence: { overallScore: 0.8, minDataCount: 5, maxDataCount: 10 },
        deltaAbs: 1000, deltaPct: 20, suggestedAction: 'engine_recommends_raise' as const,
      },
    ];
    divergenceQueryMock.mockReturnValue({ data: makeReport({}, rows), isLoading: false, isError: false, refetch: refetchMock });
    render(<CreditDivergencePanel />);
    expect(screen.getByText('Acme Corp')).toBeInTheDocument();
    expect(screen.getByText('$5,000')).toBeInTheDocument();
    expect(screen.getByText('$6,000')).toBeInTheDocument();
    expect(screen.getByText('Raise recommended')).toBeInTheDocument();
  });
});
