import { useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient, type Query, type QueryClient } from '@tanstack/react-query';
import { trpc } from '../api/trpc';
import { useUiStore } from '../store/uiStore';
import type { ToastAction } from '../store/uiStore';
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
  ['queries', 'paymentAllocations'],
  ['credit'],
];

export function invalidateCommandScopedQueries(queryClient: QueryClient): Promise<void> {
  return Promise.all(
    COMMAND_SCOPED_QUERY_FAMILIES.map((family) =>
      queryClient.invalidateQueries({ queryKey: [family] })
    )
  ).then(() => undefined);
}

// UX-D01: Per-call success action registration. Callers invoke
// `setNextSuccessActions(actions)` immediately before `runCommand(...)` in the
// same synchronous block. The hook captures the actions in a mutable variable
// (the same pattern used for _pendingCallContext below) and attaches them to
// the success toast. This keeps the runCommand call signature at 3 args so
// all existing call sites and tests compile and pass unchanged.
//
// Note: RunCommandOpts is kept for external type consumers and possible future
// use, but successActions are now registered via setNextSuccessActions.
export interface RunCommandOpts {
  successActions?: ToastAction[];
}

/**
 * SX-I04: Humanize raw command errors (often Zod JSON) into operator-friendly
 * one-liners. Preserves the original `errorMessage` for "Copy details" so the
 * full raw JSON is still available in the clipboard.
 */
function humanizeCommandError(errorMessage: string): string {
  try {
    const parsed = JSON.parse(errorMessage);
    if (Array.isArray(parsed) && parsed.length > 0) {
      const first = parsed[0];
      const field = String(first.path?.join('.') ?? 'value');
      const issues = parsed.length > 1 ? ` (+${parsed.length - 1} more)` : '';
      return `Invalid ${field}: ${first.message ?? 'check input'}${issues}`;
    }
  } catch {}
  return errorMessage;
}

export function useCommandRunner() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const pushToast = useUiStore((state) => state.pushToast);
  const setActiveView = useUiStore((state) => state.setActiveView);
  const setGridFilter = useUiStore((state) => state.setGridFilter);

  // UX-D02: Build error toast actions — "Copy details" copies the command name,
  // idempotency key, and message to the clipboard; "Open in Recovery" navigates
  // to the recovery view filtered to the failed command.
  function buildErrorActions(commandName: string, idempotencyKey: string, errorMessage: string): ToastAction[] {
    return [
      {
        label: 'Copy details',
        onAction: () => {
          const text = `Command: ${commandName}\nKey: ${idempotencyKey}\nError: ${errorMessage}`;
          void navigator.clipboard.writeText(text);
        }
      },
      {
        label: 'Open in Recovery',
        onAction: () => {
          setGridFilter('recovery', commandName);
          navigate('/recovery');
          setActiveView('recovery');
        }
      }
    ];
  }

  // Capture current call context for the onError/onSuccess closures.
  // Uses useRef so the mutation callbacks always see the latest per-call
  // opts without stale closures and without being cleared by re-renders
  // (the previous render-scoped let was nulled when isPending flipped,
  // causing toast action buttons to never render).
  // UX-D01: successActions are staged here by setNextSuccessActions
  // (called just before runCommand) then consumed in onSuccess and cleared.
  const _pendingCallContextRef = useRef<{
    name: CommandName;
    idempotencyKey: string;
    successActions?: ToastAction[];
  } | null>(null);

  const mutation = trpc.commands.run.useMutation({
    onSuccess: async (result) => {
      const successActions = _pendingCallContextRef.current?.successActions;
      const toastOpts = result.ok && successActions?.length ? { actions: successActions } : undefined;
      if (toastOpts) {
        pushToast(result.toast ?? (result.ok ? 'Command completed.' : 'Command failed.'), result.ok ? 'success' : 'error', toastOpts);
      } else {
        pushToast(result.toast ?? (result.ok ? 'Command completed.' : 'Command failed.'), result.ok ? 'success' : 'error');
      }
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
    onError: (error) => {
      const ctx = _pendingCallContextRef.current;
      // SX-I04: humanize the toast message; keep buildErrorActions using the
      // original raw message so "Copy details" preserves the full JSON.
      const humanized = humanizeCommandError(error.message);
      if (ctx) {
        const errorActions = buildErrorActions(ctx.name, ctx.idempotencyKey, error.message);
        pushToast(humanized, 'error', { actions: errorActions });
      } else {
        pushToast(humanized, 'error');
      }
    }
  });

  return {
    // `reason` is mandatory: every command write is journaled with actor +
    // idempotency key + reason (issue #25). Callers that legitimately lack
    // a user-supplied reason MUST still pass an explicit internal default
    // (e.g. `Internal: ${commandName}`) so the audit row is never NULL.
    runCommand: (name: CommandName, payload: Record<string, unknown> = {}, reason?: string) => {
      const idempotencyKey = `${name}-${crypto.randomUUID()}`;
      // Preserve any successActions staged by the most recent setNextSuccessActions call.
      const prevActions = _pendingCallContextRef.current?.successActions;
      _pendingCallContextRef.current = { name, idempotencyKey, successActions: prevActions };
      return mutation.mutateAsync({
        name,
        payload,
        reason: reason && reason.trim().length >= 3 ? reason : `Internal: ${name}`,
        idempotencyKey
      });
    },
    // UX-D01: stage success actions for the next runCommand call. Call this
    // immediately before runCommand in the same synchronous block. The actions
    // are attached to the success toast by onSuccess and then cleared.
    // This keeps runCommand at 3 args — all existing call sites are unaffected.
    setNextSuccessActions: (actions: ToastAction[]) => {
      if (_pendingCallContextRef.current) {
        _pendingCallContextRef.current!.successActions = actions;
      } else {
        _pendingCallContextRef.current = { name: '' as CommandName, idempotencyKey: '', successActions: actions };
      }
    },
    isRunning: mutation.isLoading
  };
}
