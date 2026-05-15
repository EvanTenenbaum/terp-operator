# Referral System - Blocker Fixes (Phase 0)

**Date**: 2026-05-15  
**Purpose**: Fix critical blockers before implementation  
**Target**: Must complete before Phase 1 begins

---

## Overview

QA review found **5 blocker issues** that must be fixed before implementing the referral credit system. These fixes prevent data corruption, race conditions, and referential integrity violations.

---

## Blocker 1: Race Condition in Balance Updates

### Problem
Multiple concurrent transactions updating same referee balance causes lost updates.

**Scenario**:
```
Thread A: reads balance $500 → adds $50 → writes $550
Thread B: reads balance $500 → adds $100 → writes $600
Final balance: $600 (WRONG - should be $650)
```

### Fix: Database Trigger for Balance Maintenance

**Approach**: Instead of application-level balance updates, use database trigger to maintain balance automatically from credits table.

**Migration Addition**:

```sql
-- Function to recalculate referee balance from credits
CREATE OR REPLACE FUNCTION recalculate_referee_balance(p_referee_id uuid)
RETURNS void AS $$
BEGIN
  UPDATE referees
  SET balance = (
    SELECT COALESCE(SUM(credit_amount), 0)
    FROM referee_credits
    WHERE referee_id = p_referee_id
      AND status = 'accrued'
  ),
  lifetime_earned = (
    SELECT COALESCE(SUM(credit_amount), 0)
    FROM referee_credits
    WHERE referee_id = p_referee_id
      AND status IN ('accrued', 'paid')
  )
  WHERE id = p_referee_id;
END;
$$ LANGUAGE plpgsql;

-- Trigger on credit insert
CREATE OR REPLACE FUNCTION sync_referee_balance_on_credit_change()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM recalculate_referee_balance(NEW.referee_id);
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.referee_id != OLD.referee_id THEN
      -- Moved to different referee (rare, but handle it)
      PERFORM recalculate_referee_balance(OLD.referee_id);
      PERFORM recalculate_referee_balance(NEW.referee_id);
    ELSE
      PERFORM recalculate_referee_balance(NEW.referee_id);
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM recalculate_referee_balance(OLD.referee_id);
  END IF;
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER maintain_referee_balance
  AFTER INSERT OR UPDATE OR DELETE ON referee_credits
  FOR EACH ROW
  EXECUTE FUNCTION sync_referee_balance_on_credit_change();

-- Create index to speed up balance calculation
CREATE INDEX referee_credits_balance_calc_idx 
  ON referee_credits(referee_id, status);
```

**Application Change**:

Remove manual balance updates from commands:

```typescript
// OLD (WRONG):
async function accrueCredit(refereeId, amount) {
  await db.insert(refereeCredits).values({...});
  await db.update(referees)
    .set({ balance: sql`balance + ${amount}` }) // REMOVE THIS
    .where(eq(referees.id, refereeId));
}

// NEW (CORRECT):
async function accrueCredit(refereeId, amount) {
  // Just insert credit - trigger handles balance
  await db.insert(refereeCredits).values({...});
  // Balance updated automatically by trigger
}
```

**Verification**:

```sql
-- Verify balance matches sum of accrued credits
SELECT r.id, r.name, r.balance,
       (SELECT COALESCE(SUM(credit_amount), 0) 
        FROM referee_credits 
        WHERE referee_id = r.id AND status = 'accrued') as calculated_balance
FROM referees r
WHERE r.balance != (SELECT COALESCE(SUM(credit_amount), 0) 
                    FROM referee_credits 
                    WHERE referee_id = r.id AND status = 'accrued');
-- Should return 0 rows
```

---

## Blocker 2: Polymorphic FK Validation

### Problem
`referee_relationships.entity_id` references either `customers.id` OR `vendors.id`, but PostgreSQL can't enforce this constraint natively.

**Bad data example**:
```sql
-- This succeeds even if customer doesn't exist:
INSERT INTO referee_relationships (referee_id, entity_type, entity_id, ...)
VALUES ('...', 'customer', '00000000-dead-beef-0000-000000000000', ...);
```

### Fix: Validation Trigger

**Migration Addition**:

