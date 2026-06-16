# Wireframe: WF-V-PROCESSORS — ProcessorsView

**Template:** GridView
**Entity:** PaymentProcessor
**Wireframe ID:** WF-V-PROCESSORS

---

## Full View — Default State (Tab: All, No Selection)

```
┌─View Header──────────────────────────────────────────────────────────────┐
│ Payment Processors                                         [Add Processor] │
└───────────────────────────────────────────────────────────────────────────┘
┌─FilterToolbar────────────────────────────────────────────────────────────┐
│ [▾ Data views]  │  Date ▾  │  Keyword ▾  │  Type ▾  │ Status ▾  │ Sort ▾ │ ⬇ │
└───────────────────────────────────────────────────────────────────────────┘
┌─GridSummaryStrip─────────────────────────────────────────────────────────┐
│ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐      │
│ │ 18 Processors│ │ 12 Active    │ │ $847M Total  │ │ 99.2% Succ   │      │
│ │    Total     │ │   Online     │ │  Processed   │ │   Rate       │      │
│ └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘      │
└───────────────────────────────────────────────────────────────────────────┘
┌─ViewTabBar───────────────────────────────────────────────────────────────┐
│  All (18) │ Active (12) │ Inactive (4) │ Error (2)                        │
└───────────────────────────────────────────────────────────────────────────┘
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
│   │           │                    │            │ ⚠ API  │ BTH-8812 · ⚠   │ 201 tx       │
│ ☐ │ PRC-0014  │ Wise Business      │ Transfer   │ Active  │ Jun 15 06:55   │ $2.8M  █░░░░ │
│   │           │                    │            │ ● Online│ BTH-8835 · ✓   │ 89 tx        │
│ ☑ │ PRC-0013  │ Square Terminal    │ Terminal   │ Inactive│ May 28 14:12   │ $0          │
│   │           │                    │            │ ○ Off   │ BTH-8104 · ✓   │ 0 tx         │
│ ☐ │ PRC-0012  │ Modern Treasury    │ Gateway    │ Active  │ Jun 15 10:01   │ $22.7M █████ │
│   │           │                    │            │ ● Online│ BTH-8843 · ✓   │ 941 tx       │
└───┴───────────┴────────────────────┴────────────┴─────────┴────────────────┴──────────────┘
┌─BulkActionBar (conditional)──────────────────────────────────────────────┐
│ 1 processor selected                                                      │
│ [View Config] [Run Batch Now] [Deactivate] [View Transactions]            │
└───────────────────────────────────────────────────────────────────────────┘
┌─DetailSlideover: Peek (280px)────────────────────────────────────────────┐
│ PRC-0012                                             ×                   │
│ Modern Treasury · Gateway                                                 │
│ ● Online · 99.8% Success Rate                                            │
│ Last Batch: BTH-8843 · Jun 15 10:01 · ✓                                  │
│ 30-Day Volume: $22.7M · 941 transactions                                 │
│ Processing: $847K today                                                   │
│ [View Config] [Run Batch] [Transactions]                                 │
│ ◀ drag                                                                    │
└───────────────────────────────────────────────────────────────────────────┘
```

---

## Volume Visualization — Inline Metric Bar

```
│ $14.2M ████░ │  ← Volume bar: proportional to max in view
│ 847 tx       │  ← Transaction count below
```

- Bar width: proportional to the largest volume in current filtered view.
- Each `█` = ~20% of max. `░` = unfilled portion.
- Color: Green (Active), Grey (Inactive), Red (Error).
- ARIA: role="meter", aria-valuenow, aria-valuemax (set to max volume in view).

---

## Status Cell Detail

```
│ Active  │
│ ● Online│  ← Green dot + "Online" for active processors
```
- Error state: ⚠ icon + error type ("API Error", "Auth Failed", "Timeout", "Rate Limited").
- Inactive: ○ grey dot + "Offline".

---

