# TERP Operator — Tables & Order-Entry UX Master Plan

**Status:** Canonical unified plan. Supersedes nothing — *integrates* three inputs without dropping anything.
**Date:** 2026-06-25
**Owner:** Evan + eng + design
**AQA:** Adversarially verified against the codebase — see `docs/ux/smart-tables-aqa.md`. This document has been **corrected** per that report (role projection, status-transition data, live component names, PO quick-add, retrofit completeness). Claims below reflect the corrected state.

## 0. Provenance — what this unifies (nothing dropped)

This master plan folds together three documents. All three remain in the repo as the detailed record; this document is the single reconciled plan over them.

| # | Source doc | What it contributes | Preserved in this plan |
|---|---|---|---|
| A | `docs/ux/smart-tables-report.md` | Executive overview of making tables feel like Google Sheets smart tables; the R1–R9 recommendations; phases 1–3 | §5, §8, Appendix C (R-crosswalk) |
| B | `docs/ux/smart-tables-deep-design.md` | Deep design: the command-bus thesis, smart-cell taxonomy, the schema engine, S1–S4, constraints, per-entity map | §2, §3, §5, §8, Appendices A/B |
| C | `docs/research/order-entry-ui-patterns.md` | Web+codebase research on PO/SO **order entry**: keep-the-grid hybrid, ERP precedents, the inline-comfort-boundary finding, typeahead/barcode/keyboard/panel recommendations, sources | §2, §6, §7, §8, Appendix D (verbatim sources) |

**Reconciliation note.** Docs A/B argue for *richer inline cells* (chips, dropdowns, pickers). Doc C warns that *inline editing degrades for complex, dependent-logic rows* (the 23-column Sales line). These are not in conflict — together they define a boundary. §2.3 turns that into the spine of the plan.

---

## 1. One-paragraph thesis

**The editable AG-Grid is the correct backbone — keep it — and evolve it along two axes at once.** Axis 1 (read/scan/light-edit, *all* grids): make cells feel like the latest Google Sheets smart tables — status/enum **chips**, working **dropdowns**, **entity smart-chips with hover cards**, inline **date** pickers, **tag** multi-selects — implemented as the *visible surface of TERP's audited command bus* so every inline edit is an optimistic, reason-stamped, reversible command. Axis 2 (heavy order entry, *PO/SO line creation*): adopt the ERP-verified hybrid — a **search-as-you-type / barcode quick-add** row on top, and **push heavy, dependent-logic per-line fields out of the grid into the `DetailSlideover`** you already have. The unifying rule is the **inline comfort boundary**: simple, independent, single-field edits become delightful smart cells; multi-field, side-effecting, dependent computations move to the side panel. Everything stays inside ≤8 visible columns, the green-accent palette, the `ag-theme-quartz` theme, and the in-flight Mercury UX retrofit, so it ships as additive phases, not a rewrite.

---

## 2. The three tensions and how the plan resolves them

### 2.1 Sheets is free-form; TERP is audited (from B)
Google Sheets writes directly to a cell. TERP routes **every** mutation through a reversible, reason-bearing command bus (`ARCH-12`; `command_journal: pending→ok→failed`, reversible via `reversedByCommandId`), treats **≤8 visible columns** as a convention (documented + manually audited; *not* lint-enforced — audit stale 2026-06-12), and fixes the palette. *(AQA note: the per-view `onCellCommit` path is still live today in PO/SO views; the schema-driven command path is the retrofit target, not yet complete. Role-based column projection of margin/cost is **not yet implemented** — see §2.1a — so it is a requirement of this work, not an existing guarantee.)* Naively "making cells freely editable" would destroy the audit trail and reversibility that are the product's reason to exist.

> **Resolution:** chips and dropdowns are the **presentation layer of the command bus.** A chip is the rendered state of a field; clicking opens a type-aware picker; choosing a value dispatches a command via `useCommandRunner`; the cell shows the `saving→saved→error` states `ComboboxCellEditor` already implements; failures roll back optimistically. The operator *feels* a spreadsheet; the system *records* an audited command. Sheets' `⌘Z` becomes TERP's reversible command — strictly stronger.

