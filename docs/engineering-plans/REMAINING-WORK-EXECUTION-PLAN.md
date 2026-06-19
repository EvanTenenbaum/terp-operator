# Mercury UX Retrofit — Remaining Work Execution Plan

**Branch:** `docs/mercury-ux-retrofit-master-plan`
**Date:** 2026-06-18
**Status:** Active roadmap to close out the retrofit.
**Authority:** [MERCURY-ARCHITECTURE-MANIFESTO.md](./MERCURY-ARCHITECTURE-MANIFESTO.md) (ARCH-1..12) · [mercury-ux-integrated-analysis.md](./mercury-ux-integrated-analysis.md) (UX-1..12) · [DOMAIN-REQUIREMENTS.md](./DOMAIN-REQUIREMENTS.md) (DR-1..6) · [MASTER-EXECUTION-DOCUMENT.md](./MASTER-EXECUTION-DOCUMENT.md).

---

## 0. Purpose & Read Order

This is the **execution roadmap** to finish the retrofit. It supersedes the open phase entries in `AI-TODO.md` for the work explicitly listed here; do not re-discover items already inventoried below.

**Read order before picking up a task:**

1. This file → find the item ID (`R-NN`), its phase, owner agent, and AC.
2. [MERCURY-ARCHITECTURE-MANIFESTO.md](./MERCURY-ARCHITECTURE-MANIFESTO.md) §§1–6 → confirm the ARCH rule and anti-pattern check that gates the change.
3. Item's referenced spec / view file → exact API surface.
4. [DOMAIN-REQUIREMENTS.md](./DOMAIN-REQUIREMENTS.md) for any item carrying a `DR-N` tag.

**Do not** rebuild work that already shipped on this branch (PaymentsView modernization, MatchmakingView slide-overs, RecoveryView reshape, SettingsView modernization, SalesView mode router). Recent commits (`67d87b4`, `b52643b`, `f35b984`, `aedfe90`, `737d510`) are the canonical baseline; this plan picks up from there.

---

## 1. Inventory (24 items)

### Legend

| Tag | Meaning |
|---|---|
| `BLOCKING` | Must complete before the next flag flip, merge, or release gate it depends on. |
| `DEFERRED` | Tracked, intentionally not in the next two phases (CAP-039, future product surface, etc.). |
| `ARCH-DEBT` | Code violates an ARCH-N rule today; ship before Phase 4 cleanup or before adding more usage. |
| `PRODUCT-GAP` | DR-N domain rule not yet applied across all entities/views. |
| `VERIFY` | Verification/closeout gate; no implementation, but cannot ship retrofit without. |
| `POLISH` | Phase 4 quality work; not blocking the retrofit's functional close. |

### Risk tier (per `/Users/evantenenbaum/AGENTS.md`)

| Tier | Trigger here | Reviewer floor |
|---|---|---|
| **T1** | Behavior-preserving refactor, docs, copy, dev tooling. Cell drag UI. | `qa-reviewer` only if substantive. |
| **T2** | User-visible flow, view templates, schema-driven column changes, URL state. | `qa-reviewer`. AQA when UI changes. |
| **T3** | Money/credit, persisted mutations, multi-step side effects, bulk operations. SalesView surfaces. | `qa-reviewer` + `risk-verifier`. AQA on done claim. Adversarial score floor 90; 95 if Critical. |

### Effort

| Effort | Heuristic |
|---|---|
| **S** | < 200 LOC, single file, no schema change. ~1 session. |
| **M** | 200–800 LOC, multiple files, possibly a shared abstraction. 1–3 sessions. |
| **L** | > 800 LOC or new template/schema. Multi-day with checkpoints. |

### Items

