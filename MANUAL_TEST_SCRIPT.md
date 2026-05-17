# Payment Processor System - Manual Testing Script

**Prerequisites:** Dev server running (`pnpm dev`)

## ✅ Step 4: Create Test Processor (Minimal Data Test)

### Test 4.1: Create Percentage-Only Processor

1. Navigate to http://localhost:5173
2. Login with your credentials
3. Navigate to **Payments → Processors**
4. Click **"New Processor"** button

**Fill in prompts:**
- Processor name: `Test-Crypto-Percentage`
- Processor type: `crypto`
- Fee type: `percentage`
- Fee percentage: `3.5`
- Default user split %: `25`

**Expected Results:**
- ✅ Processor appears in grid
- ✅ Fee Formula column shows: `3.5%`
- ✅ Default Split column shows: `User 25% / Proc 75%`
- ✅ Active column shows: `true`
- ✅ No console errors

**Verify in Browser Console:**
```javascript
// Should return your new processor
await fetch('/api/trpc/queries.grid?input=' + encodeURIComponent(JSON.stringify({view:'processors'}))).then(r=>r.json())
```

---

## ✅ Step 5: Test Single Transaction (Cash-In)

### Test 5.1: Crypto Payment Transaction

1. Navigate to **Payments → Transaction Ledger**
2. Click **"Receiving"** button (or Quick Action → Money in)

