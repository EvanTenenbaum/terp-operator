## Wireframe: WF-F-PO-CREATE — Create Purchase Order Flow

### Flow Overview
Operator creates a new Purchase Order from the PO grid. Flow: PO list view → "+ New PO" opens **slide-over authoring form** (420px) → inline lines + vendor reference in a tab → Save Draft → Approve & Finalize.

> **UX-first changes from prior draft:**
> - The PO list view is **never pre-staged with an authoring workspace** (UX-3). Authoring lives entirely in the slide-over (UX-6 — tools and forms in slide-overs).
> - **Only two primary actions are visible** while authoring: `Save Draft` and `Approve & Finalize` (UX-1 — action visibility follows entity state). `Receive`, `Unfinalize`, `Cancel Order`, etc. do not exist for a draft PO and are **absent**, not disabled.
> - **Vendor context** (recent POs, payment terms, credit) lives in a **Vendor tab inside the slide-over**, not as a permanent VendorContextPanel on the PO list page (UX-2).

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

### Step 2: Authoring Slideover Opens (form mode, tabs: Lines | Vendor)
#### Layout (ASCII)
```
┌─────────────────────────────┬──────────────────────────────────┐
│  PO Grid (still interactive)│  New Purchase Order          [✕] │ ← 420px slide-over
│                             │  [Lines]  [Vendor]               │ ← tabs (content-kind)
│  #     │ Vendor  │ Status   │──────────────────────────────────│
│  ──────┼─────────┼──────────│  Vendor: [Sunny Farms      ▾]    │
│  1039  │ Sunny   │ Received │  Date:   [2026-06-15   📅]       │
│  1040  │ Green   │ Draft    │  Terms:  [Net 30           ▾]    │
│                             │  Ref #:  [_______________]       │
│                             │──────────────────────────────────│
│                             │  Lines (0)            [+ Add Line]│
│                             │  ┌──────────────────────────────┐│
│                             │  │ No lines yet —              ││
│                             │  │ [+ Add line item]           ││ ← empty state w/ CTA
│                             │  └──────────────────────────────┘│
│                             │──────────────────────────────────│
│                             │  Subtotal:     $0.00             │
│                             │  Total:        $0.00             │
│                             │                                  │
│                             │  [Save Draft]    [Approve &      │
│                             │                   Finalize]      │
│                             │  Only 2 actions — no Receive,   │
│                             │  Unfinalize, or Cancel for draft│
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
- **Vendor tab** (one click away) shows: contact, payment terms, credit limit, open balance, last 3 POs from this vendor. Not a permanent panel on the PO list page.
- Slide-over URL: `/purchase-orders?action=new`. Reload reproduces the open form (UX-11).
- `aria-label="Purchase order authoring form"`. Escape closes with unsaved-changes warning.
- Only `Save Draft` and `Approve & Finalize` are rendered. `Receive`, `Draft Intake`, `Unfinalize`, `Cancel Order` would correspond to other states and are not present (UX-1).
- Edge case: Invalid vendor → inline error "Vendor not found" under the field.

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

---

### UX Check

| Question | Answer |
|----------|--------|
| Does the flow require mode-switching? | No. Authoring happens inside the slide-over without leaving the PO list view. The list stays interactive in the background. |
| Is the operator ever shown irrelevant actions? | No. A draft PO only exposes `Save Draft` and `Approve & Finalize`. Receive, Unfinalize, Cancel are absent for this state. |
| Is context preserved if the operator leaves mid-flow? | Yes. The slide-over URL encodes the open form (`?action=new`); reload restores it. Closing without save warns on dirty state and can save a draft. |
| Mercury comparison | Mercury's "Send a transfer" opens a right-side panel from the transactions page with exactly the fields and the one applicable action (`Send`). The transactions table behind it stays visible. This flow mirrors that pattern. |

### UX Compliance

| UX Rule | Status | Note |
|---------|--------|------|
| UX-1 Action visibility follows entity state | ✅ | Draft PO shows only `Save Draft` + `Approve & Finalize`; other actions are absent |
| UX-2 Supporting info one click away | ✅ | Vendor history is a tab in the slide-over, not a permanent panel on the PO list |
| UX-3 One primary surface per view | ✅ | PO list is the primary surface; authoring lives in a slide-over (secondary) |
| UX-4 Bulk actions on selection only | ✅ | "+ New PO" is single-target; bulk actions on the PO list use WF-C-BULK on selection only |
| UX-5 Validation at point of impact | ✅ | "Vendor not found" appears under the vendor field; credit warning appears at finalize confirm |
| UX-6 Tools in slide-overs; modals for confirms | ✅ | Authoring is in slide-over; finalize uses a confirmation modal (irreversible state change) |
| UX-7 Mode is always visible | ✅ | Slide-over title "New Purchase Order" then "PO #1042 — Draft" makes the mode obvious throughout |
| UX-8 State changes resolve in place | ✅ | Save Draft → green flash in slide-over, no navigation; Finalize → slide-over closes, grid row flashes |
| UX-9 Filtering fluid; navigation durable | N/A | Authoring flow, not browsing |
| UX-10 Cell saves immediate; forms explicit | ✅ | This is a multi-field form — explicit `Save Draft` and `Approve & Finalize` |
| UX-11 URL is session memory | ✅ | `/purchase-orders?action=new` encodes the open slide-over; draft id encodes once saved |
| UX-12 Empty states give next step | ✅ | "No lines yet — [+ Add line item]" empty state inside the Lines section |
