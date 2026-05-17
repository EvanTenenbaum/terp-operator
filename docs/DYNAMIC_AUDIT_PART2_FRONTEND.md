# TERP Operator Console — Dynamic Frontend Audit, Part 2 of 3

**Date:** 2026-05-17
**Auditor:** Claude (senior product & engineering consultant)
**Tested against:** http://localhost:5173 (Vite dev) + http://localhost:8787 (tRPC) with seed data
**Branch:** `main` @ `e84dd99` + working-tree edits made during this audit
**Method:** Real Playwright/Chromium runs in `tests/e2e/dynamic_audit_p2.spec.ts` and `dynamic_audit_p2_deep.spec.ts`. Every view was navigated by clicking the actual sidenav; screenshots, console events, page errors, request failures, and DOM heuristics were captured into `artifacts/frontend-audit/`.
**Companion to:** `docs/AUDIT_REPORT.md` (static, 2026-05-16) and `docs/DYNAMIC_AUDIT_PART1_BACKEND.md`. **Only new findings are recorded here.**

---

## Executive Summary — NEW Frontend Findings

| Severity | Count | Status |
| --- | --- | --- |
| Critical | 0 | — |
| High | 4 | 1 fixed in this pass, 3 open |
| Medium | 5 | open |
| Low | 4 | open |

**Headline:**
1. **Referees view existed but was unreachable.** `Shell.tsx` ships it in the "Money" nav group and `App.tsx` routes `activeView === 'referees'` to `<RefereesView />`, but `accessPolicy.ts:viewVisibleForUser` never included `referees` in any work-loop array, so every operator's sidenav silently dropped it. *(Fixed in this audit pass — see [FE-H1].)*
2. **The app has no URL routing.** Every view is rendered conditionally from a Zustand state variable; the URL is `/` for every screen. Browser back/forward, deep-linking, bookmarking, and "open in new tab from a row" are all broken by design. Reload returns the user to the dashboard (the `persist` partialize excludes `activeView`).
3. **No focus trap inside the Command Palette.** Tabbing from the search input eventually escapes the modal to the Agentation dev-tool textarea in dev mode and (in production) to outer document focusables. Keyboard-only operators cannot keep focus contained.
4. **The Numbers-native ≤8-columns rule is violated on 7 of 13 reachable grid views**, with matchmaking at 23 and fulfillment at 18 visible header cells. The grid quickly devolves into horizontal scrolling.
5. **Console error budget: 0.** Across every view, every hotkey, the palette, every viewport, dual-tab login, and slow-network throttling, the audit recorded **zero** console errors and zero page errors. The view layer's resilience is genuinely good.

---

## Section A — View Coverage Matrix

Tested as owner@terpagro.local. **`load` = view rendered and AG-grid header cells found; `missing` = no sidenav entry for this user; `blank` = rendered but empty body; `error` = console error or Vite overlay.**

| View key | Sidenav (owner) | Status | Visible AG header cells | Screenshot |
| --- | :-: | :-: | --: | --- |
| dashboard | ✓ | load | 6 | `view-dashboard.png` |
| reports | ✓ | load | 6 | `view-reports.png` |
| purchaseOrders | ✓ | load | 12 ⚠ | `view-purchaseOrders.png` |
| intake | ✓ | load | 8 | `view-intake.png` |
| sales | ✓ | load | 5 | `view-sales.png` |
| matchmaking | ✓ | load | **23** ⚠⚠ | `view-matchmaking.png` |
| orders | ✓ | load | 11 ⚠ | `view-orders.png` |
| payments | ✓ | load | 10 ⚠ | `view-payments.png` |
| inventory | ✓ | load | 10 ⚠ | `view-inventory.png` |
| clients | ✓ | load | 7 | `view-clients.png` |
| vendors | ✓ | load | 11 ⚠ | `view-vendors.png` |
| fulfillment | ✓ | load | **18** ⚠⚠ | `view-fulfillment.png` |
| connectors | ✗ | **missing** (sidenav hides; tRPC works — confirmed in Part 1) | — | `view-connectors-MISSING.png` |
| recovery | ✗ | **missing** | — | `view-recovery-MISSING.png` |
| closeout | ✗ | **missing** | — | `view-closeout-MISSING.png` |
| referees | ✓ *(after fix)* | load | — | `view-referees.png` |
| settings | ✓ | load | 7 | `view-settings.png` |