```sql
CREATE OR REPLACE FUNCTION validate_referee_relationship_entity()
RETURNS TRIGGER AS $$
DECLARE
  entity_exists boolean;
BEGIN
  -- Validate entity exists based on type
  IF NEW.entity_type = 'customer' THEN
    SELECT EXISTS(SELECT 1 FROM customers WHERE id = NEW.entity_id)
    INTO entity_exists;
    
    IF NOT entity_exists THEN
      RAISE EXCEPTION 'Customer with ID % does not exist', NEW.entity_id;
    END IF;
    
  ELSIF NEW.entity_type = 'vendor' THEN
    SELECT EXISTS(SELECT 1 FROM vendors WHERE id = NEW.entity_id)
    INTO entity_exists;
    
    IF NOT entity_exists THEN
      RAISE EXCEPTION 'Vendor with ID % does not exist', NEW.entity_id;
    END IF;
    
  ELSE
    RAISE EXCEPTION 'Invalid entity_type: %. Must be customer or vendor.', NEW.entity_type;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_referee_relationship_entity_fk
  BEFORE INSERT OR UPDATE ON referee_relationships
  FOR EACH ROW
  EXECUTE FUNCTION validate_referee_relationship_entity();
```

**Additional Safeguard** (prevent entity deletion with active relationships):

```sql
CREATE OR REPLACE FUNCTION prevent_entity_delete_with_referee()
RETURNS TRIGGER AS $$
DECLARE
  relationship_count int;
BEGIN
  -- Check if entity has active referee relationships
  IF TG_TABLE_NAME = 'customers' THEN
    SELECT COUNT(*) INTO relationship_count
    FROM referee_relationships
    WHERE entity_type = 'customer' 
      AND entity_id = OLD.id 
      AND active = true;
  ELSIF TG_TABLE_NAME = 'vendors' THEN
    SELECT COUNT(*) INTO relationship_count
    FROM referee_relationships
    WHERE entity_type = 'vendor' 
      AND entity_id = OLD.id 
      AND active = true;
  END IF;
  
  IF relationship_count > 0 THEN
    RAISE EXCEPTION 'Cannot delete % with active referee relationships. Deactivate relationships first.', 
      TG_TABLE_NAME;
  END IF;
  
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER prevent_customer_delete_with_referee
  BEFORE DELETE ON customers
  FOR EACH ROW
  EXECUTE FUNCTION prevent_entity_delete_with_referee();

CREATE TRIGGER prevent_vendor_delete_with_referee
  BEFORE DELETE ON vendors
  FOR EACH ROW
  EXECUTE FUNCTION prevent_entity_delete_with_referee();
```

**Verification**:

```sql
-- Test: try to insert relationship with fake customer ID
BEGIN;
INSERT INTO referee_relationships (referee_id, entity_type, entity_id, fee_type, fee_percentage)
VALUES (
  (SELECT id FROM referees LIMIT 1),
  'customer',
  '00000000-0000-0000-0000-000000000000',
  'percentage',
  5.00
);
-- Should fail with: Customer with ID 00000000-0000-0000-0000-000000000000 does not exist
ROLLBACK;
```

---

## Blocker 3: Transaction Isolation for Credit Accrual

### Problem
Credit accrual involves multiple writes without explicit transaction wrapping:
1. Insert credit
2. Update PO/Sale
3. (Balance updated by trigger)

If any step fails, partial state is committed.

### Fix: Wrap in Database Transaction

**Application Change**:

```typescript
// Command: postPurchaseOrder with referee credit
async function postPurchaseOrder(payload) {
  return await db.transaction(async (tx) => {
    // 1. Post the PO (existing logic)
    const po = await tx.update(purchaseOrders)
      .set({ status: 'ordered', orderedAt: new Date() })
      .where(eq(purchaseOrders.id, payload.poId))
      .returning();
    
    // 2. If referee credit should be logged
    if (payload.refereeRelationshipId && payload.logRefereeCredit) {
      const relationship = await tx.query.refereeRelationships.findFirst({
        where: and(
          eq(refereeRelationships.id, payload.refereeRelationshipId),
          eq(refereeRelationships.active, true)
        )
      });
      
      if (!relationship) {
        throw new Error('Referee relationship not found or inactive');
      }
      
      // Calculate credit
      const creditAmount = calculateRefereeCredit(
        po.total,
        relationship.feeType,
        relationship.feePercentage,
        relationship.feeFixedAmount
      );
      
      // 3. Insert credit (balance updated by trigger automatically)
      await tx.insert(refereeCredits).values({
        refereeId: relationship.refereeId,
        refereeRelationshipId: relationship.id,
        transactionType: 'purchase_order',
        transactionId: po.id,
        transactionNo: po.poNo,
        transactionTotal: po.total,
        feeType: relationship.feeType,
        feePercentage: relationship.feePercentage,
        feeFixedAmount: relationship.feeFixedAmount,
        creditAmount,
        status: 'accrued',
        commandId: payload.commandId
      });
      
      // 4. Update PO with referee info
      await tx.update(purchaseOrders)
        .set({
          refereeRelationshipId: relationship.id,
          refereeCreditAmount: creditAmount
        })
        .where(eq(purchaseOrders.id, po.id));
    }
    
    // 5. Log command (existing logic)
    await logCommand(tx, 'postPurchaseOrder', payload, po);
    
    return po;
  });
  // If anything fails, entire transaction rolls back
}
```

