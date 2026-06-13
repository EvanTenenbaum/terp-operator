# Findings — money lane (COLLECT/PAY loops)

Login: owner@terpagro.local (manager@ spot-checked). Headless Chromium 1512x945, 2026-06-12.
Severity: S3 blocks/corrupts · S2 major friction · S1 annoying · S0 polish. Frequency: F3 daily … F0 rare.

---

### F-money-01 — Money-IN Quick Ledger posting is completely broken (every transaction type)
**S3 × F3** — the COLLECT half of the money loop cannot post at all.
- Repro: /payments → Money In → `+ Row` → pick any customer (e.g. Moss Landing Co-op) → amount `142.33` → `Record payment` (per-row commit button).
- Expected: row posts, FIFO allocation runs, toast.
- Actual: row flips to **"Needs Fix"** and the server command `postTransactionLedgerRow` returns `ok:false` with raw Zod issues — even though the client payload is clean (`"date":"2026-06-12"` string, `"reference":""`). Server-side it reports `path:["date"] "Expected string, received date"` and `path:["reference"] "Expected string, received null"`. Reproduced with fresh rows for all four receiving types: `client_payment`, `buyer_credit`, `check_payment_in`, `crypto_payment_in` (crypto adds `method: Invalid enum value... received 'crypto'` — the row's own Crypto type sets a method the command schema doesn't accept). Money-OUT posting with the same command (`direction:"paying"`, `vendor_product_payment`) succeeds, so the breakage is specific to the receiving branch (server appears to coerce date→Date and ""→null before re-validating against a string schema).
- Evidence: shots/money-04-after-post.png, money-08-repost.png, money-11-type-matrix.png. Request/response pairs captured in run-money-06/08/11 output.
- Consequence: brief items 2 and 3 (post → FIFO auto-allocation → unapplied handling on a payment I created) are untestable end-to-end via the primary entry path.

### F-money-02 — Failed post shows raw Zod JSON to the operator (toast + Trace cell), then draft autosave also fails
**S2 × F3** (co-occurs with F-money-01 today, but the error surface itself is the issue)
- The full JSON array `[ { "code": "invalid_type", "expected": "string", ... } ]` is rendered verbatim in the bottom-right toast AND stored into the row's Trace cell. No human-readable message, no field highlighting, no guidance what to fix ("Needs Fix" with nothing fixable — the named fields `date`/`reference` aren't even editable problems: date is filled, reference has no input column).
- Compounding: the error text is saved into the draft's `issue` field, and `queries.saveQuickLedgerDrafts` then rejects it with HTTP 400 `too_big, maximum 500` — so the broken draft can't even autosave its own error state (captured in issues-money.json).
- Contrast: money-out zero-amount validation produces a clean "Amount must be greater than zero." — the good pattern already exists (shots/money-44-zero-amount.png).
- Evidence: shots/money-04-after-post.png (toast bottom right), issues-money.json (400 + too_big entries).

### F-money-03 — Manual allocation to a specific invoice is impossible; the "Order" picker is ignored by the command
**S3 × F2** — one of the two core allocation operations doesn't exist in practice.
- Repro: /payments finder → filter `SO-REAL-00444` → select the posted $2,946.96 Cobalt payment → Payment allocations panel → Order dropdown → choose `INV-REAL-00444` → the only enabled action is **"Auto-apply oldest"** → click it.
- Expected: $2,946.96 allocated to the chosen INV-REAL-00444.
- Actual: command `allocatePayment` is sent with **only `{"paymentId": "..."}`** — the chosen order is silently discarded — and the money FIFO'd to INV-REAL-00005 ($884.95) + INV-REAL-00009 ($2,062.01). Toast: "Allocated 2946.96 to oldest open invoices." There is no Allocate/Apply-to-selected button; selecting an order fires no request and enables nothing.
- Consequence: **unallocate is a one-way door** — once you unallocate, you can only FIFO it back, never to the original/intended invoice. (This payment is now permanently re-pointed in the demo DB; UI offers no way to restore it.)
- Evidence: shots/money-23-order-picked.png, money-24-after-apply.png; run-money-24 output shows the payload.

