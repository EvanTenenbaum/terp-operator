## Wireframe: WF-V-RECOVERY — RecoveryView

### UX Posture

The 5:30 AM wake-up view. The failure list is foregrounded as the primary surface. The Admin tools panel and Command Reversal panel are no longer competing surfaces; admin tools live in a slide-over or settings sub-tab. Recovery feels like a safety net, not an interrogation room. When the operator enters via a failure notification, the Status pill defaults to `Failed` (or `In Progress`) and the offending row is preselected.

### Layout (ASCII)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                              FilterToolbar                                    │
│ ┌──────────────────────────────────────────────────────────────────────────┐ │
│ │ [+ New Recovery] │ Status ▾ │ Data views ▾ │ Date ▾ │ Type ▾ │ Sort ▾ │ │
│ │                  │ Amount ▾ │ Export ▾                                  │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
│ ┌──────────────────────────────────────────────────────────────────────────┐ │
│ │ [Status: In Progress ×] [Type: Overcharge ×] [+ Add filter]              │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
├──────────────────────────────────────────────────────────────────────────────┤
│                              KPI Line                                         │
│ ┌──────────────────────────────────────────────────────────────────────────┐ │
│ │ 128 recovery cases · $941.2k  ·  Open 14 · In Progress 22 · Recovered 89│ │
│ │ · Unrecoverable 3                                  [Show breakdown ▾]    │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
├──────────────────────────────────────────────────────────────────────────────┤
│                            AG Grid (failures foregrounded)                    │
│ ┌──────────────────────────────────────────────────────────────────────────┐ │
│ │ ☐ │ ID       │ Source        │ Type        │ Amount  │ Status      │Date │ │
│ │───┼──────────┼───────────────┼─────────────┼─────────┼─────────────┼─────│ │
│ │ ☐ │ RCV-0128 │ INV-90124     │ Overcharge  │ $4,720  │In Progress  │6/12 │ │
│ │ ☐ │ RCV-0127 │ PO-3442       │ Short Ship  │ $2,310  │In Progress  │6/11 │ │
│ │ ☐ │ RCV-0126 │ INV-90085     │ Duplicate   │ $8,150  │ Recovered   │6/10 │ │
│ │ ☐ │ RCV-0125 │ PO-3431       │ Damaged     │ $1,200  │ Recovered   │6/09 │ │
│ │ ☐ │ RCV-0124 │ INV-90064     │ Pricing Err │ $3,400  │   Open      │6/09 │ │
│ │ ☐ │ RCV-0123 │ PO-3420       │ Overcharge  │ $5,900  │In Progress  │6/08 │ │
│ │ ☐ │ RCV-0122 │ INV-90042     │ Short Pay   │ $2,800  │Unrecoverable│6/07 │ │
│ │ ☐ │ RCV-0121 │ PO-3415       │ Warranty    │ $1,050  │ Recovered   │6/07 │ │
│ │                  Page 1 of 16   [◀ ◀ 1 2 3 … 16 ▶ ▶]                   │ │
│ │                            (row height: 32px Mercury standard)           │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
├──────────────────────────────────────────────────────────────────────────────┤
│              BulkActionBar (appears only when rows selected)                  │
│ ┌──────────────────────────────────────────────────────────────────────────┐ │
│ │ 3 selected • $13,930  [Mark In Progress] [Recover] [More ▾]              │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘

Detail Slide-over with command context (appears on row click — not pre-staged):
┌──────────────────────────────────────────────────────────────────────────────┐
│                       Slide-over (right, 420px standard)                      │
│ ┌──────────────────────────────────────────────────────────────────────────┐ │
│ │ RCV-0128 — INV-90124 (Overcharge)                                   [×] │ │
│ │ Status: [In Progress ▾]   Type: Overcharge                               │ │
│ │ Amount: $4,720.00         Source: INV-90124                              │ │
│ │ Opened: 06/12/26          Target Recovery: $4,720.00                     │ │
│ │ ─────────────────────────────────────────────────────────────────────── │ │
│ │ ┌────────────┐ ┌──────────────────┐ ┌──────────┐                        │ │
│ │ │ Details    │ │ Supporting Docs  │ │ History  │                        │ │
│ │ └────────────┘ └──────────────────┘ └──────────┘                        │ │
│ │ ─────────────────────────────────────────────────────────────────────── │ │
│ │ ▼ Details tab (full failure/command context)                             │ │
│ │ "System overcharged FRZ-BR-001 at $4.20/unit vs contracted $3.80/unit.   │ │
│ │  100 units affected. Vendor credit memo requested on 06/12/26."          │ │
│ │                                                                          │ │
│ │ Command context:                                                         │ │
│ │   Command: vendor_invoice.post                                           │ │
│ │   Input: { invoice_id: "INV-90124", line_count: 1, unit_price: 4.20 }   │ │
│ │   Error: "PRICE_CONTRACT_MISMATCH at line 1"                             │ │
│ │   Operator: Maria G.                                                     │ │
│ │   Timestamp: 2026-06-12 05:30:14 UTC                                    │ │
│ │                                                                          │ │
│ │ Recovery Progress:                                                        │ │
│ │   [Submitted ▸] [In Progress ●] [Recovered ○]                            │ │
│ │   Credit memo expected by 06/19/26                                       │ │
│ │ ─────────────────────────────────────────────────────────────────────── │ │
│ │ Footer actions (state-gated):                                            │ │
│ │   Open         → [Start Recovery] [Mark Unrecoverable]                   │ │
│ │   In Progress  → [Recover] [Mark Unrecoverable] [Add Note]               │ │
│ │   Recovered    → [View Source]                                            │ │
│ │   Unrecoverable→ [Re-open] (with approval)                                │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘

Admin tools live in a separate slide-over accessible from the FilterToolbar overflow:
  [Settings ▾] → Admin tools (Backup, Correction, Find & Replace) — not on the main surface.
