# Independent Frontend-Direction Review — Reviewer Brief

**For**: a capable autonomous AI agent (Claude, Codex, GPT-class) doing a fresh, independent end-to-end review of the TERP Agro frontend direction.

**Your task**: produce your own design pass — diagnosis, philosophy, wireframes, adversarial review, replication playbook, and handoff — *as if no prior pass had been done*. You'll have access to the existing pass for comparison, but you should reach your own conclusions first, then optionally reconcile.

**Your authority**: full design and architecture authority within the stated guardrails. Make the calls. Defend them. Surface only what genuinely needs the principal's input.

**Your output medium**: markdown documents + HTML wireframes committed to the repo in a parallel namespace so the work doesn't collide with the existing pass.

---

## Identity & posture

You are operating simultaneously as:

- **Product thinker** — understanding the business, the users, the daily work
- **Operational systems designer** — modeling how humans interact with structured data at speed
- **Frontend architect** — owning the technical shape of what gets built
- **Human workflow interpreter** — converting messy operator habits into legible design
- **Interaction designer** — making each surface feel right, not just function right

Your job is to **become an expert in the system and determine the best frontend direction for real operators doing real work**. Not to audit for bugs. Not to validate someone else's plan. To independently decide what should be built and how.

The bar is alpha-tier. Equivalent to handing this to a senior designer at Linear, Figma, Notion, or Stripe and saying "tell me what to build." Their output would be opinionated, defensible, and ready to ship. Match that.

---

## The system you're reviewing

**TERP Agro** is an internal operator console for a brokerage business. The operators currently use Apple Numbers as a hacked-together ERP. They are spreadsheet-native: comfortable with grids, keyboard flow, dense information, inline editing, copy/paste, sort/filter/group.

The new console is meant to **preserve the cognitive strengths of spreadsheets while eliminating the operational weaknesses**. Not replace spreadsheet interaction — translate it into a system that adds reliability, automation, recovery, audit, multi-user safety, and traceability.

What's currently shipped (you'll verify in code):

- React 18 + Vite + TypeScript + AG Grid + Zustand + TanStack Query + tRPC client
- Express + tRPC + Socket.io + Drizzle ORM + PostgreSQL backend
- ~50 backend commands, ~25 query endpoints, role-aware nav, session auth, idempotent audited command bus
- ~13 operator surfaces (Dashboard, Purchase Orders, Intake, Sales, Orders, Payments, Inventory, Client Ledger, Vendor Payouts, Fulfillment, Connectors, Recovery, Closeout)
- Backend/frontend parity is green per the existing audit script

What's not yet shipped (the frontend pass you're doing):

- Cohesion and hierarchy across the 13 surfaces
- A consistent interaction grammar
- Density discipline
- A clear story for "what's the next obvious action on this row"
- A clear story for "how do I access supporting context without losing my place"

**Functional coverage is mostly there. Operator experience is not.** That's the gap.

---

## Principles (from the original brief — not negotiable)

These are the principal's principles. Honor them.

### The frontend should feel like

A **calm operational spreadsheet with ERP intelligence layered in**.

### Preserve

- fast scanning
- dense information access
- inline interaction
- keyboard flow
- row/column cognition
- bulk operations
- sorting / filtering / grouping
- visible adjacency
- flexible workflows
- operator momentum

### Reduce or eliminate

- copy/paste workflows
- reconciliation work
- duplicate entry
- process memory burden
- fragile formulas
- hidden dependencies
- fragmented workflows
- unnecessary clicking
- operational ambiguity
- excessive context switching

### Optimize for

- operational clarity
- confidence
- scanning speed
- predictability
- workflow continuity
- low cognitive friction
- calmness under complexity
- dense but understandable information
- intuitive interaction
- preserving user momentum

### Do NOT optimize for

- feature visibility
- novelty
- showing every capability at once
- excessive abstraction
- component proliferation
- decorative metrics
- dashboard density

### Every decision must answer

- Does this make the work easier to understand?
- Does this reduce mental effort?
- Does this reduce operational friction?
- Does this preserve momentum?
- Does this help users trust the system?
- Does this make information easier to process quickly?

### Hard rule

Every visible button, screen, action, nav item, panel, filter, chart, card, modal, and affordance must be:

- real
- useful
- wired
- operationally justified
- reducing operational burden

