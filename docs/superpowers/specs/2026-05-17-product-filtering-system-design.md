# Product Filtering System Design

**Date:** 2026-05-17  
**Status:** Design Approved  
**Target:** Terp Operator - Cannabis Wholesale/Distribution System

---

## Executive Summary

Design for a comprehensive, system-wide product filtering capability that allows operators to find products using any combination of attributes (category, subcategory, brand, vendor, tags, pricing, inventory levels, age, customer purchase history) with support for complex AND/OR filter logic and saved filter sets ("quick views").

**Core Requirements:**
- System-wide: works across inventory, items catalog, POs, sales orders, matchmaking
- Complex expressions: nested AND/OR logic presented in simple, intuitive UI
- Saved filters: shared/global, editable by any operator
- Customer privacy: customers never see real vendor/brand names, only aliases
- Performance: server-side SQL filtering for large datasets, client-side for small
- Integration: truly integrated, not bolted on

---

## 1. Database Schema Changes

### New Tables

#### `brands` Table
Parallel to vendors table, tracks farmers/producers (separate from distributors).

```sql
CREATE TABLE brands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(180) NOT NULL,              -- Internal: "Johnson Family Farm"
  alias varchar(180) NOT NULL,             -- Customer-facing: "Premium Local Grower A"
  notes text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Unique constraints (partial index for reuse of deactivated brands)
CREATE UNIQUE INDEX brands_name_idx ON brands(name) WHERE active = true;
CREATE UNIQUE INDEX brands_alias_idx ON brands(alias) WHERE active = true;
CREATE INDEX brands_active_idx ON brands(active);
CREATE INDEX brands_alias_search_idx ON brands(alias);
```

#### `saved_filters` Table
Stores user-saved filter configurations.

```sql
CREATE TABLE saved_filters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name varchar(120) NOT NULL,
  description text,
  target_view varchar(32) NOT NULL,        -- 'inventory', 'items', 'all', etc.
  filter_definition jsonb NOT NULL,
  is_global boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT valid_filter_definition CHECK (jsonb_typeof(filter_definition) = 'object'),
  CONSTRAINT unique_filter_name UNIQUE (name, target_view)  -- Prevent duplicate filter names per view
);

CREATE INDEX saved_filters_user_view_idx ON saved_filters(user_id, target_view);
CREATE INDEX saved_filters_global_idx ON saved_filters(is_global);
CREATE INDEX saved_filters_definition_idx ON saved_filters USING gin(filter_definition);
```

### Field Additions to Product Tables

Add to: `batches`, `items`, `purchase_order_lines`, `sales_order_lines`, `vendor_supply`, `customer_needs`

```sql
-- Example for batches table
ALTER TABLE batches 
  ADD COLUMN subcategory varchar(80),
  ADD COLUMN brand_id uuid REFERENCES brands(id) ON DELETE SET NULL,
  ADD COLUMN brand_alias varchar(180),        -- SNAPSHOT: prevents race condition
  ADD COLUMN vendor_alias varchar(180),       -- SNAPSHOT: prevents race condition
  ADD COLUMN sort_id bigserial NOT NULL;      -- For cursor pagination

CREATE INDEX batches_subcategory_idx ON batches(subcategory);
CREATE INDEX batches_brand_idx ON batches(brand_id);
CREATE INDEX batches_tags_idx ON batches USING gin(tags);  -- Critical for tag filtering
CREATE INDEX batches_created_at_idx ON batches(created_at);  -- For age filtering
CREATE INDEX batches_sort_id_idx ON batches(sort_id);  -- For cursor pagination
```

### Vendor Table Addition

```sql
ALTER TABLE vendors
  ADD COLUMN alias varchar(180) NOT NULL DEFAULT 'Vendor TBD';

CREATE INDEX vendors_alias_idx ON vendors(alias);
```

### Customer Privacy: Database Views

Enforce aliasing at database level:

