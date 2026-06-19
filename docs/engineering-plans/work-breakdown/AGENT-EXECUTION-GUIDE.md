# Agent Execution Guide — Mercury UX Retrofit

**Who this is for:** AI agents (build, terminal, fast-build, opus-build) tasked with implementing tasks from the master registry.

**Critical rule:** An agent MUST NOT guess. If a spec sheet, research packet, or input file is listed in the task's "Inputs" field, the agent MUST read it before writing code. If an input is missing, the agent MUST escalate, not proceed with assumptions.

---

## Before Starting Any Task

1. **Read the task entry** in `00-master-task-registry.md`
2. **Read all listed Input files** (spec sheets, research packets, code files)
3. **Check the Dependency Graph** (`dependency-graph.md`) — confirm all prerequisite tasks are complete
4. **Read the relevant User Story** (`user-stories/`) — understand the operator workflow this task serves
5. **Check agentmemory** for any prior decisions or issues related to this task

## During Implementation

1. **Follow the spec sheet exactly.** Component APIs, states, keyboard behavior, accessibility requirements — all specified. Don't improvise.
2. **Write tests as specified.** Each task has a test checklist. Tests must pass.
3. **Run typecheck** after every file change: `pnpm typecheck`
4. **Use existing patterns.** Look at how existing components handle similar concerns (e.g., current ContextDrawer for transitions, OperatorGrid for AG Grid integration).
5. **Never modify files outside your task's Outputs** unless explicitly required.
6. **Commit at meaningful checkpoints** with descriptive messages referencing the task ID (e.g., `feat(T-0-01): ComboboxCellEditor basic dropdown`).

## After Implementation

1. **Run all tests** listed in the task's Tests section
2. **Run the task's Acceptance Criteria** checklist — verify each item
3. **If any AC fails:** Fix it. Don't proceed.
4. **Report completion** with: task ID, files changed, tests run, tests passed/failed, known issues, open items
5. **Update the task status** in the registry (mark as [x] if embedded, or comment on Linear if using Linear integration)

## What NOT to Do

- ❌ Don't skip reading the spec sheet because "it's simple"
- ❌ Don't modify a component's public API without updating the spec sheet
- ❌ Don't remove existing functionality without explicit instruction
- ❌ Don't combine multiple tasks into one commit
- ❌ Don't skip tests because "it works in browser"
- ❌ Don't create new patterns when existing ones exist
- ❌ Don't proceed if a dependency task isn't complete

## Task File Naming

Each phase gets its own detailed task breakdown:
```
work-breakdown/
├── phase-0/01-combobox-basic-dropdown.md
├── phase-0/02-combobox-typeahead-async.md
├── phase-0/03-combobox-a11y-edge-cases.md
...
```

These are generated from the master registry as needed. The master registry (`00-master-task-registry.md`) is the canonical source.

## Spec Sheet Naming

```
specifications/
├── components/     ← One per component. Exact API + all states.
├── hooks/          ← One per hook. Signature + behavior.
├── config/         ← Entity schemas, state machines, view registry
└── views/          ← One per view. Exact retrofit layout + component wiring.
```

## Research Packet Naming

```
research-packets/
├── mercury-combobox-behavior.md     ← Evidence from Mercury demo
├── mercury-filter-toolbar-behavior.md
├── mercury-detail-panel-behavior.md
├── mercury-bulk-actions-behavior.md
├── mercury-dashboard-behavior.md
└── terp-coupling-analysis.md        ← Evidence from TERP codebase
```

## Escalation Triggers

Escalate to PM if:
- A spec sheet contradicts itself or is ambiguous
- A required input file doesn't exist
- A dependency task appears incomplete (tests don't pass)
- Implementation reveals a conflict with an existing pattern
- The task requires more than the estimated weeks (risk of timeline slip)
- You discover a feature/command that isn't mapped in the feature mapping document

## Quick Reference: File Map

| If you need to know... | Read... |
|------------------------|---------|
| What to build for task X | `00-master-task-registry.md` → task entry |
| Exact API for component Y | `specifications/components/Y.md` |
| What Mercury's pattern looks like | `research-packets/mercury-*.md` |
| What TERP's current code does | Current source files (listed in task Inputs) |
| What operator workflow this serves | `user-stories/story-*.md` |
| What must be done before task X | `dependency-graph.md` |
| How the feature mapping works | `../terp-feature-to-mercury-mapping.md` |
| The overall plan | `../mercury-ux-adoption.md` |

## Extended Rules (from Integration Audit)

### Action Placement Verification
Before completing any view migration task, verify:
- [ ] R1: Zero-selection primary action exists and is visible
- [ ] R2: Selection actions in BulkActionBar only; expansion shows supplementary only
- [ ] R3: Row expansion has ≤4 buttons; overflow in "More ▾"
- [ ] R4: Destructive actions use `useConfirm()` with `tone: 'danger'`
- [ ] R5: Danger styling uses semantic classes, not inline styles
- [ ] R6: Contextual actions near their target row
- [ ] R7: Power features have discoverable affordances

### Code Cleanliness
- Never ship "coming soon" placeholder text in production
- Never leave permanently disabled buttons visible
- Never leave dead backend procedures
- Never show counters for unimplemented features

### Test Discipline
- Never use `test.skip(true, ...)` — create test data or delete the test
- Never assert CSS class strings — use semantic queries
- Never use `container.firstChild` — use role/text queries
- Never hardcode magic numbers — derive from inputs
- Never mock ORM internals — mock at service layer
