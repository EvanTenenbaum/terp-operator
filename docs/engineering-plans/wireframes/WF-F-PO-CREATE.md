## Wireframe: WF-F-PO-CREATE — Create Purchase Order Flow

### Flow Overview
Operator creates a new Purchase Order from the PO grid. Flow spans grid → authoring slideover (420px) with vendor/date/terms → inline line editor → multi-line totals → save draft / finalize. Every step uses keyboard-accessible controls with immediate validation feedback.

### Step 1: Grid — Click "New PO" CTA
#### Layout (ASCII)
```
┌──────────────────────────────────────────────────────────────┐
│  Purchase Orders                    [🔍 Search...]  [+ New PO]│ ← toolbar
├──────────────────────────────────────────────────────────────┤
│  #     │ Vendor       │ Date       │ Status   │ Total        │
├────────┼──────────────┼────────────┼──────────┼──────────────┤
│  1039  │ Sunny Farms  │ 2026-06-10 │ Received │ $12,400.00   │
│  1040  │ GreenLeaf Co │ 2026-06-12 │ Draft    │ $8,920.00    │
│  1041  │ Valley Fresh │ 2026-06-14 │ Confirmed│ $23,100.00   │
│  1042  │ Harvest Inc  │ 2026-06-15 │ Draft    │ $5,600.00    │
└──────────────────────────────────────────────────────────────┘
  Page 1 of 3   ← 1 2 3 →   10 rows
```
#### Before State
- PO grid visible with existing orders. Toolbar shows search input and `[+ New PO]` button (primary CTA, top-right).
#### User Action
- Mouse: click `[+ New PO]` button.
- Keyboard: Tab to button, Enter / Space.
#### After State
- Authoring slideover animates in from right (300ms cubic-bezier 0.2,0.8,0.4,1).
- Focus moves to Vendor dropdown inside slideover.
#### Interactive Elements, ARIA, Edge Cases
- Button: `role="button"`, `aria-label="Create new purchase order"`.
- Keyboard: Enter/Space triggers. Escape or click backdrop closes (no-op, no data loss).
- Edge case: If user has unsaved changes elsewhere, warn before opening.

### Step 2: Authoring Slideover Opens
#### Layout (ASCII)
```
┌─────────────────────────────┬──────────────────────────────────┐
│  PO Grid (dimmed backdrop)  │  New Purchase Order          [✕] │ ← 420px slideover
│                             │──────────────────────────────────│
│  #     │ Vendor  │ Status   │  Vendor: [Sunny Farms      ▾]    │
│  ──────┼─────────┼──────────│  Date:   [2026-06-15   📅]       │
│  1039  │ Sunny   │ Received │  Terms:  [Net 30           ▾]    │
│  1040  │ Green   │ Draft    │  Ref #:  [_______________]       │
│                             │──────────────────────────────────│
│                             │  Lines (0)            [+ Add Line]│
│                             │  ┌──────────────────────────────┐│
│                             │  │ No lines yet                ││
│                             │  └──────────────────────────────┘│
│                             │──────────────────────────────────│
│                             │  Subtotal:     $0.00             │
│                             │  Tax:           $0.00            │
│                             │  Total:         $0.00            │
│                             │                                  │
│                             │  [Save Draft]      [Finalize →]  │
└─────────────────────────────┴──────────────────────────────────┘
```
#### Before State
- Slideover open at 420px width. Vendor, Date, Terms, Ref# fields empty/defaulted.
#### User Action
- Select vendor from dropdown (type to filter). Set date via date picker. Choose payment terms.
#### After State
- Form fields populated. `[+ Add Line]` button now active (was disabled without vendor).
#### Interactive Elements, ARIA, Edge Cases
- Vendor: combobox with async search. Date: native date input or custom picker. Terms: simple select.
- `aria-label="Purchase order authoring form"`. Escape closes with unsaved-changes warning.
- Edge case: Invalid vendor → inline error "Vendor not found".

### Step 3: Add Line — Inline Line Editor
#### Layout (ASCII)
```
┌──────────────────────────────────┐
│  New Purchase Order          [✕] │
│──────────────────────────────────│
│  Vendor: Sunny Farms             │
│  Date:   2026-06-15  Terms: Net30│
│──────────────────────────────────│
│  Lines (1)            [+ Add Line]│
│  ┌──────────────────────────────┐│
│  │ Product: [Tomatoes, Roma  ▾] ││ ← inline editor (280px dropdown)
│  │ Qty:     [50___]  Unit: [lb] ││
│  │ Price:   [$2.40_] /lb       ││
│  │ Total:   $120.00             ││
│  │          [✓ Save Line] [✕]  ││
│  └──────────────────────────────┘│
│──────────────────────────────────│
│  Subtotal:   $120.00             │
│  Total:      $120.00             │
│  [Save Draft]      [Finalize →]  │
└──────────────────────────────────┘
```
#### Before State
- Lines area shows `[+ Add Line]` CTA. No line rows exist.
#### User Action
- Click `[+ Add Line]` → inline row editor appears with Product (combobox, 280px dropdown), Qty, Unit, Price.
#### After State
- Inline editor visible. Product dropdown opens on focus with search-as-you-type.
#### Interactive Elements, ARIA, Edge Cases
- Product search: debounced 300ms, minimum 2 chars. Results: 32px rows, keyboard navigable.
- Qty: number input, min=1. Unit: derived from product or selectable.
- Edge case: Product out of stock → inline warning "Low stock: 3 remaining".

