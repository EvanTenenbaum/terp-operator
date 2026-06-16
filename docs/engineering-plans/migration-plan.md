# Mercury UX Retrofit — Migration & Rollout Plan (P0-5)

**Date:** 2026-06-16
**Branch:** `docs/mercury-ux-retrofit-master-plan`
**Status:** Final planning artifact for Phase 0a closeout.
**Authority chain (read-only references):**
[MERCURY-ARCHITECTURE-MANIFESTO.md](./MERCURY-ARCHITECTURE-MANIFESTO.md) →
[UNIFIED-EXECUTION-PLAN.md](./UNIFIED-EXECUTION-PLAN.md) →
[db-migration-audit.md](./db-migration-audit.md) §6 →
[specifications/components/detail-slideover.md](./specifications/components/detail-slideover.md) §4 / §8 →
[specifications/templates/primary-grid-view.md](./specifications/templates/primary-grid-view.md) §10 →
[../design-system/decisions-log.md](../design-system/decisions-log.md) (top 2 entries).

**Locked predecessors (do not reopen):**

- **P0-3**: `ContextDrawer` is refactored in place to `SlideOver`. Persisted store fields (`drawerByView`, `lastUsedDrawerStateByView`) keep their names. The `focus` `DrawerStateName` is dropped from the enum.
- **P0-4**: `GridJourney` is refactored in place to `PrimaryGridView`. Legacy `GridJourney` re-exported as `@deprecated` alias through Phase 4.
- **P0-7**: One additive DB migration (2 files: `0083_command_journal_bulk_columns.sql` + `0084_command_journal_bulk_index.sql`). Online-safe, zero downtime.
- **Rollout mechanism**: per-view feature flags carried in `view-registry.ts`, not env vars and not a DB table.

---

## §1 — Feature Flags

**Decision: per-view `mercuryEnabled: boolean` field on each `ViewEntry` in `src/client/config/view-registry.ts`** (a typed config registry boolean), default `false`. Read at view mount time: when the entry resolves `mercuryEnabled === false`, the view file's top-of-component guard returns the `<LegacyXxxView />` branch (the pre-refactor implementation, preserved alongside the new code in the same file). Rationale: a single typed source of truth that is grep-able (`rg "mercuryEnabled: true"` lists what is live), survives `pnpm typecheck`, and ships in the same PR that adds registry/schema/state-machine entries. Env vars cannot be type-checked against `ViewKey`; a DB-backed `feature_flags` table would force an avoidable Phase 0 migration (rejected in [db-migration-audit.md §0 item 3](./db-migration-audit.md)).

| View key | `mercuryEnabled` default | Phase that flips to `true` | Notes |
|---|---|---|---|
| `purchaseOrders` | `false` | Phase 1 | Pilot. First view to migrate; gate for proving the schema/state-machine/tab-registry pipeline end-to-end. |
| `closeout` | `false` | Phase 2 (first sub-batch) | Trivial caller today; canary for Phase 2 batch. |
| `connectors` | `false` | Phase 2 | `headerSlot=<ConnectorRouteBand />`. |
| `purchaseReceipts` | `false` | Phase 2 | Lines sub-grid migrates to `MasterDetailView` separately — not gated by this flag. |
| `recovery` | `false` | Phase 2 | |
| `payments` | `false` | Phase 2 | `headerSlot=<QuickLedgerGrid />+<PaymentAllocationPanel />`; verifies state-machine `when` predicates. |
| `fulfillment` | `false` | Phase 2 | Column tweaks fold into `pickSchema`. |
| `orders` | `false` | Phase 2 | `OrderInvoiceTab` moves to `tabs/registry.ts`. Entity is `sale`. |
| `vendors` | `false` | Phase 2 | `headerSlot=<VendorMoneyOutBand />`; entity is `vendorBill`. |
| `clients` | `false` | Phase 2 | Heavy cell-renderer extraction to stable components. |
| `inventory` | `false` | Phase 2 | `PhotographyQueuePanel` migrates out of primary surface to `SlideOver` tab + `FilterToolbar` count pill. |
| `sales` | `false` | Phase 3B (after 3A refactor lands) | **Stays `false` until 3D complete** — hard gate. SalesView uses `masterDetail` template; do not flip on the primaryGrid flag. |
| `intake` | `false` | Phase 3C | `WizardView` template. |
| `dashboard` | `false` | Phase 3C | `DashboardView` template; only flipped after KPI strip + bulk-actions wired. |
| `reports` | `false` | Phase 3D | Lowest priority; report-template-driven. |
| `settings` | `false` | Phase 3D | No Mercury chrome — flag may stay `false` indefinitely if scope excludes it. |
| `creditReview` | `false` | Phase 3D | |
| `disputes` | `false` | Phase 3D | |

