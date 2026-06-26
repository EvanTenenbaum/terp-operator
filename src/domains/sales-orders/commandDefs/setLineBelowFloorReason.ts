/**
 * setLineBelowFloorReason — registered command definition.
 *
 * Migrated from commandBus.ts switch case.
 * Signature: (tx, payload, commandId)
 */
import { defineCommand } from '@/server/services/commandRegistry';
import { setLineBelowFloorReasonPayloadSchema } from '../schemas';
import { setLineBelowFloorReason } from '../commands';

defineCommand({
  name: 'setLineBelowFloorReason',
  input: setLineBelowFloorReasonPayloadSchema,
  rbac: { minimumRole: 'operator' },
  reversal: { disposition: 'reversible' as const, guidance: 'Re-run setLineBelowFloorReason with the updated reason and note.' },
  handler: (ctx, payload) => setLineBelowFloorReason(ctx.tx, payload as any, ctx.commandId),
});
