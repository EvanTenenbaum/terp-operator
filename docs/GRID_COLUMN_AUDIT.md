# Grid Column Compliance Audit (#31)
**Date**: 2026-05-18  
**Issue**: [#31] Numbers-native ≤8-columns rule violated on 7/13 grids  
**Status**: Audit complete, fixes deferred

> **⚠️ Counts stale — pending UX-I01 re-reconciliation (UX-T04, 2026-06-12):** Column counts in this audit are from 2026-05-18 and are stale. Subsequent template waves (A1–A8, StatusActionBar adoption, fulfillment/closeout/marks, photography, media columns) added columns to multiple grids. Triage 2026-06-12 confirms: Inventory has grown from 10 to ~20 columns; PO from 11 to ~16; orders gained 3 closeout-mark columns. The per-grid keep/hide lists below should NOT be applied directly — they require a fresh reconciliation pass (UX-I01) before implementation. The findings are preserved for historical context. Re-reconcile against live `OperationsViews.tsx` column definitions before acting on any specific recommendation.

---

## Background

TERP Operator follows a "Numbers-native" UX principle where grids should display ≤8 columns by default to:
- Reduce cognitive load
- Prevent horizontal scrolling on standard displays
- Maintain data density without overwhelming users
- Encourage focused, task-oriented views

---

## Audit Methodology

1. Reviewed AG Grid column definitions across all view files
2. Counted visible columns (excluding row numbers, status pills, expansion chevrons)
3. Categorized grids as compliant (≤8) or non-compliant (>8)

---

## Findings

### ✅ COMPLIANT GRIDS (6/13)

These grids respect the 8-column rule and require no changes:

1. **Customers** (6 columns)
   - name, tags, balance, creditLimit, phone, email

2. **Invoices** (7 columns)
   - invoiceNo, customerName, date, total, amountPaid, status, dueDate

3. **Payments** (6 columns)
   - date, customerName, amount, method, unappliedAmount, status

4. **Batches** (8 columns)
   - name, productName, qty, location, status, createdAt, vendorName, cost

5. **Tags** (4 columns)
   - name, category, color, usageCount

6. **Contacts** (7 columns)
   - name, company, role, email, phone, tags, notes

---

### ❌ NON-COMPLIANT GRIDS (7/13)

These grids exceed the 8-column limit and need redesign:

#### 1. **Sales Orders** (12 columns) - WORST OFFENDER
**Current columns**:
1. orderNo
2. customerName
3. status
4. total
5. createdAt
6. confirmedAt
7. postedAt
8. lineCount
9. fulfillmentStatus
10. tags
11. notes
12. referenceNo

**Recommendation**: Default to 7 columns
- Keep: orderNo, customerName, status, total, createdAt, postedAt, lineCount
- Move to details panel: confirmedAt, fulfillmentStatus, tags, notes, referenceNo
- **Justification**: Most operators care about order identity, customer, amount, and posting status — not fulfillment granularity in the grid

---

#### 2. **Purchase Orders** (11 columns)
**Current columns**:
1. poNo
2. vendorName
3. status
4. total
5. createdAt
6. finalizedAt
7. approvedAt
8. lineCount
9. receivedQty
10. expectedQty
11. notes

**Recommendation**: Default to 7 columns
- Keep: poNo, vendorName, status, total, createdAt, lineCount, receivedQty
- Move to details: finalizedAt, approvedAt, expectedQty, notes
- **Justification**: Receiving progress (receivedQty) matters more than timestamp granularity

---

#### 3. **Inventory** (10 columns)
**Current columns**:
1. batchNo
2. productName
3. category
4. qty
5. reservedQty
6. availableQty
7. location
8. status
9. vendorName
10. costPerUnit

**Recommendation**: Default to 8 columns
- Keep: batchNo, productName, category, availableQty, location, status, vendorName, costPerUnit
- Hide: qty (redundant if availableQty shown), reservedQty (edge case, show in hover/details)
- **Justification**: Available quantity is the actionable metric; total qty is less useful for operators

---

#### 4. **Procurement Aliases** (9 columns)
**Current columns**:
1. productName
2. vendorName
3. vendorSku
4. unitCost
5. uom
6. leadTimeDays
7. moq
8. tags
9. notes

**Recommendation**: Default to 7 columns
- Keep: productName, vendorName, vendorSku, unitCost, leadTimeDays, moq, tags
- Move to hover/details: uom (usually visible in context), notes
- **Justification**: Lead time and MOQ are critical for procurement planning; notes can be shown on selection

---

#### 5. **Vendor Bills** (9 columns)
**Current columns**:
1. billNo
2. vendorName
3. amount
4. amountPaid
5. status
6. dueDate
7. createdAt
8. paidAt
9. reference

**Recommendation**: Default to 7 columns
- Keep: billNo, vendorName, amount, amountPaid, status, dueDate, createdAt
- Move to details: paidAt (redundant if status='paid'), reference
- **Justification**: Amount owed and due date are primary; payment timestamp is secondary

---

#### 6. **Fulfillment Picks** (10 columns)
**Current columns**:
1. pickNo
2. orderNo
3. customerName
4. status
5. pickQty
6. packedQty
7. shippedQty
8. createdAt
9. shippedAt
10. notes

**Recommendation**: Default to 7 columns
- Keep: pickNo, orderNo, customerName, status, pickQty, packedQty, shippedAt
- Move to details: shippedQty (if status='shipped', qty is known), createdAt, notes
- **Justification**: Pick and pack progress are critical; shipped qty is redundant once status='shipped'

---

#### 7. **Matchmaking** (11 columns) - COMPLEX
**Current columns** (customer needs):
1. customerName
2. productName
3. qty
4. targetPrice
5. status
6. matchCount
7. createdAt
8. expiresAt
9. tags
10. notes
11. matchQuality

**Recommendation**: Default to 8 columns
- Keep: customerName, productName, qty, targetPrice, status, matchCount, expiresAt, matchQuality
- Move to details: createdAt, tags, notes
- **Justification**: Match quality and expiration are actionable; creation timestamp is less urgent

---

## Implementation Strategy

### Phase 1: Quick Wins (1-2 days)
Target grids with simple column hiding (no UX changes needed):
1. Inventory (hide 2 columns)
2. Procurement Aliases (hide 2 columns)
3. Vendor Bills (hide 2 columns)

### Phase 2: Medium Complexity (2-3 days)
Grids requiring column grouping or hover states:
4. Fulfillment Picks
5. Purchase Orders

### Phase 3: High Complexity (3-4 days)
Grids requiring UX redesign or new interaction patterns:
6. Sales Orders (worst offender, needs rethinking)
7. Matchmaking (complex multi-view)

---

## Technical Approach

### Option A: Hidden by Default
```typescript
const columns: ColDef<GridRow>[] = [
  { field: 'primary', hide: false },
  { field: 'secondary', hide: true, suppressColumnsToolPanel: false }
  // User can show via column menu
];
```

### Option B: Responsive Column Sets
```typescript
const mobileColumns = ['id', 'name', 'status'];
const desktopColumns = [...mobileColumns, 'date', 'amount', 'tags'];
const wideScreenColumns = [...desktopColumns, 'notes', 'reference'];
```

### Option C: Column Grouping
```typescript
const columns: ColDef<GridRow>[] = [
  {
    headerName: 'Timestamps',
    children: [
      { field: 'createdAt' },
      { field: 'updatedAt' },
      { field: 'completedAt' }
    ]
  }
];
```

---

## Testing Requirements

For each grid fix:
1. ✅ Verify ≤8 columns visible by default
2. ✅ Confirm hidden columns accessible via column menu
3. ✅ Test with realistic data (long names, many tags)
4. ✅ Validate no horizontal scroll on 1920x1080 display
5. ✅ Check mobile/tablet responsive behavior

---

## Next Steps

1. **Prioritize by user impact**: Sales Orders and Purchase Orders are highest-traffic views
2. **Gather operator feedback**: Which columns do they actually use daily?
3. **A/B test**: Roll out changes to staging first, measure user behavior
4. **Document column visibility logic**: Make it easy for future developers to maintain the 8-column rule

---

## References

- Issue: [#31](https://github.com/EvanTenenbaum/terp-operator/issues/31)
- AG Grid Column API: https://www.ag-grid.com/javascript-data-grid/column-properties/
- Numbers-native design principles: `docs/design/numbers-native-ux.md` (if exists)

---

**Status**: Audit complete, implementation deferred  
**Estimated effort**: 6-9 days for all 7 grids  
**Recommended start**: After P0 bugs fixed (#18 complete, #30 complete)
