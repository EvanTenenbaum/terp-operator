# HANDOFF — TERP Operator Unified UX: Swarm Execution to Full Completion

You are taking over the UX unification pass on `terp-operator` (React 18 / Vite /
TS / AG Grid / Zustand / tRPC / Tailwind v3 + 209 semantic CSS classes). Phases
0–1 of the prior handoff are COMPLETE and verified in this tree. Your job:
orchestrate the remaining work (old Phases 2–6) as two waves — a parallel swarm
of cheap units, then one integration session. You are the orchestrator/integrator;
you generate worktree units and merge them. Do not implement swarm units yourself.

---

## 1. State of this tree (verified 2026-06-12)

`pnpm typecheck` clean · `pnpm vitest run` **173 files / 1,895 tests green**
(full suite INCLUDING server tests) · `pnpm build` green (tsc + vite + tsup).
Client suite alone: 88 files / 663 tests.

### Completed in this tree (beyond the original template-layer pass)

**Phase 0 QA:** full suite + build green; OrdersView adoption verified (catch-all
rule present; referee-credit payload `refereeRelationshipId` + `logRefereeCredit`
wired through `handlePostOrder`). Live browser QA was NOT run — still owed (see §5).

**Phase 1 — StatusActionBar full adoption** (decisions-log top entry 2026-06-11
"StatusActionBar full adoption"; behavior contracts in
`src/client/views/OperationsViews.statusTables.test.tsx`, 18 tests):

- `VendorPayablesView` §10.6 — decision table replaces `vendorPrimary*` helpers
  (deleted). Pay on unscheduled bills schedules-then-records. TER-1517 expansion
  untouched.
- `FulfillmentView` §10.7 — Mark fulfilled primary gated on derived pack
  completion; printLabels stays out per TER-1660.
- `ConnectorsView` §10.8 — Route primary (CAP-017 supersedes spec), Approve/Reject
  in tray; Route disabled-with-reason until destination entered.
- `RecoveryView` §10.9 — Retry primary for `failed`. One-click Reverse DELIBERATELY
  excluded: TER-1521 confirm-flow panel owns reversal.
- `PaymentsView` §10.5 — predicate table over `unappliedAmount` (Auto-apply oldest /
  Allocate remaining / none). Unallocate + discounts stay in the allocations panel.
- `CloseoutView` §10.10 — synthetic period row through the same engine; amber
  "Fix unsafe rows (N)" primary; Lock/Archive in tray disabled-with-reason.
- `InventoryView` §10.13 — intentionally NOT converted (form-bearing in-page work
  tool; documented in decisions-log Decision 7).

### Ground truth: REAL status values (do not re-derive; do not trust spec §10 names)

| Domain | Real values (schema + commandBus verified) |
|---|---|
| vendor_bills | `open → approved → scheduled → (partial →) paid`, `reversed`. No `void` BILL status (void = vendor_payments) |
| pick_lists | `open`, `fulfilled` only. Pack progress derived from lines; `labelsPrinted` is a boolean |
| connector_requests | `open` (initial) → `routed` / `approved` / `rejected` |
| command_journal | `pending`, `ok`, `failed`; "reversed" = `reversedByCommandId != null` |
| payments | `posted`, `refunded`, `reversed`; applied-ness derived from `unappliedAmount` vs `amount`; buyer credit is a direction |

### Engine semantics (decisions-log Decision 8)

With the mandatory catch-all rule, the mixed-selection reason pill never fires:
mixed/unknown selections fall to the catch-all → full verb set in the tray. Do
not add `mixedReason` to tables ending in a catch-all.

---

## 2. Required reading — in order, before generating units

1. `docs/design-system/components/templates.md` — the one-system rule + adoption
   list (updated).
2. `docs/design-system/decisions-log.md` — top TWO entries (2026-06-11 ×2).
3. `docs/design-system/INDEX.md` — semantic class vocabulary. Never new colors.
4. Spec `docs/design/spec.md` ONLY §10.1 (lines ~892–905) when briefing unit A8.

Swarm units read LESS than this — each unit prompt below lists its own slim
reading set. Keeping per-unit context minimal is a deliberate cost lever.

---

## 3. Execution model

