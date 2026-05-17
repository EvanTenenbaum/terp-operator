import { z } from 'zod';

// ============================================================================
// FIELD CONFIGURATION
// ============================================================================

export const FILTER_FIELDS = {
  // Text fields
  category: { type: 'text', sql: 'b.category' },
  subcategory: { type: 'text', sql: 'b.subcategory' },
  location: { type: 'text', sql: 'b.location' },
  status: { type: 'text', sql: 'b.status' },

  // UUID fields
  brandId: { type: 'uuid', sql: 'b.brand_id' },
  vendorId: { type: 'uuid', sql: 'b.vendor_id' },

  // Numeric fields
  unitPrice: { type: 'number', sql: 'b.unit_price' },
  unitCost: { type: 'number', sql: 'b.unit_cost' },
  availableQty: { type: 'number', sql: 'b.available_qty' },

  // Date fields
  intakeDate: { type: 'date', sql: 'b.intake_date' },

  // Computed fields
  ageDays: { type: 'number', sql: `DATE_PART('day', NOW() - b.intake_date)::integer` },

  // Array fields
  tags: { type: 'array', sql: 'b.tags' },

  // Ownership
  ownershipStatus: { type: 'text', sql: 'b.ownership_status' },
} as const;

export type FilterFieldName = keyof typeof FILTER_FIELDS;

// Generate allowed field names for client-side validation
export const ALLOWED_FILTER_FIELDS = new Set(Object.keys(FILTER_FIELDS));

// ============================================================================
// OPERATORS BY FIELD TYPE
// ============================================================================

const NULL_CHECK_OPERATORS = ['is_null', 'is_not_null'] as const;
const NUMERIC_OPERATORS = ['equals', 'not_equals', 'greater_than', 'less_than', 'greater_than_or_equal', 'less_than_or_equal', 'between'] as const;
const TEXT_OPERATORS = ['equals', 'not_equals', 'text_contains', 'text_not_contains', 'starts_with', 'ends_with'] as const;
const ARRAY_OPERATORS = ['array_contains', 'array_not_contains', 'array_contains_all'] as const;
const UUID_OPERATORS = ['equals', 'not_equals', 'in', 'not_in'] as const;
const DATE_OPERATORS = ['equals', 'before', 'after', 'between'] as const;

// ============================================================================
// FILTER CONDITIONS (Discriminated Unions)
// ============================================================================

const NullCheckCondition = z.object({
  field: z.enum(Object.keys(FILTER_FIELDS) as [FilterFieldName, ...FilterFieldName[]]),
  operator: z.enum(NULL_CHECK_OPERATORS),
  value: z.null()
});

const NumericBetweenCondition = z.object({
  field: z.enum(['unitPrice', 'unitCost', 'availableQty', 'ageDays']),
  operator: z.literal('between'),
  value: z.tuple([z.number().finite(), z.number().finite()])
    .refine(([min, max]) => min <= max, { message: 'Range minimum must be <= maximum' })
});

const NumericComparisonCondition = z.object({
  field: z.enum(['unitPrice', 'unitCost', 'availableQty', 'ageDays']),
  operator: z.enum(['equals', 'not_equals', 'greater_than', 'less_than', 'greater_than_or_equal', 'less_than_or_equal']),
  value: z.number().finite()
});

const TextCondition = z.object({
  field: z.enum(['category', 'subcategory', 'location', 'status', 'ownershipStatus']),
  operator: z.enum(TEXT_OPERATORS),
  value: z.string().min(1).max(200)
});

const ArrayCondition = z.object({
  field: z.literal('tags'),
  operator: z.enum(ARRAY_OPERATORS),
  value: z.array(z.string().min(1).max(80)).min(1).max(20)
});

const UuidCondition = z.object({
  field: z.enum(['brandId', 'vendorId']),
  operator: z.enum(['equals', 'not_equals']),
  value: z.string().uuid()
});

const UuidArrayCondition = z.object({
  field: z.enum(['brandId', 'vendorId']),
  operator: z.enum(['in', 'not_in']),
  value: z.array(z.string().uuid()).min(1).max(50)
});

const DateCondition = z.object({
  field: z.literal('intakeDate'),
  operator: z.enum(['equals', 'before', 'after']),
  value: z.string().datetime()
});

const DateBetweenCondition = z.object({
  field: z.literal('intakeDate'),
  operator: z.literal('between'),
  value: z.tuple([z.string().datetime(), z.string().datetime()])
    .refine(([start, end]) => new Date(start) <= new Date(end), { message: 'Start date must be <= end date' })
});

export const FilterCondition = z.union([
  NullCheckCondition,
  NumericBetweenCondition,
  NumericComparisonCondition,
  TextCondition,
  ArrayCondition,
  UuidCondition,
  UuidArrayCondition,
  DateCondition,
  DateBetweenCondition
]);

export type FilterCondition = z.infer<typeof FilterCondition>;

// ============================================================================
// FILTER GROUPS (Recursive with Depth Limit)
// ============================================================================

const MAX_FILTER_DEPTH = 5;
const MAX_CONDITIONS_PER_GROUP = 50;

export interface FilterGroupInput {
  logic: 'AND' | 'OR';
  conditions: (FilterCondition | FilterGroupInput)[];
}

function checkDepth(group: FilterGroupInput, currentDepth = 0): number {
  if (currentDepth > MAX_FILTER_DEPTH) {
    return currentDepth;
  }

  const childDepths = group.conditions.map(c => {
    if ('logic' in c) {
      return checkDepth(c, currentDepth + 1);
    }
    return currentDepth;
  });

  return Math.max(currentDepth, ...childDepths);
}

export const FilterGroup: z.ZodType<FilterGroupInput> = z.object({
  logic: z.enum(['AND', 'OR']),
  conditions: z.array(
    z.union([FilterCondition, z.lazy(() => FilterGroup)])
  ).min(1, 'Filter group must have at least one condition')
    .max(MAX_CONDITIONS_PER_GROUP, `Filter group cannot exceed ${MAX_CONDITIONS_PER_GROUP} conditions`)
}).refine(
  (data) => checkDepth(data) <= MAX_FILTER_DEPTH,
  { message: `Filter nesting cannot exceed ${MAX_FILTER_DEPTH} levels` }
);

// ============================================================================
// SAVED FILTER SCHEMA
// ============================================================================

export const SavedFilterInput = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  targetView: z.enum(['inventory', 'items', 'purchase_orders', 'sales_orders', 'matchmaking', 'all']),
  filterDefinition: FilterGroup,
  isGlobal: z.boolean().default(false)
});

export type SavedFilterInput = z.infer<typeof SavedFilterInput>;

export const SavedFilterOutput = SavedFilterInput.extend({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  schemaVersion: z.number().int(),
  createdAt: z.date(),
  updatedAt: z.date(),
  createdBy: z.string().uuid().nullable(),
  updatedBy: z.string().uuid().nullable()
});

export type SavedFilterOutput = z.infer<typeof SavedFilterOutput>;

// ============================================================================
// PAGINATION
// ============================================================================

export const PaginationInput = z.object({
  limit: z.number().int().min(1).max(100).default(50),
  cursor: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional()
});

export type PaginationInput = z.infer<typeof PaginationInput>;
