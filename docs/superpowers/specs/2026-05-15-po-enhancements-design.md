# Purchase Orders Enhancements Design

**Date:** 2026-05-15  
**Status:** Approved  
**Implementation Order:** Sequential (F1 → F2 → F3 → F4 → F5)

## Executive Summary

Five integrated enhancements to improve the Purchase Orders authoring workflow:

1. **Vendor Context Side Drawer** - Tabbed drawer with context, quick adds, and historical POs
2. **Cost Range Dual-Input** - Support vendor quote ranges with mutual exclusivity (builds on mini's COGS range work)
3. **Payment Terms Dropdown** - Explicit terms selection replacing "Vendor terms" string
4. **Partial Upfront Payments** - Prepayment capture with full accounting integration
5. **PO Finalization Workflow** - New status between draft and approved with vendor receipt preview

## Background

User feedback from live UI review identified these gaps in the current PO authoring flow:
- Vendor context is inline (should be drawer with tabs)
- Single unit cost field (vendors often quote ranges)
- Generic "Vendor terms" display (operators need explicit control)
- No prepayment support (common in cannabis wholesale)
- Direct draft→approved jump (operators need review/finalize step)

Mac mini implemented comprehensive COGS range resolution for sales orders (commit 467f299) with `src/shared/priceRange.ts` utility. Feature 2 reuses this parser logic for PO cost ranges.

---

## Feature 1: Vendor Context Side Drawer

### Current State
- Vendor context displays as inline `<aside>` panel in PurchaseOrdersView
- Shows: total payable, open bills, payments, prior POs
- Historical quick adds shown inline below metrics

### Goal
Move vendor context to expandable side drawer with tabbed organization for better space utilization and feature segregation.

### Architecture

**Component Structure:**
```
VendorContextDrawer.tsx (new)
├─ Drawer shell (slide-in from right, 400px width)
├─ Header: Vendor name + close button
├─ Tabs: Context | Quick Adds | Historical POs
└─ Tab content panels
```

**Trigger:**
- Button next to vendor dropdown: `[Vendor: Acme Corp ▼] [Context →]`
- Button only enabled when vendor selected
- Local state in PurchaseOrdersView: `vendorDrawerOpen: boolean`

**Tab Contents:**

**Context Tab:**
- Total payable amount (formatted currency)
- Open bills count
- Payments count
- Prior POs count
- Vendor terms (days)
- Contact info
- Internal notes (vendor.notes)

**Quick Adds Tab:**
- Historical products from this vendor's PO lines
- Grouped by product name, shows:
  - Product name
  - Last unit cost OR cost range (when implemented)
  - Category
  - UOM
  - Last ordered date
- Click product → adds new line to current PO with pre-filled values
- Sorted by frequency desc, then recency desc
- Empty state: "No reusable vendor history yet."

**Historical POs Tab:**
- Table of past POs with this vendor
- Columns: PO#, Date, Total, Status
- Click row → modal with PO details (read-only)
- Sorted by created_at desc
- Pagination: 20 per page

### Data Flow

**Existing query reuse:**
- `vendorRelationship` query already fetches vendor, bills, payments, POs
- Extend with historical products aggregation:

```typescript
// In queries.ts
const historicalProducts = await tx
  .select({
    productName: purchaseOrderLines.productName,
    category: purchaseOrderLines.category,
    uom: purchaseOrderLines.uom,
    unitCost: purchaseOrderLines.unitCost,
    costRangeLow: purchaseOrderLines.costRangeLow, // when F2 implemented
    costRangeHigh: purchaseOrderLines.costRangeHigh,
    lastOrdered: max(purchaseOrders.createdAt),
    orderCount: count()
  })
  .from(purchaseOrderLines)
  .innerJoin(purchaseOrders, eq(purchaseOrderLines.purchaseOrderId, purchaseOrders.id))
  .where(and(
    eq(purchaseOrders.vendorId, vendorId),
    inArray(purchaseOrders.status, ['approved', 'ordered', 'received'])
  ))
  .groupBy(
    purchaseOrderLines.productName,
    purchaseOrderLines.category,
    purchaseOrderLines.uom,
    purchaseOrderLines.unitCost,
    purchaseOrderLines.costRangeLow,
    purchaseOrderLines.costRangeHigh
  )
  .orderBy(desc(count()), desc(max(purchaseOrders.createdAt)))
  .limit(50);
```

**Quick add action:**
- Client: `addPurchaseOrderLine` command with pre-filled payload
- Server: Standard validation, create new line on current draft PO

### UI Styling
- Drawer: `position: fixed`, `right: 0`, `top: 0`, `height: 100vh`, `width: 400px`
- Slide animation: CSS transition on `transform: translateX()`
- Overlay: Semi-transparent backdrop, closes drawer on click
- Tabs: Horizontal tab bar below header
- Content: Scrollable panel with padding

### Testing
- **Unit:** Drawer open/close state, tab switching
- **Integration:** Historical products query returns correct data
- **E2E:** Open drawer → switch tabs → quick add → verify line added to grid

---

## Feature 2: Cost Range Dual-Input

### Current State
- PO lines have single `unitCost` numeric field
- Vendors often provide quote ranges (e.g., "$1200-$1500/lb depending on test results")
- Operators forced to pick one value or use notes field

### Goal
Support cost ranges with proper validation and mutual exclusivity with fixed unit cost.

### Architecture

**Database Schema:**
```sql
-- migrations/0010_po_cost_range.sql
ALTER TABLE purchase_order_lines
  ADD COLUMN IF NOT EXISTS cost_range_low numeric(12, 2),
  ADD COLUMN IF NOT EXISTS cost_range_high numeric(12, 2);

-- Constraint: unitCost XOR (costRangeLow && costRangeHigh)
ALTER TABLE purchase_order_lines
  ADD CONSTRAINT po_line_cost_exclusivity 
  CHECK (
    (unit_cost > 0 AND cost_range_low IS NULL AND cost_range_high IS NULL)
    OR
    (unit_cost = 0 AND cost_range_low > 0 AND cost_range_high > 0 AND cost_range_low <= cost_range_high)
  );
```

**Reuse Mini's Price Range Utility:**

Mini's commit 467f299 created `src/shared/priceRange.ts` with:
- `parsePriceRange(raw: string)` - parses "low-high" format
- `isPriceRangeWellFormed(raw: string)` - validation
- `pickFromRange(raw: string, basis: LandedCostBasis)` - pick low/mid/high

For PO lines, we adapt the logic:
- Mini's work: Single `price_range` varchar field (e.g., "1200-1500")
- PO lines: Separate `cost_range_low` and `cost_range_high` numeric fields
- Validation: Ensure low <= high, both positive or both null

**Shared validation function:**
```typescript
// Add to src/shared/priceRange.ts
export function validateCostRange(low: number | null, high: number | null): boolean {
  if (low === null && high === null) return true; // No range
  if (low === null || high === null) return false; // Partial range invalid
  if (low < 0 || high < 0) return false;
  if (low > high) return false;
  return true;
}
```

### UI Changes

**Grid Columns:**

Replace single "Unit cost" column with compound column:
- **Column header:** "Unit Cost / Range"
- **Cell renderer:**
  - If `unitCost > 0`: Show single editable input
  - If `costRangeLow && costRangeHigh`: Show two inputs side-by-side with separator
  - Example: `[$1200] - [$1500]` (both editable)

**Cost Mode Toggle:**

Add toggle in PO line editing:
- Radio buttons: `( ) Fixed cost  ( ) Cost range`
- Switching modes:
  - Fixed → Range: Clear `unitCost`, enable range inputs
  - Range → Fixed: Clear range fields, enable `unitCost` input

**Quick Adds Integration:**

When F1 implemented, Quick Adds display:
- Fixed cost: "Last: $1,200"
- Cost range: "Last: $1,200-$1,500"

### Backend Logic

**Command Updates:**

`addPurchaseOrderLine`:
```typescript
payload: {
  purchaseOrderId: string;
  productName: string;
  category: string;
  qty: number;
  uom: string;
  // Cost: either unitCost OR range (validated by Zod)
  unitCost?: number;
  costRangeLow?: number;
  costRangeHigh?: number;
}

// Validation
const schema = z.object({
  // ... other fields
  unitCost: z.number().positive().optional(),
  costRangeLow: z.number().positive().optional(),
  costRangeHigh: z.number().positive().optional()
}).refine(
  (data) => {
    const hasFixed = data.unitCost != null && data.unitCost > 0;
    const hasRange = data.costRangeLow != null && data.costRangeHigh != null;
    return hasFixed !== hasRange; // XOR
  },
  { message: "Must provide either unitCost or costRange, not both" }
).refine(
  (data) => {
    if (data.costRangeLow != null && data.costRangeHigh != null) {
      return data.costRangeLow <= data.costRangeHigh;
    }
    return true;
  },
  { message: "Cost range low must be <= high" }
);
```

`updatePurchaseOrderLine`:
- Allow switching between fixed and range modes
- Clearing opposite fields when switching

**Total Calculation:**

`recalcPurchaseOrder` needs to handle ranges:
```typescript
const lineTotal = (line: PurchaseOrderLine) => {
  if (line.unitCost > 0) {
    return Number(line.qty) * Number(line.unitCost);
  }
  if (line.costRangeLow != null && line.costRangeHigh != null) {
    // Use midpoint for estimate
    const midpoint = (Number(line.costRangeLow) + Number(line.costRangeHigh)) / 2;
    return Number(line.qty) * midpoint;
  }
  return 0;
};

const total = lines.reduce((sum, line) => sum + lineTotal(line), 0);
```

**Validation on Approve:**

`approvePurchaseOrder`:
- Block if any line has neither `unitCost` nor valid range
- Warning if ranges are wide (> 20% spread)

### Testing

**Unit Tests:**
- `validateCostRange()` with edge cases (null, negative, low > high)
- XOR validation in Zod schema
- Total calculation with mixed fixed/range lines

**Integration Tests:**
- Create PO line with range
- Switch from fixed to range
- Approve PO with range lines

**E2E Playwright:**
```typescript
test('cost range flow', async ({ page }) => {
  // Login, navigate to PO view
  await page.click('[data-test="add-po-line"]');
  
  // Select "Cost range" mode
  await page.click('input[value="cost_range"]');
  
  // Enter range
  await page.fill('[data-test="cost-range-low"]', '1200');
  await page.fill('[data-test="cost-range-high"]', '1500');
  
  // Verify midpoint used in total
  await expect(page.locator('[data-test="line-total"]')).toContainText('$1,350');
  
  // Try invalid range (low > high)
  await page.fill('[data-test="cost-range-low"]', '1500');
  await page.fill('[data-test="cost-range-high"]', '1200');
  await expect(page.locator('[data-test="validation-error"]'))
    .toContainText('Cost range low must be <= high');
});
```

---

## Feature 3: Payment Terms Dropdown

### Current State
- PO grid shows "Payment terms" column with static "Vendor terms" string
- No explicit control over payment terms per PO
- Uses `vendor.termsDays` implicitly (e.g., 14 days)

### Goal
Explicit payment terms selection per PO with standard options, defaulting to vendor's terms.

### Architecture

**Database Schema:**
```sql
-- migrations/0011_po_payment_terms.sql
ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS payment_terms varchar(32) NOT NULL DEFAULT 'vendor_terms';

-- Migrate existing rows
UPDATE purchase_orders
SET payment_terms = 'vendor_terms'
WHERE payment_terms IS NULL;
```

**Payment Terms Enum:**
```typescript
// src/shared/types.ts
export type PaymentTerms =
  | 'cod'           // Cash on Delivery
  | 'prepay'        // Prepayment required (100% upfront)
  | 'net_15'        // Net 15 days
  | 'net_30'        // Net 30 days
  | 'net_60'        // Net 60 days
  | 'net_90'        // Net 90 days
  | 'consignment'   // Consignment (existing vendor.consignmentDefault)
  | 'vendor_terms'; // Use vendor's default termsDays

export const PAYMENT_TERMS_LABELS: Record<PaymentTerms, string> = {
  cod: 'COD (Cash on Delivery)',
  prepay: 'Prepayment Required',
  net_15: 'Net 15 Days',
  net_30: 'Net 30 Days',
  net_60: 'Net 60 Days',
  net_90: 'Net 90 Days',
  consignment: 'Consignment',
  vendor_terms: 'Vendor Terms'
};
```

### UI Changes

**Grid Column:**
- Replace static "Vendor terms" cell with dropdown
- Options: All `PaymentTerms` values
- Display logic:
  - If `'vendor_terms'`: Show "Vendor Terms (Net XX days)" based on `vendor.termsDays`
  - If explicit term: Show label (e.g., "Net 30 Days")
- Editable on draft/finalized POs, read-only after approved

**Vendor Context Drawer (F1):**
- Context tab shows vendor's default: "Terms: Net 14 days"

### Backend Logic

**Command Updates:**

`createPurchaseOrder`:
```typescript
payload: {
  vendorId: string;
  expectedDate?: Date;
  paymentTerms?: PaymentTerms; // Optional, defaults to 'vendor_terms'
}
```

`updatePurchaseOrder`:
- Accept `paymentTerms` field
- Validation: Must be valid enum value
- Can only update on draft/finalized POs

**Bill Due Date Calculation:**

When creating vendor bill (in `receivePurchaseOrder` or later bill creation):
```typescript
function calculateDueDate(
  po: PurchaseOrder,
  vendor: Vendor,
  billDate: Date
): Date {
  let days: number;
  
  switch (po.paymentTerms) {
    case 'cod':
      days = 0;
      break;
    case 'prepay':
      days = 0; // Already paid
      break;
    case 'net_15':
      days = 15;
      break;
    case 'net_30':
      days = 30;
      break;
    case 'net_60':
      days = 60;
      break;
    case 'net_90':
      days = 90;
      break;
    case 'consignment':
      days = vendor.termsDays; // or special consignment logic
      break;
    case 'vendor_terms':
    default:
      days = vendor.termsDays;
      break;
  }
  
  return addDays(billDate, days);
}
```

### Data Migration

**Seed Update:**

Update `src/server/seed.ts` and `src/server/realisticSeed.ts`:
- Set `paymentTerms: 'vendor_terms'` on new POs
- Vary terms in realistic seed: 70% vendor_terms, 20% net_30, 10% split among others

### Testing

**Unit Tests:**
- Enum validation
- Due date calculation for each term type

**Integration Tests:**
- Create PO with explicit payment terms
- Update payment terms on draft PO
- Verify bill due date matches term

**E2E Playwright:**
```typescript
test('payment terms flow', async ({ page }) => {
  // Create PO with Net 30
  await selectVendor(page, 'Acme Corp');
  await page.selectOption('[data-test="payment-terms"]', 'net_30');
  await addPOLine(page);
  await finalizePO(page);
  await approvePO(page);
  
  // Receive and check bill due date
  await receivePO(page);
  await navigateTo(page, 'vendor-bills');
  
  // Bill created today should be due in 30 days
  const dueDate = await page.locator('[data-test="bill-due-date"]').textContent();
  expect(parseDueDate(dueDate)).toEqual(addDays(new Date(), 30));
});
```

---

## Feature 4: Partial Upfront Payments

### Current State
- No support for prepayments on POs
- Full payment expected after delivery
- Cannabis wholesale often requires deposits (e.g., 50% upfront for large orders)

### Goal
Capture prepayment amount on PO, create accounting entries, reduce vendor bill by prepaid amount.

### Architecture

**Database Schema:**
```sql
-- migrations/0012_po_prepayments.sql
ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS prepayment_amount numeric(12, 2) NOT NULL DEFAULT 0;

-- Link vendor payments to POs for prepayments
ALTER TABLE vendor_payments
  ADD COLUMN IF NOT EXISTS purchase_order_id uuid REFERENCES purchase_orders(id);

-- Add index for prepayment lookups
CREATE INDEX IF NOT EXISTS vendor_payments_po_idx 
  ON vendor_payments(purchase_order_id)
  WHERE purchase_order_id IS NOT NULL;
```

**Prepayment Workflow:**

1. **Draft PO:** Operator enters `prepaymentAmount` (optional, defaults to 0)
2. **Finalize PO (F5):** Prepayment shown in finalization summary
3. **Approve PO:** If `prepaymentAmount > 0`, prompt operator to record prepayment payment
4. **Record Prepayment:** New command `recordVendorPrepayment` creates vendor payment linked to PO
5. **Receive PO:** Generate vendor bill with `amount = total - prepaymentAmount`
6. **Vendor Ledger:** Show prepayment as distinct entry

### New Command: recordVendorPrepayment

```typescript
// src/shared/commandCatalog.ts
{
  name: 'recordVendorPrepayment',
  label: 'Record Vendor Prepayment',
  roles: ['owner', 'manager'],
  payload: z.object({
    purchaseOrderId: z.string().uuid(),
    amount: z.number().positive(),
    method: z.enum(['cash', 'check', 'wire', 'ach']),
    reference: z.string().optional(),
    notes: z.string().optional()
  })
}
```

**Command Implementation:**
```typescript
async function recordVendorPrepayment(
  tx: Tx,
  payload: Payload,
  commandId: string
): Promise<CommandResult> {
  const { purchaseOrderId, amount, method, reference, notes } = payload;
  
  // Validate PO exists and is approved
  const [po] = await tx
    .select()
    .from(purchaseOrders)
    .where(eq(purchaseOrders.id, purchaseOrderId))
    .limit(1);
  
  if (!po) throw new Error('Purchase order not found');
  if (po.status !== 'approved') {
    throw new Error('Prepayment can only be recorded on approved POs');
  }
  if (amount > Number(po.prepaymentAmount)) {
    throw new Error(`Prepayment amount cannot exceed ${po.prepaymentAmount}`);
  }
  
  // Check if prepayment already recorded
  const existing = await tx
    .select()
    .from(vendorPayments)
    .where(eq(vendorPayments.purchaseOrderId, purchaseOrderId))
    .limit(1);
  
  if (existing.length > 0) {
    throw new Error('Prepayment already recorded for this PO');
  }
  
  // Create vendor payment record
  const [payment] = await tx
    .insert(vendorPayments)
    .values({
      vendorBillId: null, // Not linked to bill yet
      purchaseOrderId,
      amount: String(amount),
      method,
      reference: reference || `PO ${po.poNo} prepayment`,
      status: 'posted',
      createdAt: new Date()
    })
    .returning();
  
  // Journal entry (money out)
  await appendJSONLJournal(commandId, 'vendor_prepayment', {
    purchaseOrderId,
    vendorId: po.vendorId,
    amount,
    method,
    reference
  });
  
  return {
    success: true,
    affectedIds: [purchaseOrderId, payment.id],
    toast: `Prepayment of $${amount} recorded for PO ${po.poNo}`
  };
}
```

### Bill Generation Integration

**Update `receivePurchaseOrder` bill creation logic:**

```typescript
// When creating vendor bill after receiving PO
const prepaymentAmount = Number(po.prepaymentAmount) || 0;
const billAmount = Number(po.total) - prepaymentAmount;

if (billAmount <= 0) {
  // Fully prepaid, no bill needed (or create $0 bill for record-keeping)
  return;
}

const [bill] = await tx
  .insert(vendorBills)
  .values({
    vendorId: po.vendorId,
    purchaseOrderId: po.id,
    purchaseReceiptId: receipt.id,
    billNo: code('BILL'),
    amount: String(billAmount),
    amountPaid: '0',
    dueDate: calculateDueDate(po, vendor, new Date()),
    status: 'open',
    termsDays: getTermsDays(po.paymentTerms, vendor.termsDays),
    createdAt: new Date(),
    updatedAt: new Date()
  })
  .returning();

// Link prepayment to bill if exists
if (prepaymentAmount > 0) {
  await tx
    .update(vendorPayments)
    .set({ vendorBillId: bill.id })
    .where(eq(vendorPayments.purchaseOrderId, po.id));
}
```

### UI Changes

**PO Grid:**
- Add "Prepayment" column (editable on draft/finalized)
- Format as currency
- Validation: `0 <= prepayment <= total`

**Finalization View (F5):**
- Show prepayment in summary:
  ```
  Subtotal:    $15,000.00
  Prepayment:  -$7,500.00
  Amount Due:   $7,500.00
  ```

**After Approval:**
- If `prepaymentAmount > 0` and no prepayment payment recorded:
  - Show banner: "Record prepayment of $X for this PO"
  - Button: "Record Prepayment" → opens payment modal

**Vendor Bills View:**
- Bill shows: `Total: $15,000, Prepaid: $7,500, Due: $7,500`
- Linked prepayment payment shows in vendor ledger

**Vendor Context Drawer (F1):**
- Context tab shows: "Prepayments: $X across Y POs"

### Accounting Integration

**Vendor Ledger Entries:**

Prepayment creates ledger entry:
```
Type: Prepayment
PO: PO-001
Amount: -$7,500.00 (money out)
Method: Wire
Reference: "PO PO-001 prepayment"
```

When bill is created and linked:
```
Type: Bill
Bill#: BILL-001
PO: PO-001
Amount: $7,500.00
Amount Paid: $0.00
Due: 2026-06-15
Prepayment Applied: $7,500.00
```

### Testing

**Unit Tests:**
- Prepayment validation (0 <= amount <= total)
- Bill amount calculation with prepayment
- Prepayment already recorded check

**Integration Tests:**
- Create PO with prepayment
- Approve → record prepayment → verify payment record
- Receive → verify bill amount = total - prepayment
- Verify vendor ledger entries

**E2E Playwright:**
```typescript
test('prepayment flow', async ({ page }) => {
  // Create PO with prepayment
  await createPO(page, { vendor: 'Acme Corp', total: 15000 });
  await page.fill('[data-test="prepayment-amount"]', '7500');
  await finalizePO(page);
  await approvePO(page);
  
  // Record prepayment
  await page.click('[data-test="record-prepayment"]');
  await page.selectOption('[data-test="payment-method"]', 'wire');
  await page.fill('[data-test="payment-reference"]', 'Wire 123456');
  await page.click('[data-test="submit-payment"]');
  
  // Verify prepayment recorded
  await expect(page.locator('[data-test="prepayment-status"]'))
    .toContainText('Prepayment recorded');
  
  // Receive PO and check bill
  await receivePO(page);
  await navigateTo(page, 'vendor-bills');
  await expect(page.locator('[data-test="bill-amount"]'))
    .toContainText('$7,500.00'); // Total - prepayment
});
```

---

## Feature 5: PO Finalization Workflow Step

### Current State
- PO status: `draft` → `approved` (single step)
- No intermediate review step
- Operators cannot preview vendor-facing receipt before approval
- Notes field is ambiguous (internal or vendor-visible?)

### Goal
Add `finalized` status between `draft` and `approved`, with vendor receipt preview and clear notes separation.

### Architecture

**Database Schema:**
```sql
-- migrations/0013_po_finalization.sql
ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS finalized_at timestamptz,
  ADD COLUMN IF NOT EXISTS external_notes text;

-- Rename buyerNotes to internalNotes for clarity (optional migration)
-- ALTER TABLE purchase_orders RENAME COLUMN buyer_notes TO internal_notes;

ALTER TABLE purchase_order_lines
  ADD COLUMN IF NOT EXISTS internal_notes text,
  ADD COLUMN IF NOT EXISTS external_notes text;
```

**Notes Architecture:**

**Internal Notes** (not vendor-visible):
- `purchase_orders.internalNotes` (existing field, currently `buyerNotes`)
- `purchase_order_lines.internal_notes` (new)
- Use: Operator notes, pricing strategy, sourcing context
- Color: Gray background in UI

**External Notes** (vendor-visible):
- `purchase_orders.external_notes` (new)
- `purchase_order_lines.external_notes` (new)
- Use: Packaging instructions, quality requirements, delivery notes
- Color: Blue background in UI, appears on vendor receipt

### Status State Machine

```
draft → finalized → approved → ordered → received
  ↓         ↓
cancelled cancelled
```

**Transitions:**
- `draft → finalized`: `finalizePurchaseOrder` command
- `finalized → draft`: `unfinalizePurchaseOrder` command (back to editing)
- `finalized → approved`: `approvePurchaseOrder` command (existing, updated)
- `draft → cancelled`: `cancelPurchaseOrder` command (existing)
- `finalized → cancelled`: `cancelPurchaseOrder` command (existing)

**Validation:**
- Can only finalize if:
  - At least one line exists
  - All lines have valid product name, qty, uom
  - All lines have either unitCost or valid costRange (F2)
  - Vendor selected
- Can only approve from `finalized` status (not directly from `draft`)

### New Commands

**finalizePurchaseOrder:**
```typescript
{
  name: 'finalizePurchaseOrder',
  label: 'Finalize Purchase Order',
  roles: ['owner', 'manager', 'operator'],
  payload: z.object({
    purchaseOrderId: z.string().uuid()
  })
}

async function finalizePurchaseOrder(
  tx: Tx,
  payload: Payload,
  userId: string,
  commandId: string
): Promise<CommandResult> {
  const purchaseOrderId = requiredId(payload.purchaseOrderId);
  
  const [order] = await tx
    .select()
    .from(purchaseOrders)
    .where(eq(purchaseOrders.id, purchaseOrderId))
    .limit(1);
  
  if (!order) throw new Error('Purchase order not found');
  if (order.status !== 'draft') {
    throw new Error('Only draft POs can be finalized');
  }
  
  // Same validation as approve
  const lines = await tx
    .select()
    .from(purchaseOrderLines)
    .where(eq(purchaseOrderLines.purchaseOrderId, purchaseOrderId));
  
  if (!lines.length) {
    throw new Error('Add at least one product line before finalizing');
  }
  
  const issues = lines.flatMap((line) =>
    purchaseOrderLineIssues(line).map((issue) => `${line.productName}: ${issue}`)
  );
  
  if (issues.length) throw new Error(issues.join('; '));
  
  // Update status
  await tx
    .update(purchaseOrders)
    .set({
      status: 'finalized',
      finalizedAt: new Date(),
      updatedAt: new Date()
    })
    .where(eq(purchaseOrders.id, purchaseOrderId));
  
  return {
    success: true,
    affectedIds: [purchaseOrderId],
    toast: `PO ${order.poNo} finalized and ready for approval`
  };
}
```

**unfinalizePurchaseOrder:**
```typescript
{
  name: 'unfinalizePurchaseOrder',
  label: 'Back to Draft',
  roles: ['owner', 'manager', 'operator'],
  payload: z.object({
    purchaseOrderId: z.string().uuid()
  })
}

async function unfinalizePurchaseOrder(
  tx: Tx,
  payload: Payload,
  commandId: string
): Promise<CommandResult> {
  const purchaseOrderId = requiredId(payload.purchaseOrderId);
  
  const [order] = await tx
    .select()
    .from(purchaseOrders)
    .where(eq(purchaseOrders.id, purchaseOrderId))
    .limit(1);
  
  if (!order) throw new Error('Purchase order not found');
  if (order.status !== 'finalized') {
    throw new Error('Only finalized POs can be sent back to draft');
  }
  
  await tx
    .update(purchaseOrders)
    .set({
      status: 'draft',
      finalizedAt: null,
      updatedAt: new Date()
    })
    .where(eq(purchaseOrders.id, purchaseOrderId));
  
  return {
    success: true,
    affectedIds: [purchaseOrderId],
    toast: `PO ${order.poNo} returned to draft`
  };
}
```

**Update approvePurchaseOrder:**
```typescript
// Change validation to require finalized status
if (order.status !== 'finalized') {
  throw new Error('Purchase order must be finalized before approval');
}
```

### Finalization View UI

**Component:** `POFinalizationModal.tsx` (new)

**Trigger:**
- Button in PO grid actions: "Finalize PO" (when status = draft)
- Opens full-screen modal (or drawer, depending on design preference)

**Layout:**

```
┌─────────────────────────────────────────────────┐
│ [← Back to Draft]     PO-001 Finalization [X]   │
├─────────────────────────────────────────────────┤
│                                                 │
│  Vendor Receipt Preview                         │
│                                                 │
│  To: Acme Corporation                           │
│  Contact: John Doe (555-1234)                   │
│  PO Number: PO-001                              │
│  Date: 2026-05-15                               │
│  Payment Terms: Net 30 Days                     │
│  Expected Delivery: 2026-05-22                  │
│                                                 │
│  ┌───────────────────────────────────────────┐ │
│  │ Product      │ Qty │ Cost │ Total │ Notes │ │
│  ├──────────────┼─────┼──────┼───────┼───────┤ │
│  │ Blue Dream   │ 10  │$1200 │$12000 │ [ext] │ │
│  │ OG Kush      │ 5   │$1400 │$7000  │       │ │
│  └───────────────────────────────────────────┘ │
│                                                 │
│  Subtotal:          $19,000.00                  │
│  Prepayment:        -$9,500.00                  │
│  Amount Due:         $9,500.00                  │
│                                                 │
│  External Notes:                                │
│  ┌─────────────────────────────────────────┐   │
│  │ [Editable text area]                    │   │
│  └─────────────────────────────────────────┘   │
│                                                 │
│  Internal Notes:                                │
│  ┌─────────────────────────────────────────┐   │
│  │ [Editable text area - gray background]  │   │
│  └─────────────────────────────────────────┘   │
│                                                 │
│         [Back to Draft]  [Approve PO →]         │
└─────────────────────────────────────────────────┘
```

**Editable Fields in Finalization:**
- Line-level: Unit cost/range, external notes
- Header-level: Payment terms, prepayment, external notes, internal notes
- **Not editable:** Product names, quantities, UOMs (require going back to draft)

**Actions:**
- **Back to Draft:** Calls `unfinalizePurchaseOrder`, returns to PO grid
- **Approve PO:** Calls `approvePurchaseOrder` (existing command, updated to require finalized status)

### UI Changes in PO Grid

**Button Logic:**

Current status → Available actions:
- `draft` → [Finalize PO] (replaces old "Approve" button)
- `finalized` → [Approve PO] [Back to Draft]
- `approved` → [Receive PO] [Cancel PO] (existing)

**Grid Columns:**

Add columns:
- "Internal Notes" (editable on draft/finalized)
- "External Notes" (editable on draft/finalized)
- "Finalized At" (timestamp, read-only)

**Status Badge:**
- `draft` → Gray "Draft"
- `finalized` → Blue "Finalized"
- `approved` → Green "Approved"
- `ordered` → Purple "Ordered"
- `received` → Teal "Received"

### Vendor Receipt Generation

**PDF Export (future enhancement):**

When PO is approved, generate PDF receipt:
- Include all external notes
- Exclude all internal notes
- Format as professional vendor PO
- Save to `storage/po-receipts/PO-XXX.pdf`

For this implementation, focus on browser preview; PDF generation is future work.

### Testing

**Unit Tests:**
- Status transition validation
- Notes separation (internal vs. external)
- Finalization validation (same as approve)

**Integration Tests:**
- Finalize draft PO
- Back to draft from finalized
- Approve finalized PO (succeeds)
- Try to approve draft PO (fails)

**E2E Playwright:**
```typescript
test('finalization workflow', async ({ page }) => {
  // Create draft PO
  await createDraftPO(page, { vendor: 'Acme Corp' });
  await addPOLine(page, { product: 'Blue Dream', qty: 10, cost: 1200 });
  
  // Finalize
  await page.click('[data-test="finalize-po"]');
  
  // Verify finalization view
  await expect(page.locator('[data-test="finalization-modal"]')).toBeVisible();
  await expect(page.locator('[data-test="vendor-name"]')).toContainText('Acme Corp');
  await expect(page.locator('[data-test="po-total"]')).toContainText('$12,000.00');
  
  // Add external notes
  await page.fill('[data-test="external-notes"]', 'Test results required');
  
  // Add internal notes
  await page.fill('[data-test="internal-notes"]', 'Urgent - customer waiting');
  
  // Approve
  await page.click('[data-test="approve-po"]');
  
  // Verify status updated
  await expect(page.locator('[data-test="po-status"]')).toContainText('Approved');
  
  // Verify notes saved
  await page.click('[data-test="view-po-details"]');
  await expect(page.locator('[data-test="external-notes"]'))
    .toContainText('Test results required');
  await expect(page.locator('[data-test="internal-notes"]'))
    .toContainText('Urgent - customer waiting');
});

test('back to draft flow', async ({ page }) => {
  // Finalize PO
  const poId = await finalizePO(page);
  
  // Back to draft
  await page.click('[data-test="back-to-draft"]');
  
  // Verify status
  await expect(page.locator('[data-test="po-status"]')).toContainText('Draft');
  
  // Edit and refinalize
  await page.fill('[data-test="line-qty"]', '15');
  await page.click('[data-test="finalize-po"]');
  await page.click('[data-test="approve-po"]');
  
  // Verify approved
  await expect(page.locator('[data-test="po-status"]')).toContainText('Approved');
});
```

---

## Cross-Feature Integration

### Feature Dependencies

**F1 (Drawer) → F2 (Cost Range):**
- Quick Adds tab displays cost ranges when available
- Format: "Blue Dream - $1,200" or "Blue Dream - $1,200-$1,500"

**F1 (Drawer) + F4 (Prepayments):**
- Context tab shows vendor prepayment history
- Metric: "Prepayments: $X across Y POs"

**F2 (Cost Range) → F5 (Finalization):**
- Finalization view shows ranges in vendor receipt
- Editable in finalization (can adjust range before approve)

**F3 (Payment Terms) → F4 (Prepayments):**
- If payment terms = 'prepay', require prepaymentAmount = total
- If payment terms = 'cod', prepayment typically 0

**F3 (Payment Terms) → F5 (Finalization):**
- Payment terms shown in finalization receipt
- Editable in finalization view

**F4 (Prepayments) → F5 (Finalization):**
- Finalization view shows prepayment and calculates amount due
- After approve, prompt to record prepayment if > 0

### Blast Radius Analysis

**Database:**
- 4 new migrations (F2, F3, F4, F5)
- 9 new columns across 3 tables
- 1 new constraint (cost exclusivity)
- 1 new index (vendor_payments.purchase_order_id)

**Schema Types:**
- Regenerate Drizzle types after each migration
- New TypeScript types: `PaymentTerms`, `LandedCostBasis` (reuse from mini)

**Backend:**
- 3 new commands: `finalizePurchaseOrder`, `unfinalizePurchaseOrder`, `recordVendorPrepayment`
- Update 4 existing commands: `addPurchaseOrderLine`, `updatePurchaseOrderLine`, `approvePurchaseOrder`, `receivePurchaseOrder`
- New utility: `calculateDueDate()`, `getTermsDays()`
- Extend `recalcPurchaseOrder` for ranges and prepayments

**Frontend:**
- 2 new components: `VendorContextDrawer.tsx`, `POFinalizationModal.tsx`
- Update `PurchaseOrdersView.tsx`: Drawer trigger, finalization flow
- Update `OperatorGrid.tsx`: Cost range cell renderer, payment terms dropdown, notes columns
- New grid columns: Internal Notes, External Notes, Prepayment, Cost Range Low/High, Finalized At

**Queries:**
- Extend `vendorRelationship` with historical products
- New query for prepayment history (vendor context drawer)

**Accounting:**
- Vendor prepayment journal entries
- Vendor bill amount calculation (subtract prepayment)
- Vendor ledger display (show prepayments)

**Tests:**
- 5 E2E test suites (one per feature)
- 15+ unit tests (validations, utilities)
- 10+ integration tests (commands, queries)

---

## Implementation Plan

### Phase 1: Feature 1 - Vendor Context Side Drawer
**Complexity:** Low (UI only, no schema changes)  
**Estimated effort:** 2-3 hours

**Tasks:**
1. Create `VendorContextDrawer.tsx` component
2. Extend `vendorRelationship` query with historical products
3. Add drawer trigger button in `PurchaseOrdersView`
4. Implement tabs (Context, Quick Adds, Historical POs)
5. Wire quick add action to `addPurchaseOrderLine`
6. E2E test: Open drawer, switch tabs, quick add

**Validation:**
- Browser QA: Open drawer, verify tabs render
- Quick add creates line with pre-filled values
- Historical products sorted by frequency

---

### Phase 2: Feature 2 - Cost Range Dual-Input
**Complexity:** Medium (schema + validation + UI)  
**Estimated effort:** 4-5 hours

**Tasks:**
1. Create migration `0010_po_cost_range.sql`
2. Run migration, regenerate schema types
3. Add `validateCostRange()` to `src/shared/priceRange.ts`
4. Update `addPurchaseOrderLine` / `updatePurchaseOrderLine` commands
5. Update `recalcPurchaseOrder` for range totals
6. Create cost range cell renderer in grid
7. Add cost mode toggle (fixed vs. range)
8. Update Quick Adds to show ranges
9. Unit tests: Validation, XOR logic, total calculation
10. E2E test: Create line with range, toggle modes, validate

**Validation:**
- Browser QA: Toggle between fixed and range
- Midpoint used in total estimate
- Constraint blocks invalid ranges (low > high)
- Quick adds show "Last: $X-$Y" format

---

### Phase 3: Feature 3 - Payment Terms Dropdown
**Complexity:** Low (schema + UI dropdown)  
**Estimated effort:** 2-3 hours

**Tasks:**
1. Create migration `0011_po_payment_terms.sql`
2. Run migration, regenerate schema types
3. Define `PaymentTerms` enum and labels in `src/shared/types.ts`
4. Create `calculateDueDate()` utility
5. Update `createPurchaseOrder` / `updatePurchaseOrder` commands
6. Replace grid cell with dropdown
7. Update vendor bill creation to use payment terms
8. Update seed data with varied terms
9. E2E test: Select term, approve, check bill due date

**Validation:**
- Browser QA: Dropdown shows all options
- "Vendor Terms" displays "(Net XX days)"
- Bill due date matches selected term

---

### Phase 4: Feature 4 - Partial Upfront Payments
**Complexity:** High (schema + accounting + workflow)  
**Estimated effort:** 6-7 hours

**Tasks:**
1. Create migration `0012_po_prepayments.sql`
2. Run migration, regenerate schema types
3. Implement `recordVendorPrepayment` command
4. Update `receivePurchaseOrder` bill creation (subtract prepayment)
5. Add prepayment grid column
6. Add prepayment to finalization view (F5 integration)
7. Create prepayment recording modal
8. Update vendor context drawer with prepayment metrics
9. Journal entry for prepayments
10. Unit tests: Prepayment validation, bill calculation
11. Integration tests: Record prepayment, link to bill
12. E2E test: Full prepayment flow

**Validation:**
- Browser QA: Add prepayment, approve, record payment
- Vendor bill = total - prepayment
- Prepayment shows in vendor ledger
- Cannot record prepayment twice

---

### Phase 5: Feature 5 - PO Finalization Workflow
**Complexity:** High (schema + workflow + UI preview)  
**Estimated effort:** 7-8 hours

**Tasks:**
1. Create migration `0013_po_finalization.sql`
2. Run migration, regenerate schema types
3. Implement `finalizePurchaseOrder` command
4. Implement `unfinalizePurchaseOrder` command
5. Update `approvePurchaseOrder` to require finalized status
6. Create `POFinalizationModal.tsx` component
7. Add internal/external notes grid columns
8. Update button logic (Finalize vs. Approve)
9. Vendor receipt preview layout
10. Editable fields in finalization
11. Unit tests: Status transitions, notes separation
12. Integration tests: Finalize, back to draft, approve
13. E2E test: Full finalization flow, notes persistence

**Validation:**
- Browser QA: Finalize PO, see preview, edit notes
- Back to draft works
- Approve from finalized succeeds
- Try to approve from draft fails
- External notes distinct from internal notes

---

## Testing Strategy

### Test Pyramid

**Unit Tests (~20 tests):**
- `validateCostRange()` edge cases
- XOR validation (fixed cost vs. range)
- Payment terms enum validation
- Due date calculation for each term
- Prepayment validation (amount <= total)
- Bill amount calculation (with prepayment)
- Status transition validation (finalization)
- Notes separation logic

**Integration Tests (~15 tests):**
- Create PO line with cost range
- Switch cost modes
- Update payment terms
- Record prepayment payment
- Link prepayment to bill
- Finalize PO command
- Back to draft command
- Approve finalized PO
- Vendor relationship query with historical products
- Prepayment history query

**E2E Playwright Tests (~8 suites):**
1. Vendor context drawer (open, tabs, quick add)
2. Cost range flow (toggle, validate, approve)
3. Payment terms flow (select, approve, verify bill)
4. Prepayment flow (add, record, verify bill)
5. Finalization flow (finalize, preview, approve)
6. Back to draft flow (finalize, edit, refinalize)
7. Notes separation (internal vs. external)
8. Full integration (all features together)

**Browser QA Checklist:**

After each feature implementation:
- [ ] Start local dev server (`pnpm dev`)
- [ ] Navigate to Purchase Orders view
- [ ] Test feature in browser (manual interaction)
- [ ] Verify data persistence (refresh page)
- [ ] Check console for errors
- [ ] Verify database state (pg admin / queries)
- [ ] Test error cases (invalid inputs, blocked actions)
- [ ] Verify toast notifications
- [ ] Check mobile responsiveness (if applicable)

---

## Rollback Strategy

Each migration is idempotent (uses `IF NOT EXISTS`) and reversible:

**F2 Rollback:**
```sql
ALTER TABLE purchase_order_lines
  DROP CONSTRAINT IF EXISTS po_line_cost_exclusivity;
ALTER TABLE purchase_order_lines
  DROP COLUMN IF EXISTS cost_range_low,
  DROP COLUMN IF EXISTS cost_range_high;
```

**F3 Rollback:**
```sql
ALTER TABLE purchase_orders
  DROP COLUMN IF EXISTS payment_terms;
```

**F4 Rollback:**
```sql
DROP INDEX IF EXISTS vendor_payments_po_idx;
ALTER TABLE vendor_payments
  DROP COLUMN IF EXISTS purchase_order_id;
ALTER TABLE purchase_orders
  DROP COLUMN IF EXISTS prepayment_amount;
```

**F5 Rollback:**
```sql
ALTER TABLE purchase_order_lines
  DROP COLUMN IF EXISTS internal_notes,
  DROP COLUMN IF EXISTS external_notes;
ALTER TABLE purchase_orders
  DROP COLUMN IF EXISTS finalized_at,
  DROP COLUMN IF EXISTS external_notes;
-- Note: Status 'finalized' may exist on rows; update to 'draft' before rollback
```

**Rollback procedure:**
1. Stop application
2. Run rollback SQL
3. Revert code changes (git revert)
4. Restart application

---

## Success Criteria

### Feature 1: Vendor Context Side Drawer
- [ ] Drawer opens on button click
- [ ] Three tabs render (Context, Quick Adds, Historical POs)
- [ ] Quick add creates PO line with pre-filled values
- [ ] Historical products sorted by frequency
- [ ] Drawer closes on overlay click

### Feature 2: Cost Range Dual-Input
- [ ] Cost mode toggle works (fixed ↔ range)
- [ ] Range inputs enforce low <= high
- [ ] Cannot save both unitCost and range
- [ ] Midpoint used in PO total estimate
- [ ] Quick adds display ranges

### Feature 3: Payment Terms Dropdown
- [ ] Dropdown shows all 8 payment terms options
- [ ] "Vendor Terms" displays vendor's days
- [ ] Selected term persists after save
- [ ] Vendor bill due date matches term
- [ ] COD sets due date to same day

### Feature 4: Partial Upfront Payments
- [ ] Prepayment field accepts 0 <= amount <= total
- [ ] Record prepayment creates vendor payment
- [ ] Vendor bill amount = total - prepayment
- [ ] Prepayment shows in vendor ledger
- [ ] Cannot record prepayment twice

### Feature 5: PO Finalization Workflow
- [ ] Draft PO has "Finalize" button
- [ ] Finalization modal shows vendor receipt preview
- [ ] Can edit notes and pricing in finalization
- [ ] "Back to Draft" returns to draft status
- [ ] "Approve" only available from finalized status
- [ ] External notes distinct from internal notes
- [ ] Status badge shows "Finalized" correctly

### Cross-Feature Integration
- [ ] Quick adds show cost ranges when present
- [ ] Finalization view shows prepayment and amount due
- [ ] Payment terms flow through to vendor bills
- [ ] All fields persist across page refresh
- [ ] No console errors during full workflow

---

## Implementation Timeline

| Feature | Estimated Effort | Cumulative |
|---------|------------------|------------|
| F1: Vendor Drawer | 2-3 hours | 2-3 hours |
| F2: Cost Range | 4-5 hours | 6-8 hours |
| F3: Payment Terms | 2-3 hours | 8-11 hours |
| F4: Prepayments | 6-7 hours | 14-18 hours |
| F5: Finalization | 7-8 hours | 21-26 hours |
| **Total** | **21-26 hours** | **~3-4 days** |

*Estimates include implementation, unit tests, integration tests, E2E tests, and browser QA per feature.*

---

## Appendix: Schema Summary

### New Tables
None (reuse existing tables)

### Modified Tables

**purchase_orders:**
- `payment_terms` varchar(32) DEFAULT 'vendor_terms' (F3)
- `prepayment_amount` numeric(12,2) DEFAULT 0 (F4)
- `finalized_at` timestamptz (F5)
- `external_notes` text (F5)

**purchase_order_lines:**
- `cost_range_low` numeric(12,2) (F2)
- `cost_range_high` numeric(12,2) (F2)
- `internal_notes` text (F5)
- `external_notes` text (F5)

**vendor_payments:**
- `purchase_order_id` uuid REFERENCES purchase_orders(id) (F4)

### New Constraints
- `po_line_cost_exclusivity` CHECK (unitCost XOR costRange) (F2)

### New Indexes
- `vendor_payments_po_idx` ON vendor_payments(purchase_order_id) (F4)

---

## Appendix: Commands Summary

### New Commands
1. `finalizePurchaseOrder` - Transition draft → finalized
2. `unfinalizePurchaseOrder` - Transition finalized → draft
3. `recordVendorPrepayment` - Create prepayment vendor payment

### Modified Commands
1. `addPurchaseOrderLine` - Accept costRangeLow/High, validate XOR
2. `updatePurchaseOrderLine` - Support cost mode switching
3. `createPurchaseOrder` - Accept paymentTerms, prepaymentAmount
4. `updatePurchaseOrder` - Allow editing paymentTerms, prepaymentAmount
5. `approvePurchaseOrder` - Require finalized status (not draft)
6. `receivePurchaseOrder` - Generate bill with prepayment subtraction
7. `recalcPurchaseOrder` - Handle range midpoints in totals

---

## Appendix: UI Components Summary

### New Components
1. `VendorContextDrawer.tsx` - Tabbed side drawer (F1)
2. `POFinalizationModal.tsx` - Full-screen vendor receipt preview (F5)

### Modified Components
1. `PurchaseOrdersView.tsx` - Drawer trigger, finalization flow
2. `OperatorGrid.tsx` - Cost range cell, payment terms dropdown, notes columns
3. `WorkspacePanel.tsx` - Button logic (Finalize vs. Approve)

### New Grid Columns
- Cost Range Low (F2)
- Cost Range High (F2)
- Payment Terms (F3)
- Prepayment (F4)
- Internal Notes (F5)
- External Notes (F5)
- Finalized At (F5)

---

**End of Design Document**
