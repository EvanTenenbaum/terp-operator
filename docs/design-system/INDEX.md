# TERP Operator Design System

> The system is **hybrid**: Tailwind v3 utility layer underneath, 209 hand-written semantic CSS classes (`.primary-button`, `.field-inline`, `.control-band`, ...) on top, defined with `@apply` in `src/client/styles.css`. When you reach for a class, ask: "Is there already a semantic name for this?" before composing utilities inline.

## Quick Reference

| Need | See |
|---|---|
| **Shared templates (StatusActionBar, FilterPresetStrip, InspectorDrawer, FormDialog) — check here first** | [components/templates.md](./components/templates.md) |
| Button patterns | [components/buttons.md](./components/buttons.md) |
| AG Grid patterns | [components/grids.md](./components/grids.md) |
| Forms, modals, layouts | [components/forms.md](./components/forms.md), [components/modals.md](./components/modals.md), [components/layouts.md](./components/layouts.md) |
| Colors, typography, spacing | [styling-guide.md](./styling-guide.md) |
| State management (tRPC, useCommandRunner, useUiStore) | [state-patterns.md](./state-patterns.md) |
| Component inventory (auto-generated) | [components/_inventory.json](./components/_inventory.json) — created by `pnpm docs:inventory` once Task 18 lands |
| Decision history | [decisions-log.md](./decisions-log.md) |

## Component Categories

The 25 components in `src/client/components/` (flat) group as follows. Reach for the existing one before creating a new one.

**Grid / data display**
`OperatorGrid` (the universal AG Grid wrapper) · `QuickLedgerGrid` · `StatusPill` · `ExpansionChevronColumn` · `ExpansionPanel` · `KpiCard` · `EmptyState`

**Drawers / side panels**
`ContextDrawer` · `VendorContextDrawer` · `RelationshipDrawer` · `WorkspacePanel` · `InventoryFinderPanel` · `PhotographyQueuePanel` · `RowCommandHistoryDrawer` · `IssueSidecar`

**Command / navigation**
`CommandPalette` · `Hotkeys` · `Shell` (also exports `Keel`, `SideNav`) · `IdentityRibbon` · `ToastCenter`

**Filters / forms / dialogs**
`AdvancedFilterBuilder` · `SavedFiltersDropdown` · `RefereeRelationshipDialog`

**Hooks among components** (oddity — see `../agent-orientation/code-organization.md`)
`useCommandRunner.ts`

## Color Palette

Defined in `tailwind.config.ts`:

| Token | Hex | Use |
|---|---|---|
| `ink` | `#18211f` | Primary text |
| `panel` | `#f7f8f5` | Panel/page backgrounds |
| `field` | `#ffffff` | Input/field backgrounds |
| `line` | `#d8ded6` | Borders, dividers |
| `accent` | `#216e4e` | Primary actions (`primary-button` background) |
| `amber` | `#b06915` | Warnings / attention |
| `danger` | `#b42318` | Destructive actions |

A `primary` CSS variable also exists and is used in `RefereeRelationshipDialog.tsx` via `bg-primary` — confirm where it's declared before reaching for it (CSS custom property, not in Tailwind theme).

**Don't introduce new colors** without a decision-log entry. Tailwind's full palette (`blue-600`, `purple-500`, etc.) is technically available but using it inconsistently fights the design system.

## Typography

Tailwind utilities, no custom font config:
- `text-xs` / `text-sm` / `text-base` / `text-lg` — primary scale
- `font-medium` / `font-semibold` / `font-bold`
- `font-mono` for IDs and technical values
- Color via `text-zinc-{500,600,700,900}` (most common) or the custom `text-ink` for primary text

`text-zinc-*` is currently the dominant convention even though the `ink` color exists — there's an open thread here for the decision log (when to use `text-ink` vs `text-zinc-900`).

## Semantic Class Vocabulary

These are the most-referenced classes (full list: 209 entries in `src/client/styles.css`):

| Class | Purpose |
|---|---|
| `primary-button` | Accent-colored primary action |
| `secondary-button` | Outlined secondary action |
| `text-button` | Text-only action |
| `icon-button` | Square icon-only button |
| `compact-action` | Modifier — reduces padding for dense toolbars |
| `view-stack` | Top-level vertical stack for a view |
| `inline-panel` | Embedded panel section inside a view |
| `control-band`, `subtle-band` | Toolbar / control strip |
| `field-inline` | Inline label+field row inside dense forms |
| `input`, `select` | Form input base styling |
| `selection-pill` | Selection indicator chip (variants: `.success`, `.warning`, `.danger`) |
| `finder-table`, `finder-table-wrap` | Compact lookup tables |
| `context-drawer-card` | Card inside a context drawer |
| `expansion-section`, `expansion-section-header`, `expansion-section-content` | Collapsible row-detail blocks |
| `grid-shell` | AG Grid container |
| `page-title`, `page-subtitle`, `section-title` | Heading vocabulary |

See `styling-guide.md` for when to compose these vs. reaching for raw Tailwind utilities.

## Layout Vocabulary

- **View** — a top-level operator screen. Lives in `src/client/views/`. Wraps content in `view-stack`.
- **Workspace Panel** — `WorkspacePanel` component wraps a grid or pane with title/subtitle/actions. Most views use multiple workspace panels.
- **Context Drawer** — right-side panel with five states: `closed` → `peek` → `standard` → `wide` → `focus`. Driven by `useUiStore.toggleDrawer` / `cycleDrawer`.
- **Selection Summary** — bottom strip when rows are selected in a grid. `SelectionSummary` component.
- **Command Palette** — Cmd+K overlay. `CommandPalette` component (has focus trap as of commit `b786f21`).
- **Toast Center** — top-of-screen ephemeral messages. `ToastCenter` component. Pushed by `useUiStore.pushToast` (the `useCommandRunner` calls this on success/error).

## Where to Look First

1. **Adding a screen?** Read `components/grids.md` and pick the closest existing view to mimic (`SalesView`, `IntakeView`).
2. **Adding a dialog?** Read `components/modals.md`. `RefereeRelationshipDialog` is the current template.
3. **Adding a form?** Read `components/forms.md`. Forms inside drawers use `field-inline`; standalone modal forms use raw Tailwind utilities.
4. **Touching a button?** Read `components/buttons.md`. **There is no `Button` component** — buttons are `<button>` with `primary-button`/`secondary-button`/`text-button`/`icon-button` semantic classes.
5. **Touching state?** Read `state-patterns.md`. tRPC for reads, `useCommandRunner` for writes, `useUiStore` for UI state.

## Update Discipline

When you change something here:
- New semantic class? Add it to `src/client/styles.css` and reference it in the relevant guide.
- New component? Run `pnpm docs:inventory` (once Task 18 lands) and append a `decisions-log.md` entry.
- New convention? Update the guide + append to `decisions-log.md` with rationale.
