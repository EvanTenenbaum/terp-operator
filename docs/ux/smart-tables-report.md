# Making TERP Operator Tables Feel Like Google Sheets Smart Tables

**Audience:** Evan / product + eng
**Date:** 2026-06-25
**Scope:** UX of every grid in TERP Operator (Orders, Sales, Inventory, Intake, Payments, Contacts, Fulfillment, etc.)
**Goal:** Make interacting with TERP tables feel like the latest Google Sheets with *smart tables* (now called "tables") enabled — chips, dropdowns, type-aware cells, inline pickers, hover cards.

---

## 1. Executive summary

The good news: TERP Operator is **not** starting from a plain HTML table. Every primary view already renders through **AG Grid (Community + Enterprise)** via a single wrapper, `OperatorGrid.tsx`, fed by a schema-driven column factory (`useColumnDefs.ts`). The plumbing for a Sheets-style smart table already exists — there are status **chips** (`StatusPill`), a fully-built **combobox/dropdown cell editor** with typeahead, "create new", async search, and ARIA support (`ComboboxCellEditor.tsx`), a **fill handle**, **range selection** with live sum/avg/min/max, **filter chips**, an **advanced filter builder**, and persisted column prefs.

The gap is not "we have no smart-table primitives." The gap is that **the smart-table primitives are wired only halfway**, so the day-to-day feel is closer to "spreadsheet with plain text cells" than to "Google Sheets table with chips and dropdowns." The three highest-impact problems:

1. **Dropdowns are empty.** The schema path wires every enum/combobox editor with `options: []` and a literal `// future` comment — the backend `comboboxOptions` procedure that should feed them *exists and is tested* but is never called from the client. So most dropdown cells open an empty menu.
2. **Cells don't *look* interactive until you edit them.** A Sheets dropdown/chip cell always shows the chip and reveals a caret on hover. In TERP, a single-select cell renders as plain grey text and only becomes a dropdown after a double-click into edit mode. Chips appear only for `status` columns; `tags` columns render as raw text.
3. **No type-aware affordances beyond status.** Dates have no inline date picker, multi-select/tags have no chip editor, and there are no "smart chips" (entity hover cards) on the foreign-key columns (vendor, customer, batch) that are TERP's most-clicked cells.

This report maps the target experience, inventories what's really there, and gives a prioritized, file-level plan. The headline: **~70% of the work is finishing and surfacing components that already exist**, not building new ones.

---

## 2. The target: what "Google Sheets smart tables" actually means

When you convert a range to a **table** in current Google Sheets and turn on column types, you get:

| Feature | Behavior |
|---|---|
| **Per-column types** | Each column is declared as text / number / currency / date / dropdown (single-select) / dropdown-chips (multi-select) / people / etc. The type drives rendering, the editor, validation, and the filter UI. |
| **Always-visible chips** | Single- and multi-select cells render their value(s) as colored **chips inline**, not plain text. The cell *looks* like a control at rest. |
| **One-click dropdowns** | A caret appears on hover/focus; one click opens the option list. No "enter edit mode first." Invalid values are flagged. |
| **Inline date picker** | Date cells open a calendar popover on click. |
| **Smart chips & hover cards** | `@`-references to people/files/entities render as chips with a **hover card** preview and click-through. |
| **Type-aware column menu** | The column header menu offers type-appropriate actions: sort, filter-by-values (with checkboxes + counts), group by, change type, conditional formatting. |
| **Filter views & group-by** | Filter chips at top; "group by a column" collapses rows into labeled sections with subtotals. |
| **Consistent, quiet styling** | Alternating row tint, compact density, tabular numerals, sticky header — calm and dense, not loud. |

The emotional target: **the table is the application surface.** You read, edit, filter, and navigate without ever feeling like you "opened a form." Cells advertise what they can do.

---

## 3. Current state in TERP Operator (honest inventory)

**Architecture (strong):**
- `src/client/components/OperatorGrid.tsx` — single AG Grid wrapper used by every grid.
- `src/client/templates/GridView.tsx` — composes FilterToolbar → SummaryStrip → ViewTabBar → OperatorGrid → BulkActionBar.
- `src/client/hooks/useColumnDefs.ts` — generates AG Grid `ColDef`s from a central schema registry (`entity-schemas.ts`). Column types already exist: `text | numeric | currency | date | boolean | enum | combobox | tags`.
- Tailwind + `ag-theme-quartz`, 11px font, 28/42px density toggle, locale-pinned formatters.

