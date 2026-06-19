# AI Execution Velocity Strategy

**Principle:** Spec once, build in parallel, verify fast. Never wait for a human.

---

## 0. Why Traditional AI Execution Is Slow

| Anti-Pattern | What Happens | Fix |
|---|---|---|
| Agent reads whole codebase | Context window saturated, slow inference | Task packet: ≤5 input files, all pre-read |
| Agent designs as it builds | Ambiguity → clarification loop → human waits | Spec-first: PM writes exact spec, agent implements |
| One agent does everything | Sequential bottleneck | Parallel dispatch: independent tasks run simultaneously |
| Agent writes tests after code | Test fails → debug loop → context thrash | Scaffold tests first (TDD), agent fills implementation |
| Agent runs full test suite | 30s typecheck + 2min tests × 10 iterations | Targeted verification per task |

---

## 1. Spec-First Workflow (The PM Does Design, Agents Do Implementation)

### Before Any Agent Touches Code
The PM (or planning agent) pre-writes ALL spec sheets. This is done ONCE, before any implementation agent is dispatched.

```
Phase 0 prep (PM only, ~2 hours):
  Write ComboboxCellEditor spec (316 lines)
  Write DetailSlideover spec (279 lines)
  Write BulkActionBar spec (138 lines)
  Write FilterToolbar spec (78 lines)
  Write GridView template spec (37 lines)
  Write all entity schema stubs
  Write all state machine stubs
  Write view spec sheets for Phase 1 views
```

### Then Dispatch Build Agents in Parallel
Each agent receives a COMPLETE task packet:
- Exact file path to create
- Exact API contract (copy-pasted from spec)
- Every state to implement (with ASCII diagrams)
- Acceptance criteria checklist
- Pre-written test scaffold (test file with `describe`/`it` blocks, agent fills assertions)

```
Agent 1: Build ComboboxCellEditor basic (T-0-01)
Agent 2: Build DetailSlideover shell (T-0-05)
Agent 3: Build FilterToolbar (T-0-07)
Agent 4: Build BulkActionBar (T-0-09)
Agent 5: Build ViewTabBar (T-0-10)
Agent 6: Build GridSummaryStrip (T-0-11)
Agent 7: Write entity schemas (T-0-12)
Agent 8: Write entity state machines (T-0-13)
```

All 8 agents run simultaneously. Each completes in 5-15 minutes. Total elapsed: 15 minutes for 8 components.

---

## 2. Task Chunking for AI Context Windows

### The "One Task, One Session" Rule
Every task must fit in a single AI agent session. The agent should not need to:
- Read more than 5 files (spec sheet + 2-3 reference files + output file)
- Produce more than 1-2 new files (or modify 1-2 existing files)
- Run more than 3 verification commands (typecheck + targeted test + lint)

### Task Size Guidelines

| Task Type | Max Files | Max Lines/File | Agent Type | Session Time |
|-----------|-----------|---------------|------------|-------------|
| New component | 1 new file | 200-400 lines | `build` or `fast-build` | 5-10 min |
| Component with states | 1 new file | 300-600 lines | `build` | 10-20 min |
| Hook | 1 new file | 100-200 lines | `fast-build` | 5 min |
| Config/schema | 1 file modified | 50-200 lines | `fast-build` | 5 min |
| View migration (simple) | 1 file modified | 100-300 lines | `build` | 10-15 min |
| View migration (complex) | 1 file modified | 300-600 lines | `build` or `opus-build` | 15-30 min |
| Test hardening | 1 test file | 50-150 lines changed | `fast-build` | 5-10 min |
| Stub cleanup | 1 file | 20-80 lines changed | `fast-build` | 3-5 min |

If a task would exceed these bounds, SPLIT IT. Two small tasks are faster than one large task because:
- Smaller context = faster inference
- Less error accumulation
- Can run in parallel

