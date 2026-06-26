# Smart Tables for TERP Operator — Deep UI/UX Design

**Companion to:** `docs/ux/smart-tables-report.md` (the executive overview)
**Audience:** Evan + eng + design
**Date:** 2026-06-25
**Scope:** A complete, system-grounded design for making every TERP grid feel like the latest Google Sheets *smart tables* (chips, dropdowns, inline pickers, smart-chip hover cards) — **without breaking the audited-command paradigm, the ≤8-column rule, the green-accent palette, or the in-flight Mercury UX retrofit.**

> **⚠ AQA correction (2026-06-25):** This document was adversarially verified; some claims here were overstated or used planning-stage names. Canonical, corrected guidance lives in `docs/ux/smart-tables-master-plan.md`; full findings in `docs/ux/smart-tables-aqa.md`. Key fixes: **role projection of margin/cost is NOT implemented today** (a requirement, not a guarantee); **"only legal next states" is new work** (`statuses.ts` is a flat enum; transitions are server-side only); the live components are **`DetailSlideover`** and **`GridView`** (not `SlideOver`/standalone `PrimaryGridView`); the ≤8-col rule is a manually-audited convention, not lint-enforced. Read this doc for the design detail, the master plan for the corrected facts.

---

## 0. The central tension (and how we resolve it)

Google Sheets and TERP Operator have opposite mutation models:

| | Google Sheets | TERP Operator |
|---|---|---|
| Edit model | Free-form, direct cell write | **Audited, reversible, reason-bearing commands** via the command bus (`ARCH-7`, `ARCH-12`) |
| Source of truth | The cell | The command journal (`command_journal`: `pending → ok → failed`, reversible via `reversedByCommandId`) |
| Validation | Optional data-validation rules | Schema + `commandBus` state machines; role-projected columns (margin/cost hidden from operator) |
| Columns | Unlimited | **≤8 visible data columns** (Issue #31 audit), progressive disclosure via expansion/SlideOver |

So we are **not** going to make TERP cells freely typeable. That would destroy the audit trail, the reversibility, and the role projections that are the product's reason to exist. The handoff record is explicit that `InventoryView` was *deliberately* left form-bearing and that per-view `onCellCommit` is an anti-pattern being removed.

**The resolution — the thesis of this document:**

> Treat the smart-table affordances (chips, dropdowns, inline pickers, hover cards) as the **presentation layer of the command bus.** A chip is the rendered state of a field; clicking it opens a type-aware picker; choosing a value **dispatches a reversible, reason-stamped command** through `useCommandRunner`; the cell shows the existing `saving → saved → error` states the `ComboboxCellEditor` already implements; failures roll back optimistically. The operator *feels* like they're editing a spreadsheet; the system *records* an audited command. Nobody gives anything up.

Everything below follows from that one idea.

---

## 1. Design constraints this design honors (explicitly)

These are non-negotiable rules pulled from `docs/design-system/` and the decisions log. Every recommendation is checked against them.

1. **≤8 visible data columns** (`grids.md`, Issue #31). New cell richness must *not* add columns. Density comes from making existing cells smarter, plus expansion/SlideOver for overflow.
2. **No new colors** (`INDEX.md`). The palette is `ink #18211f`, `panel #f7f8f5`, `field #ffffff`, `line #d8ded6`, `accent #216e4e`, `amber #b06915`, `danger #b42318`, plus the existing `StatusPill` tone families (slate/amber/emerald/blue/sky/violet/indigo/zinc/red/stone). Chips reuse these.
3. **No custom AG Grid theme.** `ag-theme-quartz` only; customization via Tailwind on the wrapper and `--ag-*` vars already in `styles.css`.
4. **All writes via the command bus** (`ARCH-12`). Cell editors commit through `useCommandRunner`, not a per-view `onCellCommit` switch (which is being deleted).
5. **Schema is the single source of truth** (`ARCH-8`, "the table IS the view"). New cell behavior is *declared* in `entity-schemas.ts`, never coded per-view. Custom renderers become stable component exports under `src/client/components/cellRenderers/`, referenced by name.
6. **One-system rule** (`templates.md`). Six UI jobs, one home each. Hover cards reuse the SlideOver tab registry; they don't spawn a new drawer system.
7. **Preserve operator-critical grid behavior** — `undoRedoCellEditing`, `cellSelection` (range), fill handle, `/` quick filter, `⌘K` palette, `]` drawer, `1–5` tabs. Don't regress them.
8. **Role projection survives.** A smart chip or hover card must never leak a column the viewer/operator role can't see (`internalMargin`, `unitCost`).
9. **A11y parity.** Keep `StatusPill`'s non-color shape indicators (circle/diamond/square) and `ComboboxCellEditor`'s full ARIA combobox semantics; honor `prefers-reduced-motion`; keep locale-pinned formatters.
10. **Plug into the Mercury retrofit, don't fork it.** Land changes in `entity-schemas.ts` / `entity-actions.ts` / `useColumnDefs.ts` / `OperatorGrid.tsx` / the tab registry — the surfaces the retrofit already moves through.

---

## 2. What already exists (so we build, not rebuild)

From the codebase audit — TERP already has ~70% of the primitives:

- **AG Grid** (Community + Enterprise) behind one wrapper `OperatorGrid.tsx`, fed by `useColumnDefs.ts` from `entity-schemas.ts`. Field types already exist: `text | numeric | currency | date | boolean | enum | combobox | tags`.
- **`StatusPill.tsx`** — chip with tone map + non-color shape indicators, auto-applied to `status` columns via `withStatusRenderer`.
- **`ComboboxCellEditor.tsx`** (678 lines) — a genuinely strong dropdown: typeahead, keyboard nav, `allowCreate`, async `onSearch`, per-cell `saving/saved/error` state, ARIA-complete. **Today it's starved: `useColumnDefs.ts` wires `options: []` with a `// future` comment.**
- **`queries.comboboxOptions`** — server procedure, permission-scoped, tested, supporting 11 entity types (`customer, vendor, staff, item, batch, tag, transactionType, purchaseOrder, salesOrder, invoice, vendorBill`), returning `{ id, label, sublabel?, status?, availableQty?, balance?, disabledReason? }`. **Never called from the client.**
- **`tag_catalog`** (`slug, label, color, is_active`) + `parseTagInput`/`normalizeTagSlug` in `shared/tags.ts`. Backend for tag chips is ready.
- **SlideOver + tab registry** (`src/client/components/tabs/registry.ts`) — the home for hover-card content.
- **Command bus** + `useCommandRunner` (optimistic, toast on success/error, targeted cache invalidation).

The gap is integration and rendering, not infrastructure.

---

## 3. The smart-cell taxonomy

This is the heart of the design: a small set of **cell archetypes**, each declared by a field's `type` in `entity-schemas.ts`, each with a defined rest / hover / focus / edit / commit / error / a11y behavior. Every archetype renders the *same at rest whether or not the column is editable* — the difference is whether the picker opens.

### 3.1 Single-select chip cell — `enum` (incl. `status`)

The workhorse. Status is just its first instance; generalize it to every enum.

- **Rest:** a chip (reuse `StatusPill` tone system) showing the value, e.g. `confirmed`, `scheduled`, `cash`. Non-status enums get a neutral tone unless a palette is declared. Non-color shape indicator preserved.
- **Hover (editable + `canWrite`):** a 14px `ChevronDown` caret fades in at the cell's right edge (CSS-only, `opacity` transition, respects reduced-motion). This is the single change that makes a cell *look* interactive — the #1 reason TERP doesn't feel like Sheets today.
- **Focus / open:** `Enter`, click-on-caret, or typing a printable char opens `ComboboxCellEditor` as a popup anchored to the cell. Options come from the field's source (see §4). Single click on the cell *selects* it (preserves range/fill); it does **not** open — this reconciliation keeps fill-handle and range-copy intact.
- **Commit:** choosing an option calls `useCommandRunner` with the field's declared command (§5). Cell shows `Loader2` spinner → green `Check` flash (800ms) → settles. On the status column specifically, the chosen value is *constrained to legal transitions* (next-state set from `statuses.ts`), so the dropdown only offers reachable states — Sheets-grade validation, TERP-grade correctness.
- **Error:** red border + inline tooltip (already built into `ComboboxCellEditor`), optimistic value rolls back, toast offers "Open in Recovery."
- **Bulk:** select N rows of the same status, open the chip on any one → the picker offers "Apply to N selected" → one bulk command through `BulkActionBar`/`StatusActionBar` (the existing selection-verb surface). This is Sheets' "edit one, fill many" but audited.
- **Entities:** `status` on every entity; `method`/`direction` on `payment`/`vendorPayment`; `paymentTerms` on `purchaseOrder`; `role`/`workLoop` on `user`; `category`/`subcategory` on `customerNeed`/`vendorSupply` (these are already `editable`).

### 3.2 Multi-select tag-chip cell — `tags`

Currently a no-op (`case 'tags':` returns the base ColDef; tags render as raw `a-b-c` slugs).

- **Rest:** up to ~3 small chips colored from `tag_catalog.color` (mapped onto the nearest palette tone — no new raw colors), then a `+N` overflow chip. Empty shows a faint "—".
- **Edit:** a multi-select variant of `ComboboxCellEditor` (`multiple: true`) fed by `comboboxOptions(entityType:'tag')`. Selected tags show as removable chips in the editor; typeahead filters the catalog; **`allowCreate: true`** lets the operator mint a new tag inline — which dispatches a `createTag` command (writes `tag_catalog`) *then* applies it, so the catalog stays the source of truth (no orphan free-text tags).
- **Commit:** `setTags` command with the full new array (idempotent), reason auto-stamped.
- **Entities:** `batch`, `item`, `customer`, `vendor`, `purchaseOrderLine` (the five `text[]` tag columns).

### 3.3 Entity smart-chip + hover card — foreign-key columns

The biggest "wow," and the most TERP-native. Today FK columns render the SQL-joined *name* as plain text (`vendorName`, `customerName`, `itemName`); raw IDs are tier-2 hidden.

- **Rest:** the name rendered as a subtle entity chip (bordered, `line` color, no fill — quieter than a status pill so a row of them stays calm). A tiny leading glyph denotes the entity kind (vendor/customer/item/batch), mirroring the existing alias-dot convention in `grids.md`.
- **Hover:** after ~400ms, a **hover card** (popover) shows a compact entity summary — for a customer: balance vs. credit limit + open orders count; for a vendor: open bills + terms; for a batch: available qty + status + location. **Data lazy-loads on hover** (one scoped tRPC call), and **respects role projection** — the card renders only fields the current role may see.
- **Click:** opens the entity in the **SlideOver** (existing 5→4-state drawer) on its default tab — *exactly* the existing entity-context behavior, now reachable directly from the cell instead of only via the row menu. The hover card is literally a mini-preview of the SlideOver's overview tab; it reuses the same tab-registry components, honoring the one-system rule.
- **Why this fits TERP:** the operator's day is "who is this customer / is this batch still available / what does this vendor's aging look like" — answered inline, no navigation. It's the single highest-leverage interaction in the product.
- **Entities/columns:** `vendorName`(→vendor), `customerName`(→customer), `itemName`(→item), `batchCode`(→batch), `assignedTo`/`orderedBy`/`reviewedBy`/`actorName`(→staff), plus parent refs (`poNo`,`orderNo`,`invoiceNo`,`billNo`).

### 3.4 Inline date cell — `date`

- **Rest:** locale-pinned `formatTs(..., 'short')` (unchanged).
- **Hover (editable):** small calendar glyph caret.
- **Edit:** a calendar popover (AG Grid `agDateCellEditor` styled to quartz, or a small Tailwind calendar) anchored to the cell; relative hints ("in 3 days", "5 days overdue") shown for due/expected dates to aid aging scans.
- **Commit:** date-set command. Overdue dates (`dueDate < today` on `invoice`/`vendorBill`) get an amber text treatment at rest — a passive aging signal, reusing the `amber` token, no new color.
- **Entities:** `expectedDate`, `dueDate`, `scheduledFor`, `neededBy`, `availableDate`, etc. Most are tier-1 read-only today; the picker only appears where the schema marks the field editable.

### 3.5 Boolean toggle chip — `boolean`

- **Rest:** today `Yes/No` text. Upgrade to a compact pill — `Yes` in emerald-quiet, `No` in zinc — keeping the centered alignment.
- **Edit (editable):** single click toggles (it's binary; no picker needed), dispatching a command. Read-only booleans stay as quiet pills.
- **Entities:** `packed`, `inventoryPosted`, `labelsPrinted`, `active`, `consignmentDefault`, `isActive`.

### 3.6 Numeric / currency cell — `numeric` / `currency`

These stay mostly as-is (right-aligned, `tabular-nums`, `formatMoney`), but gain two Sheets-isms already partly present:

- **Range aggregation** is already live (sum/avg/min/max on cell-range selection) — surface it more prominently in the selection summary strip.
- **Editable numerics** (qty/price on matchmaking board, line editors) keep the amber `editable-cell` cue and commit via command. **Smart paste** (§6.5) maps pasted columns to fields with validation.

---

## 4. The column-type engine — extend `entity-schemas.ts`

All of the above is *declared*, not coded per-view. We extend the `FieldDefinition` type with a few optional, additive props. Nothing existing changes; unspecified fields behave as today.

```ts
// src/client/config/entity-schemas.ts  (additive fields on FieldDefinition)
interface FieldDefinition {
  // ...existing: field, headerName, type, width, sortable, filterable,
  //    editable, attentionTier, pinned, minRole, comboboxSource (already declared, unused)

  /** Where a single/multi-select gets its options. Drives the dropdown. */
  optionSource?:
    | { kind: 'status' }                       // legal next-states from statuses.ts
    | { kind: 'enum'; values: EnumOption[] }   // static (method, direction, role…)
    | { kind: 'combobox'; entityType: ComboboxEntityType; filters?: ComboboxFilters }
    | { kind: 'tags' };                        // tag_catalog via comboboxOptions

  /** Render the value(s) as chips at rest. Palette reuses StatusPill tones. */
  chip?: { palette?: PaletteName; multiple?: boolean; allowCreate?: boolean };

  /** Mark this as an entity reference → smart chip + hover card + SlideOver click-through. */
  smartChip?: { target: EntityType; idField: string; previewTab?: string };

  /** The command dispatched on edit-commit (honors ARCH-12; no per-view onCellCommit). */
  command?: { name: string; payload: (row, value) => object; reason?: (row, value) => string };

  /** Passive at-rest signal, e.g. overdue dates. Reuses amber/danger tokens only. */
  signal?: (row) => 'none' | 'warning' | 'danger';
}
```

`useColumnDefs.ts` reads these and assembles the right renderer + editor + `cellEditorParams`. The editor's existing props map almost 1:1 onto `comboboxOptions`' output:

| `comboboxOptions` field | `ComboboxOption` prop | Use |
|---|---|---|
| `label` | `label` | primary text |
| `sublabel` | `description` | dimmed secondary (vendor name, status) |
| `disabledReason` | `disabled` + tooltip | "Out of stock" un-selectable |
| `availableQty` / `balance` | `description` enrichment | inline qty/balance hint |

A thin adapter (`comboboxOptionsToOptions`) is the only new glue. Async columns pass `onSearch: (q) => trpc.queries.comboboxOptions(...)`; small enums pass a static `options` array.

**Net:** one schema edit per column turns a plain-text cell into a chip + working dropdown + audited command. The per-entity assignment table is in Appendix A.

---

## 5. Binding chips to the command bus (the audit-safe edit path)

This is what keeps TERP TERP. When a smart cell commits:

1. **Optimistic apply** — the cell shows the new chip immediately and enters `saving` (the `ComboboxCellEditor` already has this state).
2. **Dispatch** — `useCommandRunner.run(field.command.name, field.command.payload(row, value), reason)`.
   - **Reason auto-generation:** `"Set {headerName} to {value} on {entityLabel} (inline)"`, e.g. `"Set status to scheduled on Bill #1043 (inline)"`. Operators never type a reason for routine inline edits, but the journal still has one — satisfying the audit requirement *and* the Sheets-speed requirement.
   - For changes the state machine flags as material (e.g. reversing a posting), `entity-actions.ts` can set `confirmationRequired: true` → a `ConfirmRoot` step appears, exactly as bulk actions already do. The chip respects the same state machine as the action bar.
3. **Settle** — on `ok`: green `Check` flash, `command_journal` row `ok`. On `failed`: rollback the optimistic chip, red border + tooltip, toast with "Copy details / Open in Recovery" (existing `useCommandRunner` behavior).
4. **Reversibility** — because it's a real command, it's already undoable through Recovery (`reversedByCommandId`) — inline edits get the same safety net as everything else. Sheets' `⌘Z` becomes TERP's *reversible command*, which is strictly stronger.

**Status transitions are constrained, not free.** The status dropdown offers only legal next states (from `statuses.ts` per entity). You cannot set a `paid` bill back to `open` by fat-fingering a chip — the option isn't shown. This is Sheets data-validation, enforced by the domain.

**Role projection at the edit layer.** The dropdown and hover card filter options/fields by `minRole`. An operator editing a `sale` never sees `internalMargin`; a viewer sees chips but no caret (read-only), because `canWrite` already gates the affordance.

---

## 6. Interaction model — deepening within the existing shell

All of this lives inside the current shell (SideNav lanes `⌘1–⌘6`, Keel `⌘K`, SlideOver `]`, tabs `1–5`, `/` quick filter). No new global surfaces.

### 6.1 The hover-caret affordance (the cheap, decisive win)
A CSS-only chevron at the cell's right edge on `:hover`/`:focus-within` for any editable chip/date column. Cells finally *advertise* themselves. ~20 lines in `styles.css` + a `cellClass` flag from `useColumnDefs`. Respects `prefers-reduced-motion`.

### 6.2 Click semantics that don't fight the grid
- **Single click:** select cell (range/fill preserved).
- **Click on caret / `Enter` / type:** open picker.
- **`Esc`:** close picker (then the existing Escape layering: overlay → drawer → palette).
This is the documented Sheets convention and it leaves `cellSelection`, fill handle, and `⌘C/⌘V` untouched (a hard "don't" in `grids.md`).

### 6.3 Type-aware column header menu
Extend the existing Columns menu with type-appropriate actions, **without adding visible columns**:
- **Filter by values** (enum/status/tags): a checkbox list with live counts — wire AG Grid Set Filter (already used for `boolean`) to these types. This is the Sheets filter-chip feel, and it complements the existing status pill / `FilterPresetStrip` rather than replacing them.
- **Group by this column** (enum/status/entity): AG Grid Enterprise row grouping with currency subtotals per group — Sheets' "group by." Surface it behind a single toolbar control (`FilterToolbar`), default off, so the ≤8-column scan stays primary.
- **Change density / pin / hide** — already present.

### 6.4 Inline "create new" that respects catalogs
`allowCreate` on tag and select cells, but a created value always routes through a command that writes the catalog (`tag_catalog`, reference data) — never a free-text orphan. Keeps the dropdowns canonical.

### 6.5 Smart paste
Pasting TSV into a dropdown/tags column maps text → option values (case-insensitive label/slug match), validates against the option set, and dispatches one bulk command. Unmatched cells flag amber with a "create?" affordance instead of silently writing garbage. Extends the existing paste support, which already validates ranges.

### 6.6 Bulk chip edit
Select rows → open a chip → "Apply to N selected." Routes to `BulkActionBar`/`StatusActionBar` (the one home for selection verbs), producing a single reason-stamped bulk command. The chip becomes a faster on-ramp to the bulk verbs operators already use.

### 6.7 Hover card ↔ SlideOver continuity
Hover card = preview; click = SlideOver open on the same entity, same tab components (registry). One context system, two depths. No new drawer.

---

## 7. Visual specification (within the palette)

- **Chip sizing at 28px compact rows:** chip height 18–20px, `text-[11px]`, `px-2`, `rounded` (match `StatusPill`). At 42px standard rows, chips stay the same; vertical padding grows. Never let a chip force row height up.
- **Entity smart chip:** `border border-line bg-white text-ink`, leading 8px kind-glyph, no fill — deliberately quieter than status pills so a row dense with entity refs stays calm (honors the Mercury "calm, dense" aesthetic).
- **Status / enum chip:** existing `StatusPill` tones; unknown enums → `bg-zinc-50 text-zinc-800 border-zinc-300` (the existing fallback).
- **Tag chip:** `tag_catalog.color` quantized to the nearest existing tone family (no raw new hex into the grid).
- **Caret:** `ChevronDown size={14} text-zinc-500`, `opacity-0 group-hover:opacity-100 transition-opacity`.
- **Editable cue:** keep the existing `.editable-cell` amber inset for editable text/numeric; chips carry their own affordance (caret) so they don't need the amber wash.
- **Hover card:** `context-drawer-card` styling (`border border-line bg-white p-3 shadow-lg`), max-width ~320px, 180ms fade (the existing drawer easing), reduced-motion safe.
- **Overdue/at-risk signal:** `text-amber` for warning, `text-danger` for hard-overdue — tokens only.
- **No custom AG Grid theme**; all of this is renderer + Tailwind + the existing `--ag-*` vars.

---

## 8. Accessibility (preserve, don't regress)

- **Chips:** keep `StatusPill`'s non-color shape indicators (circle=active, diamond=warning, square=inactive) on *every* chip archetype, plus `sr-only` category text.
- **Dropdowns:** `ComboboxCellEditor` already ships full ARIA combobox semantics (`role="combobox"`, `aria-expanded`, `aria-activedescendant`, live region). Multi-select variant must extend, not bypass, these.
- **Hover cards:** also openable via keyboard (focus the chip → `Enter` opens SlideOver; a dedicated key or focus-delay opens the preview); never hover-only.
- **Keyboard:** every smart-cell action reachable without a mouse; integrate with the shortcut registry (`registry.ts`) rather than ad-hoc handlers.
- **Locale:** keep pinned `formatTs`/`formatMoney` (no device-locale drift).
- **Reduced motion:** carets, flashes, hover-card fades all gated on `prefers-reduced-motion`.

---

## 9. Group-by & filter-views (the last Sheets-isms)

- **Filter views → saved filters.** TERP already has `SavedFiltersDropdown`/`SavedFiltersManager` (server-persisted) + `gridAdvancedFilters`. Re-present them as named "views" in `FilterToolbar` to match Sheets' filter-views mental model — mostly a labeling/UX framing change over existing infra.
- **Group by → AG Grid Enterprise row grouping** behind one toolbar control, currency subtotals per group, collapsed by default. Respects ≤8 columns (grouping doesn't add data columns) and I3 (virtualized).

---

## 10. Phased roadmap (rides the Mercury retrofit)

Each phase is independently shippable, visible, and lands in the surfaces the retrofit already touches — no competing track.

| Phase | Theme | Items | Where it lands | Effort |
|---|---|---|---|---|
| **S1** | **Dropdowns that work** | Wire `comboboxOptions` into `useColumnDefs` (R1); generalize `withStatusRenderer` → `withChipRenderer` for all enums (R2); hover-caret affordance (R3); status dropdown constrained to legal transitions | `useColumnDefs.ts`, `OperatorGrid.tsx`, `StatusPill.tsx`, `styles.css`, schema `optionSource` | ~1 sprint |
| **S2** | **Full type system** | Tags multi-select chip cell (R4); inline date picker + overdue signal (R5); boolean toggle pill; type-aware filter-by-values menu (R6); at-rest invalid flag (R9) | `useColumnDefs.ts`, new `cellRenderers/`, schema `chip`/`signal` | ~1–2 sprints |
| **S3** | **Smart chips** | Entity smart-chip + hover card reusing SlideOver tab registry (R7); click-through; role-projected previews | new `EntityChipCell`, hover-card popover, tab registry, schema `smartChip` | ~2 sprints |
| **S4** | **Spreadsheet power** | Group-by + subtotals (R8); smart paste (R-paste); bulk chip edit → BulkActionBar; filter-views framing | `FilterToolbar`, `OperatorGrid`, `BulkActionBar` | ~1–2 sprints |

**Sequencing note:** S1 alone closes the three problems that make TERP not *feel* like Sheets (empty dropdowns, inert-looking cells, text-only enums) for the cost of *wiring existing parts*. Ship it first and measure before committing to S3/S4.

---

## 11. Non-goals & risks

**Explicit non-goals (so scope doesn't drift):**
- **Not** making cells free-form editable / bypassing the command bus.
- **Not** exceeding 8 visible data columns to show more chips.
- **Not** introducing new colors or a custom AG Grid theme.
- **Not** building a new drawer/hover system parallel to SlideOver.
- **Not** converting form-bearing views (e.g. `InventoryView`'s in-page tools) into pure inline-edit grids — that was a deliberate decision.

**Risks & mitigations:**
- *Perf on virtualized rows* — always-on chips + hover lazy-loads must stay cheap; keep renderers pure/memoized; hover-card fetch only on intent (≥400ms dwell). AG Grid recycles cells, so renderers must not hold per-row state.
- *Edit-vs-select conflict* — strictly: single-click selects, caret/Enter opens. Lock this with tests so fill/range never regress.
- *Reason-stamp noise in the journal* — auto-reasons are fine for routine field sets; material state changes still route through `confirmationRequired`. Keep the line via `entity-actions.ts`, not ad-hoc.
- *Role leakage via hover cards* — the preview must request only role-permitted fields server-side (defense in depth: registry filter + tRPC procedure), per CPO audit F11.
- *Scope creep on S3* — entity hover cards are the expensive, differentiating piece; if time-boxed, S1+S2 likely deliver most of the felt improvement.

---

## Appendix A — Per-entity smart-cell assignment (starter map)

Columns map to archetypes by their existing `type` + role. (Tier-0/1 only; tier-2 audit fields unchanged.)

| Entity | Status chip (3.1) | Entity smart chip (3.3) | Tags (3.2) | Date picker (3.4) | Enum select (3.1) |
|---|---|---|---|---|---|
| `purchaseOrder` | `status` (→ legal transitions) | `vendorName`, `orderedBy` | — | `expectedDate`, `orderedAt` | `paymentTerms` |
| `sale` | `status` | `customerName` | — | `orderedAt`, `fulfilledAt` | — |
| `batch` (intake/inventory) | `status` | `itemName`, `vendorName` | `tags` | `intakeDate` | `uom` |
| `payment` | `status` | `customerName` | — | — | `method`, `direction` |
| `invoice` | `status` | `customerName` | — | `dueDate` (overdue signal) | — |
| `vendorBill` | `status` | `vendorName` | — | `dueDate`, `scheduledFor` | — |
| `customer` | — | — | `tags` | — | `pricingRule` |
| `vendor` | — | — | `tags` | — | — |
| `item` | `status` | — | `tags` | — | `category` |
| `pickList` | `status` | `assignedTo` | — | — | — |
| `fulfillmentLine` | `status` | — | — | — | — |
| `customerNeed` (editable) | `status` | `customer` | — | `neededBy` | `category`, `subcategory` |
| `vendorSupply` (editable) | `status` | `vendor` | — | `availableDate` | `category`, `subcategory` |
| `matchmakingMatch` | `status` | `reviewedBy` | — | — | — |
| `user` | — | — | — | — | `role`, `workLoop` |

## Appendix B — File touchpoints

| File | Change |
|---|---|
| `src/client/config/entity-schemas.ts` | Add `optionSource`, `chip`, `smartChip`, `command`, `signal` to `FieldDefinition`; annotate columns per Appendix A |
| `src/client/hooks/useColumnDefs.ts` | Replace `options: []` `// future` with real sources; assemble renderer+editor from new props; `comboboxOptionsToOptions` adapter |
| `src/client/components/OperatorGrid.tsx` | Generalize `withStatusRenderer` → `withChipRenderer`; wire smart-chip + hover card; preserve range/fill/undo |
| `src/client/components/StatusPill.tsx` | Extract `chipTone(value, palette)` shared util; keep shape indicators |
| `src/client/components/editors/ComboboxCellEditor.tsx` | Add `multiple` mode for tags; consume `comboboxOptions` shape (sublabel→description, disabledReason→disabled) |
| `src/client/components/cellRenderers/` (new) | `EntityChipCell`, `TagsChipCell`, `BooleanPillCell`, `DateCell` as stable exports (per ARCH-3) |
| `src/client/components/tabs/registry.ts` | Hover-card reuses registered overview-tab components |
| `src/server/routers/queries.ts` | `comboboxOptions` already exists; add any missing entity types (e.g. `paymentTerms` enum) if needed |
| `src/client/components/FilterToolbar.tsx` | Type-aware "filter by values" + "group by" controls |
| `src/client/styles.css` | Hover-caret, chip sizing, hover-card card; no new colors |
| `src/client/store/uiStore.ts` | Persist group-by state per view (sibling to existing column prefs) |

---

### One-paragraph summary

TERP already has the smart-table *parts* — chips, a strong dropdown editor, a tested options backend, a tag catalog, a SlideOver, a command bus. What it lacks is the wiring and the rest-state affordances, and what it must never lose is the audited-command paradigm. This design makes **chips and dropdowns the visible surface of the command bus**: every inline edit is an optimistic, reason-stamped, reversible command; every dropdown is fed by `comboboxOptions`; every entity reference becomes a hover-card chip that previews and deep-links into the existing SlideOver. It stays inside ≤8 columns, the green palette, quartz theme, and the in-flight Mercury retrofit — so it ships as additive phases (S1 wiring first) rather than a rewrite.