**Console / page-error totals across all views & hotkey runs:** `0 errors, 0 page errors, 0 request failures.`
**Vite error overlay observed:** none.

⚠ = exceeds the Numbers-native ≤8-columns rule. ⚠⚠ = severely.

---

## Section B — NEW Findings (High → Low)

### HIGH

#### [FE-H1] Referees view shipped but hidden from every operator's sidenav (FIXED in this pass)
- **Severity:** High (lost feature)
- **Location:** `src/client/accessPolicy.ts:5-15` (`viewsByLoop` array); `src/client/components/Shell.tsx:62` (nav config); `src/client/App.tsx:89` (router switch).
- **Evidence (pre-fix):**
  ```
  Nav-visible views (owner): dashboard, reports, purchaseOrders, intake, inventory, sales, matchmaking, orders, fulfillment, clients, payments, vendors, settings
  ```
  `referees` is in the source nav group and has its own `<RefereesView />`, but `viewsByLoop` did not include it for owner/manager/operator/sales/viewer, so the `filter((item) => viewVisibleForUser(item.view, user))` in `SideNav` stripped it out.
- **Description:** Static audit `[UX-02]` flagged the **same pattern** for connectors/recovery/closeout. Referees is a fourth, freshly added victim — the recently shipped referee credit system (`docs/REFEREE_FINAL_STATUS.md`) is invisible to its intended operators. The view renders correctly when reached programmatically.
- **Fix applied in this audit pass:** added `'referees'` to `defaultOperatorViews`, the `sales` work-loop array, and the `viewer` work-loop array in `accessPolicy.ts`. Re-running the coverage spec confirms the view is now in the owner's nav:
  ```
  Nav-visible views (owner): dashboard, reports, purchaseOrders, intake, inventory, sales, matchmaking, orders, fulfillment, clients, payments, vendors, referees, settings
  ```
- **Residual:** consider auditing `viewsByLoop` *for every newly added view* via a typescript-level exhaustiveness guard (`Record<WorkLoop, ReadonlyArray<ViewKey>>` already enforces this at the *type* level, but the *content* check is missing — adding a new `ViewKey` does not force you to register it in any loop). Recommend a unit test that asserts every `ViewKey` is present in at least one work loop.
- **Status:** **Fixed.**

#### [FE-H2] No URL routing — every view is state-driven, browser back / deep-linking broken
- **Severity:** High (workflow and shareability)
- **Location:** `src/client/App.tsx:74-91` (single `<switch>`-style conditional render on `activeView`); `src/client/store/uiStore.ts:60-262` (persist `partialize` excludes `activeView`).
- **Evidence:**
  - The URL is `http://localhost:5173/` on every screen — verified by navigating dashboard → sales → vendors and checking `page.url()`.
  - `page.goBack()` after switching from dashboard to sales returns the browser to a state where the URL is the same (`/`) and the active view becomes `dashboard` (because the Vite dev server replies and React boots fresh). Screenshot: `back-button.png`.
  - `page.reload()` from sales returns the user to the dashboard. The `persist` partialize stores `sideNavCollapsed, collapsedPanels, activeQuickLaunch, activeSettingsTab, drawerByView, activeDrawerEntityByView, gridFilters` — but **not** `activeView`. Screenshot: `reload-state.png`.
- **Impact:**
  - Cannot share a deep link to a row, customer, vendor, or even a view.
  - Cannot bookmark "the orders view I check every morning."
  - Operators in onboarding cannot follow a chat link from their manager.
  - Cmd+click "open in new tab" is meaningless; the new tab will land on dashboard.
  - Browser back/forward is broken muscle memory.
  - Refresh during a workflow drops you back to dashboard.
- **Recommendation:**
  - Adopt a lightweight router (`react-router-dom` v6, ~15kB gzipped) or use the existing `routeHistory` plumbing in `uiStore.ts:217-243` plus `history.pushState`. The state already has all the right shapes; only the URL-binding layer is missing.
  - At minimum, persist `activeView` to localStorage so reload preserves it.
- **Effort:** 1 day for a real router; 30 minutes for the persist-activeView mitigation.

