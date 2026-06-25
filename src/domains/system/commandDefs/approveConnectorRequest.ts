import { defineCommand } from '@/server/services/commandRegistry';
import { approveConnectorRequestPayloadSchema } from '../schemas';
import { reviewConnectorRequest } from '@/server/services/commandBus';

defineCommand({
  name: 'approveConnectorRequest',
  input: approveConnectorRequestPayloadSchema,
  rbac: { minimumRole: 'operator' },
  reversal: { disposition: 'reversible', guidance: 'Returns the connector request to open review.' },
  handler: (ctx, payload) => reviewConnectorRequest(ctx.tx, payload as any, 'approved', ctx.user, ctx.commandId),
});
