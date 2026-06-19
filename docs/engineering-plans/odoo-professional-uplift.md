# TERP Operator → Odoo Professional Standard: Transformation Plan

**Date:** 2026-06-18  
**Based on:** Odoo Community Edition 18.0 analysis  
**Current state audit:** `docs/audits/2026-06-18-third-party-codebase-audit.md`

---

## Part 1: Comparative Analysis

### What Odoo Gets Right — and Where We Stand

| Dimension | Odoo CE 18.0 | TERP Operator (current) | Gap |
|-----------|-------------|------------------------|-----|
| **Module boundaries** | ~350 addons, each self-contained with `models/`, `views/`, `controllers/`, `tests/` | 4 directories (`client`, `server`, `shared`, `tests`), two god files | **Severe** |
| **File size discipline** | Largest files ~341KB but domain-scoped (ORM core); business modules typically 20-80KB per model | `commandBus.ts` 8,063 lines, `queries.ts` 3,943 lines | **Severe** |
| **Testing** | 3-tier: unit + JS unit + browser tours. Test files in every module. `sale` has 29 test files | 284 test files but gaps on critical files (schema, seed, filters, editors) | **Moderate** |
| **Error handling** | Global error service with pluggable handlers, sequence-based priority, RPC error dialogs, connection-loss recovery | 1 global ErrorBoundary, 9 silent catch blocks in command bus, 17 components without error states | **Severe** |
| **Logging** | Python `logging` module with structured levels, `assertLogs()` in tests, ORM emits structured logs | 80 `console.log/warn/error` scattered, zero structured logging | **Severe** |
| **Dependencies** | Strict per-OS/per-Python pinning, security-justified versions, conditional markers | 70 packages, all `^` ranges, zero exact pins, 33 outdated | **Severe** |
| **CI/CD** | Custom Runbot + Mergebot with staging batches, forward-porting, merge queue | Basic GitHub Actions (if any), no merge queue | **Moderate** |
| **Commit discipline** | 16 semantic tags (`[FIX]`, `[IMP]`, `[REF]`, etc.), strict format | Inconsistent: some Linear-tagged, some plain | **Moderate** |
| **Linting** | flake8 (Python) + ESLint/Prettier (JS) with whitelist approach, branch-aware hooks | ESLint flat config, 34 disable comments, no pre-commit | **Moderate** |
| **Component structure** | 3-4 files per component (JS + XML + SCSS), co-located, props validated | 1-2 files per component, co-location inconsistent | **Minor** |
| **Service layer** | Registry-based service singletons, dependency-declared, business logic in services not components | `useCommandRunner`, `useUiStore` — good starts but inconsistent | **Minor** |
| **Reusability** | Registry pattern for extensibility (fields, views, error handlers), slots for composition | Templates, hooks — good but not systematically applied | **Minor** |
| **Code docs** | JSDoc on all exports, `@typedef` for complex shapes, architecture communicated by folder structure | JSDoc sparse, no ARCHITECTURE.md, agent-orientation docs exist | **Moderate** |
| **CSS conventions** | BEM-like `.o_` prefix, design tokens as SCSS variables, Bootstrap base | Tailwind utility + semantic classes, design tokens in `tailwind.config.ts` | **Minor** |

---

## Part 2: The Odoo-Inspired Target Architecture

### Target Module Structure

Odoo's greatest strength is that **every business domain is a self-contained addon**. We can't replicate Python addons, but we can adopt the *discipline*:

```
src/
├── domains/                         # NEW: domain modules (Odoo's "addons" equivalent)
│   ├── purchase-orders/
│   │   ├── commands.ts              # Command handlers (extracted from commandBus)
│   │   ├── queries.ts               # tRPC query routes (extracted from queries.ts)
│   │   ├── schema.ts                # Drizzle table definitions (extracted from schema.ts)
│   │   ├── projections.ts           # Business logic projections
│   │   ├── receipts.ts              # Receipt creation hooks
│   │   ├── validators.ts            # Zod schemas for this domain
│   │   ├── types.ts                 # Domain-specific TypeScript types
│   │   ├── index.ts                 # Public API surface (curated exports)
│   │   └── tests/
│   │       ├── commands.test.ts
│   │       ├── queries.test.ts
│   │       ├── projections.test.ts
│   │       └── integration.test.ts
│   ├── sales-orders/                # Same structure
│   ├── payments/                    # Same structure
│   ├── inventory/                   # Same structure
│   ├── intake/                      # Same structure
│   ├── vendor-management/           # Same structure
│   ├── credit/                      # Same structure
│   ├── fulfillment/                 # Same structure
│   ├── media/                       # Same structure
│   └── shared/                      # Cross-domain shared code
│       ├── journal.ts               # Journal append (used by multiple domains)
│       ├── socket-emitter.ts        # Socket emission (used by multiple domains)
│       └── receipt-orchestrator.ts  # Receipt pattern (used by multiple domains)
│
├── client/                          # EXISTING, reorganized
│   ├── views/                       # One view per domain (mostly exists)
│   ├── components/                  # Shared UI components
│   │   ├── grid/                    # Grid-related (OperatorGrid, QuickLedgerGrid, etc.)
│   │   ├── drawers/                 # Drawer/slideover components
│   │   ├── filters/                 # Filter components
│   │   ├── cells/                   # Cell editors/renderers
│   │   └── shared/                  # Truly shared (Shell, CommandPalette, etc.)
│   ├── templates/                   # View templates (GridView, DashboardView, etc.)
│   ├── hooks/                       # Shared hooks
│   ├── store/                       # State management
│   ├── api/                         # tRPC client
│   └── config/                      # Entity configs (acceptable as registries)
│
├── server/                          # EXISTING, reorganized
│   ├── routers/                     # Domain routers (decomposed from queries.ts)
│   │   ├── purchase-orders.ts
│   │   ├── sales-orders.ts
│   │   ├── payments.ts
│   │   └── ...
│   ├── middleware/                   # Express middleware
│   ├── services/                    # Infrastructure services
│   │   ├── logging/                 # NEW: structured logger
│   │   ├── database/                # DB connection, migration
│   │   └── websocket/               # Socket.io management
│   ├── auth/                        # Authentication + RBAC
│   └── index.ts                     # Server bootstrap
│
├── shared/                          # EXISTING, mostly unchanged
│   ├── schemas.ts                   # Cross-domain Zod schemas
│   ├── types.ts                     # Cross-domain TypeScript types
│   ├── constants.ts                 # Shared constants
│   └── utils/                       # Pure utility functions
│
└── tests/                           # EXISTING, reorganized
    ├── integration/                 # Cross-domain integration tests
    ├── fixtures/                    # Test fixtures/data
    └── helpers/                     # Test utilities
```

### Key Design Principles (from Odoo)

1. **One domain, one folder.** Every business domain is self-contained with its own commands, queries, schema, projections, and tests. No cross-domain imports except through shared utilities.

2. **Commands and queries live with their domain.** Not in god files. A `purchase-orders/commands.ts` exports `finalizePurchaseOrder`, `createPurchaseOrderLine`, etc.

3. **Tests are co-located with source.** Not in a separate tree. `domains/purchase-orders/tests/` mirrors `domains/purchase-orders/`.

4. **Barrel files are curated, not wildcards.** Every `index.ts` explicitly names what it exports. No `export * from './everything'`.

5. **Services are singletons with declared dependencies.** Like Odoo's `serviceRegistry`, our infrastructure services (logger, DB, sockets) declare what they depend on and are started in order.

6. **Error handling is systematic.** Every domain has error types. Every API surface has error boundaries. Post-commit hooks never fail silently.

7. **Logging is structured.** One `Logger` service. Levels: `debug`, `info`, `warn`, `error`. All domain code routes through it. `console.log` banned in production.

