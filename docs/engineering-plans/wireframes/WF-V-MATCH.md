# Wireframe: WF-V-MATCH — MatchmakingView

**Template:** GridView (with tabs and expandable rows)
**Entity:** MatchmakingPair
**Wireframe ID:** WF-V-MATCH

---

## Full View — Default State (Tab: All, No Selection)

```
┌─View Header──────────────────────────────────────────────────────────────┐
│ Matchmaking                                                    [New Scan] │
└───────────────────────────────────────────────────────────────────────────┘
┌─FilterToolbar────────────────────────────────────────────────────────────┐
│ [▾ Data views]  │  Date ▾  │  Keyword ▾  │  Amount ▾  │ Group ▾  │ Sort ▾ │ ⬇ │
└───────────────────────────────────────────────────────────────────────────┘
┌─GridSummaryStrip─────────────────────────────────────────────────────────┐
│ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐      │
│ │ 1,247 Matches │ │ 83% Match    │ │ 342 Pending  │ │ $2.1M Total  │      │
│ │      Total    │ │   Rate       │ │   Review     │ │  Matched     │      │
│ └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘      │
└───────────────────────────────────────────────────────────────────────────┘
┌─ViewTabBar───────────────────────────────────────────────────────────────┐
│  All (1,247) │ Pending (342) │ Matched (872) │ Rejected (33)              │
└───────────────────────────────────────────────────────────────────────────┘
┌─AG Grid (32px rows, checkboxes, sortable headers)────────────────────────┐
│ ☐ │ ID        │ Source              │ Target              │ Score ▾│ Status  │ Date       │
├───┼───────────┼─────────────────────┼─────────────────────┼────────┼─────────┼────────────┤
│ ☐ │ MAT-1042  │ PO-8841 Acme Corp   │ SO-7732 GlobalFresh  │ ████░░ │ Pending │ 2026-06-14 │
│   │           │ $48,200 · 12 lines  │ $51,000 · 15 lines   │  78%   │         │            │
│ ☐ │ MAT-1041  │ PO-8839 TerraFruits │ SO-7731 BerryBest    │ █████░ │ Matched │ 2026-06-14 │
│   │           │ $12,800 · 8 lines   │ $13,100 · 8 lines    │  94%   │         │            │
│ ☐ │ MAT-1040  │ PO-8837 GreenValley │ SO-7728 OrganicTrade  │ ███░░░ │ Pending │ 2026-06-13 │
│   │           │ $22,300 · 6 lines   │ $20,100 · 5 lines    │  61%   │         │            │
│ ☐ │ MAT-1039  │ PO-8835 PacificAg   │ SO-7725 FarmDirect    │ ██░░░░ │ Rejected│ 2026-06-13 │
│   │           │ $7,500 · 3 lines    │ $6,200 · 3 lines     │  43%   │         │            │
│ ☐ │ MAT-1038  │ PO-8832 SunHarvest  │ SO-7722 FreshFields   │ ██████ │ Matched │ 2026-06-12 │
│   │           │ $31,400 · 10 lines  │ $31,200 · 10 lines   │  99%   │         │            │
│ ☑ │ MAT-1037  │ PO-8829 ValleyGrown │ SO-7719 PlainsProduce │ █████░ │ Matched │ 2026-06-12 │
│   │           │ $18,900 · 6 lines   │ $19,200 · 7 lines    │  92%   │         │            │
│ ☐ │ MAT-1036  │ PO-8827 CoastalFarm │ SO-7716 GreenBasket   │ ████░░ │ Pending │ 2026-06-12 │
│   │           │ $41,000 · 14 lines  │ $38,500 · 12 lines   │  75%   │         │            │
└───┴───────────┴─────────────────────┴─────────────────────┴────────┴─────────┴────────────┘
┌─BulkActionBar (conditional, bottom-animated)─────────────────────────────┐
│ 1 match selected                                                          │
│ [Accept Match] [Reject] [Request Review] [Export]                         │
└───────────────────────────────────────────────────────────────────────────┘
┌─DetailSlideover: Peek (280px, right)─────────────────────────────────────┐
│ MAT-1041                                         ×                       │
│ Source: PO-8839 · TerraFruits · $12,800                                 │
│ Target: SO-7731 · BerryBest · $13,100                                    │
│ Match Score: 94%  ███████████████████░                                   │
│ Status: Matched                                                          │
│ [Accept] [Reject] [···]                                                  │
│ ◀ drag                                                                    │
└───────────────────────────────────────────────────────────────────────────┘
```

---

## DetailSlideover: Standard (420px) — Match Criteria Tab Active

