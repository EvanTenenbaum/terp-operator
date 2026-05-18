# Next Steps: Phase 3-4 Implementation Roadmap

**Status**: Phases 1-2 complete and production-ready  
**Completion Report**: See `docs/PHASE_1_2_COMPLETION_REPORT.md`  
**Date**: 2026-05-18

---

## 🎯 WHAT'S DONE (Phases 1-2)

### ✅ Phase 1: Critical Fixes (7 issues, ~8 hours + 4 AQA cycles)
- **#23** - Idempotency with 4-round adversarial QA ✓
- **#28** - Approved PO editing blocked ✓
- **#26** - Payment allocation auto-execution ✓
- **#16** - CI test execution enabled ✓
- **#14** - Rate limiting implemented ✓

### ✅ Phase 2: Security & Data Integrity (~4 hours)
- **#18** - FOR UPDATE locks (critical ops done, 2.5d remaining) ✓
- **#14** - CSP headers enabled ✓
- **#13** - Socket.io authentication ✓

**Git commits**: `919f987` (Phase 1), `bc7ef57` (Phase 2)

---

## 🚧 WHAT'S NEXT (Phases 3-4)

### Phase 3: UX Blockers (3 weeks estimated)

#### Week 1: Routing Foundation
**#29 - URL Routing** (1 day - HIGHEST PRIORITY)

**Current State**: No routing - all views at URL `/`, conditional rendering based on `activeView` state

**Requirements**:
1. Install `react-router-dom` v6
   ```bash
   pnpm add react-router-dom@6
   ```

2. Refactor `src/client/App.tsx`:
   ```tsx
   import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
   
   // Replace conditional rendering with:
   <Routes>
     <Route path="/" element={<Navigate to="/dashboard" />} />
     <Route path="/dashboard" element={<DashboardView />} />
     <Route path="/sales" element={<SalesView />} />
     <Route path="/intake" element={<IntakeView />} />
     <Route path="/purchase-orders" element={<PurchaseOrdersView />} />
     <Route path="/matchmaking" element={<MatchmakingView />} />
     // ... rest of views
   </Routes>
   ```

3. Update `src/client/components/Shell.tsx` navigation:
   ```tsx
   import { useNavigate } from 'react-router-dom';
   
   const navigate = useNavigate();
   // Replace setActiveView with:
   onClick={() => navigate('/dashboard')}
   ```

4. Sync `activeView` state with URL:
   ```tsx
   import { useLocation } from 'react-router-dom';
   
   const location = useLocation();
   useEffect(() => {
     const viewFromPath = location.pathname.slice(1) || 'dashboard';
     setActiveView(viewFromPath);
   }, [location]);
   ```

**Testing Checklist**:
- [ ] Browser back/forward buttons work
- [ ] Direct URL navigation (e.g., `/sales`) works
- [ ] Refresh preserves view
- [ ] Deep links work (e.g., `/purchase-orders?id=123`)
- [ ] Navigation state persists across tabs

**Files to modify**:
- `src/client/App.tsx` (routing setup)
- `src/client/components/Shell.tsx` (navigation links)
- `src/client/store/uiStore.ts` (sync with URL)
- `package.json` (add dependency)

**Edge cases**:
- Handle 404 (unknown routes → redirect to dashboard)
- Preserve query parameters
- Handle auth state (redirect to login if not authenticated)

---

#### Week 2: Focus & Grid Compliance

**#30 - Command Palette Focus Trap** (4 hours)

**Current State**: Tab can escape command palette, breaking keyboard UX

**Requirements**:
1. Install focus trap library (or implement manually):
   ```bash
   pnpm add focus-trap-react
   ```

2. Wrap CommandPalette content:
   ```tsx
   import FocusTrap from 'focus-trap-react';
   
   <FocusTrap active={isOpen}>
     <div className="command-palette">
       {/* palette content */}
     </div>
   </FocusTrap>
   ```

3. Handle keyboard events:
   - `Tab`/`Shift+Tab`: Cycle within palette
   - `Escape`: Close palette and return focus to trigger
   - `Enter`: Execute command and close

**Testing**: Manual keyboard navigation testing required

**Files**: `src/client/components/CommandPalette.tsx`

---

**#31 - Grid Column Compliance** (1 day)

**Current State**: 7 of 13 grids violate ≤8-column rule

