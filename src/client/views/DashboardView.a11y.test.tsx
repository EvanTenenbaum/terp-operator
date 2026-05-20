// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

// AG Grid is heavy in jsdom and we don't need its DOM here — replace with a
// stub. The rest of the dashboard (KPIs, money buckets, OperatorGrid shell
// with its quick-filter input) still renders normally.
vi.mock('ag-grid-react', () => ({
  AgGridReact: () => <div data-testid="ag-grid-stub" />
}));

// Stub trpc surface DashboardView + OperatorGrid (and its drawers) consume.
// Specific queries we care about return shaped data; everything else returns
// an empty/loading-style envelope via a Proxy fall-through.
vi.mock('../api/trpc', () => {
  const specificQueries: Record<string, () => unknown> = {
    dashboard: () => ({
      data: {
        metrics: [{ key: 'cash', label: 'Cash', value: 1000, sub: 'liquid' }],
        moneyBuckets: [{ bucket: 'Operating', amount: 1000 }],
        pendingQueues: [{ key: 'intake', label: 'Intake', count: 1 }],
        recentActivity: [],
        health: { ok: true, warnings: [] }
      },
      isLoading: false,
      refetch: () => {}
    }),
    workQueue: () => ({ data: [], isLoading: false }),
    drilldown: () => ({ data: [], isLoading: false }),
    me: () => ({ data: { id: 'u-1', name: 'op', email: 'op@example.test', role: 'operator' } })
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
    error: null
  };

  const procProxy: unknown = new Proxy({}, {
    get(_target, prop: string) {
      return {
        useQuery: makeUseQuery(prop),
        useMutation: () => noopMutation,
        useInfiniteQuery: () => ({ data: undefined, isLoading: false })
      };
    }
  });

  return {
    trpc: {
      auth: { me: { useQuery: makeUseQuery('me') }, logout: { useMutation: () => noopMutation } },
      queries: procProxy,
      credit: procProxy,
      commands: procProxy,
      useContext: () => ({ auth: { me: { invalidate: () => {} } } })
    }
  };
});

import { DashboardView } from './DashboardView';

function Wrap({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('DashboardView accessibility (#34 FE-M3)', () => {
  it('every form control on the dashboard has an accessible name', () => {
    render(
      <Wrap>
        <DashboardView />
      </Wrap>
    );

    // Collect every focusable form control rendered into the dashboard tree.
    const controls = Array.from(
      document.querySelectorAll<HTMLElement>('input, textarea, select')
    );

    // Sanity: we expect at least one control (the OperatorGrid quick filter).
    expect(controls.length).toBeGreaterThan(0);

    for (const control of controls) {
      const ariaLabel = control.getAttribute('aria-label');
      const ariaLabelledBy = control.getAttribute('aria-labelledby');

      // Either a paired <label htmlFor> (queried via accessible name) OR an
      // aria-label / aria-labelledby OR a wrapping <label> whose accessible
      // text content is non-empty. We check explicitly for each.
      const wrappingLabel = control.closest('label');
      const wrappingLabelText = wrappingLabel
        ? (wrappingLabel.textContent ?? '').trim()
        : '';

      const id = control.getAttribute('id');
      const linkedLabel = id
        ? document.querySelector(`label[for="${CSS.escape(id)}"]`)
        : null;
      const linkedLabelText = linkedLabel
        ? (linkedLabel.textContent ?? '').trim()
        : '';

      const hasAccessibleName = Boolean(
        (ariaLabel && ariaLabel.trim()) ||
          (ariaLabelledBy && ariaLabelledBy.trim()) ||
          wrappingLabelText ||
          linkedLabelText
      );

      // Helpful failure message: include outerHTML so the first failing
      // control is easy to find.
      expect(
        hasAccessibleName,
        `Form control missing an accessible name: ${control.outerHTML}`
      ).toBe(true);
    }
  });

  it('promotes section titles to headings (h2/h3) so screen readers can navigate', () => {
    render(
      <Wrap>
        <DashboardView />
      </Wrap>
    );
    // h1 page title must still exist…
    expect(
      screen.getByRole('heading', { level: 1, name: /owner daily decision view/i })
    ).toBeInTheDocument();
    // …AND section titles must be promoted to <h2> elements (was: plain divs).
    const sectionHeadings = screen.getAllByRole('heading', { level: 2 });
    const sectionTitles = sectionHeadings.map((h) => h.textContent?.trim().toLowerCase());
    expect(sectionTitles).toEqual(
      expect.arrayContaining([
        expect.stringContaining('money buckets'),
        expect.stringContaining('pending work queues'),
        expect.stringContaining('recent activity')
      ])
    );
  });
});
