import { router } from '../trpc';
import { authRouter } from './auth';
import { commandsRouter } from './commands';
import { creditRouter } from './credit';
import { filtersRouter } from './filters';
import { intakeRouter } from './intake.router';
import { inventoryRouter } from './inventory.router';
import { mediaRouter } from './media';
import { paymentsRouter } from './payments.router';
import { purchaseOrdersRouter } from './purchase-orders.router';
import { queriesRouter } from './queries';
import { salesOrdersRouter } from './sales-orders.router';
import { subscriptionsRouter } from './subscriptions';
import { vendorBrandsRouter } from './vendorBrands';

export const appRouter = router({
  auth: authRouter,
  commands: commandsRouter,
  credit: creditRouter,
  filters: filtersRouter,
  intake: intakeRouter,
  inventory: inventoryRouter,
  media: mediaRouter,
  payments: paymentsRouter,
  purchaseOrders: purchaseOrdersRouter,
  queries: queriesRouter,
  salesOrders: salesOrdersRouter,
  subscriptions: subscriptionsRouter,
  vendorBrands: vendorBrandsRouter,
});

export type AppRouter = typeof appRouter;