If it doesn't satisfy those requirements, remove it. **No stubs. No placeholders. No fake affordances. No dead nav. No decorative metrics.**

---

## How to think about this review

This section is methodology, not answers. The answers are yours to find.

### Start with the operator, not the system

Brokerage operators do specific things every day:

- A buyer texts a product fragment ("got any of the J codes?")
- A vendor drops messy rows of inventory
- Cash gets handed over
- Money needs to go out
- A row looks wrong and someone asks "what happened with this?"
- Inventory is scanned while building a sale
- A bag is packed and shipped
- A period gets closed and archived

Map these moments to the existing surfaces. Where do they happen well? Where do they break? Where does the operator have to mental-stitch across surfaces?

### Don't trust your own first impression of the code

Read the actual source. Existing components have specific behaviors that aren't obvious from filenames. The `QuickStartBar` does more than start work; the `WorkspacePanel` has a focus-mode that affects everything; the `InventoryFinderPanel` has natural-language price parsing and saved slices that aren't visible until you read the implementation.

Don't recommend changes based on what you assume the code does. Verify.

### Treat existing audit documents as evidence, not prescription

The repo contains a substantial audit lineage:

- `docs/recording-paradigm-master-ui-ux-recommendations.md` — MR-001..MR-052
- `docs/paradigm-pass-drift-ledger.md` — TA-001..TA-048 shipped state
- `docs/opus-recording-paradigm-ui-ux-review.md` — earlier review
- `docs/persona-journey-frontend-fit-audit.md` — JY-01..JY-20
- `docs/ease-of-use-frontend-pass.md` — density measurements
- `docs/frontend-interaction-surface-audit.md` — requirement matrix
- `docs/workflow-gap-audit.md` — J01..J10 coverage
- `docs/purchase-order-completion-report.md`
- `docs/unactioned-findings-atomic-proposal.md` — UF-001+

These are inputs. They reflect prior thinking. **Read them critically**. Some recommendations were already implemented and may now be technical debt. Some were never the right call. Some are operator-grounded gold. Yours is to decide which is which.

Don't be a synthesizer of others' findings. Be a fresh diagnostician.

### Anchor on operational paradigms, not features

Operators don't think in features. They think in moments and rows. When you build your design's foundation, name the small set of behavioral anchors you're designing toward. Things like:

- *How is a row treated? Is it a record from the moment it appears, or does it tolerate uncertainty?*
- *Where does context live? In navigation, in panels, in drawers, in the row itself?*
- *What's the primary action surface? Is it always-visible buttons, or does it depend on what's selected?*
- *How does the operator recover from a mistake — by searching for a command, or by acting on the row that looks wrong?*
- *What's a receipt? A separate document workflow, or "the total of what I just selected"?*

You'll name your own anchors. They're not in this brief. They emerge from your reading of the operator paradigm.

### Discipline yourself with a placement law

Every operator-facing function — every button, every column, every panel, every action — must live somewhere intentional. Without discipline, surfaces grow into cockpits that overwhelm.

Define your own slots. Pick how few you need. Common slots include things like:

- Global chrome (top strip / side nav)
- Per-view start affordances (before any row is selected)
- Per-row actions (after a row is selected, primary + secondary)
- Inline data (columns, cells)
- Context drawers / supporting reference
- Command palette / power tools
- Keyboard shortcuts

You'll pick your own. The discipline matters more than the specific count. State it explicitly and apply it consistently. **If a function doesn't fit any slot, the function is either misplaced or unnecessary.**

### Test your design against the hard rule continuously

Every visible element you draw in a wireframe must be real, useful, wired, operationally justified, and reducing operational burden. If you find yourself drawing something that's "nice to have" or "we'll wire it later" — delete it. The hard rule is the discipline that prevents bolt-on culture.

### Adversarial review is part of the design, not after it

When you produce a design, immediately attack it. Find every gap, contradiction, false confidence, missing detail, integration risk, vocabulary slip, operator-workflow regression. Document the findings. Apply the fixes. Document what you decided not to fix and why.

If you don't adversarially review your own work, the next reviewer will, and they will be merciless. Better to find your weaknesses before they're found for you.

### Replicability is part of the design too

The wireframes you produce won't cover every feature that lands in the next year. Implementers will hit features the design doesn't pin. If your design has no replicability — no recipes, no decision framework, no anti-pattern list — those new features will be bolted on, and the cohesion you fought for will erode.

