# Payment Processor QA Runbook

## Quick Start

This runbook provides step-by-step QA procedures for the payment processor system. Use this for manual testing or as a reference for automated QA agents.

## Prerequisites

- Dev server running: `pnpm dev`
- Database migrated: `pnpm db:migrate`
- At least one test processor exists (see Setup section)

## Setup: Create Test Processors

### Option 1: Via Backend Script (Fastest)

```bash
pnpm exec tsx scripts/create-test-processor.ts
```

This creates a "Test-Crypto-Percentage" processor (3.5% fee, 25% user split).

### Option 2: Via UI

1. Navigate to Processors view (sidebar → Money → Processors)
2. Click "New Processor" button
3. Fill prompts:
   - Name: `Test-Crypto-Percentage`
   - Type: `crypto`
   - Fee type: `percentage`
   - Fee %: `3.5`
   - User split: `25`

### Additional Test Processors (Optional)

For comprehensive testing, create these additional processors:

**Fixed Fee Processor:**
- Name: `Test-Crypto-Fixed`
- Type: `crypto`
- Fee type: `fixed`
- Fixed amount: `2.00`
- User split: `50`

**Hybrid Fee Processor:**
- Name: `Test-Crypto-Hybrid`
- Type: `crypto`
- Fee type: `hybrid`
- Fee %: `2.5`
- Fixed amount: `0.30`
- User split: `25`

**Check Processor:**
- Name: `Test-Check-Processor`
- Type: `check`
- Fee type: `fixed`
- Fixed amount: `1.50`
- User split: `30`

## Navigation Notes

⚠️ **IMPORTANT:** This app uses state-based routing, NOT URL routing.

- **DO NOT** navigate via direct URLs (e.g., `/payments/processors`)
- **DO** use sidebar navigation clicks
- **DO** use quick action buttons at the top

To reach Processors view:
1. Click "Processors" in left sidebar under "Money" section

To reach Transaction Ledger:
1. Click "Payments" in left sidebar, OR
2. Use "Money in" quick action button at top

## Test Scenarios

### Scenario 1: Verify Processor View

**Steps:**
1. Login as owner@terpagro.local
2. Click "Processors" in sidebar (under Money)
3. Verify page loads with "Payment Processors" header
4. Verify "New Processor" button exists (top right)
5. Verify grid shows test processor(s)

**Expected Results:**
- Grid has 10 columns: Processor Name, Type, Fee Formula, Default Split, Total Fees, User Collectible, User Collected, Proc Unpaid, Active, Created At
- Test-Crypto-Percentage row shows:
  - Type: `crypto`
  - Fee Formula: `3.5%` or `3.50%`
  - Default Split: `User 25% / Proc 75%` or `User 25.00% / Proc 75.00%`
  - Active: `true`
  - All fee totals: `0` (if no transactions yet)

### Scenario 2: Create Crypto Payment Transaction

**Steps:**
1. Navigate to Payments OR click "Money in" quick action
2. Click "Receiving" button (creates new draft row)
3. Fill fields:
   - Date: (auto-filled with today)
   - Entity type: `customer`
   - Customer: Select any customer from dropdown
   - Transaction type: `Crypto payment (customer)`

**Verify processor fields appear:**
- Gross amount field
- Processor dropdown
- Fee field
- Split % field
- Net amount display

4. Fill Gross: `100.00`
5. Select Processor: `Test-Crypto-Percentage`

**Verify auto-calculations:**
- Fee: `3.50` (exactly, or `3.5`)
- Split %: `25`
- Net: `$96.75` or range `$96.49 - $96.75` (rounding variations acceptable)

**Calculation Formula:**
```
Gross: $100.00
Fee: $100.00 × 3.5% = $3.50
User Share: $3.50 × 25% = $0.875 → $0.88 (rounded)
Processor Share: $3.50 × 75% = $2.625 → $2.63 (rounded)
Net to Customer: $100.00 - $0.88 - $2.63 = $96.49
```

