import { defineCommand } from '@/server/services/commandRegistry';
import { dismissMergeCandidatePayloadSchema } from '../schemas';
import { dismissMergeCandidate } from '@/server/services/commandBus';

defineCommand({
  name: 'dismissMergeCandidate',
  input: dismissMergeCandidatePayloadSchema,
  rbac: { minimumRole: 'manager' },
  reversal: { disposition: 'terminal', guidance: 'Dismissal is a one-way audit mark. Re-run the deduplication scan to regenerate candidates if needed.' },
  handler: (ctx, payload) => dismissMergeCandidate(ctx.tx, payload as any, ctx.commandId),
});
