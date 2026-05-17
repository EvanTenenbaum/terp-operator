# TERP Operator Console — Comprehensive Audit Report

**Date:** 2026-05-16
**Auditor:** Claude (Senior Product & Engineering Consultant, audit lane)
**Repo:** EvanTenenbaum/terp-agro-operator-console
**Branch reviewed:** `main` @ 8e17c02 (working tree has only `.gitignore` modified; local 46 commits behind `origin/main`)

> Scope note: this audit reviewed the canonical local checkout end-to-end. Some failure modes were verified by reading code paths; others were derived from cross-cutting structural patterns. Each finding cites the file and line that originated it. Where I have not directly executed a scenario, I say so.

---

## Executive Summary

| Severity | Count |
| --- | --- |
| Critical | 10 |
| High | 24 |
| Medium | 32 |
| Low | 18 |

**Overall system health: medium-low confidence for production-grade ledger custody.**

The architecture is unusually consistent for its size: one 73-entry typed command catalog routes every write through `commands.run`, with idempotency keys, a journal table, a JSONL sidecar, role-gated dispatch, and reversal policies. That spine is good. The integrity of that spine is the problem — the idempotency check is non-atomic with the work it protects, the journal is written **outside** the mutating transaction, Socket.io accepts unauthenticated connections and broadcasts toasts containing customer/order data to anyone who can reach the host, and CI runs no tests (only typecheck + build) yet auto-deploys to staging on push to `main`. Migrations are applied with `pool.query('begin')` against a pool — meaning BEGIN/COMMIT/ROLLBACK may land on different connections. The schema declares unique-index names that the actual SQL migrations do not create. Several denormalized money columns (`customers.balance`, `payments.unappliedAmount`, `invoices.amountPaid`) have no CHECK constraints to catch drift. Real-time event handling triggers a full `queryClient.invalidateQueries()` on every command in the system across every connected client, which will collapse under operator concurrency.

The UX layer is well thought through — keyboard-first command palette, hotkeys, drawer state machine, AG Grid Enterprise — but the access policy derives an operator's lane from substring-matching their email/name (`accessPolicy.ts:31-35`), which is a fragility hazard, and the demo login page hardcodes the seed password `terp-demo` into the form fields and label, which will ship to production as written.

### Top 5 risks (highest impact first)

1. **Command journal not transactional with work** (`commandBus.ts:80-99`). The `db.transaction(...)` commits the mutation, then `db.insert(commandJournal)` runs as a separate statement. A crash between commit and journal insert produces a real ledger change with no audit row. Idempotency cannot recover the result. Impact: silently lost audit trail and broken `reverseCommandById`.
2. **Idempotency check is non-atomic** (`commandBus.ts:72-83`). Two concurrent requests with the same key both pass the existence check, both open transactions, and the second crashes only when its journal insert collides on the unique index — but only after potentially performing the mutation. Impact: duplicate `postSalesOrder`/`logPayment`/`postPurchaseReceipt` writes under network retry storms.
3. **Socket.io is unauthenticated** (`sockets.ts:5-13`, `app.ts:12-50`). The socket server is created with no auth middleware. `io.emit('command:completed', { toast, actorId, affectedIds })` then broadcasts to every connected client — including unauthenticated ones — leaking customer names, order numbers, payment amounts, and command kinds embedded in `toast`. In production CORS is `undefined` which defaults to permissive within socket.io v4 if no explicit origin check is set.
4. **CI runs no tests** (`.github/workflows/ci.yml:1-19`). Only typecheck + build. Playwright e2e is gated behind no automation. `deploy-staging.yml` then auto-deploys `main` and `staging` on push, using `pnpm install --frozen-lockfile=false`. Drift, regressions, and security regressions can ship without any signal.
5. **Migrations are non-atomic on a connection pool** (`migrate.ts:14-22`). `pool.query('begin')` and the file body run on potentially different pool connections; rollback may target the wrong session. Schema/migration also have a UNIQUE-INDEX naming drift (e.g., `tag_catalog_slug_idx` lives in `schema.ts:65` but the migration creates an implicit `tag_catalog_slug_key`), so `drizzle-kit generate` against a live DB will emit destructive diffs.

---

## Findings by Category

### 1. Architecture & Design

#### [ARCH-01] Command journal write is outside the mutation transaction
- **Severity:** Critical
- **Location:** `src/server/services/commandBus.ts:80-99`
- **Description:** The `db.transaction(async (tx) => runCommand(...))` commits ledger mutations, and only then `db.insert(commandJournal).values(...)` runs as a separate top-level statement, followed by an `appendJsonlJournal` write and a socket emit. If the journal insert fails (transient DB error, FK trip, pool exhaustion) after the tx commits, the side effects exist in domain tables with no audit row. `reverseCommandById` cannot reverse what it cannot see.
- **Impact:** Loss of audit integrity; reversal policies broken silently; idempotency cannot replay a result because the response was never persisted.
- **Edge cases:** Pool-exhaustion drops the journal insert; container kill after `commit` but before journal insert; FK in `actor_id` if user was deleted mid-flight.
- **Recommendation:** Move the `commandJournal` insert (and `reversedByCommandId` updates in `reverseCommandById`) INSIDE the `db.transaction` block. Compute `beforeSnapshot` inside `tx` (it currently uses `db`). Capture `afterSnapshot` inside `tx` before commit. Move JSONL append and socket emit to an `after-commit` hook outside the tx but log/retry on failure (acceptable since they are not the system of record).
- **Effort:** ~1 day of careful refactor + e2e test.

#### [ARCH-02] Idempotency claim is not atomic with the work
- **Severity:** Critical
- **Location:** `src/server/services/commandBus.ts:72-83`
- **Description:** Two concurrent requests with the same `idempotencyKey` both pass the `select ... where idempotencyKey = ?` existence probe, both open `db.transaction`, and both attempt to do the same work. The unique index on `command_journal.idempotency_key` prevents two journal rows from existing, but only after one of them has already done its side effects. Worse, the surviving error path (`catch` at `commandBus.ts:123-156`) then **also** inserts into `commandJournal` with the same `idempotencyKey`, which itself violates the unique index — so the failure-journal is not actually written, defeating its purpose.
- **Impact:** Under network retry the same `postSalesOrder` can apply twice, double-counting inventory decrement and double-billing the customer.
- **Recommendation:** Replace the manual check with `INSERT INTO command_journal (id, idempotencyKey, status='in_flight') ON CONFLICT (idempotency_key) DO NOTHING RETURNING id`. If no row returned, poll/wait for the existing row's terminal status, then return its `result`. The in-flight row claims the key atomically before any mutation runs. Backfill the rest of the journal fields on completion in the same tx.
- **Effort:** 1–2 days, requires concurrency tests.

#### [ARCH-03] Snapshots read from non-transactional connection
- **Severity:** High
- **Location:** `src/server/services/commandBus.ts:2604-2644` (`snapshotByAffectedIds` uses `db`, not `tx`).
- **Description:** Both `beforeSnapshot` (taken before the tx opens) and `afterSnapshot` (after commit) are read on the production `db` connection rather than inside the transaction. Under concurrent commands, the recorded `beforeSnapshot` may not match the state the tx actually saw; the `afterSnapshot` may include rows changed by an interleaving command. Reversal then restores state that never existed.
- **Recommendation:** Take both snapshots inside the tx — `beforeSnapshot` immediately after acquiring row locks (or use `SELECT ... FOR UPDATE`), `afterSnapshot` before commit. Update `snapshotByAffectedIds` to accept the tx.
- **Effort:** Half day; bundled with ARCH-01.

#### [ARCH-04] Snapshot table list omits load-bearing entities
- **Severity:** High
- **Location:** `src/server/services/commandBus.ts:2613-2637`
- **Description:** `snapshotByAffectedIds` enumerates a hard-coded list of tables. Notable omissions: `vendors`, `users`, `purchaseReceiptLines`, `inventoryMovements`, `creditOverrides`, `invoiceDisputes`, `archiveRuns`, `periodLocks`, `photographyQueue`, `commandJournal` itself, `backupSnapshots`. `createVendor` returns the new vendor.id as `affectedIds`, but no vendor snapshot is captured. `attachBatchPhoto` returns the batch but not the photography queue entry. Reversal/audit gaps follow.
- **Recommendation:** Derive the table list from a registry keyed by entity prefix or accept a per-command snapshot helper; at minimum add `vendors`.