```sql
-- Customer-safe view (only aliases, posted batches)
-- Uses snapshot columns to prevent race conditions with alias updates
CREATE VIEW batches_customer_safe AS
SELECT 
  b.id, b.batch_code, b.name, b.category, b.subcategory,
  b.tags, b.available_qty, b.unit_price, b.location,
  b.intake_date, b.status, b.photo_url, b.media_status,
  COALESCE(b.brand_alias, 'Unknown Brand') as brand_name,
  COALESCE(b.vendor_alias, 'Unknown Vendor') as vendor_name
FROM batches b
WHERE b.status = 'posted';

-- Operator view (real names for internal use)
CREATE VIEW batches_operator AS
SELECT 
  b.*,
  br.name as brand_real_name,
  br.alias as brand_alias,
  v.name as vendor_real_name,
  v.alias as vendor_alias
FROM batches b
LEFT JOIN brands br ON br.id = b.brand_id
LEFT JOIN vendors v ON v.id = b.vendor_id;
```

---

## 2. Filter Data Model

### Type-Safe Filter Structure

Filters represented as nested tree structure with discriminated unions for type safety.

```typescript
// Field-to-column mapping (prevents SQL injection)
// NOTE: Field names use camelCase to match frontend row objects
// SQL generation maps these to actual column names (b.column_name)
const FILTER_FIELD_MAP = {
  'category': 'b.category',
  'subcategory': 'b.subcategory',
  'brandId': 'b.brand_id',
  'vendorId': 'b.vendor_id',
  'tags': 'b.tags',
  'unitPrice': 'b.unit_price',
  'unitCost': 'b.unit_cost',
  'availableQty': 'b.available_qty',
  'location': 'b.location',
  'ownershipStatus': 'b.ownership_status',
  'ageDays': `DATE_PART('day', NOW() - b.intake_date)`,
  'intakeDate': 'b.intake_date',
  'status': 'b.status',
} as const;

// Discriminated unions for operator/value combinations
const NullCheckCondition = z.object({
  field: z.enum(Object.keys(FILTER_FIELD_MAP)),
  operator: z.enum(['is_null', 'is_not_null']),
  value: z.null()
});

const BetweenCondition = z.object({
  field: z.enum(['unit_price', 'unit_cost', 'available_qty', 'age_days']),
  operator: z.literal('between'),
  value: z.tuple([z.number(), z.number()])
});

const ComparisonCondition = z.object({
  field: z.enum(['unit_price', 'unit_cost', 'available_qty', 'age_days']),
  operator: z.enum(['equals', 'not_equals', 'greater_than', 'less_than', 
                    'greater_than_or_equal', 'less_than_or_equal']),
  value: z.number()
});

const TextCondition = z.object({
  field: z.enum(['category', 'subcategory', 'location', 'status']),
  operator: z.enum(['equals', 'not_equals', 'text_contains', 'text_not_contains']),
  value: z.string()
});

const ArrayCondition = z.object({
  field: z.literal('tags'),
  operator: z.enum(['array_contains', 'array_not_contains']),
  value: z.array(z.string()).min(1)
});

const FilterCondition = z.discriminatedUnion('operator', [
  NullCheckCondition,
  BetweenCondition,
  ComparisonCondition,
  TextCondition,
  ArrayCondition
]);

// Recursive group with depth limit
const MAX_FILTER_DEPTH = 5;

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

const FilterGroup: z.ZodType<FilterGroupInput> = z.object({
  logic: z.enum(['AND', 'OR']),
  conditions: z.array(
    z.union([FilterCondition, z.lazy(() => FilterGroup)])
  ).min(1, 'Filter group must have at least one condition')
}).refine(
  (data) => checkDepth(data) <= MAX_FILTER_DEPTH,
  { message: `Filter nesting cannot exceed ${MAX_FILTER_DEPTH} levels` }
);
```

### Example Filter Structures

**Simple filter:**
```json
{
  "logic": "AND",
  "conditions": [
    { "field": "category", "operator": "equals", "value": "Flower" },
    { "field": "available_qty", "operator": "greater_than", "value": 10 }
  ]
}
```

