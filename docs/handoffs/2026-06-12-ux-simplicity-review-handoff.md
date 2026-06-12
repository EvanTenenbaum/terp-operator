# Handoff: Human-Lens UX Simplicity Review of TERP Operator

**Date:** 2026-06-12 · **From:** Claude (Fable 5) session that executed the UX audit waves · **For:** the next agent
**Repo:** `/Users/evan/work/terp-agro-operator-console` (git remote = `EvanTenenbaum/terp-operator`; legacy folder name is fine)
**Working branch state:** checkout is on `fix/matchmaking-row-ids` — the tip of the full PR stack; this tree contains *everything* described below. Do NOT push to any existing stack branch; create your own branch off this tip.

---

## 1. Your mission (Evan's words, lightly structured)

Review the UX **as a human would assess it** — not as a checklist auditor. The previous pass (see §4) fixed correctness, trust, and capability gaps. Your pass is about **simplicity and design judgment**:

1. **Catch overcomplications and bad design decisions.** Things that are technically correct but cognitively expensive.
2. **Information density:** where is too much shown at once? Where is too little (operator has to hunt)? Both directions matter.
3. **Standardization of placement:** there are "random tables" rendered inline on pages that could perhaps live in context drawers or panels. Is there a placement standard? Is it followed? (Partial answer in §5 — the placement rules exist but are thin; part of your job is to propose the complete rule set.)
4. **Benchmark other ERPs** to calibrate what "good" looks like: Odoo, NetSuite, ERPNext, Dynamics 365 Business Central, and best-in-class operational tools that aren't ERPs but set the UX bar (Linear, Airtable interfaces, Shopify admin). Web research is expected.
5. **Hard constraint: keep absolutely ALL functionality.** The goal is "the most user-friendly, simple but powerful UX/UI possible." You may propose relocating, collapsing, progressive-disclosing, merging, or re-defaulting anything — you may not propose dropping a capability. (Removal of *dead* affordances is fine; the prior run already swept most.)

**Your deliverable** is an assessment + remediation spec, not code: a findings document in the style of `docs/ux-audit-2026-06-12.md` (stable item IDs, Severity×Frequency priority, effort, evidence as `file:line` or screenshot, concrete fix per item). That format worked extremely well for one-shot execution — a future agent will execute your list, so write items that are independently implementable.

## 2. What this product is

TERP Operator is a single-warehouse brokerage/distribution ERP: buy (POs) → receive (intake) → sell (sales/orders) → fulfill (pick/pack) → collect & pay (payments, vendor payouts) → close (closeout/recovery). One operator company, ~5–10 internal users, high-frequency daily money operations. The north star is "**faster than the spreadsheet under pressure**" — operators came from a giant workbook and judge every screen against it.

- **Personas (canonical 8 + viewer):** owner/manager, sales operator, inventory operator, payments/accounting, warehouse operator, support operator, photographer, connector actor (external), viewer (read-only). Per-persona QA flow docs: `docs/qa/persona-flows/*/_persona.md` — **read these; they encode the humans you're simulating.**
- **Work loops × surfaces:** `docs/product/work-loops.md`. North-star vocabulary: `docs/product/north-stars.md`. Capability registry: `docs/product/capability-registry.md`.
- **Journeys:** `docs/customer-journey-map.md`, `docs/persona-journey-frontend-fit-audit.md` (a previous fit audit — has scoring precedent, e.g. nav "button pressure" scored 4/10).

## 3. How to run and look at it

```bash
# Postgres already runs in docker (terp-agro-postgres, port 55432). DB is seeded.
pnpm dev          # server :8787 + client :5173
# login: owner@terpagro.local / terp-demo  (also manager@/sales@/intake@/viewer@, same password)
```

- **Machine quirk (critical):** client tests false-fail on this Mac's Node 25 without `TZ=UTC NODE_OPTIONS=--no-experimental-webstorage` prefix. Full gate: `TZ=UTC NODE_OPTIONS=--no-experimental-webstorage pnpm typecheck && pnpm vitest run src/client && pnpm vite build`.
- Playwright MCP browser tools are available in this environment and were used heavily — prefer DOM/state probes plus targeted screenshots. The `live-website-human-qa` and `brokerage-fit-reviewer` specialist agents exist and match this task's lane.
- Use different role logins to feel role-gated density differences (viewer vs owner is dramatic).

## 4. What just happened (state you inherit)

A 7-wave execution of a 162-item UX audit completed today. **Read in order:**

1. `docs/ux-audit-2026-06-12.md` — the audit, Evan's 8 execution decisions, and the run-outcome section (118 shipped / 9 deferred-with-rationale).
2. `docs/ux-audit-2026-06-12-triage.json` — per-item verified evidence (file:line).
3. `docs/design-system/decisions-log.md` — top ~7 entries are today's: per-wave ship notes, deliberate deferrals, closure reconciliation, and the pre-existing bug fixes (grid collapse root cause — grids are *visible now*; they weren't this morning).

