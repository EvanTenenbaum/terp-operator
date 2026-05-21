# Finalization Receipts Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the Phase 1 shared snapshot foundation for finalization receipts (issue #113) — `document_snapshots` table, projection type system, audience-projected server services, and fixture tests — with **no UI, no tRPC client exposure, and no `commandBus.ts` wiring**.

**Architecture:** A new `document_snapshots` table holds audience-projected, immutable, audit-trailed rendered artifacts of finalization records. Projectors live per-kind in `src/server/services/projections/<kind>.ts` and emit either an `ExternalReceiptProjection` (counterparty-safe) or `InternalReceiptProjection` (operator-only). Type-level mutual-exclusion witnesses are re-applied on read by the loader, never persisted on disk. A deterministic canonical JSON helper (RFC 8785-aligned subset: recursive lexicographic key sort, rejects `undefined`/functions; sufficient for the simple JSON shapes Phase 1 emits) + sha256 produces the `content_hash`. The live-head invariant is enforced inside `finalizeSnapshot` by a service-layer transaction that combines a per-`(entity, audience)` `pg_advisory_xact_lock` (the absent-row serializer covering the first-finalize race) with predecessor `FOR UPDATE` (covering amendment row stability) — together this is Option B from spec §7. It is not enforced by a DB-level partial unique index. The router and command-bus layers are untouched in Phase 1.

**Tech Stack:** TypeScript (strict), drizzle-orm + Postgres (hand-written SQL migrations), Vitest, Node `node:crypto`. No new runtime dependencies.

---

## Accepted Defaults — Open Questions 1–8 (from spec §11)

These are confirmed as accepted recommendations before any test scaffolding is written. If implementation surfaces a blocker against any item, the worker must stop and escalate before continuing — they may not silently re-decide.

1. **One row per audience.** Two rows per finalize (external + internal).
2. **Canonical hashing.** Deterministic canonical JSON (RFC 8785-aligned subset: recursive lexicographic key sort; rejects `undefined`/functions to fail-loud on representational drift) → sha256 hex. Phase 1 does **not** implement full RFC 8785 number canonicalization (e.g., the IEEE 754 shortest-round-trip rules); the projector outputs Phase 1 emits do not exercise those edge cases. If a future projector lands floats that need full canonicalization, the helper expands then — tracked as a known risk, not a Phase 1 blocker.
3. **Projector layout.** `src/server/services/projections/<kind>.ts`, one file per kind, each exporting `external`, `internal`, and `projectionVersion`.
4. **`projectionVersion`.** All Phase 1 projectors emit `projection_version = 1`. Bump policy: external-shape change only.
5. **Draft lifetime.** No TTL in Phase 1. Abandoned drafts are explicitly `voidSnapshot`'d with `reason: 'abandoned'`.
6. **Author identity.** Reuses existing operator session id (`SessionUser.id` from `src/server/rbac.ts`). No new identity column.
7. **Money external scope.** Deferred to Phase 4. Phase 1 only declares the kinds and emits stub projectors that pass the same shape/leak invariants the PO and sales kinds enforce.
8. **Migration sequence number.** Integrator-controlled at land time. Plan uses `<NNNN>` placeholders. The current head in `migrations/` at plan-write time is `0046_drop_money_invariants_hotfix.sql`; the worker must `ls migrations/ | sort | tail -3` immediately before writing the file and pick the next free `NNNN`.

---

## File Structure

### New files

| Path | Responsibility |
| --- | --- |
| `migrations/<NNNN>_document_snapshots.sql` | Forward migration: `document_snapshots` table, status/audience/kind enums (via CHECK constraints on `VARCHAR` columns), read-path indexes, content-hash unique partial index scoped to `(source_entity_type, source_entity_id, audience)` for finalized rows, and CHECK constraints for finalized/voided-actor invariants. Live-head uniqueness is **not** a DB-level partial index; it is service-enforced inside `finalizeSnapshot` by a per-`(entity, audience)` `pg_advisory_xact_lock` (absent-row serializer) plus predecessor `FOR UPDATE` (amendment row stability) — Task 6 / spec §7 Option B. |
| `migrations/rollback/<NNNN>_drop_document_snapshots.sql` | Paired rollback: drops indexes, then table. Idempotent (`IF EXISTS`). |
| `src/server/services/documentSnapshots.ts` | Service: `createDraftSnapshot`, `updateDraftSnapshot`, `finalizeSnapshot`, `voidSnapshot`, `getExternalReceipt`, `getInternalReceipt`, `renderSignalText`, `renderPrintHtml`, plus internal `canonicalizeJson` + `hashSnapshot` helpers. |
| `src/server/services/documentSnapshots.test.ts` | Unit tests covering lifecycle, immutability, amendments, live-head serialization (service-enforced, Option B), void/abandon, no-backfill, renderer purity & escaping. Uses mocked `pg.Pool` matching the pattern in `balanceReconciliation.test.ts`. |
| `src/server/services/documentSnapshots.types.test.ts` | Type-level tests. Uses `@ts-expect-error` and `expectTypeOf` to assert mutually exclusive witnesses and renderer signature constraints. Runs under `pnpm typecheck`; vitest skips the body. |
| `src/server/services/projections/types.ts` | Shared `SnapshotKind`, `Audience`, `SourceEntityType`, `ExternalReceiptProjection`, `InternalReceiptProjection`, `Projector<T>` types. Witness declarations live here. |
| `src/server/services/projections/purchaseFinalization.ts` | PO projector. `external` reads only `purchase_orders.external_notes`/`purchase_order_lines.external_notes`. `internal` reads `internal_notes`, landed cost, margin, vendor terms, diagnostics. Exports `projectionVersion = 1`. |
| `src/server/services/projections/salesConfirmation.ts` | Sales-order projector. External strips `internalMargin`, `unitCost`, `unitCostResolved`, `sourceRowKey`, `legacyMarker`, `candidateSourceText`. |
| `src/server/services/projections/invoice.ts` | Invoice projector (built on top of sales-order data). Same external/internal split. |
| `src/server/services/projections/paymentReceived.ts` | Stub Phase 1 projector. Emits a minimal external (customer-safe receipt header + amount) and internal (operator reconciliation context). Real field list pinned in Phase 4. |
| `src/server/services/projections/vendorPayout.ts` | Stub Phase 1 projector matching `paymentReceived` shape but for vendor payouts. Real field list pinned in Phase 4. |
| `src/server/services/projections/purchaseFinalization.test.ts` | PO leak fixture (populated `internal_notes` on header + lines, landed cost, margin, diagnostics). Asserts external projector omits every banned key enumerated in spec §9.3. |
| `src/server/services/projections/salesConfirmation.test.ts` | Sales leak fixture asserting absence of every field in spec §9.4. |
| `src/server/services/projections/persistedShape.test.ts` | Persisted-shape allowlist test: for each kind, asserts the bytes the service writes to `snapshot_json` for the external audience are a subset of the kind's allowlist and contain neither `__EXTERNAL_PROJECTED__` nor `__INTERNAL_ONLY__`. |

### Modified files

| Path | Change |
| --- | --- |
| `src/server/schema.ts` | Append `documentSnapshots` drizzle table definition matching the migration. No edits to existing tables. |

### Files that MUST NOT be touched (spec §10)

- `src/server/services/commandBus.ts`
- Any router file under `src/server/routers/**` (no `documentSnapshots` router added in Phase 1)
- Anything under `src/client/views/**`
- `OperationsViews.tsx`, `SalesView.tsx`, `IntakeView.tsx`

A grep over the PR diff for these paths is part of the Phase 1 verification gate (Task 19).

---

## Task 1: Pick migration number and write forward migration

**Files:**
- Create: `migrations/<NNNN>_document_snapshots.sql`

- [ ] **Step 1: Pick the next migration number**

Run: `ls migrations/ | grep -E '^[0-9]{4}_' | sort | tail -3`
Expected: shows the current head (e.g. `0046_drop_money_invariants_hotfix.sql`).
Take the next zero-padded number. Replace every `<NNNN>` in this plan with that exact number for your run. Do **not** commit a migration that collides with anything on `main`.

- [ ] **Step 2: Write the migration SQL**

Create `migrations/<NNNN>_document_snapshots.sql`:

