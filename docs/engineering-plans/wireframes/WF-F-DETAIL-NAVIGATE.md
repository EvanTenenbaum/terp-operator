## Wireframe: WF-F-DETAIL-NAVIGATE — Detail Navigation Flow

### Flow Overview
Operator navigates from grid to full PO detail. Progressive disclosure: peek slideover (280px) → standard slideover (420px) with tabs → full page view at `/purchase-orders/:id`. Widths transition via CSS 300ms cubic-bezier.

### Step 1: Click PO Row — Peek Slideover (280px)
#### Layout (ASCII)
```
┌──────────────────────────────────────────────┬───────────────┐
│  Purchase Orders                             │ PO #1042      │ ← 280px peek
│──────────────────────────────────────────────│───────────────│
│  #     │ Vendor       │ Status   │ Total     │ Status: Draft │
│───────┼──────────────┼──────────┼───────────│ Vendor: Sunny │
│▶ 1039 │ Sunny Farms  │ Received │ $12,400   │ Date: Jun 15  │
│  1040 │ GreenLeaf Co │ Draft    │ $8,920    │ Total: $5,600 │
│▐▐1042▐│ Harvest Inc  │ Draft ██ │ $5,600    │ Lines: 3      │ ← highlighted row
│  1043 │ Valley Fresh │ Confirmed│ $23,100   │               │
│                                              │───────────────│
│                                              │ [Open →]      │ ← primary action
│                                              │ [Edit]        │
│                                              │ [Duplicate]   │
└──────────────────────────────────────────────┴───────────────┘
```
#### Before State
- Grid showing all POs. Slideover area empty/closed.
#### User Action
- Single-click PO row #1042.
#### After State
- Row highlighted. Peek slideover slides in from right (280px, 300ms cubic-bezier). Shows summary: status badge, vendor, date, total, line count. 2-3 context actions: `[Open →]`, `[Edit]`, `[Duplicate]`.
#### Interactive Elements, ARIA, Edge Cases
- Slideover: `role="complementary"`, `aria-label="PO #1042 preview"`.
- Keyboard: Arrow keys navigate grid rows; slideover updates reactively. Escape closes slideover.
- Edge case: Window width < 800px → peek slideover opens as bottom sheet instead.

### Step 2: Click "Open" — Expands to Standard Slideover (420px)
#### Layout (ASCII)
```
┌─────────────────────────────┬──────────────────────────────────┐
│  PO Grid (narrower)         │  PO #1042 — Draft            [✕] │ ← 420px, tabs
│─────────────────────────────│──────────────────────────────────│
│  #    │Vendor       │Total  │  [Summary] [Lines] [Vendor] [Log]│ ← tab bar
│  ─────┼─────────────┼───────│──────────────────────────────────│
│  1039 │Sunny Farms  │$12.4K │  Vendor:     Harvest Inc         │
│  1040 │GreenLeaf    │$8.9K  │  Date:       2026-06-15          │
│▐▐1042▐│Harvest Inc  │$5.6K  │  Status:     Draft               │
│  1043 │Valley Fresh │$23.1K │  Terms:      Net 30              │
│                             │  Ref #:      PO-2026-0615-001    │
│                             │  Total:      $5,600.00           │
│                             │  Lines:      3                   │
│                             │──────────────────────────────────│
│                             │  [Edit PO]  [Finalize →]         │
│                             │  [Open in full view ↗]           │
└─────────────────────────────┴──────────────────────────────────┘
```
#### Before State
- Peek slideover at 280px showing minimal summary.
#### User Action
- Click `[Open →]` in peek slideover.
#### After State
- Slideover animates from 280px to 420px (width transition 300ms). Tab bar appears: Summary (active), Lines, Vendor, Log. Grid resizes narrower to accommodate.
#### Interactive Elements, ARIA, Edge Cases
- Width transition: `transition: width 300ms cubic-bezier(0.2, 0.8, 0.4, 1)`.
- Tabs: `role="tablist"`, `role="tab"`, `aria-selected="true"`. Arrow keys navigate tabs.
- Slideover close: `[✕]` or Escape → collapses back to peek, then closes.

