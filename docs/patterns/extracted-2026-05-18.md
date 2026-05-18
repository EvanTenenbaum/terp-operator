# Pattern Extraction: May 13–18, 2026

> Auto-extracted analysis to seed the agent-orientation & design-system docs. Evidence pulled from git history (last 5 days), GitHub issues/PRs, and `src/client/` code mining via `ripgrep`. Re-run by following Tasks 1–3 in `docs/superpowers/plans/2026-05-18-agent-orientation-design-system.md`.

## Analysis Summary

| Source | Count | Notes |
|---|---:|---|
| Commits (last 5 days) | 108 | `git log --since="5 days ago"` |
| Client-side file touches | 71 | `src/client/...` lines in git-analysis |
| Components found (`src/client/components/*.tsx`) | 25 | Top-level component files only |
| Issues fetched (all states) | 38 | Heavy bias toward audit/known-issue tracking |
| PRs fetched (all states) | 3 | Sparse — feature work mostly lands via direct commits |
| Tailwind/className lines mined | 100 (top freq) | Mixed custom-class + utility usage |
| State-pattern lines mined | 357 | tRPC + Zustand + local React state |
| AG Grid pattern lines mined | 107 | `cellRenderer` / `valueFormatter` / `columnDefs` |

---

## Components Discovered

25 top-level components in `src/client/components/`. Categorized by inferred purpose:

### Grid / Data Display
- `OperatorGrid.tsx` — Core wrapper around `AgGridReact`. Wraps with `withRowNumbers`, `withStatusRenderer`, optional expansion chevron column. Source of truth for grid defaults (`sortable`, `resizable`, `filter`, `minWidth`, `cellSelection`, `undoRedoCellEditing`).
- `QuickLedgerGrid.tsx` — Drafts-based ledger; combines local React state (`drafts`, `activeRowId`) with `trpc.queries.*` reads. Mixed direction (`receiving` / `paying`).
- `ExpansionChevronColumn.tsx`, `ExpansionPanel.tsx` — Master-detail / inline expansion support for `OperatorGrid`.
- `StatusPill.tsx` — Standard cell renderer for status columns.

### Drawers / Side Panels
- `ContextDrawer.tsx`, `VendorContextDrawer.tsx`, `RelationshipDrawer.tsx` — Right-side info panels driven by a selected row.
- `WorkspacePanel.tsx`, `InventoryFinderPanel.tsx`, `PhotographyQueuePanel.tsx` — Domain-specific working panels.
- `RowCommandHistoryDrawer.tsx` — Per-row audit log with reverse-action affordance.
- `IssueSidecar.tsx` — Side sheet for issue/triage flows.

### Command / Navigation
- `CommandPalette.tsx` — Global command palette (recently received focus-trap fix, commit `b786f21`).
- `Hotkeys.tsx` — Global keyboard shortcut handler; gated by `trpc.auth.me.useQuery()`.
- `Shell.tsx` — App layout shell.
- `IdentityRibbon.tsx` — User/identity strip.

### Filters / Forms
- `AdvancedFilterBuilder.tsx` — Recursive filter group builder; uses `trpc.filters.getFacets.useQuery()`.
- `SavedFiltersDropdown.tsx` — Saved filter selection UI.
- `RefereeRelationshipDialog.tsx` — Modal form for referral relationship.
- `EmptyState.tsx` — Empty-state placeholder.

### Misc
- `KpiCard.tsx` — Metric tile.
- `SelectionSummary.tsx` — Selection-aware summary bar.
- `ReportsRouteShell.tsx` — Reports route container; fans out to multiple `trpc.queries.grid.useQuery({ view })` reads.
- `ToastCenter.tsx` — Toast notifications.

> Full list lives in `/tmp/components.txt`; will be regenerated as JSON by Task 18's `scripts/extract-component-inventory.ts`.

---

## Styling Patterns

