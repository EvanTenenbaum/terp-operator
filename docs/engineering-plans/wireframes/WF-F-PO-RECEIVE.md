## Wireframe: WF-F-PO-RECEIVE — Receive PO Flow

### Flow Overview
Operator receives goods against a confirmed Purchase Order. Flow: select PO row(s) via checkbox → BulkActionBar appears → quantity input modal → spinner/success → receipt preview in peek slideover (280px) → open full receipt.

### Step 1: Grid — Select PO Row
#### Layout (ASCII)
```
┌──────────────────────────────────────────────────────────────┐
│  Purchase Orders          [🔍 Search...]          [+ New PO]  │
├──────────────────────────────────────────────────────────────┤
│  ☐ │ #     │ Vendor       │ Status    │ Total    │ Received  │
├────┼───────┼──────────────┼───────────┼──────────┼───────────┤
│  ☑ │ 1042  │ Sunny Farms  │ Confirmed │ $5,600   │ 0 of 12   │ ← checked
│  ☐ │ 1043  │ GreenLeaf Co │ Confirmed │ $8,920   │ 0 of 20   │
│  ☐ │ 1044  │ Valley Fresh │ Draft     │ $23,100  │ —         │
│  ☐ │ 1045  │ Harvest Inc  │ Received  │ $12,400  │ 12 of 12  │
└──────────────────────────────────────────────────────────────┘
```
#### Before State
- Grid shows all POs. Checkboxes unchecked. BulkActionBar hidden.
#### User Action
- Click checkbox on row for PO #1042.
#### After State
- Row highlighted (selected state). BulkActionBar animates up from bottom (translateY, 200ms).
#### Interactive Elements, ARIA, Edge Cases
- Checkbox: `role="checkbox"`, `aria-checked="true"`, `aria-label="Select PO #1042"`.
- Edge case: Draft POs cannot be received — checkbox disabled with tooltip "PO must be Confirmed before receiving".

### Step 2: BulkActionBar Appears
#### Layout (ASCII)
```
┌──────────────────────────────────────────────────────────────┐
│  ... PO Grid (above) ...                                     │
│                                                              │
│  ╔══════════════════════════════════════════════════════════╗│
│  ║  1 PO selected  │  [Receive]  │  [Status ▾]  │  [More ▾] ║│ ← BulkActionBar
│  ╚══════════════════════════════════════════════════════════╝│
└──────────────────────────────────────────────────────────────┘
```
#### Before State
- BulkActionBar hidden (offscreen / translateY(100%)).
#### User Action
- (Automatic — appears after checkbox selection.)
#### After State
- Bar shows count "1 PO selected" and action buttons. `[Receive]` is primary action (bold).
#### Interactive Elements, ARIA, Edge Cases
- Bar: `role="toolbar"`, `aria-label="Bulk actions"`. Animation: `transform: translateY(0)`, transition 200ms.
- Keyboard: Escape clears selection, hides bar.
- Edge case: Multi-select (3+ POs) → bar shows "3 selected · $X total". Receive flow batches all.

### Step 3: Quantity Input Modal
#### Layout (ASCII)
```
┌──────────────────────────────────────────────────────────────┐
│  ... PO Grid (dimmed) ...                                    │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Receive — PO #1042                              [✕] │   │
│  │──────────────────────────────────────────────────────│   │
│  │  Vendor:  Sunny Farms                                │   │
│  │  Ordered: 12 items                                   │   │
│  │  Previously received: 0                              │   │
│  │──────────────────────────────────────────────────────│   │
│  │  Qty received:  [____]                               │   │ ← input
│  │                                                      │   │
│  │  [Cancel]              [✓ Confirm Receipt]           │   │
│  └──────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────┘
```
#### Before State
- Modal closed. User clicked `[Receive]` on BulkActionBar.
#### User Action
- Enter quantity (e.g., "12") in number input. Click `[✓ Confirm Receipt]` or press Enter.
#### After State
- Input validated (must be >0, ≤remaining). Confirm button enables after valid input.
#### Interactive Elements, ARIA, Edge Cases
- Modal: `role="dialog"`, `aria-modal="true"`, `aria-labelledby="receive-title"`.
- Qty input: `type="number"`, min=1, max=remaining. `aria-describedby="qty-hint"`.
- Edge case: Qty > ordered → inline error "Cannot exceed ordered quantity (12)". Block submission.
- Edge case: Partial receipt (e.g., 6 of 12) → allowed; PO remains "Partially Received".

