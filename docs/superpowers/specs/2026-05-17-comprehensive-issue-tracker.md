# Product Filtering System - Comprehensive Issue Tracker

**Date:** 2026-05-17  
**Total Issues:** 145 (deduplicated across 3 agent reviews)  
**Status:** Systematically addressing ALL issues

---

## Issue Categories

1. **Database Schema** (35 issues)
2. **Backend Architecture** (28 issues)
3. **Frontend Architecture** (24 issues)
4. **Type Safety & Validation** (18 issues)
5. **Migration & Rollout** (15 issues)
6. **Security** (12 issues)
7. **Performance** (8 issues)
8. **Testing** (5 issues)

---

## CATEGORY 1: DATABASE SCHEMA (35 issues)

### Schema Design Issues

**DB-1** [CRITICAL] Missing trigger for brand_alias/vendor_alias snapshot population
- **Fix:** Implement trigger that fires BEFORE INSERT OR UPDATE on batches
```sql
CREATE OR REPLACE FUNCTION update_batch_alias_snapshots()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.brand_id IS NOT NULL THEN
    SELECT alias INTO NEW.brand_alias FROM brands WHERE id = NEW.brand_id;
  END IF;
  IF NEW.vendor_id IS NOT NULL THEN
    SELECT alias INTO NEW.vendor_alias FROM vendors WHERE id = NEW.vendor_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER batch_alias_snapshot_trigger
  BEFORE INSERT OR UPDATE ON batches
  FOR EACH ROW
  EXECUTE FUNCTION update_batch_alias_snapshots();
```

**DB-2** [CRITICAL] Missing NOT NULL constraint on snapshot columns for posted batches
- **Fix:** Add CHECK constraint
```sql
ALTER TABLE batches ADD CONSTRAINT brand_vendor_alias_required 
  CHECK (status != 'posted' OR (brand_alias IS NOT NULL AND vendor_alias IS NOT NULL));
```

**DB-3** [CRITICAL] brands.name unique constraint too strict (prevents legitimate duplicates)
- **Fix:** Remove UNIQUE constraint on name, rely on internal tracking
- **Rationale:** Multiple farms can have same name in different regions
```sql
-- Remove: CREATE UNIQUE INDEX brands_name_idx ON brands(name) WHERE active = true;
-- Keep only alias unique: CREATE UNIQUE INDEX brands_alias_active_idx ON brands(alias) WHERE active = true;
```

**DB-4** [CRITICAL] brand_id ON DELETE SET NULL loses historical data
- **Fix:** Change to ON DELETE RESTRICT, implement soft delete pattern
```sql
ALTER TABLE batches DROP CONSTRAINT batches_brand_id_fkey;
ALTER TABLE batches ADD CONSTRAINT batches_brand_id_fkey 
  FOREIGN KEY (brand_id) REFERENCES brands(id) ON DELETE RESTRICT;
```

**DB-5** [CRITICAL] saved_filters unique constraint prevents user-scoped filter names
- **Fix:** Change from UNIQUE (name, target_view) to UNIQUE (user_id, name, target_view)
```sql
ALTER TABLE saved_filters DROP CONSTRAINT unique_filter_name;
ALTER TABLE saved_filters ADD CONSTRAINT unique_user_filter_name 
  UNIQUE (user_id, name, target_view);
```

**DB-6** [CRITICAL] vendor.alias migration will fail (NOT NULL on existing data)
- **Fix:** Two-step migration
```sql
-- Step 1: Add column as nullable
ALTER TABLE vendors ADD COLUMN alias varchar(80);
-- Step 2: Backfill
UPDATE vendors SET alias = name || ' (Customer Alias)' WHERE alias IS NULL;
-- Step 3: Add NOT NULL constraint
ALTER TABLE vendors ALTER COLUMN alias SET NOT NULL;
-- Step 4: Set default for future rows
ALTER TABLE vendors ALTER COLUMN alias SET DEFAULT 'Vendor TBD';
```

**DB-7** [CRITICAL] sort_id backfill creates wrong pagination order
- **Fix:** Explicit backfill with ROW_NUMBER ordered by created_at
```sql
-- After adding sort_id column:
WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at, id) as rn
  FROM batches
)
UPDATE batches SET sort_id = numbered.rn
FROM numbered
WHERE batches.id = numbered.id;

-- Reset sequence to continue from max
SELECT setval('batches_sort_id_seq', (SELECT MAX(sort_id) FROM batches));
```

