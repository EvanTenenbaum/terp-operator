import { defineCommand } from '@/server/services/commandRegistry';
import { lockPeriodPayloadSchema } from '../schemas';
import { lockPeriod } from '@/server/services/commandBus';

defineCommand({
  name: 'lockPeriod',
  input: lockPeriodPayloadSchema,
  rbac: { minimumRole: 'owner' },
  reversal: { disposition: 'terminal', guidance: 'Period locks are terminal closeout controls.' },
  handler: (ctx, payload) => lockPeriod(ctx.tx, payload as any, ctx.user.id, ctx.commandId),
});
