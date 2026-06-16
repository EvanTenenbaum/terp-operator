# Wireframe: WF-V-PROCESSORS — ProcessorsView

**Template:** GridView
**Entity:** PaymentProcessor
**Wireframe ID:** WF-V-PROCESSORS

---

### UX Posture

The processors table is the only primary surface. Status filter is a pill in the FilterToolbar. Volume bars stay at the row level for glanceable comparison. Config, batches, transactions, and history live in the slide-over. Row-level quick actions (Run Batch, Test Connection) handle the common case without opening the slide-over.

---

## Full View — Default State (no selection)

```
┌─FilterToolbar────────────────────────────────────────────────────────────┐
│ [+ Add Processor] │ Status ▾ │ Data views │ Date │ Keyword │ Type │     │
│                   │ Sort ▾ │ Export ▾                                    │
└──────────────────────────────────────────────────────────────────────────┘
┌─KPI Line─────────────────────────────────────────────────────────────────┐
│ 18 processors · 12 active · $847M processed · 99.2% success rate         │
│                                                       [Show breakdown ▾] │
└──────────────────────────────────────────────────────────────────────────┘
┌─AG Grid (32px rows, checkboxes, sortable headers)────────────────────────┐
│ ☐ │ ID        │ Name               │ Type       │ Status  │ Last Batch     │ Volume (30d) │
├───┼───────────┼────────────────────┼────────────┼─────────┼────────────────┼──────────────┤
│ ☐ │ PRC-0018  │ Stripe Connect     │ Gateway    │ Active  │ Jun 15 09:42   │ $14.2M ████░ │
│   │           │                    │            │ ● Online│ BTH-8841 · ✓   │ 847 tx       │
│ ☐ │ PRC-0017  │ JP Morgan ACH      │ ACH        │ Active  │ Jun 15 08:15   │ $8.1M  ███░░ │
│   │           │                    │            │ ● Online│ BTH-8839 · ✓   │ 312 tx       │
│ ☐ │ PRC-0016  │ Plaid Transfer     │ Transfer   │ Active  │ Jun 15 07:30   │ $31.4M █████░│
│   │           │                    │            │ ● Online│ BTH-8837 · ✓   │ 1,204 tx     │
│ ☐ │ PRC-0015  │ PayPal Commerce    │ Gateway    │ Error   │ Jun 14 22:18   │ $4.2M  ██░░░ │
│   │           │                    │            │ ⚠ API   │ BTH-8812 · ⚠   │ 201 tx       │
│ ☐ │ PRC-0014  │ Wise Business      │ Transfer   │ Active  │ Jun 15 06:55   │ $2.8M  █░░░░ │
│ ☑ │ PRC-0013  │ Square Terminal    │ Terminal   │ Inactive│ May 28 14:12   │ $0          │
│ ☐ │ PRC-0012  │ Modern Treasury    │ Gateway    │ Active  │ Jun 15 10:01   │ $22.7M █████ │
└───┴───────────┴────────────────────┴────────────┴─────────┴────────────────┴──────────────┘
┌─BulkActionBar (appears only when rows selected)──────────────────────────┐
│ 1 processor selected                                                      │
│ [Run Batch Now] [Deactivate] [More ▾: View Config | View Transactions]   │
└──────────────────────────────────────────────────────────────────────────┘
```

---

### State-Gated Action Surface

| Processor State | Visible Actions                                  |
|-----------------|--------------------------------------------------|
| Active          | `Run Batch`, `Pause`, `Test Connection`, `Edit Config` |
| Error           | `Retry Now`, `Test Connection`, `Pause`, `View Raw Log` |
| Inactive        | `Activate`, `Edit Config`                        |
| Paused          | `Resume`                                         |

Row-level `Run Batch` and `Retry` available for the common case.

---

## DetailSlideover — Tabs: Config | Batches | Transactions | History

Footer actions follow state-gating table above.

---

## Volume Visualization

```
│ $14.2M ████░ │   ← Volume bar proportional to max in filtered view
│ 847 tx       │
```

- Color: success (Active), neutral (Inactive), error (Error).
- ARIA: `role="meter"`, `aria-valuenow`, `aria-valuemax`.

---

## Dimensions

- View container: 100vw × 100vh
- FilterToolbar: 44px tall (plus 32px chip row)
- KPI line: 32px / ~96px expanded
- AG Grid: 32px row height; ID 110px; Name 200px (two-line); Type 110px; Status 130px; Last Batch 180px; Volume 160px (bar + dollar + tx count)
- Volume inline bar: 6px tall, full cell width
- BulkActionBar: 52px
- Slide-over: Peek 280px → Standard 420px → Wide 60vw
- Font: Inter 13px body, 11px secondary, 14px header

---

## Interactive Elements

