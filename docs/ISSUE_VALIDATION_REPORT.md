# GitHub Issues Validation Report
**Generated**: 2026-05-18  
**Repository**: terp-agro-operator-console  
**Method**: Deep code inspection + evidence verification

---

## ✅ VERIFIED CRITICAL/HIGH ISSUES (Still Valid)

### 🔴 **CRITICAL**

#### #23 - Idempotency key has no payload/command binding
**Status**: ✅ **CONFIRMED VALID**  
**Evidence**: `src/server/services/commandBus.ts:91-94`
```typescript
const existing = await db.select().from(commandJournal)
  .where(eq(commandJournal.idempotencyKey, input.idempotencyKey)).limit(1);
if (existing[0]) {
  return existing[0].result as unknown as CommandResult;
}
```
- Only checks `idempotencyKey`, NOT `commandName` or payload hash
- Different commands with same key return first command's result
- **CRITICAL DATA CORRUPTION RISK**

---

### 🟠 **HIGH PRIORITY - Security & Data Integrity**

#### #18 - Money/inventory integrity: no FOR UPDATE locks
**Status**: ✅ **CONFIRMED VALID**  
**Evidence**: Zero instances of `FOR UPDATE` in codebase
```bash
$ grep -r "FOR UPDATE" src/server --include="*.ts"
# (no results)
```
- Race conditions possible on money operations
- Inventory updates not locked
- **HIGH RISK**: Concurrent requests can cause data drift

#### #13 - Socket.io is unauthenticated
**Status**: ✅ **CONFIRMED VALID**  
**Evidence**: `src/server/index.ts:12-14`
```typescript
io.on('connection', (socket) => {
  socket.emit('health:pulse', { checkedAt: new Date().toISOString(), status: 'ok' });
});
```
- No authentication check before connection
- All clients can connect and receive updates
- **SECURITY RISK**

#### #14 - Auth surface: CSP off, rate limiting missing
**Status**: ✅ **PARTIALLY CONFIRMED**  
**Evidence**:
- No CSP headers found in codebase
- Need to verify demo credentials and rate limiting
- **ACTION NEEDED**: Check auth middleware

#### #26 - logPayment does not allocate with allocationIntent='fifo'
**Status**: ✅ **CONFIRMED VALID**  
**Evidence**: `src/server/services/commandBus.ts` - `logPayment` function
- Sets `allocationIntent: 'fifo'` in payment record (line 22)
- Sets `impactPreview` (line 23)
- **BUT NEVER CALLS `allocatePayment()`**
- Separate `allocatePayment` function exists but must be called manually
- **BUG CONFIRMED**: Intent stored but not executed

#### #28 - Approved POs allow line deletion → $0 total
**Status**: ✅ **CONFIRMED VALID**  
**Evidence**: `assertPurchaseOrderEditable` function
```typescript
function assertPurchaseOrderEditable(status: string) {
  if (['received', 'cancelled'].includes(status)) 
    throw new Error('Received or cancelled purchase orders cannot be edited.');
}
```
- Only blocks `received` and `cancelled` statuses
- **ALLOWS `approved` status to be edited**
- Lines can be deleted from approved POs
- Recalc runs and can set total to $0
- **WORKFLOW INTEGRITY BUG**

---

### 🟠 **HIGH PRIORITY - UX Critical**

#### #29 - No URL routing — browser back/deep-linking broken
**Status**: ✅ **CONFIRMED VALID**  
**Evidence**: 
- No `react-router-dom` in dependencies
- `src/client/App.tsx` uses single conditional render
- All views at URL `/`
- Zero routing implementation found
- **USER EXPERIENCE BLOCKER**

#### #30 - Command Palette has no focus trap
**Status**: ⚠️ **NEEDS UI VERIFICATION**  
**Action**: Requires browser testing to confirm

#### #31 - Numbers-native ≤8-columns rule violated on 7/13 grids
**Status**: ⚠️ **NEEDS GRID AUDIT**  
**Action**: Requires AG Grid component inspection

---

### 🟠 **HIGH PRIORITY - Testing & CI**

#### #16 - CI runs no tests; staging auto-deploys
**Status**: ✅ **CONFIRMED VALID**  
**Evidence**: `.github/workflows/deploy-staging.yml:34`
```yaml
- run: pnpm audit:self
```
- Deploy workflow runs `audit:self` but **NO TEST COMMAND**
- Auto-deploys on push to `main`, `staging` branches
- **QUALITY GATE MISSING**