### F-money-04 — "Applied to" / Trace column goes stale after re-allocation (shows wrong invoice)
**S2 × F2**
- After the FIFO re-allocation above, the finder row still reads "Applied to INV-REAL-00444." while the Linked Orders tab correctly shows INV-REAL-00005 + INV-REAL-00009. An operator reconciling against the grid would post to the wrong invoice story. The unapplied column also reverted to showing 0.00 during the unallocated window in one view while the panel said $2,946.96 unapplied.
- Evidence: run-money-24 output ("grid row" line vs panel), shots/money-27-linked-orders-tab.png.

### F-money-05 — Row History tab is a silent server 500 everywhere; reverse flow unreachable from payments
**S3 × F2** — the recovery tie-in (brief item 8) is dead on arrival.
- Repro: right-click any payments finder row (or my own vendor payout VBILL-MQBMAUIB-805 created this session) → History.
- Expected: command history incl. today's allocate/unallocate/post, with reverse preview.
- Actual: `queries.relatedCommands` returns **HTTP 500 "Database error"** (3/3 attempts, different rows) and the UI renders the misleading empty-state "No commands found for this row yet." — no error surfaced. Because History never loads, the reverse PREVIEW/commit path could not be reached at all, even for the payment I created.
- Evidence: issues-money.json (3× http 500 on relatedCommands + TRPCClientError "Database error"), shots/money-30-payout-history.png.

### F-money-06 — All three payments finder presets (Unpaid / Overdue / Unapplied) return 0 of 508 rows; promised count pill missing
**S2 × F3**
- Clicking the presets stuffs `status:active`, `category:overdue`, `unappliedAmount:>0` into the quick-filter box; each yields 0 rows. The filter box does work for plain values (`method:cash`, `2946.96`, `Cobalt` all match), but `>0` / those field values match nothing. Proof it's the preset, not the data: while the Cobalt payment was unallocated (unapplied $2,946.96 showing in its row), the Unapplied preset still returned 0 rows.
- The code comment (src/client/views/PaymentsView.tsx, UX-J03) promises an "Unapplied (N)" preset with a standing-queue count; the rendered button has no count pill.
- The 0-row empty state says "No payments yet — press Money In." — wrong message for a filter miss (and ironic given F-money-01).
- Evidence: shots/money-12-unapplied-preset.png, run-money-13 output.

### F-money-07 — Finder row-count label never updates with filters ("508 row(s)" while grid shows 1)
**S1 × F3**
- Any quick filter (e.g. `SO-REAL-00444` → 1 visible row) leaves the header at "Payments 508 row(s)". Operators can't trust the count for reconciliation.
- Evidence: shots/money-13-filter-payout.png (empty grid, header 508).