```sql
-- Issue #113 Phase 1 — Finalization receipts shared snapshot foundation.
--
-- Audience-projected, immutable, audit-trailed rendered artifacts of
-- finalization records. One row per (source_entity, audience, finalize)
-- combination. snapshot_json is already audience-projected at write time —
-- an `external` row never contains internal-only fields on disk.
--
-- Live-head uniqueness (at most one finalized + not-voided + not-superseded
-- row per (source_entity_type, source_entity_id, audience)) is enforced
-- by the service layer inside `finalizeSnapshot` (spec §7 Option B). Two
-- locks combine inside that transaction to serialize the invariant:
--   * A transaction-scoped advisory lock keyed on
--       hashtextextended(source_entity_type || ':' || source_entity_id::text
--                        || ':' || audience, 0)
--     is taken BEFORE the live-head SELECT. This is the load-bearing
--     serializer for the ABSENT-ROW case: the first finalize for an
--     (entity, audience) pair, where there is no predecessor row to lock.
--     All finalize attempts for the same (entity, audience) contend for
--     the identical advisory-lock key. The lock auto-releases on
--     COMMIT / ROLLBACK.
--   * FOR UPDATE on the predecessor row (when the draft has supersedes_id)
--     covers amendment ROW STABILITY only — it stops the predecessor row
--     state from drifting between the live-head SELECT and the finalize
--     UPDATE. The predecessor FOR UPDATE alone does NOT cover the
--     first-finalize race; the advisory lock is required for that path.
--
-- This migration deliberately does NOT create a DB-level partial unique
-- index on the live-head shape, because "not superseded" cannot be
-- expressed cleanly against the same table from a partial-index WHERE
-- clause, and a finalized-and-not-voided-only index would incorrectly
-- reject legitimate amendments where the predecessor is still finalized
-- at finalize time.

CREATE TABLE IF NOT EXISTS document_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind VARCHAR(32) NOT NULL,
  source_entity_type VARCHAR(32) NOT NULL,
  source_entity_id UUID NOT NULL,
  command_id UUID NOT NULL REFERENCES command_journal(id),
  status VARCHAR(16) NOT NULL,
  audience VARCHAR(16) NOT NULL,
  snapshot_json JSONB NOT NULL,
  projection_version INTEGER NOT NULL,
  content_hash VARCHAR(64) NOT NULL,
  supersedes_id UUID REFERENCES document_snapshots(id),
  created_by UUID REFERENCES users(id),
  finalized_by UUID REFERENCES users(id),
  voided_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finalized_at TIMESTAMPTZ,
  voided_at TIMESTAMPTZ,
  CONSTRAINT document_snapshots_kind_check CHECK (kind IN (
    'purchase_finalization','sales_confirmation','invoice',
    'payment_received','vendor_payout'
  )),
  CONSTRAINT document_snapshots_audience_check CHECK (audience IN ('external','internal')),
  CONSTRAINT document_snapshots_status_check CHECK (status IN ('draft','finalized','voided')),
  CONSTRAINT document_snapshots_source_entity_type_check CHECK (source_entity_type IN (
    'purchase_order','sales_order','invoice','payment','vendor_payment'
  )),
  CONSTRAINT document_snapshots_finalized_actor_check CHECK (
    (status <> 'finalized') OR (finalized_by IS NOT NULL AND finalized_at IS NOT NULL)
  ),
  CONSTRAINT document_snapshots_voided_actor_check CHECK (
    (status <> 'voided') OR (voided_by IS NOT NULL AND voided_at IS NOT NULL)
  )
);

-- Read path: "give me the (external|internal) snapshot for this entity".
CREATE INDEX IF NOT EXISTS document_snapshots_entity_idx
  ON document_snapshots (source_entity_type, source_entity_id, audience, status);

-- Walk back to the journaled command.
CREATE INDEX IF NOT EXISTS document_snapshots_command_idx
  ON document_snapshots (command_id);

-- Amendment chain navigation.
CREATE INDEX IF NOT EXISTS document_snapshots_supersedes_idx
  ON document_snapshots (supersedes_id);

-- De-dupe by content_hash *within* an entity+audience scope, for finalized
-- rows only. Cross-entity collisions are deliberately allowed (different POs
-- can legitimately hash to identical external payloads if the content is
-- identical). This is the only partial unique index in the schema — the
-- live-head invariant is service-enforced (see header comment + Task 6).
CREATE UNIQUE INDEX IF NOT EXISTS document_snapshots_finalized_content_unique
  ON document_snapshots (source_entity_type, source_entity_id, audience, content_hash)
  WHERE status = 'finalized';
```

- [ ] **Step 3: Verify forward migration applies cleanly**

Run: `pnpm db:migrate` against a **scratch/local** database only. The worker must point `DATABASE_URL` at a scratch or local Postgres instance for this verification — never production, never staging. Expected: migration `<NNNN>_document_snapshots.sql` appears in `schema_migrations`; `\d document_snapshots` in `psql` shows the columns, indexes, and CHECK constraints above; the only partial unique index reported is `document_snapshots_finalized_content_unique`.

---

## Task 2: Write paired rollback

**Files:**
- Create: `migrations/rollback/<NNNN>_drop_document_snapshots.sql`

- [ ] **Step 1: Write the rollback**

```sql
-- Rollback for migrations/<NNNN>_document_snapshots.sql.
-- Drops indexes first, then the table. Idempotent.
-- WARNING: drops all finalized and draft snapshot rows. Export
-- (pg_dump --table=document_snapshots) before applying in production.

DROP INDEX IF EXISTS document_snapshots_finalized_content_unique;
DROP INDEX IF EXISTS document_snapshots_supersedes_idx;
DROP INDEX IF EXISTS document_snapshots_command_idx;
DROP INDEX IF EXISTS document_snapshots_entity_idx;
DROP TABLE IF EXISTS document_snapshots;
```

- [ ] **Step 2: Verify rollback is idempotent**

Run rollback twice in `psql` against the scratch DB. Expected: first run drops the table; second run is a no-op with no errors.

---

## Task 3: Append drizzle table to `src/server/schema.ts`

**Files:**
- Modify: `src/server/schema.ts` (append only; existing tables untouched)

- [ ] **Step 1: Append the drizzle definition**

After the last existing `pgTable` export (currently `customerBalanceReconciliation` around line 1071), append:

```ts
export const documentSnapshots = pgTable(
  'document_snapshots',
  {
    id: id(),
    kind: varchar('kind', { length: 32 }).notNull(),
    sourceEntityType: varchar('source_entity_type', { length: 32 }).notNull(),
    sourceEntityId: uuid('source_entity_id').notNull(),
    commandId: uuid('command_id').references(() => commandJournal.id).notNull(),
    status: varchar('status', { length: 16 }).notNull(),
    audience: varchar('audience', { length: 16 }).notNull(),
    snapshotJson: jsonb('snapshot_json').$type<Record<string, unknown>>().notNull(),
    projectionVersion: integer('projection_version').notNull(),
    contentHash: varchar('content_hash', { length: 64 }).notNull(),
    supersedesId: uuid('supersedes_id'),
    createdBy: uuid('created_by').references(() => users.id),
    finalizedBy: uuid('finalized_by').references(() => users.id),
    voidedBy: uuid('voided_by').references(() => users.id),
    createdAt: now(),
    finalizedAt: timestamp('finalized_at', { withTimezone: true }),
    voidedAt: timestamp('voided_at', { withTimezone: true })
  },
  (table) => ({
    entityIdx: index('document_snapshots_entity_idx').on(
      table.sourceEntityType, table.sourceEntityId, table.audience, table.status
    ),
    commandIdx: index('document_snapshots_command_idx').on(table.commandId),
    supersedesIdx: index('document_snapshots_supersedes_idx').on(table.supersedesId)
  })
);
```

(Drizzle does not natively express partial unique indexes; the one partial unique index this schema declares — `document_snapshots_finalized_content_unique` — lives in SQL only. That is fine: drizzle is used for reads and INSERTs, not invariant declaration. The live-head invariant is intentionally not a DB-level partial index — see Task 1 migration header comment and Task 6 service-layer implementation.)

- [ ] **Step 2: Verify typecheck passes**

Run: `pnpm typecheck`
Expected: no errors. The new export does not affect any existing module.

---

## Task 4: Create projection type system

**Files:**
- Create: `src/server/services/projections/types.ts`

- [ ] **Step 1: Write the failing import (sanity scaffold)**

Inside `src/server/services/projections/types.ts` write:

```ts
export type SnapshotKind =
  | 'purchase_finalization'
  | 'sales_confirmation'
  | 'invoice'
  | 'payment_received'
  | 'vendor_payout';

export type Audience = 'external' | 'internal';

export type SourceEntityType =
  | 'purchase_order'
  | 'sales_order'
  | 'invoice'
  | 'payment'
  | 'vendor_payment';

export interface ReceiptHeader {
  title: string;
  counterparty: string;
  dateISO: string;
  documentNo: string;
}

export interface ReceiptLine {
  name: string;
  qty: number;
  unitPrice?: number;
  subtotal: number;
  notes?: string;
}

export interface ReceiptTotals {
  subtotal: number;
  adjustments?: number;
  total: number;
}

export interface ExternalReceiptProjection {
  kind: SnapshotKind;
  header: ReceiptHeader;
  lines: ReceiptLine[];
  totals: ReceiptTotals;
  footer?: { terms?: string; reference?: string };
  projectionVersion: number;
  readonly __EXTERNAL_PROJECTED__: true;
}

export interface InternalReceiptProjection
  extends Omit<ExternalReceiptProjection, '__EXTERNAL_PROJECTED__'> {
  internalNotes?: string;
  cogs?: { perLine: Array<{ name: string; unitCost?: number; landedCost?: number }>; total: number };
  margin?: { perLine: Array<{ name: string; marginAbs: number; marginPct: number }>; total: number };
  diagnostics?: { unresolvedSources?: string[]; legacyMarkers?: string[] };
  readonly __INTERNAL_ONLY__: true;
}

export interface Projector<TInput> {
  external: (input: TInput) => Omit<ExternalReceiptProjection, '__EXTERNAL_PROJECTED__'>;
  internal: (input: TInput) => Omit<InternalReceiptProjection, '__INTERNAL_ONLY__'>;
  projectionVersion: number;
}

// Per-kind input types. Declared centrally so projector files import them
// instead of redefining shape locally. Each kind's projector file is the
// owner of further nesting / required-field detail; this file is the
// public contract surface the service layer codes against.
export interface PurchaseFinalizationInput {
  vendorName: string;
  poNo: string;
  dateISO: string;
  internalNotes?: string;
  externalNotes?: string;
  subtotal: number;
  total: number;
  lines: Array<{
    productName: string;
    qty: number;
    unitPrice?: number;
    subtotal: number;
    externalNotes?: string;
    internalNotes?: string;
    landedCost?: number;
    margin?: { abs: number; pct: number };
    diagnostics?: { unresolvedSources?: string[]; legacyMarkers?: string[] };
  }>;
}

export interface SalesConfirmationInput {
  customerName: string;
  soNo: string;
  dateISO: string;
  internalNotes?: string;
  externalNotes?: string;
  subtotal: number;
  total: number;
  lines: Array<{
    productName: string;
    qty: number;
    unitPrice?: number;
    subtotal: number;
    externalNotes?: string;
    internalMargin?: number;
    unitCost?: number;
    unitCostResolved?: boolean;
    sourceRowKey?: string;
    legacyMarker?: string;
    candidateSourceText?: string;
  }>;
}

export interface InvoiceInput extends SalesConfirmationInput {
  invoiceNo: string;
  dueDateISO: string;
}

// Phase 1 stubs. Real field lists pin in Phase 4 (spec §11 Q7).
export interface PaymentReceivedInput {
  customerName: string;
  paymentRef: string;
  dateISO: string;
  amount: number;
  internalReconciliationNotes?: string;
}

export interface VendorPayoutInput {
  vendorName: string;
  payoutRef: string;
  dateISO: string;
  amount: number;
  internalReconciliationNotes?: string;
}
```

