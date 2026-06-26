/**
 * setBatchPrice — registered command definition.
 */
import { defineCommand } from '@/server/services/commandRegistry';
import { setBatchPricePayloadSchema } from '../schemas';
import { setBatchPrice } from '../commands';

defineCommand({
  name: 'setBatchPrice',
  input: setBatchPricePayloadSchema,
  rbac: { minimumRole: 'operator' },
  reversal: { disposition: 'terminal', guidance: 'Use another price update or reprice the order before confirmation.' },
  handler: (ctx, payload) => setBatchPrice(ctx.tx, payload as any, ctx.commandId),
});
