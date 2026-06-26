/**
 * markUserFeeCollected — registered command definition.
 *
 * Migrated from commandBus.ts switch case.
 * Signature: (tx, payload, commandId)
 * Lives in server/services/processorCommands.ts, re-exported via payments barrel.
 */
import { defineCommand } from '@/server/services/commandRegistry';
import { markUserFeeCollectedPayloadSchema } from '../schemas';
import { markUserFeeCollected } from '..';

defineCommand({
  name: 'markUserFeeCollected',
  input: markUserFeeCollectedPayloadSchema,
  rbac: { minimumRole: 'manager' },
  reversal: { disposition: 'reversible', guidance: 'Reverses the fee collection record and updates user fee status.' },
  handler: (ctx, payload) => markUserFeeCollected(ctx.tx, payload as any, ctx.commandId),
});