#### [FE-H3] Command Palette has no focus trap
- **Severity:** High (a11y / keyboard-only operators)
- **Location:** `src/client/components/CommandPalette.tsx:126-225`.
- **Evidence:** With the palette open, repeatedly pressing `Tab` from the search input cycles through 6× `BUTTON.entity-result`, then the advanced toggle, then leaves the modal entirely. In dev mode the focus lands on the Agentation toolbar (`BUTTON.styles-module__controlButton`) and finally on the `agentation-auto-send` textarea — *inside* a modal that is `aria-modal="true"`. Full path: `artifacts/frontend-audit/focus-trap.json`.
  ```json
  [
    "INPUT.h-9 flex-1 outline-none",
    "BUTTON.icon-button",
    "BUTTON.entity-result", ...,
    "BUTTON.text-button h-7 text-xs",
    "DIV.styles-module__toolbarContaine",
    "BUTTON.styles-module__controlButton__"
  ]
  ```
- **Description:** The palette uses `role="dialog"` and `aria-modal="true"` (good) but provides no JS-level focus trap. Screen readers and keyboard-only users will tab out of the dialog while it remains visually open, breaking the WCAG 2.1 SC 2.4.3 "Focus Order" expectation for modal dialogs.
- **Recommendation:** Use `focus-trap-react` (already a popular choice; ~3kB) or a hand-rolled `onKeyDown` that intercepts `Tab`/`Shift+Tab` at the first/last focusable child. Also call `inert` on the rest of the document while the modal is open.
- **Effort:** 1 hour with `focus-trap-react`.

#### [FE-H4] Numbers-native ≤8 visible columns is violated on 7/13 reachable grids
- **Severity:** High (product principle violated)
- **Location:** Grid column definitions in `src/client/components/OperatorGrid.tsx` callsites across `OperationsViews.tsx` and `MatchmakingView.tsx`.
- **Evidence (visible AG header cells at default desktop 1440×900):**

  | View | Cols | Excess |
  | --- | --: | --: |
  | matchmaking | **23** | +15 |
  | fulfillment | **18** | +10 |
  | purchaseOrders | 12 | +4 |
  | orders | 11 | +3 |
  | vendors | 11 | +3 |
  | payments | 10 | +2 |
  | inventory | 10 | +2 |
  | intake | 8 | — |
  | clients | 7 | — |
  | settings | 7 | — |
  | reports | 6 | — |
  | dashboard | 6 | — |
  | sales | 5 | — |

- **Description:** The product principle (docs/architecture, design memos) describes a Numbers-native operator surface where ≤8 visible columns keeps the row legible without horizontal scrolling. Matchmaking shows **23 columns** in the default view; this is the densest grid in the system and exactly the one where pattern recognition matters most.
- **Recommendation:** For each violating view, identify the 8 must-see columns and hide the rest behind a column-toolpanel toggle (AG Grid Enterprise supports this out of the box). Move secondary columns into a row-detail/expansion panel.
- **Effort:** Half a day per view for the principle-driven trimming; 2 hours each for the wiring.

### MEDIUM

#### [FE-M1] CSV "export" is a JSON envelope, not a downloadable file
- **Severity:** Medium (operator confusion)
- **Location:** `src/server/routers/queries.ts:csvExport`, plus client-side download glue (search `csvExport`).
- **Evidence:** `GET /trpc/queries.csvExport?input=…&view=sales` returns `content-type: application/json` with body
  ```
  {"result":{"data":{"json":{"filename":"sales.csv","csv":"id,orderNo,..."}}}}
  ```
- **Description:** The tRPC contract wraps the CSV text in a JSON object. That is fine for a UI that decodes the field and then triggers `URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))`. A *user* who copy-pastes the URL into a browser to "just download the CSV" gets a JSON file. There is no `Content-Disposition: attachment` either.
- **Recommendation:** Add an Express handler `GET /api/export/:view.csv` that streams plain `text/csv` with `Content-Disposition: attachment; filename="..."` and reuses the same `buildCsvForView` function. Keep the tRPC path for in-app downloads.
- **Effort:** 2 hours.