| ID | Item | Category | Tier | Effort | Phase | Owner agent | Depends on |
|---|---|---|---|---|---|---|---|
| **R-01** | SalesView: register `customer` slide-over with Credit tab in `tabs/registry.ts` | BLOCKING | T2 | S | 3B-close | `build` → `qa-reviewer` | R-08 (slot contracts) — soft |
| **R-02** | SalesView: wire `refereeCredit` into `priceAndConfirm` payload | BLOCKING | T3 | S | 3B-close | `build` → `qa-reviewer` + `risk-verifier` | none |
| **R-03** | SalesView: component tests for 3 new files (SalesBrowseMode, SalesBuildMode, SalesCustomerContextHeader) | BLOCKING | T2 | M | 3B-close | `build` (tests-first) → `terminal` | R-01, R-02 |
| **R-04** | BUG-2: wire `onCustomerSelect` for mode transition via cell click in SalesBrowseMode | BLOCKING | T2 | S | 3B-close | `build` → `qa-reviewer` | none |
| **R-05** | PaymentsView: backend command `setPaymentAllocationIntent` (a.k.a. "Mark unapplied") + catalog entry | BLOCKING | T3 | M | 0-B-close | `build` → `qa-reviewer` + `risk-verifier` | T-B-01 statuses (shipped) |
| **R-06** | MatchmakingView: wire Need/Stock columns through entity-schemas → `useColumnDefs` pipeline | BLOCKING | T2 | S | 2-close | `build` → `qa-reviewer` | T-0-15 `useColumnDefs` (shipped) |
| **R-07** | DashboardView: router-wire the template; remove old-view wrapper | BLOCKING | T2 | M | 3C-close | `build` → `qa-reviewer` (AQA) | T-0-16 view-registry (shipped) |
| **R-08** | Define `GridJourney`/`PrimaryGridView` `prelude` + `tabBar` slot contracts (reflection-reviewer amendment) | ARCH-DEBT | T2 | M | 3D-close | `claude-architect` writes contract → `build` codemods consumers → `qa-reviewer` | none; gates R-01, R-09 cleanly |
| **R-09** | Extract `StatusFilterPill` from `FilterToolbar` into a standalone component | ARCH-DEBT | T2 | S | 3D-close | `build` → `qa-reviewer` | R-08 (slot decision) |
| **R-10** | URL state: extend `useViewUrlState` (or wrap `useDrawerUrlSync`) to encode `f` (filter), `q` (keyword), `status`, `tab`, `sel`, `cur` | ARCH-DEBT | T2 | M | 4-arch | `claude-architect` writes the URL grammar doc → `build` implements → `qa-reviewer` | none (preserves existing param shape) |
| **R-11** | ViewTabBar vs. StatusFilterPill co-existence (ARCH-8 / UX-9) — audit & convert remaining tab-as-filter usages | ARCH-DEBT | T2 | M | 4-arch | `qa-reviewer` audits → `build` per-view migration → `qa-reviewer` | R-09 |
| **R-12** | Per-view ColDef arrays still standalone in SalesBrowseMode/SalesBuildMode → migrate to `entity-schemas.salesOrder` / `salesOrderLine` | ~~ARCH-DEBT~~ **DEFERRED** | T3 | M | post-flag | `build` → `qa-reviewer` + `risk-verifier` | R-03 stable tests; ARCH-3 §3.3 invariant. **Deferred** — see §9 Rationale below. |
| **R-13** | Remove `cellStyle` with raw hex colors in SalesBrowseMode/SalesBuildMode → semantic classes | ARCH-DEBT | T1 | S | 4-arch | `fast-build` → `qa-reviewer` (grep gate) | R-12 (do together) |
| **R-14** | SalesView deferred surfaces — see §6 below: 10 items, each tracked as `R-14a`..`R-14j` | DEFERRED | mixed | mixed | post-flag | per-item | per-item |
| **R-15** | DR-1: apply subcategory>category tier ordering to all 27 entity schemas | PRODUCT-GAP | T2 | M | 2-close | `fast-build` (mechanical) → `qa-reviewer` (sample audit) | none |
| **R-16** | DR-3: cell drag multi-select + selection-summary status bar (AG Grid `enableRangeSelection`) | DEFERRED | T1 | M | 4-polish | `build` → AQA | none |
| **R-17** | Playwright E2E coverage: at minimum one happy-path spec per refactored view (PO, Sales-Browse, Sales-Build, Payments, Matchmaking, Recovery, Intake, Dashboard, Settings) | VERIFY | T2 | L | 4-verify | `terminal` (TDD) + `build` for fixtures | R-01..R-13 stable |
| **R-18** | A11y audit (axe + screen-reader sweep) on retrofit surfaces | VERIFY | T2 | M | 4-verify | `qa-reviewer` (AQA) → `build` (fixes) | R-17 |
| **R-19** | AG Grid "mixing modules" pre-existing console error — isolate and fix or document | VERIFY | T1 | S | 4-verify | `build` → `terminal` (verify no regression) | none |
| **R-20** | Some templates expose features (slots/props) no view exercises — audit + prune or document | POLISH | T1 | S | 4-polish | `fast-build` → `qa-reviewer` | R-08 (after slot contracts land) |
| **R-21** | Flag flips: `SALES_VIEW_MERCURY` → on; remove legacy SalesView; remove all `FEATURE_*` flags per §11 of master doc | BLOCKING (close-out) | T3 | M | 4-close | `build` → `risk-verifier` (Critical reviewer) | R-01..R-04, R-12, R-17 all green |
| **R-22** | Remove deprecated components after migration zero-usage check: `WorkspacePanel`, `FilterPresetStrip`, `StatusActionBar`, inline modal forms (per Manifesto §4) | ~~ARCH-DEBT~~ **DEFERRED** | T2 | M | post-flag | `build` (grep gate + delete) → `qa-reviewer` | R-09, R-11, **R-21 (BLOCKING: flag flip required first)**. **Deferred** — see §9 Rationale below. Commit `6908cf4` was a smoke-test run only (6 test suites, 58/58 pass); it did NOT perform the deprecated component removal. |
| **R-23** | Rename `GridJourney` → `PrimaryGridView` (Manifesto §5.2 promise) | ARCH-DEBT | T2 | S | 4-cleanup | `fast-build` (codemod) → `terminal` (typecheck) | R-08 slot contracts shipped |
| **R-24** | `MatchmakingView`: confirm `entity-schemas.matchmakingMatch`, `customerNeed`, `vendorStock` tier ordering matches DR-1 | PRODUCT-GAP | T1 | S | 2-close | `fast-build` → `qa-reviewer` | R-06, R-15 |

