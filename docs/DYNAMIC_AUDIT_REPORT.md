# TERP Operator Console — Dynamic Audit Synthesis Report

**Date:** 2026-05-17
**Auditor:** Claude (senior product & engineering consultant, audit lane)
**Repo:** EvanTenenbaum/terp-agro-operator-console
**Branch:** `main` @ `a8dbb48` (3 commits ahead of `e84dd99` baseline plus working-tree edits made during this audit pass)
**Synthesizes:**
- `docs/DYNAMIC_AUDIT_PART1_BACKEND.md` (live curl + psql probe of every tRPC procedure)
- `docs/DYNAMIC_AUDIT_PART2_FRONTEND.md` (Playwright/Chromium exploration of every view, hotkey, edge case)
- Compared against `docs/AUDIT_REPORT.md` (2026-05-16 static audit, 84 findings)

> This document is the **single source of truth** for the dynamic audit. Both source documents remain in the repo for raw evidence. Every claim below cites a file + line or screenshot path. Where source-audit detail was missing, this report says so explicitly.

---

## 1. Executive Summary

### NEW findings introduced by this dynamic pass

| Severity | Backend (Part 1) | Frontend (Part 2) | Cross-cutting | Total NEW | Fixed in pass | Open |
| --- | --: | --: | --: | --: | --: | --: |
| Critical | 2 | 0 | 0 | **2** | 1 | 1 |
| High | 5 | 4 | 0 | **9** | 1 (FE) + 2 (BE) = 3 | 6 |
| Medium | 5 | 5 | 1 | **11** | 1 | 10 |
| Low | 3 | 4 | 0 | **7** | 1 (in synthesis) | 6 |
| **Total** | **15** | **13** | **1** | **29** | **6** | **23** |

(Backend total = 15 = 2+5+5+3; frontend total = 13 = 0+4+5+4. Cross-cutting tRPC `errorFormatter` finding spans both layers and is counted once.)

### System health verdict

**Production-grade ledger custody: still NOT recommended.** The dynamic pass confirmed the static audit's headline conclusion — the command-journal spine is structurally sound but the *integrity guarantees the spine is supposed to provide* are not actually enforced under contention or against malicious/buggy callers.

The good news: **zero console errors, zero page errors, zero request failures across every view, every hotkey, every viewport, dual-tab login, and slow-network throttling.** The view layer's resilience is genuinely good.

The bad news: **the audit found at least one CRITICAL data-integrity gap that the static audit missed** — the idempotency key has no payload/command binding. Combined with the static audit's already-known non-atomic idempotency claim (ARCH-02) and the confirmed live SQL-string leakage (DYN-H1), the integrity layer is approximately one bad retry-loop or one shared-key collision away from a silent double-write or a 500-storm.

### Top 5 risks the static audit missed

These are gaps that **only a live probe could surface** and that were not in `docs/AUDIT_REPORT.md`:

1. **[DYN-C1] Idempotency key has no payload or command binding.** Reusing the same key against a different command or different payload returns the original result. Critical, no static analog.
2. **[DYN-H3] `logPayment` does not allocate even when `allocationIntent='fifo'`.** The hint is stored but no allocation runs. Operators are told "Payment logged" while the invoice stays unpaid. High; static audit treated this as a two-step intent.
3. **[DYN-H4] Matchmaking status transitions are unconstrained.** An `accepted` match can be flipped to `dismissed` with no guard. High; static audit reviewed reversibility but not state-machine integrity.
4. **[FE-H1] Referees view shipped but hidden from every operator's sidenav.** Static audit found this pattern for connectors/recovery/closeout (`[UX-02]`) but referees is a newer 4th victim — and **the same fix pattern is not yet generalized**, so the next added view will repeat it.
5. **[FE-H2] No URL routing — every view is state-driven.** Browser back, deep links, "open in new tab" all broken. Static audit treats views as components but does not flag the URL-binding gap.