#### [FE-M2] Reload always returns the user to dashboard (activeView not persisted)
- **Severity:** Medium
- **Location:** `src/client/store/uiStore.ts:251-261` (`persist.partialize` whitelist).
- **Description:** Drawer entity, drawer state, grid filters, settings tab, and quick-launch are persisted but `activeView` is **not**. An operator who refreshes the Sales view to clear a hung filter is silently teleported to dashboard.
- **Recommendation:** Add `activeView: state.activeView` to the partialize whitelist. Note that this interacts with [FE-H2] — proper URL routing would supersede this.
- **Effort:** 5 minutes (but defer if FE-H2 is being addressed).

#### [FE-M3] Dashboard has 4 form controls with no accessible label
- **Severity:** Medium (a11y)
- **Location:** Search of `<input>`/`<textarea>` elements after dashboard load.
- **Evidence:** `artifacts/frontend-audit/a11y-dashboard.json`
  ```
  ["input-no-label INPUT#-", "input-no-label INPUT#-", "input-no-label INPUT#-", "input-no-label TEXTAREA#-", "headings:H1"]
  ```
  Three inputs and one textarea have neither `id`-matched `<label>` nor `aria-label`. Only `<h1>` exists at the top of the page — no `<h2>`/`<h3>` to chunk the content for screen readers.
- **Recommendation:** Add `aria-label` to ungrouped textboxes (likely the dashboard quick-filter and the issue-sidecar fields). Promote KPI card titles or section headers to `<h2>` so screen reader users can skim. Run `axe-playwright` as a CI gate.
- **Effort:** 2 hours.

#### [FE-M4] The connectors / recovery / closeout views are still unreachable for everyone
- **Severity:** Medium (regression of static `[UX-02]` — still open)
- **Location:** `src/client/accessPolicy.ts:39`.
- **Evidence:** Even after the referees fix, `viewVisibleForUser` still hard-codes:
  ```ts
  if (['connectors', 'recovery', 'closeout'].includes(view)) return false;
  ```
  These three views are dead UI for every authenticated user. Backend procedures (`lockPeriod`, `restoreFromBackupPoint`, etc.) work — confirmed in Part 1's Section A — but the surfacing UI is gated off. This audit verified directly:
  ```
  connectors  → sidenavCount: 0
  recovery    → sidenavCount: 0
  closeout    → sidenavCount: 0
  ```
- **Description:** This is the same pattern that hid Referees ([FE-H1]). Surface the views to `owner`/`manager` (matching the backend role gates) or excise the views.
- **Recommendation:** Replace the hardcoded `if (['connectors', 'recovery', 'closeout']...)` short-circuit with proper per-loop entries (e.g. owner/manager get all three). Add the same exhaustiveness test recommended in [FE-H1].
- **Effort:** 1 hour + a smoke test.

#### [FE-M5] AG Grid filter inputs (`ag-N-input`) lack accessible labels
- **Severity:** Medium (a11y)
- **Location:** AG Grid floating-filter & filter-popup inputs; default Ag-Grid rendering.
- **Evidence:** `artifacts/frontend-audit/long-string-diag.json` shows 14 inputs named `ag-5-input`, `ag-6-input`, etc., none of which have a `<label for>` pairing. AG Grid generates these; the integration must apply the floating-filter `headerName` to the input.
- **Recommendation:** Configure `cellRenderer`/`headerComponentParams` to inject `aria-label={col.headerName}` into floating filter inputs. AG Grid Enterprise supports this via `floatingFilterComponent` props.
- **Effort:** half a day across all grid configs.

### LOW

#### [FE-L1] Palette search input has no max-length and no overflow indicator
- **Severity:** Low
- **Evidence:** Typing 200 chars produces `scrollW=2094, clientW=678` with no visual ellipsis or truncation hint (`artifacts/frontend-audit/long-string-diag.json`).
- **Recommendation:** `maxLength=200` on the input plus a `text-ellipsis` indicator when content overflows.

#### [FE-L2] AG Grid has 16 "unlabeled" buttons per view (icon-only controls)
- **Severity:** Low
- **Description:** Every grid view reports 16 buttons with no `aria-label` and no visible text. These are AG Grid's internal sort/filter/menu chevrons. AG Grid Enterprise has localized accessibility strings; verify they are bound to `aria-label` per their docs (`gridOptions.localeText` controls these). Even though screen readers see hidden `<span>` text in some cases, an axe sweep flags them.
- **Recommendation:** Run an axe audit on `matchmaking` (the densest view) and resolve.

