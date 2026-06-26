import { defineCommand } from '@/server/services/commandRegistry';
import { createPaymentProcessorPayloadSchema } from '../schemas';
import { createPaymentProcessor } from '@/server/services/processorCommands';

defineCommand({
  name: 'createPaymentProcessor',
  input: createPaymentProcessorPayloadSchema,
  rbac: { minimumRole: 'manager' },
  reversal: { disposition: 'terminal', guidance: 'Edit or deactivate the payment processor if it was created by mistake.' },
  handler: (ctx, payload) => createPaymentProcessor(ctx.tx, payload as any, ctx.commandId),
});
