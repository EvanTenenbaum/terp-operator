import { z } from 'zod';
import { commandNames } from './commandCatalog';

export const roleSchema = z.enum(['owner', 'manager', 'operator', 'viewer']);
export const ownershipSchema = z.enum(['C', 'OFC', 'UNKNOWN']);
export const arrivalStatusSchema = z.enum(['pending', 'arrived', 'cancelled']);
export const inventoryStatusSchema = z.enum(['posted', 'held', 'damaged', 'returned', 'in_transit']);
export const paymentMethodSchema = z.enum(['cash', 'check', 'card', 'crypto', 'wire']);
export const commandNameSchema = z.enum(commandNames);

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6)
});

export const commandInputSchema = z.object({
  name: commandNameSchema,
  idempotencyKey: z.string().min(8, 'Idempotency key is required for every write.'),
  // Every command write must record a non-trivial reason for the immutable
  // audit journal (see issue #25). Direct-API callers and the tRPC
  // `commands.run` mutation both validate against this schema; if `reason` is
  // missing, blank, or shorter than 3 characters, the request is rejected
  // before any side effects are taken.
  reason: z
    .string()
    .trim()
    .min(3, 'Reason must be at least 3 characters and explain why the command was issued.')
    .max(500, 'Reason must be 500 characters or fewer.'),
  payload: z.record(z.unknown()).default({})
});

export const batchPayloadSchema = z.object({
  id: z.string().uuid().optional(),
  itemId: z.string().uuid().optional(),
  vendorId: z.string().uuid().optional(),
  purchaseOrderId: z.string().uuid().optional(),
  purchaseOrderLineId: z.string().uuid().optional(),
  sourceCode: z.string().trim().optional(),
  shorthand: z.string().trim().optional(),
  name: z.string().trim().min(2).optional(),
  category: z.string().trim().optional(),
  tags: z.array(z.string()).optional(),
  intakeQty: z.coerce.number().positive().optional(),
  availableQty: z.coerce.number().min(0).optional(),
  uom: z.string().trim().default('lb').optional(),
  unitCost: z.coerce.number().min(0).optional(),
  unitPrice: z.coerce.number().min(0).optional(),
  location: z.string().trim().optional(),
  lotCode: z.string().trim().optional(),
  intakeDate: z.string().optional(),
  ticketCost: z.coerce.number().min(0).optional(),
  priceRange: z.string().trim().optional(),
  notes: z.string().optional(),
  legacyMarker: z.string().trim().optional(),
  expirationDate: z.string().optional(),
  ownershipStatus: ownershipSchema.optional(),
  arrivalConfirmed: z.boolean().optional(),
  arrivalStatus: arrivalStatusSchema.optional(),
  mediaStatus: z.enum(['open', 'in_progress', 'done']).optional(),
  status: z.enum(['draft', 'ready', 'needs_fix']).optional()
});

export const inventoryTransferPayloadSchema = z.object({
  batchId: z.string().uuid(),
  status: inventoryStatusSchema.optional(),
  location: z.string().trim().min(1).optional(),
  ownershipStatus: ownershipSchema.optional(),
  vendorId: z.string().uuid().optional(),
  reason: z.string().trim().min(3)
});

export const salesOrderPayloadSchema = z.object({
  orderId: z.string().uuid().optional(),
  customerId: z.string().uuid().optional(),
  batchId: z.string().uuid().optional(),
  qty: z.coerce.number().positive().optional(),
  unitPrice: z.coerce.number().min(0).optional(),
  unitCost: z.coerce.number().min(0).optional(),
  landedCost: z.coerce.number().min(0).optional(),
  landedCostBasis: z.enum(['fixed', 'pick-low', 'pick-mid', 'pick-high', 'manual']).optional(),
  strategy: z.string().optional(),
  deliveryWindow: z.string().optional(),
  sourceRowKey: z.string().optional(),
  unresolvedSourceText: z.string().optional(),
  legacyStatusMarker: z.string().optional(),
  packed: z.boolean().optional(),
  inventoryPosted: z.boolean().optional(),
  paymentFollowup: z.boolean().optional(),
  notes: z.string().optional(),
  status: z.string().optional()
});

// Percent basis: amount is a decimal markup multiplier (0.30 = 30%); cap at 2 = 200%.
// Dollar basis: amount is dollars added to landed COGS; cap at 100000 for sanity.
export const pricingRuleEntrySchema = z.discriminatedUnion('basis', [
  z.object({
    basis: z.literal('percent'),
    amount: z.coerce.number().min(0).max(2, 'Percent markup must be a decimal (0.30 = 30%); maximum 2.00 (= 200%).')
  }),
  z.object({
    basis: z.literal('dollar'),
    amount: z.coerce.number().min(0).max(100000, 'Dollar markup must be between 0 and 100000.')
  })
]);

export const customerPricingRuleSchema = z.object({
  default: pricingRuleEntrySchema.optional(),
  categories: z.record(pricingRuleEntrySchema).optional()
});

export const setLineLandedCostPayloadSchema = z.object({
  lineId: z.string().uuid(),
  landedCost: z.coerce.number().min(0),
  basis: z.enum(['manual', 'pick-low', 'pick-mid', 'pick-high']).default('manual'),
  reason: z.string().max(500).optional()
});

export const setCustomerPricingRulePayloadSchema = z.object({
  customerId: z.string().uuid(),
  pricingRule: customerPricingRuleSchema
});

export const setDefaultPricingRulePayloadSchema = z.object({
  pricingRule: customerPricingRuleSchema
});

export const paymentPayloadSchema = z.object({
  paymentId: z.string().uuid().optional(),
  customerId: z.string().uuid().optional(),
  invoiceId: z.string().uuid().optional(),
  // [#35 DYN-L2 / DYN-L3] Bound the payment amount and require cent
  // alignment. Previously `z.coerce.number()` accepted `1e10` and silently
  // truncated values like `5.001` to `5.00` via downstream `.toFixed(2)`
  // calls. Operators now see a clear validation error instead of either
  // outcome.
  amount: z
    .coerce.number()
    .min(-1_000_000, 'Payment amount must be at least -1,000,000.')
    .max(1_000_000, 'Payment amount must be at most 1,000,000.')
    .refine(
      (n) => Number.isFinite(n) && Math.abs(n * 100 - Math.round(n * 100)) < 1e-6,
      'Amount must be cent-aligned (at most 2 decimal places).'
    ),
  method: paymentMethodSchema.default('cash'),
  reference: z.string().optional(),
  locationBucket: z.string().optional(),
  direction: z.string().optional(),
  category: z.string().optional(),
  allocationIntent: z.string().optional(),
  notes: z.string().optional()
});

export const csvImportSchema = z.object({
  csv: z.string().min(1),
  validateOnly: z.boolean().default(true)
});
