# Product Filtering System - Atomic Implementation Roadmap

**Date:** 2026-05-17  
**Spec Version:** V2 (Production-Ready)  
**Total Tasks:** 47 atomic units  
**Estimated Duration:** 4-6 weeks

---

## Overview

This roadmap breaks down the product filtering system implementation into 47 atomic tasks. Each task is:
- **Small:** Completable in 1-4 hours
- **Independent:** Can be validated independently (where dependencies allow)
- **Testable:** Has clear acceptance criteria
- **Documented:** References exact spec sections

---

## Phase 1: Database Foundation (Tasks 1-10)

**Duration:** 2 days  
**Dependencies:** None  
**Critical Path:** Yes

### Task 1.1: Create brands table
**Duration:** 30 min  
**Owner:** Backend/DB  
**Files:** `migrations/2026_05_17_001_create_brands.sql`

**Implementation:**
```sql
-- Copy from V2 spec lines 30-52
CREATE TABLE brands (...);
CREATE UNIQUE INDEX brands_name_active_idx ...;
CREATE INDEX brands_active_idx ...;
CREATE INDEX brands_name_idx ...;
```

**Acceptance Criteria:**
- [ ] Table created with all columns
- [ ] All 4 indexes created
- [ ] Default value 'Brand TBD' works
- [ ] Unique constraint enforced for active brands only
- [ ] Can insert duplicate brand names (different active status)

**Validation:**
```sql
-- Test 1: Insert brand
INSERT INTO brands (name, alias) VALUES ('Test Farm', 'Grower A');
-- Test 2: Duplicate name with different active status
INSERT INTO brands (name, alias, active) VALUES ('Test Farm', 'Grower B', false);
-- Should succeed
```

---

### Task 1.2: Create saved_filters table
**Duration:** 45 min  
**Owner:** Backend/DB  
**Files:** `migrations/2026_05_17_002_create_saved_filters.sql`

**Implementation:**
```sql
-- Copy from V2 spec lines 54-88
CREATE TABLE saved_filters (...);
-- All indexes and constraints
```

**Acceptance Criteria:**
- [ ] Table created with all columns including schema_version
- [ ] Unique constraint on (user_id, name, target_view)
- [ ] CHECK constraint on target_view validates enum
- [ ] All 3 indexes created
- [ ] Two users can create filters with same name

**Validation:**
```sql
-- Test: User-scoped unique constraint
INSERT INTO saved_filters (user_id, name, target_view, filter_definition, schema_version)
VALUES ('uuid-user1', 'My Filter', 'inventory', '{"logic":"AND","conditions":[]}', 1);
-- Same name, different user - should succeed
INSERT INTO saved_filters (user_id, name, target_view, filter_definition, schema_version)
VALUES ('uuid-user2', 'My Filter', 'inventory', '{"logic":"AND","conditions":[]}', 1);
```

---

### Task 1.3: Add fields to batches table
**Duration:** 1 hour  
**Owner:** Backend/DB  
**Dependencies:** Task 1.1 (brands table must exist)  
**Files:** `migrations/2026_05_17_003_add_batch_fields.sql`

**Implementation:**
```sql
-- Copy from V2 spec lines 90-110
ALTER TABLE batches 
  ADD COLUMN subcategory varchar(80),
  ADD COLUMN brand_id uuid REFERENCES brands(id) ON DELETE RESTRICT,
  ADD COLUMN brand_alias varchar(80),
  ADD COLUMN vendor_alias varchar(80),
  ADD COLUMN sort_id bigserial NOT NULL;
```

**Acceptance Criteria:**
- [ ] All 5 columns added
- [ ] brand_id FK references brands.id
- [ ] ON DELETE RESTRICT prevents brand deletion with batches
- [ ] sort_id sequence auto-increments
- [ ] Columns nullable (except sort_id)

**Validation:**
```sql
-- Test FK constraint
INSERT INTO brands (id, name, alias) VALUES ('uuid-test', 'Test', 'Test');
INSERT INTO batches (brand_id, ...) VALUES ('uuid-test', ...);
DELETE FROM brands WHERE id = 'uuid-test'; -- Should fail with FK violation
```

---

### Task 1.4: Add vendor alias column
**Duration:** 30 min  
**Owner:** Backend/DB  
**Files:** `migrations/2026_05_17_004_add_vendor_alias.sql`

**Implementation:**
```sql
-- Three-step migration from V2 spec lines 2045-2058
-- Step 1: Add column nullable
ALTER TABLE vendors ADD COLUMN alias varchar(80);

-- Step 2: Backfill
UPDATE vendors SET alias = name || ' (Customer Alias)' WHERE alias IS NULL;

-- Step 3: Make NOT NULL with default
ALTER TABLE vendors ALTER COLUMN alias SET NOT NULL;
ALTER TABLE vendors ALTER COLUMN alias SET DEFAULT 'Vendor TBD';
```

**Acceptance Criteria:**
- [ ] Column added
- [ ] All existing vendors have aliases
- [ ] NOT NULL constraint enforced
- [ ] Default works for new vendors

**Validation:**
```sql
SELECT COUNT(*) FROM vendors WHERE alias IS NULL; -- Should be 0
INSERT INTO vendors (name) VALUES ('New Vendor'); -- Should get default alias
```

---

### Task 1.5: Create batch alias snapshot trigger
**Duration:** 1 hour  
**Owner:** Backend/DB  
**Dependencies:** Tasks 1.1, 1.3, 1.4  
**Files:** `migrations/2026_05_17_005_create_alias_trigger.sql`

**Implementation:**
```sql
-- Copy from V2 spec lines 2186-2213
CREATE OR REPLACE FUNCTION update_batch_alias_snapshots()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.brand_id IS NOT NULL THEN
    SELECT alias INTO NEW.brand_alias FROM brands WHERE id = NEW.brand_id;
    IF NEW.brand_alias IS NULL THEN
      RAISE EXCEPTION 'Brand % does not have an alias', NEW.brand_id;
    END IF;
  END IF;
  
  IF NEW.vendor_id IS NOT NULL THEN
    SELECT alias INTO NEW.vendor_alias FROM vendors WHERE id = NEW.vendor_id;
    IF NEW.vendor_alias IS NULL THEN
      RAISE EXCEPTION 'Vendor % does not have an alias', NEW.vendor_id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER batch_alias_snapshot_trigger
  BEFORE INSERT OR UPDATE OF brand_id, vendor_id, status ON batches
  FOR EACH ROW
  EXECUTE FUNCTION update_batch_alias_snapshots();
```

**Acceptance Criteria:**
- [ ] Trigger fires on INSERT
- [ ] Trigger fires on UPDATE of brand_id, vendor_id, status
- [ ] brand_alias populated from brands table
- [ ] vendor_alias populated from vendors table
- [ ] Exception raised if alias is NULL
- [ ] Application-layer validation recommended (see validation note)

**Validation:**
```sql
-- Test trigger populates aliases
INSERT INTO batches (brand_id, vendor_id, ...) 
VALUES ('uuid-brand', 'uuid-vendor', ...);
SELECT brand_alias, vendor_alias FROM batches WHERE id = (last inserted); 
-- Should show aliases, not NULL
```

