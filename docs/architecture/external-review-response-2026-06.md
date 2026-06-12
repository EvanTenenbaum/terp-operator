# Response to External Technical Review — June 2026

**Scope:** point-by-point engineering response to the external team's findings, with the verified root cause and the shipped fix for each. All fixes land in this tree and are gated by the full automated suite (typecheck, 1,900+ unit/behavior tests, production build).

A note on the review itself: most findings were real and we thank the team for them. In several cases the *symptom* was correctly observed but the *diagnosis* offered (e.g., "Node cannot handle this," "containers going down") doesn't match what the code shows. This document separates the two.

---

## 1. "Screens break, data loading fails, tables are compressed"

**Root cause (verified):** `OperatorGrid` called AG Grid's `sizeColumnsToFit()` unconditionally on grid-ready. Data-dense views define 12–14 fixed-width columns; force-fitting them into a 1280–1440px viewport compressed every column to unreadable widths — which reads as "data isn't arriving or isn't displaying correctly." The data was arriving; the layout was destroying it.

**Fix:** `fitColumnsWithoutCompression()` (`src/client/components/OperatorGrid.tsx`). Columns keep their designed widths and the grid scrolls horizontally; fit-to-container runs only when the designed widths *underflow* the viewport, so sparse views still fill edge-to-edge. Applies to every grid in the app (Purchase Orders, Inventory, Photography, Orders, Client Balances, Contacts, Recovery, Settings included) because they all render through `OperatorGrid`.

## 2. "The dashboard is empty, even though data is attempting to reach it"

**Root cause:** two compounding issues. (a) The staleness defect in §3 meant dashboard KPIs never refreshed after commands. (b) The KPI row rendered *nothing* while loading and *nothing* on an empty response — a loading dashboard and a broken dashboard were visually identical.

**Fix:** the §3 invalidation work makes the dashboard live (it also polls on a 15–30s interval); `DashboardView` now renders skeleton tiles while loading and an explicit, actionable empty state when a response is genuinely empty. Empty can no longer be mistaken for broken.

## 3. "Pages must be constantly refreshed to update the data"

**Root cause (the most consequential finding — confirmed):** cache invalidation after a command was *entity-UUID-substring based*: a cached query was refetched only if its query key contained an affected entity's UUID. The main list surfaces — every operator grid (`queries.grid`, keyed by view name), the dashboard, the work queue, the credit-review queue — contain **no UUIDs in their keys** and were therefore *never* invalidated after a write. Combined with `refetchOnWindowFocus: false` and no polling fallback, an operator's own write did not appear in their own grid until a hard page refresh.

**Fix (three layers, `src/client/components/useCommandRunner.ts`, `src/client/context/SocketContext.tsx`, `src/client/main.tsx`):**
1. **Command-scoped invalidation** — every successful command (local or from a peer via websocket) now invalidates the list/aggregate query families (`COMMAND_SCOPED_QUERY_FAMILIES`). React Query refetches only the *mounted* queries, so the cost per command is one refetch of the current view.
2. **Focus + reconnect refetch** — returning to the tab or recovering the network refreshes stale data.
3. **60-second active-only polling safety net** — even if the websocket is blocked by an ingress proxy (a real failure mode on PaaS deployments), every mounted view converges within a minute. Background tabs do not poll.

The targeted-by-id invalidation is retained for detail queries; the previous behavior was the explicit follow-up promised in issue #44, now shipped with tests.

## 4. "Data in Credit Review is stuck — workers have hung, or are missing or non-functional"

**Root cause (your third hypothesis was exactly right — they were missing):** commands enqueue rows into `credit_recompute_queue`, and the cron entrypoints (`pnpm cron:credit-engine-nightly`, `cron:balance-reconciliation`, …) exist — but the deployment spec ran only the web service. **Nothing in the deployed system ever drained the queue, reaped stuck rows, or ran the nightly audit.** Queue rows accumulated in `pending` forever; the Credit Review surface displayed permanently stale assessments. Nothing was hung; nothing was ever running.

**Fix:** `src/server/services/backgroundWorkers.ts`, started from the server boot path:
- credit recompute queue drain every 15s (batch-capped),
- stuck-row reaper every 5 minutes,
- nightly credit-engine audit + customer-balance reconciliation once per UTC day,
- every tick guarded by a **Postgres advisory lock**, so raising `instance_count` above 1 cannot double-process,
- env-gated (`BACKGROUND_WORKERS=false`) for deployments where an external scheduler owns the `pnpm cron:*` entrypoints,
- **heartbeat surfaced in `/api/health`** (last drain time, pending queue depth, last nightly day, last error) — a stuck queue is now a visible, alertable condition, with health warnings at >2 min drain silence or >500 pending rows.

## 5. "The site displays the word 'false' instead of content"

**Root cause:** boolean fields (`active`, `packed`, `inventoryPosted`, `paymentFollowup`, `labelsPrinted`) reached AG Grid columns with no formatter; the grid's default fallback stringified them — rendering the literal text `false` in cells.

**Fix:** `formatBool()` + `boolCol()` column factory (`src/client/utils/format.ts`), applied to every boolean column; plus defense-in-depth in the grid-wide default formatter so a raw boolean can never reach a cell as text again, in any view, present or future. Absent values render `—`, distinct from an explicit No. Covered by unit tests asserting the literal strings `"true"`/`"false"` are unreachable.

## 6. "Locale handling is broken; non-US devices get a mix of another language and English"

