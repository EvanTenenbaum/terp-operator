import { defineCommand } from '@/server/services/commandRegistry';
import { applyTagsPayloadSchema } from '../schemas';
import { applyTags } from '@/server/services/commandBus';

defineCommand({
  name: 'applyTags',
  input: applyTagsPayloadSchema,
  rbac: { minimumRole: 'operator' },
  reversal: { disposition: 'terminal', guidance: 'Apply tags again with the intended add/remove/replace mode.' },
  handler: (ctx, payload) => applyTags(ctx.tx, payload as any, ctx.commandId),
});
