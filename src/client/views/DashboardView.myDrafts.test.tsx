// @vitest-environment jsdom
// TER-1632 — "Your drafts (N)" dashboard row.
// Verifies that the section is shown when the current user has draft items,
// and that each draft row is rendered with a navigable button.
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('ag-grid-react', () => ({
  AgGridReact: () => <div data-testid="ag-grid-stub" />
}));

// Two draft items owned by the current user: one SO and one PO.
const DRAFT_SO = {
  id: 'draft-so-1',
  route: 'orders',
  lane: 'Sales',
  title: 'SO-0042',
  status: 'draft',
  createdAt: '2026-05-01T00:00:00Z',
  detail: 'Acme Corp / $500',
  type: 'salesOrder',
};

const DRAFT_PO = {
  id: 'draft-po-1',
  route: 'purchaseOrders',
  lane: 'Purchase',
  title: 'PO-0099',
  status: 'draft',
  createdAt: '2026-04-30T00:00:00Z',
  detail: 'Some Vendor / $200',
  type: 'purchaseOrder',
};

// Mock trpc with two drafts for the current user and an empty workQueue.
vi.mock('../api/trpc', () => {
  const specificQueries: Record<string, () => unknown> = {
    dashboard: () => ({
      data: {
        metrics: [],
        moneyBuckets: [],
        pendingQueues: [],
        recentActivity: [],
        health: { ok: true, warnings: [] },
      },
      isLoading: false,
      refetch: () => {},
    }),
    workQueue: () => ({ data: [], isLoading: false, refetch: () => {} }),
    drilldown: () => ({ data: [], isLoading: false }),
    // The current user has two drafts returned by the server-side query.
    myDrafts: () => ({ data: [DRAFT_SO, DRAFT_PO], isLoading: false }),
    me: () => ({
      data: { id: 'u-owner', name: 'Owner', email: 'owner@example.test', role: 'operator' },
    }),
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
    }
  );

  return {
    trpc: {
      auth: {
        me: { useQuery: makeUseQuery('me') },
        logout: { useMutation: () => noopMutation },
      },
      queries: procProxy,
      credit: procProxy,
      commands: procProxy,
      useContext: () => ({ auth: { me: { invalidate: () => {} } } }),
    },
  };
});

import { DashboardView } from '../templates/DashboardView';

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

describe('DashboardView — Your drafts (TER-1632)', () => {
  it('renders the "Your drafts (2)" panel heading when the user has two drafts', () => {
    render(
      <Wrap>
        <DashboardView />
      </Wrap>
    );
    expect(
      screen.getByRole('heading', { level: 2, name: /your drafts \(2\)/i })
    ).toBeInTheDocument();
  });

  it('renders a navigable button for each draft item', () => {
    render(
      <Wrap>
        <DashboardView />
      </Wrap>
    );
    // Each row shows lane + title; verify both drafts appear.
    expect(screen.getByText(/SO-0042/)).toBeInTheDocument();
    expect(screen.getByText(/PO-0099/)).toBeInTheDocument();
  });

  it('both draft rows have clickable queue-row buttons', () => {
    render(
      <Wrap>
        <DashboardView />
      </Wrap>
    );
    // Verify each draft item is rendered as a button (navigable row).
    const buttons = screen.getAllByRole('button');
    const draftButtons = buttons.filter(
      (b) => b.textContent?.includes('SO-0042') || b.textContent?.includes('PO-0099')
    );
    expect(draftButtons).toHaveLength(2);
  });
});
