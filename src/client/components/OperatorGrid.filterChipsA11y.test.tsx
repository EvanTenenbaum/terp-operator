// @vitest-environment jsdom
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

const mockRows = [
  { id: '1', customer: 'Acme', amount: 100 } as unknown as GridRow
];

const mockColumns: ColDef<GridRow>[] = [
  {
    colId: 'customer',
    headerName: 'Customer'
  }
];

function Wrap({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('OperatorGrid accessibility (#34): filter chip remove buttons', () => {
  beforeEach(() => {
    useUiStore.setState({ gridFilters: { inventory: 'customer:acme' } });
  });

  it('each filter-chip remove button exposes an aria-label naming the action AND the chip', () => {
    const { container } = render(
      <Wrap>
        <OperatorGrid
          view="inventory"
          title="Inventory"
          rows={mockRows}
          columns={mockColumns}
        />
      </Wrap>
    );
    const chipBox = container.querySelector('[data-testid="grid-filter-chips"]');
    expect(chipBox, 'filter chip container should render when filters are active').not.toBeNull();

    // Exactly the chip-remove buttons (the trailing "Clear filters" button uses
    // .icon-button, not .selection-pill).
    const chipButtons = Array.from(
      chipBox?.querySelectorAll<HTMLButtonElement>('button.selection-pill') ?? []
    );
    expect(chipButtons.length).toBeGreaterThan(0);

    for (const button of chipButtons) {
      const label = button.getAttribute('aria-label');
      expect(
        label,
        `filter chip remove button is missing aria-label. The visible text "field:value" alone reads as a subject, not an action — screen-reader users would not know the button removes the filter. outerHTML=${button.outerHTML}`
      ).toBeTruthy();
      expect(
        label,
        `aria-label should explicitly contain the action verb "Remove" and reference the chip. Got: ${label}`
      ).toMatch(/^Remove .+ filter$/);
    }
  });
});
