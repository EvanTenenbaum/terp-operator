# TERP Operator — Cross-Cutting Platform Technical Specification

> The technical bible for a new dev team. Ground truth is the **code**, not the docs.
> Everything here is cited to `file:line`. This document covers the platform
> reality *underneath* the customer journeys: the runtime, the command bus /
> event-sourcing core, the data model, real-time transport, validation, the
> frontend shell, out-of-band HTTP routes, build/test/CI, deployment, and the
> background jobs.

Canonical repo: `EvanTenenbaum/terp-operator` (verified via `git remote`). Legacy
identifiers `terp_agro` / `terp-agro` persist in DB names, container names, cookie
names, and volume names — they refer to **this** codebase.

---

## 1. Tech Stack & Languages

Single-language repo: **TypeScript, strict mode**, ESM throughout (`"type": "module"`,
`package.json:5`). One package, server + client + shared in one `src/` tree, built and
deployed as one artifact.

| Concern | Tech | Version | Role / Citation |
|---|---|---|---|
| Language | TypeScript | `5.7.2` | `strict: true`, `target ES2022`, `module ESNext`, `moduleResolution Bundler`, `noEmit` (`tsconfig.json:11,2,9,10,16`). Typecheck via `tsc --noEmit` (`package.json` `typecheck`). |
| UI runtime | React | `18.3.1` | SPA. `react-jsx` transform (`tsconfig.json:15`). |
| Routing | react-router-dom | `7.15.1` | `BrowserRouter` shell (`src/client/App.tsx:2`). |
| API transport | tRPC | `10.45.2` (`@trpc/server`,`/client`,`/react-query`) | Typed RPC; **v10** (not v11). Single mutation surface for writes. `src/server/trpc.ts`, `src/client/api/trpc.ts`. |
| Server data fetching | @tanstack/react-query | `4.36.1` | Paired with tRPC v10 (`src/client/main.tsx:3`). v4 is required by tRPC v10. |
| Serialization | superjson | `2.2.2` | tRPC transformer both ends; preserves `Date`, `Map`, `undefined` (`src/server/trpc.ts:91`, `src/client/api/trpc.ts`). |
| ORM | Drizzle ORM | `0.45.2` | `drizzle-orm/node-postgres` (`src/server/db.ts:1`). Schema = source of truth (`src/server/schema.ts`). |
| Migration tooling | drizzle-kit | `0.31.10` | **Only generates artifacts to `./drizzle/` — NOT applied.** Hand-written SQL in `migrations/` is authoritative (`drizzle.config.ts`, `migrations/README.md`). |
| Database | PostgreSQL | `16` (`docker-compose*.yml`) | `pg` driver `8.13.1`. Pool tuned `max:25`, `statement_timeout:60s` (`src/server/db.ts:23-31`). |
| HTTP server | Express | `4.21.2` | App factory `createApp` (`src/server/app.ts:23`). |
| Sessions | express-session + connect-pg-simple | `1.18.1` / `10.0.0` | Server-side sessions in `session` table (`src/server/auth.ts:18-34`). |
| Password hashing | bcryptjs | `2.4.3` | `bcrypt.compare`/`hash(…, 12)` (`src/server/auth.ts:54`, `src/server/seed.ts`). |
| Security headers | helmet | `8.0.0` | CSP, prod-hardened scriptSrc (`src/server/app.ts:36`). |
| Rate limiting | express-rate-limit | `8.5.2` | HTTP upload/media limiters (`src/server/middleware/httpRateLimiters.ts`); login limiter is hand-rolled (`src/server/rateLimiter.ts`). |
| Real-time | socket.io + socket.io-client | `4.8.1` | Rooms-based broadcast (`src/server/sockets.ts`, `src/client/context/SocketContext.tsx`). |
| Validation | zod | `3.24.1` | Env, command input, per-command payloads, filters (`src/server/env.ts`, `src/shared/schemas.ts`). |
| Money | decimal.js | `10.6.0` | `precision:20, ROUND_HALF_UP` (`src/server/services/commandBus.ts:13`). All running sums go through `Decimal`. |
| Client state | zustand | `5.0.2` | UI store with `immer` + `persist` (`src/client/store/uiStore.ts:1-3`). |
| Data grid | ag-grid (community+enterprise+react) | `32.3.3` | `OperatorGrid` is the universal grid (`src/client/components/OperatorGrid.tsx`). |
| Build | Vite | `6.0.7` | Client bundler + dev server/proxy (`vite.config.ts`). Server bundled with **tsup** `8.3.5`. |
| Unit/component test | Vitest | `4.1.6` (`@vitest/coverage-v8`) | `vitest.config.ts`. node default env; jsdom opt-in. |
| E2E | Playwright | `1.49.1` + `@axe-core/playwright` | `playwright.config.ts`; smoke + chromium projects. |
| PDF | pdfkit | `0.15.2` | Closeout archive PDFs / receipts (`commandBus.ts:5`). |
| Images | sharp | `0.34.5` | HEIC→JPEG + thumbnails (`src/server/services/mediaStorage.ts`). |
| File-type sniff | file-type | `22.0.1` | Magic-byte validation on upload (`mediaValidation.ts`). |
| Uploads | multer | `2.1.1` | Multipart disk storage (`src/server/routes/uploadRoute.ts`). |
| Misc | lru-cache, immer, clsx, lucide-react, dotenv | — | utility deps. |
| Package manager | pnpm | `10.25.0` | pinned in `package.json` + Dockerfile via corepack. |

Runtime: **Node 22** (`Dockerfile`, CI `setup-node@v4 node-version:22`).

---

## 2. Runtime Architecture

### 2.1 Bootstrap order (`src/server/index.ts`)
1. `createApp(() => io)` builds the Express app with a *deferred* io getter (`index.ts:9`) — the app is created before the socket server so routes can lazily resolve `io`.
2. `http.createServer(app)` wraps Express (`index.ts:10`).
3. `createSocketServer(httpServer)` attaches Socket.io to the same HTTP server (`index.ts:11`); the `io` variable is back-filled so the deferred getter resolves.
4. Listen on `env.PORT` (default `8787`) (`index.ts:17`).
5. Graceful shutdown on `SIGTERM`/`SIGINT`: close HTTP, then `pool.end()` (`index.ts:21-28`).

`env` is parsed once at boot through a zod schema (`src/server/env.ts:7-29`) and throws if `NODE_ENV=production` still carries the dev `SESSION_SECRET` or the dev `DATABASE_URL` (`env.ts:32-40`). Test runs (`VITEST`) are exempted from the DB-URL guard.

