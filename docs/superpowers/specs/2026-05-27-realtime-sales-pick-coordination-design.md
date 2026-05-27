# TERP Operator — Real-Time Sales Order ↔ Pick/Pack Coordination

**Date:** 2026-05-27  
**Status:** Frontend spec approved. **Frontend must not ship until the four backend surfaces in Section 5 are implemented and tested.**  
**Scope:** Frontend only. Backend emission points are identified and contracted here; full backend spec is a separate deliverable.

---

## Product Intent

A sales operator at the desktop and a warehouse picker on mobile work the same order simultaneously. Currently there is no real-time coordination between the two surfaces — the sales grid does not reflect pick state, the picker gets no signal when lines change, and the `releaseLineForPicking` command has no UI entry point on the sales side.

This spec defines the frontend changes that close those gaps.

---

## Dependency Gate

**The frontend changes in Section 5 must not merge until:**

1. `queries.ts` — `salesOrderLines` returns a `fulfillmentStatus` field (`null | 'queued' | 'packed'`).
2. `commandBus.ts` — `releaseLineForPicking` emits the `sales:order:*:line:changed` socket event.
3. `commandBus.ts` — `recallLineFromPicking` emits the event AND creates a warehouse alert record with human-readable `message` text on the fulfillment line.
4. `commandBus.ts` — line removal emits the event with `changeType: 'removed'`.

Without these, status badges show nothing, pickers receive no alerts, and the Scenario B overlay never fires.

---

## Decisions Made

| Decision | Choice | Rationale |
|---|---|---|
| Approach | Inline grid + toolbar (Approach A) | Fits existing AG Grid + Socket.IO + alerts architecture |
| Release UI | Inline row button, not context menu | Discoverable, no extra click |
| Recall availability | Queued AND packed states | Operator always needs to be able to correct qty |
| Recall trigger | Qty changes only | Other edits don't require pulling from the pick queue |
| Status badges | "Queued" + "Packed" only | Minimal — pickers don't need to see every intermediate state |
| New line auto-release | Never — always explicit | Prevents accidental queue injection mid-pick |
| Bulk recall | No | Too risky to accidentally pull multiple in-progress lines |
| Polling fallback | 30s on `salesOrderLines` | Matches pick queue cadence; catches missed socket events |

---

## Roles

| Role | Surface | Primary concern |
|------|---------|-----------------|
| Sales operator | Desktop — SalesView AG Grid | Building the order, controlling what enters the pick queue |
| Warehouse picker | Mobile — `/pick` route | Picking, weighing, packing; needs accurate line state |

These are always two different people.

---

## Line State Machine

```
[draft / editable]
    │
    ├─ Release button pressed (eligibility passes) ──→ QUEUED
    │                                                       │
    │                                              Picker packs line
    │                                                       │
    │                                                    PACKED
    │                                                       │
    └─ Recall button pressed (from QUEUED or PACKED) ──────┘
         → line reverts to [draft / editable]
         → picker gets recall alert
         → sales operator edits qty (or removes line)
         → re-releases when ready → QUEUED again (clean state)
```

No state persists across a recall. When a line is re-released after recall it enters the queue as a fresh line with no prior alert state.

---

## Section 1 — Sales Grid Changes

### 1.1 New `fulfillmentStatus` Column

A read-only column added to the sales order lines AG Grid. Value comes from the `fulfillmentStatus` field on `salesOrderLines` query response (backend contract: Section 5).

| Line state | Badge | Color |
|------------|-------|-------|
| Not released | *(empty)* | — |
| Queued | `Queued` pill | Blue |
| Packed | `Packed` pill | Green |

### 1.2 Inline Row Action Buttons

Visible in each line row alongside the existing row action area.

| Button | Visible when | Command called |
|--------|-------------|----------------|
| `Release` | Line is draft/editable AND passes `releaseEligibility` | `releaseLineForPicking` |
| `Release` (disabled) | Line is draft/editable AND fails `releaseEligibility` | — (tooltip explains why) |
| `Recall` | Line is Queued OR Packed | `recallLineFromPicking` |
| *(neither)* | — | Shouldn't occur; treat as draft |

When a line is Queued or Packed the row is **read-only in the grid** — inline cell edits are disabled. The operator must Recall first, then edit.

### 1.3 Toolbar Bulk Action

