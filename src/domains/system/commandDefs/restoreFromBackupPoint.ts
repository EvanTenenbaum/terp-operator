import { defineCommand } from '@/server/services/commandRegistry';
import { restoreFromBackupPointPayloadSchema } from '../schemas';
import { restoreFromBackupPoint } from '@/server/services/commandBus';

defineCommand({
  name: 'restoreFromBackupPoint',
  input: restoreFromBackupPointPayloadSchema,
  rbac: { minimumRole: 'owner' },
  reversal: { disposition: 'terminal', guidance: 'Restore preview is read-only and has no mutation to reverse.' },
  handler: (ctx, payload) => restoreFromBackupPoint(ctx.tx, payload as any, ctx.commandId),
});
