# TERP Operator — Merged Foundational Uplift Plan

**Date:** 2026-06-18  
**Branch:** `docs/mercury-ux-retrofit-master-plan` (57K lines of Mercury frontend already built)  
**Target:** Professional backend structure + reliability layer, preserving all Mercury frontend work  
**Duration:** 5 weeks (4 core + 1 contractor readiness)

---

## Core Insight

The Mercury UX Retrofit has already done significant, high-quality work on the frontend. 13 views refactored. 6 templates built. A centralized schema-driven architecture created. But it attached to the monolithic backend (`commandBus.ts` 8,063L, `queries.ts` expanded to 3,943L) — making the structural problem worse, not better.

**Strategy:** Keep Mercury's frontend. Fix the backend. Add reliability. Make it handoff-ready for contractors.

---

## What We Keep (Mercury Frontend — Already Well-Structured)

35 new frontend files that follow good patterns and should NOT be reorganized:

```
src/client/
├── templates/           ← 6 views templates (GridView, Dashboard, MasterDetail, etc.)
├── components/
│   ├── FilterToolbar.tsx         ← New progressive-disclosure filter UI
│   ├── DetailSlideover.tsx       ← Slide-out detail panels
│   ├── BulkActionBar.tsx         ← State-gated bulk actions
│   ├── GridSummaryStrip.tsx      ← Grid summary bar
│   ├── ViewTabBar.tsx            ← Tab navigation
│   ├── editors/ComboboxCellEditor.tsx
│   ├── cells/sales/              ← 9 sales-specific cell renderers
│   └── tabs/                     ← Tab registration system (4 view types)
├── config/
│   ├── entity-schemas.ts         ← Schema-driven entity definitions
│   ├── entity-actions.ts         ← State machine action definitions
│   ├── entity-column-map.ts      ← Column mapping registry
│   └── view-registry.ts          ← View composition registry
├── hooks/
│   ├── useColumnDefs.ts          ← Hook-based column definition
│   └── useEntityActions.ts       ← Hook-based entity actions
└── views/
    ├── sales/                    ← Decomposed sales view (BrowseMode, BuildMode, etc.)
    └── 13 refactored views       ← Converted to template pattern
```

These files are domain-grouped, schema-driven, and architecturally sound. The templates and config system are genuinely good software engineering.

---

### 1.0 Pre-Extraction Gates (MUST COMPLETE BEFORE PHASE 1)

These gates validate that extraction is safe before any code moves.

#### Gate A: Shared utilities extracted FIRST
- `src/domains/shared/journal.ts` — journal append (used by every domain on every command commit)
- `src/domains/shared/socket-emitter.ts` — socket emission (used by every domain on every command commit)
- These are dependencies of ALL domain modules. Extracting consumers before these exist would force dangling imports back to commandBus.ts internals.
- **Verification:** `pnpm typecheck` passes with shared/ extracted and re-exported from commandBus.ts

#### Gate B: commandBus import-side-effect audit
- Audit all import-time side effects in commandBus.ts: singleton registration, DB connection initialization, registry population
- Document each side effect and its extraction strategy
- **Verification:** Importing `@/domains/shared` does not trigger side effects that depended on commandBus import order

#### Gate C: .skip test baseline established
- Run `pnpm test` before ANY extraction. Record passing/failing counts.
- The success metric "Tests passing after extraction: 100%" needs a measurable baseline.
- **Verification:** `pnpm test` output saved to `docs/audits/pre-extraction-test-baseline.txt`

#### Gate D: tRPC typecheck simulation
- Pick one small domain (intake or media). Extract it with shim re-exports. Run `pnpm typecheck` end-to-end including client bundle.
- Validate that tRPC RouterOutputs/RouterInputs types are preserved through the re-export chain.
- If inference breaks, redesign the extraction pattern before committing to 2 weeks of work.
- **Verification:** `pnpm typecheck` passes with one extracted domain + shim; client bundle compiles

#### Gate E: Vite path alias validation
- Configure path aliases in tsconfig.json AND vite.config.ts
- Verify aliases resolve in both SSR and client bundles
- **Verification:** `pnpm typecheck && pnpm build` passes with aliases configured, zero files moved

#### Gate F: commandBus function-to-domain mapping
- Map all 93 commandBus exported functions to their target domain modules
- Document which domain absorbs pick/ commands (see §1.1 target structure — pick has its own module)
- **Verification:** Every function has an assigned home; no function is orphaned

#### Gate G: Route-to-domain mapping
- Map all query routes in queries.ts to their target domain routers
- Document which routes stay in the merge router (cross-entity queries)
- **Verification:** Mapping document saved to `docs/engineering-plans/function-route-mapping.md`

