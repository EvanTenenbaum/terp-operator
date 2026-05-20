// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

// Authenticated owner so we render the panel body, not the role gate.
const meQueryMock = vi.fn<(...args: unknown[]) => unknown>(() => ({ data: { role: 'owner' }, isLoading: false }));
const customerCreditStatusQueryMock = vi.fn<(...args: unknown[]) => unknown>();
const customerCreditAssessmentsQueryMock = vi.fn<(...args: unknown[]) => unknown>(() => ({ data: undefined, isLoading: false, error: null }));
const creditEngineStancesQueryMock = vi.fn<(...args: unknown[]) => unknown>(() => ({ data: undefined, isLoading: false, error: null }));

vi.mock('../../api/trpc', () => ({
  trpc: {
    auth: { me: { useQuery: (input?: unknown, opts?: unknown) => meQueryMock(input, opts) } },
    credit: {
      customerCreditStatus: { useQuery: (input?: unknown, opts?: unknown) => customerCreditStatusQueryMock(input, opts) },
      customerCreditAssessments: { useQuery: (input?: unknown, opts?: unknown) => customerCreditAssessmentsQueryMock(input, opts) },
      creditEngineStances: { useQuery: (input?: unknown, opts?: unknown) => creditEngineStancesQueryMock(input, opts) },
    },
  },
}));

vi.mock('../useCommandRunner', () => ({
  useCommandRunner: () => ({ runCommand: vi.fn(), isRunning: false }),
}));

// Stub ShadowModeBanner so its trpc query isn't required here.
vi.mock('./ShadowModeBanner', () => ({
  ShadowModeBanner: () => null,
}));

// Stub EditCreditLimitModal (it has its own focused tests).
vi.mock('./EditCreditLimitModal', () => ({
  EditCreditLimitModal: () => null,
}));

import { CustomerCreditPanel } from './CustomerCreditPanel';

interface StatusPayload {
  customer: {
    id: string;
    name: string;
    creditLimit: number;
    balance: number;
    creditLimitSource: 'engine' | 'manual';
    engineEnabled: boolean;
    engineMax: number | null;
    engineDisabledAt: Date | null;
    engineDisabledReason: string | null;
    creditLimitManualSetAt: Date | null;
    creditLimitManualReason: string | null;
    creditLimitReminderDays: number | null;
    creditLimitLastReviewedAt: Date | null;
    creditLimitSnoozeCount: number;
  };
  effectiveStance: null;
  latestAssessment:
    | null
    | {
        id: string;
        createdAt: Date;
        triggeredBy: string;
        applied: boolean;
        finalLimit: number;
        recommendedLimit: number;
        baseAmount: number;
        multiplier: number;
        overallScore: number;
        scores: Record<string, number>;
        confidences: Record<string, string>;
        stanceId: string;
      };
  coldStart: {
    invoicesPosted: number;
    invoicesRequired: number;
    tenureDays: number;
    tenureRequired: number;
    baseAmount: number;
    isWarming: boolean;
  };
  reminder: {
    effectiveReminderDays: number;
    daysSinceReview: number | null;
    staleReminderActive: boolean;
    snoozeCapDays: number;
    daysToSnoozeCap: number | null;
    nearSnoozeCap: boolean;
    snoozeCapReached: boolean;
  };
  engineRecommendationDelta: null;
  shadowMode: boolean;
}

function baseStatus(overrides: Partial<StatusPayload> = {}): StatusPayload {
  return {
    customer: {
      id: 'cust-1',
      name: 'Acme Co',
      creditLimit: 10_000,
      balance: 2_500,
      creditLimitSource: 'engine',
      engineEnabled: true,
      engineMax: null,
      engineDisabledAt: null,
      engineDisabledReason: null,
      creditLimitManualSetAt: null,
      creditLimitManualReason: null,
      creditLimitReminderDays: null,
      creditLimitLastReviewedAt: null,
      creditLimitSnoozeCount: 0,
    },
    effectiveStance: null,
    latestAssessment: null,
    coldStart: {
      invoicesPosted: 0,
      invoicesRequired: 3,
      tenureDays: 0,
      tenureRequired: 30,
      baseAmount: 0,
      isWarming: false,
    },
    reminder: {
      effectiveReminderDays: 0,
      daysSinceReview: null,
      staleReminderActive: false,
      snoozeCapDays: 90,
      daysToSnoozeCap: null,
      nearSnoozeCap: false,
      snoozeCapReached: false,
    },
    engineRecommendationDelta: null,
    shadowMode: false,
    ...overrides,
  };
}

function mockStatus(payload: StatusPayload) {
  customerCreditStatusQueryMock.mockReturnValue({
    data: payload,
    isLoading: false,
    error: null,
  });
}

describe('CustomerCreditPanel - cold-start empty state', () => {
  beforeEach(() => {
    customerCreditStatusQueryMock.mockReset();
    customerCreditAssessmentsQueryMock.mockClear();
    creditEngineStancesQueryMock.mockClear();
    meQueryMock.mockClear();
    meQueryMock.mockImplementation(() => ({ data: { role: 'owner' }, isLoading: false }));
  });

  it('renders explicit copy when there are no signals (latestAssessment is null)', () => {
    mockStatus(baseStatus());
    render(<CustomerCreditPanel customerId="cust-1" />);
    // The empty-state explains why the engine recommendation is unavailable.
    expect(
      screen.getByText(
        /No signals yet — engine recommendation is unavailable until invoices appear\./i
      )
    ).toBeInTheDocument();
    // And the testid is wired so e2e/visual tests can target the state.
    expect(screen.getByTestId('credit-no-signals-empty-state')).toBeInTheDocument();
  });

  it('does NOT render the no-signals empty state when a latest assessment exists', () => {
    mockStatus(
      baseStatus({
        latestAssessment: {
          id: 'a-1',
          createdAt: new Date('2024-01-01'),
          triggeredBy: 'cron',
          applied: true,
          finalLimit: 10_000,
          recommendedLimit: 10_000,
          baseAmount: 5_000,
          multiplier: 2,
          overallScore: 75,
          scores: {
            revenueMomentum: 80,
            cashCollection: 70,
            profitability: 60,
            debtAging: 90,
            repaymentVelocity: 85,
            tenureDepth: 65,
          },
          confidences: {
            revenueMomentum: 'high',
            cashCollection: 'high',
            profitability: 'medium',
            debtAging: 'high',
            repaymentVelocity: 'high',
            tenureDepth: 'medium',
          },
          stanceId: 'stance-1',
        },
      })
    );
    render(<CustomerCreditPanel customerId="cust-1" />);
    expect(
      screen.queryByText(/No signals yet — engine recommendation is unavailable/i)
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId('credit-no-signals-empty-state')).not.toBeInTheDocument();
    // Signal chip list is rendered with the expected role/label.
    expect(screen.getByRole('list', { name: /credit signal chips/i })).toBeInTheDocument();
  });
});