### 2.2 Express middleware chain (`src/server/app.ts:23-92`)
Order matters:
1. `trust proxy = 1` (behind DO/Caddy) (`app.ts:25`).
2. `helmet({ contentSecurityPolicy })` — `scriptSrc` is `'self'` only in prod, adds `'unsafe-inline'` in dev for Vite HMR (`app.ts:36-52`). `connectSrc` includes `ws:`/`wss:` and the optional Crikket feedback host (`app.ts:13-20,46`).
3. `express.json({ limit: '4mb' })` (`app.ts:54`).
4. `sessionMiddleware` (`app.ts:55`).
5. `registerHttpRoutes(app)` — upload/media/CSV routes mounted BEFORE tRPC (`app.ts:57`, `src/server/routes/index.ts:16-20`).
6. `GET /api/health` → `getHealth()` returns 200/503 (`app.ts:59-62`, `src/server/services/metrics.ts:10-43`). Health checks DB ping, JSONL journal writability, and socket server init.
7. `GET /api/client-config` → ships AG Grid license + feedback config to the SPA at runtime (`app.ts:64-74`).
8. `/trpc` Express adapter; `createContext` injects `{req,res,io,user}` (`app.ts:76-82`).
9. Prod only: static-serve `dist/client` + SPA catch-all `app.get('*')` (`app.ts:84-89`). Dev redirects `/` to the Vite origin.

### 2.3 tRPC context, auth, RBAC
- **Context** (`src/server/trpc.ts:15-30`): `createContext` resolves `user` via `getSessionUser(req)`.
- **Session resolution** (`src/server/auth.ts:36-49`): reads `req.session.userId`, loads the `users` row, returns `null` if missing or `!active`. The `SessionUser` carries `{id,name,email,role,workLoop}`.
- **Sessions** (`auth.ts:18-34`): `connect-pg-simple` store, table `session`, cookie `terp_agro_sid`, `httpOnly`, `sameSite:'lax'`, `secure` in prod, 12h `maxAge`. `createTableIfMissing:false` — the `session` table must already exist via migration.
- **Login** (`src/server/routers/auth.ts:8-44`): `verifyLogin` (bcrypt compare against `passwordHash`), `setLoggedIn` regenerates the session id to prevent fixation (`auth.ts:59-72`), `clearLogin` destroys + clears cookie. Login is **rate-limited per-IP** (15-min lockout) via `src/server/rateLimiter.ts`.
- **Procedures** (`trpc.ts:137-148`): `publicProcedure` (no auth), `protectedProcedure` (throws `UNAUTHORIZED` if `!ctx.user`).
- **RBAC** (`src/server/rbac.ts`): role rank `viewer:0 < operator:1 < manager:2 < owner:3` (`rbac.ts:5-10`). `assertCommandAccess(user, name)` looks up `commandMinRole[name]` and throws `FORBIDDEN` (`rbac.ts:16-24`). This is enforced **inside** `executeCommand` at the bus boundary (`commandBus.ts:481`), not in the router — so direct bus calls cannot bypass it.