## DetailSlideover: Standard (420px) — Batches Tab

```
┌─Main Content (shifts left)───────────────────┬─DetailSlideover: Standard─┐
│                                               │ PRC-0012                   │
│  [Grid is narrower, fully functional]         │ Modern Treasury · Gateway  │
│                                               │ ● Online · 99.8% success   │
│                                               │ [Run Batch] [Pause] [Conf] │
│                                               │────────────────────────────│
│                                               │ Config│ Batch │ Txn │ Hist │
│                                               │       │   ▾   │     │      │
│                                               │────────────────────────────│
│                                               │ Recent Batches:            │
│                                               │ ┌────────────────────────┐ │
│                                               │ │ BTH-8843  Jun 15 10:01 │ │
│                                               │ │   ✓ 47 tx · $847K      │ │
│                                               │ │ BTH-8840  Jun 15 08:00 │ │
│                                               │ │   ✓ 52 tx · $892K      │ │
│                                               │ │ BTH-8838  Jun 15 06:00 │ │
│                                               │ │   ✓ 41 tx · $724K      │ │
│                                               │ │ BTH-8834  Jun 14 22:00 │ │
│                                               │ │   ⚠ 44/47 tx · $810K   │ │
│                                               │ │   3 failed: timeout     │ │
│                                               │ │ BTH-8830  Jun 14 20:00 │ │
│                                               │ │   ✓ 38 tx · $671K      │ │
│                                               │ └────────────────────────┘ │
│                                               │ [View All Batches →]       │
└───────────────────────────────────────────────┴────────────────────────────┘
```

---

## DetailSlideover — Config Tab

```
│ Config│ Batch │ Txn │ Hist │
│   ▾    │       │     │      │
│────────────────────────────│
│ Connection:                │
│ ┌────────────────────────┐ │
│ │ Type       Gateway      │ │
│ │ Provider   Modern Trsr. │ │
│ │ API Key    mt_live_•••• │ │  ← masked, click to reveal
│ │ Webhook    https://...  │ │
│ │ Region     US East      │ │
│ │ Created    Jan 12 2024  │ │
│ │ Last Mod   Jun 01 2026  │ │
│ └────────────────────────┘ │
│ Batch Schedule:            │
│ ┌────────────────────────┐ │
│ │ Frequency  Every 2 hrs  │ │  ← ComboboxCellEditor
│ │ Cutoff     $50,000      │ │  ← batch when total ≥ cutoff
│ │ Max Size   100 tx       │ │
│ │ Retry      3 attempts   │ │
│ │ Timeout    30 seconds   │ │
│ └────────────────────────┘ │
│ [Edit Configuration]        │
│ [Test Connection]           │
│ [Rotate API Key]            │
```

---

## DetailSlideover — Transactions Tab (Drill-Down)

```
│ Config│ Batch │ Txn │ Hist │
│       │       │  ▾  │      │
│────────────────────────────│
│ Recent Transactions:       │
│ ┌────────────────────────┐ │
│ │ TXN-44217  $12,400  ✓  │ │
│ │   PO-8841 · Acme Corp  │ │
│ │ TXN-44216  $8,200   ✓  │ │
│ │   SO-7732 · BerryBest  │ │
│ │ TXN-44215  $15,600  ⚠  │ │
│ │   PO-8837 · GreenValley│ │
│ │   Declined: NSF         │ │
│ │ TXN-44214  $3,400   ✓  │ │
│ │   INV-2214 · FarmDirect│ │
│ │ ... 937 more            │ │
│ └────────────────────────┘ │
│ Today: $847K · 47 tx · 100%│
│ [View All Transactions →]  │
```

---

## Volume Metric Visualization — SummaryStrip Detail

```
│ $847M Total  │
│  Processed   │
│██████████████│  ← horizontal bar, segments by processor
│ Stripe 42% Modern 28% JP Morgan 15% Other 15%│
```

