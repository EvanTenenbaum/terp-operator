# Adversarial QA — Smart-Tables / Order-Entry Master Plan

**Subject:** `docs/ux/smart-tables-master-plan.md` (and its sources `smart-tables-report.md`, `smart-tables-deep-design.md`, `../research/order-entry-ui-patterns.md`)
**Method:** 4 independent adversarial verifiers, fresh context, "assume wrong until the code proves it," `file:line` evidence required; high-stakes refutations re-confirmed directly by the orchestrator.
**Date:** 2026-06-25
**Verdict:** **Thesis SOUND; ship after corrections.** The plan's central argument — *"the smart-table parts mostly exist; the gap is wiring + rest-state affordances; edits ride the command bus"* — is **fully verified**. But the plan contains **3 HIGH** and **5 MEDIUM** accuracy defects that overstate current capabilities or mis-name live components. Several turn "free reads from existing data" into "new work," so they also affect effort. Corrections have been applied to the master plan (see §5); the two source docs carry a pointer to this report.

---

## 1. Scoreboard

| Severity | Count | IDs |
|---|---|---|
| HIGH (changes the plan / would mislead implementers) | 3 | F1, F2, F3 |
| MEDIUM (qualifies a claim / affects effort) | 5 | F4–F8 |
| LOW (precision) | 4 | F9–F12 |
| **Confirmed correct** (load-bearing claims that held) | 18 | see §4 |

The bulk of the plan verified clean. The defects cluster in two places: **(a) capabilities the plan treats as *existing* that are actually *planned/absent* (role projection, legal-transition data), and (b) component names taken from the decisions-log (planning) rather than the live tree.**

---

## 2. HIGH-severity findings

### F1 — Role projection of margin/cost is NOT implemented (REFUTED)
**Plan claimed:** "Role projection hides `internalMargin` from operator on sales and `unitCost` from operator on inventory" — repeated as existing fact and as constraint #8 ("role projection survives").
**Reality:** `entity-schemas.ts:274` (`internalMargin`) and `:362` (`unitCost`) set **no `minRole`**. The only `minRole` in a schema is `orderedBy` (`:199`, `manager`). `useColumnDefs.ts:168-169` merely *copies* `minRole` onto the ColDef; **no code hides a column by role** — `OperatorGrid` does not filter columns on `minRole`. CommandPalette filters *actions* by role, not grid columns.
**Impact:** (a) The plan's "hover cards are safe because columns are already role-projected" guarantee is false — it must be **built**. (b) There is a **latent data-exposure gap today**: cost/margin render for all roles. This should be raised independently of this plan.
**Correction:** Recast role projection from an existing guarantee to a **requirement + pre-existing gap**; the smart-chip hover-card work must implement server-side field gating itself, not assume it.

### F2 — "Only legal next states" has no client-side data to stand on (PARTIAL / overstated)
**Plan claimed:** the status dropdown "offers only legal next states (from `statuses.ts`)."
**Reality:** `src/shared/statuses.ts` is **flat `z.enum(...)` only** — no transition map (its own header comment says transitions live in the command bus). The real transition rules are **server-side, hardcoded per command** in `commandBus.ts` (e.g. `validTransitions` for needs) and are **not exported or reusable client-side**. `entity-actions.ts` lists actions per state but has **no explicit `nextStatus`**.
**Impact:** Constraining the dropdown to legal next states is **net-new work** (export the server transition map, or derive next-state from `entity-actions`), not a free read. Affects P1 scope/effort.
**Correction:** State this explicitly; until a transition map is exposed, the dropdown offers the full enum and relies on **server-side rejection** (which already exists) for illegal transitions.

