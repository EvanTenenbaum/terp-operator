import { defineCommand } from '@/server/services/commandRegistry';
import { upsertTransactionTypePayloadSchema } from '../schemas';
import { upsertTransactionType } from '@/server/services/commandBus';

defineCommand({
  name: 'upsertTransactionType',
  input: upsertTransactionTypePayloadSchema,
  rbac: { minimumRole: 'manager' },
  reversal: { disposition: 'terminal', guidance: 'Edit the transaction type again or deactivate it.' },
  handler: (ctx, payload) => upsertTransactionType(ctx.tx, payload as any, ctx.commandId),
});