Flag-readout pattern (target shape for each migrated view):

```ts
export function PurchaseOrdersView() {
  const entry = getViewEntry('purchaseOrders');
  if (!entry?.mercuryEnabled) return <LegacyPurchaseOrdersView />;
  return <PrimaryGridView viewKey="purchaseOrders" />;
}
```

Type extension required in Phase 0b — add `mercuryEnabled: boolean` to `ViewEntry` in [src/client/config/view-registry.ts](../../src/client/config/view-registry.ts).

---

## §2 — `useUiStore` Persisted-State Migration

**Decision: bump `persistVersion` from undefined (Zustand default `0`) to `2`, install an `onRehydrateStorage` / `migrate` handler that runs once per browser per upgrade.** Skip version `1` to keep the version number aligned with the Mercury phase the rehydration handler was authored for (avoids future drift if a pre-Mercury migration ever ships from another branch).

**Audit of what is actually persisted today.** Per [src/client/store/uiStore.ts](../../src/client/store/uiStore.ts) lines 616–644 (`partialize`), only these slices are written to localStorage under the key `terp-agro-ui`:

`activeView`, `sideNavCollapsed`, `collapsedPanels`, `activeQuickLaunch`, `activeSettingsTab`, `drawerByView`, `gridColumnPrefs`, `gridDensity`, `dismissedShadowBanner`, `showMargin`, `lastUsedDrawerStateByView`, `navGroupExpansion`, `dismissedDrawerCoachmark`, `snoozedWorkQueueItems`, `gridDefaultSavedFilter`.

