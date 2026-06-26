import { z } from 'zod';

/**
 * Canonical view / entity type enum used by grid queries, gridWhere builders,
 * CSV export routes, and domain routers. Originally defined in
 * queries.ts (PR #35 FE-M1); extracted here to break the circular dependency
 * between queries.ts and gridWhere.ts.
 */
export const viewSchema = z.enum([
  'reports',
  'intake',
  'purchaseOrders',
  'sales',
  'matchmaking',
  'orders',
  'payments',
  'inventory',
  'clients',
  'vendors',
  'fulfillment',
  'connectors',
  'recovery',
  'closeout',
  'referees',
  'processors',
  'photography',
  'purchaseReceipts',
  'items',
  'disputes',
  'barter',
]);
