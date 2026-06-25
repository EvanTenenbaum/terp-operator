import { defineCommand } from '@/server/services/commandRegistry';
import { addRefereeRelationshipPayloadSchema } from '../schemas';
import { addRefereeRelationship } from '@/server/services/refereeCommands';

defineCommand({
  name: 'addRefereeRelationship',
  input: addRefereeRelationshipPayloadSchema,
  rbac: { minimumRole: 'manager' },
  reversal: { disposition: 'terminal', guidance: 'Deactivate the referee relationship if it was added by mistake.' },
  handler: (ctx, payload) => addRefereeRelationship(ctx.tx, payload as any, ctx.commandId),
});
