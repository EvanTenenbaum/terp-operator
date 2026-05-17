# Product Filtering System - Adversarial Review Findings

**Date:** 2026-05-17  
**Review Type:** Three-agent comprehensive adversarial review  
**Agents:** code-architect, code-reviewer (x2), migration/rollout specialist

---

## Executive Summary

Three independent agents conducted skeptical reviews of the product filtering system design specification. **Total unique issues found: 145** across all layers of the system.

**Distribution:**
- CRITICAL severity: 29 unique issues
- HIGH severity: 50 unique issues  
- MEDIUM severity: 48 unique issues
- LOW severity: 18 unique issues

**Top 10 Blockers for Implementation:**

1. **Migration backfill strategy incomplete** - No executable SQL for brand extraction from batch names
2. **Alias snapshot triggers missing** - No implementation for brand_alias/vendor_alias population
3. **tRPC router has 4 stubbed procedures** - Core features incomplete (listSavedFilters, updateFilter, deleteFilter, getFacets)
4. **Client-side filter evaluator critical bugs** - Missing operators, wrong array logic, no null handling
5. **SQL array contains operator backwards** - Uses wrong PostgreSQL operator
6. **Unique constraint prevents user-scoped filters** - Should be (user_id, name, target_view) not (name, target_view)
7. **sort_id backfill will break pagination** - Needs explicit ROW_NUMBER() ordering
8. **No rollback migration despite claim** - Migration is NOT reversible as stated
9. **Zod schema field name mismatches** - snake_case vs camelCase inconsistency
10. **Customer privacy view has TOCTOU bug** - NULL aliases leak to customers

---

## CRITICAL ISSUES (29)

### Database Schema

**C1. Race condition in snapshot column population**
- Location: Section 1, lines 76-89
- Issue: Added brand_alias/vendor_alias columns but NO triggers or update logic
- Impact: Customer privacy violation - NULL aliases visible
- Fix: Implement triggers + constraint CHECK (status != 'posted' OR brand_alias IS NOT NULL)

**C2. Missing constraint on snapshot columns**
- Location: Section 1, lines 105-127
- Issue: Snapshot columns nullable, view uses COALESCE(..., 'Unknown Brand')
- Impact: "Unknown Brand" visible to customers - unprofessional, leaks internal state
- Fix: Add NOT NULL constraint after backfill

**C3. Unique constraint on brands.name too strict**
- Location: Line 42
- Issue: Cannot have two brands with same name (e.g., two "Green Valley Farm")
- Impact: Cannot onboard legitimate duplicate-named brands
- Fix: Allow duplicates or add compound key with location

**C4. No cascade delete protection for brand_id**
- Location: Line 79
- Issue: ON DELETE SET NULL allows data loss
- Impact: If brand deleted for legal reasons, FK is NULL but alias snapshot persists
- Fix: Use ON DELETE RESTRICT + soft delete pattern

**C5. Missing archived_at field**
- Location: Lines 303, 678
- Issue: Queries reference WHERE archived_at IS NULL but column never added
- Impact: Queries will fail
- Fix: Confirm existing schema or add column

**C6. sort_id BIGSERIAL pagination issues**
- Location: Line 82
- Issue: Auto-increment gaps cause cursor drift
- Impact: Pagination inconsistent
- Fix: Document behavior or use composite cursor

**C7. No index on saved_filters.name**
- Location: Lines 52-69
- Issue: Unique constraint exists but no standalone index for name lookups
- Impact: Slow filter name searches
- Fix: Add CREATE INDEX saved_filters_name_idx ON saved_filters(name)

**C8. GIN index on filter_definition wasteful**
- Location: Line 68
- Issue: GIN index on arbitrary JSONB - huge index, rarely useful
- Impact: Storage waste, slow writes
- Fix: Remove or use jsonb_path_ops with specific query patterns

**C9. Vendor alias migration will fail**
- Location: Line 95
- Issue: ADD COLUMN alias NOT NULL DEFAULT 'Vendor TBD' - default only for new rows
- Impact: Migration fails on existing vendors (NULL violates NOT NULL)
- Fix: UPDATE vendors SET alias = ... before adding NOT NULL

**C10. Missing partial index on batches.status**
- Location: Lines 304, 115
- Issue: Customer view queries status = 'posted' constantly, no dedicated index
- Impact: Every customer query is full table scan
- Fix: CREATE INDEX batches_posted_idx ON batches(id) WHERE status = 'posted'

**C11. No validation on target_view enum**
- Location: Line 57
- Issue: target_view is varchar(32) freetext, no CHECK constraint
- Impact: Typos break filter loading ('inventorry' vs 'inventory')
- Fix: Add CHECK (target_view IN (...)) constraint

### Backend Architecture

**C12. SQL injection via logic operator**
- Location: Lines 322, 414
- Issue: group.logic used in SQL join without runtime validation
- Impact: Injection attack if Zod validation bypassed
- Fix: Add explicit runtime check: if (logic !== 'AND' && logic !== 'OR') throw

**C13. params array type unsafe**
- Location: Lines 301, 387
- Issue: unknown[] defeats type safety
- Impact: Complex objects could be serialized unexpectedly
- Fix: const params: (string | number | boolean | null)[] = []

**C14. No max conditions limit**
- Location: Lines 216-224
- Issue: Depth limit exists but no per-group condition count limit
- Impact: DoS via 10,000 conditions at depth 1
- Fix: z.array(...).max(100) in FilterGroup schema