**Requirements**:
1. Audit all grids in `src/client/views/`:
   - DashboardView
   - IntakeView
   - SalesView
   - MatchmakingView
   - PurchaseOrdersView
   - InventoryView
   - OrdersView
   - PaymentsView
   - ClientLedgerView
   - VendorPayablesView
   - FulfillmentView
   - ConnectorsView
   - CloseoutView

2. For grids >8 columns:
   - Move non-essential columns to detail panel
   - Combine related columns (e.g., cost range → single column)
   - Add column visibility toggle
   - Use responsive column hiding

**Documentation**: Document which columns moved and why

**Files**: All `*View.tsx` files with AG Grid

---

#### Week 3: Test Coverage Improvements

**#20 - Test Coverage** (ongoing)

**Current Gaps** (from validation report):
- Zero unit tests for reversal operations
- No concurrent request stress tests
- Missing integration tests for money operations
- No coverage thresholds enforced

**Priorities**:
1. Add unit tests:
   ```typescript
   // tests/unit/reversals.test.ts
   describe('Command reversals', () => {
     it('reverseCommandById undoes inventory movements');
     it('reverseCommandById undoes payment allocations');
     it('reverseCommandById undoes customer balance changes');
   });
   ```

2. Add concurrent tests:
   ```typescript
   // tests/e2e/concurrency.spec.ts
   it('concurrent payment allocations dont double-allocate', async () => {
     await Promise.all([
       allocatePayment(paymentId),
       allocatePayment(paymentId)
     ]);
     // Assert only one allocation created
   });
   ```

3. Set coverage thresholds:
   ```json
   // vitest.config.ts
   coverage: {
     statements: 80,
     branches: 75,
     functions: 80,
     lines: 80
   }
   ```

**Files**: `tests/unit/`, `tests/e2e/`, `vitest.config.ts`

---

### Phase 4: Polish & Verification (3-4 weeks)

#### Week 1: Complete FOR UPDATE Implementation

**#18 - Remaining FOR UPDATE Locks** (2.5 days)

**Reference**: See `docs/FOR_UPDATE_REMAINING.md` for full list

**High Priority Remaining**:
1. `postSale()` - customer balance updates
2. `unallocatePayment()` - payment/invoice updates
3. `voidPayment()` - payment status + customer balance
4. `adjustBatchQty()` - inventory quantity
5. `payVendorBill()` / `reverseVendorPayment()` - vendor bill updates

**Pattern** (already established in Phase 2):
```typescript
// Lock rows before reading/updating
const rows = await tx.execute<typeof table.$inferSelect>(
  sql`SELECT * FROM ${table} WHERE ${table.id} = ${id} FOR UPDATE`
);
const row = rows.rows[0];
// ... perform updates
```

**Testing**: Add concurrent request stress tests for each locked operation

---

#### Week 2: Migration Audit

**#17 - Migration Audit** (1 day)

**Current State**: 31 SQL migration files in `/migrations/*.sql`, unknown safety status

**Requirements**:
1. Audit each migration for:
   - Transaction wrapping (`BEGIN` / `COMMIT`)
   - Rollback safety
   - Index creation (use `CONCURRENTLY` for production)
   - Schema drift from Drizzle definitions

2. Create migration checklist template:
   ```markdown
   ## Migration: NNNN_description.sql
   - [ ] Wrapped in transaction
   - [ ] Rollback tested
   - [ ] Indexes created concurrently
   - [ ] Schema matches Drizzle definition
   - [ ] No blocking locks on large tables
   ```

3. Fix non-compliant migrations

**Documentation**: Create `docs/MIGRATION_AUDIT_REPORT.md`

**Files**: `/migrations/*.sql`, `src/server/schema.ts`

---

#### Week 3-4: Accessibility & Final Verification

**#34 - Accessibility Sweep** (2 weeks)

**Requirements**:
1. ARIA labels for all interactive elements
2. Keyboard navigation for all workflows
3. Screen reader support
4. Color contrast compliance (WCAG AA)
5. Focus indicators
6. Skip links

**Tools**:
- `axe-core` for automated testing
- Manual screen reader testing (VoiceOver, NVDA)
- Chrome Lighthouse accessibility audit

**Files**: All React components

---

**Final Verification** (1 week)

