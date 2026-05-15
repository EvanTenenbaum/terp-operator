# Referral Credit System - QA Findings Report

**Review Date**: 2026-05-15  
**QA Level**: Full Gate  
**Reviewer**: Claude (Adversarial Review Mode)  
**Documents Reviewed**:
- `referral-credit-system-design.md`
- `referral-system-migration.sql`
- `referral-system-types.ts`
- `referral-system-ui-mockups.md`
- `referral-system-integration-summary.md`

---

## Severity Levels

- **🔴 BLOCKER**: Must fix before implementation - breaks core functionality, data loss risk, or security issue
- **🟠 MAJOR**: Should fix before launch - workflow problems, significant UX issues, or performance concerns
- **🟡 MINOR**: Can fix post-launch - edge cases, polish, or nice-to-haves

---

## 🔴 BLOCKER Issues

### B1: Race Condition in Balance Updates

**File**: design.md (Transaction Flow), migration.sql  
**Issue**: Multiple concurrent transactions for the same referee could cause balance inconsistencies.

**Scenario**:
```
Thread A: PO for $1,000 → reads balance ($500) → accrues $50 credit → writes balance ($550)
Thread B: Sale for $2,000 → reads balance ($500) → accrues $100 credit → writes balance ($600)
Final balance: $600 (should be $650)
```

**Root Cause**: `UPDATE referees SET balance = balance + credit_amount` without row-level locking or optimistic locking.

**Fix**:
```sql
-- Option 1: Use SELECT FOR UPDATE
BEGIN;
SELECT balance FROM referees WHERE id = $1 FOR UPDATE;
UPDATE referees SET balance = balance + $2 WHERE id = $1;
COMMIT;

-- Option 2: Use database triggers to maintain balance
CREATE TRIGGER update_referee_balance_on_credit
  AFTER INSERT ON referee_credits
  FOR EACH ROW
  WHEN (NEW.status = 'accrued')
  EXECUTE FUNCTION sync_referee_balance();
```

**Impact**: HIGH - Data corruption, incorrect payouts

---

### B2: No Referential Integrity for Polymorphic FKs

**File**: migration.sql (referee_relationships.entity_id)  
**Issue**: `entity_id` is a polymorphic FK to either `customers.id` or `vendors.id`, but PostgreSQL cannot enforce this constraint.

**Problem**:
```sql
-- This will succeed even if entity_id doesn't exist in customers OR vendors:
INSERT INTO referee_relationships (referee_id, entity_type, entity_id, ...)
VALUES (..., 'customer', '00000000-0000-0000-0000-000000000000', ...);
```

**Fix**: Add validation in application layer + database constraints:
```sql
-- Option 1: Partitioned FK via CHECK constraint + triggers
CREATE FUNCTION validate_referee_relationship_entity()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.entity_type = 'customer' THEN
    IF NOT EXISTS (SELECT 1 FROM customers WHERE id = NEW.entity_id) THEN
      RAISE EXCEPTION 'Customer % does not exist', NEW.entity_id;
    END IF;
  ELSIF NEW.entity_type = 'vendor' THEN
    IF NOT EXISTS (SELECT 1 FROM vendors WHERE id = NEW.entity_id) THEN
      RAISE EXCEPTION 'Vendor % does not exist', NEW.entity_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_referee_relationship_entity_fk
  BEFORE INSERT OR UPDATE ON referee_relationships
  FOR EACH ROW
  EXECUTE FUNCTION validate_referee_relationship_entity();

-- Option 2: Separate tables (more normalized)
CREATE TABLE referee_customer_relationships (...);
CREATE TABLE referee_vendor_relationships (...);
```

**Impact**: HIGH - Orphaned relationships, application errors

---

### B3: Missing Transaction Isolation for Credit Accrual

**File**: design.md (postPurchaseOrder modification)  
**Issue**: Credit accrual involves multiple writes (insert credit, update balance, update PO) without explicit transaction.

