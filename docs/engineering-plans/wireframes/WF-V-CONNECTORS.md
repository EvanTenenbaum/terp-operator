## Wireframe: WF-V-CONNECTORS — ConnectorsView

### Layout (ASCII)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ Connectors                                                    [+ New Connector│
├──────────────────────────────────────────────────────────────────────────────┤
│ ┌─ FilterToolbar ──────────────────────────────────────────────────────────┐ │
│ │ [Data views ▾] │ [Date range ▾] │ [Keyword…] │ [Type ▾] │ [Group ▾]     │ │
│ │ [Sort ▾] │ [Export ▾]                                                    │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
│ ┌─ ActiveFilterPills ──────────────────────────────────────────────────────┐ │
│ │ [Status: Error ✕] [Type: EDI 850 ✕] [+ Add filter]                       │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
│ ┌─ GridSummaryStrip ───────────────────────────────────────────────────────┐ │
│ │ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐        │ │
│ │ │  Active  │ │  Error   │ │ Disabled │ │ Last Sync│ │  Total   │        │ │
│ │ │    18    │ │     3    │ │     4    │ │  2m ago  │ │    25    │        │ │
│ │ │          │ │          │ │          │ │ avg      │ │          │        │ │
│ │ └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘        │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
│ ┌─ ViewTabBar ─────────────────────────────────────────────────────────────┐ │
│ │ [All 25] [Active 18] [Error 3] [Disabled 4]                              │ │
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
│ │───┼──────────┴───────────────────┴───────────┴────────┴─────────────────│ │
│ │                      Page 1 of 4   [◀ ◀ 1 2 3 4 ▶ ▶]                     │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
│ ┌─ BulkActionBar (hidden until ≥1 row selected) ───────────────────────────┐ │
│ │ 3 selected  [Enable] [Disable] [Retry Sync] [More ▾]                     │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
├──────────────────────────────────────────────────────────────────────────────┤
│ ┌─ DetailSlideover (right, peek 280px) ────────────────────────────────────┐ │
│ │ CON-0025 — EDI 850 Outbound                                    [✕] [↗]   │ │
│ │ ┌─ DetailTabBar ───────────────────────────────────────────────────┐     │ │
│ │ │ [Config] [Logs] [History]                                         │     │ │
│ │ └───────────────────────────────────────────────────────────────────┘     │ │
│ │ Status: [Error ▾]        Type: EDI 850 (Purchase Order)                     │ │
│ │ Last Sync: 06/15/26 08:22  Next Sync: 06/15/26 09:22                       │ │
│ │ Endpoint: sftp://edi.partner.com:22/out/850/                                 │ │
│ │ ────────────────────────────────────────────────────────────────────────── │ │
│ │ Last Error: Connection refused — host unreachable (attempt 3/3)              │ │
│ │ Retry: Backing off — next attempt in 14 minutes                              │ │
│ │                                                                              │ │
│ │ ┌─ Quick Actions ────────────────────────────────────────────────────┐    │ │
│ │ │ [Retry Now] [Test Connection] [Pause Sync] [View Raw Log]            │    │ │
│ │ └─────────────────────────────────────────────────────────────────────┘    │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Dimensions

| Element | Width | Height | Notes |
|---------|-------|--------|-------|
| View container | 100% viewport | 100vh | flex column |
| View header | 100% | 56px | px-6, flex, items-center, justify-between |
| FilterToolbar | 100% | 40px | horizontal menubar, px-4, gap-2 |
| ActiveFilterPills | 100% | 36px | flex-wrap, px-4, gap-1 |
| GridSummaryStrip | 100% | 88px | px-4, flex, gap-3, overflow-x-auto |
| Summary card | min 160px | 72px | rounded-lg, border, p-3 |
| ViewTabBar | 100% | 40px | px-4, border-b |
| AG Grid | 100% | flex-1 | virtual scrolling |
| Grid row | 100% | 32px | Mercury standard |
| Checkbox column | 48px | 32px | center aligned |
| BulkActionBar | 100% | 48px | sticky bottom, animate slide-up |
| DetailSlideover peek | 280px | 100% parent | default peek width |
| DetailSlideover standard | 420px | 100% parent | on expand click |
| DetailSlideover wide | 60% viewport | 100% parent | on drag to expand |
| DetailTabBar | 100% | 36px | inside slideover |
| Pagination bar | 100% | 36px | border-t, px-4 |

### Interactive Elements