The projectors return the **unwitnessed** shape. The service loader applies the witness in memory after schema validation (see Task 6). This guarantees `snapshot_json` on disk never carries the witness key.

- [ ] **Step 2: Verify typecheck passes**

Run: `pnpm typecheck`
Expected: no errors.

---

## Task 5: Canonical JSON + sha256 helper

**Files:**
- Create: helpers live inside `src/server/services/documentSnapshots.ts`
- Create: `src/server/services/documentSnapshots.test.ts` (test scaffold; expanded in later tasks)

- [ ] **Step 1: Write the failing test**

In `src/server/services/documentSnapshots.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { canonicalizeJson, hashSnapshot } from './documentSnapshots';

describe('canonicalizeJson (RFC 8785 subset)', () => {
  it('sorts object keys lexicographically', () => {
    expect(canonicalizeJson({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
  });
  it('preserves array order', () => {
    expect(canonicalizeJson([3, 1, 2])).toBe('[3,1,2]');
  });
  it('recurses into nested objects', () => {
    expect(canonicalizeJson({ z: { b: 1, a: 2 }, a: 1 })).toBe('{"a":1,"z":{"a":2,"b":1}}');
  });
  it('rejects undefined and functions to avoid silent drift', () => {
    expect(() => canonicalizeJson({ a: undefined as unknown as number })).toThrow(/undefined/);
  });
});

describe('hashSnapshot', () => {
  it('produces a 64-char lowercase hex sha256', () => {
    const h = hashSnapshot({ a: 1, b: 2 });
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });
  it('is insensitive to key insertion order', () => {
    expect(hashSnapshot({ a: 1, b: 2 })).toBe(hashSnapshot({ b: 2, a: 1 }));
  });
});
```

Run: `pnpm test src/server/services/documentSnapshots.test.ts`
Expected: fails — module `./documentSnapshots` does not exist yet.

- [ ] **Step 2: Implement helpers**

In `src/server/services/documentSnapshots.ts`:

```ts
import { createHash } from 'node:crypto';

export function canonicalizeJson(value: unknown): string {
  return JSON.stringify(canonValue(value));
}

function canonValue(value: unknown): unknown {
  if (value === null) return null;
  if (typeof value === 'undefined') {
    throw new Error('canonicalizeJson: undefined is not representable');
  }
  if (typeof value === 'function') {
    throw new Error('canonicalizeJson: functions are not representable');
  }
  if (Array.isArray(value)) return value.map(canonValue);
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value as object).sort()) {
      out[k] = canonValue((value as Record<string, unknown>)[k]);
    }
    return out;
  }
  return value;
}

export function hashSnapshot(value: unknown): string {
  return createHash('sha256').update(canonicalizeJson(value)).digest('hex');
}
```

- [ ] **Step 3: Verify tests pass**

Run: `pnpm test src/server/services/documentSnapshots.test.ts`
Expected: PASS for the canonicalize and hash blocks.

---

## Task 6: Implement service lifecycle (draft → finalize → void)

**Files:**
- Modify: `src/server/services/documentSnapshots.ts` (extend)
- Modify: `src/server/services/documentSnapshots.test.ts` (extend)

- [ ] **Step 1: Write failing tests for `createDraftSnapshot` + `finalizeSnapshot` happy path**

Use the mocked-`Pool` pattern from `balanceReconciliation.test.ts`. Test asserts:
- `createDraftSnapshot` inserts with `status='draft'`, returns `{ id, contentHash }`.
- `finalizeSnapshot` updates the row to `status='finalized'`, sets `finalized_at` + `finalized_by`, and rehashes after validating the row is still `draft`.
- `finalizeSnapshot` issues a `pg_advisory_xact_lock(hashtextextended($source_entity_type || ':' || $source_entity_id::text || ':' || $audience, 0))` query whose argument expression is derived from the draft row's `(source_entity_type, source_entity_id, audience)`. The advisory-lock query must be dispatched **after** the draft `SELECT … FOR UPDATE` (Task 6 step 0a — required because the draft's `(source_entity_type, source_entity_id, audience)` are the inputs to the lock key) and **before** the live-head SELECT (Task 6 step 2) and the finalize UPDATE (Task 6 step 4). Assert this by inspecting `pool.query.mock.calls` order (or the equivalent `PoolClient` spy in the mocked-transaction setup). Reading and locking the draft first, then taking the advisory lock, then running the live-head SELECT/recheck, is the supported ordering.
- Both calls require a non-null `commandId`.

- [ ] **Step 2: Implement signatures from spec §5**

> Note on signatures: the spec §5 stubs do not always thread `pool` and `user` parameters explicitly. The implementation tightens them — every service function takes `pool: Pool` as its first parameter (mockable in tests), and `getInternalReceipt` takes `user: SessionUser | null` because authorization must run **before** any DB read. This is an intentional, necessary implementation detail, not a deviation from the spec contract.

```ts
import type { Pool, PoolClient } from 'pg';
import type { Audience, SnapshotKind, SourceEntityType } from './projections/types';

export interface CreateDraftInput {
  kind: SnapshotKind;
  sourceEntityType: SourceEntityType;
  sourceEntityId: string;
  commandId: string;
  audience: Audience;
  payload: Record<string, unknown>;
  projectionVersion: number;
  createdBy: string;
  supersedesId?: string;
}

export async function createDraftSnapshot(
  pool: Pool, input: CreateDraftInput
): Promise<{ id: string; contentHash: string }> { /* INSERT ... */ }

export async function updateDraftSnapshot(
  pool: Pool, input: { id: string; payload: Record<string, unknown> }
): Promise<{ id: string; contentHash: string }> { /* UPDATE WHERE status='draft' */ }

// Option B (spec §7): service-layer live-head serialization.
//
// Two locks combine inside the transaction to serialize all paths:
//   * pg_advisory_xact_lock keyed on (source_entity_type, source_entity_id,
//     audience) — the LOAD-BEARING serializer for every finalize attempt
//     against the same (entity, audience), INCLUDING the first-finalize
//     case where no predecessor row exists to FOR UPDATE.
//   * FOR UPDATE on the draft row (always) and on the predecessor row
//     when supersedes_id is set — covers row stability against concurrent
//     mutations of those specific rows.
// The advisory lock — NOT the predecessor row lock — is what serializes
// the absent-row race between two concurrent first-finalize attempts.
// The advisory lock is transaction-scoped and auto-releases on COMMIT or
// ROLLBACK.
//
//   BEGIN;
//     -- 0a. Lock the draft row itself; verify status='draft'. The draft
//     --     must be read first so the values of source_entity_type,
//     --     source_entity_id, and audience are known — those are the
//     --     inputs to the advisory-lock key in step 0b.
//     SELECT id, kind, source_entity_type, source_entity_id, audience,
//            supersedes_id, status
//       FROM document_snapshots
//      WHERE id = $1
//      FOR UPDATE;
//     -- error if not found / not 'draft'.
//
//     -- 0b. Take the per-(entity, audience) transaction-scoped advisory
//     --     lock BEFORE the live-head SELECT/recheck. All finalize
//     --     attempts for the same (source_entity_type, source_entity_id,
//     --     audience) take the IDENTICAL advisory-lock key, which is
//     --     what serializes the absent-row race (no predecessor row to
//     --     FOR UPDATE in the first-finalize case). The lock releases on
//     --     COMMIT / ROLLBACK; nothing else in the codebase shares this
//     --     key space.
//     SELECT pg_advisory_xact_lock(hashtextextended(
//       $source_entity_type || ':' || $source_entity_id::text
//                            || ':' || $audience,
//       0
//     ));
//
//     -- 2. Find the current live head for this (entity, audience), locking
//     --    it if present. "Live" = finalized + not voided + not superseded.
//     SELECT id
//       FROM document_snapshots
//      WHERE source_entity_type = $2
//        AND source_entity_id   = $3
//        AND audience           = $4
//        AND status = 'finalized'
//        AND voided_at IS NULL
//        AND id NOT IN (
//          SELECT supersedes_id FROM document_snapshots
//           WHERE supersedes_id IS NOT NULL
//        )
//      FOR UPDATE;
//     -- 0 or 1 row.
//
//     -- 3. Apply the recheck rules:
//     --    a. If draft.supersedes_id IS NULL and a live head exists,
//     --       throw 'a live snapshot already exists for this entity and
//     --       audience; finalize as an amendment (supersedesId) instead.'
//     --    b. If draft.supersedes_id IS NOT NULL and either:
//     --         - no live head exists, OR
//     --         - the live head id != draft.supersedes_id,
//     --       throw 'amendment predecessor is stale; refresh and retry.'
//     --    c. If draft.supersedes_id IS NULL and no live head exists,
//     --       proceed (first finalize for this entity+audience).
//     --    d. If draft.supersedes_id IS NOT NULL and matches the live head,
//     --       proceed (legitimate amendment).
//
//     -- 4. Finalize the draft. Do NOT void the predecessor — the predecessor
//     --    stays status='finalized' but ceases to be "live" because its id
//     --    is now pointed to by this row's supersedes_id (the live-head
//     --    SELECT in step 2 excludes superseded rows on subsequent reads).
//     UPDATE document_snapshots
//        SET status='finalized',
//            finalized_by=$5,
//            finalized_at=now()
//      WHERE id=$1 AND status='draft';
//   COMMIT;
//
// The content-hash partial unique index can still raise 23505 if the same
// (entity, audience, content_hash) tuple was already finalized — that is a
// separate, legitimate guard against re-finalizing identical bytes, and it
// is mapped to its own error message (see Task 16 Step 2 note).
export async function finalizeSnapshot(
  pool: Pool, input: { id: string; finalizedBy: string }
): Promise<{ id: string; status: 'finalized'; contentHash: string }> {
  // Implementation must use a single PoolClient and BEGIN/COMMIT/ROLLBACK
  // around the four steps above. Errors thrown inside the transaction must
  // be re-thrown after ROLLBACK so the caller sees them.
}

// Idempotency: a second voidSnapshot on an already-voided row throws a
// clear error ("snapshot is already voided"). It is NOT a silent no-op —
// silent no-op masks operator confusion about whether the action took
// effect. See Task 17.
export async function voidSnapshot(
  pool: Pool, input: { id: string; voidedBy: string; reason: string }
): Promise<{ id: string; status: 'voided' }> { /* UPDATE setting voided_* */ }
```

