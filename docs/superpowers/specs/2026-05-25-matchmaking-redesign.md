# Matchmaking Redesign — Design Spec

**Date:** 2026-05-25  
**Capability:** CAP-029 / CMD-MATCHMAKING  
**Status:** Approved for implementation planning  
**QA tier:** Deep QA (operator workflow, data integrity, multi-surface integration)  

---

## Overview

Matchmaking is the system's demand-supply balancing layer. It is not a standalone scratchpad — it is a lens the operator applies to the entire business: what do customers want, what do vendors have, what is in stock and who should buy it, and what gaps exist that need to be sourced.

The current implementation covers only a partial version of Leg 1 (capture). This redesign completes all three legs, fixes known UX and structural problems, and integrates matchmaking signals selectively into the views where they have the most natural value — without polluting every grid or confusing the operator.

### Three legs

| Leg | Description | Data sources |
|---|---|---|
| **Leg 1 — Capture** | Record what customers say they want and what vendors say they have, even before any inventory is in the system. | `customer_needs`, `vendor_supply`, `matchmaking_matches` |
| **Leg 2 — Inventory to move** | Given what is in inventory now, surface which customers are likely buyers based on their posted needs and purchase history. | `batches`, `sales_orders`, `customer_needs`, `matchmaking_matches` |
| **Leg 3 — Gaps to fill** | Given low or missing inventory in certain product slices, surface which vendors to contact based on their posted supply and historical sales to the operator. | `batches`, `purchase_orders`, `vendor_supply` |

History is a first-class signal for Legs 2 and 3. A customer who bought a category three times in the last 90 days is a match candidate for current inventory even with no posted need. A vendor who has historically supplied a category is a contact candidate for a gap even with no posted supply record.

No AI is used. All matching is deterministic and based on visible, tunable rules.

---

## Dedicated View — `/matchmaking`

Five stacked panels in order. All panels use the existing `WorkspacePanel` collapsible pattern.

---

### Panel 0 — Settings (collapsible, collapsed by default)

A `⚙ Matchmaking Settings` panel at the top of the view. Visible to all roles, writable by manager+. When collapsed, shows a single summary line:

> `Showing matches ≥ 35 · Work queue alerts ≥ 75 · 90-day history`

Expanded state shows five controls and two discovery toggles:

#### Threshold controls

| Setting | Label | Default | Input type | Constraint |
|---|---|---|---|---|
| Match quality floor | "Show matches scoring at least" | 35 | Number input (0–100) | Must be ≤ work queue threshold |
| Work queue threshold | "Add to work queue at" | 75 | Number input (0–100) | Must be ≥ match quality floor |
| History lookback | "Look back" | 90 days | Dropdown: 30 / 60 / 90 / 180 | — |
| Repeat buyer / supplier threshold | "Flag as repeat after" | 3 purchases | Dropdown: 2 / 3 / 5 | — |
| Inventory gap floor | "Flag gaps when on hand drops to" | 0 units | Number input (≥ 0) | — |

Server validates that `workQueueThreshold >= matchQualityFloor` on `updateMatchmakingSettings`. Invalid combinations return a command error with a plain-language message.

#### Scoring rubric (expandable sub-section, collapsed by default)

Static text block. Not computed dynamically. Shows how the 100 points are allocated so the operator understands why a match scored what it scored:

```
Category match:                    +35
Tag overlap (each shared tag):      +8  (capped at +24)
Product name token overlap:        +10
Vendor qty covers need minimum:    +12
Asking price ≤ target price:       +12
Supply available by needed-by:      +7
─────────────────────────────────────
Maximum score:                     100
```

Rows under the match quality floor are dimmed in the match grid, not hidden. Rows under 35 (hard floor) are hidden unless no better match exists for a need (in which case the best available candidate is shown with a "Low confidence" label).

#### Grid discovery toggles

Two checkboxes, off by default:

- `[ ] Show matchmaking signals in Clients grid`
- `[ ] Show matchmaking signals in Vendors grid`

When checked, the "Matchmaking" column becomes visible in the respective grid. When unchecked, the column is hidden. This is the canonical on/off control — the column chooser can hide the column after it has been enabled here, but these checkboxes are the primary discovery surface.

#### Work queue toggle

- `[ ] Show matchmaking opportunities in work queue` (on by default)

When unchecked, no matchmaking items appear in the work queue. Setting change is audited via `updateMatchmakingSettings`.

All settings changes go through `updateMatchmakingSettings` (manager+, audited, reversible).

---

### Panel 1 — Open Signals (Leg 1 capture)

Two side-by-side entry strips. On viewports narrower than `xl`, they stack vertically.

#### Customer need entry strip — 6 fields

Customer (select, required) · What / product description (text, required) · Category (select, required) · Qty min (number, required, > 0) · Target price (number, optional) · Needed by (date, optional)