Build a replication playbook as part of your output. Make it possible for someone who's never seen this codebase to extend the design coherently.

---

## Workflow you'll follow

Five phases, loosely sequenced. You may interleave or revisit — the phases are a posture, not a checklist.

### Phase A — Discover

- Read every audit document under `docs/` *that pre-dates your review*. Skip the existing design pass artifacts at `docs/design/*` for now.
- Read the actual frontend source. At minimum:
  - `src/client/App.tsx`
  - `src/client/components/Shell.tsx`
  - `src/client/components/QuickStartBar.tsx`
  - `src/client/components/CommandPalette.tsx`
  - `src/client/components/OperatorGrid.tsx`
  - `src/client/components/SelectionSummary.tsx`
  - `src/client/components/WorkspacePanel.tsx`
  - `src/client/components/Hotkeys.tsx`
  - `src/client/components/QuickLedgerGrid.tsx`
  - `src/client/components/InventoryFinderPanel.tsx`
  - `src/client/views/DashboardView.tsx`
  - `src/client/views/IntakeView.tsx`
  - `src/client/views/SalesView.tsx`
  - `src/client/views/OperationsViews.tsx`
  - `src/client/store/uiStore.ts`
  - `src/shared/types.ts`
  - `src/shared/commandCatalog.ts`
- Read the backend at least enough to know what commands and queries exist:
  - `src/server/routers/queries.ts`
  - `src/server/services/commandBus.ts`
- Optionally consult `docs/design/spec.md` from the existing pass — but only AFTER you've formed your own initial diagnosis. The goal is a fresh take, not a synthesis.

### Phase B — Diagnose

- Articulate what's working, what isn't, and what feels raw.
- Be specific. "Selection is acknowledged but not promoted" beats "could be better."
- Identify the operator paradigm anchors you'll design toward.
- Identify the principles that will discipline your design.
- Name the friction points concretely, ideally with file/line citations.
- Name what NOT to change. The audit documents will tempt you toward broad rewrite; resist unless evidence is overwhelming.

### Phase C — Design

- State your placement law. How many slots? What are they?
- State your canvas grammar. What's the consistent shape every surface uses?
- State your context-access strategy. How does an operator see supporting information without losing their place?
- State your status-aware action model. How does the primary verb on a selected row become obvious?
- State your component disposition. What's kept, reworked, killed, added?
- State your phased implementation plan. How does this ship without breaking what's there?
- State your feature-flag and rollback strategy.
- State your acceptance criteria. What does done look like?
- State your verification checklist. How is "done" verified?

This is design, not synthesis. Make decisions. Defend them.

### Phase D — Wireframe

- Produce implementation-grade wireframes for the major surfaces. Not every surface needs equal depth — judge what earns full fidelity vs. sketch.
- Show real states: default, selection, drawer-open, focused, error/empty/loading.
- Use real labels, real columns, real values. Lorem ipsum is laziness.
- Pin enough states that a competent engineer can build from them without re-asking.
- Render them in a format that the principal can actually look at — HTML wireframes work well; ASCII works for portability; pick one and commit.

### Phase E — Adversarially review your own design

- Launch independent perspectives against your own work. If you're an AI agent, this can be done by deliberately switching mindsets (code-review lens, brokerage-fit lens, evidence audit lens, closure audit lens, design critique lens) or by spawning sub-agents with adversarial prompts.
- Find P0 (will break at runtime), P1 (design/workflow holes), P2 (visual/interaction refinements).
- Apply fixes. Document what you didn't fix and why.
- Be honest. If your own design has serious problems, say so. The principal would rather hear it from you than discover it themselves.

### Phase F — Build the replicability layer

- Write a playbook that lets implementers extend the design coherently when they hit features the wireframes don't cover.
- Include a decision framework, concrete recipes per feature type, aesthetic + vocabulary rules, anti-patterns, and a smoke test.
- Without this, your design will get bolted-on within months. With it, the design's life extends to years.

### Phase G — Hand off

- Write a brief for the next agent (PM, roadmap integrator, or implementing engineer).
- Make it specific: what they're inheriting, their task, their guardrails, their deliverables, their decision-point framing.
- Don't bury the lede. The next agent should be able to skim the brief in 10 minutes and know what to do.

---

## Deliverables expected

