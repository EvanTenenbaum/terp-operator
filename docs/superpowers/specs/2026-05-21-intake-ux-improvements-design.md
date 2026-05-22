# /intake UX Improvements Design — TER-1529

**Linear:** https://linear.app/terpcorp/issue/TER-1529
**Registry anchor:** CMD-INTAKE (Phase 2 Procurement)
**Date:** 2026-05-21
**QA tier:** Deep QA — operator intake workflow, user-facing, command extension

---

## Problem

Six operator feedback items from `/intake` page annotations:

1. Batch line-item actions are wrong (Flag/Reject/Delete draft → should be Verify/Reject/Add note/Add market name)
2. AG Grid cells have too much padding; multi-word header text runs horizontally instead of wrapping
3. PO-level "Verify intake" button should not exist; show verification progress count instead
4. "Customer alias" column label is wrong — should be "Market name" (maps to `itemAlias` / `items.alias`)
5. Receipt preview opens as a bottom WorkspacePanel; should be a persistent side drawer
6. Toast fires with "Only Draft or Ready intake rows can be processed" when a posted batch sneaks through — broken UX

---

## Design

### 1. Batch line-item actions

**Replace** `BatchRowActions` (Flag / Reject / Delete draft) with a new four-action set.

**Verify:**
- Enabled only when `row.status` is `draft` or `ready` (not `needs_fix`, not `posted`, not `returned`)
- On click: calls `postPurchaseReceipt({ batchIds: [row.id] })` directly (same server command as PO-level verify, scoped to one batch)
- If `row.intakeQty ≠ row.expectedQty` AND both are non-zero: **auto-flag** first by calling `flagBatch({ batchId: row.id, reason: 'Quantity discrepancy: expected {expectedQty}, received {intakeQty}' })` before posting the receipt

**Reject:**
- Same as current — inline reason input → `rejectBatch({ batchId, reason })`

**Add note:**
- Opens inline text input below the action buttons
- On submit: calls `updateBatch({ id: row.id, notes: merged })` using the same stamped-append format as the current note handler (`[YYYY-MM-DD HH:MM actor] text`)
- Closes on submit or Escape

**Add market name:**
- Opens inline text input pre-filled with current `row.itemAlias`
- Disabled (with tooltip) when `row.itemId` is null — batch not linked to a catalog item
- On submit: calls `setItemAlias({ itemId: row.itemId, alias: value })`
- Closes on submit or Escape

**Delete draft** is removed — too destructive to sit next to Verify. Deletion stays accessible via the command palette if needed.

---

### 2. Global AG Grid cell/header density

**Row height for detail (inner) grids:**
The theme CSS variable `--ag-row-height: 28px` only applies to `.ag-theme-quartz` root grids. Inner detail grids create their own AG Grid root and don't inherit it. Fix: add `rowHeight: 28` and `headerHeight: 30` to `detailGridOptions` in `IntakeView`.

**Header text wrap (all grids):**
Add to `OperatorGrid`'s `defaultColDef`:
```ts
wrapHeaderText: true,
autoHeaderHeight: true,
```
Add CSS to `.ag-theme-quartz .ag-header-cell-label`:
```css
white-space: normal;
word-break: break-word;
align-items: flex-start;
padding-top: 3px;
```
Multi-word headers like "Expected qty" will naturally break to two lines; single-word headers are unaffected.

---

### 3. PO-level actions

**Remove** "Verify intake" button entirely.

**Add** a status pill showing `X / Y verified`:
- X = `order.batches.filter(b => b.status === 'posted').length`
- Y = total number of batches on the PO
- Style: `.selection-pill` when X < Y; `.selection-pill success` when X === Y

**Keep** "Verify all" (bulk confirm all pending batches as correct) and "Preview receipt" unchanged.

Column `minWidth` can shrink from 360px to ~280px after removing the Verify intake button.

---

### 4. "Market name" label standardization

**Operator-facing surfaces** (intake, inventory, operations): column label = `"Market name"` for `itemAlias` field.
- `IntakeView.tsx`: `headerName: 'Customer alias'` → `'Market name'`
- `OperationsViews.tsx`: already uses `'Market name'` — no change needed
- Tooltip on the column: `"Market name (how this product appears when sold). Set via 'Add market name' on each batch row."`