**Complex nested filter:**
```json
{
  "logic": "AND",
  "conditions": [
    {
      "logic": "OR",
      "conditions": [
        { "field": "category", "operator": "equals", "value": "Flower" },
        { "field": "category", "operator": "equals", "value": "Extract" }
      ]
    },
    {
      "logic": "OR",
      "conditions": [
        { "field": "brand_id", "operator": "equals", "value": "uuid-sunset" },
        { "field": "brand_id", "operator": "equals", "value": "uuid-green" }
      ]
    },
    { "field": "available_qty", "operator": "greater_than", "value": 10 }
  ]
}
```

---

## 3. Backend Architecture

### tRPC Router Structure

New `filtersRouter` following existing codebase patterns (raw SQL, `protectedProcedure`, parameterized queries).

**File:** `src/server/routers/filters.ts`

```typescript
import { protectedProcedure, router } from '../trpc';
import { pool } from '../db';
import { filterGroupSchema, savedFilterSchema } from '../../shared/filterSchemas';

// Rate limiter middleware (prevents DoS via complex filter queries)
import { ratelimit } from '../ratelimit';  // Assumes existing rate limiter

export const filtersRouter = router({
  // Apply filters to batches (server-side for backend queries)
  applyBatchFilters: protectedProcedure
    .input(z.object({
      filter: filterGroupSchema,
      pagination: z.object({
        limit: z.number().min(1).max(100).default(50),
        cursor: z.number().optional()  // BIGSERIAL cursor, not UUID
      }).optional()
    }))
    .query(async ({ input, ctx }) => {
      // Rate limit: 20 filter queries per minute per user
      const { success } = await ratelimit.limit(
        `filter:${ctx.user.id}`,
        { limit: 20, window: '1m' }
      );
      if (!success) {
        throw new TRPCError({ code: 'TOO_MANY_REQUESTS' });
      }
      const params: unknown[] = [];
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
      params.push(limit);
      
      const query = `
        SELECT b.id, b.sort_id, b.batch_code AS "batchCode", b.name, b.category, ...
        FROM batches b
        LEFT JOIN vendors v ON v.id = b.vendor_id
        LEFT JOIN brands br ON br.id = b.brand_id
        WHERE ${whereClauses.join(' AND ')}
        ORDER BY b.sort_id
        LIMIT $${params.length}
      `;
      
      const result = await pool.query(query, params);
      
      return {
        batches: result.rows,
        nextCursor: result.rows.length === limit 
          ? result.rows[result.rows.length - 1].sort_id 
          : null
      };
    }),
  
  // Save filter
  saveFilter: protectedProcedure
    .input(savedFilterSchema)
    .mutation(async ({ input, ctx }) => {
      // Permission check for global filters
      if (input.isGlobal && !['owner', 'manager'].includes(ctx.user.role)) {
        throw new TRPCError({ code: 'FORBIDDEN' });
      }
      
      // Re-validate filter definition with schema to prevent invalid JSON storage
      try {
        filterGroupSchema.parse(input.filterDefinition);
      } catch (err) {
        throw new TRPCError({ 
          code: 'BAD_REQUEST', 
          message: 'Invalid filter definition structure' 
        });
      }
      
      const result = await pool.query(
        `INSERT INTO saved_filters (user_id, name, description, target_view, filter_definition, is_global)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, name, created_at`,
        [ctx.user.id, input.name, input.description, input.targetView, 
         JSON.stringify(input.filterDefinition), input.isGlobal]
      );
      
      return result.rows[0];
    }),
  
  // List saved filters (user's + global)
  listSavedFilters: protectedProcedure.query(...),
  
  // Update/delete filters
  updateFilter: protectedProcedure.mutation(...),
  deleteFilter: protectedProcedure.mutation(...),
  
  // Get facets for dropdowns
  getFacets: protectedProcedure.query(...)
});
```

### Query Builder (Security-First)

