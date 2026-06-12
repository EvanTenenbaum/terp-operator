# AGENT HANDOFF — TERP Operator: External Review Remediation COMPLETE
**Date:** 2026-06-12 (supersedes the UX-swarm handoff below the fold of git history)
**Repo:** `github.com/EvanTenenbaum/terp-operator` (this zip is the local working copy; HEAD = `5d8be73`)
**Stack:** React 18 / Vite / TS / AG Grid / Zustand / tRPC / Express / Drizzle / Postgres

---

## BUILD STATE — VERIFIED 2026-06-12

| Check | Result |
|---|---|
| `pnpm typecheck` | ✅ clean |
| `pnpm vitest run` (full default suite, client + server units) | ✅ **175 files / 1,938 tests green** (+25 vs. pre-remediation 1,913) |
| `pnpm build` (tsc + vite + tsup) | ✅ green |
| `pnpm audit:form-ids` (new) | ✅ PASS — 0 unlabeled controls, ratchet at 0 |
| `node scripts/check-backend-frontend-parity.mjs` | ✅ 116 commands / 73 queries accounted for |

## WHAT THIS PASS DID

External team findings #1–#10 fully remediated. **Read `docs/architecture/external-review-response-2026-06.md` first** — it is the point-by-point map of finding → root cause → fix → file, and contains the Node-vs-Django rebuttal and the horizontal-scaling path. Summary:

| Finding | Fix | Key files |
|---|---|---|
| #5 literal "false" in cells | `formatBool`/`boolCol` + default-formatter defense | `src/client/utils/format.ts`, `OperatorGrid.tsx`, 4 views |
| #6 device-locale breakage | `APP_LOCALE='en-US'`, 44 sites repointed, ESLint guard | `format.ts`, 32 files, `eslint.config.js` |
| #3 constant-refresh staleness | command-scoped family invalidation + focus/reconnect refetch + 60s active poll | `useCommandRunner.ts`, `SocketContext.tsx`, `main.tsx` |
| #4 stuck Credit Review / missing workers | in-process scheduler: drain 15s / reaper 5m / nightly jobs; pg advisory locks; `BACKGROUND_WORKERS` gate; heartbeat in `/api/health` | `src/server/services/backgroundWorkers.ts`, `index.ts`, `metrics.ts`, `shared/types.ts`, `.do/terp-agro-staging.yaml` |
| #1/#7 compressed tables | `fitColumnsWithoutCompression` (fit only on underflow) | `OperatorGrid.tsx` |
| #7 fields lack IDs | 70 controls aria-labeled; `audit:form-ids` ratchet in `audit:self` | 18 files, `scripts/check-form-ids.mjs`, `package.json` |
| #2 empty dashboard | loading skeletons + explicit empty state | `DashboardView.tsx` |
| #8 responsive | nav auto-collapse <1024px + tablet CSS block | `Shell.tsx`, `styles.css` |
| #9/#10 architecture | response doc + ops hardening notes | `docs/architecture/external-review-response-2026-06.md` |

Decisions-log: new top entry 2026-06-12 "External review remediation".

## DEPLOY NOTES (IMPORTANT)

1. On next deploy the background workers start automatically (`BACKGROUND_WORKERS` defaults true; the DO spec now sets it explicitly). **The accumulated `credit_recompute_queue` backlog will drain at ~50 rows/15s** — Credit Review unsticks itself within minutes of boot.
2. `/api/health` now includes a `workers` block (lastDrainAt, pendingQueueDepth, lastNightlyDay, lastError) and warns when drain is silent >2 min or depth >500. Point monitoring at it.
3. Multi-instance is safe (advisory locks), but cross-instance socket events still need the socket.io Postgres adapter before raising `instance_count` — documented in the response doc §9.

## OUTSTANDING (carried from prior handoff + new)

1. **Live e2e QA against staging** — Phase 0 checklist + the two A7 Playwright specs + visual confirmation of the new fixes (boolean cells, uncompressed grids, dashboard skeletons, credit queue draining). `pnpm staging:reset` then run against `terp-app-b9s35.ondigitalocean.app`.
2. **Linear tickets** — still owed: the 12-ticket list in the prior handoff (TER-1140 lineage) PLUS one ticket per remediation finding above (suggested parent: a new "External review remediation" initiative). Workspace terpcorp / team TER.
3. **A5 audit follow-up PRs** — ItemsView create/edit → FormDialog; CreditReviewView divergence panel → WorkspacePanel (M-size each, documented in `docs/design-system/audit-2026-06-bespoke-chrome.md`).
4. **Optional hardening next:** socket.io Postgres adapter (multi-instance events); FormDialog destructive-submit `tone` variant; migrate label-wrapped controls (112) onto FormField for ids over time.

## GUARDRAILS (unchanged, still in force)

1. Zero functionality loss; tests are contracts; never weaken a11y pins.
2. Do NOT edit: decisions-log (except prepend), templates.md (except adoption-list appends), `styles.css` core vocabulary (the 2026-06-12 responsive block is additive), `components/templates/*`.
3. Gate before every commit: `pnpm typecheck && pnpm vitest run src/client && pnpm vite build`.
4. New: never call bare `toLocale*()` (ESLint enforces); never add a form control without id/aria-label (`audit:form-ids` enforces); boolean grid columns use `boolCol()`.

## QUICK START

```bash
pnpm install --frozen-lockfile
pnpm typecheck && pnpm vitest run && pnpm build      # full gate
DATABASE_URL='postgres://terp:terp@localhost:5432/terp' pnpm dev:e2e   # live stack
# watch the workers boot: server log prints "[workers] started: drain=15000ms ..."
curl -s localhost:8787/api/health | jq .workers
```
