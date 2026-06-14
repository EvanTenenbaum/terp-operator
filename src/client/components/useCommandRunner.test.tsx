// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

// Capture the onSuccess callback registered with useMutation so tests can
// invoke it without needing a full tRPC pipeline. This is the cleanest way to
// assert that the hook calls queryClient.invalidateQueries with the correct
// predicate when a command completes.
type OnSuccessFn = (result: { ok: boolean; affectedIds: string[]; commandId: string; toast?: string }) => Promise<void> | void;
let registeredOnSuccess: OnSuccessFn | null = null;
const mutateAsync = vi.fn().mockResolvedValue({ ok: true, affectedIds: [], commandId: 'cmd-test' });

vi.mock('../api/trpc', () => ({
  trpc: {
    commands: {
      run: {
        useMutation: (opts: { onSuccess?: OnSuccessFn; onError?: (error: unknown) => void }) => {
          registeredOnSuccess = opts.onSuccess ?? null;
          return { mutateAsync, isLoading: false };
        }
      }
    }
  }
}));

const pushToast = vi.fn();
vi.mock('../store/uiStore', () => ({
  useUiStore: (selector: (state: { pushToast: typeof pushToast }) => unknown) =>
    selector({ pushToast })
}));

import { useCommandRunner, buildAffectedQueryPredicate } from './useCommandRunner';

function wrapperFactory(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <MemoryRouter><QueryClientProvider client={queryClient}>{children}</QueryClientProvider></MemoryRouter>;
  };
}