### Splitting Pattern for Large Tasks
```
Instead of: "Build ComboboxCellEditor" (1 task, 600 lines)
Split into:
  T-0-01: Build basic dropdown (200 lines)
  T-0-02: Add typeahead + async save (200 lines)  
  T-0-03: Add a11y + edge cases (200 lines)
```

---

## 3. Maximum Parallelism Map

### Phase 0 (Weeks 1-3) → Can Be 3-5 Days with Parallel Dispatch

```
DAY 1 (PM prep + initial dispatch):
  ┌─ PM writes all 6 component spec sheets
  └─ PM writes all config stubs
  
DAY 1-2 (parallel build — 8 agents simultaneously):
  Agent 1: T-0-01 Combobox basic           Agent 5: T-0-10 ViewTabBar
  Agent 2: T-0-05 DetailSlideover shell    Agent 6: T-0-11 GridSummaryStrip
  Agent 3: T-0-07 FilterToolbar            Agent 7: T-0-12 Entity schemas
  Agent 4: T-0-09 BulkActionBar            Agent 8: T-0-13 State machines

DAY 2 (dependent builds — 6 agents simultaneously):
  Agent 1: T-0-02 Combobox typeahead (dep: T-0-01)
  Agent 2: T-0-06 Tab registry (dep: T-0-05)
  Agent 3: T-0-08 Filter bridge (dep: T-0-07)
  Agent 4: T-0-14 useEntityActions (dep: T-0-13)
  Agent 5: T-0-15 useColumnDefs (dep: T-0-12)
  Agent 6: T-0-16 View registry (dep: T-0-12, T-0-13)

DAY 2-3 (final builds + cleanup — 10+ agents simultaneously):
  Agent 1: T-0-03 Combobox a11y (dep: T-0-02)
  Agent 2: T-0-04 Combobox integration test (dep: T-0-03)
  Agents 3-7: T-0-C1 through T-0-C5 (stub cleanup — all independent)
  Agents 8-13: T-0-T1 through T-0-T6 (test resilience — all independent)

DAY 3: Verification. All agents report done. PM validates gates.
```

**Phase 0 elapsed time: 3 days (was 3 weeks).** This assumes agents run in parallel on the fast runner.

### Phase 1 (Weeks 4-5) → Can Be 2-3 Days

```
DAY 1 (PM prep):
  Write PurchaseOrdersView spec sheet
  
DAY 1-2 (parallel — 8 agents on different aspects of same view):
  Agent 1: T-1-01 Adopt GridView template
  Agent 2: T-1-02 FilterToolbar wiring
  Agent 3: T-1-03 SummaryStrip + ViewTabBar
  Agent 4: T-1-04 BulkActionBar wiring
  Agent 5: T-1-05 DetailSlideover wiring
  Agent 6: T-1-06 ComboboxCellEditor wiring
  Agent 7: T-1-07 PO authoring in slide-over
  Agent 8: T-1-08 Register PO tabs

  ⚠️ Merge conflict risk: 8 agents modifying PurchaseOrdersView.tsx.
  FIX: Each agent works on a DIFFERENT section of the file (top, middle, bottom)
  OR: Use component-level files (each component is separate, no merge conflicts)
  OR: Sequential dispatch but each agent completes in 10-15 min → 2 hours total

DAY 2-3: T-1-09 Validation. Terminal agent runs full test suite.
```

### Phase 2 (Weeks 6-7) → Can Be 2 Days

```
DAY 1 (parallel — 10 agents on 10 different views):
  Agent 1: T-2-04 OrdersView
  Agent 2-6: T-2-05 First wave (5 views) — all parallel
  Agent 7-11: T-2-06 Second wave (5 views) — all parallel

  Each view is an independent file. Zero merge conflicts. True parallelism.

DAY 2: T-2-07 Register tabs + T-2-08 Validation
```

### Phase 3A (Weeks 8-10) → Can Be 2-3 Days

