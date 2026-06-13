# UX findings — GLOBAL CHROME + KEYBOARD lane (chrome)

Reviewer: headless Playwright (chromium 1512x945), login `owner@terpagro.local` (+ `viewer@terpagro.local` for the role sweep).
Severity: S3 blocks/corrupts · S2 major friction · S1 annoying · S0 polish. Frequency: F3 daily … F0 rare.
Issues JSON: `.ux-review-scratch/issues-chrome.json` · Screenshots: `.ux-review-scratch/shots/chrome-*.png`.

---

### F-chrome-01 — ⌘K / ⌘⇧F / ⌘⌥K crash the entire app on every palette open AND close
**S3 × F3.** The single most-used piece of chrome takes down the shell twice per use.
- Repro: sign in → press ⌘K. Whole app is replaced by the "Something went wrong — Rendered more hooks than during the previous render" error boundary. Click "Try again" → palette appears and works. Press Esc (or click any result) → crash again ("Rendered fewer hooks than expected"). Every open and every close = one crash.
- Root cause (verified in source, clean working tree @ ba4414a): `src/client/components/CommandPalette.tsx` calls `const { runCommand, isRunning } = useCommandRunner();` at line 280, **after** the early `if (!open) return null;` at line 178 — a conditional hook.
- Collateral: after "Try again" the main content pane is **blank** (sidebar only) until the operator clicks a nav item; any navigation the palette initiated (quick-start launch, entity "Go to", Keyboard-shortcuts tool) is swallowed by the remount, landing the operator on an empty dashboard at `/`.
- Expected: palette opens/closes without crashing; launches land on the target workspace.
- Screenshots: `chrome-01-01-palette-open.png` (error boundary), `chrome-01b-01-after-tryagain.png` (recovered palette), `chrome-01-03-after-files-newsale.png` (blank pane after launch).

### F-chrome-02 — ⌘1–⌘6 navigation hotkeys don't navigate; sidenav highlight splits from content
**S3 × F3.** All six bindings listed in the `?` overlay and badged on the sidenav are dead.
- Repro: on `/inventory` press ⌘2. URL and content stay on Inventory; the sidenav highlight (aria-current) moves to **Intake**. Screen reader hears "Opened intake." Nothing else happens. Same for ⌘1/3/4/6.
- Root cause: `Hotkeys.tsx` nav calls `setActiveView(view)` (store only). Routing is URL-driven (`App.tsx` Routes); `LocationSync` syncs **URL → store** only — nothing syncs store → URL.
- Same dead-store-navigation pattern also breaks: palette quick-start launches (`launchWorkflow`), entity-search "Go to" for all non-connector types, the error-toast "Open in Recovery" action, OrdersView's "View order" deep link (when off-view), and the viewer nav path.
- Bonus: pressing ⌘3 while a modal dialog is open **closes the dialog** (view-state churn) without navigating — operator loses dialog input from a nav key that does nothing (`chrome-10-03-hotkeys-during-dialog.png`).
- Screenshot: `chrome-03b-02-meta2-split-state.png` (Intake highlighted, Inventory content, path /inventory).

### F-chrome-03 — Toast action buttons (Copy details / Open in Recovery / View order) never render
**S3 × F2.** The whole error-recovery affordance is dead in practice.
- Repro A (refusal): palette → run "Process intake" with nothing selected → error toast "One or more selected intake rows no longer exist." — no buttons (`chrome-07-08-failure-toast.png`).
- Repro B (thrown error): palette → run "Log payment" → raw zod toast — no buttons (`chrome-07b-03-thrown-error-toast.png`).
- Repro C (success): /orders select DRAFT row → ⌘↵ Confirm → "SO-… confirmed." — no "View order" button (`chrome-07b-05-confirm-toast.png`).
- Root cause: `src/client/components/useCommandRunner.ts` — `let _pendingCallContext` is a **render-scoped local**. The mutation's `isPending` flip re-renders the caller, recreating the hook body with `_pendingCallContext = null` before `onSuccess`/`onError` execute, so actions never attach. (ToastCenter renders actions fine when present — uiStore.pushToast supports them.) Needs `useRef`.
- Expected per UX-D01/UX-D02: error toasts carry Copy details + Open in Recovery; success toasts can carry deep links.