### Step 3: Click "Vendor" Tab — Vendor Detail Content
#### Layout (ASCII)
```
┌─────────────────────────────┬──────────────────────────────────┐
│  PO Grid                    │  PO #1042 — Draft            [✕] │
│─────────────────────────────│──────────────────────────────────│
│                             │  [Summary] [▐▐Vendor▐▐] [Lines] [Log]│ ← active tab
│                             │──────────────────────────────────│
│                             │  Harvest Inc                     │
│                             │  ──────────────────────────────  │
│                             │  Contact:   Maria Rodriguez      │
│                             │  Phone:     (555) 123-4567       │
│                             │  Email:     orders@harvest-inc.co│
│                             │  Address:   123 Farm Rd          │
│                             │             Salinas, CA 93901    │
│                             │──────────────────────────────────│
│                             │  Payment Terms: Net 30           │
│                             │  Credit Limit: $50,000           │
│                             │  Open Balance: $12,400           │
│                             │  Status:      🟢 Active          │
│                             │──────────────────────────────────│
│                             │  Recent POs from this vendor:    │
│                             │  • #1032 — $8,200  (May 28)      │
│                             │  • #1018 — $11,500 (May 15)      │
│                             │  • #0992 — $6,900  (Apr 22)      │
│                             │                                  │
│                             │  [Open Vendor Details ↗]         │
└─────────────────────────────┴──────────────────────────────────┘
```
#### Before State
- Summary tab active showing PO overview.
#### User Action
- Click "Vendor" tab, or press Arrow Right twice from Summary tab.
#### After State
- Tab content switches to vendor detail: contact info, address, payment terms, credit status, recent POs list. `[Open Vendor Details ↗]` link available for full vendor page.
#### Interactive Elements, ARIA, Edge Cases
- Tab panel: `role="tabpanel"`, `aria-labelledby="tab-vendor"`. Content loads on tab activation (lazy).
- Edge case: Vendor data fetch fails → inline error "Could not load vendor details. [Retry]".

### Step 4: Click "Open in Full View" — Full Page Navigation
#### Layout (ASCII)
```
┌──────────────────────────────────────────────────────────────┐
│  ← Purchase Orders    │    PO #1042 — Draft                   │ ← breadcrumb
│                        │                                      │
├────────────────────────│──────────────────────────────────────┤
│  [Summary] [Lines] [Vendor] [Log] [Payments] [Receiving]     │ ← full-width tabs
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  PO Details                                                  │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ Vendor:  Harvest Inc          Date:  2026-06-15      │   │
│  │ Status:  ● Draft              Terms: Net 30          │   │
│  │ Ref #:   PO-2026-0615-001    Total: $5,600.00        │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  Lines (3)                                                   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ # │ Product          │ Qty  │ Unit│ Price  │ Total   │   │
│  │───┼──────────────────┼──────┼─────┼────────┼─────────│   │
│  │ 1 │ Roma Tomatoes    │ 50   │ lb  │ $2.40  │ $120.00 │   │
│  │ 2 │ Iceberg Lettuce  │ 20   │ cs  │ $18.50 │ $370.00 │   │
│  │ 3 │ Blueberries      │ 10   │ cs  │ $32.00 │ $320.00 │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  [Back to List]  [Edit PO]  [Finalize →]  [More ▾]          │
└──────────────────────────────────────────────────────────────┘
```
#### Before State
- Slideover open at 420px with Vendor tab active.
#### User Action
- Click `[Open in full view ↗]` link in slideover footer.
#### After State
- Browser navigates to `/purchase-orders/1042`. Slideover closes. Full page renders with breadcrumb, full-width tab bar (same tabs + Payments, Receiving), and complete PO detail.
#### Interactive Elements, ARIA, Edge Cases
- Navigation: client-side route change (React Router). URL: `/purchase-orders/1042?tab=vendor` preserves active tab.
- Breadcrumb: `← Purchase Orders` navigates back to grid with same filter/sort state preserved.
- Edge case: Direct URL access → page loads PO data by ID; if not found, 404 state.