1. **Full test suite**: 100% pass rate
2. **Load testing**: Concurrent requests, race conditions
3. **Security audit**: Pen test findings, OWASP top 10
4. **Documentation**: API docs, runbooks, deployment guide
5. **Staging deployment**: Full smoke test
6. **Production readiness review**

---

## 🔧 IMMEDIATE ACTIONS (Before Starting Phase 3)

### 1. Deploy Phase 1-2 to Staging
```bash
git push origin main
# Wait for CI to complete
# Verify deploy-staging workflow runs tests
```

### 2. Smoke Test Critical Paths
- [ ] Login with rate limiting (try 6 failed attempts → blocked)
- [ ] Socket.io connection (should require auth now)
- [ ] Payment allocation (test idempotency)
- [ ] Concurrent payment attempts (verify no race)
- [ ] Browser console: Check for CSP violations

### 3. Monitor Logs
Watch for:
- Rate limiter events: `"Too many failed login attempts"`
- Socket.io rejections: `"Authentication required"`
- FOR UPDATE deadlocks: `"deadlock detected"`
- CSP violations: Browser console errors

### 4. Team Handoff
- Share `docs/PHASE_1_2_COMPLETION_REPORT.md`
- Review `docs/FOR_UPDATE_REMAINING.md`
- Assign Phase 3 issues in Linear

---

## 📊 EFFORT ESTIMATES

| Phase | Tasks | Estimated Time | Priority |
|-------|-------|----------------|----------|
| Phase 3.1 | Routing (#29) | 1 day | HIGH |
| Phase 3.2 | Focus trap (#30) | 4 hours | MEDIUM |
| Phase 3.3 | Grid compliance (#31) | 1 day | MEDIUM |
| Phase 3.4 | Test coverage (#20) | Ongoing | HIGH |
| Phase 4.1 | FOR UPDATE complete | 2.5 days | HIGH |
| Phase 4.2 | Migration audit | 1 day | MEDIUM |
| Phase 4.3 | Accessibility | 2 weeks | MEDIUM |
| Phase 4.4 | Final verification | 1 week | HIGH |
| **TOTAL** | | **6-7 weeks** | |

---

## ⚠️ RISKS & MITIGATION

### Technical Risks
1. **React Router migration breaks navigation**
   - Mitigation: Feature flag, gradual rollout
   - Test all navigation paths before merge

2. **FOR UPDATE locks cause deadlocks**
   - Mitigation: Consistent lock ordering (customer → payment → invoice)
   - Add timeout handling and retry logic

3. **CSP breaks third-party integrations**
   - Mitigation: Monitor CSP violation reports
   - Whitelist legitimate sources as needed

### Process Risks
1. **Scope creep in Phase 3-4**
   - Mitigation: Stick to validation report priorities
   - Defer nice-to-haves to Phase 5

2. **Incomplete testing before deploy**
   - Mitigation: Mandatory smoke tests
   - QA sign-off required

---

## 📚 REFERENCE DOCUMENTATION

### Completed
- `docs/PHASE_1_2_COMPLETION_REPORT.md` - Full completion report
- `docs/ISSUE_VALIDATION_REPORT.md` - Initial validation
- `docs/COMPLETE_ISSUE_VALIDATION.md` - Comprehensive issue list
- `docs/FOR_UPDATE_REMAINING.md` - Remaining lock work

### To Create
- `docs/PHASE_3_COMPLETION_REPORT.md` (after Phase 3)
- `docs/MIGRATION_AUDIT_REPORT.md` (Phase 4)
- `docs/ACCESSIBILITY_AUDIT_REPORT.md` (Phase 4)
- `docs/FINAL_VALIDATION_REPORT.md` (Phase 4)

---

## ✅ SUCCESS CRITERIA

### Phase 3
- [ ] URL routing works (back/forward, deep links, refresh)
- [ ] Command palette traps focus correctly
- [ ] All grids ≤8 columns
- [ ] Test coverage >70% (up from current)
- [ ] No regressions in existing functionality

### Phase 4
- [ ] All FOR UPDATE locks implemented
- [ ] All migrations audited and compliant
- [ ] WCAG AA accessibility compliance
- [ ] 100% test pass rate under load
- [ ] Production deploy with zero incidents

---

**Next Session Start**: Begin with Phase 3.1 (URL routing)  
**Questions?**: Review `docs/PHASE_1_2_COMPLETION_REPORT.md` for context
