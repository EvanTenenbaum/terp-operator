# Integration Findings — Stubs, Placement, Test Resilience

**Date:** 2026-06-15  
**Purpose:** Address stubs, unlinked components, brittle tests, action placement problems, and design anti-patterns discovered in the current codebase. These MUST be fixed as part of the Mercury retrofit — they are not separate work.

---

## 0. Design Patterns We REJECT (From Current System)

These patterns are *responsible* for the current poor UX. The Mercury retrofit explicitly replaces them. They must NOT bleed into new code.

| Anti-Pattern | Why It's Bad | Mercury Replacement |
|---|---|---|
| **ContextDrawer with 5 persistent states** | Always-visible drawer fragments attention. Multiple panels compete for space. | DetailSlideover: opens on demand, 3 states + full-page fallback |
| **Per-view StatusActionTable duplication** | Same decision logic repeated in 8+ views. Drifts over time. | Entity state machines: one definition, all views derive actions |
| **Inline cell renderers referencing view state** | Columns re-create on every state change. Performance bug + coupling. | Stable React components with `cellRendererParams` |
| **Multiple WorkspacePanels stacked** | SalesView shows 6 panels simultaneously. Cognitive overload. | Template-based layout: one main surface, context on demand |
| **FilterPresetStrip per view** | Each view defines its own filter presets. Inconsistent. | ViewTabBar + FilterToolbar: shared components, auto-generated from enums |
| **Raw `style` objects in cell renderers** | No design system consistency. Hardcoded colors. | Semantic CSS classes from styles.css |
| **Imperative ColDef arrays per view** | 2000+ lines of duplicated column definitions. | Entity schemas: declarative, one field definition, auto-generated |
| **Selection-bound primary actions only** | No visible "start here" affordance when nothing is selected. | Every view gets a header CTA slot for the zero-selection primary action |
| **Destructive actions without confirmation** | Cancel, delete, void fire immediately. Misclick risk. | All destructive actions require `useConfirm()` or `FormDialog` with `tone: 'danger'` |
| **Redundant expansion + StatusActionBar** | Same commands in two places. Can disagree on disabled state. | Entity state machine → BulkActionBar is the single source. Expansion shows supplementary actions only. |

---

## 1. Action Placement Rubric (Added to Plan)

Every view, template, and new component must follow these rules. Agents building tasks MUST verify placement against this rubric.

### R1: Zero-Selection Primary Action
- Every view must have ONE visible primary action even when nothing is selected.
- This is the operator's "starting affordance" — the most common thing to do on this view.
- Placement: Header CTA slot in the view's template.
- Examples: "New PO" (PurchaseOrdersView), "New Sale" (SalesView when no customer selected), "Verify next" (IntakeView).

### R2: Selection Actions → BulkActionBar Only
- Actions that operate on selected rows live in the BulkActionBar. Nowhere else.
- Row expansion buttons are for *supplementary* per-row actions (preview, quick info), NOT the same commands as the BulkActionBar.
- **Never duplicate** the same command in both row expansion AND BulkActionBar. Pick one.

### R3: Row Expansion ≤4 Buttons
- Row expansion (master/detail) must show ≤4 action buttons. If more actions are needed, group them: show the top 2-3 + a "More ▾" dropdown.
- IntakeView's 6 inline buttons per batch row violate this. Consolidate: Verify (primary), Reject, ••• (More: Add note, Market name, Delete, History).

### R4: Destructive Actions Always Confirmed
- Any action that deletes, cancels, voids, rejects, or irreversibly modifies data MUST use `useConfirm()` (ConfirmRoot) with `tone: 'danger'`.
- **Never** fire `runCommand` for a destructive action without confirmation.
- Currently violated by: `cancelSalesOrder`, `cancelPurchaseOrder` (draft), `removePurchaseOrderLine`, `unallocate` (Payments), `dismissMatchmakingWorkQueueItem`.