---

## Part 3: Phased Transformation Plan

### Phase 0: Foundation (Week 1)

**Goal:** Build the infrastructure that makes the rest possible. Do not move any code yet.

#### 0.1 Structured Logger Service
- Create `src/server/services/logging/logger.ts`
- API: `logger.debug(context, message, data?)`, `logger.info(...)`, `logger.warn(...)`, `logger.error(...)`
- Output: JSON lines to stdout (production) + pretty-print (development)
- Context: automatic module name, request ID, user ID
- Tests: `src/server/services/logging/logger.test.ts`

#### 0.2 Post-Commit Hook Reliability
- Create `src/domains/shared/post-commit-hook.ts`
- Wraps every post-commit side effect with:
  - Structured error logging (not just `console.warn`)
  - Dead-letter pattern for recoverable failures
  - Operator-visible notification for receipt/journal failures
- Tests verify all failure modes produce observable signals

#### 0.3 Error Boundary Coverage
- Add `<ErrorBoundary>` to every route-level component
- Create `src/client/components/ErrorBoundary/` directory with:
  - `ErrorBoundary.tsx` (exists, review)
  - `RouteErrorBoundary.tsx` (new — with retry, go-home)
  - `GridErrorBoundary.tsx` (new — preserves unsaved cell edits)
  - `DrawerErrorBoundary.tsx` (new — closes drawer on error)
- Goal: 100% route/view coverage, 80% component coverage

#### 0.4 Pre-Commit Hooks
- Create `.pre-commit-config.yaml` or `lefthook.yml`
- Hooks: `eslint --fix`, `prettier --write`, `pnpm typecheck` (staged files only)
- Branch-aware: stricter on `main`, relaxed on feature branches
- Document in `CONTRIBUTING.md`

#### 0.5 CI Hardening
- GitHub Actions workflow that runs on every PR:
  - `pnpm typecheck`
  - `pnpm lint`
  - `pnpm test` (unit)
  - `pnpm test:integration` (new)
- Required status checks before merge
- PR template with checklist

### Phase 1: Domain Extraction (Weeks 2-3)

**Goal:** Split the god files into domain modules. This is the highest-risk phase. Do it domain by domain, one PR per domain, with full test coverage before and after.

**Process for each domain:**
1. Write characterization tests for current behavior
2. Extract domain code into new `domains/<domain>/` structure
3. Re-export from old location for backward compatibility
4. Run full test suite to confirm no regressions
5. Remove old re-exports once all consumers migrated

#### 1.1 Extract Purchase Orders
- From `commandBus.ts` → `domains/purchase-orders/commands.ts`
- From `queries.ts` → `domains/purchase-orders/queries.ts`
- From `schema.ts` → `domains/purchase-orders/schema.ts` (import from central schema, domain types)
- Projections → `domains/purchase-orders/projections.ts`
- Receipts → `domains/purchase-orders/receipts.ts`
- **Tests:** characterization tests first, then move existing tests, add edge cases

#### 1.2 Extract Sales Orders
- Same process as 1.1
- Includes exception handling, credit recomputation, photography queue

#### 1.3 Extract Payments
- Payment receipt, vendor payout, invoice handling
- Multi-currency support stays in domain

#### 1.4 Extract Inventory
- Stock movements, lots, UOM conversions
- Photography/media stays in its own domain

#### 1.5 Extract Intake
- Intake processing pipeline

#### 1.6 Extract Credit
- Credit engine (already partially separated in `services/creditEngine/`)
- Customer credit panel backend

#### 1.7 Extract Shared Utilities
- Journal append
- Socket emission
- Receipt orchestration
- Audit trail

### Phase 2: Router Decomposition (Week 4)

**Goal:** Split the god router into domain routers.

