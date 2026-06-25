/**
 * resolveVendorApproval — registered command definition.
 *
 * Migrated from commandBus.ts switch case.
 * Signature: (tx, payload, commandId)
 */
import { defineCommand } from '@/server/services/commandRegistry';
import { resolveVendorApprovalPayloadSchema } from '../schemas';
import { resolveVendorApproval } from '../commands';

defineCommand({
  name: 'resolveVendorApproval',
  input: resolveVendorApprovalPayloadSchema,
  rbac: { minimumRole: 'manager' },
  reversal: { disposition: 'reversible' as const, guidance: 'Re-run resolveVendorApproval with the intended state to flip the sign-off.' },
  handler: (ctx, payload) => resolveVendorApproval(ctx.tx, payload as any, ctx.commandId),
});