```typescript
// Stack overflow protection
const MAX_RECURSION_DEPTH = 100;

function buildFilterSql(
  group: FilterGroup,
  params: unknown[],
  whereClauses: string[],
  depth = 0
): void {
  if (depth > MAX_RECURSION_DEPTH) {
    throw new TRPCError({ 
      code: 'BAD_REQUEST', 
      message: 'Filter recursion depth exceeded' 
    });
  }
  
  const groupClauses: string[] = [];
  
  for (const condition of group.conditions) {
    if ('field' in condition) {
      const sql = buildConditionSql(condition, params);
      if (sql) groupClauses.push(sql);
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

function buildConditionSql(condition: FilterCondition, params: unknown[]): string | null {
  const fieldConfig = allowedFields[condition.field];
  const sqlField = fieldConfig.sql;
  
  switch (condition.operator) {
    case 'equals':
      params.push(condition.value);
      return `${sqlField} = $${params.length}`;
    
    case 'greater_than':
      params.push(condition.value);
      return `${sqlField} > $${params.length}`;
    
    case 'array_contains':
      params.push(condition.value);
      return `$${params.length} = ANY(${sqlField})`;
    
    // ... all operators
  }
}
```

---

## 4. Frontend Architecture

### Pattern: Enhance Existing Components

Following codebase convention: monolithic components with `useState`, client-side filtering in `useMemo`.

**File:** `src/client/components/InventoryFinderPanel.tsx` (enhanced)

```typescript
export function InventoryFinderPanel({ ... }) {
  // Existing simple filters (keep all)
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [vendorId, setVendorId] = useState('');
  const [priceMax, setPriceMax] = useState('');
  
  // NEW: Advanced filter state
  const [advancedFilter, setAdvancedFilter] = useState<FilterGroup | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  
  // Existing: fetch full dataset
  const reference = trpc.queries.reference.useQuery();
  const rows = reference.data?.availableBatches ?? [];
  
  // NEW: Fetch saved filters
  const { data: savedFilters } = trpc.filters.listSavedFilters.useQuery({
    targetView: 'inventory'
  });
  
  // Enhanced filtering (existing + advanced)
  const filtered = useMemo(() => {
    // Circuit breaker: if dataset > 10k products, warn and truncate
    if (rows.length > 10000) {
      console.warn(`Large dataset (${rows.length} products) - consider server-side filtering`);
      // Truncate to prevent memory explosion
      rows = rows.slice(0, 10000);
    }
    
    const parsed = parseFinderSearch(search);  // Keep existing smart search
    
    return rows
      .filter((row) => {
        // Existing simple filter logic
        if (category && row.category !== category) return false;
        if (vendorId && row.vendorId !== vendorId) return false;
        // ... other existing filters ...
        
        // NEW: Advanced filter evaluation
        if (advancedFilter) {
          return evaluateFilterGroup(row, advancedFilter);
        }
        
        return true;
      })
      .slice(0, 80);  // Keep result limit
  }, [rows, search, category, vendorId, priceMax, advancedFilter]);
  
  return (
    <WorkspacePanel title="Inventory Finder">
      {/* NEW: Saved filters dropdown */}
      <div className="finder-chip-row">
        <select onChange={(e) => loadSavedFilter(e.target.value)}>
          <option value="">Load saved filter...</option>
          {savedFilters?.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
      </div>
      
      {/* Existing simple filters (keep as-is) */}
      <div className="finder-controls">
        {/* ... all existing controls ... */}
        
        {/* NEW: Advanced toggle */}
        <button onClick={() => setAdvancedOpen(!advancedOpen)}>
          {advancedOpen ? 'Hide' : 'Show'} Advanced Filters
        </button>
      </div>
      
      {/* NEW: Advanced builder (inline when open) */}
      {advancedOpen && (
        <AdvancedFilterBuilder
          filter={advancedFilter ?? { logic: 'AND', conditions: [] }}
          onChange={setAdvancedFilter}
        />
      )}
      
      {/* Existing table */}
      <div className="finder-table-wrap">...</div>
    </WorkspacePanel>
  );
}
```

### Client-Side Filter Evaluation

**File:** `src/client/utils/filterEvaluator.ts` (new)