The codebase uses a **hybrid styling system**: project-defined semantic classes layered over Tailwind utilities. Pure-Tailwind treatment is incomplete.

### Most-Used Custom Classes (from `/tmp/tailwind-patterns.txt`)

| Class | Appears in | Apparent role |
|---|---|---|
| `field-inline` | `OperationsViews`, `MatchmakingView`, `IssueSidecar` (50+ hits) | Inline label/field row inside dense forms |
| `primary-button compact-action` | Multiple views | Primary action button, compact density |
| `secondary-button compact-action` | Multiple views | Secondary action button |
| `control-band`, `subtle-band` | OperationsViews, MatchmakingView | Toolbar / control strip |
| `view-stack` | SalesView, OperationsViews | Top-level page vertical stack |
| `inline-panel` | OperationsViews | Embedded panel section |
| `selection-pill` | SalesView | Selection indicator chip |
| `finder-table`, `finder-table-wrap` | OperationsViews | Compact finder/lookup table |
| `definition-item` | RelationshipDrawer | Term/value pair in drawers |
| `context-drawer-card` | ContextDrawer | Card inside context drawers |
| `expansion-section`, `expansion-section-header`, `expansion-section-content` | ExpansionPanel | Collapsible row-detail blocks |
| `po-context-list` | OperationsViews | PO context list (intake) |
| `transaction-ledger-row-number` | QuickLedgerGrid | Row-number cell in ledger |

### Tailwind Utilities Observed
Standard utility usage co-mingles with the classes above:
- Flex: `flex`, `flex-wrap`, `items-center`, `justify-between`, `gap-2/3`
- Grid: `grid`, `grid-cols-1`, `xl:grid-cols-[0.9fr_1.1fr]`, `min-h-[420px]`
- Typography: `text-sm`, `text-xs`, `font-medium`, `text-zinc-700`, `text-gray-900`, `text-gray-500`
- Spacing: `mt-2`, `mt-3`, `mb-1`, `px-3 py-2`, `py-8`
- Color: `bg-panel` (custom Tailwind theme color), `border-zinc-300`, `border-b-2`

### Implication for `styling-guide.md` (Task 15)
The styling guide must document **both layers**:
1. The custom class vocabulary (`field-inline`, `primary-button`, `control-band`, etc.) — likely defined in a global CSS file, not arbitrary Tailwind.
2. Where Tailwind utilities are appropriate (layout glue, one-off spacing) vs. when to reach for a semantic class.

The spec's "approved color classes" framing assumes pure-Tailwind. Reality is mixed — flag this as a doc-design correction needed in Task 15.

---

## State Management Patterns

### Server state — tRPC + TanStack Query (not raw `useQuery`)

Every reads-from-server case goes through tRPC client hooks. No raw `useQuery` / `useMutation` was found in `src/client`.

```ts
// Pervasive read pattern:
const me = trpc.auth.me.useQuery();
const reference = trpc.queries.reference.useQuery();
const orders = trpc.queries.grid.useQuery({ view: 'sales' });
const workspace = trpc.queries.customerWorkspace.useQuery(
  { customerId: customerId || blankId },
  { enabled: Boolean(customerId) }
);
```

- Common idiom: pass a sentinel UUID (`'00000000-0000-0000-0000-000000000000'`) plus `{ enabled: Boolean(...) }` to defer fetching.
- `trpc.queries.grid.useQuery({ view: 'sales' | 'inventory' | 'vendors' | 'payments' | 'clients' })` is the unified grid-data endpoint (see `ReportsRouteShell.tsx`).

### Mutations — `useCommandRunner` hook (custom wrapper)

Direct `useMutation` use is rare; nearly all mutations route through:

```ts
const { runCommand, isRunning } = useCommandRunner();
await runCommand('flagBatch', { batchId, reason }, 'Flag intake lot from grid');
```

