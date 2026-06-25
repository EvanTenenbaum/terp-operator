import { defineCommand } from '@/server/services/commandRegistry';
import { updateCustomerNeedPayloadSchema } from '../schemas';
import { updateCustomerNeed } from '@/server/services/commandBus';

defineCommand({
  name: 'updateCustomerNeed',
  input: updateCustomerNeedPayloadSchema,
  rbac: { minimumRole: 'operator' },
  reversal: { disposition: 'terminal', guidance: 'Use another update with the intended need values.' },
  handler: (ctx, payload) => updateCustomerNeed(ctx.tx, payload as any, ctx.commandId),
});