**Smart-table primitives that already exist:**
- ✅ **Status chips** — `StatusPill.tsx`, 20+ status→color mappings, non-color shape indicators for a11y. Wired via `withStatusRenderer` in OperatorGrid.
- ✅ **A real combobox editor** — `editors/ComboboxCellEditor.tsx` (678 lines): typeahead filter, keyboard nav, "create new" (`allowCreate`), async search (`onSearch`), per-cell save/saved/error state, full ARIA combobox semantics. This is genuinely good.
- ✅ **Fill handle** (`enableFillHandle`, y-direction), **range selection** with live aggregate stats, **⌘D fill-down**, **TSV paste**, undo/redo.
- ✅ **Filter chips** (`filterChips`), **advanced filter builder** (`AdvancedFilterBuilder.tsx`), **saved filters** (`SavedFiltersDropdown`, `SavedFiltersManager`), **status filter pill** with counts.
- ✅ **Column management** — show/hide, resize, pin, reorder, density, all persisted per-operator.
- ✅ **Backend ready** — `queries.comboboxOptions` procedure exists, is permission-scoped, and is tested (`queries.comboboxOptions.test.ts`).

**Where it falls short of the Sheets feel:**
- ⚠️ **Dropdown options are empty.** `useColumnDefs.ts:218–256` sets `options: []` for *every* enum/combobox editor with a `// async options loaded via comboboxSource trpc procedure (future)` comment. `comboboxOptions` on the server is never called from the client column factory. Only `IntakeView.tsx:589` hardcodes three status values. **Net effect: open a vendor/customer/status dropdown and it's blank.**
- ⚠️ **Rest-state cells look inert.** Enum/combobox cells render as plain text; the dropdown only appears *after* entering edit mode (double-click / Enter). No hover caret, no chip. Users can't tell a cell is a dropdown by looking.
- ⚠️ **`tags` columns aren't chips.** `useColumnDefs.ts:262` has a `case 'tags':` that does nothing but leave a comment; there's no tags chip renderer or multi-select chip editor wired in OperatorGrid (only status/rowNumber/createdAt enhancers exist). Tags render as raw `a-b-c` slug text (`shared/tags.ts`).
- ⚠️ **No inline date picker.** Date cells use AG Grid's default text editor; no calendar popover.
- ⚠️ **No smart-chip hover cards.** FK columns (vendorId, customerId, batchCode) show raw IDs/codes with no chip, no hover preview, no click-through — even though a `ContextDrawer`/`RelationshipDrawer` exists and could power a hover card.
- ⚠️ **`allowCreate` never enabled** in the schema path, so you can't add-a-tag-on-the-fly the way Sheets lets you add a dropdown value inline.

---

## 4. Gap analysis (the deltas that matter)

| # | Target (Sheets) | Current (TERP) | Delta size |
|---|---|---|---|
| G1 | Dropdown cells show real options | Options are `[]` (backend exists, unused) | **Wiring only** |
| G2 | Single/multi-select render as chips at rest | Plain text except `status` | Medium |
| G3 | Cell advertises itself (hover caret, click-to-open) | Double-click to reveal editor | Medium |
| G4 | Multi-select / tags = chip editor | `tags` is a no-op; raw slug text | Medium |
| G5 | Inline date picker | Default text editor | Small–Medium |
| G6 | Smart chips + hover cards on entities | Raw IDs, no preview | Medium–Large |
| G7 | Filter-by-values w/ checkboxes + counts in column menu | Have advanced builder + status pill; not per-column "values" UX | Medium |
| G8 | Group-by-column with subtotals | Not surfaced (AG Grid Enterprise *can* do this) | Medium |
| G9 | Validation flags invalid values | Combobox enforces on edit; no at-rest invalid flag | Small |

---

## 5. Recommendations (prioritized, file-level)

### P0 — Finish what's already built (highest impact / lowest cost)

**R1. Wire dropdowns to real data.** Connect `useColumnDefs.ts` enum/combobox editors to the existing `trpc.queries.comboboxOptions` procedure via the editor's `onSearch` prop (already supported in `ComboboxCellEditor`). For small enums (status, payment method) pass a static `options` array resolved from the schema; for entity refs (vendor, customer, batch) pass `onSearch` so it lazy-loads + searches server-side. This single change turns every dropdown from blank → functional. *Effort: S. Touches: `useColumnDefs.ts`, schema registry, one tRPC hook.*

**R2. Render single-selects as chips at rest.** Generalize `withStatusRenderer` into a `withChipRenderer` that applies to any `enum`/`combobox` column with a color map (status is just the first instance). Reuse `StatusPill`'s tone system. *Effort: S. Touches: `OperatorGrid.tsx`, `StatusPill.tsx` → generalize.*

**R3. Add a hover/focus caret affordance.** A small CSS-only chevron that appears on cell hover for any editable enum/combobox/date column, so dropdown cells look like dropdowns. *Effort: S. Touches: `styles.css`, a `cellClass` flag in `useColumnDefs.ts`.*

> P0 alone closes G1–G3 and delivers ~80% of the "it feels like Sheets" perception for the cost of wiring, not building.

### P1 — Round out the type system