### F-chrome-04 — Raw zod validation JSON dumped into operator-facing error toast
**S2 × F2.** Run "Log payment" from ⌘K with no payload → toast body is a multi-line JSON array (`"code": "invalid_type", "path": ["customerId"] …`). Unreadable wall, no operator language, error toast persists until clicked. Screenshot `chrome-07b-03-thrown-error-toast.png`.

### F-chrome-05 — `queries.relatedCommands` returns HTTP 500 (Database error)
**S2 × F2.** Fires whenever a drawer History tab loads for a PO or lot, and from RowInspector related-commands. 5+ occurrences captured (`/purchaseOrders` History tab, `/inventory` History tab, inventory row select). Console shows `TRPCClientError: Database error (request id: …)`. Server: `src/server/routers/queries.ts:965` (`affected_ids && $1::uuid[]` query). History surfaces silently show less than they should.

### F-chrome-06 — "Export support packet" is dead: `queries.selectionSupportPacket` 500s, zero UI feedback
**S2 × F2.** RowInspector → Issue tab → "Export support packet" → two 500s, no download, no error message, button returns to idle as if nothing happened. Silent failure on a support-critical path. Screenshot `chrome-07-05-support-packet.png`.

### F-chrome-07 — Advanced filters builder: `filters.getFacets` 500s on open
**S2 × F2.** Every open of the builder (funnel icon) logs a 500; enum value pickers ("Select category…") render with no options, so condition building on faceted fields is hobbled. Text conditions still work. Screenshots `chrome-06-02-builder-open.png`, `chrome-06-03-builder-condition.png`.

### F-chrome-08 — Inventory inline editing dead; bulk-edit affordances give false success feedback
**S2 × F3.** The editing layer the grid advertises does not work:
- Double-click and Enter on `availableQty` (editable: true, owner role) never open an editor (`chrome-07b-02-no-editor.png`).
- Page error captured: `TypeError: Cannot assign to read only property 'availableQty' of object` — row objects are frozen (immutable query-cache rows handed to AG Grid).
- TSV paste: toast says "**2 rows pasted**", cell values unchanged (`chrome-06b-05-paste.png`).
- ⌘D fill-down: toasts "**Adjusted Live Rosin by 0.**" ×2 — commands journaled with zero delta, values unchanged (`chrome-06b-04-filldown.png`).
- Fill handle renders and drags but is a silent no-op (`chrome-06b-06-fillhandle.png`).
- Undo/redo (⌘Z/⌘⇧Z) consequently unverifiable.
- Expected: editor opens; paste/fill produce real drafts/updates or a truthful refusal. Actual: misleading success toasts over no-ops — worst feedback shape for data-entry trust.

### F-chrome-09 — Drawer tab digit keys don't match the numbers printed on the tabs
**S2 × F2.** Tabs are labelled "1 Relationship … 8 History" but `tabForIndex` (Hotkeys.tsx:391) hardcodes stale per-view lists:
- clients: digit 2 → Profile (labelled 3), digit 3 → Balance (4), digit 4 → Purchases (5), digit 5 → Notes (7). Timeline (2) and Credit (6) unreachable.
- vendors: digit 1 → Relationship (labelled 4); digits 2–4 all land on Details.
- orders/inventory: digit 2 skips Timeline (labelled 2) and lands on Lines/Movement (labelled 3).
- purchaseOrders is the only aligned view. Overlay advertises "Switch drawer tab 1–5".
- Expected: digit N activates the tab visibly numbered N.