**Root cause:** 44 call sites across 32 files formatted dates/numbers with the *device* locale (`toLocaleDateString()` with no argument, `toLocaleString(undefined, …)`) — including the canonical `formatTs()` utility itself. On a non-US device the UI rendered foreign-locale month names, `DD.MM.YYYY` orders, and decimal commas mixed into English chrome, with layout-breaking string widths.

**Fix:** a single pinned `APP_LOCALE = 'en-US'` in `utils/format.ts`; all 44 sites repointed; new `formatDate` / `formatDateTime` / `formatNumber` / `dateCol` helpers; ISO timestamp strings in grids now render through the pinned formatter instead of as raw machine strings. **An ESLint rule now fails the build on any bare `toLocale*()` call**, so the class of bug is structurally extinct, not just currently fixed.

## 7. "Some fields lack IDs, data appears stuck, layout poorly constructed"

Data-stuck → §3/§4. Layout → §1/§8. Field IDs:

**Root cause:** 70 form controls had no accessible name or id at all (a further 112 were implicitly labeled by `<label>` wrappers — accessible, but not automation-addressable).

**Fix:** all 70 now carry semantic `aria-label`s; a new audit (`pnpm audit:form-ids`, wired into `audit:self`) scans every JSX form control and **fails the build if any control lacks an accessible name** — ratcheted to zero, so the finding cannot regress. New form work flows through the `FormDialog`/`FormField` templates, which generate ids and label associations by construction.

## 8. "Usability is weak; needs redesign and responsive design for a future mobile move"

Two weeks of UX unification preceded this response (see `docs/design-system/decisions-log.md`, 2026-06-11/12 entries): all dialogs/drawers consolidated onto four canonical templates (`FormDialog`, `InspectorDrawer`, `StatusActionBar`, `FilterPresetStrip`), status-driven action bars replacing always-on button strips across nine views, and a density pass on the Sales workspace. On responsiveness specifically:
- the navigation rail auto-collapses below 1024px;
- a tablet-width stylesheet pass (wrapping toolbars, stacked definition lists, tightened chrome);
- a dedicated **mobile shell already exists** at `/mobile` (dashboard, inventory, catalog, payments, contacts) — the foundation for the mobile move the review anticipates;
- grids no longer compress (§1), which was the single largest usability defect on small windows.

## 9. "Node cannot handle such a high volume of requests and large datasets — migrate the backend to Django and assemble microservices"

We considered this seriously and disagree, on engineering grounds:

**The observed problems were not runtime problems.** Every defect in this review traces to specific, now-fixed application bugs: a cache-invalidation gap (§3), workers that were never scheduled (§4), a layout call (§1), missing formatters (§5/§6). None of them implicate the runtime's throughput. Migrating frameworks would have carried every one of these bugs across unchanged — they are logic, not language.

**On throughput specifically:** this workload is I/O-bound CRUD over Postgres — the case Node's event-loop model is strongest at. Python's GIL-constrained, synchronous-by-default execution (Django) is not a concurrency upgrade over Node; in published TechEmpower rounds and in industry practice, Node/Express sustains the same or higher request throughput than Django/gunicorn for database-backed JSON APIs. The system's actual scale (single-tenant wholesale operation, tens of operators, ~10⁵–10⁶ rows in hot tables) is several orders of magnitude below where either runtime becomes the bottleneck; Postgres query shape and indexing dominate, and those are runtime-independent.

**What a rewrite would cost:** the backend is ~1,900 tests deep, with an idempotent command bus, a journaled audit trail, a credit engine with shadow-mode semantics, and end-to-end TypeScript type safety from SQL projection to grid cell via tRPC — a class of correctness guarantee a Python/TS split forfeits. A Django migration discards all of it to fix none of the reported defects.

**On microservices:** decomposing a single-team, single-database business system into microservices adds network failure modes, distributed-transaction complexity, and operational surface with no current scaling pressure to justify it. The monolith is deliberately modular (routers / services / projections) and can be split later if a genuine boundary emerges.

**What we hardened instead (the legitimate kernel of the concern):**
- background work is now in-process with advisory-lock coordination and health-exposed heartbeats (§4) — the "services becoming inactive" failure mode is structurally addressed and observable;
- `/api/health` now reports database, journal, websocket, *and worker* liveness; the platform health check (15s period, 8-failure threshold) restarts the container on sustained failure, and `docker-compose.prod.yml` runs `restart: unless-stopped`;
- graceful shutdown stops workers, closes the HTTP server, and drains the pg pool;
- the connection pool is sized against the managed Postgres ceiling with documented rationale (`src/server/db.ts`);
- the documented horizontal-scaling path: stateless web tier (sessions already in Postgres via `connect-pg-simple`), raise `instance_count` (advisory locks already make workers multi-instance-safe), add the socket.io Postgres adapter for cross-instance events, then PgBouncer and read replicas as load actually materializes.

## 10. "Server architecture should avoid containers going down or services inactive"

Addressed concretely rather than abstractly: §4 (workers exist, are observable, and are restart-safe), §9 (health checks, restart policies, graceful shutdown, scaling path). "Inactive services" was the missing-scheduler defect; it is now impossible for the queue to sit silently — the health endpoint reports drain recency and queue depth, and warns loudly when either degrades.

---

## Verification

| Gate | Result |
|---|---|
| `pnpm typecheck` | clean |
| `pnpm vitest run` (client + server unit/behavior) | green (see AGENT_HANDOFF for counts) |
| `pnpm build` (tsc + vite + tsup) | green |
| `pnpm audit:form-ids` | PASS, ratchet = 0 naked controls |
| ESLint locale guard | active (`no-restricted-syntax` on bare `toLocale*`) |

Every fix above cites its file; every behavioral claim is covered by a unit test added in this pass or by the pre-existing suite.