---

## What We Fix — Phase 1: Backend Domain Extraction (Week 1-2)

The backend is still a monolith. Mercury added endpoints into it. We extract them into domain modules.

### 1.1 Split `commandBus.ts` (8,063L → domain modules)

Current state: One file handling commands for purchase orders, sales, payments, intake, media, pick, credit, vendor payouts. 93 exported functions. 28 `as any` casts. 9 silent catch blocks.

Target:
```
src/domains/                          ← NEW
├── purchase-orders/
│   ├── index.ts                      ← Curated exports
│   ├── commands.ts                   ← PO finalization, line management
│   ├── receipts.ts                   ← PO receipt creation hooks
│   └── __tests__/
│       ├── commands.test.ts
│       └── receipts.test.ts
├── sales-orders/
│   ├── index.ts
│   ├── commands.ts                   ← Sales confirmation, exceptions
│   ├── receipts.ts
│   └── __tests__/
├── payments/
│   ├── index.ts
│   ├── commands.ts                   ← Payment receipt, vendor payout
│   ├── receipts.ts
│   └── __tests__/
├── intake/
│   ├── index.ts
│   ├── commands.ts
│   └── __tests__/
├── credit/
│   ├── index.ts
│   ├── commands.ts                   ← Credit recomputation triggers
│   └── __tests__/
├── inventory/
│   ├── index.ts
│   ├── commands.ts
│   └── __tests__/
├── media/
│   ├── index.ts
│   ├── commands.ts
│   └── __tests__/
├── pick/
│   ├── index.ts
│   ├── commands.ts                   ← Pick/pack workflow commands
│   └── __tests__/
└── shared/
    ├── index.ts
    ├── journal.ts                    ← Journal append (used by all domains)
    ├── socket-emitter.ts             ← Socket emission (used by all domains)
    └── __tests__/
```

**Process per domain:**
1. Write characterization tests capturing current behavior
2. Extract functions into domain module
3. **Fix silent catch blocks in extracted code BEFORE moving on** — every catch block that previously logged to console.warn must: (a) log through structured logger with command/entity context, (b) emit operator-visible notification for receipt/journal failures. Do NOT defer catch remediation to Phase 2.
4. Re-export from old `commandBus.ts` location for backward compatibility
5. Run full test suite — zero regressions required
6. Update Mercury's imports to point to new domain modules
7. Remove old code from `commandBus.ts`

**Mercury interaction:** Mercury's frontend calls into the command bus through tRPC. The tRPC router layer (`src/server/routers/`) calls command functions. These function signatures must stay identical — only their location changes. The old `commandBus.ts` exports stay as re-export shims until all consumers are migrated.

### 1.2 Finish Splitting `queries.ts` (3,943L → domain routers)

Current state: Partially split. `credit.ts`, `commands.ts`, `filters.ts`, `media.ts`, `subscriptions.ts` already extracted. Mercury added `queries.detail.ts`, `queries.entityTabs.ts`, `gridWhere.ts` as new files — these are already separate and good.

What remains in the monolith (~2,000 lines): Cross-entity query procedures, tab queries, summary queries. Move these to:

```
src/server/routers/
├── purchase-orders.router.ts        ← PO queries, tab queries, detail
├── sales-orders.router.ts           ← Sales queries, tab queries, detail
├── payments.router.ts               ← Payment queries, tab queries
├── inventory.router.ts              ← Inventory queries, tab queries
├── intake.router.ts                 ← Intake queries
├── queries.detail.ts                ← Already separate — keep
├── queries.entityTabs.ts            ← Already separate — keep
├── gridWhere.ts                     ← Already separate — resolve circular dep with queries.ts
└── index.ts                         ← Merges all via appRouter (already exists)
```

### 1.3 Path Alias Configuration

Add BEFORE any file moves to prevent import breakage:
```json
// tsconfig.json compilerOptions.paths
{
  "@/domains/*": ["./src/domains/*"],
  "@/client/*": ["./src/client/*"],
  "@/server/*": ["./src/server/*"],
  "@/shared/*": ["./src/shared/*"]
}
```

Configure Vite aliases to match.

### 1.4 Resolve Circular Dependencies
- `queries.ts` ↔ `gridWhere.ts` → Extract shared types to `shared/grid-types.ts`
- `SalesView.tsx` ↔ mode components → Extract shared types to separate file

---

## Phase 2: Reliability Layer (Week 3)

These are independent of the domain extraction and can run in parallel with late Phase 1 work.

### 2.1 Structured Logging

