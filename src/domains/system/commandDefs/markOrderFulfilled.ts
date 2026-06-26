import { defineCommand } from '@/server/services/commandRegistry';
import { markOrderFulfilledPayloadSchema } from '../schemas';
import { markOrderFulfilled } from '@/server/services/commandBus';

defineCommand({
  name: 'markOrderFulfilled',
  input: markOrderFulfilledPayloadSchema,
  rbac: { minimumRole: 'operator' },
  reversal: { disposition: 'reversible', guidance: 'Returns the pick/order to open/posted state when no later archive depends on it.' },
  handler: (ctx, payload) => markOrderFulfilled(ctx.tx, payload as any, ctx.commandId),
});
