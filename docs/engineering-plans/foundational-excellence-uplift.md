# TERP Operator — Foundational Excellence Uplift

**Scope:** Single-instance, self-hosted internal tool  
**Target:** Professional codebase structure, stability, maintainability  
**Non-goals:** Enterprise scale, multi-version support, custom CI infrastructure

---

## What "Foundational Excellence" Means Here

After studying Odoo CE 18.0 and filtering for what applies to a single-instance React/tRPC/TypeScript tool, here's the target:

1. **You can find things.** Every business concern lives in one place. No hunting through an 8,000-line file.
2. **You can trust things.** Errors surface visibly. Tests exist for critical paths. You know when something breaks.
3. **You can understand things.** Components are self-documenting. Conventions are consistent. Decisions are recorded.
4. **You can change things safely.** Module boundaries are clear. Changing purchase orders doesn't risk breaking payments.

---

## Audit: Current vs. Odoo Foundational Standards

| Practice | Odoo Standard | TERP Operator | Verdict |
|----------|--------------|---------------|---------|
| **Domain module structure** | Every business domain is a self-contained addon | Two god files (commandBus 8,063L, queries 3,943L) | 🔴 **Fix** |
| **File size** | Business logic files 20-80KB. ORM core ~341KB but that's framework. | 31 files >500 lines, 9 >1,000 | 🔴 **Fix** |
| **Error visibility** | Error service with pluggable handlers, RPC error dialogs, connection recovery | 9 silent catch blocks, 1 global ErrorBoundary for 167 components | 🔴 **Fix** |
| **Testing discipline** | Tests in every module. `sale` has 29 test files for ~18 source files. | 284 tests total but gaps on schema, seed, filters, editors | 🟡 **Improve** |
| **Logging** | Python `logging` with structured levels | 80 `console.log/warn/error` scattered | 🔴 **Fix** |
| **Commit discipline** | Semantic tags `[FIX]`, `[IMP]`, `[REF]` on every commit | Inconsistent, sometimes Linear-tagged, sometimes plain | 🟡 **Improve** |
| **Code documentation** | JSDoc on exports, architecture in folder structure | Sparse JSDoc, ARCHITECTURE.md missing | 🟡 **Improve** |
| **Dependencies** | Exact pins with security justifications | 70 packages, all `^` ranges, 33 outdated | 🟡 **Improve** |
| **Component co-location** | 3-4 files per component in one folder | Inconsistent — some co-located, some scattered | 🟢 **OK** |
| **Type safety** | No Python type hints (different ecosystem) | 28 `as any` escaping TypeScript | 🟡 **Improve** |
| **Import hygiene** | Import ordering enforced, namespace-prefixed (`from odoo.addons`) | Deep relative imports, unused imports, some circular | 🟡 **Improve** |

---

## The Plan: 3 Phases, 4-5 Weeks

### Phase 1: Stop the Bleeding (Week 1-2)
*Fix the things that erode trust and stability today.*

#### 1.1 Structured Logging
- Replace all 80 `console.*` calls with a typed logger
- Server: `src/server/services/logger.ts` — JSON output, module context
- Client: `src/client/services/logger.ts` — routes to telemetry or suppresses in prod
- ESLint rule: `no-console: error` (only logger exempt)

#### 1.2 Post-Commit Hook Reliability
- Every catch block in commandBus that currently does `console.warn(...)` must:
  - Log through structured logger
  - Emit operator-visible notification for receipt/journal failures
  - Include enough context to diagnose (which command? which entity?)
- Pattern: dead-letter log for recoverable failures, operator toast for data-loss risks

#### 1.3 Error Boundary Coverage
- Wrap every route component in `<ErrorBoundary>`
- Create `<GridErrorBoundary>` that preserves unsaved cell edits
- Target: 100% route coverage, key grid/drawer coverage

#### 1.4 Type Safety Cleanup
- Replace all 28 `as any` with proper types
- Remove unneeded `eslint-disable` comments (audit all 34)
- Add `@typescript-eslint/no-floating-promises: error`

#### 1.5 Pre-Commit + CI
- Pre-commit hooks: `eslint --fix`, `prettier`, typecheck on staged
- GitHub Actions: typecheck, lint, test on every PR
- PR template with checklist

### Phase 2: Structural Foundation (Week 2-4)
*Reorganize so the codebase structure communicates intent.*

#### 2.1 Domain Module Extraction
Split the god files. **One domain per PR, characterization tests first.**