**Problem**: If any step fails, system could be in inconsistent state:
- Credit inserted but balance not updated
- Balance updated but PO not marked
- PO marked but credit not inserted

**Fix**: Wrap all credit accrual logic in database transaction:
```typescript
async function accrueRefereeCredit(tx, poId, refereeRelationshipId, creditAmount) {
  await tx.begin();
  try {
    // 1. Insert credit
    const credit = await tx.insert(refereeCredits).values({...}).returning();
    
    // 2. Update referee balance (with row lock)
    await tx.execute(sql`
      UPDATE referees 
      SET balance = balance + ${creditAmount},
          lifetime_earned = lifetime_earned + ${creditAmount}
      WHERE id = ${refereeId}
    `);
    
    // 3. Update PO
    await tx.update(purchaseOrders)
      .set({ refereeRelationshipId, refereeCreditAmount: creditAmount })
      .where(eq(purchaseOrders.id, poId));
    
    await tx.commit();
  } catch (error) {
    await tx.rollback();
    throw error;
  }
}
```

**Impact**: HIGH - Data inconsistency, balance drift

---

### B4: Payout Can Exceed Accrued Credits (FIFO Bug)

**File**: design.md (Referee Payout Flow), types.ts  
**Issue**: Design says "mark credits as paid FIFO" but doesn't validate that sum of paid credits equals payout amount.

**Scenario**:
```
Referee has 3 credits: $100, $50, $25 (total = $175)
Operator pays $200
FIFO marks all 3 as paid (sum = $175)
Balance decreases by $200
Net effect: $25 "ghost payment"
```

**Fix**: Validate payout amount against available credits:
```typescript
async function processRefereePayout(refereeId, amount) {
  const unpaidCredits = await getUnpaidCredits(refereeId); // ordered by created_at
  const totalUnpaid = sum(unpaidCredits.map(c => c.creditAmount));
  
  if (amount > totalUnpaid) {
    throw new Error(`Cannot pay $${amount}. Only $${totalUnpaid} available.`);
  }
  
  let remaining = amount;
  const creditsToPay = [];
  
  for (const credit of unpaidCredits) {
    if (remaining <= 0) break;
    const payAmount = Math.min(credit.creditAmount, remaining);
    creditsToPay.push({ creditId: credit.id, amount: payAmount });
    remaining -= payAmount;
  }
  
  // If FIFO doesn't cover exact amount, should we allow partial credit payment?
  // Design doesn't specify this case.
}
```

**Open Question**: Can a single credit be partially paid? Design doesn't address this.

**Impact**: HIGH - Overpayment, balance corruption

---

### B5: No Cascade Delete Protection for Active Referees

**File**: migration.sql (referees table)  
**Issue**: Can delete referee with active relationships and unpaid balance.

**Problem**:
```sql
-- Validation says "cannot delete referee with unpaid balance > 0"
-- But schema has no enforcement:
DELETE FROM referees WHERE id = '...'; -- succeeds due to CASCADE
-- This deletes referee + all relationships + all credits (including unpaid)
```

**Fix**: Add check constraint + application validation:
```sql
-- Option 1: Soft delete only
ALTER TABLE referees ADD COLUMN deleted_at timestamp;
-- Never hard delete, just mark deleted_at

-- Option 2: Trigger to prevent hard delete
CREATE FUNCTION prevent_referee_delete_with_balance()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.balance > 0 THEN
    RAISE EXCEPTION 'Cannot delete referee % with unpaid balance $%', 
      OLD.name, OLD.balance;
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_referee_delete_protection
  BEFORE DELETE ON referees
  FOR EACH ROW
  EXECUTE FUNCTION prevent_referee_delete_with_balance();
```

**Impact**: HIGH - Data loss, unpaid obligations lost

---

## 🟠 MAJOR Issues

### M1: Missing Concurrency Control for Relationship Updates

