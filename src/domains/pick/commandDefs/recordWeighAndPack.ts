/**
 * recordWeighAndPack — registered command definition.
 *
 * Migrated from commandBus.ts switch case.
 * Signature: (tx, payload, commandId, toast?)
 */
import { defineCommand } from '@/server/services/commandRegistry';
import { recordWeighAndPackPayloadSchema } from '../schemas';
import { recordWeighAndPack } from '../commands';

defineCommand({
  name: 'recordWeighAndPack',
  input: recordWeighAndPackPayloadSchema,
  rbac: { minimumRole: 'operator' },
  reversal: { disposition: 'offsettable' as const, guidance: 'Adjust the fulfillment line with corrected quantity/weight.' },
  handler: (ctx, payload) => recordWeighAndPack(ctx.tx, payload as any, ctx.commandId),
});