```
DAY 1 (parallel — 7 agents extracting 7 cell renderers):
  Agent 1-7: T-3A-01 through T-3A-07 — each creates one new component file
  
DAY 1-2 (parallel — 4 agents on stabilization):
  Agent 1: T-3A-08 Stabilize fulfillmentActionsColumn
  Agent 2: T-3A-09 useSalesLineRows hook
  Agent 3: T-3A-10 useSalePrePostChecks hook
  Agent 4: T-3A-11 buildConfirmPayload

DAY 2-3: T-3A-12 Validate. HARD GATE.
```

### Phase 3B-4: Similar Parallel Dispatch

Every phase where tasks write to DIFFERENT files can be fully parallel. The only serialization is:
1. Spec must exist before build
2. Dependency tasks must complete before dependents
3. Merge conflicts on same file (use sequential dispatch for same-file tasks)

---

## 4. Fast Verification Per Task

### Don't Run the Full Suite After Every Task
Running `pnpm test` (all tests) after every task is slow. Instead:

```bash
# Per-task verification (fast — <10 seconds):
pnpm typecheck                          # TypeScript check
pnpm vitest run <task-test-file>        # Only this task's tests
pnpm vitest run --related <changed-files>  # Only tests related to changed files

# Phase-gate verification (comprehensive — run once per phase):
pnpm typecheck && pnpm test             # Full suite
PLAYWRIGHT_SKIP_WEB_SERVER=1 pnpm exec playwright test tests/e2e/operator-console.spec.ts
```

### Pre-Written Test Scaffolds
For every new component, provide a test scaffold:

```typescript
// ComboboxCellEditor.test.tsx (scaffold — agent fills implementations)
describe('ComboboxCellEditor', () => {
  describe('empty state', () => {
    it('renders placeholder text');
    it('has combobox role');
    it('has chevron icon');
  });
  describe('open state', () => {
    it('opens dropdown on click');
    it('opens dropdown on Enter');
    it('renders all options');
    it('highlights hovered option');
  });
  describe('selection', () => {
    it('selects option on click');
    it('selects option on Enter');
    it('calls onCommit with selected value');
    it('closes dropdown after selection');
  });
  describe('typeahead', () => {
    it('filters options as user types');
    it('shows "No results" when no match');
    it('shows "Create new" when allowCreate and no match');
  });
  // ... etc
});
```

The agent's job: fill in the test implementations. The test structure is already designed. This is TDD at AI speed — the scaffold prevents the agent from forgetting edge cases.

---

## 5. Agent Type Assignment

| Task Category | Agent Type | Why |
|--------------|------------|-----|
| New component (simple, <200 lines) | `fast-build` | DeepSeek V4 Pro, fast iteration |
| New component (complex, 200-600 lines) | `build` | DeepSeek V4 Pro, more context |
| View migration (complex, SalesView) | `build` or `opus-build` | Opus for hardest judgment calls |
| Hook (pure logic, <200 lines) | `fast-build` | Fast, low risk |
| Config/schema (data only) | `fast-build` | Mechanical, no judgment |
| Test hardening (replace assertions) | `fast-build` | Mechanical replacement |
| Stub cleanup (remove dead code) | `fast-build` | Mechanical removal |
| Spec writing (design) | `plan` or `claude-architect` | Design judgment required |
| QA review | `qa-reviewer` | Read-only, catches logic errors |
| Cross-model review | `cross-reviewer` | GPT-5.5 for second opinion |
| Terminal verification | `terminal` | Shell-heavy: typecheck, test, git |

---

## 6. The Fast Runner Advantage

All heavy compute runs on the DigitalOcean fast runner (c-16, 16 vCPUs):

```bash
# Dispatch 8 agents in parallel on the fast runner:
fast-runner exec --base origin/main --branch "mercury-ux/phase-0" terp-operator -- \
  "pnpm typecheck"  # Each agent gets its own worktree

# Agents share the runner, not the Mac mini.
# Mac mini is control plane only.
```

This means: 8 agents building simultaneously, each with isolated worktrees, no resource contention. Typecheck runs in 5-10 seconds on 16 vCPUs vs. 30s on the Mac mini.

---