Produce these in the repo. Use the namespace `docs/design/<your-namespace>/` so your output doesn't collide with the existing pass. Suggested namespace: `independent-review-<short-name>` (e.g., `independent-review-codex`) or simply `v2/`.

### Required

1. **`<namespace>/spec.md`** — the consolidated design contract. At minimum:
   - Diagnosis and operator paradigm anchors
   - Canvas grammar / placement law / interaction model
   - Component disposition (keep / rework / kill / new)
   - State management additions
   - Wireframe index
   - Acceptance criteria
   - Phased implementation plan
   - Verification checklist
   - Edge cases
   - Visual tokens
   - Decisions log (with rationale + reversibility)
   - Integration discipline (how new frontend integrates without feeling bolted-on)
   - Out of scope (non-goals — explicit)

2. **`<namespace>/wireframes/`** — your wireframes, formatted for review. HTML is preferred; ASCII is acceptable. Reference each by a stable ID (W1, W2…) and cross-link from the spec.

3. **`<namespace>/adversarial-review.md`** — your self-review's findings + resolutions. Same structure as P0 / P1 / P2 / Open-with-rationale. **Be brutal with your own design.**

4. **`<namespace>/replication-playbook.md`** — recipes for extending the design beyond the wireframes. Decision framework, recipes per feature type, anti-patterns, smoke test, four-question compass (paradigm match / canvas-grammar match / placement-law match / vocabulary match).

5. **`<namespace>/handoff.md`** — brief for the next agent (PM / roadmap integrator / implementing engineer).

### Optional but encouraged

6. **`<namespace>/diagnostics.md`** — your raw notes during Phase A/B. Useful for future reviewers to trace your reasoning.

7. **`<namespace>/comparison.md`** — only after producing your own work, optionally compare against the existing pass at `docs/design/spec.md`. Where do you agree? Where do you disagree? What would you change about either approach?

### How to commit

- One commit per major deliverable (spec, wireframes, adversarial review, playbook, handoff).
- Commit messages: `<namespace>(area): what changed`.
- Push to `main` after each major deliverable.
- Reference the GitHub repo: <https://github.com/EvanTenenbaum/terp-operator>.

---

## Guardrails

These are non-negotiable.

### Hard constraints

- **Internal operator console only.** No customer-facing surfaces. Customer-safe outputs are exports, not UI.
- **Existing backend is the substrate.** You may flag new commands or queries as needed, but adding them is a deviation that requires principal approval. Default to "no backend changes."
- **No new third-party libraries.** Stack is React + AG Grid + Lucide + Tailwind + Zustand + TanStack Query + tRPC. That's it.
- **No new auth, RBAC, or role models.** Session cookie + tRPC interceptor + existing `navVisibleForUser`.
- **No mobile redesign.** Desktop operator console only.
- **No design-system extraction into a separate package.**
- **No theming / dark mode** unless you can defend it as operationally justified.
- **Don't touch the existing `docs/design/*` artifacts.** Your work goes into a parallel namespace.
- **Operator vocabulary is preserved.** Files (cash), OFC (office-owned), 25 flex (price range), Inv Posted, Pay/F-up, New PO, Receive Inventory, Allocate FIFO, Buyer credit. Don't sanitize.
- **Customer-safe outputs hide internal cost, margin, floors, approval logic.** Always.
- **Connectors never directly mutate ledgers.** They route work into core lanes.

### Methodological constraints

- **No invention in silence.** If you're proposing something that doesn't fit your placement law, your canvas grammar, or the principal's principles, surface it explicitly and defend it.
- **Cite, don't paraphrase.** When you reference the audit docs, the spec, or the code, quote.
- **Make decisions, document them, mark reversibility.** Don't punt to the principal for calls you can make.
- **No filler.** Every paragraph earns its place.
- **No new vocabulary without justification.** Operator words win.

---

## Decision-point framing

When you face an ambiguous call (and you will face many), run it through:

1. **What's the operator moment this serves?** Name it concretely.
2. **What does the existing system already do here?** Quote it (code or audit doc).
3. **What's the operator-workflow consequence of each option?** Real-world, not theoretical.
4. **What's the integration-discipline consequence?** Does this respect the patterns you've established elsewhere?
5. **What's your recommendation?** One sentence, with rationale.
6. **What's the reversibility?** Under what conditions would you reverse this call?

Document this in your decisions log with the date.

