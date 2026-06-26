import { router } from '../trpc';
import { authRouter } from './auth';
import { barterRouter } from './barter';
import { closeoutRouter } from './closeout.router';
import { commandsRouter } from './commands';
import { contextRouter } from './context.router';
import { creditRouter } from './credit';
import { filtersRouter } from './filters';
import { fulfillmentRouter } from './fulfillment.router';
import { intakeRouter } from './intake.router';
import { inventoryRouter } from './inventory.router';
import { matchmakingRouter } from './matchmaking.router';
import { mediaRouter } from './media';
import { paymentsRouter } from './payments.router';
import { purchaseOrdersRouter } from './purchase-orders.router';
import { queriesRouter } from './queries';
import { salesOrdersRouter } from './sales-orders.router';
import { subscriptionsRouter } from './subscriptions';
import { vendorBrandsRouter } from './vendorBrands';

export const appRouter = router({
  auth: authRouter,
  barter: barterRouter,
  closeout: closeoutRouter,
  commands: commandsRouter,
  context: contextRouter,
  credit: creditRouter,
  filters: filtersRouter,
  fulfillment: fulfillmentRouter,
  intake: intakeRouter,
  inventory: inventoryRouter,
  matchmaking: matchmakingRouter,
  media: mediaRouter,
  payments: paymentsRouter,
  purchaseOrders: purchaseOrdersRouter,
  queries: queriesRouter,
  salesOrders: salesOrdersRouter,
  subscriptions: subscriptionsRouter,
  vendorBrands: vendorBrandsRouter,
});

export type AppRouter = typeof appRouter;
