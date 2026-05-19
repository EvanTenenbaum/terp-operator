import { router } from '../trpc';
import { authRouter } from './auth';
import { commandsRouter } from './commands';
import { queriesRouter } from './queries';
import { subscriptionsRouter } from './subscriptions';
import { filtersRouter } from './filters';
import { creditRouter } from './credit';

export const appRouter = router({
  auth: authRouter,
  commands: commandsRouter,
  queries: queriesRouter,
  subscriptions: subscriptionsRouter,
  filters: filtersRouter,
  credit: creditRouter
});

export type AppRouter = typeof appRouter;