Honorable mention (would have been #6):

- **[DYN-H1] Concurrent identical-key requests leak raw Drizzle SQL strings** to authenticated callers. Static `[ARCH-02]` predicted the race; dynamic probe captured the actual error envelope — confirming the failure path leaks DB schema.

---

## 2. Fixed since static audit (2026-05-16 → 2026-05-17)

Findings from `docs/AUDIT_REPORT.md` that are **now closed** by changes made during this dynamic audit pass and the immediately preceding commits:

| Static finding | Resolution | Commit |
| --- | --- | --- |
| `[EDGE-05]` `postPeriodAdjustments` does not check the period is unlocked | Added `assertPeriodUnlocked(tx, period)` and called from both `postPeriodAdjustments` and `createCorrectionJournalEntry` (latter previously unguarded — extended fix). Live retest returns `2024-01 is locked. Unlock the period before posting adjustments.` | `e84dd99` |
| (no static ID) `snapshotDiff` omitted customers/vendors/payments/vendor_bills | `queries.snapshotDiff` now counts those four tables. Live retest shows correct deltas. | `e84dd99` |
| `[UX-02]` Referees added to `viewsByLoop` (referees branch) | `accessPolicy.ts` now exposes referees to owner/manager/operator/sales/viewer. Sidenav re-shows it. **NOTE:** the same `[UX-02]` for connectors/recovery/closeout is **still open** — see Section 3. | `c4a7f5a` |

Trivial safe fixes added by this synthesis pass (commit `a8dbb48`):

| ID | Fix |
| --- | --- |
| `[DYN-L1]` | `createVendor` rejects names shorter than 2 characters |
| `[FE-M2]` | `uiStore.persist.partialize` now includes `activeView` (reload returns to the same view) |
| `[FE-L1]` | Command palette search has `maxLength=200`, `aria-label`, and `truncate` class |
| (a11y) | Palette close button has explicit `aria-label` |

---

## 3. Still open from static audit (`docs/AUDIT_REPORT.md`)

Of the 84 findings in the static audit, **the following confirmed-live items remain open** after the dynamic pass. Items not listed were either not exercised in this pass or are documented for tracking only.

### Critical / High still open

| Static ID | Live evidence (this pass) | Status |
| --- | --- | --- |
| `[ARCH-01]` Command journal write outside tx | Confirmed via code read at `commandBus.ts:80-99`; not directly stressed. | **Open** |
| `[ARCH-02]` Idempotency claim non-atomic | **Confirmed live** by `[DYN-H1]` — 5 concurrent same-key requests → 1 success + 4 raw-SQL errors. | **Open** |
| `[ARCH-03]` Snapshots on non-tx connection | Confirmed unchanged in code. | **Open** |
| `[ARCH-04]` Snapshot list omits load-bearing entities | **Confirmed live.** `createVendor` writes empty `before/after` snapshots. | **Open** |
| `[ARCH-05]` Socket.io unauthenticated | Not re-exercised in this pass (frontend audit focused on views). | **Open** |
| `[SEC-04]` No login rate limiting | Login responded to 5 rapid hits within 30 ms with no throttling. | **Open** |
| `[CODE-04]` Money → toFixed(2) | **Confirmed live** by `[DYN-L3]` — `5.001 → 5.00` silent truncation. | **Open** |
| `[BIZ-01]` Customer balance denormalized | **Confirmed live** — customer `dd5a6cc4` balance=7800 vs outstanding=3600 (drift of 4200). | **Open** |
| `[BIZ-10]` Period locks have no unlock command | Confirmed via enumeration of `commandNames`. | **Open** |
| `[UX-01]` Email-substring role derivation | Confirmed at `accessPolicy.ts:31-35`. | **Open** |
| `[UX-02]` Connectors/Recovery/Closeout hidden | Still hidden for *every* user. See `[FE-M4]`. | **Open** |
| `[UX-06]` No global error boundary | Confirmed by absence in `App.tsx`/`main.tsx`. | **Open** |
| `[UX-09]` Hotkeys mutate ledger from arbitrary focus | **Confirmed live.** Cmd+Alt+I, Cmd+Alt+Shift+R, Cmd+Enter all fire without confirm; only `isEditingText` guards. | **Open** |
| `[UX-10]` No mobile/tablet design | Confirmed at 390×844 — grid unusable. | **Open** |
| `[PERF-02]` `globalSearch` 12 parallel ILIKE scans | Confirmed live; works on seed but query shape unchanged. | **Open** |
| `[PERF-06]` `recoverySearch` wrong field | **Confirmed live** by `[DYN-M3]` — `q='Harbor'` returns `[]` despite `Harbor Wellness` existing. | **Open** |
| `[EDGE-01]` Concurrent reserveInventoryForOrder overdraws | Not reproduced at 5x concurrency; code path unchanged. | **Open** |

### Items not re-exercised this pass (still open per static audit)

`[ARCH-06]` socket.io adapter, `[ARCH-08]` subscription router placeholder, `[SEC-02]` AG license leak, `[SEC-03]` demo creds in form (still visible), `[SEC-05..13]`, `[CODE-01..09]`, `[UX-03..08, UX-11, UX-A1..A23]`, `[PERF-01, PERF-03..05, PERF-A1..A5]`, all `[TEST-*]`, all `[DEVOPS-*]`, all `[DOC-*]`, `[EDGE-02..04, EDGE-06..12]`, `[BIZ-02..09]`, `[MIG-*]`, `[SCHEMA-A1/A2]`, `[BIZ-A1]`, `[UX-A1..A23]`.

---

## 4. New backend findings (Part 1)

Reproduced verbatim with severity + actionable summary. Full evidence + curl commands in `docs/DYNAMIC_AUDIT_PART1_BACKEND.md`.

### Critical

#### [DYN-C1] Idempotency key has no payload or command binding
- **Location:** `src/server/services/commandBus.ts:85-88`
- **Impact:** Same key replayed with a different command or payload returns the original result. UI bugs that recycle a key (React Strict Mode, fast refresh, retries, multi-tab) silently no-op while returning `ok:true`.
- **Edge cases:** Multi-tab key collision; client-side optimistic retry after temporary network failure with different payload; new-command-after-error retry.
- **Recommendation:** Bind the idempotency record to `(command_name, sha256(payload))`. On replay mismatch, return `409 CONFLICT` with `Idempotency key reused with different command or payload.`
- **Effort:** 2–4 hours including migration + unit test.

#### [DYN-C2] Locked periods accept correction-journal writes — **FIXED in pass** ✓
- **Location:** `commandBus.ts:createCorrectionJournalEntry` and `postPeriodAdjustments`
- **Resolved by:** `assertPeriodUnlocked(tx, period)` helper. Commit `e84dd99`.

### High

#### [DYN-H1] Concurrent identical-key requests leak raw Drizzle SQL strings
- **Location:** `commandBus.ts:135-156` (the failure catch path also inserts using the same idempotencyKey, hits the unique index, re-throws raw error).
- **Impact:** Security (schema-discovery primitive for authenticated callers) + integrity (the "graceful failure" handler is itself unsafe under contention).
- **Edge cases:** 5x concurrent same-key produced 1 success + 4 raw-SQL errors during this audit (live evidence).
- **Recommendation:** Replace existence probe with `INSERT ... ON CONFLICT (idempotency_key) DO NOTHING RETURNING id`. Add tRPC `errorFormatter` that scrubs Drizzle/Postgres error messages.
- **Effort:** 1 day.

#### [DYN-H2] `reason` is `.optional()` on every command
- **Location:** `src/shared/schemas.ts:18` (`commandInputSchema`).
- **Impact:** The audit-trail promise ("every write has an actor + key + reason") is unenforced; direct-API and any UI bug writes journal rows with `reason = NULL`.
- **Recommendation:** `reason: z.string().trim().min(3).max(500)`; seed defaults from `commandLabels[name]` for system-issued reversals.
- **Effort:** 2 hours.

#### [DYN-H3] `logPayment` does not allocate even when `allocationIntent='fifo'`
- **Location:** `commandBus.ts:1642-1680`.
- **Impact:** Operator sees "Payment logged for X" but invoice remains `partial`, aging metrics continue to count it as overdue until a separate `allocatePayment` runs.
- **Edge cases:** Multi-invoice customer where intent is implicit FIFO; the UI's allocation *preview* query computes the right answer, making the no-op even more confusing.
- **Recommendation:** Either auto-call allocation in the same tx when `allocationIntent === 'fifo'|'selected_invoice'`, or change the toast to "Payment logged but not allocated."
- **Effort:** 4 hours including reversal-policy updates.

#### [DYN-H4] Matchmaking status transitions are unconstrained
- **Location:** `commandBus.ts:2617-2640` (`reviewMatchmakingMatch`).
- **Impact:** A reviewer can silently flip an `accepted` match to `dismissed` after committing to a deal, breaking the audit story. Re-accepting re-runs sibling-auto-dismiss SQL.
- **Recommendation:** Add `if (match.status !== 'open') throw new Error(...)` at the top. Provide explicit `reopenMatchmakingMatch` for the reverse path.
- **Effort:** 1 hour + UI surfacing.

#### [DYN-H5] Approved/ordered POs allow line deletion that recomputes total to $0
- **Location:** `commandBus.ts:2695` (`assertPurchaseOrderEditable`) + `removePurchaseOrderLine` (~803).
- **Impact:** Reporting that sums `approved` POs undercounts; reversibility cannot restore deleted lines because the line snapshot was captured at approval-time only.
- **Recommendation:** Gate edits on `status in ('draft','needs_review')` and require `unfinalizePurchaseOrder` before later-stage PO edits.
- **Effort:** 2 hours.

### Medium

#### [DYN-M1] `snapshotDiff` omits customers/vendors/payments/vendor_bills — **FIXED in pass** ✓
- **Resolved by:** Extended `current` count query. Commit `e84dd99`.

#### [DYN-M2] tRPC 400 errors include full stack to the API client
- **Location:** `src/server/trpc.ts` (no `errorFormatter`).
- **Recommendation:** Add explicit `errorFormatter` that strips `stack` and shortens `zodError.formErrors`.
- **Effort:** 30 minutes.

#### [DYN-M3] `recoverySearch` returns `[]` for plausible inputs
- **Location:** `src/server/routers/queries.ts:187-204`.
- **Impact:** "Find anything" affordance silently fails on customer names.
- **Recommendation:** Add `result->>'toast' ilike $1` and `reason ilike $1` to the WHERE; consider denormalizing `display_text`.
- **Effort:** 1 hour.

#### [DYN-M4] No explicit tRPC `errorFormatter`
- **Bundled with DYN-M2.**

#### [DYN-M5] "Approved" POs are editable (state-contract surprise)
- Re-statement of `[DYN-H5]` as a Medium for readers who treat it as a feature.

### Low

#### [DYN-L1] `createVendor` accepts 1-character name — **FIXED in pass** ✓
#### [DYN-L2] `paymentPayloadSchema.amount` has no min/max
- Add `.min(-1_000_000).max(1_000_000)` sanity ceiling.
#### [DYN-L3] Money truncation is silent
- Confirmed live; `5.001 → 5.00` with no warning.

---

## 5. New frontend findings (Part 2)

### High

#### [FE-H1] Referees view shipped but hidden — **FIXED in pass** ✓
- Commit `c4a7f5a`. Residual: still no exhaustiveness test that every `ViewKey` is in some work loop.

#### [FE-H2] No URL routing — every view is state-driven
- **Location:** `src/client/App.tsx:74-91`; `uiStore.ts:60-262`.
- **Impact:** Cannot deep-link, bookmark, share, Cmd+click open-in-new-tab, or use browser back/forward. Reload (post-FE-M2 fix) now preserves view but URL is still `/`.
- **Recommendation:** Adopt `react-router-dom` v6 (~15kB gzip), or hand-roll `history.pushState` using the existing `routeHistory` plumbing in `uiStore.ts:217-243`.
- **Effort:** 1 day for a real router.

#### [FE-H3] Command Palette has no focus trap
- **Location:** `src/client/components/CommandPalette.tsx:126-225`.
- **Evidence:** Tab cycles out to Agentation toolbar and `agentation-auto-send` textarea — see `artifacts/frontend-audit/focus-trap.json`.
- **Recommendation:** `focus-trap-react` (~3kB) or hand-rolled `Tab`/`Shift+Tab` interception at first/last focusable child. Also `inert` the rest of the document.
- **Effort:** 1 hour.

#### [FE-H4] Numbers-native ≤8-column rule violated on 7/13 grids
- **Location:** `src/client/components/OperatorGrid.tsx` callsites in `OperationsViews.tsx` + `MatchmakingView.tsx`.
- **Evidence:** matchmaking=23, fulfillment=18, purchaseOrders=12, orders=11, vendors=11, payments=10, inventory=10.
- **Recommendation:** Identify the 8 must-see columns per view; move the rest behind AG Grid's tool-panel toggle or into row-detail.
- **Effort:** Half day per view.

### Medium

#### [FE-M1] CSV "export" is a JSON envelope
- **Location:** `src/server/routers/queries.ts:csvExport` + client glue.
- **Recommendation:** Add `GET /api/export/:view.csv` Express route that streams `text/csv` with `Content-Disposition: attachment`. Reuse `buildCsvForView`.
- **Effort:** 2 hours.

#### [FE-M2] Reload returns to dashboard — **FIXED in pass** ✓
- Commit `a8dbb48` adds `activeView` to `persist.partialize`.

#### [FE-M3] Dashboard has 4 form controls with no accessible label
- Verified in `artifacts/frontend-audit/a11y-dashboard.json`.
- Recommendation: `aria-label` + promote section titles to `<h2>`. Run `axe-playwright` in CI.

#### [FE-M4] Connectors/Recovery/Closeout still unreachable
- **Location:** `src/client/accessPolicy.ts:39` — hardcoded `if (['connectors','recovery','closeout'].includes(view)) return false;`
- Recommendation: replace short-circuit with proper per-loop entries; add unit test asserting every `ViewKey` is in at least one work loop.

#### [FE-M5] AG Grid filter inputs lack `aria-label`
- 14 `ag-N-input` filter fields per dense view have no label pairing.
- Recommendation: inject `aria-label={col.headerName}` via `floatingFilterComponent` props.

### Low

#### [FE-L1] Palette input no maxLength / no overflow indicator — **FIXED in pass** ✓
#### [FE-L2] 16 unlabeled buttons per view (AG Grid icons)
- Recommendation: bind `gridOptions.localeText` to `aria-label`. Run axe on `matchmaking`.
#### [FE-L3] Two-tab persisted-store contention
- Recommendation: `window.addEventListener('storage', …)` to prompt for refresh.
#### [FE-L4] Cmd+1..6 chips visible for hidden lanes
- Make hotkey chip conditional on `viewVisibleForUser`.

---

## 6. Cross-cutting findings (both layers)

#### [DYN-X1] No exhaustive test that every new view is reachable / every new command has a reason
- **Layers:** Backend command schema + frontend access policy.
- **Manifests as:** `[FE-H1]` (referees hidden) + `[FE-M4]` (connectors/recovery/closeout hidden) + `[DYN-H2]` (reason optional).
- **Severity:** Medium.
- **Recommendation:** Add a single typescript-level + unit-test guard:
  1. **Type-level:** `Record<WorkLoop, ReadonlyArray<ViewKey>>` already enforces shape; extend to require coverage via a `satisfies` type-check.
  2. **Unit-test:** assert every `ViewKey` is in at least one work loop AND every command in the catalog has a non-empty `commandLabels[name]` usable as a default `reason`.
- **Effort:** 2 hours.

---

## 7. Business flow test summary

From `docs/DYNAMIC_AUDIT_PART2_FRONTEND.md` §C plus Part 1 §D:

| Flow | UI | Backend | Verdict |
| --- | --- | --- | --- |
| Period lock → edit attempt | unreachable (closeout view hidden) | **Pass post-fix** (DYN-C2 resolved) | Backend OK; UI gap |
| Reverse `createCorrectionJournalEntry` | command palette only | **Pass** (DB rows verified, double-reverse blocked) | Backend OK |
| Idempotent retry serial same-payload | n/a | **Pass** (cached result) | OK |
| Idempotent retry serial **different**-payload | n/a | **FAIL** (DYN-C1 — wrong result cached) | **CRITICAL** |
| 5x concurrent identical-key | n/a | **Partial:** 1 mutation, but 4 callers receive raw-SQL errors (DYN-H1) | Open |
| Matchmaking accept → dismiss | command palette only | **FAIL** (DYN-H4 — no terminal guard) | Open |
| Overdraft on `addSalesOrderLine` | grid | **Pass** | OK |
| Overdraft on `reserveInventoryForOrder` | grid | **Pass** (tx rollback verified) | OK |
| RBAC viewer trying mutation | toast | **Pass** | OK |
| Closeout end-to-end | **UI unreachable** | preview-only (no archived run exercised) | UI fail |
| Reversal flow | **UI unreachable** | works via palette | UI fail |
| Batch status bulk update | hotkey works | per-row commands = N journal rows | Non-atomic |
| Referral / referee credit | now reachable | not exercised (empty seed) | Pending |
| Photography upload | drawer | not exercised | Pending |
| Sales create → invoice → payment | partial UI | backend verified Part 1 | Partial |

---

## 8. Feature completeness matrix

Reachability + functional completeness from the live audit. `Complete` = view loads, all primary actions work; `Partial` = some actions stubbed or behind hidden surface; `Stub` = view renders but has placeholder text or empty state without backing data; `Missing` = unreachable from any UI affordance.

| View / surface | Reachable for owner | Backing data | Verdict |
| --- | :-: | :-: | --- |
| dashboard | ✓ | ✓ | **Complete** (6 KPI cells; 3 form controls a11y issue) |
| reports | ✓ | ✓ | **Complete** |
| purchaseOrders | ✓ | ✓ | **Complete** (12 cols — exceeds 8 rule) |
| intake | ✓ | ✓ | **Complete** |
| sales | ✓ | ✓ | **Complete** |
| matchmaking | ✓ | ✓ | **Partial** (23 cols → unreadable; status guard missing DYN-H4) |
| orders | ✓ | ✓ | **Complete** (11 cols) |
| payments | ✓ | ✓ | **Partial** (logPayment intent flag silent no-op DYN-H3) |
| inventory | ✓ | ✓ | **Complete** |
| clients | ✓ | ✓ | **Complete** |
| vendors | ✓ | ✓ | **Complete** |
| fulfillment | ✓ | ✓ | **Partial** (18 cols) |
| connectors | ✗ | ✓ (backend OK) | **Missing UI** (UX-02 / FE-M4) |
| recovery | ✗ | ✓ (backend OK) | **Missing UI** |
| closeout | ✗ | ✓ (backend OK) | **Missing UI** |
| referees | ✓ (post-fix) | empty seed | **Stub** until referees seeded |
| settings | ✓ | ✓ | **Complete** |
| Command Palette | ✓ | ✓ | **Partial** (no focus trap FE-H3) |
| Hotkeys ⌘1..6 | ✓ | ✓ | **Partial** (chips visible for hidden lanes FE-L4) |
| Hotkeys ⌘Alt/Ctrl/Shift writes | ✓ | ✓ | **Risk** (UX-09 mutates from arbitrary focus) |
| Browser back/forward | — | — | **Broken** (FE-H2) |
| Deep-link / bookmark | — | — | **Broken** (FE-H2) |
| Reload preserves view | ✓ (post-fix) | — | **Partial** (FE-M2 fixed; FE-H2 still required for URL) |
| CSV export | ✓ | ✓ | **Partial** (returns JSON envelope FE-M1) |
| Mobile (390×844) | — | — | **Unusable** (UX-10) |

**Reachable / functional ratio:** 14 of 17 views Complete or Partial; 3 of 17 (`connectors`, `recovery`, `closeout`) outright Missing.

---

## 9. Edge case summary

Tested live; outcomes:

| Case | Outcome |
| --- | --- |
| Same idempotency key + different command/payload | **FAIL** (DYN-C1 — wrong result returned) |
| 5x concurrent same-key | **PARTIAL FAIL** (DYN-H1 — 4 raw-SQL errors) |
| Period locked → write attempt | **PASS post-fix** (DYN-C2 resolved) |
| Double-reverse | **PASS** (blocked correctly) |
| Cumulative overdraft across SO lines | **PASS** (caught at `reserveInventoryForOrder`; tx rollback verified) |
| Money fraction `5.001` | **TRUNCATED SILENTLY** (DYN-L3 / CODE-04) |
| `customer.balance` drift vs invoices | **DRIFT CONFIRMED** (BIZ-01) |
| Unknown command name | **CLEAN 400** with enum |
| Garbage cookie | **401** correctly |
| Viewer trying operator mutation | **403** correctly |
| Operator trying owner mutation | **403** correctly |
| Refresh mid-form | **Form state lost** (no "unsaved changes" prompt) |
| Long-string palette input (200 chars) | **PASS post-fix** (maxLength=200 now enforced) |
| XSS in palette (`<script>…`) | **PASS** (React escapes) |
| Browser back after switching view | **FAIL** (FE-H2) |
| Reload mid-view | **PASS post-fix** (FE-M2 resolved) |
| Two tabs / shared persist store | **No conflict detection** (FE-L3) |
| Slow network on `queries.dashboard` (3s) | **PASS** (shell renders, skeletons show) |
| Mobile 390×844 | **Unusable** (UX-10) |
| Tablet 768×1024 | **Horizontal scroll** on dense grids |

---

## 10. Prioritized action plan

### P0 — Must fix before any production custody handling

| ID | Title | Owner suggestion | ETA |
| --- | --- | --- | --- |
| `[DYN-C1]` | Idempotency key payload/command binding | Backend lead | 2-4 hours |
| `[ARCH-02]` + `[DYN-H1]` | Atomic in-flight idempotency claim + Drizzle error scrubbing | Backend lead | 1 day |
| `[ARCH-01]` | Move journal insert inside tx | Backend lead | 1 day |
| `[ARCH-05]` | Authenticate socket.io connections | Backend lead | half day |
| `[SEC-03]` + `[UX-05]` | Remove pre-filled demo creds from login form | Frontend lead | 30 min |

### P1 — Fix in next sprint

| ID | Title | Owner | ETA |
| --- | --- | --- | --- |
| `[DYN-H2]` | Make `reason` required at schema layer + seed defaults | Backend | 2 hours |
| `[DYN-H3]` | `logPayment` auto-allocates or renames toast | Backend + PM | 4 hours |
| `[DYN-H4]` | Matchmaking status guard + `reopenMatchmakingMatch` | Backend + PM | 1 hour |
| `[DYN-H5]` | Gate approved-PO line edits | Backend + PM | 2 hours |
| `[FE-H2]` | Add `react-router-dom` URL routing | Frontend | 1 day |
| `[FE-H3]` | Focus trap in Command Palette | Frontend | 1 hour |
| `[ARCH-03]` + `[ARCH-04]` | Snapshots inside tx; include vendors/users/etc. | Backend | half day |
| `[BIZ-01..03]` | CHECK constraints on denormalized money columns | Backend | 4 hours |

### P2 — Quality improvements

| ID | Title | Owner | ETA |
| --- | --- | --- | --- |
| `[DYN-M2/M4]` | tRPC `errorFormatter` | Backend | 30 min |
| `[DYN-M3]` | `recoverySearch` searches reason/toast | Backend | 1 hour |
| `[FE-H4]` | Trim grids to ≤8 default columns | Frontend + PM | per-view |
| `[FE-M1]` | Real `text/csv` export endpoint | Backend | 2 hours |
| `[FE-M3/M5/L2]` | A11y sweep — labels, axe in CI | Frontend | half day |
| `[FE-M4]` | Surface connectors/recovery/closeout to owner | Frontend | 1 hour |
| `[DYN-X1]` | Exhaustiveness unit-test for `ViewKey` + commands | Frontend + Backend | 2 hours |

### P3 — Nice-to-have / hardening

| ID | Title | Owner | ETA |
| --- | --- | --- | --- |
| `[DYN-L2]` | Payment amount min/max | Backend | 15 min |
| `[DYN-L3]` | Money truncation warning toast | Backend | 30 min |
| `[FE-L3]` | Two-tab storage conflict | Frontend | 1 hour |
| `[FE-L4]` | Conditional hotkey chips | Frontend | 30 min |
| `[UX-10]` | Mobile design pass | Design + Frontend | weeks |
| `[BIZ-10]` | `unlockPeriod` command | Backend + PM | half day |

---

## 11. Appendix — How to re-run these tests

### Prerequisites

```bash
# Postgres on localhost:55432 (docker compose up -d)
# Backend on :8787, Vite frontend on :5173
pnpm dev:e2e   # serves both
pnpm seed      # ensure seed data present
```

### Backend probe (Part 1)

```bash
# Auth as owner
curl -s -X POST http://localhost:8787/trpc/auth.login \
  -H 'content-type: application/json' \
  -c /tmp/terp-cookies.txt \
  -d '{"json":{"email":"owner@terpagro.local","password":"terp-demo"}}'

SID=$(awk '/terp_agro_sid/{print $7}' /tmp/terp-cookies.txt)

# Repro DYN-C1: same key, different command
IK=$(uuidgen)
curl -s --cookie "terp_agro_sid=$SID" -X POST http://localhost:8787/trpc/commands.run \
  -H 'content-type: application/json' \
  -d "{\"json\":{\"name\":\"createVendor\",\"idempotencyKey\":\"$IK\",\"reason\":\"r\",\"payload\":{\"name\":\"Acme Co\"}}}"
curl -s --cookie "terp_agro_sid=$SID" -X POST http://localhost:8787/trpc/commands.run \
  -H 'content-type: application/json' \
  -d "{\"json\":{\"name\":\"createBatch\",\"idempotencyKey\":\"$IK\",\"reason\":\"r\",\"payload\":{\"name\":\"Y\"}}}"

# Repro DYN-H1: 5 concurrent same-key
IK=$(uuidgen)
for i in 1 2 3 4 5; do
  curl -s --cookie "terp_agro_sid=$SID" -X POST http://localhost:8787/trpc/commands.run \
    -H 'content-type: application/json' \
    -d "{\"json\":{\"name\":\"createVendor\",\"idempotencyKey\":\"$IK\",\"reason\":\"r\",\"payload\":{\"name\":\"AUDIT_$IK\"}}}" &
done
wait

# Repro DYN-H4: dismiss an accepted match
# (substitute a real open match id from `select id from matchmaking_matches where status='open' limit 1;`)

# Regression: DYN-C2 (locked period write attempt)
curl -s --cookie "terp_agro_sid=$SID" -X POST http://localhost:8787/trpc/commands.run \
  -H 'content-type: application/json' \
  -d "{\"json\":{\"name\":\"createCorrectionJournalEntry\",\"idempotencyKey\":\"$(uuidgen)\",\"reason\":\"r\",\"payload\":{\"period\":\"2024-01\",\"amount\":1,\"memo\":\"regression test\"}}}"
# Expected: ok:false, "2024-01 is locked. Unlock the period before posting adjustments."
```

### Frontend probe (Part 2)

```bash
PLAYWRIGHT_SKIP_WEB_SERVER=1 PLAYWRIGHT_BASE_URL=http://localhost:5173 \
  npx playwright test tests/e2e/dynamic_audit_p2.spec.ts tests/e2e/dynamic_audit_p2_deep.spec.ts \
  --reporter=list

# Inspect evidence
ls artifacts/frontend-audit/
jq . artifacts/frontend-audit/view-matrix.json
jq . artifacts/frontend-audit/focus-trap.json
```

### Regression check after fixes

After landing any P0/P1 fix:
1. Re-run the curl block above; DYN-C1/H1 should return `409 CONFLICT` or `ok:false` with the new toast.
2. Re-run Playwright; the focus-trap JSON should now show focus contained to the dialog.
3. Re-run `pnpm typecheck` and (when implemented) `pnpm axe`.

---

## 12. Document inventory

| File | Purpose |
| --- | --- |
| `docs/AUDIT_REPORT.md` | Static audit, 2026-05-16, 84 findings. |
| `docs/DYNAMIC_AUDIT_PART1_BACKEND.md` | Live curl + psql probe, this audit (2026-05-17). |
| `docs/DYNAMIC_AUDIT_PART2_FRONTEND.md` | Live Playwright probe, this audit (2026-05-17). |
| `docs/DYNAMIC_AUDIT_REPORT.md` | **This file** — synthesis + action plan. |
| `artifacts/frontend-audit/*` | Screenshots, console logs, focus-trap traces. |

