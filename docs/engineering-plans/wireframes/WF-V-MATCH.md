# Wireframe: WF-V-MATCH — MatchmakingView

**Template:** GridView (with expandable rows)
**Entity:** MatchmakingPair
**Wireframe ID:** WF-V-MATCH

---

### UX Posture

The matchmaking pairs table is the only primary surface. Status filter is a pill in the FilterToolbar. Match criteria breakdown is one click away — either inline expandable row or in the slide-over Match Criteria tab. Score visualization stays at the row for glanceable comparison.

---

## Full View — Default State (no selection)

```
┌─FilterToolbar────────────────────────────────────────────────────────────┐
│ [+ New Scan] │ Status ▾ │ Data views │ Date │ Keyword │ Amount │ Group │ │
│              │ Sort ▾ │ Export ▾                                         │
└──────────────────────────────────────────────────────────────────────────┘
┌─KPI Line─────────────────────────────────────────────────────────────────┐
│ 1,247 matches · 83% match rate · 342 pending review · $2.1M total matched│
│                                                       [Show breakdown ▾] │
└──────────────────────────────────────────────────────────────────────────┘
┌─AG Grid (32px rows, checkboxes, sortable headers)────────────────────────┐
│ ☐ │ ID        │ Source              │ Target              │ Score ▾│ Status  │ Date       │
├───┼───────────┼─────────────────────┼─────────────────────┼────────┼─────────┼────────────┤
│ ☐ │ MAT-1042  │ PO-8841 Acme Corp   │ SO-7732 GlobalFresh │ ████░░ │ Pending │ 2026-06-14 │
│ ☐ │ MAT-1041  │ PO-8839 TerraFruits │ SO-7731 BerryBest   │ █████░ │ Matched │ 2026-06-14 │
│ ☐ │ MAT-1040  │ PO-8837 GreenValley │ SO-7728 OrganicTrade│ ███░░░ │ Pending │ 2026-06-13 │
│ ☐ │ MAT-1039  │ PO-8835 PacificAg   │ SO-7725 FarmDirect  │ ██░░░░ │ Rejected│ 2026-06-13 │
│ ☐ │ MAT-1038  │ PO-8832 SunHarvest  │ SO-7722 FreshFields │ ██████ │ Matched │ 2026-06-12 │
│ ☑ │ MAT-1037  │ PO-8829 ValleyGrown │ SO-7719 PlainsProd  │ █████░ │ Matched │ 2026-06-12 │
│ ☐ │ MAT-1036  │ PO-8827 CoastalFarm │ SO-7716 GreenBasket │ ████░░ │ Pending │ 2026-06-12 │
└───┴───────────┴─────────────────────┴─────────────────────┴────────┴─────────┴────────────┘
┌─BulkActionBar (appears only when rows selected)──────────────────────────┐
│ 1 match selected                                                          │
│ [Accept Match] [Reject] [More ▾: Request Review | Export]                │
└──────────────────────────────────────────────────────────────────────────┘
```

---

### State-Gated Action Surface

| Match State | Visible Actions                              |
|-------------|----------------------------------------------|
| Pending     | `Accept Match`, `Reject`, `Request Review`   |
| Matched     | `View Linked Records`, `Reverse Match`       |
| Rejected    | `Reopen` (with reason)                       |

---

## DetailSlideover — Tabs: Source Detail | Target Detail | Match Criteria | Decision

Footer actions follow state-gating.

---

## Expanded Row — Match Criteria Inline (one click away)

