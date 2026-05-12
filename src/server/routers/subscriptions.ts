import { observable } from '@trpc/server/observable';
import { protectedProcedure, router } from '../trpc';

export const subscriptionsRouter = router({
  heartbeat: protectedProcedure.subscription(() => {
    return observable<{ checkedAt: string; status: 'ok' }>((emit) => {
      const timer = setInterval(() => emit.next({ checkedAt: new Date().toISOString(), status: 'ok' }), 10_000);
      return () => clearInterval(timer);
    });
  })
});