- [ ] **Step 3: Verify tests pass**

Run: `pnpm test src/server/services/documentSnapshots.test.ts`
Expected: lifecycle tests green.

---

## Task 7: Implement read-path loaders with witness re-application

**Files:**
- Modify: `src/server/services/documentSnapshots.ts`
- Modify: `src/server/services/documentSnapshots.test.ts`

- [ ] **Step 1: Write failing tests**

Asserts:
- `getExternalReceipt(pool, 'purchase_order', poId)` returns `ExternalReceiptProjection | null`.
- Selects only the **live** row: `status='finalized' AND voided_at IS NULL AND NOT EXISTS (supersedes_id = self)`.
- Returned value has `__EXTERNAL_PROJECTED__: true` re-applied in memory.
- Returned `snapshot_json` payload does **not** contain `__EXTERNAL_PROJECTED__` or `__INTERNAL_ONLY__` keys.
- `getInternalReceipt` calls `assertRole(user, 'manager')` before any DB read; if `user` is `null` or role is `viewer`/`operator`, it throws an `UNAUTHORIZED`/`FORBIDDEN` TRPCError.

- [ ] **Step 2: Implement loaders**

```ts
import { assertRole } from '../rbac';
import type { SessionUser } from '../../shared/types';
import type {
  ExternalReceiptProjection, InternalReceiptProjection, SnapshotKind
} from './projections/types';
import { validateExternalShape, validateInternalShape } from './projections';
// validateExternalShape / validateInternalShape are kind-aware and are
// implemented in Task 8 Step 4 once the per-kind allowlists exist.

export async function getExternalReceipt(
  pool: Pool,
  sourceEntityType: SourceEntityType,
  sourceEntityId: string
): Promise<ExternalReceiptProjection | null> {
  const row = await selectLiveRow(pool, sourceEntityType, sourceEntityId, 'external');
  if (!row) return null;
  validateExternalShape(row.snapshot_json, row.kind as SnapshotKind); // throws on unknown / banned keys
  return {
    ...(row.snapshot_json as Omit<ExternalReceiptProjection, '__EXTERNAL_PROJECTED__'>),
    __EXTERNAL_PROJECTED__: true
  };
}

export async function getInternalReceipt(
  pool: Pool,
  user: SessionUser | null,
  sourceEntityType: SourceEntityType,
  sourceEntityId: string
): Promise<InternalReceiptProjection | null> {
  assertRole(user, 'manager'); // before any DB read
  const row = await selectLiveRow(pool, sourceEntityType, sourceEntityId, 'internal');
  if (!row) return null;
  validateInternalShape(row.snapshot_json, row.kind as SnapshotKind);
  return {
    ...(row.snapshot_json as Omit<InternalReceiptProjection, '__INTERNAL_ONLY__'>),
    __INTERNAL_ONLY__: true
  };
}
```

`selectLiveRow` runs a single query with an **explicit column list** (never `SELECT *`, which would couple the loader to future schema additions and risk surfacing columns the projector did not consider):

```sql
SELECT id,
       kind,
       source_entity_type,
       source_entity_id,
       command_id,
       status,
       audience,
       snapshot_json,
       projection_version,
       content_hash,
       supersedes_id,
       created_by,
       finalized_by,
       voided_by,
       created_at,
       finalized_at,
       voided_at
  FROM document_snapshots
 WHERE source_entity_type = $1
   AND source_entity_id   = $2
   AND audience           = $3
   AND status = 'finalized'
   AND voided_at IS NULL
   AND id NOT IN (
     SELECT supersedes_id FROM document_snapshots
      WHERE supersedes_id IS NOT NULL
   )
 LIMIT 1;
```

`validateExternalShape(json, kind)` and `validateInternalShape(json, kind)` are kind-aware: they look up the kind's allowlist (defined in Task 8 Step 2) and assert the JSON is a subset of it. They throw on any unknown top-level or nested key, including the persisted-witness keys `__EXTERNAL_PROJECTED__` and `__INTERNAL_ONLY__` (which must never be on disk). The validators themselves are implemented in **Task 8 Step 4** because they depend on the per-kind allowlist exports that Task 8 Step 2 lands. Task 7 can ship loader bodies that reference them; Task 8 Step 4 wires the real implementation.

- [ ] **Step 3: Verify tests pass**

Run: `pnpm test src/server/services/documentSnapshots.test.ts`

---

## Task 8: Per-kind projectors (PO, sales, invoice, payment, payout)

**Files:**
- Create: `src/server/services/projections/purchaseFinalization.ts`
- Create: `src/server/services/projections/salesConfirmation.ts`
- Create: `src/server/services/projections/invoice.ts`
- Create: `src/server/services/projections/paymentReceived.ts`
- Create: `src/server/services/projections/vendorPayout.ts`

- [ ] **Step 1: PO projector**

Each file exports a typed `Projector<TInput>` using the input type declared in `projections/types.ts` (see Task 4). For PO:

```ts
import type { Projector, PurchaseFinalizationInput } from './types';

export const projectionVersion = 1;

export const purchaseFinalization: Projector<PurchaseFinalizationInput> = {
  projectionVersion,
  external(input) {
    // ALLOWLIST. Reads only: purchase_orders.external_notes,
    // purchase_order_lines.external_notes, header (vendor, po_no, date),
    // line (product_name, qty, unit_price, subtotal), totals.
    return {
      kind: 'purchase_finalization',
      header: { title: 'Purchase Order', counterparty: input.vendorName,
                dateISO: input.dateISO, documentNo: input.poNo },
      lines: input.lines.map((l) => ({ name: l.productName, qty: l.qty,
                                       unitPrice: l.unitPrice, subtotal: l.subtotal,
                                       notes: l.externalNotes })),
      totals: { subtotal: input.subtotal, total: input.total },
      footer: input.externalNotes ? { terms: input.externalNotes } : undefined,
      projectionVersion
    };
  },
  internal(input) { /* reads internal_notes, landed cost, margin, diagnostics */ }
};
```

The external function **must not** reference `internal_notes`, landed-cost fields, margin, vendor terms, or diagnostics. This is enforced structurally: the `external` function parameter type intentionally lacks those fields.

- [ ] **Step 2: Allowlist constants per kind**

Each projector file also exports its external allowlist (for `validateExternalShape`):

```ts
export const externalAllowlist = {
  topLevel: ['kind', 'header', 'lines', 'totals', 'footer', 'projectionVersion'],
  header: ['title', 'counterparty', 'dateISO', 'documentNo'],
  line: ['name', 'qty', 'unitPrice', 'subtotal', 'notes'],
  totals: ['subtotal', 'adjustments', 'total'],
  footer: ['terms', 'reference']
} as const;
```

- [ ] **Step 3: Implement remaining four projectors with the same shape**