### 2.1a Role projection is a requirement, not an existing guarantee (AQA F1)
The plan needs margin/cost columns and hover-card fields to be hidden from roles that may not see them. **Today they are not.** `internalMargin` (sales) and `unitCost` (intake/receipt) carry **no `minRole`**, and `OperatorGrid`/`useColumnDefs` do **not** hide columns by role (only the command palette filters *actions* by role). So: (a) this is a **latent data-exposure gap that exists independent of this plan** and should be raised on its own; and (b) the smart-chip hover cards (P5) must implement **server-side field gating themselves** — they cannot assume the column layer already projects by role. Treat role projection as a deliverable, gated before P5.

### 2.2 Richer cells vs. the inline-editing ceiling (B vs. C)
Doc C's decisive, adversarially-verified finding: *"inline editing is the least-friction approach" was refuted 2/3 for over-generalizing.* Inline stays low-friction **only** for quick, single-field, low-stakes edits (correct a typo, toggle a status, pick from a dropdown). It degrades for rows with many fields, confirmation needs, or **side effects / dependent logic** — precisely TERP's 23-column Sales line (pricing floors, landed-cost resolution, credit, vendor-approval). Odoo itself **switches a line from inline grid to a per-line form** once it carries enough fields/side-effects.

> **Resolution — the inline comfort boundary.** Doc B's smart-cell taxonomy *is* the "low-friction inline zone": status/enum chips, single FK select, date, boolean, tag-set — each one field, each independent, each a single command. Doc C's "push heavy fields to the panel" *is* the other side of the same boundary. They compose: the lean grid carries the comparison + light-edit columns as smart cells; the `DetailSlideover` absorbs the heavy, dependent, computed fields. One principle, two homes.

### 2.3 The spine: lean grid + smart cells + side-panel depth + fast quick-add
Putting 2.1 and 2.2 together gives the operating model for *every* TERP grid:

```
┌── Quick-add row (typeahead / barcode / keyboard) ─────────────┐  ← Axis 2 (entry)
├── Lean grid: ≤8 comparison columns, each a SMART CELL ────────┤  ← Axis 1 (Sheets feel)
│     chip · dropdown · entity smart-chip · date · bool · tags  │     = command-bus surface
│     (the low-friction inline zone)                            │
│   row expansion → occasional detail (GP/COGS breakdown)       │  ← Axis 2 (ERPNext pattern)
└───────────────────────────────────────────────────────────────┘
        click a smart-chip / open a row
                 ↓
        DetailSlideover (right): heavy, dependent, computed per-line fields  ← boundary's far side
        + hover-card preview of the same entity (one context system)
```

---

## 3. Constraints honored (the rules every recommendation is checked against)

From `docs/design-system/` + the decisions log:

