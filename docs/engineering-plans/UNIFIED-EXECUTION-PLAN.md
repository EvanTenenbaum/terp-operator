# Mercury UX Retrofit — Unified Execution Plan

**Branch:** `docs/mercury-ux-retrofit-master-plan`
**Status:** Phase 0a CLOSED. All 7 P0 items resolved (2026-06-16). Production code dispatch (Phase 0b, Layers 0-2) is now unlocked.
**Authority:** This document is the SINGLE AUTHORITY for agent dispatch after Phase 0a closes. It supersedes the dispatch sequencing language in `MASTER-EXECUTION-DOCUMENT.md`, `AI-TODO.md`, and `dependency-graph.md` where those conflict.
**Reads (in order):** [PLANNING-SYNTHESIS.md](./PLANNING-SYNTHESIS.md) → [MERCURY-ARCHITECTURE-MANIFESTO.md](./MERCURY-ARCHITECTURE-MANIFESTO.md) → [CPO-AUDIT-REPORT.md](./CPO-AUDIT-REPORT.md) → this document → spec sheets.

---

## §1 — Current State

The Mercury UX Retrofit project has completed Phase -1: 47 wireframes (27 views + 10 components + 10 flows), a 12-rule UX authority cross-model validated by Claude Opus and GPT-4o, a 12-rule architecture manifesto translating UX rules into ARCH rules, an integration map naming 38 old→new migrations, and four scaffolded config files at `src/client/config/` (entity-schemas.ts, entity-actions.ts, view-registry.ts, entity-column-map.ts; all with PurchaseOrder examples filled in). The CPO audit identified 15 findings, of which **3 are structural P0 blockers** that prevent any Phase 0 agent dispatch: (1) `src/shared/statuses.ts` does not exist — every state machine and BulkActionBar silently depends on an undefined enum source; (2) 18 backend procedures (`comboboxOptions`, `gridSummary`, `statusCounts`, `runBulk`, extended `grid` with filter/sort/group params, per-entity tab queries) are listed in `AI-TODO.md` as T-B-01..T-B-18 with **zero specifications** in `00-master-task-registry.md` — Phase 0 components are demoware until they ship; (3) `ContextDrawer` (647 lines, 5 drawer states, URL-synced, focus-trapped) and `GridJourney` (used by 10+ views) already implement what the plan calls "build from scratch" as `DetailSlideover` and `GridView` template — without an explicit extend-vs-replace decision, agents will parallel-build duplicates and the codebase will carry two systems that drift apart. Four additional **P1 gaps** block the Phase 0 gate: no migration/rollout strategy (feature flags, uiStore persisted-shape migration, saved filter compatibility), no URL state grammar, undefined bulk-dispatch transactional semantics, and ~95% of required specs are missing (zero view specs, zero hook specs, zero backend specs, only 4 component specs and 1 template spec exist). Until Phase 0a closes these 7 P0 items, production code dispatch is forbidden.

---

## §2 — Pre-Build P0 Closure

Each row maps a CPO audit P0 finding to a concrete planning artifact. Phase 0a dispatches one agent per row; no production code is written in Phase 0a. Outputs land in `docs/`, `src/shared/statuses.ts` is the **only** source-tree write permitted in Phase 0a (it is a planning artifact in the form of a typed enum file — no application logic depends on it yet at Phase 0a close).

| P0# | What | Output File(s) | Agent | Acceptance Criteria | Depends On |
|-----|------|----------------|-------|---------------------|------------|
| **P0-1** | Canonical status enumerations per entity | `src/shared/statuses.ts` | `opus-build` | (a) One `z.enum` per entity that has lifecycle state (PurchaseOrder, SalesOrder, Order, Payment, Pick, Invoice, Batch, VendorBill, Lot — minimum 9). Values derived from `grep -nE "status:\s*(varchar|text)\|status:\s*z\.enum" src/server/schema.ts src/shared/schemas.ts src/server/services/commandBus.ts` and cross-checked against `commandBus.ts` case statements. (b) Static-analysis test in `src/shared/statuses.test.ts` asserting every status referenced in `commandBus.ts` exists here and vice versa. (c) `pnpm typecheck` passes. (d) `entity-actions.ts` PurchaseOrder section refactored to import from this file (no value duplication). | None |
| **P0-2** | Backend procedure specifications (18) | `docs/engineering-plans/specifications/procedures/comboboxOptions.md`, `gridSummary.md`, `statusCounts.md`, `runBulk.md`, `grid-v2.md`, `entityTabs.md` (catalog), plus 12 per-entity tab procedure specs under `procedures/tabs/`. Plus updated `00-master-task-registry.md` with full T-B-01..T-B-18 task definitions. | `claude-architect` | (a) Each spec includes input Zod schema, output Zod schema, role gating (`protectedProcedure` + role minimum), error contract, N+1 avoidance strategy, and at minimum one happy-path + one role-failure test sketch. (b) Each procedure references the canonical status enum file (P0-1) — no inline status literals. (c) Master task registry has T-B-01..T-B-18 with the same fields used for frontend tasks: ID, agent type, inputs, outputs, AC, dependencies. (d) Spec for `runBulk` resolves P0-6 (bulk semantics). | P0-1, P0-6 |
| **P0-3** | ContextDrawer → SlideOver migration decision | `docs/design-system/decisions-log.md` (new entry) + `docs/engineering-plans/specifications/components/detail-slideover.md` rewritten to describe the **refactor target** of `ContextDrawer`, not a parallel build | `claude-architect` | (a) Decision recorded: **refactor `ContextDrawer` in place**, rename to `SlideOver`, replace hard-coded `drawerTabs` map with registry source, decide whether to preserve or drop the 5th `focus` state (decision recorded with rationale). (b) Migration map: each of the ~18 drawer/dialog components in `§5.3` of the manifesto gets an explicit `Replace by: SlideOver tab key=<X>` or `Replace by: ConfirmRoot via useConfirm()`. (c) Decisions log entry follows existing format and references manifesto §5.2 + CPO audit F2. | None |
| **P0-4** | GridJourney → PrimaryGridView template decision | `docs/design-system/decisions-log.md` (new entry) + `docs/engineering-plans/specifications/templates/primary-grid-view.md` rewritten as a **refactor target** of `GridJourney` | `claude-architect` | (a) Decision recorded: **refactor `GridJourney` in place** at `src/client/views/operations/shared.tsx:247`, rename to `PrimaryGridView`, change signature to consume `entitySchema` instead of inline `columns`/`actions`. (b) Migration table: each of the 10+ views currently using `GridJourney` listed with its current props, the new props it will receive, and the phase it migrates in. (c) `inspectorTabs` prop deprecation path documented (folds into SlideOver tabs). | P0-3 |
| **P0-5** | Migration & rollout strategy | `docs/engineering-plans/migration-plan.md` | `claude-architect` | (a) Per-view feature flag scheme defined (`FEATURE_MERCURY_<VIEW>` env or settings flag — pick one). (b) `useUiStore` persisted-shape migration: version bump + safe-reset rules for `drawerByView`, `gridFilters`, `lastUsedDrawerStateByView`, `selectedRows`. (c) `mergeColumnDefsWithPrefs` compatibility test plan against auto-generated columns from `entity-schemas.ts`. (d) Saved-filter compatibility: explicit policy (preserved? auto-migrated? warned-on?). (e) Per-view rollback unit defined: what gets reverted, in what order, on what signal. | P0-3, P0-4 |
| **P0-6** | Bulk-dispatch transactional semantics | `docs/engineering-plans/specifications/procedures/run-bulk.md` (deliverable of P0-2, but the semantic decision must be made first) | `claude-architect` | (a) Decision recorded: **all-or-nothing transaction** vs **per-row with partial-success report**. Default recommendation per CPO audit F5: per-row with idempotency keys + partial success report, full rollback only for designated commands (any command that mutates money, e.g., `payments.post`, `salesOrder.finalize`). (b) Idempotency key shape defined: `${groupKey}:${rowId}:${commandName}`. (c) Client-facing partial-success report shape (used by BulkActionBar UI) defined as a Zod output schema. (d) Command-journal entry shape for bulk groups defined. (e) Reviewed against `commandBus.ts` invariants (journal, snapshot, broadcast). | P0-1 |
| **P0-7** | DB migration audit | `docs/engineering-plans/db-migration-audit.md` + addendum to CPO-AUDIT-REPORT.md §3-F10 | `terminal` (discovery) + `claude-architect` (decisions) | (a) Migrations directory located and history catalogued (`find . -name "*.sql" -path "*drizzle*"` or equivalent). (b) Per backend task: list whether a schema migration is required, what tables/columns/constraints/enums change, and migration ordering. (c) `pgEnum` vs `CHECK` constraint decision for status enums (deferred or immediate?). (d) Bulk command-journal table extension decision. (e) Saved-view table extension decision. (f) Every "yes, migration needed" entry has a paired rollback note (or rationale for irreversibility). | P0-1, P0-6 |

### Sequencing within Phase 0a

- **Strictly sequential:** P0-1 → P0-2 (procedure specs must reference status enums by import path).
- **Strictly sequential:** P0-1 → P0-6 → P0-2 (bulk semantics decision feeds runBulk spec, which is one of the 18 in P0-2).
- **Strictly sequential:** P0-3 → P0-4 (template decision depends on slide-over decision because `inspectorTabs` folds into SlideOver tabs).
- **Strictly sequential:** P0-3 + P0-4 → P0-5 (migration plan needs the migration target shapes finalized).
- **Strictly sequential:** P0-1 + P0-6 → P0-7 (DB audit needs status-enum decision and bulk-journal decision).
- **Parallel-safe:**
  - P0-1 and P0-3 may run in parallel (no shared artifacts).
  - P0-3 and P0-6 may run in parallel.
  - P0-1 and P0-3 and P0-6 (the three "root" decisions) may all start day 1.
- **Critical path:** P0-1 → P0-6 → P0-2 → (P0-5 once P0-3+P0-4 land) → P0-7 → Phase 0a CLOSED.
- **Estimated duration:** 7–10 working days for a 2-agent planning lane (architect + opus-build). Compressing below 7 days produces under-specified outputs that will resurface as Phase 1+ rework.

### Phase 0a close criteria

Phase 0a is closed only when:
1. All 7 P0 output files exist and have been reviewed against the AC above by `risk-verifier` (canonical closeout reviewer).
2. `pnpm typecheck` passes with `src/shared/statuses.ts` in place and `entity-actions.ts` importing from it.
3. `docs/design-system/decisions-log.md` contains entries for P0-3 and P0-4 and is referenced from this file.
4. `00-master-task-registry.md` contains full definitions for T-B-01..T-B-18 (or the renumbered equivalents).
5. `docs/engineering-plans/migration-plan.md` exists and is linked from `MERCURY-ARCHITECTURE-MANIFESTO.md` §4 (the migration map).

---

## §3 — Layer Architecture

Production code is built bottom-up through seven layers. A layer is "done" when its completion criteria pass and all its outputs are committed to the active branch. **Higher-numbered layers must not start until lower-numbered layers close.** Within a layer, the "Parallel work" column names what can safely run concurrently.

```
Layer 0: Shared Types & Status Enums
Layer 1: Backend Procedures & DB Migrations
Layer 2: Config Registry Population
Layer 3: Base Components
Layer 4: View Templates
Layer 5: Individual Views
Layer 6: Polish & Cleanup
```

### Layer 0 — Shared Types & Status Enums

The foundation. Every other layer imports from here.