describe('buildAffectedQueryPredicate', () => {
  it('returns true when query key contains one of the affected ids', () => {
    const predicate = buildAffectedQueryPredicate(['11111111-2222-3333-4444-555555555555']);
    expect(
      predicate({
        queryKey: [['queries', 'salesOrderLines'], { input: { orderId: '11111111-2222-3333-4444-555555555555' }, type: 'query' }]
      } as never)
    ).toBe(true);
  });

  it('returns false for unrelated query keys', () => {
    const predicate = buildAffectedQueryPredicate(['11111111-2222-3333-4444-555555555555']);
    expect(
      predicate({
        queryKey: [['queries', 'reference'], { type: 'query' }]
      } as never)
    ).toBe(false);
  });

  it('returns false (no wide-net invalidation) when affectedIds is empty', () => {
    const predicate = buildAffectedQueryPredicate([]);
    expect(
      predicate({
        queryKey: [['queries', 'reference'], { type: 'query' }]
      } as never)
    ).toBe(false);
    expect(
      predicate({
        queryKey: [['queries', 'grid'], { input: { view: 'sales' }, type: 'query' }]
      } as never)
    ).toBe(false);
  });

  it('matches affected ids appearing anywhere in the serialized key (input, args, params)', () => {
    const predicate = buildAffectedQueryPredicate(['aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee']);
    expect(
      predicate({
        queryKey: [['queries', 'customerWorkspace'], { input: { customerId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' }, type: 'query' }]
      } as never)
    ).toBe(true);
    expect(
      predicate({
        queryKey: [['queries', 'batchMediaList'], { input: { batchId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' }, type: 'query' }]
      } as never)
    ).toBe(true);
  });

  it('handles multiple affected ids — any match invalidates', () => {
    const predicate = buildAffectedQueryPredicate(['id-one', 'id-two']);
    expect(
      predicate({
        queryKey: [['queries', 'relatedCommands'], { input: { entityId: 'id-two' }, type: 'query' }]
      } as never)
    ).toBe(true);
    expect(
      predicate({
        queryKey: [['queries', 'reference'], { type: 'query' }]
      } as never)
    ).toBe(false);
  });
});

describe('useCommandRunner', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    registeredOnSuccess = null;
    mutateAsync.mockClear();
    pushToast.mockClear();
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('invalidates only queries whose key references an affectedId; leaves unrelated queries untouched', async () => {
    const targetId = '11111111-2222-3333-4444-555555555555';

    // Seed two queries: one references the affected id, one does not.
    const affectedKey = [['queries', 'salesOrderLines'], { input: { orderId: targetId }, type: 'query' }] as const;
    const unrelatedKey = [['queries', 'reference'], { type: 'query' }] as const;

    queryClient.setQueryData(affectedKey, { stale: false });
    queryClient.setQueryData(unrelatedKey, { stale: false });

    renderHook(() => useCommandRunner(), { wrapper: wrapperFactory(queryClient) });
    expect(registeredOnSuccess).not.toBeNull();

    await act(async () => {
      await registeredOnSuccess!({ ok: true, affectedIds: [targetId], commandId: 'cmd-1', toast: 'ok' });
    });

    const affected = queryClient.getQueryState(affectedKey as never);
    const unrelated = queryClient.getQueryState(unrelatedKey as never);

    expect(affected?.isInvalidated).toBe(true);
    expect(unrelated?.isInvalidated).toBe(false);
  });

  it('does NOT trigger wide-net invalidation when affectedIds is empty', async () => {
    const unrelatedKey = [['queries', 'reference'], { type: 'query' }] as const;
    queryClient.setQueryData(unrelatedKey, { stale: false });

    renderHook(() => useCommandRunner(), { wrapper: wrapperFactory(queryClient) });

    await act(async () => {
      await registeredOnSuccess!({ ok: true, affectedIds: [], commandId: 'cmd-2', toast: 'ok' });
    });

    const unrelated = queryClient.getQueryState(unrelatedKey as never);
    expect(unrelated?.isInvalidated).toBe(false);
  });

  it('pushes a toast on success', async () => {
    renderHook(() => useCommandRunner(), { wrapper: wrapperFactory(queryClient) });

    await act(async () => {
      await registeredOnSuccess!({ ok: true, affectedIds: [], commandId: 'cmd-3', toast: 'Done.' });
    });

    expect(pushToast).toHaveBeenCalledWith('Done.', 'success');
  });

  it('invalidates queries that match any of several affectedIds', async () => {
    const idA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    const idB = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
    const keyA = [['queries', 'salesOrderLines'], { input: { orderId: idA }, type: 'query' }] as const;
    const keyB = [['queries', 'customerWorkspace'], { input: { customerId: idB }, type: 'query' }] as const;
    const keyOther = [['queries', 'reference'], { type: 'query' }] as const;

    queryClient.setQueryData(keyA, {});
    queryClient.setQueryData(keyB, {});
    queryClient.setQueryData(keyOther, {});

    renderHook(() => useCommandRunner(), { wrapper: wrapperFactory(queryClient) });

    await act(async () => {
      await registeredOnSuccess!({ ok: true, affectedIds: [idA, idB], commandId: 'cmd-4', toast: 'ok' });
    });

    expect(queryClient.getQueryState(keyA as never)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(keyB as never)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(keyOther as never)?.isInvalidated).toBe(false);
  });

  it('does not throw when onSuccess fires with empty affectedIds and no queries exist', async () => {
    renderHook(() => useCommandRunner(), { wrapper: wrapperFactory(queryClient) });
    await expect(
      act(async () => {
        await registeredOnSuccess!({ ok: true, affectedIds: [], commandId: 'cmd-5' });
      })
    ).resolves.toBeUndefined();
  });
});

// ── EXT-REVIEW 2026-06 finding #3: command-scoped family invalidation ─────────
import { invalidateCommandScopedQueries, COMMAND_SCOPED_QUERY_FAMILIES } from './useCommandRunner';

describe('invalidateCommandScopedQueries (external review finding #3)', () => {
  it('invalidates grid/dashboard/workQueue families whose keys contain no entity ids', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const gridKey = [['queries', 'grid'], { input: { view: 'orders' }, type: 'query' }] as const;
    const dashKey = [['queries', 'dashboard'], { type: 'query' }] as const;
    const refKey = [['queries', 'reference'], { type: 'query' }] as const;
    qc.setQueryData(gridKey, []);
    qc.setQueryData(dashKey, {});
    qc.setQueryData(refKey, {});

    await invalidateCommandScopedQueries(qc);

    expect(qc.getQueryState(gridKey as never)?.isInvalidated).toBe(true);
    expect(qc.getQueryState(dashKey as never)?.isInvalidated).toBe(true);
    // Static catalog data is deliberately NOT in the command-scoped families.
    expect(qc.getQueryState(refKey as never)?.isInvalidated).toBe(false);
    qc.clear();
  });

  it('family list excludes queries.reference', () => {
    expect(COMMAND_SCOPED_QUERY_FAMILIES.some((f) => f.join('.') === 'queries.reference')).toBe(false);
  });

  it('runs after a successful command so the active grid refetches without a page refresh', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const gridKey = [['queries', 'grid'], { input: { view: 'sales' }, type: 'query' }] as const;
    qc.setQueryData(gridKey, []);
    registeredOnSuccess = null;
    renderHook(() => useCommandRunner(), { wrapper: wrapperFactory(qc) });
    await act(async () => {
      await registeredOnSuccess!({ ok: true, affectedIds: [], commandId: 'cmd-x', toast: 'ok' });
    });
    expect(qc.getQueryState(gridKey as never)?.isInvalidated).toBe(true);
    qc.clear();
  });
});