**File**: design.md (addRefereeRelationship command)  
**Issue**: Command says "deactivate any existing active relationship" but without transaction isolation, race condition possible.

**Scenario**:
```
Thread A: Add relationship (Referee1 → Customer1, 5%)
Thread B: Add relationship (Referee1 → Customer1, 10%)

Both check: no active relationship exists
Both insert new relationship
Result: 2 active relationships (violates unique index after insert)
```

**Fix**: Use explicit locking or UPSERT:
```sql
BEGIN;
-- Lock existing relationship
SELECT * FROM referee_relationships 
WHERE referee_id = $1 AND entity_type = $2 AND entity_id = $3 AND active = true
FOR UPDATE;

-- Deactivate if exists
UPDATE referee_relationships 
SET active = false, effective_until = now()
WHERE ...;

-- Insert new
INSERT INTO referee_relationships (...);
COMMIT;
```

**Impact**: MEDIUM - Duplicate relationships, unique constraint violations

---

### M2: Draft Orders with Referee Checkboxes Can Become Stale

**File**: ui-mockups.md (Sales Workspace), design.md  
**Issue**: If referee relationship is deactivated or fee changes while draft order exists, checkbox shows stale data.

**Scenario**:
```
1. Operator starts draft sale, checkbox shows "John (5%)"
2. Manager deactivates John's relationship
3. Operator resumes draft, still shows "John (5%)" checkbox
4. Operator posts sale → accrues credit using deactivated relationship
```

**Fix**: Re-validate relationship on draft load and on post:
```typescript
function loadDraftOrder(orderId) {
  const draft = getDraftOrder(orderId);
  
  if (draft.refereeRelationshipId) {
    const relationship = getRefereeRelationship(draft.refereeRelationshipId);
    
    if (!relationship || !relationship.active) {
      // Relationship gone or deactivated
      draft.refereeRelationshipId = null;
      draft.logRefereeCredit = false;
      showWarning("Referee relationship is no longer active");
    } else if (relationship.feePercentage !== draft.cachedFeePercentage) {
      // Fee changed
      showWarning("Referee fee has changed since draft was created");
      draft.cachedFeePercentage = relationship.feePercentage;
    }
  }
}
```

**Impact**: MEDIUM - Incorrect credits, user confusion

---

### M3: No Handling for Negative Transaction Totals

**File**: design.md (Fee Calculation Logic), types.ts  
**Issue**: Credit calculation doesn't handle negative transaction totals (refunds, corrections).

**Scenario**:
```
Sale total: -$500 (refund)
Referee fee: 5%
Calculated credit: -$500 * 0.05 = -$25

Should this:
A) Be blocked (no negative credits)?
B) Reduce referee balance (reverse credit)?
C) Create $0 credit?
```

**Design Gap**: No specification for this case.

**Recommendation**: Block negative credits, handle refunds via `voidRefereeCredit` command:
```typescript
function calculateRefereeCredit(total, feeType, feePercentage, feeFixedAmount) {
  if (total < 0) {
    throw new Error('Cannot calculate credit for negative transaction total');
  }
  // ... rest of calculation
}
```

**Impact**: MEDIUM - Undefined behavior for refunds/corrections

---

### M4: Payout Transaction Ledger Doesn't Link to Specific Credits

**File**: design.md (Referee Payout Flow), migration.sql  
**Issue**: `paid_via_transaction_id` links credit → transaction, but no reverse link.

**Problem**: Given a transaction ledger row, cannot easily see which credits were paid.

**UI Impact**: In transaction history, can't show "Paid 3 credits: SO-123 ($50), PO-456 ($25), SO-789 ($100)".

**Fix**: Add JSONB column to transaction ledger:
```sql
ALTER TABLE payments -- or wherever transaction ledger lives
ADD COLUMN paid_referee_credits jsonb; -- array of { creditId, amount }
```

