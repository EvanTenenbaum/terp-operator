# Mercury UX Retrofit — New Agent Kickoff

**Handoff from:** PM (DeepSeek V4 Pro), 2026-06-15
**To:** Next available agent
**Status:** Planning complete. All specs written. Ready for Phase -1 wireframe creation.

---

## One-Minute Context

TERP Operator's UI needs a UX overhaul adopting Mercury.com's patterns. We've done:
- Deep reconnaissance of Mercury's actual DOM behavior
- Complete feature mapping (every TERP feature → Mercury pattern)
- 108-task breakdown with exact specs, APIs, states, keyboard behavior, a11y
- Backend audit (15 gaps found, 18 backend tasks)
- Multi-model adversarial review (AQA, Gemini, GPT-5.5)
- All wireframes, specs, task tracking, and handoff protocols in place

You're the first execution agent. Your job: **Phase -1: create wireframes.**

---

## What You Do (In Order)

### 1. Environment (2 minutes)

```bash
cd /Users/evantenenbaum/work/terp-agro-operator-console
git fetch origin
git checkout docs/mercury-ux-retrofit-master-plan
pnpm agent:doctor
```

### 2. Read (5 minutes)

Open `docs/engineering-plans/` and read these three files:
1. **MASTER-EXECUTION-DOCUMENT.md §17** — Wireframe creation process (lines ~30-262)
2. **AI-TODO.md** — Current state (all pending, Phase -1 first)
3. **AGENTS.md §10** — Quick dispatch template

Skip the rest. Don't read the whole plan.

### 3. Create Wireframes (Your Main Job)

Per MASTER-EXECUTION-DOCUMENT.md §17.4, create wireframes for:
- **27 views** — full-page ASCII wireframes with dimensions, labels, ARIA annotations
- **10 component state sets** — every state per component (ComboboxCellEditor = 10 states, DetailSlideover = 4 states, etc.)
- **10 interaction flows** — step-by-step: click → opens → selects → saves → confirmation

Format every wireframe per §17.2 template. Example in §17.5.

Save wireframes to `docs/engineering-plans/wireframes/`.

### 4. Generate Visual Wireframes (Optional but Recommended)

Use Excalidraw or tldraw MCP to generate visual wireframes from ASCII:
- Excalidraw: remote MCP at `https://mcp.excalidraw.com/mcp`
- tldraw: local MCP at `~/.config/opencode/mcp-servers/tldraw-mcp-server/`

Save images to `docs/engineering-plans/wireframes/images/`.

### 5. Update State

When done (or when stopping):
- Update `AI-TODO.md` — mark wireframe tasks complete
- Commit: `git add -A docs/engineering-plans/wireframes/ && git commit -m "Phase -1: wireframes created" && git push`
- Run HANDOFF.md protocol if handing off to another agent

---

## Parallel Dispatch (If You Have Multiple Agents)

All wireframes are independent. Dispatch in parallel:

```
Agent A: Views WF-V-PO through WF-V-DASH (4 wireframes)
Agent B: Views WF-V-ORDERS through WF-V-FULFILLMENT (5 wireframes)
Agent C: Views WF-V-VPAYABLES through WF-V-CLOSEOUT (5 wireframes)
Agent D: Views WF-V-RECOVERY through WF-V-CPROFILE (7 wireframes)
Agent E: Views WF-V-SETTINGS through WF-V-MERGE (6 wireframes)
Agent F: Component states (10 sets, ~30 individual wireframes)
Agent G: Interaction flows (10 flows)
```

---

## Key Rules (Don't Skip These)

- **No code yet.** This is Phase -1. Wireframes only.
- **Every state gets a wireframe.** ComboboxCellEditor has 10 states. All 10 get separate diagrams.
- **Use the template.** §17.2 format. ASCII diagram + Dimensions + Interactive Elements + States + ARIA + Edge Cases.
- **Mercury patterns only.** Reference §14 (research evidence) for Mercury's actual behavior.
- **No guessing.** If unsure about a TERP view layout, read the view spec in MASTER-EXECUTION-DOCUMENT.md §6.

---

## What Success Looks Like

After Phase -1 is complete:
- `docs/engineering-plans/wireframes/` contains ~47 wireframe markdown files
- Each wireframe follows the §17.2 template
- Wireframes reference actual TERP view specs from §6
- `AI-TODO.md` shows wireframe tasks as `done`
- Branch is pushed with commit message "Phase -1: wireframes created"

Next agent (Phase 0) will build from these wireframes.

---

## Quick Reference: Files You Need

| Need | File |
|------|------|
| Wireframe process | `MASTER-EXECUTION-DOCUMENT.md` §17 |
| Wireframe template | `MASTER-EXECUTION-DOCUMENT.md` §17.2 |
| Wireframe inventory (what to create) | `MASTER-EXECUTION-DOCUMENT.md` §17.4 |
| Wireframe example | `MASTER-EXECUTION-DOCUMENT.md` §17.5 |
| Mercury behavior reference | `MASTER-EXECUTION-DOCUMENT.md` §14 |
| View specs (for accurate layouts) | `MASTER-EXECUTION-DOCUMENT.md` §6 |
| Component specs (for accurate states) | `MASTER-EXECUTION-DOCUMENT.md` §3 |
| Task tracker (update when done) | `AI-TODO.md` |
| Handoff protocol (if stopping mid-work) | `HANDOFF.md` |
