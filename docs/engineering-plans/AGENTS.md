# Mercury UX Retrofit — AI Agent Entry Point

**Branch:** `docs/mercury-ux-retrofit-master-plan`  
**Last updated:** 2026-06-15  
**Status:** Planning complete. Ready for Phase -1 wireframe creation.

---

## Quick Start (Read This First)

You are an AI agent dispatched to work on the TERP Operator Mercury UX retrofit. This document is your entry point.

### 1. Context: What Is This?

The TERP Operator console needs a UX retrofit adopting Mercury.com's functional patterns (inline editing, filter toolbar, KPI strips, bulk actions, progressive disclosure). The plan covers 27 views, 10 new components, 18 backend endpoints, and a complete re-architecture of the frontend layer from imperative ColDef arrays to schema-driven configuration.

### 2. Your First Read (4 files, ~15 minutes)

| Order | File | Lines | Why |
|-------|------|-------|-----|
| **1st** | [mercury-ux-integrated-analysis.md](./mercury-ux-integrated-analysis.md) | 245 | **UX Authority.** Read this before any user-facing work. 12 UX rules, top-7 friction points, operator attention budget. Cross-model validated (Claude Opus 4.7 + GPT-4o). |
| **2nd** | [MASTER-EXECUTION-DOCUMENT.md](./MASTER-EXECUTION-DOCUMENT.md) | 1543 | **Execution source of truth.** All specs, tasks, visual design rules. |
| **3rd** | [AI-TODO.md](./AI-TODO.md) | — | **Active task state.** What's done/in-progress/blocked. |
| **4th** | [HANDOFF.md](./HANDOFF.md) | — | **How to resume work.** Pick up where last agent left off. |

### 3. What Phase Are We In?

Check [AI-TODO.md](./AI-TODO.md) for current phase. The pipeline is:

```
Phase -1: Wireframes → Human Review → AI Review → Approved
Phase  0: Foundation — frontend components + backend endpoints (38 tasks)
Phase  1: Pilot — PurchaseOrdersView (15 tasks)
Phase  2: GridJourney — 10 simple views (8 tasks)
Phase 3A: SalesView refactoring (12 tasks) ← HARD GATE
Phase 3B: SalesView migration (10 tasks)
Phase 3C: Intake + Dashboard (6 tasks)
Phase 3D: Remaining complex views (10 tasks)
Phase  4: Polish, mobile, a11y, cleanup, flag removal (9 tasks)
```

### 4. How to Pick Up a Task

1. Open [AI-TODO.md](./AI-TODO.md) — find the next unassigned task
2. Read the task entry in [MASTER-EXECUTION-DOCUMENT.md §1](./MASTER-EXECUTION-DOCUMENT.md) — task ID, agent type, inputs, outputs
3. Read the referenced spec sheet (§3-6) — API, states, AC, keyboard, a11y
4. Read the referenced wireframe ID (§17) if wireframes are approved
5. Build. Run `pnpm typecheck && pnpm vitest run <test-file>`
6. Update [AI-TODO.md](./AI-TODO.md) — mark task complete, add findings
7. Run the handoff protocol ([HANDOFF.md](./HANDOFF.md)) when stopping

### 5. Design Rules (Non-Negotiable)

These are in [MASTER-EXECUTION-DOCUMENT.md §9-10](./MASTER-EXECUTION-DOCUMENT.md) but repeated here for emphasis:

| Rule | Check |
|------|-------|
| Mutations via `useCommandRunner` only | ☐ |
| One Zustand store (`useUiStore`) | ☐ |
| Hybrid Tailwind + semantic CSS | ☐ |
| Never `style={{ color: '#b42318' }}` — use semantic classes | ☐ |
| Never `test.skip(true, ...)` — self-create test data or delete | ☐ |
| Never "Coming soon" disabled buttons — hide until implemented | ☐ |
| Never dead backend procedures — remove or wire | ☐ |
| Never per-view ColDef arrays — use entity schemas | ☐ |
| Never per-view StatusActionTable — use entity state machines | ☐ |
| Never inline cell renderers in useMemo — stable components | ☐ |
| Never counters for unimplemented features — hide until backend ships | ☐ |