**[Add Need]** button: disabled until customer, product, category, and qty min are set.

After submission: customer and category remain selected (fast multi-entry for same customer). Product, qty min, target price, and needed by clear. Tags, urgency, and notes are available via inline grid edit after the row is created.

#### Vendor stock entry strip — 6 fields

Vendor (select, required) · Product (text, required) · Category (select, required) · Qty available (number, required, > 0) · Asking price (number, optional) · Available date (date, optional)

**[Add Stock]** button: disabled until vendor, product, category, and qty are set.

After submission: vendor and category remain. Product, qty, asking price, and available date clear.

#### Open Needs grid — ≤8 columns

| needCode | customer | productName | qtyMin–qtyMax | targetPrice | neededBy | urgency | status |
|---|---|---|---|---|---|---|---|

Inline editable. All fields including tags, notes, and category available via cell edit.

#### Open Stock grid — ≤8 columns

| supplyCode | vendor | productName | availableQty | askingPrice | availableDate | location | status |
|---|---|---|---|---|---|---|---|

Inline editable. All fields including tags, notes, grade, and terms available via cell edit.

The two grids are side-by-side (`xl:grid-cols-2`), stacking below `xl`.

---

### Panel 2 — Deterministic Matches (Leg 1 outputs)

Single grid, **8 columns**:

| score | customer | request | vendor | product | priceFit | qtyFit | status |
|---|---|---|---|---|---|---|---|

- `priceFit`: rendered as `$120 ask / $130 target ✓` or `$150 ask / $130 target ✗`
- `qtyFit`: rendered as `50 avail / 30 need ✓` or `20 avail / 30 need ✗`
- `reasons`: visible in row expansion only (already implemented)
- Accept / Dismiss / Reopen buttons in row expansion (already implemented)
- Bulk Accept / Bulk Dismiss via selection toolbar
- Below match quality floor: not shown, except when it is the only candidate for a need (shown with a "Low confidence" chip)
- At or above match quality floor but below 35 (confidence threshold): shown with a "Low confidence" chip
- At or above 35: shown normally
- The confidence threshold (35) is fixed; only the match quality floor is user-configurable

---

### Panel 3 — Inventory to Move (Leg 2)

Label: displayed in muted text below panel title — `"Based on purchase history (last [N] days)"`

Grid, ≤8 columns:

| product | category | onHand | customer | signal | lastActivity | score | action |
|---|---|---|---|---|---|---|---|

- `signal`: chip showing **Posted need**, **History**, or **Both**
- `lastActivity`: most recent sales order date for this customer + category, or need creation date
- `score`: deterministic score between this inventory item's category/tags and the customer need (if a posted need exists); blank for history-only signals
- `action`: single button — logs `noteMatchmakingOutreach` and snoozes this (inventory item, customer) pair for 30 days. Button label TBD during implementation (e.g., "Note contact" or "Mark actioned").

Rows are independently dismissible via the action button. Limit: top 25 rows by signal quality (Both > Posted need > History, then by score desc within each group). Query is bounded at the server.

Excluded from results: customers who already have an accepted `matchmaking_match` for a need in this category.

---

### Panel 4 — Gaps to Fill (Leg 3)

Label: `"Based on purchase history (last [N] days)"`  
Panel title and exact labels are subject to naming refinement — treat as placeholders.

Grid, ≤8 columns:

| category | onHand | gapLevel | vendor | signal | lastActivity | postedQty | action |
|---|---|---|---|---|---|---|---|

- `gapLevel`: chip — **Empty** (on hand = 0) or **Low** (on hand ≤ gap floor setting, when floor > 0)
- `signal`: **Posted supply**, **History**, or **Both**
- `lastActivity`: most recent purchase order date for this vendor + category, or supply creation date
- `postedQty`: available qty from `vendor_supply` record if one exists; blank otherwise
- `action`: same pattern as Leg 2 — logs `noteMatchmakingOutreach`, snoozes this (category, vendor) pair for 30 days

Limit: top 25 rows. Excluded: vendors snoozed within the last 30 days (checked via command journal).

---

## Ambient Signals

### Clients grid — "Matchmaking" column

Controlled by the settings panel toggle (off by default).

When enabled: a `Matchmaking` column appears in the Clients grid showing `{N} needs · {M} matches` or `No activity`. Clicking the cell navigates to `/matchmaking?customer={id}`. The matchmaking view filters Panels 1 and 2 to show only rows for that customer when this parameter is present.

The count data is fetched via a separate lightweight query `queries.matchmakingEntityCounts` — **not** joined into the primary Clients grid query. This prevents matchmaking aggregation load from affecting grid load time.

### Vendors grid — "Matchmaking" column

