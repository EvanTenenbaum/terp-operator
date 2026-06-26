import { defineCommand } from '@/server/services/commandRegistry';
import { updateRefereeRelationshipPayloadSchema } from '../schemas';
import { updateRefereeRelationship } from '@/server/services/refereeCommands';

defineCommand({
  name: 'updateRefereeRelationship',
  input: updateRefereeRelationshipPayloadSchema,
  rbac: { minimumRole: 'manager' },
  reversal: { disposition: 'terminal', guidance: 'Use another update with the intended relationship values.' },
  handler: (ctx, payload) => updateRefereeRelationship(ctx.tx, payload as any, ctx.commandId),
});