`gridFilters` and `selectedRows` are **deliberately not persisted** (UX-A1 / #15: prevents leaking a prior operator's session filter strings — which often contain customer names — to the next operator on a shared workstation). The Mercury retrofit preserves that posture. Anything claiming "preserve `gridFilters` across the version bump" misreads today's code.

| Persisted field | v1 shape | v2 shape | Migration action |
|---|---|---|---|
| `drawerByView` | `Record<string, DrawerState>` where `DrawerState.state ∈ {closed,peek,standard,wide,focus}` | Same `Record<string, DrawerState>`; `state ∈ {closed,peek,standard,wide}` | **Coerce `focus → wide`** on every entry. Preserves operator's last open width intent. |
| `lastUsedDrawerStateByView` | `Record<string, DrawerStateName>` incl. `'focus'` | Same; `'focus'` removed from union | **Coerce `'focus' → 'wide'`** per entry. |
| `gridColumnPrefs` | `Record<ViewKey, ColumnPref[]>` keyed by `colId` (string) | Unchanged | **Preserve.** See §3 for the column-id stability guarantee. |
| `gridDensity` | `'compact' \| 'cozy'` | Unchanged | Preserve. |
| `gridDefaultSavedFilter` | `Record<ViewKey, savedFilterId>` | Unchanged | Preserve. |
| `dismissedDrawerCoachmark` | `boolean` | Unchanged | Preserve (coachmark copy updates to drop "/ focus" — no state migration needed). |
| `navGroupExpansion` | `Record<string, boolean>` | Unchanged | Preserve. |
| `snoozedWorkQueueItems` | `Record<string, ISOString>` | Unchanged | Preserve. |
| `activeView`, `sideNavCollapsed`, `collapsedPanels`, `activeQuickLaunch`, `activeSettingsTab`, `dismissedShadowBanner`, `showMargin` | scalars | Unchanged | Preserve. |
| `gridFilters` (ephemeral, **not persisted**) | n/a — session-only | Unchanged | No migration. v2 must NOT add this to `partialize` (UX-A1 / #15). |
| `selectedRows` (ephemeral, **not persisted**) | n/a — session-only | Unchanged | No migration. |

Rehydration handler (target shape — drops into `persist({…, version: 2, migrate})` in [src/client/store/uiStore.ts](../../src/client/store/uiStore.ts)):

```ts
const persistVersion = 2;

function migratePersistedState(
  persisted: unknown,
  fromVersion: number,
): Partial<UiState> {
  if (!persisted || typeof persisted !== 'object') return {};
  const state = persisted as Partial<UiState> & Record<string, unknown>;
  if (fromVersion < 2) {
    // Drop `focus` from drawerByView entries.
    if (state.drawerByView) {
      for (const key of Object.keys(state.drawerByView)) {
        if ((state.drawerByView[key] as { state?: string })?.state === 'focus') {
          (state.drawerByView[key] as { state: DrawerStateName }).state = 'wide';
        }
      }
    }
    // Drop `focus` from per-view last-open width.
    if (state.lastUsedDrawerStateByView) {
      for (const view of Object.keys(state.lastUsedDrawerStateByView)) {
        if (state.lastUsedDrawerStateByView[view] === 'focus') {
          state.lastUsedDrawerStateByView[view] = 'wide';
        }
      }
    }
  }
  return state;
}

// persist({...}) usage:
persist(stateInitializer, {
  name: 'terp-agro-ui',
  version: persistVersion,
  migrate: migratePersistedState,
  partialize: /* unchanged from today */,
});
```

The handler is idempotent (re-running it on already-v2 state is a no-op) and fails open: any unrecognized shape is returned unchanged and the consumer falls back to defaults.

---

## §3 — Column-Pref and Saved-Filter Compatibility

**Column prefs survive.** Column IDs are stable across the refactor because every column ID is the entity-schema field path (`entityType.fieldName`, e.g., `purchaseOrder.vendorName`), unchanged by the move from `columnsByView` (inline ColDef arrays in `shared.tsx`) to `entity-schemas.ts`. `mergeColumnDefsWithPrefs` in [src/client/components/gridFilterUtils.ts](../../src/client/components/gridFilterUtils.ts) matches on `colId` (line 94 — `Map(prefs.map(p => [p.colId, p]))`), so as long as the schema generator emits the same `colId` per field, the operator's hidden/reordered/resized columns survive transparently. Phase 0b includes a one-time fixture test that loads a snapshot of representative operator column prefs and asserts that every `colId` resolves to a matching field in the new schemas; missing IDs fail the test and the schema author backfills the field before the view migrates.

**New columns introduced by the schema** (e.g., a column that did not exist in `columnsByView` but ships as part of the new schema) appear in their schema-declared order with `hide: false` unless the operator hides them. Operators who actively prefer the old column set retain it; new fields are additive.

**Saved filters survive.** The `saved_filters` table (migration `0017`) stores `view` + filter JSON; both fields are unchanged. Filter values are loaded through `Status.parse()` (per [src/shared/statuses.ts](../../src/shared/statuses.ts), authored in P0-1) when they reference status literal strings: parse success → filter applies; parse failure (status renamed/removed) → that single filter is reset to default, the saved filter is rewritten with the offending clause removed, and the operator sees a single dismissible toast — `Saved filter '<name>' was reset — status values changed.` (announced via the existing `state.announcement` slice for screen readers; copy lives in `src/client/components/SavedFilterToast.tsx`, added in Phase 0b). The toast suppresses to one per (saved-filter, session) pair to avoid spam on filter-heavy views.

**Saved-filter resolution lives in `useSavedFilters`** ([src/client/hooks/useSavedFilters.ts](../../src/client/hooks/useSavedFilters.ts) — extended in Phase 0b to call the `Status.parse()` coercion). No backend change; the resolver is purely client-side because filters render client-side.

**No silent data loss.** Both prefs and filters survive the refactor by virtue of stable IDs; the toast covers the only failure mode (status-literal drift) explicitly.

---

## §4 — Per-View Rollback Strategy

**Rollback unit: one view at a time.** Flip the view's `mercuryEnabled` from `true` to `false` in `view-registry.ts`, ship the one-line diff. The view's top-of-component guard returns the `<LegacyXxxView />` branch on next render. No DB rollback. No deploy revert. No operator-facing migration. The flag change is a normal frontend deploy through the existing CI/CD path; rollback latency is the same as any frontend change (single-digit minutes once merged).

**Old code is preserved in-file behind the flag, not deleted, through Phase 3D.** Pattern:

```ts
// src/client/views/PurchaseOrdersView.tsx (target shape from Phase 1 onward)
export function PurchaseOrdersView() {
  const entry = getViewEntry('purchaseOrders');
  if (!entry?.mercuryEnabled) return <LegacyPurchaseOrdersView />;
  return <PrimaryGridView viewKey="purchaseOrders" />;
}

// LegacyPurchaseOrdersView is the pre-Mercury implementation
// moved verbatim into the same file. No callers outside this file.
function LegacyPurchaseOrdersView() { /* old <GridJourney>-using code */ }
```

`LegacyXxxView` is the **exact** pre-refactor file body, moved verbatim and renamed. No edits, no formatting changes, no dependency upgrades — the diff that introduces the flag is purely structural so the rollback target is identical to the pre-Mercury behavior. Old code stays through Phase 3D; Phase 4 deletes both the flag and the legacy branch in a single sweep (one PR per view; see §5).

**Rollback verification gate (for any view rolled back):**

1. `pnpm typecheck` clean.
2. `pnpm vitest run src/client/views/<View>.test.ts` green.
3. PR opener runs the persona QA flow for the view ([docs/qa/persona-flows/REGISTRY.md](../qa/persona-flows/REGISTRY.md)) against the reverted branch and attaches the report.
4. The view's `mercuryEnabled: false` change ships in isolation — it does not piggyback on unrelated changes.

**Rollback does not undo `useUiStore` v2.** Once an operator's localStorage is at `persistVersion: 2`, it stays there. The v2 migration is forward-compatible (drops the `focus` enum value, which no live code reads anymore — both legacy and Mercury branches use the same store). If a future fix needs to reintroduce `focus`, that is a v3 forward migration, not a v1 revert.

**Bulk migration rollback (the only DB-touching path):** the 2-file additive migration (`0083`, `0084` per [db-migration-audit.md](./db-migration-audit.md)) ships before the frontend consumer (`commands.runBulk`). If the bulk feature itself misbehaves, disable the per-view bulk action surface via state-machine entry removal — the columns and index can stay in place indefinitely with zero cost. No `DROP COLUMN` rollback is planned; if one is ever needed, the companion `migrations/rollback/0083_*.sql` script is authored alongside `0083` per the repo convention.

---

## §5 — Deployment Sequencing

Each phase below is one or more PRs to `main` (no long-lived feature branch). Verification gates run on the fast runner per [AGENTS.md](../../AGENTS.md) §"Local Verification". "Operator impact" describes what an operator sees the morning after the phase ships.

| Phase | Ships | Verification gate | Operator impact |
|---|---|---|---|
| **0a (this branch)** | Planning artifacts only ([decisions-log.md](../design-system/decisions-log.md), [db-migration-audit.md](./db-migration-audit.md), [primary-grid-view.md](./specifications/templates/primary-grid-view.md), [detail-slideover.md](./specifications/components/detail-slideover.md), this file). No code changes. | Doc review only. | **None.** |
| **0b** | Layers 0–2: `src/shared/statuses.ts` (P0-1); DB migrations `0083`/`0084` (P0-7); `commands.runBulk` + `queries.gridSummary` + `queries.statusCounts` + `queries.comboboxOptions` (backend, dead procedures removed); `entity-schemas.ts` populated for the 12 entities, `entity-actions.ts` populated, `view-registry.ts` entries for all listed views with `mercuryEnabled: false`, `entity-column-map.ts` complete; `SlideOver.tsx` (refactored from `ContextDrawer.tsx`), `tabs/registry.ts` + `tabs/registrations.ts`, `PrimaryGridView.tsx` (refactored from `GridJourney`), `FilterToolbar.tsx`, `BulkActionBar.tsx`, `GridSummaryStrip.tsx`, `ComboboxCellEditor.tsx`; `useUiStore` v2 migration handler; `SavedFilterToast.tsx`; legacy-prop transition shim on `PrimaryGridView`. | `pnpm typecheck` + `pnpm vitest run` (all 1608 cases green, no skips) + `PLAYWRIGHT_SKIP_WEB_SERVER=1 pnpm exec playwright test tests/e2e/operator-console.spec.ts --project=chromium --workers=1`. | **Zero behavior change.** Every flag default-off. `ContextDrawer` import re-exported from `SlideOver`; `GridJourney` re-exported from `PrimaryGridView`; legacy props log one `console.warn` per view per session in dev. |
| **1** | PurchaseOrdersView pilot: registry entry sets `mercuryEnabled: true` (under a per-operator opt-in flag in settings — see §7), view file gains the flag-readout guard, `purchaseOrderSchema` complete, `purchaseOrderActions` state machine complete, PO tab registrations live. | Phase 0b gates + persona QA flow `purchase-orders-operator` (3 files in [docs/qa/persona-flows/purchase-orders-operator/](../qa/persona-flows/purchase-orders-operator/)) + AQA on the diff. | Opt-in per operator from Settings → Experimental. PO view shows the new in-app banner offering the Mercury experience; revert restores legacy in one click. |
| **2** | The 9 remaining PrimaryGridView consumers, batched in dependency order (CloseoutView → ConnectorsView → PurchaseReceiptsView → RecoveryView → PaymentsView → FulfillmentView → OrdersView → VendorPayablesView → ClientLedgerView → InventoryView). Each view ships as one PR carrying its schema fields + state machine + tab registrations + view file edit + `mercuryEnabled: true`. | Per-view: `pnpm typecheck && pnpm vitest run <view>.test.ts` + AQA on the diff + persona QA flow for the view's persona. Batch gate after every 3 views: full `pnpm test` + full persona QA suite (`fast-runner exec terp-operator -- QA_BRANCH=main pnpm qa:env:setup`). | Each view's flag opt-in is independent. Operator can run a mix of legacy + Mercury views simultaneously. |
| **3A** | SalesView refactoring: `MasterDetailView` template wired, `saleSchema`, `saleActions` (intake + line-edit state machines). No flag flip yet. | Phase 0b gates + `salesView.test.ts` + adversarial QA on the refactor diff alone (no behavior change yet). | **Zero behavior change** — SalesView's `mercuryEnabled` stays `false`. |
| **3B** | SalesView `mercuryEnabled: true`. Sales-operator opt-in only. | 3A gates + persona QA flows `sales-operator/*` (3 files) + AQA + cross-reviewer pass (per `Critical` tier — touches money). **Explicit rollback gate**: 7 calendar days at >0 flipped operators with zero P0 incidents before Phase 3C opens. | Sales operators opt in; revert restores SalesView legacy in one click. |
| **3C** | IntakeView (Wizard template) + DashboardView (Dashboard template). Each flipped after its own schema/state-machine wiring. | Phase 3B gates per view + `intake-operator` and `dashboard` persona QA. **Explicit rollback gate** after 3C: 7-day stability window before 3D opens. | Intake and Dashboard opt-in independently. |
| **3D** | Disputes, CreditReview, Reports, Settings (where in scope). | Per-view gates as in Phase 2. | Each view independent opt-in. |
| **4** | **Cleanup PR sweep**, one per view (one PR per legacy branch deletion): remove `LegacyXxxView`, remove `mercuryEnabled` from `ViewEntry` (all are `true`; default behavior is now Mercury), remove the in-app revert banner (§7), retire the `GridJourney` re-export alias and the legacy-prop transition shim from `PrimaryGridView`, retire the `ContextDrawer` re-export alias. Mobile + a11y polish. | Full `pnpm typecheck`, full `pnpm vitest run`, full Playwright E2E, full 26-flow persona QA suite, full AQA + cross-reviewer pass (`Critical` closeout: this PR removes operator escape hatches). | Flags removed. All operators on Mercury UX. The pre-Mercury code no longer exists in the tree. |

---

## §6 — URL State Grammar

URL is the session memory per UX-11. The canonical grammar (target shape after `useViewUrlState` lands in Phase 0b — see [detail-slideover.md §1](./specifications/components/detail-slideover.md)):

```text
/view/{viewKey}?drawer={entityType}:{entityId}&tab={tabKey}&f={filterJson}&sel={ids}&cur={cellId}
```

| Param | Type | Example | Introduced |
|---|---|---|---|
| `viewKey` | path segment, one of [ViewKey](../../src/shared/types.ts) | `/view/purchaseOrders` | Pre-Mercury (existing). |
| `drawer` | `{entityType}:{entityId}` colon-joined; `queue:` for queue mode | `drawer=purchaseOrder:po_01H7…` | Pre-Mercury (`useDrawerUrlSync`). |
| `tab` | tab key registered on the entity in `tabs/registry.ts` | `tab=lines` | **Phase 0b** (new). |
| `f` | URL-safe base64 of compressed `FilterGroupInput` JSON; canonical key sort to dedupe equivalent filters | `f=eJyrVi…` | **Phase 0b** (new). |
| `sel` | comma-joined row IDs (opaque); capped at 200 IDs to keep URLs <2KB; overflow drops to `sel=count:N` | `sel=po_01H7…,po_01H8…` | **Phase 1** (new). |
| `cur` | `{rowId}:{colId}` for keyboard-navigated focused cell | `cur=po_01H7…:vendorName` | **Phase 1** (new). |

Round-trip guarantee: deep-link → refresh → back-button must reproduce the slide-over, the selected tab, the active filter, the row selection, and the focused cell. URL writes are debounced (200ms) to avoid history pollution from rapid edits; URL reads on mount are synchronous and authoritative over store state for the listed params.

**Example deep-link covering every param:**

```text
/view/purchaseOrders?drawer=purchaseOrder:po_01H7XKW3Z9&tab=lines&f=eJxLLk7NK0nMSc1JTYklhUUFwAAAEm4MwQ&sel=po_01H7XKW3Z9,po_01H7YPM4Q1&cur=po_01H7XKW3Z9:vendorName
```

---

## §7 — Operator Communication

**In-app per-view opt-in banner.** When a view has `mercuryEnabled: true` AND the operator has not dismissed it AND the operator's `mercuryOptIn[viewKey]` setting is `false`, the view renders the legacy branch and shows a dismissible banner above the grid:

> "This view has been upgraded to the new Mercury design. \[Try it]   \[Not now]"

Clicking "Try it" sets `mercuryOptIn[viewKey] = true` on the user's profile (via `commands.setUserPreference`, a new minimal procedure landing in Phase 0b — server-persisted so the choice survives device-swaps). Clicking "Not now" sets a one-week `dismissedMercuryBannerByView[viewKey] = ISOString` in `useUiStore` (added to `partialize`). After opting in, the next refresh renders `<PrimaryGridView>`; a small "Revert to classic" link appears in the view header for the rest of the operator's session and a setting in `Settings → Experimental` exposes both directions persistently.

**No global revert.** Per-view only. If two views regress, the operator reverts only those two. There is no master switch — that pattern hides which views have problems from the operator and from us.

**Release notes.** [CHANGELOG.md](../../CHANGELOG.md) (created in Phase 0b) gets one entry per phase with: phase name, views affected, in-app banner copy live, opt-in mechanism, link to the persona QA report under `docs/qa/runs/`. The in-app banner copy includes a single link to the CHANGELOG entry for the current phase. CHANGELOG entries are authored by the integrator in the phase-closeout PR, not auto-generated.

**Phase 4 banner removal.** When the flag is removed in Phase 4, the banner removes with it. By Phase 4 every operator who has not opted in already has been on Mercury for at least the 7-day stability window after 3B/3C; no further communication is needed beyond a final CHANGELOG entry announcing the legacy code retirement.

---

## §8 — Open Decisions Punted to Implementation

Each item below has a single owner agent and a target phase. Surface here so they do not get lost in the cross-document references.

| Item | Owner | Resolved by |
|---|---|---|
| Final shape of `setUserPreference` server procedure (Phase 0b). Naming and scope chosen during P0-7 backend pass, not here. | `opus-build` (auth-adjacent) | Phase 0b PR |
| The two-week observation window thresholds for "P0 incident" definition gating Phase 3C. Default: any operator-reported regression on a money-mutating view (`payments`, `sales`, `vendors`). | `pm` + Evan | Before Phase 3B flip |
| Disposition of `settings` view — does it migrate to Mercury chrome at all, or stay legacy permanently? Punted to Phase 3D scoping. | `claude-architect` | Phase 3D scoping PR |

No other open decisions block Phase 0a closeout.