**R4. Tags = multi-select chip cell.** Implement the `case 'tags'` branch: a renderer that shows chips (reuse chip styling) and a chip editor built on `ComboboxCellEditor` with `multiple` + `allowCreate: true`. Backend tag normalization already exists in `shared/tags.ts`. *Effort: M.*

**R5. Inline date picker.** Use AG Grid's `agDateCellEditor` or a small popover calendar for `type: 'date'` columns; keep the locale-pinned `formatTs` display. *Effort: S–M. Touches: `useColumnDefs.ts` date case.*

**R6. Filter-by-values in the column menu.** Surface AG Grid's Set Filter (already on `boolean`) for enum/status/tags columns so the header menu offers checkbox value lists with counts — the Sheets filter feel. *Effort: M.*

### P2 — Smart chips & richer interactions

**R7. Entity smart chips with hover cards.** For FK columns (vendorId → vendor name chip, customerId, batchCode), render a chip whose hover card reuses the data already in `RelationshipDrawer`/`ContextDrawer`, with click-through to the drawer. This is the single biggest "wow" upgrade and matches Sheets people/finance chips. *Effort: M–L. Touches: new `EntityChipCell`, a lightweight hover-card popover, reuse drawer queries.*

**R8. Group-by-column with subtotals.** Expose AG Grid Enterprise row grouping behind a "Group by" control in `FilterToolbar`, with currency subtotals per group. *Effort: M.*

**R9. At-rest validation flags.** When a cell's value isn't in its option set, show a subtle amber underline + tooltip (Sheets-style invalid flag), reusing the combobox's existing error styling. *Effort: S.*

### Cross-cutting polish
- Generalize the chip color system into one `chipTone(value, palette)` util so status, tags, and enum chips share tones.
- Add a **"smart paste"** that maps pasted text to option values for dropdown columns (the combobox already validates; extend to paste).
- Keep density/locale/a11y guarantees — every new renderer must preserve the non-color shape indicators and ARIA already present in `StatusPill`/`ComboboxCellEditor`.

---

## 6. Suggested phasing

| Phase | Items | Outcome | Rough effort |
|---|---|---|---|
| **1 — "Dropdowns that work"** | R1, R2, R3 | Every select cell shows real options + a chip + a caret. Biggest perceived jump. | ~1 sprint |
| **2 — "Full type system"** | R4, R5, R6, R9 | Tags chips, date pickers, value-filter menus, invalid flags. | ~1–2 sprints |
| **3 — "Smart chips"** | R7, R8 | Entity hover cards + group-by subtotals. The premium feel. | ~2 sprints |

Each phase is independently shippable and visible. Because the foundation (AG Grid, schema registry, combobox editor, chip component, backend options procedure) already exists, this is overwhelmingly **integration and rendering work, not new infrastructure**.

---

## 7. Risks & considerations

- **Performance:** Always-on chip renderers and hover cards on virtualized rows must stay cheap. AG Grid recycles cells — keep renderers pure and memoized; lazy-load hover-card data on hover only.
- **Edit ergonomics:** Making cells one-click-to-open can fight range-selection/fill. Preserve the Sheets convention: single click selects, click-on-caret (or Enter) opens. Don't regress the fill handle / paste flows.
- **A11y is already a strength — don't lose it.** `StatusPill` ships non-color shape indicators and `ComboboxCellEditor` ships full ARIA combobox semantics. Every generalized renderer must inherit these, not reinvent them.
- **Schema is the source of truth.** All of this should be declared in `entity-schemas.ts` (color maps, option sources, smart-chip targets) so the grid stays "the table IS the view" — no per-view bespoke cell code.
- **Scope discipline:** R7 (smart chips) is the most expensive and most differentiating. If time-boxed, ship Phase 1 first and measure; it may deliver most of the felt improvement on its own.

---

## Appendix — key files

| File | Role | Most relevant gap |
|---|---|---|
| `src/client/components/OperatorGrid.tsx` | AG Grid wrapper, renderer enhancers | G2/G3 — only status gets a chip renderer |
| `src/client/hooks/useColumnDefs.ts` | Schema → ColDef factory | G1 — `options: []` `// future`; G4 — `tags` no-op; G5 — no date editor |
| `src/client/components/editors/ComboboxCellEditor.tsx` | Dropdown editor (typeahead, create, async) | Built & strong, but starved of options |
| `src/client/components/StatusPill.tsx` | Status chip | Generalize → universal chip renderer |
| `src/client/config/entity-schemas.ts` | Field types & `comboboxSource` | Needs option sources + chip palettes declared |
| `src/server/routers/queries.ts` (`comboboxOptions`) | Backend option source | Exists, tested, **never called from client** |
| `src/shared/tags.ts` | Tag normalization | Backend for tag chips ready |
| `src/client/components/{RelationshipDrawer,ContextDrawer}.tsx` | Entity detail | Reuse to power smart-chip hover cards |
