/**
 * recallLineFromPicking — registered command definition.
 *
 * Migrated from commandBus.ts switch case.
 * Signature: (tx, payload, commandId)
 */
import { defineCommand } from '@/server/services/commandRegistry';
import { recallLineFromPickingPayloadSchema } from '../schemas';
import { recallLineFromPicking } from '../commands';

defineCommand({
  name: 'recallLineFromPicking',
  input: recallLineFromPickingPayloadSchema,
  rbac: { minimumRole: 'operator' },
  reversal: { disposition: 'terminal' as const, guidance: 'Release the line again with releaseLineForPicking if the recall was unintended.' },
  handler: (ctx, payload) => recallLineFromPicking(ctx.tx, payload as any, ctx.commandId),
});