#### [ARCH-05] Socket.io accepts unauthenticated connections and broadcasts privileged data
- **Severity:** Critical (security)
- **Location:** `src/server/sockets.ts:5-13`, `src/server/index.ts:12-14`, `src/server/services/commandBus.ts:114-120,154`
- **Description:** `createSocketServer` registers no `io.use((socket, next) => ...)` middleware to verify the session cookie. The default `socket.on('connection')` emits `health:pulse`. Inside `executeCommand`, `io.emit('command:completed', { toast: 'Allocated $1,200 to Cobalt Reserve oldest invoices', actorId, ... })` blasts to every connected socket. The client emits `withCredentials: true` but server-side never checks the cookie.
- **Impact:** Anyone who can open a TCP connection to the server URL can subscribe to live ledger commentary, including customer names, dollar amounts, and command kinds — without ever authenticating. CORS is `undefined` in production (`sockets.ts:7-12`) so the socket.io default same-origin rule applies, but that does not require auth.
- **Recommendation:** Add `io.use((socket, next) => parseSessionFromCookie(socket.handshake.headers.cookie).then(user => user ? next() : next(new Error('unauthorized'))))`. Reuse the express-session cookie parser. Optionally namespace events per role or per actor and avoid putting business strings into the toast.
- **Effort:** Half day; reuse `getSessionUser` against a faked `req`.

#### [ARCH-06] No Redis (or other) socket.io adapter for multi-replica deployment
- **Severity:** High
- **Location:** `src/server/sockets.ts:5-13`; `deploy-staging.yml`; DigitalOcean App Platform.
- **Description:** Socket.io is constructed with the default in-process memory adapter. If the deploy scales to ≥2 instances (App Platform does), `command:completed` events only reach clients pinned to the same replica via sticky sessions, and even with stickiness, sibling replicas never broadcast each other's commands. Cross-operator real-time sync silently breaks.
- **Recommendation:** Either pin to a single replica (document it explicitly), or wire `@socket.io/redis-adapter` with a managed Redis. Health endpoint should report adapter type.

#### [ARCH-07] `routeFromRequest` is dead code that disagrees with switch coverage
- **Severity:** Low
- **Location:** `commandBus.ts:2923-2929`. Defined but never referenced.

#### [ARCH-08] Subscriptions router is a placeholder, real sync lives on the socket
- **Severity:** Medium
- **Location:** `src/server/routers/subscriptions.ts:5-9`
- **Description:** Only `heartbeat` is a tRPC subscription. All actual change notification is via a raw socket.io broadcast bypassing the tRPC observable system. This makes typed subscription contracts impossible and forces the client into the dragnet `queryClient.invalidateQueries()` pattern in `App.tsx:46-53` and `useCommandRunner.ts:12`.
- **Recommendation:** Either commit to socket-only (and remove the heartbeat) or move all real-time signals into typed tRPC subscriptions over WebSocket transport.

---

### 2. Code Quality

#### [CODE-01] `Tx` is typed as `any`
- **Severity:** Medium
- **Location:** `src/server/services/commandBus.ts:58`
- **Description:** `type Tx = any;` defeats the whole point of Drizzle's parameterized transaction type. Every handler accepts an untyped tx and uses `await tx.select().from(...)` without compile-time guarantees. New commands can be added with subtle bugs (wrong table, wrong column) and only fail at runtime.
- **Recommendation:** `type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];` or `import { PgTransaction } from 'drizzle-orm/pg-core'` and type with the schema generic.