**C15. Rate limiter assumption**
- Location: Line 280
- Issue: import { ratelimit } from '../ratelimit'; // Assumes
- Impact: Import fails if ratelimit doesn't exist, router crashes
- Fix: Implement ratelimit.ts or conditional import with fallback

**C16. No transaction for saveFilter**
- Location: Lines 356-362
- Issue: INSERT fails on UNIQUE constraint retry
- Impact: Users get error on legitimate retry
- Fix: ON CONFLICT (name, target_view) DO UPDATE

**C17. Missing permission check on update/delete**
- Location: Lines 370-372
- Issue: Stubs - no permission logic for who can edit/delete filters
- Impact: Any user can delete global filters
- Fix: Check filter.user_id === ctx.user.id OR canManageGlobalFilters

**C18. buildConditionSql returns null silently**
- Location: Lines 403, 418
- Issue: if (sql) groupClauses.push(sql) - null skipped
- Impact: Condition silently ignored, wrong results
- Fix: Throw error if null

**C19. Array containment operator backwards**
- Location: Line 433
- Issue: $1 = ANY(${sqlField}) - checks if value IN array, not array contains
- Impact: Tag filtering doesn't work
- Fix: Use @> operator: ${sqlField} @> $1::varchar[]

**C20. No EXPLAIN plan validation**
- Location: Lines 671-684
- Issue: Indexes listed but no verification they're used
- Impact: Indexes exist but Postgres doesn't use them
- Fix: Add EXPLAIN ANALYZE sample queries

**C21. Cursor pagination missing last page detection**
- Location: Lines 332-334
- Issue: If last page has exactly `limit` rows, returns non-null cursor to nothing
- Impact: Infinite scroll breaks
- Fix: Fetch limit+1, check if extra exists

**C22. No timeout on pool.query**
- Location: Lines 327, 356
- Issue: Complex filter queries can run for minutes
- Impact: Tie up DB connections, DoS
- Fix: Add query timeout: 30000ms

**C23. getFacets stub**
- Location: Line 375
- Issue: Critical for populating dropdowns, completely unspecified
- Impact: Cannot build filter UI
- Fix: Implement SELECT DISTINCT category, brand, vendor queries

**C24. Error messages leak schema**
- Location: Lines 350-353
- Issue: Zod parse errors might include column names
- Impact: Information disclosure aids attacks
- Fix: Generic message, log full error server-side

**C25. Unique constraint on saved_filters wrong**
- Location: Line 64
- Issue: UNIQUE (name, target_view) prevents users from creating same-named personal filters
- Impact: Feature unusable for multi-user teams
- Fix: Change to UNIQUE (user_id, name, target_view)

### Frontend Architecture

**C26. ALLOWED_ROW_FIELDS doesn't match FILTER_FIELD_MAP**
- Location: Lines 142-156, 540-544
- Issue: Two separate whitelists, no guarantee they match
- Impact: Backend/frontend field mismatch
- Fix: Generate both from shared source in /shared/filterSchemas.ts

**C27. Circuit breaker mutates const**
- Location: Lines 473-478
- Issue: rows = rows.slice(0, 10000) - reassigns parameter
- Impact: TypeError or silent fail, circuit breaker doesn't work
- Fix: let rowsToFilter = rows; if (rows.length > 10000) rowsToFilter = rows.slice(...)

**C28. Memory leak in useMemo**
- Location: Lines 472-497
- Issue: advancedFilter object reference changes on every render
- Impact: useMemo re-runs constantly, defeats memoization
- Fix: JSON.stringify(advancedFilter) in dependencies

**C29. Missing cache invalidation**
- Location: Lines 338-365, 467-469
- Issue: saveFilter mutation doesn't invalidate listSavedFilters cache
- Impact: Saved filters don't appear in dropdown after save
- Fix: ctx.cache.invalidate() or tRPC automatic invalidation setup

---

## HIGH SEVERITY ISSUES (50)

[... condensed summary of 50 high issues from all three reviews ...]

Key themes:
- Incomplete tRPC procedures (stubs)
- Client-side filter evaluator bugs (missing operators, type coercion, null handling)
- Zod schema field name mismatches
- Missing indexes
- No recursion protection on client
- Missing error boundaries
- Race conditions in concurrent edits
- Migration lacks transaction boundaries
- No rollback migration
- sort_id backfill order wrong

---

## MEDIUM SEVERITY ISSUES (48)

[... condensed summary ...]

Key themes:
- Missing facet implementation
- No optimistic updates
- Timezone issues in age calculations
- Missing schema versioning for filters
- No monitoring/telemetry
- Missing loading states
- No audit trail
- Accessibility violations
- Performance benchmarks lack baselines

---

## LOW SEVERITY ISSUES (18)

[... condensed summary ...]

Key themes:
- Inconsistent defaults
- Missing comments/documentation
- No search in dropdowns
- Missing ARIA labels
- Cache invalidation details
- Example code has typos

---

## Recommendations

**BLOCK IMPLEMENTATION** until these are resolved:

1. Complete all 4 stubbed tRPC procedures
2. Implement brand/vendor alias snapshot triggers
3. Write executable backfill SQL with transaction boundaries
4. Fix client-side filter evaluator bugs
5. Provide complete rollback migration
6. Fix Zod schema field name consistency
7. Fix unique constraint on saved_filters
8. Fix array containment SQL operator

**ESTIMATED WORK:** 40-60 hours to address all CRITICAL + HIGH issues before implementation can begin.

**SPEC STATUS:** NOT ready for implementation. Requires major revision.