### R5: Danger Styling Unified
- All destructive buttons use `tone: 'danger'` → renders `btn-danger` class.
- No inline `style={{ color: '#b42318' }}`. Use the semantic class.
- Icons (Trash2, XCircle) are supplementary cues, not the only destructiveness indicator.

### R6: Contextual Actions Near Target
- Per-row actions must be visible near the row they affect (row expansion, inline cell buttons, right-click context menu).
- Actions must NOT require the operator to select a row, then scroll to a distant panel to act.
- Currently violated by: PaymentsView allocation panel (far below grid), RecoveryView reversal panel (far below grid).

### R7: Discoverable, Not Hidden
- Power-user features (TSV paste, keyboard shortcuts) must have a visible affordance — a subtle hint, a `<kbd>` badge, or a tooltip.
- Hidden features without discoverability are lost features.

---

## 2. Stub Cleanup Tasks (Phase 0 Prerequisites)

These must be resolved BEFORE Phase 1. They are blocking because they represent functionality that either doesn't work or is misleading.

### T-0-C1: Fix CAP-030 Stubs in PickView
- **Files:** `src/client/components/pick/QueueScreen.tsx`, `PickLineScreen.tsx`, `PickListScreen.tsx`
- **Problem:** All three use hardcoded static data instead of `trpc.queries.pickQueue.useQuery()`. Comment says "TODO: depends on CAP-030 backend merge (TER-1498)."
- **Fix:** Wire to real tRPC queries if backend exists. If backend doesn't exist yet, extract stubs into a clearly-named mock module (`pickMockData.ts`) with a comment explaining the dependency. Do NOT ship hardcoded data in production components.
- **Gate:** After fix, PickView should use real queries or a clearly-separated mock module.

### T-0-C2: Fix SalesCommandHistoryTab Stub
- **File:** `src/client/components/drawerTabs/SalesCommandHistoryTab.tsx:87`
- **Problem:** Renders static copy: "Command history coming soon — no commands found for this order."
- **Fix:** Wire to real command history query (`trpc.queries.entityTimeline` or similar). If history truly isn't implemented, show an empty state: "No commands recorded for this order yet" with no "coming soon" language — "coming soon" is a lie.
- **Gate:** Either real data or honest empty state.

### T-0-C3: Fix RefereeCreditsList Disabled Button
- **File:** `src/client/components/RefereeCreditsList.tsx:94,99`
- **Problem:** Payout button disabled with tooltip "Payout command not yet available — tracked CAP-039." Operator sees a button they can never click.
- **Fix:** Hide the button entirely if the command doesn't exist. Show it (and enable it) when CAP-039 lands. A permanently disabled button is UI debt.