## 7. Realistic Timeline with Parallel AI Execution

| Phase | Sequential (Weeks) | Parallel AI (Days) | Speedup |
|-------|-------------------|-------------------|---------|
| 0 — Foundation | 3 | 3 | 7x |
| 1 — Pilot | 2 | 2 | 7x |
| 2 — GridJourney | 2 | 2 | 7x |
| 3A — Sales Refactor | 3 | 3 | 7x |
| 3B — Sales Migration | 3 | 2 | 10x |
| 3C — Intake+Dashboard | 2 | 1 | 14x |
| 3D — Remaining | 3 | 2 | 10x |
| 4 — Polish | 2 | 2 | 7x |
| **Total** | **20 weeks** | **17 days** | **~8x average** |

**17 elapsed days** is achievable if:
1. All spec sheets are pre-written (PM does this ONCE)
2. Agents are dispatched in parallel (8+ simultaneous on fast runner)
3. Each task is sized for single-session completion
4. Verification is targeted (task-level, not full suite)
5. Phase gates run full suite (once per phase, not after every task)

---

## 8. What the PM Does (Not the Build Agents)

The PM handles ALL design decisions before agents touch code:

| PM Task | Time | Output |
|---------|------|--------|
| Write component spec sheets (6 components) | 2 hours | Exact API, all states, keyboard tables |
| Write view spec sheets (per phase, per view) | 30 min/view | Exact layout, component wiring |
| Write test scaffolds (per component) | 15 min/component | describe/it blocks, agent fills assertions |
| Dispatch agents with complete packets | 5 min/phase | Each agent receives: spec + scaffold + AC checklist |
| Verify phase gates | 15 min/phase | Run full suite, check AC, approve or dispatch fixes |
| Write config stubs (schemas, state machines) | 1 hour | Data definitions, agent fills missing fields |

**Total PM time across all phases: ~15-20 hours.** This is the design tax. Pay it once, agents build in parallel.

---

## 9. Anti-Patterns That Kill Velocity

| Anti-Pattern | Speed Cost | Fix |
|---|---|---|
| Agent reads 10 files for context | 2-3 min context processing × 10 tasks = 25 min wasted | Task packet: ≤5 files, pre-selected |
| Agent designs as it builds | 5-10 min ambiguity resolution × 10 tasks = 1 hour wasted | Spec exists before agent starts |
| Serial dispatch (one agent at a time) | 8 tasks × 15 min = 2 hours sequential vs. 15 min parallel | Parallel dispatch on fast runner |
| Agent runs full test suite per change | 2 min × 5 iterations × 10 tasks = 100 min wasted | Targeted test per task |
| Agent hits context limit mid-task | Task fails, restart, 20 min wasted | Chunk tasks to ≤600 lines |
| Merge conflicts from parallel agents on same file | 20 min resolution × 5 conflicts | Sequential dispatch for same-file tasks OR component-level separation |
| Agent waits for human clarification | Hours to days | Spec answers all questions before dispatch |

---

## 10. One-Line Dispatch Template

Every agent dispatch follows this template:

```
Build [component name] at [file path].
API: [copy-paste from spec]
States: [list from spec]
Do NOT read any files except: [spec sheet], [1-2 reference files].
Do NOT design anything. Implement exactly from spec.
After building, run: pnpm typecheck && pnpm vitest run [test file].
Report: files created, tests passed/failed.
```

This is ~100 tokens. Agent doesn't read the full plan. It reads its spec sheet + reference files + the dispatch command. Starts building immediately.

---

## Summary: 20 Weeks → 17 Days

The plan is thorough because humans need thoroughness. AI agents need: exact specs, small tasks, parallel dispatch, fast verification. The PM does the thoroughness once (specs). The agents execute at machine speed.

**Rule of thumb:** If an agent spends more than 10 seconds "thinking about what to build," the spec wasn't detailed enough. If an agent needs to read more than 5 files, the task wasn't chunked small enough. If two agents block each other, the dispatch wasn't parallel enough.