Replace all 80 `console.*` calls in production code:
- `src/server/services/logger.ts` — structured JSON logger with levels (debug, info, warn, error) and context (module, request ID, user)
- `src/client/services/logger.ts` — client-side wrapper that suppresses in production, routes to telemetry in dev
- ESLint rule: `no-console: error` (only logger files exempt)

### 2.2 Post-Commit Hook Reliability

Fix the 9 silent catch blocks in command bus. Every post-commit side effect (journal append, socket emit, receipt creation) must:
- Log failure through structured logger with full context
- Emit operator-visible notification for receipt/journal failures (these affect data integrity)
- Include: which command, which entity ID, what failed, when
- Pattern: dead-letter log for recoverable failures, operator toast for data-loss risks

### 2.3 Error Boundary Coverage

Current: 1 global ErrorBoundary for 167 components. Target:
- `src/client/components/ErrorBoundary/RouteErrorBoundary.tsx` — per-route, with retry + go-home
- `src/client/components/ErrorBoundary/GridErrorBoundary.tsx` — preserves unsaved cell edits
- `src/client/components/ErrorBoundary/DrawerErrorBoundary.tsx` — closes drawer on error
- Applied to: all 13 refactored views, GridView template, DetailSlideover, CommandPalette

### 2.3a Data-Fetching Error States (from Audit H3)
17 components use `useQuery`/`useMutation` but never check `isError` or handle the error state. Users see blank screens or stale data when queries fail:
- `Shell.tsx`, `CommandPalette.tsx`, `VendorBillDetailsTab.tsx`, `RelationshipDrawer.tsx`
- 12 drawer tab components (PoLinesTab, PoVendorTab, PaymentLinkedOrdersTab, etc.)
- `SocketContext.tsx` — no loading/error state for auth query
- Remediation: Add error UI (inline error message with retry button) and loading skeletons to each

### 2.4 Type Safety Cleanup
**Sequencing is mandatory — parallel execution will block commits:**
1. **FIRST:** Fix all 14 unhandled promise chains (audit H4)
2. **SECOND:** Add `@typescript-eslint/no-floating-promises: error` — verify lint passes
3. **THIRD:** After lint is clean, enable ESLint in pre-commit hooks (§2.5)
4. In parallel: Replace 28 `as any` with proper types
5. In parallel: Audit all 34 `eslint-disable` comments; remove or document with justification
- ⚠️ Do NOT add the ESLint rule before fixing the 14 chains — the pre-commit hook will block all Week 3 commits

### 2.5 Pre-Commit + CI
- Pre-commit hooks: `eslint --fix`, `prettier`, typecheck on staged files
- GitHub Actions on PR: typecheck, lint, test
- PR template with checklist

---

## Phase 3: Quality Hardening (Week 3-4, Parallel With Phase 2)

### 3.1 Critical Test Coverage

Add tests where they're missing on operator-critical paths:
- Schema validation: verify constraints, relation integrity, type mappings
- Seed data: verify seed produces valid state, all constraints satisfied
- FilterToolbar: complex progressive-disclosure interaction logic (already built by Mercury, untested)
- ComboboxCellEditor: autocomplete, keyboard navigation, option loading
- AdvancedFilterBuilder: filter construction, validation, application

### 3.2 Domain Integration Tests

One integration test per extracted domain:
- Exercise: command dispatch → DB write → query read → projection
- Run against test database
- Verify: receipt creation, journal append, socket emission (mock socket)

### 3.3 Documentation
- `ARCHITECTURE.md` — module map, data flow diagram, key design decisions
- `CONTRIBUTING.md` — setup, conventions, PR process, commit format
- JSDoc on all exported functions in domain modules
- `docs/decisions/0001-domain-module-architecture.md` — why we chose this structure
- Update `docs/engineering-plans/AI-TODO.md` to reflect actual Mercury completion state

### 3.4 Commit Convention
- Semantic tags: `[FIX]`, `[FEAT]`, `[REF]`, `[TEST]`, `[DOC]`, `[CHORE]`
- Format: `[TAG] domain: description (LINEAR-ID)`
- Enforce with `commitlint`

### 3.5 Dependency Management
- Pin production dependencies to exact versions
- Create upgrade documentation
- Remove verified unused dependencies

---

## Success Metrics