Target structure:
```
src/
├── domains/
│   ├── purchase-orders/
│   │   ├── index.ts          # Public API: curated exports
│   │   ├── commands.ts       # From commandBus: purchase order commands
│   │   ├── queries.ts        # From queries.ts: purchase order routes
│   │   ├── projections.ts    # Business logic projections
│   │   ├── receipts.ts       # Receipt creation hooks
│   │   ├── types.ts          # Domain-specific types
│   │   └── __tests__/
│   │       ├── commands.test.ts
│   │       ├── queries.test.ts
│   │       └── integration.test.ts
│   ├── sales-orders/         # Same pattern
│   ├── payments/
│   ├── inventory/
│   ├── intake/
│   ├── credit/
│   ├── vendor-management/
│   ├── fulfillment/
│   ├── media/
│   └── shared/               # Cross-domain: journal, sockets, receipts
│       ├── journal.ts
│       ├── socket-emitter.ts
│       └── receipt-orchestrator.ts
├── client/                    # Reorganized, not restructured
│   ├── views/                 # One view per domain
│   ├── components/
│   │   ├── grid/              # Grid components together
│   │   ├── drawers/           # Drawer components together
│   │   ├── filters/           # Filter components together
│   │   ├── cells/             # Cell editors/renderers
│   │   └── shared/            # Shell, CommandPalette, etc.
│   ├── templates/             # View templates
│   ├── hooks/
│   ├── store/
│   └── api/
├── server/
│   ├── routers/               # Per-domain routers
│   │   ├── purchase-orders.ts
│   │   ├── sales-orders.ts
│   │   └── index.ts           # Merges all
│   ├── services/
│   │   ├── logger.ts
│   │   └── database/
│   ├── middleware/
│   └── auth/
├── shared/                    # Isomorphic code
│   ├── types.ts
│   ├── schemas.ts
│   └── constants.ts
```

#### 2.2 Path Aliases
Add before any file moves:
```json
// tsconfig.json
"paths": {
  "@/domains/*": ["./src/domains/*"],
  "@/client/*": ["./src/client/*"],
  "@/server/*": ["./src/server/*"],
  "@/shared/*": ["./src/shared/*"]
}
```

#### 2.3 Router Decomposition
Build on already-extracted routers (`commands.ts`, `credit.ts`, `filters.ts`, `media.ts`) — finish splitting the remaining routes out of the 3,943-line `queries.ts`.

#### 2.4 Client Component Reorganization
- Group related components into subdirectories (`grid/`, `drawers/`, `filters/`, `cells/`)
- No file moves that change import paths without corresponding alias updates
- Keep the existing view/template architecture intact

### Phase 3: Quality Hardening (Week 4-5)
*Fill the gaps that erode confidence.*

#### 3.1 Critical Test Coverage
Add tests where they're missing and painful:
- Schema validation tests (verify constraints, relations)
- Seed data tests (verify seed produces valid state)
- Filter component tests (operator-critical UI)
- Cell editor tests (complex interaction logic)

#### 3.2 Integration Tests
One integration test per domain that exercises: command → DB → query → projection
- Creates real data, verifies real results
- Runs against test database (like Odoo's TransactionCase)

#### 3.3 Documentation
- `ARCHITECTURE.md` — module map, data flow, key decisions
- `CONTRIBUTING.md` — setup, conventions, PR process
- JSDoc on all exported functions
- ADR directory: `docs/decisions/0001-domain-module-architecture.md`

#### 3.4 Commit Convention
- Semantic tags: `[FIX]`, `[FEAT]`, `[REF]`, `[TEST]`, `[DOC]`, `[CHORE]`
- Format: `[TAG] domain: description (LINEAR-ID)`
- Enforce with commitlint

#### 3.5 Dependency Management
- Pin production dependencies to exact versions
- Document upgrade process
- Remove verified unused dependencies

---

## Success Metrics (Scaled for Single Instance)

| Metric | Current | Target |
|--------|---------|--------|
| Files > 500 lines | 31 | ≤ 5 (config/registry only) |
| `as any` in production | 28 | 0 |
| `console.*` in src/ | 80 | ≤ 3 (logger service only) |
| Silent error catches | 9 | 0 |
| Error boundary coverage | 1.2% | 100% routes |
| Test gaps (critical files untested) | 5+ | 0 |
| Commit discipline | Inconsistent | 100% semantic tags |

---

## What We're NOT Doing (from the Odoo analysis)

| Odoo Practice | Why We Skip |
|---------------|-------------|
| Custom CI (Runbot/Mergebot) | Single developer, GitHub Actions is sufficient |
| Multi-version forward-porting | Single instance, single branch |
| Staging batch merge queue | One PR at a time |
| Per-OS dependency pinning | Single deployment target |
| Custom module loader / registry system | No third-party addons to support |
| BrowserStack cross-browser testing | Single browser target |
| Translation/Weblate infrastructure | Single language |
| CLA enforcement | No external contributors |
| Worker pools / horizontal scaling | Single instance |
| Onboarding tours / user education | Evan is the user |

---

## Mercury UX Retrofit Interaction

The current branch `docs/mercury-ux-retrofit-master-plan` has 108 pending tasks. This plan restructures files those tasks reference. **Recommendation: run this foundational uplift first on `main`, then rebase Mercury on top.** The Mercury retrofitters will work in a clean, well-organized codebase instead of navigating god files.

If you prefer the reverse (Mercury first), the uplift plan still holds but Phase 2 file moves need to account for Mercury's target file layout.

---

*Plan based on Odoo CE 18.0 analysis filtered for single-instance internal tool relevance.*
