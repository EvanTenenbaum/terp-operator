// @vitest-environment jsdom
/**
 * R-03 — SalesBuildMode smoke tests.
 *
 * Tests build mode rendering with a customer context header (UX-7), the
 * Inventory Finder toolbar button, and the Customer Draft Lines grid.
 * Uses the same tRPC/AG Grid stubs as SalesBrowseMode.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

// AG Grid stub.
vi.mock('ag-grid-react', () => ({
  AgGridReact: () => <div data-testid="ag-grid-stub" />,
}));

vi.mock('../../api/trpc', () => {
  const specificQueries: Record<string, () => unknown> = {
    me: () => ({
      data: { id: 'u-1', name: 'op', email: 'op@example.test', role: 'operator' },
    }),
    reference: () => ({
      data: {
        customers: [],
        availableBatches: [],
        defaultPricingRule: null,
        refereeRelationships: [],
      },
      isLoading: false,
    }),
    customerWorkspace: () => ({
      data: {
        orders: [{ id: 'order-1', status: 'draft', total: 0, lines: 0 }],
        customer: { balance: 0, creditLimit: 5000 },
      },
      isLoading: false,
    }),
    salesOrderLines: () => ({ data: [], isLoading: false }),
  };

  function makeUseQuery(name: string) {
    return (..._args: unknown[]) =>
      specificQueries[name] ? specificQueries[name]() : { data: undefined, isLoading: false };
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
      auth: { me: { useQuery: makeUseQuery('me') }, logout: { useMutation: () => noopMutation } },
      queries: procProxy,
      credit: procProxy,
      commands: procProxy,
      salesOrders: procProxy,
      useContext: () => ({ auth: { me: { invalidate: () => {} } } }),
    },
  };
});

vi.mock('../../components/OperatorGrid', () => ({
  OperatorGrid: (props: Record<string, unknown>) => (
    <div data-testid="operator-grid-stub" data-title={String(props.title ?? '')} />
  ),
}));

// SalesCustomerContextHeader — separate component; stub inline.
vi.mock('./SalesCustomerContextHeader', () => ({
  SalesCustomerContextHeader: (props: Record<string, unknown>) => (
    <div data-testid="customer-context-header-stub" data-customer-id={String(props.customerId ?? '')}>
      <button type="button" data-testid="clear-customer-btn" onClick={() => (props.onClear as () => void)?.()}>
        Clear
      </button>
    </div>
  ),
}));

// SalePrePostStrip stub — replace the component but preserve other exports
// (duplicateSourceLineIds, SalePrePostLine) that useSalesLineRows consumes.
vi.mock('../../components/SalePrePostStrip', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../components/SalePrePostStrip')>();
  return {
    ...actual,
    SalePrePostStrip: () => <div data-testid="pre-post-strip-stub" />,
  };
});

import { SalesBuildMode } from './SalesBuildMode';

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

describe('SalesBuildMode smoke tests (R-03)', () => {
  const baseProps = {
    customerId: 'cust-001',
    onClear: vi.fn(),
  };

  it('renders without crashing', () => {
    const { container } = render(
      <Wrap>
        <SalesBuildMode {...baseProps} />
      </Wrap>,
    );
    expect(container).toBeTruthy();
  });

  it('renders the SalesCustomerContextHeader', () => {
    render(
      <Wrap>
        <SalesBuildMode {...baseProps} />
      </Wrap>,
    );
    const header = screen.getByTestId('customer-context-header-stub');
    expect(header).toBeInTheDocument();
    expect(header.getAttribute('data-customer-id')).toBe('cust-001');
  });

  it('renders the Inventory Finder toolbar button in build mode', () => {
    render(
      <Wrap>
        <SalesBuildMode {...baseProps} />
      </Wrap>,
    );
    const finderButton = screen.getByTestId('sales-build-open-finder');
    expect(finderButton).toBeInTheDocument();
    expect(finderButton.textContent).toContain('Inventory Finder');
  });

  it('renders the Customer Draft Lines grid', () => {
    render(
      <Wrap>
        <SalesBuildMode {...baseProps} />
      </Wrap>,
    );
    const grid = screen.getByTestId('operator-grid-stub');
    expect(grid).toBeInTheDocument();
    expect(grid.getAttribute('data-title')).toBe('Customer Draft Lines');
  });

  it('calls onClear when the clear button in the header is clicked', () => {
    const onClear = vi.fn();
    render(
      <Wrap>
        <SalesBuildMode customerId="cust-001" onClear={onClear} />
      </Wrap>,
    );
    screen.getByTestId('clear-customer-btn').click();
    expect(onClear).toHaveBeenCalledTimes(1);
  });
});
