/**
 * importBatchesCsv — registered command definition.
 */
import { defineCommand } from '@/server/services/commandRegistry';
import { importBatchesCsvPayloadSchema } from '../schemas';
import { importBatchesCsv } from '../commands';

defineCommand({
  name: 'importBatchesCsv',
  input: importBatchesCsvPayloadSchema,
  rbac: { minimumRole: 'operator' },
  reversal: { disposition: 'terminal', guidance: 'Imported drafts should be deleted or corrected row by row before posting.' },
  handler: (ctx, payload) => importBatchesCsv(ctx.tx, payload as any, ctx.commandId),
});