- **Prerequisite files:** Phase 0a complete (P0-1 closed). `src/shared/statuses.ts` exists and `pnpm typecheck` passes.
- **Completion criteria:** (a) `src/shared/statuses.ts` exports a `z.enum` per entity per the entity list in P0-1. (b) `src/shared/statuses.test.ts` passes (status round-trip vs `commandBus.ts`). (c) Any updated Zod schemas in `src/shared/schemas.ts` reference status enums by import, not literals. (d) `pnpm typecheck && pnpm vitest run src/shared/statuses.test.ts` green.
- **Parallel work:** None within layer (it is one file plus its test).
- **Agent type:** `opus-build` (this is the foundation; risk of subtle drift is high).

### Layer 1 — Backend Procedures & DB Migrations

The 18 backend procedures (T-B-01..T-B-18 per P0-2) plus any required DB migrations from P0-7. Frontend cannot wire to non-existent endpoints, so Layer 1 must precede Layer 3.

- **Prerequisite files:**
  - `src/shared/statuses.ts` (Layer 0).
  - All P0-2 procedure specs at `docs/engineering-plans/specifications/procedures/*.md`.
  - P0-6 `run-bulk.md` semantic decision.
  - P0-7 DB migration audit and any approved migration files in the migrations directory.
- **Completion criteria:** (a) Each procedure has an implementation file, a passing per-procedure test (happy path + role-failure case), and a registration in the appropriate router. (b) `commands.runBulk` ships with idempotency keys and partial-success report per P0-6. (c) `queries.grid` extended to accept `{ view, filter?, sort?, group?, cursor? }` with the existing `FilterGroupInput` type from `src/shared/filterSchemas.ts`. (d) DB migrations from P0-7 applied locally and verified via `pnpm db:migrate` + integration tests. (e) `fast-runner exec terp-operator -- pnpm typecheck && pnpm test` green.
- **Parallel work:**
  - The 18 procedures partition into 5 parallel work-groups by router: `queries.grid` extension (sequential, blocks others in this group), `comboboxOptions`/`gridSummary`/`statusCounts` (parallel), `runBulk` (sequential — touches commandBus), per-entity tab queries (parallel across entities, sequential per entity).
  - DB migrations apply serially (one transaction at a time); their spec/review can be parallel.
- **Agent type:** `build` for routine procedure scaffolds; `opus-build` for `runBulk` (touches commandBus invariants) and `queries.grid` extension (SQL re-architecture risk).

### Layer 2 — Config Registry Population

The four scaffolded config files in `src/client/config/` (entity-schemas.ts, entity-actions.ts, view-registry.ts, entity-column-map.ts) currently contain PurchaseOrder examples only. Layer 2 populates them for the remaining entities consumed by Phase 1–3 views.

- **Prerequisite files:**
  - `src/shared/statuses.ts` (Layer 0).
  - All Layer 1 procedures shipped (config references procedures by router path).
  - P0-3 decision (because slide-over tab registry shape depends on it).
- **Completion criteria:** (a) `entity-schemas.ts` contains schema entries for at least the entities used by Phase 1+2 views: PurchaseOrder (done), SalesOrder, Order, Payment, Lot, Customer, Vendor, VendorBill, Invoice, Pick. (b) `entity-actions.ts` contains state machines for each entity with lifecycle status. Every transition imports its source state from `src/shared/statuses.ts`. (c) `view-registry.ts` declares each Phase 1+2 view (`purchaseOrders`, `orders`, `payments`, `vendorBills`, `vendorPayables`, `picks`, `invoices`, `customers`, `vendors`, `recovery`). (d) `entity-column-map.ts` maps each entity's schema fields to its DB column source (used by the extended `queries.grid` for sort/filter). (e) `src/client/components/tabs/registry.ts` created; the 19 existing `drawerTabs/*.tsx` components registered by key. (f) `pnpm typecheck` green and `pnpm vitest run src/client/config/*.test.ts` green for any added test files.
- **Parallel work:** All four config files may be updated in parallel per entity (PurchaseOrder is the example template; one agent owns one entity end-to-end across all four files). Tab registry registration is one task.
- **Agent type:** `build` (this is template-following work once Layer 1 has shipped).

### Layer 3 — Base Components

The foundational components that templates compose: `ComboboxCellEditor`, `FilterToolbar` + `StatusFilterPill`, `SummaryStrip`, `BulkActionBar`, `ActionBar` (the slide-over footer), `SlideOver` (refactor of `ContextDrawer` per P0-3), `KpiStrip` (dashboard widget), and the dashboard widget set (`WelcomeStrip`, `QuickActionsRow`, etc.).

- **Prerequisite files:**
  - Layer 0, 1, 2 complete.
  - Component specs for each component exist at `docs/engineering-plans/specifications/components/*.md` (currently 4 of ~10; the missing 6 must be authored as part of Phase 0b kickoff — see §4 Phase 0b).
  - `useViewUrlState(view)` hook spec exists at `docs/engineering-plans/specifications/hooks/use-view-url-state.md` (currently missing; authored in Phase 0b).
- **Completion criteria:** (a) Each component is implemented at its target file path per the spec sheet. (b) Each component has a per-component vitest test covering loading/empty/error/happy states + a11y. (c) `SlideOver` refactor of `ContextDrawer` preserves `drawerByView` URL contract and 19 tab components register cleanly. (d) `BulkActionBar` calls `commands.runBulk` (Layer 1); no per-row mutation calls. (e) `FilterToolbar` advanced popover wraps existing `AdvancedFilterBuilder` (preserve, do not rebuild — manifesto §5.3). (f) `fast-runner exec terp-operator -- pnpm typecheck && pnpm vitest run src/client/components/` green.
- **Parallel work:**
  - High parallelism. Component partitions: `ComboboxCellEditor` (1 agent), `FilterToolbar` + `StatusFilterPill` (1 agent), `SummaryStrip` (1 agent), `BulkActionBar` + `ActionBar` (1 agent — share entity-actions integration), `SlideOver` refactor (1 agent — high-risk, `opus-build`), `KpiStrip` + dashboard widgets (1 agent).
  - Up to 6 agents in parallel safely; they touch disjoint files.
- **Agent type:** `build` for all except `SlideOver` refactor and `BulkActionBar` (use `opus-build` — both touch load-bearing infrastructure).

### Layer 4 — View Templates

The four templates that views render: `PrimaryGridView` (refactor of `GridJourney` per P0-4), `MasterDetailView`, `DashboardView`, `WizardView`.

- **Prerequisite files:** Layer 3 complete (templates compose Layer 3 components). Template spec sheets at `docs/engineering-plans/specifications/templates/*.md` exist for all four (currently only `grid-view.md` exists; the other 3 authored in Phase 0b).
- **Completion criteria:** (a) Each template at its target file path: `src/client/templates/PrimaryGridView.tsx` (refactor of `views/operations/shared.tsx:247`), `src/client/templates/MasterDetailView.tsx`, `src/client/templates/DashboardView.tsx`, `src/client/templates/WizardView.tsx`. (b) Each template enforces the manifesto's component hierarchy (§2.1) — i.e., views consuming the template cannot inject custom chrome. (c) `PrimaryGridView` accepts `entitySchema` (resolves columns via `useColumnDefs(entity)`) instead of inline `columns` prop. (d) `DashboardView` accepts typed widgets in 3 tiers per ARCH-10. (e) Per-template vitest covers the canonical happy path (template renders given a minimal schema + view-registry entry). (f) `pnpm typecheck && pnpm vitest run src/client/templates/` green.
- **Parallel work:** Four templates can be built in parallel — each owns its file. `PrimaryGridView` refactor is the highest-risk because 10+ views depend on it; coordinate the GridJourney rename via a single commit that ships the rename + adapter in one atomic change to avoid breaking dependent views mid-flight.
- **Agent type:** `opus-build` for `PrimaryGridView` (refactor risk). `build` for the other three.

### Layer 5 — Individual Views

The 27 views, partitioned by phase (see §4 for the per-view dispatch table). Each view renders a Layer 4 template, consumes Layer 2 config, and routes through Layer 3 components.

- **Prerequisite files:** Layer 4 complete. Per-view spec sheets at `docs/engineering-plans/specifications/views/*.md` (currently 0 of 27; authored on demand at the start of each phase per §4).
- **Completion criteria (per view):** (a) View file at `src/client/views/<View>.tsx` is < 500 lines (canonical SalesView anti-pattern is 1986 lines; views above this threshold must justify in spec). (b) View renders exactly one template from Layer 4. (c) Zero `style={{...}}` inline; zero `useState` for global view state; zero direct `trpc.commands.*.useMutation` outside `useCommandRunner`. (d) Per-view AC checklist (loading, empty, error, a11y, mobile) from spec sheet all green. (e) Per-view vitest passes; per-view Playwright E2E (where applicable) passes. (f) Behind feature flag per P0-5.
- **Parallel work:** High parallelism across views with disjoint files. Same-file work (SalesView Phase 3) is serialized per F3 — see §4 Phase 3.
- **Agent type:** `build` (default); `opus-build` for SalesView and IntakeView (highest complexity).

### Layer 6 — Polish & Cleanup

Mobile per-view (7 views), a11y per-component sweeps, performance per-perf-sensitive-view, deprecated-component removal (`WorkspacePanel` 45 uses, `FilterPresetStrip` 16, `StatusActionBar` 26, `RecordPrepaymentDialog`, etc.), feature-flag removal, documentation refresh.

- **Prerequisite files:** Layer 5 complete for all production views. Feature flags from P0-5 set to default-on. Persona QA gates from §4 Phase 4 passed.
- **Completion criteria:** (a) `grep -r "WorkspacePanel" src/` returns zero matches outside `src/client/components/legacy/` (or deleted). (b) Same for `FilterPresetStrip`, `StatusActionBar`. (c) Mobile views (7) each rebuilt per its own spec sheet. (d) `pnpm exec axe-core` (or equivalent a11y check) green per view. (e) Persona Flow QA report (26 flows per `docs/qa/persona-flows/REGISTRY.md`) at grade B or better. (f) Feature flags removed from code. (g) `MASTER-EXECUTION-DOCUMENT.md` archived; this document remains as the historical authority.
- **Parallel work:** Mobile views (7) in parallel; deprecated removals in parallel (one per component); a11y sweeps in parallel by view.
- **Agent type:** `build` for routine cleanup; `qa-reviewer` and AQA for verification; `risk-verifier` for closeout per QA Tiers policy.

---

## §4 — Phase-by-Phase Execution Plan

Six phases. Phase 0a is planning-only (no production code). Phase 0b populates Layers 0–2 plus the missing spec sheets. Phase 1 is the pilot. Phase 2 is the high-parallelism GridJourney sweep. Phase 3 is the highest-risk migration of SalesView and other complex views. Phase 4 is polish, mobile, a11y, and deprecation removal.

Risk levels: **Low** (routine, well-specified, isolated files). **Medium** (touches shared infrastructure or has cross-view coupling). **High** (load-bearing infrastructure refactor, large file edits, or commandBus contract changes). **Critical** (production-risk; rollback gate; closeout via `risk-verifier`).

### Phase 0a — P0 Closure (planning/docs only)

**Goal:** Close the 7 CPO audit P0 blockers. No production code writes (with the single exception of `src/shared/statuses.ts`, which is the typed planning artifact for P0-1). See §2 for full detail.

**Closeout gate:** All 7 P0 close criteria from §2 met. `risk-verifier` review pass on each output. Until this gate closes, **no Phase 0b or later agent dispatches are permitted**.