```
│ ☐ │ MAT-1041  │ PO-8839 TerraFruits │ SO-7731 BerryBest    │ █████░ │ Matched │ 2026-06-14 │
│ ▼ ├───────────┴─────────────────────┴──────────────────────┴────────┴─────────┴────────────┤
│   │ Match Criteria Breakdown (expandable row)                                              │
│   │ │ Product      │ Strawberries│ Strawberries│ 95% │ Variety: Albion vs Albion    │
│   │ │ Quantity     │ 1,200 lbs   │ 1,200 lbs   │100% │ Exact match                  │
│   │ │ Price        │ $1.07/lb    │ $1.09/lb    │ 89% │ ±$0.02 variance              │
│   │ │ Location     │ Fresno, CA  │ Fresno, CA  │ 92% │ Same region                  │
│   │ │ Delivery     │ Jun 22      │ Jun 24      │ 88% │ 2-day gap                    │
│   │ │ Quality      │ USDA #1     │ USDA #1     │100% │ Perfect match                │
│   │ Weighted Average Score: 94%                                                             │
│   └─────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Dimensions

- View container: 100vw × 100vh
- FilterToolbar: 44px tall (plus 32px chip row)
- KPI line: 32px / ~96px expanded
- AG Grid: 32px row height; checkbox 48px; ID 120px; Source/Target 200px each (two-line); Score 120px (bar + percentage); Status 110px
- BulkActionBar: 52px
- Slide-over: Peek 280px → Standard 420px → Wide 60vw
- Expanded row: content area min-height 200px, auto-height
- Font: Inter 13px body, 11px secondary, 14px header

---

## Interactive Elements

- **Match Score bar**: Inline color-coded (success ≥ 90%, warning ≥ 70%, error < 70%). `role="meter"`.
- **Expand toggle (▶/▼)**: Click to expand inline match criteria breakdown. `role="button"`, `aria-expanded`.
- **Status cell**: ComboboxCellEditor (Pending/Matched/Rejected).
- **Row click**: Single → slide-over peek. Double → standard.
- **BulkActionBar Accept Match**: Executes match accept command.
- **BulkActionBar Reject**: Modal confirmation.
- **New Scan button**: Opens scan creation slide-over. Triggers matchmaking algorithm.
- **Status ▾ pill**: Multi-select with `Pending (342)`, `Matched (872)`, `Rejected (33)`. Replaces prior ViewTabBar.
- **FilterToolbar Date**: Popover with date range picker.
- **Match Criteria tab**: Breakdown table sortable by score; visual bars per criterion.
- **Drag handle**: Resize slide-over.

---

## States Shown

- **Default (no selection)**: Full grid visible.
- **Row selected (peek)**: 1 row highlighted; slide-over at 280px.
- **Row selected (standard)**: Slide-over at 420px with tabs.
- **Expandable row open**: Inline criteria breakdown shown.
- **Bulk action executing**: Spinner on active button.
- **Empty state**: "No matches found" + "Run a new scan" CTA.
- **Error state**: Toast.
- **Loading state**: Skeleton rows.

---

## ARIA Annotations

- FilterToolbar: `role="menubar"`, `aria-label="Matchmaking filter toolbar"`
- Status ▾ pill: `role="combobox"`, `aria-haspopup="listbox"`, `aria-label="Filter by match status"`, `aria-multiselectable="true"`
- ActiveFilterPills: `role="list"`, `aria-label="Active filters"`
- KPI line: `role="status"`, `aria-live="polite"`, `aria-label="1,247 matches, 83 percent match rate, 342 pending review, $2.1 million total matched"`
- AG Grid: `role="grid"`, `aria-label="Matchmaking pairs"`, `aria-rowcount`, `aria-colcount`
- Row: `role="row"`, `aria-selected`, `aria-expanded` on inline expansion
- Match score cell: `role="meter"`, `aria-valuenow`, `aria-valuemax="100"`, `aria-label="Match score: 94%"`
- Expand toggle: `role="button"`, `aria-expanded`, `aria-label="Show match criteria breakdown"`
- Expanded region: `role="region"`, `aria-label="Match criteria for [ID]"`
- Status cell (editing): `role="combobox"`, `aria-haspopup="listbox"`
- BulkActionBar: `role="toolbar"`, `aria-label="Bulk actions"`
- Slide-over: `role="dialog"`, `aria-label="Match details"`
- Detail tabs: `role="tablist"`, tabs `role="tab"`, panels `role="tabpanel"`

---

## Edge Cases Handled

- **Zero-score match**: Bar at 0% width; "0%"; tooltip "No matching criteria."
- **Single-source/multiple-targets**: Row repeats per target pair.
- **Stale match data**: Cell value with "Outdated" tooltip.
- **Large match criteria (20+)**: Expandable row scrollable; max height 400px.
- **Rapid row expand/collapse**: Debounced.
- **No matches after scan**: Empty state with summary.
- **Duplicate matches**: Warning badge.
- **Match score loading**: Score bar pulses.
- **Bulk accept with mixed statuses**: Only Pending actionable; Matched shows tooltip "Already matched."
- **Concurrent scan conflict**: Toast "Results may be stale. Refresh?"

---

### UX Compliance

| UX Rule | Status | Note |
|---------|--------|------|
| UX-1: Action visibility follows entity state | ✓ | Accept/Reject only on Pending; Reverse only on Matched; Reopen only on Rejected. |
| UX-2: Supporting info one click away, never zero | ✓ | Match criteria as expandable row OR slide-over tab. Source/Target details one click away. |
| UX-3: One primary surface per view | ✓ | Matches table is the only primary surface. |
| UX-4: Bulk actions appear only on selection | ✓ | BulkActionBar slides up only on selection. |
| UX-5: Validation errors at point of impact | ✓ | Stale data warning at the cell. |
| UX-6: Tools and forms in slide-overs; modals for confirmations | ✓ | New Scan in slide-over. Reject modal. |
| UX-7: System never hides what mode the operator is in | ✓ | Filter pills, slide-over header, expand state visible. |
| UX-8: State changes resolve in place | ✓ | Accept/Reject updates row inline. |
| UX-9: Filtering is fluid; navigation is durable | ✓ | Status ▾ pill replaces tab bar. |
| UX-10: Cell-level interactions save immediately; forms have explicit save | ✓ | Status edits save. Scan form explicit. |
| UX-11: URL is the session memory | ✓ | Filters, slide-over ID, expansion state encode into URL. |
| UX-12: Empty states give the operator a next step | ✓ | Empty → New Scan CTA. Empty filtered → Clear filters. |