- Segmented bar showing each processor's share of total volume.
- Legend below bar with processor names + percentages.
- Hover segment → tooltip: "Stripe Connect: $355.7M (42%)."

---

## Dimensions

- View container: 100vw × 100vh
- View Header: 56px tall. [Add Processor] button.
- FilterToolbar: 44px tall. Type quick filter: Gateway/ACH/Transfer/Terminal/Wallet/Other.
- GridSummaryStrip: 80px tall, 4 metric cards. Total Processed card shows segmented bar (48px tall).
- ViewTabBar: 40px tall. "Error" tab has red count badge when >0.
- AG Grid: 32px row height. ID column 110px. Name column 200px (two-line: name + provider detail). Type column 110px. Status column 130px (dot + label + detail). Last Batch column 180px (two-line: ID + timestamp + status). Volume column 160px (bar + dollar + tx count).
- Volume inline bar: 6px tall, full cell width. Proportional to max.
- Segmented volume bar (SummaryStrip): 12px tall, full card width. Colored segments.
- Batch rows: 48px tall. ID + timestamp + status + stats.
- Config rows: 32px tall. Label-value pairs.
- Transaction rows: 40px tall. ID + amount + status + description.
- BulkActionBar: 52px tall.
- DetailSlideover: Peek 280px → Standard 420px → Wide 60vw.
- Font: Inter 13px body, 11px secondary, 14px header.

---

## Interactive Elements

- **Status cell:** Double-click → ComboboxCellEditor (Active/Inactive). Error status is non-editable (must resolve underlying issue).
- **Volume bar:** Hover → tooltip with exact volume and transaction count. Click → opens Transactions tab filtered to that processor.
- **Last Batch cell:** Click → opens Batches tab for that processor. Status icon clickable — navigates to batch detail.
- **Row click:** Single-click → DetailSlideover peek. Double-click → standard.
- **Add Processor button:** Opens multi-step setup wizard. Step 1: Select provider type. Step 2: Enter API credentials (validated in real-time with Test Connection). Step 3: Configure batch schedule. Step 4: Review and activate.
- **BulkActionBar Run Batch Now:** Manually triggers batch processing for selected processors. Shows progress: "Processing batch for 2 processors..."
- **BulkActionBar Deactivate:** Sets selected processors to Inactive. Confirmation required. "Deactivate Stripe Connect? Pending transactions will be held."
- **BulkActionBar View Transactions:** Opens transactions view filtered to selected processors.
- **Config tab — Test Connection:** Sends test ping to processor API. Shows result: green check "Connection successful (142ms)" or red "Connection failed: Invalid API key."
- **Config tab — Rotate API Key:** Initiates key rotation flow. Generates new key, shows once, prompts to update processor portal.
- **Config tab — Edit Configuration:** Inline editing. All fields editable with validation.
- **Batches tab — Batch rows:** Click → batch detail view. Shows transaction list for that batch. Retry button for failed batches.
- **Transactions tab — Transaction rows:** Click → transaction detail. Shows full payment lifecycle. Linked order/invoice.
- **SummaryStrip segmented bar:** Hover segment → tooltip with processor name + volume + percentage. Click segment → filters grid to that processor.

---

## States Shown