### 5a. UX Rules (UX-1 through UX-12) — From the UX Authority

Source: [mercury-ux-integrated-analysis.md](./mercury-ux-integrated-analysis.md). Compact summary — read the source for evidence and anti-examples. ✅ = cross-model confirmed (Claude + GPT-4o, independently flagged).

| ID | Rule | Notes |
|----|------|-------|
| **UX-1** ✅ | Action visibility follows entity state. | Buttons for states the entity is not in are absent, not disabled. Disabled buttons still cost attention. |
| **UX-2** ✅ | Supporting info one click away, never zero (except continuous monitoring). | Permanent context panels habituate operators to ignore them — including the moments when they matter. |
| **UX-3** ✅ | One primary surface per view. | Every view passes the "what do I see first?" test. SalesView's 8 simultaneous panels is the canonical violation. |
| **UX-4** | Bulk actions appear only on selection. | Selection totals strips that show "0 selected" are noise. |
| **UX-5** ✅ | Validation errors at point of impact, never in a dedicated panel. | "All checks passed" is the most dangerous text in the system — it trains operators to ignore the panel when it finally flags a real issue. |
| **UX-6** | Tools and forms live in slide-overs; modals for confirmations only. | RecordPrepaymentDialog as a blocking modal is the canonical violation. |
| **UX-7** | System never hides what mode the operator is in. | Customer selection context must persist visibly while operator is mid-sale. |
| **UX-8** ✅ | State changes resolve in place; no navigation for confirmations. | Operator should never lose their place to confirm an action they just took. |
| **UX-9** | Filtering is fluid; navigation is durable. | TabBars imply mode change; they should not be used for filters that the operator switches between in a single session. |
| **UX-10** | Cell-level interactions save immediately; multi-field forms have explicit save. | ComboboxCellEditor saves on Enter. Forms have a Save button. Mixing these is confusing. |
| **UX-11** ✅ | URL is the session memory. | Refresh, share, and back must reproduce the exact view including slide-over, filters, tab, selection. |
| **UX-12** | Empty states give the operator a next step. | "No results" is not enough — say why (filter active? data absent?) and what to do. |

**Operator Attention Budget — single most actionable principle:**
> Show three things: (1) what they're working on — 0 clicks, always visible; (2) what they might need next — 1 click away; (3) what they rarely need — 2+ clicks away. **Anything always-visible that belongs in category 2 or 3 is a design bug.**

### 6. Agent Types and When to Use

| Agent | Use For | Model |
|-------|---------|-------|
| `build` | Default implementation. Components, hooks, config, backend procedures. | DeepSeek V4 Pro |
| `fast-build` | Routine, low-risk edits. Stubs, test fixes, config. | DeepSeek V4 Pro |
| `terminal` | Shell commands, tests, git, typecheck. | DeepSeek V4 Pro |
| `opus-build` | High-risk implementation. SalesView, command bus changes. | Claude Opus 4.7 |
| `qa-reviewer` | First-pass review. Logic, patterns, anti-pattern checks. | Claude Sonnet 4.6 |
| `cross-reviewer` | Cross-model review. Second opinions. | GPT-5.5 |
| `claude-architect` | Architecture decisions, tradeoffs, design review. | Claude Opus 4.7 |

### 7. Commands You'll Need

```bash
# Before any work
pnpm agent:doctor          # Verify environment health
pnpm typecheck             # Fast type validation

# Per-task verification
pnpm typecheck && pnpm vitest run <test-file>

# Phase gate verification (run on fast runner)
fast-runner exec terp-operator -- pnpm typecheck && pnpm test

# Playwright E2E (with fast runner, pointing at Mac mini dev server)
fast-runner exec terp-operator -- \
  PLAYWRIGHT_SKIP_WEB_SERVER=1 \
  pnpm exec playwright test tests/e2e/operator-console.spec.ts \
  --project=chromium --workers=1
```

### 8. File Map

