# TERP Operator: Technical Specification

_Last updated: 2026-06-01_
_Companion to: `docs/customer-journey-map.md` and `docs/feature-reference.md`_
_This document covers the technical languages, frameworks, architectural patterns, and logical framework underlying TERP Operator — the details not visible in the CJM itself._

---

## Table of Contents

1. [Technology Stack](#1-technology-stack)
2. [System Architecture Overview](#2-system-architecture-overview)
3. [Command System](#3-command-system)
4. [Database Design](#4-database-design)
5. [API Layer (tRPC)](#5-api-layer-trpc)
6. [Real-time Layer (Socket.io)](#6-real-time-layer-socketio)
7. [Authentication and Session Management](#7-authentication-and-session-management)
8. [Role-Based Access Control (RBAC)](#8-role-based-access-control-rbac)
9. [Audit Trail and JSONL Journaling](#9-audit-trail-and-jsonl-journaling)
10. [Reversal System](#10-reversal-system)
11. [Credit Engine](#11-credit-engine)
12. [Inventory Movement Tracking](#12-inventory-movement-tracking)
13. [Media and File Storage](#13-media-and-file-storage)
14. [Frontend Architecture](#14-frontend-architecture)
15. [Testing and Verification](#15-testing-and-verification)
16. [Deployment and Environment](#16-deployment-and-environment)
17. [Known Technical Constraints](#17-known-technical-constraints)

---

## 1. Technology Stack

### Languages

| Layer | Language | Version |
|-------|----------|---------|
| Client | TypeScript | 5.x |
| Server | TypeScript (Node.js) | 5.x / Node 20+ |
| Database migrations | SQL (PostgreSQL dialect) | — |
| Build / tooling | Shell, JSON | — |

### Frontend

| Library | Role | Notes |
|---------|------|-------|
| **React** 18 | UI component framework | Concurrent mode, strict mode |
| **Vite** | Build tool and dev server | HMR, fast cold starts |
| **react-router-dom** v7 | URL routing | `BrowserRouter`, `Routes`, `Route` — every primary view has its own URL path |
| **AG Grid Enterprise** (`ag-grid-enterprise` ^32.3.3) | Primary data grid | Used on every main view; `OperatorGrid` wrapper. Enterprise license key supplied via `VITE_AG_GRID_LICENSE_KEY` and the `LicenseManager`. Server-side row model, master-detail, range selection are enabled. |
| **Zustand** (with `immer` middleware) | UI sub-view state | `useUiStore` — drawer state, active entity, palette, focus. Top-level routing is handled by react-router-dom, not Zustand. |
| **TanStack Query** v4 | Server state / cache | Invalidated by Socket.io events after each command |
| **tRPC client** v10 | Type-safe API calls | Uses `superjson` transformer. Shares types with server via monorepo. |
| **Tailwind CSS** | Utility styling | Hybrid with hand-written semantic CSS classes |
| **Zod** | Runtime schema validation | Shared with server; payload schemas defined once |
| **decimal.js** | Money / precision math | All financial accumulations. `ROUND_HALF_UP` at 20-digit precision. Native JS floats are not used for money. |
| **pdfkit** | PDF generation | Closeout artifacts, customer sheets, manifests |
| **multer** | Multipart upload parsing | Used by the `uploadRoute` REST handler |
| **sharp** + **file-type** | Image processing / MIME validation | Batch media pipeline |
| **superjson** | tRPC transformer | Required to round-trip `Date`, `BigInt`, `Decimal` over the wire |
| **immer** | Zustand middleware | Enables draft-style updates in `useUiStore` |

### Backend

| Library | Role | Notes |
|---------|------|-------|
| **Node.js** | Runtime | v20 LTS target |
| **Express** | HTTP server | Mounts tRPC adapter, three REST routes (upload, media, exportCsv), Socket.io, helmet, rate limiters, and the session store |
| **tRPC** v10 | Type-safe RPC layer | Most queries and mutations are routed through tRPC. A small set of non-tRPC REST routes exist for file upload, media serving, and CSV export — see §5.1. |
| **Drizzle ORM** | Database access | Schema-first, fully typed, SQL-close |
| **Drizzle Kit** | Migration tooling | Generates and runs SQL migration files |
| **PostgreSQL** | Primary database | All persistence; session store; command journal |
| **Socket.io** | Real-time event push | Server → all clients after every command |
| **Zod** | Payload validation | All command inputs validated before execution |
| **express-session** | Session management | PostgreSQL-backed session store |
| **bcryptjs** | Password hashing | Pure-JS implementation (not the native `bcrypt` binding) — different performance profile |
| **helmet** | Security headers | CSP, X-Frame-Options, HSTS — see §7.4 |
| **express-rate-limit** | Throttling | Per-IP login throttle, upload throttle, media-read throttle |
| **decimal.js** | Money / precision math | Required for any financial calculation; shared with client |

### Toolchain

| Tool | Role |
|------|------|
| `pnpm` | Package manager |
| `tsx` | TypeScript execution for server dev |
| `vitest` | Unit / integration tests |
| `playwright` | E2E browser tests |
| `eslint` | Linting |

---

## 2. System Architecture Overview

TERP Operator follows a **monolithic full-stack TypeScript** architecture with a clear separation between the command path (mutations) and the query path (reads).

```
┌─────────────────────────────────────────────────┐
│                  React Client                    │
│  AG Grid views │ Zustand UI state │ TanStack Q  │
│         tRPC client │ Socket.io client           │
└────────────────────┬────────────────────────────┘
                     │ tRPC over HTTP
┌────────────────────▼────────────────────────────┐
│                Express + tRPC Server             │
│                                                 │
│  ┌─────────────┐      ┌──────────────────────┐  │
│  │  Query      │      │   Command Bus        │  │
│  │  Routers    │      │  (commandBus.ts)     │  │
│  │  (tRPC)     │      │  validate → RBAC →   │  │
│  │  reads only │      │  idempotency →       │  │
│  └──────┬──────┘      │  execute → journal → │  │
│         │             │  broadcast           │  │
│         │             └──────────┬───────────┘  │
│         │                        │               │
│  ┌──────▼────────────────────────▼──────────┐   │
│  │           Drizzle ORM + PostgreSQL        │   │
│  │  Tables │ commandJournal │ JSONL log file │   │
│  └──────────────────────────────────────────┘   │
│                                                 │
│  ┌──────────────────────────────────────────┐   │
│  │           Socket.io Server               │   │
│  │  Emits: command:completed / failed       │   │
│  └──────────────────────────────────────────┘   │
└─────────────────────────────────────────────────┘
```

### Key Design Decisions

**CQRS-lite:** Reads (queries) go directly from tRPC router → Drizzle → PostgreSQL with no command bus involvement. Writes (mutations) always go through the command bus. This keeps reads fast and simple while giving writes a single choke point for validation, RBAC, idempotency, and auditing.

**Type-safety end-to-end:** TypeScript types defined once in `src/shared/` are consumed by both the client and server. The `CommandName` union type and Zod payload schemas live in `src/shared/commandCatalog.ts` and are imported by both the tRPC router and the command bus. No runtime type drift is possible.

**No ORM magic for mutations:** Drizzle mutations are written explicitly in each command handler rather than using auto-generated CRUD. This makes the before/after snapshot capture and reversal logic clear and auditable.

**URL routing via react-router-dom v7:** TERP Operator uses `react-router-dom` v7 (`BrowserRouter`, `Routes`, `Route`) for URL routing. Every primary view has a dedicated URL path (`/dashboard`, `/reports`, `/purchaseOrders`, …), plus a complete mobile shell mounted at `/mobile/*`. View routing is a combination of URL routing (react-router-dom) and Zustand state (`useUiStore`) for sub-view state — drawer open/closed, active entity, palette state, focus mode.

---

## 3. Command System

The command system is the central architectural pattern in TERP Operator. Every state mutation — from creating a PO to posting a sale to recording a payment — flows through the same typed pipeline.

### 3.1 Command Definition

Commands are defined in `src/shared/commandCatalog.ts`:

```typescript
// Simplified structure
export const commandNames = ['createBatch', 'postSalesOrder', ...] as const;
export type CommandName = typeof commandNames[number];

// Each command has:
// - A Zod payload schema (server-side validation)
// - A required role (RBAC gate)
// - A reversalPolicy: 'reversible' | 'offsettable' | 'terminal'
```

130 named commands exist as of 2026-06-01. Each command name is a string literal in the `CommandName` union — adding a command requires adding it to the catalog first.

### 3.2 Execution Pipeline

The command bus in `src/server/services/commandBus.ts` executes the following steps for every command:

```
1. PARSE
   Zod schema validates the raw payload.
   Any type mismatch or missing field → throws before any DB access.

2. RBAC CHECK
   assertCommandAccess(commandName, actor.role) → throws if role insufficient.
   Defined in src/server/rbac.ts.

3. ATOMIC CLAIM (idempotency)
   INSERT INTO commandJournal (idempotencyKey, commandName, actorId, status='pending', inputPayload, ...)
     ON CONFLICT (idempotencyKey) DO NOTHING RETURNING *;
   - If a row is returned: this caller wins the claim. Proceed.
   - If no row is returned (key already taken): SELECT the existing row.
       • If status='ok'    → return its cached result.
       • If status='failed' → return its cached failed result/error to the caller.
                              The command is NOT re-executed.
       • If status='pending' from another in-flight execution → poll for up to ~1s,
                              then throw a "still pending" error.

4. BEFORE SNAPSHOT
   snapshotFromPayload(payload) reads the current state of the entities referenced
   in the payload. Stored as JSON in commandJournal.beforeSnapshot at journal update time.

5. EXECUTE HANDLER
   Command-specific handler runs inside a DB transaction.
   Drizzle ORM performs the actual inserts/updates/deletes.

6. AFTER SNAPSHOT
   Read updated state of affected rows from DB.

7. UPDATE JOURNAL
   UPDATE commandJournal
     SET status='ok', afterSnapshot=$after, result=$result, beforeSnapshot=$before, affectedIds=$ids
     WHERE id = <claimed row id>;
   On handler failure: SET status='failed', error=$message instead.

8. JSONL APPEND
   Append-only write to on-disk JSONL file under JOURNAL_DIR (offline audit trail).
   Note: JSONL goes to JOURNAL_DIR, NOT ARCHIVE_DIR. ARCHIVE_DIR holds period
   archive artifacts and bag manifests; the two directories are distinct.

9. SOCKET.IO BROADCAST
   io.emit('command:completed', { commandId, commandName, actorId, affectedIds })
     OR io.emit('command:failed', { commandId, commandName, actorId, affectedIds }).
   The full result is intentionally NOT broadcast (PII concern). Peer-side toasts
   are stripped — only the initiating client gets a toast (delivered via tRPC
   onSuccess), peers just see their query caches invalidate.

10. RETURN
    Result returned to tRPC caller → client shows toast, invalidates cache.
```

**Failed commands are not re-executed on retry.** When the same `idempotencyKey` is replayed and the prior row is `status='failed'`, the cached failed result is returned to the caller verbatim. To re-attempt, the client must mint a new `idempotencyKey`.

**Stale pending rows.** A separate sweeper flips `commandJournal` rows that have been in `status='pending'` for more than ~5 minutes to `status='failed'` with a timeout error and surfaces a toast. This guards against crashes between the claim and the update.

### 3.2.1 Catalog Coverage

Of the 130 named commands, ~80% have a live UI surface. The remainder are split:

- **`internalOnlyCommandNames` (8)** — backend/admin-only commands with no UI surface. Filed under issue #111. Includes `routeConnectorRequest`, `setCustomerEngineMax`, `setCustomerStance`, `disableCreditEngineForCustomer`, `createCreditEngineStance`, `updateCreditEngineStance`, `deleteCreditEngineStance`, `bulkRevertCustomersToEngine`.
- **`pendingFrontendCommandNames` (18)** — backend handler implemented, client-side wiring not yet complete.

Both lists are exported from `src/shared/commandCatalog.ts`. The parity audit (`pnpm audit:parity`) tolerates these two sets explicitly.

### 3.3 Idempotency Key Format

Clients generate idempotency keys as: `${commandName}-${uuidv4()}`. The UUID is generated fresh for each user-initiated command invocation. Keys are stored in `commandJournal.idempotencyKey` with a unique index — duplicate keys cannot be inserted (the pipeline relies on this via `INSERT ... ON CONFLICT (idempotencyKey) DO NOTHING RETURNING`).

On network retry with the same key, the bus returns the cached `result` from the original row — whether that row succeeded or failed. This prevents double-posting, double-payments, and duplicate inventory. A failed prior attempt is **not** silently re-executed; the caller must mint a new key to deliberately re-try.

### 3.4 Reversal Policy

Each command has one of three reversal policies:

| Policy | Meaning | Example commands |
|--------|---------|-----------------|
| `reversible` | Full compensating undo exists | `postSalesOrder`, `logPayment`, `recordVendorPayment` |
| `offsettable` | No programmatic undo; use `createCorrectionJournalEntry` | Some config commands |
| `terminal` | Cannot be undone in the application | `lockPeriod`, `archivePeriod` |

The `reverseCommandById` command reads the original command's `reversalPolicy` and executes the appropriate inverse logic. Reversal logic is hand-crafted per command (a large `if/else if` block in the reversal handler) using the stored `beforeSnapshot` to restore prior state.

---

## 4. Database Design

### 4.1 Engine

**PostgreSQL** (v14+). Managed via **Drizzle ORM** with **Drizzle Kit** for migrations.

All migrations live in `migrations/` as numbered SQL files (e.g., `0001_initial.sql`, `0002_workflow_gap_closure.sql`). Migrations are applied with `pnpm db:migrate` and are idempotent (safe to run on every session start).

### 4.2 Schema Patterns

**Status columns as `varchar`:** The system uses `varchar(32)` for all status columns rather than PostgreSQL `ENUM` types. This was a deliberate decision to allow adding new statuses without blocking migrations. Business-rule enforcement happens in application code (Zod schemas, command handlers) and DB CHECK constraints, not at the ENUM level.

**CHECK constraints for business rules:** Where status transitions or value relationships must be guaranteed at the lowest level, SQL `CHECK` constraints are used. Examples:
- `purchase_order_lines`: `CHECK ((unit_cost > 0 AND cost_range_low IS NULL AND cost_range_high IS NULL) OR (unit_cost = 0 AND cost_range_low > 0 AND cost_range_high > 0 AND cost_range_low <= cost_range_high))` — enforces the mutual-exclusivity of fixed cost and cost range
- `payment_allocations`: `CHECK (amount > 0)` — prevents zero-dollar allocations
- `credit_engine_stances`: Weights must sum to 100

**Unique indices for business uniqueness:** Database-level unique indices enforce one-of constraints:
- `batch_media_primary_photo_unique`: Only one active published primary photo per batch
- `credit_recompute_queue_pending_unique`: One pending recompute per customer at a time
- `commandJournal.idempotencyKey`: Unique across all commands

**Append-only tables:** Configuration history is append-only (never updated). Examples: `credit_engine_config_history`, `credit_engine_stance_history`. Each configuration change inserts a new row with a timestamp. Current config is always the most recent row.

**`ON DELETE RESTRICT` foreign keys:** Critical relationships (e.g., `purchaseOrders.vendorId`) use `ON DELETE RESTRICT` to prevent cascade deletes from silently corrupting referential integrity.

### 4.3 Core Table Relationships

```
vendors ──────────────────────── purchaseOrders ──── purchaseOrderLines
   │                                    │
   └── vendorBills ◄───────────── batches (inventory)
                                        │
customers ──── salesOrders ──── salesOrderLines ──── invoices
    │               │
    │               └── pickLists ──── fulfillmentLines
    │
payments ──── paymentAllocations ──── invoices

users ──── commandJournal (actorId)
commandJournal ──── commandJournal (reversedByCommandId, self-ref)

contacts ──── customers (contactId)
contacts ──── vendors (contactId)
contacts ──── users (contactId)
contacts ──── appointments
```

### 4.4 Key Tables

| Table | Rows hold | Typical write pattern |
|-------|-----------|----------------------|
| `commandJournal` | Every mutation ever executed | Append-only; never updated except `reversedByCommandId` |
| `batches` | Inventory lots | Created at intake; qty updated as sold |
| `salesOrders` + `salesOrderLines` | Customer orders | Status column updated at each lifecycle step |
| `invoices` | Financial invoices | Created at `postSalesOrder`; `amountPaid` updated by payments |
| `payments` + `paymentAllocations` | Customer payments | Append-only allocations; payment status updated |
| `vendorBills` + `vendorPayments` | AP obligations | Status updated through the AP lifecycle |
| `pickLists` + `fulfillmentLines` | Fulfillment work | Created at allocation; updated per pack action |
| `inventoryMovements` | Qty/status/location audit trail | Append-only; every inventory change creates a row |
| `creditEngineStances` | Scoring profiles | Replaced by new rows (config history pattern) |

---

## 5. API Layer (tRPC)

### 5.1 Pattern

Most client-server communication uses **tRPC v10**. Types are shared between client and server via `src/shared/`.

Three REST routes exist outside the tRPC tree:

| Route | Purpose | Notes |
|-------|---------|-------|
| `uploadRoute` (`POST /api/upload/media`) | Multipart batch media upload | Uses `multer`; validated by a one-time photo upload token. Token presence is required; the route is rate-limited. |
| `mediaRoute` (`GET /api/media/...`) | Batch media serving | Supports HTTP `Range` requests for video. Rate-limited per IP. |
| `exportCsvRoute` | CSV export streaming | Used where streaming or large response sizes do not fit tRPC well. |

Two additional inline routes:
- `GET /api/health` — liveness probe.
- `GET /api/client-config` — returns runtime client config including the AG Grid Enterprise license key.

**Query procedures** — Direct reads. tRPC router → Drizzle query → response. No command bus involvement. These are the data sources for AG Grid rows.

**Mutation procedures** — All go through the command bus. The tRPC mutation handler is a thin wrapper: it extracts the caller's session (`req.session.userId`), constructs the actor object, and delegates to `commandBus.execute(commandName, payload, actor)`.

### 5.2 Type Safety

The shared type contract means:
- If a command's Zod schema changes, both the server handler and the client form/hook see the updated type at compile time.
- The `CommandName` union is the canonical list of valid commands. Passing a string not in the union is a TypeScript error.
- tRPC procedure output types are inferred from the handler return type — no separate response schema needed.

### 5.3 Server State Cache (TanStack Query)

The client uses **TanStack Query v4** to cache tRPC query results. Cache invalidation happens reactively:

1. Socket.io delivers a `command:completed` event to the client.
2. The client's Socket.io listener calls `queryClient.invalidateQueries(...)` for the relevant query keys.
3. TanStack Query refetches stale queries on the next render.

This means the UI is **eventually consistent** (not optimistically updated) after a command. The server is the source of truth. In practice, the round-trip latency is fast enough that the refresh feels immediate.

---

## 6. Real-time Layer (Socket.io)

### 6.1 Event Model

After every command execution (step 9 of the command pipeline), the server emits to all connected clients:

```typescript
// On success:
io.emit('command:completed', {
  commandId: string,       // commandJournal.id
  commandName: string,
  actorId: string,
  affectedIds: string[]    // entity IDs touched by the command
});

// On failure:
io.emit('command:failed', {
  commandId: string,
  commandName: string,
  actorId: string,
  affectedIds: string[]
});
```

The **full handler result is intentionally NOT broadcast** — only the small "what changed" envelope above goes over the wire. This avoids leaking PII (customer names, prices, addresses, etc.) onto every other connected client. Peers use `affectedIds` to invalidate the right query keys; only the initiating client receives the full result via the tRPC mutation response and shows a toast. Peer-side toasts are stripped.

Events are broadcast to **all** connected clients, not just the initiating client. This enables real-time multi-operator workflows — when one sales operator posts an order, inventory counts update on every other connected screen simultaneously.

Additional event channels broadcast outside the command pipeline:

| Channel | Purpose |
|---------|---------|
| `health:pulse` | Periodic server-side liveness signal |
| `pick:queue` | Warehouse pick-queue updates |
| `pick:order:${orderId}` | Per-order pick state |
| `sales:order:${orderId}:line:changed` | Sales/warehouse coordination on a single order line |

### 6.2 Client Listener

The client Socket.io listener is initialized once at app startup. It calls `queryClient.invalidateQueries()` on `command:completed`, which triggers TanStack Query to refetch the affected data. The listener also triggers the toast notification system.

### 6.3 Connection Model

Socket.io uses the default HTTP long-polling upgrade to WebSocket. No separate WebSocket server is required — Socket.io mounts on the same Express server as tRPC.

---

## 7. Authentication and Session Management

### 7.1 Mechanism

TERP Operator uses **session-based authentication** (not JWT). Sessions are stored in PostgreSQL via a session store adapter (`connect-pg-simple` or equivalent).

**Login flow:**
1. Client sends credentials (email + password) to `auth.login` tRPC mutation.
2. Server validates credentials using **`bcryptjs`** hash comparison on `users.passwordHash`. Note: this is the pure-JS implementation, not the native `bcrypt` binding — performance characteristics differ accordingly.
3. On success: session ID is **regenerated** (security measure — prevents session fixation attacks). `req.session.userId` is set.
4. Session record written to PostgreSQL session table.
5. Client receives session cookie (HTTP-only, `SameSite=Lax`, `Secure` in production).

### 7.2 Session Security

- **Session ID regeneration on login** — fixed via adversarial QA finding. Prior code did not regenerate, allowing session fixation.
- **Production secret enforcement** — the server **refuses to start** in production mode if the session secret matches the default development value. This prevents accidental deployment with an insecure secret.
- **HTTP-only session cookies** — session IDs are not accessible to client-side JavaScript.

### 7.3 Request Authentication

Every tRPC procedure reads `req.session.userId` to establish the actor identity. Unauthenticated requests (no session or expired session) are rejected with a `401 UNAUTHORIZED` error before reaching any handler logic.

### 7.4 Security Headers and Rate Limits

The Express server applies security middleware before any route handler runs:

- **helmet** with a Content Security Policy:
  - `default-src 'self'`
  - `script-src 'self'` in production (no `'unsafe-inline'`/`'unsafe-eval'`)
  - `img-src 'self' data: blob:`
  - `connect-src` includes WebSocket origins and the Crikket feedback endpoint
  - `object-src 'none'`, `frame-src 'none'`
- **X-Frame-Options: DENY** and **HSTS** in production
- **express-rate-limit** with three independently configured throttles:
  - `/api/auth/login` — 5 failed attempts per IP in 15 minutes triggers a block
  - Upload endpoints — 50 uploads / IP / 15 minutes
  - Media reads — 200 reads / IP / minute
- **Body size limit** — `express.json({ limit: '4mb' })`
- **`app.set('trust proxy', 1)`** — required so that `X-Forwarded-For` is honored when running behind a reverse proxy (Tailscale, Caddy, nginx)

---

## 8. Role-Based Access Control (RBAC)

### 8.1 Role Model

Four roles, stored as a `varchar` column on `users`:

| Role | Level | Description |
|------|-------|-------------|
| `owner` | 4 | Full access. Period lock/archive, all reversals, engine config. |
| `manager` | 3 | Most operations. Approve POs, vendor bills, reversals. Cannot lock periods. |
| `operator` | 2 | Day-to-day operations. No reversals, no period close. |
| `viewer` | 1 | Read-only. No command execution. |

### 8.2 Enforcement Architecture

**Server-side (authoritative):** `assertCommandAccess(commandName, role)` in `src/server/rbac.ts` is called in step 2 of the command pipeline, before any DB access. This is the security boundary. If this check fails, the command throws regardless of what the UI shows.

**Client-side (UX only):** Buttons and actions are conditionally rendered based on `me.data?.role`. The standard idiom is:
```typescript
const canWrite = me.data?.role !== 'viewer';
const canReverse = me.data?.role === 'manager' || me.data?.role === 'owner';
const isOwner = me.data?.role === 'owner';
```
Client-side gating hides controls from unauthorized users for a cleaner UX. It is **not** a security control.

### 8.3 workLoop Field

Users also have a `workLoop` field (`'sales'`, `'intake'`, `'warehouse'`, `'operator'`). This determines the default navigation order and which views are surfaced prominently. It does **not** restrict access to any command or view — it is purely a UX personalization field.

---

## 9. Audit Trail and JSONL Journaling

### 9.1 commandJournal Table

Every command execution writes a row to `commandJournal`. This is the complete, tamper-evident history of every mutation in the system.

**Key fields:**

| Field | Type | Purpose |
|-------|------|---------|
| `id` | uuid | Unique journal entry ID |
| `commandName` | varchar | The command executed |
| `idempotencyKey` | varchar (unique) | Client-stamped key; prevents double-execution |
| `actorId` | uuid | FK to `users` — who ran it |
| `status` | varchar | `'pending'` → `'ok'` or `'failed'` |
| `inputPayload` | jsonb | Verbatim command payload (for retry) |
| `beforeSnapshot` | jsonb | DB rows before the mutation |
| `afterSnapshot` | jsonb | DB rows after the mutation |
| `result` | jsonb | Handler return value |
| `reversedByCommandId` | uuid (self-ref) | Points to the reversal entry if reversed |
| `createdAt` | timestamp | Execution time |

The `inputPayload` column was added in migration `0002_workflow_gap_closure.sql`. Commands executed before that migration do not have stored payloads and cannot be retried via the retry workflow.

### 9.2 JSONL Journal File

Parallel to the database table, every command result is appended to an on-disk **JSONL file** (one JSON object per line, newline-delimited). This provides:
- An offline-readable audit trail independent of the database
- A backup path for compliance review if the DB is unavailable
- A deterministic log that can be replayed or diffed

The JSONL file is written under `JOURNAL_DIR` (configured via environment variable). `ARCHIVE_DIR` is a **separate** directory used for period archive artifacts and bag manifests; the two are not the same path.

### 9.3 Security Redactions

Certain sensitive values are explicitly excluded from the journal:
- **Photo upload tokens** — `mintPhotoUploadToken` returns the token in the command result (one-time), but the token value is **redacted from `commandJournal.result`** before storage. The journal records that a token was minted but not its value.
- **Passwords** — never logged anywhere in the command system (no password-related commands exist; auth is handled outside the command bus).

---

## 10. Reversal System

### 10.1 Architecture

Reversals are not a generic "undo." They are a **hand-crafted compensating operation** for each reversible command. The `reverseCommandById` command handler contains a large dispatch block — one branch per reversible command name.

Each reversal branch:
1. Reads the original command's `beforeSnapshot` and `afterSnapshot` from the journal.
2. Validates pre-conditions (e.g., invoice not yet paid, no prior reversal).
3. Executes the inverse DB operations inside a transaction.
4. Creates a new `commandJournal` entry for the reversal command.
5. Sets `commandJournal.reversedByCommandId` on the original entry.

### 10.2 Pre-conditions by Command

Some reversals have strict pre-conditions enforced in the reversal handler:

| Command being reversed | Pre-condition | Error if violated |
|-----------------------|---------------|------------------|
| `postSalesOrder` | Invoice must have `amountPaid = 0` | "Reverse payment allocations before reversing this sale." |
| Any command | Must have `status = 'ok'` | "Only successful commands can be reversed." |
| Any command | `reversedByCommandId` must be null | "That command has already been reversed." |

### 10.3 What Reversal Does NOT Do

- **Does not delete rows.** The original `commandJournal` entry is preserved. The reversed `salesOrder`, `invoice`, etc. remain in the database with status `'reversed'`.
- **Does not cascade automatically.** Reversing a `postSalesOrder` does not automatically unallocate payments — the operator must do that first as a pre-condition.
- **Does not work on terminal commands.** `lockPeriod`, `archivePeriod`, and other terminal commands have no reversal path in the application. Recovery requires offline maintenance.

---

## 11. Credit Engine

### 11.1 Purpose

The credit engine automatically computes recommended credit limits for customers based on behavioral signals. It runs asynchronously in the background, decoupled from the real-time request path.

### 11.2 Trigger Mechanism

The credit engine runs on-demand via a **recompute queue** AND on a nightly cron. When certain financial events occur (e.g., `postSalesOrder`, `allocatePayment`), the handler inserts a row into `credit_recompute_queue` for the affected customer. A worker processes the queue and updates `customers.creditLimit` (when `creditLimitSource = 'engine'`).

A DB unique constraint (`credit_recompute_queue_pending_unique`) ensures a customer can only have one pending recompute entry at a time — no pile-up from rapid-fire events.

Additionally, a **nightly cron** (`pnpm cron:credit-engine-nightly`) enqueues every customer for recompute and drains the queue, writing `credit_engine_daily_audit` rows. A separate nightly cron (`pnpm cron:balance-reconciliation`) writes `customer_balance_reconciliation` audit rows. Both crons are external scheduled jobs — they are not in-process background threads and must be wired up by the deployment environment.

### 11.3 Stances (Scoring Profiles)

A **stance** (`creditEngineStances`) is a named set of signal weightings that defines how the engine scores a customer. The six signal weight columns are:

- `weight_revenue_momentum`
- `weight_cash_collection`
- `weight_profitability`
- `weight_debt_aging`
- `weight_repayment_velocity`
- `weight_tenure_depth`

Two DB CHECK constraints enforce stance integrity:

- `credit_engine_stances_weights_sum_100` — the six weights must sum to exactly 100.
- `credit_engine_stances_weights_nonneg` — each individual weight must be `>= 0`.

Each customer can be assigned a specific stance via `setCustomerStance`. Without an explicit stance, the engine uses the default stance defined in `setCreditEngineConfig`.

### 11.4 Score Storage

Assessment results are stored in `customer_credit_assessments` — one row per scoring run, with scores between 0 and 100 (DB-enforced). This table is append-only; scores are not updated in place.

### 11.5 Manual Override vs Engine Control

| `creditLimitSource` | Behavior |
|---------------------|---------|
| `'engine'` | Engine updates `customers.creditLimit` on each recompute (capped by `engineMax`) |
| `'manual'` | Engine runs but does not update `creditLimit`; recommendation is advisory only |

When a manual limit goes stale (no engine recompute has occurred recently), the system surfaces a reminder in the Credit Review view. Operators can snooze the reminder (`snoozeCustomerCreditReminder`) for 60 days.

### 11.6 Shadow Mode

The credit engine supports a **shadow mode** where it runs and produces recommendations but does not apply them to `customers.creditLimit`. This allows owners to test new stance configurations or engine parameter changes without affecting live credit decisions.

### 11.7 Configuration History

All changes to `creditEngineConfig` and `creditEngineStances` are logged in append-only history tables (`credit_engine_config_history`, `credit_engine_stance_history`). This provides a complete audit trail of how the engine's behavior has changed over time.

---

## 12. Inventory Movement Tracking

Every inventory quantity change writes an append-only row to the `inventory_movements` table. This provides a complete audit trail at the lot level — separate from and complementary to the command journal.

**Actual schema:**

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `batchId` | uuid | The affected batch. |
| `commandId` | uuid | The command that caused the movement. **No FK constraint** — the column is intentionally loose so a movement row can outlive a journal compaction. |
| `kind` | varchar | One of: `'intake_posted'`, `'manual_adjustment'`, `'status_transfer'`, `'location_transfer'`, `'ownership_transfer'`, `'sale_posted'`, `'pick_return'`. |
| `qtyDelta` | numeric | **Signed delta** — positive for inventory added, negative for inventory removed. There is no `quantityBefore` / `quantityAfter` pair; the running total is reconstructed by summation. |
| `reason` | text | Operator-supplied reason, when relevant. |
| `createdAt` | timestamp | |

There are **no `eventType`, `statusBefore`, `statusAfter`, or `actorId` columns** on this table. Actor identity is recovered by joining `commandId` against `commandJournal.actorId`.

This table is the source of truth for lot-level traceability — useful for compliance, discrepancy investigation, and cost accounting.

---

## 13. Media and File Storage

### 13.1 Storage Model

Batch media (photos, videos) is tracked via the `batchMedia` table. File storage is handled separately from the DB record:
- **Development / self-hosted:** Files stored on the local filesystem under a configured `MEDIA_STORAGE_PATH`.
- **Production:** Designed for object storage (e.g., S3-compatible) via environment configuration. The `batchMedia` table stores the storage path/key.

### 13.2 Upload Token Flow

To support secure mobile uploads (e.g., a photographer using a phone), the system uses single-use, time-limited upload tokens:

1. `mintPhotoUploadToken` — server generates a random token and persists only its **SHA-256 hash** (`token_hash TEXT UNIQUE`). The raw token is **never stored server-side**. The raw token is returned **once only** in the command result.
2. The raw token is **redacted from `commandJournal.result`** before storage. The journal records that a token was minted, but not its value.
3. Tokens are **upload-only**: usable only against `POST /api/upload/media` and only for a single `batch_id`.
4. The token row tracks `last_used_at` and `use_count` so revocation/audit can observe usage.
5. `revokePhotoUploadToken` — operator can invalidate an unused token. A lost raw token cannot be recovered server-side; the operator must revoke and re-mint.

### 13.3 Media Lifecycle

```
uploadBatchMedia → batchMedia{status: 'draft'}
setBatchMediaRole → role assigned ('primary_photo', 'primary_video', 'additional')
publishBatchMedia → batchMedia{status: 'published', publishedAt}
```

The batch's `mediaStatus` field reflects the aggregate media state:
- `'open'` — no published media
- `'ready'` — draft media exists but nothing published
- `'done'` — at least one published primary photo exists

### 13.4 Uniqueness Enforcement

A DB unique index (`batch_media_primary_photo_unique`) ensures only one active published primary photo per batch. A separate index enforces the same for `primary_video`. The application enforces this at the command level (with a clear error message), and the DB enforces it as a last-resort guard.

### 13.5 Deletion Behavior

`deleteBatchMedia` deletes the DB row and makes a **best-effort** attempt to delete the file from storage. If the storage delete fails, the system logs a warning but does not throw. This prevents a storage error from corrupting the DB record and leaving the system in a broken state. Stale files may accumulate in storage and require periodic cleanup.

---

## 14. Frontend Architecture

### 14.1 View Routing

TERP Operator uses **`react-router-dom` v7** (`BrowserRouter`, `Routes`, `Route`) for URL routing. Every primary view has a dedicated URL path (`/dashboard`, `/reports`, `/purchaseOrders`, `/intake`, `/sales`, `/orders`, …).

Zustand (`useUiStore`) manages sub-view state only — drawer open/closed, active entity, palette state, focus mode — but it does **not** own top-level routing.

The `ViewKey` union (`src/shared/types.ts`) remains the canonical list of view identifiers; each value maps to a URL path.

**Rationale:** URLs give every view a deep link, back/forward navigation works as expected, and operators can bookmark or share specific surfaces. Sub-view state (e.g., which entity's drawer is open) stays in Zustand so it survives quick view switches without polluting the URL.

### 14.2 AG Grid Pattern

Every main view is an **AG Grid Enterprise** (`ag-grid-enterprise`) instance wrapped in the `OperatorGrid` component. The enterprise license key is delivered via `VITE_AG_GRID_LICENSE_KEY` and registered with `LicenseManager`. Without a valid key the app runs in unlicensed mode with watermarks.

Enterprise features in active use:
- **Server-side row model** for the very large grids (full inventory, full command journal)
- **Master / detail** for drill-into rows
- **Range selection** for spreadsheet-style copy/paste

Key patterns:
- **≤8 columns per grid** — enforced by a lint/audit rule (`pnpm audit:parity`). Operators scan horizontally; more columns require horizontal scrolling which breaks the spreadsheet feel.
- **Inline editing** — AG Grid's `editable` column option is the default for operator-owned fields. Modal forms are used only when the edit is too complex for an inline cell.
- **Row command actions** — context menus and action columns trigger commands via `useCommandRunner`.
- **Keyboard navigation** — Tab, Enter, Esc, Cmd+C/V work natively via AG Grid. The `OperatorGrid` wrapper does not override AG Grid's default keyboard handling.

### 14.3 Drawer State Machine

The right-side contextual drawer (`ContextDrawer`) follows a defined state machine managed in Zustand:

States: `closed`, `peek`, `standard`, `wide`, `focus`.

**Transitions:**

- `toggleDrawer` (click) — toggles `closed ⇄ lastUsedState`. The default `lastUsedState` is `standard`.
- `cycleDrawer` (shift-click) — cycles **only** through the three visible width states: `standard → wide → focus → standard`. It does not enter `peek` and does not close the drawer.
- `setDrawerTab` on a closed drawer — opens the drawer into **`peek`**. This is the only path into `peek`.

State is stored per **`(view, entityType, entityId)`** key — switching to a different entity in the same view yields a different drawer slot, so the drawer state for one sales order does not bleed onto another.

State is preserved across view switches — an open drawer for a sales order remains open when the operator briefly switches to the inventory view and returns to that same order.

### 14.6 Mobile Shell

TERP Operator ships a dedicated mobile shell, separate from the desktop console:

- Mobile viewports are detected at app startup and auto-redirected to `/mobile/dashboard`.
- Six mobile views: `MobileDashboardView`, `MobileInventoryView`, `MobileCatalogView`, `MobilePaymentsView`, `MobileContactsView`, `MobileContactProfileView`.
- `MobileShell` handles its own authentication flow and intentionally has **no `SideNav`** — the mobile chrome is purpose-built, not a shrunk desktop.
- A separate stylesheet (`styles-mobile.css`) is loaded only on the mobile shell.
- The photography mobile sub-route `/photography/mobile/:batchId` supports in-field photo capture and consumes single-use upload tokens (see §13.2).

### 14.4 useCommandRunner Hook

All command execution from the UI goes through `useCommandRunner`. This hook:
1. Generates the `idempotencyKey` (`${commandName}-${uuidv4()}`).
2. Calls the tRPC mutation.
3. Shows a loading state (disables the triggering button).
4. Shows a success or error toast on completion.
5. Does **not** manually invalidate queries — that is handled by the Socket.io listener.

### 14.5 Hybrid Styling

The UI uses a hybrid styling system:
- **Tailwind CSS** for utility classes (spacing, color, layout).
- **Hand-written semantic CSS classes** (e.g., `.primary-button`, `.view-stack`, `.operator-grid-container`) for core components. These semantic classes are documented in `docs/design-system/`.

The hybrid approach was chosen because the dense, spreadsheet-native UI requires precise control over grid layouts and operator-specific visual patterns that utility-class systems do not express cleanly.

---

## 15. Testing and Verification

### 15.1 Test Suite

| Test type | Tool | Files | What it covers |
|-----------|------|-------|----------------|
| E2E browser | Playwright | `tests/e2e/operator-console.spec.ts` | Core operator flows (16 tests) |
| Adversarial | Playwright | `tests/e2e/adversarial-command-contracts.spec.ts` | Edge cases, guard conditions, security |
| Roadmap gate | Playwright | `tests/e2e/roadmap-final-gate.spec.ts` | Roadmap completion verification |
| Unit / integration | Vitest | `src/**/*.spec.ts` | Command logic, utility functions |

### 15.2 Audit Scripts

| Script | What it checks |
|--------|---------------|
| `pnpm audit:parity` | Command catalog vs. UI parity — every command must have a UI surface |
| `pnpm audit:product-roadmap` | Roadmap capability IDs vs. implemented surfaces |
| `pnpm typecheck` | TypeScript type safety across full monorepo |

### 15.3 CI Gate (Minimum Bar)

The minimum gate for any meaningful change:

```bash
pnpm typecheck
pnpm audit:parity
pnpm audit:product-roadmap
pnpm build
pnpm db:seed
pnpm test:e2e -- tests/e2e/operator-console.spec.ts \
                 tests/e2e/adversarial-command-contracts.spec.ts \
                 tests/e2e/roadmap-final-gate.spec.ts \
                 --project=chromium
```

All 16 Playwright tests passed on Chromium after fresh seed as of the release train close (2026-06-01).

### 15.4 Playwright Environment

E2E tests run against a seeded local database (`pnpm db:seed:realistic`). The fast runner (DigitalOcean) is the preferred environment for E2E runs — Playwright, Chromium, and the full Node.js stack are too heavy for the Mac mini control plane under normal load. See `FAST_RUNNER_POLICY.md`.

---

## 16. Deployment and Environment

### 16.1 Self-Hosted Model

TERP Operator is designed for **owner-controlled, self-hosted infrastructure** — not a multi-tenant SaaS. This is a deliberate product decision: cannabis operators require data sovereignty and do not want their transaction data on third-party servers.

### 16.2 Environment Variables

Key environment variables:

| Variable | Purpose | Production requirement |
|----------|---------|----------------------|
| `DATABASE_URL` | PostgreSQL connection string | Required |
| `DATABASE_SSL` | Enable SSL for the PG connection | Required when the DB enforces TLS |
| `SESSION_SECRET` | `express-session` secret | Must not be the default dev value (server refuses to start) |
| `JOURNAL_DIR` | Path for the on-disk JSONL command journal | Required (distinct from `ARCHIVE_DIR`) |
| `ARCHIVE_DIR` | Path for period archive artifacts and bag manifests | Required |
| `MEDIA_STORAGE_PATH` | Path for batch media file storage | Required (the env var is `MEDIA_STORAGE_PATH`, not `MEDIA_DIR`) |
| `VITE_AG_GRID_LICENSE_KEY` | AG Grid Enterprise license key | Required for an unwatermarked UI |
| `APP_ORIGIN` | Public origin (used by CSP, cookie scope, OAuth-style flows) | Required |
| `PORT` | Listen port | Required (default 8787 in dev) |
| `ENABLE_PHOTOGRAPHY` | Feature flag for the photography mobile sub-route | Optional |
| `ALLOW_DEMO_SEED` | Permit `db:seed:realistic` against this DB | Must be false in production |
| `NODE_ENV` | `'development'` or `'production'` | Affects secret enforcement, error detail level, CSP strictness |

### 16.3 Database Setup

```bash
pnpm db:migrate   # Apply all pending migrations (idempotent)
pnpm db:seed      # Seed minimal data (users, transaction types)
pnpm db:seed:realistic  # Seed a realistic demo dataset (for QA/E2E)
```

### 16.4 Phase 7 Deployment Items

A `docker-compose.prod.yml` already exists in the repository with named volumes (`terp-agro-journal`, `terp-agro-archives`, `terp-agro-media`) mounted under `/app/storage/`. Container port `8787` is mapped to host port `8080`.

Phase 7 deployment work covers hardening, documentation, and secret management — **not** initial Docker support. Remaining Phase 7 concerns:
- Production Docker image hardening (non-root user, distroless base, minimum layers)
- TLS termination and reverse proxy configuration (Tailscale / Caddy / nginx)
- Automated backup and restore procedures
- Environment-specific secret management (Vault, env file conventions)

---

## 17. Known Technical Constraints

| Constraint | Description | Impact |
|-----------|-------------|--------|
| URL routing via react-router-dom v7 | Top-level routing is via URLs; Zustand owns only sub-view state (drawer, entity focus, palette) | Deep links work; routing logic is split across two systems — keep top-level routing out of Zustand. |
| No streaming | tRPC uses standard HTTP request/response | Long-running operations block the connection; no server-sent event streaming |
| Session-based auth only | No JWT, no OAuth, no SSO | Adding SSO requires replacing the auth layer |
| Single-tenant PostgreSQL | One DB per deployment | No multi-tenant row-level security; isolation is per-deployment |
| Reversal is hand-crafted | No generic undo engine | Every new reversible command needs a custom reversal implementation |
| `commandJournal.inputPayload` gap | Not stored for pre-migration commands | Retry not possible for commands executed before `0002_workflow_gap_closure.sql` |
| Failed commands do not auto-retry | Replaying the same `idempotencyKey` returns the cached failed result | Clients must mint a new key to re-attempt |
| Matchmaking status lifecycle | Enforced server-side via `assertValidNeedStatusTransition` / `assertValidSupplyStatusTransition` | Prior gap DYN-H4 / issue #27 is now closed |
| File storage is best-effort on delete | Storage delete failure is logged but not thrown | Stale files may accumulate; no automatic cleanup |
| Photo tokens returned once | Only the SHA-256 hash is persisted; the raw token cannot be recovered | Lost token requires revoking and re-minting |
| AG Grid Enterprise license required | `VITE_AG_GRID_LICENSE_KEY` must be set | Without a valid key the app runs in unlicensed mode with watermarks |
| Money precision | All financial calculations use `decimal.js` with `ROUND_HALF_UP` at 20-digit precision | Native JS floats must never be used for money math |
| Nightly crons required | `pnpm cron:credit-engine-nightly` and `pnpm cron:balance-reconciliation` are external scheduled jobs, not in-process | The deployment environment must schedule them; missing schedules cause stale credit limits and missing reconciliation audit rows |
| `internalOnlyCommandNames` (8) | Backend handlers with no UI surface (issue #111) | Cannot be invoked from the operator console |
| `pendingFrontendCommandNames` (18) | Handler implemented, client wiring pending | Visible in catalog but not yet wired into a view |
