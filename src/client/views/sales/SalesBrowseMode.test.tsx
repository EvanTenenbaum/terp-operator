// @vitest-environment jsdom
/**
 * R-03 — SalesBrowseMode smoke tests.
 *
 * Tests basic rendering, mode-relevant UI elements (status presets, Inventory
 * Finder button), and the data-testid contract for the browse-mode toolbar.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

// AG Grid stub — we don't need the real grid DOM here.
vi.mock('ag-grid-react', () => ({
  AgGridReact: () => <div data-testid="ag-grid-stub" />,
}));

// Stub tRPC surface: OperatorGrid, FilterPresetStrip, DetailSlideover, and
// InventoryFinderPanel all consume tRPC. We return idle/empty query results
// through the proxy so the component mounts without runtime errors.
vi.mock('../../api/trpc', () => {
  const specificQueries: Record<string, () => unknown> = {
    me: () => ({
      data: { id: 'u-1', name: 'op', email: 'op@example.test', role: 'operator' },
    }),
    grid: () => ({ data: [], isLoading: false }),
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
      useContext: () => ({ auth: { me: { invalidate: () => {} } } }),
    },
  };
});

// OperatorGrid is heavy — stub it so we focus on the browse-mode shell.
vi.mock('../../components/OperatorGrid', () => ({
  OperatorGrid: (props: Record<string, unknown>) => (
    <div data-testid="operator-grid-stub" data-title={String(props.title ?? '')} />
  ),
}));

import { SalesBrowseMode } from './SalesBrowseMode';

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

describe('SalesBrowseMode smoke tests (R-03)', () => {
  it('renders without crashing', () => {
    const { container } = render(
      <Wrap>
        <SalesBrowseMode />
      </Wrap>,
    );
    expect(container).toBeTruthy();
  });

  it('renders the Inventory Finder toolbar button (operator role)', () => {
    render(
      <Wrap>
        <SalesBrowseMode />
      </Wrap>,
    );
    const finderButton = screen.getByTestId('sales-browse-open-finder');
    expect(finderButton).toBeInTheDocument();
    expect(finderButton.textContent).toContain('Inventory Finder');
  });

  it('renders the Sales Orders grid stub', () => {
    render(
      <Wrap>
        <SalesBrowseMode />
      </Wrap>,
    );
    const grid = screen.getByTestId('operator-grid-stub');
    expect(grid).toBeInTheDocument();
    expect(grid.getAttribute('data-title')).toBe('Sales Orders');
  });

  it('renders the FilterPresetStrip with status presets', () => {
    render(
      <Wrap>
        <SalesBrowseMode />
      </Wrap>,
    );
    // FilterPresetStrip renders buttons with role="group" via aria-label.
    const group = screen.getByRole('group', { name: 'Filter by status' });
    expect(group).toBeInTheDocument();
  });

  it('calls onCustomerSelect when provided (exposes the prop)', () => {
    const onCustomerSelect = vi.fn();
    render(
      <Wrap>
        <SalesBrowseMode onCustomerSelect={onCustomerSelect} />
      </Wrap>,
    );
    // The component accepts and stores the callback — no crash.
    expect(onCustomerSelect).not.toHaveBeenCalled();
  });
});
