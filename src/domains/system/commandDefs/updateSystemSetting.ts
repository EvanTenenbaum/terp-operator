import { defineCommand } from '@/server/services/commandRegistry';
import { updateSystemSettingPayloadSchema } from '../schemas';
import { updateSystemSetting } from '@/server/services/commandBus';

defineCommand({
  name: 'updateSystemSetting',
  input: updateSystemSettingPayloadSchema,
  rbac: { minimumRole: 'manager' },
  reversal: { disposition: 'offsettable', guidance: 'Run updateSystemSetting again with the prior value to restore the previous state.' },
  handler: (ctx, payload) => updateSystemSetting(ctx.tx, payload as any, ctx.commandId),
});