6. Fill remaining required fields:
   - Target/Allocation: Choose appropriate option
   - Amount: `96.50` (or use calculated net)
   - Method: `crypto`
   - Bucket: `crypto-wallet`

7. Click Commit button (checkmark icon)

**Expected Results:**
- Success chip appears (green notification)
- Transaction status changes to `posted`
- Row becomes non-editable
- No console errors

### Scenario 3: Verify Processor Totals

**Steps:**
1. Navigate to Processors view (sidebar → Processors)
2. Find Test-Crypto-Percentage row
3. Check aggregated totals

**Expected Results** (after one $100 transaction at 3.5% fee):
- Total Fees Processed: `3.50` (acceptable range: `3.49 - 3.51`)
- User Collectible: `0.88` (25% of $3.50 = $0.875 rounded)
- User Collected: `0.00` (nothing marked collected yet)
- Proc Unpaid: `0.00` (processor fees default to "paid" status)

### Scenario 4: Test Fee Override

**Steps:**
1. Create new Receiving transaction
2. Select crypto payment type
3. Fill Gross: `100.00`
4. Select Processor: `Test-Crypto-Percentage`
5. Verify fee auto-fills to `3.50`
6. **Manually change Fee field to: `5.00`**
7. Observe Net amount recalculates

**Expected Results:**
- Fee field accepts override value `5.00`
- Net amount recalculates based on $5.00 fee (not $3.50)
- Can commit transaction with custom fee

### Scenario 5: Test Split Override

**Steps:**
1. Create new Receiving transaction
2. Fill Gross: `100.00`, select Test-Crypto-Percentage
3. Verify Split % auto-fills to `25`
4. **Manually change Split % to: `50`**
5. Observe Net amount recalculates

**Expected Results:**
- Split % field accepts override value `50`
- Net amount recalculates with 50/50 split
- Can commit transaction with custom split

### Scenario 6: Test Fixed Fee Processor

**Prerequisites:** Fixed fee processor created (see Setup)

**Steps:**
1. Create Receiving transaction
2. Fill Gross: `100.00`
3. Select Processor: `Test-Crypto-Fixed` ($2.00 fixed fee, 50% split)

**Expected Results:**
- Fee: `2.00` (regardless of gross amount)
- Split %: `50`
- Net: `$98.00` ($100 - $1.00 user - $1.00 processor)

### Scenario 7: Test Hybrid Fee Processor

**Prerequisites:** Hybrid fee processor created (see Setup)

**Steps:**
1. Create Receiving transaction
2. Fill Gross: `100.00`
3. Select Processor: `Test-Crypto-Hybrid` (2.5% + $0.30, 25% split)

**Expected Results:**
- Fee: `2.80` ($100 × 2.5% = $2.50, plus $0.30 = $2.80)
- Split %: `25`
- Net: `$97.20` ($100 - $2.10 processor - $0.70 user)

### Scenario 8: Test Crypto Cashout

**Steps:**
1. Navigate to Transaction Ledger
2. Click "Paying" button
3. Fill:
   - Entity type: `customer`
   - Customer: Select customer
   - Transaction type: `Crypto cashout (to customer)`
   - Gross: `100.00`
   - Processor: `Test-Crypto-Percentage`

**Expected Results:**
- Processor fields render same as cash-in
- Fee calculates: `3.50`
- Split %: `25`
- Can commit transaction
- Success chip appears

### Scenario 9: Test Check Payment Type

**Prerequisites:** Check processor created (see Setup)

**Steps:**
1. Create Receiving transaction
2. Transaction type: `Check payment (customer)`
3. Fill Gross: `100.00`
4. Select Processor: `Test-Check-Processor`

**Expected Results:**
- All processor fields work same as crypto
- Fee: `1.50` (fixed amount)
- Split %: `30`
- Transaction commits successfully

