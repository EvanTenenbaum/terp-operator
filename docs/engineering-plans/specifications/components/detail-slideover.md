# SlideOver — Component Specification (Refactor Target of ContextDrawer)

**Type:** Layout shell
**Refactor target:** `src/client/components/ContextDrawer.tsx` (647 lines, existing). This spec describes the shape of that file *after* refactor. **There is no parallel build.** See `docs/design-system/decisions-log.md` (2026-06-16 entry "ContextDrawer → SlideOver Refactor Decision") for the binding rationale.
**Authority:** `MERCURY-ARCHITECTURE-MANIFESTO.md` §5.2; `CPO-AUDIT-REPORT.md` F2 (P0).
**Status:** Spec rewritten 2026-06-16 to reflect refactor-in-place strategy. The original "build from scratch" framing was a CPO-audit miss.

---

## 0. Disposition table — what is preserved, renamed, refactored, dropped

The existing `ContextDrawer.tsx` is the substrate. Every behavior below is classified.

| Concern | Today (`ContextDrawer.tsx`) | Disposition | Target shape |
|---|---|---|---|
| File path | `src/client/components/ContextDrawer.tsx` | RENAME | `src/client/components/SlideOver.tsx` |
| Component export | `ContextDrawer` | RENAME | `SlideOver` |
| State enum | `DrawerStateName = 'closed' \| 'peek' \| 'standard' \| 'wide' \| 'focus'` | RENAME + SHRINK | `SlideOverState = 'closed' \| 'peek' \| 'standard' \| 'wide'`. `focus` dropped; persisted values coerced to `wide` on rehydration. |
| Per-view drawer state in store | `drawerByView`, `activeDrawerEntityByView`, `lastUsedDrawerStateByView` | PRESERVE (names unchanged) | Same. Renaming the persisted slice would force operator-session migration with no UX gain. |
| URL sync | `useDrawerUrlSync(view)` writes `drawer`, `entityType`, `entityId` | PRESERVE + WRAP | Hook body unchanged. A new outer hook `useViewUrlState(view)` composes it and adds `tab`, `status`, `f`, `sel`, `cur`. Backward-compatible URLs. |
| Focus trap | `useFocusTrap<HTMLElement>(open, closeFn)` with overlay/palette skip | PRESERVE EXACTLY | Same call site, same logic. |
| ARIA contract | `role="dialog"`, `aria-modal="true"`, `aria-label="Context drawer"`, `role="tablist"`, `role="tab"`, `aria-selected` | PRESERVE | Update `aria-label` text to `"Entity details"` per Mercury spec language. |
| Tab data source | Hard-coded `drawerTabs: Record<string, Tab[]>` (~187 lines, 14 entity types) | REPLACE | Tab registry in `src/client/components/tabs/registry.ts` + registrations in `tabs/registrations.ts`. SlideOver calls `getTabs(entityType, role)`. |
| Tab components | 19 components in `drawerTabs/*.tsx` (PoLinesTab, PoVendorTab, PoHistoryTab, EntityTimelineTab, LotMovementTab, etc.) | PRESERVE | Imported into `tabs/registrations.ts` and registered by key. Same components, same props. |
| Conditional content dispatch | ~120 lines of `if (activeTab === '…' && is…Entity)` inside `ContextDrawerContent` | REFACTOR | Each conditional branch becomes a tab `component` reference in the registry. The dispatch collapses to `const Tab = registry.getTab(entityType, activeTab)?.component; return <Tab entityId={…} entityType={…} row={row} />;`. |
| Inline `RelationshipContext` + facts card (fallback render path) | Inlined in `ContextDrawer.tsx` (~140 lines) | EXTRACT | Move to `src/client/components/tabs/OverviewTab.tsx`. Register as `defaultFor: ['queue', 'customer', 'vendor', …]`. |
| State-cycle button (UX-B06) | Glyph button + `DRAWER_STATE_GLYPH` map + `DRAWER_CYCLE_ORDER` + cycle handler | PRESERVE (shrunk) | Cycle order becomes `['peek', 'standard', 'wide']`. Glyph map loses `focus` row. Button keeps `data-testid="drawer-cycle-btn"`. |
| Coachmark (UX-B06) | One-time tip with persisted dismissal | PRESERVE | Drop "/ focus" from copy. Persisted `dismissedDrawerCoachmark` flag unchanged. |
| Keyboard shortcut `]` (cycle) and `⇧]` (cycle width) | In `Hotkeys.tsx`, wired to `toggleDrawer`/`cycleDrawer` actions | PRESERVE | Unchanged. |
| Reopen pill (closed state) | `context-drawer-reopen` aside with reopen button | PRESERVE | CSS class renamed to `slide-over-reopen`. |
| Drag-to-resize on left edge | **Does not exist** | ADD (NEW) | 8px invisible handle. MouseDown→Move updates width. Snap to 280px/420px/60% on MouseUp. <200px = close. |
| "Open in full view" action | **Does not exist** | ADD (NEW) | Footer link or header action. Navigates to entity route (e.g., `/purchase-orders/:id`). Route map provided by view registry. |
| Peek click-outside dismiss | **Does not exist** (only ✕ / Escape close) | ADD (NEW) | In peek state only, click outside the panel closes it. Standard/wide require explicit ✕ or Escape (per current behavior). |
| State-restore on URL deep-link | `useDrawerUrlSync` mount effect | PRESERVE | Wrapped by `useViewUrlState`; `tab` param honored on first mount. |
| `defaultTabForEntity` resolution | `tabsFor(entityType)` → fallback to first tab if persisted `activeTab` invalid | PRESERVE | Lives in the registry now: `getDefaultTab(entityType)` returns first tab with `defaultFor: [entityType]`, else first registered tab. |
| Per-view `selectedRows[view][0]` → drawer content | `useUiStore` selector | PRESERVE | Unchanged. SlideOver still derives `row` from the active selection by default; explicit `entityId` from URL overrides. |
| Persisted operator URL bookmarks (`?drawer=standard&entityType=po&entityId=…`) | Live and load correctly today | PRESERVE | Same param shape, same restore behavior. `tab` param is additive. |
| Multi-mounted overlay rule | One ContextDrawer instance per view | PRESERVE + ENFORCE | Manifesto §6.1 forbids simultaneous SlideOver instances. Opening a new entity replaces the entity in the existing SlideOver via `setDrawerEntity` (already today's behavior). |

---

## 1. Public API after refactor

```typescript
// src/client/components/SlideOver.tsx

/**
 * SlideOver is mounted exactly once per view by the PrimaryGridView template.
 * It reads `activeDrawerEntityByView[view]` and `drawerByView[key]` from useUiStore
 * and renders accordingly. Closed state mounts a reopen affordance only.
 *
 * No props. State flows through useUiStore + useViewUrlState.
 */
export function SlideOver(): JSX.Element | null;

// src/client/components/tabs/registry.ts

export interface SlideOverTab {
  /** Unique within entity type. Used in URL `?tab=<key>`. */
  key: string;
  /** Display name. */
  label: string;
  /** Optional lucide-react icon name. */
  icon?: string;
  /** Tab content component. Mounted only when this tab is active (ARCH-3). */
  component: React.ComponentType<SlideOverTabProps>;
  /** Optional badge count. May be a static number or a selector hook. */
  badge?: number | (() => number);
  /** Role-gating. Tab is filtered from `getTabs` output when user.role < required. */
  requiresRole?: 'owner' | 'manager' | 'operator';
  /** Entity types where this tab should be the default (first) tab. */
  defaultFor?: string[];
}

export interface SlideOverTabProps {
  entityId: string | null;
  entityType: string;
  row?: GridRow;
}

export function registerTabs(entityType: string, tabs: SlideOverTab[]): void;
export function getTabs(entityType: string, role?: UserRole): SlideOverTab[];
export function getDefaultTab(entityType: string): string | undefined;

// src/client/hooks/useViewUrlState.ts (wrapper around useDrawerUrlSync)

export interface ViewUrlState {
  drawer: SlideOverState;        // existing
  entityType?: string;           // existing
  entityId?: string;             // existing
  tab?: string;                  // NEW
  status?: string[];             // NEW (comma-split)
  f?: string;                    // NEW (compressed FilterGroupInput)
  sel?: string[];                // NEW (optional selection)
  cur?: string;                  // NEW (pagination cursor)
}

export function useViewUrlState(view: ViewKey): ViewUrlState;
```

### What is removed from the public surface

- `ContextDrawer` (renamed; old name re-exported as `@deprecated` alias for one release cycle).
- The exported `getActiveDrawerStorageKey(view)` helper is preserved (used by sales export). Renamed internally to clarify intent; export name unchanged for one release.

### What is added to the public surface

- `SlideOver` component.
- `tabs/registry.ts` exports (registry API).
- `useViewUrlState(view)` hook.
- `OverviewTab` component (extracted from inline `RelationshipContext` + facts card).

---

## 2. State machine after refactor

```
       ┌─────────┐                ┌─────────┐                ┌─────────┐
       │ closed  │ ─── row sel ─▶ │  peek   │ ─── click ───▶ │standard │
       └─────────┘ ◀── click X ── └─────────┘ ◀── close ─── └─────────┘
                          ▲                                       │
                          │                                       │ cycle / drag-left
                          │                                       ▼
                          │                                  ┌─────────┐
                          └──── click X / Escape ──────────  │  wide   │
                                                             └─────────┘
```

| State | Width | Mount cost | Main content layout |
|---|---|---|---|
| `closed` | 0 | Reopen pill only (~40px) | Full width |
| `peek` | 280px | Header + 2–3 primary actions | Full width (overlay, no shift) |
| `standard` | 420px | Header + actions + tabs + content + "Open in full view" | Shifted left by 420px |
| `wide` | 60vw | Same as standard, content uses extra space | Compressed to 40vw |

Cycle order: `peek → standard → wide → peek` (via `]` keyboard shortcut and the state-cycle button). `closed` is reachable only via ✕ / Escape (or peek click-outside).

---

## 3. Migration table for the 18 drawer/dialog components (Manifesto §5.3)

Each row names a current component, the SlideOver tab key (or `ConfirmRoot` mapping) it migrates to, and the entity type that owns it.

| Current component | Disposition | SlideOver entity type | Tab key / mapping | Notes |
|---|---|---|---|---|
| `ContextDrawer.tsx` | THIS REFACTOR | n/a | n/a | This file becomes `SlideOver.tsx`. |
| `InspectorDrawer.tsx` (bottom-anchored tabs in OrdersView via `GridJourney`'s `inspectorTabs` prop) | FOLD | `order` | Existing `relationship` + `timeline` tabs absorb the inspector's tab content. `GridJourney.inspectorTabs` prop deleted in Phase 2. | OrdersView's bottom-drawer pattern retires; OrdersView opens right-side SlideOver instead. |
| `RecordPrepaymentDialog.tsx` | TAB MIGRATION | `po` | New tab `prepayment` (or fold into existing `commands` tab as a sub-action). | Was a blocking modal; becomes SlideOver tab per UX-6. |
| `RefereeDialog.tsx` | TAB MIGRATION | `referee` (new entity type registration) | New tab `actions` | Add referee to entity types. |
| `RefereeRelationshipDialog.tsx` | TAB MIGRATION | `referee` | New tab `relationships` | |
| `RefereeDetailPanel.tsx` | TAB MIGRATION | `referee` | Default tab (`overview`) | The detail-panel content moves into the registered overview tab. |
| `MediaBatchDrawer.tsx` | TAB MIGRATION | `lot` | New tab `media-batch` (or merge into existing `photos` tab) | Existing `LotPhotosTab` is closest current analog. Decide: merge into `photos` or add `media-batch` (recommend merge). |
| `ProcessorDetailPanel.tsx` | TAB MIGRATION | `processor` (new entity type registration) | Default tab (`overview`) | Currently gated by `CONNECTOR_SURFACES_ENABLED` flag; keep gating. |
| `RowCommandHistoryDrawer.tsx` | TAB MIGRATION | varies (per row's entity) | Existing `commands` / `history` tabs (PoCommandsTab, SalesCommandHistoryTab) | Already implemented per-entity; this component retires. |
| `IssueSidecar.tsx` | TAB MIGRATION | `salesOrder`, `invoice` | New tab `issue` | Issue-tracking content moves to a registered tab. |
| `RelationshipDrawer.tsx` | TAB MIGRATION (already done) | `customer`, `vendor` | Existing `relationship` tab | Wave 5 already converged this onto ContextDrawer's relationship tab; retire the standalone drawer. |
| `ReceiptPreviewOverlay.tsx` | TAB MIGRATION | `payment` | New tab `receipt` | Backend procedure for receipt preview already exists; needs registry registration. |
| `EditCreditLimitModal.tsx` (edit mode) | TAB MIGRATION | `customer` | Existing `credit` tab (extend `CustomerCreditPanel`) | When used to *confirm* destructive credit changes (e.g., suspend), route to `ConfirmRoot` via `useConfirm()` instead. |
| `EditCreditLimitModal.tsx` (confirm mode) | CONFIRM MIGRATION | n/a | `useConfirm()` modal | Destructive paths use `ConfirmRoot`, not SlideOver. |
| `AddRefereeRelationshipDrawer.tsx` | TAB MIGRATION | `referee` | `relationships` tab (form lives inside the tab) | |
| `CustomerCreditPanel.tsx` (current SlideOver tab content) | PRESERVE | `customer` | Existing `credit` tab | Already correctly placed; no change. |
| `PhotographyQueuePanel.tsx` (Wave 7) | TAB MIGRATION | `lot` | New tab `photo-queue` OR removed from primary surface and replaced with badge on `photos` tab | Decision per Phase 1 pilot; the panel-on-primary-surface pattern is a UX-3 violation. |
| `PoLinesTab`, `PoVendorTab`, `PoHistoryTab`, `PoLinkedIntakeTab`, `PoCommandsTab`, `SalesOutputTab`, `SalesPricingTab`, `SalesCommandHistoryTab`, `LotMovementTab`, `LotHistoryTab`, `LotPhotosTab`, `VendorBillDetailsTab`, `VendorBillTraceTab`, `VendorPaymentHistoryTab`, `EntityTimelineTab`, `PaymentLinkedOrdersTab`, `CommandReversalTab` | REGISTER | varies | Same tab keys as today | The 17 existing tab components are imported once into `tabs/registrations.ts` and registered by key. Zero code change to the components themselves. |
| Future tabs (`NEEDS_BUILD` per CPO audit F6) — Customer `purchase-history`, `photography`, `overview`; Inventory `finder` entity; SalesOrder `vendor` tab; `receipt-preview` tab | NEW | as listed | as listed | Built in Phase 1+ during per-view migration. Each new tab is a component + a registry registration. No new SlideOver mechanics required. |

---

## 4. CSS class migration

The visual contract is unchanged. Class names update for clarity but retain identical styling tokens.

| Current class | New class | Rationale |
|---|---|---|
| `.context-drawer` | `.slide-over` | Match component name |
| `.context-drawer-${state}` (closed/peek/standard/wide/focus) | `.slide-over-${state}` (closed/peek/standard/wide) | Drop `focus` variant |
| `.context-drawer-header` | `.slide-over-header` | |
| `.context-drawer-body` | `.slide-over-body` | |
| `.context-drawer-card` | `.slide-over-card` | |
| `.context-drawer-reopen` | `.slide-over-reopen` | |
| `.context-reopen-button` | `.slide-over-reopen-button` | |
| `.drawer-tabs` / `.drawer-tab` / `.drawer-tab-active` / `.drawer-tab-index` | `.slide-over-tabs` / `.slide-over-tab` / `.slide-over-tab-active` / `.slide-over-tab-index` | |
| `.drawer-fact-row` | `.slide-over-fact-row` | |
| `.drawer-empty` | `.slide-over-empty` | |

CSS variable `--tx-drawer-state` is preserved as `--tx-slide-over-state` with the same value (`180ms cubic-bezier(0.2, 0.8, 0.4, 1)`). Old name aliased for one release.

---

## 5. Test plan

Existing tests under `src/client/components/ContextDrawer*.test.tsx` continue to assert behavior. Refactor must preserve every existing test, with the following changes:

1. Update any test that imports `ContextDrawer` directly to import `SlideOver`. Old name is re-exported during the deprecation window so test failures are limited to type-level assertions.
2. Remove tests for `focus` state cycle (UX-B06 cycle now `peek → standard → wide`).
3. Add tests for the registry: `registerTabs(entityType, tabs)` is idempotent; `getTabs(entityType, role)` filters by `requiresRole`; `getDefaultTab` resolves correctly.
4. Add tests for `useViewUrlState`: `tab` param round-trips; backward-compatible with existing `drawer`/`entityType`/`entityId` URLs; `focus` value in URL coerces to `wide` and rewrites cleanly.
5. Add a one-time persisted-state migration test: a store rehydrated with `drawerByView[k].state === 'focus'` yields `'wide'` post-migration.

New behaviors (drag-to-resize, "Open in full view", peek click-outside) ship in Phase 1 with their own tests; not part of the Phase 0 refactor.

---

## 6. Acceptance criteria for the Phase 0 refactor (no new features)

The Phase 0 refactor lands when:

- [ ] `SlideOver` exported from `src/client/components/SlideOver.tsx`; `ContextDrawer` re-exported as `@deprecated` alias from the same file for one release.
- [ ] `tabs/registry.ts` + `tabs/registrations.ts` exist; `drawerTabs` map is gone from the component file; all 14 entity types registered with identical tab keys and labels.
- [ ] `SlideOverState` exported from `src/shared/types.ts`; `DrawerStateName` re-exported as `@deprecated` alias.
- [ ] `focus` state removed from enum, cycle, glyph map, label map, coachmark copy; persisted `focus` values coerce to `wide` on rehydration.
- [ ] CSS classes renamed; old class names kept as aliases for one release (Tailwind config or duplicate selectors).
- [ ] `useDrawerUrlSync` unchanged in behavior. `useViewUrlState(view)` added as wrapper but not yet consumed by views — first consumption is PurchaseOrdersView in Phase 1.
- [ ] `useFocusTrap` invocation unchanged.
- [ ] All existing tests pass (with name-import updates only).
- [ ] No view changes its behavior. Operator bookmarks (`?drawer=…&entityType=…&entityId=…`) continue to restore correctly.
- [ ] Decisions-log entry exists and is linked from the Mercury authority chain.

---

## 7. Acceptance criteria for Phase 1 additive features

The Phase 1 features (drag, "Open in full view", peek click-outside) ship behind PurchaseOrdersView's per-view feature flag (Manifesto / CPO F9). AC for those will live in the PurchaseOrdersView task entries, not here. This spec defers them to `MASTER-EXECUTION-DOCUMENT.md` Phase 1.

---

## 8. What this spec is NOT

- Not a build-from-scratch component spec. The substrate exists. Anyone treating this as a greenfield task should stop and re-read the 2026-06-16 entry in `docs/design-system/decisions-log.md`.
- Not a place to invent new visual states. The state machine is `closed | peek | standard | wide`. No 5th state, no "fullscreen-with-rail", no "split". A view needing more than `wide` is a UX-3 violation.
- Not a parent of any modal. Destructive confirmations route to `useConfirm()` + `ConfirmRoot`. Forms that are not destructive route to a SlideOver tab.
- Not a long-lived bottom drawer. `InspectorDrawer`'s bottom-anchored tabs retire in Phase 2; their content is right-side tabs in SlideOver.

---

## 9. Reference reads

- `docs/design-system/decisions-log.md` — 2026-06-16 entry "ContextDrawer → SlideOver Refactor Decision" (binding rationale).
- `docs/engineering-plans/MERCURY-ARCHITECTURE-MANIFESTO.md` §5.2 (extension over replacement) and §4 (migration map row "ContextDrawer").
- `docs/engineering-plans/CPO-AUDIT-REPORT.md` F2 (the finding this spec resolves).
- `src/client/components/ContextDrawer.tsx` (the substrate; read top-to-bottom before touching).
- `src/client/hooks/useDrawerUrlSync.ts` (the URL hook to wrap, not replace).
- `src/client/hooks/useFocusTrap.ts` (the focus trap to preserve).
- `src/client/store/uiStore.ts` — `drawerByView`, `activeDrawerEntityByView`, `lastUsedDrawerStateByView`, `setDrawerState`, `setDrawerTab`, `cycleDrawer`, `toggleDrawer` (all preserved verbatim).
- `src/client/components/drawerTabs/*` (the 19 tab components to register, not rebuild).
