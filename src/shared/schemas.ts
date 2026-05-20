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
  reason: z.string().max(500).optional(),
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
  landedCostBasis: z.enum(['fixed', 'pick-low', 'pick-mid', 'pick-high', 'manual', 'override']).optional(),
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

export const pricingRuleEntrySchema = z.object({
  basis: z.enum(['percent', 'dollar']),
  amount: z.coerce.number().min(0).max(1000)
});

export const customerPricingRuleSchema = z.object({
  default: pricingRuleEntrySchema.optional(),
  categories: z.record(pricingRuleEntrySchema).optional()
});

export const setLineLandedCostPayloadSchema = z.object({
  lineId: z.string().uuid(),
  landedCost: z.coerce.number().min(0),
  basis: z.enum(['manual', 'pick-low', 'pick-mid', 'pick-high', 'override']).default('manual'),
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
  amount: z.coerce.number(),
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