### F3 — Component naming: `SlideOver` and standalone `PrimaryGridView` do not exist as live code (REFUTED on names)
**Plan claimed:** edits "ride the Mercury retrofit" and reuse "`SlideOver` (the existing 5→4-state drawer)" and "`PrimaryGridView`."
**Reality (live tree):**
- `src/client/components/SlideOver.tsx` **does not exist.** The live drawer is **`DetailSlideover.tsx`** (current, used by `GridView`) with `ContextDrawer.tsx` still present and `@deprecated`. `SlideOver` is a *planned rename* (decisions-log, "planning only — no code").
- `src/client/templates/PrimaryGridView.tsx` **does not exist** — but `GridView.tsx:365` does `export const PrimaryGridView = GridView`, so `PrimaryGridView` is importable **as an alias**; the runtime name is **`GridView`**.
**Impact:** An implementer importing `SlideOver` or a standalone `PrimaryGridView` hits an error. The retrofit framing is *directionally correct* (the retrofit is partly executed — see F6) but the **names are wrong**.
**Correction:** Use the live names — **`DetailSlideover`** (drawer) and **`GridView`** (template; `PrimaryGridView` alias OK) — throughout.

---

## 3. MEDIUM / LOW findings

### F4 (MED) — "PO has NO quick-add" is misleading (the order-entry linchpin)
PO **lacks a typeahead**, but it **does** have a manual "historical quick-add" (clickable prior-vendor products) — `PurchaseOrdersView.tsx:222-232, 494-505`. The defensible, sharper claim: *"PO has manual historical quick-add but no search-as-you-type; bring PO to **typeahead parity** with Sales."* The recommendation survives — it gets **more precise**, not invalidated.

### F5 (MED) — `onCellCommit` is "being deleted" only in plan, not in code
The per-view `onCellCommit` path is **live in 4 places** (`PurchaseOrdersView.tsx:460,570`; `SalesView.tsx:1382,1532`). The decisions-log marks it an anti-pattern *to be removed*; that's **planned**, not done. The plan should say the schema-driven command path is the *target*, not the current state.

### F6 (MED) — The retrofit is partially executed; views are split
`GridView.tsx`, `DetailSlideover.tsx`, `tabs/registry.ts`, `entity-schemas.ts`, `entity-actions.ts` all **exist and are consumed** — good. But `entity-schemas`/`entity-actions` are **partially populated** (PurchaseOrder pilot; others Phase 2–3D), and views are **split**: some still use the deprecated `GridJourney` (`PaymentsView`, `ClientLedgerView`, `CloseoutView`), others use `GridView`. The plan should not imply all views are schema-driven yet.

### F7 (MED) — The ≤8-column rule is a convention, not enforced
Documented in `grids.md` and `GRID_COLUMN_AUDIT.md`, but the audit is **self-described stale (2026-06-12)** and there is **no lint/test** enforcing it. Treat as a manually-audited convention, not a hard gate.

### F8 (MED) — `DetailSlideover` currently shows order-level (not per-line) detail in Sales
Per-line detail today is **inline controls** (`SaleLineExceptionControls`), and the slide-over is **order-level** (`SalesBuildMode.tsx:727`). The plan's "push heavy per-line fields into the slide-over" is **feasible but new** — it changes the slide-over's granularity, not just relocates an existing panel.

### F9 (LOW) — Sales line grid is **22** columns, not ~23 (`SalesView.tsx:159-254`).
### F10 (LOW) — `comboboxOptions` returns an **envelope** `{ entityType, options[], noResultsHint?, truncated }`; the option *shape* claimed is correct. Adapter note still holds.
### F11 (LOW) — `comboboxOptions` is scoped via `assertRole(ctx.user, 'operator')` (`queries.ts:339`) — more specific than "protected." Strengthens the claim.
### F12 (LOW) — `DetailSlideover` itself is the "parallel build" the decisions-log said not to create; both it and `ContextDrawer` are mounted. Pre-existing debt — the plan must **not** add a third context surface (it doesn't, but call it out).

---

## 4. Load-bearing claims that VERIFIED CLEAN

These are the spine of the plan and all held with `file:line` evidence:

