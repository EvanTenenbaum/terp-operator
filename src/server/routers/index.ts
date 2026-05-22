import { router } from '../trpc';
import { authRouter } from './auth';
import { commandsRouter } from './commands';
import { creditRouter } from './credit';
import { documentSnapshotsRouter } from './documentSnapshots';
import { filtersRouter } from './filters';
import { queriesRouter } from './queries';
import { subscriptionsRouter } from './subscriptions';

export const appRouter = router({
  auth: authRouter,
  commands: commandsRouter,
  credit: creditRouter,
  documentSnapshots: documentSnapshotsRouter,
  filters: filtersRouter,
  queries: queriesRouter,
  subscriptions: subscriptionsRouter
});

export type AppRouter = typeof appRouter;
