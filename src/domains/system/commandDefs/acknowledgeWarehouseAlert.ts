import { defineCommand } from '@/server/services/commandRegistry';
import { acknowledgeWarehouseAlertPayloadSchema } from '../schemas';
import { acknowledgeWarehouseAlert } from '@/server/services/commandBus';

defineCommand({
  name: 'acknowledgeWarehouseAlert',
  input: acknowledgeWarehouseAlertPayloadSchema,
  rbac: { minimumRole: 'operator' },
  reversal: { disposition: 'terminal', guidance: 'Acknowledgement is a one-way audit mark. Review the bag and reconcile if needed.' },
  handler: (ctx, payload) => acknowledgeWarehouseAlert(ctx.tx, payload as any, ctx.commandId),
});
