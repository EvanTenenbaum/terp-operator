# Product Filtering System - Implementation Handoff Prompt

**Copy the text below and provide it to your implementation agent:**

---

# Implementation Task: Product Filtering System

## Context

You are implementing a comprehensive product filtering system for Terp Operator (cannabis wholesale/distribution platform). The design specification has been completed, validated, and approved for implementation. All adversarial reviews have been addressed.

## Your Mission

Implement the complete product filtering system following the atomic roadmap. The system includes:
- Database schema (brands table, saved filters, field additions)
- Complete backend (6 tRPC procedures, SQL filter builder, rate limiting)
- Complete frontend (AdvancedFilterBuilder component, filter evaluator, UI enhancements)
- Migrations (UP and DOWN)
- Tests (unit, integration, performance, security)
- Deployment

## Critical Documents

All specifications and roadmap are located in:
```
/Users/evan/work/terp-agro-operator-console/docs/superpowers/specs/
```

**YOU MUST READ THESE FILES IN ORDER:**

1. **`2026-05-17-product-filtering-system-design-v2.md`** (3,200 lines)
   - Complete production-ready specification
   - Every implementation detail is here
   - Copy code EXACTLY as shown - no improvisation
   - This is your source of truth

2. **`2026-05-17-atomic-implementation-roadmap.md`** (current file)
   - 47 atomic tasks broken down
   - Each task has acceptance criteria
   - Follow task order strictly (dependencies matter)

3. **`2026-05-17-v2-completion-summary.md`**
   - What was fixed from V1
   - Statistics and context

4. **`2026-05-17-product-filtering-adversarial-review.md`** (OPTIONAL)
   - Issues that were found and fixed
   - Read if you need to understand why certain decisions were made

## Implementation Approach

### Phase-by-Phase Execution

**DO NOT skip ahead. Complete each phase fully before moving to the next.**

#### Phase 1: Database Foundation (Tasks 1.1 - 1.10)
**Duration:** 2 days  
**Start Here:**

1. Read V2 spec Section 1 (Database Schema Changes)
2. Create migration files in `/migrations/` directory:
   - `2026_05_17_001_create_brands.sql` through `2026_05_17_010_table_tuning.sql`
3. Copy SQL EXACTLY from spec (lines 30-52, 54-88, etc.)
4. Run each migration on local dev database
5. Validate with acceptance criteria from roadmap
6. Create rollback migration: `2026_05_17_rollback_filtering_system.sql`

**Validation checkpoint:**
- All 10 tasks complete
- All migrations run successfully
- Rollback tested
- Triggers fire correctly
- Views return data

#### Phase 2: Shared Type Definitions (Tasks 2.1 - 2.5)
**Duration:** 1 day

1. Create `/src/shared/filterSchemas.ts`
2. Copy code from V2 spec lines 282-488
3. Ensure TypeScript compiles with no errors
4. Export all types

**Validation checkpoint:**
- FILTER_FIELDS object complete
- All Zod schemas compile
- Type inference works
- Can import from frontend and backend

#### Phase 3: Backend Implementation (Tasks 3.1 - 3.10)
**Duration:** 3 days

1. Create `/src/server/utils/ratelimit.ts` (spec lines 647-681)
2. Create `/src/server/utils/filterSqlBuilder.ts` (spec lines 490-645)
3. Create `/src/server/routers/filters.ts` (spec lines 683-1157)
   - Implement ALL 6 procedures (no stubs)
   - applyBatchFilters (lines 683-806)
   - saveFilter (lines 808-860)
   - listSavedFilters (lines 862-898)
   - getFilter (lines 900-937)
   - updateFilter (lines 939-1027)
   - deleteFilter (lines 1029-1069)
   - getFacets (lines 1071-1157)
4. Add filtersRouter to `/src/server/router.ts`

**Validation checkpoint:**
- All procedures callable via tRPC
- Rate limiting works (test with 25 rapid requests)
- SQL parameterization correct (no string concat)
- Permissions enforced

