/**
 * cancelAppointment — registered command definition.
 *
 * Migrated from commandBus.ts switch case.
 * Signature: (tx, payload, commandId)
 */
import { defineCommand } from '@/server/services/commandRegistry';
import { cancelAppointmentPayloadSchema } from '../schemas';
import { cancelAppointment } from '../commands';

defineCommand({
  name: 'cancelAppointment',
  input: cancelAppointmentPayloadSchema,
  rbac: { minimumRole: 'operator' },
  reversal: { disposition: 'terminal' as const, guidance: 'Cancelled appointments cannot be reactivated; create a new appointment instead.' },
  handler: (ctx, payload) => cancelAppointment(ctx.tx, payload as Parameters<typeof cancelAppointment>[1], ctx.commandId),
});
