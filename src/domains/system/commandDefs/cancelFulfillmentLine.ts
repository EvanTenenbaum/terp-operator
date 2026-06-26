import { defineCommand } from '@/server/services/commandRegistry';
import { cancelFulfillmentLinePayloadSchema } from '../schemas';
import { cancelFulfillmentLine } from '@/server/services/commandBus';

defineCommand({
  name: 'cancelFulfillmentLine',
  input: cancelFulfillmentLinePayloadSchema,
  rbac: { minimumRole: 'operator' },
  reversal: { disposition: 'terminal', guidance: 'Contact sales to reopen the order line and re-release for picking if cancellation was incorrect.' },
  handler: (ctx, payload) => cancelFulfillmentLine(ctx.tx, payload as any, ctx.commandId),
});