Or create junction table:
```sql
CREATE TABLE transaction_credit_payments (
  transaction_id uuid REFERENCES payments(id),
  credit_id uuid REFERENCES referee_credits(id),
  amount numeric(12,2)
);
```

**Impact**: MEDIUM - Reduced auditability, harder to reconcile

---

### M5: Missing Validation for Fee Structure Changes

**File**: design.md (updateRefereeRelationship command)  
**Issue**: Can change fee structure (e.g., 5% → 10%) for relationship with existing accrued credits.

**Problem**: 
- Past credits were calculated at 5%
- Future credits calculated at 10%
- But what about draft orders in progress?

**Recommendation**: Either:
A) Block fee changes if unpaid credits exist
B) Version fee structures (keep history)
C) Only apply new fees to new transactions

**Design says**: "Store snapshot of fee structure" in credits (good), but doesn't prevent confusing UX.

**Impact**: MEDIUM - User confusion, potential disputes

---

### M6: No Bulk Payout Operation

**File**: design.md, ui-mockups.md  
**Issue**: To pay multiple referees, operator must add separate ledger row for each.

**UX Problem**: If paying 10 referees, operator adds 10 ledger rows manually.

**Enhancement**: Add "Batch Payout" feature:
- Select multiple referees from grid
- Enter payout amounts
- Generate multiple transaction ledger rows in one command

**Impact**: MEDIUM - Tedious UX for bulk operations

---

### M7: Missing Index on referee_credits.paid_at

**File**: migration.sql  
**Issue**: Likely query pattern: "Show all credits paid in date range" but no index on `paid_at`.

**Query**:
```sql
SELECT * FROM referee_credits 
WHERE status = 'paid' 
  AND paid_at BETWEEN '2026-01-01' AND '2026-12-31';
```

**Fix**:
```sql
CREATE INDEX referee_credits_paid_at_idx 
  ON referee_credits(paid_at) 
  WHERE status = 'paid';
```

**Impact**: MEDIUM - Slow payout history queries

---

### M8: Transaction Type "referee_payout" Not Seeded

**File**: design.md (postTransactionLedgerRow), integration-summary.md  
**Issue**: Design mentions `referee_payout` transaction type but migration doesn't seed it.

**Problem**: On fresh DB, `referee` entity type selected but no `referee_payout` transaction type exists.

**Fix**: Add to migration seed:
```sql
INSERT INTO transaction_types (slug, label, direction, allowed_entity_types, ...)
VALUES ('referee_payout', 'Referee Payout', 'paying', '{referee}', 'check', 'accounting', 'unapplied', true, true, true);
```

**Impact**: MEDIUM - Broken payout flow on fresh install

---

## 🟡 MINOR Issues

### N1: Missing Email/Phone Validation

**File**: migration.sql (referees table), types.ts  
**Issue**: Email and phone are `varchar` with no format validation.

**Fix**: Add CHECK constraints or application validation:
```sql
ALTER TABLE referees 
ADD CONSTRAINT referees_email_format 
CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$');
```

**Impact**: LOW - Bad data entry, but not critical

---

### N2: No Upper Limit on Percentage Fee

**File**: migration.sql (referee_relationships)  
**Issue**: `fee_percentage numeric(5,2)` allows up to 999.99%, which is nonsensical.

**Current constraint**: `fee_percentage > 0 AND fee_percentage <= 100`  
**Problem**: Actually allows values like `100.01` through `999.99` due to numeric(5,2) range.

**Fix**: Tighten constraint:
```sql
ALTER TABLE referee_relationships
ADD CONSTRAINT referee_relationships_fee_percentage_max
CHECK (fee_percentage IS NULL OR (fee_percentage >= 0.01 AND fee_percentage <= 100.00));
```

**Impact**: LOW - Unlikely input, but should be prevented

---

### N3: Inconsistent Terminology: "Referee" vs "Referrer"

**File**: All documents  
**Issue**: Technically, the person being referred is the "referee" and the person doing the referring is the "referrer".