1. **≤8 visible data columns** (Issue #31). Richness comes from smarter cells + expansion + DetailSlideover, never more columns.
2. **No new colors** (`INDEX.md`): `ink #18211f`, `panel #f7f8f5`, `field #ffffff`, `line #d8ded6`, `accent #216e4e`, `amber #b06915`, `danger #b42318` + existing `StatusPill` tone families.
3. **No custom AG Grid theme** — `ag-theme-quartz` + Tailwind + existing `--ag-*` vars.
4. **All writes via the command bus** (`ARCH-12`) — through `useCommandRunner`, not a per-view `onCellCommit` switch (being deleted).
5. **Schema is the single source of truth** (`ARCH-8`): behavior declared in `entity-schemas.ts`; custom renderers are stable exports under `src/client/components/cellRenderers/`.
6. **One-system rule** (`templates.md`): six jobs, one home each. Hover cards reuse the DetailSlideover tab registry; no new drawer system.
7. **Preserve operator-critical grid behavior** — `undoRedoCellEditing`, `cellSelection` (range), fill handle, `/` quick filter, `⌘K` palette, `]` drawer, `1–5` tabs.
8. **Role projection survives** — smart chips/hover cards never leak `internalMargin`/`unitCost` to roles that can't see them.
9. **A11y parity** — keep `StatusPill` shape indicators (circle/diamond/square) and `ComboboxCellEditor` ARIA; honor `prefers-reduced-motion`; keep locale-pinned `formatTs`/`formatMoney`.
10. **Ride the Mercury retrofit (partially executed)** — land in `entity-schemas.ts` / `entity-actions.ts` / `useColumnDefs.ts` / `OperatorGrid.tsx` / `tabs/registry.ts`; don't fork a parallel track. *Live component names (AQA F3/F6): the grid template is `GridView` (`templates/GridView.tsx`; `PrimaryGridView` is an exported alias), the drawer is `DetailSlideover` (`ContextDrawer` is present but `@deprecated`), and `SlideOver`/standalone `PrimaryGridView` files do **not** exist. The retrofit is partial — views are split between the new `GridView` and the deprecated `GridJourney`, and `entity-schemas`/`entity-actions` are populated for the PurchaseOrder pilot with others scaffolded. Do not add a third context surface.*

---

## 4. Current state (combined grounding)

### 4.1 The grid stack and what already exists (from A/B)
- **AG Grid** (Community + Enterprise 32.3.3) behind one wrapper `OperatorGrid.tsx`, fed by `useColumnDefs.ts` from `entity-schemas.ts`. Field types exist: `text | numeric | currency | date | boolean | enum | combobox | tags`.
- **`StatusPill.tsx`** — chip with tone map + non-color shapes, auto-applied to `status` via `withStatusRenderer`.
- **`ComboboxCellEditor.tsx`** (678 lines) — strong dropdown: typeahead, keyboard nav, `allowCreate`, async `onSearch`, per-cell `saving/saved/error`, full ARIA. **Starved today:** `useColumnDefs.ts` wires `options: []` with a `// future` comment.
- **`queries.comboboxOptions`** — tested server procedure for 11 entity types (`customer, vendor, staff, item, batch, tag, transactionType, purchaseOrder, salesOrder, invoice, vendorBill`) returning `{ id, label, sublabel?, status?, availableQty?, balance?, disabledReason? }`. **Never called from the client.**
- **`tag_catalog`** (`slug, label, color, is_active`) + `parseTagInput`/`normalizeTagSlug`. Tag-chip backend ready.
- **DetailSlideover + tab registry** (`src/client/components/tabs/registry.ts`); **command bus** + `useCommandRunner` (optimistic, toast, targeted invalidation).

> The gap is integration and rest-state affordances — not infrastructure. ~70% of the smart-table parts already exist.

### 4.2 Order-entry grounding — PO vs SO today (from C)
Both flows use **AG Grid Enterprise** in `OperatorGrid`, inline edits committed via `onCellCommit` over tRPC.

| | Purchase Order | Sales Order |
|---|---|---|
| File | `src/client/views/PurchaseOrdersView.tsx` | `src/client/views/SalesView.tsx` (+ `sales/SalesBuildMode.tsx`, flag-gated) |
| Surface | Editable grid, ~10 pre-seeded draft rows | Editable grid, customer-scoped |
| Columns | ~14 | **22** (AQA-verified; doc C said ~23), many custom renderers (markup, derived COGS, landed-cost exception, pick status…) |
| Quick-add | **Manual historical-product buttons** (no typeahead) | **`SaleLineItemTypeahead` (UX-F03)** + inventory-finder slide-over |
| Per-line detail | Right context panel | inline `SaleLineExceptionControls`; `DetailSlideover` is **order-level** today |

**Key observations (AQA-corrected):** Sales is already ~60% toward the recommended hybrid (typeahead quick-add + slide-over exist). **PO has a *manual* historical quick-add but no search-as-you-type — bringing PO to typeahead parity is the biggest entry gap** (AQA F4). A 22-column inline grid is past the verified inline-comfort boundary. Note (AQA F8): on Sales, per-line detail is currently **inline controls**, and `DetailSlideover` shows **order-level** detail — so "push per-line fields to the slide-over" changes its granularity, it isn't a relocation of an existing panel.

---

## 5. Part I — Smart cells everywhere (the Google Sheets feel)

*Source: A + B. This is Axis 1 — applies to every grid.*

### 5.1 The smart-cell taxonomy
Each archetype is declared by a field's `type` in `entity-schemas.ts`; each renders the same at rest whether or not it's editable (editable adds the picker). Full rest/hover/edit/commit/error/a11y/bulk behavior is in **`docs/ux/smart-tables-deep-design.md` §3**; summary:

1. **Single-select chip — `enum` (incl. `status`).** Rest = chip (reuse `StatusPill` tones). Hover (editable+`canWrite`) = `ChevronDown` caret. Open via Enter/caret/typing → `ComboboxCellEditor` popup. **Status dropdown should offer only legal next states** — Sheets-grade validation, TERP-grade correctness. *(AQA F2: `statuses.ts` is a **flat enum** with no transition data; the real transition rules live server-side in `commandBus.ts`, hardcoded per command and not exported client-side. So "legal next states" is **net-new P1 work** — export the server transition map or derive next-state from `entity-actions.ts`. Interim: the dropdown offers the full enum and relies on the **server's existing transition rejection**.)* Commit → command. Bulk: "Apply to N selected" → one bulk command via `BulkActionBar`/`StatusActionBar`.
2. **Multi-select tag chips — `tags`.** Today a no-op. Rest = ≤3 catalog-colored chips + `+N`. Edit = multi-select `ComboboxCellEditor` fed by `comboboxOptions('tag')`; `allowCreate` mints a tag via `createTag` command (writes `tag_catalog`, no orphan free-text). Entities: `batch, item, customer, vendor, purchaseOrderLine`.
3. **Entity smart-chip + hover card — FK columns.** Rest = quiet bordered chip on the joined name (`vendorName`, `customerName`, `itemName`, `batchCode`). Hover (~400ms) = lazy-loaded, **role-projected** preview (customer: balance vs limit + open orders; vendor: open bills + terms; batch: avail qty + status + location). Click = open in **DetailSlideover** on the entity's default tab (same registry components — one context system, two depths).
4. **Inline date — `date`.** Hover = calendar caret; edit = calendar popover with relative hints ("5 days overdue"); overdue `dueDate` gets `text-amber` at rest (passive aging signal, token only).
5. **Boolean toggle pill — `boolean`.** `Yes`=emerald-quiet, `No`=zinc; single click toggles (binary, no picker) → command. Entities: `packed, inventoryPosted, labelsPrinted, active, consignmentDefault, isActive`.
6. **Numeric / currency.** Keep right-aligned `tabular-nums` + `formatMoney`; surface the existing range sum/avg/min/max more prominently; editable numerics keep the amber `editable-cell` cue + smart paste (§5.4).

### 5.2 The column-type engine — extend `FieldDefinition` (additive)
Declare behavior in the schema; never per-view. Full spec in deep-design §4. Additive props:

```ts
interface FieldDefinition {
  // existing: field, headerName, type, width, sortable, filterable, editable,
  //   attentionTier, pinned, minRole, comboboxSource (declared, unused)
  optionSource?:
    | { kind: 'status' }                       // legal next-states from statuses.ts
    | { kind: 'enum'; values: EnumOption[] }   // method, direction, role…
    | { kind: 'combobox'; entityType: ComboboxEntityType; filters?: ComboboxFilters }
    | { kind: 'tags' };
  chip?: { palette?: PaletteName; multiple?: boolean; allowCreate?: boolean };
  smartChip?: { target: EntityType; idField: string; previewTab?: string };
  command?: { name: string; payload: (row, value) => object; reason?: (row, value) => string };
  signal?: (row) => 'none' | 'warning' | 'danger';  // passive at-rest, amber/danger only
}
```
`comboboxOptions` output maps onto the editor with a thin `comboboxOptionsToOptions` adapter (`sublabel→description`, `disabledReason→disabled`).

### 5.3 Command-bus binding (the audit-safe edit path)
On commit: (1) **optimistic** chip + `saving`; (2) **dispatch** `useCommandRunner.run(command.name, payload(row,value), reason)` with **auto-reason** (`"Set {headerName} to {value} on {entityLabel} (inline)"`) — no typing for routine edits, journal still complete; material changes route through `entity-actions.ts` `confirmationRequired`; (3) **settle** green flash on `ok`, rollback + red tooltip + Recovery toast on `failed`; (4) **reversible** via `reversedByCommandId`. Status transitions constrained, never free. Role projection filters options/fields.

### 5.4 Interaction model (inside the existing shell)
- **Hover-caret affordance** — CSS-only chevron on `:hover/:focus-within` for editable chip/date columns. The single cheapest decisive win (cells finally *look* interactive).
- **Click semantics** — single click selects (range/fill preserved); caret/Enter/type opens; Esc closes (then existing Escape layering). Keeps `cellSelection`, fill, `⌘C/⌘V` intact.
- **Type-aware column header menu** — **filter-by-values** (checkbox list + counts via AG Set Filter) for enum/status/tags; **group-by** (Enterprise row grouping + currency subtotals) behind one `FilterToolbar` control, default off. No added visible columns.
- **Inline create-new** routes through a catalog-writing command (no orphans).
- **Smart paste** — TSV → option values with validation; unmatched flag amber + "create?".
- **Bulk chip edit** — select rows → chip → "Apply to N" → one reason-stamped bulk command (the one selection-verb home).
- **Hover card ↔ DetailSlideover continuity** — preview = card; click = DetailSlideover, same registry components.

### 5.5 Visual spec, a11y, group-by/filter-views
Chip 18–20px at 28px rows (`text-[11px]`, `px-2`, `rounded`), never forces row height; entity chip = quiet `border-line bg-white` + 8px kind-glyph; tag color quantized to nearest tone (no raw hex); caret `ChevronDown 14 text-zinc-500` fade; hover card = `context-drawer-card` + 180ms fade; overdue = `text-amber`/`text-danger`. A11y: shape indicators on every chip, full combobox ARIA on multi-select, keyboard-openable hover cards, reduced-motion gates, locale-pinned formatters. Filter-views = re-present existing `SavedFiltersDropdown`/`gridAdvancedFilters` as named views; group-by virtualized (I3).

---

## 6. Part II — Order entry (PO/SO line creation): the ERP-verified hybrid

*Source: C. This is Axis 2 — applies to the PO and SO entry grids specifically.*

### 6.1 The verdict (verified)
**Don't rip out the grid — augment it.** Every source-examinable ERP doing serious line-item entry (ERPNext/Frappe, Odoo) uses an **editable data grid as the backbone**, like TERP. The grid is correct for dense, comparison-heavy transactional data. The evolution target is the *plain, everything-inline, 23-column* grid → **grid + typeahead quick-add + side-panel detail**.

### 6.2 ERP precedents (preserved, with confidence)
- **ERPNext / Frappe** *(HIGH, primary):* Sales Order entry is a child-doctype editable grid (`frappe/datatable`, virtualized); **Rate auto-populates** from Item Prices, overwritable inline; **master-detail row expansion** holds dense per-line data (billed amount, valuation rate, gross profit) instead of more columns; **auto-fill down** (row 1 delivery date copies down); **barcode quick-add** uniform across PO & SO (scan inserts line at top, re-scan increments qty). *= the hybrid, shipped.*
- **Odoo** *(HIGH, primary+corroborating):* inline-editable `one2many` list with autocomplete Many2One product picker firing async RPC; **critically, enabling richer per-line features (secondary UoM, packaging, line properties) switches the line from inline grid to a per-line form dialog** — config-driven. *The single most relevant precedent for the 23-column Sales line.*
- **Dynamics 365 Commerce POS** *(HIGH, primary):* split-pane — product/category button grid + search + barcode on one side, receipt (sales lines) on the other; ML recommendations; full/compact layouts.
- **Lightspeed Retail** *(HIGH, primary):* keyboard-driven rapid entry — `Alt+I` jump to Add-Item, `Alt+2` new sale, `Alt+3` item search, `Alt+C` customer.
- **CS-Cart POS** *(MEDIUM, vendor):* catalog-picker + cart; click/scan/search → cart.
- **Coverage gap (honest):** Dolibarr, Tryton, Apache OFBiz, Medusa, Metasfresh, Ever Gauzy were **not** examined — treat as "not examined," not "no good pattern."

### 6.3 Verified UX principles (preserved)
- **Editable table is right** *(upheld 3/0)* when users compare attributes across rows, sort, need many fields visible — i.e. PO/SO line entry.
- **Where inline breaks** *(the refuted-overreach finding):* "inline editing is least-friction" **REFUTED 2/3** — scoped to *quick* single-field edits only. Rows with extra data/confirmation/**side effects** → **side panel / row-detail / modal**. Inline "becomes difficult for complex tables with many fields," "not suitable for larger text," and works cleanly **only when rows are independent** — TERP's pricing-floor/landed-cost/credit logic is the flagged anti-pattern.
- **Cards/lists** are for browsing catalogs, not dense comparative entry — *not* a replacement.
- **Autocomplete/search-as-you-type** is the right primitive for catalog pick: suggestions on focus, categories+products w/ thumbnail/price/availability, full keyboard nav, debounce + virtualize.

### 6.4 Order-entry recommendations (preserved, priority order)
1. **Bring the PO screen to typeahead parity** — it has a *manual* historical-product quick-add (`PurchaseOrdersView.tsx:222-232,494-505`) but **no search-as-you-type**. Mirror Sales `SaleLineItemTypeahead`: focus → suggestions (recent vendors' products first) → Enter drops a line. *Biggest single entry win, low risk, reuses an existing pattern.*
2. **Move heavy per-line fields out of the grid into `DetailSlideover`** — follow Odoo's escalation rule: lean grid = product, qty, price/cost, line total, status (the comparison columns); markup, landed-cost resolution, price-floor reasons, vendor-approval, notes → row-detail panel. *Directly attacks the 23-column problem.*
3. **Barcode/SKU quick-add, uniform across PO & SO** (ERPNext-style: new SKU → new line, repeat → increment qty). *Value depends on physical-SKU workflow.*
4. **Keyboard-driven entry** (Lightspeed model): documented shortcut to jump to quick-add, Enter-to-commit-and-advance, arrow nav. *Brokers live on the keyboard.*
5. **ERPNext-style row expansion** for occasional detail (GP/COGS breakdown) rather than more columns. *Complements #2.*
6. **Strengthen inline validation surfacing** (pinned top-of-view message / row-background change) — grid validation is a known weak spot and TERP lines have dependent logic. *Extend the existing `SalePrePostStrip`.*

**What NOT to do (preserved):** don't replace the order grid with cards/list; don't move to a pure catalog-picker+cart for the *order document itself* (POS model fits fast retail checkout, not multi-attribute brokerage lines with cost ranges/floors/credit). Borrow the catalog+cart's *quick-add and split-pane ideas*, not its data model.

---

## 7. How Parts I and II compose (the lean order grid)

The two parts meet at the inline comfort boundary. For the PO/SO entry grids specifically, that yields a concrete column disposition:

| Field group | Where it goes | Mechanism |
|---|---|---|
| Product / item | **Smart cell** (entity smart-chip) + **quick-add row** | §5.1.3 + §6.4.1 |
| Qty, price/cost, line total | **Smart cell** (editable numeric, command-bound) | §5.1.6 |
| Line status | **Smart cell** (status chip, legal transitions) | §5.1.1 |
| Vendor / customer (header & per-line ref) | **Smart cell** (entity smart-chip + hover card) | §5.1.3 |
| Markup, derived COGS, landed-cost resolution, price-floor reason, vendor-approval, notes | **DetailSlideover** (heavy/dependent) | §6.4.2 |
| GP / COGS breakdown (occasional) | **Row expansion** | §6.4.5 |
| Validation (dependent logic) | **Pinned strip** (`SalePrePostStrip` extended) | §6.4.6 |

Result: ≤8 lean comparison columns, each a smart cell, with depth in the panel and speed in the quick-add — Sheets feel + ERP-grade entry, on one grid, audited end-to-end.

---

## 8. Unified roadmap

Two workstreams that share surfaces; sequence interleaves so each phase ships visible value. WS-1 (Smart cells, all grids — from A/B's S1–S4 + R1–R9). WS-2 (Order entry, PO/SO — from C's 1–6). Crosswalk in Appendix C.

| Phase | Workstream | Items | Lands in | Effort |
|---|---|---|---|---|
| **P1 — Dropdowns that work** | WS-1 | Wire `comboboxOptions`→`useColumnDefs` (R1); `withStatusRenderer`→`withChipRenderer` for all enums (R2); hover-caret (R3); legal-transition status dropdown | `useColumnDefs.ts`, `OperatorGrid.tsx`, `StatusPill.tsx`, `styles.css`, schema `optionSource` | ~1 sprint |
| **P2 — PO quick-add parity** | WS-2 | Search-as-you-type quick-add on PO (C#1); extend keyboard entry (C#4) | `PurchaseOrdersView.tsx`, reuse `SaleLineItemTypeahead`, `registry.ts` | ~0.5–1 sprint |
| **P3 — Full type system** | WS-1 | Tags multi-select (R4); inline date + overdue signal (R5); boolean pill; filter-by-values menu (R6); at-rest invalid flag (R9) | `useColumnDefs.ts`, new `cellRenderers/`, schema `chip`/`signal` | ~1–2 sprints |
| **P4 — Lean the order grid** | WS-2 | Push heavy per-line fields to `DetailSlideover` (C#2); row expansion for GP/COGS (C#5); extend `SalePrePostStrip` validation surfacing (C#6) | `SalesView.tsx`, `PurchaseOrdersView.tsx`, tab registry, `SalePrePostStrip` | ~1–2 sprints |
| **P5 — Smart chips** | WS-1 | Entity smart-chip + hover card reusing DetailSlideover registry (R7); role-projected previews; click-through | new `EntityChipCell`, hover-card popover, schema `smartChip` | ~2 sprints |
| **P6 — Spreadsheet + entry power** | WS-1+2 | Group-by + subtotals (R8); smart paste; bulk chip edit; barcode quick-add uniform PO/SO (C#3); filter-views framing | `FilterToolbar`, `OperatorGrid`, `BulkActionBar` | ~1–2 sprints |

**Sequencing logic:** P1 closes the three reasons TERP doesn't *feel* like Sheets (empty dropdowns, inert-looking cells, text-only enums) for the cost of *wiring existing parts* — ship first, measure. P2 is the cheapest high-value entry win (PO has no quick-add). P5 (smart chips) is the expensive differentiator; if time-boxed, P1–P4 likely deliver most of the felt improvement.

---

## 9. Non-goals & risks (combined)

**Non-goals:** not free-form/bypass-the-command-bus editing; not >8 visible columns; not new colors or custom AG theme; not a new drawer/hover system parallel to DetailSlideover; not converting form-bearing views (`InventoryView`) to pure inline grids; not replacing the order grid with cards/list or a pure catalog-cart for the order document.

**Risks & mitigations:**
- *Perf on virtualized rows* — pure/memoized renderers; hover-card fetch only on ≥400ms intent; no per-row state (cells recycle).
- *Edit-vs-select conflict* — strict single-click-selects / caret-opens; lock with tests so fill/range never regress.
- *Journal noise* — auto-reasons for routine field sets; material changes via `confirmationRequired` in `entity-actions.ts`.
- *Role leakage via hover cards* — previews request only role-permitted fields server-side (registry filter + tRPC procedure; CPO audit F11).
- *Inline validation on dependent lines* — known weak spot; surface via pinned strip, not per-cell only (C#6).
- *Scope creep on P5* — smart chips are the costly piece; P1–P4 carry most felt value.
- *(AQA F1) Latent role-exposure gap* — margin/cost columns currently render for **all** roles (no `minRole`, no column-level role filtering). Fix role-based column projection before P5's hover cards; consider raising it as its own issue now.
- *(AQA F2) Transition-map dependency* — "legal next states" needs a client-reachable transition map (export from `commandBus` or derive from `entity-actions`); decide the source before P1. Interim relies on server-side rejection.
- *(AQA F6) Migration split* — some views still use the deprecated `GridJourney`; land smart-cell work in the schema/`useColumnDefs` path so both `GridView` and `GridJourney` callers inherit it, and don't assume all views are schema-driven yet.

---

## Appendix A — Per-entity smart-cell assignment (from B; tier-0/1 only)

| Entity | Status chip | Entity smart-chip | Tags | Date picker | Enum select |
|---|---|---|---|---|---|
| `purchaseOrder` | `status` (legal transitions) | `vendorName`, `orderedBy` | — | `expectedDate`, `orderedAt` | `paymentTerms` |
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

## Appendix B — File touchpoints (combined)

| File | Change | WS |
|---|---|---|
| `src/client/config/entity-schemas.ts` | Add `optionSource`/`chip`/`smartChip`/`command`/`signal`; annotate columns (App. A) | 1 |
| `src/client/hooks/useColumnDefs.ts` | Replace `options:[]` `// future` with real sources; assemble renderer+editor; `comboboxOptionsToOptions` adapter | 1 |
| `src/client/components/OperatorGrid.tsx` | `withStatusRenderer`→`withChipRenderer`; smart-chip + hover card; preserve range/fill/undo | 1 |
| `src/client/components/StatusPill.tsx` | Extract `chipTone(value, palette)`; keep shapes | 1 |
| `src/client/components/editors/ComboboxCellEditor.tsx` | `multiple` mode; consume `comboboxOptions` shape | 1 |
| `src/client/components/cellRenderers/` (new) | `EntityChipCell`, `TagsChipCell`, `BooleanPillCell`, `DateCell` (stable exports) | 1 |
| `src/client/components/tabs/registry.ts` | Hover-card reuses registered overview-tab components | 1 |
| `src/server/routers/queries.ts` | `comboboxOptions` exists; add missing types/enums if needed | 1 |
| `src/client/components/FilterToolbar.tsx` | Type-aware filter-by-values + group-by | 1 |
| `src/client/styles.css` | Hover-caret, chip sizing, hover-card card; no new colors | 1 |
| `src/client/store/uiStore.ts` | Persist group-by state per view | 1 |
| `src/client/views/PurchaseOrdersView.tsx` | Typeahead quick-add (reuse `SaleLineItemTypeahead`); barcode; lean columns; row expansion | 2 |
| `src/client/views/SalesView.tsx` (+ `sales/SalesBuildMode.tsx`) | Push heavy per-line fields to `DetailSlideover`; lean columns; barcode | 2 |
| `SalePrePostStrip` (extend) | Stronger dependent-logic validation surfacing | 2 |
| `src/client/shortcuts/registry.ts` | Quick-add / commit-and-advance shortcuts | 2 |

## Appendix C — Recommendation crosswalk (nothing dropped)

| ID | Source | Recommendation | Phase |
|---|---|---|---|
| R1 | A/B | Wire dropdowns to `comboboxOptions` | P1 |
| R2 | A/B | Generalize chip renderer to all enums | P1 |
| R3 | A/B | Hover-caret affordance | P1 |
| R4 | A/B | Tags multi-select chip cell | P3 |
| R5 | A/B | Inline date picker (+overdue) | P3 |
| R6 | A/B | Filter-by-values column menu | P3 |
| R7 | A/B | Entity smart-chip + hover card | P5 |
| R8 | A/B | Group-by + subtotals | P6 |
| R9 | A/B | At-rest invalid-value flag | P3 |
| C1 | C | PO search-as-you-type quick-add | P2 |
| C2 | C | Push heavy per-line fields to DetailSlideover | P4 |
| C3 | C | Barcode quick-add (PO+SO uniform) | P6 |
| C4 | C | Keyboard-driven entry | P2 |
| C5 | C | Row expansion for GP/COGS detail | P4 |
| C6 | C | Strengthen inline validation surfacing | P4 |
| — | B | Command-bus binding / auto-reason / reversibility | P1 (foundational) |
| — | B | Smart paste; bulk chip edit | P6 |

## Appendix D — Sources (from C, preserved verbatim)

**Primary / source-examinable:**
- ERPNext Sales Order — https://docs.frappe.io/erpnext/sales-order
- ERPNext barcode entry — https://docs.frappe.io/erpnext/track-items-using-barcode
- ERPNext barcode quick-add PR #15329 — https://github.com/frappe/erpnext/pull/15329
- Frappe DataTable (grid source) — https://github.com/frappe/datatable
- Odoo view architectures — https://www.odoo.com/documentation/19.0/developer/reference/user_interface/view_architectures.html
- Odoo OWL components — https://www.odoo.com/documentation/18.0/developer/reference/frontend/owl_components.html
- Odoo line form↔inline mode — https://www.odoo.com/forum/help-1/how-to-switch-sales-order-line-from-form-mode-back-to-line-mode-62850
- Odoo sale_product_field / OWL extension — https://dev.to/jeevanizm/odoo-owl-framework-extend-and-customize-component-and-widget-47jj
- Dynamics 365 Commerce POS layouts — https://learn.microsoft.com/en-us/dynamics365/commerce/pos-screen-layouts
- Lightspeed Retail keyboard shortcuts — https://retail-support.lightspeedhq.com/hc/en-us/articles/228839547-Keyboard-shortcuts

**UX pattern authorities:**
- Enterprise data tables (when to leave inline) — https://www.pencilandpaper.io/articles/ux-pattern-analysis-enterprise-data-tables
- Inline editing in tables — https://uxdworld.com/inline-editing-in-tables-design/
- Inline editing + validation — https://uxdworld.com/inline-editing-and-validation-in-tables/
- Table vs List vs Cards — https://uxpatterns.dev/pattern-guide/table-vs-list-vs-cards
- Autocomplete UX — https://smart-interface-design-patterns.com/articles/autocomplete-ux/
- Autocomplete pattern (dev) — https://uxpatterns.dev/patterns/forms/autocomplete
- PatternFly inline edit guidelines — https://www.patternfly.org/components/inline-edit/design-guidelines/
- Order-entry redesign case study — https://www.kimpascarelli.com/ux-design-for-order-entry-system

**Secondary (POS/catalog-cart):**
- CS-Cart POS — https://webkul.com/blog/cs-cart-point-of-sale-pos/
- Lightspeed Restaurant POS layout — https://o-series-support.lightspeedhq.com/hc/en-us/articles/31329442916891-Design-your-POS-look-and-layout

*Not examined (coverage gap): Dolibarr, Tryton, Apache OFBiz, Medusa, Metasfresh, Ever Gauzy.*

---

### Read next
- Full smart-cell behavior & schema spec → `docs/ux/smart-tables-deep-design.md`
- Executive overview & gap analysis → `docs/ux/smart-tables-report.md`
- Order-entry research detail & confidence flags → `docs/research/order-entry-ui-patterns.md`