**Wave A:** 8 independent worktree units, run in parallel (`/batch` with the
explicit unit list — do NOT let it re-decompose — or `terp-implementer` agents in
manual worktrees). Start A8 FIRST (long pole). Models: A1/A2/A5 →
`claude-haiku-4-5`; A3/A4/A6/A7 → `claude-sonnet-4-6`; A8 → strongest available,
own session, plan mode first.

**Wave B:** you, single session, merge train + docs + audits (§5).

**Hook (every worktree, before any unit starts):** TaskCompleted →
`pnpm typecheck && pnpm vitest run src/client && pnpm vite build` (exit 2 blocks).

**Retry-with-upgrade:** any Haiku unit failing its gate twice → rerun the unit on
Sonnet from scratch. Never debug a cheap model's attempt.

### Shared guardrails (prepend verbatim to every unit prompt)

1. ZERO functionality loss. Every command/control reachable before must be
   reachable after.
2. Read ONLY the files your unit lists. No spec, no this-handoff.
3. Tests are contracts. a11y tests pin roles/names/heading ids — match them
   (FormDialog accepts `titleId`); never delete or weaken tests.
4. DO NOT edit: `docs/design-system/decisions-log.md`,
   `docs/design-system/components/templates.md`, `src/client/styles.css`,
   `src/client/components/templates/*`. Need a new class or template change →
   STOP and report it in the PR description.
5. No new colors, libraries, schema, or tRPC commands.
6. Gate: `pnpm typecheck && pnpm vitest run src/client && pnpm vite build` green.
7. PR description: what converged · verb-by-verb no-loss proof · DRAFT
   decisions-log entry · blocked needs.

---

## 4. Wave A unit prompts

### A1 — Dialogs batch 1 · haiku · branch `ux/a1-dialogs-referee`
Migrate to `templates/FormDialog` + `FormField`: `RefereeDialog.tsx`,
`UpdateRefereeRelationshipDialog.tsx`, `DeactivateRefereeRelationshipDialog.tsx`
(all in `src/client/components/`). Read: templates.md FormDialog section,
reference `RecordPrepaymentDialog.tsx`, each target's `.test.tsx` + `.a11y.test.tsx`.
Preserve every field, validation message, pending state, submit payload. Pass
`titleId` matching each a11y test's pinned heading id.

### A2 — Dialogs batch 2 · haiku · branch `ux/a2-dialogs-misc`
Same contract for `VoidRefereeCreditDialog.tsx`, `ContactCreateModal.tsx`,
`RefereeRelationshipDialog.tsx`. ContactCreateModal has no a11y test — still meet
the FormDialog a11y contract. RefereeRelationshipDialog uses a `bg-primary` CSS
variable — keep visual parity via existing semantic classes (`btn-primary`).

### A3 — MediaBatchDrawer · sonnet · branch `ux/a3-media-drawer`
Re-render `src/client/components/MediaBatchDrawer.tsx` through
`templates/InspectorDrawer`. The 487-line `MediaBatchDrawer.test.tsx` asserts by
ROLE and NAME — every role/name identical. Read: templates.md InspectorDrawer
section, reference `VendorContextDrawer.tsx`, target, test. Public API unchanged;
body renders in the tabpanel; no own header/backdrop.

### A4 — AddRefereeRelationshipDrawer → FormDialog · sonnet · branch `ux/a4-add-referee`
`src/client/components/AddRefereeRelationshipDrawer.tsx` is a form, not context.
CRITICAL: preserve the two-step resilient flow — referee created, relationship
fails → retry must NOT re-create the referee. Trace that state handling before
editing. Read: templates.md FormDialog, RecordPrepaymentDialog, target.

### A5 — ReceiptPreviewDrawer judgment + bespoke-chrome audit · haiku · branch `ux/a5-audit`
(1) `ReceiptPreviewDrawer.tsx` already uses `.context-drawer` classes — default
LEAVE unless convergence is trivial and test-safe; rationale in PR either way.
(2) Audit `src/client/views/{ContactsView,MatchmakingView,MediaView,ItemsView,CreditReviewView}.tsx`
for bespoke drawer/stacked-panel chrome. OUTPUT
`docs/design-system/audit-2026-06-bespoke-chrome.md`: per view — violation
(file:line), correct template home, size S/M/L. Fix only trivial S items
(≤10 lines); M/L are findings only.

