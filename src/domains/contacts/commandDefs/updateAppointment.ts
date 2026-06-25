/**
 * updateAppointment — registered command definition.
 *
 * Migrated from commandBus.ts switch case.
 * Signature: (tx, payload, commandId)
 */
import { defineCommand } from '@/server/services/commandRegistry';
import { updateAppointmentPayloadSchema } from '../schemas';
import { updateAppointment } from '../commands';

defineCommand({
  name: 'updateAppointment',
  input: updateAppointmentPayloadSchema,
  rbac: { minimumRole: 'operator' },
  reversal: { disposition: 'offsettable' as const, guidance: 'Run updateAppointment again with the prior values.' },
  handler: (ctx, payload) => updateAppointment(ctx.tx, payload as Parameters<typeof updateAppointment>[1], ctx.commandId),
});