Same pattern. Shows `{N} stock listed` or `No activity`. (Gap fit counts are not included in v1 — computing per-vendor gap matches is too expensive as an ambient signal.) Links to `/matchmaking?vendor={id}`. Same separate query.

`queries.matchmakingEntityCounts` returns counts for all customers and vendors in a single query (two aggregations). It is only executed when at least one discovery toggle is enabled.

### Work queue (Dashboard)

When work queue toggle is on, matchmaking items appear in the existing work queue as a **Matchmaking** lane alongside Intake, Purchase, and Sales lanes. Only three categories of items qualify:

1. Deterministic match with score ≥ work queue threshold setting
2. Leg 2 opportunity with **Both** signal basis (posted need + repeat history)
3. Leg 3 opportunity with **Empty** gap level (zero on hand)

Each work queue item shows: lane badge · short description · customer or vendor name · one-click link to `/matchmaking`.

Individual items are dismissible via `dismissMatchmakingWorkQueueItem` (snoozes that specific item for 30 days). The global work queue toggle in settings mutes all matchmaking lane items.

---

## State Machine (DYN-H4 fix)

Server enforces all transitions. Invalid transitions return a command error with a plain-language message. No silent state corruption.

### Customer need

```
open ──── (first match accepted) ──── matched
  │                                      │
  │                                      └── (accepted match reopened, no other accepted match) → open
  │
  └── (manual close) → closed
matched ── (manual close) → closed
```

Valid statuses: `open`, `matched`, `closed`

### Vendor supply

```
open ──── (first match accepted) ──── held_for_match
  │                                            │
  │                                            └── (accepted match reopened, no other accepted match) → open
  │
  └── (manual close) → closed
held_for_match ── (manual close) → closed
```

Valid statuses: `open`, `held_for_match`, `closed`

### Match

```
open ──── acceptMatchmakingMatch ──── accepted
  │                                      │
  │                                      └── reopenMatchmakingMatch → open
  │
  └── dismissMatchmakingMatch ──── dismissed
                                        │
                                        └── reopenMatchmakingMatch → open
```

Valid statuses: `open`, `accepted`, `dismissed`

**Manual close**: `updateCustomerNeed` and `updateVendorSupply` accept an explicit `status: 'closed'` field to allow an operator to close a need or supply directly. This is valid from `open` or `matched`/`held`. The server enforces no further transitions from `closed`.

**Cascade rule**: when a match is accepted, the associated need moves to `matched` and the associated supply moves to `held` — unless they already have another accepted match (idempotent). When a match is reopened, need and supply revert to `open` only if no other accepted match exists for each.

---

## Backend

### New table — `matchmaking_settings`

Single workspace-level row. Seeded with defaults on first query if no row exists (safe fallback — never throws on first load).

```sql
create table matchmaking_settings (
  id uuid primary key default gen_random_uuid(),
  match_quality_floor integer not null default 35,
  work_queue_threshold integer not null default 75,
  history_lookback_days integer not null default 90,
  repeat_threshold integer not null default 3,
  gap_floor_qty integer not null default 0,
  show_clients_column boolean not null default false,
  show_vendors_column boolean not null default false,
  work_queue_enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references users(id)
);
```

### New tRPC queries

**`queries.matchmakingSettings`**  
Returns the single settings row (or defaults if no row exists).

**`queries.matchmakingOpportunities`**  
Returns `{ toMove: Row[], toSource: Row[] }`. Each array capped at 25 rows.

- `toMove` (Leg 2): joins `batches` (in-stock) → `sales_orders` (aggregated by customer + category over lookback window) + `customer_needs` (open, matching category) + `matchmaking_matches` (to exclude customers who already have an accepted match for a need in this category). Ranked: Both > Posted need > History.
- `toSource` (Leg 3): identifies categories where sum of in-stock batch qty ≤ gap floor. Joins `purchase_orders` (aggregated by vendor + category over lookback window) + `vendor_supply` (open, matching category). Excludes vendors snoozed within 30 days (checked via command journal). Ranked: Both > Posted supply > History.

Both legs use the `history_lookback_days` and `repeat_threshold` settings at query time.

**`queries.matchmakingEntityCounts`**  
Lightweight aggregation. Returns `{ customers: { [id]: { needs: number, matches: number } }, vendors: { [id]: { supply: number } } }`. Customer counts are open need count + accepted match count. Vendor count is open supply record count. Only executed when `showClientsColumn` or `showVendorsColumn` is true. Fetched independently from the primary grid queries.

### Updated tRPC query

**`queries.workQueue`**  
Two new UNION branches added, each guarded by `workQueueEnabled` setting check at query time. If `workQueueEnabled` is false, branches are skipped entirely (no performance cost).

### New migrations

One migration file: adds `matchmaking_settings` table. No changes to existing tables.

### New commands

All commands are typed, idempotent, role-gated, audited, and replay-safe.