### Step 4: Multiple Lines Added — Totals Calculated
#### Layout (ASCII)
```
┌──────────────────────────────────┐
│  New Purchase Order          [✕] │
│──────────────────────────────────│
│  Lines (3)            [+ Add Line]│
│  ┌──────────────────────────────┐│
│  │ 🍅 Roma Tomatoes  50lb $2.40  $120.00  [✎] [🗑]│
│  │ 🥬 Iceberg Lettuce 20cs $18.50 $370.00  [✎] [🗑]│
│  │ 🫐 Blueberries     10cs $32.00 $320.00  [✎] [🗑]│
│  └──────────────────────────────┘│
│──────────────────────────────────│
│  Subtotal:   $810.00             │
│  Tax (8%):    $64.80             │
│  Freight:     $25.00             │
│  ═══════════════════════════════ │
│  Total:      $899.80             │
│                                  │
│  [Save Draft]      [Finalize →]  │
└──────────────────────────────────┘
```
#### Before State
- One line added. Operator continues adding lines.
#### User Action
- Repeat `[+ Add Line]` → fill product/qty/price → save. Each line appears as a summary row with edit/delete actions.
#### After State
- 3 lines shown with computed totals. Subtotal, tax, freight, total auto-calculated.
#### Interactive Elements, ARIA, Edge Cases
- Line rows: `role="row"` inside `role="list"`. Edit (✎) reopens inline editor. Delete (🗑) shows confirm.
- Totals reactive: update on line add/edit/delete.
- Edge case: Zero lines → Finalize disabled.

### Step 5: Save Draft
#### Layout (ASCII)
```
┌──────────────────────────────────┐
│  New Purchase Order          [✕] │
│──────────────────────────────────│
│  ... lines and totals ...        │
│                                  │
│  [Save Draft]  ← spinner →      │
│                                  │
│  ╔══════════════════════════════╗│ ← green flash 200ms
│  ║  ✓ Draft saved — PO #1042   ║│
│  ╚══════════════════════════════╝│
└──────────────────────────────────┘
```
#### Before State
- Form filled with lines. `[Save Draft]` button enabled.
#### User Action
- Click `[Save Draft]` or Ctrl+S.
#### After State
- Button shows spinner during save. On success: green flash overlay (200ms) "✓ Draft saved — PO #1042". Slideover title updates to "PO #1042".
#### Interactive Elements, ARIA, Edge Cases
- Spinner: `aria-busy="true"`, `aria-label="Saving draft..."`.
- Success toast/overlay: `role="status"`, `aria-live="polite"`.
- Edge case: Save fails → red flash "✕ Error saving. Retry?" with retry button.

### Step 6: Finalize PO
#### Layout (ASCII)
```
┌──────────────────────────────────┐
│  PO #1042 — Draft            [✕] │
│──────────────────────────────────│
│  ... summary ...                 │
│                                  │
│  ┌──────────────────────────────┐│
│  │  ⚠ Finalize PO #1042?       ││ ← confirmation dialog
│  │                              ││
│  │  This will lock the order    ││
│  │  and notify the vendor.      ││
│  │                              ││
│  │  [Cancel]    [✓ Finalize]   ││
│  └──────────────────────────────┘│
│                                  │
│  [Save Draft]      [Finalize →]  │
└──────────────────────────────────┘
```
#### Before State
- Draft saved. `[Finalize →]` button primary CTA at bottom.
#### User Action
- Click `[Finalize →]` → confirmation dialog appears.
#### After State
- Dialog confirms action. On Confirm: spinner → success toast "✓ PO #1042 finalized". Slideover closes. Grid refreshes, PO #1042 now shows "Confirmed" status with green flash on row.
#### Interactive Elements, ARIA, Edge Cases
- Dialog: `role="alertdialog"`, `aria-modal="true"`, focus trapped. Escape = Cancel.
- Edge case: Vendor inactive → block finalize with message "Cannot finalize: vendor account is inactive".
- Edge case: Insufficient credit → warning "Credit limit approached ($X remaining)" with option to proceed.
