/**
 * updateProcessor — registered command definition.
 *
 * Migrated from commandBus.ts switch case.
 * Signature: (tx, payload, commandId)
 */
import { defineCommand } from '@/server/services/commandRegistry';
import { updateProcessorPayloadSchema } from '../schemas';
import { updateProcessor } from '../commands';

defineCommand({
  name: 'updateProcessor',
  input: updateProcessorPayloadSchema,
  rbac: { minimumRole: 'owner' },
  reversal: { disposition: 'offsettable', guidance: 'Run updateProcessor again with the prior values.' },
  handler: (ctx, payload) => updateProcessor(ctx.tx, payload as any, ctx.commandId),
});