---

## 2. Phase Ordering

The retrofit closes in five close-out phases, each with a hard exit gate. Run phases roughly in order; items inside a phase can parallelize.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Close-out Phase A — Backend close (Phase 0-B tail)                         │
│  ITEMS: R-05                                                                 │
│  GATE:  All commands referenced by BulkActionBar exist; risk-verifier pass. │
├─────────────────────────────────────────────────────────────────────────────┤
│  Close-out Phase B — Phase 2 tail                                            │
│  ITEMS: R-06, R-15, R-24                                                      │
│  GATE:  Entity-schemas pipeline ends per-view ColDef in all GridJourney      │
│         views; DR-1 satisfied repo-wide.                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│  Close-out Phase C — SalesView 3B-close                                      │
│  ITEMS: R-01, R-02, R-03, R-04                                                │
│  GATE:  3 must-fixes + BUG-2 closed. SALES_VIEW_MERCURY flag eligible for     │
│         flip but not yet flipped.                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│  Close-out Phase D — 3C/3D tail                                              │
│  ITEMS: R-07, R-08, R-09                                                      │
│  GATE:  Dashboard router-wired; slot contracts written and enforced.          │
├─────────────────────────────────────────────────────────────────────────────┤
│  Close-out Phase E — Phase 4 (cleanup, verify, polish, flag flip)            │
│  ITEMS: R-10, R-11, R-12, R-13, R-17, R-18, R-19, R-20, R-21, R-22, R-23     │
│         R-14 (deferred surfaces — by separate Linear issues, not flag gate)  │
│         R-16 (DR-3 cell drag — polish, not flag gate)                        │
│  GATE:  SALES_VIEW_MERCURY flipped on; legacy code deleted; all feature      │
│         flags from §11 removed; Deep QA closeout evidence on file.            │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Why this order:**

- **A first** unblocks the canonical action-from-state-machine path: `BulkActionBar` cannot ship its `Mark unapplied` button (already in `entity-actions.payments`) without `setPaymentAllocationIntent` server-side. Until then it is a UX-2 violation (action visible but disabled in practice).
- **B second** because the schema-driven pipeline is load-bearing for everything else. If Matchmaking still uses inline ColDefs, the codemod in Phase E (R-12) can't be mechanical.
- **C third** because the three SalesView must-fixes are small but block Phase 4's flag flip (R-21). They are explicitly named on `SalesBuildMode.tsx`'s header.
- **D fourth** because Dashboard's wrapper is masking the retrofit (still renders the old view); slot contracts (R-08) are the architecture-level decision the rest of Phase E depends on.
- **E last** consolidates verify + cleanup + flag flip into one phase. Do not stagger cleanup before the flag flip; you risk shipping a partially-cleaned state if the flip blocks.

**Parallelization within a phase:** items in the same phase that don't share files (e.g., R-10 URL grammar vs. R-19 AG Grid mixing-modules vs. R-15 schema tier audit) can run on independent worktrees. Items that share files (R-12 + R-13) bundle.

---

## 3. Per-Item Detail

### R-01 — Register `customer` slide-over with Credit tab

- **Files:** `src/client/components/tabs/registry.ts`, `src/client/components/drawerTabs/CustomerCreditTab.tsx` (verify existence; create if missing).
- **API:** `registerTabs('customer', [...])` at module import; Credit tab uses existing `queries.customerCreditState` (verify) or wraps `useViewData('credit-state-for-customer')`.
- **AC:**
  - [ ] `registerTabs('customer', [...])` emits `{ key: 'credit', label: 'Credit', component: CustomerCreditTab }` plus the existing Purchase History / Photography / Overview tabs (per Phase 3B spec).
  - [ ] Opening a customer from SalesBuildMode's context header opens the slide-over with the `Credit` tab visible and role-gated (manager+ only for the limit edit; viewer sees read-only).
  - [ ] Tab content lazy-mounts; query gated on `enabled: activeTab === 'credit'` (ARCH-3).
  - [ ] `pnpm typecheck` clean; unit test covers tab presence and gating.
- **Anti-pattern check:** No new `WorkspacePanel` wrapper. No duplicate `CustomerCreditTab` instances rendered alongside the slide-over.

### R-02 — Wire `refereeCredit` into `priceAndConfirm`

