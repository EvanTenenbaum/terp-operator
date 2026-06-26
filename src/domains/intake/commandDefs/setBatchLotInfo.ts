/**
 * setBatchLotInfo — registered command definition.
 */
import { defineCommand } from '@/server/services/commandRegistry';
import { setBatchLotInfoPayloadSchema } from '../schemas';
import { setBatchLotInfo } from '../commands';

defineCommand({
  name: 'setBatchLotInfo',
  input: setBatchLotInfoPayloadSchema,
  rbac: { minimumRole: 'operator' },
  reversal: { disposition: 'terminal', guidance: 'Use another lot-info update with the intended field values.' },
  handler: (ctx, payload) => setBatchLotInfo(ctx.tx, payload as any, ctx.commandId),
});