### F-chrome-10 — Half the drawer tabs render identical generic content
**S2 × F2.** Entity types without dedicated tab renderers silently fall back to the same facts card (`ContextDrawerContent` if-chain ends in a generic body):
- orders (type `order`): **Lines, Customer, Output, History** all show "Status / Customer / Total" — identical innerText captured.
- payments: **Allocations, Customer, Impact, History** identical.
- clients: **Profile, Balance, Purchases, Notes, History** all show the same summary card.
- Working counterexamples: PO (Lines/Vendor/Linked intake/Commands real), lot (Movement/Photos real), vendor bill (Payments/Trace real), Timeline tabs (genuinely merged events; order Timeline even has "Copy status summary (customer-safe)").
- Expected: a tab either shows tab-specific content or doesn't exist. Five tabs showing one card erodes trust in the whole drawer.
- Evidence: OBS dumps in run logs; `chrome-05b-orders-tabs-done.png`, `chrome-05b-payments-tabs-done.png`.

### F-chrome-13 — /fulfillment pick grid re-renders continuously
**S2 × F2.** Row DOM elements are replaced on every 500 ms probe (10/10) with **zero** network requests — a client-side render loop. Playwright clicks failed 28 retries/30 s on "element detached"; real users get misclicks and battery burn. Repro: open /fulfillment, watch row identity. (Probe in `run-chrome-04c-fulfillment.cjs`.)

### F-chrome-11 — One Esc closes two layers (overlay + drawer)
**S1 × F2.** Open drawer → `?` overlay above it → Esc once: **both** close. The overlay's focus-trap onEscape and the global Hotkeys Esc handler each consume the same keydown. Registry/overlay promise "Close the shortcuts overlay, drawer, palette, or focus mode (**in that order**)".

### F-chrome-12 — `]` and `?` hotkeys fire behind open modal dialogs
**S1 × F2.** With the Receive-PO dialog open: `]` toggled the context drawer behind the modal (state change invisible to the operator), `?` opened the shortcuts overlay on top; ⌘D was correctly inert. The dialog guard in Hotkeys.tsx sits *after* the drawer/overlay branches. And ⌘3 closes the dialog (see F-chrome-02). Screenshot `chrome-10-03-hotkeys-during-dialog.png`.

### F-chrome-14 — Grid row-count subtitle ignores free-text quick filter
**S1 × F2.** /inventory: type `NF-002` in the quick filter → grid filters to 1 visible row, panel header still says "**173 row(s)**". Token filters (`status:posted`) update the count (168) and produce chips; free text produces neither. Subtitle is computed from `applyGridFilter` (token-only) while free text goes to AG Grid's `quickFilterText`. Screenshot `chrome-07-01-quickfilter-counts.png`.