**Same pattern for** `confirmSalesOrder`, `postTransactionLedgerRow`, etc.

**Verification**:

```typescript
test('PO credit accrual is atomic', async () => {
  const referee = await createTestReferee();
  const vendor = await createTestVendor();
  const relationship = await addRefereeRelationship(referee.id, 'vendor', vendor.id, ...);
  
  // Simulate database failure after credit insert
  await expect(
    postPurchaseOrder({
      vendorId: vendor.id,
      refereeRelationshipId: relationship.id,
      logRefereeCredit: true,
      // ... other PO fields ...
      _simulateFailureAfterCreditInsert: true // test hook
    })
  ).rejects.toThrow();
  
  // Verify nothing was committed
  const credits = await getCreditsForReferee(referee.id);
  expect(credits).toHaveLength(0);
  
  const balance = await getRefereeBalance(referee.id);
  expect(balance).toBe(0);
});
```

---

## Blocker 4: Payout Validation Against Credits

### Problem
Can pay more than accrued credits balance, creating "ghost payments".

**Bad scenario**:
```
Accrued credits: $100, $50, $25 (total $175)
Payout: $200
Result: All credits marked paid, balance -= $200
Net: -$25 "ghost payment"
```

### Fix: Strict Validation + Partial Credit Handling

**Design Decision**: Allow partial credit marking (credit can be partially paid).

**Migration Addition**:

```sql
-- Add partial payment tracking
ALTER TABLE referee_credits
ADD COLUMN amount_paid numeric(12,2) NOT NULL DEFAULT 0;

-- Constraint: amount_paid cannot exceed credit_amount
ALTER TABLE referee_credits
ADD CONSTRAINT referee_credits_amount_paid_check
CHECK (amount_paid >= 0 AND amount_paid <= credit_amount);

-- Update status logic: credit is 'paid' when amount_paid = credit_amount
-- Change status constraint to allow 'partially_paid'
ALTER TABLE referee_credits
DROP CONSTRAINT referee_credits_status_check;

ALTER TABLE referee_credits
ADD CONSTRAINT referee_credits_status_check
CHECK (status IN ('accrued', 'partially_paid', 'paid', 'voided'));
```

**Application Change**:

```typescript
async function processRefereePayout(tx, refereeId, amount) {
  // 1. Validate amount against available balance
  const referee = await tx.query.referees.findFirst({
    where: eq(referees.id, refereeId)
  });
  
  if (amount > referee.balance) {
    throw new Error(
      `Cannot pay $${amount}. Referee balance is only $${referee.balance}.`
    );
  }
  
  // 2. Get unpaid/partially-paid credits (FIFO)
  const credits = await tx.query.refereeCredits.findMany({
    where: and(
      eq(refereeCredits.refereeId, refereeId),
      or(
        eq(refereeCredits.status, 'accrued'),
        eq(refereeCredits.status, 'partially_paid')
      )
    ),
    orderBy: [asc(refereeCredits.createdAt)]
  });
  
  // 3. Calculate how much of each credit to pay
  let remaining = amount;
  const paymentsToApply = [];
  
  for (const credit of credits) {
    if (remaining <= 0) break;
    
    const unpaidAmount = credit.creditAmount - credit.amountPaid;
    const payAmount = Math.min(unpaidAmount, remaining);
    
    paymentsToApply.push({
      creditId: credit.id,
      payAmount,
      newTotalPaid: credit.amountPaid + payAmount,
      newStatus: 
        (credit.amountPaid + payAmount >= credit.creditAmount) ? 'paid' : 'partially_paid'
    });
    
    remaining -= payAmount;
  }
  
  // 4. Verify we can pay exact amount (should always be true if balance check passed)
  const totalApplied = paymentsToApply.reduce((sum, p) => sum + p.payAmount, 0);
  if (Math.abs(totalApplied - amount) > 0.01) {
    throw new Error(
      `Cannot apply exact payout amount. Applied: $${totalApplied}, Requested: $${amount}`
    );
  }
  
  // 5. Apply payments to credits
  for (const payment of paymentsToApply) {
    await tx.update(refereeCredits)
      .set({
        amountPaid: payment.newTotalPaid,
        status: payment.newStatus,
        paidViaTransactionId: transactionId, // from outer context
        paidAt: new Date()
      })
      .where(eq(refereeCredits.id, payment.creditId));
  }
  
  // 6. Balance updated automatically by trigger
  
  return paymentsToApply;
}
```

