import { defineCommand } from '@/server/services/commandRegistry';
import { createCustomerNeedPayloadSchema } from '../schemas';
import { createCustomerNeed } from '@/server/services/commandBus';

defineCommand({
  name: 'createCustomerNeed',
  input: createCustomerNeedPayloadSchema,
  rbac: { minimumRole: 'operator' },
  reversal: { disposition: 'terminal', guidance: 'Close or edit the customer need if it was entered by mistake.' },
  handler: (ctx, payload) => createCustomerNeed(ctx.tx, payload as any, ctx.user.id, ctx.commandId),
});
