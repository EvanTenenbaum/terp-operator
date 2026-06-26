import { defineCommand } from '@/server/services/commandRegistry';
import { routeConnectorRequestPayloadSchema } from '../schemas';
import { reviewConnectorRequest } from '@/server/services/commandBus';

defineCommand({
  name: 'routeConnectorRequest',
  input: routeConnectorRequestPayloadSchema,
  rbac: { minimumRole: 'operator' },
  reversal: { disposition: 'reversible', guidance: 'Internal reassignment only; operators approve or reject inbound requests.' },
  handler: (ctx, payload) => reviewConnectorRequest(ctx.tx, payload as any, 'routed', ctx.user, ctx.commandId),
});
