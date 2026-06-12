// @vitest-environment jsdom
/**
 * UX-B04 — CommandPalette entity navigation applies grid filter so the
 * selected row is visible in a virtualized AG Grid.
 *
 * Evidence: navigateEntity() in CommandPalette was missing setGridFilter call.
 * Fix: on entity navigation also call setGridFilter(view, 'id:<id>') so the
 * virtualized grid filters to the single selected row.
 *
 * Tests cover:
 *  (1) After navigateEntity, setGridFilter is called with 'id:<entityId>'.
 *  (2) setSelectedRows is still called (existing behavior preserved).
 *  (3) setDrawerEntity is still called (existing behavior preserved).
 *  (4) The filter is applied for customers (clients view) and vendors (vendors view).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

const mockRunCommand = vi.fn().mockResolvedValue({ ok: true });
vi.mock('./useCommandRunner', () => ({
  useCommandRunner: () => ({ runCommand: mockRunCommand, isRunning: false }),
}));

const SEARCH_RESULTS = {
  groups: {
    customers: [
      { id: 'cust-42', type: 'customer', label: 'Widget Corp', detail: 'Balance $1,200' },
    ],
    vendors: [
      { id: 'vend-7', type: 'vendor', label: 'Best Farms', detail: 'Bill $500' },
    ],
  }
};

vi.mock('../api/trpc', () => {
  const makeQuery = (data: unknown) => ({ data, isLoading: false, isError: false, isFetching: false });
  const noopMutation = {
    mutate: vi.fn(), mutateAsync: async () => ({}),
    isLoading: false, isPending: false, isError: false, isSuccess: false,
    reset: () => {}, data: undefined, error: null,
  };
  const procProxy: unknown = new Proxy({}, {
    get(_t, prop: string) {
      if (prop === 'globalSearch') return { useQuery: () => ({ ...makeQuery(SEARCH_RESULTS), isFetching: false }) };
      if (prop === 'reference') return { useQuery: () => makeQuery({ commands: [], vendors: [] }) };
      if (prop === 'me') return { useQuery: () => makeQuery({ id: 'u1', role: 'manager', name: 'op', email: 'op@x' }) };
      return { useQuery: () => makeQuery(undefined), useMutation: () => noopMutation };
    },
  });
  return {
    trpc: {
      auth: { me: { useQuery: () => makeQuery({ id: 'u1', role: 'manager', name: 'op', email: 'op@x' }) } },
      queries: procProxy,
      commands: procProxy,
      useContext: () => ({ auth: { me: { invalidate: () => {} } } }),
    },
  };
});

import { useUiStore } from '../store/uiStore';
import { CommandPalette } from './CommandPalette';

function Wrap({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <MemoryRouter>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  mockNavigate.mockClear();
  mockRunCommand.mockClear();
  useUiStore.setState({
    commandPaletteOpen: true,
    commandPaletteTab: 'entities',
    gridFilters: {},
    activeDrawerEntityByView: {},
    selectedRows: {},
    drawerByView: {},
    activeView: 'dashboard',
  });
});

describe('UX-B04 — Entity navigation applies grid filter for row visibility', () => {
  it('sets gridFilter to id:<entityId> for a customer entity navigation', async () => {
    render(
      <Wrap>
        <CommandPalette />
      </Wrap>
    );

    // Type into entity search to trigger results
    const input = screen.getByRole('textbox', { name: /entity search/i });
    fireEvent.change(input, { target: { value: 'Widget' } });

    // Wait for debounce and result render (mock returns immediately)
    await waitFor(() => {
      const btn = screen.queryByRole('button', { name: /widget corp/i });
      expect(btn).not.toBeNull();
    });

    const customerBtn = screen.getByRole('button', { name: /widget corp/i });
    fireEvent.click(customerBtn);

    const gridFilters = useUiStore.getState().gridFilters;
    expect(gridFilters['clients']).toBe('id:cust-42');
  });

  it('sets gridFilter to id:<entityId> for a vendor entity navigation', async () => {
    render(
      <Wrap>
        <CommandPalette />
      </Wrap>
    );

    const input = screen.getByRole('textbox', { name: /entity search/i });
    fireEvent.change(input, { target: { value: 'Best' } });

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /best farms/i })).not.toBeNull();
    });

    const vendorBtn = screen.getByRole('button', { name: /best farms/i });
    fireEvent.click(vendorBtn);

    const gridFilters = useUiStore.getState().gridFilters;
    expect(gridFilters['vendors']).toBe('id:vend-7');
  });

  it('still calls setSelectedRows on entity navigation (existing behavior preserved)', async () => {
    render(
      <Wrap>
        <CommandPalette />
      </Wrap>
    );

    const input = screen.getByRole('textbox', { name: /entity search/i });
    fireEvent.change(input, { target: { value: 'Widget' } });

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /widget corp/i })).not.toBeNull();
    });

    fireEvent.click(screen.getByRole('button', { name: /widget corp/i }));

    const { selectedRows } = useUiStore.getState();
    expect(selectedRows['clients']?.[0]?.id).toBe('cust-42');
  });

  it('still opens the drawer entity on entity navigation (existing behavior preserved)', async () => {
    render(
      <Wrap>
        <CommandPalette />
      </Wrap>
    );

    const input = screen.getByRole('textbox', { name: /entity search/i });
    fireEvent.change(input, { target: { value: 'Widget' } });

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /widget corp/i })).not.toBeNull();
    });

    fireEvent.click(screen.getByRole('button', { name: /widget corp/i }));

    const { activeDrawerEntityByView } = useUiStore.getState();
    expect(activeDrawerEntityByView['clients']).toMatchObject({ entityId: 'cust-42' });
  });
});
