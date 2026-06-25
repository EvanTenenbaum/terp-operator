import { defineCommand } from '@/server/services/commandRegistry';
import { postPeriodAdjustmentsPayloadSchema } from '../schemas';
import { postPeriodAdjustments } from '@/server/services/commandBus';

defineCommand({
  name: 'postPeriodAdjustments',
  input: postPeriodAdjustmentsPayloadSchema,
  rbac: { minimumRole: 'owner' },
  reversal: { disposition: 'reversible', guidance: 'Marks posted correction journal rows reversed.' },
  handler: (ctx, payload) => postPeriodAdjustments(ctx.tx, payload as any, ctx.commandId),
});
