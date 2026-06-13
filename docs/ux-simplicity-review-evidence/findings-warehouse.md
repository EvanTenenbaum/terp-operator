# Warehouse lane findings — FULFILL loop + MOBILE shell

Lane: warehouse (scale operator persona). Login: `owner@terpagro.local` — **role-model note:** there is no warehouse/picker login; the only roles are owner/manager/sales/intake/viewer. The mobile shell (incl. full financial dashboard, payments, contact balances) is exposed to whoever picks; `canPayVendor` (owner/manager) is the only role gate found in the mobile shell. Everything below ran with owner privileges because the product offers nothing narrower.

Severity: S3 blocks/corrupts · S2 major friction · S1 annoying · S0 polish. Frequency: F3 daily … F0 rare.

---

### F-warehouse-01 — Fulfillment queue filter chips are dead (uncaught Immer crash) — S2 × F3
- **Repro:** /fulfillment → click any of "Needs picking / In progress / Has alerts / Ready to close".
- **Expected:** chip toggles pressed and the pick grid filters.
- **Actual:** nothing changes. Every click throws an uncaught `Error: [Immer] The plugin for 'MapSet' has not been loaded into Immer` (`uiStore.setPickQueueFilter` builds a `Set` inside an immer producer without `enableMapSet()`). `aria-pressed` stays `false`, row count stays 150, zero operator feedback. 8 page errors captured in `issues-warehouse.json`.
- **Latent second layer:** even with the crash fixed, the chips can never work — they filter on `status === 'needs_picking' | 'in_progress' | 'ready_to_close'`, but pick_lists statuses are only `open`/`fulfilled` (per the code's own UX-L03 comment), and `has_alerts` reads `row.alertCount`, which the fulfillment grid query never returns (see F-warehouse-02). All four chips would filter to 0 rows.
- **Files:** `src/client/store/uiStore.ts:549`, `src/client/views/FulfillmentView.tsx:203-249`, `src/server/routers/queries.ts:3003` (fulfillment case).
- **Screenshot:** `shots/warehouse-03-chip-needs-picking.png`.

### F-warehouse-02 — Desktop dispatcher is blind to warehouse alerts — S2 × F3
- **Repro:** create a real alert (pack a line on /pick, then sales recalls it → `recall_pending` + warehouse alert). Open /fulfillment, filter `pickNo:PICK-REAL-00016`.
- **Expected:** Alerts column shows the count; selecting the row offers "View N alerts for PICK-…" (the alerts drawer exists in code).
- **Actual:** Alerts column renders "—" for every row, always, and the "View alerts" button never appears, even with a live unacknowledged alert (verified: /pick queue showed "1 alert" badge for the same pick at the same moment). Root cause: the `fulfillment` grid SQL returns no `alertCount`, so `selectedPick.alertCount` is always undefined and the alerts drawer (FulfillmentView.tsx:479) is unreachable on desktop.
- **Screenshots:** `shots/warehouse-13-desktop-live-alert.png` (live alert, Alerts col "—"), `shots/warehouse-12-B-queue-badge.png` (same pick showing "1 alert" on /pick).

### F-warehouse-03 — Pick grid and Lines grid share one filter state; lines silently vanish — S2 × F3
- **Repro:** /fulfillment → type `pickNo:PICK-REAL-00007` in the *pick* grid filter → select the row.
- **Expected:** lines panel shows that pick's 2 lines.
- **Actual:** "Fulfillment Lines 0 row(s) — No lines on this pick" — the same `pickNo:…` chip appears on the lines grid because both `OperatorGrid`s use `view="fulfillment"` and share `gridFilters['fulfillment']`. The default `status:open` chip is shared too, which means **packed lines disappear from the lines grid as you pack them** (line status becomes `packed`). Meanwhile "Mark fulfilled" stays enabled (it reads the query, not the grid), so the operator is asked to fulfill a pick whose lines panel claims has no lines.
- **Screenshot:** `shots/warehouse-08-row-selected.png` (selected pick, "Showing PICK-REAL-00007", lines panel empty with inherited chip).

### F-warehouse-04 — Mobile "Record Receipt" shows success while the server rejected the payment — S3 × F2
- **Repro:** 390×844 → /mobile/payments → tap any row under "Receive Payment" → amount `1`, method `Cash` → "Record Receipt".
- **Expected:** payment recorded, or an error if not.
- **Actual:** UI toasts "✓ Receipt logged from Lighthouse Retail Group" and removes the row from the list — but the command journal shows the command **failed**: `Invalid enum value. Expected 'cash' | 'check' | 'other', received 'Cash'` (journal id `9501fb2c-f513-4036-a6d7-5de53b5aa327`, status `failed`). Nothing was recorded (no $1 payment exists in the payments grid). Two stacked bugs: (1) `methodLabel()` sends the capitalized label, server wants lowercase — every mobile receipt fails; (2) the payload sends `customerId: row.id` where `row.id` is the **payment** row id, not `row.customerId` — so even with the enum fixed, receipts would log against a payment UUID. False-success + row dismissal = silent money loss for the operator.
- **Files:** `src/client/views/mobile/MobilePaymentsView.tsx:167-201`.
- **Screenshots:** `shots/warehouse-16-m-pay-form.png`, `shots/warehouse-16-m-pay-submitted.png`.

### F-warehouse-05 — Mobile "Receive Payment" list is past payments dressed up as overdue invoices — S2 × F3
- **Repro:** /mobile/payments (Receive tab). Answer to the lane question "can you LOG a payment or read-only?": the UI offers logging (expand row → amount/method → Record Receipt) but it is broken end-to-end (F-04), so it is *effectively* read-only with a lying success state.
- **Expected:** open customer invoices with balances.
- **Actual:** the list is `queries.grid view:'payments'` — historical payment records. Every row shows "$0" (their `unappliedAmount`), "⚠ 133d overdue" is days since the *payment* was created, the expanded form says "Invoice total $0 · Unapplied $0", and amount prefill is always 0.
- **Screenshots:** `shots/warehouse-14-m-payments.png`, `shots/warehouse-15-m-receive-payment.png`.

### F-warehouse-06 — "Hold" on the pick line screen always fails — S2 × F3
- **Repro:** /pick (or /mobile/pick) → any line → Hold → type reason → Confirm hold.
- **Expected:** line goes on hold / is recalled from picking.
- **Actual:** error toast "Sales order line not found." and the operator is bounced back to the list with the line unchanged. `PickLineScreen.handleHold` sends `{ lineId: line.id }` (the **fulfillment** line id) to `recallLineFromPicking`, which looks up `salesOrderLines` by that id (`commandBus.ts:4570`). The pick view should pass `orderLineId`. There is no working hold/exception path from the picker's own screen.
- **Screenshots:** `shots/warehouse-06-hold-form.png`, `shots/warehouse-06-after-hold.png`.

### F-warehouse-07 — Fully-packed pick vanishes from the queue before "Complete Order" — S2 × F2
- **Repro:** /pick → pack every line of a pick → leave the list screen (or refresh) without tapping Complete Order.
- **Expected:** the pick stays visible (e.g. "ready to close") until the order is fulfilled.
- **Actual:** `pickQueue` SQL requires at least one line with `actual_qty = 0`, so the pick disappears from /pick entirely while still `Active: open` on desktop /fulfillment. PICK-REAL-00007 hit this state during testing: invisible to the picker, open for the dispatcher; only desktop "Mark fulfilled" can close it. On a phone-only workflow the order is orphaned.
- **Files:** `src/server/routers/queries.ts:2074` (EXISTS … actual_qty = 0).

### F-warehouse-08 — At phone width every desktop deep link dumps to /mobile/dashboard, losing the target — S2 × F3
- **Repro (390px, no prefer-desktop flag):** navigate to `/payments`, `/contacts/:id`, `/sales`, `/fulfillment`, `/pick`, `/inventory`, `/orders`.
- **Expected:** mapped routes (`/payments`, `/pick`, `/inventory`, `/intake`, `/catalog`, `/contacts/:id`) land on their mobile equivalents; only unmapped ones fall back.
- **Actual:** **all seven** land on `/mobile/dashboard`. The UX-R04 redirect effect is not idempotent: under React.StrictMode's double effect-invoke the first run navigates to e.g. `/mobile/payments`, the second run re-reads `window.location.pathname` (now `/mobile/...`), finds no mapping for segment `mobile`, and re-navigates to the `/mobile/dashboard` fallback. An early `if (pathname.startsWith('/mobile')) return;` guard fixes it. Separately, `/sales`, `/fulfillment`, `/orders` have no mobile equivalent by design — a warehouse lead following a fulfillment link on a phone always loses the target.
- **Files:** `src/client/App.tsx:104-133`, `src/client/main.tsx:88` (StrictMode).
- **Positive:** the "Use desktop site" toggle exists in the mobile header ("Desktop", `aria-label="Switch to desktop view"`), sets `terp-prefer-desktop`, and afterwards desktop routes stay desktop at 390px (verified `/fulfillment` stayed put).

### F-warehouse-09 — Pick queue rows read "/ to pick" with no numbers and raw status — S1 × F3
- **Repro:** /pick or /mobile/pick.
- **Expected:** "0/2 to pick", status like "needs picking".
- **Actual:** every card shows literally "/ to pick" — server returns `openLines`/`totalLines` but the client renders `linesPicked`/`lineCount` (both undefined). Status shows raw `open` (the designed `needs_picking`/`in_progress`/`ready_to_close` states never exist server-side, so the colored status styling is dead code too).
- **Files:** `src/client/components/pick/QueueScreen.tsx:70-80`, `src/server/routers/queries.ts:2086-2089`.
- **Screenshots:** `shots/warehouse-04-pick-queue.png`, `shots/warehouse-16-m-pick-queue.png`.

### F-warehouse-10 — Back button mid-pack exits the whole pick flow — S2 × F2
- **Repro (phone):** /mobile/pick → pick → line → enter weight → press/swipe browser Back.
- **Expected:** back goes line → list (the screens look like pages).
- **Actual:** the 3 screens are component state on one route, so Back leaves /mobile/pick entirely (landed on /mobile/payments — the previous route). Forward returns to the **queue** screen; the selected pick, line, and typed weight are gone. On a phone, where edge-swipe back is muscle memory, this dumps the picker out mid-pack. The on-screen "←" works correctly; browser history and UI hierarchy disagree.
- **Screenshot:** `shots/warehouse-16-m-after-back.png`.

### F-warehouse-11 — Double-Enter skips the discrepancy-note prompt; weight has no tolerance check — S1 × F2
- **Repro:** line screen → qty far off expected → weight → press Enter **twice quickly** (scale-operator habit).
- **Expected:** prompt requires an explicit choice ("Pack with note" / "Pack anyway").
- **Actual:** first Enter shows the prompt, an immediate second Enter packs with no note (`showDiscrepancyNote` doubles as an "armed, pack on next submit" flag in `handleMarkPicked`). Packing is never blocked (verified — the prompt offers "Pack anyway"; good), but capture is bypassed by the most common keystroke pattern. Also: the lane assumption "weight out of tolerance prompts" is false — tolerance is **qty-only** (5% of expectedQty); weight is only validated `> 0` (0 and −3 correctly show inline "Weight is required and must be greater than 0", `shots/warehouse-05-zero-weight.png`). No double-submit: exactly 1 `recordWeighAndPack` went over the wire.
- **Screenshot:** `shots/warehouse-19-discrepancy-prompt.png`.

### F-warehouse-12 — Discrepancy note is never persisted; it becomes a toast and evaporates — S2 × F2
- **Repro:** trigger the prompt (single Enter, off-tolerance qty) → type a note → "Pack with note".
- **Expected:** prompt says "Add a note for the Issue tab" → note lands somewhere reviewable.
- **Actual:** only result is a client toast "Discrepancy noted on Mixed Light Flower: Half qty only — bin short (warehouse QA)". `recordWeighAndPack` payload carries no note; code comments admit server capture was deferred. The UI promises an Issue-tab record it doesn't create — sales/recovery never see the picker's explanation.
- **Files:** `src/client/components/pick/PickLineScreen.tsx:103-135`.
- **Screenshot:** `shots/warehouse-19-after-pack-with-note.png`.

### F-warehouse-13 — "Mark fulfilled" toast has no "View order" action despite code staging one — S1 × F3
- **Repro:** /fulfillment → select fully-packed pick → Mark fulfilled.
- **Expected:** success toast with a "View order" deep-link (UX-D01; `setNextSuccessActions` is called).
- **Actual:** toast is plain "Order fulfilled." — polled every 250 ms from the click; no action button ever rendered (2 separate runs). The order *does* leave the open queue promptly (re-filter showed `Active: fulfilled` immediately) — the queue-exit half of the contract works, the link half doesn't. Mobile /pick "Complete Order" never stages a link at all.
- **Screenshots:** `shots/warehouse-13-fulfill-toast.png`, `shots/warehouse-08-after-fulfill-grid.png`.

### F-warehouse-14 — Fulfillment grid rebuilds its DOM ~2,000 nodes/sec while idle — S2 × F3
- **Repro:** open /fulfillment, do nothing, observe DOM mutations.
- **Measured:** 11,088 nodes added / 1,008 removed in 5 s inside `.ag-center-cols-container` on an idle page. Row elements are continuously detached/recreated — Playwright clicks failed 45 consecutive actionability retries; raw-coordinate clicks were required. Operators feel this as selection flicker/lost clicks and it burns CPU on the warehouse machine. (Global `refetchInterval` is 60 s, so this is render churn, not polling.)

### F-warehouse-15 — "Manifest ✓" chip points at a CSV nobody can open — S1 × F2
- The chip tooltip says "Manifest CSV has been generated for this pick list", but `manifestPath` is a server filesystem path under `ARCHIVE_DIR/bag-manifests/`; there is no download route or UI affordance anywhere (`commandBus.ts:6339` writeBagManifest; no serving endpoint). Labels chip is display-only by design (TER-1660 deferral — not re-reported). The grid's own "Export visible grid CSV" works (downloaded `terp-operator-fulfillment.csv` with Alerts/Pick No/Status/…/Manifest columns) but exports the grid, not the bag manifest.

### F-warehouse-16 — Mobile contact profile masks a 500 as "No history yet" — S2 × F2
- **Repro:** /mobile/contacts → Canyon Market → HISTORY section.
- **Actual:** `queries.relatedCommands?...contactId=441fc077…` returned HTTP 500 ("Database error", request id `d49af04c-…`), captured in issues JSON; the UI shows the empty-state "📋 No history yet" with no error or retry. Profile header and financials (balance $955,470.9, credit limit $905,000) render fine.
- **Screenshot:** `shots/warehouse-15-m-contact-detail.png`.

### F-warehouse-17 — Raw enum strings shown to pickers — S0 × F2
- Pick list line status chip shows `recall_pending` (underscore, no casing) after a sales recall of a packed line; queue card status shows raw `open`. `shots/warehouse-12-A-list-banner.png`.

---

## What worked well (verified, not findings)
- **Realtime recall interrupt:** with two pages on the same order, recalling an unstarted line surfaced the full-screen "Line Recalled — Indoor Flower was recalled by sales…" alertdialog on the picker's open line screen in **~500 ms** (socket, not the 10 s poll). "Got it" returns to the list with the line removed. `shots/warehouse-11-A-recall-overlay.png`.
- **Recall of a packed line (scenario C):** creates the warehouse alert; the picker's list shows the amber "Sales updated this order — check flagged lines." banner, the line is tappable with a "1⚠" badge, tapping it shows the un-dismissable "Warehouse Alert / Acknowledge & Continue" interrupt, acknowledging clears it ("All alerts cleared."). No false interrupt fired on the *other* line. `shots/warehouse-12-A-list-banner.png`, `warehouse-12-A-interrupt.png`.
- **Pack loop:** weight → Enter packs and **auto-advances** to the next unpacked line; when the last line packs it returns to the list; "Complete Order" appears when all lines are packed. Double-Enter does **not** double-submit (1 command per pack observed on the wire).
- **Weight validation:** 0 and negative weight blocked with an inline field error, never a silent fail.
- **Mobile pick ergonomics:** 96 px line tap targets, qty/weight inputs `inputmode="decimal"` (numeric keyboard), 24/20 px input text, sticky action bar, scan button degrades gracefully ("📷 —" + "Camera scan not available… enter bag code") in unsupported browsers.
- **Rotate mid-flow:** landscape rotation mid-line keeps screen, line, and typed weight; packing in landscape works.
- **Mobile intake:** exactly Verify + Flag discrepancy, as the lane expected; Verify shows an explicit confirm ("Verify and post receipt… Expected qty 34.869 · Received qty 34.869 / Confirm verify / Cancel"); Flag requires a reason. Clearly labeled "N batches pending verification". `shots/warehouse-14-m-intake.png`.
- **Mobile catalog copy-offer:** per-row sheet has "Copy offer" (`data-testid="copy-offer-button"`, aria-label "…internal columns excluded"); no cost/margin/vendor fields leak in the list. (Catalog data shows "0 lb · $0" for all 170 strains and "170 need photos" — likely seed-data linkage; left to the catalog-owning lane.)
- **Desktop ↔ mobile round-trip:** SideNav "Mobile view" → /mobile/dashboard; mobile header "Desktop" → /dashboard + sets `terp-prefer-desktop`; both directions clean at both widths.
- **Presets:** "Open picks" is the default-active preset (`status:open`, 150 rows) and "Fulfilled" toggles correctly (107 rows).

## Flows executed (step counts = clicks + Enter presses, excluding typing)
| Flow | Steps | Feedback received |
|---|---|---|
| /fulfillment load → preset Fulfilled → back to Open picks | 2 | row count + chip update, "Filtered fulfillment." toast |
| Chip filter attempt (×4 chips) | 4 | **none** (silent crash, F-01) |
| Select pick row (desktop) | 1 (+2 type/Enter when filtering first) | "Showing PICK-…" pill + "Press SPACE to deselect" hint |
| /pick queue → list → line | 2 taps | instant screen transitions |
| Pack one line (in tolerance) | **3** (tap line, tap weight field, Enter) — persona bar of ≤2 actions/line is missed because the weight field is not auto-focused | "Weigh and pack recorded." toast + auto-advance |
| Pack with discrepancy note | 5 (line, weight, Enter, note field, Pack with note) | prompt + note toast (note not persisted, F-12) |
| Hold attempt | 4 | error toast "Sales order line not found." (F-06) |
| Mark fulfilled (desktop) | 1 after selection | "Order fulfilled." toast, row → fulfilled, no deep-link (F-13) |
| Mobile receipt log attempt | 4 | false success toast (F-04) |
| Mobile tour (7 tabs + contact detail) | 8 | see findings |
| Deep-link probes ×7 at 390px | 7 | all → /mobile/dashboard (F-08) |
| Realtime recall (2 pages, same order) | 1 trigger | interrupt on the other page in ~500 ms |

## Environment notes (not findings)
- `issues-warehouse.json` carries the raw console/HTTP captures (8× Immer pageerror, 1× 500 relatedCommands, 2× known-431 customerLastOrderedQty — known issue, not re-reported).
- Contacts/customers lists are polluted with `reaper-test-*` rows from a concurrent lane; they also flood the keel "Choose customer" dropdown.
- Sales-side release/recall UI is only reachable via Sales → Choose customer → draft lines → row expansion ("Recall from pick"); selecting an order in the Sales Orders grid alone never exposes line release/recall, and /fulfillment itself has no release/recall affordance — the realtime recall trigger was therefore fired via the app's own `commands.run` API from a second authenticated page.
- Mutations made by this lane: PICK-REAL-00007 and PICK-REAL-00019 marked fulfilled; lines packed on PICK-REAL-00004/00013/00016/00022/00025 (one with discrepancy note); one line recalled on PICK-REAL-00013 (unstarted → deleted) and two on PICK-REAL-00016 (packed → recall_pending; first alert acknowledged, **one alert left live on PICK-REAL-00016** for desktop verification); one failed $1 logPayment (journal `9501fb2c`, no data written).
