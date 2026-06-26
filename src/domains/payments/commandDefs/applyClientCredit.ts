/**
 * applyClientCredit — registered command definition.
 *
 * Migrated from commandBus.ts switch case.
 * Signature: (tx, payload, commandId)
 */
import { defineCommand } from '@/server/services/commandRegistry';
import { applyClientCreditPayloadSchema } from '../schemas';
import { applyClientCredit } from '../commands';

defineCommand({
  name: 'applyClientCredit',
  input: applyClientCreditPayloadSchema,
  rbac: { minimumRole: 'manager' },
  reversal: { disposition: 'offsettable', guidance: 'Post an offsetting client ledger correction.' },
  handler: (ctx, payload) => applyClientCredit(ctx.tx, payload as any, ctx.commandId),
});
