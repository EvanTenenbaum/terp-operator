## Wireframe: WF-V-CONNECTORS — ConnectorsView

### UX Posture

The connectors table is the only primary surface. Status filter is a pill in the FilterToolbar (no ViewTabBar). Configuration, logs, and history live in the slide-over. Quick actions (Retry, Test Connection, Pause) appear as row-level actions for the common case so the operator never has to open the slide-over for routine ops.

### Layout (ASCII)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ ┌─ FilterToolbar ──────────────────────────────────────────────────────────┐ │
│ │ [+ New Connector] │ Status ▾ │ Data views │ Date range │ Keyword │ Type │ │
│ │                   │ Group ▾ │ Sort ▾ │ Export ▾                          │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
│ ┌─ ActiveFilterPills ──────────────────────────────────────────────────────┐ │
│ │ [Status: Error ✕] [Type: EDI 850 ✕] [+ Add filter]                       │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
│ ┌─ KPI Line ───────────────────────────────────────────────────────────────┐ │
│ │ 25 connectors · Active 18 · Error 3 · Disabled 4 · Last sync 2m ago      │ │
│ │                                                       [Show breakdown ▾] │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
│ ┌─ AG Grid ────────────────────────────────────────────────────────────────┐ │
│ │ ☐ │ ID       │ Name              │ Type      │ Status │ Last Sync       │ │
│ │───┼──────────┼───────────────────┼───────────┼────────┼─────────────────│ │
│ │ ☐ │ CON-0025 │ EDI 850 Outbound  │ EDI 850   │ Error  │ 06/15/26 08:22  │ │
│ │ ☐ │ CON-0024 │ EDI 856 Inbound   │ EDI 856   │ Active │ 06/15/26 08:21  │ │
│ │ ☐ │ CON-0023 │ FTP Drop — Vendor │ FTP       │ Active │ 06/15/26 08:15  │ │
│ │ ☐ │ CON-0022 │ API — ERP Bridge  │ REST API  │ Active │ 06/15/26 08:10  │ │
│ │ ☐ │ CON-0021 │ SFTP — Warehouse  │ SFTP      │ Active │ 06/15/26 08:05  │ │
│ │ ☐ │ CON-0020 │ EDI 810 Inbound   │ EDI 810   │ Active │ 06/15/26 08:00  │ │
│ │ ☐ │ CON-0019 │ Email Parser      │ Email     │Disabled│ 06/10/26 14:30  │ │
│ │ ☐ │ CON-0018 │ CSV Import Watch  │ FileWatch │ Active │ 06/15/26 07:55  │ │
│ │                       (row height: 32px Mercury standard)                  │
│ └──────────────────────────────────────────────────────────────────────────┘ │
│ ┌─ BulkActionBar (appears only when ≥1 row selected) ──────────────────────┐ │
│ │ 3 selected  [Enable] [Disable] [Retry Sync] [More ▾]                     │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘

Detail Slide-over (right, 420px, opens on row click):
  Tabs: Config | Logs | History
  Footer actions (state-gated):
    Active   → [Pause] [Test Connection] [Edit Config] [View Raw Log]
    Error    → [Retry Now] [Test Connection] [Pause] [View Raw Log]
    Disabled → [Enable] [Edit Config]
    Paused   → [Resume]
