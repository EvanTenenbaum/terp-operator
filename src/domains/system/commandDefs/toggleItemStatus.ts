import { defineCommand } from '@/server/services/commandRegistry';
import { toggleItemStatusPayloadSchema } from '../schemas';
import { toggleItemStatus } from '@/server/services/commandBus';

defineCommand({
  name: 'toggleItemStatus',
  input: toggleItemStatusPayloadSchema,
  rbac: { minimumRole: 'manager' },
  reversal: { disposition: 'reversible', guidance: 'Run toggleItemStatus again to re-activate the item.' },
  handler: (ctx, payload) => toggleItemStatus(ctx.tx, payload as any, ctx.commandId),
});