### T-0-C4: Remove Dead Backend Procedures
- **Procedures never called from frontend:** `applyBatchFilters` (filters.ts:22), `runCleanup` (media.ts:13), `heartbeat` (subscriptions.ts:21), `customerLastOrderedQty` (queries.ts:2749 — singular version unused, bulk version used)
- **Fix:** Either wire them to frontend consumers (if they're genuinely needed) OR remove them with a comment explaining why they were removed. Dead backend code is a maintenance burden and a security surface.
- **Preference:** Remove unless there's an active plan to use them. If they're for "future use," track the future use in Linear.

### T-0-C5: Fix Merge-Candidates Zero Counter
- **Finding:** `mergeCandidateCount` is queried and shown but `contact_merge_candidates` is never populated (BE-014 deferred).
- **Fix:** Hide the counter until BE-014 ships. A live-looking counter that can never fire is misleading UI.

---

## 3. Test Resilience Strategy (Phase 0 Prerequisites)

### T-0-T1: Replace CSS Class Assertions with Semantic Queries

**Problem:** Tests assert `.toHaveClass('primary-button')`, `.toHaveClass('workspace-panel-focused')`, etc. These break when CSS is refactored even if behavior is unchanged.

**Fix pattern:**
```typescript
// BEFORE (brittle):
expect(button).toHaveClass('primary-button');

// AFTER (resilient):
expect(button).toHaveAttribute('data-testid', 'confirm-action');
// OR use role-based queries:
expect(screen.getByRole('button', { name: 'Confirm' })).toBeInTheDocument();
```

**Affected files:** MediaBatchDrawer.test.tsx, ErrorBoundary.test.tsx, WorkspacePanel.test.tsx, EditCreditLimitModal.test.tsx, and any other test with `.toHaveClass()` for semantic CSS classes.

**Fix:** Add `data-testid` attributes to components for testing (or use `getByRole`/`getByLabelText`). Remove CSS class assertions.

### T-0-T2: Replace DOM Structure Coupling

**Problem:** Tests use `container.firstChild`, `wrapper.children[0].children[2]` — these break on any DOM restructuring.

**Fix pattern:**
```typescript
// BEFORE (brittle):
expect(container.firstChild).toBeNull();

// AFTER (resilient):
expect(screen.queryByRole('alert')).toBeNull();
// OR check for specific content:
expect(screen.queryByText('Error message')).not.toBeInTheDocument();
```

**Affected files:** IntakeView.ux-wave7.test.tsx, ux-s01.a11y.test.tsx, IdentityRibbon.uxb08.test.tsx, CreditQueueHealthWidget.test.tsx, SaleLineExceptionControls.test.tsx.

### T-0-T3: Replace Hardcoded Magic Numbers

**Problem:** Tests use `1850`, `999001`, `11`, `34`, `1500`, `4`, `10`, `1200.00` — these depend on specific seed data or implementation details.

**Fix pattern:**
```typescript
// BEFORE (brittle):
expect(result.total).toBe(4800);

// AFTER (resilient):
// Derive from inputs, not hardcoded:
const expectedTotal = line1.cost * line1.qty + line2.cost * line2.qty;
expect(result.total).toBe(expectedTotal);
// OR use relative assertions:
expect(result.total).toBeGreaterThan(0);
expect(result.total).toBeLessThan(line1.cost * 100); // sanity bound
```

**Affected files:** MobileCatalogView.ux-r03.test.tsx, SalesView.pricing.test.tsx, QuickLedgerGrid.impactPreview.test.tsx, commandBus.partialReceive.test.ts, cap030.integration.test.ts, commandBus.picking.test.ts.

### T-0-T4: Fix Drizzle ORM Mock Coupling

**Problem:** `matchmakingStatus.test.ts` mocks the entire Drizzle chain: `select → from → where → limit`. Any query structure change silently breaks these tests.

**Fix:** Either:
- (a) Use a real test database (in-memory SQLite) instead of mocking Drizzle at all, OR
- (b) Mock at the service layer, not the ORM layer. Create `mockMatchmakingService` that returns test data. Tests assert service behavior, not ORM call chains.

**Preference:** (b) for unit tests, (a) for integration tests.

### T-0-T5: Fix Seed-Data-Dependent E2E Skips

**Problem:** 5 E2E test files have `test.skip(true, ...)` that skip when seed data doesn't match expectations. These tests provide zero protection.

**Fix for each:**
1. **`sales-cost-range-exceptions.spec.ts`** — Either ensure seed data always includes range-priced posted batches, OR write the test to create its own data.
2. **`sales-workspace-layout.spec.ts`** — Same: create the needed inventory in the test setup.
3. **`credit-engine.spec.ts`** — Create customers with known credit state in test setup.
4. **`payment-processor-qa.spec.ts`** — Fix the navigation target or remove the test.
5. **`phase2-inline-expansion-qa.spec.ts`** — 5 skipped test blocks. Either implement them or delete them. Skipped tests that never run are dead weight.

**Rule going forward:** E2E tests must create their own data (via tRPC mutations in `beforeEach`) or use a guaranteed seed. Never `test.skip(true, ...)` — that's a TODO, not a test.

### T-0-T6: Fix or Delete Skipped Unit Tests

**Problem:** `DashboardView.ux-e01-e02-e04.test.tsx:285` has `it.skip(...)`.
**Fix:** Implement the test or delete it with a comment explaining why it can't be tested.

---

## 4. Updated Phase Structure

### Phase 0 — Foundation (Weeks 1-3) — UPDATED

Original 16 tasks + new cleanup tasks:

| Week | Original Tasks | New Cleanup Tasks |
|------|---------------|-------------------|
| 1 | T-0-01 through T-0-04 (ComboboxCellEditor) | T-0-C1 (Fix PickView stubs), T-0-C2 (Fix SalesCommandHistoryTab), T-0-C3 (Fix RefereeCreditsList), T-0-C4 (Remove dead backend procedures), T-0-C5 (Fix merge-candidates counter) |
| 2 | T-0-05 through T-0-12 (Components + schemas) | T-0-T1 through T-0-T3 (Test resilience: CSS, DOM, magic numbers) |
| 3 | T-0-13 through T-0-16 (State machines + registry) | T-0-T4 through T-0-T6 (ORM mocks, E2E skips, skipped unit tests) |

**Phase 0 Gate — UPDATED:**
- [x] All new components have unit tests
- [x] FilterBridge round-trips correctly
- [x] Schema → ColDef factory works
- [x] Tab registry accepts registrations
- [x] **All 5 stub cleanup tasks complete (T-0-C1 through T-0-C5)**
- [x] **All test resilience fixes complete (T-0-T1 through T-0-T6)**
- [x] **No `test.skip` in codebase (except for known tracked blockers with Linear IDs)**
- [x] **No dead backend procedures without frontend consumers**
- [x] Typecheck passes

---

## 5. Action Placement Fixups Per Phase

### Phase 1 (PurchaseOrdersView) — Action Fixes Required

Before completing Phase 1, fix these placement issues found in the audit:

- [ ] **R1:** Add "New PO" button as zero-selection primary action in header CTA slot (already planned in T-1-07, but must be the FIRST visible affordance)
- [ ] **R4:** Add confirmation to `cancelPurchaseOrder` (draft cancel) — wrap in `useConfirm()`
- [ ] **R4:** Add confirmation to `removePurchaseOrderLine` — wrap in `useConfirm()` with `tone: 'danger'`
- [ ] **R3:** Limit PO row expansion to ≤4 buttons: Draft intake, Unfinalize, ••• (Cancel, Record Prepayment)
- [ ] **R3:** Limit PO line expansion to ≤2 buttons: Draft line, Remove line (with confirmation)
- [ ] **R5:** Use `tone: 'danger'` on `Remove line` and `Cancel draft PO` — not secondary-button styling

### Phase 3B (SalesView) — Action Fixes Required

- [ ] **R1:** Add "New Sale" button as zero-selection primary action (visible when no customer selected)
- [ ] **R4:** Add confirmation to `cancelSalesOrder` — wrap in `useConfirm()` with `tone: 'danger'`
- [ ] **R3:** Limit line expansion to ≤4 buttons: group into primary set + "More ▾"
  - Primary: Release/Recall (context-dependent), Pack, Post inv
  - More ▾: Pay F-up, Remove (danger), Exception controls
- [ ] **R3:** Remove `Confirm order` from row expansion (keep in BulkActionBar only — avoid duplication per R2)
- [ ] **R5:** Use `tone: 'danger'` on `Remove line` in line expansion

### Phase 3C (IntakeView) — Action Fixes Required

- [ ] **R3:** Reduce batch row Actions column from 6 buttons to ≤4: Verify (primary), Reject, ••• (Add note, Market name, Delete, History)
- [ ] **R5:** Use `tone: 'danger'` on `Delete` button — not inline style override
- [ ] **R6:** Move selection totals strip closer to the grid (it's already above — good)
- [ ] **Discovery:** Add `<kbd>` badges for TSV paste and keyboard shortcuts in a subtle footer or tooltip

### Phase 2 (PaymentsView) — Action Fixes Required

- [ ] **R4:** Add confirmation to `unallocate` — wrap in `useConfirm()` with `tone: 'warning'` (financial)
- [ ] **R4:** Add confirmation to `applyDiscount` — same
- [ ] **R6:** Move allocation panel closer to the selected row, or render allocation controls in slide-over instead of distant panel below grid

### Phase 2 (InventoryView) — Action Fixes Required

- [ ] **R3:** The "Row actions" band with ~15 controls needs grouping. Section it: Quantity, Status/Location, Ownership, Tags — with visual dividers.
- [ ] **R4:** Add confirmation to `Apply tags` — it currently replaces all tags immediately with no confirmation.

---

## 6. Design Constraints That MUST Be Preserved

These are from the design decisions log. They represent hard-won lessons. The Mercury retrofit MUST respect them.

| # | Constraint | Source |
|---|-----------|--------|
| C1 | All mutations via `useCommandRunner.runCommand()` — never raw `trpc.*.useMutation` | `decisions-log.md` 2026-05-18 |
| C2 | One Zustand store (`useUiStore`) with `persist` + `immer` | `decisions-log.md` 2026-05-18 |
| C3 | Hybrid Tailwind + semantic CSS classes via `@apply` in `styles.css` | `INDEX.md` |
| C4 | Green = chrome/interactive. Blue = status semantics. No new colors without decision-log entry. | `decisions-log.md` 2026-05-25, 2026-06-11 |
| C5 | `APP_LOCALE` single source of truth. ESLint fails on bare `toLocale*()` | `decisions-log.md` 2026-06-12 |
| C6 | Real status values from `schema.ts` + `commandBus.ts` — never from spec §10 | `ux-audit-2026-06-12.md` |
| C7 | `useConfirm()` for all confirmations — never `window.confirm()` | `decisions-log.md` 2026-06-12 |
| C8 | `FormDialog` for one-shot entry. `WorkspacePanel` for repeated work tools. | `decisions-log.md` 2026-06-11 |
| C9 | `audit:form-ids` fails build on unlabeled controls | `decisions-log.md` 2026-06-12 |
| C10 | Focus traps on all new drawers/modals | `decisions-log.md` 2026-05-26 |
| C11 | Entity UUIDs must NOT persist in `uiStore` `partialize` | `decisions-log.md` 2026-06-12 |
| C12 | AG Grid on desktop only — mobile uses Tailwind card/list layouts | `decisions-log.md` 2026-05-24 |
| C13 | Booleans never render as "true"/"false" text | `decisions-log.md` 2026-06-12 |
| C14 | Empty states name the producing verb + surface | `decisions-log.md` 2026-06-12 |
| C15 | Disabled controls carry `title` tooltip explaining why | `decisions-log.md` 2026-06-12 |

---

## 7. What We REJECT from Current Design

These are patterns from the current system that the Mercury retrofit explicitly replaces. They must not reappear.

| Rejected Pattern | Why | Replacement |
|-----------------|-----|-------------|
| Multiple WorkspacePanels stacked | SalesView had 6 panels. Cognitive overload. | Template-based layout: one surface at a time |
| Inline cell renderers with `useMemo` depending on view state | Columns re-create every render. Performance bug. | Stable React components with `cellRendererParams` |
| Per-view column arrays (ColDef[]) | 2000+ lines duplicated. Inconsistent editors. | Entity schemas → auto-generated ColDefs |
| Per-view StatusActionTable | 8+ duplicates. Status vocabularies drift from DB. | Entity state machines from `schema.ts` |
| `style={{ color: '#b42318' }}` in cell renderers | No design system. Inconsistent danger styling. | Semantic CSS classes |
| `test.skip(true, ...)` in E2E tests | Dead tests. Zero protection. | Create test data in setup or delete test |
| Drizzle ORM chain mocking | Tests break on query refactoring. | Mock at service layer or use real test DB |
| Hardcoded magic numbers in tests | Tests break on seed data changes. | Derive from inputs or use relative assertions |
| Permanently disabled buttons ("coming soon") | Operator sees a button they can never click. | Hide until implemented |
| Dead backend procedures | Security surface. Maintenance burden. | Remove or wire to consumers |
| Counters for unimplemented features | Merge-candidates shows 0 forever. Misleading. | Hide until backend ships |