### Step 5: Full Page — Full-Width Tab Layout
#### Layout (ASCII)
```
┌──────────────────────────────────────────────────────────────┐
│  ← Purchase Orders    │    PO #1042 — Draft                   │
├──────────────────────────────────────────────────────────────┤
│  [Summary] [Lines] [Vendor] [Log] [Payments] [Receiving]     │
├──────────────────────────────────────────────────────────────┤
│  ┌─ Receiving History ──────────────────────────────────┐   │
│  │                                                      │   │
│  │  Receipt #089 — Jun 15, 2026                         │   │
│  │  ┌──────────────────────────────────────────────┐   │   │
│  │  │ Product           Qty Ord  Qty Recv  Balance │   │   │
│  │  │──────────────────────────────────────────────│   │   │
│  │  │ Roma Tomatoes       50       50         0 ✓  │   │   │
│  │  │ Iceberg Lettuce     20       20         0 ✓  │   │   │
│  │  │ Blueberries         10        0        10 ○  │   │   │
│  │  └──────────────────────────────────────────────┘   │   │
│  │                                                      │   │
│  │  Notes: Good condition — dock 3                      │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  [Back to List]  [Edit PO]  [Finalize →]  [More ▾]          │
└──────────────────────────────────────────────────────────────┘
```
#### Before State
- Full page with Summary tab active.
#### User Action
- Click "Receiving" tab.
#### After State
- Receiving history panel shown: list of receipts with item-level received vs ordered, balance column. ✓ = fully received, ○ = pending.
#### Interactive Elements, ARIA, Edge Cases
- Full-width tabs: same tab component as slideover, but 6 tabs visible. Scrollable if >6 tabs.
- Data grids within tabs: standard AG Grid with sorting/filtering.
- Edge case: Long page → sticky tab bar and action footer.

---

### UX Check

| Question | Answer |
|----------|--------|
| Does the flow require mode-switching? | No. Peek → standard → full are progressive disclosures of the same entity; the grid context is preserved at peek and standard. |
| Is the operator ever shown irrelevant actions? | No. Slide-over and full-page actions come from the entity state machine; only state-valid actions appear. |
| Is context preserved if the operator leaves mid-flow? | Yes. URL encodes target entity + active tab; reload restores the exact view. Browser back closes slide-over before navigating away. |
| Mercury comparison | Mercury's transaction detail follows the same pattern: row click → side panel preview → "Open full" expands to a dedicated route. URL preserves the panel state. This flow mirrors that progression. |

### UX Compliance

| UX Rule | Status | Note |
|---------|--------|------|
| UX-1 Action visibility follows entity state | ✅ | Draft PO shows Edit + Finalize; Confirmed PO shows Receive + Cancel; non-applicable actions absent |
| UX-2 Supporting info one click away | ✅ | Vendor, line items, log are tabs inside the slide-over — one click each |
| UX-3 One primary surface per view | ✅ | Grid is primary; slide-over is secondary disclosure; full view is dedicated route |
| UX-4 Bulk actions on selection only | N/A | Single-entity navigation flow |
| UX-5 Validation at point of impact | ✅ | Errors in slide-over content render inline (e.g., "Could not load vendor details") |
| UX-6 Tools in slide-overs; modals for confirms | ✅ | Detail lives in slide-over; full view is a route, not a modal |
| UX-7 Mode is always visible | ✅ | Header shows entity id + state badge at every width; breadcrumb makes "where am I" obvious on full view |
| UX-8 State changes resolve in place | ✅ | Tab switching is in-place; slide-over close returns to grid with row preserved |
| UX-9 Filtering fluid; navigation durable | ✅ | Slide-over is durable URL state (`/purchase-orders/1042?tab=vendor`); back closes panel before leaving |
| UX-10 Cell saves immediate; forms explicit | N/A | Navigation flow; edits handled by WF-F-SALE-EDIT |
| UX-11 URL is session memory | ✅ | Target entity id + active tab + grid filter state all encode to URL |
| UX-12 Empty states give next step | ✅ | Empty tab content (e.g., "No receipts yet") shows clear next-action CTA |
