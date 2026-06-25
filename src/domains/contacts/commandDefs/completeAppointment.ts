/**
 * completeAppointment — registered command definition.
 *
 * Migrated from commandBus.ts switch case.
 * Signature: (tx, payload, commandId)
 */
import { defineCommand } from '@/server/services/commandRegistry';
import { completeAppointmentPayloadSchema } from '../schemas';
import { completeAppointment } from '../commands';

defineCommand({
  name: 'completeAppointment',
  input: completeAppointmentPayloadSchema,
  rbac: { minimumRole: 'operator' },
  reversal: { disposition: 'terminal' as const, guidance: 'Completed appointments cannot be uncompleted.' },
  handler: (ctx, payload) => completeAppointment(ctx.tx, payload as Parameters<typeof completeAppointment>[1], ctx.commandId),
});
