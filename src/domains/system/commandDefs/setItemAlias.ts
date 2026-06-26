import { defineCommand } from '@/server/services/commandRegistry';
import { setItemAliasPayloadSchema } from '../schemas';
import { setItemAlias } from '@/server/services/commandBus';

defineCommand({
  name: 'setItemAlias',
  input: setItemAliasPayloadSchema,
  rbac: { minimumRole: 'manager' },
  reversal: { disposition: 'reversible', guidance: 'Restores the prior alias value from the command snapshot.' },
  handler: (ctx, payload) => setItemAlias(ctx.tx, payload as any, ctx.commandId),
});