| Metric | Current | Target | How Measured |
|--------|---------|--------|-------------|
| commandBus.ts remaining lines | 8,063 | < 200 (re-export shims only) | `wc -l src/server/services/commandBus.ts` |
| queries.ts remaining lines | 3,943 | < 500 (router merge + shared only) | `wc -l src/server/routers/queries.ts` |
| `as any` in production | 28 | 0 | `rg "as any" src/ -g '!*.test.*'` |
| Silent error catches | 9 | 0 | Manual audit of catch blocks |
| `console.*` in src/ | 80 | ≤ 3 (logger only) | `rg "console\." src/ -g '!*.test.*'` |
| Error boundary coverage | 1 route | All routes + key components | Manual audit |
| Test gaps (critical files) | 5+ | 0 | Coverage audit |
| Tests passing after extraction | Established at Gate C | 100% (same as pre-extraction baseline or better) | `pnpm test` against Gate C baseline |
| tRPC type inference preserved | Unknown | Confirmed via Gate D simulation | `pnpm typecheck` includes client bundle |
| Error states (data-fetching) | 17 components missing | 0 missing | Spot check Shell.tsx, CommandPalette.tsx, tab components |
| Contractor onboarding time | Unknown (hours/days) | < 1 hour to first commit | Time from clone to first PR |
| Module API contracts | 0 domain READMEs | Every domain has README.md | `find src/domains -name README.md | wc -l` |
| Anti-pattern catalog | None | Published with before/after examples | `docs/conventions/anti-patterns.md` exists |
| Dev env verification | None | `pnpm run verify` passes on clean clone | Run on fresh checkout |
| PR template | None | `.github/PULL_REQUEST_TEMPLATE.md` exists | File exists with checklist |
| Convention reference | Scattered across 5+ docs | Single `docs/conventions/README.md` | File exists |

---

## What We're NOT Doing

- NOT reorganizing Mercury's frontend — it's already well-structured
- NOT rewriting Mercury's templates or components
- NOT changing Mercury's schema-driven architecture
- NOT splitting Mercury's config files (entity-schemas is a registry, that's fine)
- NOT building custom CI (GitHub Actions is sufficient)
- NOT adding enterprise auth, scaling, or multi-version support
- NOT changing any product functionality or user-visible behavior

---

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| Domain extraction breaks Mercury's tRPC calls | Extract one domain at a time; full test suite between; backward-compatible re-exports |
| tRPC inferred types break through re-export shims | **Gate D:** tRPC typecheck simulation on one domain before committing to all extractions; verify RouterOutputs/RouterInputs preserved |
| Import path changes break client builds | Path aliases configured BEFORE extraction; **Gate E:** Vite alias validation with `pnpm build` |
| commandBus has import-time side effects | **Gate B:** side-effect audit before extraction; document each and its extraction strategy |
| Silent catch blocks spread across domain modules | **Fixed in process:** Each extraction PR includes catch remediation for that domain — no deferred catch fixes |
| ESLint rule blocks commits before promises fixed | **§2.4 sequenced:** fix 14 chains first, then add rule, then enable pre-commit hooks |
| Merge conflicts if Mercury work continues | Short-lived extraction branches; merge to this branch quickly |
| Test gaps discovered during extraction | Characterize before extracting; add missing tests as part of extraction PR |
| .skip tests mask real failures | **Gate C:** establish passing test baseline before any extraction; 100% target is measurable |

---

## Execution Order

```
Week 1:
  ├─ Pre-extraction gates A-G (shared/, side-effect audit, test baseline, tRPC simulation, Vite aliases, function mapping)
  ├─ Extract shared/ utilities FIRST (journal.ts, socket-emitter.ts) ← BLOCKS all domain extraction
  ├─ Extract purchase-orders domain (with catch remediation)
  └─ Extract payments domain (with catch remediation)

Week 2:
  ├─ Extract sales-orders domain (with catch remediation)
  ├─ Extract intake domain (with catch remediation)
  ├─ Extract credit domain (with catch remediation)
  ├─ Extract inventory domain (with catch remediation)
  ├─ Extract pick domain (with catch remediation)
  ├─ Extract media domain (with catch remediation)
  ├─ Finish queries.ts router split
  └─ Resolve circular dependencies

Week 3:
  ├─ Post-commit hook reliability
  ├─ Error boundary coverage
  ├─ Type safety cleanup
  ├─ Pre-commit + CI
  ├─ Test coverage (parallel)
  └─ Domain integration tests (parallel)

Week 4:
  ├─ Documentation (ARCHITECTURE.md, CONTRIBUTING.md, JSDoc, ADRs)
  ├─ Commit convention enforcement
  ├─ Dependency pinning
  └─ Final audit against success metrics

Week 5: Contractor Handoff Readiness
  ├─ Single ONBOARDING.md (replaces 5 agent-orientation docs)
  ├─ Module API contracts (README.md per domain)
  ├─ Anti-pattern catalog (docs/conventions/anti-patterns.md)
  ├─ PR template + review checklist (.github/PULL_REQUEST_TEMPLATE.md)
  ├─ Dev environment verification (pnpm run verify)
  ├─ Environment variable reference (docs/reference/environment-variables.md)
  ├─ Convention reference (docs/conventions/README.md)
  └─ Update stale docs for post-uplift reality
```