### F-chrome-15 — Mixed-status selection: no reason chip, generic toast
**S1 × F1.** /orders, select DRAFT+CONFIRMED rows: no primary (correct), no `data-status-action-reason` chip (orders' catch-all `when: () => true` rule pre-empts `mixedReason`), so ⌘↵ falls back to "No primary action applies to the current selection in this view." The catch-all **More tray works**: Confirm | Post | Reprice | Allocate fulfillment | Pick list | Cancel order (`chrome-04b-orders-mixed-tray.png`). Fulfillment/payments mixed selections behave similarly (no reason chip anywhere observed).

### F-chrome-16 — Viewer role: minor leaks in an otherwise solid lockdown
**S1 × F1.**
- Dashboard fires manager-only `queries.creditWatchlist` → 403 every load.
- ⌘K lists operator+ raw commands ("Process intake / operator+") to viewer; click sends the command and gets a clean server refusal toast "postPurchaseReceipt requires operator access. Your role is viewer." (no client-side hiding, but no privilege escalation).
- Everything else passed: no StatusActionBar primaries on any of 6 views, 0 editable cells, no quick-start launches in palette (only "Keyboard shortcuts"), ⌘⌥K advanced panel + braces toggle fully hidden, ⌘↵ gives truthful refusal toasts. Screenshots `chrome-09-viewer-*.png`.

### F-chrome-17 — `F` focus mode has no visible effect
**S1 × F1.** Pressing F on /sales and /inventory changes nothing visible (sidenav still present, layout identical); only the SR announcement "Focus mode on/off." flips. Listed in the overlay as "Toggle focus mode for the active panel" — a listed-but-(visually-)dead binding on the views tested. `chrome-03b-06-focusmode-sales.png`.

### F-chrome-18 — Shortcut registry drift (working-but-unlisted / mislabelled)
**S0.**
- Drawer width cycle actually has a 4th state **Peek** (280px → standard 420 → wide 763 → focus 1272); overlay says "standard → wide → focus".
- ⌥M margin toggle works from any view (handler is global) but is scoped "Sales" in the overlay — toast wording is truthful, listing is narrower than the binding.
- ⌘D doubles as grid **fill-down** when a cell is focused (any grid view) but is listed only under Intake "Duplicate the selected intake rows".

---

## What works well (verified, no finding)
- `?` overlay: opens via `?`, content exactly matches the registry (all 8 groups), Esc/backdrop close, focus-trapped (`chrome-03b-01-shortcuts-overlay.png`).
- ⌘⌥H health check: genuine round-trip, truthful toast "Server reachable — signed in as Evan Owner (owner@terpagro.local)."
- ⌘⌥V validate: "Validate All: refetched the sales grid from the server." after the refetch actually settles.
- ⌥M: truthful toast both directions.
- `/` focuses the grid quick filter; guarded inside text fields; `?` and `/` type literally inside inputs; ⌘K correctly suppressed while typing in the quick filter.
- ⌘↵ decision-table commit: no-selection toast ("Select rows first…"), orders DRAFT→Confirm and CONFIRMED→Post (posted SO-ACTIVE-008 + invoice INV-MQBMMORQ-882 + credit-limit advisory), purchaseOrders APPROVED→Receive PO dialog, fulfillment OPEN→"Mark fulfilled" with truthful guard toast "Pack every line (qty + bag code) below before fulfilling", payments terminal rows → truthful "No primary action applies…".
- ⌘⌥K advanced palette (owner): opens with palette, context payload pane, red "Danger — raw JSON is sent directly to the command bus. Manager-only tool…" label, braces toggle; fully hidden for viewer. (Payload NOT executed, per scope.) `chrome-03-10-advanced-palette-owner.png`.
- Palette search quality (once past the crash): workbook aliases all resolve — "Files"→New sale; "OFC"→Receive against PO + OFC batches; "Inv Posted"→Process intake; "ticket"→New sale + confirm/post/price commands; "iv"→Money in/Money out + invoices/POs. Entity tab: debounce, frame chips (Sales/Inventory/Procurement/All) gate groups correctly, result counts shown.
- ContextDrawer chrome: `]` toggle, ⇧] cycle (button + key agree), per-view persistence of state+tab across view switches (Wide + Balance restored), coachmark shows once and dismisses, focus-trap in Focus state (15/15 Tabs stayed inside), Esc closes, reopen affordance appears.
- Drawer/selection state is URL-encoded (`?drawer=standard&entityType=order&entityId=…`): browser Back fully restores view + drawer + IdentityRibbon. Back/Forward through drilldowns clean.
- OperatorGrid: quick-filter free text does filter rows (see F-chrome-14 for the count lie); token filters with removable chips + "Clear filters"; advanced builder UI (AND/OR toggle, add condition/group) modulo F-chrome-07; column hide via Columns menu **persists across reload** (verified col-id probe 1→0→0) with "Reset column layout"; density Standard/Compact (42px→28px); CSV export downloads `terp-operator-inventory.csv` with correct quoted content.
- SelectionSummary: row pills ("3 selected | Inventory | Available Qty total 5,835.67 / avg 1,945.22 / count 3") and cell-range pills with Σ stats; History/Relationship buttons open RowInspector with real movement history and a rich Relationship body incl. "Copy external-safe status".
- Issue tab (orders): Manual correction / Dispute / Refund payment / Buyer credit with impact preview — UI present (posting not exercised; export broken per F-chrome-06).
- IdentityRibbon: shows `ORDERS | Oak Street Wellness | SO-MQBKBR7D-626 | DRAFT` with Back/Leave-context controls; clears on Sales/Reports/Matchmaking; cleared (not stale) on return via sidenav; restored via browser Back. No stale entity observed.
- Rapid view switching with drawer open (6 switches in 1.5s): no crash, drawer state correct per view.