- **Files:** `src/client/views/sales/priceAndConfirm.ts` (or equivalent), `src/shared/commandCatalog.ts` (verify payload schema), `src/server/services/commandBus.ts` (verify the command consumes the field).
- **AC:**
  - [ ] Confirmation payload includes `refereeCredit: { refereeId?: string, amount: number }` when the referee credit pill is engaged on the order.
  - [ ] Server validates against `customers.refereeRelationship` and rejects mismatched referees; existing referee-credit tests still pass.
  - [ ] Confirmation total UI shows the credit applied (preserves Phase 3B Snapshot semantics).
- **Risk:** Money path. T3. `risk-verifier` required on done claim; include the journal entry in the closeout evidence.
- **Anti-pattern check:** No bypass of `useCommandRunner`. No `fetch(` direct path.

### R-03 — Component tests for new SalesView files

- **Files:** `src/client/views/SalesBrowseMode.test.tsx`, `SalesBuildMode.test.tsx`, `SalesCustomerContextHeader.test.tsx`.
- **AC:**
  - [ ] BrowseMode: clicking a row routes to BuildMode with `customer` URL param (covers R-04).
  - [ ] BuildMode: context header sticky, credit pill visible, pre-post strip absent when no issues, present when `useSalePrePostChecks` returns issues.
  - [ ] CustomerContextHeader: clear button removes `customer` URL param; pricing-strategy badge visible only when customer has a non-default strategy.
  - [ ] All tests use semantic queries (`getByRole`, `getByLabelText`); no CSS-class assertions; no `container.firstChild` (per `T-0-T1`/`T-0-T2`).
- **Effort:** M. ~400 LOC of test code if done thoroughly.
- **Owner:** `build` writes tests-first (TDD discipline), `terminal` runs and reports.

### R-04 — BUG-2: onCustomerSelect mode transition via cell click

- **Files:** `src/client/views/SalesBrowseMode.tsx`.
- **AC:**
  - [ ] Clicking the customer cell in a sales-orders row (not the action button, the cell itself) triggers `onCustomerSelect(row.customerId)` which updates the URL `customer` param and triggers the mode-router swap to BuildMode for that customer.
  - [ ] Keyboard parity: row-level `Enter` on a focused customer cell does the same.
  - [ ] Covered by R-03 test in BrowseMode.
- **Anti-pattern check:** Don't add a new `useEffect` chasing AG Grid events — use the existing `onCellClicked` slot.

### R-05 — `setPaymentAllocationIntent` command + catalog entry

- **Files:** `src/shared/commandCatalog.ts` (new entry), `src/server/services/commandBus.ts` (handler), `src/server/routers/commands.ts` (Zod input), tests under `src/server/services/commandBus.payments.*.test.ts`.
- **API sketch:**
  ```ts
  setPaymentAllocationIntent: {
    input: z.object({ paymentId: z.string().uuid(), intent: z.enum(['unapplied', 'auto', 'manual']) }),
    affectedIds: ({ paymentId }) => [paymentId],
    minRole: 'operator',
    money: true, // see MONEY_MUTATING_COMMANDS, T-B-07
  }
  ```
- **AC:**
  - [ ] Command journal entry written; snapshot diff captures `intent` change.
  - [ ] BulkActionBar's `Mark unapplied` action now dispatches this command per selected row via `runBulk` (preferred) or single dispatch if multi-row hasn't shipped yet.
  - [ ] WebSocket broadcast invalidates the paymentsView grid query.
  - [ ] Tests: happy path, role-gating reject (viewer), idempotency replay.
- **Risk:** T3 (money mutation). `risk-verifier` + journal evidence in closeout.

### R-06 — Wire Need/Stock columns through `useColumnDefs`

- **Files:** `src/client/views/MatchmakingView.tsx` (or `MatchmakingNeedsTab.tsx`/`StockTab.tsx` depending on current shape), `src/client/config/entity-schemas.ts`.
- **AC:**
  - [ ] No standalone `ColDef[]` arrays in any Matchmaking sub-view; all column rendering flows through `useColumnDefs('customerNeed' | 'vendorStock')`.
  - [ ] Existing `updateCustomerNeed` / `updateVendorSupply` cell edits keep working via `useCommandRunner`.
  - [ ] DR-1 tier ordering verified for these two entities (covered by R-24, but spot-check here).
- **Anti-pattern check:** No inline `useMemo` cell renderers (ARCH §4 anti-pattern table).

### R-07 — Dashboard router-wire

- **Files:** `src/client/router.tsx` (or equivalent), `src/client/views/DashboardView.tsx`.
- **AC:**
  - [ ] `/` (or `/dashboard`) route renders the new `DashboardView` template directly. The wrapper that renders the old WorkspacePanel grid is deleted, not flag-gated.
  - [ ] All 13 old `WorkspacePanel` mounts on the dashboard are gone; the page passes the React-DevTools cold-mount check (ARCH §1, ARCH-4 compliance check).
  - [ ] 4 KPI tiles in Tier 0 zone; recovery and situational zones below per ARCH-10 §2.1 hierarchy.
  - [ ] Existing `DashboardView.ux-e01-e02-e04.test.tsx` updated to assert the new structure (the previously-skipped test from `T-0-T6` can finally close).
