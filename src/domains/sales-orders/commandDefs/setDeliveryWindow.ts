/**
 * setDeliveryWindow — registered command definition.
 *
 * Migrated from commandBus.ts switch case.
 * Signature: (tx, payload, commandId)
 */
import { defineCommand } from '@/server/services/commandRegistry';
import { setDeliveryWindowPayloadSchema } from '../schemas';
import { setDeliveryWindow } from '../commands';

defineCommand({
  name: 'setDeliveryWindow',
  input: setDeliveryWindowPayloadSchema,
  rbac: { minimumRole: 'operator' },
  reversal: { disposition: 'terminal' as const, guidance: 'Set a new delivery window.' },
  handler: (ctx, payload) => setDeliveryWindow(ctx.tx, payload as any, ctx.commandId),
});
