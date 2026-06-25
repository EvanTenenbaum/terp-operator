/**
 * printLabels — registered command definition.
 *
 * Migrated from commandBus.ts switch case.
 * Signature: (tx, payload, commandId)
 */
import { defineCommand } from '@/server/services/commandRegistry';
import { printLabelsPayloadSchema } from '../schemas';
import { printLabels } from '../commands';

defineCommand({
  name: 'printLabels',
  input: printLabelsPayloadSchema,
  rbac: { minimumRole: 'operator' },
  reversal: { disposition: 'offsettable' as const, guidance: 'Reprint labels or regenerate the manifest.' },
  handler: (ctx, payload) => printLabels(ctx.tx, payload as any, ctx.commandId),
});