#### #20 - Test coverage gaps: zero unit tests
**Status**: ⚠️ **PARTIALLY VALID**  
**Evidence**:
- Test files exist: 6 in `src/`, 13 in `tests/`
- `package.json` has `vitest` script
- **BUT**: No coverage threshold enforcement
- **BUT**: Tests not run in CI (see #16)
- **ACTION NEEDED**: Verify test execution and coverage

---

### 🟠 **HIGH PRIORITY - Database**

#### #17 - Migrations non-atomic + schema/index drift
**Status**: ⚠️ **NEEDS MIGRATION AUDIT**  
**Evidence**: Migrations found in `/migrations/*.sql` (31 files)
- Raw SQL migrations exist
- Need to check if wrapped in transactions
- Need to verify schema drift
- **ACTION NEEDED**: Audit migration files for atomicity

---

## ⚠️ NEEDS DEEPER VERIFICATION

### Issues requiring code inspection:

| Issue | Status | Next Step |
|-------|--------|-----------|
| #12 | ⚠️ Needs review | Check command journal schema + replay logic |
| #14 | ⚠️ Partial | Verify demo creds, rate limiting |
| #15 | ⚠️ Needs check | Inspect localStorage usage + CSV export RBAC |
| #19 | ⚠️ Needs check | Verify journal storage location |
| #21 | ⚠️ UI check | Requires browser testing |
| #24 | ⚠️ Needs check | Verify concurrent request handling |
| #25 | ⚠️ Schema check | Verify if `reason` is optional in Zod schemas |
| #27 | ⚠️ State machine | Check matchmaking status transition logic |
| #32 | ⚠️ Error handling | Check tRPC errorFormatter |
| #33-37 | ⚠️ Themed audits | Require systematic component review |

---

## 🆕 NEW FEATURES (Not Bugs - Defer)

- **#38** - Payment Processor System
- **#39** - Customer Pricing Rules v4  
- **#40** - Photography Module

**Recommendation**: Defer until critical bugs fixed

---

## 📊 VALIDATION SUMMARY

### Confirmed Critical Issues: **1**
- #23 - Idempotency key binding

### Confirmed High Priority Issues: **7**
- #13 - Unauthenticated Socket.io
- #16 - CI doesn't run tests  
- #18 - No FOR UPDATE locks
- #26 - Payment allocation not executed
- #28 - Approved PO editing allowed
- #29 - No URL routing

### Needs Verification: **17**
- Requires deeper code inspection or browser testing

### Invalid/Fixed: **0**
- None found yet

---

## 🎯 RECOMMENDED PRIORITY ORDER

### **Phase 1: Immediate** (This Week)
1. **#23** - Fix idempotency binding (2-4 hours)
2. **#28** - Block approved PO editing (1 hour)
3. **#26** - Auto-execute payment allocation (2 hours)
4. **#16** - Add tests to CI pipeline (1 hour)

### **Phase 2: Critical Security** (Next Week)
1. **#13** - Add Socket.io authentication (4 hours)
2. **#18** - Add FOR UPDATE locks to money ops (1-2 days)
3. **#14** - Security hardening (auth, CSP, rate limiting) (2 days)

### **Phase 3: UX Blockers** (Week 3-4)
1. **#29** - Implement URL routing (1 day)
2. **#30** - Fix Command Palette focus trap (4 hours)
3. **#20** - Improve test coverage (ongoing)

### **Phase 4: Verification Sweep** (Month 2)
- Systematically verify remaining 17 issues
- Address confirmed bugs
- Close invalid issues

---

## 🔬 VALIDATION METHODOLOGY

Each issue checked against:
1. **Code Evidence**: Direct inspection of relevant files
2. **Grep Verification**: Search for related patterns
3. **Schema Analysis**: Database structure review
4. **CI/CD Review**: Workflow configuration check

**Confidence Levels**:
- ✅ **CONFIRMED**: Code evidence directly validates issue
- ⚠️ **NEEDS VERIFICATION**: Requires additional checking
- ❌ **INVALID**: Issue no longer applicable (none found yet)

---

## 📝 NEXT ACTIONS

1. ✅ **Complete verification** of remaining 17 issues
2. 📋 **Create implementation plan** for Phase 1 fixes
3. 🔧 **Start with #23** (highest impact)
4. 📊 **Update Linear** with validation results
5. 🧪 **Add regression tests** for each fix

**Estimated total Phase 1 fixes**: 6-9 hours of work