**Current usage**: "Referee" means "person who refers" (actually a referrer).

**Impact**: LOW - Semantic issue, but might confuse some users

**Recommendation**: Accept current usage or do global find/replace to "Referrer" before implementation.

---

### N4: Missing Updated_At Trigger

**File**: migration.sql  
**Issue**: `updated_at` column exists but no trigger to auto-update on row modification.

**Fix**: Add trigger:
```sql
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER referees_updated_at BEFORE UPDATE ON referees
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER referee_relationships_updated_at BEFORE UPDATE ON referee_relationships
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER referee_credits_updated_at BEFORE UPDATE ON referee_credits
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

**Impact**: LOW - Audit trail weakness, but not critical

---

### N5: No Soft Delete Pattern

**File**: migration.sql, design.md  
**Issue**: Uses `active` boolean but also mentions hard deletes.

**Recommendation**: Standardize on soft deletes:
- Add `deleted_at timestamp` to all tables
- Never hard delete, just mark `deleted_at = now()`
- Filter queries with `WHERE deleted_at IS NULL`

**Impact**: LOW - Better audit trail, easier recovery

---

### N6: Missing Pagination for Credits Query

**File**: types.ts (RefereeCreditsQueryInput)  
**Issue**: Has `limit` and `offset` but no docs on default limits.

**Problem**: Referee with 10,000 credits could accidentally fetch all rows.

**Fix**: Document and enforce default limit:
```typescript
export interface RefereeCreditsQueryInput {
  limit?: number; // Default: 100, Max: 1000
  offset?: number; // Default: 0
  // ...
}
```

**Impact**: LOW - Performance issue only for high-volume referees

---

### N7: No Sorting Specification for Credits

**File**: design.md (Referee Profile Panel)  
**Issue**: "Credit History" grid but no spec for default sort order.

**Recommendation**: Default to `created_at DESC` (newest first) with ability to change.

**Impact**: LOW - UX polish

---

### N8: Missing Timezone Handling Documentation

**File**: migration.sql  
**Issue**: Uses `timestamp with time zone` but no docs on how timezones are handled in UI.

**Recommendation**: Document:
- All timestamps stored in UTC
- UI displays in user's local timezone
- Date range filters use user timezone

**Impact**: LOW - Potential confusion in reports

---

## 📋 Missing Features / Gaps

### G1: No Referee Credit Expiration

**Issue**: Credits never expire. If referee is inactive for years, credits remain.

**Consideration**: Add `expires_at` to credits or relationships?

**Impact**: Business decision, not technical blocker

---

### G2: No Minimum Payout Amount

**Issue**: Can pay $0.01 to referee, generating transaction overhead.

**Consideration**: Add `minimum_payout_amount` to referee or global config?

**Impact**: UX/business decision

---

### G3: No Multi-Currency Support

**Issue**: All amounts in single currency (implied USD).

**Consideration**: Add `currency` column if international referees expected?

**Impact**: Scope creep, likely out of scope for MVP

---

### G4: No Referee Performance Reports

**Issue**: Design mentions "Referee Dashboard (future enhancement)" but no MVP plan.

**Consideration**: 
- Which referees generate most revenue?
- Which customers/vendors came from which referee?
- ROI per referee?

**Impact**: Nice-to-have, not MVP blocker

---

### G5: No Duplicate Detection for Referees

**Issue**: Can create multiple referees with same name/email.

**Consideration**: Add unique constraint on email? Or fuzzy matching?

**Impact**: Data quality issue, minor

---

## 🔒 Security Concerns

### S1: No Authorization Check in Queries

**File**: types.ts (query definitions)  
**Issue**: `refereeProfile` and `refereeCredits` queries don't specify RBAC.

**Problem**: Can any role view referee balances and payout history?

**Recommendation**: Restrict to manager/owner roles:
```typescript
refereeProfile: protectedProcedure
  .input(z.object({ refereeId: z.string().uuid() }))
  .use(requireRole(['manager', 'owner']))
  .query(async ({ input, ctx }) => { ... });
