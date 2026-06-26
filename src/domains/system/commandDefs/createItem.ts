import { defineCommand } from '@/server/services/commandRegistry';
import { createItemPayloadSchema } from '../schemas';
import { createItem } from '@/server/services/commandBus';

defineCommand({
  name: 'createItem',
  input: createItemPayloadSchema,
  rbac: { minimumRole: 'operator' },
  reversal: { disposition: 'terminal', guidance: 'Use toggleItemStatus to deactivate; items cannot be deleted if referenced by batches or orders.' },
  handler: (ctx, payload) => createItem(ctx.tx, payload as any, ctx.commandId),
});