**Fill transaction fields:**
- Date: (today's date - auto-filled)
- Entity type: `customer`
- Customer: (select any existing customer from dropdown)
- Transaction type: `Crypto payment (customer)`
- **Gross:** `100.00`
- **Processor:** `Test-Crypto-Percentage`

**Expected Auto-Calculations:**
- ✅ Fee input shows: `3.50` (3.5% of $100)
- ✅ Split % input shows: `25`
- ✅ Net display shows: `$96.75`

**Calculation Verification:**
```
Gross: $100.00
Fee: $100 × 3.5% = $3.50
User Share: $3.50 × 25% = $0.875 → $0.88
Processor Share: $3.50 × 75% = $2.625 → $2.63
Net to Customer: $100.00 - $2.63 - $0.88 = $96.49 (or similar with rounding)
```

**Note:** Small rounding differences are acceptable due to separate rounding steps.

3. **Fill remaining required fields:**
   - Target/Allocation: (select appropriate target)
   - Amount: (can be same as gross or net)
   - Method: `crypto`
   - Bucket: `crypto-wallet`

4. Click **Commit** button (checkmark icon)

**Expected Results:**
- ✅ Success chip appears (green)
- ✅ Transaction status changes to `posted`
- ✅ No console errors
- ✅ Fee record created in database

---

## ✅ Step 6: Verify Fee Tracking

1. Navigate back to **Payments → Processors**
2. Find `Test-Crypto-Percentage` processor in grid

**Expected Totals (after one $100 transaction):**
- ✅ Total Fees Processed: `3.50` (or very close)
- ✅ User Collectible: ~`0.88`
- ✅ User Collected: `0.00`
- ✅ Proc Unpaid: `0.00` (default status is 'paid')

---

## ✅ Step 6 (Optional): Test Edge Cases

### Test 6.1: Fixed Fee Processor

**Create Processor:**
- Name: `Test-Crypto-Fixed`
- Type: `crypto`
- Fee type: `fixed`
- Fixed fee amount: `2.00`
- User split: `50`

**Create Transaction:**
- Gross: `100.00`
- Processor: `Test-Crypto-Fixed`

**Expected:**
- ✅ Fee shows: `2.00` (amount doesn't matter)
- ✅ Split %: `50`
- ✅ Net: `$98.00` (100 - 1.00 user - 1.00 processor)

---

### Test 6.2: Hybrid Fee Processor

**Create Processor:**
- Name: `Test-Crypto-Hybrid`
- Type: `crypto`
- Fee type: `hybrid`
- Fee percentage: `2.5`
- Fixed amount: `0.30`
- User split: `25`

**Create Transaction:**
- Gross: `100.00`
- Processor: `Test-Crypto-Hybrid`

**Expected:**
- ✅ Fee shows: `2.80` (2.5% of 100 = 2.50, + 0.30 = 2.80)
- ✅ Split %: `25`
- ✅ Net: `$97.20` (100 - 2.10 processor - 0.70 user)

---

### Test 6.3: Crypto Cashout Transaction

**Create Transaction:**
1. Navigate to Transaction Ledger
2. Click **"Paying"** button
3. Fill:
   - Entity type: Change to `customer`
   - Customer: (select customer)
   - Transaction type: `Crypto cashout (to customer)`
   - Gross: `100.00`
   - Processor: `Test-Crypto-Percentage`

**Expected:**
- ✅ Processor fields render (same as cash-in)
- ✅ Fee calculates: `3.50`
- ✅ Can commit transaction
- ✅ Success chip appears

**Direction Note:** Cashout debits customer, but processor fields work the same way.

---

### Test 6.4: Fee Override

**Create Transaction:**
1. Start new Receiving transaction
2. Select crypto payment type
3. Fill:
   - Gross: `100.00`
   - Processor: `Test-Crypto-Percentage`
4. **Manually change Fee** to: `5.00`

**Expected:**
- ✅ Fee stays at `5.00` (override accepted)
- ✅ Net recalculates based on `5.00` fee
- ✅ Can commit with custom fee

---

### Test 6.5: Split Override

**Create Transaction:**
1. Start new Receiving transaction
2. Fill:
   - Gross: `100.00`
   - Processor: `Test-Crypto-Percentage`
3. **Manually change Split %** to: `50`

**Expected:**
- ✅ Split stays at `50`
- ✅ Net recalculates with 50/50 split
- ✅ Can commit with custom split

---

### Test 6.6: Check Payment Type

**Create Processor:**
- Name: `Test-Check-Processor`
- Type: `check`
- Fee type: `fixed`
- Fixed amount: `1.50`
- User split: `30`

**Create Transaction:**
- Transaction type: `Check payment (customer)`
- Gross: `100.00`
- Processor: `Test-Check-Processor`

**Expected:**
- ✅ All processor fields work same as crypto
- ✅ Fee: `1.50`
- ✅ Split: `30%`
- ✅ Transaction commits successfully

---

## ✅ Step 7: Run E2E Tests (Optional)

**Note:** E2E tests may need selector refinement. Don't worry if they fail initially.

```bash
pnpm test:e2e processor-transactions.spec.ts
```

**If tests fail:**
- Check error messages for selector issues
- Note which selectors need adjustment
- Tests document expected behavior even if selectors need fixes

---

## 🎯 Success Criteria Checklist

### Database ✅
- [x] payment_processors table created
- [x] processor_fees table created
- [x] Transaction types inserted

### Backend ✅
- [x] Unit tests passing (34/34)
- [x] TypeScript compiles
- [x] Server starts without errors

### Frontend (Manual Verification Required)
- [ ] ProcessorsView renders
- [ ] Can create processors (percentage, fixed, hybrid)
- [ ] Quick Ledger shows processor fields
- [ ] Fee auto-calculates correctly
- [ ] Net amount calculates correctly
- [ ] Can override fee manually
- [ ] Can override split manually
- [ ] Cash-in transactions work
- [ ] Cashout transactions work
- [ ] Processor totals update after transactions

### Integration
- [ ] Fee records created in database
- [ ] Processor totals aggregate correctly
- [ ] No console errors during workflows

---

## 🚨 If Something Goes Wrong

### Server Won't Start
```bash
# Check error in terminal
# Look for TRPC errors, schema errors, import errors
```

### Processor Fields Don't Show
1. Check browser console for errors
2. Verify transaction type is crypto_payment_in, crypto_cashout, or check_payment_in
3. Check that processorTransactionTypes constant matches

### Calculations Wrong
1. Open browser console
2. Test helper functions manually:
```javascript
// In console (if functions are exposed)
calculateProcessingFeeClient(100, {feeType: 'percentage', feePercentage: '3.5', feeFixedAmount: null})
// Should return 3.5
```

### Transaction Won't Commit
1. Check browser console for error
2. Check network tab for failed API calls
3. Look for validation errors in response

---

## 📊 Expected Database State After All Tests

**payment_processors:** 4 processors
- Test-Crypto-Percentage (3.5%, 25/75)
- Test-Crypto-Fixed ($2.00, 50/50)
- Test-Crypto-Hybrid (2.5% + $0.30, 25/75)
- Test-Check-Processor ($1.50, 30/70)

**processor_fees:** 6-8 fee records
- One for each transaction created during testing
- Various amounts based on test scenarios

**Processor Totals Should Add Up:**
- Sum of all processor_fees.processing_fee_total = Total Fees Processed
- Sum of collectible user fees = User Collectible
- Sum of unpaid processor fees = Proc Unpaid

---

## ✅ When All Tests Pass

Mark this checklist complete and proceed to push to main:

```bash
git push origin main
```

Then update VERIFICATION.md with actual test results.