Sales-confirmation (`Projector<SalesConfirmationInput>`): external strips `internalMargin`, `unitCost`, `unitCostResolved`, `sourceRowKey`, `legacyMarker`, `candidateSourceText`.

Invoice (`Projector<InvoiceInput>`): same external shape as sales-confirmation plus invoice number / due date.

Payment-received (`Projector<PaymentReceivedInput>`) and vendor-payout (`Projector<VendorPayoutInput>`) are explicit Phase 1 stubs. Real field list pins in Phase 4 (spec §11 Q7). The stub projectors emit the following **minimal explicit shape** so they pass the same allowlist + leak invariants as the full kinds:

```ts
// paymentReceived.external (and vendorPayout.external) shape:
{
  kind: 'payment_received',                      // or 'vendor_payout'
  header: {
    title: 'Payment Received',                   // or 'Vendor Payout'
    counterparty: input.customerName,            // or input.vendorName
    dateISO: input.dateISO,
    documentNo: input.paymentRef                 // or input.payoutRef
  },
  lines: [],                                     // Phase 1 stubs carry no line items
  totals: {
    subtotal: input.amount,
    total: input.amount
  },
  projectionVersion
}
// .internal adds: internalNotes: input.internalReconciliationNotes ?? undefined
```

The empty `lines` array is intentional and pins Phase 1 behavior — Phase 4 will replace it with the real allocation breakdown. The stub still goes through the allowlist + leak-test rig, and the persisted-shape allowlist for both kinds excludes any internal-only key.

- [ ] **Step 4: Implement persisted-shape validators**

Ordering rationale: `validateExternalShape(json, kind)` and `validateInternalShape(json, kind)` depend on the per-kind allowlists exported in Step 2 above, so they must land after the projectors and their allowlist constants exist. Task 7 loaders forward-reference these functions; this step provides the implementations.

Create `src/server/services/projections/index.ts` (a barrel + validator module):

```ts
import type { SnapshotKind } from './types';
import { externalAllowlist as poAllow } from './purchaseFinalization';
import { externalAllowlist as soAllow } from './salesConfirmation';
import { externalAllowlist as invAllow } from './invoice';
import { externalAllowlist as payAllow } from './paymentReceived';
import { externalAllowlist as payoutAllow } from './vendorPayout';

const EXTERNAL_ALLOWLISTS = {
  purchase_finalization: poAllow,
  sales_confirmation:    soAllow,
  invoice:               invAllow,
  payment_received:      payAllow,
  vendor_payout:         payoutAllow
} as const;

const BANNED_KEYS = ['__EXTERNAL_PROJECTED__', '__INTERNAL_ONLY__'] as const;

export function validateExternalShape(
  json: unknown, kind: SnapshotKind
): asserts json is Record<string, unknown> {
  if (json === null || typeof json !== 'object' || Array.isArray(json)) {
    throw new Error(`validateExternalShape: not a JSON object (kind=${kind})`);
  }
  const allow = EXTERNAL_ALLOWLISTS[kind];
  if (!allow) throw new Error(`validateExternalShape: no allowlist for kind=${kind}`);
  for (const banned of BANNED_KEYS) {
    if (banned in (json as object)) {
      throw new Error(`validateExternalShape: persisted witness key '${banned}' is forbidden on disk`);
    }
  }
  for (const k of Object.keys(json as object)) {
    if (!(allow.topLevel as readonly string[]).includes(k)) {
      throw new Error(`validateExternalShape: top-level key '${k}' not in allowlist for ${kind}`);
    }
  }
  // Nested key checks for header/totals/footer/line — assertSubset helper
  // mirrors the persistedShape.test.ts logic to keep one source of truth.
}

export function validateInternalShape(
  json: unknown, kind: SnapshotKind
): asserts json is Record<string, unknown> {
  // Internal allowlist = external allowlist ∪ {internalNotes, cogs, margin, diagnostics}.
  // Implementation mirrors validateExternalShape with the broader allowlist
  // per kind. Banned-witness-key check is identical.
}
```

The validators are imported by Task 7's loaders. Tests for validator behavior live alongside the persisted-shape test in Task 10.

- [ ] **Step 5: Verify typecheck passes**

Run: `pnpm typecheck`
Expected: no errors.

---

## Task 9: PO and sales leak fixture tests

**Files:**
- Create: `src/server/services/projections/purchaseFinalization.test.ts`
- Create: `src/server/services/projections/salesConfirmation.test.ts`

- [ ] **Step 1: Write the PO leak fixture**

The fixture **must populate non-empty internal data** (per spec §6 "External leak tests"):

```ts
const fixture = {
  vendorName: 'Acme', poNo: 'PO-1', dateISO: '2026-05-20',
  internalNotes: 'INTERNAL: vendor pays freight, 2pct early-pay discount',
  externalNotes: 'Net 30',
  lines: [
    { productName: 'Widget', qty: 10, unitPrice: 5, subtotal: 50,
      externalNotes: 'Grade A',
      internalNotes: 'INTERNAL: COGS 3.20',
      landedCost: 3.20, margin: { abs: 1.80, pct: 36 },
      diagnostics: { unresolvedSources: ['ROW#42'] } }
  ],
  subtotal: 50, total: 50
};
```

Assert the external projection output:

```ts
const ext = purchaseFinalization.external(fixture);
const serialized = JSON.stringify(ext);
// Enumerate every banned needle from spec §9.3:
for (const needle of [
  'INTERNAL:', 'landedCost', 'margin', 'unresolvedSources',
  'ROW#42', 'internalNotes', 'vendorTermsInternal'
]) {
  expect(serialized).not.toContain(needle);
}
expect(ext.lines[0].notes).toBe('Grade A'); // external notes present
```

- [ ] **Step 2: Write the sales leak fixture**

Mirror structure. Banned needles: `internalMargin`, `unitCost`, `unitCostResolved`, `sourceRowKey`, `legacyMarker`, `candidateSourceText`.

- [ ] **Step 3: Verify both tests pass**

Run: `pnpm test src/server/services/projections/`
Expected: PASS for both files.

---

## Task 10: Persisted-shape allowlist test

**Files:**
- Create: `src/server/services/projections/persistedShape.test.ts`

- [ ] **Step 1: Write the test**

For each kind, build a fixture, run the projector's `external`, then feed the result through the same `validateExternalShape` the service uses on read:

```ts
import { externalAllowlist as poAllow } from './purchaseFinalization';
// ... etc

function assertSubsetOfAllowlist(obj: Record<string, unknown>, allowed: readonly string[]) {
  for (const k of Object.keys(obj)) expect(allowed).toContain(k);
}

it('purchase_finalization external shape is a subset of the allowlist', () => {
  const ext = purchaseFinalization.external(fixture);
  assertSubsetOfAllowlist(ext, poAllow.topLevel);
  assertSubsetOfAllowlist(ext.header, poAllow.header);
  for (const l of ext.lines) assertSubsetOfAllowlist(l, poAllow.line);
  assertSubsetOfAllowlist(ext.totals, poAllow.totals);
  // Persisted payload must NOT carry the type-level witness:
  expect(ext).not.toHaveProperty('__EXTERNAL_PROJECTED__');
  expect(ext).not.toHaveProperty('__INTERNAL_ONLY__');
});
```

Repeat for all five kinds.

- [ ] **Step 2: Verify tests pass**

Run: `pnpm test src/server/services/projections/persistedShape.test.ts`

---

## Task 11: Renderer `renderSignalText` (deterministic plain text)

**Files:**
- Modify: `src/server/services/documentSnapshots.ts`
- Modify: `src/server/services/documentSnapshots.test.ts`

- [ ] **Step 1: Write failing tests**

The renderer must be a pure function of its input. The purity tests assert two things:

1. **No banned non-deterministic / locale-sensitive APIs are called.** Each API is spied on and asserted not-called. This guards against future maintenance accidentally introducing locale or wall-clock drift into the rendered bytes.
2. **Byte-stable output across runs and across injected inputs.** Calling the renderer twice with the same input produces identical bytes (no embedded timestamps, no random IDs). The same input through a fresh module reload also produces identical bytes.

We deliberately do **not** try to switch process-level locale (`process.env.LC_ALL = 'tr-TR'` etc.) because that is brittle on Node, depends on ICU availability, and a passing test on one CI image can fail on another. The banned-API spies are the load-bearing check; the byte-stability check is the cross-verifier.

```ts
import { vi } from 'vitest';

it('renderSignalText returns a non-empty plain-text string', () => {
  const out = renderSignalText(extFixture);
  expect(out.length).toBeGreaterThan(0);
  expect(out).not.toMatch(/<[^>]+>/);
  expect(out).not.toMatch(/<script|<style|on\w+=/i);
});

it('renderSignalText is deterministic across repeated invocations (byte-stable)', () => {
  const a = renderSignalText(extFixture);
  const b = renderSignalText(extFixture);
  expect(a).toBe(b);
});

it('renderSignalText does not call any banned non-deterministic or locale-sensitive API', () => {
  const dateNow = vi.spyOn(Date, 'now');
  const mathRandom = vi.spyOn(Math, 'random');
  const numberFmt = vi.spyOn(Intl, 'NumberFormat');
  const dateTimeFmt = vi.spyOn(Intl, 'DateTimeFormat');
  const numToLocale = vi.spyOn(Number.prototype, 'toLocaleString');
  const dateToLocale = vi.spyOn(Date.prototype, 'toLocaleString');

  renderSignalText(extFixture);

  expect(dateNow).not.toHaveBeenCalled();
  expect(mathRandom).not.toHaveBeenCalled();
  expect(numberFmt).not.toHaveBeenCalled();
  expect(dateTimeFmt).not.toHaveBeenCalled();
  expect(numToLocale).not.toHaveBeenCalled();
  expect(dateToLocale).not.toHaveBeenCalled();
});

it('renderSignalText is a pure function of its argument (no ambient input)', () => {
  // Two distinct fixtures with the same content must produce the same bytes
  // even if constructed at different points in time. This catches accidental
  // closure over module-scoped variables.
  const fixA = JSON.parse(JSON.stringify(extFixture));
  const fixB = JSON.parse(JSON.stringify(extFixture));
  expect(renderSignalText(fixA)).toBe(renderSignalText(fixB));
});
```