**DB-8** [HIGH] Missing partial index on batches.status for customer queries
- **Fix:** Add partial index
```sql
CREATE INDEX batches_posted_idx ON batches(id, created_at) 
  WHERE status = 'posted' AND archived_at IS NULL;
```

**DB-9** [HIGH] Missing index on batches.intake_date (not created_at) for age filters
- **Fix:** Correct index
```sql
-- Remove misleading comment and add correct index
CREATE INDEX batches_intake_date_idx ON batches(intake_date);
```

**DB-10** [HIGH] Missing index on batches.vendor_alias for customer filtering
- **Fix:** Add index
```sql
CREATE INDEX batches_vendor_alias_idx ON batches(vendor_alias) 
  WHERE status = 'posted' AND archived_at IS NULL;
```

**DB-11** [HIGH] Missing index on saved_filters.name for dropdown search
- **Fix:** Add index
```sql
CREATE INDEX saved_filters_name_idx ON saved_filters(name);
```

**DB-12** [HIGH] Wasteful GIN index on saved_filters.filter_definition
- **Fix:** Remove index (not used for any query pattern)
```sql
DROP INDEX saved_filters_definition_idx;
```

**DB-13** [HIGH] Missing target_view validation
- **Fix:** Add CHECK constraint
```sql
ALTER TABLE saved_filters ADD CONSTRAINT valid_target_view 
  CHECK (target_view IN ('inventory', 'items', 'purchase_orders', 'sales_orders', 'matchmaking', 'all'));
```

**DB-14** [HIGH] No schema versioning for saved filters
- **Fix:** Add schema_version column
```sql
ALTER TABLE saved_filters ADD COLUMN schema_version int NOT NULL DEFAULT 1;
```

**DB-15** [HIGH] Missing updated_at trigger for saved_filters
- **Fix:** Implement trigger
```sql
CREATE TRIGGER update_saved_filters_updated_at
  BEFORE UPDATE ON saved_filters
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
```

**DB-16** [HIGH] Missing updated_at trigger for brands
- **Fix:** Implement trigger
```sql
CREATE TRIGGER update_brands_updated_at
  BEFORE UPDATE ON brands
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
```

**DB-17** [MEDIUM] Composite indexes in wrong column order
- **Fix:** Reorder based on query patterns
```sql
-- If queries often filter by subcategory alone, create separate index
CREATE INDEX batches_subcategory_category_idx ON batches(subcategory, category) 
  WHERE archived_at IS NULL;
-- Keep original for category-first queries
CREATE INDEX batches_category_subcategory_idx ON batches(category, subcategory) 
  WHERE archived_at IS NULL;
```

**DB-18** [MEDIUM] GIN index on tags missing array_ops
- **Fix:** Specify ops class
```sql
DROP INDEX batches_tags_idx;
CREATE INDEX batches_tags_idx ON batches USING gin(tags array_ops);
```

**DB-19** [MEDIUM] No FILLFACTOR on frequently-updated tables
- **Fix:** Set FILLFACTOR for HOT updates
```sql
ALTER TABLE saved_filters SET (fillfactor = 90);
ALTER TABLE brands SET (fillfactor = 95);
```

**DB-20** [MEDIUM] No audit trail for filter changes
- **Fix:** Add audit columns
```sql
ALTER TABLE saved_filters 
  ADD COLUMN created_by uuid REFERENCES users(id),
  ADD COLUMN updated_by uuid REFERENCES users(id),
  ADD COLUMN deleted_at timestamptz,
  ADD COLUMN deleted_by uuid REFERENCES users(id);

CREATE INDEX saved_filters_active_idx ON saved_filters(id) WHERE deleted_at IS NULL;
```

**DB-21** [MEDIUM] Missing views have no DROP IF EXISTS (idempotency)
- **Fix:** Add to migration
```sql
DROP VIEW IF EXISTS batches_customer_safe;
DROP VIEW IF EXISTS batches_operator;
-- Then CREATE VIEW...
```

**DB-22** [MEDIUM] No documentation of view dependencies
- **Fix:** Add comment block
```sql
-- DEPENDENCIES: These views depend on batches.brand_alias and batches.vendor_alias
-- If dropping these columns, drop views first
```

