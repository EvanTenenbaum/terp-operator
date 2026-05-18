# Handoff Prompt — TERP Agro Frontend Direction → Roadmap Integration

**For**: a PM / roadmap-integration agent picking this work up from the design spec.
**Audience expectation**: capable autonomous agent (e.g., Codex, Claude). Senior PM mindset.
**Authority**: integrate this spec into the project roadmap, reconcile with existing backlogs (TA-* and MR-*), produce a unified execution plan. **Do not write production code or modify the spec** — your output is roadmap + plan + decision memos.

---

## What you are inheriting

1. **`docs/design/spec.md`** — the single authoritative design spec for the next TERP Agro frontend pass.
   - 21 numbered sections including TL;DR, paradigm, canvas grammar, placement law, components keep/rework/kill/new, 14-surface status-aware decision tables, ~40 drawer tab data contracts, visual tokens, test plan, feature flags, edge cases, telemetry, decisions log, integration discipline, and an adversarial-review findings + resolutions section that supersedes earlier sections where they conflict.
   - **Phase 0 pre-flight checklist** in §21.9 — 10 items that must all be true before any phase ships. Read these first.
2. **`docs/design/wireframes/`** — 7 HTML files containing W1-W28 (rendered wireframes) plus 4 sketch stubs (W29-W32) described in spec §21.6. Each carries a behavior contract annotation.
3. **`docs/design/replication-playbook.md`** — **mandatory** companion. Contains the 9-step decision framework, 16 recipes (R1-R16) for the most common "feature not explicitly in the wireframes" cases, aesthetic + vocabulary rules, anti-patterns, the 10-item smoke test, and the four-question replication compass. **Every implementing agent must cite the recipe used (or document why no recipe applied) in their PR body.** When you sequence the roadmap, include the playbook as required reading in every phase-readiness file.
3. **`docs/recording-paradigm-master-ui-ux-recommendations.md`** — MR-001..MR-052 master backlog from the recording-paradigm analysis.
4. **`docs/paradigm-pass-drift-ledger.md`** — TA-001..TA-048 implementation evidence for the prior pass. Most are marked Done with code-path evidence.
5. **`docs/unactioned-findings-atomic-proposal.md`** — UF-001..UF-N unactioned cluster proposals.
6. **`docs/persona-journey-frontend-fit-audit.md`** — JY-01..JY-20 persona journey scoring.
7. **`docs/workflow-gap-audit.md`** — J01..J10 implementation coverage.
8. **TERP Numbers Master Manifest** (provided to the original designer in-conversation, not yet committed to repo) — 67-task operational audit + 28 operational gaps + journeys J01-J16 + scenarios S01-S20 + cockpit tables + contracts + hotkeys.
9. **GitHub**: <https://github.com/EvanTenenbaum/terp-operator>. `main` branch is where every commit lands. The design spec + wireframes were just committed.

---

## Your task (north star)

**Convert this design pass from a stand-alone spec into an integrated, sequenced, tracked roadmap that lives alongside the existing TERP Agro execution context (TA-* drift ledger, MR-* recommendation list, UF-* unactioned cluster, JY-* journey audit, J* workflow audit, persona test plan, 67-task inventory, 28 gaps).**

What "integrated" means in practice:

1. **Reconcile this spec against every existing backlog.** For each TA-*, MR-*, UF-*, JY-*, J*, GAP-*, S* item:
   - Already shipped (TA-* Done) → confirm the spec's references are consistent with shipped state. Flag any divergence.
   - In-spec coverage (MR-*, UF-*, JY-*, GAP-*) → map each existing item to a wireframe (W1-W32), spec §, AC, or phase.
   - Not covered → list as "explicit gap" with proposed disposition (defer, in-scope add, out-of-scope).