```
docs/engineering-plans/
├── AGENTS.md                              ← You are here
├── AI-TODO.md                             ← Task tracking (modify this)
├── BUG-REGISTRY.md                        ← Known bugs (modify this)
├── HANDOFF.md                             ← Session handoff protocol
├── MASTER-EXECUTION-DOCUMENT.md           ← Execution source of truth
├── README.md                              ← Human-readable index
├── dependency-graph.md                    ← Task ordering
├── mercury-ux-integrated-analysis.md      ← UX AUTHORITY (read first; 12 UX rules)
├── mercury-user-experience-analysis.md    ← Claude Opus 4.7 UX audit (source for integrated)
├── openai-ux-analysis-gpt4o.md            ← GPT-4o adversarial UX audit (source for integrated)
├── mercury-design-ground-up-analysis.md   ← Visual tokens + component architecture
├── mercury-ux-adoption.md                 ← Original plan (rationale)
├── mercury-retrofit-*.md                  ← QA reports
├── terp-feature-to-mercury-mapping.md     ← Feature preservation
├── wireframes/                            ← Wireframe inventory (Phase -1 output)
│   ├── README.md                          ← Wireframe directory entry point
│   ├── DESIGN-RULES.md                    ← Design rules v2.0 (UX-first)
│   ├── review.html                        ← Visual review artifact (10 representative)
│   └── WF-*.md                            ← 47 source wireframes (27 views + 10 components + 10 flows)
├── specifications/
│   ├── components/*.md                    ← Component spec sheets
│   ├── templates/*.md                     ← Template specs
│   └── views/_TEMPLATE.md                 ← View spec template
├── work-breakdown/
│   ├── 00-master-task-registry.md         ← 108 tasks, full details
│   ├── 01-integration-findings.md         ← Stubs, bugs, anti-patterns
│   ├── 02-ai-execution-strategy.md        ← Parallel dispatch strategy
│   └── AGENT-EXECUTION-GUIDE.md           ← Agent workflow rules
└── research-packets/
    └── mercury-combobox-behavior.md       ← Mercury DOM evidence
```

### 9. Repo Layout (Where to Write Code)

```
src/
├── shared/
│   └── statuses.ts                        ← NEW: Canonical status enums
├── client/
│   ├── config/
│   │   ├── entity-schemas.ts              ← Entity field definitions
│   │   ├── entity-actions.ts              ← State machines
│   │   ├── view-registry.ts               ← View declarations
│   │   └── entity-column-map.ts           ← NEW: Field→DB column mapping
│   ├── templates/
│   │   ├── GridView.tsx                   ← 15+ views
│   │   ├── MasterDetailView.tsx           ← Intake, PO lines
│   │   ├── DashboardView.tsx              ← Dashboard
│   │   └── WizardView.tsx                 ← Pick
│   ├── components/
│   │   ├── editors/ComboboxCellEditor.tsx
│   │   ├── FilterToolbar.tsx
│   │   ├── BulkActionBar.tsx
│   │   ├── DetailSlideover.tsx
│   │   ├── tabs/registry.ts
│   │   ├── ViewTabBar.tsx
│   │   └── GridSummaryStrip.tsx
│   ├── hooks/
│   │   ├── useViewData.ts
│   │   ├── useEntityActions.ts
│   │   └── useColumnDefs.ts
│   └── views/
│       └── SalesView.tsx, PurchaseOrdersView.tsx, ...
└── server/
    ├── routers/
    │   ├── queries.ts                     ← MODIFIED: comboboxOptions, gridSummary, statusCounts, grid() params
    │   └── commands.ts                    ← MODIFIED: runBulk procedure
    └── services/
        └── commandBus.ts                  ← MODIFIED: bulk execution
```

### 10. Quick Dispatch Template

When dispatching an AI agent for a task:

```
Build [component] at [exact file path].
Read only: [spec file], [test scaffold], [1 reference file].
Do NOT design. Do NOT read the full codebase.
API: [pasted from spec].
States to implement: [list].
AC: [checklist].
Run: pnpm typecheck && pnpm vitest run [test file].
Report: files created, tests passed/failed, any blockers.
```

