import { defineCommand } from '@/server/services/commandRegistry';
import { rejectInvoiceDisputePayloadSchema } from '../schemas';
import { rejectInvoiceDispute } from '@/server/services/commandBus';

defineCommand({
  name: 'rejectInvoiceDispute',
  input: rejectInvoiceDisputePayloadSchema,
  rbac: { minimumRole: 'manager' },
  reversal: { disposition: 'terminal', guidance: 'Rejected disputes are final. Use resolveInvoiceDispute to change to resolved instead.' },
  handler: (ctx, payload) => rejectInvoiceDispute(ctx.tx, payload as any, ctx.commandId),
});