#### [FE-L3] Two-tab login shares the same cookie and the same persisted UI store
- **Severity:** Low (workflow gotcha)
- **Evidence:** With both tabs logged in as the owner, the persisted Zustand store (`localStorage:terp-agro-ui`) is shared. Toggling drawers in tab 1 silently changes the state that tab 2 will use on next reload. No `storage` event handler reconciles the two tabs. Two screenshots: `multi-tab-p1.png`, `multi-tab-p2.png` — both rendered correctly with no console errors.
- **Description:** Acceptable for a single-operator station; surprising on a shared workstation.
- **Recommendation:** Listen to `window.addEventListener('storage', …)` and prompt for refresh when another tab mutates the persisted store. (See also static **UX-04**.)

#### [FE-L4] Toast for "That lane is not part of this operator workspace" fires for Cmd+1..6 hotkeys that map to hidden views
- **Severity:** Low (cosmetic)
- **Location:** `src/client/components/Hotkeys.tsx:100-108`.
- **Description:** Cmd+1..6 currently maps `1: dashboard, 2: intake, 3: sales, 4: payments, 5: inventory, 6: clients`. For a `warehouse` operator (whose loop has `['dashboard', 'orders', 'inventory', 'fulfillment']`), Cmd+3 fires a toast "That lane is not part of this operator workspace." For a `sales` operator, Cmd+2 (intake) does the same. The toast is correct but the hotkey label still appears in the sidenav, leading to a discoverability/relabeling gap.
- **Recommendation:** Make the hotkey label conditional on `viewVisibleForUser` so operators do not see a `⌘2` chip for a lane they cannot enter.
- **Effort:** 30 minutes.

---

## Section C — Flow Test Results

Tested using owner credentials. **Most flows below require multi-step write actions, which exceed the scope of pure browser navigation; where the audit could not complete the flow end-to-end via UI alone, this is called out explicitly.**

| Flow | UI Coverage | Status | Evidence |
| --- | --- | --- | --- |
| **Intake:** Create PO → Receive intake → Log discrepancy → Approve → Verify inventory + vendor balance updated | Partial — purchase-order line addition and `postPurchaseReceipt` are accessible via the Intake grid + Cmd+Alt+I hotkey. Verified the hotkey exists. | **Partial pass** — the UI affordances exist and hotkey wiring is correct, but discrepancy log is buried in row-detail drawer; not a single guided flow. | `view-intake.png`, `view-purchaseOrders.png` |
| **Sales:** Create customer → Sales order → Allocate inventory → Post invoice → Log payment → Verify balance | Sales view loads with 36 existing orders. New-sale launcher works (`keel chips`). | **Partial pass** — UI surfaces correct commands; backend already verified in Part 1. Full UI-driven smoke not exercised because the Numbers-native form expects spreadsheet-style cell editing rather than a guided wizard. | `view-sales.png`, `hotkey-cmd3.png` |
| **Closeout:** Run closeout → Verify period lock → Try edit locked period → Should block | **Closeout view is unreachable** (sidenav hides it for every user — see [FE-M4]). | **Fail (UI)** — the only way to exercise closeout from the UI is via the Command Palette → `lockPeriod` command. The reviewer cannot see the period state, the open-work blockers, the control totals, or the archive runs. | `view-closeout-MISSING.png` |
| **Reversal:** Execute command → Reverse it → Verify all tables restored | **Recovery view is unreachable** (sidenav hides it). The Command Palette can run `reverseCommandById` if you know the commandId. | **Fail (UI)** — reversal is theoretically possible but UI gives no entry point. Power users would need to read `command_journal` to obtain IDs. | `view-recovery-MISSING.png` |
| **Batch status:** Select multiple rows → Apply status → Verify all updated | Cmd+Alt+Shift+R + intake selection loops `updateBatch` per row. | **Pass (mechanism)** — see `Hotkeys.tsx:130-134`. Risk: per-row commands instead of a batch endpoint = N independent journal rows. | `Hotkeys.tsx` |
| **Referral:** Create referee → Apply credit → Verify balance → Use credit on order | **Referees view was unreachable before this audit pass** ([FE-H1]). Post-fix the grid loads but is empty (no referees seeded). The full flow is not exercisable until referees are seeded. | **Partial fail / now reachable** | `view-referees.png` after fix |
| **Photography:** Upload photo → Attach to batch → Verify thumbnail → Delete photo | `PhotographyQueuePanel.tsx` exists. Photography queue surface lives inside Inventory/Intake context drawers. | **Not exercised** — the queue panel exists, the tRPC `photographyQueue` query returned 793 bytes (Part 1 §A). UI-driven upload was not run in this audit. | — |