#### 2.1 Create Domain Routers
```
src/server/routers/
├── purchase-orders.router.ts
├── sales-orders.router.ts
├── payments.router.ts
├── inventory.router.ts
├── intake.router.ts
├── credit.router.ts
├── vendor-management.router.ts
├── fulfillment.router.ts
├── media.router.ts
└── index.ts                    # Merges all domain routers
```

#### 2.2 Resolve Circular Dependencies
- `queries.ts` ↔ `gridWhere.ts` → move `gridWhere` helpers to shared
- `SalesView.tsx` ↔ mode components → extract shared types to separate file

### Phase 3: Testing Uplift (Weeks 5-6)

**Goal:** Reach Odoo's 3-tier testing standard.

#### 3.1 Unit Test Gap Fill
- Schema tests: `schema.test.ts` — verify constraints, type mappings, relation integrity
- Seed tests: `realisticSeed.test.ts` — verify seed produces valid data, all constraints satisfied
- Filter tests: `FilterToolbar.test.tsx`, `AdvancedFilterBuilder.test.tsx`
- Cell editor tests: `ComboboxCellEditor.test.tsx`

#### 3.2 Integration Tests
- Create `tests/integration/` directory
- Each domain gets at least one integration test that exercises:
  - Command → DB write → query read → projection
  - Example: Create PO → finalize → verify receipt → verify journal → verify socket emit
- Use test database, not mock

#### 3.3 Browser Tests (Odoo's "Tours" equivalent)
- Existing Playwright tests in `tests/e2e/`
- Add tour-style tests for critical operator workflows:
  - Purchase order: create → add lines → finalize
  - Sales order: create → confirm → receive payment
  - Inventory: receive stock → verify lot movement

#### 3.4 Test Infrastructure
- Test helpers for: DB setup/teardown, auth, fixtures
- Mock server for client-side tests
- Test tagging system (`test.tags("slow")`, `test.tags("integration")`)

### Phase 4: Code Quality Enforcement (Week 7)

#### 4.1 Eliminate Type Safety Escapes
- Replace 28 `as any` with proper types
- Enable `strict: true` in tsconfig if not already
- Add `no-unused-vars: error` to ESLint
- Remove all `eslint-disable` comments or document with justification

#### 4.2 Remove Console Statements
- Replace all 80 `console.*` calls with structured logger
- Add ESLint rule: `no-console: error` (with explicit exceptions for logger.ts)
- Client-side: route through telemetry service or remove

#### 4.3 Fix Unhandled Promises
- Add `.catch()` to 14 unhandled promise chains
- Add ESLint rule: `@typescript-eslint/no-floating-promises: error`

#### 4.4 Clean Imports
- Remove 97 unused imports (automated: `organize-imports` on save)
- Resolve 36 deep relative imports with path aliases (`@/domains/*`, `@/client/*`, `@/server/*`, `@/shared/*`)
- Standardize import ordering (Odoo-style: framework → shared → domain → relative)

### Phase 5: Documentation & Standards (Week 8)

#### 5.1 Architecture Documentation
- `ARCHITECTURE.md` — high-level architecture, module map, data flow
- `CONTRIBUTING.md` — setup, conventions, PR process, commit format
- `.github/PULL_REQUEST_TEMPLATE.md` — checklist

#### 5.2 Code Documentation
- JSDoc on all exported functions and types
- `@typedef` for complex object shapes
- Per-component README for complex components (OperatorGrid, QuickLedgerGrid)

#### 5.3 Decision Records
- `docs/decisions/` directory (architecture decision records)
- Template: date, status, context, decision, consequences
- First records: domain module structure, logging strategy, error boundary strategy

#### 5.4 Commit Convention
- Adopt Odoo-inspired semantic tags: `[FIX]`, `[FEAT]`, `[REF]`, `[TEST]`, `[DOC]`, `[CHORE]`, `[PERF]`, `[SEC]`
- Format: `[TAG] domain: description (LINEAR-ID)`
- Enforce with commitlint or pre-commit hook

### Phase 6: Dependency Management (Week 9)