**Open PR stack (don't touch):** #477→#478→#479→#480→#481→#482→#476→#483→#484→#485, merging top-down into `main`. Your branch goes on top of the stack tip (`fix/matchmaking-row-ids`).

**Deferred items already known** (don't re-report as findings; you may *reference* them): T05/H02 full intake-grid convergence, F11 full suggestions/finder convergence, K03 sellout linkage, E06 + J07-dashboard server payloads, H06 row placement, B02 per-loop hotkey maps, C02 PO-line paste, L02 server-side note capture, U02 formal keystroke benchmark.

## 5. The design system you're auditing against

Primitives (all in `src/client/components/`, templates under `components/templates/`):

- **OperatorGrid** — the standard grid: quick filter, advanced filters, column prefs + density (persisted), CSV export, TSV paste, fill handle, RowInspector (History/Relationship/Issue tabs), SelectionSummary strip. Views: `src/client/views/*` (per-view files since today's split; `operations/shared.tsx` holds `columnsByView`).
- **StatusActionBar** — selection-driven primary + tray verbs from per-view status decision tables; `⌘↵` commits the visible primary.
- **ContextDrawer** — right-side entity drawer, 5 states (peek/standard/wide/focus), per-entity tab maps incl. the new Timeline tab; state-cycle button + coachmark added today.
- **WorkspacePanel** — collapsible titled panel, persisted collapse state. **FormDialog / InspectorDrawer** — modal form / modal inspector chrome (placement rule, per decisions-log: *forms get dialogs, context gets drawers*). **FilterPresetStrip**, CountPills, toast actions, ConfirmRoot, shortcuts registry (`src/client/shortcuts/registry.ts`, `?` overlay).
- Component conventions: `docs/design-system/components/templates.md` (+ grids/forms/modals/layouts docs), `styling-guide.md`, `state-patterns.md`, `audit-2026-06-bespoke-chrome.md` (precedent for "bespoke chrome → template" findings).

**Direct answer to Evan's standardization question:** there is a *partial* standard — grids belong in OperatorGrid, forms in FormDialog, entity context in ContextDrawer tabs, page sections in WorkspacePanel — but **there is no written rule for when an inline table/panel on a page should instead be a drawer tab, a collapsed panel, or a separate route.** That's why "random tables" accumulate inline. Known suspects to evaluate (non-exhaustive — find more):

- `PoSignalsSection` inline on Purchase Orders (`PurchaseOrdersView.tsx`)
- Credit divergence WorkspacePanel on `CreditReviewView.tsx`
- Referee detail panels (`RefereeDetailPanel.tsx` + credits/relationships lists)
- Matchmaking renders **4 grids on one page** (`MatchmakingView.tsx`) plus opportunity grids
- Dashboard panel sprawl (`DashboardView.tsx`: KPI band, Today-Focus, Money Buckets, queues, Credit Watch, My Drafts, snooze…)
- SalesView is the densest surface in the product (~1,700+ lines of view): customer workspace, purchase-history panel, photography queue panel (mounted today), finder pane, suggestions grid, line grid + validation panel + pre-post strip, sheet-preview panel with output verbs, Quick Ledger… **this is your #1 information-density candidate, in both directions.**
- Settings is a container for heterogeneous things (system, credit engine admin, strain aliases, requests) — evaluate coherence.

A useful framing: propose a **placement decision tree** ("operator needs it every visit → inline; needs it per-entity → drawer tab; needs it weekly → collapsed panel; needs it rarely → route/More") and then apply it product-wide as findings.

## 6. Method expectations (how to "assess as a human")

- Walk the 15 combo flows listed in the audit doc §1.5 (X1 full money loop especially) **clicking and typing like the persona would**, counting steps/decisions/scrolls. The spreadsheet benchmark is literal: would the workbook have been faster?
- Squint-test every screen: what does the eye land on? Is the primary action visually primary? Status-table primaries exist — are they *discoverable*?
- Per grid: are the ≤8 default columns the RIGHT 8 for that persona? (Wave 7 enforced the count, not necessarily the choice.)
- Look for **new-feature pile-up**: today's run added chips, pills, strips, badges, panels. Individually justified; collectively they may recreate the clutter they fought. Fresh eyes are exactly what's needed.
- ERP benchmarking: for each major surface (orders list, record detail, posting flow, dashboard), note how Odoo/NetSuite/ERPNext/Business Central/Shopify-admin solve the same problem and where TERP's pattern is better or worse. Cite specifics, not vibes.
- Score findings Severity (S3 blocks/corrupts mental model · S2 major friction · S1 annoying · S0 polish) × Frequency (F3 daily · F2 weekly · F1 occasional · F0 rare) → P0–P3, like the prior audit. Estimate effort S/M/L.

## 7. Guardrails for your recommendations

- **Zero functionality loss** — relocation/disclosure yes, removal no. Tests are contracts.
- No new colors/libraries; schema/tRPC changes need registry rows (recommendation-stage: just flag the dependency).
- The spine is settled — StatusActionBar/OperatorGrid/ContextDrawer/FormDialog stay; recommend *within* the system (the audit's "no rip-and-replace" rule still stands).
- Linear writeback is policy-disabled; reference TER-/CAP- IDs in text only.
- QA tier defaults Checkpoint+; if you execute anything (not expected), the gate command in §3 applies and decisions-log gets an entry.

## 8. Suggested deliverable shape

`docs/ux-simplicity-review-2026-06-DD.md`: Part 1 — placement standard proposal (the decision tree + where current UI violates it); Part 2 — per-surface density assessment (too much / too little / just right, with evidence); Part 3 — ERP benchmark notes per surface; Part 4 — the tick list (stable IDs `SX-§##`, priority, effort, concrete fix); Part 5 — sequencing into waves. Commit on your own branch; do not open PRs against the stack without Evan's say-so.