- **Checkbox (per row):** Click toggles row selection; header checkbox selects/deselects all visible
- **Status cell (ComboboxCellEditor):** Double-click opens combobox: Active, Error, Disabled, Paused; typeahead filtered; Enter commits
- **Status display:** Active = success-green pill; Error = red pill with badge count; Disabled = neutral-gray pill; Paused = warning-yellow pill
- **Name cell:** Click opens DetailSlideover; rendered as link style
- **Type cell:** Display-only; rendered as chip with type icon
- **Last Sync cell:** Relative time display ("2 minutes ago"); tooltip shows absolute timestamp; active sync shows animated spinner
- **Row click:** Opens DetailSlideover at peek (280px)
- **DetailSlideover expand/collapse:** Drag resize 280px ↔ 420px ↔ 60%; click expand icon toggles
- **DetailTabBar tabs:** Click switches (Config, Logs, History)
- **Config tab:** Read-only display of connector configuration — type, endpoint URL/host, port, credentials (masked), schedule (cron), retry policy, transformation rules; [Edit Config] button opens configuration editor modal
- **Logs tab:** Real-time log stream (auto-scroll); search/filter within logs; log level filter (ERROR, WARN, INFO, DEBUG); [Download Full Log] button
- **History tab:** Timeline of sync attempts with status, duration, record count, errors; expandable entries showing detail
- **Quick Actions (in slideover):** Retry Now (triggers immediate sync), Test Connection (validates endpoint reachable), Pause Sync (suspends schedule), View Raw Log (opens full log in new tab)
- **Status dropdown (in detail):** Inline combobox, same as grid editor
- **FilterToolbar:** Type dropdown filters by connector type (EDI 850, EDI 856, EDI 810, FTP, SFTP, REST API, Email, FileWatch); Keyword searches name + endpoint
- **Filter pills (✕):** Click removes filter; grid re-filters
- **+ Add filter:** Filter builder popover
- **Sort dropdown:** Multi-column sort builder
- **Export dropdown:** CSV, Excel, PDF
- **GridSummaryStrip cards:** Click filters to that card's segment
- **BulkActionBar buttons:** Enable (batch activate), Disable (batch deactivate), Retry Sync (batch trigger sync), More ▾ (Delete, Export configs, Assign owner)
- **Pagination:** Standard controls
- **[+ New Connector] button:** Opens connector creation wizard (step-by-step: Type → Connection → Auth → Schedule → Test → Create)
- **Column header click:** Sort; column resize via drag

### States Shown

- **Empty state:** "No connectors configured" illustration + "Create your first connector to integrate with external systems" + [+ New Connector] button
- **Loading state:** 8 skeleton rows; skeleton summary cards; skeleton tabs
- **Error state:** Banner "Failed to load connectors. [Retry]"; individual connector errors shown inline
- **Filter active:** ActiveFilterPills visible; menubar filter indicators
- **No filters:** ActiveFilterPills hidden
- **Row selected:** Highlight + checkbox; BulkActionBar slides up
- **Active connector:** Row shows success status pill; Last Sync shows relative time with green dot
- **Error connector:** Row shows error status pill; Last Sync shows red dot; error count badge; summary card "Error 3" highlighted red
- **Disabled connector:** Row dimmed (opacity 0.6); no sync schedule
- **Syncing connector:** Last Sync cell shows animated spinner overlay; "Syncing now…" text; row non-editable during sync
- **Sync succeeded:** Status pill briefly pulses green; Last Sync updates; toast "CON-0024 synced — 142 records" fades after 5s
- **Sync failed:** Status switches to Error; error count increments; toast "CON-0025 sync failed — Connection refused" with [Retry] [View Log]
- **Connection test in progress:** "Testing…" spinner on Test Connection button; button disabled; result toast success/failure
- **Bulk action in progress:** "Enabling 3 connectors…"; buttons disabled
- **Bulk action complete:** Toast "3 connectors enabled"; selections cleared
- **DetailSlideover open:** Grid narrows; keyboard trapped in slideover
- **DetailSlideover Logs loading:** Skeleton log lines; auto-scroll paused on manual scroll
- **DetailSlideover Config editing:** Config tab replaced with form; Save/Cancel buttons appear
- **New Connector wizard:** Step modal overlay: Step 1 Select Type → Step 2 Configure Connection → Step 3 Authentication → Step 4 Schedule → Step 5 Test → Create; progress bar; Back/Next navigation; Cancel closes with unsaved confirmation
- **Offline:** Banner; cached data; queued actions
- **Keyboard:** Full grid keyboard support; Tab between toolbar↔grid↔detail; F2 to edit status; Enter to open detail; Escape to close all

### ARIA Annotations

