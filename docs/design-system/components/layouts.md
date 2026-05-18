# Layout Patterns

> Pages in TERP Operator stack `WorkspacePanel`s vertically inside a `view-stack`. Each panel hosts a toolbar (`control-band`) and a body (often an `OperatorGrid` or a `finder-table`). Drawers live to the right of the canvas as a separate state machine, not inside the layout flow.

## The shell

The app shell (defined in `Shell.tsx`, used in `App.tsx`) provides:

- **SideNav** — left navigation, collapsible (`useUiStore.sideNavCollapsed`).
- **Keel** — top bar with search, quick-launch, view chips, status indicators.
- **Canvas** — the main content area where the active view renders. Has a focus-mode treatment (`canvas-shell-focus`) when a workspace panel is set to focus.
- **ContextDrawer** — right side, five states (closed / peek / standard / wide / focus) driven by `useUiStore.toggleDrawer` / `cycleDrawer`.
- **IdentityRibbon** — top-right user/role indicator.
- **ToastCenter** — ephemeral notifications.

You don't compose these directly — they're already wired in `App.tsx`. Your view renders inside the canvas.

## View structure

Every top-level view returns a `view-stack`:

```tsx
export function SalesView() {
  // …queries, state, callbacks…
  return (
    <div className="view-stack">
      <WorkspacePanel panelId="sales-toolbar" title="Sales">…</WorkspacePanel>
      <OperatorGrid view="sales" title="Sales orders" rows={orders.data ?? []} columns={columnDefs} />
      {/* etc. */}
    </div>
  );
}
```

CSS:
```css
.view-stack { @apply flex min-h-full flex-col gap-3; }
```

Notes:
- `view-stack` provides the vertical rhythm. Don't add `space-y-*` on top of it.
- `gap-3` (12px) is the panel-to-panel spacing.

## `WorkspacePanel`

The standard container for any titled section. `OperatorGrid` already wraps itself in a `WorkspacePanel`; reach for `WorkspacePanel` directly when you have non-grid content.

```tsx
<WorkspacePanel
  panelId="intake-toolbar"
  title="Intake queue"
  subtitle="3 open POs"
  actions={canWrite ? <button className="primary-button compact-action">Verify all</button> : null}
>
  <div className="control-band">
    <label className="field-inline">
      Vendor
      <input className="input compact" />
    </label>
    <button className="secondary-button compact-action">Reset</button>
  </div>
</WorkspacePanel>
```

Public surface:
- `panelId` (required) — stable ID used by `useUiStore.collapsedPanels` and focus mode. Use a deterministic string like `grid:<view>:<title>` or `<view>-<purpose>`.
- `title` + `subtitle` — header.
- `actions` — right-side header buttons.
- `className` / `contentClassName` — escape hatches; use sparingly.
- Built-in: collapse toggle (chevron in the header), focus toggle (Maximize2/Minimize2 icon).

Focus mode: clicking the panel's focus button calls `setFocusedPanel(panelId)`. When a panel is focused, **every other panel in the canvas is hidden** (the `hiddenByFocus` check inside `WorkspacePanel`). Use this for full-screen review/edit flows.

## Toolbar — `control-band`

```css
.control-band { @apply flex flex-wrap items-center gap-2 border border-line bg-panel p-2; }
.subtle-band  { @apply border-dashed bg-white; }
```

The standard toolbar shape. `subtle-band` is a less-prominent variant (dashed border, white background) for nested or supplementary toolbars.

```tsx
<div className="control-band">
  <label className="field-inline">…</label>
  <button className="primary-button compact-action">…</button>
  <button className="secondary-button compact-action">…</button>
</div>
```

For wide layouts with left/right action groups, use raw Tailwind:

```tsx
<div className="flex flex-wrap items-center justify-between gap-2">
  <div className="flex items-center gap-2">{/* left actions */}</div>
  <div className="flex items-center gap-2">{/* right actions */}</div>
</div>
```