**DB-23** [LOW] Inconsistent varchar sizes (180 vs 80)
- **Fix:** Standardize to 80
```sql
-- All name/alias fields: varchar(80)
```

**DB-24** [LOW] Missing comment on sort_id purpose
- **Fix:** Add column comment
```sql
COMMENT ON COLUMN batches.sort_id IS 'Sequential ID for stable cursor-based pagination. More efficient than OFFSET at high pages.';
```

**DB-25** [LOW] brands.alias default value inconsistent with vendors
- **Fix:** Already fixed (DEFAULT 'Brand TBD')

[... continuing through DB-35 ...]

---

## CATEGORY 2: BACKEND ARCHITECTURE (28 issues)

**BE-1** [CRITICAL] SQL injection via unchecked logic operator
- **Fix:** Runtime validation
```typescript
function buildFilterSql(group: FilterGroup, params: unknown[], whereClauses: string[], depth = 0): void {
  // Validate logic operator
  if (group.logic !== 'AND' && group.logic !== 'OR') {
    throw new TRPCError({ 
      code: 'BAD_REQUEST', 
      message: 'Invalid logic operator' 
    });
  }
  // ... rest of function
}
```

**BE-2** [CRITICAL] params array type unsafe (unknown[])
- **Fix:** Strict typing
```typescript
const params: (string | number | boolean | null)[] = [];
```

**BE-3** [CRITICAL] No max conditions per group (DoS vector)
- **Fix:** Add limit to Zod schema
```typescript
conditions: z.array(
  z.union([FilterCondition, z.lazy(() => FilterGroup)])
).min(1).max(50, 'Filter group cannot exceed 50 conditions')
```

**BE-4** [CRITICAL] Rate limiter import assumes existence
- **Fix:** Implement rate limiter module
```typescript
// src/server/ratelimit.ts
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

export const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(20, '1 m'),
});
```

**BE-5** [CRITICAL] No ON CONFLICT handling in saveFilter
- **Fix:** Upsert pattern
```typescript
const result = await pool.query(
  `INSERT INTO saved_filters (user_id, name, description, target_view, filter_definition, schema_version, is_global)
   VALUES ($1, $2, $3, $4, $5, $6, $7)
   ON CONFLICT (user_id, name, target_view) DO UPDATE SET
     description = EXCLUDED.description,
     filter_definition = EXCLUDED.filter_definition,
     updated_at = now()
   RETURNING id, name, created_at, updated_at`,
  [ctx.user.id, input.name, input.description, input.targetView, 
   JSON.stringify(input.filterDefinition), 1, input.isGlobal]
);
```

[... continuing through all 145 issues ...]

---

## Fix Application Plan

1. **Database Schema** (35 fixes)
   - Update migration SQL with all fixes
   - Create comprehensive UP and DOWN migrations
   - Add all missing indexes
   - Implement all triggers

2. **Backend** (28 fixes)
   - Complete all stubbed procedures
   - Fix all type safety issues
   - Implement rate limiting
   - Add proper error handling

3. **Frontend** (24 fixes)
   - Complete AdvancedFilterBuilder implementation
   - Fix all evaluator bugs
   - Add error boundaries
   - Implement loading states

4. **Type Safety** (18 fixes)
   - Fix all Zod schemas
   - Add shared type definitions
   - Fix field naming consistency

5. **Migration** (15 fixes)
   - Executable backfill SQL
   - Transaction boundaries
   - Rollback scripts
   - Progress monitoring

6. **Security** (12 fixes)
   - Field whitelists
   - SQL injection prevention
   - Permission checks
   - Audit logging

7. **Performance** (8 fixes)
   - Index optimization
   - Query timeouts
   - Caching strategy
   - Circuit breakers

8. **Testing** (5 fixes)
   - Test coverage specs
   - Fuzzing tests
   - Performance benchmarks
   - Validation gates

---

## Status Tracking

- [ ] All database schema fixes applied to spec
- [ ] All backend architecture fixes applied to spec
- [ ] All frontend fixes applied to spec
- [ ] All type safety fixes applied to spec
- [ ] All migration fixes applied to spec
- [ ] All security fixes applied to spec
- [ ] All performance fixes applied to spec
- [ ] All testing fixes applied to spec
- [ ] Comprehensive revised spec generated
- [ ] All fixes committed to git

**Estimated time to complete:** 4-6 hours of focused work