When one or more rows are selected, a **"Release selected"** button activates in the grid toolbar.

- Runs `releaseLineForPicking` for all selected lines that pass eligibility.
- Ineligible lines (already Queued/Packed, failing eligibility check) are skipped silently.
- Command failures (network error, backend rejection) are tracked separately from eligibility skips.
- After the batch completes, a toast with the following structure:
  - *"N of M lines released"* — if all eligible lines succeeded and none were skipped or failed.
  - *"N of M lines released — X skipped (not eligible)"* — if some lines were ineligible.
  - *"N of M lines released — Y failed"* — if some commands returned an error.
  - All three clauses combined when all three conditions apply.
- Failed lines remain visually in their pre-attempt state (draft with `[Release]` button) so the operator can see which lines need attention and retry.
- No bulk Recall — intentionally absent.

---

## Section 2 — Real-Time Updates

### 2.1 Pick → Sales (status badges auto-updating)

When a picker packs a line, the sales grid badge must update to "Packed" without a manual refresh.

**Mechanism:** Extend `App.tsx` to listen to the existing `pick:order:*` socket events and invalidate the `salesOrderLines` query for the affected order. The socket event and backend emission already exist — this is one new `queryClient.invalidateQueries` call in the existing handler.

### 2.2 Sales → Pick (changes reaching the picker)

When the sales operator releases, recalls, or removes a line on an order already in active picking state, the backend emits **`sales:order:${orderId}:line:changed`** events.

**Socket subscription strategy:** Use a wildcard listener in `App.tsx` — consistent with how the existing `pick:order:*` handler works via `socket.onAny`. The handler fires on any event matching the `sales:order:` prefix, extracts the orderId from the event name, and invalidates only the queries for that specific order.

```ts
// App.tsx — add alongside existing pick:order:* handler
socket.onAny((event, payload) => {
  if (event.startsWith('sales:order:') && event.endsWith(':line:changed')) {
    const orderId = event.split(':')[2]
    queryClient.invalidateQueries(['pickListWithLines', orderId])
    queryClient.invalidateQueries(['pickQueue'])
    queryClient.invalidateQueries(['salesOrderLines', orderId])
  }
})
```

No room join/leave logic required. No per-order subscription teardown. The wildcard fires only when the backend emits — no spurious traffic for unrelated orders.

**`changeType` values emitted by backend:** `'released'` | `'recalled'` | `'removed'`

> **Important:** `changeType` in the socket payload is for routing only — deciding whether to show Scenario B (overlay) vs. Scenario C (banner). It must **not** be used as the source of truth for alert card text. The alert card reads its message from the warehouse alert record created by the backend (see Section 5 backend contract).

### 2.3 Polling Fallback

`salesOrderLines` query gets `refetchInterval: 30_000`. Matches the existing pick queue polling cadence (`PickView.tsx` line 26). Catches anything a missed socket event would have dropped. No change needed on the pick-side polling (already in place at 30s/10s cadence).

---

## Section 3 — Picker Side Changes

The three scenarios a picker can encounter when the sales operator acts mid-pick:

### Scenario A — Line recalled before picker has started it

Line disappears from `PickListScreen` silently on next query invalidation. Pick list total count updates. When the operator re-releases with corrected qty the line reappears as a fresh row. No interruption to the picker's current work.

### Scenario B — Line recalled while picker is actively on `PickLineScreen` for that line

The picker is mid-weigh/scan and the line is pulled.

- A **full-screen overlay** appears on the socket path (typically <2s). On the polling degraded path (missed socket), the overlay appears within 30s when the `pickListWithLines` query next fires and detects the line is no longer present.
- Copy: *"This line was recalled by sales."*
- Single CTA: **"Got it"** → navigates back to `PickListScreen`.
- No data loss — `recordWeighAndPack` has not been called yet.

> **Success criterion 4** ("Picker sees a recall overlay when their active line is pulled mid-pick") is best-effort on the socket path (<2s typical) and guaranteed within 30s on the polling path. This is acceptable given warehouse mobile network conditions.

### Scenario C — Unacknowledged change on any line in the current pick list

An **amber banner** persists at the top of `PickListScreen`:  
*"Sales updated this order — check flagged lines."*

Individual lines with active alerts show a **warning badge** in the list row. The picker can freely continue picking unaffected lines — they are not globally blocked.

