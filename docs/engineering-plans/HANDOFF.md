# Mercury UX Retrofit — Agent Handoff Protocol

**Purpose:** Enable seamless work continuation across AI agent sessions, model changes, and machine boundaries. An agent picking up work should need ≤5 minutes to resume.

---

## Handoff State File

The canonical handoff state is stored in two places:

1. **`AI-TODO.md`** — Task status. Which tasks are done/in-progress/blocked. (This repo, committed with work.)
2. **`~/.agent-state/tasks/mercury-retrofit.json`** — Machine-local session state. (Mac mini only, NOT committed.)

Agents MUST update BOTH when changing task state.

---

## When to Handoff

Run the handoff protocol at these points:
- **End of session** — you're about to stop working
- **Phase boundary** — you've completed all tasks in a phase and are passing the gate
- **Blocker hit** — you cannot proceed and need human or another agent
- **Context window full** — you need a fresh agent to continue

---

## Handoff Protocol

### Step 1: Update AI-TODO.md

For every task you touched:
- Mark status: `done` / `in_progress` / `blocked`
- Record agent ID, timestamp, commit hash
- Note any blockers with clear descriptions

Example:
```
| T-0-01 | ComboboxCellEditor basic dropdown | done | build-agent-3 | commit a1b2c3d, tests: 12/12 pass |
| T-0-02 | Combobox typeahead + async save | in_progress | build-agent-3 | 8/12 tests pass, stuck on ICellEditor focus lifecycle |
| T-0-03 | Combobox a11y + edge cases | blocked | — | Blocked by T-0-02 completion |
```

### Step 2: Write Handoff Summary

Add a row to the Session Log in AI-TODO.md:

```
| 2026-06-16 | build-agent-3 (DeepSeek V4 Pro) | T-0-01 done, T-0-02 in progress | Phase 0 | Combobox: dropdown + states done. Typeahead: options filter done, async save wired but ICellEditor afterGuiAttached not receiving focus. See src/client/components/editors/ComboboxCellEditor.tsx:145-180. |
```

### Step 3: Commit Work

```bash
git add -A docs/engineering-plans/AI-TODO.md
git add -A docs/engineering-plans/BUG-REGISTRY.md
git add -A src/  # Actual code changes
git commit -m "phase(N): [summary of work done]. Handoff: [what's next/blocked]"
git push origin docs/mercury-ux-retrofit-master-plan
```

Do NOT commit `~/.agent-state/` — that's machine-local.

### Step 4: Save Machine-Local State (Mac mini only)

```bash
mkdir -p ~/.agent-state/tasks
cat > ~/.agent-state/tasks/mercury-retrofit.json << 'STATEOF'
{
  "branch": "docs/mercury-ux-retrofit-master-plan",
  "last_phase": "0",
  "last_task": "T-0-02",
  "status": "in_progress",
  "blocker": null,
  "last_agent": "build-agent-3",
  "last_update": "2026-06-16T10:30:00Z",
  "worktree": "/Users/evantenenbaum/work/terp-agro-operator-mercury-retrofit",
  "open_files": ["src/client/components/editors/ComboboxCellEditor.tsx"],
  "current_test": "src/client/components/editors/ComboboxCellEditor.test.tsx",
  "notes": "Typeahead working. ICellEditor focus lifecycle is the blocker. See lines 145-180."
}
STATEOF
```

### Step 5: AgentMemory Save (Cross-Machine)

If agentmemory is available:
```
Save: "Mercury retrofit handoff. Branch docs/mercury-ux-retrofit-master-plan. 
Phase 0. T-0-01 done, T-0-02 in progress. 
Blocker: ICellEditor afterGuiAttached focus lifecycle. 
File: ComboboxCellEditor.tsx:145-180. 
Next: fix focus, complete tests, move to T-0-03."
```

---

## Resume Protocol (Picking Up Work)

When an agent picks up work after a handoff:

### Step 1: Checkout the Branch

```bash
git fetch origin
git checkout docs/mercury-ux-retrofit-master-plan
git pull origin docs/mercury-ux-retrofit-master-plan
```

### Step 2: Read the Handoff

1. Open `docs/engineering-plans/AI-TODO.md` — check Session Log for last action
2. Open `docs/engineering-plans/HANDOFF.md` — confirm this is the right protocol version
3. Check `~/.agent-state/tasks/mercury-retrofit.json` for machine-local state
4. Query agentmemory for "mercury retrofit handoff" if cross-machine

### Step 3: Verify Environment

```bash
pnpm agent:doctor              # Environment health
git log --oneline -5           # Recent commits on this branch
pnpm typecheck                 # Baseline typecheck
pnpm vitest run --reporter=verbose 2>&1 | tail -20  # Current test state
```

### Step 4: Resume the In-Progress Task

- Open the file(s) noted in the handoff
- Run the failing test to see the current state
- Continue from where the last agent left off
- Update AI-TODO.md as you progress

### Step 5: Announce Resumption

If agentchat is available, send a brief message to the coordination channel:
```
"Resuming mercury retrofit Phase 0 T-0-02. Branch docs/mercury-ux-retrofit-master-plan."
```

---

## Multi-Agent Coordination

When multiple agents work in parallel (Phase 0, Phase 2, Phase 3D):

1. **Claim tasks in AI-TODO.md** before starting — mark as `assigned` with your agent ID
2. **Different files only** — never two agents in the same file simultaneously
3. **Merge order:** Agents working on independent files can commit independently. Agents working on dependent files (T-0-01→T-0-02) commit sequentially.
4. **Conflict resolution:** If two agents touch the same file, the second to push must rebase.

### Parallel Agent Dispatch Template

```
Agent A: T-0-01 ComboboxCellEditor → editors/ComboboxCellEditor.tsx (independent)
Agent B: T-0-05 DetailSlideover → DetailSlideover.tsx (independent)
Agent C: T-0-07 FilterToolbar → FilterToolbar.tsx (independent)
Agent D: T-0-09 BulkActionBar → BulkActionBar.tsx (independent)
Agent E: T-0-C1..C5 Stub cleanup → 5 different files (independent)
Agent F: T-0-T1..T6 Test fixes → 6 different test files (independent)

All 6 agents work simultaneously. No file conflicts.
```

---

## Worktree Protocol

For isolated work, use git worktrees:

```bash
# Create worktree from this branch
git worktree add -b mercury-task-T-0-01 ../terp-mercury-T-0-01 docs/mercury-ux-retrofit-master-plan

# Work in the worktree
cd ../terp-mercury-T-0-01
# ... build T-0-01 ...

# Push from worktree
git push origin mercury-task-T-0-01

# Merge back to master plan branch
git checkout docs/mercury-ux-retrofit-master-plan
git merge mercury-task-T-0-01

# Cleanup
git worktree remove ../terp-mercury-T-0-01
git branch -d mercury-task-T-0-01
```

---

## Emergency Handoff (Quick)

If you need to stop immediately and can't do the full protocol:

1. Commit whatever you have: `git add -A && git commit -m "EMERGENCY HANDOFF: [what you were doing] [blocker if any]"` 
2. Push: `git push origin docs/mercury-ux-retrofit-master-plan`
3. Update AI-TODO.md session log with one line
4. The next agent will figure out the rest

---

## Protocol Version

**Version:** 1.0  
**Created:** 2026-06-15  
**Branch:** `docs/mercury-ux-retrofit-master-plan`