- **Default (All tab):** All processors visible. Active highlighted. Volume bars proportional.
- **Error tab:** Only processors in error state. Red warning banner at top: "2 processors reporting errors. Action required." Error type shown in status column.
- **Processor error (API):** Red status dot + "API Error" label. Last batch shows ⚠. Hover: "API returned 401 Unauthorized. Key may be expired." Action: "Re-authenticate" button in detail view.
- **Processor error (timeout):** Amber status dot + "Timeout" label. "3 consecutive timeouts. Batch processing paused." Action: "Resume" or "Test Connection."
- **Processor error (rate limited):** Amber dot + "Rate Limited." "429 Too Many Requests. Retry after: 4m 32s." Countdown timer.
- **Inactive processor:** Grey row. "Deactivated Jun 01, 2026." "Reactivate" action available.
- **Batch running:** Progress indicator in Last Batch column. "Processing... 23/47 tx." Spinner icon.
- **Batch success:** Green checkmark. Batch stats: "47 tx · $847K · 2.3s avg."
- **Batch partial failure:** Amber warning. "44/47 tx succeeded. 3 failed." Expand for failure details.
- **Empty state:** "No processors configured." CTA: "Add your first payment processor." Quick-start guide link.
- **Loading:** Skeleton rows. SummaryStrip cards show pulsing bars.
- **Connection test running:** "Testing..." with spinner. Result appears inline.

---

## ARIA Annotations

- View container: role="region", aria-label="Payment processors"
- FilterToolbar: role="menubar", aria-label="Filter and data controls"
- GridSummaryStrip: role="region", aria-label="Processor summary metrics"
- Segmented volume bar: role="img", aria-label="Processor volume distribution: Stripe Connect 42 percent, Modern Treasury 28 percent, JP Morgan ACH 15 percent, others 15 percent"
- ViewTabBar: role="tablist", aria-label="Processor status filters"
- Error tab badge: aria-label="2 processors with errors"
- AG Grid: role="grid", aria-label="Payment processor records"
- Status cell: role="gridcell". Status dot: aria-hidden="true". Status text provides semantics.
- Status cell (editing): role="combobox", aria-haspopup="listbox"
- Volume bar: role="meter", aria-valuenow, aria-valuemax, aria-label="30-day volume: $14.2 million, 847 transactions"
- Last Batch cell: role="gridcell". Batch link: role="link", aria-label="Batch BTH-8841 — completed successfully"
- Error indicator: role="status", aria-label="Processor error: API authentication failed"
- BulkActionBar: role="toolbar", aria-label="Processor actions"
- DetailSlideover: role="complementary", aria-label="Processor details"
- Config tab: role="tabpanel", aria-label="Processor configuration". API key field: role="textbox", aria-label="API key (masked)"
- Test Connection button: role="button", aria-label="Test connection to Modern Treasury". Result: aria-live="polite"
- Batches tab: role="tabpanel", aria-label="Recent batches"
- Batch rows: role="row". Status: aria-label="Batch completed — 47 transactions, $847,000"
- Transactions tab: role="tabpanel", aria-label="Recent transactions"
- Transaction rows: role="row". Amount: aria-label="Transaction $12,400 — completed"

---

## Edge Cases Handled

- **Processor API key expired:** Auto-detected on next batch attempt. Status auto-transitions to Error. "API Key Expired" error type. Notification sent. One-click "Re-authenticate" flow.
- **Processor with zero volume (new/inactive):** Volume bar shows empty. "$0 · 0 tx." SummaryStrip excludes from segmented bar.
- **Very high volume processor (dominates segmented bar):** Other processors still visible as thin segments. "Others" grouping if a segment would be <3%. Tooltip shows breakdown.
- **Batch processing during deactivation:** Deactivation queues. "Processor will deactivate after current batch completes." Status shows "Deactivating..."
- **Concurrent manual batch trigger:** If batch already running: "Batch already in progress. Started at 10:01 AM." Queue button: "Queue next batch."
- **Processor with no recent batches:** "No batches in last 30 days." Volume shows historical total with "Historical" badge.
- **Multiple processors of same type:** Type grouping in filter. "3 Gateway processors." Config comparison view.
- **Rate limit countdown:** Real-time countdown timer in status cell. "Retry in 2m 14s." Auto-retry when timer expires (configurable).
- **Webhook failure:** Status shows "Webhook Error." Detail shows last successful webhook timestamp. "Webhook not received in 4 hours."
- **Processor migration (changing providers):** Import config from old processor. "Migrate from Square Terminal to Stripe Terminal." Guided wizard.
