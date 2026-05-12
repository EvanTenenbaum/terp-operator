import { router } from '../trpc';
import { authRouter } from './auth';
import { commandsRouter } from './commands';
import { queriesRouter } from './queries';
import { subscriptionsRouter } from './subscriptions';

export const appRouter = router({
  auth: authRouter,
  commands: commandsRouter,
  queries: queriesRouter,
  subscriptions: subscriptionsRouter
});

export type AppRouter = typeof appRouter;