| Command | Role gate | Description |
|---|---|---|
| `updateMatchmakingSettings` | manager | Updates workspace matchmaking settings. Validates `workQueueThreshold >= matchQualityFloor`. |
| `noteMatchmakingOutreach` | operator | Logs intent to contact a customer (Leg 2) or vendor (Leg 3). Fields: `entityType` (customer \| vendor), `entityId` (uuid), `context` (category slug or batch id), `leg` (2 \| 3). Snoozes the pair for 30 days. No ledger mutations. |
| `dismissMatchmakingWorkQueueItem` | operator | Snoozes a specific work queue matchmaking item for 30 days. For `itemType: 'match'`, uses `itemId` (match UUID). For `itemType: 'opportunity'`, re-routes internally to `noteMatchmakingOutreach` using the pair context — no separate snooze record is created. |

### Updated command catalog

Add to `commandCatalog.ts`:
- `updateMatchmakingSettings: 'Update matchmaking settings'`
- `noteMatchmakingOutreach: 'Note matchmaking outreach'`
- `dismissMatchmakingWorkQueueItem: 'Dismiss matchmaking work queue item'`

Add to role gates:
- `updateMatchmakingSettings: 'manager'`
- `noteMatchmakingOutreach: 'operator'`
- `dismissMatchmakingWorkQueueItem: 'operator'`

---

## URL Parameter Support

`/matchmaking?customer={id}` — filters Panels 1 and 2 to show only rows for that customer. Filter chip appears below the panel title with a clear / reset control.

`/matchmaking?vendor={id}` — same pattern for vendor.

No other URL parameters are supported in this version.

---

## Non-Goals

- No AI matching
- No auto purchase order creation
- No auto sales order creation
- No customer-facing output
- No connector mutation path
- No per-category inventory gap thresholds (single workspace-wide floor only)
- No velocity / trend analysis for gaps
- No per-operator settings

---

## Acceptance Criteria

### Leg 1 (capture)
- [ ] Operator can add a customer need with 6 fields in under 10 seconds
- [ ] Operator can add vendor stock with 6 fields in under 10 seconds
- [ ] After submission, customer and category persist; product, qty, price, and date clear
- [ ] Creating a need + compatible supply produces an open match with visible score and reasons
- [ ] Updating category, tags, qty, or price recomputes matches
- [ ] Match grid shows ≤8 columns with score, priceFit, and qtyFit rendered readably
- [ ] Reasons appear in row expansion, not in the grid

### Leg 2 (inventory to move)
- [ ] Operator sees a customer in the panel when that customer has a posted need in a category that is in stock
- [ ] Operator sees a customer in the panel when that customer has bought that category ≥ repeat threshold times in the lookback window, even with no posted need
- [ ] **Both** signal appears when both conditions are true
- [ ] Actioning a row logs `noteMatchmakingOutreach` and removes the row for 30 days
- [ ] Panel shows at most 25 rows

### Leg 3 (gaps to fill)
- [ ] Operator sees a vendor in the panel when on-hand qty for a category is ≤ gap floor
- [ ] Operator sees a vendor when that vendor has historically supplied this category within the lookback window
- [ ] **Both** signal appears when both conditions are true
- [ ] Actioning a row logs `noteMatchmakingOutreach` and removes the row for 30 days
- [ ] Panel shows at most 25 rows

### Settings
- [ ] Manager can update all five threshold controls
- [ ] `workQueueThreshold < matchQualityFloor` returns a command error
- [ ] Settings persist across sessions
- [ ] Collapsed settings panel shows current threshold summary
- [ ] Scoring rubric is visible and matches the documented scoring rules

### Ambient signals
- [ ] Clients and Vendors matchmaking columns are off by default
- [ ] Enabling them from the matchmaking settings panel makes them visible in the respective grid
- [ ] Clicking a cell navigates to `/matchmaking?customer={id}` or `?vendor={id}` correctly
- [ ] Count data fetched via separate query — not slowing down primary grid load

### Work queue
- [ ] High-score matches and high-signal opportunities appear in the work queue when enabled
- [ ] Global toggle disables all matchmaking work queue items
- [ ] Individual items are dismissible
- [ ] No matchmaking items appear when toggle is off

### State machine (DYN-H4)
- [ ] Accepting a match moves need to `matched` and supply to `held`
- [ ] Reopening a match reverts need/supply to `open` only if no other accepted match exists
- [ ] Invalid status transitions return a command error
- [ ] Viewer role cannot create, edit, accept, dismiss, or reopen

---

## Open Items

- Final naming for: "Gaps to fill", "Inventory to move", "Note contact" action button, "Signal" column header. Resolve during implementation review with Evan.
- Query performance for Legs 2 and 3 must be tested against the realistic seed dataset before ship. If either query exceeds ~200ms on the seed, add a DB index or query plan optimization before closing the issue.

