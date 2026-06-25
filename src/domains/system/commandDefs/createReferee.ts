import { defineCommand } from '@/server/services/commandRegistry';
import { createRefereePayloadSchema } from '../schemas';
import { createReferee } from '@/server/services/refereeCommands';

defineCommand({
  name: 'createReferee',
  input: createRefereePayloadSchema,
  rbac: { minimumRole: 'manager' },
  reversal: { disposition: 'terminal', guidance: 'Edit or deactivate the referee profile if it was created by mistake.' },
  handler: (ctx, payload) => createReferee(ctx.tx, payload as any, ctx.commandId),
});