---

## The four-question compass (apply before any new pixel ships)

Use this for every visible element, every action, every column, every drawer tab:

1. **Does this match the operator paradigm you've named, or contradict it?** Cite the anchor.
2. **Does this match the canvas grammar, or break it?** Name the zone / slot.
3. **Does this match the placement law, or bypass it?** Name the slot.
4. **Does this match the vocabulary, or introduce jargon?** Quote both sides.

If all four answer "match" — ship it. If any answer is "I don't know" — pause. If any answer is "break / bypass / introduce" — redesign or reject.

---

## When to surface to the principal

Default to making decisions and moving forward. Surface to the principal only when:

- The decision changes scope (a feature the principal explicitly listed as a goal is being deferred or dropped)
- The decision adds a flagged backend touchpoint
- Two principles in the brief seem to conflict and you can't reconcile them
- You discover something in the code that contradicts the principal's stated goals (e.g., the principal said "no modal wizards" but the existing code has a modal wizard the principal doesn't seem aware of)
- Your adversarial review of your own design surfaces a P0 issue that requires a wedge-level redirect

Most decisions don't meet these bars. Make them.

When you do surface, do it with:

- One paragraph: the issue
- The two or three options you considered
- Your recommendation with one-sentence rationale
- The reversibility note

---

## Closing standard — what "good" looks like

The pass is complete when:

1. Your spec is implementation-grade — a senior engineer can begin Phase 0 within 30 minutes of reading it.
2. Your wireframes pin enough states that no major question requires a fresh decision in code.
3. Your adversarial review found ≥30 distinct issues against your own design and resolved or documented each.
4. Your replication playbook covers ≥10 common feature types with concrete recipes.
5. Your handoff brief gives the next agent a clear, defensible path forward.
6. Every visible element in every wireframe is real, useful, wired, operationally justified.
7. Every decision in the decisions log has rationale + reversibility.
8. The hard rule is met without exception.
9. The four-question compass holds for every pixel.
10. The principal could ship this — or push back with specific objections — without re-doing your work.

If you can't satisfy a criterion, document the gap in your handoff brief and surface to the principal.

---

## What you will be evaluated on

- **Depth of operator understanding.** Are you designing for the brokerage operator, or for an imagined SaaS user?
- **Discipline of placement law.** Is your design coherent, or a cockpit?
- **Quality of decisions made.** Did you make calls, or punt?
- **Honesty of adversarial review.** Did you find your own weaknesses?
- **Reusability of the playbook.** Can someone who hasn't read the spec extend the design coherently?
- **Defensibility under pressure.** Could you defend each call against a skeptical senior reviewer?
- **Integration with existing reality.** Does your design respect what's already shipped, or fight it?
- **Brevity without sacrificing rigor.** Are you concise where you can be, dense where you must be?

---

## What you will NOT be evaluated on

- **Whether your conclusions match the existing pass.** They may or may not. Your job is independent judgment, not agreement.
- **How many wireframes you produce.** Coverage matters less than depth at the right surfaces.
- **How long your spec is.** Quality, not length.
- **Whether you propose more or fewer phases than the existing pass.** Sequence to ship safely, not to match a template.
- **Whether you propose more or fewer recipes in the playbook.** Cover what implementers actually need.

---

## How to begin

1. Read this brief in full before starting.
2. Read `docs/recording-paradigm-master-ui-ux-recommendations.md` — the operator-paradigm bible.
3. Read the actual frontend source (component files listed above).
4. Form your own diagnosis. Write notes.
5. Compare your diagnosis against the existing audit docs (`docs/persona-journey-frontend-fit-audit.md`, `docs/ease-of-use-frontend-pass.md`, etc.).
6. Decide your operator paradigm anchors and placement law.
7. Design the canvas grammar.
8. Produce wireframes.
9. Adversarially review your own design.
10. Build the replicability playbook.
11. Hand off.

Commit incrementally. Push after each major deliverable.

---

## One more thing

If you're tempted to start by reading the existing `docs/design/spec.md` — don't. Do your own diagnosis first.

If you reach conclusions that differ from the existing pass — that's expected. Document both and let the principal compare.

If you reach conclusions identical to the existing pass — that's also fine. Convergent design from independent reviewers is a strong signal.

What matters is that you reasoned from first principles, not that you matched a prior answer.

Good luck.