#### 6.1 Pin Dependencies
- Pin all 70 packages to exact versions
- Document upgrade process
- Create `renovate.json` for automated updates with review requirement

#### 6.2 Major Version Upgrades
- Plan `@tanstack/react-query` v4→v5 migration
- Plan `@trpc/*` v10→v11 migration
- Plan `ag-grid-*` v32→v35 migration
- Execute as separate, well-tested PRs

#### 6.3 Dependency Audit
- Remove unused dependencies (any false positives from `depcheck`)
- Audit `agentation` package — verify necessity, vendor trust
- Set up `npm audit` or `snyk` in CI

---

## Part 4: Risk Assessment & Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Domain extraction breaks existing behavior | High | High | Characterization tests before extraction; one domain per PR; backward-compatible re-exports |
| tRPC route changes break client | Medium | High | Keep route signatures identical; only move files |
| Stricter linting floods CI with failures | High | Low | Phase in rules gradually; `--fix` automation first |
| Dependency pinning breaks CI | Medium | Medium | Pin in dedicated PR; test on clean install |
| Too much change at once causes merge hell | High | Medium | One PR per domain; merge to main quickly; short-lived branches |
| Team unfamiliar with new structure | Medium | Medium | ARCHITECTURE.md as onboarding; pair on first domain extraction |

---

## Part 5: Success Metrics

| Metric | Current | Target | Measurement |
|--------|---------|--------|-------------|
| Files > 500 lines | 31 | ≤ 5 (config/registry only) | `find src -name '*.ts' -o -name '*.tsx' | xargs wc -l | sort -rn | head` |
| `as any` in production | 28 | 0 | `rg "as any" src/ -g '!*.test.*' | wc -l` |
| `eslint-disable` | 34 | ≤ 5 (documented only) | `rg "eslint-disable" src/ | wc -l` |
| `console.*` in src/ | 80 | ≤ 5 (logger.ts only) | `rg "console\." src/ -g '!*.test.*' | wc -l` |
| Test:source ratio | 0.86:1 | ≥ 1:1 for domain logic | Test count / source count per domain |
| Error boundary coverage | 1.2% | 100% routes, ≥ 80% components | Manual audit |
| Unhandled promises | 14 | 0 | ESLint `no-floating-promises` |
| CI gate pass rate | Unknown | 100% required | GitHub branch protection |
| Commit discipline | Inconsistent | 100% semantic tags | `git log --oneline -50` |
| Dependency freshness | 33 outdated | ≤ 5 outdated (tracked) | `pnpm outdated` |

---

## Part 6: Execution Order

```
Phase 0 (Foundation) ─────────────────────────────┐
  Logger → Post-commit hooks → Error boundaries →  │
  Pre-commit → CI hardening                        │
                                                    │
Phase 1 (Domain Extraction) ←─────────────────────┘
  PO → Sales → Payments → Inventory → Intake → Credit → Shared
  (sequential, one PR each)
                                                    │
Phase 2 (Router Decomposition) ←───────────────────┘
  Domain routers → Merge router → Circular dep fix
                                                    │
Phase 3 (Testing Uplift) ←──────────────────────────┘
  Unit gaps → Integration → Browser tours → Test infra
                                                    │
Phase 4 (Code Quality) ←────────────────────────────┘
  Type safety → Console removal → Promise handling → Import cleanup
                                                    │
Phase 5 (Documentation) ←───────────────────────────┘
  ARCHITECTURE.md → CONTRIBUTING.md → JSDoc → Decision records → Commit convention
                                                    │
Phase 6 (Dependencies) ←────────────────────────────┘
  Pin → Upgrade plan → Audit → CI enforcement
```

**Total estimated: 9 weeks (single developer) or 4-5 weeks (2 developers working in parallel on independent domains).**

---

*Plan based on Odoo Community Edition 18.0 codebase analysis, TERP Operator audit dated 2026-06-18, and engineering best practices for monorepo transformation.*