#### Phase 4: Frontend Implementation (Tasks 4.1 - 4.8)
**Duration:** 5 days

1. Create `/src/client/utils/filterEvaluator.ts` (spec lines 1159-1314)
2. Create `/src/client/components/SavedFiltersDropdown.tsx` (spec lines 1914-1957)
3. Create `/src/client/components/AdvancedFilterBuilder.tsx` (spec lines 1316-1740)
4. Modify `/src/client/components/InventoryFinderPanel.tsx` (spec lines 1742-1912)

**Validation checkpoint:**
- All operators work in evaluator
- AdvancedFilterBuilder renders
- Can add/remove conditions and groups
- Saved filters load and apply
- Circuit breaker triggers at 10k products
- Integration with existing finder works

#### Phase 5: Testing (Tasks 5.1 - 5.7)
**Duration:** 2 days (parallel with development)

1. Create test files in `/src/tests/`
2. Write comprehensive test suites
3. Run all tests and achieve >90% coverage

**Required tests:**
- Unit: filterEvaluator, filterSqlBuilder
- Integration: all tRPC procedures
- Performance: 100k product benchmark
- Security: SQL injection, prototype pollution

#### Phase 6: Deployment (Tasks 6.1 - 6.7)
**Duration:** 1 week

1. Deploy to staging
2. Run E2E QA
3. Production deployment
4. Monitoring
5. Documentation

## Critical Implementation Rules

### 1. Copy Code Exactly
- **DO NOT improvise or "improve" the code**
- The V2 spec has been through 3 rounds of adversarial review
- Every decision has a reason
- If you think something is wrong, FLAG IT, don't change it

### 2. Follow the Roadmap Order
- Tasks have dependencies
- Skipping ahead will cause failures
- Each task has acceptance criteria - meet them ALL

### 3. No Stubs or TODOs
- Implement everything completely
- Every procedure must be fully functional
- No "implement later" code

### 4. Security is Non-Negotiable
- Always use parameterized SQL queries ($1, $2, etc.)
- Never concatenate strings into SQL
- Always validate with Zod before database operations
- Always check field whitelist
- Always enforce permissions

### 5. Test Everything
- Don't skip testing
- Write tests as you implement
- Run tests before marking tasks complete

### 6. Validation Checkpoints
- After each phase, run validation checkpoint
- Don't proceed if validation fails
- Document any issues immediately

## Common Pitfalls to Avoid

### Database
- ❌ Don't forget trigger implementations
- ❌ Don't skip rollback migration
- ❌ Don't forget to reset sequences after backfill
- ✅ Run migrations in transaction
- ✅ Test rollback before committing

### Backend
- ❌ Don't use Drizzle query builder (use raw SQL)
- ❌ Don't forget ON CONFLICT in saveFilter
- ❌ Don't skip rate limiting
- ❌ Don't skip query timeouts
- ✅ Use parameterized queries everywhere
- ✅ Implement all 6 procedures fully

### Frontend
- ❌ Don't mutate state directly
- ❌ Don't skip recursion protection
- ❌ Don't forget circuit breaker
- ❌ Don't skip null/undefined handling
- ✅ Deep clone filters before updates
- ✅ Handle all edge cases

## Success Criteria

### Phase 1 Complete When:
- [ ] All 10 migration files created
- [ ] All migrations run successfully
- [ ] Triggers populate alias snapshots
- [ ] Views return data
- [ ] Rollback tested
- [ ] sort_id backfill in correct order

### Phase 2 Complete When:
- [ ] filterSchemas.ts created
- [ ] All types exported
- [ ] TypeScript compiles
- [ ] No type errors in IDE

### Phase 3 Complete When:
- [ ] All 6 tRPC procedures implemented
- [ ] Can call each procedure successfully
- [ ] Rate limiting triggers after 20 requests
- [ ] Permissions block unauthorized access
- [ ] Query timeouts work
- [ ] SQL queries parameterized

