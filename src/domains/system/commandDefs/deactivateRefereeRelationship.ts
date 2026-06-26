import { defineCommand } from '@/server/services/commandRegistry';
import { deactivateRefereeRelationshipPayloadSchema } from '../schemas';
import { deactivateRefereeRelationship } from '@/server/services/refereeCommands';

defineCommand({
  name: 'deactivateRefereeRelationship',
  input: deactivateRefereeRelationshipPayloadSchema,
  rbac: { minimumRole: 'manager' },
  reversal: { disposition: 'terminal', guidance: 'Add a new relationship if the deactivation was accidental.' },
  handler: (ctx, payload) => deactivateRefereeRelationship(ctx.tx, payload as any, ctx.commandId),
});