### F-money-08 — Draft rows can never be deleted; junk "Needs Fix" rows accumulate forever at the top of the ledger
**S2 × F3** (draft hygiene — the giant-table height itself is known and not re-reported)
- The Money In ledger renders 457 rows; 10 are Draft/Needs-Fix work rows (most created by this session's failed posts — they now permanently squat at rows #1–10 for every operator). There is **no delete/clear affordance**: no button in the row (only "Record payment"), no right-click menu on ledger rows, Delete key is a no-op, no bulk "clear drafts".
- Finding *your* draft: new rows do prepend at #1 (good), but nothing identifies whose draft a row is, and the dashboard "Your drafts (1)" panel lists only a Sales draft — payment drafts are not surfaced there at all. "Pending work queues: Payments ready 495" links nowhere.
- Evidence: run-money-48 output (457/10, Delete no-op), shots/money-09-row-context.png (no menu), money-38-your-drafts.png.

### F-money-09 — Client Balances: three different "balance" numbers for the same client, and the balance cell is not drillable
**S2 × F2**
- Harbor Wellness: grid Balance `956300.14`; Relationship drawer "Owes us **$307,569.61**"; every ledger line in the same drawer shows running balance `1021366.82` (identical on all lines, so it's not a running balance either). No single place explains the number; the three surfaces disagree with no reconciliation hint.
- Clicking the Balance cell does nothing (no ledger drill); the only path is right-click → Relationship. Drawer itself is good: directional "Owes us / We owe them" with no netting, Orders + ledger + Credit overrides + Disputes + Payments in one surface.
- Also: Balance/Credit-Limit columns are unformatted (`956300.14` vs `$` formatting elsewhere).
- Evidence: shots/money-34-relationship-drawer.png, money-34-balance-click.png.

### F-money-10 — Customer name cell does not navigate to the contact profile
**S2 × F2**
- ClientLedgerView renders the name as a link-style button (linked branch — every customer in this DB has a contact_id) that should `navigate('/contacts/<contactId>')` (src/client/views/ClientLedgerView.tsx:26-30). Clicking "Harbor Wellness" twice in separate sessions: URL stays /clients, no profile opens, no error.
- "Link contact" path untestable here (no unlinked rows exist in seed); note the code dispatches `linkContactToExistingEntity` with an **empty contactId placeholder**, so the inline action looks like a guaranteed server rejection when it is reachable.
- Dual-role counterparty (buyer+vendor): **no such entity exists in the seed** (`customers`⋈`vendors` on contact_id = 0 rows), so the Dual-role drawer behavior (pill + directional AR/AP, RelationshipDrawer.tsx:27-68) could not be exercised. Test-data gap worth fixing for future QA.
- Evidence: shots/money-47-name-click.png, run-money-47 output.

### F-money-11 — Dashboard money drilldowns are dead: KPI cards, Cash Position/owed cards, Money Buckets
**S2 × F3**
- `/` (root after login) renders a completely blank main area — the dashboard actually lives at /dashboard; nav highlights "Dashboard" on the blank route. (shots/money-35-dashboard.png)
- On /dashboard: the top KPI cards (CASH/FILES ON HAND, PAYABLES DUE/SCHEDULED, RECEIVABLES) and the "Cash Position / What we owe vendors / What clients owe" cards are real `<button>`s with an explicit "View" affordance — clicking any of them does nothing (URL and view unchanged, 5 attempts). Money Buckets rows (cash-file-a $4.3M, credit-memo −$476K, office-safe $3.0M) are not clickable at all — no drill to a bucket-filtered payments view.
- **Credit Watch works**: row click lands on `/clients?drawer=standard&entityType=customer&entityId=...` with the grid filtered (`name:Harbor Wellness`, 1 row) and the customer-context drawer open — but the drawer's Balance tab says "Select a row to pin context here." instead of pinning the customer it was opened for; one more click required.
- Evidence: shots/money-43-cash-position.png, money-38-bucket-click.png, money-38-credit-watch-landing.png.

### F-money-12 — A $99,999,999 vendor payout posts instantly with zero friction
**S2 × F1**
- Money Out → Vista Verde → amount `99999999` → Record payment → `ok:true`, toast "Paying ledger row posted for Vista Verde." No confirmation, no sanity threshold, no warning that it exceeds open POs by ~8 orders of magnitude. Combined with F-money-05 (no reachable reverse) and the broken voiding tool (F-money-13), this mis-key is effectively unrecoverable from the money surfaces. (Row remains in the demo DB.)
- Zero amount, by contrast, is cleanly rejected ("Amount must be greater than zero.").
- Evidence: shots/money-44-huge-amount.png, run-money-44 output.

### F-money-13 — Vendor bill & payout tools panel can't see the vendor's own bills or payouts
**S2 × F2**
- /vendors → "Vendor bill and payout tools (manual bill creation and payout voiding)" → choose Boulder Creek (has VBILL-NF-028 partially paid, VBILL-NF-029 open $69K, and my payout from today): panel still shows **"0 payout(s)", Bill "none", "Open $0"**, "Select bill to see due reason", Create bill disabled. Payout voiding is therefore unusable — there is nothing to select.
- Also: no prepayment ledger anywhere on /vendors (page text contains no "prepay" at all), though the grid's due reasons are good ("Consignment depletion / payable trigger from sold flower.", "Office-owned purchase payable.").
- Evidence: shots/money-31-vendor-tools-boulder.png, money-32-bill-select.png, run-money-30/31/32 output.

### F-money-14 — Early-pay discount is unreachable: Apply Discount never enables
**S2 × F2**
- Allocations panel with an allocation selected (INV-REAL-00005 / $884.95): Unallocate enables, **Apply Discount stays disabled**, and there is no input on the page with a discount label/placeholder to satisfy it (the unlabeled text input next to it accepts no state that enables the button in any combination tried). applyDiscount is not reachable from the money surfaces.
- Evidence: shots/money-25-discount-reachability.png, run-money-25 output.

### F-money-15 — Receipt tab on a posted payment: "No receipt generated yet. Finalize the payment to produce one."
**S1 × F2**
- RowInspector → Receipt on a Posted, fully-allocated payment shows the empty state above, with External/Internal/Copy-for-Signal/Print chrome around nothing. "Finalize" is not an action that exists anywhere on the row (it's already Posted) — dead-end guidance.
- Evidence: shots/money-27-receipt-tab.png.

### F-money-16 — Linked Orders tab's "Open order" buttons do nothing
**S2 × F2**
- RowInspector → Linked Orders correctly lists allocations ("INV-REAL-00005 $884.95 applied — Open order"), and its own caption promises navigation to the Orders view. Clicking "Open order": no navigation, no error, drawer stays (2 attempts, URL pinned to /payments). The cross-link half of UX-J06 is dead.
- Evidence: shots/money-28-after-open-order.png.

### F-money-17 — Allocation/order dropdowns show raw float garbage and a stale "Will apply" banner
**S1 × F3**
- Order picker options render unrounded floats: `INV-REAL-00005 / $884.9499999999999`, `INV-REAL-00056 / $27312.269999999997`, etc. — operator-facing currency.
- The green "Will apply $X to order INV-…" banner persists with the previous computation after allocations change (still showed "Will apply $2,946.96 to INV-REAL-00009" after the payment was fully applied; showed "Will apply $884.95…" for a different selected payment).
- Evidence: shots/money-17-alloc-panel-expanded.png, run-money-24 output.

### F-money-18 — Entity dropdowns are 50-option native selects polluted with 27 `reaper-test-*` customers; keyboard entry effectively impossible
**S1 × F3**
- Every customer picker (Quick Ledger Entity id, allocation tools vendor/customer selects) lists 27 `reaper-test-<hash>` junk customers after the real ones — noise in daily entry and proof that test residue reaches operator dropdowns.
- Keyboard-only entry (brief item 10): native select type-ahead failed to land on "Vista Verde" (typing `Vista` selected nothing), there's no search/combobox, **Enter in the Amount field does not post the row** (silently nothing; must Tab all the way to the Record button), and the unlabeled discount input has no aria-label. Mouse-free full-row entry took 21+ keys and still required hunting for the commit button.
- Evidence: run-money-21 output (options dump), run-money-45 output, shots/money-45-keyboard-entry.png.

### F-money-19 — Quick actions "Money in"/"Money out" menu items do nothing
**S1 × F2**
- Topbar Quick actions → "Money in" on /payments: no modal, no navigation, no focus move to the ledger, nothing (URL unchanged, DOM unchanged). Same surface lists New Sale / New PO which presumably work; the money entries are silent no-ops, at least when already on /payments.
- Evidence: shots/money-09-money-in-action.png (identical to before-state).

### F-money-20 — No duplicate-reference detection is possible: ledger rows have no reference input
**S1 × F1** (test gap / by-design ambiguity)
- The brief's "same reference twice" probe is untestable: neither Money In nor Money Out rows expose a Reference column/input (reference is auto-generated, e.g. `revolving-SO-REAL-00496`; the posting payload sends `reference:""`). If operator-entered references are intended for bank/check reconciliation, the field — and any dup warning — doesn't exist.

---

## Positive observations (working as intended)
- Negative-amount flip (item 1): entering `-125` flips the row label to "Buyer credit / Down payment" and the trace to "Buyer credit / down payment — no invoice allocation; balance →…". Balance-effect + FIFO previews on drafts are excellent: "Estimated: allocates $137.55 to INV-REAL-00023; $0.00 unapplied; balance → $10,911.37" (money-in). Money-out preview is much weaker ("Applies product payment FIFO to open POs" — no numbers).
- Money-out posting works end-to-end with a proper toast (no action links in any toast, though).
- "Auto-apply oldest" correctly appears only when unapplied > 0 and works (FIFO).
- Relationship drawer: directional AR/AP, no netting; one-surface context (orders, ledger, overrides, disputes, payments).
- Credit Watch → filtered /clients with drawer open (minus the pin miss).
- Bucket/method/amount survive mid-entry edits; zero-amount money-out gets a clean human error.
- Manager spot-check: /payments surface identical to owner (Row/Record/Types/allocations/ctx-menu all present, same disabled states) — no unexpected gating, no over-gating.

## Flows executed (step counts = clicks + keys, excluding navigation)
| Flow | Steps | Feedback received | Result |
|---|---|---|---|
| Money-in draft fill (customer, cash, amount, bucket default) | 7 | live FIFO + balance preview in Trace cell | OK (draft) |
| Money-in post (×6 attempts, 4 types, fresh+stale rows) | +1 | raw Zod JSON toast + "Needs Fix" | **FAIL (F-01)** |
| Money-out post $77.10 Boulder Creek FIFO→PO | 8 | toast "Paying ledger row posted…", row resets; posted row appears in ledger + /vendors | OK |
| Unallocate posted $2,946.96 payment | 4 | panel count→0, unapplied $2,946.96 in status bar | OK (cmd fired) |
| Re-allocate to chosen invoice | 3 | toast "Allocated … to oldest open invoices" — ignored my chosen order | **FAIL (F-03)** |
| Presets Unpaid/Overdue/Unapplied | 1 each | 0 rows + wrong empty-state | **FAIL (F-06)** |
| RowInspector open (right-click → History) | 2 | drawer opens; History silently empty (500) | **FAIL (F-05)** |
| Receipt / Linked Orders tabs | 1 each | receipt empty-state; links listed but "Open order" dead | partial |
| Credit Watch drill | 1 | lands filtered + drawer (unpinned) | mostly OK |
| Dashboard KPI/money-card/bucket clicks | 1 each ×7 | nothing | **FAIL (F-11)** |
| Zero / huge amount money-out | 3–10 | clean error / $99,999,999 posted silently | mixed (F-12) |
| Keyboard-only money-out row | 21+ keys | Enter doesn't post | **friction (F-18)** |
| Manager /payments parity sweep | n/a | identical surface | OK |

Artifacts: shots/money-*.png (47 screenshots), issues-money.json (console/HTTP capture incl. 3× relatedCommands 500, saveQuickLedgerDrafts 400 too_big), run-money-01..48.cjs (repro scripts, rerunnable).
Session residue in demo DB: ~8 junk money-in drafts (undeletable, F-08), $77.10 Boulder Creek payout + paid bill VBILL-MQBMAUIB-805, $99,999,999 Vista Verde payout (F-12), Cobalt $2,946.96 payment re-pointed from INV-REAL-00444 to INV-REAL-00005/00009 (F-03).