The banned-API list above mirrors the renderer-purity rule in spec §5: no `Date.now`, `Math.random`, `Intl.NumberFormat`, `Intl.DateTimeFormat`, `Number.prototype.toLocaleString`, or `Date.prototype.toLocaleString`. If a future renderer needs formatted dates or currency, it must accept an explicit formatter argument from the caller — the test then asserts the renderer routes through that injected formatter rather than the global one.

- [ ] **Step 2: Implement**

```ts
export function renderSignalText(p: ExternalReceiptProjection): string {
  const lines: string[] = [];
  lines.push(`${p.header.title} ${p.header.documentNo}`);
  lines.push(`To: ${p.header.counterparty}`);
  lines.push(`Date: ${p.header.dateISO}`);
  lines.push('');
  for (const l of p.lines) {
    lines.push(`- ${l.name} x ${l.qty} @ ${l.unitPrice ?? '-'} = ${l.subtotal}`);
    if (l.notes) lines.push(`    ${l.notes}`);
  }
  lines.push('');
  lines.push(`Subtotal: ${p.totals.subtotal}`);
  if (p.totals.adjustments != null) lines.push(`Adjustments: ${p.totals.adjustments}`);
  lines.push(`Total: ${p.totals.total}`);
  if (p.footer?.terms) lines.push(`Terms: ${p.footer.terms}`);
  if (p.footer?.reference) lines.push(`Ref: ${p.footer.reference}`);
  return lines.join('\n');
}
```

The signature is `(p: ExternalReceiptProjection) => string` — passing an `InternalReceiptProjection` is a compile error (verified in Task 13).

- [ ] **Step 3: Verify tests pass**

Run: `pnpm test src/server/services/documentSnapshots.test.ts`

---

## Task 12: Renderer `renderPrintHtml` (escaped minimal HTML)

**Files:**
- Modify: `src/server/services/documentSnapshots.ts`
- Modify: `src/server/services/documentSnapshots.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
it('escapes <, >, &, ", \' in user-supplied notes', () => {
  const fixture = { ...extFixture, lines: [{ ...extFixture.lines[0],
    notes: `<script>alert('x')</script> & "evil"` }] };
  const html = renderPrintHtml(fixture);
  expect(html).not.toMatch(/<script/i);
  expect(html).not.toMatch(/on\w+=/i);
  expect(html).not.toMatch(/javascript:/i);
  expect(html).toContain('&lt;script&gt;');
  expect(html).toContain('&amp;');
  expect(html).toContain('&quot;');
  expect(html).toContain('&#39;');
});

it('emits a well-formed document fragment', () => {
  const html = renderPrintHtml(extFixture);
  expect(html).toMatch(/^<!doctype html>/i);
  expect(html).toContain('</html>');
});
```

- [ ] **Step 2: Implement**

```ts
function esc(s: string): string {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
          .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

export function renderPrintHtml(
  p: ExternalReceiptProjection | InternalReceiptProjection
): string {
  // Phase 1: minimal, escaped, well-formed. No watermark, no styling. Phase 5.
  const lines = p.lines.map((l) =>
    `<tr><td>${esc(l.name)}</td><td>${l.qty}</td><td>${l.subtotal}</td>` +
    `<td>${l.notes ? esc(l.notes) : ''}</td></tr>`
  ).join('');
  return `<!doctype html><html><head><title>${esc(p.header.title)}</title></head>` +
    `<body><h1>${esc(p.header.title)} ${esc(p.header.documentNo)}</h1>` +
    `<p>To: ${esc(p.header.counterparty)} — ${esc(p.header.dateISO)}</p>` +
    `<table>${lines}</table>` +
    `<p>Total: ${p.totals.total}</p>` +
    `</body></html>`;
}
```

- [ ] **Step 3: Verify tests pass**

Run: `pnpm test src/server/services/documentSnapshots.test.ts`

---

## Task 13: Type-level tests (witness exclusivity + renderer signature)

**Files:**
- Create: `src/server/services/documentSnapshots.types.test.ts`

- [ ] **Step 1: Write the test file**

```ts
import { describe, it, expectTypeOf } from 'vitest';
import type {
  ExternalReceiptProjection, InternalReceiptProjection
} from './projections/types';
import { renderSignalText, getExternalReceipt, getInternalReceipt } from './documentSnapshots';

describe('type-level witness exclusivity', () => {
  it('ExternalReceiptProjection cannot be assigned to InternalReceiptProjection', () => {
    const ext = {} as ExternalReceiptProjection;
    // @ts-expect-error — witness mismatch: __EXTERNAL_PROJECTED__ vs __INTERNAL_ONLY__
    const _i: InternalReceiptProjection = ext;
    void _i;
  });

  it('InternalReceiptProjection cannot be assigned to ExternalReceiptProjection', () => {
    const int = {} as InternalReceiptProjection;
    // @ts-expect-error
    const _e: ExternalReceiptProjection = int;
    void _e;
  });

  it('renderSignalText rejects InternalReceiptProjection at the signature', () => {
    const int = {} as InternalReceiptProjection;
    // @ts-expect-error — renderSignalText accepts external only
    renderSignalText(int);
  });

  it('getExternalReceipt return type does not unify with InternalReceiptProjection', () => {
    expectTypeOf(getExternalReceipt).returns
      .not.toMatchTypeOf<Promise<InternalReceiptProjection | null>>();
  });

  it('getInternalReceipt return type does not unify with ExternalReceiptProjection', () => {
    expectTypeOf(getInternalReceipt).returns
      .not.toMatchTypeOf<Promise<ExternalReceiptProjection | null>>();
  });
});
```

- [ ] **Step 2: Verify `pnpm typecheck` enforces the assertions**

Run: `pnpm typecheck`
Expected: PASS. Removing any `@ts-expect-error` should produce a tsc error — verify by deleting one comment temporarily, running `pnpm typecheck`, observing the failure, then restoring it.

- [ ] **Step 3: Verify vitest does not fail on the file**

Run: `pnpm test src/server/services/documentSnapshots.types.test.ts`
Expected: tests pass (the bodies use `void _i` and `expectTypeOf` which evaluate at runtime as no-ops).

---

## Task 14: Immutability of finalized snapshots

**Files:**
- Modify: `src/server/services/documentSnapshots.test.ts`

- [ ] **Step 1: Write the failing test**

Assert `updateDraftSnapshot` against a row that is already `finalized` throws and that no UPDATE statement is dispatched against `snapshot_json`, `content_hash`, `finalized_at`, or `finalized_by`.

```ts
it('updateDraftSnapshot rejects finalized rows and does not mutate state', async () => {
  const pool = makePool([{ rows: [{ id: 'snap-1', status: 'finalized' }] }]);
  await expect(updateDraftSnapshot(pool as unknown as Pool,
    { id: 'snap-1', payload: { tampered: true } })).rejects.toThrow(/finalized/i);
  // Assert no UPDATE query was issued after the SELECT:
  const updateCalls = pool.query.mock.calls
    .filter(([sql]) => /UPDATE\s+document_snapshots/i.test(String(sql)));
  expect(updateCalls).toHaveLength(0);
});
```

- [ ] **Step 2: Implement the guard** (already required by Task 6 signature: `UPDATE ... WHERE status = 'draft'`)

Verify the service does the precondition check by SELECT-then-throw, not by relying solely on a WHERE clause that would silently no-op.

- [ ] **Step 3: Verify test passes**

Run: `pnpm test src/server/services/documentSnapshots.test.ts -t immutability`

---

## Task 15: Amendment chain (`supersedesId`)

**Files:**
- Modify: `src/server/services/documentSnapshots.test.ts`

- [ ] **Step 1: Write the failing tests**

These tests assert the Option B semantics introduced in Task 6: the service layer (not a partial unique index) is the enforcement boundary for the live-head invariant.

**Positive — amendment succeeds against current live head:** `createDraftSnapshot({ supersedesId: prevId })` then `finalizeSnapshot(draftId)` succeeds when `prev` is the current live head for the same `(sourceEntityType, sourceEntityId, audience)`. Asserts:

- predecessor row remains `status='finalized'`, NOT `voided`;
- new row has `supersedes_id = prevId`;
- after finalize, the live-head selector (Task 7) returns the new row, not the predecessor;
- the predecessor is no longer "live" because its id is now in the set of `supersedes_id` values, which the live-head SELECT (Task 6 step 2 / Task 7 selectLiveRow) excludes.