```

**Impact**: MEDIUM - Sensitive financial data exposure

---

### S2: Tax ID Stored in Plain Text

**File**: migration.sql (referees.tax_id)  
**Issue**: Tax IDs (SSNs, EINs) stored unencrypted.

**Recommendation**: 
- Encrypt at application level before storing
- Or use database-level encryption (PostgreSQL pgcrypto)
- Or store in external secure vault (e.g., 1Password via MCP)

**Impact**: HIGH if tax IDs collected, LOW if not used

---

### S3: No Audit Log for Sensitive Operations

**File**: design.md (Command Journal Integration)  
**Issue**: Says "all referee operations logged" but doesn't specify what's logged.

**Recommendation**: Ensure these are logged:
- Viewing referee balance
- Viewing credit history
- Updating fee structure
- Processing payout
- Voiding credit

**Impact**: MEDIUM - Compliance/audit requirement

---

## ⚡ Performance Concerns

### P1: N+1 Query Risk in Referee Grid

**File**: ui-mockups.md (Referees Grid View)  
**Issue**: Grid shows "Active relationships count" which likely requires join.

**Problem**:
```sql
-- Bad: N+1 query
SELECT * FROM referees; -- 100 referees
-- Then for each referee:
SELECT COUNT(*) FROM referee_relationships WHERE referee_id = $1 AND active = true;
```

**Fix**: Use single query with join:
```sql
SELECT r.*, 
       COUNT(rr.id) FILTER (WHERE rr.active = true) as active_relationships
FROM referees r
LEFT JOIN referee_relationships rr ON rr.referee_id = r.id
GROUP BY r.id;
```

**Impact**: MEDIUM - Slow grid load with many referees

---

### P2: No Index on Transaction Numbers

**File**: migration.sql (referee_credits.transaction_no)  
**Issue**: Credits store `transaction_no` but no index for lookups.

**Use case**: "Show all credits from PO-123"

**Fix**:
```sql
CREATE INDEX referee_credits_transaction_no_idx 
  ON referee_credits(transaction_no);