```

### State-Gated Action Surface

| Connector State | Visible Actions                                  |
|-----------------|--------------------------------------------------|
| Active          | `Pause`, `Test Connection`, `Edit Config`, `View Raw Log` |
| Error           | `Retry Now`, `Test Connection`, `Pause`, `View Raw Log` |
| Disabled        | `Enable`, `Edit Config`                          |
| Paused          | `Resume`                                         |

Row-level `Retry` available for Error rows.

### Dimensions

| Element | Width | Height | Notes |
|---------|-------|--------|-------|
| FilterToolbar | 100% | 40px | horizontal menubar |
| ActiveFilterPills | 100% | 36px | flex-wrap |
| KPI line | 100% | 32px / ~96px expanded | px-4 |
| AG Grid | 100% | flex-1 | virtual scrolling |
| Grid row | 100% | 32px | Mercury standard |
| BulkActionBar | 100% | 48px | sticky bottom, slide-up |
| Slide-over | 280/420/60% | 100% parent | three sizes |

### Interactive Elements

- **[+ New Connector] button**: Opens connector creation wizard (slide-over).
- **Status ▾ pill**: Multi-select with `Active (18)`, `Error (3)`, `Disabled (4)`, `Paused`. Replaces prior ViewTabBar.
- **Status cell (ComboboxCellEditor)**: Active, Error, Disabled, Paused. Valid transitions only.
- **Status display**: Active = success pill; Error = error pill with badge count; Disabled = neutral pill; Paused = warning pill.
- **Name cell**: Click opens slide-over.
- **Type cell**: Chip with type icon.
- **Last Sync cell**: Relative time with tooltip showing absolute timestamp; active sync shows animated spinner.
- **Row-level Retry**: For Error connectors, inline `Retry` action available without opening the slide-over.
- **DetailTabBar tabs**: Config (with [Edit Config] button), Logs (real-time stream), History (timeline of syncs).
- **FilterToolbar**: Type dropdown (EDI 850, EDI 856, EDI 810, FTP, SFTP, REST API, Email, FileWatch).
- **BulkActionBar buttons**: Enable (batch activate), Disable (batch deactivate), Retry Sync (batch trigger). Only intersection of valid actions.

### States Shown

- **Empty state**: "No connectors configured" + CTA.
- **Loading state**: 8 skeleton rows.
- **Error state**: Banner with retry.
- **Filter active**: ActiveFilterPills visible.
- **Active connector**: Success status pill; Last Sync with success dot.
- **Error connector**: Error status pill; Last Sync error dot; error count badge.
- **Disabled connector**: Row dimmed (opacity 0.6).
- **Syncing connector**: Last Sync cell shows animated spinner; "Syncing now…"
- **Sync succeeded**: Status pill briefly pulses; toast.
- **Sync failed**: Status switches to Error; error count increments; toast with `[Retry] [View Log]`.
- **Connection test in progress**: "Testing…" spinner.
- **Bulk action in progress**: "Enabling 3 connectors…"; buttons disabled.
- **Slide-over open**: Grid narrows.
- **DetailSlideover Config editing**: Form replaces config display.
- **New Connector wizard**: Step modal overlay (Type → Connection → Auth → Schedule → Test → Create).

### ARIA Annotations

- FilterToolbar: `role="menubar"`, `aria-label="Connectors filter toolbar"`
- Status ▾ pill: `role="combobox"`, `aria-haspopup="listbox"`, `aria-label="Filter by connector status"`, `aria-multiselectable="true"`
- ActiveFilterPills: `role="list"`, `aria-label="Active filters"`
- KPI line: `role="status"`, `aria-live="polite"`, `aria-label="25 connectors. Active 18, Error 3, Disabled 4. Last sync 2 minutes ago."`
- AG Grid: `role="grid"`, `aria-label="Connector records"`, `aria-multiselectable="true"`, `aria-rowcount="25"`
- Status cell (editable): `role="combobox"`, `aria-label="Status for CON-0025"`
- Last Sync cell: `role="gridcell"`, `aria-label="Last sync 2 minutes ago — 06/15/26 08:22"`
- BulkActionBar: `role="toolbar"`, `aria-label="Bulk actions — 3 selected"`
- Slide-over: `role="dialog"`, `aria-label="Connector CON-0025 details"`
- DetailTabBar: `role="tablist"`, `aria-label="Connector detail sections"`
- Log stream: `role="log"`, `aria-label="Sync logs for CON-0025"`, `aria-live="polite"`
- Sync in progress: `aria-busy="true"`, `role="status"`
- Toast: `role="alert"`, `aria-live="assertive"`
- New Connector wizard: `role="dialog"`, `aria-label="Create new connector — Step 1 of 5"`
- Progress bar (wizard): `role="progressbar"`, `aria-valuenow="1"`, `aria-valuemax="5"`

### Edge Cases Handled

- **No connectors at all**: Full-page empty with wizard CTA.
- **All connectors error**: Error pill pre-selected; bulk retry available.
- **Single connector**: Pagination hidden.
- **Connector with no sync ever**: Last Sync "Never" with gray dash icon.
- **Long-running sync (>5 min)**: Status shows "Syncing (4m 32s)"; cancel option in detail.
- **Sync partial failure**: Status stays Active; detail shows "142 records synced, 3 failed."
- **Credential expiry**: Warning banner in Config tab.
- **Endpoint unreachable (DNS)**: Error message; Test Connection disabled during backoff.
- **Rate limit hit**: Error 429; respects Retry-After header.
- **Concurrent syncs**: Multiple connectors can sync simultaneously.
- **Bulk retry with mixed status**: Only Enabled/Error connectors; Disabled skipped with toast.
- **Delete connector**: Modal confirmation.
- **Export connector configs**: Sensitive fields redacted with [REDACTED].
- **Large log (>10k lines)**: Last 1000 lines initially; "Load more"; Download Full Log.
- **Keyboard navigation**: Arrow keys; F2 edit; Enter detail; Tab cycle; Escape close.
- **Screen reader**: Filter announcement; sync progress announcement.

### UX Compliance

| UX Rule | Status | Note |
|---------|--------|------|
| UX-1: Action visibility follows entity state | ✓ | Retry only on Error; Enable only on Disabled; Resume only on Paused. |
| UX-2: Supporting info one click away, never zero | ✓ | Config, Logs, History as slide-over tabs. Row-level Retry for the common case. |
| UX-3: One primary surface per view | ✓ | Connectors table is the only primary surface. |
| UX-4: Bulk actions appear only on selection | ✓ | BulkActionBar slides up only on selection. |
| UX-5: Validation errors at point of impact | ✓ | Error status at the row. No permanent error panel. |
| UX-6: Tools and forms in slide-overs; modals for confirmations | ✓ | Config edit in slide-over. Delete modal. |
| UX-7: System never hides what mode the operator is in | ✓ | Filter pills, slide-over header, status badges. |
| UX-8: State changes resolve in place | ✓ | Retry/Pause/Resume updates row inline. |
| UX-9: Filtering is fluid; navigation is durable | ✓ | Status ▾ pill replaces tab bar. |
| UX-10: Cell-level interactions save immediately; forms have explicit save | ✓ | Status edits save. Config form explicit save. |
| UX-11: URL is the session memory | ✓ | Filters, slide-over ID encode into URL. |
| UX-12: Empty states give the operator a next step | ✓ | Empty → wizard CTA. Empty filtered → Clear filters. |
