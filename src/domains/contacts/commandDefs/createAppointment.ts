/**
 * createAppointment — registered command definition.
 *
 * Migrated from commandBus.ts switch case.
 * Signature: (tx, payload, userId, commandId)
 */
import { defineCommand } from '@/server/services/commandRegistry';
import { createAppointmentPayloadSchema } from '../schemas';
import { createAppointment } from '../commands';

defineCommand({
  name: 'createAppointment',
  input: createAppointmentPayloadSchema,
  rbac: { minimumRole: 'operator' },
  reversal: { disposition: 'reversible' as const, guidance: 'Use cancelAppointment to mark the appointment cancelled.' },
  handler: (ctx, payload) => createAppointment(ctx.tx, payload as Parameters<typeof createAppointment>[1], ctx.user.id, ctx.commandId),
});