**Customer-facing surfaces** (SalesView column header, CustomerPurchaseHistoryPanel table header): column/header label = `"Product name"`.
- `SalesView.tsx`: currently `headerName: 'Customer label'` with a yellow dot marker; update to use a cleaner `"Product name"` label
- `CustomerPurchaseHistoryPanel.tsx`: the `<th>` for this column should read "Product name"

**Field name** `itemAlias` stays unchanged in code — this is purely a display label change.

---

### 5. Receipt preview → `ReceiptPreviewDrawer`

New component `src/client/components/ReceiptPreviewDrawer.tsx`.

```tsx
interface ReceiptPreviewDrawerProps {
  order: IntakeOrderRow | null;  // null = closed
  onClose: () => void;
}
```

**Positioning:** Rendered as a sibling to the `.view-stack` inside the content area. Uses CSS classes `.context-drawer context-drawer-standard` (already defined, gets the 420px width + 180ms slide transition for free).

**Layout:**
- Header: `Receipt preview — {order.poNo}`, close button (×)
- Body: current receipt preview content (summary pills + conflicts list + finder table) moved verbatim from the old WorkspacePanel
- No tabs, no entity routing — it's a focused single-purpose drawer

**Behavior:**
- Opens when "Preview receipt" is clicked on any PO row
- Stays open while the operator works on batch rows in the main grid
- Updates live: clicking "Preview receipt" on a different PO row swaps the drawer content without closing it
- Does NOT close on Escape (operator needs keyboard focus for grid editing)
- Close button (×) dismisses it

**Main grid layout:** Wrap the view in a `flex flex-row gap-0` container. When the drawer is open, the main grid area has `flex-1 min-w-0` and the drawer sits alongside it. When closed, main grid takes full width.

---

### 6. Toast/verify logic fix

The `postPurchaseReceipt` server command rejects batches with status `needs_fix` (only allows `draft` and `ready`). The old "Verify intake" frontend filter included `needs_fix`, causing false-positive errors.

**Fix:** Per-batch Verify button is enabled only for `draft` and `ready`. Removing "Verify intake" at the PO level eliminates the main toast path. The server-side guard remains correct and unchanged.

---

## Files touched

| File | Change |
|---|---|
| `src/client/views/IntakeView.tsx` | Replace `BatchRowActions`; replace PO actions column; rename column header; move receipt preview to drawer |
| `src/client/components/ReceiptPreviewDrawer.tsx` | **New** — side drawer for receipt preview |
| `src/client/styles.css` | Header cell CSS for text wrap |
| `src/client/components/OperatorGrid.tsx` | Add `wrapHeaderText`/`autoHeaderHeight` to defaultColDef |
| `src/client/views/SalesView.tsx` | `itemAlias` column: `"Customer label"` → `"Product name"` |
| `src/client/components/CustomerPurchaseHistoryPanel.tsx` | `itemAlias` table header → `"Product name"` |

---

## Acceptance criteria

- [ ] Batch row actions: Verify / Reject / Add note / Add market name (no Flag, no Delete draft)
- [ ] Verify is disabled for `posted`, `returned`, `needs_fix` batches
- [ ] Verify on a single batch posts receipt for that batch only
- [ ] Auto-flag fires (with generated reason) when actual qty ≠ expected qty at verify time
- [ ] Add note appends stamped note to batch; Add market name calls `setItemAlias`
- [ ] PO actions: shows `X/Y verified` pill + Verify all + Preview receipt (no Verify intake)
- [ ] Column label "Market name" in intake and operations views
- [ ] Column label "Product name" in sales/customer-facing surfaces
- [ ] Receipt preview opens as a right-side drawer that stays open while working
- [ ] Detail grid rows are 28px height matching outer grid
- [ ] AG Grid column headers with 2+ words wrap to two lines
- [ ] No "Only Draft or Ready" toast when clicking per-batch Verify on an eligible batch