| Task | Owner Agent | Input File(s) | Output File(s) | Verification | Risk Level |
|------|-------------|---------------|----------------|--------------|------------|
| P0-1 Status enums | `opus-build` | `src/server/schema.ts`, `src/server/services/commandBus.ts`, `src/shared/schemas.ts` | `src/shared/statuses.ts`, `src/shared/statuses.test.ts` | `pnpm typecheck && pnpm vitest run src/shared/statuses.test.ts` | High |
| P0-2 Backend specs | `claude-architect` | `docs/engineering-plans/specifications/components/*.md`, `src/server/routers/queries.ts`, `commandBus.ts` | 18 procedure specs under `docs/engineering-plans/specifications/procedures/`, updated `00-master-task-registry.md` | Manual review against AC; `risk-verifier` pass | High |
| P0-3 ContextDrawer decision | `claude-architect` | `src/client/components/ContextDrawer.tsx`, manifesto §5.2 | `docs/design-system/decisions-log.md` (new entry), rewritten `detail-slideover.md` spec | Decisions log entry follows existing format; spec references existing file | Medium |
| P0-4 GridJourney decision | `claude-architect` | `src/client/views/operations/shared.tsx:247`, manifesto §5.2 | `decisions-log.md` (new entry), rewritten `primary-grid-view.md` spec | Migration table covers all 10+ current GridJourney consumers | Medium |
| P0-5 Migration plan | `claude-architect` | `src/client/store/uiStore.ts`, P0-3, P0-4 outputs | `docs/engineering-plans/migration-plan.md` | `risk-verifier` pass on rollback unit definitions | High |
| P0-6 Bulk semantics | `claude-architect` | `commandBus.ts`, P0-1 output | `docs/engineering-plans/specifications/procedures/run-bulk.md` | `risk-verifier` pass on transactional decision | Critical |
| P0-7 DB migration audit | `terminal` + `claude-architect` | Migrations directory, P0-1 + P0-6 outputs | `docs/engineering-plans/db-migration-audit.md`, CPO audit addendum | `pnpm db:migrate --dry-run` (or equivalent) green on every proposed migration | High |

### Phase 0b — Foundation (Layers 0–2 + missing specs)

**Goal:** Populate Layer 0 (already partial via P0-1), Layer 1 (build the 18 backend procedures), Layer 2 (populate config files for all Phase 1+2 entities), AND author the spec sheets that the CPO audit found missing (~27 view specs, ~5 hook specs, 3 template specs, 6 component specs).

**Closeout gate:** Layer 0, 1, 2 completion criteria all green. All Phase 1+2 view, hook, template, and component specs exist and have passed spec template requirements (manifesto §7.1).

| Task | Owner Agent | Input File(s) | Output File(s) | Verification | Risk Level |
|------|-------------|---------------|----------------|--------------|------------|
| 0b-spec-views (27 view specs authored on demand at start of each phase that needs them; Phase 1 needs 1, Phase 2 needs 10, Phase 3 needs ~10, Phase 4 needs mobile 7) | `claude-architect` (Phase 1/3 specs); `plan` (Phase 2 specs after pilot pattern locked) | Phase 0a outputs, manifesto, wireframes | `docs/engineering-plans/specifications/views/<view>.md` per view | Each spec uses `_TEMPLATE.md`; manifesto anchoring table filled | Medium |
| 0b-spec-hooks | `claude-architect` | Manifesto §3, P0-5 migration plan | `docs/engineering-plans/specifications/hooks/use-view-url-state.md`, `use-view-data.md`, `use-entity-actions.ts.md`, `use-column-defs.md`, `use-slide-over-active-tab.md` | Each spec includes input/output types, AC, test sketch | Medium |
| 0b-spec-templates | `claude-architect` | Manifesto §2.1, P0-4 output | `docs/engineering-plans/specifications/templates/master-detail-view.md`, `dashboard-view.md`, `wizard-view.md` (`primary-grid-view.md` shipped in P0-4) | Each template spec names which views consume it | Low |
| 0b-spec-components | `claude-architect` | Manifesto §2.2 | `docs/engineering-plans/specifications/components/view-tab-bar.md`, `grid-summary-strip.md`, `kpi-strip.md`, `action-bar.md`, `collapsible-section.md`, `customer-credit-pill.md` | Each spec defines API, states, AC, keyboard, a11y | Low |
| 0b-L0 (Layer 0 close) | already done in P0-1 | — | — | Layer 0 completion criteria | High |
| 0b-L1-grid-extend | `opus-build` | `src/server/routers/queries.ts`, `grid-v2.md` spec | extended `queries.grid` procedure + test | `fast-runner exec terp-operator -- pnpm typecheck && pnpm test src/server/routers/queries.test.ts` | High |
| 0b-L1-combobox | `build` | `comboboxOptions.md` spec | `queries.comboboxOptions` procedure + test | Per-procedure test green | Low |
| 0b-L1-summary | `build` | `gridSummary.md` spec | `queries.gridSummary` procedure + test | Per-procedure test green | Low |
| 0b-L1-statusCounts | `build` | `statusCounts.md` spec | `queries.statusCounts` procedure + test | Per-procedure test green | Low |
| 0b-L1-runBulk | `opus-build` | `run-bulk.md` spec (P0-6), `commandBus.ts` | `commands.runBulk` procedure + journal extension + test | Per-procedure test green; commandBus invariants hold; partial-success path tested | Critical |
| 0b-L1-tabs (~12 per-entity tab procedures) | `build` (parallel by entity) | per-entity tab specs | per-entity tab procedures + tests | Per-procedure tests green | Medium |
| 0b-L1-migrations | `terminal` + `build` | P0-7 audit | applied migration files | `pnpm db:migrate` green; rollback tested in dev | High |
| 0b-L2-config-populate (per entity, parallel: PurchaseOrder done; needed: SalesOrder, Order, Payment, Lot, Customer, Vendor, VendorBill, Invoice, Pick) | `build` (one agent per entity) | `entity-schemas.ts`, `entity-actions.ts`, `view-registry.ts`, `entity-column-map.ts` (PurchaseOrder examples as template) | populated config files | `pnpm typecheck` green; config test green | Medium |
| 0b-L2-tab-registry | `build` | 19 `drawerTabs/*.tsx` components, P0-3 decision | `src/client/components/tabs/registry.ts` | `pnpm typecheck` green | Low |
| 0b-hooks (useViewUrlState, useViewData, useEntityActions, useColumnDefs, useSlideOverActiveTab) | `build` (parallel) | hook specs | hook files + per-hook tests | Per-hook tests green | Medium |

### Phase 1 — Pilot: PurchaseOrdersView

**Goal:** Migrate `PurchaseOrdersView` to consume `PrimaryGridView` + `SlideOver` + `BulkActionBar` + `FilterToolbar`. This is the **proof of the pattern**. No other Phase 5 view dispatches until Phase 1 closes.

**Why PurchaseOrdersView first:** Mid-complexity (not as trivial as PaymentsView, not as complex as SalesView). All Layer 3 components and Layer 4 templates get exercised. PO state machine is the most complete in `entity-actions.ts` scaffold. Persona QA flow exists.

**Closeout gate:** PurchaseOrdersView is operating under feature flag `FEATURE_MERCURY_PO=on` for at least 3 operators × 1 week with zero P0/P1 regressions reported. Persona QA flow for PO at grade A. `risk-verifier` closeout pass.

| Task | Owner Agent | Input File(s) | Output File(s) | Verification | Risk Level |
|------|-------------|---------------|----------------|--------------|------------|
| 1-L3-build-base-components (in Layer 3 dispatch — see §3) | parallel `build` / `opus-build` | Layer 3 specs | All Layer 3 components | Per-component tests green | Mixed |
| 1-L4-build-templates (in Layer 4 dispatch) | `opus-build` (PrimaryGridView) / `build` (others) | Layer 4 specs | All 4 templates | Per-template tests green | Mixed |
| 1-V-PO-spec | `claude-architect` | manifesto, P0-3, P0-4, PO wireframe `WF-V-purchase-orders.md` | `docs/engineering-plans/specifications/views/purchase-orders.md` | Spec uses `_TEMPLATE.md`; manifesto anchoring filled | Low |
| 1-V-PO-implement | `opus-build` | PO spec, Layer 3+4 outputs, existing `src/client/views/PurchaseOrdersView.tsx` | refactored `PurchaseOrdersView.tsx` (< 500 lines) | `pnpm typecheck && pnpm vitest run tests/unit/PurchaseOrdersView.test.tsx` green; behind `FEATURE_MERCURY_PO` | High |
| 1-V-PO-e2e | `terminal` (fast runner) | refactored view + dev server on Mac mini | E2E result | `fast-runner exec terp-operator -- PLAYWRIGHT_SKIP_WEB_SERVER=1 pnpm exec playwright test tests/e2e/purchase-orders.spec.ts --project=chromium` green | Medium |
| 1-V-PO-persona-qa | persona QA flow (per `docs/qa/persona-flows/REGISTRY.md`, the 3 inventory-operator flows that touch PO) | PO behind flag in QA environment | `docs/qa/runs/<date>-phase1-po-report.md` | Grade A; zero P0/P1 findings | Critical |
| 1-V-PO-closeout | `risk-verifier` | All Phase 1 artifacts | Closeout report appended to this doc | Closeout evidence per AGENTS.md Deep QA Gate | Critical |

**If Phase 1 reveals pattern flaws:** STOP. The pattern flaw is caught here, not after 10 more views are built on it. Update the affected spec(s), re-dispatch the affected component(s), re-run Phase 1 closeout. Do not start Phase 2 until Phase 1 closes cleanly.

### Phase 2 — GridJourney Migration (10 simple views)

**Goal:** Migrate the 10+ views that currently use `GridJourney` to the new `PrimaryGridView` template + Layer 3 components. These are intentionally the **simple** views — primarily grid + slide-over + filters, no exotic chrome.

**Views (per `view-registry.ts` and `GridJourney` consumers):**

1. `OrdersView`
2. `PaymentsView`
3. `VendorBillsView`
4. `VendorPayablesView`
5. `PicksView`
6. `InvoicesView`
7. `CustomersView`
8. `VendorsView`
9. `LotsView` (inventory list)
10. `RecoveryView`

**Closeout gate:** All 10 views shipped behind their per-view feature flags. Persona QA across cross-persona flows (X1, X2 from REGISTRY) at grade B or better. `risk-verifier` closeout pass.

| Task | Owner Agent | Input File(s) | Output File(s) | Verification | Risk Level |
|------|-------------|---------------|----------------|--------------|------------|
| 2-V-spec-batch (10 view specs authored from Phase 1 PO spec template + per-view wireframe) | `plan` (Claude writes; cheaper since the pattern is locked) | Phase 1 PO spec, per-view wireframes | 10 view specs under `specifications/views/` | Each spec passes spec template requirements | Low |
| 2-V-implement (10 view migrations) | `build` (1 agent per view, up to 6 parallel) | view specs, Layer 3+4 outputs, current view files | refactored view files (< 500 lines each) | Per-view `pnpm typecheck && pnpm vitest run tests/unit/<View>.test.tsx` green; behind `FEATURE_MERCURY_<VIEW>` flag | Medium |
| 2-V-e2e (per view, fast runner) | `terminal` | refactored views, dev server | E2E results | Per-view Playwright spec green | Medium |
| 2-V-persona-qa | persona QA (cross-persona X1, X2 flows + per-persona flows for inventory-operator, payments-accounting) | views behind flags in QA env | `docs/qa/runs/<date>-phase2-report.md` | Grade B+; tracked findings filed to GH/Linear | High |
| 2-V-closeout | `risk-verifier` | All Phase 2 artifacts | Closeout report appended | Closeout evidence per Deep QA Gate | High |

**Parallelism note:** Up to 6 simultaneous agents on disjoint view files. The `agent-claim` system from AGENTS.md tracks branch-level claims; ensure each agent claims its branch before dispatch.

### Phase 3 — SalesView + Complex Views (highest risk)

**Goal:** Migrate the views the plan repeatedly flags as hardest: `SalesView` (1986 lines, 8 panels, 7 inline cell renderers), `IntakeView`, `DashboardView` (8-stacked-WorkspacePanel anti-pattern), `MatchmakingView`, `RecoveryView`-detail surfaces, the remaining complex views in Phase 3D from `master-task-registry.md`.

