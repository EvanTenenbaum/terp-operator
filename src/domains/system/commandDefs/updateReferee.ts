import { defineCommand } from '@/server/services/commandRegistry';
import { updateRefereePayloadSchema } from '../schemas';
import { updateReferee } from '@/server/services/refereeCommands';

defineCommand({
  name: 'updateReferee',
  input: updateRefereePayloadSchema,
  rbac: { minimumRole: 'manager' },
  reversal: { disposition: 'terminal', guidance: 'Use another update with the intended referee values.' },
  handler: (ctx, payload) => updateReferee(ctx.tx, payload as any, ctx.commandId),
});