**Verification**:

```typescript
test('cannot pay more than balance', async () => {
  const referee = await createRefereeWithCredits([100, 50, 25]); // total $175
  
  await expect(
    payReferee(referee.id, 200)
  ).rejects.toThrow('Cannot pay $200. Referee balance is only $175');
});

test('partial credit payment works correctly', async () => {
  const referee = await createRefereeWithCredits([100, 50, 25]);
  
  await payReferee(referee.id, 125);
  
  const credits = await getCreditsForReferee(referee.id);
  expect(credits[0].status).toBe('paid');
  expect(credits[0].amountPaid).toBe(100);
  expect(credits[1].status).toBe('partially_paid');
  expect(credits[1].amountPaid).toBe(25);
  expect(credits[2].status).toBe('accrued');
  expect(credits[2].amountPaid).toBe(0);
  
  const balance = await getRefereeBalance(referee.id);
  expect(balance).toBe(50); // 175 - 125
});
```

---

## Blocker 5: Cascade Delete Protection

### Problem
Can delete referee with unpaid balance, losing all credits and relationships.

**Bad scenario**:
```sql
DELETE FROM referees WHERE id = '...';
-- CASCADE deletes all relationships and credits
-- Unpaid balance of $1,000 is lost
```

### Fix: Prevent Delete with Unpaid Balance

**Migration Addition**:

```sql
CREATE OR REPLACE FUNCTION prevent_referee_delete_with_balance()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.balance > 0 THEN
    RAISE EXCEPTION 'Cannot delete referee "%" with unpaid balance $%. Pay out balance first.', 
      OLD.name, 
      OLD.balance;
  END IF;
  
  -- Also prevent if has unpaid credits (double-check in case balance is out of sync)
  IF EXISTS (
    SELECT 1 FROM referee_credits 
    WHERE referee_id = OLD.id 
      AND status IN ('accrued', 'partially_paid')
  ) THEN
    RAISE EXCEPTION 'Cannot delete referee "%" with unpaid credits. Pay out or void credits first.', 
      OLD.name;
  END IF;
  
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_referee_delete_protection
  BEFORE DELETE ON referees
  FOR EACH ROW
  EXECUTE FUNCTION prevent_referee_delete_with_balance();
```

**Application Change** (soft delete preferred):

```typescript
// Instead of hard delete, add soft delete:
async function deleteReferee(refereeId) {
  const referee = await db.query.referees.findFirst({
    where: eq(referees.id, refereeId)
  });
  
  if (referee.balance > 0) {
    throw new Error(
      `Cannot delete referee with unpaid balance $${referee.balance}. ` +
      `Pay out balance first.`
    );
  }
  
  // Soft delete: just mark inactive
  await db.update(referees)
    .set({ active: false, updatedAt: new Date() })
    .where(eq(referees.id, refereeId));
}
```

**Verification**:

```sql
-- Test: try to delete referee with balance
BEGIN;
INSERT INTO referees (name, balance) VALUES ('Test', 100);
DELETE FROM referees WHERE name = 'Test';
-- Should fail with: Cannot delete referee "Test" with unpaid balance $100
ROLLBACK;
```

---

## Implementation Checklist

### Database Changes

- [ ] Add trigger: `recalculate_referee_balance()`
- [ ] Add trigger: `sync_referee_balance_on_credit_change()`
- [ ] Add trigger: `validate_referee_relationship_entity()`
- [ ] Add trigger: `prevent_entity_delete_with_referee()` (customers)
- [ ] Add trigger: `prevent_entity_delete_with_referee()` (vendors)
- [ ] Add trigger: `prevent_referee_delete_with_balance()`
- [ ] Add column: `referee_credits.amount_paid`
- [ ] Add constraint: `referee_credits_amount_paid_check`
- [ ] Update constraint: `referee_credits_status_check` (add 'partially_paid')
- [ ] Add index: `referee_credits_balance_calc_idx`

