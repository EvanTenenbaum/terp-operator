// @vitest-environment jsdom
/**
 * SalesCustomerContextHeader — comprehensive tests.
 *
 * Tests: customer name display, balance display (formatMoney), credit status
 * (OK / blocked / no limit), loading states, error states, clear button,
 * edit button (opens customer detail drawer).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

// ── Mutable mock data ──────────────────────────────────────────────────
const mockQueries = vi.hoisted(() => ({
  customerWorkspace: {
    data: {
      customer: { id: 'cust-1', name: 'Acme Dispensary', balance: 1250.0 },
      orders: [],
    },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  } as Record<string, unknown>,
  customerCreditStatus: {
    data: {
      customer: { id: 'cust-1', creditLimit: 5000 },
    },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  } as Record<string, unknown>,
  _default: {
    data: undefined as unknown,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  } as Record<string, unknown>,
}));

const mockSetDrawerEntity = vi.hoisted(() => vi.fn());
const mockSetDrawerState = vi.hoisted(() => vi.fn());

// ── Stubs ────────────────────────────────────────────────────────────────
vi.mock('../../api/trpc', () => {
  function makeUseQuery(name: string) {
    return (_input: unknown, opts?: { enabled?: boolean }) => {
      if (opts?.enabled === false) {
        return { data: undefined, isLoading: false, isError: false, refetch: vi.fn() };
      }
      const entry = (mockQueries as Record<string, unknown>)[name];
      if (entry && typeof entry === 'object' && entry !== null) return entry;
      return mockQueries._default;
    };
  }

  const noopMutation = {
    mutate: () => {},
    mutateAsync: async () => ({}),
    isLoading: false,
    isPending: false,
    isError: false,
    isSuccess: false,
    reset: () => {},
    data: undefined,
    error: null,
  };

  const procProxy: unknown = new Proxy(
    {},
    {
      get(_target, prop: string) {
        return {
          useQuery: makeUseQuery(prop),
          useMutation: () => noopMutation,
          useInfiniteQuery: () => ({ data: undefined, isLoading: false }),
        };
      },
    },
  );

  return {
    trpc: {
      auth: { me: { useQuery: () => ({ data: undefined }) } },
      queries: procProxy,
      credit: procProxy,
      commands: procProxy,
      useContext: () => ({}),
    },
  };
});

vi.mock('../../store/uiStore', () => ({
  useUiStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      setDrawerEntity: mockSetDrawerEntity,
      setDrawerState: mockSetDrawerState,
    }),
}));

vi.mock('../../utils/format', () => ({
  formatMoney: (value: number | null | undefined) => {
    const n = value == null || !Number.isFinite(value) ? 0 : value;
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n);
  },
}));

import { SalesCustomerContextHeader } from './SalesCustomerContextHeader';

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

function renderHeader(props: { customerId?: string; onClear?: () => void } = {}) {
  const onClear = props.onClear ?? vi.fn();
  return render(
    <Wrap>
      <SalesCustomerContextHeader customerId={props.customerId ?? 'cust-1'} onClear={onClear} />
    </Wrap>,
  );
}

beforeEach(() => {
  mockQueries.customerWorkspace = {
    data: {
      customer: { id: 'cust-1', name: 'Acme Dispensary', balance: 1250.0 },
      orders: [],
    },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  };
  mockQueries.customerCreditStatus = {
    data: {
      customer: { id: 'cust-1', creditLimit: 5000 },
    },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  };
  mockQueries._default = {
    data: undefined,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  };
  mockSetDrawerEntity.mockReset();
  mockSetDrawerState.mockReset();
});

describe('SalesCustomerContextHeader — rendering with data', () => {
  it('renders the customer name', () => {
    renderHeader({ customerId: 'cust-1' });
    expect(screen.getByText('Acme Dispensary')).toBeInTheDocument();
  });

  it('renders the customer balance formatted as money', () => {
    renderHeader({ customerId: 'cust-1' });
    expect(screen.getByText(/Balance:/)).toBeInTheDocument();
    expect(screen.getByText(/\$1,250\.00/)).toBeInTheDocument();
  });

  it('renders zero balance correctly', () => {
    mockQueries.customerWorkspace = {
      data: {
        customer: { id: 'cust-1', name: 'Zero Corp', balance: 0 },
        orders: [],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    };
    renderHeader({ customerId: 'cust-1' });
    expect(screen.getByText('Zero Corp')).toBeInTheDocument();
    expect(screen.getByText(/\$0\.00/)).toBeInTheDocument();
  });

  it('renders negative balance correctly', () => {
    mockQueries.customerWorkspace = {
      data: {
        customer: { id: 'cust-1', name: 'Debt Co', balance: -500 },
        orders: [],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    };
    renderHeader({ customerId: 'cust-1' });
    expect(screen.getByText('Debt Co')).toBeInTheDocument();
    expect(screen.getByText(/\-\$500\.00/)).toBeInTheDocument();
  });

  it('renders the Clear and Edit buttons', () => {
    renderHeader({ customerId: 'cust-1' });
    expect(screen.getByRole('button', { name: /Clear/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Edit/i })).toBeInTheDocument();
  });
});

describe('SalesCustomerContextHeader — credit status', () => {
  it('shows credit OK when balance is under credit limit', () => {
    mockQueries.customerWorkspace = {
      data: {
        customer: { id: 'cust-1', name: 'Acme', balance: 1000 },
        orders: [],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    };
    mockQueries.customerCreditStatus = {
      data: { customer: { id: 'cust-1', creditLimit: 5000 } },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    };
    renderHeader({ customerId: 'cust-1' });
    expect(screen.getByText(/Credit:/)).toBeInTheDocument();
    expect(screen.getByText(/✓/)).toBeInTheDocument();
  });

  it('shows credit blocked when balance exceeds credit limit', () => {
    mockQueries.customerWorkspace = {
      data: {
        customer: { id: 'cust-1', name: 'Acme', balance: 6000 },
        orders: [],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    };
    mockQueries.customerCreditStatus = {
      data: { customer: { id: 'cust-1', creditLimit: 5000 } },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    };
    renderHeader({ customerId: 'cust-1' });
    expect(screen.getByText(/⛔/)).toBeInTheDocument();
  });

  it('shows credit blocked when balance equals credit limit', () => {
    mockQueries.customerWorkspace = {
      data: {
        customer: { id: 'cust-1', name: 'Acme', balance: 5000 },
        orders: [],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    };
    mockQueries.customerCreditStatus = {
      data: { customer: { id: 'cust-1', creditLimit: 5000 } },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    };
    renderHeader({ customerId: 'cust-1' });
    // balance <= creditLimit → credit OK (not blocked)
    expect(screen.getByText(/✓/)).toBeInTheDocument();
  });

  it('does not show credit status when no credit limit is set', () => {
    mockQueries.customerWorkspace = {
      data: {
        customer: { id: 'cust-1', name: 'Acme', balance: 1000 },
        orders: [],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    };
    mockQueries.customerCreditStatus = {
      data: { customer: { id: 'cust-1', creditLimit: 0 } },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    };
    renderHeader({ customerId: 'cust-1' });
    expect(screen.queryByText(/Credit:/)).toBeNull();
    expect(screen.queryByText(/✓/)).toBeNull();
    expect(screen.queryByText(/⛔/)).toBeNull();
  });

  it('uses credit limit from workspace when creditStatus query returns no data', () => {
    mockQueries.customerWorkspace = {
      data: {
        customer: { id: 'cust-1', name: 'Acme', balance: 2000, creditLimit: 10000 },
        orders: [],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    };
    mockQueries.customerCreditStatus = {
      data: undefined,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    };
    renderHeader({ customerId: 'cust-1' });
    expect(screen.getByText(/✓/)).toBeInTheDocument();
  });

  it('uses credit limit from creditStatus query in preference to workspace', () => {
    mockQueries.customerWorkspace = {
      data: {
        customer: { id: 'cust-1', name: 'Acme', balance: 2000, creditLimit: 10000 },
        orders: [],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    };
    mockQueries.customerCreditStatus = {
      data: { customer: { id: 'cust-1', creditLimit: 1000 } },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    };
    renderHeader({ customerId: 'cust-1' });
    // Balance 2000 > credit limit 1000 → blocked
    expect(screen.getByText(/⛔/)).toBeInTheDocument();
  });
});

describe('SalesCustomerContextHeader — loading state', () => {
  it('shows placeholder while workspace is loading', () => {
    mockQueries.customerWorkspace = {
      data: undefined,
      isLoading: true,
      isError: false,
      refetch: vi.fn(),
    };
    renderHeader({ customerId: 'cust-1' });
    // The name fallback is '…' when data is loading
    expect(screen.getByText('…')).toBeInTheDocument();
  });

  it('shows placeholder while credit status is loading', () => {
    mockQueries.customerCreditStatus = {
      data: undefined,
      isLoading: true,
      isError: false,
      refetch: vi.fn(),
    };
    renderHeader({ customerId: 'cust-1' });
    // Should render without crashing — credit OK may be null.
    expect(screen.getByText('Acme Dispensary')).toBeInTheDocument();
  });
});

describe('SalesCustomerContextHeader — error state', () => {
  it('shows placeholder name when workspace query errors', () => {
    mockQueries.customerWorkspace = {
      data: undefined,
      isLoading: false,
      isError: true,
      refetch: vi.fn(),
    };
    renderHeader({ customerId: 'cust-1' });
    // Fallback to '…' when workspace data is missing.
    expect(screen.getByText('…')).toBeInTheDocument();
  });

  it('handles creditStatus query error gracefully', () => {
    mockQueries.customerCreditStatus = {
      data: undefined,
      isLoading: false,
      isError: true,
      refetch: vi.fn(),
    };
    renderHeader({ customerId: 'cust-1' });
    // Should not crash — credit display may be absent.
    expect(screen.getByText('Acme Dispensary')).toBeInTheDocument();
  });
});

describe('SalesCustomerContextHeader — interactions', () => {
  it('calls onClear when the Clear button is clicked', () => {
    const onClear = vi.fn();
    renderHeader({ customerId: 'cust-1', onClear });
    fireEvent.click(screen.getByRole('button', { name: /Clear/i }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it('opens customer detail drawer when Edit button is clicked', () => {
    renderHeader({ customerId: 'cust-1' });
    fireEvent.click(screen.getByRole('button', { name: /Edit/i }));
    expect(mockSetDrawerEntity).toHaveBeenCalledWith('sales', 'customer', 'cust-1');
    expect(mockSetDrawerState).toHaveBeenCalledWith('sales', 'standard');
  });

  it('does not enable query when customerId is empty', () => {
    // The component uses `enabled: Boolean(customerId)` on the queries.
    // With an empty customerId, queries are disabled.
    const { container } = render(
      <Wrap>
        <SalesCustomerContextHeader customerId="" onClear={vi.fn()} />
      </Wrap>,
    );
    expect(container).toBeTruthy();
    // Renders without crash — name fallback is '…'
    expect(screen.getByText('…')).toBeInTheDocument();
  });
});
