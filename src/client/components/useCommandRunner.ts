import { useQueryClient, type Query, type QueryClient } from '@tanstack/react-query';
import { trpc } from '../api/trpc';
import { useUiStore } from '../store/uiStore';
import type { CommandName } from '../../shared/commandCatalog';

/**
 * Build a predicate that matches any React Query whose key contains one of
 * the supplied affected ids. This is intentionally simple: we stringify the
 * key and do substring matches. It's lossy (a UUID could in theory collide
 * with another UUID's text), but it's vastly better than the previous
 * "invalidate everything" behavior — and UUID collisions are not a real risk.
 *
 * Returns a predicate that is ALWAYS false when `affectedIds` is empty, so
 * commands that report no affected entities do not refetch the entire cache.
 *
 * Follow-up (#44): consider migrating to an explicit command-name -> query-path
 * map for stronger guarantees (e.g. invalidate `queries.reference` after
 * `createVendor` even though the new vendor id is in `affectedIds`). For now,
 * targeted invalidation by id is the agreed minimum bar.
 */
export function buildAffectedQueryPredicate(affectedIds: readonly string[]): (query: Query) => boolean {
  if (!affectedIds || affectedIds.length === 0) {
    return () => false;
  }
  const ids = affectedIds.filter((id) => typeof id === 'string' && id.length > 0);
  if (ids.length === 0) {
    return () => false;
  }
  return (query: Query) => {
    let serialized: string;
    try {
      serialized = JSON.stringify(query.queryKey);
    } catch {
      return false;
    }
    for (const id of ids) {
      if (serialized.includes(id)) return true;
    }
    return false;
  };
}

/**
 * Invalidate React Query caches whose keys reference any of the supplied
 * affected ids. Exported so the WebSocket cross-tab listener in App.tsx can
 * apply the same targeted strategy.
 *
 * No-op when affectedIds is empty.
 */
export function invalidateAffectedQueries(queryClient: QueryClient, affectedIds: readonly string[]): Promise<void> {
  if (!affectedIds || affectedIds.length === 0) {
    return Promise.resolve();
  }
  const predicate = buildAffectedQueryPredicate(affectedIds);
  return queryClient.invalidateQueries({ predicate });
}

/**
 * EXT-REVIEW 2026-06 finding #3 ("pages must be constantly refreshed").
 *
 * The id-substring predicate above only reaches queries whose KEY contains an
 * affected entity UUID. The main list/aggregate surfaces — `queries.grid`
 * (every operator view), the dashboard KPIs, the work queue, the credit-review
 * queue — are keyed by view name or by nothing, so they were NEVER invalidated
 * after a command. Operators had to hard-refresh the page to see their own
 * writes reflected in the grid. This is the explicit command-scoped follow-up
 * promised in #44.
 *
 * These families are list/aggregate projections that any successful command
 * can change. Invalidation marks them stale; React Query only refetches the
 * ones that are actively mounted (default refetchType 'active'), so the cost
 * per command is one refetch of the current view's list — bounded and cheap.
 *
 * `queries.reference` (static catalog data) is deliberately excluded.
 */
export const COMMAND_SCOPED_QUERY_FAMILIES: readonly string[][] = [
  ['queries', 'grid'],
  ['queries', 'dashboard'],
  ['queries', 'workQueue'],
  ['queries', 'myDrafts'],
  ['queries', 'creditWatchlist'],
  ['queries', 'intakeQueue'],
  ['queries', 'pickQueue'],
  ['queries', 'photographyQueue'],
  ['credit'],
];

export function invalidateCommandScopedQueries(queryClient: QueryClient): Promise<void> {
  return Promise.all(
    COMMAND_SCOPED_QUERY_FAMILIES.map((family) =>
      queryClient.invalidateQueries({ queryKey: [family] })
    )
  ).then(() => undefined);
}

export function useCommandRunner() {
  const queryClient = useQueryClient();
  const pushToast = useUiStore((state) => state.pushToast);
  const mutation = trpc.commands.run.useMutation({
    onSuccess: async (result) => {
      pushToast(result.toast ?? (result.ok ? 'Command completed.' : 'Command failed.'), result.ok ? 'success' : 'error');
      // TER-1659: Advisory warnings (e.g. credit limit exceeded, below-floor
      // pricing) are surfaced as additional info toasts. The command still
      // succeeded — these are not errors.
      if (result.warnings && result.warnings.length > 0) {
        for (const warning of result.warnings) {
          pushToast(warning, 'info');
        }
      }
      // Targeted invalidation — only queries that reference one of the
      // affected entity ids are refetched. See #44 (and the original UX-03
      // recommendation in #13) for why this matters: the previous
      // `invalidateQueries()` call refetched every cached query on every
      // command, by every operator, across every view.
      await invalidateAffectedQueries(queryClient, result.affectedIds ?? []);
      // EXT-REVIEW 2026-06 #3: list/aggregate families are not reachable by the
      // id predicate (their keys contain no entity UUIDs) — refresh them too.
      await invalidateCommandScopedQueries(queryClient);
    },
    onError: (error) => pushToast(error.message, 'error')
  });

  return {
    // `reason` is mandatory: every command write is journaled with actor +
    // idempotency key + reason (issue #25). Callers that legitimately lack
    // a user-supplied reason MUST still pass an explicit internal default
    // (e.g. `Internal: ${commandName}`) so the audit row is never NULL.
    runCommand: (name: CommandName, payload: Record<string, unknown> = {}, reason?: string) =>
      mutation.mutateAsync({
        name,
        payload,
        reason: reason && reason.trim().length >= 3 ? reason : `Internal: ${name}`,
        idempotencyKey: `${name}-${crypto.randomUUID()}`
      }),
    isRunning: mutation.isLoading
  };
}