### Scenario 10: Conditional Field Rendering

**Steps:**
1. Create new Receiving transaction
2. Select transaction type: `Payment (customer)` (regular payment, not crypto)
3. Observe fields

**Expected Results:**
- Processor fields DO NOT appear
- Only standard payment fields show
- Grid shows normal payment columns only

**Then:**
4. Change transaction type to: `Crypto payment (customer)`

**Expected Results:**
- Processor fields APPEAR
- Gross, Processor, Fee, Split %, Net columns now visible

## Common Issues

### Processor fields not showing

**Cause:** Transaction type is not a processor-enabled type  
**Check:** Transaction type must be one of:
- `crypto_payment_in`
- `crypto_cashout`
- `check_payment_in`

### Fee not auto-calculating

**Cause:** Missing gross amount or processor not selected  
**Fix:** Ensure both Gross and Processor fields are filled

### Net amount seems wrong

**Cause:** Separate rounding steps can cause small discrepancies  
**Expected:** Net values may vary by $0.01-$0.26 due to rounding  
**Acceptable range for $100 at 3.5% / 25% split:** $96.49 - $96.75

### Processor totals not updating

**Cause:** Transaction not committed or cache not invalidated  
**Fix:** 
1. Verify transaction status is `posted`
2. Refresh processors view (navigate away and back)
3. Check browser console for errors

### Controlled/uncontrolled input warnings

**Status:** Fixed in commit following QA run  
**Issue:** Input value prop was switching from defined to undefined  
**Fix:** Added fallback empty strings to ensure consistent value types

## Browser Testing Checklist

- [ ] No console errors during normal workflow
- [ ] Fee calculations match expected formulas
- [ ] Processor totals aggregate correctly
- [ ] Success notifications appear after commits
- [ ] Grid updates after transactions
- [ ] Override values are accepted and used
- [ ] Conditional rendering works (fields show/hide correctly)
- [ ] All processor types work (crypto, check)
- [ ] All fee types work (percentage, fixed, hybrid)
- [ ] Both directions work (receiving, paying)

## Automation Notes

For automated QA agents using Playwright:

**Login:**
```javascript
await page.goto('http://localhost:5173');
await page.getByLabel('Email').fill('owner@terpagro.local');
await page.getByLabel('Password').fill('<password>');
await page.getByRole('button', { name: 'Sign in' }).click();
```

**Navigate to Processors:**
```javascript
// Wait for sidebar to load
await page.waitForSelector('nav');
// Click Processors link (use text match, not URL)
await page.getByRole('button', { name: 'Processors' }).click();
// OR if using getByText:
await page.getByText('Processors').click();
```

**Select processor from dropdown:**
```javascript
await page.locator('select').filter({ hasText: 'Choose processor' }).selectOption({ label: 'Test-Crypto-Percentage' });
```

**Fill gross amount:**
```javascript
await page.getByPlaceholder('Gross').fill('100.00');
```

**Get calculated fee value:**
```javascript
const feeValue = await page.getByPlaceholder('Fee').inputValue();
```

## Success Criteria

All tests pass when:

✅ Can create processors via UI  
✅ Processors display correctly in grid  
✅ Fee auto-calculates correctly for all fee types  
✅ Split % auto-fills from processor defaults  
✅ Net amount calculates correctly  
✅ Can override fee values  
✅ Can override split %  
✅ Transactions commit successfully  
✅ Processor totals update after transactions  
✅ No console errors during workflows  
✅ Conditional fields render/hide correctly  

## Related Files

- Implementation: `/src/client/components/QuickLedgerGrid.tsx`
- Processor View: `/src/client/views/ProcessorsView.tsx`
- Backend Logic: `/src/server/services/processorCommands.ts`
- Test Script: `/scripts/create-test-processor.ts`
- E2E Tests: `/tests/e2e/processor-transactions.spec.ts`
- Feature Docs: `/docs/features/payment-processors.md`