### Step 4: Processing — Spinner → Green Flash
#### Layout (ASCII)
```
┌──────────────────────────────────────────────────────────────┐
│  ... PO Grid ...                                             │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Receive — PO #1042                              [✕] │   │
│  │──────────────────────────────────────────────────────│   │
│  │                                                      │   │
│  │        ◌  Processing receipt...                      │   │ ← spinner
│  │                                                      │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  ╔══════════════════════════════════════════════════════════╗│
│  ║  ✓ Receipt #REC-089 created — 12 items received         ║│ ← green flash 200ms
│  ╚══════════════════════════════════════════════════════════╝│
└──────────────────────────────────────────────────────────────┘
```
#### Before State
- Confirm clicked. Modal still open.
#### User Action
- (Automatic transition — spinner shown during API call.)
#### After State
- Spinner shown during save. On success: green flash overlay (200ms), modal closes, grid refreshes.
#### Interactive Elements, ARIA, Edge Cases
- Spinner: `aria-busy="true"`, `aria-label="Processing receipt"`.
- Edge case: API timeout → error state "Server not responding. Retry?" with retry/cancel.

### Step 5: Receipt Preview in Peek Slideover
#### Layout (ASCII)
```
┌──────────────────────────────────────────────┬───────────────┐
│  Purchase Orders                             │ Receipt #089  │ ← 280px peek
│  ☐│#    │Vendor      │Status   │Received     │───────────────│
│  ─┼─────┼────────────┼─────────┼─────────────│ PO: #1042     │
│   │1042 │Sunny Farms │Received │12 of 12 ✓  │ Vendor: Sunny  │
│  ☐│1043 │GreenLeaf   │Confirmd │0 of 20      │               │
│                                              │ Items:         │
│                                              │ 🍅 Roma Tom 50│
│                                              │ 🥬 Iceberg   20│
│                                              │               │
│                                              │ Qty: 12       │
│                                              │               │
│                                              │ [Open Full →] │
└──────────────────────────────────────────────┴───────────────┘
```
#### Before State
- Receipt created. Grid shows updated PO row. Slideover closed.
#### User Action
- Click the updated PO row → peek slideover (280px) opens with receipt summary.
#### After State
- Slideover shows receipt #, PO reference, vendor, item list, qty received. `[Open Full →]` action available.
#### Interactive Elements, ARIA, Edge Cases
- Slideover: width 280px, CSS transition width 300ms. `aria-label="Receipt preview"`.
- Edge case: Multiple receipts for same PO → show list of receipt #s with most recent at top.

### Step 6: Open Full Receipt
#### Layout (ASCII)
```
┌──────────────────────────────────────────────────────────────┐
│  Receipt #REC-089                                     [✕]    │
│──────────────────────────────────────────────────────────────│
│  PO: #1042          Vendor: Sunny Farms                      │
│  Date: 2026-06-15   Received by: Evan T.                     │
│──────────────────────────────────────────────────────────────│
│  Items Received                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ Product              Qty   Unit   Price    Line Total│   │
│  │──────────────────────────────────────────────────────│   │
│  │ Roma Tomatoes         50    lb    $2.40     $120.00  │   │
│  │ Iceberg Lettuce       20    cs   $18.50     $370.00  │   │
│  │──────────────────────────────────────────────────────│   │
│  │ Total Received: 12 items          Total:   $490.00   │   │
│  └──────────────────────────────────────────────────────┘   │
│──────────────────────────────────────────────────────────────│
│  Notes: [All items received in good condition____________]   │
│                                                              │
│  [Print]  [Export PDF]  [Close]                             │
└──────────────────────────────────────────────────────────────┘
```
#### Before State
- Peek slideover showing receipt preview.
#### User Action
- Click `[Open Full →]` in peek slideover, or navigate to receipt detail route.
#### After State
- Full receipt view loads with complete line items, notes field, print/export actions.
#### Interactive Elements, ARIA, Edge Cases
- Print: opens browser print dialog. Export PDF: generates download.
- Edge case: Receipt amended later → show version history or "Amended" badge.
