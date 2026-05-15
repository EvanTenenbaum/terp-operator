# 2026-05-12 Roadmap Execution Release Train

Status: completed
Branch: `codex/roadmap-execution-2026-05-12`
Base: `8e036c1 roadmap: add product integration control plane`

## Objective

Execute the integrated TERP Agro product roadmap as one controlled release train while preserving the north stars:

- spreadsheet-first dense grid work,
- fast starts for New Sale, New PO, Receive Inventory, Money In, and Money Out,
- status-aware primary actions,
- reversible/audited backend commands,
- customer-safe outputs,
- self-hosted privacy,
- no bolt-on features.

## Team Shape

| Lane | Role | Ownership | Gate |
| --- | --- | --- | --- |
| Supervisor | PM/integrator | Branch sequencing, merge arbitration, final QA, release notes | Evidence-only closeout |
| Worker A | Shell/canvas writer | App shell, Keel, SideNav, drawer/focus primitives, hotkeys | Typecheck + shell smoke |
| Worker B | Backend writer | Command bus, schema, command catalog, backend tests | Typecheck + command contract proof |
| Worker C | Operator-surface writer | Sales, PO, Intake, Payments, Finder, dense work surfaces | Typecheck + operator E2E smoke |
| Explorer D | Read-only QA | Final gate plan, adversarial risks, acceptance probes | Read-only report |

## V4 QA Gate

Every integrated tranche must satisfy:

1. Requirements coverage: capability IDs and phase-readiness scope are represented or explicitly deferred.
2. Functional proof: targeted automated checks or a documented blocker.
3. Blast-radius check: shell, command parity, backend command safety, customer-safe output, keyboard/focus, seeded data.
4. Adversarial review: QA sidecar findings are either fixed, rejected with evidence, or carried as explicit blockers.

## Minimum Final Gate

```bash
pnpm audit:product-roadmap
pnpm audit:parity
pnpm typecheck
pnpm build
pnpm test:e2e
```

If E2E cannot complete because of environment/runtime issues, capture the exact blocker and run the narrowest available fallback proof.

## Stop Rules

- Do not keep rerunning the same failed proof more than twice without a new code or environment hypothesis.
- Do not mark a phase complete if its acceptance behavior exists only in docs.
- Do not add backend commands without frontend parity and registry disposition.
- Do not hide role-gated actions without plain-language explanation.
- Do not let connectors directly mutate committed ledgers.

## Active Tranches

| Tranche | State | Evidence |
| --- | --- | --- |
| Shell/canvas foundation | complete | Keel, grouped navigation, identity ribbon, context drawer, focus/drawer hotkeys, stale QuickStartBar deletion |
| Backend safety/commercial kernel | complete | Inventory status/location/ownership commands, strict frontend parity, reversal policies, pricing guardrails, closeout safety helper |
| Operator work-loop surfaces | complete | Sales/customer workspace, PO lines/draft intake, Quick Ledger, Inventory controls, Reports route, Finder slices |
| QA gate plan | complete | `pnpm typecheck`, `pnpm audit:parity`, `pnpm audit:product-roadmap`, `pnpm build`, and 16 Playwright E2E tests passed |

## Final Gate Evidence

```bash
pnpm typecheck
pnpm audit:parity
pnpm audit:product-roadmap
pnpm build
pnpm db:seed
pnpm test:e2e -- tests/e2e/operator-console.spec.ts tests/e2e/adversarial-command-contracts.spec.ts tests/e2e/roadmap-final-gate.spec.ts --project=chromium
```

Result: 16/16 Playwright tests passed on Chromium after a fresh seed.
