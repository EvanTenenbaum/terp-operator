import { defineCommand } from '@/server/services/commandRegistry';
import { createCorrectionJournalEntryPayloadSchema } from '../schemas';
import { createCorrectionJournalEntry } from '@/server/services/commandBus';

defineCommand({
  name: 'createCorrectionJournalEntry',
  input: createCorrectionJournalEntryPayloadSchema,
  rbac: { minimumRole: 'manager' },
  reversal: { disposition: 'reversible', guidance: 'Marks correction journal rows reversed.' },
  handler: (ctx, payload) => createCorrectionJournalEntry(ctx.tx, payload as any, ctx.commandId),
});