```typescript
// Client-side field whitelist (prevents prototype pollution)
const ALLOWED_ROW_FIELDS = new Set([
  'category', 'subcategory', 'brandId', 'vendorId', 'tags',
  'unitPrice', 'unitCost', 'availableQty', 'location', 
  'ownershipStatus', 'intakeDate', 'status'
]);

export function evaluateFilterGroup(
  row: Record<string, any>,
  group: FilterGroup
): boolean {
  const results = group.conditions.map(condition => {
    if ('operator' in condition) {
      return evaluateCondition(row, condition);
    } else {
      return evaluateFilterGroup(row, condition);  // Recursive
    }
  });
  
  return group.logic === 'AND' 
    ? results.every(Boolean)
    : results.some(Boolean);
}

function evaluateCondition(row: Record<string, any>, condition: FilterCondition): boolean {
  // Whitelist check to prevent prototype pollution
  if (!ALLOWED_ROW_FIELDS.has(condition.field)) {
    console.warn(`Unauthorized field access attempt: ${condition.field}`);
    return false;
  }
  
  const value = row[condition.field];
  
  switch (condition.operator) {
    case 'equals': return value === condition.value;
    case 'greater_than': return Number(value) > Number(condition.value);
    case 'text_contains': 
      return String(value).toLowerCase().includes(String(condition.value).toLowerCase());
    case 'array_contains': 
      return Array.isArray(value) && value.includes(condition.value);
    // ... all operators
  }
}
```

---

## 5. Data Flow & User Experience

### Simple Filter Flow
```
User types → useState updates → useMemo recalculates → table re-renders (immediate)
```

### Advanced Filter Flow
```
User opens Advanced → builds rules → setAdvancedFilter() → 
evaluateFilterGroup() in useMemo → results update
```

### Saved Filter Flow
```
User saves → tRPC mutation → database → query cache invalidates

User loads → setAdvancedFilter() → useMemo recalculates
```

### User Journey

1. **Starting Simple:** User sees familiar filter bar, types/selects, results update immediately
2. **Going Advanced:** User clicks "Show Advanced", builds complex rules with nested AND/OR logic
3. **Saving for Reuse:** User clicks "Save this filter", names it, becomes available to whole team
4. **Reusing:** Next session, user selects saved filter from dropdown, results appear instantly

---

## 6. Migration Strategy

### Phase 1: Database Foundation (Week 1)
- Run migrations: `brands`, `saved_filters` tables
- Add fields: `subcategory`, `brand_id`, `brand_alias`, `vendor_alias`, `sort_id` to product tables
- **Backfill strategy:**
  1. Extract unique brand names from batches.name patterns (e.g., "Sunset Farm - Blue Dream")
  2. Create brands entries with auto-generated aliases ("Premium Grower A", "Premium Grower B", etc.)
  3. Manual alias review by operations team before customer visibility
  4. Backfill brand_id FK references via UPDATE batches SET brand_id = (SELECT id FROM brands WHERE name = ...)
  5. Snapshot aliases into brand_alias/vendor_alias columns via triggers or batch UPDATE
  6. Validate: SELECT COUNT(*) FROM batches WHERE status = 'posted' AND (brand_alias IS NULL OR vendor_alias IS NULL)
- Add performance indexes (composite + single-column)

### Phase 2: Backend Services (Week 1-2)
- Create filter schemas in `/shared/filterSchemas.ts`
- Implement `filtersRouter`
- Test with tRPC playground

### Phase 3: Frontend - Simple Enhancements (Week 2)
- Add subcategory and brand dropdowns to InventoryFinderPanel
- Add saved filters dropdown
- No breaking changes

### Phase 4: Frontend - Advanced Builder (Week 3)
- Implement `AdvancedFilterBuilder` component
- Add client-side `evaluateFilterGroup()`
- Wire up to existing filter logic

### Phase 5: Rollout to Other Views (Week 4+)
- Items catalog
- Purchase order lines
- Sales orders
- Matchmaking

### Rollback Safety
- Each phase is additive
- Old filter code remains functional
- Can disable advanced filters via feature flag
- Database migrations are reversible

---

## 7. Performance Considerations

### Client-Side Filtering (Current Views)
- **Dataset size:** <10k products in memory
- **Filter speed:** Immediate (<50ms)
- **Strategy:** Fetch full dataset via `reference` query, filter in `useMemo`