**Negative — cross-entity / cross-audience supersession rejected:** `supersedesId` pointing to a row with a different `source_entity_id` or different `audience` is rejected at the service layer with a clear error message ("supersedesId must point to a snapshot with the same entity and audience"). This is enforced inside `createDraftSnapshot`.

**Negative — finalize without supersedesId when a live head exists is rejected:** if a live head already exists for `(entity, audience)` and a draft is created without `supersedesId`, `finalizeSnapshot` throws a clear service-level error ("a live snapshot already exists for this entity and audience; finalize as an amendment (supersedesId) instead.") inside the transaction. No row is inserted as a parallel live head. The mocked `pool` must return a row from the live-head SELECT (Task 6 step 2) for this test to exercise the recheck.

**Negative — finalize with stale supersedesId is rejected:** if the draft's `supersedes_id` points at a row that is no longer the live head (a competing amendment landed first), `finalizeSnapshot` throws "amendment predecessor is stale; refresh and retry." This is the recheck rule from Task 6 step 3b.

- [ ] **Step 2: Implement the same-entity/same-audience precondition in `createDraftSnapshot`**

Inside `createDraftSnapshot` when `supersedesId` is set:

```ts
const [pred] = await pool.query(
  `SELECT source_entity_type, source_entity_id, audience FROM document_snapshots WHERE id = $1`,
  [input.supersedesId]
).then(r => r.rows);
if (!pred) throw new Error('supersedesId points to a non-existent snapshot');
if (pred.source_entity_type !== input.sourceEntityType ||
    pred.source_entity_id !== input.sourceEntityId ||
    pred.audience !== input.audience) {
  throw new Error('supersedesId must point to a snapshot with the same entity and audience');
}
```

- [ ] **Step 3: Verify tests pass**

Run: `pnpm test src/server/services/documentSnapshots.test.ts -t amendment`

---

## Task 16: Live-head invariant under concurrency (service-enforced)

**Files:**
- Modify: `src/server/services/documentSnapshots.test.ts`

- [ ] **Step 1: Write the failing test**

Simulate two `finalizeSnapshot` calls racing for the same `(entity, audience)`. With Option B (Task 6), serialization is provided by the per-`(entity, audience)` `pg_advisory_xact_lock` taken in Task 6 step 0b — that is what makes the first-finalize absent-row race safe, since there is no predecessor row to `FOR UPDATE`. After both attempts contend for the same advisory key, the loser then fails via the **service-layer recheck** after the live-head SELECT — not via a DB-level unique-violation `23505` on a live-head index (no such index exists), and not via the predecessor row lock (which alone cannot cover the first-finalize race). The test must reflect that:

- Set up the mocked `PoolClient` so that for one call, the live-head SELECT inside the transaction (Task 6 step 2) returns a row whose id does not match the draft's `supersedes_id` (or returns a row when the draft has no `supersedesId` at all). That call must reject with the clear service error from Task 6 step 3a/3b.
- The other call sees no competing live head (or sees one whose id matches its `supersedesId`) and resolves.
- Assert exactly one call resolves; the other rejects with the service-level message ("a live snapshot already exists..." or "amendment predecessor is stale..."); the predecessor (if any) row state in the mocked DB is untouched (no `voided_at`, no status change).
- **Advisory-lock key assertions** (load-bearing for the first-finalize absent-row race):
  - Both racing finalize attempts must dispatch a `pg_advisory_xact_lock` query whose argument expression contains the **identical** lock-key inputs — the same `source_entity_type`, `source_entity_id`, and `audience` triple, threaded through `hashtextextended(source_entity_type || ':' || source_entity_id::text || ':' || audience, 0)`. Compare the captured SQL string and parameter values from `pool.query.mock.calls` (or the equivalent `PoolClient` spy), not the resolved 64-bit integer. This proves both attempts contend for the same lock.
  - A separate pair of finalize attempts against a **different** `(entity, audience)` (e.g., different `source_entity_id` or different `audience`) must use a **different** advisory-lock key input expression — i.e., the captured argument shape differs in the triple — proving independent `(entity, audience)` pairs do not serialize against each other. Assert this when the mock harness makes it straightforward; if mock plumbing makes it awkward, document the omission and rely on the same-key assertion above plus the unit test in Task 6 Step 1.
  - In both racing calls the advisory-lock query is dispatched **after** the draft `SELECT … FOR UPDATE` (step 0a) and **before** the live-head SELECT (step 2). Existing service-level recheck assertions (above) remain in force.

Deterministic simulation is sufficient for Phase 1 (spec §7 / §4 explicitly accept it). A real-Postgres integration variant is welcome but not required for algorithmic soundness — the advisory-lock + service-level-recheck construction is the correctness argument, and mocks can prove both halves.

- [ ] **Step 2: Map the residual 23505 paths to clear errors**

The DB still has `document_snapshots_finalized_content_unique` (content-hash partial unique index, scoped to `(entity, audience, content_hash)` for finalized rows). A `23505` from that index means the same exact bytes have already been finalized for this entity/audience — that is a separate, legitimate guard, not the live-head invariant. Map it to its own message:

```ts
try {
  await tx.query(
    `UPDATE document_snapshots SET status='finalized',
       finalized_by=$1, finalized_at=now()
     WHERE id=$2 AND status='draft'`,
    [finalizedBy, id]
  );
} catch (err: any) {
  if (err?.code === '23505'
    && /document_snapshots_finalized_content_unique/.test(err?.constraint ?? '')) {
    throw new Error(
      'A snapshot with identical content has already been finalized for this entity and audience.'
    );
  }
  throw err;
}
```

This mapping may be exercised by a separate test if relevant; it is **not** the load-bearing path for the concurrent-amendment scenario, which is covered by Step 1's service-level recheck assertions.

- [ ] **Step 3: Verify tests pass**

Run: `pnpm test src/server/services/documentSnapshots.test.ts -t live-head`

---

## Task 17: Void / abandon lifecycle

**Files:**
- Modify: `src/server/services/documentSnapshots.test.ts`

- [ ] **Step 1: Write failing tests**

Three cases:
- `voidSnapshot` on a `draft` with `reason: 'abandoned'` → `status='voided'`, `voided_by`/`voided_at` set, row not deleted.
- `voidSnapshot` on a `finalized` row with any reason → same lifecycle.
- A second `voidSnapshot` on an already-voided row **throws a clear error** ("snapshot is already voided"). It is **not** a silent no-op — silent no-op masks operator confusion about whether the action took effect, and the spec leaves intentional choice to the implementation. We commit to the loud-error behavior. The test asserts both the throw and the absence of any UPDATE statement against `voided_at` / `voided_by` after the precondition fails (so the original void metadata is preserved).

- [ ] **Step 2: Implement**

`voidSnapshot` should: `UPDATE document_snapshots SET status='voided', voided_by=$1, voided_at=now() WHERE id=$2 AND status IN ('draft','finalized') RETURNING id`. Empty `rowCount` triggers an error after a precondition SELECT that distinguishes "not found" from "already voided" so the thrown message is specific (`'snapshot is already voided'` vs `'snapshot not found'`).

- [ ] **Step 3: Verify tests pass**

Run: `pnpm test src/server/services/documentSnapshots.test.ts -t void`

---

## Task 18: No-backfill behavior

**Files:**
- Modify: `src/server/services/documentSnapshots.test.ts`

- [ ] **Step 1: Write the failing test**

For a `source_entity_type='purchase_order'` with no row in `document_snapshots`, both `getExternalReceipt` and `getInternalReceipt` return `null`. No fallback query to `purchaseOrders`. Mock `pool.query` to assert only the `document_snapshots` SELECT runs.

- [ ] **Step 2: Verify the loader already enforces this** (Task 7 implementation has no fallback path — confirm by reading)

- [ ] **Step 3: Verify test passes**

Run: `pnpm test src/server/services/documentSnapshots.test.ts -t no-backfill`

---

## Task 19: Disallowed-files / disallowed-pattern checks + full verification

**Files:**
- No new files. Verification only.

- [ ] **Step 1: Run the disallowed-files diff guard**

Run (replace `main` with the integration target if different):

```bash
git diff --name-only origin/main...HEAD | tee /tmp/changed.txt
```

Then assert none of the following appear in `/tmp/changed.txt`:

- `src/server/services/commandBus.ts`
- Any file under `src/server/routers/` that adds a `documentSnapshots` router (grep PR body for `documentSnapshots` in router file names)
- Any file under `src/client/views/`
- `OperationsViews.tsx`, `SalesView.tsx`, `IntakeView.tsx`

A simple one-liner check:

```bash
git diff --name-only origin/main...HEAD | grep -E \
  'src/server/services/commandBus\.ts|src/server/routers/|src/client/views/|OperationsViews\.tsx|SalesView\.tsx|IntakeView\.tsx' \
  && { echo "DISALLOWED FILES TOUCHED — fail"; exit 1; } \
  || echo "Disallowed-files diff check: PASS"
```

- [ ] **Step 2: Disallowed-pattern grep on new non-test files**

