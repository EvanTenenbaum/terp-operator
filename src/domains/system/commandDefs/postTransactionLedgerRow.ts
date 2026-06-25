import { defineCommand } from '@/server/services/commandRegistry';
import { postTransactionLedgerRowPayloadSchema } from '../schemas';
import { postTransactionLedgerRow } from '@/server/services/commandBus';

defineCommand({
  name: 'postTransactionLedgerRow',
  input: postTransactionLedgerRowPayloadSchema,
  rbac: { minimumRole: 'manager' },
  reversal: { disposition: 'offsettable', guidance: 'Use source-specific reversal, void, or correction depending on the row trace.' },
  handler: (ctx, payload) => postTransactionLedgerRow(ctx.tx, payload as any, ctx.user, ctx.commandId),
});
