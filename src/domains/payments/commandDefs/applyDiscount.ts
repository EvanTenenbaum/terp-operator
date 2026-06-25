/**
 * applyDiscount — registered command definition.
 *
 * Migrated from commandBus.ts switch case.
 * Signature: (tx, payload, commandId)
 */
import { defineCommand } from '@/server/services/commandRegistry';
import { applyDiscountPayloadSchema } from '../schemas';
import { applyDiscount } from '../commands';

defineCommand({
  name: 'applyDiscount',
  input: applyDiscountPayloadSchema,
  rbac: { minimumRole: 'manager' },
  reversal: { disposition: 'offsettable', guidance: 'Use a correction journal or invoice adjustment to offset the discount.' },
  handler: (ctx, payload) => applyDiscount(ctx.tx, payload as any, ctx.commandId),
});
