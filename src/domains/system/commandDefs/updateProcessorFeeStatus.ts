import { defineCommand } from '@/server/services/commandRegistry';
import { updateProcessorFeeStatusPayloadSchema } from '../schemas';
import { updateProcessorFeeStatus } from '@/server/services/processorCommands';

defineCommand({
  name: 'updateProcessorFeeStatus',
  input: updateProcessorFeeStatusPayloadSchema,
  rbac: { minimumRole: 'manager' },
  reversal: { disposition: 'terminal', guidance: 'Use another update with the intended fee status values.' },
  handler: (ctx, payload) => updateProcessorFeeStatus(ctx.tx, payload as any, ctx.commandId),
});
