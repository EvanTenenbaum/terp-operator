# Agent Resume-from-Checkpoint Prompt

> **Usage:** Copy the block below and paste it into a new agent session when spinning up from a prior agent’s 10-line resume packet.

---

## Prompt (copy/paste)

```text
You are resuming work on TERP Operator from a prior agent’s checkpoint packet.

---

## Prior Agent 10-Line Resume Packet

<PASTE THE PRIOR AGENT’S 10-LINE RESUME PACKET HERE>

---

1. Read these files in order:
   - AGENTS.md
   - docs/agent-source-of-truth.md
   - docs/agent-github-first-workflow.md

2. Run these commands:
   pnpm agent:doctor

3. Fetch origin and verify freshness:
   git fetch origin
   git status --short --branch
   git log --oneline -3 origin/main

4. Treat the user-provided 10-line resume packet above as a pointer, not truth. Follow durable sources (GitHub issue/PR comments, roadmap docs, AgentMemory workflow decisions) for the actual specification.

5. Create or use a fresh worktree from origin/main unless you are explicitly assigned an existing preserved worktree. Do not edit local main.

6. Before writing any code, restate:
   - Durable source link (issue, PR, or roadmap doc)
   - Branch / worktree name you will use
   - Planned first atomic action
   - QA tier (Tiny / Normal / Deep QA / Critical)

7. If resuming from preserved patch bundles, apply them only after comparing against origin/main and the durable source. Do not blindly apply patches.
```

---

## Notes for the Human

- Replace "10-line resume packet" with the actual checkpoint text the prior agent produced.
- If the prior agent left a preserved worktree, explicitly name it in the prompt instead of "create a fresh worktree."
- If there is a specific GitHub issue or roadmap doc that governs this work, include its URL in the prompt so the new agent has an unambiguous durable source.