## Panels and cards

| Class | Purpose |
|---|---|
| `inline-panel` | Embedded panel section inside a view (lighter than `WorkspacePanel`) |
| `context-drawer-card` | Card inside a context drawer |
| `finder-table-wrap` + `finder-table` | Compact lookup table inside a drawer or dialog |
| `expansion-section`, `expansion-section-header`, `expansion-section-content` | Collapsible row-detail blocks (used inside AG Grid master-detail) |

Use `inline-panel` for sub-sections that don't deserve their own `WorkspacePanel` (no collapse, no focus, no header chrome).

## Grid container — `grid-shell`

```css
.grid-shell { height: min(68vh, 720px); min-height: 360px; }
```

`OperatorGrid` already wraps its `AgGridReact` in `<div className="ag-theme-quartz grid-shell">`. You typically don't touch this. If you embed a grid manually, copy the wrapper.

## Headings

```css
.page-title    { /* defined in styles.css */ }
.page-subtitle { /* defined in styles.css */ }
.section-title { /* defined in styles.css */ }
```

For most surfaces, `WorkspacePanel`'s built-in `title` + `subtitle` is enough — you rarely need to render headings inline.

## Context Drawer (right-side panel)

The drawer is part of the shell, not the view. Your view doesn't render the drawer — it can influence it via:

```ts
const setDrawerEntity = useUiStore((s) => s.setDrawerEntity);
const toggleDrawer = useUiStore((s) => s.toggleDrawer);
const setDrawerState = useUiStore((s) => s.setDrawerState);

// On row selection, push the drawer to standard with this entity context:
setDrawerEntity('sales', 'customer', customerId);
setDrawerState('sales', 'standard');
```

Drawer states cycle: `closed` → `peek` → `standard` → `wide` → `focus`. The drawer content is rendered by `ContextDrawer` based on the current entity type and tab — see `uiStore.ts` for the entity→default-tab mapping.

## Selection Summary (bottom strip)

When rows are selected in an `OperatorGrid`, `SelectionSummary` automatically appears beneath the grid. You can pass `selectionActions` to `OperatorGrid` to render contextual actions in that strip:

```tsx
<OperatorGrid
  …
  selectionActions={(rows) => (
    <button className="primary-button compact-action" onClick={() => bulkFlag(rows)}>
      Flag {rows.length} lot{rows.length === 1 ? '' : 's'}
    </button>
  )}
/>
```

## Real reference

- **A grid-only view:** `IntakeView.tsx`, `SalesView.tsx`.
- **A multi-panel view:** `OperationsViews.tsx` (bundles several screens, uses `inline-panel` + `control-band`).
- **A non-grid view:** `DashboardView.tsx` (KpiCards inside `WorkspacePanel`s).
- **`WorkspacePanel` internals:** `src/client/components/WorkspacePanel.tsx`.
- **Shell internals:** `src/client/components/Shell.tsx` (exports `Keel`, `SideNav`).

## Don'ts

❌ Don't render headings, toolbars, or content outside of `WorkspacePanel` at the top level of a view. The collapse and focus affordances assume that wrapping.

❌ Don't use fixed heights on grids — `OperatorGrid` and `.grid-shell` already constrain height responsively.

❌ Don't reach for raw Tailwind for the standard toolbar shape. Use `control-band` so it matches everywhere.

❌ Don't make a view "wide" or "narrow" by adding `max-w-*` to the view-stack. The canvas controls width; the view fills it.

✅ Do give every `WorkspacePanel` a stable `panelId`. Random IDs break collapse-state persistence in `useUiStore.collapsedPanels`.

✅ Do let `OperatorGrid` handle the empty state (`emptyTitle`, `emptyChildren`). Don't add a "no data" `<div>` around the grid.

✅ Do push drawer state via `useUiStore` actions instead of rendering drawers in your view.