### 2.4 Error scrubbing (DB schema-leak defense, `trpc.ts:44-135`)
A heuristic detects Postgres/Drizzle errors (5-char pg `code`, `severity`, `routine`, `DrizzleError` ctor names, or SQL-looking message text via `SQL_LEAK_REGEX`). On match, both the tRPC `errorFormatter` *and* the command-bus catch path replace the message with `"Database error (request id: <uuid>)"`, logging full detail server-side only (`trpc.ts:76-88,92-134`). Production additionally strips stack traces from every error envelope (`trpc.ts:128-131`). This closes the schema-enumeration vector (#24/DYN-H1) on both the throw path and the `CommandResult.toast` return path.

### 2.5 Rate limiting summary
- **Login**: hand-rolled IP limiter, 15-min window (`rateLimiter.ts`).
- **Upload**: 50 successful/15min per user-or-IP (`httpRateLimiters.ts:31-40`).
- **Media serve**: 200 successful/min per user-or-IP (`httpRateLimiters.ts:46-55`).
- Key generator buckets by `req.user.id` when present, else `ipKeyGenerator(req.ip)` for IPv6-safe /64 grouping (`httpRateLimiters.ts:17-24`).

---

## 3. The Command Bus & Event-Sourcing Model — THE CORE

Every state mutation in TERP Operator flows through **one** code path:
`trpc.commands.run` → `executeCommand` → `runCommand` (switch) → per-command handler.
This is a **command-sourced** model with an immutable journal, before/after snapshots,
reversal handlers, and downstream observers. Reads use a separate query router; only
the command bus writes.

Files: `src/server/services/commandBus.ts` (7390 lines), `src/shared/commandCatalog.ts`,
`src/server/routers/commands.ts`, `src/server/rbac.ts`, `src/server/services/journal.ts`.

### 3.1 The Command Catalog (`src/shared/commandCatalog.ts`)
- `commandNames` — a `const` tuple of **~135** command names (`commandCatalog.ts:3-135`). `CommandName = (typeof commandNames)[number]` (`:193`) is the single union that drives the zod enum, the RBAC map, the labels map, the reversal-policy map, and the `runCommand` switch. Adding a command means adding it in all five places (the parity audit enforces a frontend surface too).
- `commandMinRole: Record<CommandName, Role>` (`:336`) — the per-command minimum role consumed by `assertCommandAccess`.
- `commandLabels: Record<CommandName, string>` (`:202`) — human labels for UI/audit.
- `reversalPolicies: Record<CommandName, ReversalPolicy>` (`:470`) where `ReversalPolicy = { disposition: 'reversible'|'offsettable'|'terminal', guidance: string }` (`:195-200`). This is the declared contract for whether a command can be undone:
  - `reversible` — `reverseCommandById` has a handler that restores prior state from snapshot (e.g. `postSalesOrder`, `postPurchaseReceipt`, `receivePurchaseOrder`, `setInventoryStatus`).
  - `offsettable` — cannot be reversed in place; post an equal-and-opposite entry instead (e.g. `adjustBatchQuantity`, `applyClientCredit`).
  - `terminal` — not undoable via the bus (e.g. `createBatch`, `updateBatch`, `cancelSalesOrder`).
- Lifecycle gates: `internalOnlyCommandNames` (no required frontend surface) and `pendingFrontendCommandNames` (backend-ready, UI pending) (`:155-191`) — consumed by `scripts/check-backend-frontend-parity.mjs`.

### 3.2 Command input contract (`src/shared/schemas.ts:20-33`)
`commandInputSchema`:
```
{ name: enum(commandNames),
  idempotencyKey: string min8 max128,   // required on EVERY write
  reason: string trim min3 max500,       // required audit reason (#25)
  payload: record(unknown) default {} }
```
`reason` is mandatory for the immutable journal. `payload` is permissive `record(unknown)`; per-command zod schemas (`commandBus.ts:174-330+`) gate the ~20 highest-traffic commands at the handler boundary, while handler-internal `requiredId/requiredString/requiredNumber` guards enforce semantics for the rest.

### 3.3 `executeCommand` — the orchestration loop (`commandBus.ts:480-814`)
This is the load-bearing function. Sequence:

1. **RBAC** — `assertCommandAccess(user, input.name)` (`:481`).
2. **Journal-payload redaction** — `journalSafePayload` strips sensitive fields (e.g. customer-sheet snapshot PII) from the journal copy (`:482,473-478`).
3. **Generate `commandId`** (`randomUUID`) and compute the **before-snapshot** from the *input payload's* ids (`:484-485`, `snapshotFromPayload` → `collectIds` → `snapshotByAffectedIds`).
4. **ATOMIC IDEMPOTENCY CLAIM** (`:490-508`): `INSERT` a `status:'pending'` row into `command_journal` with `ON CONFLICT (idempotency_key) DO NOTHING RETURNING *`. The returned row *is* the claim. The `command_journal_idempotency_idx` unique index (`schema.ts`) is the concurrency primitive.
5. **LOSER PATH** (`:510-600`) when no row returns (another caller owns the key):
   - Re-`SELECT` the winner row. If it vanished → safe retryable error (`:518-522`).
   - **Mismatch detection**: if `commandName` differs → 409-style error naming both commands (`:527-531`). If the canonicalized payload differs (`canonicalStringify`, key-sorted, circular-ref-guarded, `:413-444`) → "idempotency key reused with different payload" error (`:532-538`).
   - If winner is `pending`:
     - **Orphan sweep**: a pending row older than `5 min` is adopted → flipped to `failed`, caller told to retry with a fresh key (`:549-570`). Prevents permanent key lockout from crashed callers.
     - Otherwise **poll** up to 20×50ms (1s) for the winner to finish, then **replay the cached `result`** (`:576-595`).
   - If winner is `ok`/`failed` → **replay cached `result`** verbatim (`:598-599`). This is the idempotency guarantee: identical key + identical payload returns the original outcome without re-executing.
6. **WINNER PATH** (`:605-762`) — inside a single `db.transaction`:
   - `runCommand(tx, name, payload, user, commandId, reason)` dispatches the handler (`:607`).
   - `snapshotByAffectedIds(tx, result.affectedIds)` builds the **after-snapshot** using the *same tx* so in-transaction writes are visible (`:608`).
   - `UPDATE` (never re-INSERT) the claimed row to `ok`/`failed`, persisting `affectedIds`, `afterSnapshot`, and the (redacted) `result` (`:614-622`). `redactSensitiveDeltaFields` replaces e.g. `mintPhotoUploadToken.delta.token` with `'<redacted>'` so secrets never persist (`:159-171`).
   - Transaction commits.
7. **DOWNSTREAM OBSERVERS** (all best-effort, post-commit, wrapped in try/catch so a failure cannot roll back the committed command):
   - **JSONL audit** — `appendJsonlJournal` appends one redacted line to `storage/journal/<YYYY-MM-DD>.jsonl` (`:632-647`, `journal.ts:5-11`).
   - **Socket broadcast** — `io.to('authenticated').emit('command:completed', { commandId, commandName, actorId, affectedIds })` (`:649-663`). Toast text is *stripped* from the broadcast (may contain customer PII); only the actor sees their toast.
   - **Document-snapshot receipt hooks** — for `finalizePurchaseOrder`/`confirmSalesOrder`/`postSalesOrder`/`logPayment`/`recordVendorPayment`, generate external+internal receipt projections (`:672-727`).
   - **Pick/sales real-time events** — `emitPickOrderAndQueue` / `emitPickEvent` / `emitSalesLineEvent` for pick + sales-line commands (`:729-760`).
8. **FAILURE PATH** (`:763-813`): scrub the error, `UPDATE` the in-flight row to `failed` (preserving raw error server-side in `command_journal.error`), append JSONL, emit `command:failed`, and return `{ ok:false, toast: safeMessage }`. Returning a `CommandResult` (not throwing) is deliberate so the failure replays cleanly under the idempotency key.

### 3.4 `runCommand` dispatch (`commandBus.ts:817-1080+`)
A giant `switch(name)` mapping every `CommandName` to its handler, passing the transaction `tx`. Handlers return `CommandResult` (`src/shared/types.ts:109-117`):
```
{ ok, commandId, affectedIds: string[], toast?, delta?, orderId? }
```
`affectedIds` is the contract that drives both the after-snapshot and client cache invalidation. `orderId` routes pick/sales socket events.

### 3.5 Snapshot model (`commandBus.ts:5832-5877`, `6627-6657`)
- `collectIds(payload)` (`:6627`) harvests UUIDs from a fixed allowlist of payload keys (`id, batchId, orderId, lineId, customerId, vendorId, …`, plus arrays `batchIds/lineIds/selectedIds`) and filters to strict 36-char UUID shape (`:6655`). This is how the **before**-snapshot is computed without knowing what a command will touch.
- `snapshotByAffectedIds(dbLike, ids)` (`:5838`) takes the unique id set and, **in parallel** (`Promise.all`, #310), selects rows matching `id IN (ids)` across a fixed list of ~23 tables (batches, salesOrders, invoices, payments, vendorBills, purchaseOrders, customers, correctionJournalEntries, …, `:5842-5866`). Only non-empty result sets land in the snapshot object, keyed by table name. The same id is looked up in every table — the snapshot is a sparse, polymorphic capture of "everything any of these ids touches."
- Both `before_snapshot` and `after_snapshot` are stored as JSONB on the journal row. They are the substrate for reversal.
- **Known limitation, documented in code**: `snapshotFromPayload` uses the pool connection (`db`), so the *before*-snapshot may not see uncommitted same-tx inserts (GH #150, `:5837` comment). The *after*-snapshot correctly uses `tx`.

### 3.6 Reversal / correction mechanics (`commandBus.ts:4666-5089`)
`reverseCommandById(tx, payload, commandId)`:
1. Loads the original journal row; refuses if not found, already reversed (`reversedByCommandId` set), or `status !== 'ok'` (`:4669-4672`).
2. Reads `original.afterSnapshot` (the post-state to undo) and `original.beforeSnapshot` (the prior values to restore), plus `reversalPolicies[commandName]` (`:4679-4681`).
3. A **per-command `if/else` ladder** performs the inverse mutation from the snapshot. Examples:
   - `postSalesOrder` (`:4683-4728`): restores `batches.availableQty` (adds back sold qty), marks invoices/orders `'reversed'`, decrements `customers.balance` via `subMoney` (Decimal), writes a `client_ledger_entries` row `kind:'sale_reversal'` with negative amount, marks COGS correction entries `'reversed'`, and **refuses** if any invoice already has `amountPaid > 0` ("reverse payment allocations first").
   - `receivePurchaseOrder` / `postPurchaseReceipt` (`:4739-4765`): marks batches/bills/receipts `'reversed'`, zeroes received qty, refuses if a downstream receipt was already posted.
   - `setInventoryStatus`/`transferInventoryLocation`/`transferInventoryOwnership` (`:4772-4790`): restores prior field values from **before**-snapshot and writes an `inventory_movements` reversal row.
   - Credit commands (`setCustomerCreditLimit`, `revertCustomerCreditToEngine`, `snoozeCustomerCreditReminder`) restore prior credit fields from before-snapshot.
4. Tail (`:5079-5087`): stamps `original.reversedByCommandId = commandId` (the self-referential FK from migration 0061), then enqueues credit recompute for every affected customer.
5. Commands without a handler branch hit the `else` and throw using the policy's `disposition`/`guidance` (`:5075-5077`) — `terminal`/`offsettable` commands explain *why* and what to do instead.

`documentCommandFailure` (`:5090`) lets operators attach a terminal reason to a `failed` journal row. `restoreFromBackupPoint` (`:5115`) is **read-only** (preview, no ledger writes). `postPeriodAdjustments` / `createCorrectionJournalEntry` write `correction_journal_entries` for offsetting financial corrections.

### 3.7 Money invariants (`commandBus.ts:9-13, 388-404`)
- `Decimal.set({ precision: 20, rounding: ROUND_HALF_UP })` globally (`:13`).
- `subMoney(a,b)` and `subMoneyMin0(a,b)` (the latter clamps at `0.00`) do all monetary subtraction at 2dp via Decimal (`:388-402`). `moneyScale`/`qtyScale` normalize to 2dp/3dp strings. **No raw float math touches money** — DB columns are `numeric` and JS keeps them as strings through Decimal.

### 3.8 Document snapshots / projections (`src/server/services/documentSnapshots.ts`, `services/projections/`)
Independent of the command journal, finalized business documents (receipts/invoices/confirmations) are projected and persisted to `document_snapshots`:
- Five **kinds** × two **audiences** (`external`, `internal`) (`projections/types.ts:1-9`). Each kind has a projector with `external()`/`internal()` functions and a `projectionVersion` (all currently `1`).
- The persisted JSON is **audience-projected on write** — there is no filter-on-read. Internal-only fields (`cogs`, `margin`, `diagnostics`) exist only in the internal projection; the on-disk witness keys `__EXTERNAL_PROJECTED__`/`__INTERNAL_ONLY__` are stripped before persist and re-applied in memory (`projections/index.ts:8-22`).
- `hashSnapshot` = sha256 over `canonicalizeJson` (recursive key-sort; throws on `undefined`/functions) — content-addressed integrity (`documentSnapshots.ts:9-34`).
- **Finalize concurrency** (`documentSnapshots.ts:36-90` doc block): `finalizeSnapshot` uses ONE `PoolClient` for `BEGIN/COMMIT` and combines `SELECT … FOR UPDATE` on the draft with a `pg_advisory_xact_lock` keyed on `hashtextextended(entityType:entityId:audience)` to serialize even the *first* finalize for a given (entity, audience) where no predecessor row exists. Live-head invariant: at most one finalized-not-voided-not-superseded row per (entity, audience); amendments chain via `supersedes_id`. Validators reject unknown top-level/nested keys (`projections/index.ts`).

---

## 4. Data Layer

### 4.1 Schema conventions (`src/server/schema.ts`, 1278 lines, 63 tables)
Three reusable column helpers define the house style (`schema.ts:22-24`):
```
id()      = uuid('id').primaryKey().defaultRandom()
now()     = timestamp('created_at', {withTimezone:true}).notNull().defaultNow()
updated() = timestamp('updated_at', {withTimezone:true}).notNull().defaultNow()
```
- **IDs**: UUID v4, DB-generated (`defaultRandom`). Not sequential.
- **Audit fields**: most business tables carry `createdAt`/`updatedAt`; many also carry `createdBy/updatedBy/deletedAt/deletedBy` UUID FKs to `users` for soft-delete + provenance (e.g. `brands` `schema.ts:69-72`, `savedFilters` `:117-120`).
- **`sortId`**: nullable `integer('sort_id')` on `batches` (`:260`), backfilled in migration `0023` for stable display ordering independent of `created_at`.
- **`updated_at` triggers**: a Postgres trigger function `update_updated_at_column()` (migration `0021`) is attached `BEFORE UPDATE FOR EACH ROW` to keep `updated_at` fresh at the storage layer regardless of the writing code path. Backfilled for missed tables in `0063`.
- **Enums**: modeled as `varchar(length)` + zod enums at the edge (`src/shared/schemas.ts:5-10`) and the `Status` union (`src/shared/types.ts:3-35`), **not** native PG enums — so adding a status needs no migration.
- **Money**: `numeric(precision:12, scale:2)` for currency, `numeric(12,3)` for quantities (78 numeric columns; `schema.ts:80-81,198-202,…`). Always `.notNull().default('0')` for accumulators. Drizzle returns these as **strings**, consumed by Decimal.
- **JSONB**: 24 columns, typed via `.$type<…>()` (e.g. `pricing_rule`, `validation_issues: string[]`, `command_journal.inputPayload/beforeSnapshot/afterSnapshot/result`, `:83,257,690-697`).
- **FK on-delete policy**: 39 `set null`, 32 `cascade`, 5 `restrict`. The policy is deliberate — financial parents use `RESTRICT` (migration `0059`: `purchase_orders.vendor_id` and `sales_orders.customer_id` flipped `SET NULL → RESTRICT` so deleting an entity can't orphan financial records). Child rows of owned aggregates use `cascade` (e.g. `saved_filters.user_id`). Provenance FKs use `set null`.
- **Self-referential FKs** (declared with `AnyPgColumn` lazy refs): `command_journal.reversed_by_command_id` (`:701`, migration 0061), `document_snapshots.supersedes_id`, `customers.contact_id`/`users.contact_id`/`vendors.contact_id` (contacts system, CAP-033).

### 4.2 The `command_journal` table (`schema.ts:683-708`)
The event store:
```
id uuid pk, command_name varchar(80), idempotency_key varchar(180) UNIQUE,
actor_id uuid→users(set null), actor_name, actor_role,
reason text, input_payload jsonb, status varchar(32),
affected_ids text[], before_snapshot jsonb, after_snapshot jsonb,
result jsonb, error text, reversed_by_command_id uuid→self(set null), created_at
```
Indexes: `command_journal_idempotency_idx` (UNIQUE — the concurrency primitive), `command_journal_command_idx`, `command_journal_actor_idx` (`:704-706`).

### 4.3 Migration strategy (`src/server/migrate.ts`, `migrations/`)
- **Hand-written numbered SQL** is authoritative (`migrations/0001`…`0073`, plus back-numbered `0015b`). drizzle-kit output in `./drizzle/` is informational only (`migrations/README.md`).
- `runMigrations` (`migrate.ts:198-264`): ensures a `schema_migrations(name pk, applied_at)` bookkeeping table, lists `*.sql` in **lexical order**, skips applied files, and runs each file on **one borrowed pooled client** with `BEGIN`/SQL/bookkeeping-`INSERT`/`COMMIT` so atomicity is honored. On error → `ROLLBACK` on the same client, rethrow with filename.
- **Concurrent DDL**: `isConcurrentMigration` (`:17-19`) detects the `CONCURRENTLY` keyword; those files run in **auto-commit** (no `BEGIN`) and set `statement_timeout = 0` for the session (the default 60s cap is too short for GIN builds on `command_journal.affected_ids` after the realistic seed) (`:222-235`).
- A statement splitter (`splitSqlStatements`, `:25-170`) correctly handles `;` inside comments, quotes, and dollar-quoted blocks for the concurrent path.
- Migrations are applied at boot in staging via `start:staging` (`package.json`).
- **Categories of notable migrations**: triggers (`0021`, `0063`), views (`0024` `batches_customer_safe`/`batches_operator`, `0071`), perf indexes (`0022`, `0030`, `0032`, `0043`, `0072`), money/inventory CHECK invariants (`0041` add `NOT VALID`, `0046` hotfix drop, `0055` restore, `0058` `VALIDATE`), FK policy (`0059`, `0060`, `0061`), document snapshots (`0050`/`0052`/`0053`), credit engine (`0033`, `0040`), contacts (`0054`, `0062`, `0070`), photo upload tokens (`0042`).
- **CHECK-constraint discipline** (`0041`/`0058`): invariants like `invoices.amount_paid >= 0 AND <= total`, `payments.unapplied_amount >= 0`, `batches.{intake,available,reserved}_qty >= 0`, `purchase_order_lines.{qty,received_qty} >= 0` are added `NOT VALID` (instant, guards new writes) then `VALIDATE`d in a later migration that safely rolls back leaving the constraint protecting future writes if legacy rows violate. This promotes app-layer money guards into the storage layer.
- A `migrations/rollback/` subdir holds companion down-scripts for operator reference; rollbacks are **not** automated.

### 4.4 Views
`0024` creates `batches_customer_safe` (only `posted`, non-archived, alias-resolved columns — no cost/margin, race-safe via snapshot columns) and `batches_operator` (full operator view). Views back the customer-facing vs operator grids.

---

## 5. Real-Time (Socket.io)

### 5.1 Server (`src/server/sockets.ts`)
- `createSocketServer(httpServer)` (`:7`) attaches Socket.io; CORS only in dev (prod is same-origin) (`:9-15`).
- **Auth handshake** (`:18-36`): the `express-session` middleware is reused for the socket request; `getSessionUser` must resolve or the connection is rejected (`Authentication required`). The user is stored on `socket.data.user`.
- **Rooms** (`:39-58`):
  - Every authenticated socket auto-joins `'authenticated'` — command broadcasts target this room so mid-handshake/unauth sockets can't receive them.
  - Per-order rooms via client `order:subscribe`/`order:unsubscribe` → `socket.join('order:{orderId}')` (`:51-57`).
- **Emit helpers**: `emitPickEvent` routes `pick:queue` to `'authenticated'` and `pick:order:{id}` to that order's room (`:78-90`); `emitPickOrderAndQueue` fires both; `emitSalesLineEvent` emits `sales:order:{id}:line:changed` to the order room (`:103-115`). All no-op safely if `_io` is null (tests) (`:80`).
- `getSocketHealth()` returns `'ok'`/`'degraded'` based on init state, feeding `/api/health` (`:121-127`).
- Events emitted by the bus: `command:completed`, `command:failed`, `pick:queue`, `pick:order:*`, `sales:order:*:line:changed`, plus a `health:pulse` on connect (`index.ts:13-15`).

### 5.2 Client (`src/client/context/SocketContext.tsx`)
- `SocketProvider` (desktop shell only; mobile has a separate path) opens one `io(VITE_SOCKET_URL, {withCredentials:true})` once `auth.me` resolves (`:62-66`).
- On `command:completed`: invalidate react-query caches for `affectedIds` via `invalidateAffectedQueries`. **Edit-aware deferral** (#409): if a cell is being edited (`uiStore.isCellEditing`), peer invalidations are queued in `pendingPeerIds` and flushed when editing ends (`:54-62, 87-101`). Peer toasts are **debounced** in a 2s window and collapsed ("N team actions completed") to avoid toast storms (#408, `:73-106`).
- `command:failed`, `pick:queue`, and `pick:order:*`/`sales:order:*` (via `socket.onAny`) drive targeted cache invalidation (`:108-145`).
- Exposes `subscribeOrder`/`unsubscribeOrder` so order views opt into per-order rooms (`:148-156`).
- **Fallback**: clients that miss a socket event still reconcile via react-query staleness (`staleTime:10s` default; pickQueue 30s) — sockets are an optimization, not a correctness dependency (`sockets.ts:72-74` comment).
- **No tRPC subscriptions**: the client uses `httpBatchLink` only; the `subscriptions` router is server-side scaffolding awaiting a WS/SSE link (`src/server/routers/subscriptions.ts:1-30`).

---

## 6. Validation & Types

- **Shared validation** lives in `src/shared/` so client and server import the *same* zod schemas: `schemas.ts` (command input, login, per-entity payloads, enums), `filterSchemas.ts` (saved-filter definitions), `commandCatalog.ts` (the command union), `customerSheetSnapshot.ts`, `saleLineCostExceptions.ts`, `priceRange.ts`, `tags.ts`, `paymentTerms.ts`, `inventoryPricing*.ts`.
- **`Role` type** (`src/shared/types.ts:1`): `'owner'|'manager'|'operator'|'viewer'` — mirrored by `roleSchema` (`schemas.ts:5`) and `roleRank` (`rbac.ts:5`).
- **`Status` union** (`types.ts:3-35`): ~40 string statuses shared across domains (avoids native PG enums).
- **`CommandResult`/`SessionUser`/`HealthStatus`/`ViewKey`** (`types.ts:91-117, 69-90`) are the cross-cutting DTOs.
- **superjson** serializes both directions so `Date` and `undefined` survive the wire (`trpc.ts:91`, `api/trpc.ts`). The projection-canonicalization path explicitly forbids `undefined` reaching disk (`documentSnapshots.ts:14-17`).
- **Env validation** (`env.ts:7-29`): every env var is zod-parsed/coerced/defaulted at boot; booleans come from `'true'|'false'` enums transformed to real booleans; production secret/DB-URL guards throw on dev defaults.

---

## 7. Frontend Architecture

- **Build**: Vite 6 (`vite.config.ts`). Output `dist/client`; ag-grid is split into its own `grid` manualChunk (`:13-16`); `chunkSizeWarningLimit:3500`. Dev server on `:5173` proxies `/trpc`, `/api`, and `/socket.io` (with `ws:true`) to the API on `:8787` (`:32-42`). `allowedHosts` is explicitly restricted (localhost/127.0.0.1/`.tailscale.ts.net`) — never `true` (#331).
- **Bootstrap** (`src/client/main.tsx`): registers ag-grid enterprise + ClipboardModule, fetches `/api/client-config` at runtime for the AG Grid license (5s timeout, graceful degrade), polyfills `crypto.randomUUID` for non-secure contexts (Tailscale HTTP), then mounts `<trpc.Provider><QueryClientProvider><App/>`. QueryClient defaults: `refetchOnWindowFocus:false`, `staleTime:10s`, `retry:1` (`:44-51`).
- **Routing** (`src/client/App.tsx`): `BrowserRouter`; `LocationSync` mirrors the first path segment into `uiStore.activeView` (`:57-68`). ~25 `ViewKey`s (`types.ts:65-91`). A `VITE_CANVAS_GRAMMAR_ENABLED` flag toggles the canvas shell (`App.tsx:53`). Separate **mobile shell** (`MobileShell` + mobile views) with its own socket-free path.
- **State** (`src/client/store/uiStore.ts`): zustand + `immer` + `persist`. Persist key `'terp-agro-ui'` with a `partialize` allowlist (`:183, 483-497`) — drawer entity state and grid filters are **deliberately not persisted** (UX-A1/#15) while column prefs and margin-visibility are. A cross-tab `storage` sync is registered at startup (`uiStoreStorageSync.ts`, `main.tsx`).
- **Server state**: react-query v4 via tRPC v10 hooks. Socket events invalidate query keys by `affectedIds`.
- **`OperatorGrid`** (`src/client/components/OperatorGrid.tsx`): the universal data grid wrapping `AgGridReact`. Column prefs persist via `uiStore` (`columnStateToPrefs`/`mergeColumnDefsWithPrefs`), filter chips serialize to URL/state (`gridFilterUtils.ts`), and **CSV export is role-gated** — `OperatorGrid.csvExport.ts` strips cost/margin/balance columns for `viewer` role (`RESTRICTED_VIEWER_COLUMNS`, UX-A2) so a viewer can't exfiltrate restricted figures via export.
- **Design system** (`docs/design-system/`): Tailwind 3 with a custom brand palette (`ink/panel/field/line/accent/amber/danger`, `tailwind.config.ts`) and a `focus` box-shadow token. PostCSS + autoprefixer (`postcss.config.js`). AG Grid Quartz theme.
- **Error handling** (`src/client/components/ErrorBoundary.tsx`): top-level boundary around `App`; generic message in prod, full message in dev; "Try again" resets state (preserving sibling drafts) before "Reload page" (#21).

---

## 8. HTTP Routes Outside tRPC (`src/server/routes/`)

Registered before tRPC (`routes/index.ts:16-20`). These exist only for the binary/download edge; tRPC is the primary surface.

- **CSV export** (`exportCsvRoute.ts`): `GET /api/export/:view.csv`, `requireOperator`. Validates `:view` against the same `viewSchema` whitelist as the tRPC export, runs the same `gridSql(view)` + `deterministicHeaders(view)`, and streams `text/csv` with `Content-Disposition: attachment` + `X-Content-Type-Options: nosniff`. Exists because the tRPC `csvExport` returns a JSON envelope that browsers won't auto-download (#35).
- **Upload** (`uploadRoute.ts`): `POST /api/upload/media`, guarded by `requirePhotographyEnabled` → `requireOperatorOrUploadToken` → `uploadRateLimiter`. Multer disk storage routes files to `resolveBatchMediaPath(MEDIA_STORAGE_PATH, batchId)` (`:33-55`). Size caps 50MB photo / 200MB video; extension allowlist `.jpg/.jpeg/.png/.mp4/.mov/.heic` (`:25-27`). Post-parse: `validateMagicBytes` (file-type sniff), `convertHeicToJpeg`, `generateThumbnails` (sharp), insert `batch_media` row. Disk-space preflight via `checkDiskSpace`.
- **Media serve** (`mediaRoute.ts`): `GET /api/media/:id`, `requirePhotographyEnabled` → `requireOperator` → `mediaServeRateLimiter`. Supports HTTP **range requests** (`parseRangeHeader`, `:24-34`) for video streaming.
- **Token auth** (`middleware/requireOperatorOrUploadToken.ts`): accepts EITHER an operator session cookie OR `Authorization: Bearer <token>` bound to a specific batch via `photo_upload_tokens` (sha256-at-rest). The bearer path requires `?batchId=` (verified before multer parses the body), is **upload-only**, **batch-scoped** (403 on wrong batch, 401 on any other token failure), and never echoes the token. Enables photographer mobile upload without an operator account (#73).
- **Photography kill-switch** (`middleware/requirePhotographyEnabled.ts`): reads `process.env.ENABLE_PHOTOGRAPHY` at **request time** (not boot) so the feature can be toggled live; returns 503 when off.

---

## 9. Build / Test / CI

### 9.1 Scripts (`package.json`)
- `build` = `tsc --noEmit && vite build && tsup src/server/{index,migrate,seed}.ts --format esm --platform node --out-dir dist/server` — typecheck, bundle client, bundle three server entrypoints.
- `dev` = concurrently `tsx watch` server + `vite`. `dev:e2e` runs server without watch for Playwright.
- DB: `db:migrate`/`db:seed`/`db:seed:realistic` (dev via tsx) + `:prod` variants (node on `dist/`).
- Audits: `audit:parity`, `audit:product-roadmap`, `audit:realistic-demo`, `audit:self` (= typecheck + parity + roadmap + build).
- Cron: `cron:credit-engine-nightly`, `cron:balance-reconciliation`.

### 9.2 Coverage (`.coverage-thresholds.json`, `vitest.config.ts`)
- **Repo-wide floor** (`.coverage-thresholds.json`): lines 80 / branches 75 / functions 60 / statements 80. Enforcement command excludes `performance.test.ts`. `blockPRCreation` + `blockTaskCompletion` are `true`.
- **Per-subtree ceiling** (`vitest.config.ts:coverage`): **100%** lines/branches/functions/statements on `src/server/services/creditEngine/**`. The floor protects the whole repo; the ceiling drives credit-engine discipline. Tighten one, never loosen the other.
- Vitest defaults: `environment:'node'` (jsdom opt-in via `// @vitest-environment jsdom` file pragma), `globals:true`, `fileParallelism:false` (integration tests share one Postgres DB and race on global tables), `testTimeout:30000` (v8 instrumentation is 3-4× slower). DB-dependent tests are excluded by glob (`*.integration.test.ts`/`*.db.test.ts` naming convention) and an explicit creditEngine exclusion list (`vitest.config.ts:15-39`).

### 9.3 Parity & roadmap audits (`scripts/*.mjs`)
- `check-backend-frontend-parity.mjs`: parses `commandNames`/`internalOnlyCommandNames`/`pendingFrontendCommandNames` from the catalog and `queries.ts` router names, then asserts each non-exempt command/query has a `runCommand(...)`/query usage in `src/client/`. Surface aliases (`logPayment→postTransactionLedgerRow`) and pending-frontend lists are honored. This keeps the catalog and the UI in lockstep.
- `check-product-roadmap.mjs`: validates the capability registry/roadmap docs.
- `audit-realistic-demo-data.mjs`: asserts the realistic seed produced sane data (run non-fatally during `start:staging`).

### 9.4 CI (`.github/workflows/`)
- **ci.yml** (push + PR): pnpm install (frozen) → `typecheck` → pinned credit-engine negative-role + metrics tests → pinned commandBus idempotency test → `build` → Playwright a11y sweep (`tests/e2e/a11y.spec.ts`, axe-core, fails on critical/serious WCAG 2.1 AA) → full `vitest run` (exclusions live in config, not CLI).
- **deploy-staging.yml** (push to main/staging/codex branch): tests (DB-needing creditEngine excluded) → `audit:self` → render the DO app spec (`render-digitalocean-spec.mjs`) → deploy via `doctl`.
- **nightly.yml**: scheduled twice (10:00 & 11:00 UTC to hit 6am ET across DST), `concurrency:nightly cancel-in-progress:false`, `issues:write` permission; runs Playwright `smoke` project against the live staging URL and opens/comments issues on failure.
- **post-deploy-smoke.yml**: smoke tier after deploy.

### 9.5 Lint/format
- ESLint 10 flat config (`eslint.config.js`) with `@typescript-eslint` recommended; `no-explicit-any` and `no-unused-vars` are **warnings** (legacy violations) — `lint` runs `--max-warnings 9999`. Despite CLAUDE.md's "no any" aspiration, the gate is non-blocking.
- Prettier (`.prettierrc`): semi, single-quote, 2-space, `trailingComma:es5`, printWidth 100.

### 9.6 E2E (`playwright.config.ts`)
Two projects: `smoke` (`tests/smoke/`, 5 specs vs live staging) and `chromium` (`tests/e2e/`, full operator workflow, 26 specs). `webServer` runs `pnpm dev:e2e` unless `PLAYWRIGHT_SKIP_WEB_SERVER`. `trace:retain-on-failure`.

---

## 10. Deployment & Ops

- **Dockerfile** (multi-stage, node:22-alpine): build stage `pnpm install --frozen-lockfile && pnpm build`; runtime stage `pnpm install --prod`, copies `dist/`, `migrations/`, `scripts/`, creates `storage/{journal,archives,media}`, exposes `8787`. **HEALTHCHECK** wgets `/api/health` (DEVOPS-05).
- **docker-compose.yml** (dev): just Postgres 16 on host `:55432`, db/user/pass `terp_agro`, with `pg_isready` healthcheck + named volume.
- **docker-compose.prod.yml**: app + Postgres; app mounts **named volumes** for `storage/journal`, `storage/archives`, `storage/media` so audit logs and photos survive redeploys; app waits on `postgres: condition:service_healthy`; exposes `8080:8787`.
- **DigitalOcean App Platform** (`.do/terp-agro-staging.yaml`): single `web` service, Dockerfile deploy, `deploy_on_push`, `run_command: pnpm start:staging`, health check `/api/health` (120s initial delay, 8 failure threshold). Secrets (`DATABASE_URL`, `SESSION_SECRET`, AG Grid key) injected as DO SECRET env. `DATABASE_SSL=true`, `DATABASE_SSL_REJECT_UNAUTHORIZED=false`. **Caveat baked into the spec**: DO App services have **no persistent volumes** — `JOURNAL_DIR`/`ARCHIVE_DIR` under `/workspace/storage` are ephemeral and wiped each redeploy (intentional for demo staging; durable audit needs the Droplet+Caddy path in `deploy/staging/`).
- **Droplet alternative** (`deploy/staging/`): `Caddyfile` + `docker-compose.caddy.yml` for a volume-backed staging with durable journals.
- **`start:staging`** (`package.json`): `db:migrate:prod` → seed with `ALLOW_DEMO_SEED=true DEMO_SEED_SCENARIO=realistic_100d` → run `audit:realistic-demo` (non-fatal; logs and continues so the server stays reachable, #121) → `node dist/server/index.js`.
- **DB pool** (`db.ts:23-31`): `max:25`, `statement_timeout:60s`, `idleTimeout:30s`, `connectionTimeout:5s`. SSL is conditional; sslmode query params are stripped from the URL when SSL is on (`db.ts:53-59`).
- **Env vars** (`.env.example`): `DATABASE_URL`, `DATABASE_SSL*`, `SESSION_SECRET`, `JOURNAL_DIR`, `ARCHIVE_DIR`, `APP_ORIGIN`, `PORT`, `VITE_*` (TRPC/SOCKET URLs, AG Grid license, Crikket feedback, canvas flag), `ENABLE_PHOTOGRAPHY`, `MEDIA_STORAGE_PATH`, demo-seed knobs, and the destructive `ALLOW_DEMO_SEED`/`FORCE_RESEED` switches.
- **Backups/archive**: closeout writes period archive PDFs to `ARCHIVE_DIR` (`commandBus.ts` `writeArchivePdf`); `backup_snapshots` rows back read-only restore previews. Bag manifests write CSV to `ARCHIVE_DIR/bag-manifests/` (`commandBus.ts:5879-5921`).

---

## 11. Cron / Background Jobs

No in-process scheduler — the host runtime (DO scheduled job / k8s CronJob) invokes these. Both emit single-line JSON logs and `process.exit(0/1)`.

- **Credit engine nightly** (`scripts/credit-engine-nightly-cron.ts` → `creditEngine/nightlyCron.ts`): `runNightlyCreditEngineAudit(pool, now)`. Safety net that recomputes credit decisions, reports drift, and flags stuck queue rows. Env: `CREDIT_ENGINE_DRIFT_THRESHOLD_PCT` (25), `CREDIT_ENGINE_STUCK_AGE_MIN` (30). The credit engine itself is a queue-drain system: events enqueue customers to `credit_recompute_queue` (idempotent via a partial unique index on pending rows, `creditEngine/enqueue.ts:11-18`), and `processOneRecompute`/`recomputeAllCustomers` drain it with `FOR UPDATE SKIP LOCKED` (`orchestrator.ts:38-45`). `enqueueCustomerRecompute` unwraps Drizzle's tx to the raw `PoolClient` so enqueues stay transactional with the triggering command (`enqueue.ts:28-43`). Scoring is six weighted signals (revenue momentum, cash collection, profitability, debt aging, repayment velocity, tenure depth) summing to 100 per stance (`seed.ts:81-110`, `creditEngine/scoring.ts`). Enforced at **100% coverage**.
- **Customer balance reconciliation** (`scripts/customer-balance-reconciliation-cron.ts` → `services/balanceReconciliation.ts`): nightly compares the denormalized `customers.balance` against `SUM(client_ledger_entries.amount)` **in SQL (NUMERIC)** and writes a `customer_balance_reconciliation` audit row per customer whose drift exceeds `CUSTOMER_BALANCE_DRIFT_THRESHOLD` (default `$0.01`). Safety net for the balance denorm (#18 BIZ-01).

---

## 12. Seeding & Demo Data

`src/server/seed.ts` (`db:seed`):
- **Production guard**: refuses to seed in prod without `ALLOW_DEMO_SEED=true` (`:36-38`); `ALLOW_DEMO_SEED=false` skips entirely (`:40-45`).
- **Advisory lock** `pg_advisory_lock(520126)` serializes concurrent seed runs (`:48,120`).
- **Idempotency**: skips if `users` already populated unless `FORCE_RESEED=true` (`:51-56`).
- **Reseed** truncates ~40 tables `RESTART IDENTITY CASCADE` (`:58-72`) — destructive.
- **Scenario dispatch** (`:74-78`): `DEMO_SEED_SCENARIO=realistic_100d` → `seedRealisticDemoData(realisticDemoConfigFromEnv())` (driven by `DEMO_*` env knobs: monthly revenue, flower share, whale/small customer counts, vendor mix, per-category prices, random seed 520126); otherwise the baseline `insertSeedData` (owner/manager/operator/sales/viewer users, password `terp-demo` bcrypt cost 12).
- **Credit engine seed** (`:80-117`): five stances (Balanced/Prioritize Cash/Prioritize Revenue/Conservative/Loyalty-Weighted), each weight-summed to exactly 100 (throws otherwise), and a `credit_engine_config` row defaulting to the Balanced stance with `shadow_mode=true`.
- Realistic-demo output is asserted by `audit-realistic-demo-data.mjs` (run in `start:staging`).

---

## Appendix — Where Things Live (quick map)

| Area | Path |
|---|---|
| Server bootstrap | `src/server/index.ts`, `app.ts`, `sockets.ts`, `env.ts`, `db.ts`, `auth.ts` |
| tRPC core | `src/server/trpc.ts`, `routers/{index,auth,commands,credit,filters,queries,subscriptions}.ts` |
| **Command bus (core)** | `src/server/services/commandBus.ts` |
| Command catalog | `src/shared/commandCatalog.ts` |
| RBAC | `src/server/rbac.ts` |
| Journals/snapshots | `services/journal.ts`, `services/documentSnapshots.ts`, `services/projections/` |
| Schema | `src/server/schema.ts`; migrations `migrations/NNNN_*.sql`; runner `src/server/migrate.ts` |
| HTTP routes | `src/server/routes/{index,uploadRoute,mediaRoute,exportCsvRoute}.ts` |
| Middleware | `src/server/middleware/*` |
| Shared validation/types | `src/shared/{schemas,types,filterSchemas,…}.ts` |
| Client bootstrap | `src/client/{main.tsx,App.tsx}`, `api/trpc.ts`, `context/SocketContext.tsx`, `store/uiStore.ts` |
| Universal grid | `src/client/components/OperatorGrid*.{tsx,ts}` |
| Credit engine | `src/server/services/creditEngine/**` (100% coverage subtree) |
| Crons | `scripts/credit-engine-nightly-cron.ts`, `scripts/customer-balance-reconciliation-cron.ts` |
| Seeds | `src/server/seed.ts`, `realisticSeed.ts` |
| CI | `.github/workflows/{ci,deploy-staging,nightly,post-deploy-smoke}.yml` |
| Deploy | `Dockerfile`, `docker-compose*.yml`, `.do/terp-agro-staging.yaml`, `deploy/staging/` |