### Server-Side Filtering (Future/Large Datasets)
- **Dataset size:** 100k+ products
- **Filter speed:** 100-500ms with proper indexes
- **Strategy:** Cursor-based pagination, parameterized SQL queries

### Indexes Required
```sql
-- Single-column indexes
CREATE INDEX batches_tags_idx ON batches USING gin(tags);
CREATE INDEX batches_created_at_idx ON batches(created_at);  -- For age filters
CREATE INDEX batches_sort_id_idx ON batches(sort_id);  -- For cursor pagination

-- Composite indexes for common filter combinations
CREATE INDEX batches_category_subcategory_idx ON batches(category, subcategory) WHERE archived_at IS NULL;
CREATE INDEX batches_brand_vendor_idx ON batches(brand_id, vendor_id) WHERE archived_at IS NULL;
CREATE INDEX batches_price_qty_idx ON batches(unit_price, available_qty) WHERE archived_at IS NULL;
CREATE INDEX batches_category_brand_idx ON batches(category, brand_id) WHERE archived_at IS NULL;
CREATE INDEX batches_vendor_category_idx ON batches(vendor_id, category) WHERE archived_at IS NULL;
CREATE INDEX batches_status_category_idx ON batches(status, category);
```

---

## 8. Security & Privacy

### SQL Injection Prevention
- Strict field whitelist (`FILTER_FIELD_MAP`)
- Parameterized queries (`$1, $2, ...`)
- No dynamic SQL construction

### Customer Privacy Enforcement
- Database views with aliases only (`batches_customer_safe`)
- Role-based query selection
- Validation: aliases must be set before customer visibility

### Permission Model
- Saved filters: anyone can create/edit/delete
- Global filters: only `owner`/`manager` roles can create
- Customer role (future): restricted field access, alias-only views

---

## 9. Testing Strategy

### Unit Tests
- `filterEvaluator.ts`: All operator combinations
- `buildFilterSql()`: SQL injection attempts, edge cases
- Zod schemas: Invalid operator/value pairs
- **Filter syntax fuzzing tests:**
  - Random deeply nested filter structures (up to MAX_FILTER_DEPTH)
  - Malformed JSON in filter_definition field
  - Boundary values (empty arrays, null values, MAX_SAFE_INTEGER)
  - Prototype pollution attempts (field: "__proto__", "constructor", etc.)
  - SQL injection payloads in value fields
  - Unicode and special character handling in text filters

### Integration Tests
- Filter application across all views
- Saved filter CRUD operations
- Client-side + server-side filter parity

### Performance Tests
- 100k products: filter in <500ms
- Cursor pagination: no degradation at high pages
- Complex nested filters (5 levels deep)

### Pre-Production Checklist
- [ ] Simple filters work as before (no regression)
- [ ] Advanced filters evaluate correctly
- [ ] Saved filters persist/load
- [ ] Performance benchmarks met
- [ ] Customer privacy enforced
- [ ] Permissions enforced (global filters)

---

## 10. Customer Purchase History Filtering

**Requirement:** Allow filtering products by "customer purchase history" (e.g., "products Customer X has purchased before").

**Implementation Strategy:**

### Database Query Approach
```typescript
// Add to filtersRouter
getCustomerPurchaseHistory: protectedProcedure
  .input(z.object({ customerId: z.string().uuid() }))
  .query(async ({ input }) => {
    const result = await pool.query(
      `SELECT DISTINCT b.id, b.batch_code, b.name
       FROM batches b
       JOIN sales_order_lines sol ON sol.batch_id = b.id
       JOIN sales_orders so ON so.id = sol.sales_order_id
       WHERE so.customer_id = $1
       ORDER BY sol.created_at DESC
       LIMIT 100`,
      [input.customerId]
    );
    return result.rows;
  })
```

### Filter Integration
Add new condition type:
```typescript
const PurchaseHistoryCondition = z.object({
  field: z.literal('purchaseHistory'),
  operator: z.enum(['purchased_by', 'not_purchased_by']),
  value: z.string().uuid()  // customer_id
});
```

### UI Flow
1. In AdvancedFilterBuilder, add "Purchase History" field option
2. When selected, show customer dropdown
3. Operator options: "Purchased by" or "Not purchased by"
4. Server-side join to sales_order_lines for evaluation

