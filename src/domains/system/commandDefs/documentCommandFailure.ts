import { defineCommand } from '@/server/services/commandRegistry';
import { documentCommandFailurePayloadSchema } from '../schemas';
import { documentCommandFailure } from '@/server/services/commandBus';

defineCommand({
  name: 'documentCommandFailure',
  input: documentCommandFailurePayloadSchema,
  rbac: { minimumRole: 'manager' },
  reversal: { disposition: 'terminal', guidance: 'Annotates a failed command journal row with a terminal reason. Cannot be reversed.' },
  handler: (ctx, payload) => documentCommandFailure(ctx.tx, payload as any, ctx.commandId),
});