### Application Changes

- [ ] Remove manual balance updates from `accrueCredit()`
- [ ] Wrap `postPurchaseOrder` in transaction
- [ ] Wrap `confirmSalesOrder` in transaction
- [ ] Wrap `postTransactionLedgerRow` in transaction
- [ ] Implement `processRefereePayout()` with validation
- [ ] Implement soft delete for referees
- [ ] Update `deleteReferee()` command

### Tests

- [ ] Test concurrent credit accrual (race condition)
- [ ] Test invalid entity_id in relationship (should fail)
- [ ] Test PO rollback on credit failure
- [ ] Test payout exceeding balance (should fail)
- [ ] Test partial credit payment
- [ ] Test delete referee with balance (should fail)
- [ ] Test balance reconciliation (sum of credits = balance)

---

## Verification Script

Run after implementing all fixes:

```sql
-- 1. Verify triggers exist
SELECT trigger_name, event_object_table 
FROM information_schema.triggers 
WHERE trigger_schema = 'public'
  AND trigger_name LIKE '%referee%'
ORDER BY event_object_table, trigger_name;
-- Should show 6 triggers

-- 2. Test balance calculation
DO $$
DECLARE
  test_referee_id uuid;
  accrued_sum numeric;
  recorded_balance numeric;
BEGIN
  -- Create test referee
  INSERT INTO referees (name) VALUES ('Balance Test') RETURNING id INTO test_referee_id;
  
  -- Create test credits
  INSERT INTO referee_credits (referee_id, transaction_type, transaction_id, transaction_no, transaction_total, fee_type, credit_amount, referee_relationship_id)
  VALUES 
    (test_referee_id, 'purchase_order', gen_random_uuid(), 'PO-TEST-1', 1000, 'percentage', 50, (SELECT id FROM referee_relationships LIMIT 1)),
    (test_referee_id, 'sales_order', gen_random_uuid(), 'SO-TEST-1', 2000, 'percentage', 100, (SELECT id FROM referee_relationships LIMIT 1));
  
  -- Check balance
  SELECT balance INTO recorded_balance FROM referees WHERE id = test_referee_id;
  SELECT COALESCE(SUM(credit_amount), 0) INTO accrued_sum 
  FROM referee_credits 
  WHERE referee_id = test_referee_id AND status = 'accrued';
  
  IF recorded_balance != accrued_sum THEN
    RAISE EXCEPTION 'Balance mismatch! Recorded: %, Calculated: %', recorded_balance, accrued_sum;
  END IF;
  
  RAISE NOTICE 'Balance test PASSED: $%', recorded_balance;
  
  -- Cleanup
  DELETE FROM referees WHERE id = test_referee_id;
END $$;

-- 3. Test polymorphic FK validation
DO $$
BEGIN
  BEGIN
    INSERT INTO referee_relationships (referee_id, entity_type, entity_id, fee_type, fee_percentage)
    VALUES ((SELECT id FROM referees LIMIT 1), 'customer', '00000000-0000-0000-0000-000000000000', 'percentage', 5.00);
    RAISE EXCEPTION 'Validation FAILED: Allowed invalid customer ID';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM LIKE '%does not exist%' THEN
        RAISE NOTICE 'Polymorphic FK validation PASSED';
      ELSE
        RAISE;
      END IF;
  END;
END $$;
```

---

## Rollback Plan

If blockers cause issues after deployment:

1. **Disable triggers** (temporary):
```sql
ALTER TABLE referee_credits DISABLE TRIGGER maintain_referee_balance;
ALTER TABLE referee_relationships DISABLE TRIGGER enforce_referee_relationship_entity_fk;
-- etc.
```

2. **Revert to manual balance updates** (application code)

3. **Run balance reconciliation**:
```sql
UPDATE referees r
SET balance = (
  SELECT COALESCE(SUM(credit_amount), 0)
  FROM referee_credits
  WHERE referee_id = r.id AND status = 'accrued'
);
```

4. **Re-enable triggers after fix**

---

**End of Blocker Fixes Document**

**Next Step**: Implement these fixes, run verification script, then proceed to Phase 1.
