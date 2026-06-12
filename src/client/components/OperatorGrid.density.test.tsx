// @vitest-environment jsdom
/**
 * UX-C04 — per-user grid density preference (compact / standard).
 *
 * Contract:
 * 1. uiStore exposes gridDensity ('standard' | 'compact') and setGridDensity.
 * 2. gridDensity defaults to 'standard'.
 * 3. setGridDensity persists the value (included in the partialize list).
 * 4. ColumnsMenu renders both density radio buttons.
 * 5. Clicking 'Compact' calls setGridDensity with 'compact'.
 * 6. Clicking 'Standard' calls setGridDensity with 'standard'.
 * 7. The active button has aria-checked="true".
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReactNode } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ColDef } from 'ag-grid-community';
import type { GridRow } from '../../shared/types';
import { useUiStore } from '../store/uiStore';

vi.mock('ag-grid-react', () => ({
  AgGridReact: () => <div data-testid="ag-grid-stub" />,
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
    error: null,
  };
  const useQueryStub = () => ({ data: undefined, isLoading: false });
  const procProxy: unknown = new Proxy(
    {},
    {
      get() {
        return {
          useQuery: useQueryStub,
          useMutation: () => noopMutation,
          useInfiniteQuery: () => ({ data: undefined, isLoading: false }),
        };
      },
    }
  );
  return {
    trpc: {
      auth: { me: { useQuery: () => ({ data: { id: 'u1', role: 'operator' }, isLoading: false }) } },
      queries: { savedViews: { useQuery: useQueryStub } },
      filters: {
        listSavedFilters: { useQuery: useQueryStub },
        saveFilter: { useMutation: () => noopMutation },
      },
      ...((procProxy as Record<string, unknown>)),
      useUtils: () => ({ filters: { listSavedFilters: { invalidate: vi.fn() } } }),
    },
  };
});

// Minimal WorkspacePanel stub to avoid prop-type issues
vi.mock('./WorkspacePanel', () => ({
  WorkspacePanel: ({ children, actions }: { children: ReactNode; actions?: ReactNode }) => (
    <div>
      {actions}
      {children}
    </div>
  ),
}));

vi.mock('./RowInspector', () => ({ RowInspector: () => null }));
vi.mock('./SelectionSummary', () => ({ SelectionSummary: () => null }));
vi.mock('./EmptyState', () => ({
  EmptyState: ({ title, children }: { title?: string; children?: ReactNode }) => (
    <div data-testid="empty-state">
      {title}
      {children}
    </div>
  ),
}));
vi.mock('./AdvancedFilterBuilder', () => ({ AdvancedFilterBuilder: () => null }));

import { OperatorGrid } from './OperatorGrid';

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={new QueryClient()}>
      {children}
    </QueryClientProvider>
  );
}

const cols: ColDef<GridRow>[] = [{ field: 'id', headerName: 'ID' }];

describe('UX-C04 — grid density preference', () => {
  beforeEach(() => {
    useUiStore.setState({ gridDensity: 'standard' });
  });

  it('uiStore defaults gridDensity to "standard"', () => {
    expect(useUiStore.getState().gridDensity).toBe('standard');
  });

  it('setGridDensity updates gridDensity to "compact"', () => {
    useUiStore.getState().setGridDensity('compact');
    expect(useUiStore.getState().gridDensity).toBe('compact');
  });

  it('setGridDensity updates gridDensity back to "standard"', () => {
    useUiStore.getState().setGridDensity('compact');
    useUiStore.getState().setGridDensity('standard');
    expect(useUiStore.getState().gridDensity).toBe('standard');
  });

  it('renders density toggle buttons in Columns menu', () => {
    render(
      <OperatorGrid
        view="payments"
        title="Test"
        rows={[]}
        columns={cols}
      />,
      { wrapper }
    );

    // Open the Columns menu
    const colBtn = screen.getByTitle('Columns');
    fireEvent.click(colBtn);

    expect(screen.getByRole('radio', { name: 'Standard' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Compact' })).toBeInTheDocument();
  });

  it('Standard button has aria-checked=true when density is standard', () => {
    useUiStore.setState({ gridDensity: 'standard' });
    render(
      <OperatorGrid view="payments" title="Test" rows={[]} columns={cols} />,
      { wrapper }
    );
    const colBtn = screen.getByTitle('Columns');
    fireEvent.click(colBtn);

    const stdBtn = screen.getByRole('radio', { name: 'Standard' });
    expect(stdBtn).toHaveAttribute('aria-checked', 'true');
    const cmpBtn = screen.getByRole('radio', { name: 'Compact' });
    expect(cmpBtn).toHaveAttribute('aria-checked', 'false');
  });

  it('clicking Compact sets gridDensity to compact', () => {
    useUiStore.setState({ gridDensity: 'standard' });
    render(
      <OperatorGrid view="payments" title="Test" rows={[]} columns={cols} />,
      { wrapper }
    );
    const colBtn = screen.getByTitle('Columns');
    fireEvent.click(colBtn);

    const cmpBtn = screen.getByRole('radio', { name: 'Compact' });
    fireEvent.click(cmpBtn);

    expect(useUiStore.getState().gridDensity).toBe('compact');
  });

  it('clicking Standard sets gridDensity to standard', () => {
    useUiStore.setState({ gridDensity: 'compact' });
    render(
      <OperatorGrid view="payments" title="Test" rows={[]} columns={cols} />,
      { wrapper }
    );
    const colBtn = screen.getByTitle('Columns');
    fireEvent.click(colBtn);

    const stdBtn = screen.getByRole('radio', { name: 'Standard' });
    fireEvent.click(stdBtn);

    expect(useUiStore.getState().gridDensity).toBe('standard');
  });
});