These greps are checklist items; each is a one-liner. If any fires, fix in place before continuing.

  - **No `SELECT *` in new production code.** All new server queries must use explicit column lists (see Task 7's `selectLiveRow`). Run:

    ```bash
    git diff --name-only origin/main...HEAD \
      | grep -E '^src/server/(services|routers)/' \
      | grep -v '\.test\.ts$' \
      | xargs -r grep -nE 'SELECT[[:space:]]+\*' \
      && { echo "FOUND SELECT * in new non-test files — fix to explicit columns"; exit 1; } \
      || echo "SELECT * check: PASS"
    ```

    Test files (`*.test.ts`) are exempted because mocked `pool.query` arguments are sometimes wildcards for assertion convenience.

  - **No raw `snapshotJson` / `snapshot_json` return from new router files.** Phase 1 does **not** add any router file (spec §10). This is therefore a code-review checklist: if Phase 1 unexpectedly grows a router, that is already a Step-1 disallowed-files violation; if it does not, no `snapshotJson` payload can be exposed to a client because no router exposes it. Belt-and-suspenders grep:

    ```bash
    git diff --name-only origin/main...HEAD \
      | grep -E '^src/server/routers/' \
      | xargs -r grep -nE 'snapshot_?[Jj]son' \
      && { echo "Router code references snapshotJson — disallowed in Phase 1"; exit 1; } \
      || echo "Router snapshotJson reference check: PASS"
    ```

    Both conditions are documented here so a future Phase 2+ reviewer can copy the second grep into a lint rule when routers do land.

- [ ] **Step 3: Run `pnpm typecheck`**

Expected: PASS.

- [ ] **Step 4: Run vitest on all new tests**

```bash
pnpm test src/server/services/documentSnapshots.test.ts \
          src/server/services/documentSnapshots.types.test.ts \
          src/server/services/projections/
```

Expected: all PASS.

- [ ] **Step 5: Run the migration smoke against a scratch DB only**

```bash
pnpm db:migrate
```

`DATABASE_URL` must point at a **scratch or local** Postgres instance for this verification — never production, never staging. Expected: `<NNNN>_document_snapshots.sql` recorded in `schema_migrations`. No errors from existing migrations.

- [ ] **Step 6: AQA pass (bounded scope per spec §9.17)**

Phase 1 AQA scope is exactly: leak-vector tests, persisted-shape allowlist, type-safety assertions, immutability, amendment chain, live-head behavior, and void/abandon lifecycle. Out of scope: UI behavior, transport, print layout polish, watermarking, accessibility, end-to-end browser proof.

Run the `aqa` skill against the diff. If the formal AQA runner at `/Users/evantenenbaum/.codex/skills/claude-qa-review/scripts/run_review.py` is not reachable from the executing surface, document the path-restoration blocker in the PR description and proceed with a manual AQA writeup keyed to the same rubric. Target adversarial score `>= 95/100`; if reduced, list each reducer.

---

## Acceptance Criteria Coverage Map (spec §9 ↔ tasks)

| Criterion | Task(s) |
| --- | --- |
| 9.1 Migration + paired rollback | Tasks 1, 2 |
| 9.2 Service exports w/ signatures | Tasks 5, 6, 7, 11, 12 |
| 9.3 PO external-leak fixture | Task 9 |
| 9.4 Sales external-leak fixture | Task 9 |
| 9.5 Mutually exclusive witnesses (type) | Tasks 4, 13 |
| 9.6 `renderSignalText` external-only signature | Tasks 11, 13 |
| 9.7 Persisted shape allowlist | Tasks 8 Step 2 (allowlist consts), 8 Step 4 (validators), 10 |
| 9.8 `renderSignalText` plain-text + deterministic | Task 11 |
| 9.9 `renderPrintHtml` minimal escaped HTML | Task 12 |
| 9.10 Immutability of finalized rows | Task 14 |
| 9.11 Amendment chain integrity | Task 15 |
| 9.12 Live-head under concurrency (service-enforced, spec §7 Option B) | Tasks 6, 16 |
| 9.13 Void / abandon | Task 17 |
| 9.14 No-backfill | Task 18 |
| 9.15 Disallowed-files diff + disallowed-pattern grep | Task 19 Steps 1–2 |
| 9.16 `pnpm typecheck` green | Tasks 3, 4, 13, 19 |
| 9.17 AQA bounded scope + score | Task 19 Step 6 |

---

## QA Tier

- **Plan-writing tier:** Deep QA (per spec §QA tier; this plan touches data integrity and authorization).
- **Implementation tier:** Deep QA throughout Phase 1. Escalates to **Critical** when Phase 5 lands external rendering with transport. Phase 1 itself stays Deep QA.
- **Scoring:** Required for this plan and at the Phase 1 closeout. Rubric per `~/AGENTS.md` Deep QA Gate.
- **AQA runner:** Use the canonical Claude-backed runner at `/Users/evantenenbaum/.codex/skills/claude-qa-review/scripts/run_review.py`. If unavailable from the executing surface, restore the path or document the blocker; do **not** silently substitute a different review stack.

---

## Post-Plan Review Gates

Before any worker starts on Task 1, this plan **must** be reviewed by:

1. **`qa-reviewer`** (Sonnet 4.6) — first-pass plan QA against spec acceptance criteria.
2. **`claude-architect`** (Opus 4.7 xhigh) — adversarial design review of the plan's task decomposition, type design, and SQL invariants. Output is a comment on issue #113.

Both reviews must land before execution. Evan then chooses execution method:

- **Subagent-driven** (recommended): fresh subagent per task, review between tasks, fast iteration. Driver: `pm` coordinator → `build` per task → `qa-reviewer` between tasks.
- **Inline**: `build` or `opus-build` executes tasks sequentially with checkpoints. Use `superpowers:executing-plans`.

No commits happen as part of writing or reviewing this plan. The first commit is at the worker's discretion at a natural checkpoint after Task 3 at the earliest.

---

## Known Risks and Open Items

1. **Migration number collision.** Mitigated by Task 1 Step 1, but sibling worktrees could land between plan review and execution. Worker must re-check `ls migrations/` immediately before writing.
2. **`selectLiveRow` query plan.** The explicit-columns `SELECT … WHERE id NOT IN (subquery)` in `selectLiveRow` is correct but not necessarily the fastest plan. Phase 1 acceptable; Phase 2 may want a denormalized `is_live` column if EXPLAIN shows it matters at the operating row count.
3. **Concurrency simulation vs real concurrency.** Task 16 simulates two racing finalizers via mocked `pg`. The load-bearing **absent-row serializer** in Option B is the per-`(entity, audience)` `pg_advisory_xact_lock(hashtextextended(source_entity_type || ':' || source_entity_id::text || ':' || audience, 0))` taken inside `finalizeSnapshot` (Task 6 step 0b). The predecessor `FOR UPDATE` only covers amendment row stability and cannot serialize the first-finalize race because there is no predecessor row to lock when no live head yet exists. Mocked tests are sufficient to prove algorithmic soundness: they assert (a) both racing calls dispatch the identical advisory-lock key for the same `(entity, audience)`, (b) different `(entity, audience)` pairs produce different lock-key inputs, and (c) the service-level recheck rejects the loser with the correct error. A real-Postgres integration test remains valuable as a Phase 1+ nice-to-have to catch deadlock / lock-ordering bugs across real backend sessions and to verify advisory-lock release on `ROLLBACK`, but it is not required by spec §4 / §7 ("simulate them deterministically") and is not required for algorithmic soundness of Option B.
4. **Phase 4 stub projectors.** `paymentReceived` and `vendorPayout` ship minimal projectors (header + amount + empty lines) so the dispatch and tests exercise all five kinds. Field lists pin in Phase 4. The stubs still go through the same allowlist and leak-test rig.
5. **Witness re-application after read.** Loader applies witnesses in memory. If a future engineer adds an "internal preview" path that bypasses the loader and returns `snapshot_json` directly, the witness invariant breaks silently. Phase 5 should add a lint rule that forbids returning `documentSnapshots.snapshotJson` raw from any router. Task 19 Step 2's `snapshot_?[Jj]son` grep on `src/server/routers/` is a Phase 1 belt-and-suspenders for the (currently empty) router surface and a copy-ready template for that future lint rule.
6. **`assertRole(user, 'manager')` only gates `getInternalReceipt`.** Spec §6.7 explicitly defers retrofitting other margin-bearing views. No action in Phase 1 beyond noting this here.
7. **TypeScript witnesses are not a runtime guarantee on hostile code paths.** The `__EXTERNAL_PROJECTED__` / `__INTERNAL_ONLY__` mutually exclusive witnesses prevent ordinary code from mixing the two projections at compile time, but unsafe code (`as unknown as ExternalReceiptProjection`, hand-built objects, etc.) could construct an object that has both witness keys. The runtime defenses against this are: (a) projectors return the **unwitnessed** shape, so witnesses only enter the value space inside the loader; (b) the persisted-shape allowlist test (Task 10) explicitly fails on a serialized payload that contains either witness key; (c) the runtime validators in Task 8 Step 4 reject any persisted JSON carrying a witness key. Together these mean the only way to get a "both witnesses" object into the system is to hand-write one in non-loader code that bypasses the persisted-shape validators — a Phase 5 lint concern, tracked, not blocking Phase 1.
8. **Canonical JSON is a deterministic subset, not full RFC 8785.** The `canonicalizeJson` helper (Task 5) implements RFC 8785-aligned lexicographic key sort and rejects `undefined`/functions, which is sufficient for the simple JSON shapes Phase 1 projectors emit. It does **not** implement full RFC 8785 number canonicalization (IEEE 754 shortest-round-trip rules). If a future projector lands floats that exercise those edge cases, the helper expands — tracked here, not blocking Phase 1.

— End of plan —