- **[+ Add Processor]**: Opens multi-step setup wizard (slide-over).
- **Status ▾ pill**: Multi-select with `Active (12)`, `Error (2)`, `Inactive (4)`, `Paused`. Replaces prior ViewTabBar.
- **Status cell**: ComboboxCellEditor (Active/Inactive/Paused). Error is non-editable (must resolve underlying issue).
- **Volume bar**: Hover → tooltip with exact volume + tx count. Click → opens Transactions tab filtered.
- **Last Batch cell**: Click → opens Batches tab. Status icon clickable → batch detail.
- **Row click**: Slide-over peek (280px).
- **Row-level Run Batch**: Available on Active processors for immediate trigger without opening slide-over.
- **Row-level Retry**: Available on Error processors.
- **BulkActionBar Run Batch Now**: Manually triggers batch for selected.
- **BulkActionBar Deactivate**: Modal confirmation.
- **Config tab — Test Connection**: Sends test ping. Inline result.
- **Config tab — Rotate API Key**: Key rotation flow. Shown once.
- **Batches tab**: Click batch row → batch detail. Retry button for failed batches.
- **Transactions tab**: Click transaction row → transaction detail.

---

## States Shown

- **Default (no filter)**: All processors visible.
- **Error tab pre-selected**: Banner "2 processors reporting errors. Action required."
- **Processor error (API)**: Error status; "API returned 401" tooltip; `Re-authenticate` in detail.
- **Processor error (timeout)**: Warning status; "3 consecutive timeouts. Batch processing paused."
- **Processor error (rate limited)**: Warning status; "Retry after: 4m 32s" countdown.
- **Inactive processor**: Dimmed row.
- **Batch running**: Last Batch column shows spinner.
- **Batch success**: Stats: "47 tx · $847K · 2.3s avg."
- **Batch partial failure**: Warning; "44/47 tx succeeded. 3 failed."
- **Empty state**: "No processors configured" + wizard CTA.
- **Loading**: Skeleton rows.
- **Connection test running**: "Testing…"

---

## ARIA Annotations

- FilterToolbar: `role="menubar"`, `aria-label="Processors filter toolbar"`
- Status ▾ pill: `role="combobox"`, `aria-haspopup="listbox"`, `aria-label="Filter by processor status"`, `aria-multiselectable="true"`
- KPI line: `role="status"`, `aria-live="polite"`, `aria-label="18 processors, 12 active, $847 million processed, 99.2 percent success rate"`
- AG Grid: `role="grid"`, `aria-label="Payment processor records"`
- Status cell: `role="gridcell"`. Status dot: `aria-hidden="true"`.
- Status cell (editing): `role="combobox"`, `aria-haspopup="listbox"`
- Volume bar: `role="meter"`, `aria-label="30-day volume: $14.2 million, 847 transactions"`
- Last Batch cell link: `role="link"`, `aria-label="Batch BTH-8841 — completed successfully"`
- Error indicator: `role="status"`, `aria-label="Processor error: API authentication failed"`
- BulkActionBar: `role="toolbar"`, `aria-label="Processor actions"`
- Slide-over: `role="dialog"`, `aria-label="Processor details"`
- Config tab API key field: `role="textbox"`, `aria-label="API key (masked)"`
- Test Connection button: `role="button"`, `aria-label="Test connection to Modern Treasury"`. Result: `aria-live="polite"`.

---

## Edge Cases Handled

- **API key expired**: Auto-detected; status → Error. One-click `Re-authenticate`.
- **Processor with zero volume**: Bar empty. "$0 · 0 tx."
- **High-volume processor dominates**: Others still visible as thin segments.
- **Batch processing during deactivation**: Queues. "Will deactivate after current batch."
- **Concurrent manual batch trigger**: "Batch already in progress."
- **Processor with no recent batches**: "No batches in last 30 days." Historical badge.
- **Multiple processors of same type**: Type grouping in filter.
- **Rate limit countdown**: Real-time countdown.
- **Webhook failure**: "Webhook Error." "Webhook not received in 4 hours."
- **Processor migration**: Import config wizard.

---

### UX Compliance

| UX Rule | Status | Note |
|---------|--------|------|
| UX-1: Action visibility follows entity state | ✓ | Retry only on Error; Resume only on Paused; Activate only on Inactive. |
| UX-2: Supporting info one click away, never zero | ✓ | Config, Batches, Transactions, History as slide-over tabs. |
| UX-3: One primary surface per view | ✓ | Processors table is the only primary surface. |
| UX-4: Bulk actions appear only on selection | ✓ | BulkActionBar slides up only on selection. |
| UX-5: Validation errors at point of impact | ✓ | Error status at the row. |
| UX-6: Tools and forms in slide-overs; modals for confirmations | ✓ | Wizard in slide-over. Deactivate modal. |
| UX-7: System never hides what mode the operator is in | ✓ | Filter pills, slide-over header. |
| UX-8: State changes resolve in place | ✓ | Retry/Pause updates row inline. |
| UX-9: Filtering is fluid; navigation is durable | ✓ | Status ▾ pill replaces tab bar. |
| UX-10: Cell-level interactions save immediately; forms have explicit save | ✓ | Status edits save. Config form explicit. |
| UX-11: URL is the session memory | ✓ | Filters, slide-over ID encode into URL. |
| UX-12: Empty states give the operator a next step | ✓ | Empty → wizard CTA. Empty filtered → Clear filters. |