```

### State-Gated Action Surface

| Recovery State  | Visible Actions                          |
|-----------------|------------------------------------------|
| Open            | `Start Recovery`, `Mark Unrecoverable`   |
| In Progress     | `Recover`, `Mark Unrecoverable`, `Add Note` |
| Recovered       | `View Source`                            |
| Unrecoverable   | `Re-open` (requires approval)            |

Row-level inline `Retry` available for In Progress recoveries so the operator never has to open the slide-over for the common case.

### Dimensions

| Element | Width | Height | Notes |
|---------|-------|--------|-------|
| View container | 100% viewport | 100vh | flex column |
| FilterToolbar | 100% | 40px | horizontal menubar, px-4, gap-2 |
| ActiveFilterPills | 100% | 36px | flex-wrap, px-4, gap-1 |
| KPI line | 100% | 32px (collapsed) · ~96px (expanded) | px-4 |
| AG Grid | 100% | flex-1 | virtual scrolling |
| Grid row | 100% | 32px | Mercury standard |
| Checkbox column | 48px | 32px | center aligned |
| BulkActionBar | 100% | 48px | sticky bottom, animate slide-up |
| Slide-over peek | 280px | 100% parent | default peek width |
| Slide-over standard | 420px | 100% parent | on expand click |
| Slide-over wide | 60% viewport | 100% parent | on drag |
| DetailTabBar | 100% | 36px | inside slide-over |

### Interactive Elements

- **[+ New Recovery] button (in FilterToolbar)**: Opens recovery creation form as a slide-over: select source (invoice/PO search), type dropdown, amount, description, supporting docs upload.
- **Status ▾ pill**: Multi-select popover (`Open 14`, `In Progress 22`, `Recovered 89`, `Unrecoverable 3`). When the operator enters via a failure notification, this pill is pre-set to a tight filter so the failures the operator was alerted about are the first thing on screen.
- **Status cell (ComboboxCellEditor)**: Double-click opens the combobox with valid transitions for the current state. Status visually encoded — Open = info, In Progress = warning, Recovered = success, Unrecoverable = neutral.
- **Type cell**: Display-only chip (Overcharge, Short Ship, Duplicate, Damaged, Pricing Error, Short Pay, Warranty, Quality, Other).
- **Source cell**: Click navigates to source (invoice or PO).
- **Row click**: Opens slide-over at peek (280px). The slide-over's Details tab includes **command context** (command name, input, error, timestamp, operator) so the recovery feels like a safety net — the operator never wonders what was being attempted when the failure happened.
- **Slide-over Supporting Docs tab**: Document list with upload capability (Invoice copy, Contract, Email correspondence, Credit memo, Photo evidence, Other).
- **Slide-over History tab**: Audit trail of status changes, notes added, documents attached, communications logged.
- **Slide-over Recovery Progress indicator**: Visual stepper (Submitted → In Progress → Recovered) with current step highlighted, future steps dimmed.
- **Row-level inline `Retry`**: For In Progress recoveries, a row-level `Retry` action is available without opening the slide-over. The common case requires zero extra clicks.
- **Mark Recovered**: Opens recovery form: actual recovered amount, recovery date, method (Credit Memo, Refund, Offset, Write-off), notes.
- **Mark Unrecoverable**: Opens form: reason for write-off, approval (if configured), write-off account. Modal confirmation because it's destructive.
- **FilterToolbar**: Type dropdown (all recovery types); Date range for opened date; Amount range; Keyword searches ID + source + description.
- **Filter pills (✕)**: Click removes filter.
- **BulkActionBar buttons**: Mark In Progress (batch), Recover (batch with recovery form), Export, More ▾ (Mark Unrecoverable, Add Note, Assign, Link Source). All bulk actions only on intersection of valid actions across selected rows.
- **Pagination**: Standard controls.

### States Shown

- **Default (no filter)**: All recoveries visible. KPI line shows aggregate.
- **Entered via failure notification**: Status ▾ pre-set to `In Progress` (or `Open` depending on notification type). KPI line and grid reflect the filter immediately.
- **Empty state**: "No recovery cases — all transactions are clean ✓" with `[+ New Recovery]` if operator wants to add one manually.
- **Empty filtered**: "No recovery cases match your filters" + "Clear filters" link.
- **Loading state**: 8 skeleton rows; skeleton KPI line.
- **Error state**: Banner "Failed to load recovery cases. [Retry]"
- **Filter active**: ActiveFilterPills visible; menubar indicators show active state.
- **No filters**: ActiveFilterPills hidden.
- **Row selected**: Highlight + checkbox; BulkActionBar slides up.
- **Open recovery**: Info-blue; newly created; no progress yet; editable.
- **In Progress recovery**: Warning-yellow; progress indicator shows current step; expected recovery date visible; row-level `Retry` available.
- **Recovered recovery**: Green with checkmark; actual recovery amount may differ from target; difference shown in detail; read-only.
- **Unrecoverable recovery**: Gray; write-off reason required; approval note if applicable.
- **Partial recovery**: Status `Recovered`; detail shows "Recovered $3,200 of $4,720 target (67.8%)."
- **Aging recovery (open >30 days)**: Row highlighted with warning border; Date cell bold; detail shows "Open 45 days — may require escalation."
- **Row editing**: Combobox for status; date fields editable.
- **Row saving**: Spinner; non-interactive.
- **Row save failed**: Error toast with retry.
- **Bulk action in progress**: "Recovering 3 cases…"; buttons disabled.
- **Bulk action complete**: Toast "3 recovery cases marked as Recovered"; refresh.
- **Slide-over open**: Grid narrows; keyboard trapped.

### ARIA Annotations

- **FilterToolbar**: `role="menubar"`, `aria-label="Filter and view options"`
- **Status ▾ pill**: `role="combobox"`, `aria-haspopup="listbox"`, `aria-label="Filter by recovery status"`, `aria-multiselectable="true"`
- **ActiveFilterPills**: `role="list"`, `aria-label="Active filters"`
- **Filter pill**: `role="listitem"`; remove: `aria-label="Remove [filter] filter"`
- **KPI line**: `role="status"`, `aria-live="polite"`, `aria-label="128 recovery cases, $941.2k. Open 14, In Progress 22, Recovered 89, Unrecoverable 3."`
- **AG Grid**: `role="grid"`, `aria-label="Cost recovery records"`, `aria-multiselectable="true"`
- **Grid header row**: `role="row"`, `aria-rowindex="1"`
- **Column header**: `role="columnheader"`, `aria-sort="none|ascending|descending"`
- **Grid data row**: `role="row"`, `aria-rowindex="N"`, `aria-selected="false|true"`
- **Status cell (editable)**: `role="gridcell"`, `aria-readonly="false"`; combobox: `role="combobox"`, `aria-label="Status for RCV-0128"`
- **BulkActionBar**: `role="toolbar"`, `aria-label="Bulk actions — 3 selected"`
- **Slide-over**: `role="dialog"`, `aria-label="Recovery RCV-0128 details"`
- **DetailTabBar**: `role="tablist"`, `aria-label="Recovery detail sections"`
- **Recovery progress stepper**: `role="progressbar"`, `aria-valuenow="2"`, `aria-valuemax="3"`, `aria-label="Step 2 of 3: In Progress"`
- **Row-level Retry**: `role="button"`, `aria-label="Retry recovery RCV-0128"`
- **Toast**: `role="alert"`, `aria-live="assertive"`

### Edge Cases Handled

- **No recovery cases at all**: Full-page empty: "No cost recovery cases — all transactions are clean." Summary/tabs hidden.
- **All cases recovered**: Normal view; Open/In Progress count 0; Recovered tab pre-selected; summary shows 100% recovery rate.
- **Recovery for zero amount**: Allowed for documentation purposes; amount $0.00 with "Non-monetary" badge.
- **Multiple recovery cases from same source**: Source link shows count "INV-90124 — 2 recovery cases"; detail lists related cases.
- **Very large recovery amount**: Formatted appropriately; detail shows full precision.
- **Recovery target vs actual mismatch**: Partial recovery tracked with remaining balance; over-recovery tracked as positive variance.
- **Recovery without source**: Source cell shows "—"; detail allows free-text source description; `Link Source` action available.
- **Write-off without approval (if approval optional)**: Write-off proceeds immediately; audit trail records.
- **Write-off requiring approval**: Status `Pending Write-off Approval`; approver notified; detail shows "Awaiting approval from [Approver]."
- **Write-off approved**: Status updates to Unrecoverable with approval note.
- **Write-off rejected**: Status reverts; detail shows rejection reason; toast notification.
- **Document upload failure**: Toast with retry; queued locally.
- **Document type validation**: Supported: PDF, JPG, PNG, XLSX, DOCX, EML; max 25MB per file.
- **Concurrent status change**: Conflict detection; toast "Case was updated by [user]. [Refresh] [Keep changes]"
- **Bulk recover with mixed targets**: Recovery form shows per-row target amounts; actual recovered editable per row.
- **Recovery aging report**: "22 cases in progress, avg 14 days open — 3 cases overdue (>30 days)."
- **Large dataset**: Virtual scrolling; pre-computed summary.
- **Rapid filter changes**: 300ms debounce.
- **Browser back**: Closes slide-over; restores state.
- **Keyboard**: Arrow keys; F2 edit; Enter detail; Tab cycle; Escape close.
- **Screen reader**: "22 cases in progress, $187.2k potential recovery" on filter; full command context announced on slide-over open.

### UX Compliance

| UX Rule | Status | Note |
|---------|--------|------|
| UX-1: Action visibility follows entity state | ✓ | Recovery actions are absent for states they don't apply to (Recover absent on Recovered; Re-open absent on Open). |
| UX-2: Supporting info one click away, never zero | ✓ | Admin tools moved to a separate slide-over. Command context one click away in Details tab. |
| UX-3: One primary surface per view | ✓ | The recovery table is the only primary surface. Admin tools, Command Reversal panel no longer compete. |
| UX-4: Bulk actions appear only on selection | ✓ | BulkActionBar slides up only on selection. |
| UX-5: Validation errors at point of impact | ✓ | Failures appear in the row itself; no permanent error panel. |
| UX-6: Tools and forms in slide-overs; modals for confirmations | ✓ | Recovery detail is a slide-over. Mark Unrecoverable modal because it's destructive. |
| UX-7: System never hides what mode the operator is in | ✓ | Active filter pills; slide-over header; row-level status visible. |
| UX-8: State changes resolve in place | ✓ | Retry/Recover transitions the row inline; no navigation. |
| UX-9: Filtering is fluid; navigation is durable | ✓ | Status ▾ pill filters fluidly. Admin tools navigation is deliberate. |
| UX-10: Cell-level interactions save immediately; forms have explicit save | ✓ | Cell status edits save immediately. Recovery form has explicit save. |
| UX-11: URL is the session memory | ✓ | Notification-driven entry encodes status filter into URL. Slide-over case ID in URL. Browser back works. |
| UX-12: Empty states give the operator a next step | ✓ | Empty → "All transactions are clean." Empty filtered → "Clear filters." |
