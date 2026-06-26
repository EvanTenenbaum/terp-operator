import { defineCommand } from '@/server/services/commandRegistry';
import { approveMergeCandidatePayloadSchema } from '../schemas';
import { approveMergeCandidate } from '@/server/services/commandBus';

defineCommand({
  name: 'approveMergeCandidate',
  input: approveMergeCandidatePayloadSchema,
  rbac: { minimumRole: 'manager' },
  reversal: { disposition: 'terminal', guidance: 'Marking a candidate reviewed is a one-way audit mark. Dismiss the candidate instead if the match is not valid.' },
  handler: (ctx, payload) => approveMergeCandidate(ctx.tx, payload as any, ctx.commandId),
});
