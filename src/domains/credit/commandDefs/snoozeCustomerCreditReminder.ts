/**
 * snoozeCustomerCreditReminder — registered command definition.
 *
 * Migrated from commandBus.ts switch case.
 * Signature: (tx, payload, commandId)
 */
import { defineCommand } from '@/server/services/commandRegistry';
import { snoozeCustomerCreditReminderPayloadSchema } from '../schemas';
import { snoozeCustomerCreditReminder } from '../commands';

defineCommand({
  name: 'snoozeCustomerCreditReminder',
  input: snoozeCustomerCreditReminderPayloadSchema,
  rbac: { minimumRole: 'manager' },
  reversal: { disposition: 'reversible' as const, guidance: 'Reset the snooze with another snooze call or by reverting to engine.' },
  handler: (ctx, payload) => snoozeCustomerCreditReminder(ctx.tx, payload as any, ctx.commandId),
});
