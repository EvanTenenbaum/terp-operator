## 2026-06-16 — GridJourney → PrimaryGridView Refactor Decision

**Context.** Mercury UX retrofit (branch `docs/mercury-ux-retrofit-master-plan`) names a `PrimaryGridView` template (Manifesto §2.1, §5.2) that is functionally identical to the existing `GridJourney` factory at `src/client/views/operations/shared.tsx:247`. `GridJourney` already wires `trpc.queries.grid.useQuery({ view })` (one primary query, ARCH-1), `useUiStore.selectedRows[view]` (ARCH-4 selection gate), `useCommandRunner` (ARCH-7 mutations), `OperatorGrid` (the AG Grid wrapper), the viewer role-gating that drives canWrite, and a pass-through of `inspectorTabs` into `OperatorGrid`'s bottom-anchored RowInspector. Today's callers are 6 views directly (`ClientLedgerView`, `CloseoutView`, `ConnectorsView`, `InventoryView`, `PaymentsView`, `VendorPayablesView`) plus 5 sibling views (`PurchaseOrdersView`, `OrdersView`, `FulfillmentView`, `PurchaseReceiptsView`, `RecoveryView`) that reach into `columnsByView` and `OperatorGrid` directly with the same shape. The Manifesto §4 migration table calls the union "10+ views" and lists `GridJourney → PrimaryGridView` as **Refactor and rename**, not parallel build. CPO audit Finding #2 (P0) called out the gap. Without an explicit closeout, agents reading the spec at `docs/engineering-plans/specifications/templates/grid-view.md` would parallel-build a `GridView.tsx` component sibling to `GridJourney` and produce two competing templates for an entire release cycle. Authority: `MERCURY-ARCHITECTURE-MANIFESTO.md` §4 (migration map row "GridJourney"), §5.2 (extension over replacement); `CPO-AUDIT-REPORT.md` F2 (P0) and follow-up "Decide GridJourney ↔ GridView template strategy."

**Decision: Refactor in place.** No parallel `GridView.tsx`/`PrimaryGridView.tsx` build. The spec at `docs/engineering-plans/specifications/templates/primary-grid-view.md` describes the *target shape of the existing `GridJourney` factory after refactor*, not a sibling component. Rationale (3 lines): (1) `GridJourney` already implements every load-bearing primitive — primary query wiring, selection store wiring, command runner wiring, role-gated canWrite, empty-state plumbing; the gap is only schema-driven columns and state-machine-driven actions, both of which the Phase 0 config stubs (`entity-schemas.ts`, `entity-actions.ts`) are now ready to absorb. (2) Parallel build means 11 views split across two templates for at least the duration of Phase 2–3D — inconsistent selection behavior, inconsistent empty states, double maintenance of the grid query path, and a guaranteed source of "this view's column prefs work, that view's don't" regressions. (3) Refactor in place keeps a single mount, a single grid path, a single selection store, and a single set of operator AG-Grid column prefs valid throughout the migration.

**Renames.**

| Today | After refactor |
|---|---|
| File `src/client/views/operations/shared.tsx` (GridJourney lives inside the operations grab-bag) | `src/client/templates/PrimaryGridView.tsx` (template gets its own home; helpers `labelFromToken`, `moneyish`, `dateish`, `formatRequestType`, `formatRequestSource`, `EMPTY_ROWS` stay in `shared.tsx` to avoid a 30-file import churn). `columnsByView` is **deleted** as its content migrates field-by-field into `entity-schemas.ts`. |
| Component `GridJourney` (export) | `PrimaryGridView` (export). `GridJourney` re-exported from `templates/PrimaryGridView.tsx` as a `@deprecated` alias for one release cycle. |
| Props type (inline anonymous) | Named export `PrimaryGridViewProps` (formal interface, see signature change below). The old anonymous shape is no longer accepted; per-view `columns` / `actions` / `selectionActions` / `inspectorTabs` are removed entirely. |
| `columnsByView` map in `shared.tsx` | Resolved via `useColumnDefs(entity)` against `entity-schemas.ts`. Each entry (`purchaseOrders`, `orders`, `payments`, `inventory`, `clients`, `vendors`, `fulfillment`, `connectors`, `recovery`, `purchaseReceipts`, `disputes`, `closeout`) becomes a field block on the corresponding entity schema. |
| `selectionActions` callback returning `<StatusActionBar>` | Auto-mounted `<BulkActionBar>` whose contents come from the intersection of `getAllowedActions(entity, status, role)` across selected rows. |
| `actions` callback returning ad-hoc top-of-grid chrome | Removed. Top-of-grid chrome is owned by `<FilterToolbar>` (filter presets, status pills, advanced filter button); operator-side action buttons live in `<SlideOver>`'s action bar from the state machine. |
| `prelude` callback returning workspace panels above the grid | Removed from the template surface. The two views that pass real preludes (PaymentsView's `QuickLedgerGrid` + allocation panel, VendorPayablesView's vendor money-out + bill tools, InventoryView's `PhotographyQueuePanel`, ConnectorsView's notes/route band) get an explicit `headerSlot?: ReactNode` extension slot per the existing template spec — narrowly scoped, not a free-form chrome dumping ground. |
| `inspectorTabs` callback returning bottom-anchored RowInspector tabs | **Deleted entirely.** PaymentsView's `receipt` + `linked-orders` tabs and OrdersView's `invoice` tab fold into right-side `<SlideOver>` tabs via the tab registry. See "inspectorTabs disposition" below. |
| `onCellCommit` callback | Removed from props. Cell editors commit via `cellRendererParams` from `entity-schemas.ts` directly through `useCommandRunner` per ARCH-12 — the per-view `onCellCommit` switch is the anti-pattern this replaces. |
| `expansionConfig` (master-detail AG Grid behavior) | Removed from `PrimaryGridView`. Views that need master-detail (PurchaseOrdersView lines) migrate to the separate `MasterDetailView` template (Manifesto §2.1). |
| `title`, `emptyTitle`, `emptyChildren` | Sourced from `view-registry.ts` (`title`) and entity schema (`emptyTitle` / `emptyChildren` default — overrideable per view registry entry). Removed from per-call props. |

**New signature (formal interface).**

```ts
// src/client/templates/PrimaryGridView.tsx
export interface PrimaryGridViewProps {
  /** View key. Drives query, store slice, URL grammar, and registry lookup. */
  viewKey: ViewKey;
  /**
   * Optional bespoke header content rendered ABOVE FilterToolbar.
   * Used by ~3 views that have non-chrome workspace context (PaymentsView's
   * QuickLedgerGrid + allocation panel, VendorPayablesView's money-out band).
   * Standard views (≥7 of 11) pass nothing.
   *
   * RULE: headerSlot is for primary-task context that survives view load.
   * It is NOT a hiding place for buttons, status strips, or supporting info.
   * Those go to FilterToolbar, ActionBar, or a SlideOver tab. Violations
   * fail review under §6.1.
   */
  headerSlot?: ReactNode;
}
```

Everything else flows from `viewKey` → `getViewEntry(viewKey)` → `entity` → `useColumnDefs(entity)` + `getAllowedActions(entity, status, role)`. No per-view ColDef arrays, no per-view StatusActionTables, no per-view onCellCommit handlers.

**inspectorTabs disposition (binding tie to P0-3 ContextDrawer → SlideOver decision).** PaymentsView (`receipt`, `linked-orders`) and OrdersView (`invoice`) are the two real callers today; the Manifesto §4 row claim that this is OrdersView-only is wrong and is corrected here. Both fold into `<SlideOver>` tabs via the new tab registry (`src/client/components/tabs/registry.ts`), which the P0-3 decision created. Concretely:

- PaymentsView's `(row) => [receipt, linked-orders]` becomes `registerTabs('payment', [{key: 'receipt', component: ReceiptPanelTab, defaultFor: ['payment']}, {key: 'linked-orders', component: PaymentLinkedOrdersTab}])`. The `ReceiptPanel` and `PaymentLinkedOrdersTab` components already exist; only the registration call is new.
- OrdersView's `(row) => [invoice]` becomes `registerTabs('order', [..., {key: 'invoice', component: OrderInvoiceTab}])`. The `OrderInvoiceTab` component already exists inline in `OrdersView.tsx`; it moves to `src/client/components/tabs/OrderInvoiceTab.tsx` verbatim during view migration.

**Transition behavior during migration.** Between Phase 0b (rename + signature shrink) and Phase 2 (per-view migration), views still passing the old `inspectorTabs` / `actions` / `selectionActions` / `prelude` / `columns` props would be a hard type error if the props are simply removed in one shot — that breaks the typecheck gate before any view migrates. The handoff plan:

1. Phase 0b renames `GridJourney` to `PrimaryGridView` but **keeps the legacy prop surface** wired through a thin `@deprecated`-marked wrapper. The wrapper accepts the old shape, logs a one-time `console.warn` per view in dev, and dispatches into the new internals. Typecheck stays green; no view changes behavior.
2. Each view migrates in Phase 1 (PurchaseOrdersView pilot) or Phase 2 (the 5 remaining current GridJourney callers + 5 sibling views). When a view migrates, it drops the old props in the same PR that adds its `view-registry.ts` entry + `entity-schemas.ts` fields + (where needed) `entity-actions.ts` state machine + tab registrations.
3. Phase 2 closeout deletes the `@deprecated` legacy prop wrapper after all 11 views have migrated. Grep at gate must return zero references to `actions=`, `selectionActions=`, `inspectorTabs=`, `prelude=`, `columns=`, `onCellCommit=`, `expansionConfig=` on `<PrimaryGridView` or `<GridJourney`.
4. Phase 4 deletes the `GridJourney` re-export alias.

