/**
 * Subscriptions router.
 *
 * TRANSPORT NOTE (2026-05-22):
 * The tRPC client is configured with `httpBatchLink` only
 * (see `src/client/api/trpc.ts`). Subscriptions require a WebSocket or SSE
 * transport link (e.g. `wsLink` or `httpSubscriptionLink`).
 *
 * No frontend subscriber for `heartbeat` exists today. Before wiring the
 * frontend side, add a split-link config in `trpc.ts` that routes subscription
 * procedures to a WebSocket/SSE link. This is tracked as BE-011 in
 * `docs/product/capability-registry.md`.
 *
 * The procedure is retained as backend scaffolding so the server-side
 * observable infrastructure is ready when WS transport is added.
 */
import { observable } from '@trpc/server/observable';
import { protectedProcedure, router } from '../trpc';

export const subscriptionsRouter = router({
  heartbeat: protectedProcedure.subscription(() => {
    return observable<{ checkedAt: string; status: 'ok' }>((emit) => {
      const timer = setInterval(
        () => emit.next({ checkedAt: new Date().toISOString(), status: 'ok' }),
        10_000
      );
      return () => clearInterval(timer);
    });
  }),
});
