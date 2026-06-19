# Mercury UX Retrofit — Engineering Plans

**Primary document:** `MASTER-EXECUTION-DOCUMENT.md` (1514 lines) — everything needed. Self-contained.

## Pipeline

```
Phase -1: Wireframes → Human Review → AI Review → Approved
    ↓
Phase 0: Foundation — Frontend (27 tasks) + Backend (9 tasks) — TOTAL 36 tasks
    ↓
Phase 1-4: Views migrated (each from approved wireframe)
    ↓
Phase 4: Polish + cleanup
```

## What's Covered

| Concern | Section | Status |
|---------|---------|--------|
| **Design Philosophy** | §2 | ✅ Complete |
| **Component Specs** (7 components) | §3 | ✅ Complete |
| **Configuration Specs** (schemas, state machines, view registry) | §4 | ✅ Complete |
| **Hook Specs** (3 hooks) | §5 | ✅ Complete |
| **View Specs** (4 critical + 23 template) | §6 | ✅ Complete |
| **Action Placement Rubric** (7 rules) | §7 | ✅ Complete |
| **AI Execution Strategy** | §8 | ✅ Complete |
| **Design Constraints** (15 items) | §9 | ✅ Complete |
| **Anti-Patterns Rejected** (9 items) | §10 | ✅ Complete |
| **Feature Flags** | §11 | ✅ Complete |
| **Transition Plan** (ContextDrawer→DetailSlideover) | §12 | ✅ Complete |
| **Risk Map** | §13 | ✅ Complete |
| **Mercury Research** | §14 | ✅ Complete |
| **Dependency Graph** | §15 | ✅ Complete |
| **Post-Retrofit Codebase** | §16 | ✅ Complete |
| **Wireframes** (Phase -1) | §17 | ✅ Added |
| **Backend & Database Audit** | §18 | ✅ Added — 15 gaps found, 18 new backend tasks |
| **Task Registry** (91 frontend + 18 backend) | §1 | ⚠️ 18 backend tasks need insertion |

## Document Index (Supporting)

| Document | Purpose |
|----------|---------|
| `MASTER-EXECUTION-DOCUMENT.md` | **Single source of truth.** Build from this. |
| `mercury-ux-adoption.md` | Original plan with full rationale |
| `terp-feature-to-mercury-mapping.md` | Feature preservation verification |
| `mercury-retrofit-aqa-report.md` | Adversarial QA findings |
| `mercury-retrofit-remediation.md` | AQA fixes |
| `mercury-retrofit-final-plan.md` | Synthesis of model reviews |
| `dependency-graph.md` | Task dependency graph |
| `work-breakdown/` | Detailed task breakdowns |
| `specifications/` | Component spec sheets |
| `wireframes/` | Wireframe inventory (pending Phase -1) |

## Backend Audit Summary (see §18 for full details)

15 backend gaps identified. Top 3 blockers:
1. **Entity Schema → DB mapping** not defined (GAP 1)
2. **Entity State Machines → DB status enum sync** not defined (GAP 2)
3. **ComboboxCellEditor option fetch + create-new endpoints** missing (GAPs 3-4)

18 new backend tasks identified. 8 are blockers. Estimated: ~800-1200 new lines, ~200-400 modified lines.
