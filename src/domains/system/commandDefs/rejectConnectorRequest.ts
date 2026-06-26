import { defineCommand } from '@/server/services/commandRegistry';
import { rejectConnectorRequestPayloadSchema } from '../schemas';
import { reviewConnectorRequest } from '@/server/services/commandBus';

defineCommand({
  name: 'rejectConnectorRequest',
  input: rejectConnectorRequestPayloadSchema,
  rbac: { minimumRole: 'operator' },
  reversal: { disposition: 'terminal', guidance: 'Rejected connector requests stay terminal; create or approve a new request.' },
  handler: (ctx, payload) => reviewConnectorRequest(ctx.tx, payload as any, 'rejected', ctx.user, ctx.commandId),
});