- `comboboxOptions` **exists, tested, permission-scoped, and never called from the client** (`queries.ts:333-575`; `queries.comboboxOptions.test.ts`; zero client hits). ✔ *(This is the plan's #1 premise.)*
- `useColumnDefs.ts:219,244,255` wires `options: []` with the `// async … (future)` comment. ✔
- `tags` is a **no-op** case (`useColumnDefs.ts:262-264`). ✔
- `ComboboxCellEditor` has `allowCreate` + async `onSearch`, and **no multi-select** (so "add `multiple`" is correctly scoped as new work). ✔
- `OperatorGrid` enhancers `withStatusRenderer`/`withCreatedAtFormatter`/`withRowNumbers`, **no tags renderer** (`:205,1038`). ✔
- AG Grid **^32.3.3**, community **and** enterprise. ✔
- Fill handle + range cell-selection enabled (`:736,250`). ✔
- `comboboxSource` declared but unused (`entity-schemas.ts:56`). ✔
- Command bus: `useCommandRunner` optimistic + toast; `command_journal` `pending/ok/failed`, reversible via `reversedByCommandId` (`schema.ts:729-752`; `statuses.ts:327-338`). ✔ *(The command-bus thesis stands.)*
- Only `customerNeed` + `vendorSupply` carry editable fields (12 fields/2 entities); everything else defaults non-editable. ✔
- Palette = the 7 tokens (+`accent-dark` variant); "no new colors" documented. ✔
- `tag_catalog` (`slug/label/color/is_active`) + `tags text[]` on customers/items/batches/vendors/purchase_order_lines (`schema.ts` — vendors.tags **does** exist, `:170`/etc.). ✔
- `SaleLineItemTypeahead` (UX-F03), `SalePrePostStrip`, and dependent-line logic (below-floor, landed-cost `unitCostResolved`, credit, vendor-approval) all exist. ✔
- PO & SO both render via `OperatorGrid` with `onCellCommit` → `runCommand` over tRPC. ✔

---

## 5. Corrections applied to the master plan

The following edits were made to `smart-tables-master-plan.md` so it carries no refuted claim:

| Finding | Edit |
|---|---|
| F1 | Role projection recast as a **requirement + latent gap**, not an existing guarantee; hover-card work must implement field gating; added to risks. |
| F2 | "Only legal next states" qualified: `statuses.ts` is flat; transition map is server-side/unexported; constraining the dropdown is **new P1 work**; interim = full enum + server rejection. |
| F3 | `SlideOver`→**`DetailSlideover`**; `PrimaryGridView`→**`GridView`** (alias noted) throughout. |
| F4 | PO recommendation reframed to **typeahead parity** (PO has manual historical quick-add today). |
| F5 | `onCellCommit` described as **current live path**; schema-driven command path is the target, not done. |
| F6 | Added "retrofit is partial; views split GridJourney/GridView; schemas partially populated." |
| F7 | ≤8-column rule = **documented convention, manually audited, not lint-enforced**. |
| F8 | "Push per-line fields to slide-over" flagged as **new granularity**, not relocation. |
| F9 | 23 → **22** columns. |
| F10/F11 | `comboboxOptions` envelope + `assertRole('operator')` noted. |
| F12 | Note: do not add a third context surface; `ContextDrawer`/`DetailSlideover` debt exists. |

## 6. Net assessment

- **Confidence in the thesis:** HIGH. The premise (parts exist, wiring is the gap, edits ride the command bus) is the most-verified part of the plan.
- **Confidence in the original effort estimates:** MEDIUM. F1 and F2 add real scope to P1/P5 (build role-gating; build/export a transition map). P-phase ordering is unaffected.
- **Biggest risk surfaced beyond the plan:** F1's latent cost/margin exposure to all roles — worth a separate issue regardless of smart-tables work.
- **Recommendation:** proceed with the corrected master plan. Before P1 implementation, settle two decisions: (1) source of the status transition map (export from `commandBus` vs derive from `entity-actions`), and (2) whether to fix role-based column projection now (it gates the smart-chip hover cards in P5 anyway).
