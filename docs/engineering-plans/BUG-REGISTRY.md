# Mercury UX Retrofit — Bug Registry

**Updated:** 2026-06-15  
**Source:** Integration audit ([01-integration-findings.md](./work-breakdown/01-integration-findings.md)), AQA review, codebase survey

---

## Bug State Machine

```
open → assigned → in_progress → fixed → verified → closed
                    ↘ wontfix (with rationale)
                    ↘ duplicate (→ points to canonical bug)
```

---

## Active Bugs (Pre-Retrofit)

These exist in the current codebase. Fixes are tracked in Phase 0 tasks (T-0-C1..C5, T-0-T1..T6).

### Stubs & Dead Code

| ID | Bug | Severity | File | Fix Task | Status |
|----|-----|----------|------|----------|--------|
| B-001 | PickView uses hardcoded mock data (CAP-030 not merged) | Medium | `QueueScreen`, `PickLineScreen`, `PickListScreen` | T-0-C1 | open |
| B-002 | "Command history coming soon" placeholder | Low | `SalesCommandHistoryTab.tsx:87` | T-0-C2 | open |
| B-003 | Disabled payout button visible (unimplemented CAP-039) | Low | `RefereeCreditsList.tsx:94,99` | T-0-C3 | open |
| B-004 | `applyBatchFilters` dead procedure — never called | Low | `src/server/routers/filters.ts:22` | T-0-C4 | open |
| B-005 | `runCleanup` dead procedure — never called | Low | `src/server/routers/media.ts:13` | T-0-C4 | open |
| B-006 | `heartbeat` dead procedure — never called | Low | `src/server/routers/subscriptions.ts:21` | T-0-C4 | open |
| B-007 | `customerLastOrderedQty` (singular) dead — bulk version used | Low | `src/server/routers/queries.ts:2749` | T-0-C4 | open |
| B-008 | Merge-candidates counter shows 0 (backend not implemented) | Medium | Dashboard component | T-0-C5 | open |

### Test Brittleness

| ID | Bug | Severity | Files Affected | Fix Task | Status |
|----|-----|----------|----------------|----------|--------|
| B-101 | CSS class assertions (`.toHaveClass('primary-button')`) | Medium | 4 test files | T-0-T1 | open |
| B-102 | DOM structure coupling (`container.firstChild`) | Medium | 5 test files | T-0-T2 | open |
| B-103 | Magic numbers in assertions (`1850`, `999001`, `11`, `34`) | Low | 6 test files | T-0-T3 | open |
| B-104 | Drizzle ORM chain mocking (brittle to schema changes) | Medium | 1 test file | T-0-T4 | open |
| B-105 | E2E tests skipped with `test.skip(true, ...)` | High | 5 E2E files | T-0-T5 | open |
| B-106 | Skipped unit test (unimplemented or dead) | Low | 1 test file | T-0-T6 | open |

---

## Design Anti-Patterns (Not Bugs, But Causes of Bugs)

These caused the current poor UX. Must not reappear. Tracked here so AI agents know what to reject.

| ID | Anti-Pattern | Replacement | Enforced By |
|----|-------------|-------------|-------------|
| AP-01 | Multiple WorkspacePanels stacked | Template-based single-surface layout | §9, §10 |
| AP-02 | Inline cell renderers in useMemo on view state | Stable components with cellRendererParams | §10 |
| AP-03 | Per-view ColDef arrays (2000+ lines) | Entity schemas → auto-generated | §4.1 |
| AP-04 | Per-view StatusActionTable (8+ duplicates) | Entity state machines | §4.2 |
| AP-05 | `style={{ color: '#b42318' }}` — inline styles | Semantic CSS classes (`btn-danger`) | §9 C3 |
| AP-06 | `test.skip(true, ...)` — dead tests | Self-creating test data or delete | §1.2 |
| AP-07 | "Coming soon" disabled buttons | Hidden until implemented | §10 |
| AP-08 | Dead backend procedures | Removed or wired | §10 |
| AP-09 | Counters for unimplemented features | Hidden until backend ships | §10 |

---

## Bug Filing Protocol

When an AI agent finds a new bug during implementation:

1. **Is it a pre-existing bug?** → Search this registry first. If found, add a comment with reproduction steps.
2. **Is it introduced by the retrofit?** → File here with ID `B-2xx` (retrofit-introduced).
3. **Is it a product gap?** → File as Linear issue under TERP Operator project.
4. **Is it a repo-level problem?** → File as GitHub Issue with `bug` label.

### Bug Entry Template

```markdown
### B-xxx: [Short description]
- **Severity:** Blocker / High / Medium / Low
- **Found by:** [agent name], [date]
- **Introduced by:** [task ID] or "pre-existing"
- **Reproduction:**
  1. [Step]
  2. [Step]
  3. [Observed behavior]
- **Expected:** [What should happen]
- **Files:** [list]
- **Status:** open
- **Fix task:** [task ID] or "none yet"
```

---

## Verification Checklist (Per Bug Fix)

Before closing a bug:
- [ ] Fix committed with bug ID in commit message
- [ ] Test added that reproduces the bug and passes with fix
- [ ] `pnpm typecheck` passes
- [ ] Affected test files pass
- [ ] Regression: no previously-passing tests now fail
- [ ] Bug registry updated with status + evidence

