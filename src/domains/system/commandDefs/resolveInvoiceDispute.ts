import { defineCommand } from '@/server/services/commandRegistry';
import { resolveInvoiceDisputePayloadSchema } from '../schemas';
import { resolveInvoiceDispute } from '@/server/services/commandBus';

defineCommand({
  name: 'resolveInvoiceDispute',
  input: resolveInvoiceDisputePayloadSchema,
  rbac: { minimumRole: 'manager' },
  reversal: { disposition: 'terminal', guidance: 'Resolved disputes are final. Use rejectInvoiceDispute to change to rejected instead.' },
  handler: (ctx, payload) => resolveInvoiceDispute(ctx.tx, payload as any, ctx.commandId),
});