```
┌─Main Content (shifts left)───────────────────┬─DetailSlideover: Standard─┐
│                                               │ MAT-1041                   │
│  [Grid is narrower, fully functional]         │ Source: PO-8839            │
│                                               │ Target: SO-7731            │
│                                               │ Score: 94% ████████████░   │
│                                               │ [Accept] [Reject] [Review] │
│                                               │────────────────────────────│
│                                               │ Src Det | Tgt Det | Match  │
│                                               │         |         | Crit ▾│
│                                               │────────────────────────────│
│                                               │ Match Criteria Breakdown:  │
│                                               │ ┌────────────────────────┐ │
│                                               │ │ Product     95% █████░ │ │
│                                               │ │ Quantity    100% ██████│ │
│                                               │ │ Price       89%  ████░░│ │
│                                               │ │ Location    92%  █████░│ │
│                                               │ │ Delivery    88%  ████░░│ │
│                                               │ │ Quality     100% ██████│ │
│                                               │ └────────────────────────┘ │
│                                               │ [Open in full view →]      │
└───────────────────────────────────────────────┴────────────────────────────┘
```

---

## Expanded Row — Match Criteria Breakdown (Inline)

```
│ ☐ │ MAT-1041  │ PO-8839 TerraFruits │ SO-7731 BerryBest    │ █████░ │ Matched │ 2026-06-14 │
│   │           │ $12,800 · 8 lines   │ $13,100 · 8 lines    │  94%   │         │            │
│ ▼ ├───────────┴─────────────────────┴──────────────────────┴────────┴─────────┴────────────┤
│   │ Match Criteria Breakdown (expandable row)                                              │
│   │ ┌──────────────┬─────────────┬─────────────┬──────────┬──────────────────────────────┐ │
│   │ │ Criterion    │ Source      │ Target      │ Score    │ Notes                        │ │
│   │ ├──────────────┼─────────────┼─────────────┼──────────┼──────────────────────────────┤ │
│   │ │ Product      │ Strawberries│ Strawberries│ 95% ████░│ Variety: Albion vs Albion    │ │
│   │ │ Quantity     │ 1,200 lbs   │ 1,200 lbs   │100% ████ │ Exact match                  │ │
│   │ │ Price        │ $1.07/lb    │ $1.09/lb    │ 89% ████░│ ±$0.02 variance              │ │
│   │ │ Location     │ Fresno, CA  │ Fresno, CA  │ 92% ████░│ Same region, diff warehouse  │ │
│   │ │ Delivery     │ Jun 22      │ Jun 24      │ 88% ████░│ 2-day gap                    │ │
│   │ │ Quality      │ USDA #1     │ USDA #1     │100% ████ │ Perfect match                │ │
│   │ └──────────────┴─────────────┴─────────────┴──────────┴──────────────────────────────┘ │
│   │ Weighted Average Score: 94%                                                             │
│   └─────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Dimensions

- View container: 100vw × 100vh, overflow hidden
- View Header: 56px tall, padding 12px 24px, Inter 18px semibold
- FilterToolbar: 44px tall, menubar role, chips 28px tall, Inter 13px
- GridSummaryStrip: 80px tall, 4 cards per row, each 240px × 72px
- ViewTabBar: 40px tall, tabs 120px wide, count badges 18px pill
- AG Grid: 32px row height, checkbox column 48px, ID column 120px
- Source/Target columns: 200px each, two-line display
- Match Score column: 120px, colored bar + percentage
- Status column: 110px, ComboboxCellEditor on double-click
- BulkActionBar: 52px tall, sticky bottom, translateY animation 200ms
- DetailSlideover: Peek 280px → Standard 420px → Wide 60vw
- Expanded row: content area min-height 200px, auto-height
- Font: Inter 13px body, 11px secondary, 14px header. CSS semantic classes only.

---

## Interactive Elements

- **Checkbox (AG Grid):** Click → toggle row selection. Shift+click → range select. ARIA: role="checkbox", aria-checked.
- **Match Score bar:** Inline colored bar (green≥90%, amber≥70%, red<70%). ARIA: role="meter", aria-valuenow, aria-valuemin, aria-valuemax.
- **Expand toggle (▶/▼):** Click → expand/collapse match criteria breakdown. ARIA: role="button", aria-expanded.
- **Status cell:** Double-click → ComboboxCellEditor (Pending/Matched/Rejected). ARIA: role="combobox".
- **Row click:** Single-click → DetailSlideover peek (280px). Double-click → standard (420px). ARIA: aria-expanded on row.
- **BulkActionBar Accept Match:** Primary button → execute matchAccept command. Shows spinner during execution.
- **BulkActionBar Reject:** Danger button → execute matchReject command. Confirmation dialog before rejecting.
- **New Scan button:** Opens scan creation dialog. Triggers matchmaking algorithm.
- **FilterToolbar Date:** Popover with date range picker. Quick presets: Today, This Week, Last 7 Days, This Month.
- **FilterToolbar Keyword:** Text input with debounce 300ms. Searches source/target names.
- **Match Criteria tab:** Shows breakdown table. Sortable by score. Visual bars per criterion.
- **Drag handle:** Resize slideover. Snap points at 280px, 420px, 60%.

---

## States Shown

- **Default (no selection):** Full grid visible. No DetailSlideover. No BulkActionBar.
- **Row selected (peek):** 1 row highlighted. DetailSlideover at 280px with summary. BulkActionBar visible.
- **Row selected (standard):** DetailSlideover at 420px with tabs. Main content margin-right: 420px.
- **Expandable row open:** Row expansion shows match criteria breakdown below the parent row.
- **Bulk action executing:** Spinner on active button. All other buttons disabled. Bar stays visible.
- **Empty state:** "No matches found" illustration. "Run a new scan" CTA button. FilterToolbar still accessible.
- **Error state:** Toast notification. Row with error shows ⚠ indicator. Retry button in cell.
- **Loading state:** Grid skeleton rows (8 rows × 32px). SummaryStrip skeleton cards. Tab badges show "—".

---

## ARIA Annotations

- View container: role="region", aria-label="Matchmaking view"
- FilterToolbar: role="menubar", aria-label="Filter and data controls"
- Quick filter chips: role="menuitem", aria-haspopup="dialog", aria-expanded
- Active filter pills: role="list", aria-label="Active filters". Each: role="listitem". Remove button: aria-label="Remove filter: [name]"
- GridSummaryStrip: role="region", aria-label="Matchmaking summary metrics"
- Metric cards: role="status", aria-label="[metric name]: [value]"
- ViewTabBar: role="tablist", aria-label="Match filters"
- Tabs: role="tab", aria-selected, aria-controls="match-grid-panel"
- Tab badges: aria-label="[count] [tab name] matches"
- AG Grid: role="grid", aria-label="Matchmaking pairs", aria-rowcount, aria-colcount
- Row: role="row", aria-selected, aria-expanded (on row click), aria-rowindex
- Checkbox cell: role="columnheader" or "gridcell". Checkbox: role="checkbox", aria-checked
- Match score cell: role="meter", aria-valuenow, aria-valuemin="0", aria-valuemax="100", aria-label="Match score: 94%"
- Expand toggle: role="button", aria-expanded, aria-label="Show match criteria breakdown"
- Expanded region: role="region", aria-label="Match criteria for [ID]"
- Status cell (editing): role="combobox", aria-haspopup="listbox", aria-autocomplete="list"
- BulkActionBar: role="toolbar", aria-label="Bulk actions"
- Action buttons: role="button". Primary: aria-label="Accept [count] matches"
- DetailSlideover: role="complementary", aria-label="Match details"
- Detail tabs: role="tablist", tabs role="tab", panels role="tabpanel"
- Drag handle: aria-label="Resize detail panel"
- Close button: aria-label="Close match details"
- New Scan button: role="button", aria-label="Run new matchmaking scan"

---

## Edge Cases Handled

- **Zero-score match:** Bar rendered at 0% width. Score displayed as "0%". Tooltip: "No matching criteria."
- **Single-source/multiple-targets:** Row repeats for each target pair. Source shown in each row.
- **Stale match data:** Cell value not in current options → shown as-is with "Outdated" tooltip. Combobox shows "Current: [value]" header.
- **Large match criteria (20+):** Expandable row scrollable. Max height 400px.
- **Rapid row expand/collapse:** Debounced animation. Ignores rapid clicks within 100ms.
- **No matches after scan:** Empty state with scan results summary. "0 matches found across 47 PO-SO pairs."
- **Duplicate matches:** Warning badge on row. Tooltip: "Potential duplicate of MAT-1036."
- **Match score loading:** Score bar pulses while algorithm computes. Placeholder text "Calculating...".
- **Bulk accept with mixed statuses:** Only Pending-status rows are actionable. Matched rows show "Already matched" tooltip. Rejected rows show "Cannot re-accept rejected match — use Reopen first."
- **Concurrent scan conflict:** If new scan runs while viewing results, toast: "Results may be stale. Refresh?" with Refresh button.