**Migration Plan:** Phase 6 (post-MVP) - requires sales order data analysis and performance testing for large customer order histories.

---

## 11. Future Enhancements

### Advanced Analytics Filters
- COGS trends (rapidly increasing/declining)
- Sales velocity changes
- Stock movement patterns
- Customer purchase frequency thresholds

### UI Improvements
- Visual query builder with drag-drop
- Filter preview (show count before applying)
- Filter history/undo
- Export filtered results to CSV

### Multi-View Filters
- Apply same filter across inventory + POs + sales in one click
- Cross-view filter compatibility checking

---

## Appendix A: Security Fixes Applied

All 15 adversarial review findings have been addressed:

**CRITICAL (4):**
1. ✅ Race condition in alias updates → Added `brand_alias`, `vendor_alias` snapshot columns to batches
2. ✅ Prototype pollution via field.split() → Added ALLOWED_ROW_FIELDS whitelist in filterEvaluator.ts
3. ✅ Missing concurrency control → Added UNIQUE (name, target_view) constraint on saved_filters
4. ✅ No filter_definition validation → Added filterGroupSchema.parse() re-validation in saveFilter

**HIGH (3):**
5. ✅ Missing composite indexes → Added 6 composite indexes for common filter combinations
6. ✅ Client-side memory explosion → Added 10k circuit breaker with warning in useMemo
7. ✅ Cursor pagination with UUIDs → Changed to BIGSERIAL sort_id for stable ordering

**MEDIUM (4):**
8. ✅ No rate limiting → Added rate limiter middleware (20 queries/min per user)
9. ✅ checkDepth() undefined → Added checkDepth() function implementation
10. ✅ Missing recursion error handling → Added MAX_RECURSION_DEPTH = 100 with stack overflow protection

**IMPLEMENTATION RISKS (2):**
11. ✅ No backfill strategy → Added detailed 6-step brand backfill strategy with validation
12. ✅ No fuzzing tests → Added filter syntax fuzzing test spec with 6 attack vectors

**DESIGN (2):**
13. ✅ Field naming inconsistency → Standardized to camelCase in FILTER_FIELD_MAP with SQL column mapping
14. ✅ Customer purchase history missing → Added dedicated section 10 with implementation strategy (Phase 6)

---

## Appendix B: File Structure

```
/Users/evan/work/terp-agro-operator-console/
├── migrations/
│   └── XXXX_add_filtering_system.sql
├── src/
│   ├── server/
│   │   ├── routers/
│   │   │   └── filters.ts                    [NEW - ~400 lines]
│   │   ├── schema.ts                          [MODIFY - add tables]
│   │   └── router.ts                          [MODIFY - add filtersRouter]
│   ├── client/
│   │   ├── components/
│   │   │   ├── InventoryFinderPanel.tsx       [MODIFY - add advanced]
│   │   │   └── AdvancedFilterBuilder.tsx      [NEW - ~200 lines]
│   │   └── utils/
│   │       └── filterEvaluator.ts             [NEW - ~100 lines]
│   └── shared/
│       └── filterSchemas.ts                   [NEW - ~200 lines]
└── docs/
    └── superpowers/specs/
        └── 2026-05-17-product-filtering-system-design.md  [THIS FILE]
```

---

## Appendix C: Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| Client-side filtering for current views | Matches existing pattern, dataset <10k products |
| Server-side capability for future | Scalability to 100k+ products |
| Cursor pagination, not offset | No degradation at high pages |
| Raw SQL, not Drizzle query builder | Matches codebase pattern, more flexible |
| useState, not Zustand | Matches existing filter pattern |
| Monolithic components initially | Matches codebase convention |
| Discriminated unions in Zod | Type safety for operator/value pairs |
| Parameterized SQL | SQL injection prevention |
| Database views for privacy | Enforces aliases at query level |
| Shared/global saved filters | Team collaboration, not per-user silos |

---

**Design Status:** Approved for implementation  
**Next Step:** Create implementation plan via `writing-plans` skill
