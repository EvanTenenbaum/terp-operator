// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../components/useCommandRunner', () => ({
  useCommandRunner: () => ({ runCommand: vi.fn(), isRunning: false }),
}));

vi.mock('../components/credit/ShadowModeBanner', () => ({
  ShadowModeBanner: () => null,
}));

vi.mock('../store/uiStore', () => ({
  useUiStore: (selector: (s: { setDrawerEntity: ReturnType<typeof vi.fn>; setDrawerState: ReturnType<typeof vi.fn> }) => unknown) =>
    selector({ setDrawerEntity: vi.fn(), setDrawerState: vi.fn() }),
}));

vi.mock('../api/trpc', () => ({
  trpc: {
    auth: {
      me: {
        useQuery: () => ({ data: { role: 'owner', id: 'u1' }, isLoading: false }),
      },
    },
    credit: {
      creditReviewQueue: {
        useQuery: () => ({
          data: { rows: [], counts: { staleManual: 0, engineDisabled: 0, nearSnoozeCap: 0 } },
          isLoading: false,
        }),
      },
      creditEngineStances: {
        useQuery: () => ({
          data: { stances: [], config: { shadowMode: false } },
          isLoading: false,
        }),
      },
      creditRecomputeQueueHealth: {
        useQuery: () => ({
          data: {
            pendingCount: 0,
            oldestPendingAgeSeconds: null,
            processingCount: 0,
            doneCount: 5,
            failedTerminalCount: 0,
            staleProcessingCount: 0,
          },
          isLoading: false,
        }),
      },
      divergenceReport: {
        useQuery: () => ({
          data: {
            rows: [],
            generatedAt: new Date(),
            totalCustomers: 5,
            customersWithRecommendation: 4,
            customersInTolerance: 4,
            customersWithoutRecommendation: 1,
            kpi: {
              withinTolerance: 4,
              outsideTolerance: 1,
              pctWithinTolerance: 80,
              blockerCount: 0,
              noConfidenceApplied: 0,
              passes: true,
              reasons: [],
            },
          },
          isLoading: false,
          isError: false,
          refetch: vi.fn(),
        }),
      },
    },
  },
}));

import { CreditReviewView } from './CreditReviewView';

describe('CreditReviewView credit ops integration', () => {
  it('renders CreditQueueHealthWidget in header for manager+', () => {
    render(<CreditReviewView />);
    expect(screen.getByLabelText('Credit recompute queue health')).toBeInTheDocument();
  });

  it('renders divergence report toggle button for owner', () => {
    render(<CreditReviewView />);
    expect(screen.getByRole('button', { name: /divergence report/i })).toBeInTheDocument();
  });

  it('shows divergence panel on toggle click', async () => {
    const user = userEvent.setup();
    render(<CreditReviewView />);
    await user.click(screen.getByRole('button', { name: /divergence report/i }));
    expect(screen.getByText('Total customers')).toBeInTheDocument();
  });
});