- **View container:** `role="region" aria-label="Connectors view"`
- **View header:** `role="banner"`
- **FilterToolbar:** `role="menubar" aria-label="Filter and view options"`
- **FilterToolbar items:** `role="menuitem" aria-haspopup="true"` for dropdowns
- **ActiveFilterPills:** `role="list" aria-label="Active filters"`
- **Filter pill:** `role="listitem"`; remove: `aria-label="Remove Status: Error filter"`
- **+ Add filter:** `role="button" aria-label="Add filter"`
- **GridSummaryStrip:** `role="region" aria-label="Connectors summary"`
- **Summary card:** `role="button" aria-label="Error: 3 connectors — click to filter" tabindex="0"`
- **ViewTabBar:** `role="tablist" aria-label="Connector status tabs"`
- **Tab:** `role="tab" aria-selected="true|false" aria-label="Active — 18 connectors"`
- **AG Grid:** `role="grid" aria-label="Connector records" aria-multiselectable="true" aria-rowcount="25"`
- **Grid header row:** `role="row" aria-rowindex="1"`
- **Column header:** `role="columnheader" aria-sort="none|ascending|descending"`
- **Grid data row:** `role="row" aria-rowindex="N" aria-selected="false|true"`
- **Checkbox cell:** `role="gridcell" aria-colindex="1"`; checkbox: `role="checkbox" aria-label="Select CON-0025"`
- **Status cell (editable):** `role="gridcell" aria-colindex="4" aria-readonly="false"`; combobox: `role="combobox" aria-expanded="false" aria-label="Status for CON-0025"`
- **Last Sync cell:** `role="gridcell" aria-label="Last sync 2 minutes ago — 06/15/26 08:22"`
- **BulkActionBar:** `role="toolbar" aria-label="Bulk actions — 3 selected" aria-live="polite"`
- **Pagination:** `role="navigation" aria-label="Grid pagination"`
- **DetailSlideover:** `role="dialog" aria-label="Connector CON-0025 details" aria-modal="true"`
- **Slideover close:** `aria-label="Close details"`
- **Slideover expand:** `aria-label="Expand to 420px"`
- **DetailTabBar:** `role="tablist" aria-label="Connector detail sections"`
- **Log stream:** `role="log" aria-label="Sync logs for CON-0025" aria-live="polite"`
- **Sync in progress:** `aria-busy="true"` on connector row; `role="status" aria-label="Syncing CON-0024"`
- **Toast:** `role="alert" aria-live="assertive"`
- **New Connector wizard:** `role="dialog" aria-label="Create new connector — Step 1 of 5: Select Type" aria-modal="true"`
- **Progress bar (wizard):** `role="progressbar" aria-valuenow="1" aria-valuemin="1" aria-valuemax="5" aria-label="Step 1 of 5"`

### Edge Cases Handled

- **No connectors at all:** Full-page empty state with wizard CTA; summary/tabs hidden
- **All connectors error:** Error tab active; summary cards show 0 active / 0 disabled; error card highlighted; bulk retry available
- **Single connector:** 1 row; pagination hidden; summary strip shows counts (1 active / 0 error / 0 disabled)
- **Connector with no sync ever:** Last Sync shows "Never" with gray dash icon; History tab shows "No sync history yet"
- **Long-running sync (>5 min):** Status shows "Syncing (4m 32s)"; spinner persists; cancel option appears in detail; auto-timeout at configurable threshold
- **Sync partial failure:** Sync completes with warnings; status stays Active; detail shows "142 records synced, 3 failed — [View failures]"; yellow warning dot on Last Sync
- **Credential expiry:** Warning banner in detail Config tab "Credentials expire in 3 days — [Update]"; row shows warning icon; not counted as Error
- **Endpoint unreachable (DNS):** Error message "Host not found: edi.partner.com"; suggests checking hostname; Test Connection button disabled during backoff
- **Rate limit hit:** Error message "Rate limited — 429 Too Many Requests"; retry backoff respects Retry-After header; detail shows rate limit info
- **Concurrent syncs:** Multiple connectors can sync simultaneously; grid shows active spinners on all syncing rows; no global sync lock
- **Bulk retry with mixed status:** Retry only triggers for Enabled/Error connectors; Disabled skipped with toast "Skipped 2 disabled connectors"
- **Delete connector:** Confirm dialog "Delete EDI 850 Outbound? This cannot be undone. [Cancel] [Delete]"; after delete, row removed; if was last row of page, navigate to previous page
- **Export connector configs:** Bulk action exports configs as JSON; sensitive fields (passwords, keys) redacted with [REDACTED]
- **Large log (>10k lines):** Logs tab loads last 1000 lines initially; "Load more" button at top; Download Full Log exports complete file
- **Keyboard navigation:** Arrow keys for grid; F2 to edit status; Enter to open detail; Tab cycles toolbar→grid→detail; Escape closes
- **Screen reader:** "3 connectors in error state" on filter; "Syncing CON-0024 — 142 records processed" on sync
