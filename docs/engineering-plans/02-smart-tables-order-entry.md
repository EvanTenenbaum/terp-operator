# Plan 2 — Smart Tables & Order-Entry UX

**Type:** Large UX initiative (two interleaved workstreams)
**State:** 📄 Design only — five docs, no code
**Registry anchor:** rides the Mercury UX retrofit; propose Linear issues per phase (CAP/CMD TBD).

---

## 1. Source design docs (on `codex/grid-rows-repair-20260624`)

Carry these to `main` with the **P1** PR (design lands with first code):

| Doc | Role |
|---|---|
| `docs/ux/smart-tables-master-plan.md` | **Canonical** reconciled plan (read this first). Corrected per AQA. |
| `docs/ux/smart-tables-deep-design.md` | Smart-cell taxonomy, schema-engine spec, command-bus binding. |
| `docs/ux/smart-tables-report.md` | Executive overview, R1–R9 recommendations. |
| `docs/ux/smart-tables-aqa.md` | Adversarial QA — the corrections that make the others trustworthy. |
| `docs/research/order-entry-ui-patterns.md` | ERP precedents (ERPNext/Odoo), the inline-comfort-boundary finding, sources. |

## 2. Thesis (one paragraph)

Keep the editable AG-Grid backbone; evolve it on two axes. **Axis 1 (all grids):** make
cells feel like Google Sheets smart tables — status/enum **chips**, working
**dropdowns**, entity **smart-chips with hover cards**, inline **date** pickers, **tag**
multi-selects — each rendered as the *visible surface of the audited command bus* so
every inline edit is an optimistic, reason-stamped, reversible command. **Axis 2 (PO/SO
order entry):** the ERP-verified hybrid — a typeahead/barcode **quick-add** row on top,
and **heavy dependent-logic per-line fields pushed into `DetailSlideover`**. The unifying
rule is the **inline comfort boundary**: simple independent single-field edits become
smart cells; multi-field, side-effecting, dependent computations move to the side panel.
All inside ≤8 visible columns, the green-accent palette, `ag-theme-quartz`, and the
in-flight Mercury retrofit — additive phases, not a rewrite.

## 3. What already exists (build, don't rebuild — ~70% of parts)

- `OperatorGrid.tsx` wrapper + `useColumnDefs.ts` driven by `entity-schemas.ts`; field
  types `text|numeric|currency|date|boolean|enum|combobox|tags` already declared.
- `StatusPill.tsx` (tone map + non-color shapes), auto-applied via `withStatusRenderer`.
- `ComboboxCellEditor.tsx` (678 lines) — typeahead, keyboard nav, `allowCreate`, async
  `onSearch`, per-cell `saving/saved/error`, full ARIA. **Starved:** `useColumnDefs`
  wires `options: []` with a `// future` comment.
- `queries.comboboxOptions` — tested server proc for 11 entity types. **Never called
  from the client.**
- `tag_catalog` + `parseTagInput`/`normalizeTagSlug` — tag backend ready.
- `DetailSlideover` + tab registry (`tabs/registry.ts`); command bus + `useCommandRunner`.

**The gap is integration and rest-state affordances, not infrastructure.**

## 4. Pre-flight blockers (resolve before the phases they gate — from AQA)

These are corrections the AQA forced into the plan. Treat as deliverables, not assumptions:

- **F1 — Role projection does NOT exist today.** `internalMargin` (sales) and `unitCost`
  (intake/receipt) carry no `minRole`; `OperatorGrid`/`useColumnDefs` don't hide columns
  by role (only the *command palette* filters actions). This is a **latent data-exposure
  gap independent of this work — raise it as its own issue now.** Smart-chip hover cards
  (P5) must do **server-side field gating themselves**. Role projection is gated *before* P5.
- **F2 — "Legal next states" is net-new work.** `statuses.ts` is a flat enum with no
  transition data; real transitions are hardcoded server-side in `commandBus.ts`, not
  exported. **Decide the source before P1:** export the server transition map, or derive
  next-state from `entity-actions.ts`. Interim: dropdown offers the full enum and relies
  on the server's existing transition rejection.
- **F3/F6 — Migration split.** Live components are `GridView` (`PrimaryGridView` is an
  alias) and `DetailSlideover` (`ContextDrawer` is `@deprecated`). Some views still use
  the deprecated `GridJourney`. **Land smart-cell work in the schema/`useColumnDefs` path**
  so both `GridView` and `GridJourney` callers inherit it. Don't add a third context surface.
- **F4 — PO has no typeahead.** PO has only a *manual* historical-product quick-add;
  Sales already has `SaleLineItemTypeahead`. PO→typeahead parity is the biggest entry gap (P2).
- **F8 — Sales per-line detail is inline today;** `DetailSlideover` shows *order-level*
  detail. "Push per-line fields to the slide-over" **changes its granularity** — it is not
  relocating an existing panel.

## 5. The schema engine (the additive core — `entity-schemas.ts`)

All behavior is *declared*, never coded per-view. Additive `FieldDefinition` props:

```ts
optionSource?:
  | { kind: 'status' }                                          // legal next-states
  | { kind: 'enum'; values: EnumOption[] }                      // method, direction, role…
  | { kind: 'combobox'; entityType: ComboboxEntityType; filters?: ComboboxFilters }
  | { kind: 'tags' };
chip?:      { palette?: PaletteName; multiple?: boolean; allowCreate?: boolean };
smartChip?: { target: EntityType; idField: string; previewTab?: string };
command?:   { name: string; payload: (row, value) => object; reason?: (row, value) => string };
signal?:    (row) => 'none' | 'warning' | 'danger';             // passive amber/danger only
```

`useColumnDefs.ts` reads these and assembles renderer + editor + `cellEditorParams`. A
thin `comboboxOptionsToOptions` adapter (`sublabel→description`, `disabledReason→disabled`)
is the only new glue. Command binding: on commit → optimistic chip + `saving` →
`useCommandRunner.run(command.name, payload, auto-reason)` → settle green/rollback red →
reversible via `reversedByCommandId`.

## 6. Roadmap — six phases (two workstreams, interleaved so each ships value)

WS-1 = smart cells (all grids, from report+deep-design). WS-2 = order entry (PO/SO, from research).

| Phase | WS | Items | Lands in | Effort |
|---|---|---|---|---|
| **P1 — Dropdowns that work** | 1 | Wire `comboboxOptions`→`useColumnDefs` (R1); `withStatusRenderer`→`withChipRenderer` for all enums (R2); hover-caret affordance (R3); legal-transition status dropdown (needs F2 decision) | `useColumnDefs.ts`, `OperatorGrid.tsx`, `StatusPill.tsx`, `styles.css`, schema `optionSource` | ~1 sprint |
| **P2 — PO quick-add parity** | 2 | Search-as-you-type quick-add on PO (reuse `SaleLineItemTypeahead`, F4); keyboard entry shortcuts | `PurchaseOrdersView.tsx`, `shortcuts/registry.ts` | ~0.5–1 sprint |
| **P3 — Full type system** | 1 | Tags multi-select (R4); inline date + overdue signal (R5); boolean pill; filter-by-values menu (R6); at-rest invalid flag (R9) | new `cellRenderers/`, `useColumnDefs.ts`, schema `chip`/`signal`, `FilterToolbar.tsx` | ~1–2 sprints |
| **P4 — Lean the order grid** | 2 | Push heavy per-line fields PO/SO → `DetailSlideover` (changes granularity, F8); row expansion for GP/COGS; extend `SalePrePostStrip` validation | `SalesView.tsx`, `PurchaseOrdersView.tsx`, tab registry | ~1–2 sprints |
| **P5 — Smart chips** | 1 | Entity smart-chip + hover card reusing DetailSlideover registry (R7); **role-projected** previews (gated on F1); click-through | new `EntityChipCell`, hover-card popover, schema `smartChip` | ~2 sprints |
| **P6 — Spreadsheet + entry power** | 1+2 | Group-by + subtotals (R8); smart paste; bulk chip edit; barcode quick-add uniform PO/SO; filter-views framing | `FilterToolbar`, `OperatorGrid`, `BulkActionBar`, `uiStore.ts` | ~1–2 sprints |

**Sequencing logic:** P1 closes the three reasons TERP doesn't *feel* like Sheets (empty
dropdowns, inert cells, text-only enums) for the cost of wiring existing parts — ship
first, measure. P2 is the cheapest high-value entry win. P5 is the expensive
differentiator; if time-boxed, P1–P4 carry most of the felt improvement.

## 7. Constraints every change is checked against

≤8 visible columns (Issue #31); no new colors (fixed palette + StatusPill tones); no
custom AG theme (`ag-theme-quartz` only); all writes via command bus (no per-view
`onCellCommit` — being deleted); schema is single source of truth; one-system rule (hover
cards reuse the DetailSlideover registry, no new drawer); preserve `undoRedoCellEditing`,
`cellSelection`/range, fill handle, `/` filter, `⌘K`, `]`, `1–5`; role projection survives;
a11y parity (shape indicators, combobox ARIA, reduced-motion, locale-pinned formatters).

## 8. Risks

- Perf on virtualized rows → pure/memoized renderers, hover-card fetch only on ≥400ms intent, no per-row state.
- Edit-vs-select conflict → strict single-click-selects / caret-opens; lock with tests so fill/range never regress.
- Journal noise → auto-reasons for routine sets; material changes via `confirmationRequired`.
- Role leakage via hover cards → previews request only role-permitted fields server-side (depends on F1).
- Scope creep on P5 → it's the costly piece; P1–P4 carry most value.

## 9. Per-phase Definition of Done

Each phase: TDD-first; tests green; coverage meets `.coverage-thresholds.json`; no
regression to the preserved grid behaviors (§7); design-review gate passed for the phase;
ships behind the Mercury retrofit surfaces (no forked track). **P1 must not start until
the F2 transition-source decision is made; P5 must not start until F1 role projection ships.**
