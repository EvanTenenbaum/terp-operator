/**
 * verifyAllIntake — registered command definition.
 */
import { defineCommand } from '@/server/services/commandRegistry';
import { verifyAllIntakePayloadSchema } from '../schemas';
import { verifyAllIntake } from '../commands';

defineCommand({
  name: 'verifyAllIntake',
  input: verifyAllIntakePayloadSchema,
  rbac: { minimumRole: 'operator' },
  reversal: { disposition: 'reversible', guidance: 'Reverses generated receipts and vendor bills like postPurchaseReceipt.' },
  handler: (ctx, payload) => verifyAllIntake(ctx.tx, payload as any, ctx.commandId, ctx.reason),
});