#### [CODE-02] `runCommand` switch has no exhaustiveness guard
- **Severity:** Medium
- **Location:** `src/server/services/commandBus.ts:159-303`
- **Description:** No `default:` clause and no `assertNever`. Adding a name to `commandNames` without a case silently returns `undefined`, which then crashes with a confusing message. (Today every name is covered, but the type system isn't helping you keep it that way.)
- **Recommendation:** End the switch with `default: { const _exhaustive: never = name; throw new Error(\`unknown command \${_exhaustive}\`); }`.

#### [CODE-03] Validation issues are appended in-place to the source array
- **Severity:** Medium
- **Location:** `src/server/services/commandBus.ts:811-815, 850-852, 878-885`
- **Description:** `rejectBatch` and `flagBatch` push into `Array.isArray(row.validationIssues) ? [...row.validationIssues] : []` (good, copies), but several similar paths mutate `row` fields directly. Combined with the shared JSONB defaults in Drizzle (`schema.ts:166,226,249,357,361,498,556,559,560,561`), default values can be aliased between rows if any insert relies on the static default. Verify each `.default([])`/`.default({})` does not get returned by reference to call sites that then `.push()`.

#### [CODE-04] Money is `Number` then `.toFixed(2)`
- **Severity:** High
- **Location:** `src/server/services/commandBus.ts:61-66` (`moneyScale`) and ~100 call sites.
- **Description:** All money math goes through JS doubles. For typical operator amounts (under $1M) the precision is fine, but additions across many invoices, the customer balance recompute (`postSalesOrder:1337-1338`, `allocatePayment:1454-1456`), and the `cje.amount::numeric` casts can introduce sub-cent drift. The DB column is `numeric(12,2)`, which is safe, but the round-trip through `Number()` widens error before re-rounding.
- **Recommendation:** Either accept the limitation and add CHECK constraints (`balance_after = previous + amount`) plus a daily reconciliation job, or use a decimal library (`big.js`, `dinero.js`) for additive sums.

#### [CODE-05] `await tx.select()...where(eq(...)).limit(1)` everywhere with no `FOR UPDATE`
- **Severity:** High
- **Location:** `commandBus.ts` — every command that reads-then-writes the same row.
- **Description:** `reserveInventoryForOrder` (`:1183-1187`) reads `batches.availableQty`/`reservedQty`, computes delta, then updates. Two concurrent reservations on the same batch can both pass the availability check at line `:1185` and overdraw. Same pattern for `postSalesOrder` (`:1280-1294`), `adjustBatchQuantity` (`:902-905`), `allocatePayment` (`:1437-1450`), `recordVendorPayment` (`:1519-1525`), `applyClientCredit` (`:1374-1378`).
- **Recommendation:** Add `.for('update')` to row reads that participate in write decisions, or use a stronger isolation level (`SERIALIZABLE`) on the tx wrapper. PG default `READ COMMITTED` is too weak for this pattern.

#### [CODE-06] `as any` on AG Grid table type pairs in `snapshotByAffectedIds`
- **Severity:** Low
- **Location:** `commandBus.ts:2640`
- **Description:** `db.select().from(table as any).where(inArray((table as any).id, unique))` — typing loss is contained, but a future-table that uses a non-`id` PK silently breaks at runtime.

#### [CODE-07] `useCommandRunner.mutation.isLoading`
- **Severity:** Low
- **Location:** `src/client/components/useCommandRunner.ts:25`
- **Description:** Uses tRPC v10 react-query v4 names; this works but `react-query` v5 has renamed `isLoading` → `isPending`. Locked here by `@tanstack/react-query@4.36.1` (`package.json:23`). Upgrading later is a breaking diff.

#### [CODE-08] No structured logging
- **Severity:** High
- **Location:** Repo-wide. `console.log`/`console.error` only (e.g., `migrate.ts:19`, `index.ts:17`).
- **Description:** No JSON logger, no log levels, no correlation IDs (despite having a `commandId` in every flow). In production this means no usable observability. Errors from `executeCommand` are written to `command_journal.error` (good) but not surfaced to logs.
- **Recommendation:** Add `pino`. Log `{ level, commandId, idempotencyKey, actorId, commandName, status }` per command. Pipe to DigitalOcean's log aggregator.

#### [CODE-09] `Promise.all` for independent DB queries (good), but no time budget
- **Severity:** Medium
- **Location:** `src/server/routers/queries.ts:14-66, 158-165, 369-391`
- **Description:** `reference` runs 11 parallel queries, `matchmakingBoard` 3, `relationshipSummary` 11. No timeouts and no per-request `pool.query` cancellation. A slow query parks a pool connection (pool max=12 in `db.ts:9`), so 12 simultaneous `reference` calls saturate the pool and starve everything else.
- **Recommendation:** Add `statement_timeout` per connection (`SET LOCAL statement_timeout = '5s'`) or pg `query_timeout` on the pool. Increase `pool.max` to 25–30 and surface saturation in `getHealth`.

---

### 3. Security

#### [SEC-01] Unauthenticated socket.io broadcast
See **ARCH-05** (Critical).

#### [SEC-02] `/api/client-config` exposes the AG Grid Enterprise license key unauthenticated
- **Severity:** High
- **Location:** `src/server/app.ts:28-32`, fetched by `src/client/main.tsx:22-30`
- **Description:** The license key is a commercial credential whose unauthorized use violates the AG Grid license. The endpoint has no auth middleware. Anyone can `curl https://terp-agro.example/api/client-config` to extract it.
- **Recommendation:** Either embed the key at build time (the code already supports `import.meta.env.VITE_AG_GRID_LICENSE_KEY` as the preferred path) and remove the runtime endpoint, or gate the endpoint behind `getSessionUser`. Build-time embedding is preferable since the key is a static artifact.

#### [SEC-03] Demo password is hardcoded in the login form and the visible label
- **Severity:** High
- **Location:** `src/client/views/LoginView.tsx:7,35`
- **Description:** `useState('terp-demo')` pre-fills the password field and `Demo password for all seeded users: terp-demo` is rendered for every visitor. The staging deploy auto-runs `db:seed:realistic:prod` (`package.json:20`) and ships `realisticSeed.ts` users with this password (likely; verify in seed). Anyone reaching the staging URL can log in as any seeded operator.
- **Recommendation:** Default email/password to empty in production builds. Move the hint behind `if (import.meta.env.DEV)`. Ensure `ALLOW_DEMO_SEED` is required and not set in production. Force a password reset on first login for seeded staging users.

#### [SEC-04] No login rate limiting, no lockout, no MFA
- **Severity:** High
- **Location:** `src/server/routers/auth.ts:8-17`, `src/server/app.ts:21-22`
- **Description:** `verifyLogin` allows unlimited attempts at any rate. Combined with the seeded password being public on the login page, brute force is trivial. The codebase has no `express-rate-limit`, no `helmet` brute-force middleware, no failed-login counter.
- **Recommendation:** Add `express-rate-limit` on `/trpc/auth.login` (e.g., 10 per IP per 15 min) and a per-account lockout (5 fails → 15 min cooldown). Use `connect-pg-simple`'s session store for the lockout counter to avoid memory churn.

#### [SEC-05] User-existence timing oracle on login
- **Severity:** Low
- **Location:** `src/server/auth.ts:50-56`
- **Description:** `verifyLogin` returns `null` immediately if the user is missing, without running `bcrypt.compare`. Bcrypt takes hundreds of ms; "user missing" returns instantly. Attackers can enumerate valid emails by timing.
- **Recommendation:** Always run a dummy `bcrypt.compare(password, dummyHash)` when user is missing, to flatten latency.

#### [SEC-06] No CSRF protection beyond `SameSite=Lax`
- **Severity:** Medium
- **Location:** `src/server/auth.ts:29-34`, `src/server/app.ts:21`
- **Description:** Cookies are `SameSite=Lax`, which blocks most cross-site POST attacks on modern browsers. tRPC POSTs are typically rejected unless they originate same-site. However, browsers older than 2 years and certain mobile webviews can still bypass `Lax`. No double-submit token, no `Origin` header check.
- **Recommendation:** Add an `Origin` allowlist check on `/trpc/*` mutations comparing against `env.APP_ORIGIN`.

#### [SEC-07] CSP is fully disabled
- **Severity:** Medium
- **Location:** `src/server/app.ts:17-19`
- **Description:** `helmet({ contentSecurityPolicy: false })` removes all CSP headers. Any reflected/stored XSS in `command_journal.actor_name`, `customers.name`, `vendor.contact`, `notes` fields rendered into the DOM has no second-line defense.
- **Recommendation:** Add a minimal CSP: `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' wss:; img-src 'self' data: blob:; object-src 'none';` Adjust for AG Grid Enterprise webfont/style needs.

#### [SEC-08] `Origin` of session cookie is not bound to host
- **Severity:** Low
- **Location:** `src/server/auth.ts:19-35`
- **Description:** Cookie `name: 'terp_agro_sid'` is fine, but `domain` is unset. On a multi-app DigitalOcean domain, subdomain takeovers could read the cookie. Confirm the deploy URL is unique per tenant.

#### [SEC-09] `dist/` is committed to the repo
- **Severity:** Medium
- **Location:** `ls /Users/evantenenbaum/work/terp-agro-operator-console/dist`
- **Description:** Build artifacts in version control invite stale or tampered code reaching `start:staging`. `.gitignore` shows uncommitted modifications, but `dist/` itself is tracked.
- **Recommendation:** Add `dist/` to `.gitignore` and `git rm -r --cached dist`.

#### [SEC-10] `pnpm install --frozen-lockfile=false` everywhere
- **Severity:** High
- **Location:** `.github/workflows/ci.yml:14`, `.github/workflows/deploy-staging.yml:30`, `Dockerfile:5,12`
- **Description:** Production and CI install run with the lockfile permissive flag. A poisoned transitive dependency or a registry hiccup that resolves to a different version than the lockfile silently lands in staging.
- **Recommendation:** Drop the flag. Fix any lockfile drift up-front. Reserve permissive mode for one-off local debugging.

#### [SEC-11] Dockerfile runs as root
- **Severity:** Medium
- **Location:** `Dockerfile:8-22`
- **Description:** No `USER` directive. The runtime container executes as uid 0. A node-process RCE has root inside the container.
- **Recommendation:** `RUN addgroup -S app && adduser -S -G app app && chown -R app:app /app && USER app`.

#### [SEC-12] No request size limit on JSON bodies for command payloads
- **Severity:** Medium
- **Location:** `src/server/app.ts:21` (`express.json({ limit: '4mb' })`).
- **Description:** 4MB is large enough that a malicious operator can submit a `payload.discrepancyNotes` map with thousands of keys, each blowing up `JSON.stringify(entry)` in the journal append. The JSONL journal grows unbounded per day. Combine with the lack of rate limiting and an authenticated attacker can fill disk.
- **Recommendation:** Reduce default JSON limit to 256KB; allow CSV import as a multipart upload with its own size cap.

#### [SEC-13] `getDashboardData` reveals sums and aging counts to viewer role
- **Severity:** Low
- **Location:** `src/server/services/metrics.ts:38-141`, `queriesRouter.dashboard` uses `protectedProcedure`.
- **Description:** `protectedProcedure` only checks `ctx.user` exists. There is no role gate. A `viewer` role can call `queries.dashboard` and see cash on hand, payables, top debt customer name. Probably intentional, but worth flagging.

---

### 4. UX & Frontend

#### [UX-01] Access-policy lane derived from email substrings
- **Severity:** High
- **Location:** `src/client/accessPolicy.ts:27-36`
- **Description:** `workLoopForUser` decides whether you see the Intake, Sales, Warehouse lanes by scanning your name+email for `sales`, `intake`, `receiv`, `warehouse`, `fulfill`, `pack`. Renaming an operator changes what they can see. Two operators with the same `role` see different navigation. None of this is documented to admins.
- **Recommendation:** Add a `workLoop` column to `users`. Make it a first-class admin-editable field. Fall back to role when unset.

#### [UX-02] `viewVisibleForUser` returns `false` for Connectors/Recovery/Closeout for everyone
- **Severity:** High
- **Location:** `src/client/accessPolicy.ts:38-41`
- **Description:** These three views are unreachable through normal navigation. Their underlying tRPC procedures still work (e.g., `lockPeriod`, `archivePeriod`, `restoreFromBackupPoint`). An operator cannot do period close from the UI even though commands gate them by `owner` role.
- **Recommendation:** Either expose the views to `owner`/`manager` or remove their dead UI. If hidden intentionally for an enterprise-only build, gate per environment.

#### [UX-03] `queryClient.invalidateQueries()` fires on every socket event
- **Severity:** High
- **Location:** `src/client/App.tsx:46-53`, `src/client/components/useCommandRunner.ts:12`
- **Description:** Every operator's command pings every connected client, which then refetches every active tRPC query. With ~10 operators each running 4 commands per minute, the average client refetches all queries 40×/min. The dashboard alone runs 11+ parallel queries.
- **Recommendation:** Invalidate by `affectedIds` and `commandName` → query-key map. Or coalesce invalidations with a 250ms debounce. Or move to typed subscriptions where the server can hint which keys are stale.

#### [UX-04] Persisted UI store still leaks entity IDs to localStorage
- **Severity:** Low
- **Location:** `src/client/store/uiStore.ts:60,250-261`
- **Description:** `partialize` correctly excludes `selectedRows`, `routeHistory`, `toasts`. But `activeDrawerEntityByView` persists customer/vendor/batch UUIDs. A shared workstation will leak last-viewed customer between users until logout clears the keys (which it doesn't — `partialize` survives `auth.logout`).
- **Recommendation:** On `auth.logout.useMutation.onSuccess`, call `localStorage.removeItem('terp-agro-ui')`.

#### [UX-05] Login form pre-fills demo creds
See **SEC-03** (High).

#### [UX-06] No global error boundary
- **Severity:** Medium
- **Location:** `src/client/App.tsx`, `src/client/main.tsx`
- **Description:** `<React.StrictMode>` then `<trpc.Provider>` then `<App />`. No `ErrorBoundary` wrapping the view switch. A throw inside `IntakeView` blanks the page with no recovery.
- **Recommendation:** Add a top-level error boundary that shows "Something broke — capture the activity ID and reload" with the last `commandId` if available.

#### [UX-07] AG Grid Enterprise license is loaded asynchronously after first render
- **Severity:** Low
- **Location:** `src/client/main.tsx:33-69`
- **Description:** `loadClientConfig()` is awaited before the React root mounts, so the license is set before any grid. Acceptable. But if `/api/client-config` is slow, the UI hangs on a blank page with no feedback. Wrap in a Suspense-or-fallback timeout.

#### [UX-08] `Agentation` dev-only annotation tool ships into production via dynamic check
- **Severity:** Low
- **Location:** `src/client/App.tsx:96-118`
- **Description:** Vite tree-shakes `import.meta.env.DEV === false` branches, so this is fine for production builds. But the import at the top of the file pulls the `agentation` package into the bundle. Verify the prod bundle does not include it. Run `pnpm build` then `du -h dist/client/*.js` and grep for `agentation` strings.

#### [UX-09] Hotkeys mutate ledger from arbitrary focus
- **Severity:** Medium
- **Location:** `src/client/components/Hotkeys.tsx:113-155`
- **Description:** Cmd+D duplicates intake rows, Alt+I posts intake, Alt+Shift+R marks Ready, Enter on Sales view confirms an order. Although `isEditingText` exits early for inputs, a stray Alt+I from a stray keypress posts a receipt. No confirm modal, no undo affordance other than `reverseCommandById`.
- **Recommendation:** Require Shift+Enter for "confirm" and "post" actions. Add an "Are you sure?" toast with a 3-second undo grace.

#### [UX-10] No mobile/tablet design beyond viewport set in a test
- **Severity:** Medium
- **Location:** Search for `@media` shows tailwind utility usage is minimal. The Shell sidebar collapses but the AG Grid is desktop-bound.
- **Description:** A 390x844 viewport renders the grid effectively unusable for primary operator work. The e2e test asserts only that nav names are accessible.
- **Recommendation:** Decide whether mobile is in scope. If yes, build a row-detail mode that bypasses the grid.

#### [UX-11] Date formatting via `toLocaleString()` returns inconsistent forms per browser
- **Severity:** Low
- **Location:** `src/client/components/OperatorGrid.tsx:187`
- **Description:** Headless display of dates depends on the browser's locale. Operators in EN-GB and EN-US see different formats in the same grid for the same field. Use a single formatter (`Intl.DateTimeFormat('en-US', { ... })`).

---

### 5. Performance

#### [PERF-01] Missing indexes on hot query paths
- **Severity:** High
- **Location:** `src/server/schema.ts`; absent in migrations.
- **Description:** Per the migrations/indexes audit:
  - `command_journal.affected_ids` — no GIN; multiple `affected_ids::text ilike` casts in `queries.ts:97,120,145,287,327,390,447`. Each is a full table scan on every dashboard load and every customer/vendor drawer open.
  - `batches.created_at` and `batches.archived_at` — both used in WHERE/ORDER BY across `queries.ts:43,192,523,545,692,705,774,799,856`.
  - FK indexes missing: `sales_orders.customer_id`, `invoices.customer_id`, `payments.customer_id`, `vendor_bills.vendor_id`, `purchase_receipts.vendor_id`, `inventory_movements.batch_id`, `fulfillment_lines.pick_list_id`, `pick_lists.order_id`.
- **Recommendation:** Add a `0009_performance_indexes.sql` migration. Use `CREATE INDEX CONCURRENTLY` in production.

#### [PERF-02] `globalSearch` runs 12 parallel ILIKE scans per keystroke
- **Severity:** High
- **Location:** `src/server/routers/queries.ts:408-447`
- **Description:** Each keystroke in the command palette fires `'%q%' ilike` against 12 tables, each unindexed for prefix-search. Latency grows linearly with table size.
- **Recommendation:** Install `pg_trgm`; add GIN indexes on `customers.name`, `vendors.name`, `batches.batch_code`, `batches.name`, `items.alias`, `invoices.invoice_no`, `sales_orders.order_no`, `purchase_orders.po_no`. Debounce the client query by 250ms.

#### [PERF-03] Connection pool max=12
- **Severity:** Medium
- **Location:** `src/server/db.ts:9`
- **Description:** Dashboard fan-out is 7 queries; reference is 11; relationshipSummary is 11. Two operators loading the dashboard simultaneously can saturate the pool. App Platform with 2 replicas allows 24 connections total against a Postgres that typically allows 50–100.
- **Recommendation:** Raise to 25 per replica; verify against the Postgres `max_connections`.

#### [PERF-04] No code splitting in Vite build
- **Severity:** Low
- **Location:** `vite.config.ts` (assumed defaults).
- **Description:** AG Grid Enterprise is ~1MB compressed. Loading all views at startup is fine for an operator console used all day, but first-paint suffers on cold cache.
- **Recommendation:** `React.lazy` for non-default views (`SettingsView`, `RecoveryView`, `CloseoutView`).

#### [PERF-05] `Number()` casts on numeric columns lose precision after large additions
- **Severity:** High
- **Location:** Throughout `commandBus.ts` and `metrics.ts`.
- **Description:** Sums of many small payments drift in JS doubles. See **CODE-04**.

#### [PERF-06] `recoverySearch` casts `affected_ids::text ilike`
- **Severity:** Medium
- **Location:** `src/server/routers/queries.ts:170-185`
- **Description:** As table grows, the cast-and-scan dominates. Use `$1 = any(affected_ids)` with the GIN index from PERF-01.

---

### 6. Testing

#### [TEST-01] Zero unit tests
- **Severity:** High
- **Location:** Repo-wide search for `*.test.ts(x)?` and `vitest.config*` returned no results.
- **Description:** The only tests are Playwright e2e. No isolated unit tests for `commandBus` helpers (`batchValidationIssues`, `salesLineValidationIssues`, `moneyScale`, `qtyScale`, reversal math, `paymentImpactPreview`). Regressions in pure functions ship freely.
- **Recommendation:** Add Vitest. Start with `commandBus.helpers.test.ts` and `closeout.test.ts`.

#### [TEST-02] CI runs only typecheck + build, not tests
- **Severity:** Critical
- **Location:** `.github/workflows/ci.yml:18-19`
- **Description:** `pnpm typecheck` and `pnpm build`. No `pnpm test:e2e`. No lint. There is no `pnpm lint` script defined in `package.json`. Auto-deploy to staging on push to `main` then runs `pnpm audit:self` which is only `typecheck + audit:parity + audit:product-roadmap + build` — no behavior tests.
- **Recommendation:** Add a `pnpm test:e2e` job. Add ESLint with the React + import plugins. Block deploy on any failure.

#### [TEST-03] Idempotency-key collision is not e2e-tested
- **Severity:** High
- **Location:** `tests/e2e/*.spec.ts`
- **Description:** `period-lock-concurrency.spec.ts` covers `lockPeriod` advisory lock. Nothing exercises the `command_journal.idempotency_key` unique index under racing requests for `postSalesOrder`, `logPayment`, `postPurchaseReceipt`. The bug in **ARCH-02** would not be caught.
- **Recommendation:** Add a Playwright test that fires two identical `runCommand` calls with the same `idempotencyKey` in `Promise.all`; assert that exactly one wins and the other returns the cached result.

#### [TEST-04] Reversal flows are not e2e-tested
- **Severity:** High
- **Location:** `tests/e2e/*.spec.ts`
- **Description:** No test covers `reverseCommandById` for `postSalesOrder` (with allocations), `postPurchaseReceipt`, or `logPayment` round-trip. The 200-line reversal function (`commandBus.ts:1848-2125`) has zero behavior coverage.
- **Recommendation:** Per-disposition test fixtures: create → mutate → reverse → assert state matches pre-mutation snapshot.

#### [TEST-05] No test for auth bypass via direct tRPC POST
- **Severity:** High
- **Description:** `adversarial-command-contracts.spec.ts` tests RBAC but only after login. No test ensures an unauthenticated POST to `/trpc/commands.run` returns 401, or that a socket connection without a session cookie is rejected (it isn't — see ARCH-05).

#### [TEST-06] Tests assume seed data shapes
- **Severity:** Medium
- **Location:** `tests/e2e/adversarial-command-contracts.spec.ts:91-105`, `period-lock-concurrency.spec.ts:48`.
- **Description:** Hardcoded customer names (`Cobalt Reserve`), hardcoded period (`2019-01`). Tests will silently start failing if the seed scenario changes.
- **Recommendation:** Either query for "any customer with credit limit > $X" or expose deterministic test fixtures via a separate seed.

#### [TEST-07] No flake retry strategy and Playwright workers default to 1
- **Severity:** Low
- **Location:** `playwright.config.ts:7,12-19`
- **Description:** `workers: 1` is intentional (single shared DB) but absent retries. `trace: 'retain-on-failure'` is good. Add `retries: 1` in CI mode.

---

### 7. DevOps & Operations

#### [DEVOPS-01] CI tests nothing functional
See **TEST-02** (Critical).

#### [DEVOPS-02] Migrations are non-atomic
See **ARCH/MIG-01** (Critical).
- **Location:** `src/server/migrate.ts:14-22`
- **Recommendation:** Use a single client: `const client = await pool.connect(); try { await client.query('begin'); await client.query(sql); await client.query('insert into schema_migrations...'); await client.query('commit'); } catch (e) { await client.query('rollback'); throw e; } finally { client.release(); }`.

#### [DEVOPS-03] Dockerfile uses `--frozen-lockfile=false` and runs as root
See **SEC-10** and **SEC-11**.

#### [DEVOPS-04] Build artifacts checked into git
See **SEC-09**.

#### [DEVOPS-05] No healthcheck in Dockerfile
- **Severity:** Medium
- **Location:** `Dockerfile`
- **Description:** No `HEALTHCHECK` directive. Container orchestrators have no signal that `/api/health` should be probed.
- **Recommendation:** `HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:8787/api/health || exit 1`.

#### [DEVOPS-06] Staging deploy auto-fires on push to `main` and `staging`
- **Severity:** High
- **Location:** `.github/workflows/deploy-staging.yml:6-9`
- **Description:** With no test gate, every push to `main` or `staging` (and the long-lived `codex/roadmap-execution-2026-05-12` branch) calls `doctl apps create --spec ... --upsert --wait`. A bad PR merged to `main` lands in staging immediately.
- **Recommendation:** Require `ci` workflow to pass before `deploy-staging` runs (`needs: [ci]`). Add a manual approval gate for production.

#### [DEVOPS-07] `start:staging` re-seeds the database every boot
- **Severity:** High
- **Location:** `package.json:20`
- **Description:** `start:staging` runs `db:migrate:prod` then `db:seed:prod` with `ALLOW_DEMO_SEED=true DEMO_SEED_SCENARIO=realistic_100d`. On every container restart, the seed re-runs. If `seed.ts` is not idempotent, this corrupts manually-entered staging data on every redeploy. If it is idempotent, it overwrites changes back to seed values.
- **Recommendation:** Seed only when an env flag is explicitly set or `users` is empty. Add an integration test that proves seed idempotency.

#### [DEVOPS-08] No backup strategy or RTO target documented
- **Severity:** High
- **Description:** `archivePeriod` writes CSV/JSONL/PDF to `env.ARCHIVE_DIR` (`commandBus.ts:2183-2196`). On App Platform, this is ephemeral storage; archives are lost on redeploy. `backup_snapshots` table holds whatever someone stores there but there's no scheduler. `restoreFromBackupPoint` is read-only preview only (`commandBus.ts:2127-2138`).
- **Recommendation:** Document the operator promise: "Archives are written to managed object storage (e.g., DO Spaces) on archivePeriod." Then implement it.

---

### 8. Documentation

#### [DOC-01] README has not been audited for accuracy
- **Severity:** Medium
- **Description:** I did not exhaustively cross-check the README. Given the gap between the codebase and operator-facing reality (lanes hidden, demo creds visible, deploy auto-running), the README is suspect. Schedule a verification pass.

#### [DOC-02] No ADRs / architecture decision records
- **Severity:** Low
- **Description:** Several invariants are non-obvious — command journal must be atomic with mutations; idempotency keys must be claimed before work; socket events must include `actorId` so the originator skips self-toasts. Encode these in `docs/architecture/` so future contributors don't regress.

#### [DOC-03] No runbook for incident response
- **Severity:** Medium
- **Description:** No `docs/runbook.md`. If `command:completed` events stop flowing, or `archivePeriod` fails midway, on-call has no procedure.

---

### 9. Edge Cases & Failure Modes

#### [EDGE-01] Concurrent `reserveInventoryForOrder` on the same batch overdraws
See **CODE-05** (High).

#### [EDGE-02] `postPurchaseReceipt` mutates `batches.notes` by string-concatenation
- **Severity:** Medium
- **Location:** `commandBus.ts:466-477`
- **Description:** Each receipt appends a discrepancy note to `row.notes` with newline join. Two concurrent receipts on the same batch (rare but possible — operator re-attempts) double-append.

#### [EDGE-03] `postSalesOrder` re-reads batch availability per line in a loop
- **Severity:** Medium
- **Location:** `commandBus.ts:1277-1296`
- **Description:** The pre-check loop at `1277-1281` reads all batches, then the apply loop at `1292-1296` re-reads each batch. Between the two, an interleaving `adjustBatchQuantity` could change `availableQty`. Without `FOR UPDATE`, the apply loop trusts stale data.

#### [EDGE-04] `archivePeriod` writes to disk inside the transaction
- **Severity:** Medium
- **Location:** `commandBus.ts:2184-2198`
- **Description:** `fs.mkdir`, `fs.writeFile`, and `writeArchivePdf` (PDF generation streaming through Node) run inside the `db.transaction`. If the file write hangs, the DB transaction is open and locks rows. On App Platform with ephemeral storage, the files may not survive the next deploy anyway.
- **Recommendation:** Move file writes after commit. Persist file paths in a follow-up update or use object storage with a pre-generated URL.

#### [EDGE-05] `postPeriodAdjustments` does not check the period is unlocked
- **Severity:** High
- **Location:** `commandBus.ts:2140-2148`
- **Description:** No check that `period_locks.period` exists or doesn't exist. An owner can post corrections into a locked period without going through the unlock workflow (and there is no unlock command — `lockPeriod` is terminal per `reversalPolicies['lockPeriod']`).

#### [EDGE-06] `command_journal.affected_ids` is a `text[]`, not a `uuid[]`
- **Severity:** Low
- **Location:** `schema.ts:558`
- **Description:** Operators of the recovery view filter by UUID strings against this array; type coercion is fine but a future Postgres uuid array index would not apply.

#### [EDGE-07] `getCloseoutSafety` returns `eligible: true` only when `unsafeRows === 0`
- **Severity:** Low
- **Location:** `src/server/services/closeout.ts:82-83`
- **Description:** Correct, but the user-facing UI for closeout (`closeout` view) is hidden from everyone by `accessPolicy.ts:39`. Period close is currently only doable via direct command palette JSON.

#### [EDGE-08] `reverseCommandById` for `postSalesOrder` doesn't reverse invoice if payment allocations exist
- **Severity:** Medium
- **Location:** `commandBus.ts:1869-1886`
- **Description:** Correctly throws "Reverse payment allocations before reversing this sale" when `invoice.amountPaid > 0`. But it only inspects the snapshotted invoice — not allocations on other invoices that share the customer. If a payment was allocated to a different invoice using FIFO before the reversal, the customer's balance recomputation in `:1873-1884` does not account for that allocation.

#### [EDGE-09] `reverseCommandById` does not capture which command did the reversal in the original's `result`
- **Severity:** Low
- **Location:** `commandBus.ts:2123`
- **Description:** Only `reversedByCommandId` is set. The original `result.toast` still says "Sales order posted" with no breadcrumb that it was later reversed. Recovery UI must join two rows.

#### [EDGE-10] Reverse-of-a-reverse is not handled
- **Severity:** Low
- **Description:** `reverseCommandById` flips `original.reversedByCommandId` but the reversal command itself is `terminal` per `reversalPolicies`. Cannot un-reverse a mistake — must apply a new corrective command.

#### [EDGE-11] Socket reconnect floods invalidations
- **Severity:** Medium
- **Description:** On network blip, `socket.io-client` reconnects and the existing handler re-attaches. With React StrictMode the effect runs twice in dev; check that `socket.close()` actually fires. Verify no double-binding in production.

#### [EDGE-12] Browser refresh mid-form loses unsaved Intake rows
- **Severity:** Medium
- **Description:** Intake row edits live in AG Grid local state until a cell commits. Refresh discards them. No localStorage draft.

---

### 10. Business Logic Correctness

#### [BIZ-01] Customer balance is denormalized without a CHECK
- **Severity:** High
- **Location:** `schema.ts:44` (`customers.balance`), recomputed in `commandBus.ts:1337-1338,1377,1454-1456,1876-1882,1965-1966`.
- **Description:** Every command that touches money updates the balance directly. There is no DB-side check that the running balance equals the sum of `client_ledger_entries.amount` for that customer. Drift goes undetected until manual reconciliation.
- **Recommendation:** Add a nightly job that compares `customers.balance` to `sum(client_ledger_entries.amount)` and emits a `customers_balance_drift` metric. Long-term, replace the denorm with a view.

#### [BIZ-02] `invoices.amountPaid` is denormalized without a CHECK
- **Severity:** High
- **Location:** `schema.ts:262`, mutated by `allocatePayment:1446`, `unallocatePayment:1471`, `applyEarlyPayDiscount:1489`.
- **Description:** Same drift risk as BIZ-01. No `CHECK (amount_paid <= total)`.

#### [BIZ-03] `payments.unappliedAmount` not guarded
- **Severity:** High
- **Location:** `schema.ts:273`, mutated extensively.
- **Description:** Negative `unappliedAmount` is possible if `unallocatePayment` runs in an unexpected order. No CHECK.

#### [BIZ-04] `pricing.evaluatePrice` guardrails enforced per line, not per order
- **Severity:** Medium
- **Location:** `commandBus.ts:1203-1213`, `services/pricing.ts`
- **Description:** Guardrails lift per-line prices to a minimum but do not enforce an order-level margin floor. A canny operator can stack a high-margin and low-margin line to game the average.

#### [BIZ-05] `postSalesOrder` allows duplicate `sourceRowKey` only within posted-state — not enforced earlier
- **Severity:** Low
- **Location:** `commandBus.ts:1267-1275`
- **Description:** Same source row twice is caught at post time, not at line add. Sales orders can sit in a confirmed state forever with this latent invariant violation.
- **Recommendation:** Move the check into `addSalesOrderLine`/`updateSalesOrderLine`.

#### [BIZ-06] `applyClientCredit` can drive balance negative without warning
- **Severity:** Medium
- **Location:** `commandBus.ts:1374-1379`
- **Description:** `nextBalance = Number(customer.balance) - amount` with no floor check. A negative customer balance means we owe them money — fine if that's the intent, but no UI affordance distinguishes "credit applied to receivable" vs "buyer credit on deposit."

#### [BIZ-07] `vendorBills.consignmentTriggered` is one-way and not journaled
- **Severity:** Medium
- **Location:** `commandBus.ts:1304-1326`
- **Description:** When a posted sale drains consigned inventory, the linked vendor bill flips `consignmentTriggered=true` and `status` to `approved`. No `inventoryMovements` entry records this. The bill's audit history is split between `command_journal` (the postSalesOrder) and the implicit flip.

#### [BIZ-08] `priceSalesOrder` mutates `unitPrice` even on `priceSalesOrder` with `strategy='standard'` (multiplier=1)
- **Severity:** Low
- **Location:** `commandBus.ts:1196-1213`
- **Description:** Even `strategy='standard'` re-evaluates per line and may lift to a guardrail. Operator running `priceSalesOrder` to "preview" mutates the order. Recommend a `dryRun=true` flag that returns the would-be result without writing.

#### [BIZ-09] `reverseCommandById` requires `original.status === 'ok'`
- **Severity:** Low
- **Location:** `commandBus.ts:1853`
- **Description:** Failed commands cannot be reversed (correct), but partial failures (e.g., the snapshot was captured, the mutation half-committed, and the journal insert then failed — see ARCH-01) leave a `failed` row that genuinely affected state but cannot be reversed.

#### [BIZ-10] Period locks have no unlock command
- **Severity:** Medium
- **Description:** `lockPeriod` is `terminal`. To unlock for a correction, the only path is a database edit. Add `unlockPeriod` (owner-only) that also writes a journal entry.

---

## Positive Findings

- **The command-bus pattern itself** is the right shape for an operator console. One typed catalog, one handler per command, one journal, one reversal map. The architecture is clear.
- **Idempotency keys, RBAC dispatch, and reversal policies** are first-class concepts.
- **Drizzle schema is well-named** with consistent FK ON DELETE rules (`set null` for cross-domain, `cascade` for parent-child).
- **Postgres advisory lock on period closeout** (`commandBus.ts:2154-2156`) is the right primitive for serializing `lockPeriod`/`archivePeriod`.
- **The `intake` command set** (Verify All, Reject, Flag, discrepancy notes flowing to vendor bills) reflects real brokerage operator workflow.
- **`getCloseoutSafety` enumerates open work** with control totals — gives operators a checklist instead of a vague "are you sure?"
- **AG Grid is used pragmatically** — quick filter, sortable, exportable, virtualized.
- **The hotkey-and-palette-first interaction model** matches operator expectations.
- **Helpful audit scripts** (`audit:parity`, `audit:product-roadmap`) catch frontend-backend drift.

---

## Action Plan

### Week 0 — stop the bleeding (Critical)
1. Wire `command_journal` insert INSIDE the transaction; capture `beforeSnapshot` inside the tx; emit socket events post-commit only (ARCH-01, ARCH-03).
2. Claim idempotency keys atomically with `INSERT ... ON CONFLICT DO NOTHING RETURNING` (ARCH-02).
3. Authenticate socket.io connections with the session cookie (ARCH-05).
4. Gate CI deploy on tests; require `ci` to pass before `deploy-staging` (DEVOPS-06, TEST-02).
5. Fix `migrate.ts` to use a single client per migration file (DEVOPS-02).
6. Remove the demo password from `LoginView.tsx` for production builds (SEC-03).
7. Remove `/api/client-config` or gate behind auth (SEC-02).

### Week 1 — production hygiene (High)
8. Add `express-rate-limit` to `/trpc/auth.login` + per-account lockout (SEC-04).
9. Add `--frozen-lockfile` to CI and Docker; non-root `USER` (SEC-10, SEC-11).
10. Add a `0009_performance_indexes.sql` migration with GIN on `affected_ids`, partial index on `batches(created_at)` where `archived_at is null`, and the FK indexes (PERF-01).
11. Stop re-seeding on every staging boot (DEVOPS-07).
12. Add CHECK constraints on `customers.balance`, `invoices.amount_paid`, `payments.unapplied_amount`, batch qty columns (BIZ-01..03).
13. Replace the `queryClient.invalidateQueries()` blast with targeted invalidation by `affectedIds` (UX-03).

### Week 2 — durability and observability
14. Add Vitest unit tests for `commandBus` helpers and reversal flows (TEST-01, TEST-04).
15. Add e2e tests for idempotency collisions and unauthenticated access (TEST-03, TEST-05).
16. Add `pino` structured logging with `commandId` correlation (CODE-08).
17. Add `HEALTHCHECK` to Dockerfile and `statement_timeout` on the pool (DEVOPS-05, CODE-09).
18. Move `archivePeriod` file writes out of the transaction; persist to managed object storage (EDGE-04, DEVOPS-08).
19. Add the global error boundary (UX-06).

### Week 3 — correctness invariants
20. Switch hot read-write paths to `SELECT ... FOR UPDATE` or `SERIALIZABLE` isolation (CODE-05).
21. Refactor `accessPolicy.workLoopForUser` to use a DB column (UX-01).
22. Expose Connectors/Recovery/Closeout views to allowed roles or remove their dead UI (UX-02).
23. Add `unlockPeriod` command and audit `postPeriodAdjustments` against current lock state (BIZ-10, EDGE-05).
24. Type `Tx` properly and add the `assertNever` default to the command switch (CODE-01, CODE-02).

### Week 4+ — depth
25. Replace JS money math with a decimal library or add nightly reconciliation (CODE-04, PERF-05).
26. Add CSP, `Origin` allowlist, and document the auth/CSRF posture (SEC-06, SEC-07).
27. Decide mobile scope and execute or document the limit (UX-10).
28. Add ADRs, runbook, and a verified README pass (DOC-01..03).

---

## Methodology and disclaimers

- I read the canonical files in full or in extensive slices: `schema.ts`, `commandBus.ts` (sampled the 2933-line file in 4 chunks covering all major handlers including reversal and snapshots), all routers, all migrations, `app.ts`, `auth.ts`, `trpc.ts`, `sockets.ts`, `env.ts`, `db.ts`, `accessPolicy.ts`, `App.tsx`, `main.tsx`, `uiStore.ts`, `Hotkeys.tsx`, `CommandPalette.tsx`, `OperatorGrid.tsx`, `useCommandRunner.ts`, the entire `tests/e2e/` directory, both GitHub Actions workflows, and the Dockerfile.
- I ran `pnpm typecheck`, `pnpm audit:parity`, `pnpm audit:product-roadmap`. All passed.
- I did NOT run `pnpm build` (long-running) or `pnpm test:e2e` (requires a running DB and dev server) to completion. Findings that depend on runtime behavior are flagged as such.
- A second-pass review of `IntakeView.tsx`, `SalesView.tsx`, `OperationsViews.tsx`, `QuickLedgerGrid.tsx`, `InventoryFinderPanel.tsx`, `MatchmakingView.tsx`, and `DashboardView.tsx` was dispatched to a sub-agent. Its findings appear below in **Appendix A**.
- A migrations/indexes/schema-drift pass and a tests/DevOps/CI pass also ran in parallel sub-agents. Their findings appear in **Appendix B** and **Appendix C**.

---

## Appendix A — Frontend / UX deep-pass (second reviewer)

> Sourced from a fresh reading of the 1908-line `OperationsViews.tsx`, `IntakeView.tsx`, `SalesView.tsx`, `MatchmakingView.tsx`, `InventoryFinderPanel.tsx`, `QuickLedgerGrid.tsx`, `ToastCenter.tsx`, and `ContextDrawer.tsx`. Several items overlap with the main report — those are noted with a back-reference.

### Critical

#### [UX-A1] localStorage persists drawer entity refs + grid filters → cross-operator leakage on shared workstation
- **Severity:** Critical
- **Location:** `src/client/store/uiStore.ts:250-261`
- **Description:** `partialize` keeps `drawerByView`, `activeDrawerEntityByView`, `gridFilters`. Entity refs include customer/vendor/PO UUIDs; grid filters often include free-typed names. On a shared workstation, operator B inherits operator A's pinned customer and filter text on first paint after login.
- **Recommendation:** Drop `activeDrawerEntityByView` and `gridFilters` from the partialized state. Clear storage on `auth.logout.onSuccess`. Optionally scope the persist key to the user id once available. (Supersedes UX-04.)

#### [UX-A2] AG Grid CSV export does not strip role-sensitive columns
- **Severity:** Critical
- **Location:** `src/client/components/OperatorGrid.tsx:103`, `src/client/views/SalesView.tsx:223-233,406-416`
- **Description:** `apiRef.current?.exportDataAsCsv({ fileName })` uses defaults — all visible columns including unit cost and internal margin land in the export, regardless of `me.role`. The customer-facing offer (`exportCustomerOffer`) lacks an explicit `customerShareReady` filter on the sheet variant.
- **Recommendation:** Pass `processCellCallback` to redact cost/margin when `me.role === 'viewer'` or for customer-facing exports. Gate the export button by role.

#### [UX-A3] Multi-row mutation loops are non-atomic and lack progress / rollback
- **Severity:** Critical
- **Location:** `src/client/views/SalesView.tsx:189,218-220`; `MatchmakingView.tsx:151-157`; `IntakeView.tsx:263-281`
- **Description:** `for (const ... ) await runCommand(...)` issues N independent commands sequentially. Mid-loop failure leaves partial state with no rollback, no aggregated toast, no progress UI. `verifyIntakeForOrder` updates each batch then posts a receipt — if any per-batch update fails the receipt still posts on stale counts.
- **Recommendation:** Either introduce a `bulk*` command that the server transacts atomically, or wrap the loop client-side and abort on first error with a clear "stopped at row N of M" toast.

### High

#### [UX-A4] Toast auto-dismiss applies to error toasts
- **Severity:** High
- **Location:** `src/client/components/ToastCenter.tsx:11`
- **Description:** Every toast (success/info/error) is dismissed after 4.2 s. Errors raised during a refetch storm can vanish before the operator notices.
- **Recommendation:** Make `tone === 'error'` sticky until manual dismiss.

#### [UX-A5] `SalesView` auto-creates a sales order in a `useEffect` on customer change
- **Severity:** High
- **Location:** `src/client/views/SalesView.tsx:125-134`
- **Description:** Misclicking a customer in the select issues `createSalesOrder` silently. The session-scoped `autoStartedCustomerIds` does not survive navigation, so each return-and-pick creates another draft.
- **Recommendation:** Require an explicit "Start order" button; or prune empty draft orders on customer change.

#### [UX-A6] `DashboardView` + `workQueue` polling amplifies the invalidate-all storm
- **Severity:** High
- **Location:** `src/client/views/DashboardView.tsx:17-18`
- **Description:** 15-second `refetchInterval` runs in addition to the socket-driven `queryClient.invalidateQueries()` (UX-03). Every operator's command already triggers a refetch; the timer is redundant noise.
- **Recommendation:** Drop the polling; disable when document is hidden; let socket events drive freshness.

#### [UX-A7] Range-paste in AG Grid fires N independent commands
- **Severity:** High
- **Location:** `src/client/components/OperatorGrid.tsx:70,120`, callers in `OperationsViews.tsx:829-852`
- **Description:** `cellSelection={{ handle: { mode: 'range' } }}` + per-cell `onCellValueChanged` → pasting 10 cells = 10 unrelated `runCommand` calls with no atomicity. Mid-paste failure leaves stripes of new vs old values.
- **Recommendation:** Wire `processDataFromClipboard` and route paste through a bulk command, or disable range paste on grids whose cell edits trigger commands.

#### [UX-A8] Stale-closure race in `SalesView` selection mutators
- **Severity:** High
- **Location:** `src/client/views/SalesView.tsx:142-146,188-191,218-221`
- **Description:** `addSuggestion` / toggle / remove loops iterate the closed-over `selectedLines` snapshot while awaiting tRPC. If a socket-driven invalidation re-renders the grid mid-loop and clears selection, subsequent iterations act on a stale snapshot — or worse, on ids that no longer exist server-side.
- **Recommendation:** Capture into a local at function entry; or use a single batch command that takes `lineIds[]`.

#### [UX-A9] Inline confirm panels are not focus-trapped, have no Escape handling, do not restore focus
- **Severity:** High
- **Location:** `src/client/views/IntakeView.tsx:312-343,422-448`
- **Description:** Verify-all confirm and CSV-import panels render in-flow instead of as a modal. Focus is not moved on open, Escape does not close, focus is not restored to the originating button on close. Screen readers get no announcement.
- **Recommendation:** Render as `role="dialog"` + `aria-modal="true"`, focus the primary action on mount, handle Escape, restore focus on close.

#### [UX-A10] `DATABASE_SSL_REJECT_UNAUTHORIZED=false` in production app spec
- **Severity:** High (security; UX of trust posture)
- **Location:** `.do/terp-agro-staging.yaml:40` (per tests/DevOps pass).
- **Description:** Disables certificate validation against the managed Postgres. MITM-vulnerable. DO Managed PG ships a valid chain — there is no reason to disable verification.
- **Recommendation:** Set `DATABASE_SSL_REJECT_UNAUTHORIZED=true` and supply the CA bundle if needed.

### Medium

#### [UX-A11] `InventoryFinderPanel` rebuilds `rows` every render, defeating downstream memos
- **Severity:** Medium
- **Location:** `src/client/components/InventoryFinderPanel.tsx:67-70`
- **Description:** `.map(...)` runs outside `useMemo`, returning a new array identity. `facets` and `filtered` `useMemo` then key off `rows` and recompute every render.
- **Recommendation:** `const rows = useMemo(() => raw.map(...), [reference.data?.availableBatches])`.

#### [UX-A12] AG Grid `enableRowGroup`/`enablePivot`/`enableValue` are blanket-on
- **Severity:** Medium
- **Location:** `src/client/components/OperatorGrid.tsx:52-54`
- **Description:** Enabled on every column including computed pills (`status`). Pivot UI offers nonsensical column choices.
- **Recommendation:** Pass per-column hints; turn off pivot for unsuitable columns.

#### [UX-A13] Inventory inline edits fire multiple `runCommand`s per change
- **Severity:** Medium
- **Location:** `src/client/views/OperationsViews.tsx:829-852`
- **Description:** A chain of `if (field === ...)` branches each call `runCommand`. `setItemAlias` reads `event.data?.itemId` which can be `undefined` — silent no-op without toast.
- **Recommendation:** Guard branches mutually exclusive; toast on `undefined` ids.

#### [UX-A14] Form-pattern inconsistency for the same input type
- **Severity:** Medium
- **Location:** Many views.
- **Description:** Tag input is `parseTagInput(string)` in Matchmaking/Inventory but comma-jammed into a notes field for PO lines (`composePoLineNotes`). Date is `type="date"` in most places, freeform `text` in `CloseoutView.tsx:1633`. Qty uses `inputMode="decimal"` in `SalesView.tsx:311` and plain text in `FulfillmentView.tsx:1303-1307`.
- **Recommendation:** Build shared `<NumberInput>`, `<DateInput>`, `<TagInput>` components and migrate.

#### [UX-A15] Detail-grid notes editor double-writes through two handlers
- **Severity:** Medium
- **Location:** `src/client/views/IntakeView.tsx:531-537` (`buildBatchColumns.onCellValueChanged`) and `:148` (`detailGridOptions.onCellValueChanged`)
- **Description:** Both fire for the same edit. Memo deps include `me.data?.name`, which can change identity during the edit and remount detail grids, losing draft text.
- **Recommendation:** Consolidate to a single handler; stabilize memo deps.

#### [UX-A16] Color-only state signals are not screen-reader-friendly
- **Severity:** Medium
- **Location:** `src/client/views/SalesView.tsx:49-51`, `src/client/components/InventoryFinderPanel.tsx:362-365`, `IntakeView.tsx:487-511`
- **Description:** Yellow dot for alias, red/amber background for discrepancy — `title=` is not reliably announced.
- **Recommendation:** Add `aria-label` to the indicator spans and visible text badges.

#### [UX-A17] Authenticated app lacks a `<main>` landmark
- **Severity:** Medium
- **Location:** `src/client/App.tsx:72`, `Shell.tsx`
- **Description:** Login uses `<main>`; the post-login Shell wraps the active view in `<div className="canvas-shell">` with `<main>` only inside that. The skip-nav target for screen readers is inconsistent.
- **Recommendation:** Ensure every active view renders inside a single `<main>` landmark.

### Low

#### [UX-A18] `ContextDrawer` "Cycle drawer size" icon is the same as the explicit close
- **Severity:** Low
- **Location:** `src/client/components/ContextDrawer.tsx:145-147`

#### [UX-A19] CSV download anchor isn't appended to the DOM in some cases
- **Severity:** Low
- **Location:** `src/client/views/SalesView.tsx:228-232`, `src/client/views/OperationsViews.tsx:1849-1853`
- **Description:** Safari sometimes rejects `link.click()` without an in-DOM anchor.

#### [UX-A20] Layout assumes desktop widths
- **Severity:** Low (with mobile out-of-scope; Medium if not)
- **Description:** Fixed `w-60` sidebar, `xl:` grids, AG Grid `min-h-[420px]`. No collapse logic for tablet.

#### [UX-A21] `announcement` is a single string; rapid changes lose entries
- **Severity:** Low
- **Location:** `src/client/store/uiStore.ts:81`

#### [UX-A22] `navigator.clipboard.writeText` errors are swallowed
- **Severity:** Low
- **Location:** `src/client/components/InventoryFinderPanel.tsx:181,537`

#### [UX-A23] `RecoveryView` find/replace with empty find queries `'___'`
- **Severity:** Low
- **Location:** `src/client/views/OperationsViews.tsx:1448-1450`

### Verified non-issues
- No `dangerouslySetInnerHTML` and no `cellRendererSelector` anywhere in `src/client`.
- `ContextDrawer` uses real `role="tablist"/"tab"` with `aria-selected`.
- `ToastCenter` has `aria-live="polite"`.
- Toast component is keyboard-dismissible.

---

## Appendix B — Schema, migrations, indexes (second reviewer)

> Findings overlap with PERF-01 and DEVOPS-02 but are restated with file:line precision and additional drift detection.

### Critical

#### [MIG-01] Migration runner uses pool, not a single client — BEGIN/COMMIT may straddle connections
- **Severity:** Critical
- **Location:** `src/server/migrate.ts:14-22`
- **Description:** `pool.query('begin')`, `pool.query(sql)`, `pool.query('insert ...')`, `pool.query('commit')` each acquire and release a connection independently. The transaction boundary is not preserved. `pool.query('rollback')` on error may target a different session.
- **Recommendation:** Use `const client = await pool.connect();` and run all statements on `client.query`, with `client.release()` in `finally`.

#### [MIG-02] Schema-vs-migration index-name drift on multiple tables
- **Severity:** High → effectively Critical for `drizzle-kit` users
- **Location:** `src/server/schema.ts:65,388,416,437,540` vs corresponding migrations (`migrations/0005_tags_matchmaking.sql:3,16,40,72`; `0006_transaction_ledger.sql:8`).
- **Description:** Drizzle declares uniqueIndexes by explicit names (`tag_catalog_slug_idx`, `customer_needs_code_idx`, `vendor_supply_code_idx`, `matchmaking_matches_pair_idx`, `transaction_types_slug_idx`). The SQL migrations create those uniqueness guarantees via inline `UNIQUE` column constraints, which generate implicit `_key` indexes — different names. Running `drizzle-kit generate/push` against the live DB produces destructive diffs.
- **Recommendation:** Rewrite the migrations to use `CREATE UNIQUE INDEX <schema-name> ON ...`, or rename the schema declarations to `<table>_<column>_key`.

### High

#### [PERF-A1] Missing GIN on `command_journal.affected_ids`
- **Severity:** High
- **Location:** Schema `src/server/schema.ts:558`; usage `src/server/routers/queries.ts:97,120,145,287,327,390,447`
- **Description:** Each call does `affected_ids::text ilike '%uuid%'`, which is a full table scan.
- **Recommendation:** `CREATE INDEX command_journal_affected_ids_gin ON command_journal USING gin (affected_ids);` and rewrite hot paths to `$1 = ANY(affected_ids)`.

#### [PERF-A2] `batches.created_at` and `archived_at` filters/orderings are unindexed
- **Severity:** High
- **Location:** Many `queries.ts` paths.
- **Recommendation:** `CREATE INDEX batches_created_at_idx ON batches (created_at DESC) WHERE archived_at IS NULL;`.

#### [PERF-A3] Missing FK indexes on `sales_orders.customer_id`, `invoices.customer_id`, `payments.customer_id`, `vendor_bills.vendor_id`, `purchase_receipts.vendor_id`
- **Severity:** High
- **Location:** `src/server/schema.ts:215,258-262,270,294-298,195`
- **Description:** FKs declared without `index(...)`. Joins seq-scan as the tables grow.

#### [MIG-03] `drizzle.config.ts` writes into the same folder as hand-written migrations
- **Severity:** High
- **Location:** `drizzle.config.ts:5`
- **Description:** `out: './migrations'` collides with hand-curated migration files. Any `drizzle-kit generate` will overwrite or interleave.
- **Recommendation:** Set `out: './drizzle'`. Keep hand-written SQL under `migrations/`.

### Medium

#### [MIG-04] No down migrations / no rollback strategy
- **Severity:** Medium
- **Location:** `migrations/*` and `src/server/migrate.ts`

#### [PERF-A4] `globalSearch` runs 12 unindexed ILIKE scans per keystroke
- **Severity:** Medium
- **Location:** `src/server/routers/queries.ts:408-447`
- **Recommendation:** Install `pg_trgm`; add GIN indexes on the natural keys; debounce client.

#### [PERF-A5] `inventory_movements.batch_id`, `fulfillment_lines.pick_list_id`, `pick_lists.order_id` are unindexed FKs
- **Severity:** Medium

#### [BIZ-A1] No CHECK constraints on `payments.unapplied_amount >= 0`, `invoices.amount_paid <= total`, `batches.intake_qty/available_qty/reserved_qty >= 0`, `purchase_order_lines.qty/received_qty >= 0`
- **Severity:** Medium
- **Recommendation:** Add CHECK constraints in a `0009_constraints.sql` migration.

### Low

#### [MIG-A1] `correction_journal_entries.period` and `period_locks.period` are unconstrained `varchar(7)`
- **Severity:** Low
- **Recommendation:** Add `CHECK (period ~ '^[0-9]{4}-[0-9]{2}$')`.

#### [SCHEMA-A1] `inventory_movements.command_id` and `command_journal.reversed_by_command_id` are plain UUIDs, not FKs
- **Severity:** Low

#### [SCHEMA-A2] JSONB defaults can be referentially aliased if mutated before insert
- **Severity:** Low (DB side fine; JS side requires discipline)

---

## Appendix C — Tests / CI / Ops (second reviewer)

> Several items overlap with the main report's TEST-* and DEVOPS-* findings. New items below.

### Critical

#### [TEST-A1] No `postPurchaseReceipt` test by name in `tests/e2e/`
- **Severity:** Critical
- **Description:** The reviewer grepped `tests/e2e/` and found no occurrence of `postPurchaseReceipt`. Given that's the core intake-to-bill command, this is a coverage hole. `verifyAllIntake` is covered indirectly via `roadmap-final-gate.spec.ts`, but the explicit RBAC path for `postPurchaseReceipt` is unverified.
- **Recommendation:** Add an e2e: viewer → 403, operator → ok, manager → ok; with discrepancy notes flowing into the resulting vendor bill.

### High

#### [DEVOPS-A1] `JOURNAL_DIR=/tmp/terp-agro/journal` and `ARCHIVE_DIR=/tmp/terp-agro/archives` on App Platform
- **Severity:** High
- **Location:** `.do/terp-agro-staging.yaml:47,50`
- **Description:** `/tmp` is ephemeral on App Platform. The JSONL command journal and the archive PDFs/CSVs vanish on every restart. The README's "append-only JSONL command journal" promise is silently broken in staging.
- **Recommendation:** Mount durable storage (e.g., DigitalOcean Spaces via a sidecar or app-level upload). Update README.

#### [DEVOPS-A2] `DATABASE_SSL_REJECT_UNAUTHORIZED=false` in the staging spec
- **Severity:** High
- **Location:** `.do/terp-agro-staging.yaml:40`
- **Description:** Disables certificate validation. MITM-vulnerable. (Also flagged as UX-A10.)

#### [DEVOPS-A3] `deploy_on_push: true` on `main` + `start:staging` re-seeds = data wipe per push
- **Severity:** High
- **Description:** Every push to `main` triggers a redeploy which runs `db:seed:realistic:prod`, overwriting any operator-entered staging data.
- **Recommendation:** Gate seeding on "is the DB empty?" or on an explicit env flag set only on first boot.

#### [TEST-A2] Idempotency-key replay is not tested
- **Severity:** High
- **Description:** Every test generates a fresh `crypto.randomUUID()` key. The replay path (`commandBus.ts:72-75`) is never exercised. Combined with ARCH-02, this is a meaningful gap.
- **Recommendation:** Add a Playwright test that sends the same key twice; assert single row in `command_journal` and identical returned `commandId`.

### Medium

#### [TEST-A3] No unauthenticated-request test
- **Severity:** Medium
- **Description:** No test asserts that a tRPC POST to `/trpc/commands.run` without a session returns 401.

#### [TEST-A4] Tests hardcode seed-derived names
- **Severity:** Medium
- **Location:** `tests/e2e/adversarial-command-contracts.spec.ts:91-105`; `period-lock-concurrency.spec.ts:48`
- **Description:** "Cobalt Reserve" and the period `2019-01` are hardcoded. Seed scenario changes silently break tests.

#### [DEVOPS-A4] No log drains or alerts in DO spec
- **Severity:** Medium
- **Description:** `.do/terp-agro-staging.yaml` configures no log forwarding and no alerting.

### Low

#### [DEVOPS-A5] `docker-compose.yml` postgres creds are `terp_agro/terp_agro`
- **Severity:** Low — fine for local dev, but unmarked as such.