- Signature: `runCommand(commandName, payload, humanDescription)`.
- The third arg becomes the audit trail description in the command journal.
- This implements the system's "command-driven, audited, reversible" principle (see CLAUDE.md / AGENTS.md).

Authentication mutation is a thin exception:
```ts
const login = trpc.auth.login.useMutation({
  onSuccess: () => utils.auth.me.invalidate()
});
```

### UI state — Zustand (`useUiStore`)

Single visible store: `useUiStore`, accessed via selector function:
```ts
const activeQuickLaunch = useUiStore((state) => state.activeQuickLaunch);
```

Selectors are passed inline; no use of `useShallow` or combined selectors observed. Each subscribed field is a one-liner.

### Local React state — useState / useRef

Local-only state uses bare `useState` / `useRef`. Examples in `QuickLedgerGrid.tsx`:
```ts
const [drafts, setDrafts] = useState<LedgerDraft[]>(() => [makeRow(...)]);
const [activeRowId, setActiveRowId] = useState(drafts[0]?.id ?? '');
const [collapsed, setCollapsed] = useState<Record<LedgerDirection, boolean>>(...);
```

### Permission gating idiom

Repeated across views:
```ts
const me = trpc.auth.me.useQuery();
const canWrite = me.data?.role !== 'viewer';
const canReverse = me.data?.role === 'manager' || me.data?.role === 'owner';
```

This is the de-facto UI gating contract. Should be documented in `state-patterns.md` and `domain-concepts.md`.

### Implication for `state-patterns.md` (Task 16)
The spec frames state in "TanStack Query" terms. The actual pattern is **tRPC over TanStack Query** with a `useCommandRunner` mutation wrapper. Documenting raw TanStack patterns would mislead agents — they should learn the tRPC façade first, raw TanStack only when bypassing it (rare).

---

## AG Grid Patterns

### Column definition style
Inline arrays of `ColDef` objects, typically built with `useMemo<ColDef<Row>[]>`. Mix of one-line column defs (`{ field, headerName, width }`) and full objects with `cellRenderer` / `valueFormatter`.

```ts
const columnDefs = useMemo<ColDef<IntakeOrderRow>[]>(() => [
  { field: 'poNo', headerName: 'PO', cellRenderer: 'agGroupCellRenderer', pinned: 'left', minWidth: 180 },
  { field: 'vendor', headerName: 'Vendor', minWidth: 160 },
  { field: 'status', minWidth: 140 },
  // ...
], [deps]);
```

### `cellRenderer` patterns
Two flavors observed:

1. **Named built-in** — `'agGroupCellRenderer'` for master-detail expansion.
2. **Inline render fn** with typed params:
   ```ts
   cellRenderer: (params: ICellRendererParams<IntakeOrderRow>) => {
     const order = params.data;
     if (!order) return null;
     return <div className="flex h-full items-center gap-2">…</div>;
   }
   ```
3. **Component-wrapped** — `cellRenderer: (params) => <StatusPill status={params.value} />` (see `OperatorGrid`).

### `valueFormatter` patterns
Used for display-only transforms:
```ts
valueFormatter: (params) => formatRequestSource(params.value)
valueFormatter: (params) => formatRequestType(params.value)
valueFormatter: (params) => commandLabelFor(params.value)
valueFormatter: (params) => `$${Number(params.value ?? 0).toFixed(2)}`
valueFormatter: (params) => formatGridValue(params.value)
```

Helpers (`formatRequestSource`, `formatRequestType`, `commandLabelFor`, `formatGridValue`) live elsewhere in `src/client/` — Task 13's `grids.md` should locate and link them.

### Standard grid options
Pulled from `OperatorGrid.tsx` and `IntakeView.tsx`:
- `defaultColDef={{ sortable: true, resizable: true, filter: true, minWidth: 120 }}`
- `rowSelection`, `cellSelection`
- `animateRows={false}` — animation disabled (spreadsheet feel)
- `undoRedoCellEditing` — enabled
- `masterDetail`, `detailRowAutoHeight`, `detailCellRendererParams`
- `getRowId={(params) => String(params.data.id)}`