### A6 — Recovery admin tabs (old Phase 5) · sonnet · branch `ux/a6-recovery-tabs`
`src/client/views/OperationsViews.tsx`, RecoveryView ONLY — you are the sole unit
allowed in this file. Convert the three disclosure-gated admin bands (Backup
preview / Correction / Find-Replace) into tabs within ONE WorkspacePanel ("Admin
tools"); keep support-packet export with them. Preserve every input, the REPLACE
confirmation gate, find/replace preview, snapshot diff, and ids
`recovery-period` / `recovery-amount` / `recovery-memo`. The selection-strip
StatusActionBar and reversal panel are OUT of scope. `RecoveryView.test.tsx` and
`OperationsViews.statusTables.test.tsx` stay green.

### A7 — Playwright e2e specs · sonnet · branch `ux/a7-e2e`
Two specs under `tests/` (follow existing patterns + `playwright.config.ts`):
(1) Orders status bar — draft selection → "Confirm" primary; "More" opens with
menu role; mixed selection exposes full verb set in tray. (2) RowInspector —
History/Relationship/Issue tabs, arrow-key nav, ESC closes with focus return.
Assume `pnpm db:seed:realistic` data. Gate = typecheck + build only (no live app
in the worktree); mark specs for CI.

### A8 — SalesView density pass (old Phase 4) · STRONGEST MODEL, own session · branch `ux/a8-salesview`
Plan mode first. Scope `src/client/views/SalesView.tsx` (+ `SalesView.columns.ts`
if needed). (1) Presets → FilterPresetStrip. (2) Line-grid status table per spec
§10.1 via `selectionActions` + StatusActionBar: draft → Price+Confirm
(`priceSalesOrder` then `confirmSalesOrder`); needs_resolution → Open Validation
(route to drawer Validation tab); confirmed → Post; posted → closeout-mark
cascade; fulfilled → tray only. VERIFY real line statuses in
`src/server/services/commandBus.ts` (known real values include
draft/reserved/confirmed/posted — spec names are not trustworthy, see §1 table).
End with a catch-all exposing every verb. (3) Selection-bound stacked panels →
WorkspacePanel chrome or inspector tabs per templates.md decision rule. Customer
Workspace STAYS a panel inside Sales. (4) `SalesView.marginToggle.test.tsx` and
`SalesView.pricing.test.tsx` stay green — pricing flows untouchable. Read:
templates.md, decisions-log top two entries, OrdersView (reference adoption),
spec §10.1 only.

---

## 5. Wave B — integrator checklist (you)

Merge train, full gate after EACH merge: A1 → A2 → A3 → A4 → A5 → A6 → A7 → A8.
Reject (don't resolve) any PR that violated guardrail 4.

1. Triage A5 audit: spawn follow-up units (A3-shaped prompts) for M/L findings or
   accept as documented debt.
2. Write consolidated decisions-log entries (top, append-only, Files/Author/
   Related footers) from PR-description drafts, in merge order.
3. Update templates.md adoption lists (FormDialog + InspectorDrawer).
4. `pnpm docs:inventory` if present; refresh `_inventory.json`.
5. `pnpm audit:self` — must be green.
6. Live QA (still owed from Phase 0): run the §3 checklist from the ORIGINAL
   handoff against staging via Claude-in-Chrome or Hermes/RUBE
   (`pnpm staging:reset`, seeded realistic); then `pnpm test:e2e`.
7. Final decisions-log entry summarizing the completed unified system.
8. Linear (workspace terpcorp, team TER, TER-1140 lineage): one ticket per merged
   unit + one for audit findings + one for live-QA results.

## 6. Repo facts

Deploy: DigitalOcean App Platform `terp-app-b9s35.ondigitalocean.app`. Staging
reset: `pnpm staging:reset`. Test pyramid enforced by GitHub Actions. Canonical
repo `github.com/EvanTenenbaum/terp-operator`. Build state at this handoff:
typecheck + 1,895 tests + full build green as of 2026-06-12.
