import { defineCommand } from '@/server/services/commandRegistry';
import { archivePeriodPayloadSchema } from '../schemas';
import { archivePeriod } from '@/server/services/commandBus';

defineCommand({
  name: 'archivePeriod',
  input: archivePeriodPayloadSchema,
  rbac: { minimumRole: 'owner' },
  reversal: { disposition: 'terminal', guidance: 'Archive runs are terminal; restore is offline/read-only in app.' },
  handler: (ctx, payload) => archivePeriod(ctx.tx, payload as any, ctx.commandId),
});
