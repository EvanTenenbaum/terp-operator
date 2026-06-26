import { defineCommand } from '@/server/services/commandRegistry';
import { updateItemPayloadSchema } from '../schemas';
import { updateItem } from '@/server/services/commandBus';

defineCommand({
  name: 'updateItem',
  input: updateItemPayloadSchema,
  rbac: { minimumRole: 'operator' },
  reversal: { disposition: 'offsettable', guidance: 'Run updateItem again with the prior values.' },
  handler: (ctx, payload) => updateItem(ctx.tx, payload as any, ctx.commandId),
});