**Action system replacement (per-view overrides question).** The Manifesto §2.2 contract for `BulkActionBar` is that selection actions come from `getAllowedActions(entity, status, role)` intersected across selected rows — **with no per-view escape hatch.** The CPO audit explicitly rejects per-view `StatusActionTable` for the same reason that drove the entity-actions registry. Concretely, the 6 today-and-tomorrow views that need genuinely view-specific selection behavior (PaymentsView's `allocatePayment` with auto-apply-oldest vs. allocate-remaining; VendorPayablesView's `payBill` two-step with confirm-then-schedule-then-record; ConnectorsView's `route` requiring a non-empty destination field) are handled in the state machine itself: state machines may declare action variants gated on row-derived predicates (`when: (row) => Number(row.unappliedAmount) > 0`) and may declare confirmation requirements (`confirmationRequired: true`, `confirmGuard: (row) => ...`). The `EntityAction` type already accommodates `confirmationRequired` and `slidesOver`; the predicate variant is the only additive change. **There is no per-view action override.** If a view feels it needs one, the correct response is a state machine bug in `entity-actions.ts`, not a callback prop on the template.

**`columnsByView` deletion path.** Today's `columnsByView` map (12 entries totaling ~210 lines of inline ColDef arrays in `shared.tsx`) is the inverse of the entity-schemas registry. Each entry maps directly:

| `columnsByView` key | Migrates to entity schema | Phase |
|---|---|---|
| `purchaseOrders` | `purchaseOrderSchema` (already scaffolded in `entity-schemas.ts`) | Phase 1 (pilot) |
| `orders` | New `saleOrderSchema` (note: the entity is `sale` per the view-registry stub, but the view key remains `orders`; map carefully) | Phase 3A/3B |
| `payments` | New `paymentSchema` | Phase 2 |
| `inventory` | New `inventoryBatchSchema` | Phase 2 |
| `clients` | New `customerSchema` | Phase 2 |
| `vendors` | New `vendorBillSchema` (the `vendors` view shows vendor bills, not vendors) | Phase 2 |
| `fulfillment` | New `pickSchema` | Phase 3D |
| `connectors` | New `connectorRequestSchema` | Phase 2 |
| `recovery` | New `commandJournalSchema` (recovery view = failed commands) | Phase 3D |
| `purchaseReceipts` | New `purchaseReceiptSchema` | Phase 3D |
| `disputes` | New `invoiceDisputeSchema` | Phase 3D |
| `closeout` | New `closeoutPeriodSchema` | Phase 2 |

The custom `cellRenderer` blocks in `columnsByView.clients` (the "Aging" badge), `columnsByView.fulfillment` (the `alertCount` chip), `columnsByView.inventory` (the alias dot), and `columnsByView.connectors` (the source/type formatters) become **stable component exports** under `src/client/components/cellRenderers/` and are referenced from the entity schema by name. Per ARCH-3 / §6.1, no inline `useMemo` closures over view state. ClientLedgerView's heavy `cellRenderer` blocks (linking to contact profile, opening client ledger) are the canonical case — they move into `CustomerNameCell`, `CustomerBalanceCell`, etc. as standalone components.

**Migration order.**

1. **Phase 0a (this branch, no behavior change).**
   - Create the rewritten spec at `docs/engineering-plans/specifications/templates/primary-grid-view.md` (this PR — planning artifact only).
   - Update `entity-schemas.ts` and `entity-actions.ts` scaffolding tables and TODOs to reference the per-entity migration mapping above.
   - Mark the existing `docs/engineering-plans/specifications/templates/grid-view.md` superseded with a pointer to `primary-grid-view.md`. Do not delete; redirect.
2. **Phase 0b (rename + signature shrink, no view changes).**
   - Move `GridJourney` body from `src/client/views/operations/shared.tsx` to `src/client/templates/PrimaryGridView.tsx`. Export as `PrimaryGridView`. Re-export `GridJourney` from the same module as a `@deprecated` alias.
   - Implement the new `PrimaryGridViewProps` interface (only `viewKey` + `headerSlot?`).
   - Add the `@deprecated` legacy-prop wrapper that maps `{view, title, actions, prelude, columns, selectionActions, inspectorTabs, onCellCommit, expansionConfig, emptyTitle, emptyChildren}` into the new internals. Wrapper logs one `console.warn` per view per session.
   - Verify: typecheck clean, all 1608 tests green, no observable behavior change.
3. **Phase 1 (PurchaseOrdersView pilot).**
   - Populate `view-registry.ts` entry for `purchaseOrders` (already scaffolded).
   - Populate `entity-schemas.ts` `purchaseOrderSchema` fields against the full `columnsByView.purchaseOrders` set (already scaffolded with 8 of 22 fields).
   - Populate `entity-actions.ts` `purchaseOrderActions` state machine (already scaffolded across 8 states).
   - Migrate `PurchaseOrdersView` to `<PrimaryGridView viewKey="purchaseOrders" />` — drop the direct `OperatorGrid` invocation, drop the local prelude blocks (move to `headerSlot` if genuinely primary-task, otherwise into a `SlideOver` tab or delete per UX-3).
   - Verify: persona QA passes the PurchaseOrdersView Mercury wireframe coverage (Manifesto §7.x).
4. **Phase 2 (the 9 remaining views: ClientLedgerView, PaymentsView, InventoryView, VendorPayablesView, ConnectorsView, CloseoutView, OrdersView, FulfillmentView, PurchaseReceiptsView, RecoveryView).**
   - Migrate in dependency order: views with the fewest custom renderers and state-machine actions first (CloseoutView → ConnectorsView → PurchaseReceiptsView → RecoveryView), then mid-complexity (PaymentsView, FulfillmentView, OrdersView), then high-complexity (VendorPayablesView, ClientLedgerView, InventoryView).
   - Each view migration is one PR: registry entry + schema fields + state machine + tab registrations + view file shrink. PRs that don't include the schema additions are rejected.
5. **Phase 3A/3B (SalesView).**
   - SalesView is the hard gate; its 1986-line shape is not addressed by this decision. SalesView migrates to `PrimaryGridView` as the last step of its own Phase 3A refactor sequence, after its inline `useMemo` cell renderers have been extracted to stable components.
6. **Phase 4 (cleanup).**
   - Delete the `@deprecated` legacy-prop wrapper in `PrimaryGridView`.
   - Delete the `GridJourney` re-export alias.
   - Delete `columnsByView` from `shared.tsx`.
   - Delete `templates/InspectorDrawer.tsx` and `templates/InspectorDrawer.test.tsx` (no remaining callers after `OperatorGrid.inspectorTabs` is removed in Phase 2).
   - Remove the `inspectorTabs` prop from `OperatorGrid` itself (one-line cleanup once the upstream callers are gone).
   - Confirm `rg "GridJourney" src/` returns zero hits.

**The `OperatorGrid.inspectorTabs` underlying mechanism also retires.** `OperatorGrid` accepts an `inspectorTabs?: (row: GridRow) => InspectorTab[]` prop (line 71 of `OperatorGrid.tsx`) that drives a bottom-anchored `RowInspector` component. This is the same pattern as the `InspectorDrawer` (different file, same idea). Per Manifesto §5.3 the InspectorDrawer migrates to right-side `SlideOver` tabs; this decision extends that to the `OperatorGrid.inspectorTabs` prop. After Phase 2, the `inspectorTabs` prop disappears from `OperatorGrid`, the `RowInspector` component is deleted, and `templates/InspectorDrawer.tsx` is deleted. Two parallel bottom-tab systems become zero.

**Why this is the only sane path.** A parallel `PrimaryGridView` build means: (1) `columnsByView` and `entity-schemas.ts` both contain column truth for at least Phase 2 — guaranteed drift, especially around editability and cell renderers; (2) `StatusActionBar`-via-`selectionActions` and `BulkActionBar`-via-state-machine both run, with views split between them — operators see inconsistent confirmation behavior between `vendors` and `purchaseOrders`; (3) the grid query path is duplicated, breaking the tRPC deduplication assumption that `UnappliedCountBadge` (PaymentsView) and `fulfillmentPickColumns` (FulfillmentView) silently depend on; (4) `OperatorGrid.inspectorTabs` and `SlideOver` tabs both render simultaneously for OrdersView/PaymentsView until both are migrated — two competing supplementary surfaces on the same row click. Refactor in place keeps one column path, one selection path, one query path, one supplementary surface, and ships the schema/state-machine registries as additive — exactly the shape Phase 0 was scaffolded for.

**Authority:** `MERCURY-ARCHITECTURE-MANIFESTO.md` §4 (migration map rows "GridJourney", "InspectorDrawer", "Per-view `ColDef[]` arrays", "Per-view `StatusActionTable` decision logic"), §5.2 ("GridJourney → PrimaryGridView" extension strategy), §6.1 (anti-patterns "Per-view `useMemo` with inline cell renderer", "Inline `<button>` action ribbon in a view", "Layout primitives in view files"); `CPO-AUDIT-REPORT.md` F2 (P0) and the "Decide GridJourney ↔ GridView template strategy" follow-up; `docs/design-system/decisions-log.md` 2026-06-16 entry "ContextDrawer → SlideOver Refactor Decision" (sibling P0 decision; this one is consistent with it on `inspectorTabs` fold-into-`SlideOver`-tabs and on refactor-in-place posture).

**Files changed by this decision (planning only — no code):**
- This entry (`docs/design-system/decisions-log.md`).
- Rewritten spec at `docs/engineering-plans/specifications/templates/primary-grid-view.md` (treats spec as refactor target, not parallel build).
- `docs/engineering-plans/specifications/templates/grid-view.md` updated to a one-line pointer at the new spec (superseded; not deleted to avoid breaking outbound links).

---

## 2026-06-16 — ContextDrawer → SlideOver Refactor Decision

**Context.** Mercury UX retrofit (branch `docs/mercury-ux-retrofit-master-plan`) plans a `DetailSlideover` component. `ContextDrawer.tsx` (647 lines) already implements 80%+ of the spec: 5-state model (`closed | peek | standard | wide | focus`), URL sync via `useDrawerUrlSync`, focus trap via `useFocusTrap`, hard-coded 14-entity `drawerTabs` map, ARIA-correct dialog/tablist semantics, per-view `drawerByView` in `useUiStore`, `lastUsedDrawerStateByView` memory, state-cycle button (UX-B06), `]` keyboard shortcut, and conditional dispatch into 19 existing tab components under `drawerTabs/`. CPO audit F2 (P0) named this as a blocker for Phase 0. Authority: `MERCURY-ARCHITECTURE-MANIFESTO.md` §5.2; `CPO-AUDIT-REPORT.md` F2.

**Decision: Refactor in place.** No parallel `DetailSlideover.tsx`. The spec at `docs/engineering-plans/specifications/components/detail-slideover.md` describes the *target shape of the existing ContextDrawer after refactor*, not a sibling build. Parallel build = guaranteed drift, double-mount risk, 6–8 weeks of dead-code migration. Refactor in place = ~1–2 weeks, no semantic discontinuity for operators mid-session.

**Renames.**
| Today | After refactor |
|---|---|
| File `src/client/components/ContextDrawer.tsx` | `src/client/components/SlideOver.tsx` |
| Component `ContextDrawer` (export) | `SlideOver` (export) |
| Type `DrawerStateName` | `SlideOverState` |
| Hard-coded `drawerTabs` map (`Record<string, Tab[]>` inside the component) | Tab registry at `src/client/components/tabs/registry.ts` with `registerTabs(entityType, tabs[])` / `getTabs(entityType, role?)` API. Registrations live in `src/client/components/tabs/registrations.ts`, imported once at app boot. |
| Hook `useDrawerUrlSync(view)` | Wrapped (not replaced) by `useViewUrlState(view)` which adds `tab`, `status`, `f`, `sel`, `cur` params on top of the existing `drawer | entityType | entityId` grammar. Public surface of `useDrawerUrlSync` preserved for the transition; deleted in Phase 4. |
| `drawerByView` store slice | **Field name kept** — renaming would force a persisted-state migration for every operator's session. Internal identifier is irrelevant; external naming is what the UX requires. Same rationale for `activeDrawerEntityByView`, `lastUsedDrawerStateByView`, `setDrawerState`, `setDrawerTab`, `cycleDrawer`, `toggleDrawer`. |
| Drawer-tab components in `drawerTabs/*.tsx` | Kept as-is, registered by key via the new registry. No mass move. |

**5th `focus` state: DROP.** Rationale (3 lines): (1) The spec describes 4 states; Mercury has no 4th width tier; the cycle adds chrome (state glyph, coachmark text) for marginal width gain over `wide`. (2) Code search shows `focus` is referenced only by `ContextDrawer.tsx` itself, the `DRAWER_CYCLE_ORDER` cycle, and uiStore — no view depends on a `focus`-only behavior. (3) Removing a state shrinks the state machine without breaking any view contract. Migration: during the refactor window, persisted `focus` values in `drawerByView`/`lastUsedDrawerStateByView` are coerced to `wide` on store rehydration (one-line `partialize` migration). `DRAWER_CYCLE_ORDER` becomes `['peek', 'standard', 'wide']`. `stateLabel`/`DRAWER_STATE_GLYPH` lose the `focus` row. Coachmark copy drops "/ focus".

**URL sync: preserve exactly.** `useDrawerUrlSync` keeps writing `drawer`, `entityType`, `entityId` with the same `replace: true` semantics and the same mount-time restore. New `useViewUrlState(view)` is a *wrapper* — it composes the existing hook and adds `tab` (active SlideOver tab), `status` (multi-select status filter, comma-separated), `f` (compressed `FilterGroupInput`), `sel` (optional selection list), `cur` (pagination cursor). The existing `?drawer=…&entityType=…&entityId=…` URLs in operator bookmarks remain valid. Per Manifesto §5.2.

**Focus trap: preserve.** `useFocusTrap` is mature, used elsewhere (VendorContextDrawer pattern, alert dialogs), and works. No refactor. SlideOver continues to call `useFocusTrap<HTMLElement>(open, closeFn)` with the same overlay/palette skip logic.

**Hard-coded `drawerTabs` map: replaced by registry.** Source: `src/client/components/tabs/registry.ts` exports `registerTabs(entityType, tabs)`, `getTabs(entityType, role?)`, type `SlideOverTab { key, label, icon?, component, badge?, requiresRole?, defaultFor? }`. Registrations live in `src/client/components/tabs/registrations.ts` as 14 `registerTabs(...)` calls (one per current entity type: `queue, customer, vendor, lot, order, salesOrder, po, vendorBill, payment, pick, connector, recovery, closeout, report, settings`). Each call references the existing component from `drawerTabs/*.tsx` by import. The 187 lines of map inside `ContextDrawer.tsx` move out verbatim — same keys, same labels. SlideOver calls `getTabs(entityType, user.role)` once per render. Role-gating is enforced by both the registry filter AND the underlying tRPC procedure (defense in depth per CPO audit F11).

**Migration path (order and gating).**

1. **Phase 0a (this branch, no behavior change):**
   - Create `tabs/registry.ts` and `tabs/registrations.ts`. Port `drawerTabs` verbatim.
   - `ContextDrawer.tsx` replaces `tabsFor(entityType)` with `getTabs(entityType, role)`. No other changes.
   - Add `partialize`/migrate step coercing persisted `focus` → `wide`.
   - Verify: existing tests pass, no UI change.
2. **Phase 0b (rename + state-machine shrink):**
   - Rename file `ContextDrawer.tsx` → `SlideOver.tsx`; component export `ContextDrawer` → `SlideOver`. Update ~25 import sites.
   - Rename type `DrawerStateName` → `SlideOverState` at declaration site (`src/shared/types.ts`); re-export `DrawerStateName` as deprecated alias for one release. Store field names unchanged.
   - Remove `focus` from `SlideOverState` enum. Remove from `DRAWER_CYCLE_ORDER`, `stateLabel`, `DRAWER_STATE_GLYPH`, coachmark string.
   - Verify: typecheck clean, `pnpm test` green, persisted-state restore test covers the `focus → wide` coercion path.
3. **Phase 1 (PurchaseOrdersView pilot, additive features per spec):**
   - Wrap `useDrawerUrlSync` in `useViewUrlState(view)` and add `tab` param. PO is the first view to consume it.
   - Add drag-to-resize handle on left edge (NEW; not currently implemented).
   - Add "Open in full view" action wired to entity route (NEW).
   - Add peek-state click-outside dismiss (NEW; currently only `wide`/`standard` close via ✕/Escape/focus-trap-Escape).
   - Migrate the per-view inline conditional rendering (PO/Lot/SalesOrder/VendorBill `if (activeTab === '…' && is…Entity)` blocks) into per-tab `component` props in the registry. The inline `RelationshipContext` and generic facts card become a registered `overview` tab component.
4. **Phase 1–3D (per-view tab adoption, per Manifesto §5.3 migration map):**
   - Each of the 18 drawer/dialog components listed in Manifesto §5.3 migrates to either a registry tab key on an existing entity, a new entity registration, or a `ConfirmRoot` call. See the per-component table in `docs/engineering-plans/specifications/components/detail-slideover.md` §C.
5. **Phase 4 (cleanup):**
   - Delete `useDrawerUrlSync` re-export.
   - Delete `DrawerStateName` deprecated alias.
   - Delete deprecated dialog components after grep-clean confirmation.
   - Confirm no remaining `ContextDrawer` import in the tree.

**The old `DrawerStateName` enum sticks around during transition** as a re-export alias from the same module, marked `@deprecated` with a JSDoc pointer to `SlideOverState`. Removed in Phase 4 only after the manifest-level grep returns zero non-self references.

**Why this is the only sane path.** Parallel build would create three live drawer systems (ContextDrawer, InspectorDrawer, DetailSlideover) for at least one release cycle, with views split between them and operators surprised by inconsistent close/cycle behavior. Refactor in place keeps a single mount, a single set of keyboard hotkeys, a single ARIA contract, and a single set of operator bookmarks valid throughout the migration. The spec's "build from scratch" framing was a CPO-audit miss (F2); this decision corrects it.

**Authority:** `MERCURY-ARCHITECTURE-MANIFESTO.md` §5.2 (ContextDrawer extension), §4 migration map row "ContextDrawer", §6.1 anti-patterns "Multiple `SlideOver` instances mounted simultaneously"; `CPO-AUDIT-REPORT.md` F2 (P0).

**Files changed by this decision (planning only — no code):**
- This entry (`docs/design-system/decisions-log.md`).
- Rewritten spec at `docs/engineering-plans/specifications/components/detail-slideover.md` (treats spec as refactor target, not parallel build).

---

## 2026-06-15 — AG Grid border visibility fix

**Problem**: Grid lines (horizontal and vertical cell borders) were invisible across all AG Grid table views (Inventory, Purchase Orders, Client Ledger, Sales). Previous fix attempts focused on grid height/collapse issues.

**Root causes (3)**:
1. AG Grid base theme sets `--ag-cell-horizontal-border: solid transparent` — vertical column borders invisible
2. `--ag-border-color` was near-invisible against alternating row backgrounds: our `#d8ded6` or AG Grid's 15% opacity default had ~1.05:1 contrast against `#fbfcfa`
3. Our `.ag-theme-quartz` overrides loaded before `ag-theme-quartz.css` — AG Grid defaults always won

**Fix** (`src/client/styles.css`):
- New `.ag-theme-quartz.grid-shell` block with higher specificity (two-class selector, wins regardless of CSS import order)
- `--ag-border-color: #c5cdc0` — visible but subtle; ~1.7:1 contrast against alternating row backgrounds 
- `--ag-cell-horizontal-border: solid 1px var(--ag-border-color)` — vertical column borders now visible
- `.ag-theme-quartz.grid-shell .ag-row { border-bottom-color: #c5cdc0 }` — horizontal row borders
- `.ag-theme-quartz.grid-shell .ag-cell { border-bottom-color: #c5cdc0 }` — cell borders  

**Verification**: Live browser tests confirm `rgb(197, 205, 192)` borders rendered on staging across all 4 modules (11+ rows, 88-110 cells each).

**Also fixed**: 3 pre-existing Tailwind `text-accent-dark` build errors in `.pricing-col-header`, `.filter-pill`, `.advanced-btn`, `.builder-panel-title`.

> **Append-only.** Add new entries at the **top**. Don't delete history.

## 2026-06-12 — UX audit closure reconciliation (post-closure-audit corrections)

A closure audit cross-checked all 127 VALID triage items against the wave entries. Corrections it required:

- **UX-U02 (keyboard parity epic): CLOSED** — all sub-items shipped (A03/A07 Wave 1, C01–C06 + T07 Wave 3, intake/QuickLedger paste wiring Wave 7). The epic's "before/after keystroke benchmark on X1" was not run as a scripted flow; the keyboard wins are individually tested (registry bijection, ⌘↵ decision-table tests, paste/fill-down/density/Enter-advance suites). Formal X1 benchmark: tracked as optional follow-up.
- **UX-U03 (pre-post confidence epic): CLOSED** — sub-items F02/F04/G02/K02 all shipped Wave 4.
- **UX-U04 (mobile warehouse epic): CLOSED for in-scope deliverable** — L01/R01 shipped Waves 5+6; CAP-040/041/042 follow-ons out of scope per Execution Decision 1.
- **UX-C02 QuickLedger paste:** Wave 3 deferred it; it subsequently SHIPPED in Wave 7 commit `c7dcb9f` (QuickLedgerGrid.tsx onPaste + 247-line test file) but the Wave 7 entry credited only the intake wiring. Both intake and QuickLedger paste are now delivered; only PO-line paste remains on the exported-helper follow-up.
- **UX-L05 finding REFUTED with evidence:** the auditor cited PickLineScreen.tsx:179 `onBack()` — that call is in `handleHold` (hold/recall path). The Enter→pack path runs `handleMarkPicked → submitPack → onPicked()` → `PickView.handleLinePicked` (GH #345), which auto-advances to the next unpacked line and only returns to the list when all lines are packed. The Wave 5+6 claim stands as written.
- **UX-L02 caveat added for honesty:** the discrepancy note is captured client-side (toast) only; server-side Issue-tab persistence requires a new command accepting fulfillmentLineId + note — tracked, per the code's own comment.

## 2026-06-12 — UX audit Wave 7: defaults, density & remaining P1/P2 (B01/B06/B08, E07/E08, F03/F07–F12, G03–G05, H03/H05/H07–H09, I01–I06, O02–O04, P02, R03, S01/S03/S05, C02/C09 follow-ups, D06)

Gate green: typecheck, 1608/1608 vitest, build.

- **UX-F03:** sale-line item entry is a finder-resolver typeahead (same query/semantics as the finder pane); unique-match commits auto-bind, ambiguous/zero persist `needs_resolution` into the validation panel and Wave-4 pre-post check. In-grid popup editor deferred (needs async-editor OperatorGrid API).
- **UX-G03:** found + fixed a silent data-loss bug — SalesView's editable `deliveryWindow` column had no commit handler (edits dropped); now commits `setDeliveryWindow`. `applyClientCredit` gains a manager-gated Sale-tray home.
- **UX-F07/F08/F09/F11/F12:** purchase-history finder chips; "Repeat last order" relocated to customer workspace header; tray=order verbs with output verbs consolidated in sheet-preview panel; suggestions adopt "Why shown" finder chips (row-level convergence deferred — data-flow restructure); `belowFloorReason` on internal export only, catalog/offer regression-pinned to exclude it.
- **UX-B01:** low-frequency lanes (Receipts, Photography, Credit Review, Disputes, Referees) behind per-group "More" disclosure with persisted expansion; ⌘1–6 still navigate collapsed lanes. **UX-B06:** drawer state-cycle button + one-time coachmark. **UX-B08:** route-change ribbon clearing for stale cases.
- **UX-E07 (minimal):** truthfully-local per-lane work-queue snooze (persisted, labeled snooze). **UX-E08:** "View all (N)" ranked expansion. **UX-E06:** TRACKED — no warning payload exists server-side and new procedures are out of guardrails. **UX-J07 dashboard half:** TRACKED (drilldown payload lacks bucket).
- **UX-H03/H05/H07/H08/H09/S03/C09/C02-intake:** intake selection totals strip; arrival select editor; shared marker legend tooltips; PO prepaid columns; pinned PO header; warning glyphs beside tinted cells; registry keystrokes on intake actions; TSV paste on intake detail grid. **UX-H06:** TRACKED — row placement is server-ordering controlled.
- **UX-I01:** defaults re-derived against today's columns — all named grids ≤8 visible (hidden stay in Columns menu; prefs precedence verified). **UX-I02/I03/I05/I06:** media columns + "No photos" preset; adjustment before/after preview; finder identity line; per-grid default saved view. **UX-G04/G05/P02:** order↔invoice link parity; "Needs marks" preset; accepted-match "Next: create PO / create Sale" links.
- **UX-O02/O03/O04/R03:** PhotographyQueuePanel mounted in Inventory + Sales (orchestrator applied the SalesView one-liner); bulk publish on selection; upload-complete badges; mobile catalog "Copy offer" via the shared sanitizer.
- **UX-S01:** 42-test a11y contract extension (StatusActionBar menus, InspectorDrawer tabs, FilterPresetStrip aria-pressed, ToastCenter live regions, landmarks). **UX-S05:** ExpansionPanel native buttons. **UX-D06:** optimistic patch shipped for the safe flips only, rollback on error.
- **Deliberate deferrals recorded:** T05/H02 full IntakeView→OperatorGrid convergence (H02's audit-stated minimum-viable shipped Wave 5 via M01; re-platforming the core intake grid at run-end judged riskier than the residual value), F11 full row convergence, K03 sellout-trigger linkage, E06/J07-dashboard server payloads, H06.

## 2026-06-12 — UX audit Waves 5+6: support & relationship + mobile (UX-U01/N01/N02, B03/B04/N03, Q04–Q07, M01/M02/M04, F01/F06, L01/L02/L04/L05, R01/R02/R04)

Gate green: typecheck, 1315/1315 vitest (client + server routers), build.

- **UX-N01/N02 (U01 epic):** ContextDrawer Timeline tab for customer/vendor/order/lot backed by ONE sanctioned read-only `queries.entityTimeline` (command journal + payments/allocations + fulfillment marks + media publishes; existing tables only; limit≤100, offset≤900). "Copy status summary (customer-safe)" via new shared `src/shared/customerSafeStatus.ts` sanitizer (whitelist + denylist; 17 forbidden-field sentinels tested); RelationshipDrawer converged onto it with byte-identical output.
- **UX-B03:** customer/vendor name cells link to contact profiles; "Link contact" surfaces `linkContactToExistingEntity`; dual-role rows (server-computed `isDualRole`) default to the Relationship drawer tab. **UX-N03:** AR/AP shown directionally, no silent netting. **UX-B04:** palette entity navigation now also filters the grid so the selected row is visible under virtualization.
- **UX-Q04:** pending-frontend commands surfaced — updateContact/archiveContact (profile header, FormDialog, danger tone), addContactRole/linkContactToUser (Settings panel), updateVendor (vendor row edit); each removed from `pendingFrontendCommandNames`. **UX-Q07:** Issue tab gains "View dispute" for invoices with existing disputes.
- **UX-Q05 (Decision 6b):** owner-gated credit-engine admin shipped — stance CRUD with sum-to-100 + extreme-weight acknowledgement mirroring server rules, per-customer stance/disable, `bulkRevertCustomersToEngine` behind typed confirmation; 6 commands moved out of internal-only (all owner-gated); `setCustomerEngineMax` deliberately remains internal.
- **UX-M01:** posted intake batches and pick lines get row-origin "History / Reverse" deep-links into prefiltered Recovery. **UX-M02:** "Export support packet for selection" on the RowInspector Issue tab (shared with Recovery's packet machinery). **UX-M04:** Recovery journal gains entity-id + command-family filter chips.
- **UX-F01:** "Copy offer" in the sheet preview — customer-safe text block, forbidden-field tests. **UX-F06:** referee pill at confirm ("credit will accrue ▸ change/none") wiring the existing logRefereeCredit path. **UX-Q06:** referee totals strip + deactivated-history visibility; bulk "Pay accrued credits" ships disabled-with-reason — no payout command exists in the catalog (CAP-039 tracked; none invented).
- **UX-L01/R01:** PickView mounted at /mobile/pick; **UX-R02 (Decision 7):** minimal /mobile/intake (verify + flag only). Mobile nav now 7 tabs — orchestrator restored Catalog/Contacts after the unit dropped them (zero-functionality-loss rule); tab-inventory test strengthened to assert labels.
- **UX-R04:** <768px deep links map to mobile equivalents before falling back to dashboard. **UX-L05:** pick-line Enter confirms pack and advances. **UX-L02:** out-of-tolerance weights prompt a discrepancy note (never blocks packing). **UX-L04:** Labels/Manifest status chips on pick rows (display only; printLabels stays deferred per TER-1660).

## 2026-06-12 — UX audit Wave 4: pre-post confidence & money trust (UX-A04/A15, F02/F04/G02, J01–J07, K01–K04, H04)

Gate green: typecheck, 1023/1023 vitest (client + new DB-free server suites), build.

- **UX-F02:** Sale Builder pre-post strip (`SalePrePostStrip.tsx`) mirrors commandBus confirm/post preconditions exactly — credit is labeled advisory per TER-1659 ("will NOT refuse"), duplicates/priced/inventory as refusals — with ✗ deep-links; informational only, no disabled-logic changes.
- **UX-F04:** "Already in order" chip on sale-line Source cells using the server's `sourceRowKey||batchId` key space.
- **UX-G02:** orders grid gains allowlist field `crossOrderSourceOrders` (no new procedure); OrdersView shows "Shared source" chip on open rows with may-be-refused copy (the server's hard refusal is within-order; cross-order risk is availability-at-post).
- **UX-A15:** snapshot partial-failure pill gains "Retry snapshot" replaying the exact captured payload; pill clears on success.
- **UX-A04 (CAP-024, Decision 2):** Quick Ledger drafts persist server-side per-user — migration `0082_user_view_drafts.sql`, `userViewDrafts` schema, `quickLedgerDrafts`/`saveQuickLedgerDrafts` endpoints, debounced `useQuickLedgerDraftSync` hook with truthful "Drafts not synced" failure pill. localStorage partialize untouched — shared-workstation PII rationale intact; server is the only persistence.
- **UX-J01:** verified fixed in backend (commandBus FIFO auto-allocation) — no UI fallback needed.
- **UX-J02:** buyer-credit label confirmed; balance-effect preview (`balance → $Z`) added from on-wire data.
- **UX-J04:** estimated FIFO allocation preview per draft row mirroring the server's allocation ordering.
- **UX-J03:** Payments "Unapplied" preset + live count pill (no extra query; tRPC dedupe).
- **UX-J06:** payment inspector "Linked orders" tab — allocation rows cross-link to orders (TER-1624 pattern).
- **UX-J07:** bucket column verified on posted payment rows; dashboard drilldown bucket-grouping reported as follow-up (not edited this wave).
- **UX-K01:** due-reason + scheduled-date badge columns (data already in grid SQL; no server change).
- **UX-K02:** Pay on open/pending bills now confirms "This will schedule an immediate payout event, then record payment." — copy verified against commandBus schedule→record sequence.
- **UX-K03:** Trace tab gains linked-receipt section via LATERAL join fields on the existing vendors query; sellout-trigger linkage remains tracked (needs a real procedure).
- **UX-K04:** `voidVendorPayment` as tray verb with reversal-policy guidance in confirm.
- **UX-H04 (BE-009, Decision 5):** partial PO receiving — `receivePurchaseOrder` accepts optional per-line `lineQuantities` (over-asks rejected, never capped); `postPurchaseReceipt` ACCUMULATES `receivedQty` for partial-lineage lines (was overwrite — would have corrupted partial progress) and flips line/PO status only when cumulative ≥ ordered; reversal restores from beforeSnapshot. Receive-qty column + "Receive selected qty" tray action on PO lines. DB-free server tests via the repo's inMemoryDbMock.

## 2026-06-12 — UX audit Wave 3: keyboard parity & feedback (UX-T07/C01/S02/B02/C08/C09/F10, C05/C07, T06/D01/D02/D03/M05/D05, C02/C03/C04/C06)

Gate green: typecheck, 910/910 client vitest, build.

- **UX-T07:** `src/client/shortcuts/registry.ts` is the single source of truth for all 23 bindings; Hotkeys derives ⌘1–6 from it; a bijection test blocks registry/handler drift.
- **UX-C01:** `?` opens a registry-generated, focus-trapped ShortcutsOverlay; store key `shortcutsOverlayOpen` (unpersisted); palette entry "Keyboard shortcuts" opens it too.
- **UX-S02/B02:** SideNav badges + `aria-keyshortcuts` and Keel ⌘K sourced from the registry; badges only where bound. ⌘1–6 assignments unchanged — per-loop maps still tracked under B02.
- **UX-C08/C09:** drawer-tab and intake hotkeys registered + listed in the overlay. Audit shorthand corrected: intake combos are ⌘⌥⇧R/⌘⌥I (code requires ⌘).
- **UX-F10:** ⌥M toggles showMargin with a truthful toast (handles Mac ⌥M→µ).
- **UX-C05:** workbook vocabulary ("Files", "OFC", "25 flex", "Inv Posted", "Pay/F-up", "ticket", "sub", "iv", "vendor receipt", "rich") wired into launch + command aliases; marker-term entity search already covered by existing server SQL (legacy_marker/shorthand/price_range ilike) — no server change needed.
- **UX-C07:** Advanced palette (⌘⌥K) gated manager+; relabeled "Advanced (typed payload)" with danger hint.
- **UX-T06:** Toast gains optional `actions`; `pushToast(message, tone?, opts?)` backward-compatible; ToastCenter renders action buttons a11y-correctly.
- **UX-D01:** action toasts on high-frequency commands (post/confirm order → View order, fulfill → View order, allocate → View payment, lock → Open closeout, archive → View artifacts (M05), schedule/record vendor payment → View bill) via a `setNextSuccessActions` staging pattern on useCommandRunner — 3-arg runCommand signature preserved so existing test contracts hold.
- **UX-D02:** command-failure toasts always offer "Copy details" (name/key/message) and "Open in Recovery" prefiltered.
- **UX-D03:** tailored empty states on Orders/Payments/Fulfillment/Closeout/Recovery/VendorPayables/Disputes/Receipts/Media naming the producing verb+surface.
- **UX-C02:** AG Grid Enterprise ClipboardModule wired via `processDataFromClipboard` on all OperatorGrids with paste-summary toast; drafts only. QuickLedgerGrid + intake detail grid wiring deferred (custom tables) — `clipboardPaste.ts` helper exported for follow-up.
- **UX-C03:** fill handle enabled (y-direction) + ⌘D fill-down on cell-focused ranges, editable columns only; capture-phase stopPropagation disambiguates from intake's document-level ⌘D duplicate.
- **UX-C04:** per-user density toggle (compact/standard) in the Columns menu; `gridDensity` persisted beside gridColumnPrefs.
- **UX-C06:** finder qty-input Enter adds the row AND advances focus to the next result's qty input.

## 2026-06-12 — UX audit Wave 2: one-system completion (UX-T01/H01/T03/A12/A13, Q01–Q03, A08/A09/A10/A14/T02/T04)

Gate green: typecheck, 817/817 client vitest, build.

- **UX-T01:** `OperationsViews.tsx` (3,892 lines) split into 13 per-view files + `operations/shared.tsx` (GridJourney, columnsByView, cross-view helpers); barrel re-export keeps every existing import working. Verbatim mechanical move.
- **UX-H01:** PurchaseOrdersView adopts the StatusActionBar decision-table engine over the REAL PO state machine (`draft→finalized→approved→ordered→partially_received→received`, plus `cancelled`; spec/audit vocabulary was wrong — no `prepaid` status, prepayment = approved + prepaymentAmount>0). Record-prepayment in tray with disabled-reason; terminal statuses expose no primary; 11 behavior tests added; exactly one `data-status-action-primary` so Wave 1's ⌘↵ cannot double-fire.
- **UX-T03:** `purchaseOrderPrimaryLabel/Disabled` deleted; grep sweep found `salesPrimaryLabel` (SalesView order-level primary) — migrated to shared status-decision data in `SalesView.orderPrimary.ts`; zero pre-template `*Primary*` remnants remain.
- **UX-A12:** connectors/processors gated behind `CONNECTOR_SURFACES_ENABLED=false` (`featureFlags.ts`, TER-1664); routes redirect to Settings→Requests; removed from `defaultOperatorViews` while flagged; components kept for re-enable.
- **UX-A13:** nav routes canonical for Recovery/Closeout — Settings Actions/Archive tabs became link chips to `/recovery`/`/closeout` (stale persisted tab state self-heals); palette command deep-links retarget the `recovery` ViewKey, ending the settings/recovery drawer-state divergence; Closeout `blockerTarget` failedCommands → `/recovery` filtered. **Q08-partial:** Settings h1 retitled.
- **UX-Q03:** FormDialog gains `tone: 'danger'|'warning'` submit variant (`btn-danger`/`btn-warning` from existing palette colors); applied to Deactivate/Void referee dialogs — restores destructive styling lost in the A1/A2 convergence.
- **UX-Q01:** ItemsView bespoke create/edit bands → FormDialog with inline field errors; deactivate uses tone danger.
- **UX-Q02:** CreditReviewView divergence disclosure → WorkspacePanel; creditOps behavior tests preserved.
- **UX-A08:** IntakeView dead CSV-import machinery deleted (state, handlers, focus trap, imports) with a TER-1658 comment.
- **UX-A09:** work-loops/north-stars updated to PO-first intake; Keel chip renamed "Receive against PO" and re-pointed at the purchase-orders launch (also fixed a duplicate React key on Keel menu items).
- **UX-A10/T04:** spec §10 status tables corrected/stamped against real enums (incl. fulfillment open/fulfilled); MR/UF closures marked; GRID_COLUMN_AUDIT staleness note added.
- **UX-A14:** registry keeps CAP-030 = Pricing Rules Chain Manager; release-for-picking lineage assigned a new CAP row with collision note.
- **UX-T02:** orphaned `media-batch-drawer*` CSS deleted (grep-verified zero references).

## 2026-06-12 — UX audit Wave 1: truth & trust (UX-A01/A02/A03/A05/A06/A07/A11, E01–E04/E09, O01, D04 top surfaces, L03)

Backlog + triage: `docs/ux-audit-2026-06-12.md`, `docs/ux-audit-2026-06-12-triage.json`. Gate green: typecheck, 760/760 client vitest, build.

- **UX-A01:** ⌘⌥H now performs a real uncached `auth.me` round-trip via the tRPC proxy client and toasts pass/fail truthfully; fake "top status indicator" copy removed (`Hotkeys.tsx`).
- **UX-A02:** ⌘⌥V awaits a view-scoped `queries.grid` invalidation (plus `intakeQueue` on intake) and toasts only after the refetch settles. `verifyAllIntake` not chained — it is per-PO and not cleanly reachable from a global hotkey.
- **UX-A03:** ⌘↵ rewired to commit the visible StatusActionBar primary (new `data-status-action-primary` hook on the bar's resolved button) for the full selection, toasting the decision-table disabled/mixed reason. Hardcoded rows[0] confirm/post/allocate commands deleted.
- **UX-A05:** OperatorGrid default empty-state children changed to neutral "No rows match the current view."; per-view tailored empties deferred to UX-D03.
- **UX-A06:** `mergeCandidateCount` query + merge banner removed from ContactsView; `/contacts/merge-candidates` redirects to `/contacts`. MergeCandidatesView component preserved for when BE-014 ships (Execution Decision 5: defer detection job).
- **UX-A07:** `/` focuses the active OperatorGrid quick-filter via `data-grid-quick-filter`, skipped while editing text or while the palette is open.
- **UX-A11:** VendorContextDrawer brand removal routed through `useConfirm()` (tone danger); native `confirm()` removed.
- **UX-E01:** Credit Watch rows deep-link: clients grid filter `name:<customer>` + customer drawer opened (CountPill pattern, TER-1624 lineage).
- **UX-E02:** Today-Focus tiles navigate filtered; "Open Orders" lands on `/orders` `status:confirmed` (was unfiltered `/sales`).
- **UX-E03:** Money Buckets pseudo-tiles render real payables/receivables totals from KPI metrics already on the wire; click-through opens the matching drilldown.
- **UX-E04:** Dashboard error state is per-panel with retry; healthy panels stay live.
- **UX-E09:** Refresh refetches all dashboard-page queries (dashboard, workQueue, myDrafts, creditWatch).
- **UX-O01:** MediaView renders the canonical batch `mediaStatus` as the primary status column (StatusPill); count-derived heuristic demoted to a secondary "Activity" column with the `<3` threshold documented against the Journey-13 gate. `mediaStatus` added to the photography grid query field allowlist (existing query extended, no new procedures).
- **UX-D04 (top surfaces):** 32 disabled controls across OperationsViews (17), SalesView tray/expansion (12), InventoryFinderPanel (3) now carry conditional `title` disabled-reasons. Full-app sweep continues in later waves.
- **UX-L03:** Fulfillment FilterPresetStrip presets were dead (`status:in_progress`/`status:needs_picking` don't exist in the DB — real statuses are `open`/`fulfilled`); replaced with "Open picks"/"Fulfilled" and `status:open` seeded as the default grid filter on mount when no filter is stored.

## 2026-06-12 — External review remediation (findings #1–#10)

Full point-by-point response: `docs/architecture/external-review-response-2026-06.md`.

1. **Booleans never render as text** — `formatBool()`/`boolCol()` in `utils/format.ts`; applied to `active`/`packed`/`inventoryPosted`/`paymentFollowup`/`labelsPrinted` columns; defense-in-depth in `OperatorGrid`'s default formatter. Literal "false" in cells is unreachable (tested).
2. **Locale pinned to en-US** — `APP_LOCALE`; 44 device-locale call sites repointed; `formatDate`/`formatDateTime`/`formatNumber`/`dateCol` added; ESLint `no-restricted-syntax` fails the build on bare `toLocale*()`.
3. **Command-scoped invalidation** — `COMMAND_SCOPED_QUERY_FAMILIES` invalidated on every command success (local + peer socket events); `refetchOnWindowFocus`/`refetchOnReconnect` on; 60s active-only poll fallback. Grid/dashboard/work-queue keys contain no entity UUIDs and were never reached by the id predicate — the "constant refresh" defect.
4. **Background workers now run in-process** — `services/backgroundWorkers.ts`: credit queue drain (15s), reaper (5m), nightly audit + balance reconciliation (per UTC day), pg advisory locks for multi-instance safety, `BACKGROUND_WORKERS` env gate, heartbeat + queue depth in `/api/health`.
5. **Grids no longer compress** — `fitColumnsWithoutCompression()` replaces unconditional `sizeColumnsToFit()`; fit only on underflow.
6. **Form-control accessibility ratchet** — 70 unlabeled controls given semantic aria-labels; `pnpm audit:form-ids` (in `audit:self`) fails on any new unlabeled control.
7. **Dashboard states** — skeleton tiles while loading; explicit empty state when a response is genuinely empty.
8. **Responsive shell** — nav rail auto-collapses <1024px; tablet-width CSS pass; `/mobile` shell remains the phone path.

## 2026-06-12 — Swarm completion wave: dialog/drawer convergence (A1–A5), Recovery admin tabs (A6), e2e specs (A7), SalesView density pass (A8)

**Decision 1 (A1/A2 — six dialogs → FormDialog):** `RefereeDialog`, `UpdateRefereeRelationshipDialog`, `DeactivateRefereeRelationshipDialog`, `VoidRefereeCreditDialog`, `ContactCreateModal`, and `RefereeRelationshipDialog` all re-render through `templates/FormDialog` + `FormField`. Every field, validation message, pending state, and submit payload preserved; pinned heading ids (`rd-title`, `urr-title`, `drr-title`, `vrc-title`, `rrd-title`, `create-contact-title`) carried through via `titleId`. Destructive dialogs (Deactivate, Void) lose their bespoke amber submit styling — FormDialog has no submit-tone variant. **Reported template need:** a `tone?: 'danger' | 'warning'` submit prop on FormDialog for destructive confirms; until then the dialogs use the standard primary.

**Decision 2 (test doctrine applied):** one test case in `RefereeRelationshipDialog.test.tsx` pinned legacy footer chrome classes (`primary-button compact-action` / `secondary-button compact-action`). Per the templates.md testing rule — view tests assert behavior, not template chrome — the assertion was converted to a behavior contract (buttons exist; submit disabled until a valid entity is selected). Same doctrine applied to `MediaBatchDrawer.test.tsx`'s three drawer-shell assertions (aside classes, closed-state aside) which became dialog-role assertions. **No behavior assertion was deleted or weakened anywhere** — 24/27 MediaBatchDrawer tests passed byte-identical through the conversion.

**Decision 3 (A3 — MediaBatchDrawer → InspectorDrawer):** the bespoke 312-line always-mounted `<aside class="media-batch-drawer">` becomes an `InspectorDrawer` with a single Media tab. The drawer is now modal (backdrop + focus trap from the template) — accepted as the intended chrome convergence, matching VendorContextDrawer. `media-batch-drawer*` CSS classes are now orphaned in `styles.css` (left in place per guardrail 4; flagged for cleanup).

**Decision 4 (A4 — AddRefereeRelationshipDrawer → FormDialog):** the two-step resilient flow is preserved verbatim: `createReferee` success + `addRefereeRelationship` failure stores `pendingRefereeId`, locks the "Create new referee" mode, surfaces the recovery banner, and retry skips re-creation (no duplicate referee possible). Mode-toggle raw `blue-600` replaced with `accent` per the 2026-05-25 green-chrome decision. Side-drawer chrome → centered modal accepted (form, not context — per the placement rule).

**Decision 5 (A5 — ReceiptPreviewDrawer LEAVE + audit):** `ReceiptPreviewDrawer` stays on `.context-drawer` chrome — it is already canonical semantic chrome with a focus trap; converging to InspectorDrawer would swap chrome families for zero operator-visible gain and risk IntakeView focus-trap contracts. Bespoke-chrome audit of ContactsView / MatchmakingView / MediaView / ItemsView / CreditReviewView published at `audit-2026-06-bespoke-chrome.md`: three M findings (ItemsView create + edit stacked form bands → FormDialog; CreditReviewView divergence disclosure → WorkspacePanel), zero S, zero L. M findings accepted as tracked debt for follow-up PRs.

**Decision 6 (A6 — Recovery admin tabs):** RecoveryView's three disclosure-gated admin bands (Backup preview / Correction / Find-Replace) converge into ONE `WorkspacePanel` ("Admin tools") with an `.inspector-tabs` tablist. Snapshot-diff and find/replace-preview sections move inside their respective tabs (previously stranded below the grid). Every input, the typed-REPLACE confirmation gate, and the pinned ids `recovery-period`/`recovery-amount`/`recovery-memo` are preserved. The support-packet export lives in the Backup & support tab. The selection-strip StatusActionBar and TER-1521 reversal panel are untouched.

**Decision 7 (A8 — SalesView density pass):** (a) Sales Orders grid gains GH #354 presets via `FilterPresetStrip` (All Open / Confirmed / Posted). Because the orders, line, and suggestions grids share the `'sales'` grid-filter slot in mutually exclusive branches, the slot is cleared on customer-mode switch so an order-status preset cannot silently filter line rows. (b) The line grid's always-on verb strip becomes a spec §10.1 decision table through `StatusActionBar` — built on REAL line statuses (`draft | reserved | allocated | posted | cancelled`; verified in schema + commandBus). The spec's `needs_resolution` is not a status — it is `validationIssues.length > 0`, expressed as a predicate rule that takes precedence; the spec's `confirmed`/`fulfilled` are order statuses and do not exist on lines. Posted lines get the §10.4-style closeout cascade (packed → inv-posted → pay/f-up). The CAP-030 bulk-release logic is extracted verbatim to `releaseSelectedLines` and becomes the primary for `reserved|allocated` (and a tray verb elsewhere). Catch-all ends the table — full verb set on mixed selections, no `mixedReason` (Decision 8, 2026-06-11). (c) **"Open Validation" deviation:** spec §10.1 routes to a "drawer Validation tab"; opening OperatorGrid's internal RowInspector programmatically would require an OperatorGrid API change, so the primary instead opens a selection-bound "Line validation" `WorkspacePanel` (`sales:line-validation`) rendering `SaleLineExceptionControls` + the issue list per focused line — same controls as the row expansion, one click from the bar. (d) Customer Workspace stays a panel inside Sales (spec §9 rejection of Option B). Pricing flows untouched; `SalesView.marginToggle` + `SalesView.pricing` suites green.

**Verification:** full suite 174 files / 1,913 tests green (baseline 173 / 1,895); `tsc --noEmit` + `vite build` green after every unit; merge order A1→A8 with the full gate at integration.

**Files:** `src/client/components/{RefereeDialog,UpdateRefereeRelationshipDialog,DeactivateRefereeRelationshipDialog,VoidRefereeCreditDialog,ContactCreateModal,RefereeRelationshipDialog,MediaBatchDrawer,AddRefereeRelationshipDrawer}.tsx`, `src/client/views/{OperationsViews,SalesView,RecoveryView.test}.tsx`, `tests/e2e/ux-a7-{orders-status-bar,row-inspector}.spec.ts`, `docs/design-system/audit-2026-06-bespoke-chrome.md`, `docs/design-system/components/templates.md`
**Author:** Claude (Fable 5) via Evan
**Related:** Design spec §10.1, §10.4, §1.4; CAP-030 / TER-1508 (release for picking); TER-1521 (reversal panel exclusion); GH #354 (presets); GH #403 (batched remove confirm — unchanged); 2026-05-25 green-chrome decision; 2026-06-11 Decisions 1–8.

---

## 2026-06-11 — StatusActionBar full adoption: Vendor Payouts, Fulfillment, Connectors, Recovery, Payments, Closeout (spec §10.5–10.10)

**Decision 1:** Six more surfaces adopt the spec §10 decision-table engine via `StatusActionBar`. Every table's rules were written against the REAL status values verified in `schema.ts` + `commandBus.ts` — the spec's status names are wrong in four of the seven views and must never be trusted blindly: vendor bills run `open → approved → scheduled → (partial →) paid` plus `reversed` (no `void` BILL status — void applies to vendor_payments); pick lists have only `open | fulfilled` (the spec's `draft/in_pack/packed/labeled` do not exist — pack progress is derived from the line grid); connector requests start at `open`, not `pending`; command journal rows are `pending | ok | failed` with reversal expressed as `reversedByCommandId`, not a status; payment applied-ness is derived from `unappliedAmount` vs `amount` (real `payments.status`: `posted | refunded | reversed`), and buyer credit is a direction, not a status.

**Decision 2:** `VendorPayablesView` (§10.6) replaces the `vendorPrimaryLabel/Disabled/Icon` + `runVendorPrimary` helpers with a decision table in the selection strip. Pay actions on unscheduled bills schedule first then record (the Money-out commit sequence), since `recordVendorPayment` requires `scheduled`. The TER-1517 inline expansion actions are untouched.

**Decision 3:** `ConnectorsView` (§10.8) keeps **Route** as the primary per the CAP-017 / Phase 4 decision (which postdates the spec's Approve-primary table); Approve/Reject move to the tray. Route stays disabled-with-reason until a destination is entered.

**Decision 4:** `RecoveryView` (§10.9) makes **Retry** the status-matched primary for `failed` rows (replaying the stored command name + `input_payload`). One-click **Reverse is deliberately NOT in the bar**: `reverseCommandById` is destructive and its designed home is the TER-1521 confirm-flow reversal panel below the grid; spec §10.9 predates TER-1521.

**Decision 5:** `PaymentsView` (§10.5) gets a predicate table: fully-unapplied → "Auto-apply oldest", partially-applied → "Allocate remaining", fully-applied/reversed/refunded → no primary. Unallocate and discounts keep their inputs in the allocations `WorkspacePanel` (in-page work tool per the templates.md decision rule).

**Decision 6:** `CloseoutView` (§10.10) feeds the same engine a synthetic period row (`status: open | locked` from `closeoutPreview`), replacing the Lock/Archive button pair: open work → amber warning-tone "Fix unsafe rows (N)" primary routing to the first blocker, with Lock/Archive kept reachable in the tray disabled-with-reason; clean+open → Lock period; clean+locked → Archive.

**Decision 7:** `InventoryView` (§10.13) is intentionally NOT converted. Its "Row actions" disclosure is a form-bearing work tool (status/location/ownership/vendor/reason/tags inputs) — per the templates.md drawer-vs-panel-vs-dialog rule, repeated work tools with inputs stay in-page; flattening them into a tray would be a functionality regression. Inline cells remain the §10.13 primary; the existing single disclosure button already serves as the tray.

**Decision 8 (engine semantics clarified):** with the mandatory catch-all rule, the mixed-selection reason pill never fires — mixed/unknown selections fall to the catch-all, which exposes the full verb set in the tray (the no-functionality-loss guarantee). `mixedReason` is therefore omitted from tables that end in a catch-all. Behavior contracts for all six adoptions are pinned in `OperationsViews.statusTables.test.tsx` (18 tests asserting which command fires for which real row status).

**Files:** `src/client/views/OperationsViews.tsx`, `src/client/views/OperationsViews.statusTables.test.tsx`, `docs/design-system/components/templates.md`
**Author:** Claude (Fable 5) via Evan
**Related:** Design spec §10.5–10.10, §10.13; CAP-017 (Route primary); TER-1521 (reversal confirm flow); TER-1517 (vendor bill inline expansion); TER-1660 (printLabels deferral — kept out of the Fulfillment bar); GH #354 presets (unchanged).

---

## 2026-06-11 — Unified template layer: one system for actions, filters, row context, and dialogs

**Decision 1:** New `src/client/components/templates/` layer hosts the shared chrome for recurring UI jobs: `StatusActionBar` (decision-table-driven status-aware primary + "More ▾" tray, implementing spec §10), `FilterPresetStrip` (declarative GH #354 presets), `InspectorDrawer` (unified right-edge tabbed drawer chrome), `FormDialog`/`FormField` (modal scaffold with locked a11y contract). The six-job placement rule (entity context → ContextDrawer · row context → RowInspector · selection actions → StatusActionBar · pre-selection filters → FilterPresetStrip · repeated work tools → WorkspacePanel · one-shot entry → FormDialog) is documented in `components/templates.md`. New drawers with bespoke backdrop/aside/header chrome are no longer permitted — row-context surfaces become inspector tabs via OperatorGrid `inspectorTabs`.

**Decision 2:** The three mutually-exclusive row drawers (`RowCommandHistoryDrawer`, `RelationshipDrawer`, `IssueSidecar`) are unified into one tabbed `RowInspector` (History · Relationship · Issue) mounted by `OperatorGrid`. The drawer-body content was extracted into `*Body` exports; SelectionSummary icons now deep-link to a tab. `.inspector-tabs` / `.inspector-tab` semantic classes added (accent-green active state per the 2026-05-25 color decision). `.row-history-*` classes are the canonical inspector chrome.

**Decision 3:** `OrdersView` replaces its six always-on sibling buttons with the spec §10.4 status table rendered through `selectionActions` (selection strip). All six verbs remain reachable for every status via primary or tray; a catch-all rule exposes the full verb set on mixed/unknown selections — adopting views must always end their table with a catch-all.

**Decision 4:** Selection-bound work tools move into consistent, collapsible `WorkspacePanel` chrome and are gated on selection (pre/post-selection band swap, spec §1.4 #2): Payments allocations (`payments-allocations`), Vendor payout row (`vendors-money-out`), Vendor bill tools (`vendors-bill-tools`, not gated — bill creation needs no selection). Payment receipts become a RowInspector `receipt` tab instead of a stacked panel. Allocation tools intentionally stay in-page (not in the drawer): operators run them across many rows in sequence and the inspector pins a single row.

**Decision 5:** `VendorContextDrawer` re-rendered through `InspectorDrawer`: chrome converged, raw blue/gray palette replaced with semantic classes (chrome is green-accent; blue reserved for status semantics per 2026-05-25). Public API and all four tabs (Context · Quick Adds · Historical POs · Brands) unchanged.

**Decision 6:** `src/client/test-setup.ts` gains a ResizeObserver polyfill (AG Grid v32 requirement under jsdom), unblocking grid-rendering tests.

**Files:** `src/client/components/templates/*`, `src/client/components/RowInspector.tsx`, `src/client/components/OperatorGrid.tsx`, `src/client/components/RowCommandHistoryDrawer.tsx`, `src/client/components/RelationshipDrawer.tsx`, `src/client/components/IssueSidecar.tsx`, `src/client/components/VendorContextDrawer.tsx`, `src/client/components/RecordPrepaymentDialog.tsx`, `src/client/views/OperationsViews.tsx`, `src/client/styles.css`, `src/client/test-setup.ts`, `docs/design-system/components/templates.md`, `docs/design-system/INDEX.md`
**Author:** Claude (Fable 5) via Evan
**Related:** Design spec §1.2 friction points #1/#2/#9, §1.4 principles 1/2/5, §10 decision tables; GH #354 presets; GH #326 click-outside pattern.

---

## 2026-05-27 — Finder chrome redesign: pill filter bar, Add filter dropdown, presets strip, builder restyle

**Decision 1:** `InventoryFinderPanel` filter chrome restructured from stacked controls to: filter bar (search + active filter pills + "Add filter" two-step dropdown + Advanced toggle) → presets strip (DB-driven saved views + save/manage) → `AdvancedFilterBuilder` slide-down panel. All filter evaluation logic (`evaluateFilterGroup`, `filterEvaluator.ts`, `filterSchemas.ts`) is unchanged.

**Decision 2:** Active filters shown as removable pills in the filter bar. The "Add filter" button opens a two-step dropdown: pick a field (grouped: Product, Qty & Price, Date & Age, Status) → enter value (operator select + field-specific input). "Save current" in presets strip names and persists the current advanced filter to `saved_filters` via `trpc.filters.saveFilter`.

**Decision 3:** Hardcoded `savedSlices` array removed from `InventoryFinderPanel`. The 5 default views (Aging premium, Consignment risk, Value buyers, Low stock, Office owned) are seeded by migration 0071 as global `saved_filters` rows, so they persist across deploys and are user-editable/deletable.

**Decision 4:** `AdvancedFilterBuilder` restyled with new semantic classes: `.builder-panel`, `.builder-panel-header`, `.builder-panel-body`, `.builder-panel-footer`, `.condition-row`, `.logic-badge`, `.nested-group`. Logic unchanged. Two new props: `onSaveAsView` (callback) and `resultCount` (display in Apply button).

**Decision 5:** Filter chrome CSS classes added to `styles.css`: `.filter-bar`, `.filter-pill`, `.filter-pill-remove`, `.add-filter-btn`, `.add-filter-dropdown`, `.advanced-btn`, `.presets-strip`, `.preset-save-chip`, `.presets-manage-link`, `.presets-label`, plus all builder panel classes.

**Files:** `src/client/components/InventoryFinderPanel.tsx`, `src/client/components/AdvancedFilterBuilder.tsx`, `src/client/styles.css`, `migrations/0071_default_inventory_views.sql`
**Author:** Claude Sonnet 4.6 via Evan
**Related:** Spec `docs/superpowers/specs/2026-05-27-finder-pricing-ui-redesign.md`

---

## 2026-05-27 — Pricing redesign: nested CategoryPricingEntry, inline SalesView pricing columns, OrderPricingPanel removed

**Decision 1:** `CustomerPricingRule.categories` changed from `Record<string, PricingRuleEntry>` to `Record<string, CategoryPricingEntry>` where `CategoryPricingEntry = { rule?: PricingRuleEntry; subcategories?: Record<string, PricingRuleEntry> }`. Key collision between same-named subcategories across categories is prevented by nesting under the category key. Existing flat `{ basis, amount }` entries are migrated to `{ rule: { basis, amount } }` transparently in `validatePricingRulePayload`.

**Decision 2:** `resolvePricingRuleEntry` updated with 7-level resolution: customer subcategory → customer category rule → customer default → settings subcategory → settings category rule → settings default → fallback 30%. `PricingRuleApplication.source` union extended with `'customer-subcategory'` and `'settings-subcategory'`. New `subcategory?: string` field on `PricingRuleApplication` populated when source is a subcategory match.

**Decision 3:** `markupDollarsFromPrice(price, rule)` added to `inventoryPricingShared.ts`. For range-COGS batches where price is the primary input, converts markup-on-cost rule% to a dollar amount: `price × (rule% / (1 + rule%))`. This keeps Markup % = Markup $ ÷ COGS consistent with fixed-COGS rows.

**Decision 4:** `OrderPricingPanel` removed from `PricingPanel.tsx` and `RelationshipDrawer.tsx`. Per-line pricing now lives inline in the SalesView sales order lines AG Grid as three new margin-gated columns: `markup` (editable), `markupPct` (calculated), `derivedCogs` (display). All gated by `showMargin` toggle via `MARGIN_COLUMN_FIELDS` in `SalesView.columns.ts`.

**Decision 5:** Two pricing flows in the same grid: fixed-COGS rows use COGS→markup→price; range-COGS rows use price→markup(via markupDollarsFromPrice)→derivedCogs(range-checked). Both display Markup % as markup-on-cost (Markup $ ÷ COGS) for consistency.

**Files:** `src/shared/types.ts`, `src/shared/schemas.ts`, `src/shared/inventoryPricingShared.ts`, `src/server/services/commandBus.ts`, `src/client/components/DefaultPricingPanel.tsx`, `src/client/components/PricingPanel.tsx`, `src/client/components/RelationshipDrawer.tsx`, `src/client/views/SalesView.tsx`, `src/client/views/SalesView.columns.ts`, `src/client/styles.css`
**Author:** Claude Sonnet 4.6 via Evan
**Related:** Spec `docs/superpowers/specs/2026-05-27-finder-pricing-ui-redesign.md`

---

## 2026-05-27 — CountPill: navigable count badge component (TER-1624)

**Decision:** New `CountPill` component (`src/client/components/CountPill.tsx`) wraps any numeric count in a `<button>` that calls `setGridFilter(filterView, filterValue)` + `navigate(route)` on click.

**API:** `count`, `route` (absolute path), `filterView?` (ViewKey), `filterValue?` (string in the `field:val1,val2` format used by `gridFilterUtils`), `label?`, `className?`.

**Style:** Reuses the existing `selection-pill` semantic CSS class (no new CSS). Adds `hover:border-accent hover:text-accent cursor-pointer` via Tailwind.

**Why not wrap in outer button:** Anywhere a count is already inside a `<button>` (e.g., DashboardView pending queue rows), nesting `CountPill` would create `<button><button>` which is invalid HTML. In those cases, update the outer button's `onClick` directly to apply the filter before navigating. Only replace truly inert `<span>` or `<strong>` count displays with CountPill.

**Adopted at:**
- `PhotographyQueuePanel.tsx` — "ready" and "needs media" inert spans replaced with CountPill targeting `/inventory` with `mediaStatus` filters
- `DashboardView.tsx` — pending queue buttons updated to call `setGridFilter` before navigate (Intake → `status:ready`, Sales → `status:confirmed`)

**Files:** `src/client/components/CountPill.tsx`, `src/client/components/CountPill.test.tsx`, `src/client/components/PhotographyQueuePanel.tsx`, `src/client/views/DashboardView.tsx`
**Author:** Claude Sonnet 4.6 via Evan
**Related:** TER-1624, TER-1611 (Phase 8 UX/Flow audit), GH PR #416.

---

## 2026-05-25 — Wave 3A AQA repair: WorkspacePanel default heading level changed to h2 (GH #325)

**Decision:** `WorkspacePanel` section titles now render as `<h2>` by default (previously defaulted to `<h3>` with an opt-in `headingLevel` prop). The `headingLevel` prop (values `2 | 3 | 4`) still allows call sites to override when the surrounding heading hierarchy requires a different level.
**Rationale:** Parent page views use `<h1>` page titles. Defaulting to `<h3>` created a skip-level violation (h1 → h3) that fails WCAG 2.1 SC 1.3.1. With `<h2>` as the default, panel titles sit correctly in the h1 → h2 → h3 hierarchy. Call sites that genuinely need h3 (e.g., panels nested inside an h2 section) can pass `headingLevel={3}`.
**Files:** `src/client/components/WorkspacePanel.tsx`
**Author:** Claude Sonnet 4.6 via Evan
**Related:** GH #325, Wave 3A UX Polish AQA repair.

---

## 2026-05-25 — Wave 3A AQA repair: ColumnsMenu click-outside excludes trigger button (GH #326)

**Decision:** The `ColumnsMenu` component uses a capture-phase `pointerdown` listener for click-outside detection. A `triggerRef` is passed from the parent `OperatorGrid` component to the menu; the click-outside handler now excludes both the menu element and the trigger button from detection. This prevents the double-toggle race condition where: (1) capture-phase fires on trigger click → menu closes, (2) button `onClick` fires → menu re-opens.
**Pattern:** Pass `triggerRef: RefObject<HTMLButtonElement | null>` as a prop to any menu component that uses capture-phase click-outside. Attach the ref to the toggle button in the parent.
**Files:** `src/client/components/OperatorGrid.tsx`
**Author:** Claude Sonnet 4.6 via Evan
**Related:** GH #326, Wave 3A UX Polish AQA repair.

---

## 2026-05-25 — Wave 3A AQA repair: Filter preset labels corrected; preset pattern documented (GH #354)

**Decision:** Filter presets in `OrdersView` and `InventoryView` were renamed for semantic accuracy:
- `InventoryView`: "Low Stock" → "Office Stock" (the preset filters `ownershipStatus:OFC` which means office-owned, not a quantity threshold)
- `OrdersView`: "Open" → "All Open" (filters `status:draft,confirmed`); "Awaiting Pick" → "Confirmed" (filters `status:confirmed`)
**Filter preset pattern:** Presets are toggle buttons that call `setGridFilter(preset)` or clear it. Button labels must match the operator-facing column value semantics (e.g., `ownershipStatus:OFC` = "Office Stock", not "Low Stock"). Presets are applied to `PaymentsView`, `OrdersView`, `InventoryView`, `FulfillmentView` using the same `togglePreset` / `storedGridFilter` pattern.
**Files:** `src/client/views/OperationsViews.tsx`
**Author:** Claude Sonnet 4.6 via Evan
**Related:** GH #354, Wave 3A UX Polish AQA repair.

---

## 2026-05-25 — Wave 3A AQA repair: GH #321 completeness — dialog components fixed (GH #321)

**Decision:** The Wave 3A commit fixed `bg-primary` / `focus:border-primary` in view files but missed four dialog/modal components. These are now fixed:
- `ContactCreateModal.tsx`: 5 × `focus:border-primary` → `focus:border-accent` on form inputs; submit button `bg-primary` inline styles → `btn-primary`
- `RecordPrepaymentDialog.tsx`: submit button → `btn-primary`
- `UpdateRefereeRelationshipDialog.tsx`: submit button → `btn-primary`
- `RefereeDialog.tsx`: submit button → `btn-primary`
**Files:** `src/client/components/ContactCreateModal.tsx`, `src/client/components/RecordPrepaymentDialog.tsx`, `src/client/components/UpdateRefereeRelationshipDialog.tsx`, `src/client/components/RefereeDialog.tsx`
**Author:** Claude Sonnet 4.6 via Evan
**Related:** GH #321, Wave 3A UX Polish AQA repair.

---

## 2026-05-25 — Wave 3A: AG Grid ClipboardModule registered for paste-from-Excel (GH #355)

**Decision:** `ClipboardModule` from `ag-grid-enterprise` is registered in `src/client/main.tsx` via `ModuleRegistry.registerModules`. This enables paste-from-Excel into editable grid cells.
**Files:** `src/client/main.tsx`
**Author:** Claude Sonnet 4.6 via Evan
**Related:** GH #355, Wave 3A UX Polish.

---

## 2026-05-25 — Wave 3A: Expansion panel color consistency — green replaces blue (GH #327)

**Decision:** Expansion panel CSS design tokens (`--expansion-border`, `--expansion-border-light`, `--expansion-bg-l1`, `--expansion-bg-l2`, `--expansion-selected-bg`) changed from Tailwind blue palette (`#3b82f6`, `#eff6ff`) to project green palette (`#216e4e`, `#f0f7f4`). Direct color literals in `.expansion-panel-header`, `.expansion-section-header`, `.expansion-section`, and `.expansion-chevron-cell.expanded svg` updated to green equivalents.
**Rationale:** The expansion panel was using raw blue values (`#3b82f6`, `#1e40af`) inconsistent with the project's green `accent` primary color (`#216e4e`). All interactive UI chrome should use the green system. Blue is reserved for status-semantic uses (matched/confirmed state badges).
**Mapping:**
- `--expansion-border: #3b82f6` → `#216e4e` (accent green)
- `--expansion-border-light: #60a5fa` → `#52a87e` (lighter green)
- `--expansion-bg-l1: #eff6ff` → `#f0f7f4` (light green tint)
- `--expansion-bg-l2: #f0f9ff` → `#e8f5ef` (medium green tint)
- `--expansion-selected-bg: #dbeafe` → `#d1ede0` (selected green)
- Header text `#1e40af` → `#154d36` (dark green)
- Hover text `#1e3a8a` → `#0f3825` (deeper green)
- Section divider `#bfdbfe` → `#9dd3b4` (light green border)
**Files:** `src/client/styles.css`
**Author:** Claude Sonnet 4.6 via Evan
**Related:** GH #327, Wave 3A UX Polish.

---

## 2026-05-25 — Wave 3A: Design system fork — raw Tailwind `primary` utilities → semantic classes (GH #321)

**Decision:** Replace all raw Tailwind `bg-primary`, `text-primary`, `ring-primary`, `border-primary` utility classes in `src/client/views/` with the project's semantic CSS classes and design tokens.
**Rationale:** `primary` is not a color in `tailwind.config.ts`. These classes were silently ineffective (Tailwind generates no CSS for undefined color names). The correct semantic classes and tokens are: `btn-primary` / `primary-button` for filled green CTA buttons; `border-accent` / `ring-accent` for focus/active ring states on input elements and filter buttons.
**Resolved mappings:**
- `className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary/90"` → `className="btn-primary"` (RefereesView, ProcessorsView, ContactsView)
- `focus:border-primary` on `<input>` → `focus:border-accent` (ContactsView search input)
- `ring-1 ring-primary` on active filter button → `ring-1 ring-accent` (ContactsView role filter buttons)
**Files:** `src/client/views/RefereesView.tsx`, `src/client/views/ProcessorsView.tsx`, `src/client/views/ContactsView.tsx`
**Author:** Claude Sonnet 4.6 via Evan
**Related:** GH #321, Wave 3A UX Polish.

## 2026-05-25 — Testing convention: 3-tier pyramid

**Decision**: All ongoing testing follows a 3-tier pyramid enforced by GitHub Actions.

| Tier | Location | Trigger | Purpose |
|------|----------|---------|---------|
| Smoke | `tests/smoke/` | Post-deploy + nightly | Is the app alive and usable? |
| Core e2e | `tests/e2e/` | Nightly | Do all operator workflows still work? |
| Unit | `src/**/*.test.*` | Every PR | Does business logic hold? |

**Convention for new work**:
- New top-level view or workflow → add a smoke spec to `tests/smoke/` (login + grid/heading visible, < 15s/step)
- New operator command or e2e flow → add a full spec to `tests/e2e/`
- New server service or business logic → unit test in `src/server/services/`

Nightly picks up new specs automatically in both `tests/smoke/` and `tests/e2e/`.
Smoke tests must be independent (no shared state between tests), fast, and assertion-minimal.
Failures create or update a GitHub Issue automatically via `scripts/report-test-failure.sh`.

**Rationale**: Catches live regressions during user testing rollout without requiring manual QA runs.
**Spec**: `docs/superpowers/specs/2026-05-25-ongoing-testing-strategy-design.md`

---


## Format

```markdown
## YYYY-MM-DD: [Short Title]
**Decision:** What was decided
**Rationale:** Why (problem solved, tradeoff accepted)
**Example:** File path showing implementation (or "N/A" for meta-decisions)
**Author:** Agent name via Evan
**Related:** Optional — links to issues, prior decisions, audits
```

---

## 2026-05-25 — Phase 6 Reports live: client-side aggregation, EmptyState role, clickable report rows

**Decision 1:** All 8 report aggregations in `ReportsRouteShell` are pure client-side JavaScript functions (`buildRows → build*Rows`) over live `trpc.queries.grid` data. No new server endpoints were added. Each report calls the narrowest existing grid view it needs (`vendors`, `payments`, `inventory`, `clients`, `sales`). Aggregation intentionally stays simple (group-reduce-sort) to keep it traceable and replaceable with server-side SQL projections later.
**Decision 2:** `EmptyState` gained an optional `role` prop so callers can add `role="status"` for aria-live regions. The default is no role (preserving existing usages). All new report and dashboard EmptyState usages set `role="status"`.
**Decision 3:** Report table rows are clickable and keyboard-navigable (`tabIndex=0`, `onKeyDown Enter/Space`) when a `REPORT_DRILLDOWN_VIEW` entry maps the active report to a source view. Each row carries `aria-label="Open source records in {view} view"`. The Closeout Period report has no drilldown.
**Decision 4:** `TodayFocusTile` was wired with `value` and `onClick` props. The "Today's Top Decisions" section (top 3 from `rankedWorkRows`) lives inside an `aria-live="polite"` wrapper. The entire Today Focus panel is wrapped in a `div[aria-busy]` reflecting `workQueue.isLoading`.
**Decision 5:** CSV export filename now appends ISO date: `terp-operator-{key}-YYYY-MM-DD.csv`. Values are quoted only when they contain commas, quotes, or newlines. Column order is deterministic from `REPORT_DEFS[n].columns`.
**Example:** `src/client/components/ReportsRouteShell.tsx`, `src/client/views/DashboardView.tsx`, `src/client/components/EmptyState.tsx`.
**Author:** Claude Sonnet 4.6 via Evan
**Related:** TER-1572, TER-1573, TER-1574, TER-1575, TER-1576, TER-1577, TER-1578.

---

## 2026-05-25 — Phase 6 Reports scaffold: static stub pattern, TodayFocusTile, CSV prefix fix
**Decision 1:** `ReportsRouteShell` was rewritten to remove live `trpc.queries.grid` calls and replace them with static stub data. All 7 report tabs now render an empty `report-table` with realistic column headers. A `never[]` rows array keeps the Export button disabled. Each report is defined in a `REPORT_DEFS` constant with `key`, `label`, `description`, `columns`, and optional `gated` flag. Gated reports (Closeout Period) show an `EmptyState` notice instead of a table.
**Rationale:** Shipping the shell before math fixtures avoids blocking the nav entry and gives Phase 6 implementers clear scaffolding with exact query names in `TODO(phase6)` comments. Live queries against `queries.grid` were incorrect semantically (reporting needs aggregated projections, not raw grid rows).
**Decision 2:** Added `TodayFocusTile` inline helper to `DashboardView.tsx` — a simplified read-only tile (label + "--" stub + View link) added to a new "Today Focus" `WorkspacePanel`. Does NOT extend `KpiCard` because `KpiCard` requires a `KpiMetric` shape and `onOpen` callback; the stub tiles have no interaction model yet.
**Decision 3:** Fixed CSV export filename prefix in `ReportsRouteShell` from `terp-agro-` (legacy) to `terp-operator-` (canonical). Consistent with the 2026-05-20 decision that aligned export filenames with the current product name.
**Example:** `src/client/components/ReportsRouteShell.tsx`, `src/client/views/DashboardView.tsx`.
**Author:** Claude Sonnet 4.6 via Evan
**Related:** TER-1499, docs/roadmap/phase-readiness/6.md.

---

## 2026-05-24 — Mobile views: CSS scoped under .mobile-shell with --m- prefix
**Decision:** All mobile CSS custom properties declared in `styles-mobile.css` under `.mobile-shell { }`, using `--m-` prefix. NOT declared on `:root`.
**Rationale:** `styles.css` already declares `--accent`, `--line`, and others globally. Scoping + prefix prevents silent cascade pollution of desktop AG Grid views, drawers, and the keel header.
**Example:** `src/client/styles-mobile.css`.
**Author:** Claude Sonnet 4.6 via Evan
**Related:** AQA finding M5 from 2026-05-24 spec review.

---

## 2026-05-24 — Mobile views: no AG Grid on any mobile view
**Decision:** All five mobile views use Tailwind card/list layouts. AG Grid is explicitly excluded from all /mobile/* routes.
**Rationale:** AG Grid is keyboard-first, spreadsheet-native, and breaks on touch input. Mobile views need tap-first dense lists with 44–56px minimum tap targets.
**Example:** `src/client/views/mobile/*.tsx`.
**Author:** Claude Sonnet 4.6 via Evan

---

## 2026-05-24 — Mobile payments: canonical confirm-sheet trigger table
**Decision:** Pay Vendor tab always triggers a confirm sheet. Receive Payment triggers only when amount ≥ $20,000 OR amount ≠ invoice total.
**Rationale:** Vendor payments are unconditionally high-risk (external financial relationship). Customer receipts at small exact amounts have lower reversal impact.
**Example:** `src/client/views/mobile/MobilePaymentsView.tsx` → exported `shouldConfirm()`.
**Author:** Claude Sonnet 4.6 via Evan

---

## 2026-05-24 — Mobile views: URL search param for cross-view batch targeting
**Decision:** `MobileCatalogView` passes `?expand={batchId}` to `/mobile/inventory`. `MobileInventoryView` reads this on mount, expands that row, and removes the param via `setSearchParams`.
**Rationale:** Local `useState` is ephemeral per view instance. `useUiStore` would pollute global state. URL params are the standard React Router cross-view handoff and are testable.
**Example:** `src/client/views/mobile/MobileInventoryView.tsx` (useSearchParams expand effect).
**Author:** Claude Sonnet 4.6 via Evan

---

## 2026-05-24 — Mobile contacts: delivery-gated stub
**Decision:** `MobileContactsView` and `MobileContactProfileView` ship as stubs with a gate message until `queries.contactDirectory` and `queries.contactProfile` are available in the tRPC router (CAP-033 Phase 4).
**Rationale:** Shipping real UI against missing backend queries causes runtime failures. The stub makes the Contacts tab visible and navigable without a failure path.
**Example:** `src/client/views/mobile/MobileContactsView.tsx`.
**Author:** Claude Sonnet 4.6 via Evan

---

## 2026-05-24 — Mobile payments: recordVendorPayment requires manager role
**Decision:** The Record Payment button in `MobilePaymentsView` is disabled with a tooltip "Manager role required." for users with `role < manager` (i.e., `operator` or `viewer`). The form fields remain visible.
**Rationale:** `recordVendorPayment` requires manager minimum per `commandCatalog.ts`. Silently failing after a confirm flow is a worse UX than a clear disabled state at the action point.
**Example:** `src/client/views/mobile/MobilePaymentsView.tsx` → `canPayVendor`.
**Author:** Claude Sonnet 4.6 via Evan

---

## 2026-05-22 — CAP-030 pick-status chip colors (TER-1508)
**Decision:** Pick-status chips use Tailwind utility classes directly (`bg-blue-100 text-blue-800` etc.) rather than a semantic CSS class.
**Rationale:** Five states, one-off use in SalesView line expansion. If pick-status chips appear elsewhere, extract to `.pick-status-chip-*` semantic pattern then.
**Example:** `src/client/views/SalesView.tsx` → `PickStatusChip` helper function.
**Author:** Claude Sonnet 4.6 via Evan
**Related:** TER-1508.

---

## 2026-05-22 — CAP-030 PickView mobile layout (TER-1513)
**Decision:** PickView uses Tailwind-only layout (no AG Grid) per spec for mobile picker route.
**Rationale:** Mobile pick workflow is linear card-by-card (Queue → List → Line). AG Grid's spreadsheet-native layout is inappropriate here; Tailwind stacked list buttons match the physical warehouse-scan UX. Minimum button height 56px on primary actions, 44px elsewhere. BarcodeDetector falls back gracefully — manual entry field always visible. Alert interrupt uses `role="alertdialog"` + `aria-modal="true"`; no click-outside dismiss per spec requirement.
**Example:** `src/client/views/PickView.tsx`, `src/client/components/pick/`.
**Author:** Claude Sonnet 4.6 via Evan
**Related:** TER-1513.

---

## 2026-05-22 — CAP-030 pickQueueFilters in uiStore (TER-1510)
**Decision:** Added `pickQueueFilters: Set<string>` as a non-persisted uiStore slice (NOT in `partialize`). Uses a Set for multi-chip selection vs. gridFilters' string approach. Pre-filters the dataset rows passed to OperatorGrid `rows` prop.
**Rationale:** Chip multi-select requires a Set rather than a string. Non-persisted so filter state resets on reload (shared-workstation safety). Pre-filtering rows in the component keeps the grid API free for its own column filter model.
**Example:** `src/client/store/uiStore.ts` → `pickQueueFilters`, `setPickQueueFilter`, `clearPickQueueFilters`; `src/client/views/OperationsViews.tsx` → `FulfillmentView`.
**Author:** Claude Sonnet 4.6 via Evan
**Related:** TER-1510.

---

## 2026-05-22: Keel header establishes its own stacking context (z-20)
**Decision:** `.keel` (`src/client/styles.css`) receives `position: relative; z-index: 20` (Tailwind: `relative z-20`) so the global header forms its own CSS stacking context at z-20 in the document flow.
**Rationale:** `.keel` was `position: static`, meaning it had no stacking context. The `.quick-action-popover` (z-30) was therefore competing at the document level against AG Grid rows, which create stacking contexts via `transform: translate3d`. This caused the Quick Actions dropdown to render behind grid content. Adding `relative z-20` to `.keel` makes the header a self-contained stacking context above the content area (z-auto < z-20). The popover's z-30 is now local to the header's stacking context, which is correct. Drawers/modals at z-40/z-50 remain in the document stacking context and still render above the header.
**Example:** `src/client/styles.css` `.keel` rule; `.quick-action-popover` stays at z-30 (local to header stacking context).
**Author:** OpenCode via Evan
**Related:** Page feedback: Quick Actions dropdown rendering behind grid content on /purchaseOrders.

---

## 2026-05-21: #64 PR-3 — COGS exception correction journal entries at postSalesOrder
**Decision:** When `postSalesOrder` runs, insert one `correctionJournalEntries` row per posted line that carries a `belowFloorReason`. Variance = `max(0, (priceFloor - unitPrice) × qty)` — measures revenue shortfall; unitCost = priceFloor always (both set together by setLineLandedCost), so the gap that matters is between the floor and what we actually charged (unitPrice). This matches `computeOrderExceptionTotals.marginWaivedTotal`. Uses the `salesOrderLines.priceFloor` column pinned at set-time (not re-read from `batches.priceRange`) for audit reproducibility. The period check (`assertPeriodUnlocked`) runs once per posting on the first exception line. Entry IDs are added to `affectedIds` so they participate in the `afterSnapshot`. Reversal of `postSalesOrder` marks any snapshotted exception entries as `status = 'reversed'` rather than deleting them. For `vendor_approval_pending` lines, append a note to the vendor's open bill `discrepancyNotes` (text-only annotation, no dollar/status mutation, bill ID NOT added to `affectedIds`, and the annotation is NOT reversed on `postSalesOrder` reversal — it persists as AP audit). The vendor-bill read uses `SELECT ... FOR UPDATE SKIP LOCKED` so concurrent `postSalesOrder` calls for orders sharing the same vendor bill do not silently lose annotations OR deadlock — if the bill is locked, this call skips the annotation rather than blocking.
**Rationale:** PR-3 closes the accounting propagation gap for below-range COGS exceptions captured in PR-1/PR-2. Writing one correction journal entry per exceptional line keeps the audit trail line-grained and reuses the existing correction-journal infrastructure rather than introducing a new ledger. Pinning to the set-time `priceFloor` column (instead of re-reading the live `batches.priceRange`) means the entry remains reproducible even if the batch range is later edited. The `vendorBills.discrepancyNotes` append is an explicit override of the prior `saleLineCostExceptions.ts` "do not touch vendor bills" note, which was written before Evan approved this AP-visibility behavior on 2026-05-21. Using `FOR UPDATE SKIP LOCKED` (rather than plain `FOR UPDATE`) matches the read-modify-write locking discipline used for customers and batches elsewhere in `postSalesOrder` while preventing deadlocks across concurrent orders sharing a vendor bill.
**Example:** `src/server/services/commandBus.ts` (postSalesOrder exception-journal loop after `update(salesOrders)`; `reverseCommandById` postSalesOrder branch correction-journal reversal loop).
**Author:** OpenCode via Evan
**Related:** Issue #64; PR-1 (#137), PR-2 (#151); Issue #150 (snapshotByAffectedIds pool-vs-tx capture gap noted in reversal comment); Issue #154 (pre-existing test regex mismatch — separately addressed by upstream PR #141 / commit b78a786); migration baseline 0049 — no new migration for PR-3.

## 2026-05-22 — ReceiptPanel widened to four kinds (Phase 4: money receipts)

The `ReceiptPanel` discriminated union now accepts `'purchase_order' | 'sales_order' | 'payment' | 'vendor_payment'`. Payment and vendor_payment kinds are wired in `PaymentsView` (after `PaymentAllocationTools`, gated on a selected payment row) and `VendorBillTools` (after the payouts table, gated on `chosenPaymentId`). Body now hides the lines table when `projection.lines` is empty (money receipts carry no line items). Internal-notes section renamed to "Internal reconciliation notes". See Phase 4 plan.

---

## 2026-05-21 — ReceiptPanel `kind` discriminator + Sales/Invoice wiring (#113 Phase 3)

**Widened component:** `src/client/components/ReceiptPanel.tsx` now accepts a discriminated `kind` prop (`'purchase_order'` | `'sales_order'`). Backward compatible — existing `<ReceiptPanel purchaseOrderId={...} />` call sites keep working because `kind` defaults to `'purchase_order'`.

**Convention:** When a panel must dispatch between two parallel tRPC endpoints, prefer a discriminated-union prop type + `enabled: false` on the inactive hooks over conditional rendering of two near-identical panels.

**Convention:** Sales receipt procedures resolve "invoice wins over confirmation" inside the procedure. The panel just renders whatever is returned.

**Convention:** `ReceiptPanel` renders inside the Sale Builder WorkspacePanel in `SalesView` for `confirmed`, `posted`, and `fulfilled` statuses.

---

## 2026-05-21: Accessibility conventions for interactive components
**Decision:** Establish five accessibility patterns for icon-only buttons, bare `<select>` elements, sidenav current-page semantics, dialog accessible names, and disclosure toggles. All five were introduced in PRs #135 and #136 but were not recorded at merge time.

**Rationale:**
1. **Icon-only button accessible name** — `aria-label` (not `title`) provides the accessible name and must include an action verb so screen-reader users know what the control does.
2. **Bare `<select>` accessible name** — when no visible `<label>` is present, `aria-label` on the `<select>` itself is required for screen readers to announce the control's purpose.
3. **Sidenav current-page semantics** — `aria-current="page"` on the active nav item lets screen readers announce the current location; inactive items must use `undefined` (not `false`) so the attribute is omitted entirely.
4. **Dialog accessible name** — `aria-labelledby` must reference a co-located `<h2>` id inside the same component, giving the dialog a programmatic name tied to its visible title.
5. **Disclosure toggle state** — `aria-expanded` bound to the controlling state variable lets assistive tech announce whether the controlled region is open or closed.

**Example:**
- Icon-only button: `src/client/components/OperatorGrid.tsx:295` (`aria-label="Remove {field}:{value} filter"`)
- Bare select: `src/client/components/SavedFiltersDropdown.tsx:17` (`aria-label="Load saved filter"`)
- Sidenav current page: `src/client/components/Shell.tsx:137` (`aria-current={isActive ? "page" : undefined}`)
- Dialog name: `src/client/components/VoidRefereeCreditDialog.tsx:43` (`aria-labelledby="vrc-title"` paired with `<h2 id="vrc-title">`)
- Disclosure toggle: `src/client/components/QuickLedgerGrid.tsx:264` (`aria-expanded={!hidden}`); `src/client/components/CommandPalette.tsx:218` (`aria-expanded={advancedOpen}`)

**Author:** OpenCode via Evan
**Related:** `PR #135`, `PR #136`, `Issue #140`

---

## 2026-05-21: Below-range COGS exception chip shared by PricingPanel + SalesView (#64 PR-2)
**Decision:** Below-range `setLineLandedCost` exceptions (PR-1) are surfaced to operators via a shared `LandedCostExceptionChip` component + matching AG Grid `LandedCostExceptionCellRenderer`. Both reuse the existing `.selection-pill.warning` (amber border / amber/10 fill / amber text) — no new colors. The operator-vocabulary reason labels (`keep_margin`, `waive_margin`, `take_loss`, `vendor_approval_pending`, `renegotiate`) live in the chip module as `LANDED_COST_EXCEPTION_REASON_LABELS` and are imported by `PricingPanel` so the picker and the projected-state chip share a single vocabulary source. The chip data comes from a server-side projection (`projectLandedCostException`) over the latest successful `setLineLandedCost` command journal `result.delta.exceptionReason`, attached via a LATERAL join in `salesOrderLines` and a GIN array-contains lookup on `command_journal.affected_ids` (migration 0043). The `landedCostExceptionReason` column is gated behind the existing `showMargin` toggle (added to `MARGIN_COLUMN_FIELDS`) to prevent vendor/COGS relationship state from leaking during customer screen-share.
**Rationale:** PR-2 is vendor-UX only — no DB schema change, no PO/vendor-bill/accounting writes (those land in PR-3). The command-journal projection lets the operator see `vendor_approval_pending` and other below-range exceptions on the very next page render without touching the existing line table. Sharing the chip across `OrderPricingPanel` and the Customer Draft Lines grid keeps the warning vocabulary consistent across both surfaces.
**Example:** `src/client/components/LandedCostExceptionChip.tsx`, `src/server/projections/landedCostException.ts`, `src/server/projections/landedCostExceptionSql.ts`, `src/server/routers/queries.ts` `salesOrderLines`, `src/client/views/SalesView.tsx` lineColumns `COGS exception` column.
**Author:** OpenCode via Evan
**Related:** Issue #64 PR-2; reconciles PR #144 (kebab-case) onto snake_case vocab from PRs #137 and #145. `exceptionReason` in `setLineLandedCostPayloadSchema` is `z.enum(BELOW_FLOOR_REASONS)` (snake_case).

## 2026-05-21 — ReceiptPreviewDrawer + intake UX improvements (TER-1529)

### ReceiptPreviewDrawer component
New component in `src/client/components/ReceiptPreviewDrawer.tsx`. Uses existing `.context-drawer context-drawer-standard` CSS classes (already defined in `styles.css`) for consistent 420px width and 180ms slide transition. Does NOT use the full `ContextDrawer` entity/tab system — the receipt preview is a single-purpose, no-tab panel that should stay open while the operator works batch rows. A full ContextDrawer integration would add unnecessary entity routing and tab management overhead.

### Batch line-item action set change
BatchRowActions now offers: Verify / Reject / Add note / Market name. Removed Flag (was rarely used) and Delete draft (too destructive next to Verify). Deletion remains accessible via the command palette.

### AG Grid header text wrap
Added `wrapHeaderText: true` + `autoHeaderHeight: true` to OperatorGrid defaultColDef and CSS `white-space: normal` to `.ag-theme-quartz .ag-header-cell-label`. Reduces horizontal column width for multi-word headers across all operator grids.

### "Market name" label standard
`itemAlias` field displays as "Market name" in all operator-facing surfaces (intake, inventory, operations). In customer-facing surfaces (SalesView, CustomerPurchaseHistoryPanel) it displays as "Product name". Field name `itemAlias` is unchanged in code.

---

## 2026-05-20: Sales sheet/catalog export filenames use `terp-operator-*` prefix
**Decision:** Sales sheet and catalog CSV export filenames in `src/client/views/SalesView.tsx` now use the `terp-operator-*` prefix (e.g. `terp-operator-sales-sheet.csv`, `terp-operator-sales-catalog.csv`, `terp-operator-customer-offer.csv`) instead of the historical `terp-agro-*` prefix. The `OperatorGrid.csvExport.ts` filename helper already uses `terp-operator-*`.
**Rationale:** The product canonical name is TERP Operator. Aligning export filenames with the current branding reduces confusion for downstream consumers and prevents import scripts from breaking when they expect the new prefix.
**Example:** `src/client/views/SalesView.tsx` (link.download assignments); `src/client/components/OperatorGrid.csvExport.ts`.
**Author:** OpenCode via Evan
**Related:** TERP Operator canonical identity; downstream consumer/import scripts should be communicated this change.

---

## 2026-05-20: Sale-line exception controls move from window.prompt to inline form; hide-margin posture hides cost-revealing UI
**Decision:** Introduce `src/client/components/SaleLineExceptionControls.tsx` to host the inline form for the `setLineLandedCost` / `setLineBelowFloorReason` / `resolveVendorApproval` commands inside the sale-line expansion row. The component reuses `BELOW_FLOOR_REASONS` and `LANDED_COST_BASIS_VALUES` from `src/shared/saleLineCostExceptions.ts` so prompt copy and server validation stay in lockstep. The whole strip — plus the "Range / Exceptions" badge column — is gated by the current `showMargin` value so a customer-facing screen-share posture cannot leak cost, floor, or vendor-approval context. Persistence behavior remains the existing #63 contract (`showMargin` is persisted via zustand `persist`).
**Rationale:** The previous `window.prompt` chain was hostile to keyboard-only operators, untestable in jsdom, and revealed cost context (range labels, basis vocabulary) even when the operator had toggled hide-margin. Splitting the action surface into its own component keeps `SalesView` lean and lets `showMargin` gate the entire strip with a single early return.
**Example:** `src/client/components/SaleLineExceptionControls.tsx`, `src/client/views/SalesView.tsx`.
**Author:** Claude Opus 4.7 via Evan
**Related:** Issues #60–#64; reviewer fix to skeptical frontend/system quality pass.

---

## 2026-05-20: Customer sheet snapshot reads are scoped + viewer-safe + re-sanitized
**Decision:** `queries.customerSheetSnapshotById` now requires both `id` and `customerId`, filters on both, and routes the row through a new `getViewerSafeSnapshot(snapshot, role)` helper in `src/shared/customerSheetSnapshot.ts`. The helper returns null when a `viewer`-role user requests an `internal` (operator) snapshot and re-runs `buildCustomerSheetSnapshotRows` on the way out so even historically-polluted `rows_json` cannot leak cost or margin to catalog reads.
**Rationale:** The previous endpoint accepted only `id`, which let any signed-in caller open any customer's snapshot — including internal-mode snapshots whose `rows_json` may carry cost/margin from older or hand-edited writes. Read-side privacy must not depend on the write-side sanitizer being perfect.
**Example:** `src/server/routers/queries.ts` (customerSheetSnapshotById), `src/shared/customerSheetSnapshot.ts` (`getViewerSafeSnapshot`).
**Author:** Claude Opus 4.7 via Evan
**Related:** Issues #62, #63.

---

## 2026-05-20: Finalization receipt workspaces use shared document renderer primitives and internal/external view labeling
**Decision:** Finalization receipt workspaces (PO vendor receipt, Sales customer confirmation, later payment/payout receipts) will be built on a shared `document_snapshots` table with per-type pure projection modules. The UI will use common receipt renderer primitives and explicit internal/external view labeling. External projection is server-side allowlisted; the client never hides internal fields via CSS or conditional rendering.
**Rationale:** A shared foundation prevents N per-domain receipt tables and fragmented security models. Server-side projection guarantees that a client bug or malicious request cannot expose `unitCost`, `internalMargin`, or `internalNotes` to vendors/customers. Internal/external labeling in the UI makes the boundary obvious to operators and supports the required `INTERNAL — DO NOT SEND` watermark on copy/print.
**Example:** `document_snapshots` table design, `poProjection.ts` module contract (`EXTERNAL_FIELDS`, `projectExternal`), receipt preview components inside `PurchaseOrdersView`. `SalesView` receipt integration is planned but not yet implemented.
**Author:** OpenCode documentation worker via Evan
**Related:** `docs/roadmap/2026-finalization-receipts-roadmap.md`, GitHub issue #113

---

## 2026-05-20: Photography MediaDetailPanel wires media lifecycle commands
**Decision:** The Photography route uses a dedicated `MediaDetailPanel` under the queue grid to show per-batch media rows and expose set-primary, publish, delete, and mobile-upload handoff actions through existing `useCommandRunner` and tRPC query patterns.
**Rationale:** Completing the feature required first-class UI for backend media commands instead of leaving curation in CommandPalette/JSON; panel keeps batch aggregate queue and per-media lifecycle in one operator workspace while preserving authenticated mobile upload route.
**Example:** `src/client/components/MediaDetailPanel.tsx`, `src/client/views/MediaView.tsx`
**Author:** `OpenCode PM + Claude/AQA via Evan`
**Related:** `PR #65`, `docs/superpowers/specs/2026-05-17-photography-upgrade-design.md`

---

## 2026-05-26: Crikket feedback capture mounts as a root utility
**Decision:** Mount the Crikket capture widget from the TERP root shell after login, using a vendored browser bundle, `/api/client-config` runtime settings, Vite local fallbacks, and CSP allowances for the configured Crikket host plus direct upload storage instead of adding the unpublished workspace package as an app dependency.
**Rationale:** User-testing feedback should be one click inside TERP without requiring the Chrome extension flow. The Crikket npm package currently depends on workspace packages from its monorepo, while the built global browser bundle is stable for local operator testing and can be pointed at the hosted Crikket server. Runtime config avoids Docker/Vite build-time env drift in DigitalOcean.
**Example:** `src/client/components/FeedbackCapture.tsx`, `src/server/app.ts`, `public/vendor/crikket/capture.global.js`.
**Author:** Codex via Evan
**Related:** `docs/agent-orientation/feedback-capture.md`.

---

## 2026-05-27: Crikket launcher defaults to top-left
**Decision:** Add `VITE_CRIKKET_POSITION` and default the Crikket launcher to `top-left`, applied from `FeedbackCapture.tsx` after the Crikket SDK mounts.
**Rationale:** Agentation occupies the bottom-right corner during user testing, and Crikket's public SDK init options expose z-index but not launcher placement. A runtime-configured shadow-root style override keeps the hosted widget usable without editing the vendored SDK bundle.
**Example:** `src/client/components/FeedbackCapture.tsx`, `src/server/env.ts`, `src/server/app.ts`.
**Author:** Codex via Evan
**Related:** `docs/agent-orientation/feedback-capture.md`.

---

## 2026-05-18: Documentation grounded in actual codebase, not aspirational spec
**Decision:** When the original 2026-05-18 spec for the agent-orientation/design-system docs referenced files and structures that didn't exist (a `Button` component, `ui/`/`grids/`/`forms/`/`layout/` subfolders, `@/` path aliases, `cn()` helper, `IntakeToolbar` / `StatusCellRenderer` / `CurrencyCellRenderer` components, raw TanStack mutation patterns), the docs were rewritten from the actual codebase rather than transcribed from the spec.
**Rationale:** Documentation that misrepresents the codebase is worse than no documentation — it teaches agents to write code that doesn't compile (`@/lib/utils`) or that bypasses the audit/journal contract (raw `useMutation` instead of `useCommandRunner`). The spec's value was its structural outline (which docs to write, what topics each should cover). The code is the source of truth for content.
**Example:** `docs/agent-orientation/*.md`, `docs/design-system/*.md` (all rewritten from `src/client/`, `src/server/`, `src/shared/`, `package.json`, `tailwind.config.ts`, `tsconfig.json` reads).
**Author:** Claude Opus 4.7 via Evan
**Related:** `docs/patterns/extracted-2026-05-18.md` (pattern extraction report that surfaced the spec/reality gap).

---

## 2026-05-18: Hybrid styling — Tailwind utilities + semantic classes via @apply
**Decision:** Continue the existing pattern: Tailwind v3 utility layer with custom theme tokens (`ink`, `panel`, `field`, `line`, `accent`, `amber`, `danger`) underneath ~209 semantic CSS classes in `src/client/styles.css` composed with `@apply`. Components reach for semantic classes (`primary-button`, `field-inline`, `control-band`, `view-stack`) for vocabulary nouns, and Tailwind utilities for one-off layout glue.
**Rationale:** Pure Tailwind would mean re-writing the same 5+ utility chain across the codebase for common shapes (buttons, toolbars, view stacks). Pure semantic CSS would mean rebuilding the utility flexibility Tailwind already provides. The hybrid lets vocabulary stay short and consistent, while leaving Tailwind utilities for the long tail.
**Example:** `src/client/styles.css` (`.primary-button`, `.field-inline`, `.control-band`, etc.); `tailwind.config.ts` for the token palette.
**Author:** Claude Opus 4.7 via Evan
**Related:** `docs/design-system/styling-guide.md`.

---

## 2026-05-18: useCommandRunner is the only mutation contract for business state
**Decision:** All state-changing operations on business data (intake, orders, payments, batches, vendors, fulfillment, etc.) must route through `useCommandRunner.runCommand(name, payload, reason)`. Direct `trpc.<router>.<endpoint>.useMutation` is reserved for auth (`trpc.auth.login.useMutation` in `LoginView.tsx`) and a tiny set of bookkeeping operations.
**Rationale:** `useCommandRunner` stamps the idempotency key, invokes `trpc.commands.run` which dispatches to the server-side command handler, writes the DB + JSONL command journal, broadcasts a Socket.io event, pushes the success/error toast, and invalidates all cached queries. Bypassing this hook bypasses the audit + reversibility contract that the entire product is built on.
**Example:** `src/client/components/useCommandRunner.ts` (27 lines, the contract); `RefereeRelationshipDialog.tsx`, `IntakeView.tsx`, `OperatorGrid.tsx`'s `onCellCommit` consumer pattern.
**Author:** Claude Opus 4.7 via Evan
**Related:** Audit #23 (idempotency-key payload binding gap), audit #13 (Socket.io auth gap), `docs/design-system/state-patterns.md`.

---

## 2026-05-18: One Zustand store (useUiStore), not many
**Decision:** All UI state shared across components lives in a single `useUiStore` at `src/client/store/uiStore.ts`. Do not create additional Zustand stores.
**Rationale:** A single store keeps the UI state surface auditable and lets the `persist` middleware partialize a single shape. Multiple stores would fragment the persisted state and obscure where to look for cross-cutting state (drawer state, palette state, route history, toasts).
**Example:** `src/client/store/uiStore.ts` (~350 lines, ~30 state fields + actions, `persist` + `immer`).
**Author:** Claude Opus 4.7 via Evan
**Related:** `docs/design-system/state-patterns.md`.

---

## 2026-05-18: Initial design system documentation created
**Decision:** Establish a living documentation system under `docs/agent-orientation/` and `docs/design-system/` to reduce Evan's per-prompt context overhead and prevent frontend drift.
**Rationale:** Repeating architectural patterns, component locations, styling conventions, and state-management approaches in every agent prompt wastes Evan's time and produces inconsistent results. Living docs that agents read at session start solve this without ongoing manual effort.
**Example:** `docs/agent-orientation/START_HERE.md`, `docs/design-system/INDEX.md`.
**Author:** Claude Opus 4.7 via Evan
**Related:** `docs/superpowers/specs/2026-05-18-agent-orientation-design-system-design.md` (original spec), `docs/superpowers/plans/2026-05-18-agent-orientation-design-system.md` (implementation plan).

---

## 2026-05-21: Finalization receipts Tranche 1 — document_snapshots foundation (#113)
**Decision:** Establish a `document_snapshots` table with a per-`document_type` pure-projection architecture. PO finalization writes a `purchase_order` snapshot (internal + server-generated external payload). A tRPC router exposes role-gated endpoints: viewers get finalized-only minimized external shapes; operator+ gets internal payloads and draft-preview paths. `ReceiptPreview` renders via React portal to `document.body` for correct print-stylesheet behavior.
**Key invariants locked:**
- One active row per `(document_type, subject_id)` enforced by partial unique index.
- `documentSnapshots` is excluded from `snapshotByAffectedIds` tablePairs and snapshot UUIDs never enter `affectedIds` — command-history leak guard.
- Finalize consumes an active draft IN PLACE (same row id, status flips); no `superseded` row on Tranche 1 normal paths.
- `EXTERNAL_FIELDS` allowlist pinned in `poProjection.ts` with inline-snapshot change-control test; any allowlist change MUST bump `PROJECTION_VERSION` in the same commit.
- Viewer callers never receive `includeDrafts=true` results; the router throws FORBIDDEN.
**Files:** `migrations/0047_document_snapshots.sql`, `src/shared/documentSnapshots.ts`, `src/server/services/documentSnapshots/` (poInternalBuilder, poProjection, index, snapshotService), `src/server/routers/documentSnapshots.ts`, `src/client/components/ReceiptPreview.tsx`, CSS in `styles.css`, wiring in `commandBus.ts` + `OperationsViews.tsx`.
**Author:** Claude Sonnet 4.6 / Opus 4.7 via Evan (subagent-driven parallel waves)
**Related:** `docs/roadmap/2026-finalization-receipts-roadmap.md`, `docs/superpowers/plans/2026-05-20-finalization-receipts-tranche-1.md`, GitHub #113.

---

## 2026-05-21 — ReceiptPanel + server-rendered Signal text (#113 Phase 2)

**New component:** `src/client/components/ReceiptPanel.tsx` — read-only finalization receipt viewer with `external` / `internal` tabs, an "INTERNAL — DO NOT SEND" marker on the internal tab, and a "Copy for Signal" affordance on the external tab. Used in `OperationsViews.PurchaseOrdersView` under the PO header strip whenever the selected PO is at or past `finalized` status.

**Convention:** The signal-text renderer (`renderSignalText` in `src/server/services/documentSnapshots.ts`) is exposed via a dedicated tRPC query `queries.purchaseOrderSignalText` rather than imported into the client. Rationale: `documentSnapshots.ts` imports server-only `pg` and rbac code; copying the renderer into a shared module expands surface area unnecessarily. The tRPC indirection keeps the renderer in one place and lets us extend it (formatting, locale, watermark) without client redeploys.

**Convention:** Role-gated tRPC procedures should let the underlying service throw `TRPCError(FORBIDDEN)` via `assertRole(...)` rather than gating in the procedure body. `queries.purchaseOrderInternalReceipt` follows this pattern by passing `ctx.user` directly into `getInternalReceipt`. Single source of truth for the gate.

## 2026-05-22: PO authoring UX — notes consolidation, record-prepayment relocation, status filter presets (TER-1528)

**Decision 1:** Rename `buyerNotes` column header from "Buyer notes" to "Internal notes". Rename `internalNotes` column header to "Internal notes (ops)". Update authoring form labels to match.
**Rationale:** "Buyer notes" implied vendor-facing content. Both fields are internal. Using distinct labels avoids confusion while preserving separate DB columns.

**Decision 2:** Move "Record Prepayment" button from the top toolbar into the per-row expansion panel (alongside Draft intake / Unfinalize / Cancel draft PO).
**Rationale:** The toolbar button was confusing as a headline action — it only applied to one selected row and its enabled state depended on row-level data (prepaymentAmount > 0, status = approved). Row-level actions belong in the row expansion, not the global toolbar.

**Decision 3:** Add status filter preset buttons (Active / Ordered / Finalized) to the PO table toolbar.
**Rationale:** Operators frequently need to scope the PO list by workflow phase. Typed `status:` filter syntax is available but not obvious. Preset toggle buttons make the three most common views one click away. Buttons use `aria-pressed` and live outside the `canWrite` gate (filtering is a read-only operation).

**Files:** `src/client/views/OperationsViews.tsx`
**Author:** Claude Sonnet 4.6 / Sonnet 4.6 build agent via Evan
**Related:** TER-1528, PR #156, PR #158.

---

## 2026-05-22: PO authoring — remove permanent vendor-context aside, use VendorContextDrawer on demand (TER-1530)

**Decision:** Remove the permanent 320px `aside.po-context-panel` from the PO authoring workspace. The `VendorContextDrawer` (triggered by the "Context" button) already covers all of the aside's content (vendor facts, quick adds, historical POs tabs).

**Rationale:** The aside forced a two-column layout at all widths and presented the same data twice. The on-demand drawer pattern is consistent with the rest of the app and recovers screen real estate for the authoring form and PO lines grid.

**Convention:** When a permanent panel and an on-demand drawer cover the same content, prefer the drawer. Keep the trigger button visible and discoverable (next to related controls). Never silently remove functionality — ensure the drawer covers everything the panel did.

**Files:** `src/client/views/OperationsViews.tsx`, `src/client/styles.css` (removed `.po-authoring-layout`, `.po-authoring-main`, `.po-context-list`, `.po-context-row`)
**Author:** Claude Sonnet 4.6 / Sonnet 4.6 build agent via Evan
**Related:** TER-1530, PR #158.

---

## 2026-05-22: PO authoring — AddRefereeRelationshipDrawer (TER-1532)

**New component:** `src/client/components/AddRefereeRelationshipDrawer.tsx` — 440px fixed slide-in drawer for creating a referee credit relationship inline from PO authoring. Triggered by an "Add referee" button next to the referee credit select.

**Decision:** Use a two-mode design (Use existing referee / Create new referee) with a shared fee structure section, rather than a separate creation flow.
**Rationale:** Operators frequently need to assign a referee they don't yet have in the system. Making this possible without navigating to /referees reduces context switches during PO authoring.

**Orphan safety pattern:** After `createReferee` succeeds but before `addRefereeRelationship` succeeds, the component enters a "retry" state: `pendingRefereeId` is set, the newly created referee is appended to `localReferees`, the mode flips to "existing", and a recovery banner explains the situation. On retry, step 1 (createReferee) is skipped — no duplicate created. The "Create new referee" tab is disabled during retry.

**Convention:** Any two-command sequence where step 1 creates a record and step 2 links it should track `pendingFirstStepId` in component state and skip step 1 on retry if the ID is already set.

**Files:** `src/client/components/AddRefereeRelationshipDrawer.tsx`, `src/client/views/OperationsViews.tsx`
**Author:** Claude Sonnet 4.6 / Sonnet 4.6 build agent via Evan
**Related:** TER-1532, PR #161.

---

## 2026-05-22: Photography — MediaBatchDrawer replaces bottom Batch Media panel (TER-1537)

**New component:** `src/client/components/MediaBatchDrawer.tsx` — 480px push side drawer (no overlay) that replaces the `MediaDetailPanel` bottom panel on `/photography`.

**Decision:** Use a push-style side drawer (grid shrinks via flex) rather than an overlay drawer.
**Rationale:** The photography queue and batch media are companion views — operators need to see both simultaneously. An overlay would hide the queue. The push pattern mirrors how detail panels work in other grid-plus-detail surfaces in the app.

**Decision:** Desktop file upload uses XHR (`XMLHttpRequest`) with `upload.onprogress` rather than `fetch`.
**Rationale:** `fetch` does not expose upload progress events. XHR is required for per-file progress bars on upload.

**Upload XHR contract:**
- `batchId` must be appended to FormData BEFORE `file` — the server's multer `destination` callback reads `req.body.batchId` synchronously while parsing the multipart stream. Order matters.
- Non-2xx responses and `onerror` must surface to the user via the upload progress state — never silently swallow.
- Progress caps at 90% during XHR upload; the final 10% resolves after the `uploadBatchMedia` command succeeds.

**Files:** `src/client/components/MediaBatchDrawer.tsx`, `src/client/views/MediaView.tsx`, `src/client/styles.css` (new `.media-batch-drawer*`, `.media-upload-zone*`, `.media-upload-progress` classes). `MediaDetailPanel.tsx` and `MediaDetailPanel.test.tsx` deleted.
**Author:** Claude Sonnet 4.6 / Sonnet 4.6 build agent via Evan
**Related:** TER-1537, PR #168.

---

## 2026-05-22: Finalization receipts Phase 4 — customer_payment and vendor_payout projections (TER-1534)

**New modules:**
- `src/server/services/projections/customerPaymentProjection.ts` — external allowlist for customer payment receipts (7 fields: kind, paymentDate, amount, method, reference, customerName, notes). Blocks: customerId, direction, category, allocationIntent, status.
- `src/server/services/projections/vendorPayoutProjection.ts` — external allowlist for vendor payout receipts (8 fields). Blocks: vendorId, vendorBillId, purchaseOrderId, status.

**Convention:** External projection allowlists use `as const satisfies readonly string[]` for compile-time enforcement. Tests must cover both directions: (1) only expected keys are present, (2) each prohibited key is explicitly absent (`toBeUndefined()`).

**Post-commit hook placement:** `createPaymentReceivedReceipts` and `createVendorPayoutReceipts` run as best-effort post-commit hooks after `logPayment` and `recordVendorPayment`. Failure is non-fatal (try/catch + console.warn). The hooks run on the raw `pool` (not inside the command's Drizzle tx) because the pg-native advisory-lock pattern in `finalizeSnapshot` requires its own `BEGIN/COMMIT`.

**Known gap:** The snapshot functions share the command transaction's connection when called inside `tx`. A Postgres-level error inside the snapshot call puts the transaction into aborted state, potentially rolling back the parent command despite the JS try/catch. Tracked for future savepoint mitigation.

**Files:** `src/server/services/projections/customerPaymentProjection.ts`, `vendorPayoutProjection.ts`, `src/server/services/commandBus.ts`
**Author:** Claude Sonnet 4.6 / Sonnet 4.6 build agent via Evan
**Related:** TER-1534, PR #180.

---

## 2026-05-22: Finalization receipts — print HTML, watermark hardening, seed guarantee (TER-1535)

**Decision 1:** Replace `<pre className="receipt-preview-body">` with `<div className="receipt-preview-body-html">` using `white-space: pre-wrap` and page font (not monospace).
**Rationale:** Receipt text is prose sentences, not column-aligned tabular output. Proportional fonts render correctly and print better. Monospace was a holdover from early prototyping.

**Decision 2:** Internal watermark ("INTERNAL — DO NOT SEND") is always in the DOM, toggled via `className={mode === 'internal' ? 'selection-pill danger' : 'hidden'}` rather than conditional rendering.
**Rationale:** Print CSS targets `[data-testid="internal-watermark"]` — conditional rendering would make the element unavailable to the print stylesheet in the window between React re-render and `window.print()`. Always-in-DOM with `display:none` is safe because `aria-live` regions are suppressed on hidden elements.

**Critical print CSS rule:** The watermark print rule MUST use `:not(.hidden)` to avoid showing the watermark on external-mode prints:
```css
body.print-receipt-only [data-testid="internal-watermark"]:not(.hidden) {
  display: block !important; ...
}
```
Without `:not(.hidden)`, `!important` overrides the `hidden` class and the watermark bleeds onto external receipts.

**Decision 3:** The dev seed includes a finalized PO (`PO-DEMO-003`) with a seeded `document_snapshots` row so E2E receipt-preview tests run unconditionally. Uses `createPoFinalizationReceipts(pool, ...)` — not a Drizzle transaction, because the pg advisory-lock pattern requires its own BEGIN/COMMIT.

**Files:** `src/client/components/ReceiptPreview.tsx`, `src/client/styles.css`, `tests/e2e/receipt-preview.spec.ts`, `src/server/seed.ts`
**Author:** Claude Sonnet 4.6 / Sonnet 4.6 build agent via Evan
**Related:** TER-1535, PRs #179, #183, #184.

## 2026-05-26: Phase 7 Wave 3D — Feature Flag Audit (TER-1604)

**Decision:** Feature flag audit completed. One product feature flag and three infrastructure env vars found.

| Flag / Var | Location | Classification | Disposition |
|------------|----------|----------------|-------------|
| `VITE_CANVAS_GRAMMAR_ENABLED` | `src/client/App.tsx:55` | **Product feature flag** — Default-on. Controls whether the canvas grammar shell is active. | **Keep as documented escape hatch.** The canvas grammar (CAP-007/CAP-008) is stable and shipped in all views. The flag exists to allow operators to revert to the pre-canvas shell if a regression surfaces. Removing it would require a full shell revert, which is low-risk but unnecessary. Document: set `VITE_CANVAS_GRAMMAR_ENABLED=false` in `.env` to disable. |
| `VITE_TRPC_URL` | `src/client/api/trpc.ts:13` | Infrastructure config — tRPC endpoint URL | Not a feature flag. Default `/trpc` is correct for all deployments. Override only for custom reverse proxy path prefix. |
| `VITE_SOCKET_URL` | `src/client/App.tsx:96` | Infrastructure config — Socket.IO server URL | Not a feature flag. Default `/` is correct. Override only for separate WebSocket host. |
| `VITE_AG_GRID_LICENSE_KEY` | `src/client/main.tsx:19,56` | Infrastructure config — AG Grid Enterprise license | Not a feature flag. Required for production; missing key shows AG Grid watermark. |

**No dead-code feature flags found.** The codebase does not use `process.env.REACT_APP_*` or `FEATURE_*` patterns.

**Files:** `src/client/App.tsx`, `src/client/api/trpc.ts`, `src/client/main.tsx` (audit only, no code changes)
**Author:** Claude Sonnet 4.6 / Sonnet 4.6 build agent via Evan
**Related:** TER-1604, Wave 3D Phase 7 hardening.

---

## 2026-05-26: Phase 7 Wave 3D — Keyboard accessibility fixes (TER-1600)

Fixes applied from `docs/roadmap/phase7-keyboard-a11y-audit.md` blocking gaps K1–K3 and accessibility gap A4/A9.

**K1 + A4 — ContextDrawer focus trap and dialog role:**
- Added `useFocusTrap(drawerOpen, closeDrawer)` to `ContextDrawer`. The `drawerRef` is attached to the `<aside>` element when the drawer is open.
- Added `role="dialog"` and `aria-modal="true"` to the open drawer `<aside>` so screen readers know a modal-like context panel is active. Matches the `VendorContextDrawer` gold standard.
- The global Escape handler in `Hotkeys.tsx` already closes the drawer; `useFocusTrap` adds Tab trapping to prevent keyboard bleed into the background AG Grid.

**K2 — RowCommandHistoryDrawer focus trap:**
- Added `useFocusTrap(Boolean(row), onClose)` to `RowCommandHistoryDrawer`. The `drawerRef` is attached to the `<aside className="row-history-drawer">` element.
- Pattern is identical to `AddRefereeRelationshipDrawer`. Escape closes the drawer.

**K3 + A9 — RecoveryView admin tools label association:**
- Added explicit `id` attributes (`recovery-period`, `recovery-amount`, `recovery-memo`) to the three inputs in the correction journal entry band.
- Added matching `htmlFor` on each `<label>` element. Previously, the `field-inline` CSS class provided visual containment but no programmatic label association.

**Major/minor gaps not addressed in this wave (tracked, not silently ignored):**
- K4: VendorContextDrawer focus trap — deferred; VendorContextDrawer has `role="dialog"` but no trap. Filed as known gap for next keyboard wave.
- K5: ReceiptPreviewDrawer focus trap — deferred.
- K6: QuickLedgerGrid transaction type drawer — deferred.
- K7: PaymentsView allocation workflow label association — deferred.
- K8: FulfillmentView alerts drawer — deferred.
- K9–K12: Minor gaps — deferred.
- A1–A11 (except A4, A9 fixed above): Accessibility gaps — deferred for dedicated a11y pass.

**Files:** `src/client/components/ContextDrawer.tsx`, `src/client/components/RowCommandHistoryDrawer.tsx`, `src/client/views/OperationsViews.tsx`
**Author:** Claude Sonnet 4.6 / Sonnet 4.6 build agent via Evan
**Related:** TER-1600, `docs/roadmap/phase7-keyboard-a11y-audit.md`, Wave 3D Phase 7 hardening.

---

## 2026-05-26: Phase 7 Wave 3D — Drawer/focus state persistence per route (TER-1601)

**Decision:** URL query param approach for drawer state persistence.

**Approach:** Added `src/client/hooks/useDrawerUrlSync.ts`. The hook is called inside `ContextDrawer` (which already has access to `activeView`, drawer state, and active entity). It:
1. On mount: reads `?drawer=<state>&entityType=<type>&entityId=<id>` URL params and restores drawer state + entity if valid params are present.
2. On drawer state change: writes current params to URL with `replace: true` (no history spam).

This means:
- Navigating Back in the browser restores the drawer state for the previous view (URL params survive history navigation).
- Refreshing the page restores drawer state (URL params survive reload).
- Opening a shared URL with `?drawer=standard&entityType=salesOrder&entityId=xxx` opens the correct drawer context.

**Why URL params over Zustand persist:**
- `drawerByView` is already persisted via Zustand (drawer open/closed state per entity). What was missing was `activeDrawerEntityByView` (which entity is active per view), which is intentionally NOT persisted for security (entity UUIDs would leak between operators on shared workstations before auth resolves).
- URL params are visible only in the current browser tab session and are cleared when the user closes the tab. They do not persist to localStorage.
- URL params are explicit — the state is observable and debuggable.

**Security note:** Entity IDs in URL params are auth-gated at the data layer. Viewing the URL gives you the UUID, not the data. The existing `resetSession()` on logout clears in-memory state; the URL will show stale params until the next navigation, at which point the server auth check gates data access.

**Files:** `src/client/hooks/useDrawerUrlSync.ts` (new), `src/client/components/ContextDrawer.tsx`
**Author:** Claude Sonnet 4.6 / Sonnet 4.6 build agent via Evan
**Related:** TER-1601, Wave 3D Phase 7 hardening.

---

[Future decisions append above this line, in reverse chronological order.]

---

## 2026-05-22: CAP-030 — pick-status chip color mapping (TER-1508)

**Decision:** Use a five-state color scheme for pick-status chips in `SalesView`: gray `unreleased`, blue `released`, amber `picking`, green `picked`, red `recall_pending`.
**Rationale:** Colors map to operator urgency. Gray = no action needed. Blue = released and awaiting warehouse. Amber = in motion. Green = complete. Red = warehouse problem, operator action required.
**Implementation:** `PickStatusChip` function at the bottom of `SalesView.tsx` returns a `<span className="selection-pill ...">` with `data-pick-status` attribute for CSS targeting.
**Files:** `src/client/views/SalesView.tsx`
**Author:** Claude Sonnet 4.6 via Evan
**Related:** TER-1508, PR #190.

---

## 2026-05-22: CAP-030 — expansion-panel Remove gate for released lines (TER-1508)

**Decision:** The per-row expansion panel Remove button must gate through `setPendingLineEdit` when the line's `pickStatus` is `released` or `picking`, identical to the selection-bar Remove path.
**Rationale:** Warehouse has claimed the line. Removing without notification leaves the picker with no work and a dangling fulfillment record. Both removal paths (expansion panel AND selection bar) must invoke the same confirmation modal, which triggers the warehouse alert on confirm.
**Convention:** Any action that modifies a line with `pickStatus` in `['released', 'picking']` must go through `pendingLineEdit` — not `runCommand` directly. This applies to both the expansion panel and selection bar. Test QA finding caught this gap in the expansion panel path.
**Files:** `src/client/views/SalesView.tsx` — `salesLineExpansionConfig.actionsRenderer`
**Author:** Claude Sonnet 4.6 via Evan
**Related:** TER-1508, PR #190, QA finding fix.

---

## 2026-05-22: CAP-030 — non-persisted pick queue filter slice in uiStore (TER-1510)

**Decision:** `pickQueueFilters: Set<string>` is stored in `uiStore` but intentionally excluded from the `partialize` whitelist. Filter state resets to empty on page reload.
**Rationale:** Pick queue filters are session-context (what the manager is looking at right now). Persisting them across sessions would surface stale chips on reload and make it unclear why data is filtered. Unlike column layout prefs (`gridColumnPrefs`), queue filter chips are transient work state.
**Convention:** Operator session state that should NOT survive reload goes in uiStore WITHOUT being added to `partialize`. Query/search/filter state is usually non-persistent unless explicitly scoped to user preferences.
**Files:** `src/client/store/uiStore.ts`
**Author:** Claude Sonnet 4.6 via Evan
**Related:** TER-1510, PR #190.

---

## 2026-05-22: CAP-030 — PickView mobile-first layout (TER-1513)

**Decision:** PickView uses Tailwind only (no AG Grid), touch-sized inputs (`minHeight: 56px` for primary actions, 44px minimum everywhere), and a three-screen push-navigation pattern (QueueScreen → PickListScreen → PickLineScreen) driven by component state rather than URL params.
**Rationale:** AG Grid is the wrong tool for a warehouse flow on a phone. Touch targets need to be large. URL-param navigation adds latency and history complexity for a sequential workflow (queue item → list → line → back).
**BarcodeDetector:** `typeof window.BarcodeDetector !== 'undefined'` in `useEffect` sets `barcodeSupported` state. Manual entry is always visible. Scan button renders in both states (shows `—` when unsupported). Never hide the fallback.
**Alert interrupt:** Must use `role="alertdialog"`, `aria-modal="true"`. Must NOT be dismissable by Escape or click-outside. Focus trap is required (tracked in TER-1560 as a pre-condition before the backend activates real alerts).
**Files:** `src/client/views/PickView.tsx`, `src/client/components/pick/QueueScreen.tsx`, `PickListScreen.tsx`, `PickLineScreen.tsx`, `pickTypes.ts`
**Author:** Claude Sonnet 4.6 via Evan
**Related:** TER-1513, PR #190.

## 2026-06-15 — Mercury demo dashboard taste analysis (first taste skill run)

**Context**: Ran the `taste` skill against `https://demo.mercury.com/dashboard` + 4 linked surfaces (Transactions, Payments, Invoicing, Reimbursements). Evan flagged Transactions as the closest model for TERP Operator's table design.

**Key findings that inform TERP Operator tables:**

1. **51px row density standard** — Mercury uses exactly 51px table rows with 16px font at 16px line-height. This is a 3.2:1 height-to-font ratio — extremely compact. For TERP Operator's spreadsheet-native wholesale workflows, this density level is the benchmark.
2. **Table-first architecture** — Every functional page uses `<table>` as the primary surface; no card/list toggle exists. The table IS the interface. This aligns with TERP Operator's spreadsheet-native posture.
3. **9-column standard** — Transactions page: [checkbox, Date, To/From, Amount, Account, Method, Category, GL Code, Attachment]. 4 columns are sortable, 2 are inline-editable dropdowns (Category, GL Code).
4. **Row actions** — Click-to-navigate detail, multi-select via checkbox column, inline editing for categorization fields.
5. **Cool-tinted neutral palette** — Every neutral is blue-shifted (no pure gray). Near-black `#1E1E2A`, page bg `#FBFCFD`. Shadow colors inherit the blue tint.
6. **Two-tier shadow system** — Light card shadow (2-layer) vs. elevated popover shadow (4-layer), all blue-tinted.
7. **Motion is micro-feedback only** — 0.14-0.20s, transform/opacity only, respects reduced motion.

**Artifacts**: `docs/design-system/taste/demo.mercury.com.md` + `demo.mercury.com.json`

**Skill integration**: Taste skill installed for OpenCode at `~/.config/opencode/skills/taste/`. Export target "TERP Operator" → writes to `docs/design-system/taste/{domain}.md` + `.json`. Playwright MCP enabled.
