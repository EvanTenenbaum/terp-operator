> ⚠️ **ARCHITECTURE GATE:** This spec must comply with [MERCURY-ARCHITECTURE-MANIFESTO.md](../../MERCURY-ARCHITECTURE-MANIFESTO.md).
> Before filling this out, read §§1–3, §6 of the manifesto.
> **A spec missing the Manifesto Anchoring section is not ready for agent dispatch.**

---

# View Spec: SalesView — Phase 3A Refactoring (Cell Renderer & Hook Extraction)

**Type:** `view`
**Target file:** `src/client/views/SalesView.tsx` (currently 1,986 lines) plus 8 new cell renderer files and 2 new hook files. **No UX change is visible to the operator in Phase 3A.**
**Agent:** `opus-build` (high-risk; the highest-stakes view in TERP)

**Companion brief:** [sales-view-refactor-plan.md](./sales-view-refactor-plan.md) (architecture brief, Claude Opus 4.7, 2026-06-17)
**Master tasks:** T-3A-01 through T-3A-12 ([MASTER-EXECUTION-DOCUMENT.md §3A](../../MASTER-EXECUTION-DOCUMENT.md#phase-3a--salesview-refactoring-12-tasks-3-days))
**Phase 3A definition:** Refactor in place — change nothing visible to the operator. Phase 3B does the layout swap behind a feature flag.

---

## Manifesto Anchoring (DO NOT SKIP)

| Field* | Value |
|--------|-------|
| **UX Rule(s) Served** | None directly — Phase 3A preserves the current (UX-violating) layout intentionally. It removes the architectural debt that *blocks* later UX-1 / UX-3 / UX-5 compliance. UX rules are served when Phase 3B lands the layout swap behind `FEATURE_GRID_VIEW_TEMPLATE` for SalesView. |
| **ARCH Rule(s) Followed** | **ARCH-12** (cell editors as stable components, not inline closures) is the primary rule served. **ARCH-2** (state machines drive action visibility) is partially served by extracting `fulfillmentActionsColumn` to a stable component receiving `cellRendererParams` (full state-machine wiring is Phase 3B). **ARCH-8** (templates render chrome) is *enabled* — extraction is the prerequisite that lets Phase 3B render the line grid inside `PrimaryGridView` without re-implementing cell logic. |
| **Attention Budget Tier** | N/A — Phase 3A is an architecture-only refactor. No surface is added, removed, or re-tiered. Existing tier assignments (which are themselves UX violations) are preserved unchanged. |
| **Old Pattern Replaced** | **§6 anti-pattern: "Per-view inline cell renderers in `useMemo`"** (Manifesto §6 line 472). SalesView has 7 inline `cellRenderer` closures in `lineColumns` / `suggestionColumns` module-scope arrays plus `fulfillmentActionsColumn` as a `useMemo` over `isRunning`, `canWrite`, `runCommand`. These get replaced with stable component exports referenced by `cellRendererParams`. |
| **URL State Encoded** | None new in Phase 3A. Existing `useUiStore` slices (`selectedRows.sales`, `activeCustomerId`, `gridFilter.sales`, `showMargin`, `drawerEntity.sales`, `drawerState.sales`) are preserved byte-identical. URL serialization is Phase 3B (ARCH-6). |
| **Existing Infra Leveraged** | `OperatorGrid` (AG Grid wrapper, unchanged); `useCommandRunner` (already canonical for mutations — every release/recall/confirm still goes through it); `useUiStore` (selectors unchanged); `SalePrePostStrip` + `buildSalePrePostChecks` + `prePostIssuesByLineId` (already extracted to `src/client/components/SalePrePostStrip.tsx` — Phase 3A wraps them in `useSalePrePostChecks`); existing `SalesView.ux-f06.ts` `buildConfirmPayload` (already extracted — Phase 3A verifies + audits, does not re-extract); existing `LandedCostExceptionCellRenderer` from `src/client/components/LandedCostExceptionChip.tsx` (already a stable component — Phase 3A canonicalizes its location and props contract). |
| **Anti-Patterns Avoided** | • **No new components beyond the 8 cell renderers + 2 hooks** (Manifesto §3.A boundary). • **No `WorkspacePanel` removal** — the 10 `WorkspacePanel` mounts in SalesView stay (Phase 3B removes them). • **No `ContextDrawer` → `SlideOver` swap** — drawer system untouched (master doc §12 line 1559: "SalesView refactoring does not touch drawer system"). • **No mode router** (Mode A browsing / Mode B building) — Phase 3B's job. • **No feature flag** — Phase 3A ships pure refactor; no `FEATURE_*` reads added. • **No `FilterPresetStrip → StatusFilterPill` swap** — Phase 3B. • **No cell editor that owns its mutation** — cells stay rendering-only; valueSetters that already write into the row data object (e.g., MarkupCell's price/cost reconciliation) are preserved byte-identical because AG Grid commits via the grid's edit lifecycle, not via the renderer. |
| **Compliance Check** | (1) `rg "cellRenderer:\s*\(params" src/client/views/SalesView.tsx` returns **0 matches** after refactor (down from 7). (2) `rg "useMemo<ColDef" src/client/views/SalesView.tsx` returns **0 matches** for `fulfillmentActionsColumn` (replaced with stable component). (3) All 13 existing `SalesView.*.test.{ts,tsx}` files pass **unchanged** — zero test file modifications are allowed. (4) `pnpm typecheck` passes. (5) Manual smoke: open `/sales`, select a customer with an open draft, edit `markup`, edit `qty`, click "Release", click "Recall" — every interaction produces identical DOM and identical mutation payloads to pre-refactor (verified by network panel diff). (6) `wc -l src/client/views/SalesView.tsx` shows reduction of ~180–240 lines (cells extracted) but the file remains ~1,750 lines — Phase 3A is **not** the line-count win; Phase 3B is. |

---

## 1. Purpose

SalesView is 1,986 lines, 8 simultaneous panels, and the canonical UX-1 violation in TERP. The Mercury retrofit exists largely to fix this view. But it is also TERP's most financially load-bearing surface — every sale, every pricing override, every credit/referee accrual, every pick release flows through it. A failed refactor here is a money bug.

Phase 3A is the hard gate that makes the eventual Phase 3B layout swap safe. It extracts the 7 inline cell renderers and 1 `useMemo` action column into stable components, and the 3 view-local data derivations into testable hooks. **It changes nothing visible to the operator.** The output is a SalesView that renders identically, mutates identically, and tests identically — but no longer carries the inline-closure debt that makes Phase 3B's layout reshape unsafe.

> **Master doc §13 risk map line 1582:**
> *"SalesView breaks → Blocker → Phase 3A tests fail → HARD GATE: do not proceed to 3B. Reassess cell renderer extraction strategy."*

## 2. API Contract

### 2a. Extracted Cell Renderer Components (8 files)

All 8 cells live under `src/client/components/cells/sales/` (one file per cell, named-export only — no default exports). Each is a pure function component matching AG Grid's `ICellRendererParams<GridRow>` contract.

```ts
// src/client/components/cells/sales/DisplayNameCell.tsx
// (T-3A-01) Replaces lineColumns[displayName].cellRenderer (SalesView.tsx:192-204)
export interface DisplayNameCellProps {
  value: unknown;
  data?: GridRow;
}
export function DisplayNameCell(params: DisplayNameCellProps): JSX.Element;

// src/client/components/cells/sales/BatchCodeCell.tsx
// (T-3A-02) Replaces lineColumns[batchCode].cellRenderer (SalesView.tsx:216-221)
// Wraps existing AlreadyInOrderChip from src/client/components/SalePrePostStrip
export interface BatchCodeCellProps {
  value: unknown;
  data?: GridRow & { __dupSource?: boolean };
}
export function BatchCodeCell(params: BatchCodeCellProps): JSX.Element;

// src/client/components/cells/sales/MarkupCell.tsx
// (T-3A-03) Replaces lineColumns[markup].cellRenderer + valueFormatter + valueSetter (SalesView.tsx:228-251)
// MUST preserve valueSetter byte-identical: range-flow vs fixed-flow markup math.
// Exports a renderer for the cell AND a valueSetter the ColDef references.
export interface MarkupCellProps { value: unknown; data?: GridRow; }
export function MarkupCell(params: MarkupCellProps): JSX.Element;
export function markupValueSetter(params: ValueSetterParams<GridRow>): boolean;
export function markupValueFormatter(params: { value: unknown }): string;

// src/client/components/cells/sales/DerivedCogsCell.tsx
// (T-3A-04) Replaces lineColumns[derivedCogs].cellRenderer (SalesView.tsx:277-305)
// Reads __rule from row data (set by useSalesLineRows). DOES NOT recompute
// pricing — the markup/COGS math lives in shared helpers (computeLineMarkup,
// ruleSourceLabel) imported from src/client/views/SalesView.pricing.ts
// (new file extracted from SalesView.tsx:158-182).
export interface DerivedCogsCellProps { data?: GridRow; }
export function DerivedCogsCell(params: DerivedCogsCellProps): JSX.Element | null;

// src/client/components/cells/sales/PickStatusCell.tsx
// (T-3A-05) Replaces lineColumns[pickStatus].cellRenderer (SalesView.tsx:330-332)
// Thin wrapper over existing PickStatusChip component.
export interface PickStatusCellProps { value: unknown; }
export function PickStatusCell(params: PickStatusCellProps): JSX.Element;

// src/client/components/cells/sales/WhyShownCell.tsx
// (T-3A-06) Replaces suggestionColumns[reason].cellRenderer (SalesView.tsx:114-120)
// Uses existing whyShownChips helper from SalesView.columns.ts.
export interface WhyShownCellProps { value: unknown; }
export function WhyShownCell(params: WhyShownCellProps): JSX.Element;

// src/client/components/cells/sales/LandedCostExceptionCell.tsx
// (T-3A-07) Canonicalizes existing LandedCostExceptionCellRenderer from
// src/client/components/LandedCostExceptionChip.tsx. The component already
// exists and is already stable — T-3A-07 standardizes the path, props name,
// and adds a re-export shim at the old import site for back-compat during
// migration. Existing LandedCostExceptionChip.test.tsx stays passing unchanged.
export interface LandedCostExceptionCellProps { data?: GridRow; }
export function LandedCostExceptionCell(params: LandedCostExceptionCellProps): JSX.Element | null;

// src/client/components/cells/sales/FulfillmentActionsCell.tsx
// (T-3A-08) Replaces fulfillmentActionsColumn useMemo (SalesView.tsx:545-605).
// Accepts the runtime dependencies via cellRendererParams instead of capturing
// them in a closure. SalesView passes { canWrite, isRunning, runCommand,
// eligibilityDataRef } via colDef.cellRendererParams; the stable component
// reads them per row.
export interface FulfillmentActionsCellParams {
  canWrite: boolean;
  isRunning: boolean;
  runCommand: (cmd: string, payload: Record<string, unknown>, label: string) => Promise<unknown>;
  // Stable ref so renderer reads latest eligibility without closing over it.
  eligibilityDataRef: React.MutableRefObject<ReleaseEligibilityResult[] | undefined>;
}
export interface FulfillmentActionsCellProps {
  data?: GridRow;
  // AG Grid threads cellRendererParams through here at runtime.
  canWrite: boolean;
  isRunning: boolean;
  runCommand: FulfillmentActionsCellParams['runCommand'];
  eligibilityDataRef: FulfillmentActionsCellParams['eligibilityDataRef'];
}
export function FulfillmentActionsCell(params: FulfillmentActionsCellProps): JSX.Element | null;
```

### 2b. Extracted Hooks (2 files + 1 audit)

```ts
// src/client/views/sales/useSalesLineRows.ts
// (T-3A-09) Extracts lineRowsWithRule useMemo (SalesView.tsx:512-531).
// Pure derivation: order lines + reference data + customerId → enriched rows
// with __rule and __dupSource tags. NO query inside — caller passes data.
export interface UseSalesLineRowsArgs {
  orderLines: GridRow[] | undefined;
  customers: ReadonlyArray<Record<string, unknown>> | undefined;
  defaultPricingRule: unknown;
  customerId: string;
}
export function useSalesLineRows(args: UseSalesLineRowsArgs): GridRow[];

// src/client/views/sales/useSalePrePostChecks.ts
// (T-3A-10) Extracts prePostChecks + prePostLineIssues useMemos
// (SalesView.tsx:687-696). Returns both shapes the view consumes.
export interface UseSalePrePostChecksArgs {
  selectedOrder: GridRow | null | undefined;
  customer: { balance: number; creditLimit: number } | null | undefined;
  lines: SalePrePostLine[];
}
export interface UseSalePrePostChecksResult {
  checks: SalePrePostCheck[];
  issuesByLineId: ReturnType<typeof prePostIssuesByLineId>;
}
export function useSalePrePostChecks(args: UseSalePrePostChecksArgs): UseSalePrePostChecksResult;

// T-3A-11: buildConfirmPayload ALREADY EXISTS at
// src/client/views/SalesView.ux-f06.ts (lines 41-51) with full unit test
// coverage at SalesView.ux-f06.test.tsx. Phase 3A task is an AUDIT, not a
// re-extraction:
//   (a) Confirm the export is named and pure (it is — verified 2026-06-17).
//   (b) Confirm no view-state closure exists (it does not).
//   (c) Add a doc-comment cross-link to entity-schemas.ts (forthcoming Phase
//       3B) noting this helper will be the reference implementation for
//       confirmSalesOrder payload construction.
//   (d) If Phase 3A discovers buildConfirmPayload is called from anywhere
//       except SalesView.tsx:1023 and its test file, document the call site
//       in this spec and DO NOT change the signature.
```

### 2c. Pricing Math Module (supporting extraction)

```ts
// src/client/views/sales/salesPricing.ts (NEW)
// Extracted from SalesView.tsx:158-182 (asRule, ruleSourceLabel,
// computeLineMarkup) so cell renderers and the useSalesLineRows hook share
// one implementation. NOT one of the 12 numbered tasks — this is the
// minimum supporting extraction T-3A-03 and T-3A-04 depend on.
export function asRule(value: unknown): CustomerPricingRule;
export function ruleSourceLabel(source: string, category?: string): string;
export function computeLineMarkup(
  row: GridRow,
  rule: ReturnType<typeof resolvePricingRuleEntry>
): { markupDollars: number; derivedCogs: number; isRange: boolean; rangeLow?: number; rangeHigh?: number };
```

### 2d. Data Sources

**Unchanged from current SalesView.** Every query stays exactly where it is, with the same gating. Phase 3A is a render-layer refactor; the data fetch graph is preserved byte-identical.

| Query / Mutation | When Issued | Gate | Change in 3A? |
|-----------------|-------------|------|---------------|
| `trpc.queries.grid({ view: 'sales' })` | on mount | enabled: always | No |
| `trpc.queries.reference()` | on mount | staleTime 60s | No |
| `trpc.queries.customerWorkspace({ customerId })` | customer selected | enabled: `Boolean(customerId)` | No |
| `trpc.queries.salesOrderLines({ orderId })` | order selected | enabled: `Boolean(selectedOrder?.id)` | No |
| `trpc.queries.releaseEligibility({ orderId })` | order selected | enabled: `Boolean(selectedOrder?.id)` | No |
| `trpc.credit.customerCreditStatus({ customerId })` | customer + role gate | enabled: customer && (manager\|owner) | No |
| `trpc.queries.customerPurchaseHistory({ customerId })` | customer selected | staleTime 60s | No |
| `trpc.queries.salesSuggestions({ customerId, ... })` | always | — | No |
| `trpc.queries.recentCustomerSheets({ customerId })` | customer selected | enabled gate | No |
| `useCommandRunner.runCommand(...)` for all mutations | on operator action | — | No — but `releaseLineForPicking` / `recallLineForPicking` are now called from `FulfillmentActionsCell` via `cellRendererParams` instead of a `useMemo` closure |

### 2e. Events / Callbacks

`FulfillmentActionsCell` is the only extracted cell that performs side effects. Its callback contract is:

```ts
// Inside FulfillmentActionsCell, on button click:
runCommand('releaseLineForPicking', { lineId: row.id }, 'Release line for picking');
runCommand('recallLineFromPicking', { lineId: row.id }, 'Recall line from picking');
```

Both calls must remain byte-identical to the current `SalesView.tsx` implementation (lines 577 and 597) — same command name, same payload shape, same human label. Reviewers verify by recording the network panel before and after the refactor and diffing the mutation payload bodies.

## 3. States

Every state in current SalesView is preserved exactly. Phase 3A does not add, remove, or alter any state. The cell renderer extraction is invisible to operators.

| State | Trigger | Visual | Data Behavior | Change in 3A? |
|-------|---------|--------|---------------|---------------|
| **Loading** | initial mount, refetch on socket event | existing skeleton from `OperatorGrid` | existing query loading state | No |
| **Empty** | customer has no draft order | existing inline "No active sale" pane | no rows | No |
| **Error** | query/mutation failure | existing `pushToast` error toast | error preserved in `useCommandRunner` state | No |
| **Partial** | bulk operation with mixed results | existing per-row success/failure marks | per-row state preserved | No |
| **Success** | mutation committed | existing `pushToast` success | grid refetch via `refetchInterval: 30_000` or socket | No |
| **Edge: released line edit** | operator edits qty/field on a released line | existing warehouse-alert dialog with focus trap (`useFocusTrap`, `setPendingLineEdit`) | confirmation gates the actual mutation | No |
| **Edge: customer changes** | `customerId` updates | existing `setGridFilter('sales', '')` + `setValidationFocusIds([])` + `setRefereeRelationshipId('')` | session reset preserved | No |
| **Edge: order has duplicate source** | `duplicateSourceLineIds` returns non-empty set | existing `AlreadyInOrderChip` rendered in `BatchCodeCell` | row data carries `__dupSource: true` | No — `BatchCodeCell` reads the same flag the inline closure read |
| **Edge: COGS range exception** | `landedCostExceptionReason` is set | existing `LandedCostExceptionCellRenderer` chip | row data unchanged | No — `LandedCostExceptionCell` is the same component, canonicalized path |
| **Edge: released line cell editor lock** | `RELEASED_PICK_STATUSES.has(row.pickStatus)` | existing AG Grid `editable: false` enforcement via `isRowEditLocked` | unchanged | No |

## 4. Keyboard & Accessibility

Phase 3A makes **no a11y change**. AG Grid's keyboard model and ARIA roles are untouched. Every extracted cell renderer must render the **same DOM** as the inline closure it replaces — verified by snapshot testing if existing tests cover it, by manual DOM inspection otherwise.

| Element | Role | Label | Keyboard | Change in 3A? |
|---------|------|-------|----------|---------------|
| `OperatorGrid` (sales orders) | grid | "Sales orders" (existing) | Arrow keys, Enter to edit, Tab to next cell | No |
| `OperatorGrid` (sale lines) | grid | "Sale lines" (existing) | Arrow keys, Enter, Tab | No |
| `MarkupCell` editor | textbox (AG Grid default) | inherits column header | Enter commits, Esc cancels | No — AG Grid handles |
| `FulfillmentActionsCell` "Release" / "Recall" buttons | button | "Release" / "Recall" text | Enter/Space activate (existing) | No |
| `BatchCodeCell` "Already in order" chip | (decorative span) | (visually communicated) | not focusable | No |
| `PickStatusCell` chip | (decorative span via `PickStatusChip`) | status text | not focusable | No |
| Warehouse-alert dialog | dialog | existing `useFocusTrap` traps focus | Esc closes; trapped Tab cycle | No |

### Focus Order

Unchanged. Existing focus order through filter strip → orders grid → customer context header → lines grid → exception controls (when validation focus is set) → workspace panels is preserved.

### Screen Reader Summary

Unchanged. Screen reader users land on the existing view structure exactly as today.

## 5. Acceptance Criteria

One AC per master-doc task, each independently verifiable. **All 13 existing `SalesView.*.test.{ts,tsx}` files must pass unchanged after every checked AC.**

- [ ] **AC-1 (T-3A-01) — DisplayNameCell extracted.** File `src/client/components/cells/sales/DisplayNameCell.tsx` exists with named export `DisplayNameCell`. `lineColumns` in `SalesView.tsx` references it via `cellRenderer: DisplayNameCell` instead of an inline closure. `pnpm typecheck` passes. The chartreuse `●` alias dot still renders for rows where `itemAlias` is truthy, with the same `title="Product name (market alias)"`, color `#eab308`, and `marginRight: 4` — verified by DOM inspection on `/sales` with a draft order containing an aliased line.

- [ ] **AC-2 (T-3A-02) — BatchCodeCell extracted.** File `src/client/components/cells/sales/BatchCodeCell.tsx` exists with named export `BatchCodeCell`. `lineColumns[batchCode]` references it. The `AlreadyInOrderChip` import path inside the new file is `../../SalePrePostStrip` (preserves the existing component — does NOT re-implement). For a draft order that contains two lines from the same source batch, both rows render the chip; for a draft with unique sources, no chip renders. Snapshot of the cell DOM matches pre-refactor byte-for-byte.

- [ ] **AC-3 (T-3A-03) — MarkupCell extracted (renderer + valueFormatter + valueSetter).** File `src/client/components/cells/sales/MarkupCell.tsx` exports `MarkupCell`, `markupValueSetter`, `markupValueFormatter`. The range-flow vs fixed-flow math in `markupValueSetter` is preserved byte-identical to `SalesView.tsx:235-250`:
  - Range row: `row.markup = newMarkup` (price unchanged; `derivedCogs = unitPrice - markup`).
  - Fixed row: `row.unitPrice = unitCost + newMarkup; row.markup = newMarkup`.
  Existing `SalesView.pricing.test.tsx` cases must pass unchanged. Manual: open a draft with one fixed-priced line and one range-priced line; edit markup on each; verify both update the way they did pre-refactor.

- [ ] **AC-4 (T-3A-04) — DerivedCogsCell extracted.** File `src/client/components/cells/sales/DerivedCogsCell.tsx` exports `DerivedCogsCell`. The rule-source label, the in-range vs above/below indicator (`✓` / `↓ below` / `↑ above`), and the "Set price first" empty-state for range lines without a price are all preserved. The pricing helpers (`computeLineMarkup`, `ruleSourceLabel`, `asRule`) move to `src/client/views/sales/salesPricing.ts` and are imported from there by both `DerivedCogsCell` and `useSalesLineRows`. Existing `SalesView.pricing.test.tsx` passes unchanged.

- [ ] **AC-5 (T-3A-05) — PickStatusCell extracted.** File `src/client/components/cells/sales/PickStatusCell.tsx` exports `PickStatusCell`. It is a thin wrapper that renders `<PickStatusChip status={String(value ?? 'unreleased')} />`. The fallback to `'unreleased'` is preserved (verified against `SalesView.tsx:331`).

- [ ] **AC-6 (T-3A-06) — WhyShownCell extracted.** File `src/client/components/cells/sales/WhyShownCell.tsx` exports `WhyShownCell`. It renders `whyShownChips(params.value)` as `finder-chip` spans inside an inline-flex container. The `display: 'inline-flex', flexWrap: 'wrap', gap: 4` style is preserved (verified against `SalesView.tsx:115-120`). `suggestionColumns[reason]` references it. Existing `SalesView.ux-f11.test.ts` passes unchanged.

- [ ] **AC-7 (T-3A-07) — LandedCostExceptionCell canonicalized.** File `src/client/components/cells/sales/LandedCostExceptionCell.tsx` exports `LandedCostExceptionCell`. The existing `LandedCostExceptionCellRenderer` from `src/client/components/LandedCostExceptionChip.tsx` continues to exist as a re-export shim (`export { LandedCostExceptionCell as LandedCostExceptionCellRenderer } from './cells/sales/LandedCostExceptionCell'`) so the existing `LandedCostExceptionChip.test.tsx` still imports successfully without modification. `lineColumns[landedCostExceptionReason].cellRenderer` references the new canonical name. The badge styling (`.selection-pill.warning`) is unchanged.

- [ ] **AC-8 (T-3A-08) — FulfillmentActionsCell extracted + fulfillmentActionsColumn stabilized.** File `src/client/components/cells/sales/FulfillmentActionsCell.tsx` exports `FulfillmentActionsCell`. The `fulfillmentActionsColumn` `useMemo` in `SalesView.tsx:545-605` is replaced by a **module-scope `ColDef` constant** plus `cellRendererParams` passed at the AG Grid mount site:
  ```ts
  // Module scope:
  const fulfillmentActionsColumnDef: ColDef<GridRow> = {
    headerName: 'Pick', colId: 'fulfillmentActions', width: 190,
    pinned: 'right', sortable: false, suppressMovable: true,
    cellRenderer: FulfillmentActionsCell,
  };
  // Render site (component scope):
  const lineGridColumnsWithParams = useMemo(() => [...visibleLineColumns, {
    ...fulfillmentActionsColumnDef,
    cellRendererParams: { canWrite, isRunning, runCommand, eligibilityDataRef }
  }], [visibleLineColumns, canWrite, isRunning, runCommand]);
  ```
  The runtime behavior — Queued / Packed pills, conditional Release button (active when `eligibility?.eligible`, disabled with reason `title` when `eligibility` exists but not eligible, absent when already released or no eligibility), Recall button for queued/packed rows — is preserved byte-identical. `eligibilityDataRef` is read via `.current` inside the cell (same pattern as today, just relocated). The TER-1671 stable-identity fix is preserved: AG Grid receives a stable column reference except when `canWrite` / `isRunning` change.

- [ ] **AC-9 (T-3A-09) — useSalesLineRows hook extracted.** File `src/client/views/sales/useSalesLineRows.ts` exports `useSalesLineRows`. SalesView replaces lines 512-531 with a single `const lineRowsWithRule = useSalesLineRows({ orderLines: orderLines.data, customers: reference.data?.customers, defaultPricingRule: reference.data?.defaultPricingRule, customerId })` call. The hook is unit-tested for: (a) empty `orderLines` returns `[]`; (b) `__rule` and `markup` are populated from `resolvePricingRuleEntry` + `computeLineMarkup`; (c) `__dupSource` is true on rows whose source key appears more than once. New test file at `src/client/views/sales/useSalesLineRows.test.ts`.

- [ ] **AC-10 (T-3A-10) — useSalePrePostChecks hook extracted.** File `src/client/views/sales/useSalePrePostChecks.ts` exports `useSalePrePostChecks`. SalesView replaces lines 687-696 with a single `const { checks: prePostChecks, issuesByLineId: prePostLineIssues } = useSalePrePostChecks({ selectedOrder, customer: workspace.data?.customer, lines: lineRowsWithRule })` call. Empty / missing-customer / missing-order paths short-circuit to `{ checks: [], issuesByLineId: new Map() }` — verified by unit test. New test file at `src/client/views/sales/useSalePrePostChecks.test.ts`.

- [ ] **AC-11 (T-3A-11) — buildConfirmPayload audited.** `buildConfirmPayload` at `src/client/views/SalesView.ux-f06.ts:41-51` is verified to already satisfy the Phase 3A contract: pure function, no view-state closure, fully tested at `SalesView.ux-f06.test.tsx`. No code change required — the audit confirms it and adds a doc-comment cross-link pointing forward to Phase 3B `entity-actions.ts` as the eventual canonical location. A search confirms exactly two call sites (`SalesView.tsx:1023` and `SalesView.ux-f06.test.tsx`) — any additional caller surfaced by the audit is documented here before close.

- [ ] **AC-12 (T-3A-12) — Validation gate (HARD GATE).** All 13 existing `SalesView.*.test.{ts,tsx}` files pass unchanged:
  - `SalesView.csvExport.test.ts`
  - `SalesView.customerScope.test.ts`
  - `SalesView.emptyState.test.ts`
  - `SalesView.marginToggle.test.tsx`
  - `SalesView.orderPrimary.test.ts`
  - `SalesView.pricing.test.tsx`
  - `SalesView.ux-d04.test.tsx`
  - `SalesView.ux-f01.test.ts`
  - `SalesView.ux-f03.test.tsx`
  - `SalesView.ux-f06.test.tsx`
  - `SalesView.ux-f11.test.ts`
  - `SalesView.ux-g03.test.ts`
  - `LandedCostExceptionChip.test.tsx`

  Plus the two new hook test files (AC-9, AC-10). Plus `pnpm typecheck`. Plus a manual smoke pass on `/sales`:
  1. Select a customer with an open draft.
  2. Verify lines render (DisplayNameCell, BatchCodeCell, MarkupCell, DerivedCogsCell, PickStatusCell, LandedCostExceptionCell all visible).
  3. Edit `markup` on a fixed-priced line; verify `unitPrice` updates to `unitCost + markup` immediately in the grid.
  4. Edit `markup` on a range-priced line; verify `unitPrice` does NOT change and `derivedCogs` updates.
  5. Open a draft with two lines from the same source batch; verify "Already in order" chip on both rows.
  6. Click "Release" on an eligible line; network panel shows `releaseLineForPicking({ lineId })` — payload byte-identical to pre-refactor.
  7. Click "Recall" on a released line; network panel shows `recallLineFromPicking({ lineId })`.
  8. Open Suggestions; verify "Why shown" chips render.
  9. Confirm an order; network panel shows `confirmSalesOrder` payload byte-identical to pre-refactor.

  If any test fails, any DOM diff, or any mutation payload diff is observed → **HARD GATE: do not proceed to Phase 3B.** Reassess extraction strategy per master doc §13.

## 6. Dependencies

| Dependency | Status | Blocker? |
|-----------|--------|----------|
| `OperatorGrid` (AG Grid wrapper) | EXISTS | No — unchanged |
| `useCommandRunner` | EXISTS | No — unchanged |
| `useUiStore` slices (`selectedRows.sales`, `activeCustomerId`, `gridFilter.sales`, `showMargin`, `drawerEntity.sales`, `drawerState.sales`, `pushToast`) | EXISTS | No — unchanged |
| `SalePrePostStrip` + `buildSalePrePostChecks` + `prePostIssuesByLineId` + `duplicateSourceLineIds` + `AlreadyInOrderChip` (at `src/client/components/SalePrePostStrip.tsx`) | EXISTS | No — `useSalePrePostChecks` wraps these |
| `LandedCostExceptionCellRenderer` (at `src/client/components/LandedCostExceptionChip.tsx`) | EXISTS | No — Phase 3A canonicalizes the path and adds a re-export shim |
| `PickStatusChip` | EXISTS | No |
| `whyShownChips` helper (in `SalesView.columns.ts`) | EXISTS | No |
| `resolvePricingRuleEntry`, `applyPricingRule`, `markupDollarsFromPrice`, `parsePriceRange` (in `src/shared/inventoryPricingShared.ts` / `priceRange.ts`) | EXISTS | No — pricing math stays in shared |
| `buildConfirmPayload` (at `SalesView.ux-f06.ts`) | EXISTS | No — audit only |
| Phase 0 components (`FilterToolbar`, `BulkActionBar`, `DetailSlideover`, `ComboboxCellEditor`, etc.) | NOT REQUIRED | No — Phase 3A does not touch chrome |
| Phase 0 entity infra (`entity-schemas.ts`, `entity-actions.ts`, `view-registry.ts`) | NOT REQUIRED | No — Phase 3A does not migrate to schema-driven columns; Phase 3B does |
| Feature flag `FEATURE_GRID_VIEW_TEMPLATE` for SalesView | NOT REQUIRED | No — Phase 3A ships without a flag; Phase 3B flips it |

## 7. Risk Notes

Phase 3A is mechanically simple but financially load-bearing. The risk surface is real even though the visible surface is unchanged.

- **Financial math regression in MarkupCell `valueSetter`.** The range-flow vs fixed-flow branching at `SalesView.tsx:235-250` is the most failure-prone extraction. A copy that flips the branches, drops `Number.isFinite`, or loses the `Math.max(0, ...)` floor in `computeLineMarkup` will silently miscalculate margin and either over- or under-charge customers. **Mitigation:** the existing `SalesView.pricing.test.tsx` covers both branches; AC-12 requires it to pass unchanged. Reviewer must verify the `valueSetter` body is byte-identical to the original by side-by-side diff before sign-off.

- **`fulfillmentActionsColumn` identity churn re-introducing the AG Grid bug TER-1671 was fixed to prevent.** The current `useMemo` deps are `[isRunning, canWrite, runCommand]`. The Phase 3A replacement uses `cellRendererParams` containing those same values. AG Grid is sensitive to column object identity for cell-edit state; if `cellRendererParams` causes per-render column-object rebuild, edits in the lines grid will visibly reset mid-typing. **Mitigation:** the new `lineGridColumnsWithParams` `useMemo` has the same deps `[visibleLineColumns, canWrite, isRunning, runCommand]` and `eligibilityDataRef` is a stable ref (never a dep). Reviewer must verify the deps array on the replacement memo matches.

- **Test file imports breaking on cell-renderer path change.** Tests in `SalesView.pricing.test.tsx`, `SalesView.ux-f11.test.ts`, `LandedCostExceptionChip.test.tsx`, and others may transitively import the renderers or their helper math. The hard rule "tests pass unchanged" demands the public import surface stays available: (a) `LandedCostExceptionCellRenderer` re-export shim from `LandedCostExceptionChip.tsx`; (b) `whyShownChips` remains exported from `SalesView.columns.ts`; (c) `buildSalePrePostChecks`, `prePostIssuesByLineId`, `duplicateSourceLineIds`, `AlreadyInOrderChip` remain exported from `SalePrePostStrip.tsx`. **Mitigation:** before deleting any inline code, the agent runs `rg "import .* from .*SalesView" --type ts --type tsx src/` and `rg "import .* from .*LandedCostExceptionChip"` to enumerate consumers and audit each one.

- **`__rule` and `__dupSource` row-data tags drift.** `DerivedCogsCell` reads `row.__rule` (set by the existing `lineRowsWithRule` memo). After extraction to `useSalesLineRows`, the tag must be set on the same shape with the same key name. Renaming or restructuring breaks the cell silently — it would render the "no rule" fallback instead of the labeled rule, and pricing override hints disappear. **Mitigation:** `useSalesLineRows` returns rows tagged with the exact same keys (`__rule`, `__dupSource`, `markup`); the cell renderer reads them by the same names. Snapshot the row data shape pre- and post-refactor with one row's data logged to console and diff.

- **`releaseEligibility` ref read inside `FulfillmentActionsCell`.** The cell reads `eligibilityDataRef.current` per render. If the ref is replaced (new ref each render) instead of mutated (`.current = ...`), the cell sees stale data and the Release button enable/disable state lags. **Mitigation:** SalesView creates `eligibilityDataRef` once with `useRef`, mutates `.current` in a render-time assignment (current pattern at `SalesView.tsx:542-543`), and passes the **same ref** through `cellRendererParams`. The cell must not destructure `eligibilityDataRef.current` at param time; it must read `.current` inside the render body.

- **Phase 3A line-count expectation drift.** Master doc target is "~400 lines" for SalesView — that is the Phase 3B target, not Phase 3A. Phase 3A removes ~180–240 lines (the 7 inline closures + 1 useMemo body + pricing helpers). The reviewer must not reject Phase 3A for failing to hit 400 lines; that is Phase 3B's gate.

- **Scope creep into Phase 3B.** The temptation to "while we're in there" remove a `WorkspacePanel`, swap `FilterPresetStrip` for `StatusFilterPill`, or pre-stage the mode router is the single biggest threat to the hard gate. **Mitigation:** the AC list is the contract. Anything not in AC-1 through AC-12 is out of scope and triggers PR-revision feedback, not merge.

## 8. What NOT to Do in Phase 3A (Phase 3B Boundary)

Every item below is **explicitly forbidden in Phase 3A** and is Phase 3B's job. Touching any of these in a Phase 3A PR triggers immediate revision request.

- ❌ **No layout change.** The 8 simultaneous panels stay. The Sale Builder still renders draft lines below the orders grid, suggestions still render below that, customer purchase history still renders below that.
- ❌ **No Mode A / Mode B router.** The "browsing vs building" split from the architecture brief is Phase 3B.
- ❌ **No `ContextDrawer` → `DetailSlideover` swap.** The current drawer stays. Master doc §12 line 1559: *"SalesView refactoring does not touch drawer system."*
- ❌ **No sticky customer context header.** Phase 3B work (UX-7).
- ❌ **No feature flag.** Phase 3A ships unguarded because nothing about the view's behavior changes.
- ❌ **No `WorkspacePanel` removal.** All 10 mounts stay exactly where they are.
- ❌ **No `FilterPresetStrip` → `StatusFilterPill` swap.** Phase 3B.
- ❌ **No `StatusActionBar` → `BulkActionBar` swap.** Phase 3B.
- ❌ **No `SalePrePostStrip` removal or conditional re-mount.** It still renders the "All checks passed" panel — yes, that is UX-5's named anti-example; Phase 3A is not the place to fix it. Phase 3B does.
- ❌ **No URL state encoding.** ARCH-6 compliance is Phase 3B.
- ❌ **No entity-schema migration.** `lineColumns` / `suggestionColumns` / `orderColumns` stay as module-scope `ColDef[]` arrays in `SalesView.tsx` — Phase 3A only swaps the `cellRenderer` references inside them, it does not move them to `entity-schemas.ts`.
- ❌ **No new components beyond the 8 named cells.** No "while we're in there" extraction of `CustomerContextHeader`, `SalePrimaryPane`, `SaleBuilderPane`, etc. — those are Phase 3B's job.
- ❌ **No new hooks beyond the 2 named hooks.** Even if other `useMemo` chains in SalesView would benefit, Phase 3A's surface is `useSalesLineRows` + `useSalePrePostChecks` only.
- ❌ **No test file edits.** Existing tests must pass unchanged. New tests for new hooks are additive only.
- ❌ **No `useUiStore` slice additions or renames.**
- ❌ **No `commandBus` changes.**

## 9. Verification

Phase 3A's verification is "the same product, mechanically".

**Local (Mac mini) — per-task fast path:**
```bash
pnpm typecheck
pnpm vitest run src/client/views/sales/useSalesLineRows.test.ts
pnpm vitest run src/client/views/sales/useSalePrePostChecks.test.ts
pnpm vitest run src/client/views/SalesView.pricing.test.tsx
pnpm vitest run src/client/views/SalesView.ux-f11.test.ts
pnpm vitest run src/client/components/LandedCostExceptionChip.test.tsx
```

**Fast runner — full SalesView test sweep (HARD GATE, T-3A-12):**
```bash
fast-runner exec terp-operator -- pnpm typecheck && \
  pnpm vitest run 'src/client/views/SalesView.*.test.*' \
                  'src/client/views/sales/*.test.*' \
                  'src/client/components/LandedCostExceptionChip.test.tsx'
```

**Manual smoke (HARD GATE — required for T-3A-12 close):**
Run the live persona QA flow against the refactored branch. Specifically the **`sales-operator`** persona flows: open a draft, edit markup, confirm an order, release a line, recall a line. Compare network-panel mutation payloads frame-for-frame against the pre-refactor `main` branch. Any diff in command name, payload body, or mutation order fails the gate.

```bash
fast-runner exec --base origin/main --branch "fast-runner/qa-3a-$(date +%Y%m%dT%H%M%S)" \
  terp-operator -- QA_BRANCH=<your-3a-branch> pnpm qa:env:setup
# Then run the sales-operator persona flows per docs/qa/persona-flows/REGISTRY.md
```

**Cross-model review:** Because the financial-math extraction (`MarkupCell.valueSetter`) is the highest-risk slice and the SalesView refactor is gated as T3 (money/credit per the architecture brief), the AC-12 close MUST include a second-model review. Route via the `cross-reviewer` agent on GPT-5.5 with the diff scoped to `MarkupCell.tsx`, `DerivedCogsCell.tsx`, `useSalesLineRows.ts`, and `salesPricing.ts`. Do not stack additional reviewers by default — see the global QA Tiers policy.

---

## Agent Notes

- **Read the architecture brief first** ([sales-view-refactor-plan.md](./sales-view-refactor-plan.md)) so the Phase 3A / 3B boundary is clear. The brief is intentionally short; this spec carries the implementation detail.

- **`buildConfirmPayload` already exists.** T-3A-11 is an audit, not an extraction. Do not re-extract it. Do not move it. Do not change its signature. Verify it is pure (it is), verify the two call sites (`SalesView.tsx:1023` and the test file), and add a forward-looking doc comment.

- **`LandedCostExceptionCellRenderer` already exists** at `src/client/components/LandedCostExceptionChip.tsx`. T-3A-07 canonicalizes the location and props name; it does NOT re-implement the cell. Keep the re-export shim so `LandedCostExceptionChip.test.tsx` continues to import the symbol it imports today.

- **Pricing math is the highest-risk extraction.** When extracting `computeLineMarkup`, `ruleSourceLabel`, and `asRule` to `src/client/views/sales/salesPricing.ts`, do not refactor them. Move them byte-identical. Side-by-side diff before commit. The existing `SalesView.pricing.test.tsx` is the safety net.

- **AG Grid identity sensitivity.** `cellRendererParams` is the supported way to thread runtime values into stable cell components. Do NOT close over runtime values in the cell component itself; the cell must be a module-scope function. Closures defeat the entire point of the extraction.

- **`__rule` and `__dupSource` are private row-data tags.** They are not part of the `GridRow` type. They are added by `useSalesLineRows` (Phase 3A) via spread (`{ ...row, __rule, ... }`) — the same way `lineRowsWithRule` does today. Keep the underscore-prefix convention so it is clear these are not API fields.

- **Tests must pass unchanged.** If a test breaks, the refactor is wrong. Fix the refactor, not the test. The only test file changes Phase 3A makes are **additive** (two new files for the new hooks).

- **Stop at the hard gate.** If T-3A-12 surfaces any test failure, mutation payload diff, DOM diff, or behavior diff, do not push forward into Phase 3B. Open a finding with `gh issue create --label bug` referencing the diff, document the blocker in the closeout, and hand off.

- **Closeout evidence (T3 / Deep QA).** This task is Deep QA per the global gate (money/credit + multi-step workflow). Closeout must include: tier rationale; the full test command list run with results; cross-model review of the pricing extraction; manual smoke screenshots/recordings; mutation payload diff vs `origin/main`; and an explicit statement that no Phase 3B item was touched.