**Note:** Add application-layer validation before status changes (V2 validation report concern #1):
```typescript
// Before batch.status = 'posted'
if (batch.brand_id && !batch.brand_alias) {
  // Refresh from DB or validate brand exists
}
```

---

### Task 1.6: Create updated_at triggers
**Duration:** 30 min  
**Owner:** Backend/DB  
**Files:** `migrations/2026_05_17_006_create_updated_at_triggers.sql`

**Implementation:**
```sql
-- Copy from V2 spec lines 2220-2233
-- Assumes update_updated_at_column() function exists
CREATE TRIGGER update_brands_updated_at
  BEFORE UPDATE ON brands
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_saved_filters_updated_at
  BEFORE UPDATE ON saved_filters
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
```

**Acceptance Criteria:**
- [ ] updated_at changes on brand UPDATE
- [ ] updated_at changes on saved_filter UPDATE
- [ ] Trigger uses existing helper function (or creates it)

**Validation:**
```sql
UPDATE brands SET name = 'Updated' WHERE id = 'uuid-test';
SELECT updated_at > created_at FROM brands WHERE id = 'uuid-test'; -- Should be true
```

---

### Task 1.7: Create all indexes on batches
**Duration:** 1 hour  
**Owner:** Backend/DB  
**Dependencies:** Tasks 1.3, 1.4  
**Files:** `migrations/2026_05_17_007_create_batch_indexes.sql`

**Implementation:**
```sql
-- Copy from V2 spec lines 2155-2180
-- Single-column indexes
CREATE INDEX batches_subcategory_idx ON batches(subcategory);
CREATE INDEX batches_brand_idx ON batches(brand_id);
CREATE INDEX batches_tags_idx ON batches USING gin(tags array_ops);
CREATE INDEX batches_intake_date_idx ON batches(intake_date);
CREATE INDEX batches_sort_id_idx ON batches(sort_id);

-- Partial indexes for customer queries
CREATE INDEX batches_posted_idx ON batches(id, created_at) 
  WHERE status = 'posted' AND archived_at IS NULL;

CREATE INDEX batches_vendor_alias_idx ON batches(vendor_alias) 
  WHERE status = 'posted' AND archived_at IS NULL;

-- Composite indexes
CREATE INDEX batches_category_subcategory_idx ON batches(category, subcategory) 
  WHERE archived_at IS NULL;
  
CREATE INDEX batches_subcategory_category_idx ON batches(subcategory, category) 
  WHERE archived_at IS NULL;

CREATE INDEX batches_brand_vendor_idx ON batches(brand_id, vendor_id) 
  WHERE archived_at IS NULL;

CREATE INDEX batches_price_qty_idx ON batches(unit_price, available_qty) 
  WHERE archived_at IS NULL;

CREATE INDEX batches_category_brand_idx ON batches(category, brand_id) 
  WHERE archived_at IS NULL;

CREATE INDEX batches_vendor_category_idx ON batches(vendor_id, category) 
  WHERE archived_at IS NULL;
```

**Acceptance Criteria:**
- [ ] All 13 indexes created
- [ ] GIN index uses array_ops
- [ ] Partial indexes have WHERE clauses
- [ ] Index creation completes in <5 minutes on production data

**Validation:**
```sql
-- Check all indexes exist
SELECT indexname FROM pg_indexes WHERE tablename = 'batches' 
  AND indexname LIKE 'batches_%';
-- Should show all 13 new indexes
```

---

### Task 1.8: Backfill sort_id
**Duration:** 1 hour (depends on data size)  
**Owner:** Backend/DB  
**Dependencies:** Task 1.3  
**Files:** `migrations/2026_05_17_008_backfill_sort_id.sql`

**Implementation:**
```sql
-- Copy from V2 spec lines 2084-2097
WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at, id) as rn
  FROM batches
)
UPDATE batches SET sort_id = numbered.rn
FROM numbered
WHERE batches.id = numbered.id;

-- Reset sequence
SELECT setval('batches_sort_id_seq', (SELECT MAX(sort_id) FROM batches));
```

**Acceptance Criteria:**
- [ ] All batches have sort_id in created_at order
- [ ] No gaps in sort_id sequence
- [ ] Sequence reset to continue from max
- [ ] sort_id order matches created_at order (tie-broken by id)

**Validation:**
```sql
-- Verify order
SELECT id, sort_id, created_at FROM batches ORDER BY sort_id LIMIT 100;
-- Should be in created_at order

-- Verify sequence
SELECT nextval('batches_sort_id_seq'); 
-- Should be (max sort_id + 1)
```

---

### Task 1.9: Create customer privacy views
**Duration:** 30 min  
**Owner:** Backend/DB  
**Dependencies:** Tasks 1.3, 1.4, 1.5  
**Files:** `migrations/2026_05_17_009_create_views.sql`

**Implementation:**
```sql
-- Copy from V2 spec lines 2239-2280
DROP VIEW IF EXISTS batches_customer_safe;
DROP VIEW IF EXISTS batches_operator;

-- DEPENDENCIES: These views depend on batches.brand_alias and batches.vendor_alias
-- If dropping these columns, drop views first

CREATE VIEW batches_customer_safe AS
SELECT 
  b.id, b.batch_code, b.name, b.category, b.subcategory,
  b.tags, b.available_qty, b.unit_price, b.location,
  b.intake_date, b.status, b.photo_url, b.media_status,
  COALESCE(b.brand_alias, 'Unknown Brand') as brand_name,
  COALESCE(b.vendor_alias, 'Unknown Vendor') as vendor_name
FROM batches b
WHERE b.status = 'posted';

CREATE VIEW batches_operator AS
SELECT 
  b.*,
  br.name as brand_real_name,
  br.alias as brand_alias_current,
  v.name as vendor_real_name,
  v.alias as vendor_alias_current
FROM batches b
LEFT JOIN brands br ON br.id = b.brand_id
LEFT JOIN vendors v ON v.id = b.vendor_id;
```

**Acceptance Criteria:**
- [ ] batches_customer_safe shows only aliases
- [ ] batches_customer_safe filters status='posted'
- [ ] batches_operator shows both real names and aliases
- [ ] Views use snapshot columns (b.brand_alias, b.vendor_alias)
- [ ] DROP IF EXISTS for idempotency

**Validation:**
```sql
SELECT brand_name, vendor_name FROM batches_customer_safe LIMIT 10;
-- Should show aliases, not real names, no NULLs (COALESCE works)
```

---

### Task 1.10: Add table comments and set fillfactor
**Duration:** 15 min  
**Owner:** Backend/DB  
**Files:** `migrations/2026_05_17_010_table_tuning.sql`

**Implementation:**
```sql
-- Copy from V2 spec lines 2033-2060, 2075-2081
COMMENT ON COLUMN batches.sort_id IS 
  'Sequential ID for stable cursor-based pagination. More efficient than OFFSET at high pages.';

ALTER TABLE saved_filters SET (fillfactor = 90);
ALTER TABLE brands SET (fillfactor = 95);
```

**Acceptance Criteria:**
- [ ] Comment added to sort_id column
- [ ] Fillfactor set for HOT updates
- [ ] Tables analyzed after changes

**Validation:**
```sql
SELECT obj_description('batches'::regclass, 'pg_class');
-- Should show comment
```

---

## Phase 2: Shared Type Definitions (Tasks 11-15)

**Duration:** 1 day  
**Dependencies:** Phase 1 complete  
**Critical Path:** Yes

### Task 2.1: Create FILTER_FIELDS configuration
**Duration:** 1 hour  
**Owner:** Backend  
**Files:** `src/shared/filterSchemas.ts` (create new)

**Implementation:**
```typescript
// Copy from V2 spec lines 282-315
export const FILTER_FIELDS = {
  category: {
    label: 'Category',
    type: 'text' as const,
    sqlColumn: 'b.category',
    operators: ['equals', 'not_equals', 'text_contains', 'text_not_contains'] as const,
  },
  subcategory: {
    label: 'Subcategory',
    type: 'text' as const,
    sqlColumn: 'b.subcategory',
    operators: ['equals', 'not_equals', 'text_contains', 'text_not_contains', 'is_null', 'is_not_null'] as const,
  },
  // ... all 13 fields from spec
} as const;

export const ALLOWED_FILTER_FIELDS = Object.keys(FILTER_FIELDS);
export type FilterFieldKey = keyof typeof FILTER_FIELDS;
```

**Acceptance Criteria:**
- [ ] All 13 fields defined
- [ ] Each field has label, type, sqlColumn, operators
- [ ] sqlColumn uses 'b.' table alias
- [ ] Type exported for use in frontend/backend
- [ ] ALLOWED_FILTER_FIELDS exported for whitelist checks

**Validation:**
```typescript
import { FILTER_FIELDS, ALLOWED_FILTER_FIELDS } from './filterSchemas';
console.log(ALLOWED_FILTER_FIELDS); 
// Should show 13 field names
console.log(FILTER_FIELDS.category.operators);
// Should show text operators
```

---

### Task 2.2: Create Zod condition schemas
**Duration:** 2 hours  
**Owner:** Backend  
**Dependencies:** Task 2.1  
**Files:** `src/shared/filterSchemas.ts`

**Implementation:**
```typescript
// Copy from V2 spec lines 317-397
import { z } from 'zod';

const NullCheckCondition = z.object({
  field: z.enum(ALLOWED_FILTER_FIELDS as [string, ...string[]]),
  operator: z.enum(['is_null', 'is_not_null']),
  value: z.null()
});

const BetweenCondition = z.object({
  field: z.enum(['unitPrice', 'unitCost', 'availableQty', 'ageDays']),
  operator: z.literal('between'),
  value: z.tuple([z.number().finite(), z.number().finite()])
    .refine(([min, max]) => min <= max, { 
      message: 'Min must be <= max' 
    })
});

// ... all 5 condition types from spec
// ... FilterCondition discriminated union
```

**Acceptance Criteria:**
- [ ] All 5 condition types defined
- [ ] Discriminated union created
- [ ] Between operator validates min <= max
- [ ] Number fields use .finite() validation
- [ ] Type exports work in TypeScript

**Validation:**
```typescript
const testCondition = { field: 'category', operator: 'equals', value: 'Flower' };
const result = FilterCondition.safeParse(testCondition);
console.log(result.success); // Should be true

const badBetween = { field: 'unitPrice', operator: 'between', value: [100, 50] };
const result2 = BetweenCondition.safeParse(badBetween);
console.log(result2.success); // Should be false (min > max)
```

---

### Task 2.3: Create recursive FilterGroup schema
**Duration:** 1.5 hours  
**Owner:** Backend  
**Dependencies:** Task 2.2  
**Files:** `src/shared/filterSchemas.ts`

**Implementation:**
```typescript
// Copy from V2 spec lines 399-453
const MAX_FILTER_DEPTH = 5;
const MAX_CONDITIONS_PER_GROUP = 50;

function checkDepth(group: any, currentDepth = 0): number {
  if (currentDepth > MAX_FILTER_DEPTH) {
    return currentDepth;
  }
  
  const childDepths = group.conditions.map((c: any) => {
    if ('logic' in c) {
      return checkDepth(c, currentDepth + 1);
    }
    return currentDepth;
  });
  
  return Math.max(currentDepth, ...childDepths);
}

type FilterGroupInput = {
  logic: 'AND' | 'OR';
  conditions: (FilterConditionType | FilterGroupInput)[];
};

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

export type FilterGroup = z.infer<typeof FilterGroup>;
```

**Acceptance Criteria:**
- [ ] Recursive schema compiles
- [ ] Depth limit enforced (max 5 levels)
- [ ] Condition count limit enforced (max 50 per group)
- [ ] checkDepth function works correctly
- [ ] Type inference works

**Validation:**
```typescript
const deepFilter = {
  logic: 'AND',
  conditions: [
    { logic: 'AND', conditions: [
      { logic: 'AND', conditions: [
        { logic: 'AND', conditions: [
          { logic: 'AND', conditions: [
            { logic: 'AND', conditions: [
              { field: 'category', operator: 'equals', value: 'Flower' }
            ]}
          ]}
        ]}
      ]}
    ]}
  ]
};
const result = FilterGroup.safeParse(deepFilter);
console.log(result.success); // Should be false (depth = 6 > 5)
```

---

### Task 2.4: Create saved filter schemas
**Duration:** 30 min  
**Owner:** Backend  
**Dependencies:** Task 2.3  
**Files:** `src/shared/filterSchemas.ts`

**Implementation:**
```typescript
// Copy from V2 spec lines 455-479
export const SavedFilterInput = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  targetView: z.enum(['inventory', 'items', 'purchase_orders', 'sales_orders', 'matchmaking', 'all']),
  filterDefinition: FilterGroup,
  isGlobal: z.boolean().default(false)
});

export const SavedFilter = SavedFilterInput.extend({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  schemaVersion: z.number().int().positive(),
  createdAt: z.date(),
  updatedAt: z.date(),
  createdBy: z.string().uuid().optional(),
  updatedBy: z.string().uuid().optional()
});

export type SavedFilterInput = z.infer<typeof SavedFilterInput>;
export type SavedFilter = z.infer<typeof SavedFilter>;
```

**Acceptance Criteria:**
- [ ] Input schema for creating filters
- [ ] Full schema with DB fields
- [ ] targetView enum matches DB constraint
- [ ] Types exported

**Validation:**
```typescript
const input = {
  name: 'Test Filter',
  targetView: 'inventory',
  filterDefinition: { logic: 'AND', conditions: [...] },
  isGlobal: false
};
const result = SavedFilterInput.safeParse(input);
console.log(result.success); // Should be true
```

---

### Task 2.5: Create pagination schemas
**Duration:** 15 min  
**Owner:** Backend  
**Files:** `src/shared/filterSchemas.ts`

**Implementation:**
```typescript
// Copy from V2 spec lines 481-488
export const PaginationInput = z.object({
  limit: z.number().int().min(1).max(100).default(50),
  cursor: z.number().int().positive().optional()
});

export type PaginationInput = z.infer<typeof PaginationInput>;
```

**Acceptance Criteria:**
- [ ] Limit validated (1-100)
- [ ] Cursor is optional positive integer
- [ ] Default limit is 50

---

## Phase 3: Backend Implementation (Tasks 16-25)

**Duration:** 3 days  
**Dependencies:** Phase 2 complete  
**Critical Path:** Yes

### Task 3.1: Create rate limiter module
**Duration:** 1 hour  
**Owner:** Backend  
**Files:** `src/server/utils/ratelimit.ts` (create new)

**Implementation:**
```typescript
// Copy from V2 spec lines 647-681
import { TRPCError } from '@trpc/server';

interface RateLimitConfig {
  limit: number;
  window: number; // milliseconds
}

class SimpleRateLimiter {
  private requests: Map<string, number[]> = new Map();
  
  async limit(key: string, config: RateLimitConfig): Promise<{ success: boolean }> {
    const now = Date.now();
    const windowStart = now - config.window;
    
    const timestamps = this.requests.get(key) || [];
    const recentRequests = timestamps.filter(t => t > windowStart);
    
    if (recentRequests.length >= config.limit) {
      return { success: false };
    }
    
    recentRequests.push(now);
    this.requests.set(key, recentRequests);
    
    // Cleanup old entries every 1000 requests
    if (this.requests.size > 1000) {
      for (const [k, v] of this.requests.entries()) {
        if (v.every(t => t < windowStart)) {
          this.requests.delete(k);
        }
      }
    }
    
    return { success: true };
  }
}

export const ratelimit = new SimpleRateLimiter();
```

**Acceptance Criteria:**
- [ ] Rate limiter tracks requests per key
- [ ] Window-based limiting works
- [ ] Cleanup prevents memory leaks
- [ ] Returns success boolean
- [ ] Production note: replace with Redis/Upstash

**Validation:**
```typescript
// Test rate limiting
for (let i = 0; i < 25; i++) {
  const result = await ratelimit.limit('test-key', { limit: 20, window: 60000 });
  console.log(`Request ${i+1}:`, result.success);
  // First 20 should be true, rest false
}
```

---

### Task 3.2: Create SQL filter builder
**Duration:** 3 hours  
**Owner:** Backend  
**Dependencies:** Task 2.1, 2.2, 2.3  
**Files:** `src/server/utils/filterSqlBuilder.ts` (create new)

**Implementation:**
```typescript
// Copy from V2 spec lines 490-645
import { TRPCError } from '@trpc/server';
import { FilterGroup, FilterCondition, FILTER_FIELDS } from '../../shared/filterSchemas';

export type SqlParams = (string | number | boolean | null)[];

const MAX_RECURSION_DEPTH = 100;

export function buildFilterSql(
  group: FilterGroup,
  params: SqlParams,
  whereClauses: string[],
  depth = 0
): void {
  // Validate depth
  if (depth > MAX_RECURSION_DEPTH) {
    throw new TRPCError({ 
      code: 'BAD_REQUEST', 
      message: 'Filter recursion depth exceeded' 
    });
  }
  
  // Validate logic operator (defense in depth)
  if (group.logic !== 'AND' && group.logic !== 'OR') {
    throw new TRPCError({ 
      code: 'BAD_REQUEST', 
      message: 'Invalid logic operator' 
    });
  }
  
  const groupClauses: string[] = [];
  
  for (const condition of group.conditions) {
    if ('operator' in condition) {
      const sql = buildConditionSql(condition, params);
      if (!sql) {
        throw new TRPCError({ 
          code: 'INTERNAL_SERVER_ERROR', 
          message: 'Failed to build SQL condition' 
        });
      }
      groupClauses.push(sql);
    } else {
      const nestedClauses: string[] = [];
      buildFilterSql(condition, params, nestedClauses, depth + 1);
      if (nestedClauses.length > 0) {
        groupClauses.push(`(${nestedClauses.join(` ${condition.logic} `)})`);
      }
    }
  }
  
  if (groupClauses.length > 0) {
    whereClauses.push(`(${groupClauses.join(` ${group.logic} `)})`);
  }
}

function buildConditionSql(condition: FilterCondition, params: SqlParams): string | null {
  const fieldConfig = FILTER_FIELDS[condition.field as keyof typeof FILTER_FIELDS];
  if (!fieldConfig) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid field' });
  }
  
  const sqlField = fieldConfig.sqlColumn;
  
  switch (condition.operator) {
    case 'equals':
      params.push(condition.value);
      return `${sqlField} = $${params.length}`;
    
    case 'not_equals':
      params.push(condition.value);
      return `${sqlField} != $${params.length}`;
    
    case 'greater_than':
      params.push(condition.value);
      return `${sqlField} > $${params.length}`;
    
    case 'less_than':
      params.push(condition.value);
      return `${sqlField} < $${params.length}`;
    
    case 'greater_than_or_equal':
      params.push(condition.value);
      return `${sqlField} >= $${params.length}`;
    
    case 'less_than_or_equal':
      params.push(condition.value);
      return `${sqlField} <= $${params.length}`;
    
    case 'between':
      params.push(condition.value[0], condition.value[1]);
      return `${sqlField} BETWEEN $${params.length - 1} AND $${params.length}`;
    
    case 'text_contains':
      params.push(`%${condition.value}%`);
      return `${sqlField} ILIKE $${params.length}`;
    
    case 'text_not_contains':
      params.push(`%${condition.value}%`);
      return `${sqlField} NOT ILIKE $${params.length}`;
    
    case 'array_contains':
      params.push(condition.value);
      return `${sqlField} @> $${params.length}::varchar[]`;
    
    case 'array_not_contains':
      params.push(condition.value);
      return `NOT (${sqlField} @> $${params.length}::varchar[])`;
    
    case 'is_null':
      return `${sqlField} IS NULL`;
    
    case 'is_not_null':
      return `${sqlField} IS NOT NULL`;
    
    default:
      return null;
  }
}
```

**Acceptance Criteria:**
- [ ] All 13 operators implemented
- [ ] Parameterized queries (no string concatenation)
- [ ] Recursion depth protection
- [ ] Logic operator validation
- [ ] Field whitelist validation
- [ ] Proper array operators (@>)
- [ ] Error handling for invalid conditions

**Validation:**
```typescript
const filter: FilterGroup = {
  logic: 'AND',
  conditions: [
    { field: 'category', operator: 'equals', value: 'Flower' },
    { field: 'unitPrice', operator: 'between', value: [10, 50] }
  ]
};

const params: SqlParams = [];
const whereClauses: string[] = [];
buildFilterSql(filter, params, whereClauses);

console.log(whereClauses); // Should show parameterized WHERE clauses
console.log(params); // Should show ['Flower', 10, 50]
```

---

### Task 3.3: Create filters tRPC router - applyBatchFilters
**Duration:** 2 hours  
**Owner:** Backend  
**Dependencies:** Tasks 3.1, 3.2  
**Files:** `src/server/routers/filters.ts` (create new)

**Implementation:**
```typescript
// Copy from V2 spec lines 683-806
import { router, protectedProcedure } from '../trpc';
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { pool } from '../db';
import { FilterGroup, PaginationInput } from '../../shared/filterSchemas';
import { buildFilterSql, SqlParams } from '../utils/filterSqlBuilder';
import { ratelimit } from '../utils/ratelimit';

export const filtersRouter = router({
  applyBatchFilters: protectedProcedure
    .input(z.object({
      filter: FilterGroup,
      pagination: PaginationInput.optional()
    }))
    .query(async ({ input, ctx }) => {
      // Rate limiting
      const { success } = await ratelimit.limit(
        `filter:${ctx.user.id}`,
        { limit: 20, window: 60000 }
      );
      if (!success) {
        throw new TRPCError({ 
          code: 'TOO_MANY_REQUESTS',
          message: 'Too many filter requests. Please wait and try again.'
        });
      }
      
      const params: SqlParams = [];
      const whereClauses: string[] = [
        "b.archived_at IS NULL",
        "b.status = 'posted'"
      ];
      
      buildFilterSql(input.filter, params, whereClauses);
      
      if (input.pagination?.cursor) {
        params.push(input.pagination.cursor);
        whereClauses.push(`b.sort_id > $${params.length}`);
      }
      
      const limit = input.pagination?.limit ?? 50;
      params.push(limit + 1); // Fetch one extra to detect hasMore
      
      const query = `
        SELECT 
          b.id, b.sort_id, b.batch_code AS "batchCode", b.name, 
          b.category, b.subcategory, b.unit_price AS "unitPrice",
          b.available_qty AS "availableQty", b.location, b.status,
          b.intake_date AS "intakeDate", b.brand_alias AS "brandName",
          b.vendor_alias AS "vendorName", b.tags
        FROM batches b
        WHERE ${whereClauses.join(' AND ')}
        ORDER BY b.sort_id
        LIMIT $${params.length}
      `;
      
      // Query timeout
      const queryPromise = pool.query(query, params);
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Query timeout')), 30000)
      );
      
      const result = await Promise.race([queryPromise, timeoutPromise])
        .catch(err => {
          console.error('Filter query error:', err);
          throw new TRPCError({ 
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to execute filter query'
          });
        });
      
      const hasMore = result.rows.length > limit;
      const batches = hasMore ? result.rows.slice(0, limit) : result.rows;
      
      return {
        batches,
        nextCursor: hasMore ? batches[batches.length - 1].sort_id : null
      };
    }),
  
  // Additional procedures continue below...
});
```

**Acceptance Criteria:**
- [ ] Rate limiting enforced (20 req/min)
- [ ] Query timeout protection (30s)
- [ ] Cursor pagination with hasMore detection
- [ ] Returns batches with customer-safe aliases
- [ ] Parameterized SQL injection protection
- [ ] Error handling for all failure modes

**Validation:**
```typescript
// Test via tRPC client
const result = await trpc.filters.applyBatchFilters.query({
  filter: {
    logic: 'AND',
    conditions: [{ field: 'category', operator: 'equals', value: 'Flower' }]
  },
  pagination: { limit: 10 }
});
console.log(result.batches.length); // Should be <= 10
console.log(result.nextCursor); // Should be number or null
```

---

### Task 3.4: Implement saveFilter procedure
**Duration:** 1.5 hours  
**Owner:** Backend  
**Files:** `src/server/routers/filters.ts`

**Implementation:**
```typescript
// Copy from V2 spec lines 808-860
saveFilter: protectedProcedure
  .input(SavedFilterInput)
  .mutation(async ({ input, ctx }) => {
    // Permission check for global filters
    if (input.isGlobal && !['owner', 'manager'].includes(ctx.user.role)) {
      throw new TRPCError({ 
        code: 'FORBIDDEN',
        message: 'Only managers can create global filters'
      });
    }
    
    // Re-validate filter definition
    try {
      FilterGroup.parse(input.filterDefinition);
    } catch (err) {
      throw new TRPCError({ 
        code: 'BAD_REQUEST', 
        message: 'Invalid filter structure' 
      });
    }
    
    try {
      const result = await pool.query(
        `INSERT INTO saved_filters 
         (user_id, name, description, target_view, filter_definition, schema_version, is_global, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (user_id, name, target_view) DO UPDATE SET
           description = EXCLUDED.description,
           filter_definition = EXCLUDED.filter_definition,
           is_global = EXCLUDED.is_global,
           updated_at = now(),
           updated_by = EXCLUDED.created_by
         RETURNING id, name, created_at, updated_at`,
        [
          ctx.user.id, 
          input.name, 
          input.description || null, 
          input.targetView,
          JSON.stringify(input.filterDefinition),
          1, // schema_version
          input.isGlobal,
          ctx.user.id
        ]
      );
      
      return result.rows[0];
    } catch (err: any) {
      if (err.code === '23505') { // Should not happen with ON CONFLICT, but defensive
        throw new TRPCError({ 
          code: 'CONFLICT',
          message: 'A filter with this name already exists' 
        });
      }
      throw err;
    }
  }),
```

**Acceptance Criteria:**
- [ ] Upsert pattern (ON CONFLICT DO UPDATE)
- [ ] Permission check for global filters
- [ ] Filter validation before save
- [ ] created_by/updated_by audit trail
- [ ] Proper error messages

**Validation:**
```typescript
// Test save and upsert
const filter1 = await trpc.filters.saveFilter.mutate({
  name: 'Test Filter',
  targetView: 'inventory',
  filterDefinition: { logic: 'AND', conditions: [] },
  isGlobal: false
});

const filter2 = await trpc.filters.saveFilter.mutate({
  name: 'Test Filter', // Same name
  targetView: 'inventory',
  filterDefinition: { logic: 'OR', conditions: [] }, // Different definition
  isGlobal: false
});

// Should update, not create new
console.log(filter1.id === filter2.id); // Should be true
```

---

### Task 3.5: Implement listSavedFilters procedure
**Duration:** 1 hour  
**Owner:** Backend  
**Files:** `src/server/routers/filters.ts`

**Implementation:**
```typescript
// Copy from V2 spec lines 862-898
listSavedFilters: protectedProcedure
  .input(z.object({
    targetView: z.enum(['inventory', 'items', 'purchase_orders', 'sales_orders', 'matchmaking', 'all']).optional()
  }))
  .query(async ({ input, ctx }) => {
    const params: (string | boolean)[] = [ctx.user.id];
    let whereClause = 'user_id = $1 AND deleted_at IS NULL';
    
    if (input.targetView) {
      params.push(input.targetView);
      whereClause += ` AND target_view = $${params.length}`;
    }
    
    const result = await pool.query(
      `SELECT 
        id, user_id AS "userId", name, description, target_view AS "targetView",
        filter_definition AS "filterDefinition", schema_version AS "schemaVersion",
        is_global AS "isGlobal", created_at AS "createdAt", updated_at AS "updatedAt"
       FROM saved_filters
       WHERE ${whereClause} OR (is_global = true AND deleted_at IS NULL ${input.targetView ? `AND target_view = $${params.length}` : ''})
       ORDER BY is_global DESC, name ASC`,
      params
    );
    
    return result.rows.map(row => ({
      ...row,
      filterDefinition: row.filterDefinition // Already parsed by pg
    }));
  }),
```

**Acceptance Criteria:**
- [ ] Returns user's personal filters
- [ ] Returns all global filters
- [ ] Filters by target_view if provided
- [ ] Excludes soft-deleted filters
- [ ] Ordered by global first, then alphabetically

**Validation:**
```typescript
const filters = await trpc.filters.listSavedFilters.query({ targetView: 'inventory' });
console.log(filters.length); // Should include user's + global filters
console.log(filters.every(f => f.targetView === 'inventory')); // Should be true
```

---

### Task 3.6: Implement getFilter procedure
**Duration:** 30 min  
**Owner:** Backend  
**Files:** `src/server/routers/filters.ts`

**Implementation:**
```typescript
// Copy from V2 spec lines 900-937
getFilter: protectedProcedure
  .input(z.object({
    id: z.string().uuid()
  }))
  .query(async ({ input, ctx }) => {
    const result = await pool.query(
      `SELECT 
        id, user_id AS "userId", name, description, target_view AS "targetView",
        filter_definition AS "filterDefinition", schema_version AS "schemaVersion",
        is_global AS "isGlobal", created_at AS "createdAt", updated_at AS "updatedAt"
       FROM saved_filters
       WHERE id = $1 AND deleted_at IS NULL`,
      [input.id]
    );
    
    if (result.rows.length === 0) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Filter not found' });
    }
    
    const filter = result.rows[0];
    
    // Permission check: must be owner or filter must be global
    if (filter.userId !== ctx.user.id && !filter.isGlobal) {
      throw new TRPCError({ 
        code: 'FORBIDDEN',
        message: 'You do not have permission to view this filter'
      });
    }
    
    return {
      ...filter,
      filterDefinition: filter.filterDefinition
    };
  }),
```

**Acceptance Criteria:**
- [ ] Returns filter by ID
- [ ] Permission check (owner or global)
- [ ] 404 if not found or deleted
- [ ] 403 if not permitted

---

### Task 3.7: Implement updateFilter procedure
**Duration:** 1 hour  
**Owner:** Backend  
**Files:** `src/server/routers/filters.ts`

**Implementation:**
```typescript
// Copy from V2 spec lines 939-1027
updateFilter: protectedProcedure
  .input(z.object({
    id: z.string().uuid(),
    name: z.string().min(1).max(120).optional(),
    description: z.string().max(500).optional(),
    filterDefinition: FilterGroup.optional(),
    isGlobal: z.boolean().optional()
  }))
  .mutation(async ({ input, ctx }) => {
    // Fetch existing filter
    const existing = await pool.query(
      'SELECT user_id, is_global FROM saved_filters WHERE id = $1 AND deleted_at IS NULL',
      [input.id]
    );
    
    if (existing.rows.length === 0) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Filter not found' });
    }
    
    const filter = existing.rows[0];
    
    // Permission check
    const isOwner = filter.user_id === ctx.user.id;
    const isManager = ['owner', 'manager'].includes(ctx.user.role);
    
    if (!isOwner && !(filter.is_global && isManager)) {
      throw new TRPCError({ 
        code: 'FORBIDDEN',
        message: 'You do not have permission to update this filter'
      });
    }
    
    // If changing to global, require manager role
    if (input.isGlobal === true && !isManager) {
      throw new TRPCError({ 
        code: 'FORBIDDEN',
        message: 'Only managers can create global filters'
      });
    }
    
    const updates: string[] = [];
    const params: any[] = [];
    let paramCount = 0;
    
    if (input.name !== undefined) {
      updates.push(`name = $${++paramCount}`);
      params.push(input.name);
    }
    
    if (input.description !== undefined) {
      updates.push(`description = $${++paramCount}`);
      params.push(input.description);
    }
    
    if (input.filterDefinition !== undefined) {
      updates.push(`filter_definition = $${++paramCount}`);
      params.push(JSON.stringify(input.filterDefinition));
    }
    
    if (input.isGlobal !== undefined) {
      updates.push(`is_global = $${++paramCount}`);
      params.push(input.isGlobal);
    }
    
    updates.push(`updated_at = now()`);
    updates.push(`updated_by = $${++paramCount}`);
    params.push(ctx.user.id);
    
    params.push(input.id);
    
    const result = await pool.query(
      `UPDATE saved_filters SET ${updates.join(', ')}
       WHERE id = $${params.length} AND deleted_at IS NULL
       RETURNING id, name, updated_at`,
      params
    );
    
    return result.rows[0];
  }),
```

**Acceptance Criteria:**
- [ ] Permission check (owner or manager for global)
- [ ] Partial updates supported
- [ ] updated_by audit trail
- [ ] Cannot change to global without manager role

---

### Task 3.8: Implement deleteFilter procedure
**Duration:** 45 min  
**Owner:** Backend  
**Files:** `src/server/routers/filters.ts`

**Implementation:**
```typescript
// Copy from V2 spec lines 1029-1069
deleteFilter: protectedProcedure
  .input(z.object({
    id: z.string().uuid()
  }))
  .mutation(async ({ input, ctx }) => {
    // Fetch existing filter
    const existing = await pool.query(
      'SELECT user_id, is_global FROM saved_filters WHERE id = $1 AND deleted_at IS NULL',
      [input.id]
    );
    
    if (existing.rows.length === 0) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Filter not found' });
    }
    
    const filter = existing.rows[0];
    
    // Permission check
    const isOwner = filter.user_id === ctx.user.id;
    const isManager = ['owner', 'manager'].includes(ctx.user.role);
    
    if (!isOwner && !(filter.is_global && isManager)) {
      throw new TRPCError({ 
        code: 'FORBIDDEN',
        message: 'You do not have permission to delete this filter'
      });
    }
    
    // Soft delete
    await pool.query(
      `UPDATE saved_filters 
       SET deleted_at = now(), deleted_by = $1
       WHERE id = $2`,
      [ctx.user.id, input.id]
    );
    
    return { success: true };
  }),
```

**Acceptance Criteria:**
- [ ] Soft delete (sets deleted_at)
- [ ] Permission check
- [ ] deleted_by audit trail
- [ ] Returns success

---

### Task 3.9: Implement getFacets procedure
**Duration:** 2 hours  
**Owner:** Backend  
**Files:** `src/server/routers/filters.ts`

**Implementation:**
```typescript
// Copy from V2 spec lines 1071-1157
getFacets: protectedProcedure
  .input(z.object({
    targetView: z.enum(['inventory', 'items', 'purchase_orders', 'sales_orders']).default('inventory')
  }))
  .query(async ({ input, ctx }) => {
    const table = input.targetView === 'inventory' ? 'batches' : input.targetView;
    
    // Fetch all facets in parallel
    const [categories, subcategories, brands, vendors, locations, statuses, tags] = await Promise.all([
      pool.query(`SELECT DISTINCT category FROM ${table} WHERE archived_at IS NULL ORDER BY category`),
      pool.query(`SELECT DISTINCT subcategory FROM ${table} WHERE subcategory IS NOT NULL AND archived_at IS NULL ORDER BY subcategory`),
      pool.query(`SELECT id, alias as label FROM brands WHERE active = true ORDER BY alias`),
      pool.query(`SELECT id, alias as label FROM vendors WHERE active = true ORDER BY alias`),
      pool.query(`SELECT DISTINCT location FROM ${table} WHERE location IS NOT NULL AND archived_at IS NULL ORDER BY location`),
      pool.query(`SELECT DISTINCT status FROM ${table} ORDER BY status`),
      pool.query(`SELECT DISTINCT unnest(tags) as tag FROM ${table} WHERE tags IS NOT NULL AND archived_at IS NULL ORDER BY tag`)
    ]);
    
    return {
      categories: categories.rows.map(r => r.category),
      subcategories: subcategories.rows.map(r => r.subcategory),
      brands: brands.rows.map(r => ({ value: r.id, label: r.label })),
      vendors: vendors.rows.map(r => ({ value: r.id, label: r.label })),
      locations: locations.rows.map(r => r.location),
      statuses: statuses.rows.map(r => r.status),
      tags: tags.rows.map(r => r.tag)
    };
  }),
```

**Acceptance Criteria:**
- [ ] Returns all unique values for dropdown population
- [ ] Brands/vendors show aliases, not real names
- [ ] Tags unnested into array
- [ ] Parallel queries for performance
- [ ] Excludes archived records
- [ ] Cached with 5min TTL (implement in tRPC context)

---

### Task 3.10: Register filters router in main router
**Duration:** 15 min  
**Owner:** Backend  
**Files:** `src/server/router.ts`

**Implementation:**
```typescript
// Add to existing router.ts
import { filtersRouter } from './routers/filters';

export const appRouter = router({
  // ... existing routers
  filters: filtersRouter,
});
```

**Acceptance Criteria:**
- [ ] Filters router exported
- [ ] Available at trpc.filters.*
- [ ] Type inference works

---

## Phase 4: Frontend Implementation (Tasks 26-35)

**Duration:** 5 days  
**Dependencies:** Phase 3 complete  
**Critical Path:** Yes

### Task 4.1: Create client-side filter evaluator
**Duration:** 3 hours  
**Owner:** Frontend  
**Files:** `src/client/utils/filterEvaluator.ts` (create new)

**Implementation:**
```typescript
// Copy from V2 spec lines 1159-1314
import { FilterGroup, FilterCondition, ALLOWED_FILTER_FIELDS } from '../../shared/filterSchemas';

const MAX_CLIENT_RECURSION = 100;

export function evaluateFilterGroup(
  row: Record<string, any>,
  group: FilterGroup,
  depth = 0
): boolean {
  if (depth > MAX_CLIENT_RECURSION) {
    throw new Error('Filter nesting too deep on client side');
  }
  
  const results = group.conditions.map(condition => {
    if ('operator' in condition) {
      return evaluateCondition(row, condition);
    } else {
      return evaluateFilterGroup(row, condition, depth + 1);
    }
  });
  
  return group.logic === 'AND' 
    ? results.every(Boolean)
    : results.some(Boolean);
}

function evaluateCondition(row: Record<string, any>, condition: FilterCondition): boolean {
  // Whitelist check
  if (!ALLOWED_FILTER_FIELDS.includes(condition.field)) {
    console.warn(`Unauthorized field access attempt: ${condition.field}`);
    return false;
  }
  
  const value = row[condition.field];
  
  // Handle null/undefined
  if (value == null) {
    return condition.operator === 'is_null';
  }
  
  switch (condition.operator) {
    case 'equals':
      return value === condition.value;
    
    case 'not_equals':
      return value !== condition.value;
    
    case 'greater_than':
      if (isNaN(Number(value))) return false;
      return Number(value) > Number(condition.value);
    
    case 'less_than':
      if (isNaN(Number(value))) return false;
      return Number(value) < Number(condition.value);
    
    case 'greater_than_or_equal':
      if (isNaN(Number(value))) return false;
      return Number(value) >= Number(condition.value);
    
    case 'less_than_or_equal':
      if (isNaN(Number(value))) return false;
      return Number(value) <= Number(condition.value);
    
    case 'between':
      if (isNaN(Number(value))) return false;
      return Number(value) >= Number(condition.value[0]) && 
             Number(value) <= Number(condition.value[1]);
    
    case 'text_contains':
      return String(value).toLowerCase().includes(String(condition.value).toLowerCase());
    
    case 'text_not_contains':
      return !String(value).toLowerCase().includes(String(condition.value).toLowerCase());
    
    case 'array_contains':
      return Array.isArray(value) && 
             condition.value.some(tag => value.includes(tag));
    
    case 'array_not_contains':
      return Array.isArray(value) && 
             !condition.value.some(tag => value.includes(tag));
    
    case 'is_null':
      return value == null;
    
    case 'is_not_null':
      return value != null;
    
    default:
      console.error('Unknown operator:', (condition as any).operator);
      return false;
  }
}
```

**Acceptance Criteria:**
- [ ] All 13 operators implemented
- [ ] Null/undefined handling correct
- [ ] NaN checking for numeric operations
- [ ] Array contains uses some() logic
- [ ] Recursion depth protection
- [ ] Field whitelist enforced
- [ ] Default case logs unknown operators

**Validation:**
```typescript
const testRow = {
  category: 'Flower',
  unitPrice: 25,
  tags: ['indoor', 'organic']
};

const filter: FilterGroup = {
  logic: 'AND',
  conditions: [
    { field: 'category', operator: 'equals', value: 'Flower' },
    { field: 'unitPrice', operator: 'between', value: [20, 30] },
    { field: 'tags', operator: 'array_contains', value: ['organic'] }
  ]
};

console.log(evaluateFilterGroup(testRow, filter)); // Should be true
```

---

### Task 4.2: Create SavedFiltersDropdown component
**Duration:** 2 hours  
**Owner:** Frontend  
**Files:** `src/client/components/SavedFiltersDropdown.tsx` (create new)

**Implementation:**
```typescript
// Copy from V2 spec lines 1914-1957
import { useState } from 'react';
import { trpc } from '../utils/trpc';

interface SavedFiltersDropdownProps {
  targetView: string;
  onSelect: (filter: any) => void;
}

export function SavedFiltersDropdown({ targetView, onSelect }: SavedFiltersDropdownProps) {
  const [search, setSearch] = useState('');
  
  const { data: filters, isLoading } = trpc.filters.listSavedFilters.useQuery({
    targetView: targetView as any
  });
  
  const filtered = filters?.filter(f => 
    f.name.toLowerCase().includes(search.toLowerCase())
  ) || [];
  
  if (isLoading) {
    return <div className="text-sm text-gray-500">Loading filters...</div>;
  }
  
  return (
    <div className="saved-filters-dropdown">
      <label className="label">Saved Filters</label>
      <input
        type="text"
        placeholder="Search filters..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="input input-sm"
      />
      <select
        className="select select-sm mt-2"
        onChange={(e) => {
          const filter = filters?.find(f => f.id === e.target.value);
          if (filter) onSelect(filter);
        }}
      >
        <option value="">Select a saved filter...</option>
        {filtered.map(filter => (
          <option key={filter.id} value={filter.id}>
            {filter.isGlobal && '🌐 '}{filter.name}
          </option>
        ))}
      </select>
    </div>
  );
}
```

**Acceptance Criteria:**
- [ ] Fetches filters for target view
- [ ] Search functionality
- [ ] Global filters marked with icon
- [ ] Calls onSelect with filter object
- [ ] Loading state shown

---

### Task 4.3: Create AdvancedFilterBuilder component - Part 1 (Structure)
**Duration:** 3 hours  
**Owner:** Frontend  
**Files:** `src/client/components/AdvancedFilterBuilder.tsx` (create new)

**Implementation:**
```typescript
// Copy from V2 spec lines 1316-1500 (component structure)
import { useState, useEffect } from 'react';
import { FilterGroup, FilterCondition, FILTER_FIELDS } from '../../shared/filterSchemas';
import { trpc } from '../utils/trpc';

interface AdvancedFilterBuilderProps {
  filter: FilterGroup;
  onChange: (filter: FilterGroup) => void;
  maxDepth?: number;
}

export function AdvancedFilterBuilder({ 
  filter, 
  onChange, 
  maxDepth = 5 
}: AdvancedFilterBuilderProps) {
  const { data: facets } = trpc.filters.getFacets.useQuery({});
  
  const handleAddCondition = (groupPath: number[]) => {
    const newFilter = JSON.parse(JSON.stringify(filter)); // Deep clone
    const group = getGroupAtPath(newFilter, groupPath);
    group.conditions.push({
      field: 'category',
      operator: 'equals',
      value: ''
    });
    onChange(newFilter);
  };
  
  const handleAddGroup = (groupPath: number[]) => {
    const currentDepth = groupPath.length;
    if (currentDepth >= maxDepth) {
      alert(`Maximum nesting depth of ${maxDepth} levels reached`);
      return;
    }
    
    const newFilter = JSON.parse(JSON.stringify(filter));
    const group = getGroupAtPath(newFilter, groupPath);
    group.conditions.push({
      logic: 'AND',
      conditions: []
    });
    onChange(newFilter);
  };
  
  const handleRemoveCondition = (groupPath: number[], index: number) => {
    const newFilter = JSON.parse(JSON.stringify(filter));
    const group = getGroupAtPath(newFilter, groupPath);
    group.conditions.splice(index, 1);
    onChange(newFilter);
  };
  
  const handleUpdateCondition = (groupPath: number[], index: number, updates: Partial<FilterCondition>) => {
    const newFilter = JSON.parse(JSON.stringify(filter));
    const group = getGroupAtPath(newFilter, groupPath);
    group.conditions[index] = { ...group.conditions[index], ...updates };
    onChange(newFilter);
  };
  
  const handleToggleLogic = (groupPath: number[]) => {
    const newFilter = JSON.parse(JSON.stringify(filter));
    const group = getGroupAtPath(newFilter, groupPath);
    group.logic = group.logic === 'AND' ? 'OR' : 'AND';
    onChange(newFilter);
  };
  
  return (
    <div className="advanced-filter-builder">
      <FilterGroupRenderer
        group={filter}
        groupPath={[]}
        depth={0}
        maxDepth={maxDepth}
        facets={facets}
        onAddCondition={handleAddCondition}
        onAddGroup={handleAddGroup}
        onRemoveCondition={handleRemoveCondition}
        onUpdateCondition={handleUpdateCondition}
        onToggleLogic={handleToggleLogic}
      />
    </div>
  );
}

function getGroupAtPath(filter: FilterGroup, path: number[]): FilterGroup {
  let current: FilterGroup = filter;
  for (const index of path) {
    current = current.conditions[index] as FilterGroup;
  }
  return current;
}
```

**Acceptance Criteria:**
- [ ] Add condition button works
- [ ] Add group button works (with depth check)
- [ ] Remove condition works
- [ ] Update condition works
- [ ] Toggle AND/OR works
- [ ] Deep cloning prevents mutation

---

### Task 4.4: Create AdvancedFilterBuilder component - Part 2 (Renderers)
**Duration:** 4 hours  
**Owner:** Frontend  
**Files:** `src/client/components/AdvancedFilterBuilder.tsx`

**Implementation:**
```typescript
// Copy from V2 spec lines 1502-1740 (renderer components)
interface FilterGroupRendererProps {
  group: FilterGroup;
  groupPath: number[];
  depth: number;
  maxDepth: number;
  facets: any;
  onAddCondition: (path: number[]) => void;
  onAddGroup: (path: number[]) => void;
  onRemoveCondition: (path: number[], index: number) => void;
  onUpdateCondition: (path: number[], index: number, updates: any) => void;
  onToggleLogic: (path: number[]) => void;
}

function FilterGroupRenderer({ 
  group, 
  groupPath, 
  depth, 
  maxDepth,
  facets,
  onAddCondition,
  onAddGroup,
  onRemoveCondition,
  onUpdateCondition,
  onToggleLogic
}: FilterGroupRendererProps) {
  const bgColor = depth % 2 === 0 ? 'bg-gray-50' : 'bg-white';
  const indent = depth * 20;
  
  return (
    <div 
      className={`filter-group ${bgColor} p-4 border border-gray-200 rounded`}
      style={{ marginLeft: `${indent}px` }}
    >
      {/* Logic toggle */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-sm font-medium">Match</span>
        <button
          onClick={() => onToggleLogic(groupPath)}
          className={`btn btn-sm ${group.logic === 'AND' ? 'btn-primary' : 'btn-secondary'}`}
        >
          {group.logic}
        </button>
        <span className="text-sm">of the following:</span>
      </div>
      
      {/* Conditions */}
      {group.conditions.map((condition, index) => {
        const conditionPath = [...groupPath, index];
        
        if ('operator' in condition) {
          return (
            <FilterConditionRenderer
              key={index}
              condition={condition}
              groupPath={groupPath}
              index={index}
              facets={facets}
              onUpdate={(updates) => onUpdateCondition(groupPath, index, updates)}
              onRemove={() => onRemoveCondition(groupPath, index)}
            />
          );
        } else {
          return (
            <FilterGroupRenderer
              key={index}
              group={condition}
              groupPath={conditionPath}
              depth={depth + 1}
              maxDepth={maxDepth}
              facets={facets}
              onAddCondition={onAddCondition}
              onAddGroup={onAddGroup}
              onRemoveCondition={onRemoveCondition}
              onUpdateCondition={onUpdateCondition}
              onToggleLogic={onToggleLogic}
            />
          );
        }
      })}
      
      {/* Add buttons */}
      <div className="flex gap-2 mt-3">
        <button
          onClick={() => onAddCondition(groupPath)}
          className="btn btn-sm btn-outline"
        >
          + Add Condition
        </button>
        {depth < maxDepth - 1 && (
          <button
            onClick={() => onAddGroup(groupPath)}
            className="btn btn-sm btn-outline"
          >
            + Add Group
          </button>
        )}
      </div>
    </div>
  );
}

interface FilterConditionRendererProps {
  condition: FilterCondition;
  groupPath: number[];
  index: number;
  facets: any;
  onUpdate: (updates: any) => void;
  onRemove: () => void;
}

function FilterConditionRenderer({ 
  condition, 
  facets, 
  onUpdate, 
  onRemove 
}: FilterConditionRendererProps) {
  const fieldConfig = FILTER_FIELDS[condition.field];
  const availableOperators = fieldConfig?.operators || [];
  
  return (
    <div className="filter-condition flex items-center gap-2 mb-2 p-2 bg-white border rounded">
      {/* Field selector */}
      <select
        value={condition.field}
        onChange={(e) => {
          const newField = e.target.value;
          const newFieldConfig = FILTER_FIELDS[newField];
          const defaultOperator = newFieldConfig.operators[0];
          onUpdate({ 
            field: newField, 
            operator: defaultOperator,
            value: newFieldConfig.type === 'number' ? 0 : ''
          });
        }}
        className="select select-sm"
      >
        {Object.entries(FILTER_FIELDS).map(([key, config]) => (
          <option key={key} value={key}>{config.label}</option>
        ))}
      </select>
      
      {/* Operator selector */}
      <select
        value={condition.operator}
        onChange={(e) => onUpdate({ operator: e.target.value })}
        className="select select-sm"
      >
        {availableOperators.map(op => (
          <option key={op} value={op}>
            {op.replace(/_/g, ' ')}
          </option>
        ))}
      </select>
      
      {/* Value input */}
      {condition.operator !== 'is_null' && condition.operator !== 'is_not_null' && (
        <ValueInput
          fieldConfig={fieldConfig}
          operator={condition.operator}
          value={condition.value}
          facets={facets}
          onChange={(value) => onUpdate({ value })}
        />
      )}
      
      {/* Remove button */}
      <button
        onClick={onRemove}
        className="btn btn-sm btn-error"
        aria-label="Remove condition"
      >
        ×
      </button>
    </div>
  );
}

function ValueInput({ fieldConfig, operator, value, facets, onChange }: any) {
  if (operator === 'between') {
    const [min, max] = Array.isArray(value) ? value : [0, 0];
    return (
      <div className="flex gap-1">
        <input
          type="number"
          value={min}
          onChange={(e) => onChange([Number(e.target.value), max])}
          className="input input-sm w-20"
        />
        <span>to</span>
        <input
          type="number"
          value={max}
          onChange={(e) => onChange([min, Number(e.target.value)])}
          className="input input-sm w-20"
        />
      </div>
    );
  }
  
  if (fieldConfig.type === 'number') {
    return (
      <input
        type="number"
        value={value || 0}
        onChange={(e) => onChange(Number(e.target.value))}
        className="input input-sm"
      />
    );
  }
  
  // Dropdown for fields with facets
  if (fieldConfig.key === 'category' && facets?.categories) {
    return (
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="select select-sm"
      >
        <option value="">Select...</option>
        {facets.categories.map((cat: string) => (
          <option key={cat} value={cat}>{cat}</option>
        ))}
      </select>
    );
  }
  
  // Similar for other faceted fields...
  
  // Default text input
  return (
    <input
      type="text"
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
      className="input input-sm"
    />
  );
}
```

**Acceptance Criteria:**
- [ ] Recursive group rendering with indentation
- [ ] Field selector populates from FILTER_FIELDS
- [ ] Operator selector shows only valid operators for field
- [ ] Value input adapts to field type
- [ ] Between operator shows two inputs
- [ ] Facets populate dropdowns
- [ ] Remove button works
- [ ] Visual hierarchy clear (colors/indentation)

---

### Task 4.5: Enhance InventoryFinderPanel - Add state
**Duration:** 1 hour  
**Owner:** Frontend  
**Files:** `src/client/components/InventoryFinderPanel.tsx`

**Implementation:**
```typescript
// Copy from V2 spec lines 1742-1779
// Add to existing InventoryFinderPanel component
import { useState, useMemo } from 'react';
import { FilterGroup } from '../../shared/filterSchemas';
import { evaluateFilterGroup } from '../utils/filterEvaluator';
import { SavedFiltersDropdown } from './SavedFiltersDropdown';
import { AdvancedFilterBuilder } from './AdvancedFilterBuilder';

export function InventoryFinderPanel({ ... }: Props) {
  // Existing simple filter state
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [vendorId, setVendorId] = useState('');
  const [priceMax, setPriceMax] = useState('');
  
  // NEW: Advanced filter state
  const [advancedFilter, setAdvancedFilter] = useState<FilterGroup | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [showCircuitBreakerWarning, setShowCircuitBreakerWarning] = useState(false);
  
  // Existing data fetch
  const reference = trpc.queries.reference.useQuery();
  const rows = reference.data?.availableBatches ?? [];
  
  // ... continue in next task
}
```

**Acceptance Criteria:**
- [ ] Advanced filter state added
- [ ] Advanced open/close state
- [ ] Circuit breaker warning state
- [ ] No breaking changes to existing functionality

---

### Task 4.6: Enhance InventoryFinderPanel - Add filtering logic
**Duration:** 2 hours  
**Owner:** Frontend  
**Files:** `src/client/components/InventoryFinderPanel.tsx`

**Implementation:**
```typescript
// Copy from V2 spec lines 1781-1824
// Enhanced filtering logic in useMemo
const filtered = useMemo(() => {
  // Circuit breaker for large datasets
  let rowsToFilter = rows;
  if (rows.length > 10000) {
    console.warn(`Large dataset (${rows.length} products) - consider server-side filtering`);
    setShowCircuitBreakerWarning(true);
    rowsToFilter = rows.slice(0, 10000);
  } else {
    setShowCircuitBreakerWarning(false);
  }
  
  // Compute ageDays for filtering
  const rowsWithAge = rowsToFilter.map(row => ({
    ...row,
    ageDays: row.intakeDate 
      ? Math.floor((Date.now() - new Date(row.intakeDate).getTime()) / (1000 * 60 * 60 * 24))
      : null
  }));
  
  const parsed = parseFinderSearch(search);  // Existing smart search
  
  return rowsWithAge
    .filter((row) => {
      // Existing simple filter logic (KEEP ALL EXISTING CODE)
      if (category && row.category !== category) return false;
      if (vendorId && row.vendorId !== vendorId) return false;
      if (priceMax && row.unitPrice > Number(priceMax)) return false;
      // ... all other existing filters ...
      
      // NEW: Advanced filter evaluation
      if (advancedFilter && advancedFilter.conditions.length > 0) {
        try {
          return evaluateFilterGroup(row, advancedFilter);
        } catch (err) {
          console.error('Filter evaluation error:', err);
          return false; // Exclude on error, don't crash
        }
      }
      
      return true;
    })
    .slice(0, 80);  // Keep existing result limit
}, [rows, search, category, vendorId, priceMax, JSON.stringify(advancedFilter)]);
```

**Acceptance Criteria:**
- [ ] Circuit breaker activates at 10k rows
- [ ] ageDays computed before filtering
- [ ] Existing simple filters still work
- [ ] Advanced filter integrates correctly
- [ ] Errors don't crash the UI
- [ ] JSON.stringify in dependencies (with TODO comment)

---

### Task 4.7: Enhance InventoryFinderPanel - Add UI elements
**Duration:** 2 hours  
**Owner:** Frontend  
**Files:** `src/client/components/InventoryFinderPanel.tsx`

**Implementation:**
```typescript
// Copy from V2 spec lines 1826-1912
return (
  <WorkspacePanel title="Inventory Finder">
    {/* Circuit breaker warning */}
    {showCircuitBreakerWarning && (
      <div className="alert alert-warning mb-4">
        Large dataset ({rows.length} products). Showing first 10,000. 
        Use advanced filters to narrow results.
      </div>
    )}
    
    {/* Saved filters dropdown */}
    <div className="mb-4">
      <SavedFiltersDropdown
        targetView="inventory"
        onSelect={(filter) => {
          setAdvancedFilter(filter.filterDefinition);
          setAdvancedOpen(true);
        }}
      />
    </div>
    
    {/* Existing simple filter controls (KEEP ALL EXISTING) */}
    <div className="finder-controls">
      {/* ... all existing controls ... */}
      
      {/* NEW: Advanced toggle button */}
      <button
        onClick={() => setAdvancedOpen(!advancedOpen)}
        className={`btn btn-sm ${advancedOpen ? 'btn-primary' : 'btn-outline'}`}
      >
        {advancedOpen ? 'Hide' : 'Show'} Advanced Filters
      </button>
      
      {/* NEW: Clear advanced filter button */}
      {advancedFilter && advancedFilter.conditions.length > 0 && (
        <button
          onClick={() => setAdvancedFilter(null)}
          className="btn btn-sm btn-outline"
        >
          Clear Advanced Filter
        </button>
      )}
    </div>
    
    {/* NEW: Advanced filter builder (conditionally rendered) */}
    {advancedOpen && (
      <div className="mt-4 mb-4">
        <AdvancedFilterBuilder
          filter={advancedFilter ?? { logic: 'AND', conditions: [] }}
          onChange={setAdvancedFilter}
        />
        
        {/* Save filter button */}
        <div className="mt-2 flex gap-2">
          <button
            onClick={handleSaveFilter}
            className="btn btn-sm btn-primary"
            disabled={!advancedFilter || advancedFilter.conditions.length === 0}
          >
            Save Filter
          </button>
        </div>
      </div>
    )}
    
    {/* Existing results table */}
    <div className="finder-table-wrap">
      {/* ... existing table ... */}
    </div>
  </WorkspacePanel>
);
```

**Acceptance Criteria:**
- [ ] Circuit breaker warning shows when triggered
- [ ] Saved filters dropdown integrated
- [ ] Loading saved filter sets advanced filter and opens builder
- [ ] Toggle button opens/closes advanced builder
- [ ] Clear button removes advanced filter
- [ ] Save button (implement in next task)
- [ ] All existing UI preserved

---

### Task 4.8: Implement save filter functionality
**Duration:** 1 hour  
**Owner:** Frontend  
**Files:** `src/client/components/InventoryFinderPanel.tsx`

**Implementation:**
```typescript
// Add save filter handler
const saveFilterMutation = trpc.filters.saveFilter.useMutation({
  onSuccess: () => {
    // Invalidate saved filters query to refresh dropdown
    trpcUtils.filters.listSavedFilters.invalidate();
    alert('Filter saved successfully!');
  },
  onError: (err) => {
    alert(`Failed to save filter: ${err.message}`);
  }
});

const handleSaveFilter = () => {
  if (!advancedFilter || advancedFilter.conditions.length === 0) return;
  
  const name = prompt('Enter a name for this filter:');
  if (!name) return;
  
  const isGlobal = confirm('Make this filter available to all users?');
  
  saveFilterMutation.mutate({
    name,
    description: '',
    targetView: 'inventory',
    filterDefinition: advancedFilter,
    isGlobal
  });
};
```

**Acceptance Criteria:**
- [ ] Prompts for filter name
- [ ] Asks if global
- [ ] Saves to database
- [ ] Invalidates cache on success
- [ ] Shows success/error messages
- [ ] Dropdown updates after save

---

## Phase 5: Testing (Tasks 36-42)

**Duration:** 2 days (parallel with other work)  
**Dependencies:** Phases 1-4 complete  
**Critical Path:** No (can run in parallel)

### Task 5.1: Write filter evaluator unit tests
**Duration:** 3 hours  
**Owner:** QA/Backend  
**Files:** `src/tests/filterEvaluator.test.ts` (create new)

**Implementation:**
```typescript
// Copy from V2 spec sections showing test examples
import { describe, it, expect } from 'vitest';
import { evaluateFilterGroup } from '../client/utils/filterEvaluator';

describe('filterEvaluator', () => {
  describe('equals operator', () => {
    it('should match exact values', () => {
      const row = { category: 'Flower' };
      const filter = {
        logic: 'AND' as const,
        conditions: [{ field: 'category', operator: 'equals' as const, value: 'Flower' }]
      };
      expect(evaluateFilterGroup(row, filter)).toBe(true);
    });
    
    it('should not match different values', () => {
      const row = { category: 'Extract' };
      const filter = {
        logic: 'AND' as const,
        conditions: [{ field: 'category', operator: 'equals' as const, value: 'Flower' }]
      };
      expect(evaluateFilterGroup(row, filter)).toBe(false);
    });
  });
  
  // 50+ more test cases covering all operators, null handling, arrays, etc.
});
```

**Acceptance Criteria:**
- [ ] 50+ test cases
- [ ] All 13 operators tested
- [ ] Null/undefined handling tested
- [ ] NaN edge cases tested
- [ ] Nested logic tested
- [ ] Array operators tested
- [ ] All tests pass

---

### Task 5.2: Write SQL builder unit tests
**Duration:** 2 hours  
**Owner:** Backend/QA  
**Files:** `src/tests/filterSqlBuilder.test.ts` (create new)

**Acceptance Criteria:**
- [ ] Tests for all operators
- [ ] SQL injection attempt tests
- [ ] Parameterization verification
- [ ] Recursion depth tests
- [ ] Invalid field tests

---

### Task 5.3: Write tRPC integration tests
**Duration:** 3 hours  
**Owner:** Backend/QA  
**Files:** `src/tests/filtersRouter.test.ts` (create new)

**Acceptance Criteria:**
- [ ] Test all 6 procedures
- [ ] Permission checks tested
- [ ] Rate limiting tested
- [ ] Validation errors tested
- [ ] Happy path + error paths

---

### Task 5.4: Write frontend component tests
**Duration:** 2 hours  
**Owner:** Frontend/QA  
**Files:** `src/tests/AdvancedFilterBuilder.test.tsx`

**Acceptance Criteria:**
- [ ] Add/remove condition tests
- [ ] Add/remove group tests
- [ ] Depth limit enforcement
- [ ] Field/operator/value changes

---

### Task 5.5: Run EXPLAIN ANALYZE validation
**Duration:** 1 hour  
**Owner:** DBA/Backend  
**Files:** SQL console

**Implementation:**
```sql
-- Copy EXPLAIN queries from V2 spec lines 2759-2790
EXPLAIN ANALYZE
SELECT ...
FROM batches b
WHERE (b.category = 'Flower') AND (b.unit_price BETWEEN 10 AND 50);
-- Verify indexes used
```

**Acceptance Criteria:**
- [ ] All composite indexes used appropriately
- [ ] Partial indexes used for customer queries
- [ ] No sequential scans on large tables
- [ ] Query execution < 500ms on 100k rows

---

### Task 5.6: Performance benchmark tests
**Duration:** 2 hours  
**Owner:** Backend/QA  
**Files:** `src/tests/performance.test.ts`

**Acceptance Criteria:**
- [ ] 100k product dataset
- [ ] Complex filter < 500ms
- [ ] Client-side eval 10k products < 100ms
- [ ] Facet query < 200ms

---

### Task 5.7: Security fuzzing tests
**Duration:** 2 hours  
**Owner:** Security/QA  
**Files:** `src/tests/security.test.ts`

**Implementation:**
```typescript
// Test prototype pollution, SQL injection, field whitelist bypass
describe('Security tests', () => {
  it('should reject __proto__ field access', () => {
    const row = { category: 'Flower' };
    const maliciousFilter = {
      logic: 'AND',
      conditions: [{ field: '__proto__', operator: 'equals', value: 'evil' }]
    };
    // Should return false (unauthorized field)
    expect(evaluateFilterGroup(row, maliciousFilter)).toBe(false);
  });
  
  // 10+ more security test cases
});
```

**Acceptance Criteria:**
- [ ] Prototype pollution attempts rejected
- [ ] SQL injection payloads caught
- [ ] Field whitelist enforced
- [ ] Logic operator injection blocked
- [ ] Deep nesting DoS prevented

---

## Phase 6: Rollout & Validation (Tasks 43-47)

**Duration:** 1 week  
**Dependencies:** All previous phases complete  
**Critical Path:** Yes

### Task 6.1: Run migration on staging
**Duration:** 2 hours  
**Owner:** DBA  

**Steps:**
1. Backup staging database
2. Run UP migration
3. Validate with test queries
4. Test rollback migration
5. Restore backup and re-run UP migration

**Acceptance Criteria:**
- [ ] Migration completes without errors
- [ ] All tables/indexes created
- [ ] Triggers fire correctly
- [ ] Rollback migration works
- [ ] Re-running UP migration is idempotent

---

### Task 6.2: Deploy backend to staging
**Duration:** 1 hour  
**Owner:** Backend/DevOps  

**Acceptance Criteria:**
- [ ] Filters router accessible
- [ ] All 6 procedures respond
- [ ] Rate limiting works
- [ ] Query timeouts enforced

---

### Task 6.3: Deploy frontend to staging
**Duration:** 1 hour  
**Owner:** Frontend/DevOps  

**Acceptance Criteria:**
- [ ] Advanced filter builder renders
- [ ] Saved filters load
- [ ] Can create and apply filters
- [ ] No console errors

---

### Task 6.4: End-to-end QA on staging
**Duration:** 4 hours  
**Owner:** QA  

**Test Cases:**
1. Create simple filter (category = Flower)
2. Create complex nested filter (3 levels deep)
3. Save filter as personal
4. Save filter as global (requires manager)
5. Load saved filter
6. Edit saved filter
7. Delete saved filter
8. Test all 13 operators
9. Test pagination
10. Test rate limiting (trigger with >20 requests)
11. Verify customer aliases shown (not real names)
12. Test circuit breaker (load 10k+ products)

**Acceptance Criteria:**
- [ ] All test cases pass
- [ ] No data leaks (customer privacy)
- [ ] Performance within targets
- [ ] UI/UX smooth

---

### Task 6.5: Production deployment
**Duration:** 3 hours  
**Owner:** DevOps/DBA  

**Steps:**
1. Schedule maintenance window
2. Backup production database
3. Run migration with monitoring
4. Deploy backend
5. Deploy frontend
6. Validate smoke tests
7. Monitor for errors

**Acceptance Criteria:**
- [ ] Zero downtime (migrations run quickly)
- [ ] All services healthy
- [ ] No error spikes
- [ ] Rollback plan ready

---

### Task 6.6: Post-deployment monitoring
**Duration:** 1 week (passive)  
**Owner:** DevOps/Backend  

**Metrics to track:**
- Filter query latency (p50, p95, p99)
- Rate limit triggers
- Query timeouts
- Error rates
- Saved filter creation rate
- Advanced filter usage rate

**Acceptance Criteria:**
- [ ] Latency < 500ms p95
- [ ] Error rate < 0.1%
- [ ] No customer privacy leaks
- [ ] User adoption tracking

---

### Task 6.7: Documentation and training
**Duration:** 2 hours  
**Owner:** Product/Support  

**Deliverables:**
- User guide for advanced filters
- Video tutorial
- Support team training session
- Operator training materials

**Acceptance Criteria:**
- [ ] Documentation published
- [ ] Support team trained
- [ ] Operators can use feature

---

## Roadmap Summary

**Total Tasks:** 47 atomic units  
**Total Estimated Duration:** 4-6 weeks  
**Critical Path:** 5 weeks  

**Phase Breakdown:**
- Phase 1 (DB): 10 tasks, 2 days
- Phase 2 (Types): 5 tasks, 1 day
- Phase 3 (Backend): 10 tasks, 3 days
- Phase 4 (Frontend): 10 tasks, 5 days
- Phase 5 (Testing): 7 tasks, 2 days (parallel)
- Phase 6 (Rollout): 5 tasks, 1 week

**Success Criteria:**
- All 47 tasks completed
- All tests passing
- Production deployment successful
- Zero critical bugs
- User adoption > 20% in first month

---

## Next Steps

1. Review and approve this roadmap
2. Assign owners to each task
3. Create tracking board (Linear/Jira)
4. Begin Phase 1 (Database Foundation)
5. Daily standups during implementation
6. Weekly progress reviews

---

**Document Status:** ✅ Ready for Implementation  
**Last Updated:** 2026-05-17  
**Version:** 1.0
