/**
 * createCustomerSheetSnapshot — registered command definition.
 */
import { defineCommand } from '@/server/services/commandRegistry';
import { createCustomerSheetSnapshotPayloadSchema } from '../schemas';
import { createCustomerSheetSnapshot } from '../commands';

defineCommand({
  name: 'createCustomerSheetSnapshot',
  input: createCustomerSheetSnapshotPayloadSchema,
  rbac: { minimumRole: 'operator' },
  reversal: { disposition: 'terminal', guidance: 'Snapshots are append-only audit records of what was sent. Create a new sheet instead.' },
  handler: (ctx, payload) => createCustomerSheetSnapshot(ctx.tx, payload as any, ctx.user, ctx.commandId),
});