**Why this is the highest-risk phase:** SalesView alone embeds **at least 87 instances of patterns the manifesto forbids** (per CPO audit F3, the inline cell renderers + 6 stacked WorkspacePanels + 8 grids + permanent "All checks passed" panel + RecordPrepaymentDialog blocking modal). Phase 3 has explicit rollback gates and the SalesView migration is split across two sub-phases (3A: refactor; 3B: migrate).

#### Phase 3A — SalesView Refactor (HARD GATE)

The 1986-line view is refactored **without changing UX**: 7 cell renderers extracted to stable components, 3 hooks extracted, helper files split out, but the view still consumes the legacy `ContextDrawer`/`WorkspacePanel`/`StatusActionBar` chrome. Goal is to reduce file size to ~800 lines and stabilize cell-renderer identity.

| Task | Owner Agent | Input File(s) | Output File(s) | Verification | Risk Level |
|------|-------------|---------------|----------------|--------------|------------|
| 3A-cell-renderers (7 extractions; **sequential per CPO audit F3** — all touch SalesView.tsx) | `opus-build` (one agent, sequential) | current `SalesView.tsx`, per-renderer spec at `docs/engineering-plans/specifications/views/sales-view-refactor.md` (authored in 3A-prep) | `src/client/views/SalesView/cells/DisplayNameCell.tsx`, `BatchCodeCell.tsx`, `MarkupCell.tsx`, `DerivedCogsCell.tsx`, `PickStatusCell.tsx`, `WhyShownCell.tsx`, `LandedCostExceptionCell.tsx` + reduced `SalesView.tsx` | `pnpm typecheck && pnpm vitest run tests/unit/SalesView/` — golden tests must pass; DOM-fragile tests updated with rationale per F3 | Critical |
| 3A-hook-extractions (3) | `opus-build` (sequential after cells) | `SalesView.tsx`, hook spec sheets | `useSalesLines.ts`, `useSalesSelection.ts`, `useSalesPricing.ts` | Per-hook tests green | High |
| 3A-test-triage | `qa-reviewer` + `terminal` | 5 SalesView test suites | annotated test files (golden vs DOM-fragile) | All golden tests green; DOM-fragile tests updated with rationale in commit | High |
| 3A-rollback-gate | `risk-verifier` | All 3A outputs | rollback decision: PROCEED to 3B / REVERT 3A | If golden tests fail or SalesView size > 1200 lines, REVERT 3A and replan | Critical |

**Rollback semantics for 3A:** If 3A-rollback-gate marks REVERT, the cell-renderer extractions are reverted via `git revert <commits>` on the `docs/mercury-ux-retrofit-master-plan` branch (or a Phase 3A worktree). The hook extractions revert in the same atomic operation. The view returns to the pre-3A baseline and Phase 3B does not start. A replan task is filed in this document as an addendum.

#### Phase 3B — SalesView Migration

SalesView consumes `PrimaryGridView` + `SlideOver` + `BulkActionBar`. The 6 stacked `WorkspacePanel`s are decomposed: `InventoryFinder` becomes a `CollapsibleSection` (one expanded at a time per ARCH-11), `CustomerCreditPanel` becomes a `CustomerCreditPill` in the context header (per ARCH-5 exception for continuous monitoring), `CustomerPurchaseHistoryPanel` becomes a `SlideOver` tab, `PhotographyQueuePanel` becomes a `SlideOver` tab, `PrePostValidation` becomes an inline `severity-warning` strip rendered only when issues exist, `RecordPrepaymentDialog` becomes a `SlideOver`.

| Task | Owner Agent | Input File(s) | Output File(s) | Verification | Risk Level |
|------|-------------|---------------|----------------|--------------|------------|
| 3B-V-spec | `claude-architect` | manifesto, refactored 3A SalesView, wireframe | `docs/engineering-plans/specifications/views/sales-view.md` | Spec passes template | Medium |
| 3B-V-implement | `opus-build` | 3A SalesView, Layer 3+4, 3B spec | refactored `SalesView.tsx` (< 600 lines target) | `pnpm typecheck && pnpm vitest run tests/unit/SalesView/` green; behind `FEATURE_MERCURY_SALES` | Critical |
| 3B-panel-migrations (6 sub-tasks, sequential — InventoryFinder, CustomerCreditPill, PurchaseHistory tab, Photography tab, PrePost strip, RecordPrepayment SlideOver) | `opus-build` (one agent sequential) | per-panel decision in 3B spec | per-panel migration commits | Per-migration unit test green | Critical |
| 3B-e2e | `terminal` (fast runner) | view behind flag | E2E result | Playwright sales spec green | High |
| 3B-persona-qa | persona QA (sales-operator persona — 3 flows + cross-persona X1, X2) | view behind flag in QA env | QA report | Grade B+ on sales-operator flows; zero P0 findings | Critical |
| 3B-rollback-gate | `risk-verifier` | All 3B outputs | rollback decision: PROCEED to 3C / REVERT 3B | If sales-operator persona QA grade < B, REVERT 3B and replan | Critical |

**Rollback semantics for 3B:** Same shape as 3A. REVERT flips `FEATURE_MERCURY_SALES` to default-off and reverts the migration commits. The 3A refactor stays in place (it improved structure without UX change). Phase 3C does not start.

#### Phase 3C — IntakeView + DashboardView + MatchmakingView

| Task | Owner Agent | Input File(s) | Output File(s) | Verification | Risk Level |
|------|-------------|---------------|----------------|--------------|------------|
| 3C-V-spec-intake / dashboard / matchmaking | `claude-architect` (parallel by view) | wireframes, manifesto | 3 view specs | Specs pass template | Medium |
| 3C-V-implement-intake | `opus-build` | intake spec, Layer 3+4 | refactored `IntakeView.tsx` | Tests + E2E green; behind `FEATURE_MERCURY_INTAKE` | High |
| 3C-V-implement-dashboard | `build` | dashboard spec (uses `DashboardView` template + typed widgets per ARCH-10) | refactored `DashboardView.tsx` | Tests + E2E green; behind `FEATURE_MERCURY_DASHBOARD` | Medium |
| 3C-V-implement-matchmaking | `build` | matchmaking spec | refactored `MatchmakingView.tsx` | Tests + E2E green; behind flag | Medium |
| 3C-persona-qa | persona QA (all 26 flows per REGISTRY, since Sales+PO+Dashboard are now all migrated) | views behind flags | full QA report | Grade B+ overall; X1, X2 grade A | Critical |
| 3C-closeout | `risk-verifier` | All 3C artifacts | Closeout report | Closeout per Deep QA Gate | Critical |

#### Phase 3D — Remaining Complex Views

Per `00-master-task-registry.md` Phase 3D: any remaining views that did not fit Phase 2 (simple grid) or Phase 3A–C (named complex). Examples: `CreditReviewView` (owner-only), `RefereeAdminView`, `BatchDetailView`, the long tail of operations sub-views.

| Task | Owner Agent | Input File(s) | Output File(s) | Verification | Risk Level |
|------|-------------|---------------|----------------|--------------|------------|
| 3D-V-spec-each | `claude-architect` (parallel) | wireframes | per-view specs | Spec template passed | Low |
| 3D-V-implement (parallel; ~10 views) | `build` (one per view) | specs, Layer 3+4 | refactored view files | Per-view tests + E2E green; per-view flag | Medium |
| 3D-persona-qa | persona QA (any flows touching these views) | views behind flags | QA delta report | No regressions vs Phase 3C baseline | High |
| 3D-closeout | `risk-verifier` | All 3D artifacts | Closeout report | Closeout per Deep QA Gate | High |

### Phase 4 — Polish & Cleanup

**Goal:** Mobile parity (7 views), a11y sweeps per view, performance per perf-sensitive view, deprecated-component removal, feature-flag removal, documentation refresh, and the final persona QA gate.

**Closeout gate:** All P0/P1 findings from any prior phase closed. Persona QA at grade A overall. `risk-verifier` closeout pass. All feature flags removed from code. Deprecated components deleted (no remaining imports anywhere in `src/`).

| Task | Owner Agent | Input File(s) | Output File(s) | Verification | Risk Level |
|------|-------------|---------------|----------------|--------------|------------|
| 4-mobile (7 sub-tasks, one per mobile view: `MobileDashboardView`, `MobileIntakeView`, `MobilePaymentsView`, `MobileCatalogView`, `MobileContactsView`, `MobileContactProfileView`, `MobileInventoryView`) | `build` (parallel) | per-view mobile spec (authored in 4-prep), corresponding desktop view post-Phase-3 | refactored mobile view files | Per-view mobile vitest + Playwright mobile project green | Medium |
| 4-a11y-sweep (per-view) | `qa-reviewer` (parallel by view) | each migrated view | a11y audit reports per view | `pnpm exec axe-core` (or equivalent) zero violations per view; manual screen-reader smoke | High |
| 4-perf (per perf-sensitive view: SalesView, OrdersView, InventoryView, DashboardView) | `build` | per-view perf profile | per-view perf fixes | Lighthouse / Web Vitals targets met (LCP, INP, CLS) | Medium |
| 4-deprecate-WorkspacePanel | `build` | 45 use sites (zero expected after Phase 3D) | deleted `WorkspacePanel.tsx` | `grep -r "WorkspacePanel" src/` zero matches; typecheck green | Medium |
| 4-deprecate-FilterPresetStrip | `build` | 16 use sites | deleted component | `grep` zero matches; typecheck green | Low |
| 4-deprecate-StatusActionBar | `build` | 26 use sites | deleted component | `grep` zero matches; typecheck green | Low |
| 4-deprecate-dialogs (RecordPrepayment, Referee\*, EditCreditLimit edit-mode) | `build` | each use site | deleted dialog components | `grep` zero matches; typecheck green | Low |
| 4-flag-removal | `build` | feature flag scaffold from P0-5 | flag removal commits per view | All `FEATURE_MERCURY_*` references removed; typecheck green | Medium |
| 4-docs-refresh | `build` | this document, manifesto, decisions log | refreshed `docs/agent-orientation/START_HERE.md`, `docs/design-system/INDEX.md`, archived `MASTER-EXECUTION-DOCUMENT.md` | Manual review by `qa-reviewer`; links resolve | Low |
| 4-persona-qa-final | persona QA (all 26 flows) | full production migration | final QA report | Grade A overall; X1, X2 grade A; zero P0/P1 findings | Critical |
| 4-closeout | `risk-verifier` + `closure-auditor` | All Phase 4 artifacts | Final closeout report appended to this document; project retirement packet | Closeout per Deep QA Gate; project marked complete | Critical |

---

## §5 — Cross-Phase Disciplines

These apply continuously across all phases after Phase 0a closes:

- **`agent-claim` before every dispatch:** Per AGENTS.md, every agent runs `~/.agent-state/agent-check` then `~/.agent-state/agent-claim <branch> "<task>" [worktree]` before starting and `~/.agent-state/agent-release <branch>` on completion. The claim tracks LOCAL Mac mini work only; coordinate cross-machine via agentchat and tracker writeback.
- **Tracker writeback at every checkpoint:** Per TERP Operator AGENTS.md, every meaningful pause (PR opened, PR merged, phase gate, blocker discovered) updates Linear (if anchored to a Linear issue) and/or the GitHub Issue. Bugs go to GitHub Issues; capability gaps go to Linear under project TERP Operator.
- **Fast runner for heavy work:** Per FAST-RUNNER-POLICY, typecheck/tests/Playwright/Docker/repo-wide scans/long terminal loops route through `fast-runner exec terp-operator -- <cmd>`. Local fallback requires the explicit allow flag.
- **Deep QA Gate at meaningful done claims:** Per global Deep QA policy (AGENTS.md §QA Tiers), money/persisted-data/auth/external-API/multi-step-side-effecting work triggers Deep QA. Phase 3B (SalesView migration with credit + pricing + posting) is Critical. Phase 1, 3A-gate, 3B-gate, 4-closeout are Critical. Most Phase 2 views are Deep QA. Phase 4 polish per task tier.
- **`risk-verifier` is the canonical closeout reviewer.** Do not stack three reviewers by default. Add `cross-reviewer` only when the first pass flags a concern in another lane.