## Support flow step-count ("where is order X")
Operator hears a fragment, needs a customer-safe answer:
1. ⌘K (crash) → 2. click "Try again" → 3. type fragment ("SO-REAL") → 4. read result line — status is right in the detail ("SO-REAL-00003 · fulfilled"). **4 steps** (2 of them are crash recovery; 2 steps once F-chrome-01 is fixed).
Deeper customer-safe artifact: select the order row → drawer → Timeline tab (mouse only — digit key skips Timeline, F-chrome-09) → "Copy status summary (customer-safe)". +3 steps.
Customer fragment ("Green Door") → name + balance in 1 search; batch fragment ("FLW-OUTDOOR-03") → batches + their POs grouped. Search quality itself: good.

---

## Appendix — flows executed (step counts = clicks+keys, excluding waits)
| Flow | Steps | Feedback observed |
|---|---|---|
| Login owner | 4 | redirect to dashboard |
| ⌘K open + recover ×12 | 2 each | error boundary → palette |
| Palette quick-starts run (New sale, Receive against PO, Money in, Money out, Add customer need) | 3–4 each | crash on close; blank pane; NO navigation |
| Palette alias queries (Files/OFC/Inv Posted/ticket/iv/keyboard) | 2 each | correct matches |
| ⌘⇧F entity nav (customer/batch/order) ×3 | 3 each | results OK; nav swallowed by crash |
| Frame chips (All/Sales/Inventory/Procurement) | 4 | groups gated correctly |
| `?` overlay + cross-check | 1 | full registry list |
| Binding spot-checks: ⌘1-6, /, ⌥M, ⌘⌥H, ⌘⌥V, F, ⌘D, ], ⇧]×3, digits 1-5 (×6 views), Esc | ~40 keys | see findings |
| ⌘↵ commits: orders (Post, Confirm), PO (Receive dialog), fulfillment (Mark fulfilled refusal), payments (no-primary), no-selection ×4 views | 2–3 each | toasts/dialog as documented |
| Mixed-status selections ×4 views + catch-all tray | 4–5 each | tray verbs listed |
| Drawer deep-dive: 6 entity types × all tabs (8+5+6+6+6+5 tabs) | ~45 clicks | content dumps |
| Drawer cycle/persistence/coachmark/focus-trap/Esc/reopen | ~30 | as documented |
| Inventory grid: quick filter ×4, advanced builder, columns hide+reload, density, CSV export, dblclick/Enter edit, ⌘D fill-down, TSV paste, fill-handle drag, ⌘Z/⌘⇧Z | ~35 | see F-chrome-07/08/14 |
| RowInspector History/Relationship/Issue + support packet | 8 | 500s on packet |
| Toast actions: success/confirm, thrown zod, refusal | 12 | all actions missing |
| IdentityRibbon walk orders→sales→reports→matchmaking→orders | 6 | clears correctly |
| Viewer sweep: 6 views + row selects + ⌘↵ + palette mutation + ⌘⌥K + intake ⌘D | ~30 | locked down, 2 leaks |
| Random walk: rapid switching, ⌘K-in-input, dialog hotkeys, Back/Forward | ~25 | see F-chrome-12 |

Not covered: ⌘⌥⇧R / ⌘⌥I intake batch hotkeys against a real selection (left untouched to avoid colliding with concurrent intake-lane agents); advanced-palette payload execution (forbidden by brief); fill-handle x-direction (handle is y-only by config).

Environment note: one transient `HTTP 431` on `customerLastOrderedQty` (known issue, not re-reported). Mutations performed by this lane: posted SO-ACTIVE-008 (+invoice INV-MQBMMORQ-882), confirmed SO-MQBN83X4-783, two zero-delta inventory adjustments on "Live Rosin" lots, one batch-create refusal. No locks/archives/recovery-commits touched.