---

## Section D — Edge Case Results

| Case | Outcome | Evidence |
| --- | --- | --- |
| Refresh mid-form | All form state lost; route returns to dashboard. No "you have unsaved changes" prompt. | `reload-state.png` + [FE-M2] |
| Close drawer without saving | Drawer closes silently; no confirmation. Quick-Ledger edits are persisted incrementally so loss is minimal in some flows. | `drawer-after-escape.png` |
| Delete entity with children | Not exercised in UI (no `deleteBatch` affordance in this owner session; backend audit Part 1 §C noted that hard delete is the only path and reversal is not catalogued). | — |
| Submit empty form | Not directly exercised; tRPC backend rejects with toast. Toast wording is generic. | — |
| Extremely long text (200 chars) | Palette input accepts without truncation; `scrollW=2094 clientW=678`; no visible overflow indicator. | `long-string-diag.json` |
| Special chars (`<script>…`, emoji, `OR 1=1;--`) | Rendered as plain text; React's default escaping holds. No XSS executed. | `long-string-palette.png` |
| Rapid button clicks | `useCommandRunner` exposes `isRunning`; not all CTA buttons disable themselves while a command is in flight. Did not reproduce a duplicate-write in this pass. | `rapid-click-diag.json` |
| Navigate away during async | No blocking indicator. The query's `useQuery` simply unmounts and the result is dropped. | observed during nav between views |
| Browser back button | Returns to a state where URL is still `/` and `activeView` resets to dashboard (since persist doesn't include it). | `back-button.png` + [FE-H2] |
| Two tabs, conflicting edits | Both tabs render correctly; no conflict detection; persisted Zustand store is shared on `localStorage`. | `multi-tab-p1.png`, `multi-tab-p2.png` |
| Slow network (3s artificial delay on `queries.dashboard`) | Page renders shell immediately; KPI cards show their "loading" placeholders; no Vite overlay; no error. | `slow-network-dashboard.png` |
| Cmd+K (open palette) | Works. Dialog shown with `role="dialog" aria-modal="true"`. Esc closes correctly. | `palette-01-open.png`, `palette-02-typed-createReferee.png` |
| Cmd+1..6 (lane hotkeys) | All six map correctly to dashboard, intake, sales, payments, inventory, clients. | `hotkey-cmd1.png` … `hotkey-cmd6.png` |
| Mobile 390×844 | Sidenav collapses, grid becomes horizontally unusable. Already covered by static `[UX-10]`. | `responsive-mobile-390.png` |
| Tablet 768×1024 | Sidenav stays expanded; grid columns scroll horizontally for the dense views. | `responsive-tablet-768.png` |

---

## Section E — Comparison Against `docs/AUDIT_REPORT.md`

| Static finding | Dynamic verdict (frontend) |
| --- | --- |
| **UX-01** Access-policy derived from email substring | **Confirmed live.** `accessPolicy.ts:31-35` scans the email for `sales`/`intake`/`receiv`/`warehouse`/`fulfill`/`pack`. Verified that the resulting work-loop drives the sidenav. |
| **UX-02** Connectors/Recovery/Closeout hidden for everyone | **Confirmed live and extended** to Referees → [FE-H1]. Referees fix applied this pass; **connectors/recovery/closeout still hidden** (see [FE-M4]). |
| **UX-03** `invalidateQueries()` on every socket event | Not directly stressed in this pass; multi-tab test ran without observable refetch storm — but the dual-tab session was idle. |
| **UX-04** Persisted UI store leaks entity IDs to localStorage | **Confirmed live.** [FE-L3] is the dual-tab corollary. |
| **UX-05 / SEC-03** Pre-filled demo creds | **Confirmed live.** Visible on `00-post-login-dashboard.png` precursor screen. |
| **UX-06** No global error boundary | **Confirmed by absence.** No `ErrorBoundary` found in `App.tsx`/`main.tsx`. No crash was forced; couldn't verify behavior under crash. |
| **UX-07** AG Grid Enterprise license loaded async | **Confirmed by code shape.** Not stressed in this pass. |
| **UX-08** Agentation ships into prod bundle | **Visible in dev only:** the focus-trap test ([FE-H3]) found the Agentation toolbar is *in the dev DOM*. Prod-bundle check still required (separate audit). |
| **UX-09** Hotkeys mutate ledger from arbitrary focus | **Confirmed.** Cmd+Alt+I (`postPurchaseReceipt`), Cmd+Alt+Shift+R (`updateBatch → status='ready'`), Cmd+Enter (`postSalesOrder` / `confirmSalesOrder` / `allocatePayment`) all fire without confirm. The exit-on-`isEditingText` is the only guard. |
| **UX-10** No mobile/tablet design | **Confirmed.** `responsive-mobile-390.png` shows the grid still rendered but unusable. |
| **UX-11** `toLocaleString()` inconsistency | Not directly stressed (one browser locale used). |

New frontend findings (this audit, not in `AUDIT_REPORT.md`):

- **[FE-H1]** Referees view shipped but hidden — *fixed in this pass*.
- **[FE-H2]** No URL routing — every view is state-driven.
- **[FE-H3]** No focus trap in Command Palette.
- **[FE-H4]** Numbers-native ≤8-columns rule violated on 7/13 views.
- **[FE-M1]** CSV export is a JSON envelope, not `text/csv` with a `Content-Disposition`.
- **[FE-M2]** Reload always returns to dashboard (persist excludes `activeView`).
- **[FE-M3]** Dashboard has 4 form controls with no accessible label.
- **[FE-M4]** Connectors/Recovery/Closeout still unreachable (re-statement of UX-02 with live evidence).
- **[FE-M5]** AG Grid filter inputs lack `aria-label`.
- **[FE-L1]** Palette search has no maxLength / no overflow indicator.
- **[FE-L2]** 16 icon-only buttons per view without aria-label (AG Grid internals).
- **[FE-L3]** Two-tab persisted-store contention.
- **[FE-L4]** Cmd+1..6 hotkey chips visible for lanes the operator cannot enter.

---

## Section F — Fixes Applied In This Audit Pass

1. **FE-H1 — Surface the Referees view in operator navigation.**
   - File: `src/client/accessPolicy.ts`
   - Change: added `'referees'` to `defaultOperatorViews`, the `sales` work-loop array, and the `viewer` work-loop array.
   - Verification: re-ran the Playwright view-coverage spec. Owner now sees `referees` in the sidenav; the `<RefereesView />` mounts and renders the (empty) grid with no console errors.
   - `pnpm typecheck` passes.

Findings **not** auto-fixed in this pass (deferred because they require non-trivial decisions):
- **FE-H2** (URL routing): needs product decision about router choice and URL shape per view.
- **FE-H3** (focus trap): trivial to add but interacts with the modal lifecycle and dev-mode Agentation tool.
- **FE-H4** (column counts): requires per-view product judgement about which 8 columns are first-class.
- **FE-M1, M2, M3, M4, M5, L1, L2, L3, L4**: tracked above with effort estimates.

---

## Appendix — Reproduction

```bash
# Ensure dev servers are up
pnpm dev:e2e   # serves frontend on :5173 and backend on :8787

# Run the audit spec
PLAYWRIGHT_SKIP_WEB_SERVER=1 PLAYWRIGHT_BASE_URL=http://localhost:5173 \
  npx playwright test tests/e2e/dynamic_audit_p2.spec.ts tests/e2e/dynamic_audit_p2_deep.spec.ts \
  --reporter=list

# Inspect output
ls artifacts/frontend-audit/
jq . artifacts/frontend-audit/view-matrix.json
jq . artifacts/frontend-audit/focus-trap.json
```

All evidence files referenced above are in `artifacts/frontend-audit/`.