```

**Impact**: LOW - Niche query, but should be indexed

---

### P3: Large JSONB Snapshot in Command Journal

**File**: design.md (Credit accrual logged in command journal)  
**Issue**: Command journal stores `beforeSnapshot` and `afterSnapshot` which could be large for POs/Sales.

**Consideration**: Does accruing credit need full PO/Sale snapshot?

**Recommendation**: Only snapshot referee-relevant fields:
```typescript
beforeSnapshot: {
  refereeRelationshipId: null,
  refereeCreditAmount: null,
  total: 1000
},
afterSnapshot: {
  refereeRelationshipId: '...',
  refereeCreditAmount: 50,
  total: 1000
}
```

**Impact**: LOW - Storage/performance concern at scale

---

## 🧪 Testing Gaps

### T1: No Concurrent Transaction Test

**Issue**: Design doesn't specify how to test race conditions.

**Recommendation**: Add integration test:
```typescript
test('concurrent PO and Sale for same referee update balance correctly', async () => {
  const referee = await createReferee();
  
  // Start 2 transactions concurrently
  const [po, sale] = await Promise.all([
    createPOWithReferee(referee, 1000),
    createSaleWithReferee(referee, 2000)
  ]);
  
  const finalBalance = await getRefereeBalance(referee.id);
  expect(finalBalance).toBe(150); // 50 + 100
});
```

**Impact**: MEDIUM - Critical to validate concurrency handling

---

### T2: No Reversal Test Coverage

**Issue**: Design specifies reversals but no test scenarios.

**Recommendation**: Test:
- Reverse PO → credit voided, balance decreased
- Reverse sale → credit voided
- Reverse payout → credits unmarked, balance restored
- Void already-paid credit → should fail

**Impact**: MEDIUM - Reversals are error-prone

---

### T3: No Edge Case Testing for Fee Calculation

**Issue**: Fee calculation has edge cases not covered:

**Test cases needed**:
- Very large transaction ($999,999,999.99)
- Very small percentage (0.01%)
- Rounding edge cases (1000.01 * 0.033 = ?)
- Zero transaction total
- Null fee values

**Impact**: LOW - Calculation is simple, but should be tested

---

## 📊 Summary

### By Severity

| Severity | Count | Must Fix |
|----------|-------|----------|
| 🔴 Blocker | 5 | YES |
| 🟠 Major | 8 | Recommended |
| 🟡 Minor | 8 | Optional |
| Gaps | 5 | Business decision |
| Security | 3 | Context-dependent |
| Performance | 3 | Monitor |
| Testing | 3 | Strongly recommended |

### Critical Path Blockers

Must fix before implementation:
1. **B1**: Race condition in balance updates (add locking)
2. **B2**: Polymorphic FK validation (add triggers)
3. **B3**: Transaction isolation (wrap in DB transactions)
4. **B4**: Payout validation (validate against credits)
5. **B5**: Cascade delete protection (add trigger)

### Recommended Pre-Launch Fixes

Should fix before MVP:
1. **M1**: Relationship update concurrency
2. **M2**: Draft order staleness
3. **M3**: Negative transaction handling
4. **M8**: Seed referee_payout transaction type
5. **S1**: Query authorization (RBAC)
6. **P1**: N+1 query in referee grid

### Post-Launch Improvements

Can address after launch:
- Minor validation issues (N1-N8)
- Missing features (G1-G5)
- Performance optimizations (P2-P3)
- Testing coverage (T1-T3)

---

## ✅ What's Good

### Strengths of the Design

1. **✅ Excellent paradigm fit**: Leverages existing TERP patterns (entity profiles, ledger grid, checkboxes)
2. **✅ Backward compatible**: All changes are additive
3. **✅ Audit trail**: Command journal integration is solid
4. **✅ Row-native UX**: Credits as rows that transition state
5. **✅ Clear data model**: Well-normalized, good separation of concerns
6. **✅ Comprehensive documentation**: All aspects covered
7. **✅ Flexible fee structure**: Percentage, fixed, hybrid all supported
8. **✅ RBAC integration**: Proper role checks on commands

### Well-Designed Components

- Fee calculation logic (simple, testable)
- Relationship model (normalized, flexible)
- UI mockups (consistent with existing views)
- Migration strategy (clear, reversible)
- Type definitions (comprehensive, type-safe)

---

## 🎯 Recommendations

### Before Implementation

1. **Fix all 5 blockers** (B1-B5) - data integrity critical
2. **Add transaction isolation** to all multi-step operations
3. **Seed transaction type** for referee payouts
4. **Add RBAC checks** to sensitive queries
5. **Write concurrent transaction tests**

### Implementation Order

1. **Phase 0**: Fix blockers (add triggers, locking, validation)
2. **Phase 1**: Core entity (with fixed migration)
3. **Phase 2**: Relationships (with concurrency fixes)
4. **Phase 3**: Transaction integration (with proper transactions)
5. **Phase 4**: Payout (with validation fixes)
6. **Phase 5**: Polish + remaining major issues
7. **Phase 6**: Testing + security review

### Post-Launch Monitoring

- Monitor referee balance accuracy (reconcile against credits)
- Track payout transaction volume
- Watch for N+1 query performance
- Audit log sensitive operations
- Monitor for race conditions in production

---

**End of QA Report**

**Overall Assessment**: ⚠️ **CONDITIONAL PASS**

The design is fundamentally sound and fits TERP's architecture well, but has **5 critical blockers** that MUST be fixed before implementation. Once blockers are addressed, the system is ready for cautious rollout with close monitoring.

**Recommended Action**: Fix blockers, implement Phase 0 (fixes), then proceed with phased rollout.