---

---

## Phase 4: Contractor Handoff Readiness (Week 5)

**Goal:** A new contractor can clone the repo, run `pnpm dev`, understand the architecture, add a feature in the right place, and submit a clean PR — all without pinging Evan.

### 4.1 Single Onboarding Guide

Replace the current agent-orientation sprawl (5 AI-focused docs) with one human-focused guide:

**`ONBOARDING.md` (repo root):**
- What TERP Operator is (2 paragraphs)
- Tech stack overview (React, tRPC, PostgreSQL, Drizzle, Tailwind, AG Grid)
- **Quick start:** `pnpm install && pnpm dev` → open `http://localhost:5173`
- Architecture at a glance (diagram: client → tRPC → domain modules → DB)
- Where code lives (domain map — one sentence per domain)
- How to add a feature (walkthrough: pick domain → add command → add route → add UI)
- Conventions (commit format, import order, naming, file structure)
- How to run tests: `pnpm test`, `pnpm test:integration`, `pnpm test:e2e`
- Where to find more: ARCHITECTURE.md, CONTRIBUTING.md, ADRs, anti-pattern catalog

**Goal:** A contractor reads this in 30 minutes and can make their first commit within an hour.

### 4.2 Module API Contracts

Every domain module gets a documented public API surface:

**`src/domains/<domain>/README.md` (template):**
- Public API — every exported function with signature and one-line description
- Depends On — which modules this domain imports from
- Consumed By — which routers and views call this domain
- Tests — where the tests live and how to run them

This gives contractors a map of every module: what it does, what it needs, who uses it, and where its tests are. No hunting through 8,000-line files to find a function.

### 4.3 Anti-Pattern Catalog

Explicit catalog of what NOT to do, with before/after examples from this codebase:

**`docs/conventions/anti-patterns.md`:**

| Anti-Pattern | Before (from our pre-uplift codebase) | After (correct) |
|-------------|--------------------------------------|-----------------|
| God file | commandBus.ts 8,063 lines | Domain modules, one concern per file |
| Silent catch | `catch (err) { console.warn(...) }` | Structured logger + operator toast |
| `as any` escape | `(row as any).fieldName` | Proper type or type guard |
| `console.log` | `console.log('got data', data)` | `logger.info({ module, data })` |
| No error boundary | 1 ErrorBoundary for 167 components | Route-level + grid-level boundaries |
| Deep relative imports | `../../../../components/Foo` | `@/client/components/Foo` |
| Untested complex logic | FilterToolbar 913L, zero tests | Characterization tests + unit tests |

### 4.4 PR Template + Review Checklist

**`.github/PULL_REQUEST_TEMPLATE.md`:**
- What changed (brief)
- Which domain module(s) touched
- Checklist: typecheck, lint, tests pass; new code tested; no `as any`/`console.log`/`eslint-disable`; no file >500 lines; path aliases used; error states handled; domain README updated; semantic commit tags

### 4.5 Dev Environment Verification

**`scripts/verify-dev-setup.sh`** — single command that runs: `pnpm typecheck && pnpm lint && pnpm test && pnpm build` and prints success/failure. Added to ONBOARDING.md as the first command after install.

### 4.6 Environment Variable Reference

**`docs/reference/environment-variables.md`** — every env var with default, whether required, and what it controls. Source of truth extracted from `server/env.ts` and Vite config.

### 4.7 Convention Reference (Single Source)

**`docs/conventions/README.md`** — one page with: commit format, file naming, import order, component structure, state management, API calls, styling. No hunting through 5 docs to find a convention.

### 4.8 Update Existing Docs for Post-Uplift Reality

After Phase 1-3 restructures the codebase, these existing docs become stale and need updating:
- `docs/agent-orientation/*` → Replace with `ONBOARDING.md`, archive old docs
- `docs/engineering-plans/AGENTS.md` → Update file paths, target structure, anti-patterns
- `docs/design-system/INDEX.md` → Verify component locations still correct
- `AGENTS.md` (repo root) → Update domain module references

---

*Plan synthesizes Mercury UX Retrofit branch analysis (57K lines, 236 files) with Odoo CE 18.0 foundational engineering practices, filtered for single-instance internal tool relevance.*
