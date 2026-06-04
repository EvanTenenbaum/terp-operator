import { router } from '../trpc';
import { authRouter } from './auth';
import { commandsRouter } from './commands';
import { creditRouter } from './credit';
import { filtersRouter } from './filters';
import { mediaRouter } from './media';
import { queriesRouter } from './queries';
import { subscriptionsRouter } from './subscriptions';
import { vendorBrandsRouter } from './vendorBrands';

export const appRouter = router({
  auth: authRouter,
  commands: commandsRouter,
  credit: creditRouter,
  filters: filtersRouter,
  media: mediaRouter,
  queries: queriesRouter,
  subscriptions: subscriptionsRouter,
  vendorBrands: vendorBrandsRouter
});

export type AppRouter = typeof appRouter;
