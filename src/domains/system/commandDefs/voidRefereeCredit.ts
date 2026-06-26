import { defineCommand } from '@/server/services/commandRegistry';
import { voidRefereeCreditPayloadSchema } from '../schemas';
import { voidRefereeCreditCommand } from '@/server/services/refereeCommands';

defineCommand({
  name: 'voidRefereeCredit',
  input: voidRefereeCreditPayloadSchema,
  rbac: { minimumRole: 'manager' },
  reversal: { disposition: 'reversible', guidance: 'Restores the credit to accrued status and updates referee balance.' },
  handler: (ctx, payload) => voidRefereeCreditCommand(ctx.tx, payload as any, ctx.commandId),
});