2. **Identify conflicts.** Where this spec deviates from existing MR-* recommendations or TA-* shipped state (e.g., killing `QuickStartBar.tsx` vs. MR-038's "compact global command strip in focus mode"), document the conflict and the resolved direction.
3. **Sequence the phases against any other in-flight TERP Agro work.** If there are open PRs, parallel design passes, or roadmap items competing for the same files, surface those and propose merge/order.
4. **Produce a unified roadmap document.** This is your primary deliverable. See "Deliverables" below.
5. **Decide explicitly on every ambiguity.** Where this spec has open items (§21.4 OPEN-01..OPEN-08), make a recommendation with reasoning. Where you discover new ambiguities, decide and record.

---

## Guardrails

Hard constraints you must respect:

- **Do not modify `docs/design/spec.md`.** That file is the design contract. Your output augments it; it does not edit it.
- **Do not modify wireframes.** Same reason.
- **Do not write production code.** Your work is roadmap synthesis, not implementation. Hand the unified roadmap to the next agent (likely writing-plans skill or a senior engineer) who will execute.
- **No new backend commands or schema changes** beyond the two flagged in §4.7 and §21 (pricing-rule projection; optional vendor-performance projection). If reconciliation surfaces a recommendation that needs a new command, flag it explicitly as a deviation requiring user re-approval.
- **No new auth/RBAC behavior.**
- **Respect §9 Out of Scope** and §21.4 Acknowledged-Open items.
- **The 8 phases in §7 are the execution unit.** You may resequence them with rationale, but do not invent new ones.
- **The operator paradigm anchors in §1.3** (row-as-working-memory, location-as-context, math-as-proof, markers-as-vocabulary, selection-as-output, money-as-row, recovery-from-row) are immutable.
- **The placement law in §3** (8 slots, one rule) is immutable. Reject any recommendation that bypasses it.

Soft preferences:

- Prefer evolutionary refinement over restructuring. The spec is heavy already.
- When reconciling MR-* or TA-* against the spec, **the spec wins unless evidence shows it dropped functionality.** Document any dropped functionality clearly.
- Favor smaller PRs over bundled ones (the spec already splits Phase 0 into 0a + 0b for this reason).
- Honor the 5-day soak exit criteria in §21.2 P1-15. If you sequence phases tighter, you must propose a defensible alternative soak.

---

## Decision-point framing (use this for every ambiguous call)

For each decision you make during integration, deeply consider:

1. **What does the spec already say?** Quote it.
2. **What does the existing TERP Agro context say?** (TA-* shipped, MR-* recommended, UF-* unactioned, GAP-* operational, J* journey)
3. **Where do they agree?** If yes, document and move on.
4. **Where do they disagree?** Surface the conflict with:
   - The two (or more) positions, quoted.
   - The brokerage operator's daily-work consequence under each.
   - The integration-discipline consequence (§19) under each.
   - Your recommendation with one-sentence rationale.
   - A reversibility note (what would change the recommendation).
5. **Cross-cutting check:** Does this decision affect another part of the roadmap? If yes, list which parts and propagate.

Your decisions are not final — they go into the unified roadmap as proposed direction for user approval. But they must be defensible.

---

## Deliverables (write these to the repo)

**File 1: `docs/roadmap/2026-frontend-direction-roadmap.md`** — the unified execution roadmap.

Sections:

1. **Executive summary** — what's shipping, when, in what order, with what gates. 1 page.
2. **Phase 0a → Phase 7 sequence** — extend §7 of the spec with: (a) calendar week proposals, (b) prerequisite phases, (c) parallelizable opportunities, (d) named owners (one per phase if possible), (e) explicit gate evidence per phase (link to AC + verification checklist items).
3. **Backlog reconciliation matrix** — one row per TA-*, MR-*, UF-*, JY-*, J*, GAP-*, S* item. Columns: identifier · short description · status (shipped / in-spec coverage / explicit gap / conflict) · spec section / wireframe / phase reference · disposition · notes.
4. **Conflict log** — every place the spec disagrees with an existing backlog item. Position A · Position B · operator consequence · integration-discipline consequence · resolved direction · reversibility note.
5. **Explicit gaps** — items not covered anywhere. For each: should it be added to this pass (justification), deferred (parking lot), or rejected (rationale).
6. **Open items inherited from §21.4 OPEN-01..OPEN-08** — your recommendation on each, with reasoning.
7. **Risk register** — top 10 risks across the 8 phases. Each: risk · likelihood · impact · mitigation · owner · trigger for escalation.
8. **Cross-references map** — for each surface (14 routes), list which TA-*, MR-*, UF-*, GAP-*, AC, wireframe, and phase touch it. Useful for the implementing agent.

**File 2: `docs/roadmap/integration-notes.md`** — running log of every decision made during integration, in chronological order. Date · decision · rationale · cross-refs.

**File 3: `docs/roadmap/phase-readiness/`** — one Markdown file per phase (0a, 0b, 1-7), each containing:
- Prerequisite phases (must-have)
- Files touched (created / edited / deleted)
- Pre-flight checks (from §21.9 + phase-specific)
- Acceptance evidence (which ACs, which Playwright specs, which manual checks)
- Feature flag default state at merge time
- Rollback procedure
- Estimated PR size (small / medium / large by file count)
- Owner candidate (role, not name)
- Cross-phase dependencies (which artifacts from other phases this phase depends on)

**File 4: `docs/roadmap/handoff-to-writing-plans.md`** — when the roadmap is ready for writing-plans skill to decompose Phase 0a into actual tasks, this is the briefing. Concise: spec path, roadmap path, phase scope, expected output.

---

## Output discipline

- **Markdown, not HTML.** GitHub-rendered.
- **One row per item in matrices.** No collapsed groups. Implementation agents need scannable density.
- **Quote, don't paraphrase, when citing the spec or existing backlogs.** Quoted text is unambiguous; paraphrase invites drift.
- **No new vocabulary.** Use the spec's terms (Keel, Identity ribbon, Context Drawer, drawer states, status-aware primary, etc.). Use existing backlog identifiers verbatim (`TA-007`, `MR-013`, `GAP-005`, `JY-03`, `S05`).
- **No filler.** Every paragraph earns its space. No "this section will discuss" or "as we'll see."
- **Commit incrementally.** Each major deliverable (roadmap, integration notes, per-phase readiness) gets its own commit on `main`. Push after each. Commit message format: `roadmap: <area> — <what changed>`.

---

## Where to look first

Read these files in this order before doing any analysis:

1. `docs/design/spec.md` §21 (Adversarial Review — Findings & Resolutions) — start here because it supersedes earlier sections where they conflict.
2. `docs/design/spec.md` §1 → §10 — paradigm, canvas grammar, placement law, components, wireframe index, acceptance criteria, phased plan.
3. `docs/design/spec.md` §11 → §20 — contracts, data flows, tokens, tests, flags, edge cases, telemetry, decisions, integration discipline, references.
4. `docs/paradigm-pass-drift-ledger.md` — TA-001..TA-048 shipped state. Most of these are Done; your reconciliation must respect that.
5. `docs/recording-paradigm-master-ui-ux-recommendations.md` — MR-001..MR-052. Many of these are already addressed by TA-*; your job is to confirm the mapping.
6. `docs/unactioned-findings-atomic-proposal.md` — UF-001+. The "still open" cluster.
7. `docs/persona-journey-frontend-fit-audit.md` — JY-* scoring.
8. `docs/workflow-gap-audit.md` — J* coverage.
9. Wireframes at `docs/design/wireframes/`.
10. The TERP Numbers Master Manifest (if you find it in the repo; otherwise note that you need it from the user).

After this, read the actual source code to ground your understanding:

- `src/client/views/SalesView.tsx`
- `src/client/views/IntakeView.tsx`
- `src/client/views/OperationsViews.tsx`
- `src/client/components/Shell.tsx`
- `src/client/components/OperatorGrid.tsx`
- `src/client/components/SelectionSummary.tsx`
- `src/client/components/WorkspacePanel.tsx`
- `src/client/components/QuickStartBar.tsx` (will be killed; understand what it does first)
- `src/client/components/InventoryFinderPanel.tsx`
- `src/client/components/QuickLedgerGrid.tsx`
- `src/client/components/CommandPalette.tsx`
- `src/client/components/Hotkeys.tsx`
- `src/client/store/uiStore.ts`
- `src/server/routers/queries.ts`
- `src/server/services/commandBus.ts`
- `src/shared/types.ts`
- `src/shared/commandCatalog.ts`

This grounds you against the integration-discipline rules in §19. Don't propose anything that contradicts what's actually in the code.

---

## How to handle disagreement with the spec

If during integration you find that this spec is wrong — not in details, but in direction:

1. Document the disagreement in `docs/roadmap/integration-notes.md` with:
   - The specific spec language you disagree with
   - Why (cite evidence)
   - The alternative direction
   - The operator-workflow consequence
   - The integration-discipline consequence
2. **Do not modify the spec.** Do not delete or alter wireframes.
3. Surface the disagreement to the user (the person running this agent session) and wait for direction.
4. Track unresolved disagreements in `docs/roadmap/open-disagreements.md` until resolved.

This is the same pattern the spec itself uses for adversarial review findings — defer disagreements through a documented channel, never silent edits.

---

## Specific known integration questions

Pre-known, surface these in your roadmap:

1. **`OperationsViews.tsx` is currently a single 1044-line file containing 10 view components.** Phase 2 starts splitting it. Are there any open PRs against this file that the split would conflict with? If so, sequence them.
2. **`InventoryFinderPanel.tsx` is currently 473 lines and is the most operator-loved tool.** Phase 2 extracts a core (`InventoryFinder.tsx`) and an overlay (`InventoryFinderOverlay.tsx`). Are there parallel pricing-rule or tag-library changes in flight that would touch the Finder simultaneously?
3. **`uiStore.ts` adds 4 new fields + 7 new actions.** Phase 0 ships these. Is there any other in-flight pass that touches `uiStore`?
4. **`Hotkeys.tsx` adds 7 new key bindings + removes 3 existing static `⌘↵` handlers.** Phase 0 ships these. Is there an accessibility audit in flight that would also touch `Hotkeys.tsx`?
5. **The flagged backend touchpoint** (pricing-rule projection on `queries.salesOrderLines`) — is this owned by someone other than the implementing frontend agent? If yes, sequence the dependency.
6. **The 67-task inventory** referenced in §1.4 and §8 — is the full list committed somewhere in the repo? If not, ask the user to commit it before the roadmap can claim 100% coverage.

---

## Success criteria for your output

The unified roadmap is complete when:

1. Every TA-*, MR-*, UF-*, JY-*, J*, GAP-*, S* identifier appears in the reconciliation matrix with a non-empty disposition.
2. Every conflict between the spec and existing backlogs is documented in the conflict log with a resolved direction.
3. Every §21.4 OPEN item has your recommendation.
4. Every phase (0a, 0b, 1-7) has a `phase-readiness/<phase>.md` file.
5. The risk register has ≥10 entries with mitigation + trigger.
6. The cross-references map is complete for all 14 routes.
7. A senior engineer reading `docs/roadmap/2026-frontend-direction-roadmap.md` can begin Phase 0a within 30 minutes without re-reading the source spec.

If you can't satisfy a success criterion, document the blocker in `integration-notes.md` and surface to the user.

---

## What "good" looks like

Compare to an alpha-tier PM doing integration work for a senior engineering team. The bar:

- **No hand-waving.** "This aligns with the operator paradigm" is not a justification; cite the §1.3 anchor.
- **No deferral to the user for decisions you can make.** Make the call, document the call, mark it reversible.
- **No restating the spec.** Reference the spec; don't paraphrase it.
- **No invented scope.** If something isn't in the spec, it isn't in the roadmap. If you think it should be, surface as an open-disagreement.
- **No optimism bias on timelines.** Every phase has at least one risk that could double its duration. Identify it.
- **No tribal vocabulary.** If you use a term not in the spec, define it on first use.

---

## When you finish

Final deliverables on `main`:

- `docs/roadmap/2026-frontend-direction-roadmap.md`
- `docs/roadmap/integration-notes.md`
- `docs/roadmap/open-disagreements.md` (if any unresolved)
- `docs/roadmap/phase-readiness/0a.md` through `phase-readiness/7.md`
- `docs/roadmap/handoff-to-writing-plans.md`

Commit message format: `roadmap: <area> — <what>`.

Push after each commit. Don't bundle.

**Final summary message back to the user** (in chat, after all commits are pushed):

- One paragraph: what shipped to the roadmap, total file count, total backlog identifiers reconciled.
- A bulleted list of the 3-5 most important decisions you made and their reversibility notes.
- A bulleted list of any open-disagreements that need user input.
- The URL of the latest commit.

That's the handoff. Good luck.
