import { defineCommand } from '@/server/services/commandRegistry';
import { reverseCommandByIdPayloadSchema } from '../schemas';
import { reverseCommandById } from '@/server/services/commandBus';

defineCommand({
  name: 'reverseCommandById',
  input: reverseCommandByIdPayloadSchema,
  rbac: { minimumRole: 'manager' },
  reversal: { disposition: 'terminal', guidance: 'Reversal commands are terminal audit records.' },
  handler: (ctx, payload) => reverseCommandById(ctx.tx, payload as any, ctx.commandId),
});