### Numbers-native 8-column rule
Issue #31 (audit-flagged High, area:ux) called out: **7 of 13 grids violated the ≤8-columns rule**. Commit `f5c33d8` ("Audit: Grid column compliance (#31)") added `docs/GRID_COLUMN_AUDIT.md` — this is the source of truth on grid density. `grids.md` (Task 13) must reference it.

---

## Design Decisions (from commits & PRs, last 5 days)

Extracted from `/tmp/git-analysis.txt` and `/tmp/prs.json`:

- **f5c33d8** — Grid column compliance audit (closes #31). Establishes the ≤8-column rule as enforced policy.
- **b786f21** — Focus trap added to Command Palette (closes #30). Pattern: focus trap is required for any modal/palette overlay.
- **db90fa4** — `SELECT … FOR UPDATE` lock implementation (closes #18 — money/inventory integrity audit). Pattern: row locks required wherever stock or balance is recomputed.
- **0cf876b**, **54a4220** — TypeScript fixes and CI test-config corrections from Phase 1–2. Pattern: vitest excludes E2E tests; Playwright tests are separate.
- **PR #41** — Baseline migrations for filters/brands/organizations. Confirms migration baselines live with the feature (not retro-stitched).
- **PR #11** — PO-centric intake redesign with verify/flag/reject. The verify/flag/reject vocabulary is the canonical intake action set.

### Audit-driven backlog dominates issue tracker

Of 38 issues, ~22 are tagged `tracking:known-issue, source:agent` — agent-authored audit findings (DYNAMIC-AUDIT, AUDIT). Active feature work is concentrated in 3 issues (#38 Payment Processor, #39 Pricing Rules v4, #40 Photography Module). Implication: agents reading this repo should expect to encounter audit issues frequently and should reference `docs/AUDIT_REPORT.md`, `docs/DYNAMIC_AUDIT_REPORT.md`, and `docs/GRID_COLUMN_AUDIT.md` (all present in `docs/`) before assuming a behavior is intentional.

---

## Gaps & Caveats

1. **Doc namespace overlap**: `docs/architecture/` (1 planning file) and `docs/design/` (system-design docs, not a "design system") already exist. The new `docs/agent-orientation/` and `docs/design-system/` paths don't collide on filenames but the *names* are similar — agents could pick the wrong dir. Task 6 (`START_HERE.md`) should explicitly disambiguate.
2. **Spec assumes pure Tailwind**: Reality is hybrid (custom semantic classes + Tailwind). Task 15's `styling-guide.md` must document both. If it only documents Tailwind utilities, it will be wrong.
3. **Spec assumes raw TanStack Query**: Reality is tRPC façade + `useCommandRunner`. Task 16 `state-patterns.md` should lead with tRPC and only mention raw TanStack as the underlying mechanism.
4. **Inventory script (Task 18)** depends on `glob` being available in `devDependencies`. Confirm before running.
5. **`pnpm exec tsc` step in Task 18** typechecks the script in isolation; that may not be how the repo's `tsconfig` resolves `glob` types. Verify against actual project tsconfig.
6. **Spec line-number citations** in Tasks 7–16 (e.g., "spec lines 186-338") presume the spec is stable. If the spec is edited, those line numbers drift. The spec doc itself should be treated as the source — line ranges are advisory only.

---

## Next Steps

- Task 6+ will consume this report to write agent-orientation and design-system docs.
- When writing `docs/design-system/styling-guide.md` (Task 15) and `state-patterns.md` (Task 16), correct the spec's pure-Tailwind / raw-TanStack framing per the implications above.
- Re-run extraction at the end of each major frontend feature to keep this report current; replace this dated file or append a sibling `extracted-YYYY-MM-DD.md`.