---

---

## §6 — Risk Register

Risks consolidated from the CPO audit (F1–F15), manifesto §5 (parallel-build trap), AGENTS.md (cross-machine claim gaps), and architectural judgment. **Impact** ranks blast radius if it lands; **Likelihood** is the probability without mitigation. Reference IDs (`R-NN`) are stable; reference them in PR descriptions and closeout reports when a mitigation is exercised.

| Risk ID | Description | Phase(s) | Impact | Likelihood | Mitigation |
|---------|-------------|----------|--------|------------|------------|
| **R-1** | Agent builds a new `DetailSlideover` next to `ContextDrawer` instead of refactoring it; codebase ships with two drawer systems that drift | 0a, 0b, 3 | HIGH | HIGH | P0-3 records the in-place refactor decision in `decisions-log.md`; manifesto §5.2 names `ContextDrawer` explicitly; every Layer 3 SlideOver dispatch prompt must include "DO NOT create a new component file at `DetailSlideover.tsx` — refactor `ContextDrawer.tsx` in place per decisions-log entry"; CI grep check: `! grep -r "DetailSlideover" src/client/components/` (negative match) until rename lands |
| **R-2** | SalesView migration (Phase 3B) breaks a live operator workflow (credit, posting, prepayment) before rollback gate catches it | 3B | CRITICAL | MEDIUM | Feature flag `FEATURE_MERCURY_SALES` default-off; side-by-side persona QA in QA env before any production enablement; 3A→3B sequential with explicit `risk-verifier` gate; sales-operator persona flows + cross-persona X1 (purchase→payment) must score grade B+ in QA env before flag flips on for any operator; partial rollback unit defined in P0-5 |
| **R-3** | Per-view ColDef arrays creep back in after Layer 2 ships because an agent doesn't realize `entity-schemas.ts` is canonical | All | HIGH | HIGH | `entity-schemas.ts` declared single source in manifesto ARCH-2; per-view spec sheets MUST cite the entity-schema entry by line number; CI grep check fails PR if `colDef:\s*ColDef\[\]` appears in any file under `src/client/views/` outside `src/client/views/legacy/`; per-view code review checklist includes "columns come from schema, not inline" |
| **R-4** | Status enums in `src/shared/statuses.ts` drift from `commandBus.ts` case statements; BulkActionBar shows invalid actions or hides valid ones | 0a, 1+ | CRITICAL | MEDIUM | P0-1 ships with `src/shared/statuses.test.ts` static-analysis test that fails build if any status in `commandBus.ts` is missing from `statuses.ts` or vice versa; test runs in CI; status enum changes require paired `commandBus.ts` review |
| **R-5** | Backend procedures ship per P0-2 spec but UI was built against a different (older draft) contract; runtime mismatch on first real load | 0b, 1 | HIGH | MEDIUM | Procedure Zod input/output schemas are the contract; UI imports the inferred types from `src/server/routers/<router>.ts` via tRPC type inference (no hand-typed mirrors); Phase 1 pilot includes one end-to-end runtime probe via fast-runner Playwright before persona QA |
| **R-6** | `GridJourney` parallel-built as `PrimaryGridView` instead of refactored in place; 10+ existing views still import `GridJourney` for weeks while new template diverges | 0a, 1, 2 | HIGH | HIGH | P0-4 records in-place refactor + rename decision; Layer 4 dispatch ships rename + adapter in **one atomic commit** so no dependent view breaks mid-flight; CI grep check on `GridJourney` import path post-rename |
| **R-7** | `mergeColumnDefsWithPrefs` is not compatible with auto-generated column defs from `entity-column-map.ts`; operators lose their saved column visibility/width/pin on first login post-migration | 0b L2, 1+ | HIGH | MEDIUM | P0-5 names `mergeColumnDefsWithPrefs` compat test as a P0 deliverable; Layer 2 acceptance criteria includes a `gridColumnPrefs` round-trip test against generated columns for at least PurchaseOrder and SalesOrder; pre-flight migration in P0-5 carries a one-time pref-shape upgrade if structural |
| **R-8** | Saved filters (existing `SavedFiltersDropdown`) become unusable because filter bridge (T-0-08) collapses OR/nested groups | 1, 2 | MEDIUM | HIGH | CPO F7 mitigation: bridge is one-way coercive (complex preserved, simple read-only-on-complex); spec at `docs/engineering-plans/specifications/components/filter-toolbar.md` updated to reflect this; "Complex filter active — Switch to advanced to edit" UI affordance is required AC for FilterToolbar |
| **R-9** | Mobile views (7) silently rot during desktop retrofit and never catch up; Phase 4 mobile sub-plan becomes a quarter of unbudgeted work | 1–3, 4 | MEDIUM | HIGH | Phase 4 explicitly budgets one task per mobile view (see §4); Phase 1–3 spec sheets include a "Mobile impact" subsection naming whether the mobile equivalent is affected; mobile-affecting changes file Linear issues against project TERP Operator under registry CAP-040/041/042 |
| **R-10** | `useUiStore` persisted-shape migration (drawerByView, gridFilters, lastUsedDrawerStateByView, selectedRows) ships wrong and operators lose their session state on first reload after the feature flag enables | 0b L2, 1+ | HIGH | MEDIUM | P0-5 defines version bump + safe-reset rules; per-view feature flag activation script clears persisted state for migrated views with a one-time "Your saved view was reset because of an upgrade" toast; rollback unit reverts both the flag and the persisted-shape version |
| **R-11** | Multiple agents invent different URL grammars for filter/tab/selection state; views become incompatible refresh-targets across browser tabs | 0b L3, 1+ | MEDIUM | HIGH | `docs/engineering-plans/url-grammar.md` (P1 #9 in CPO §7; authored in Phase 0b alongside `useViewUrlState` hook spec); `useViewUrlState(view)` is the **only** sanctioned URL writer; per-view spec sheets cite it; CI check that no view file directly mutates `window.location` or `useNavigate` for filter/tab/selection |
| **R-12** | `commands.runBulk` ships without per-row idempotency keys; double-submit on flaky network causes duplicated posts/payments | 0b L1 | CRITICAL | MEDIUM | P0-6 specifies idempotency key shape `${groupKey}:${rowId}:${commandName}`; `run-bulk.md` AC includes a double-submit integration test; commandBus journal extension required before Layer 1 close |
| **R-13** | Phase 3A cell-renderer extractions (7) write to the same `SalesView.tsx` in parallel; merge conflicts wipe in-flight work or silently drop one extraction | 3A | HIGH | HIGH | Phase 3A explicitly marks 3A-cell-renderers as **sequential per agent** (one `opus-build` agent owns all 7 in order) per CPO F3 mitigation; not parallel-dispatched even if independent on paper |
| **R-14** | Phase 3A test triage downgrades a genuinely golden test to "DOM-fragile" to land a release; UX regression ships invisibly | 3A | HIGH | MEDIUM | 3A-test-triage requires `qa-reviewer` PLUS `risk-verifier` co-sign on every test marked DOM-fragile; rationale committed alongside the test change; persona QA flow against SalesView is non-skippable in 3B regardless of unit-test outcomes |
| **R-15** | Slide-over tab components referenced in `registry.ts` don't exist yet (Customer purchase-history tab, Inventory finder tab, etc.); registry compiles but renders empty drawers at runtime | 0b L2, 1+ | MEDIUM | HIGH | CPO F6 mitigation: per-entity tab inventory `EXISTS / NEEDS_REFACTOR / NEEDS_BUILD` at `docs/engineering-plans/tab-inventory.md` (P1 #8, due Phase 0b); each NEEDS_BUILD tab has its own dispatch task in Phase 0b before the entity's view ships; registry static check fails build if a registered tab key has no implementation export |
| **R-16** | Filter bridge tries lossless round-trip for advanced filters (OR/nested/between/in-list); silently broken filters ship to operators | 0b L3 | MEDIUM | HIGH | CPO F7 mitigation locked into spec (one-way coercive); spec test cases include negative cases (OR, nested AND/OR, between, in-list, like, relative date) that assert "Complex filter active" pill is shown and toolbar is read-only |
| **R-17** | New tRPC procedures (T-B-01..T-B-18) ship without role gating; data leak to lower-role users | 0b L1 | CRITICAL | MEDIUM | P0-2 procedure spec template includes mandatory "Role gating" section; CI lint rule (per CPO F11 #2) rejects PRs where a new tRPC procedure does not use `protectedProcedure` with a documented role minimum or have an explicit `// PUBLIC: <rationale>` comment; per-procedure test includes one role-failure case (required AC) |
| **R-18** | Schema migrations applied via `drizzle-kit push` directly to prod instead of via `pnpm db:migrate` with reviewed SQL files | 0b L1 | CRITICAL | LOW | P0-7 DB migration audit ships before any backend procedure that needs a schema change; AGENTS.md `terminal` agent permissions exclude `drizzle-kit push` in prod-equivalent environments; rollback note paired with every migration per P0-7 AC; ops runbook in `docs/engineering-plans/db-migration-audit.md` |
| **R-19** | Deprecated components (`WorkspacePanel` 45 uses, `FilterPresetStrip` 16, `StatusActionBar` 26) linger because dependent views still import them; Phase 4 deletes them, build breaks | 4 | MEDIUM | MEDIUM | Phase 4 deprecation tasks (`4-deprecate-WorkspacePanel`, etc.) include `grep -r "WorkspacePanel" src/` zero-match gate as AC; per-view migration in Phase 1–3 includes removal of legacy imports as part of the same commit; deprecation task only runs after `risk-verifier` confirms grep is zero |
| **R-20** | Persona QA regressions discovered only at Phase 4 final run; backlog explodes 2 weeks before "done" | 1, 2, 3, 4 | HIGH | MEDIUM | §9 below mandates persona QA at end of every phase (not just Phase 4); each phase closeout gate names the specific persona flows that must run and pass; regressions filed as GH issues immediately, not deferred |
| **R-21** | Multiple parallel agents claim adjacent files (e.g., two agents on different Layer 3 components both edit `tabs/registry.ts`); silent overwrites | 0b, 1, 2, 3 | MEDIUM | MEDIUM | AGENTS.md mandates `~/.agent-state/agent-claim <branch>` before dispatch; agent dispatch prompts list **the exact files** the agent is permitted to write; per-phase the integrator (PM lane) reviews the file-ownership matrix before parallel dispatch |
| **R-22** | Cross-machine agents (DigitalOcean fast runner, other Macs) are invisible to LOCAL `agent-check`; two surfaces race on the same branch | All | MEDIUM | MEDIUM | AGENTS.md acknowledges this explicitly; PR integrator (not the worker agent) reconciles via secondary signals (`git log` on target worktree, agentchat status, running process list); push-from-worktree guard blocks accidental cross-machine push collisions; long-running jobs use `agentchat` to announce start/end |
| **R-23** | Phase 3B docs SalesView decision: "InventoryFinder becomes a `CollapsibleSection` (one expanded at a time per ARCH-11)" — but the existing inline finder is what sales operators use mid-quote; collapsing it kills the primary workflow | 3B | HIGH | MEDIUM | Phase 3B spec (3B-V-spec) MUST validate with sales-operator persona before implement; if the persona test rejects collapsed-finder, escalate to a manifesto exception (Customer Context Header keeps finder visible inline above 1440px) recorded in decisions-log; do not silently keep both pre-Phase-3B pattern AND the new ARCH-11 form |
| **R-24** | Feature flags `FEATURE_MERCURY_*` accumulate over Phase 1–3 and the flag-removal task in Phase 4 is repeatedly deferred; production keeps two code paths indefinitely | 4 | MEDIUM | HIGH | Phase 4 `4-flag-removal` is a non-deferrable closeout gate; `risk-verifier` Phase 4 closeout fails if any `FEATURE_MERCURY_*` reference remains in source; cumulative flag count tracked in this document's amendments log per phase close |
| **R-25** | Under deadline pressure agents start "designing as they build" because spec sheets aren't ready; per-view chrome diverges and the manifesto's component hierarchy gets bypassed | 1, 2, 3 | HIGH | HIGH | Phase 0b spec dispatch (0b-spec-views, 0b-spec-hooks, 0b-spec-templates, 0b-spec-components) is a HARD GATE before Phase 1+ implementation; per-phase dispatch prompts must cite the spec sheet path; PR template requires "Spec sheet: docs/engineering-plans/specifications/views/<view>.md exists and was followed" checkbox |
| **R-26** | Phase 3A reverts (per 3A rollback gate) leave orphaned cell-renderer files in `src/client/views/SalesView/cells/` because the revert only touches `SalesView.tsx` | 3A | LOW | MEDIUM | 3A rollback semantics in §4 names the cell-renderer files as part of the atomic revert; `git revert <commits>` on the squashed extraction commit removes both the file moves and the view import changes together |
| **R-27** | Layer 1 `queries.grid` extension (filter/sort/group params) ships with N+1 queries because per-entity joins were added per spec but no explicit query plan review happened | 0b L1 | HIGH | MEDIUM | P0-2 grid-v2 spec mandates an N+1 avoidance section; Layer 1 close criteria includes one EXPLAIN review per per-entity grid path on a seeded dataset; perf gate at Phase 4 catches survivors |

**Risk-register maintenance:** When a phase exercises a mitigation (good or bad), append a row to §10 with the date, the risk ID, what fired, and what the next mitigation tweak should be. Risks are durable; mitigations evolve.

---

## §7 — Verification & Review Gates Per Phase

Each phase has a fixed gate table. "Required" means the gate **must** pass before the next phase dispatches. "Conditional" means the gate runs only when the named trigger is present. Reviewer naming follows AGENTS.md QA Tiers; `risk-verifier` is the canonical closeout reviewer per global policy.

### Phase 0a Gates

| Gate | Required? | Detail | Command / Reviewer |
|------|-----------|--------|---------------------|
| Typecheck | Required | `src/shared/statuses.ts` + `entity-actions.ts` import refactor must compile | `pnpm typecheck` (local, fast — P0-1 output is one file) |
| Unit (vitest) | Required (P0-1 only) | `statuses.test.ts` round-trip vs `commandBus.ts` | `pnpm vitest run src/shared/statuses.test.ts` |
| Playwright E2E | N/A | No production UI changes in Phase 0a | — |
| Spec sheet review | Required | Each P0-2 procedure spec reviewed against `_TEMPLATE.md` manifesto anchoring requirement | `claude-architect` write, `risk-verifier` review |
| Decisions log entries | Required | P0-3 and P0-4 entries committed; format matches existing | Manual `risk-verifier` check |
| Deep QA score | Required (Critical tier) | Floor **95** per global Critical policy (Phase 0a includes bulk-semantics decision; CRITICAL) | `risk-verifier` closeout report appended to this document |
| Gate condition | All 7 P0 outputs exist; all P0 close criteria from §2 met; `risk-verifier` pass on each output | | — |

### Phase 0b Gates

| Gate | Required? | Detail | Command / Reviewer |
|------|-----------|--------|---------------------|
| Typecheck | Required | Fast-runner: full repo typecheck after Layer 0 + Layer 1 + Layer 2 land | `fast-runner exec terp-operator -- pnpm typecheck` |
| Unit (vitest) | Required | Per-procedure tests (T-B-01..T-B-18), per-hook tests, per-config tests | `fast-runner exec terp-operator -- pnpm test` |
| Playwright E2E | N/A | No production view changes yet; templates/components ship but no view consumes them | — |
| DB migrations | Required (conditional on P0-7) | Each migration applied with rollback tested locally first | `fast-runner exec terp-operator -- pnpm db:migrate` + dev-DB rollback drill |
| Spec sheet completeness | Required | All Phase 1+2 view specs, all hook specs, all template specs, all remaining component specs exist | `claude-architect` writes, `risk-verifier` reviews coverage against manifesto §7.1 |
| Backend role-gating audit | Required | Every new tRPC procedure either uses `protectedProcedure` with role minimum or has `// PUBLIC: <rationale>` | `cross-reviewer` (terminal grep + lint) |
| Layer 0/1/2 completion criteria | Required | Per §3 layer definitions | `risk-verifier` |
| Deep QA score | Required (Critical tier — bulk dispatch + DB migrations + role gating) | Floor **95** | Single primary reviewer pass; second reviewer added only on flagged concern |
| Gate condition | All §3 Layer 0/1/2 completion criteria green; spec sheets for Phase 1+2 views ready | | — |

### Phase 1 Gates (Pilot — PurchaseOrdersView)

| Gate | Required? | Detail | Command / Reviewer |
|------|-----------|--------|---------------------|
| Typecheck | Required | Full repo | `fast-runner exec terp-operator -- pnpm typecheck` |
| Unit (vitest) | Required | `tests/unit/PurchaseOrdersView.test.tsx` + per-component tests touched | `fast-runner exec terp-operator -- pnpm vitest run tests/unit/PurchaseOrdersView.test.tsx src/client/components` |
| Playwright E2E | Required | `tests/e2e/purchase-orders.spec.ts` (existing operator-console spec scoped to PO surfaces) against Mac mini dev server | `fast-runner exec terp-operator -- PLAYWRIGHT_SKIP_WEB_SERVER=1 pnpm exec playwright test tests/e2e/purchase-orders.spec.ts --project=chromium --workers=1` |
| AQA | Required (Critical tier — first production code dispatch on the new pattern) | `aqa` skill against the PurchaseOrdersView behind `FEATURE_MERCURY_PO=on` in QA env | `/aqa` runner output appended to closeout |
| Persona QA | Required | inventory-operator flows 7, 8, 9 + cross-persona X1 (purchase-to-payment) scoped to PO sub-steps; see §9 | `pnpm qa:env:setup` then per-flow runbook |
| Review | Required (Critical) | `risk-verifier` primary; add `cross-reviewer` if AQA flags a runtime concern (otherwise single reviewer) | — |
| Deep QA score | Required (Critical tier) | Floor **95**. Reducers: missing AQA -10..-20, missing spec coverage -10, broken user path -15..-25 | Closeout report appended to this document |
| Gate condition | Persona QA grade A; AQA pass; `risk-verifier` close; flag has been on for ≥1 operator session in QA env for at least 1 working day without P0/P1 regressions | | — |

### Phase 2 Gates (GridJourney sweep — 10 simple views)

| Gate | Required? | Detail | Command / Reviewer |
|------|-----------|--------|---------------------|
| Typecheck | Required | Full repo, after each batch of view PRs lands | `fast-runner exec terp-operator -- pnpm typecheck` |
| Unit (vitest) | Required | Per-view `tests/unit/<View>.test.tsx` and any touched component tests | `fast-runner exec terp-operator -- pnpm vitest run` (scoped per view PR) |
| Playwright E2E | Required (per migrated view) | Existing per-view E2E specs where they exist; new specs authored for views without coverage as part of the migration spec | `fast-runner exec terp-operator -- PLAYWRIGHT_SKIP_WEB_SERVER=1 pnpm exec playwright test --project=chromium` |
| AQA | Conditional | Trigger AQA per-view on done claim when the view touches money (Payments, VendorBills, Invoices), persisted mutations (Orders), or external integrations (Connectors-adjacent) — i.e., Deep QA scope per AGENTS.md. Read-only views (Customers, Vendors, Lots list) are Normal tier, no AQA | `/aqa` per qualifying view |
| Persona QA | Required (cumulative) | Cross-persona X1, X2 + per-persona for inventory-operator, payments-accounting; see §9 | Per-flow runbook |
| Review | Required | `qa-reviewer` per view (Normal tier default); `risk-verifier` for Deep QA views; do not stack reviewers by default | — |
| Deep QA score | Required (Deep QA views: Payments, VendorBills, VendorPayables, Invoices, Orders) | Floor **90** | Per-Deep-QA-view closeout |
| Gate condition | All 10 views shipped behind per-view flag; persona QA grade B+ on covered flows; zero P0/P1 regressions; `risk-verifier` close on the phase as a whole | | — |

### Phase 3A Gates (SalesView refactor, HARD GATE)

| Gate | Required? | Detail | Command / Reviewer |
|------|-----------|--------|---------------------|
| Typecheck | Required | After each cell-renderer extraction commit | `fast-runner exec terp-operator -- pnpm typecheck` |
| Unit (vitest) | Required | All 5 SalesView test suites; golden tests must pass unchanged, DOM-fragile changes require co-signed rationale (R-14 mitigation) | `fast-runner exec terp-operator -- pnpm vitest run tests/unit/SalesView` |
| Playwright E2E | Required | Sales E2E spec (existing or new under `tests/e2e/sales.spec.ts`) before rollback gate | `fast-runner exec terp-operator -- PLAYWRIGHT_SKIP_WEB_SERVER=1 pnpm exec playwright test tests/e2e/sales.spec.ts --project=chromium --workers=1` |
| Test triage co-sign | Required | Any test marked "DOM-fragile" requires `qa-reviewer` AND `risk-verifier` sign-off in PR comments before merge | Both reviewers |
| File size gate | Required | Post-3A `SalesView.tsx` ≤ 1200 lines (per §4 3A-rollback-gate) | `wc -l src/client/views/SalesView.tsx` in closeout |
| AQA | N/A in 3A | No UX change in 3A; deferred to 3B | — |
| Review | Required (Critical) | `risk-verifier` primary; `cross-reviewer` second pass because Phase 3A touches load-bearing infrastructure across the largest file in the repo | Both reviewers |
| Deep QA score | Required (Critical) | Floor **95** | Closeout |
| Gate condition (3A → 3B) | All test suites green or co-signed; `SalesView.tsx` ≤ 1200 lines; rollback decision = PROCEED. If REVERT, file revert commits and replan per §4. | | — |

### Phase 3B Gates (SalesView migration)

| Gate | Required? | Detail | Command / Reviewer |
|------|-----------|--------|---------------------|
| Typecheck | Required | After each panel migration | `fast-runner exec terp-operator -- pnpm typecheck` |
| Unit (vitest) | Required | SalesView suites + new per-component tests for migrated panels (CustomerCreditPill, etc.) | `fast-runner exec terp-operator -- pnpm vitest run` |
| Playwright E2E | Required | Sales E2E spec + cross-persona E2E if available | `fast-runner exec terp-operator -- PLAYWRIGHT_SKIP_WEB_SERVER=1 pnpm exec playwright test tests/e2e/sales.spec.ts tests/e2e/sales-credit-prepay.spec.ts --project=chromium` |
| AQA | Required (Critical — money + persisted mutations + UI redesign) | `aqa` against SalesView behind `FEATURE_MERCURY_SALES=on` in QA env, focused on credit flow + prepayment + posting | `/aqa` output appended |
| Persona QA | Required | sales-operator flows 4, 5, 6 + cross-persona X1, X2 — see §9; **persona QA validates R-23** (InventoryFinder collapsed-vs-inline decision) | Per-flow runbook + sales-operator persona explicit acceptance |
| Review | Required (Critical) | `risk-verifier` primary; add `cross-reviewer` (because money path + UI redesign in a single phase warrants two-lane verification) | Both reviewers |
| Deep QA score | Required (Critical) | Floor **95** | Closeout |
| Gate condition (3B → 3C) | sales-operator persona grade B+; cross-persona X1, X2 grade A; AQA pass; `risk-verifier` close. If sales-operator persona < B, REVERT 3B and replan per §4. | | — |

### Phase 3C Gates (Intake + Dashboard + Matchmaking)

| Gate | Required? | Detail | Command / Reviewer |
|------|-----------|--------|---------------------|
| Typecheck | Required | Full repo | `fast-runner exec terp-operator -- pnpm typecheck` |
| Unit (vitest) | Required | Per-view tests | `fast-runner exec terp-operator -- pnpm vitest run` |
| Playwright E2E | Required (per view) | Per-view E2E spec | `fast-runner exec terp-operator -- PLAYWRIGHT_SKIP_WEB_SERVER=1 pnpm exec playwright test --project=chromium` |
| AQA | Required for IntakeView (Critical — persisted mutations + multi-step posting); Conditional for Dashboard/Matchmaking (Deep QA only if data-integrity surfaces are touched) | `/aqa` per qualifying view | — |
| Persona QA | Required (full 26-flow sweep, since PO + Sales + Dashboard now all migrated) | See §9 | Persona QA framework |
| Review | Required (Deep QA / Critical per view) | `risk-verifier` primary; `qa-reviewer` for Normal Matchmaking surfaces | — |
| Deep QA score | Required | Floor **90** for Deep QA; **95** for Intake (Critical) | Closeout |
| Gate condition | Full 26-flow persona QA grade B+ overall; X1, X2 grade A; AQA pass on Critical surfaces; `risk-verifier` close | | — |

### Phase 3D Gates (remaining complex views)

| Gate | Required? | Detail | Command / Reviewer |
|------|-----------|--------|---------------------|
| Typecheck | Required | Full repo | `fast-runner exec terp-operator -- pnpm typecheck` |
| Unit (vitest) | Required | Per-view tests | `fast-runner exec terp-operator -- pnpm vitest run` |
| Playwright E2E | Required (per view) | Per-view E2E | Fast-runner Playwright |
| AQA | Conditional | Per AGENTS.md Deep QA triggers (money/auth/migration/multi-step side effects) — e.g., CreditReviewView (owner-only, auth-gated) requires AQA; RefereeAdminView likely Normal | `/aqa` per qualifying view |
| Persona QA | Required (delta) | Re-run any persona flow that touches a Phase 3D view; no regressions vs Phase 3C baseline | Per-flow runbook |
| Review | Required | `risk-verifier` for Critical (CreditReview); `qa-reviewer` for Normal | — |
| Deep QA score | Required for Deep QA/Critical views | Floor 90/95 per tier | Closeout |
| Gate condition | All Phase 3D views shipped behind flags; persona QA delta clean; `risk-verifier` close | | — |

### Phase 4 Gates (polish, mobile, a11y, cleanup, flag removal)

| Gate | Required? | Detail | Command / Reviewer |
|------|-----------|--------|---------------------|
| Typecheck | Required | After each deprecation removal | `fast-runner exec terp-operator -- pnpm typecheck` |
| Unit (vitest) | Required | Full suite | `fast-runner exec terp-operator -- pnpm test` |
| Playwright E2E | Required | Full E2E suite, including mobile project | `fast-runner exec terp-operator -- PLAYWRIGHT_SKIP_WEB_SERVER=1 pnpm exec playwright test --project=chromium --project=mobile-safari` |
| A11y | Required (per view) | `pnpm exec axe-core` (or equivalent) zero violations per view; manual screen-reader smoke on representative flows | Per-view audit report |
| Perf | Required (perf-sensitive views) | Lighthouse / Web Vitals targets met (LCP < 2.5s, INP < 200ms, CLS < 0.1) on SalesView, OrdersView, InventoryView, DashboardView | Per-view perf profile in closeout |
| Deprecation grep gates | Required | `grep -r "WorkspacePanel\|FilterPresetStrip\|StatusActionBar" src/` returns zero matches | Terminal in closeout |
| Flag-removal gate (R-24) | Required | `grep -r "FEATURE_MERCURY_" src/` returns zero matches | Terminal in closeout |
| AQA final | Required (Critical) | `aqa` against full migrated app | `/aqa` final report |
| Persona QA final | Required | Full 26-flow run; grade A overall; X1, X2 grade A; zero P0/P1 | Persona QA framework |
| Review | Required (Critical closeout) | `risk-verifier` primary; `closure-auditor` for project-retirement packet per AGENTS.md (this is project-end, not just phase-end) | Both reviewers |
| Deep QA score | Required (Critical) | Floor **95** | Final closeout |
| Gate condition | Persona QA grade A; AQA pass; zero deprecated imports; zero feature flags; `risk-verifier` and `closure-auditor` close; project marked complete | | — |

---

## §8 — Per-View Dispatch Index

All 27 views in the migration scope (per `view-registry.ts` placeholders + wireframe inventory + `src/client/views/*.tsx`). **Risk** column reflects per-view risk independent of phase risk. **Notes** call out per-view subtleties an agent must respect.

| # | View | Current File | Template | Entity | Phase | Risk | Notes |
|---|------|-------------|----------|--------|-------|------|-------|
| 1 | PurchaseOrdersView | `src/client/views/PurchaseOrdersView.tsx` | `primaryGrid` | `purchaseOrder` | **1 (pilot)** | HIGH (pilot — pattern must validate) | Mid-complexity. PO state machine most complete in scaffold. Persona flows 7,8,9 exist. WF-V-PO. |
| 2 | OrdersView | `src/client/views/OrdersView.tsx` | `primaryGrid` | `order` | 2 | LOW | Currently uses `GridJourney` + `inspectorTabs`. `inspectorTabs` migration to SlideOver tabs is the only non-trivial part. WF-V-ORDERS. |
| 3 | PaymentsView | `src/client/views/PaymentsView.tsx` | `primaryGrid` | `payment` | 2 | MEDIUM (Deep QA — money) | Money path; persona flows 10, 11. AQA required. WF-V-PAYMENTS. |
| 4 | VendorPayablesView | `src/client/views/VendorPayablesView.tsx` | `primaryGrid` | `vendorBill` | 2 | MEDIUM (Deep QA — money) | Vendor bill payment lifecycle. Persona flow 12 (Critical). AQA required. WF-V-VPAYABLES. |
| 5 | PurchaseReceiptsView | `src/client/views/PurchaseReceiptsView.tsx` | `primaryGrid` | `intakeBatch` | 2 | LOW | Read-mostly. Receipt detail tab refactor. WF-V-PRECEIPTS. |
| 6 | InvoiceDisputesView | `src/client/views/InvoiceDisputesView.tsx` | `primaryGrid` | `invoiceDispute` | 2 | LOW | Tab integration for dispute timeline. WF-V-DISPUTES. |
| 7 | ContactsView | `src/client/views/ContactsView.tsx` | `primaryGrid` | `customer` (default) | 2 | LOW | Customer + Vendor unified view (ARCH-3 exception documented in spec). Merge banner pattern stays. WF-V-CONTACTS. |
| 8 | RecoveryView | `src/client/views/RecoveryView.tsx` | `primaryGrid` | `recoveryItem` | 2 | LOW | Read-mostly recovery surface; reversal flows. Persona flow 9, 18. WF-V-RECOVERY. |
| 9 | ItemsView | `src/client/views/ItemsView.tsx` | `primaryGrid` | `item` | 2 | LOW | Simple list. WF-V-ITEMS. |
| 10 | ConnectorsView | `src/client/views/ConnectorsView.tsx` | `primaryGrid` | `connectorRequest` | 2 | MEDIUM (Deep QA — external API) | Persona flows 22, 23, 24. WF-V-CONNECTORS. |
| 11 | InventoryView | `src/client/views/InventoryView.tsx` | `primaryGrid` | `batch` | 2 | MEDIUM | Lot/batch list. `PhotographyQueuePanel` integration risk (Wave 7 vs retrofit thrash per CPO F1). WF-V-INVENTORY. |
| 12 | SalesView | `src/client/views/SalesView.tsx` (1986 lines) | `primaryGrid` | `sale` | **3A + 3B** | **CRITICAL** | 87+ manifesto-forbidden patterns per CPO F3. 7 inline cell renderers, 6 stacked WorkspacePanels, RecordPrepaymentDialog modal. 3A refactor → 3B migration. R-2, R-13, R-14, R-23. WF-V-SALES. |
| 13 | IntakeView | `src/client/views/IntakeView.tsx` | `masterDetail` | `intakeBatch` | 3C | HIGH (Deep QA — persisted mutations, multi-step) | TSV paste, CSV drag-drop, registry bijection (UX-U02 Wave 7). Persona flows 7, 8, 9, X2. `opus-build` agent. WF-V-INTAKE. |
| 14 | DashboardView | `src/client/views/DashboardView.tsx` | `dashboard` | `dashboard` | 3C | MEDIUM | 8-stacked-WorkspacePanel anti-pattern. `DashboardView` template (Layer 4) + typed widgets per ARCH-10. WF-V-DASH. |
| 15 | MatchmakingView | `src/client/views/MatchmakingView.tsx` | `primaryGrid` | `matchCandidate` | 3C | MEDIUM | Two-pane matchmaking. WF-V-MATCH. |
| 16 | FulfillmentView | `src/client/views/FulfillmentView.tsx` | `primaryGrid` | `fulfillment` | 3D | MEDIUM (Deep QA — persisted state) | Pick → weigh → fulfill. Persona flows 13, 14, 15. WF-V-FULFILLMENT. |
| 17 | PickView | `src/client/views/PickView.tsx` | `wizard` | `pick` | 3D | MEDIUM | Wizard template. Wave-card flow. WF-V-PICK. |
| 18 | CloseoutView | `src/client/views/CloseoutView.tsx` | `primaryGrid` | `closeoutBatch` | 3D | HIGH (Deep QA — period closeout) | Persona flow 3 (period closeout full lifecycle). AQA required. WF-V-CLOSEOUT. |
| 19 | CreditReviewView | `src/client/views/CreditReviewView.tsx` | `primaryGrid` | `creditReview` | 3D | HIGH (Critical — owner-only auth + credit decisions) | Owner-only route gate. AQA required. Persona flow 2. WF-V-CREDIT. |
| 20 | RefereesView | `src/client/views/RefereesView.tsx` | `primaryGrid` | `referee` | 3D | LOW | Referee admin surface. WF-V-REFEREES. |
| 21 | ProcessorsView | `src/client/views/ProcessorsView.tsx` | `primaryGrid` | `processor` | 3D | LOW | Processor admin surface. WF-V-PROCESSORS. |
| 22 | MediaView | `src/client/views/MediaView.tsx` | `primaryGrid` | `mediaAsset` | 3D | MEDIUM | Photography queue. `PhotographyQueuePanel` integration. Persona flows 19, 20, 21. WF-V-MEDIA. |
| 23 | MergeCandidatesView | `src/client/views/MergeCandidatesView.tsx` | `primaryGrid` | `mergeCandidate` | 3D | MEDIUM (auth-gated) | Route gate. Merge confirmation flow. WF-V-MERGE. |
| 24 | ContactProfileView | `src/client/views/ContactProfileView.tsx` | `masterDetail` | `customer` (or `vendor`) | 3D | MEDIUM | Profile detail (parent: ContactsView). Tab-heavy. WF-V-CPROFILE. |
| 25 | ClientLedgerView | `src/client/views/ClientLedgerView.tsx` | `primaryGrid` | `customer` | 3D | MEDIUM (Deep QA — money) | Customer ledger. AQA conditional. WF-V-CLIENTS. |
| 26 | OperationsViews (umbrella) | `src/client/views/OperationsViews.tsx` | n/a | n/a | 3D / cleanup | LOW | Umbrella that composes Orders/Payments/etc. — refactor scope is umbrella → router wiring once consumed views ship. May be deleted in Phase 4. |
| 27 | SettingsView | `src/client/views/SettingsView.tsx` | `primaryGrid` (settings tab pattern) | `settingsEntity` | 3D | MEDIUM (auth-gated — credit-engine admin owner-only) | Route gate + credit engine admin sub-route. WF-V-SETTINGS. |

**Phase 4 mobile views** (parallel to desktop Phase 4 cleanup):

| # | Mobile View | Current File | Phase | Risk | Notes |
|---|-------------|-------------|-------|------|-------|
| M1 | MobileDashboardView | `src/client/views/mobile/MobileDashboardView.tsx` | 4 | MEDIUM | Mirrors DashboardView decisions; widget set must be mobile-tier per ARCH-10. |
| M2 | MobileIntakeView | `src/client/views/mobile/MobileIntakeView.tsx` | 4 | HIGH (Deep QA) | Persisted mutations on mobile; AQA-mobile recommended. |
| M3 | MobilePaymentsView | `src/client/views/mobile/MobilePaymentsView.tsx` | 4 | HIGH (Deep QA — money) | AQA-mobile recommended. |
| M4 | MobileCatalogView | `src/client/views/mobile/MobileCatalogView.tsx` | 4 | MEDIUM | Read-mostly catalog. |
| M5 | MobileContactsView | `src/client/views/mobile/MobileContactsView.tsx` | 4 | LOW | Read-mostly. |
| M6 | MobileContactProfileView | `src/client/views/mobile/MobileContactProfileView.tsx` | 4 | LOW | Read-mostly. |
| M7 | MobileInventoryView | `src/client/views/mobile/MobileInventoryView.tsx` | 4 | MEDIUM | Read-mostly inventory. |

**Dispatch protocol per view:**

1. Confirm phase per this table.
2. Confirm spec sheet exists at `docs/engineering-plans/specifications/views/<view-slug>.md` (Phase 0b prerequisite).
3. Run `~/.agent-state/agent-check` and `~/.agent-state/agent-claim <branch> "<view> migration"` per AGENTS.md.
4. Dispatch the agent type per §3 Layer 5 (`build` default; `opus-build` for SalesView, IntakeView, and any view flagged HIGH/CRITICAL above).
5. Per-view PR includes feature flag, persona QA evidence (if phase requires), and link to spec sheet.
6. Tracker writeback (Linear or GitHub Issue) at PR open and PR merge per AGENTS.md "Tracker Updates at Completion Checkpoints."

---

## §9 — Persona QA Cadence

The persona-flow QA suite at `docs/qa/persona-flows/REGISTRY.md` defines 26 flows (2 cross-persona + 24 per-persona across 8 personas). The retrofit runs persona QA **at every phase close**, not just at the final Phase 4 gate. This prevents R-20 (regressions accumulating into Phase 4).

**Operating protocol:** When the agent receives "run persona QA" (or equivalent — see AGENTS.md *QA Environment — On-Demand Persona Flow Testing*), the agent runs `pnpm qa:env:setup` on the fast runner against the active branch, parses `QA_APP_URL`, executes the in-scope flows, and writes a run report to `docs/qa/runs/YYYY-MM-DD-<scope>-report.md`. The cadence below names the scope per phase.

| Phase | When | Scope | Required flows | Pass criteria | Pre-conditions |
|-------|------|-------|----------------|----------------|----------------|
| **Phase 0a** | At Phase 0a close | None | — | N/A (no production UI changes) | N/A |
| **Phase 0b** | At Phase 0b close | None | — | N/A (no view-level UI changes) | Backend procedures present, but no view renders against them yet |
| **Phase 1 (PO pilot)** | At Phase 1 close, behind `FEATURE_MERCURY_PO=on` | **Critical flows** scoped to PO surfaces | inventory-operator flow 7 (receive batch normal), flow 8 (flagged batch edge), flow 9 (reversal after bad post error); cross-persona X1 step "purchase order create + receive" segment only (full X1 N/A until Sales also migrates) | Grade **A** on flows 7, 8, 9; zero P0/P1; cross-persona X1 PO segment passes | PurchaseOrdersView behind flag; seed via `pnpm qa:env:setup`; QA env up |
| **Phase 2 (GridJourney sweep)** | At Phase 2 close, all 10 views behind flags | **Cross-persona X1, X2 + per-persona flows for inventory-operator (7,8,9) and payments-accounting (10,11,12)** | X1, X2 + 7,8,9,10,11,12 (6 of 26) | Grade **B+** overall; **A on X1, X2**; flow 12 (vendor bill payment lifecycle, Critical) grade A | All Phase 2 views behind per-view flags = on in QA env; PurchaseOrdersView still on from Phase 1 |
| **Phase 3A (SalesView refactor)** | At 3A rollback gate | None (no UX change) | — | N/A; gate is unit-test based per §7 | — |
| **Phase 3B (SalesView migration)** | Before 3B rollback gate | **sales-operator flows (4,5,6) + cross-persona X1 (full), X2** | Flows 4,5,6 + X1, X2 (5 of 26) | Grade **B+** on sales-operator flows; **A on X1, X2**; zero P0; sales-operator persona must explicitly accept the InventoryFinder treatment (validates R-23) | SalesView behind `FEATURE_MERCURY_SALES=on` in QA env; Phase 1+2 flags still on |
| **Phase 3C (Intake + Dashboard + Matchmaking)** | At Phase 3C close | **Full 26-flow sweep** (since PO + Sales + Dashboard + Intake now all migrated) | All 26 flows | Grade **B+** overall; **A on X1, X2**; AQA pass on IntakeView | All Phase 1–3C flags on in QA env |
| **Phase 3D (remaining complex views)** | At Phase 3D close | **Delta only** — flows that touch a Phase 3D view; full re-run if a Phase 3D view crosses a Critical-tier flow (Connectors flow 24, Closeout flow 3, CreditReview flow 2, Fulfillment flows 13,14,15) | Variable by Phase 3D view list | No regressions vs Phase 3C baseline; Critical flows still grade A | All Phase 1–3D flags on |
| **Phase 4 (polish, mobile, a11y, cleanup, flag removal)** | At Phase 4 close (Project Closeout) | **Full 26-flow suite** (final gate) + mobile flows for the 7 mobile views (mobile-scoped subset of relevant persona flows) | All 26 + mobile subset | Grade **A overall**; **A on X1, X2**; zero P0/P1; mobile flows grade B+ | All feature flags removed; deprecated components deleted; ready for project retirement |

**Reporting:** Each run produces `docs/qa/runs/<date>-<scope>-report.md` per AGENTS.md *Step 7 — Write run report*. The report is linked from this document's amendments log (§10) at each phase close.

**Ship-gate rule (per REGISTRY.md):** A QA run grade is VALID FOR SHIP DECISION only when both cross-persona flows (X1, X2) were run and passed or have explicit N/A rationale. Phase 1 X1 is partial (PO segment only) — record N/A rationale for the un-migrated Sales segment in the run report.

**Failure protocol:** Any persona-QA P0 finding blocks the phase gate and is filed against GitHub Issues (with `bug` label per AGENTS.md Section 8). Any P1 finding is filed against Linear under project TERP Operator with the registry ID. Findings are linked from this document's amendments log.

---

## §10 — Amendments Log

This log records: (1) document amendments (additions/edits to §§1–9), (2) phase closeouts (gate evidence summary), (3) risks that fired (and the mitigation that worked or didn't), and (4) persona QA run links per phase. Append-only; do not edit prior entries.

| Date | § | Change | Reason / Evidence |
|------|---|--------|-------------------|
| 2026-06-16 | All | Initial version of this document synthesized from CPO audit (`CPO-AUDIT-REPORT.md`), architecture manifesto (`MERCURY-ARCHITECTURE-MANIFESTO.md`), planning synthesis (`PLANNING-SYNTHESIS.md`), wireframe inventory (`wireframes/`), persona QA registry (`docs/qa/persona-flows/REGISTRY.md`), and `view-registry.ts` / `entity-schemas.ts` scaffolds. Phase 0a in progress; no production code dispatched. | First write — replaces dispatch sequencing in `MASTER-EXECUTION-DOCUMENT.md`, `AI-TODO.md`, and `dependency-graph.md` where they conflict. |
| 2026-06-16 | §6 | R-1..R-27 enumerated. | Synthesized from CPO F1–F15, manifesto §5 (parallel-build trap), AGENTS.md cross-machine claim gap, and architectural judgment on Phase 3A/3B rollback semantics, feature flag accumulation, and N+1 grid risk. |
| 2026-06-16 | §7 | Per-phase gate tables defined. | Aligns to AGENTS.md QA Tiers & Deep QA Gate (canonical) and TERP Operator AGENTS.md Deep QA Gate. `risk-verifier` is the canonical closeout reviewer; second reviewer added only on flagged concern (no default reviewer stacking). |
| 2026-06-16 | §8 | 27 views + 7 mobile views indexed with template, entity, phase, risk. | Derived from wireframe inventory (`wireframes/WF-V-*.md`), `view-registry.ts` placeholders, `src/client/views/*.tsx`, and `docs/engineering-plans/wireframes/INTEGRATION-MAP.md`. |
| 2026-06-16 | §9 | Persona QA cadence defined: PO pilot at Phase 1, partial X1+per-persona at Phase 2, full 26-flow at Phase 3C and Phase 4. | CPO F15 mitigation — prevents R-20 (regressions discovered only at final Phase 4 run). |

**Reserved rows** (append below as phases close — copy template):

```
| YYYY-MM-DD | <section / phase> | <amendment or closeout summary> | <evidence: PR link, run report path, risk-verifier closeout link> |
```

Examples of what each phase close row should record:

- **Phase 0a close**: links to the 7 P0 output files, `risk-verifier` closeout report, status enum test result.
- **Phase 0b close**: links to backend procedure PRs, Layer 0/1/2 completion evidence, spec sheet coverage report, fast-runner typecheck + test result.
- **Phase 1 close**: link to PO PR, Playwright spec result, AQA report, persona QA run report, `risk-verifier` closeout, list of operators × days flag was on without P0/P1 regressions.
- **Phase 2 close**: per-view PR links, persona QA report, `risk-verifier` closeout, deprecated-component grep status (still expected non-zero pending Phase 4).
- **Phase 3A close**: cell-renderer extraction commit range, golden-test pass evidence, DOM-fragile test co-sign comments, `SalesView.tsx` line count, rollback-gate decision (PROCEED / REVERT).
- **Phase 3B close**: SalesView migration PR, sales-operator persona acceptance of InventoryFinder treatment (R-23 outcome), AQA report, `risk-verifier` closeout.
- **Phase 3C close**: Intake/Dashboard/Matchmaking PRs, full 26-flow persona QA report, AQA Intake report.
- **Phase 3D close**: per-view PR links, persona QA delta report.
- **Phase 4 close (project retirement)**: final 26-flow + mobile persona QA report, AQA final, deprecation grep zero-match evidence, flag-removal grep zero-match evidence, `risk-verifier` + `closure-auditor` retirement packet.

---

*End of UNIFIED-EXECUTION-PLAN.md. This document is the SINGLE AUTHORITY for agent dispatch from Phase 0a close forward. Append amendments to §10; do not edit prior sections without recording the change there.*
