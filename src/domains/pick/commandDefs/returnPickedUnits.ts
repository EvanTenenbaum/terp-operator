/**
 * returnPickedUnits — registered command definition.
 *
 * Migrated from commandBus.ts switch case.
 * Signature: (tx, payload, commandId)
 */
import { defineCommand } from '@/server/services/commandRegistry';
import { returnPickedUnitsPayloadSchema } from '../schemas';
import { returnPickedUnits } from '../commands';

defineCommand({
  name: 'returnPickedUnits',
  input: returnPickedUnitsPayloadSchema,
  rbac: { minimumRole: 'operator' },
  reversal: { disposition: 'offsettable' as const, guidance: 'Re-record the pick quantity via recordWeighAndPack if the return was accidental.' },
  handler: (ctx, payload) => returnPickedUnits(ctx.tx, payload as any, ctx.commandId),
});
