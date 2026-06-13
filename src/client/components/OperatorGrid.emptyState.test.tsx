// @vitest-environment jsdom
/**
 * UX-A05 — neutral default empty-state copy.
 *
 * The previous fallback ("Create or import rows, then mark them Ready when
 * they can be posted.") was intake-specific advice rendered on every view
 * that did not pass custom empties (Payments, Closeout, Clients, …). The
 * default children must be neutral; per-view tailored empties are a later
 * wave (UX-D03).
 *
 * Also pins the UX-A07 contract: the quick-filter input carries
 * `data-grid-quick-filter` so the '/' hotkey (Hotkeys.tsx) can focus it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReactNode } from 'react';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ColDef } from 'ag-grid-community';
import type { GridRow } from '../../shared/types';
import { useUiStore } from '../store/uiStore';

vi.mock('ag-grid-react', () => ({
  AgGridReact: () => <div data-testid="ag-grid-stub" />
}));

vi.mock('../api/trpc', () => {
  const noopMutation = {
    mutate: () => {},
    mutateAsync: async () => ({}),
    isLoading: false,
    isPending: false,
    isError: false,
    isSuccess: false,
    reset: () => {},
    data: undefined,
    error: null
  };
  const useQueryStub = () => ({ data: undefined, isLoading: false });
  const procProxy: unknown = new Proxy(
    {},
    {
      get() {
        return {
          useQuery: useQueryStub,
          useMutation: () => noopMutation,
          useInfiniteQuery: () => ({ data: undefined, isLoading: false })
        };
      }
    }
  );
  return {
    trpc: {
      auth: {
        me: {
          useQuery: () => ({
            data: { id: 'u-1', name: 'op', email: 'op@example.test', role: 'operator' }
          })
        }
      },
      queries: procProxy,
      credit: procProxy,
      commands: procProxy,
      useContext: () => ({ auth: { me: { invalidate: () => {} } } })
    }
  };
});

import { OperatorGrid } from './OperatorGrid';

const mockColumns: ColDef<GridRow>[] = [{ colId: 'customer', headerName: 'Customer' }];

function Wrap({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('OperatorGrid default empty state (UX-A05)', () => {
  beforeEach(() => {
    useUiStore.setState({ gridFilters: {} });
  });

  it('renders neutral default copy, not intake-specific advice', () => {
    const { container } = render(
      <Wrap>
        <OperatorGrid view="payments" title="Payments" rows={[]} columns={mockColumns} />
      </Wrap>
    );
    expect(container.textContent).toContain('No rows yet');
    expect(container.textContent).toContain('No rows match the current view.');
    expect(container.textContent).not.toContain('mark them Ready when they can be posted');
  });

  it('still honors per-view emptyTitle/emptyChildren overrides', () => {
    const { container } = render(
      <Wrap>
        <OperatorGrid
          view="payments"
          title="Payments"
          rows={[]}
          columns={mockColumns}
          emptyTitle="No payments yet"
          emptyChildren="Press Money In to log the first payment."
        />
      </Wrap>
    );
    expect(container.textContent).toContain('No payments yet');
    expect(container.textContent).toContain('Press Money In to log the first payment.');
    expect(container.textContent).not.toContain('No rows match the current view.');
  });

  it('exposes the quick-filter input for the / hotkey (UX-A07)', () => {
    const { container } = render(
      <Wrap>
        <OperatorGrid view="payments" title="Payments" rows={[]} columns={mockColumns} />
      </Wrap>
    );
    const input = container.querySelector('input[data-grid-quick-filter]');
    expect(input, 'quick-filter input must carry data-grid-quick-filter').not.toBeNull();
  });
});