When they navigate to a flagged line's `PickLineScreen`, an **alert card** is pinned above the pack controls:
- Displays the `message` field from the warehouse alert record on the fulfillment line (e.g., *"Recalled by sales — verify quantity with operator"*). Frontend reads from the record, not from the transient socket payload.
- Pack controls are **locked** until the picker taps **Acknowledge**.
- Tapping Acknowledge calls the existing `acknowledgeWarehouseAlert` command.
- After acknowledgment the pack controls unlock and the warning badge clears on that line.
- The amber banner on `PickListScreen` clears only when **all** flagged lines on the order have been acknowledged.

> **No new backend commands needed for Sections 3B and 3C.** The overlay uses existing query state. The alert card + acknowledgment reuses `acknowledgeWarehouseAlert` already implemented in `PickLineScreen`. The alert record message content is the responsibility of the backend spec (Section 5).

---

## Section 4 — Edge Cases

| Scenario | Behavior |
|----------|----------|
| Release button on ineligible line | Button is disabled; tooltip shows reason (from `releaseEligibility` response) |
| Bulk release — mixed eligibility | Eligible lines released; ineligible silently skipped; toast shows counts |
| Bulk release — command failure | Failed lines remain in draft state; toast reports failure count separately from skipped count |
| Race: `recordWeighAndPack` + `recallLineFromPicking` land simultaneously | Backend is authority; frontend re-renders from next query invalidation; no client-side resolution |
| Entire line removed after recall (qty → 0 or row deleted) | Line disappears from sales grid and pick list; picker sees Scenario A |
| New line added while order is in active picking | No badge, no auto-queue; sits in draft; operator must explicitly release |
| Order fully packed — operator adds a new line | Same as above — always explicit release |
| Recall on a Packed line | Same as Recall on Queued — reverts to draft, picker gets recall alert |

---

## Section 5 — Files Affected

### New / modified frontend files

| File | Change |
|------|--------|
| `src/client/views/SalesView.tsx` | Add `fulfillmentStatus` column, `Release`/`Recall` inline buttons, toolbar bulk action with 3-clause toast, `refetchInterval: 30_000` on `salesOrderLines` |
| `src/client/App.tsx` | Add `pick:order:*` → `salesOrderLines` invalidation; add `sales:order:*:line:changed` wildcard handler |
| `src/client/components/pick/PickListScreen.tsx` | Add amber banner for unacknowledged changes; add warning badge per flagged line |
| `src/client/components/pick/PickLineScreen.tsx` | Add recall overlay (Scenario B); alert card above pack controls reads `message` from warehouse alert record |

### Backend contract (required before frontend ships)

| Surface | Required change |
|---------|----------------|
| `queries.ts` — `salesOrderLines` | Return `fulfillmentStatus: null \| 'queued' \| 'packed'` joined from fulfillment lines |
| `commandBus.ts` — `releaseLineForPicking` | Emit `sales:order:${orderId}:line:changed` with `{ orderId, lineId, changeType: 'released' }` |
| `commandBus.ts` — `recallLineFromPicking` | Emit event with `changeType: 'recalled'`; create warehouse alert on fulfillment line with `message: 'Recalled by sales — verify quantity with operator'` |
| `commandBus.ts` — line removal | Emit event with `changeType: 'removed'` |

---

## Out of Scope (this spec)

- Collaborative multi-user editing of the same draft order (presence/locking)
- Optimistic updates for line additions
- Per-picker assignment visibility on the sales side
- Bulk recall
- Any backend implementation detail beyond the contracts listed above

---

## Success Criteria

1. Sales operator can release individual lines and bulk-release selected lines directly from the sales grid.
2. Sales grid badges update to "Queued"/"Packed" in ≤30s without a manual refresh (socket path ≤2s typical).
3. Sales operator can Recall any line regardless of pick state; recalled line becomes editable immediately.
4. Picker sees a recall overlay when their active line is pulled mid-pick (socket path <2s; polling fallback ≤30s).
5. Picker sees amber banner + per-line warning badge when any line on their current order has an unacknowledged change.
6. Picker cannot advance past a flagged line without acknowledging the alert.
7. New lines added to an active-picking order never auto-release — always require explicit operator action.
8. Bulk release toast distinguishes released / skipped (ineligible) / failed (error) — failed lines remain visually actionable in draft state.