- **Risk:** T2 (user-visible structural change). AQA required on done claim.

### R-08 — Slot contracts for `PrimaryGridView` (`prelude`, `tabBar`)

- **Files:** new doc `docs/engineering-plans/specifications/templates/primary-grid-view-slots.md`; `src/client/templates/PrimaryGridView.tsx` (or `GridJourney` until R-23 renames).
- **AC (doc):** Each slot declares: position in the chrome stack, allowed component types (typed, not `ReactNode`), max height contribution, mount/unmount semantics, URL-state interactions.
- **AC (code):** Slot props typed (`prelude?: PreludeSlot`, `tabBar?: TabBarSlot`); compile-time check rejects raw JSX in those slots that doesn't satisfy the slot interface.
- **Why this is architecture work:** Five views need an inline pre-grid surface that today is bespoke (Payments Quick Ledger, Matchmaking ViewTabBar, Recovery search header). Without typed slots they will diverge again.
- **Owner:** `claude-architect` writes the contract; `build` migrates the three known consumers (Payments, Matchmaking, Recovery); `qa-reviewer` audits.

### R-09 — Extract `StatusFilterPill`

- **Files:** new `src/client/components/StatusFilterPill.tsx`; `src/client/components/FilterToolbar.tsx` consumes it.
- **AC:**
  - [ ] Renders multi-select popover; reads/writes `status` URL param via `useViewUrlState`.
  - [ ] Count badges fetched from `queries.statusCounts` (T-B-04, shipped).
  - [ ] Consumable standalone (Matchmaking and Recovery may render it without the full toolbar shelf if R-08 confirms that's the contract).
  - [ ] No regression in any view's status filter behavior; covered by existing per-view tests.

### R-10 — URL grammar extension

- **Files:** new doc `docs/engineering-plans/url-grammar.md` (per Manifesto §3); new hook `src/client/hooks/useViewUrlState.ts` (wraps `useDrawerUrlSync`); per-view migration of state currently in `useUiStore` that should survive refresh.
- **AC:**
  - [ ] Params: `entityType`, `entityId`, `drawer`, `tab`, `f`, `q`, `status`, `sel`, `cur` defined with compression scheme and length cap.
  - [ ] Existing `useDrawerUrlSync` param shape preserved (back-compat).
  - [ ] Round-trip property test: change every URL-encoded state, copy URL, open fresh tab, view re-renders identically.
- **Owner:** `claude-architect` writes the grammar doc (this is a design decision, not implementation); `build` implements once approved.

### R-11 — ViewTabBar vs. StatusFilterPill audit

- **Files:** every view file still using `ViewTabBar` for a *filter*-style switch (not a *navigation*-style mode change).
- **AC:**
  - [ ] Inventory of usages produced (rg `<ViewTabBar`).
  - [ ] Each usage classified: filter (convert to `StatusFilterPill`) or navigation (keep as tab).
  - [ ] Conversions land in same PR as audit doc; no two-step migration.
- **Owner:** `qa-reviewer` produces audit; `build` does conversions per row.

### R-12 — Per-view ColDef → entity-schemas migration (SalesView)

- **Files:** `src/client/views/SalesBrowseMode.tsx`, `SalesBuildMode.tsx`; `src/client/config/entity-schemas.ts`.
- **AC:**
  - [ ] No `ColDef[]` arrays in either Sales mode file; both consume `useColumnDefs('salesOrder' | 'salesOrderLine')`.
  - [ ] All 7 extracted cell renderers (DisplayName, BatchCode, etc.) registered via `cellRendererParams` in schema, not inline.
  - [ ] All 5 SalesView test suites (`ux-f03`, `ux-d04`, `ux-f06`, `marginToggle`, `pricing`) pass unchanged. This is the Phase 3A HARD GATE re-asserted.
- **Risk:** T3 (touches money paths through pricing/markup columns). `risk-verifier` review.

### R-13 — Remove raw `cellStyle` hex colors

- **Files:** SalesBrowseMode, SalesBuildMode, anywhere else `rg "cellStyle.*#[0-9a-fA-F]"` returns hits.
- **AC:**
  - [ ] No `style={{ color: '#...' }}` or `cellStyle: () => ({ color: '#...' })` in any retrofit view.
  - [ ] Use semantic classes from §9–10 of master doc (e.g., `severity-warning`, `status-pill-posted`).
  - [ ] Visual regression: snapshot or AQA pass.
- **Pair with R-12** (same files).

### R-14 — SalesView deferred surfaces (10 sub-items)

These are documented in the `SalesBuildMode.tsx` header. They are **not** retrofit blockers and **must not** delay the flag flip (R-21). File each as a Linear issue under TER project, milestone "Post-Mercury Sales Polish". For visibility:

| Sub-ID | Surface | Tier | Effort | Notes |
|---|---|---|---|---|
| R-14a | Sheet export panel | T2 | M | New slide-over tab on order; CSV export already works headlessly. |
| R-14b | Recall flows | T3 | M | Money path. Already in `entity-actions.salesOrderLine`; UI surface missing. |
| R-14c | Warehouse-alert dialog | T2 | S | Replace bespoke `fixed inset-0` with `useConfirm()`. |
| R-14d | Referee credit pill (visible during build) | T2 | S | Currently only on confirmation. Surface during line pricing. |
| R-14e | Snapshot retry pill | T1 | S | Already exists (`SnapshotRetryPill`); wire into BuildMode header. |
| R-14f | Repeat last order | T2 | M | Needs `queries.customerLastOrder` or use existing `customerPurchaseHistory`. |
| R-14g | Photography queue panel | T1 | S | Customer slide-over tab (per design proposal §4 "Mode B"). |
| R-14h | Customer purchase history | T1 | S | Same as g — already proposed as customer slide-over tab. |
| R-14i | Smart suggestions grid | T2 | M | Collapsible sibling per ARCH-11 exception; already in design proposal §4. |
| R-14j | Pre-post check deep-linking | T2 | S | Click an issue → focus the offending line. |

**Owner per sub-item:** mostly `build`; R-14b and R-14d to `opus-build` (money/credit).

### R-15 — DR-1 tier ordering across all entities

- **Files:** `src/client/config/entity-schemas.ts`.
- **AC:**
  - [ ] Each of the 27 entities reviewed; subcategory at Tier 0 where present; category at Tier 1.
  - [ ] FilterToolbar presets default to subcategory.
  - [ ] AG Grid default sort for the relevant entities sorts by subcategory then category.
  - [ ] Sample audit by `qa-reviewer`: 5 randomly-picked entities verified by hand against schema.
- **Effort:** M. Mechanical but spans 27 entities. Bulk-edit with grep-then-spot-check.

### R-16 — DR-3 cell drag multi-select

- **Files:** all `PrimaryGridView` and `GridJourney` instances; add an AG Grid status-bar component `CellSelectionSummary.tsx`.
- **AC:**
  - [ ] `enableRangeSelection: true`, `enableCellTextSelection: true` on every grid.
  - [ ] Custom status bar shows sum / count / average for numeric ranges.
  - [ ] ⌘C copies selection; ⌘V pastes into editable target.
  - [ ] AQA pass on at least 2 views.
- **Tier:** T1 (no persistence change). **Effort:** M (cross-cutting).

### R-17 — Playwright E2E coverage

- **Files:** new specs under `tests/e2e/`.
- **AC (per view):**
  - [ ] One happy-path spec covering: navigate → primary action → success state. (E.g., PurchaseOrders: create PO → add line → finalize.)
  - [ ] Run via `PLAYWRIGHT_SKIP_WEB_SERVER=1 fast-runner exec terp-operator -- pnpm exec playwright test ...` against the Mac mini dev server.
  - [ ] No `test.skip(true, ...)`; self-create fixtures (per `T-0-T5`).
- **Effort:** L. ~9 specs × ~150 LOC each.

### R-18 — A11y audit

- **AC:**
  - [ ] axe-core pass at AA on every retrofit view; remediate or document any AA-blocking violations.
  - [ ] Screen-reader sanity sweep on PaymentsView (BulkActionBar live region), SalesBuildMode (combobox roles), DetailSlideover (focus trap + escape).
  - [ ] Report saved to `docs/engineering-plans/aqa-reports/<date>-a11y-audit.md`.

### R-19 — AG Grid mixing modules error

- **AC:**
  - [ ] Console error reproduced under known steps and either fixed (single `ModuleRegistry.registerModules([...])` call site) or documented in BUG-REGISTRY.md with rationale for deferral.

### R-20 — Template feature audit

- **AC:**
  - [ ] Each template's exported props/slots inventoried; usage grepped.
  - [ ] Unused props/slots either deleted or documented as intentionally-future with a target issue ID.

### R-21 — Flag flips

- **Sub-steps:**
  1. `SALES_VIEW_MERCURY` → on (in `src/shared/featureFlags.ts` or equivalent).
  2. Delete legacy `SalesView` content + all `if (!SALES_VIEW_MERCURY) return <Legacy/>` branches.
  3. Remove every `FEATURE_*` flag from §11 of master doc that has now reached 100% rollout.
  4. Update `AI-TODO.md` to mark retrofit-close.
- **Risk:** T3 (Critical-adjacent — production-risk on the largest view).
- **Reviewer:** `risk-verifier` + AQA. Adversarial score floor 95.

### R-22 — Deprecated component removal

- **AC:**
  - [ ] `rg "WorkspacePanel"` returns zero hits outside the deleted file.
  - [ ] Same for `FilterPresetStrip`, `StatusActionBar`, `RecordPrepaymentDialog`, `RefereeDialog`, `RefereeRelationshipDialog`, `EditCreditLimitModal` (edit-mode only — confirm-mode preserved).
  - [ ] Component files themselves deleted.
  - [ ] `pnpm typecheck && pnpm test` clean.
- **Why gated on R-21:** can't delete a deprecated component while a flag-gated path still imports it.

### R-23 — `GridJourney` → `PrimaryGridView` rename

- **Owner:** `fast-build` runs a codemod (`rg -l` + `sed`); `terminal` runs typecheck. Trivial after R-08.
- **AC:** Single PR; no behavior change; doc references updated.

### R-24 — Matchmaking entity tier ordering

- Covered by R-15's sweep, but called out separately so it's not lost in the bulk-edit.

---

## 4. Acceptance Criteria Summary

| Item | Code | Tests | Verification |
|---|---|---|---|
| R-01 | tab registry entry, slide-over wiring | unit | typecheck + manual open |
| R-02 | payload field threaded; server consumes | money path tests | `risk-verifier` |
| R-03 | 3 test files; all green | new tests | `terminal` |
| R-04 | onCellClicked routing | covered by R-03 | E2E (R-17) |
| R-05 | new command + catalog + handler + tests | command-bus tests | `risk-verifier` + journal evidence |
| R-06 | Matchmaking columns from schemas | per-view tests | typecheck |
| R-07 | router swap; old wrapper deleted | dashboard tests | AQA |
| R-08 | slot doc + typed template | slot consumer tests | `claude-architect` review |
| R-09 | new component; wired through toolbar | unit + view tests | typecheck |
| R-10 | URL grammar doc + hook + 1+ view migrated | property test | `claude-architect` review |
| R-11 | per-view conversion | per-view tests | grep-gate audit |
| R-12 | schema-driven SalesView columns | 5 SalesView suites pass | `risk-verifier` |
| R-13 | no hex `cellStyle` | snapshot | grep gate |
| R-14* | per-sub-item | per-sub-item | Linear issues |
| R-15 | schema tier ordering audit | sample tests | `qa-reviewer` |
| R-16 | range selection + status bar | manual + AQA | AQA |
| R-17 | E2E specs | playwright | green run on fast-runner |
| R-18 | axe + manual SR pass | audit report | report on file |
| R-19 | fix or documented defer | smoke | `terminal` |
| R-20 | prune or document | grep | `qa-reviewer` |
| R-21 | flag flip + legacy delete | full test suite | `risk-verifier` + AQA (Critical-adjacent) |
| R-22 | deprecated removal | full test suite | grep gate |
| R-23 | rename | typecheck | `terminal` |
| R-24 | DR-1 spot check | unit | `qa-reviewer` |

---

## 5. Dependencies Graph (concise)

```
R-05 ──► R-21 (flag flip needs no disabled BulkActionBar buttons)
R-08 ──► R-09 ──► R-11 ──► R-21
R-15 ──► R-12 (clean schemas before SalesView migration)
R-06 ──► R-15 (Matchmaking schema pieces feed the sweep)
R-15 ──► R-24
R-01 ──┐
R-02 ──┼──► R-03 ──► R-21
R-04 ──┘
R-12 ──► R-13 (paired files)
R-12 ──► R-21
R-17 ──► R-18 (E2E first, then a11y)
R-17 ──► R-21 (no flag flip without E2E coverage)
R-21 ──► R-22 (deletion blocked by flag flip)
R-08 ──► R-23 (rename after slot contract stabilizes)
R-10 standalone (parallel-safe; feeds R-21 evidence)
R-16, R-19, R-20 standalone (Phase E parallel)
R-14a..j standalone Linear issues (post-flag)
```

---

## 6. Closeout Evidence Bundle (required for R-21 flag flip)

When closing R-21, attach:

1. **Tier rationale:** SalesView flip is T3, Critical-adjacent (money + workflow + persistent state).
2. **Commands run:**
   - `pnpm typecheck` clean.
   - `pnpm test` clean (all SalesView suites + new R-03 suites).
   - `fast-runner exec terp-operator -- pnpm exec playwright test tests/e2e/sales-*.spec.ts --project=chromium` clean.
3. **Reviewer pass result:** `risk-verifier` final score ≥ 95.
4. **AQA report path:** `docs/engineering-plans/aqa-reports/<date>-sales-flag-flip.md`.
5. **Spec coverage:** diff scan + checklist showing every must-fix item closed.
6. **Remaining non-blockers:** R-14a..j Linear issue IDs.
7. **Rollback plan:** flag flip reversible by single env var; legacy view deleted in a follow-up commit, not the same PR (gives one release cycle of rollback runway).

---

## 7. What This Plan Does Not Cover

- Backend gaps GAP-1..GAP-15 from MASTER-EXECUTION-DOCUMENT.md §18 that are already either shipped (`T-B-01` statuses, `T-B-04` statusCounts, `T-B-05` grid-v2) or not blocking the retrofit close (cache invalidation strategy, optimistic combobox updates). If a regression here surfaces during R-17, escalate.
- Pre-existing CAP work (CAP-030 pick mocks, CAP-039 referee payout). Stubs already isolated under `T-0-C1`..`T-0-C5` and not in this plan's scope.
- New product features. The retrofit is a structural pass; new features go through Linear with fresh registry IDs.

---

## 8. How to Pick Up an Item (quick template)

```
Item: R-NN — <title>
Tier: T<n>
Files: <from §3>
ARCH/UX rule(s) gating: <from item>
Dependencies (must be green): R-<…>
Spec: <link>

Steps:
1. Confirm dependencies done (rg the green-gate criteria above).
2. Read the ARCH section referenced by the item.
3. TDD: write the test that asserts the AC, watch it fail.
4. Implement.
5. Run `pnpm typecheck && pnpm vitest run <files>`.
6. For T2/T3: dispatch the named reviewer agent with the diff and the AC checklist.
7. Update AI-TODO.md: mark item complete, add evidence path.
8. If T3: attach to closeout-evidence-bundle entry.
```

---

## 9. Deferred Items — Rationale

### R-12: SalesView ColDef migration to entity-schemas (DEFERRED → post-flag)

**Why deferred:** Three blockers must resolve before `SalesBrowseMode` and `SalesBuildMode` can migrate from standalone ColDef arrays to `useColumnDefs`:

1. **No `salesOrder` entity schema exists yet.** The `entitySchemas` registry exports `sale` (SalesView's legacy entity key) and `salesOrderLine` but not `salesOrder`. Creating the `salesOrderSchema` is prerequisite work that was scoped to the entity-schema completion sweep (T-2-01 in the original 108-task registry). That sweep was never executed; the existing 29 schemas were scaffolded for non-SalesView entities.

2. **Custom cellStyle/valueFormatter/valueGetter patterns don't fit the pipeline.** `SalesBrowseMode.orderColumns` uses inline `cellStyle` with raw hex colors (`#15803d`, `#b06915`) and a composite `valueFormatter` accessing `data.linesTotal`/`data.linesPicked`. `SalesBuildMode.lineColumns` uses custom `valueGetter` (markupPct), `valueSetter` (markupValueSetter), `cellRenderer` (DisplayNameCell, BatchCodeCell, MarkupCell, DerivedCogsCell, LandedCostExceptionCell, PickStatusCell), and `boolCol` helpers. These patterns must be extracted into stable cell renderer components and semantic CSS classes (R-13) before the schema pipeline can consume them.

3. **Both modes are behind the `SALES_VIEW_MERCURY` feature flag.** The legacy `SalesView.tsx` remains the production surface with its own standalone ColDef arrays. R-12 migration can only land after R-21 flips the flag and removes the legacy view — otherwise the schema migration would have to support both old and new column shapes simultaneously.

**Unblock path:** R-21 (flag flip) → schema creation for `salesOrder` → R-13 (semantic classes for cellStyle) → R-12 (ColDef migration).

### R-22: Deprecated component removal (DEFERRED → post-flag)

**Why deferred:** The three targeted components are still actively referenced across the codebase:

| Component | Import count | Key consumers |
|-----------|-------------|---------------|
| `WorkspacePanel` | 15+ files | `OperatorGrid.tsx`, `SalesView.tsx`, `IntakeView.tsx`, `DashboardView.tsx`, `VendorPayablesView.tsx`, `CreditReviewView.tsx`, `QuickLedgerGrid.tsx`, `PhotographyQueuePanel.tsx`, and 7+ test files |
| `FilterPresetStrip` | 5+ files | `SalesBrowseMode.tsx`, `SalesView.tsx`, `OperationsViews.ux-d04-l03.test.tsx`, `SalesBrowseMode.test.tsx` |
| `StatusActionBar` | 3+ files | `SalesView.tsx`, `CloseoutView.tsx`, `Hotkeys.test.tsx` |

R-22's dependency chain is `R-09 → R-11 → R-21 → R-22`. The flag flip (R-21) must remove the legacy `SalesView.tsx` before these components' import counts drop to zero. R-09 (StatusFilterPill extraction) and R-11 (ViewTabBar vs. StatusFilterPill co-existence audit) must also be complete so migrated views no longer import the deprecated strips.

**Commit `6908cf4` correction:** That commit was tagged "R-15/22 — A11y audit + integration smoke test" but it only performed a smoke test pass (6 test suites, 58/58 passed, typecheck clean). It did **not** remove any deprecated components. R-22 remains open and blocked by R-21.

**Unblock path:** R-09 → R-11 → R-21 (flag flip + legacy SalesView deletion) → R-22 (grep-gate delete).