### Phase 4 Complete When:
- [ ] AdvancedFilterBuilder renders
- [ ] All 13 operators work
- [ ] Can save and load filters
- [ ] Nested groups work
- [ ] Circuit breaker shows warning
- [ ] Existing functionality preserved

### Phase 5 Complete When:
- [ ] All tests written
- [ ] All tests pass
- [ ] Coverage > 90%
- [ ] Security tests pass

### Phase 6 Complete When:
- [ ] Deployed to production
- [ ] E2E QA passed
- [ ] Monitoring in place
- [ ] Documentation complete

## Progress Reporting

### After Each Task
Report:
```
Task X.Y: [Task Name]
Status: Complete / Blocked / In Progress
Duration: [actual time]
Issues: [any problems encountered]
Acceptance Criteria: [X/Y] met
Notes: [anything important]
```

### After Each Phase
Report:
```
Phase X: [Phase Name]
Status: Complete
Tasks: [X/Y] completed
Validation: Passed / Failed
Blockers: [none / describe]
Ready for next phase: Yes / No
```

## Getting Help

### If You Get Stuck

1. **Re-read the relevant spec section** - answer is usually there
2. **Check the validation report** - issue may have been addressed
3. **Look at similar existing code** - follow patterns
4. **Check acceptance criteria** - are you meeting all of them?

### If You Find an Issue

**DO NOT silently work around it.**

Report:
```
Issue Found:
Location: [file/line number]
Description: [what's wrong]
Spec says: [what spec specifies]
Current behavior: [what happens now]
Proposed fix: [your suggestion]
Severity: Critical / High / Medium / Low
Blocking: Yes / No
```

## Resources

### Key File Locations

**Spec:**
- `/Users/evan/work/terp-agro-operator-console/docs/superpowers/specs/2026-05-17-product-filtering-system-design-v2.md`

**Roadmap:**
- `/Users/evan/work/terp-agro-operator-console/docs/superpowers/specs/2026-05-17-atomic-implementation-roadmap.md`

**Existing Codebase Patterns:**
- tRPC routers: `/src/server/routers/`
- Components: `/src/client/components/`
- Utilities: `/src/client/utils/`, `/src/server/utils/`
- Schemas: `/src/server/schema.ts`
- Migrations: `/migrations/`

### Commands You'll Need

```bash
# Run migrations (if tool exists, otherwise run SQL manually)
pnpm db:migrate

# Run tests
pnpm test

# Type check
pnpm tsc --noEmit

# Start dev server
pnpm dev

# Build for production
pnpm build
```

## Timeline Expectations

**Realistic Timeline for Full Implementation:**
- Phase 1: 2 days
- Phase 2: 1 day
- Phase 3: 3 days
- Phase 4: 5 days
- Phase 5: 2 days (parallel)
- Phase 6: 1 week

**Total: 4-6 weeks** for complete, tested, deployed system

**If you're ahead of schedule:** Great! Use extra time for thorough testing.  
**If you're behind schedule:** Flag blockers immediately, don't try to catch up by cutting corners.

## Final Checklist Before Claiming Complete

- [ ] All 47 tasks completed
- [ ] All migrations run successfully
- [ ] All 6 tRPC procedures work
- [ ] All tests pass
- [ ] No TypeScript errors
- [ ] No console errors in browser
- [ ] E2E QA passed
- [ ] Deployed to production
- [ ] Monitoring configured
- [ ] Documentation written
- [ ] Validation report shows 100% pass
- [ ] No known critical bugs
- [ ] Performance targets met

## Start Implementation Now

**Your first action:** Read the V2 spec from top to bottom (don't skim).  
**Your second action:** Create Task 1.1 migration file.  
**Your third action:** Test Task 1.1 and validate acceptance criteria.

Then proceed through the roadmap sequentially.

Good luck! This is a well-designed, fully-specified system. Follow the spec, validate at each step, and you'll have a production-ready filtering system in 4-6 weeks.

---

**Document Version:** 1.0  
**Last Updated:** 2026-05-17  
**Status:** Ready for Handoff
