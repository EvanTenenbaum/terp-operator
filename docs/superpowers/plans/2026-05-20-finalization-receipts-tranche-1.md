# Finalization Receipts Tranche 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the shared `document_snapshots` foundation (Phase 0) and wire the PO vendor finalization receipt vertical (Phase 1) with server-side external projection allowlists, role-gated internal/external endpoints, and a copy/print-capable receipt preview integrated into `PurchaseOrdersView`.

**Architecture:** A single `document_snapshots` table stores authoritative `internal_payload` per document and a server-generated `external_payload`. Per-`document_type` pure projection modules expose an additive `EXTERNAL_FIELDS` allowlist, a `PROJECTION_VERSION` integer, and `projectExternal(internal)`. The PO finalization command writes a finalized snapshot (consuming any prior draft, or creating v1 if no draft exists); unfinalize voids the active finalized snapshot; new draft commands (`saveDraftPurchaseOrderReceipt`, `abandonDraftPurchaseOrderReceipt`) manage operator-editable drafts without autosave. A new `documentSnapshots` tRPC router exposes `getInternalBySubjectId` (role-gated to `owner|manager|operator`), `getExternalBySubjectId` (any authenticated user, finalized-only), `getById` (operator+ only, with a `documentType === 'purchase_order'` row check), `listVersions`, and `getReceiptText` (operator+ may pass `includeDrafts: true` to preview active drafts). The `ReceiptPreview` client component renders external-or-internal payload via the server-side plain-text renderer endpoint and supports copy/print with an `INTERNAL — DO NOT SEND` watermark for internal copies; viewers reach the receipt only via the viewer external endpoint (finalized-only), while operators reach drafts via the operator-gated path. The component renders through a React portal to `document.body` so the `.receipt-preview-overlay` is a direct body child and the print stylesheet behaves correctly. It integrates additively into `PurchaseOrdersView` and preserves existing grid selection/sort/filter via `useUiStore`.

**Command-history leak guard:** `documentSnapshots` rows containing `internalPayload` MUST NOT be added raw to generic `snapshotByAffectedIds` snapshots (the command journal's `tablePairs` array). In Tranche 1, exclude `documentSnapshots` from `tablePairs` AND do not include the snapshot row id in any command's `affectedIds`. Receipt-related commands (`finalizePurchaseOrder`, `unfinalizePurchaseOrder`, `saveDraftPurchaseOrderReceipt`, `abandonDraftPurchaseOrderReceipt`) return `affectedIds` containing only the parent PO id; snapshot provenance is recorded on the `documentSnapshots` row itself via `generatedByCommandId`. Add tests for `queries.relatedCommands` and reversal-preview to confirm command history never exposes `internalPayload`/`externalPayload`/snapshot UUIDs for document snapshots to viewers.

**Tech Stack:** React 18, Vite, TypeScript strict, tRPC v10, Drizzle ORM, PostgreSQL, Vitest, Playwright, AG Grid.

---

## Tranche 1 Security & Lifecycle Defaults (locked-in)

These are the conservative defaults this tranche implements. They are referenced by name in the tasks below.

### Security defaults

1. **Viewer/external retrieval returns FINALIZED snapshots only.** Draft snapshots are operator-internal only; viewers never receive a draft in any external payload, text, or UI control. The viewer-facing `getExternalBySubjectId` returns NOT_FOUND for subjects whose only active snapshot is a draft.
2. **Operator-only draft preview path.** Internal roles (`owner | manager | operator`) MAY preview the active draft snapshot for a subject through operator-gated endpoints:
   - `getInternalBySubjectId` returns the full active snapshot row (draft or finalized) including both `internal_payload` and `external_payload`.
   - `getReceiptText` accepts an operator-only `includeDrafts: boolean` flag (default `false`). When `includeDrafts: true` AND `mode: 'external'` AND the caller is operator+, the procedure renders `renderPlainTextExternal` against the active row's `external_payload` so the operator can preview the external rendering of an active draft. The flag is rejected (FORBIDDEN) when the caller is `viewer`.
   - `ReceiptPreview`'s viewer path calls `getReceiptText({ mode: 'external' })` (no flag) — finalized-only. The operator path calls `getReceiptText({ mode, includeDrafts: true })` so operators can preview drafts in either mode; the external operator preview is rendered server-side from the operator-fetched `external_payload`, not by routing the viewer through any draft endpoint.
3. **Role-gating granularity (roadmap §9, now resolved).** `viewer` is restricted to external payloads only AND finalized snapshots only. `owner`, `manager`, `operator` may read internal payloads and active drafts for `purchase_order` snapshots. There is no per-document-type override in Tranche 1; the read gate lives in the `documentSnapshots` router. Server-side enforcement is the source of truth; the client never branches on role to mask fields inside an external payload.
4. **Tranche 1 router accepts only `documentType: 'purchase_order'`.** Phase 2/3 types (`sales_order`, `customer_payment`, `vendor_payout`) are rejected at the router boundary until implemented. `getById` additionally enforces `row.documentType === 'purchase_order'`; any row of another type returns NOT_FOUND so `getById` cannot be used as a cross-type bypass.
5. **`getById` and `listVersions` are operator+ only in Tranche 1.** Viewer variants that return only minimized finalized external shapes (no `internalPayload`, no `generatedByCommandId`, no internal IDs) are deferred. Prefer operator+ only for simplicity.

### Draft/finalized lifecycle defaults

6. **Save draft receipt is allowed only on draft POs in Tranche 1.** A finalized PO cannot have a draft snapshot saved alongside it; this prevents coexisting draft + finalized active snapshots. The server-side guard (in `commandBus.ts` AND a defensive guard in `snapshotService.ts`) enforces this, not only the UI.
7. **Explicit Save Draft creates or updates the single active draft snapshot for the subject PO.** There is **no autosave**. If an active draft already exists, Save Draft UPDATES that same row (same id, same version) — it does not insert a second row.
8. **Abandon draft transitions the active draft row to `status='void'`.**
9. **Finalize consumes any active draft IN PLACE by UPDATING the same row from `status='draft'` to `status='finalized'`** (same id, same version, refreshed payloads). If no active draft exists, Finalize INSERTS a new finalized row at `version = max(version) + 1` (or `1` if no prior row).
10. **Unfinalize voids the active finalized snapshot** (`status → 'void'`).
11. **Refinalize after unfinalize creates v2**; v1 remains `void`, not `superseded`. No Tranche 1 normal path produces a `superseded` row.
12. **`superseded` is schema-reserved for future direct regeneration/amendment** (Phase 4+) where the prior finalized row is replaced without an intermediate unfinalize. The status check constraint includes `'superseded'` so Phase 4 migrations do not need to alter the constraint; Tranche 1 code paths never write it.
13. **The partial unique index `(document_type, subject_id) WHERE status IN ('draft', 'finalized')` remains valid in Tranche 1.** Because finalize either updates a draft in place or inserts only after unfinalize voided the prior finalized row, draft and finalized never coexist for the same subject.

These defaults MUST be honored by all tasks below.

---

## PO External Allowlist (locked-in, test-asserted)

The `purchase_order` projection's `EXTERNAL_FIELDS` allowlist (header-level, line-level, and excluded sets) is locked here so every later task references the same shape.

**Header-level external fields (included):**

- `poNo`
- `vendorName`
- `vendorAlias` (nullable)
- `expectedDate` (nullable)
- `paymentTerms`
- `prepaymentAmount`
- `externalNotes` (PO-level external notes)
- `finalizedAt`
- `total`
- `lines` (array of allowlisted line fields below)

**Line-level external fields (included), per element of `lines`:**

- `productName`
- `category`
- `qty`
- `uom`
- `unitCost` (rendered with the human label "Vendor unit price")
- `costRangeLow` (nullable, rendered with the human label "Vendor price range low")
- `costRangeHigh` (nullable, rendered with the human label "Vendor price range high")
- `externalNotes`

**Explicitly excluded (test-asserted in `poProjection.test.ts`):**

- PO-level: `internalNotes`, `buyerNotes`, `refereeRelationshipId`, `refereeCreditAmount`, `id`, `vendorId`, `orderedBy`, `status`
- Line-level: `unitPrice` (planned resale/markup — internal), `internalNotes`, `notes`, `sourceCode`, `legacyMarker`, `ownershipStatus`, `shorthand`, `itemId`, `receivedQty`, `status`, `id`, `purchaseOrderId`

Any key outside `EXTERNAL_FIELDS` reaching `external_payload` is a projection error and MUST throw at projection time (not at render time).

---

## File Structure Map

### New files

| File | Responsibility |
|---|---|
| `migrations/0047_document_snapshots.sql` | Forward migration: create `document_snapshots` table + indexes |
| `migrations/rollback/0047_drop_document_snapshots.sql` | Reverse migration |
| `src/shared/documentSnapshots.ts` | Shared `DocumentType`, `DocumentStatus`, `DocumentSnapshot` TS types + Zod schemas (no behavior) |
| `src/server/services/documentSnapshots/index.ts` | Projection registry: `getProjectionFor(documentType)` returns `{ EXTERNAL_FIELDS, PROJECTION_VERSION, projectExternal, renderPlainText }` |
| `src/server/services/documentSnapshots/poProjection.ts` | PO projection module — `EXTERNAL_FIELDS`, `PROJECTION_VERSION = 1`, `projectExternal`, `renderPlainTextExternal`, `renderPlainTextInternal` |
| `src/server/services/documentSnapshots/poInternalBuilder.ts` | Pure builder that, given DB rows for one PO (header + lines + vendor), returns the full `internal_payload` JSON shape |
| `src/server/services/documentSnapshots/snapshotService.ts` | DB-bound service: `createFinalizedSnapshotForPurchaseOrder(tx, purchaseOrderId, commandId)`, `voidActiveSnapshotForPurchaseOrder(tx, purchaseOrderId, commandId)`, `saveOrUpdateDraftSnapshotForPurchaseOrder(tx, purchaseOrderId, commandId)`, `abandonDraftSnapshotForPurchaseOrder(tx, purchaseOrderId, commandId)` |
| `src/server/routers/documentSnapshots.ts` | tRPC router exposing `getById`, `getInternalBySubjectId`, `getExternalBySubjectId`, `listVersions`, `getReceiptText`. Role gate on internal endpoints; Tranche 1 rejects non-PO document types. |
| `src/client/components/ReceiptPreview.tsx` | Universal receipt preview component: props `{ subjectId, documentType, mode: 'external' \| 'internal', onClose }`; renders plain-text, owns Copy/Print buttons; internal mode prefixes `INTERNAL — DO NOT SEND` watermark in displayed and copied text. |
| `src/server/services/documentSnapshots/poProjection.test.ts` | Vitest unit tests for projection allowlist + leak guard |
| `src/server/services/documentSnapshots/snapshotService.test.ts` | Vitest unit tests for create/void/draft/supersede transitions (mocked tx) |
| `src/server/routers/documentSnapshots.test.ts` | Vitest unit tests for role gating + endpoint payload shape |
| `src/server/services/commandBus.poSnapshot.test.ts` | Vitest integration tests for `finalizePurchaseOrder`/`unfinalizePurchaseOrder`/`saveDraftPurchaseOrderReceipt`/`abandonDraftPurchaseOrderReceipt` snapshot side effects (mocked DB module) |
| `src/client/components/ReceiptPreview.test.tsx` | Vitest + Testing Library tests for renderer output and internal-watermark behavior |
| `tests/e2e/po-finalization-receipt.spec.ts` | Playwright: finalize PO → open receipt preview → copy/print → preserved table state |

### Modified files

| File | Change |
|---|---|
| `src/server/schema.ts` | Add `documentSnapshots` `pgTable` definition + `DocumentSnapshot`/`NewDocumentSnapshot` type exports. No other tables change. |
| `src/shared/commandCatalog.ts` | Add `saveDraftPurchaseOrderReceipt`, `abandonDraftPurchaseOrderReceipt` to `commandNames` and to `commandLabels`, `commandMinRole`, `reversalPolicies` maps |
| `src/server/services/commandBus.ts` | (a) Import snapshot service helpers; (b) extend `finalizePurchaseOrder` to call `createFinalizedSnapshotForPurchaseOrder` (which consumes any active draft IN PLACE — no `superseded` is ever written on Tranche 1 paths); (c) extend `unfinalizePurchaseOrder` to call `voidActiveSnapshotForPurchaseOrder`; (d) register new `saveDraftPurchaseOrderReceipt` and `abandonDraftPurchaseOrderReceipt` commands; (e) **do not add raw `documentSnapshots` to `snapshotByAffectedIds` tablePairs** AND **do not include the snapshot row id in any command's `affectedIds`** — receipt-related commands return `affectedIds` containing the parent PO id only; snapshot provenance is recorded on the `document_snapshots` row itself via `generatedByCommandId`. Command-history leak guards per Task 10 Step 4 assert both. |
| `src/server/routers/index.ts` | Mount `documentSnapshotsRouter` under `documentSnapshots` |
| `src/client/views/OperationsViews.tsx` (`PurchaseOrdersView`) | Add three receipt buttons: **Save draft** (`canWrite`-only, visible/enabled for draft POs only), **Abandon draft** (`canWrite`-only, visible/enabled only when the selected PO has an active draft snapshot), and **Preview receipt** (read action visible to viewers/operators only when the selected PO has an active finalized snapshot; internal mode remains operator+ only). Preview opens `ReceiptPreview` modal. Table state (selection, sort, filter via `useUiStore.gridFilters` and `useUiStore.selectedRows`) is preserved across all three actions; the modal is overlay-only and does not unmount the grid. |
| `docs/design-system/decisions-log.md` | Append a Tranche 1 implementation entry after final commit (covered in the closeout task) |

### Unchanged (asserted by tests where relevant)

- `purchase_orders` and `purchase_order_lines` columns and existing PO command flow (`createPurchaseOrder`, `updatePurchaseOrder`, `approvePurchaseOrder`, `receivePurchaseOrder`, `cancelPurchaseOrder`, `recordVendorPrepayment`, all line commands).
- All other views and routers.

---

## Tasks

### Task 0: Rebase onto latest `origin/main` before baseline

> **Worktree state note for the integrator:** at the time this plan was authored, the branch `plan/finalization-receipts-113-20260520` was `behind 1` commit relative to `origin/main`, and this plan file (plus `docs/roadmap/2026-finalization-receipts-roadmap.md`, `docs/roadmap/README.md`, `docs/design-system/decisions-log.md`) was still uncommitted in the worktree. **Do not rebase against an uncommitted tree.** Commit (or `git stash --include-untracked`) the planning docs first, then perform the rebase. If you stash, restore the stash after the rebase so the plan remains available for execution.

- [ ] **Step 1: Commit or stash uncommitted planning docs**

Run:
```bash
git status --short
```
Expected: shows the two planning docs as untracked (`??`) and `decisions-log.md`/`README.md` as modified (`M`). Choose one of:

- **Preferred (commit):**
  ```bash
  git add docs/superpowers/plans/2026-05-20-finalization-receipts-tranche-1.md \
          docs/roadmap/2026-finalization-receipts-roadmap.md \
          docs/roadmap/README.md \
          docs/design-system/decisions-log.md
  git commit -m "docs(receipts): roadmap + Tranche 1 plan for finalization receipts (#113)"
  ```
- **Alternative (stash):**
  ```bash
  git stash push --include-untracked -m "wip: receipts planning docs (#113)"
  ```
  After the rebase in Step 2, run `git stash pop` to restore.

- [ ] **Step 2: Fetch and rebase**

Run:
```bash
git fetch origin && git rebase origin/main
```
Expected: clean fast-forward / rebase. If conflicts appear in planning docs only, resolve in favor of the working-tree version (the plan and roadmap were authored on this branch).

- [ ] **Step 3: No further commit**

This is a setup-only task.

---

### Task 1: Baseline check — typecheck + targeted PO tests pass on `main`

**Files:**
- Read: `package.json` scripts, `src/server/services/commandBus.ts`, `src/server/routers/queries.ts`, `tests/e2e/operator-console.spec.ts`.

- [ ] **Step 1: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS with zero errors. If errors exist, stop and triage before continuing — they are not from this plan.

- [ ] **Step 2: Run vitest in changed-files mode against PO command tests**

Run: `pnpm test -- src/server/services/commandBus.idempotency.test.ts`
Expected: PASS (existing idempotency tests are unaffected by this tranche; this confirms the test harness is healthy).

- [ ] **Step 3: Confirm e2e PO smoke baseline (informational; do not commit)**

Run: `PLAYWRIGHT_SKIP_WEB_SERVER=1 pnpm exec playwright test tests/e2e/operator-console.spec.ts --project=chromium --workers=1 --grep "backend-wired operator abilities"`
Expected: PASS or known-blocker note. If failing in a way unrelated to this tranche, record the blocker and continue (the new Playwright spec added in Task 23 is the gate, not this one).

- [ ] **Step 4: Commit (no-op marker)**

No commit. This is a baseline check task only.

---

### Task 2: Create migration `0047_document_snapshots.sql` + rollback

**Files:**
- Create: `migrations/0047_document_snapshots.sql`
- Create: `migrations/rollback/0047_drop_document_snapshots.sql`

- [ ] **Step 1: Write the migration**

Create `migrations/0047_document_snapshots.sql` with:

```sql
-- Issue #113: Finalization Receipts — shared document_snapshots foundation.
-- See docs/roadmap/2026-finalization-receipts-roadmap.md §4.1.

CREATE TABLE IF NOT EXISTS document_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_type varchar(32) NOT NULL,
  subject_id uuid NOT NULL,
  version integer NOT NULL DEFAULT 1,
  status varchar(16) NOT NULL DEFAULT 'finalized',
  internal_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  external_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  projection_version integer NOT NULL DEFAULT 1,
  generated_by_command_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT document_snapshots_status_chk
    CHECK (status IN ('draft', 'finalized', 'superseded', 'void')),
  CONSTRAINT document_snapshots_document_type_chk
    CHECK (document_type IN ('purchase_order', 'sales_order', 'customer_payment', 'vendor_payout'))
);

CREATE INDEX IF NOT EXISTS document_snapshots_type_subject_idx
  ON document_snapshots (document_type, subject_id);

CREATE INDEX IF NOT EXISTS document_snapshots_subject_version_idx
  ON document_snapshots (subject_id, version DESC);

CREATE INDEX IF NOT EXISTS document_snapshots_status_type_idx
  ON document_snapshots (status, document_type);

-- Unique index: (document_type, subject_id, version) must be unique.
CREATE UNIQUE INDEX IF NOT EXISTS document_snapshots_type_subject_version_unique
  ON document_snapshots (document_type, subject_id, version);

-- Partial unique index: at most ONE active (draft|finalized) snapshot per
-- (document_type, subject_id). This is the structural enforcement of the
-- Tranche 1 "no draft+finalized coexistence" invariant.
CREATE UNIQUE INDEX IF NOT EXISTS document_snapshots_active_unique
  ON document_snapshots (document_type, subject_id)
  WHERE status IN ('draft', 'finalized');
```

- [ ] **Step 2: Write the rollback**

Create `migrations/rollback/0047_drop_document_snapshots.sql`:

```sql
-- Rollback of 0047_document_snapshots.sql.
DROP INDEX IF EXISTS document_snapshots_active_unique;
DROP INDEX IF EXISTS document_snapshots_type_subject_version_unique;
DROP INDEX IF EXISTS document_snapshots_status_type_idx;
DROP INDEX IF EXISTS document_snapshots_subject_version_idx;
DROP INDEX IF EXISTS document_snapshots_type_subject_idx;
DROP TABLE IF EXISTS document_snapshots;
```

- [ ] **Step 3: Run migration locally**

Run: `pnpm db:migrate`
Expected: Migration `0047_document_snapshots.sql` reported as applied; no errors.

- [ ] **Step 4: Verify table shape via psql / pool**

Run: `pnpm tsx -e "import { pool } from './src/server/db'; const r = await pool.query(\"select column_name, data_type from information_schema.columns where table_name='document_snapshots' order by ordinal_position\"); console.log(r.rows); await pool.end();"`
Expected: Columns reported in declared order with declared types.

- [ ] **Step 5: Commit**

```bash
git add migrations/0047_document_snapshots.sql migrations/rollback/0047_drop_document_snapshots.sql
git commit -m "feat(receipts): add document_snapshots table + indexes (#113)"
```

---

### Task 3: Extend `src/server/schema.ts` with `documentSnapshots` table + types

**Files:**
- Modify: `src/server/schema.ts` (append a new `pgTable` definition after the `commandJournal` block, before the export type declarations)

- [ ] **Step 1: Write the failing test**

Create `src/server/services/documentSnapshots/schema.smoke.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { documentSnapshots } from '../../schema';

describe('document_snapshots schema', () => {
  it('exposes documentSnapshots with expected columns', () => {
    expect(documentSnapshots).toBeDefined();
    // Drizzle pgTable exposes column accessors as properties.
    const required = [
      'id', 'documentType', 'subjectId', 'version', 'status',
      'internalPayload', 'externalPayload', 'projectionVersion',
      'generatedByCommandId', 'createdAt', 'updatedAt'
    ] as const;
    for (const col of required) {
      expect((documentSnapshots as unknown as Record<string, unknown>)[col]).toBeDefined();
    }
  });
});
```

Run: `pnpm test -- src/server/services/documentSnapshots/schema.smoke.test.ts`
Expected: FAIL with `documentSnapshots is not exported from schema`.

- [ ] **Step 2: Implement the schema entry**

In `src/server/schema.ts`, add an import for `index` and `uniqueIndex` (already imported) and append after the `commandJournal` declaration:

```ts
export const documentSnapshots = pgTable(
  'document_snapshots',
  {
    id: id(),
    documentType: varchar('document_type', { length: 32 }).notNull(),
    subjectId: uuid('subject_id').notNull(),
    version: integer('version').notNull().default(1),
    status: varchar('status', { length: 16 }).notNull().default('finalized'),
    internalPayload: jsonb('internal_payload').$type<Record<string, unknown>>().notNull().default({}),
    externalPayload: jsonb('external_payload').$type<Record<string, unknown>>().notNull().default({}),
    projectionVersion: integer('projection_version').notNull().default(1),
    generatedByCommandId: uuid('generated_by_command_id'),
    createdAt: now(),
    updatedAt: updated()
  },
  (table) => ({
    typeSubjectIdx: index('document_snapshots_type_subject_idx').on(table.documentType, table.subjectId),
    subjectVersionIdx: index('document_snapshots_subject_version_idx').on(table.subjectId, table.version),
    statusTypeIdx: index('document_snapshots_status_type_idx').on(table.status, table.documentType),
    typeSubjectVersionUnique: uniqueIndex('document_snapshots_type_subject_version_unique')
      .on(table.documentType, table.subjectId, table.version),
    activeUniqueIdx: uniqueIndex('document_snapshots_active_unique').on(table.documentType, table.subjectId)
      .where(sql`${table.status} IN ('draft', 'finalized')`)
  })
);

export type DocumentSnapshot = typeof documentSnapshots.$inferSelect;
export type NewDocumentSnapshot = typeof documentSnapshots.$inferInsert;
```

- [ ] **Step 3: Run test to verify it passes**

Run: `pnpm test -- src/server/services/documentSnapshots/schema.smoke.test.ts`
Expected: PASS.

- [ ] **Step 4: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/schema.ts src/server/services/documentSnapshots/schema.smoke.test.ts
git commit -m "feat(receipts): add documentSnapshots drizzle table + types (#113)"
```

---

### Task 4: Add shared types in `src/shared/documentSnapshots.ts`

**Files:**
- Create: `src/shared/documentSnapshots.ts`

- [ ] **Step 1: Write the failing test**

Create `src/shared/documentSnapshots.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  documentTypes,
  documentStatuses,
  documentTypeSchema,
  documentStatusSchema,
  type DocumentType,
  type DocumentStatus
} from './documentSnapshots';

describe('shared documentSnapshots constants', () => {
  it('lists supported document types in stable order', () => {
    expect(documentTypes).toEqual(['purchase_order', 'sales_order', 'customer_payment', 'vendor_payout']);
  });
  it('lists supported statuses in stable order', () => {
    expect(documentStatuses).toEqual(['draft', 'finalized', 'superseded', 'void']);
  });
  it('zod schemas accept valid values', () => {
    expect(documentTypeSchema.parse('purchase_order')).toBe('purchase_order');
    expect(documentStatusSchema.parse('finalized')).toBe('finalized');
  });
  it('zod schemas reject invalid values', () => {
    expect(() => documentTypeSchema.parse('foo')).toThrow();
    expect(() => documentStatusSchema.parse('open')).toThrow();
  });
});
```

Run: `pnpm test -- src/shared/documentSnapshots.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 2: Implement the shared types module**

Create `src/shared/documentSnapshots.ts`:

```ts
import { z } from 'zod';

export const documentTypes = ['purchase_order', 'sales_order', 'customer_payment', 'vendor_payout'] as const;
export type DocumentType = (typeof documentTypes)[number];
export const documentTypeSchema = z.enum(documentTypes);

export const documentStatuses = ['draft', 'finalized', 'superseded', 'void'] as const;
export type DocumentStatus = (typeof documentStatuses)[number];
export const documentStatusSchema = z.enum(documentStatuses);

export interface ProjectionResult {
  payload: Record<string, unknown>;
  projectionVersion: number;
}

export interface DocumentSnapshotRecord {
  id: string;
  documentType: DocumentType;
  subjectId: string;
  version: number;
  status: DocumentStatus;
  internalPayload: Record<string, unknown>;
  externalPayload: Record<string, unknown>;
  projectionVersion: number;
  generatedByCommandId: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
}
```

- [ ] **Step 3: Run test**

Run: `pnpm test -- src/shared/documentSnapshots.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/shared/documentSnapshots.ts src/shared/documentSnapshots.test.ts
git commit -m "feat(receipts): add shared documentSnapshots types + zod schemas (#113)"
```

---

### Task 5: PO internal-payload builder (pure)

**Files:**
- Create: `src/server/services/documentSnapshots/poInternalBuilder.ts`
- Create: `src/server/services/documentSnapshots/poInternalBuilder.test.ts`

This module is pure: it takes the result of selecting a `purchaseOrders` row, its lines, and the joined vendor, and returns the full internal-payload object. It is consumed by `snapshotService.ts`. Keeping it pure makes leak-control testing simple.

- [ ] **Step 1: Write the failing test**

Create `src/server/services/documentSnapshots/poInternalBuilder.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildPurchaseOrderInternalPayload } from './poInternalBuilder';

const PO = {
  id: 'po-1', poNo: 'PO-2026-001', vendorId: 'v-1', status: 'finalized',
  expectedDate: new Date('2026-06-01T00:00:00Z'),
  orderedAt: null, receivedAt: null, cancelledAt: null,
  total: '6000.00', orderedBy: 'u-1',
  paymentTerms: 'net_14', prepaymentAmount: '1500.00',
  finalizedAt: new Date('2026-05-20T15:00:00Z'),
  buyerNotes: 'BUYER ONLY — do not share',
  internalNotes: 'INTERNAL — margin target 30%',
  externalNotes: 'Vendor: please confirm delivery window.',
  refereeRelationshipId: 'r-1',
  refereeCreditAmount: '50.00'
};
const VENDOR = { id: 'v-1', name: 'Acme Farms', alias: 'ACME' };
const LINES = [
  {
    id: 'l-1', purchaseOrderId: 'po-1', itemId: 'i-1',
    productName: 'Mendo Breath', category: 'Flower', tags: ['indoor'],
    qty: '5.000', receivedQty: '0.000', uom: 'lb',
    unitCost: '1200.00', unitPrice: '1800.00',
    costRangeLow: '1100.00', costRangeHigh: '1300.00',
    sourceCode: 'SRC-A', shorthand: 'MB', legacyMarker: null,
    ownershipStatus: 'C',
    notes: 'Generic line note',
    internalNotes: 'Internal target $1250',
    externalNotes: 'Vendor confirmed lot id',
    status: 'planned'
  }
];

describe('buildPurchaseOrderInternalPayload', () => {
  it('produces a full internal payload preserving every PO + line field plus vendor labels', () => {
    const payload = buildPurchaseOrderInternalPayload({ purchaseOrder: PO as any, vendor: VENDOR as any, lines: LINES as any });
    expect(payload.poNo).toBe('PO-2026-001');
    expect(payload.vendorName).toBe('Acme Farms');
    expect(payload.vendorAlias).toBe('ACME');
    expect(payload.internalNotes).toBe('INTERNAL — margin target 30%');
    expect(payload.buyerNotes).toBe('BUYER ONLY — do not share');
    expect(payload.externalNotes).toBe('Vendor: please confirm delivery window.');
    expect(payload.paymentTerms).toBe('net_14');
    expect(Number(payload.prepaymentAmount)).toBe(1500);
    expect(Number(payload.total)).toBe(6000);
    expect(payload.refereeRelationshipId).toBe('r-1');
    expect(Array.isArray(payload.lines)).toBe(true);
    expect((payload.lines as any[])[0]).toMatchObject({
      productName: 'Mendo Breath',
      category: 'Flower',
      qty: 5,
      uom: 'lb',
      unitCost: 1200,
      unitPrice: 1800,
      costRangeLow: 1100,
      costRangeHigh: 1300,
      externalNotes: 'Vendor confirmed lot id',
      internalNotes: 'Internal target $1250',
      notes: 'Generic line note'
    });
  });
  it('handles null vendor by setting vendorName to null and vendorAlias to null', () => {
    const payload = buildPurchaseOrderInternalPayload({ purchaseOrder: PO as any, vendor: null, lines: LINES as any });
    expect(payload.vendorName).toBeNull();
    expect(payload.vendorAlias).toBeNull();
  });
});
```

Run: `pnpm test -- src/server/services/documentSnapshots/poInternalBuilder.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 2: Implement the builder**

Create `src/server/services/documentSnapshots/poInternalBuilder.ts`:

```ts
import type { PurchaseOrder, Vendor } from '../../schema';
import type { purchaseOrderLines } from '../../schema';

type PurchaseOrderLineRow = typeof purchaseOrderLines.$inferSelect;

export interface BuildPurchaseOrderInternalPayloadInput {
  purchaseOrder: PurchaseOrder;
  vendor: Vendor | null;
  lines: PurchaseOrderLineRow[];
}

const toNumber = (value: unknown): number => {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
};
const toNullableNumber = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

export function buildPurchaseOrderInternalPayload(input: BuildPurchaseOrderInternalPayloadInput): Record<string, unknown> {
  const { purchaseOrder: po, vendor, lines } = input;
  return {
    poNo: po.poNo,
    vendorId: po.vendorId,
    vendorName: vendor?.name ?? null,
    vendorAlias: vendor?.alias ?? null,
    status: po.status,
    expectedDate: po.expectedDate ? new Date(po.expectedDate).toISOString() : null,
    orderedAt: po.orderedAt ? new Date(po.orderedAt).toISOString() : null,
    finalizedAt: po.finalizedAt ? new Date(po.finalizedAt).toISOString() : null,
    paymentTerms: po.paymentTerms,
    prepaymentAmount: toNumber(po.prepaymentAmount),
    total: toNumber(po.total),
    buyerNotes: po.buyerNotes ?? null,
    internalNotes: po.internalNotes ?? null,
    externalNotes: po.externalNotes ?? null,
    refereeRelationshipId: po.refereeRelationshipId ?? null,
    refereeCreditAmount: toNullableNumber(po.refereeCreditAmount),
    lines: lines.map((line) => ({
      id: line.id,
      purchaseOrderId: line.purchaseOrderId,
      itemId: line.itemId,
      productName: line.productName,
      category: line.category,
      tags: line.tags ?? [],
      qty: toNumber(line.qty),
      receivedQty: toNumber(line.receivedQty),
      uom: line.uom,
      unitCost: toNumber(line.unitCost),
      unitPrice: toNumber(line.unitPrice),
      costRangeLow: toNullableNumber(line.costRangeLow),
      costRangeHigh: toNullableNumber(line.costRangeHigh),
      sourceCode: line.sourceCode ?? null,
      shorthand: line.shorthand ?? null,
      legacyMarker: line.legacyMarker ?? null,
      ownershipStatus: line.ownershipStatus,
      notes: line.notes ?? null,
      internalNotes: line.internalNotes ?? null,
      externalNotes: line.externalNotes ?? null,
      status: line.status
    }))
  };
}
```

- [ ] **Step 3: Run tests**

Run: `pnpm test -- src/server/services/documentSnapshots/poInternalBuilder.test.ts`
Expected: PASS.

- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/services/documentSnapshots/poInternalBuilder.ts src/server/services/documentSnapshots/poInternalBuilder.test.ts
git commit -m "feat(receipts): add pure PO internal-payload builder (#113)"
```

---

### Task 6: PO projection module + leak-guard tests

**Files:**
- Create: `src/server/services/documentSnapshots/poProjection.ts`
- Create: `src/server/services/documentSnapshots/poProjection.test.ts`

- [ ] **Step 1: Write the failing tests (allowlist + leak guard + plain text renderer)**

Create `src/server/services/documentSnapshots/poProjection.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  EXTERNAL_FIELDS,
  EXTERNAL_LINE_FIELDS,
  PROJECTION_VERSION,
  projectExternal,
  renderPlainTextExternal,
  renderPlainTextInternal
} from './poProjection';

const INTERNAL = {
  poNo: 'PO-2026-001',
  vendorId: 'v-1',
  vendorName: 'Acme Farms',
  vendorAlias: 'ACME',
  status: 'finalized',
  expectedDate: '2026-06-01T00:00:00.000Z',
  orderedAt: null,
  finalizedAt: '2026-05-20T15:00:00.000Z',
  paymentTerms: 'net_14',
  prepaymentAmount: 1500,
  total: 6000,
  buyerNotes: 'BUYER ONLY — do not share',
  internalNotes: 'INTERNAL — margin target 30%',
  externalNotes: 'Vendor: please confirm delivery window.',
  refereeRelationshipId: 'r-1',
  refereeCreditAmount: 50,
  lines: [
    {
      id: 'l-1', purchaseOrderId: 'po-1', itemId: 'i-1',
      productName: 'Mendo Breath', category: 'Flower', tags: ['indoor'],
      qty: 5, receivedQty: 0, uom: 'lb',
      unitCost: 1200, unitPrice: 1800,
      costRangeLow: 1100, costRangeHigh: 1300,
      sourceCode: 'SRC-A', shorthand: 'MB', legacyMarker: null,
      ownershipStatus: 'C',
      notes: 'Generic line note',
      internalNotes: 'Internal target $1250',
      externalNotes: 'Vendor confirmed lot id',
      status: 'planned'
    }
  ]
};

describe('PO projection — header allowlist', () => {
  it('PROJECTION_VERSION is 1 for Tranche 1', () => {
    expect(PROJECTION_VERSION).toBe(1);
  });
  it('EXTERNAL_FIELDS lists exactly the locked header keys', () => {
    expect([...EXTERNAL_FIELDS].sort()).toEqual([
      'externalNotes', 'expectedDate', 'finalizedAt', 'lines',
      'paymentTerms', 'poNo', 'prepaymentAmount', 'total',
      'vendorAlias', 'vendorName'
    ]);
  });
});

describe('PO projection — projectExternal', () => {
  it('returns only allowlisted header keys', () => {
    const { payload } = projectExternal(INTERNAL);
    expect(Object.keys(payload).sort()).toEqual([...EXTERNAL_FIELDS].sort());
  });
  it('lines contain only allowlisted line keys (no unitPrice, no internalNotes, no notes)', () => {
    const { payload } = projectExternal(INTERNAL);
    const line = (payload.lines as any[])[0];
    expect(Object.keys(line).sort()).toEqual([
      'category', 'costRangeHigh', 'costRangeLow',
      'externalNotes', 'productName', 'qty', 'uom', 'unitCost'
    ]);
    expect((line as Record<string, unknown>).unitPrice).toBeUndefined();
    expect((line as Record<string, unknown>).internalNotes).toBeUndefined();
    expect((line as Record<string, unknown>).notes).toBeUndefined();
    expect((line as Record<string, unknown>).sourceCode).toBeUndefined();
  });
  it('drops internalNotes, buyerNotes, refereeRelationshipId, refereeCreditAmount from header', () => {
    const { payload } = projectExternal(INTERNAL);
    expect((payload as any).internalNotes).toBeUndefined();
    expect((payload as any).buyerNotes).toBeUndefined();
    expect((payload as any).refereeRelationshipId).toBeUndefined();
    expect((payload as any).refereeCreditAmount).toBeUndefined();
    expect((payload as any).status).toBeUndefined();
  });
  it('returns projectionVersion equal to PROJECTION_VERSION', () => {
    const { projectionVersion } = projectExternal(INTERNAL);
    expect(projectionVersion).toBe(PROJECTION_VERSION);
  });
  it('throws when a required header key is missing from internal payload', () => {
    const broken = { ...INTERNAL } as Record<string, unknown>;
    delete broken.poNo;
    expect(() => projectExternal(broken)).toThrow(/poNo/);
  });
  it('throws when an extra (unknown) line key would leak via a bypass', async () => {
    // Direct call simulates a future bug where a caller manually constructs
    // an external payload outside projectExternal. The projection module
    // ALSO exposes an assertion helper to keep this leak path closed.
    const fake = { unitCost: 100, leakField: 'secret' };
    const { assertExternalLineShape } = await import('./poProjection');
    expect(() => assertExternalLineShape(fake)).toThrow(/leakField/);
  });
  it('fails if EXTERNAL_FIELDS changes but PROJECTION_VERSION was not bumped', () => {
    // This is a change-control invariant: any edit to EXTERNAL_FIELDS or
    // EXTERNAL_LINE_FIELDS MUST also update PROJECTION_VERSION. The test
    // pins the sorted allowlists as a nested inline snapshot. When the
    // allowlist legitimately changes, this snapshot AND PROJECTION_VERSION
    // must be updated in the same commit (run `pnpm test -- -u` to refresh
    // after the projection module is updated).
    const sortedAllowlists = [
      [...EXTERNAL_FIELDS].sort(),
      [...EXTERNAL_LINE_FIELDS].sort()
    ];
    expect(sortedAllowlists).toMatchInlineSnapshot(`
      [
        [
          "externalNotes",
          "expectedDate",
          "finalizedAt",
          "lines",
          "paymentTerms",
          "poNo",
          "prepaymentAmount",
          "total",
          "vendorAlias",
          "vendorName",
        ],
        [
          "category",
          "costRangeHigh",
          "costRangeLow",
          "externalNotes",
          "productName",
          "qty",
          "uom",
          "unitCost",
        ],
      ]
    `);
    expect(PROJECTION_VERSION).toBe(1);
  });
});

describe('PO projection — renderers', () => {
  it('renderPlainTextExternal produces human-readable sentences and contains no internal terms', () => {
    const text = renderPlainTextExternal(projectExternal(INTERNAL).payload);
    expect(text).toMatch(/PO-2026-001/);
    expect(text).toMatch(/Acme Farms/);
    expect(text).toMatch(/Vendor unit price/i);
    expect(text).toMatch(/Vendor price range/i);
    expect(text).not.toMatch(/INTERNAL/i);
    expect(text).not.toMatch(/internalNotes/i);
    expect(text).not.toMatch(/unitPrice/i);
    expect(text).not.toMatch(/BUYER ONLY/);
  });
  it('renderPlainTextInternal includes the INTERNAL — DO NOT SEND watermark and internal-only fields', () => {
    const text = renderPlainTextInternal(INTERNAL);
    expect(text.startsWith('INTERNAL — DO NOT SEND')).toBe(true);
    expect(text).toMatch(/margin target 30%/);
    expect(text).toMatch(/BUYER ONLY/);
    expect(text).toMatch(/Resale\/markup/i);
  });
});
```

Run: `pnpm test -- src/server/services/documentSnapshots/poProjection.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 2: Implement the projection module**

Create `src/server/services/documentSnapshots/poProjection.ts`:

```ts
export const PROJECTION_VERSION = 1 as const;

export const EXTERNAL_FIELDS = [
  'poNo',
  'vendorName',
  'vendorAlias',
  'expectedDate',
  'paymentTerms',
  'prepaymentAmount',
  'externalNotes',
  'finalizedAt',
  'total',
  'lines'
] as const;

export const EXTERNAL_LINE_FIELDS = [
  'productName',
  'category',
  'qty',
  'uom',
  'unitCost',
  'costRangeLow',
  'costRangeHigh',
  'externalNotes'
] as const;

const REQUIRED_HEADER_KEYS = ['poNo', 'paymentTerms', 'total', 'lines'] as const;

export function assertExternalLineShape(line: Record<string, unknown>): void {
  for (const key of Object.keys(line)) {
    if (!(EXTERNAL_LINE_FIELDS as readonly string[]).includes(key)) {
      throw new Error(`PO external projection: line contains non-allowlisted key "${key}"`);
    }
  }
}

export function projectExternal(internal: unknown): { payload: Record<string, unknown>; projectionVersion: number } {
  if (!internal || typeof internal !== 'object') {
    throw new Error('PO external projection: internal payload must be an object');
  }
  const src = internal as Record<string, unknown>;
  for (const key of REQUIRED_HEADER_KEYS) {
    if (!(key in src)) {
      throw new Error(`PO external projection: missing required key "${key}"`);
    }
  }
  const linesIn = Array.isArray(src.lines) ? (src.lines as Array<Record<string, unknown>>) : [];
  const lines = linesIn.map((line) => {
    const projected: Record<string, unknown> = {};
    for (const k of EXTERNAL_LINE_FIELDS) {
      if (k in line) projected[k] = line[k];
    }
    assertExternalLineShape(projected);
    return projected;
  });
  const payload: Record<string, unknown> = {};
  for (const k of EXTERNAL_FIELDS) {
    if (k === 'lines') {
      payload.lines = lines;
    } else if (k in src) {
      payload[k] = src[k];
    } else {
      // Required header keys are checked above; optional keys may be missing.
      // We still include the key with null to keep the external shape stable.
      payload[k] = null;
    }
  }
  return { payload, projectionVersion: PROJECTION_VERSION };
}

function fmtMoney(value: unknown): string {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? `$${n.toFixed(2)}` : '$0.00';
}
function fmtQty(value: unknown): string {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n.toFixed(3).replace(/\.?0+$/, '') : '0';
}
function fmtDate(value: unknown): string {
  if (!value) return 'not set';
  try {
    return new Date(String(value)).toISOString().slice(0, 10);
  } catch {
    return String(value);
  }
}

export function renderPlainTextExternal(external: Record<string, unknown>): string {
  const lines = (external.lines as Array<Record<string, unknown>> | undefined) ?? [];
  const headerParts: string[] = [];
  headerParts.push(`Purchase Order ${String(external.poNo ?? '')} for ${String(external.vendorName ?? 'vendor')}.`);
  if (external.vendorAlias) headerParts.push(`Vendor alias: ${String(external.vendorAlias)}.`);
  headerParts.push(`Expected delivery: ${fmtDate(external.expectedDate)}.`);
  headerParts.push(`Payment terms: ${String(external.paymentTerms ?? 'not set')}.`);
  if (Number(external.prepaymentAmount ?? 0) > 0) {
    headerParts.push(`Prepayment: ${fmtMoney(external.prepaymentAmount)}.`);
  }
  if (external.finalizedAt) headerParts.push(`Finalized: ${fmtDate(external.finalizedAt)}.`);
  if (external.externalNotes) headerParts.push(`Notes: ${String(external.externalNotes)}`);
  const lineParts = lines.map((line, idx) => {
    const range = (line.costRangeLow != null && line.costRangeHigh != null)
      ? ` (Vendor price range: ${fmtMoney(line.costRangeLow)}–${fmtMoney(line.costRangeHigh)})`
      : '';
    const note = line.externalNotes ? `. Line note: ${String(line.externalNotes)}` : '';
    return `${idx + 1}. ${String(line.productName ?? '')} — ${String(line.category ?? '')}, ${fmtQty(line.qty)} ${String(line.uom ?? '')} at Vendor unit price ${fmtMoney(line.unitCost)}${range}${note}.`;
  });
  return [headerParts.join(' '), '', 'Lines:', ...lineParts, '', `Total: ${fmtMoney(external.total)}.`].join('\n');
}

export function renderPlainTextInternal(internal: Record<string, unknown>): string {
  const lines = (internal.lines as Array<Record<string, unknown>> | undefined) ?? [];
  const headerParts: string[] = [];
  headerParts.push('INTERNAL — DO NOT SEND');
  headerParts.push(`Purchase Order ${String(internal.poNo ?? '')} for ${String(internal.vendorName ?? 'vendor')}.`);
  if (internal.vendorAlias) headerParts.push(`Vendor alias: ${String(internal.vendorAlias)}.`);
  headerParts.push(`Status: ${String(internal.status ?? 'unknown')}.`);
  headerParts.push(`Expected delivery: ${fmtDate(internal.expectedDate)}.`);
  headerParts.push(`Payment terms: ${String(internal.paymentTerms ?? 'not set')}.`);
  if (Number(internal.prepaymentAmount ?? 0) > 0) {
    headerParts.push(`Prepayment: ${fmtMoney(internal.prepaymentAmount)}.`);
  }
  if (internal.buyerNotes) headerParts.push(`Buyer notes: ${String(internal.buyerNotes)}.`);
  if (internal.internalNotes) headerParts.push(`Internal notes: ${String(internal.internalNotes)}.`);
  if (internal.externalNotes) headerParts.push(`External notes: ${String(internal.externalNotes)}.`);
  const lineParts = lines.map((line, idx) => {
    const range = (line.costRangeLow != null && line.costRangeHigh != null)
      ? ` (vendor range: ${fmtMoney(line.costRangeLow)}–${fmtMoney(line.costRangeHigh)})`
      : '';
    const resale = Number(line.unitPrice ?? 0) > 0 ? ` | Resale/markup: ${fmtMoney(line.unitPrice)}` : '';
    const ext = line.externalNotes ? ` | External line note: ${String(line.externalNotes)}` : '';
    const intn = line.internalNotes ? ` | Internal line note: ${String(line.internalNotes)}` : '';
    const generic = line.notes ? ` | Note: ${String(line.notes)}` : '';
    return `${idx + 1}. ${String(line.productName ?? '')} — ${String(line.category ?? '')}, ${fmtQty(line.qty)} ${String(line.uom ?? '')} at vendor ${fmtMoney(line.unitCost)}${range}${resale}${ext}${intn}${generic}.`;
  });
  return [
    headerParts.join('\n'),
    '',
    'Lines:',
    ...lineParts,
    '',
    `Total: ${fmtMoney(internal.total)}.`
  ].join('\n');
}
```

- [ ] **Step 3: Run tests**

Run: `pnpm test -- src/server/services/documentSnapshots/poProjection.test.ts`
Expected: PASS.

- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/services/documentSnapshots/poProjection.ts src/server/services/documentSnapshots/poProjection.test.ts
git commit -m "feat(receipts): add PO projection module + leak-guard tests (#113)"
```

---

### Task 7: Projection registry `src/server/services/documentSnapshots/index.ts`

**Files:**
- Create: `src/server/services/documentSnapshots/index.ts`
- Create: `src/server/services/documentSnapshots/index.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/server/services/documentSnapshots/index.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { getProjectionFor, hasProjectionFor } from './index';

describe('projection registry', () => {
  it('exposes a projection for purchase_order', () => {
    expect(hasProjectionFor('purchase_order')).toBe(true);
    const p = getProjectionFor('purchase_order');
    expect(typeof p.projectExternal).toBe('function');
    expect(typeof p.renderPlainTextExternal).toBe('function');
    expect(typeof p.renderPlainTextInternal).toBe('function');
    expect(Array.isArray(p.EXTERNAL_FIELDS)).toBe(true);
    expect(typeof p.PROJECTION_VERSION).toBe('number');
  });
  it('returns false for not-yet-registered document types', () => {
    expect(hasProjectionFor('sales_order')).toBe(false);
    expect(hasProjectionFor('customer_payment')).toBe(false);
    expect(hasProjectionFor('vendor_payout')).toBe(false);
  });
  it('throws a clear error when no projection is registered', () => {
    expect(() => getProjectionFor('sales_order' as any)).toThrow(/sales_order/);
  });
});
```

Run: `pnpm test -- src/server/services/documentSnapshots/index.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 2: Implement the registry**

Create `src/server/services/documentSnapshots/index.ts`:

```ts
import type { DocumentType } from '../../../shared/documentSnapshots';
import * as poProjection from './poProjection';

export interface ProjectionModule {
  EXTERNAL_FIELDS: readonly string[];
  PROJECTION_VERSION: number;
  projectExternal: (internal: unknown) => { payload: Record<string, unknown>; projectionVersion: number };
  renderPlainTextExternal: (external: Record<string, unknown>) => string;
  renderPlainTextInternal: (internal: Record<string, unknown>) => string;
}

const REGISTRY: Partial<Record<DocumentType, ProjectionModule>> = {
  purchase_order: {
    EXTERNAL_FIELDS: poProjection.EXTERNAL_FIELDS,
    PROJECTION_VERSION: poProjection.PROJECTION_VERSION,
    projectExternal: poProjection.projectExternal,
    renderPlainTextExternal: poProjection.renderPlainTextExternal,
    renderPlainTextInternal: poProjection.renderPlainTextInternal
  }
};

export function hasProjectionFor(documentType: DocumentType): boolean {
  return Boolean(REGISTRY[documentType]);
}

export function getProjectionFor(documentType: DocumentType): ProjectionModule {
  const entry = REGISTRY[documentType];
  if (!entry) throw new Error(`No projection registered for document_type "${documentType}"`);
  return entry;
}
```

- [ ] **Step 3: Run test**

Run: `pnpm test -- src/server/services/documentSnapshots/index.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/server/services/documentSnapshots/index.ts src/server/services/documentSnapshots/index.test.ts
git commit -m "feat(receipts): add projection registry (#113)"
```

---

### Task 7b: Shared in-memory db mock for service + router tests

**Files:**
- Create: `src/server/services/__tests__/inMemoryDbMock.ts`
- Create: `src/server/services/__tests__/inMemoryDbMock.test.ts`

The service test in Task 8, the integration test in Task 10, and the router test in Task 11 all need a Drizzle-shaped chainable mock that operates against a JavaScript in-memory state object. Stubbing `vi.fn()` for every chain link inside each test file is fragile and duplicative. This task extracts the helper used by `src/server/services/commandBus.idempotency.test.ts` into a dedicated module so every later test references the same surface.

This task MUST land before Task 8.

- [ ] **Step 1: Define the in-memory state shape and minimum API**

The helper exports:

```ts
// src/server/services/__tests__/inMemoryDbMock.ts
export interface InMemoryState {
  purchaseOrders: Array<Record<string, unknown>>;
  purchaseOrderLines: Array<Record<string, unknown>>;
  vendors: Array<Record<string, unknown>>;
  documentSnapshots: Array<Record<string, unknown>>;
  commandJournal: Array<Record<string, unknown>>;
  advisoryLocks: string[];
}

export function createInMemoryState(): InMemoryState;
export function resetInMemoryState(state: InMemoryState): void;

// Returns a Drizzle-shaped tx mock + a `db` object whose `transaction(fn)` runs
// `fn(tx)` against the supplied state. The tx supports the chain shapes used by
// `snapshotService.ts`, the receipt commands in `commandBus.ts`, and the
// `documentSnapshots` router:
//   tx.select().from(t).where(predicate).for('update').limit(n)
//   tx.select(cols).from(t).where(predicate).orderBy(col).limit(n)
//   tx.insert(t).values(v).returning()
//   tx.update(t).set(s).where(predicate)
//   tx.execute(sql\`...\`)  // records any `document_snapshot:<type>:<id>` advisory-lock key
//   db.select() with the same chain (no tx)
//
// The mock identifies tables by reading the Drizzle table-name symbol so callers
// pass the real Drizzle tables (`documentSnapshots`, `purchaseOrders`, …). The
// `where` predicate is interpreted by a small adapter: callers do NOT pass a JS
// function. Instead, the helper recognises the common Drizzle predicates used
// in Tranche 1 by inspecting the SQL chunks they emit and routes them to
// explicit lookup keys keyed by `(table, subjectId, documentType, status?, id?)`.
// See "Predicate adapter" below.
export function makeMockedDb(state: InMemoryState): { db: any; tx: any };
```

- [ ] **Step 2: Predicate adapter (explicit, no Drizzle-expression-as-function)**

The Drizzle `where(eq(col, value))` / `and(...)` calls do not return JavaScript functions; they return SQL ASTs. The helper inspects those ASTs and matches them against a small set of well-known shapes the Tranche 1 code paths use:

- `eq(documentSnapshots.documentType, X) AND eq(documentSnapshots.subjectId, Y) [AND sql\`status in (…)\`]` → look up rows in `state.documentSnapshots` matching documentType + subjectId + optional status set.
- `eq(documentSnapshots.id, X)` → look up rows by id.
- `eq(purchaseOrders.id, X)` → look up purchase orders by id.
- `eq(purchaseOrderLines.purchaseOrderId, X)` → look up lines by parent PO id.
- `eq(vendors.id, X)` → look up vendors by id.
- `inArray(<table>.id, ids)` → look up rows where id is in the given list.

For any predicate shape outside this set, the helper throws an explicit error (`"inMemoryDbMock: unsupported predicate shape"`) so a new pattern surfaces immediately instead of being silently ignored. Tests must NOT pass JavaScript predicate functions to `where`; the helper rejects that.

- [ ] **Step 3: Advisory-lock recording**

The mock's `tx.execute` inspects the SQL chunks for the literal `document_snapshot:` prefix used by `snapshotService.lockSubject` and pushes the matched key into `state.advisoryLocks`. Tests then assert `state.advisoryLocks` contains the expected `purchase_order:<subjectId>` entry. The mock does not actually serialize concurrent operations — concurrency assertions in Task 8 rely on the fact that the mock runs operations sequentially within a single JavaScript event loop turn, which is sufficient for "no duplicate row" assertions.

- [ ] **Step 4: Implement and unit-test the helper**

Create `src/server/services/__tests__/inMemoryDbMock.test.ts` covering:

- `select().from(documentSnapshots).where(eq+eq).for('update').limit(1)` returns the matching seeded row.
- `select({version}).from(documentSnapshots).where(eq+eq).orderBy(desc).limit(1)` returns the highest-version row.
- `insert(documentSnapshots).values(v).returning()` appends to state and returns the inserted row.
- `update(documentSnapshots).set(s).where(eq(id, X))` mutates the matching row.
- `execute(sql\`SELECT pg_advisory_xact_lock(hashtextextended(\${key}, 0))\`)` records `key` (with `document_snapshot:` prefix stripped) into `state.advisoryLocks`.
- An unsupported predicate (`eq(documentSnapshots.status, 'finalized')` standalone) throws the explicit error.

- [ ] **Step 5: Run tests**

Run: `pnpm test -- src/server/services/__tests__/inMemoryDbMock.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/server/services/__tests__/inMemoryDbMock.ts src/server/services/__tests__/inMemoryDbMock.test.ts
git commit -m "test(receipts): shared in-memory db mock for snapshot tests (#113)"
```

---

### Task 8: `snapshotService.ts` — DB-bound create/void/draft helpers

**Files:**
- Create: `src/server/services/documentSnapshots/snapshotService.ts`
- Create: `src/server/services/documentSnapshots/snapshotService.test.ts`

This is the only module that writes `document_snapshots` rows. Command handlers in `commandBus.ts` call into here; they do not write the table directly.

Public API:

```ts
// Inside an existing transaction `tx`. Each function MUST take the same advisory
// lock keyed by (document_type, subject_id) before reading version / active row
// state — see "Concurrency control" below.
createFinalizedSnapshotForPurchaseOrder(tx, purchaseOrderId: string, commandId: string): Promise<{ snapshotId: string; version: number; consumedDraftId: string | null }>
voidActiveSnapshotForPurchaseOrder(tx, purchaseOrderId: string, commandId: string): Promise<{ voidedId: string | null }>
saveOrUpdateDraftSnapshotForPurchaseOrder(tx, purchaseOrderId: string, commandId: string): Promise<{ snapshotId: string; created: boolean }>
abandonDraftSnapshotForPurchaseOrder(tx, purchaseOrderId: string, commandId: string): Promise<{ voidedId: string | null }>
```

Canonical lifecycle (enforced here, mirrored from roadmap §4.4):

1. **Save draft** is only invoked when the parent PO is in `draft` status (the command-bus handler enforces the parent check; the service trusts the caller for that gate but still asserts there is no active `finalized` row before inserting).
2. **Finalize** consumes an existing active `draft` snapshot by **UPDATING THE SAME ROW** from `status='draft'` to `status='finalized'`. The row id and version are preserved; only `status`, `internal_payload`, `external_payload`, `projection_version`, `generated_by_command_id`, and `updated_at` change. If no active `draft` exists, INSERT a new finalized row at `version = max(version) + 1` (or `1` if there is no prior row).
3. **Unfinalize** voids the active `finalized` row (`status='void'`).
4. **Refinalize after unfinalize** flows through case (2) "no active draft" and produces a new finalized version. The prior finalized row remains `void`, **not** `superseded`.
5. **Abandon draft** voids the active `draft` row.

`superseded` is **not** produced on any Tranche 1 normal path. The status check constraint includes it for future direct-amendment paths (Phase 4+); Tranche 1 code paths must never write `superseded`.

Semantics:

- `createFinalizedSnapshotForPurchaseOrder`:
  1. Take the advisory transaction lock for `(purchase_order, purchaseOrderId)` (see "Concurrency control" below).
  2. Select the active row (`status IN ('draft','finalized')`) for the subject `FOR UPDATE`.
  3. If the active row has `status='finalized'`, throw an explicit error. This case should never happen via the command bus because `finalizePurchaseOrder` is rejected when the PO is already finalized; the service rejects it as a defensive guard. (No `superseded` is written.)
  4. Read PO header + lines + vendor; build the internal payload via `buildPurchaseOrderInternalPayload`; project external via `getProjectionFor('purchase_order').projectExternal`.
  5. If an active `draft` row exists, UPDATE it in place — set `status='finalized'`, refresh `internal_payload`/`external_payload`/`projection_version`/`generated_by_command_id`/`updated_at`. Return `{ snapshotId: draftId, version: draftVersion, consumedDraftId: draftId }`.
  6. Otherwise, compute `nextVersion = max(version) + 1` (or `1`) and INSERT a new row with `status='finalized'`. Return `{ snapshotId, version: nextVersion, consumedDraftId: null }`.

- `voidActiveSnapshotForPurchaseOrder`:
  1. Take the advisory lock.
  2. Select the active row `FOR UPDATE`. If none, return `{ voidedId: null }`.
  3. UPDATE that row to `status='void'`, `updated_at=now()`. Return `{ voidedId: row.id }`. Works for both `draft` and `finalized` active rows; callers (unfinalize vs abandon) decide whether to use this entry point.

- `saveOrUpdateDraftSnapshotForPurchaseOrder`:
  1. Take the advisory lock.
  2. Build the internal payload + projected external payload (same helpers).
  3. Select the active row `FOR UPDATE`. If `status='draft'`, UPDATE in place (refresh payloads, `updated_at`, `generated_by_command_id`). Return `{ snapshotId, created: false }`.
  4. If `status='finalized'`, throw a defensive error — the command-bus handler must reject Save-Draft on a finalized PO before reaching here.
  5. If no active row, compute `nextVersion` and INSERT a new `status='draft'` row. Return `{ snapshotId, created: true }`.

- `abandonDraftSnapshotForPurchaseOrder`:
  1. Take the advisory lock.
  2. Select the active row `FOR UPDATE`. If none or if `status !== 'draft'`, return `{ voidedId: null }` (does NOT touch finalized rows).
  3. UPDATE the draft row to `status='void'`. Return `{ voidedId: row.id }`.

**Concurrency control (mandatory, not optional):**

Every function above MUST take a Postgres advisory transaction lock before its first read of `document_snapshots` so that concurrent finalize / save-draft / unfinalize calls for the same `(document_type, subject_id)` serialize deterministically. Use `pg_advisory_xact_lock` with a stable bigint derived from `hashtextextended` over the keyed string:

```ts
async function lockSubject(tx: Tx, documentType: string, subjectId: string): Promise<void> {
  const key = `document_snapshot:${documentType}:${subjectId}`;
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`);
}
```

`pg_advisory_xact_lock` is held for the rest of the current transaction and released automatically at COMMIT or ROLLBACK; this matches the existing pattern in `src/server/services/commandBus.ts` (the period-lock helper around line 3303) but uses `hashtextextended` (which returns `bigint` directly) so we do not need a `::bigint` cast. Calling this before any `select…for('update')` ensures the partial unique index `document_snapshots_active_unique` never sees a write race that would surface as a duplicate-key error from concurrent finalize/save-draft attempts.

- [ ] **Step 1: Write the failing tests**

Create `src/server/services/documentSnapshots/snapshotService.test.ts`. The test uses the shared in-memory db mock from Task 7b. Subject IDs are valid UUIDs (the partial unique index and shared types require it). The preamble below MUST land in the file as-is.

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createInMemoryState,
  resetInMemoryState,
  makeMockedDb,
  type InMemoryState
} from '../__tests__/inMemoryDbMock';

const state: InMemoryState = createInMemoryState();

const PO_ID = '11111111-1111-4111-8111-111111111111';
const VENDOR_ID = '22222222-2222-4222-8222-222222222222';
const LINE_ID = '33333333-3333-4333-8333-333333333333';
const MISSING_PO_ID = '99999999-9999-4999-8999-999999999999';

function seedDraftPurchaseOrder(s: InMemoryState) {
  s.vendors.push({ id: VENDOR_ID, name: 'Acme Farms', alias: 'ACME' });
  s.purchaseOrders.push({
    id: PO_ID, poNo: 'PO-2026-001', vendorId: VENDOR_ID, status: 'draft',
    paymentTerms: 'net_14', prepaymentAmount: '0.00', total: '1200.00',
    expectedDate: null, orderedAt: null, finalizedAt: null,
    buyerNotes: null, internalNotes: null, externalNotes: null,
    refereeRelationshipId: null, refereeCreditAmount: null
  });
  s.purchaseOrderLines.push({
    id: LINE_ID, purchaseOrderId: PO_ID, itemId: null,
    productName: 'Mendo Breath', category: 'Flower', tags: ['indoor'],
    qty: '1.000', receivedQty: '0.000', uom: 'lb',
    unitCost: '1200.00', unitPrice: '1800.00',
    costRangeLow: null, costRangeHigh: null,
    sourceCode: null, shorthand: null, legacyMarker: null,
    ownershipStatus: 'C', notes: null, internalNotes: null,
    externalNotes: null, status: 'planned'
  });
}

// `makeMockedDb` returns a Drizzle-shaped `tx` and `db` whose chainable
// select/insert/update/execute calls operate against `state`. The exact
// chain shapes supported are documented in Task 7b. The service receives
// `tx` as an argument; the `vi.mock('../../db', ...)` below is a defensive
// shim so accidental imports do not blow up.
let tx: any;

vi.mock('../../db', () => ({
  db: { transaction: async (fn: any) => fn(tx) }
}));

import {
  createFinalizedSnapshotForPurchaseOrder,
  voidActiveSnapshotForPurchaseOrder,
  saveOrUpdateDraftSnapshotForPurchaseOrder,
  abandonDraftSnapshotForPurchaseOrder
} from './snapshotService';
import { PROJECTION_VERSION, EXTERNAL_FIELDS } from './poProjection';

beforeEach(() => {
  resetInMemoryState(state);
  const mocked = makeMockedDb(state);
  tx = mocked.tx;
  seedDraftPurchaseOrder(state);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('snapshotService — createFinalizedSnapshotForPurchaseOrder', () => {
  it('takes the advisory lock keyed by (document_type, subject_id) before any read', async () => {
    await createFinalizedSnapshotForPurchaseOrder(tx as any, PO_ID, 'cmd-1');
    expect(state.advisoryLocks).toContain(`purchase_order:${PO_ID}`);
  });

  it('creates v1 finalized snapshot when no prior snapshot exists', async () => {
    const result = await createFinalizedSnapshotForPurchaseOrder(tx as any, PO_ID, 'cmd-1');
    expect(result.version).toBe(1);
    expect(result.consumedDraftId).toBeNull();
    const rows = state.documentSnapshots.filter((r) => r.subjectId === PO_ID);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('finalized');
  });

  it('consumes the active draft IN PLACE (UPDATE same id) when one exists', async () => {
    const draft = await saveOrUpdateDraftSnapshotForPurchaseOrder(tx as any, PO_ID, 'cmd-draft');
    const result = await createFinalizedSnapshotForPurchaseOrder(tx as any, PO_ID, 'cmd-final');
    // Same row id, same version — only status flipped.
    expect(result.snapshotId).toBe(draft.snapshotId);
    expect(result.consumedDraftId).toBe(draft.snapshotId);
    const rows = state.documentSnapshots.filter((r) => r.subjectId === PO_ID);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(draft.snapshotId);
    expect(rows[0].status).toBe('finalized');
    expect(rows[0].version).toBe(1);
  });

  it('REJECTS finalize when an active finalized row already exists (no superseded path in Tranche 1)', async () => {
    await createFinalizedSnapshotForPurchaseOrder(tx as any, PO_ID, 'cmd-1');
    await expect(
      createFinalizedSnapshotForPurchaseOrder(tx as any, PO_ID, 'cmd-2')
    ).rejects.toThrow(/already finalized/i);
    const rows = state.documentSnapshots.filter((r) => r.subjectId === PO_ID);
    // No 'superseded' must ever be written by Tranche 1 paths.
    expect(rows.some((r) => r.status === 'superseded')).toBe(false);
  });

  it('writes generated_by_command_id and projection_version on new insert', async () => {
    const result = await createFinalizedSnapshotForPurchaseOrder(tx as any, PO_ID, 'cmd-1');
    const row = state.documentSnapshots.find((r) => r.id === result.snapshotId)!;
    expect(row.generatedByCommandId).toBe('cmd-1');
    expect(row.projectionVersion).toBe(PROJECTION_VERSION);
  });

  it('persists projected external_payload with only allowlisted keys', async () => {
    await createFinalizedSnapshotForPurchaseOrder(tx as any, PO_ID, 'cmd-1');
    const row = state.documentSnapshots.find((r) => r.subjectId === PO_ID && r.status === 'finalized')!;
    expect(Object.keys(row.externalPayload as object).sort()).toEqual([...EXTERNAL_FIELDS].sort());
    expect(((row.externalPayload as any).lines)[0]).not.toHaveProperty('unitPrice');
    expect(((row.externalPayload as any).lines)[0]).not.toHaveProperty('internalNotes');
  });

  it('throws if PO does not exist', async () => {
    await expect(
      createFinalizedSnapshotForPurchaseOrder(tx as any, MISSING_PO_ID, 'cmd-1')
    ).rejects.toThrow(/not found/i);
  });
});

describe('snapshotService — voidActiveSnapshotForPurchaseOrder', () => {
  it('voids an active finalized snapshot', async () => {
    await createFinalizedSnapshotForPurchaseOrder(tx as any, PO_ID, 'cmd-1');
    const result = await voidActiveSnapshotForPurchaseOrder(tx as any, PO_ID, 'cmd-2');
    expect(result.voidedId).not.toBeNull();
    const row = state.documentSnapshots.find((r) => r.subjectId === PO_ID)!;
    expect(row.status).toBe('void');
  });

  it('voids an active draft snapshot', async () => {
    await saveOrUpdateDraftSnapshotForPurchaseOrder(tx as any, PO_ID, 'cmd-draft');
    const result = await voidActiveSnapshotForPurchaseOrder(tx as any, PO_ID, 'cmd-2');
    expect(result.voidedId).not.toBeNull();
    const row = state.documentSnapshots.find((r) => r.subjectId === PO_ID)!;
    expect(row.status).toBe('void');
  });

  it('no-op when no active snapshot exists', async () => {
    const result = await voidActiveSnapshotForPurchaseOrder(tx as any, PO_ID, 'cmd-1');
    expect(result.voidedId).toBeNull();
  });

  it('takes the advisory lock', async () => {
    await voidActiveSnapshotForPurchaseOrder(tx as any, PO_ID, 'cmd-1');
    expect(state.advisoryLocks).toContain(`purchase_order:${PO_ID}`);
  });
});

describe('snapshotService — saveOrUpdateDraftSnapshotForPurchaseOrder', () => {
  it('inserts a new draft when no active snapshot exists', async () => {
    const result = await saveOrUpdateDraftSnapshotForPurchaseOrder(tx as any, PO_ID, 'cmd-1');
    expect(result.created).toBe(true);
    const row = state.documentSnapshots.find((r) => r.subjectId === PO_ID)!;
    expect(row.status).toBe('draft');
    expect(row.version).toBe(1);
  });

  it('updates internal+external payload when an active draft exists (same id)', async () => {
    const first = await saveOrUpdateDraftSnapshotForPurchaseOrder(tx as any, PO_ID, 'cmd-1');
    const second = await saveOrUpdateDraftSnapshotForPurchaseOrder(tx as any, PO_ID, 'cmd-2');
    expect(second.created).toBe(false);
    expect(second.snapshotId).toBe(first.snapshotId);
    const rows = state.documentSnapshots.filter((r) => r.subjectId === PO_ID);
    expect(rows).toHaveLength(1);
    expect(rows[0].generatedByCommandId).toBe('cmd-2');
  });

  it('REJECTS save-draft when an active finalized row exists (defensive guard)', async () => {
    await createFinalizedSnapshotForPurchaseOrder(tx as any, PO_ID, 'cmd-1');
    await expect(
      saveOrUpdateDraftSnapshotForPurchaseOrder(tx as any, PO_ID, 'cmd-2')
    ).rejects.toThrow(/finalized/i);
    // No 'superseded' must ever be written.
    const rows = state.documentSnapshots.filter((r) => r.subjectId === PO_ID);
    expect(rows.some((r) => r.status === 'superseded')).toBe(false);
  });
});

describe('snapshotService — abandonDraftSnapshotForPurchaseOrder', () => {
  it('voids the active draft', async () => {
    await saveOrUpdateDraftSnapshotForPurchaseOrder(tx as any, PO_ID, 'cmd-1');
    const result = await abandonDraftSnapshotForPurchaseOrder(tx as any, PO_ID, 'cmd-2');
    expect(result.voidedId).not.toBeNull();
    const row = state.documentSnapshots.find((r) => r.subjectId === PO_ID)!;
    expect(row.status).toBe('void');
  });

  it('does NOT touch an active finalized snapshot', async () => {
    await createFinalizedSnapshotForPurchaseOrder(tx as any, PO_ID, 'cmd-1');
    const result = await abandonDraftSnapshotForPurchaseOrder(tx as any, PO_ID, 'cmd-2');
    expect(result.voidedId).toBeNull();
    const row = state.documentSnapshots.find((r) => r.subjectId === PO_ID)!;
    expect(row.status).toBe('finalized');
  });
});

describe('snapshotService — concurrent finalize/save-draft serialization', () => {
  // Two concurrent calls must serialize via the advisory lock so the partial
  // unique index never surfaces a duplicate-key error to callers, OR if the
  // advisory lock cannot be acquired (unit test without a real DB) the second
  // call must observe the first call's state because both run in sequence.
  it('two concurrent saveDraft calls do not create two draft rows for the same subject', async () => {
    const results = await Promise.all([
      saveOrUpdateDraftSnapshotForPurchaseOrder(tx as any, PO_ID, 'cmd-a'),
      saveOrUpdateDraftSnapshotForPurchaseOrder(tx as any, PO_ID, 'cmd-b')
    ]);
    const rows = state.documentSnapshots.filter((r) => r.subjectId === PO_ID && r.status === 'draft');
    expect(rows).toHaveLength(1);
    // Exactly one created=true, one created=false (deterministic serialization).
    const created = results.filter((r) => r.created).length;
    expect(created).toBe(1);
  });
});
```

> Note: The Drizzle chain mocking lives in `src/server/services/__tests__/inMemoryDbMock.ts`
> (Task 7b). This test file consumes that helper and does not re-implement the
> chain. The seeded UUIDs, the advisory-lock assertion key shape (`purchase_order:<subjectId>`),
> and the lifecycle assertions are concrete and must be preserved verbatim.

Run: `pnpm test -- src/server/services/documentSnapshots/snapshotService.test.ts`
Expected: FAIL (module not implemented).

- [ ] **Step 2: Implement `snapshotService.ts`**

Create `src/server/services/documentSnapshots/snapshotService.ts`:

```ts
import { and, desc, eq, sql } from 'drizzle-orm';
import { documentSnapshots, purchaseOrderLines, purchaseOrders, vendors, type DocumentSnapshot } from '../../schema';
import { buildPurchaseOrderInternalPayload } from './poInternalBuilder';
import { getProjectionFor } from './index';

type Tx = any;

const DOCUMENT_TYPE_PO = 'purchase_order' as const;

// MUST be called as the first action of every snapshotService entry point that
// reads or writes documentSnapshots. Serializes concurrent finalize/save-draft
// /unfinalize/abandon for the same (document_type, subject_id) for the rest of
// the current transaction. Released automatically at COMMIT/ROLLBACK.
async function lockSubject(tx: Tx, documentType: string, subjectId: string): Promise<void> {
  const key = `document_snapshot:${documentType}:${subjectId}`;
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`);
}

async function selectActiveSnapshotFor(tx: Tx, documentType: string, subjectId: string): Promise<DocumentSnapshot | null> {
  const rows = await tx.select().from(documentSnapshots)
    .where(and(
      eq(documentSnapshots.documentType, documentType),
      eq(documentSnapshots.subjectId, subjectId),
      sql`${documentSnapshots.status} in ('draft','finalized')`
    ))
    .for('update')
    .limit(1);
  return (rows[0] as DocumentSnapshot | undefined) ?? null;
}

async function selectMaxVersionFor(tx: Tx, documentType: string, subjectId: string): Promise<number> {
  const rows = await tx.select({ version: documentSnapshots.version }).from(documentSnapshots)
    .where(and(eq(documentSnapshots.documentType, documentType), eq(documentSnapshots.subjectId, subjectId)))
    .orderBy(desc(documentSnapshots.version))
    .limit(1);
  const v = rows[0]?.version;
  return typeof v === 'number' ? v : 0;
}

async function loadPurchaseOrderBundle(tx: Tx, purchaseOrderId: string) {
  const [po] = await tx.select().from(purchaseOrders).where(eq(purchaseOrders.id, purchaseOrderId)).limit(1);
  if (!po) throw new Error('Purchase order not found.');
  const lines = await tx.select().from(purchaseOrderLines).where(eq(purchaseOrderLines.purchaseOrderId, purchaseOrderId));
  const vendor = po.vendorId
    ? (await tx.select().from(vendors).where(eq(vendors.id, po.vendorId)).limit(1))[0] ?? null
    : null;
  return { po, lines, vendor };
}

export async function createFinalizedSnapshotForPurchaseOrder(tx: Tx, purchaseOrderId: string, commandId: string) {
  await lockSubject(tx, DOCUMENT_TYPE_PO, purchaseOrderId);
  const { po, lines, vendor } = await loadPurchaseOrderBundle(tx, purchaseOrderId);
  const projection = getProjectionFor(DOCUMENT_TYPE_PO);
  const internalPayload = buildPurchaseOrderInternalPayload({ purchaseOrder: po, vendor, lines });
  const { payload: externalPayload, projectionVersion } = projection.projectExternal(internalPayload);

  const prior = await selectActiveSnapshotFor(tx, DOCUMENT_TYPE_PO, purchaseOrderId);
  if (prior && prior.status === 'finalized') {
    // Tranche 1 never produces `superseded`. The command-bus layer rejects a
    // re-finalize on an already-finalized PO; this service-level guard backs
    // that promise up so a buggy caller cannot silently create duplicate
    // active rows or write a `superseded` row.
    throw new Error('Purchase order is already finalized; unfinalize before refinalizing.');
  }
  if (prior && prior.status === 'draft') {
    // Consume the draft IN PLACE: UPDATE the same row from draft → finalized.
    // Row id and version are preserved; payloads + provenance refresh.
    await tx.update(documentSnapshots).set({
      status: 'finalized',
      internalPayload,
      externalPayload,
      projectionVersion,
      generatedByCommandId: commandId,
      updatedAt: new Date()
    }).where(eq(documentSnapshots.id, prior.id));
    return { snapshotId: prior.id as string, version: prior.version as number, consumedDraftId: prior.id as string };
  }
  // No active row: INSERT a new finalized snapshot at next version.
  const nextVersion = (await selectMaxVersionFor(tx, DOCUMENT_TYPE_PO, purchaseOrderId)) + 1;
  const [row] = await tx.insert(documentSnapshots).values({
    documentType: DOCUMENT_TYPE_PO,
    subjectId: purchaseOrderId,
    version: nextVersion,
    status: 'finalized',
    internalPayload,
    externalPayload,
    projectionVersion,
    generatedByCommandId: commandId
  }).returning();
  return { snapshotId: row.id as string, version: row.version as number, consumedDraftId: null };
}

export async function voidActiveSnapshotForPurchaseOrder(tx: Tx, purchaseOrderId: string, commandId: string) {
  await lockSubject(tx, DOCUMENT_TYPE_PO, purchaseOrderId);
  const active = await selectActiveSnapshotFor(tx, DOCUMENT_TYPE_PO, purchaseOrderId);
  if (!active) return { voidedId: null };
  await tx.update(documentSnapshots).set({ status: 'void', updatedAt: new Date() }).where(eq(documentSnapshots.id, active.id));
  return { voidedId: active.id as string };
}

export async function saveOrUpdateDraftSnapshotForPurchaseOrder(tx: Tx, purchaseOrderId: string, commandId: string) {
  await lockSubject(tx, DOCUMENT_TYPE_PO, purchaseOrderId);
  const { po, lines, vendor } = await loadPurchaseOrderBundle(tx, purchaseOrderId);
  const projection = getProjectionFor(DOCUMENT_TYPE_PO);
  const internalPayload = buildPurchaseOrderInternalPayload({ purchaseOrder: po, vendor, lines });
  const { payload: externalPayload, projectionVersion } = projection.projectExternal(internalPayload);
  const active = await selectActiveSnapshotFor(tx, DOCUMENT_TYPE_PO, purchaseOrderId);
  if (active && active.status === 'finalized') {
    // Defensive guard. The command-bus saveDraft handler rejects this case;
    // never write `superseded` here.
    throw new Error('Cannot save a draft receipt while a finalized snapshot is active for this purchase order.');
  }
  if (active && active.status === 'draft') {
    await tx.update(documentSnapshots).set({
      internalPayload,
      externalPayload,
      projectionVersion,
      generatedByCommandId: commandId,
      updatedAt: new Date()
    }).where(eq(documentSnapshots.id, active.id));
    return { snapshotId: active.id as string, created: false };
  }
  const nextVersion = (await selectMaxVersionFor(tx, DOCUMENT_TYPE_PO, purchaseOrderId)) + 1;
  const [row] = await tx.insert(documentSnapshots).values({
    documentType: DOCUMENT_TYPE_PO,
    subjectId: purchaseOrderId,
    version: nextVersion,
    status: 'draft',
    internalPayload,
    externalPayload,
    projectionVersion,
    generatedByCommandId: commandId
  }).returning();
  return { snapshotId: row.id as string, created: true };
}

export async function abandonDraftSnapshotForPurchaseOrder(tx: Tx, purchaseOrderId: string, commandId: string) {
  await lockSubject(tx, DOCUMENT_TYPE_PO, purchaseOrderId);
  const active = await selectActiveSnapshotFor(tx, DOCUMENT_TYPE_PO, purchaseOrderId);
  if (!active || active.status !== 'draft') return { voidedId: null };
  await tx.update(documentSnapshots).set({ status: 'void', updatedAt: new Date() }).where(eq(documentSnapshots.id, active.id));
  return { voidedId: active.id as string };
}
```

- [ ] **Step 3: Run tests**

Run: `pnpm test -- src/server/services/documentSnapshots/snapshotService.test.ts`
Expected: PASS for every case enumerated in Step 1.

- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/services/documentSnapshots/snapshotService.ts src/server/services/documentSnapshots/snapshotService.test.ts
git commit -m "feat(receipts): add PO snapshot create/void/draft service (#113)"
```

---

### Task 9: Register two new commands in `src/shared/commandCatalog.ts`

**Files:**
- Modify: `src/shared/commandCatalog.ts`

- [ ] **Step 1: Write the failing test**

Create `src/shared/commandCatalog.receiptCommands.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { commandLabels, commandMinRole, commandNames, reversalPolicies } from './commandCatalog';

describe('receipt commands registered in catalog', () => {
  const expected = ['saveDraftPurchaseOrderReceipt', 'abandonDraftPurchaseOrderReceipt'] as const;
  it('appears in commandNames', () => {
    for (const name of expected) expect(commandNames).toContain(name);
  });
  it('has a label', () => {
    expect(commandLabels.saveDraftPurchaseOrderReceipt).toMatch(/[Dd]raft/);
    expect(commandLabels.abandonDraftPurchaseOrderReceipt).toMatch(/[Aa]bandon/);
  });
  it('has minRole = operator', () => {
    expect(commandMinRole.saveDraftPurchaseOrderReceipt).toBe('operator');
    expect(commandMinRole.abandonDraftPurchaseOrderReceipt).toBe('operator');
  });
  it('has a terminal reversal policy in Tranche 1', () => {
    // Draft snapshot lifecycle is operator-managed: saveDraft can be re-run to
    // update the same row, abandonDraft can be followed by another saveDraft.
    // Neither has an automatic command-bus reverse path in Tranche 1.
    expect(reversalPolicies.saveDraftPurchaseOrderReceipt.disposition).toBe('terminal');
    expect(reversalPolicies.abandonDraftPurchaseOrderReceipt.disposition).toBe('terminal');
  });
});
```

Run: `pnpm test -- src/shared/commandCatalog.receiptCommands.test.ts`
Expected: FAIL.

- [ ] **Step 2: Append to `commandNames`, `commandLabels`, `commandMinRole`, `reversalPolicies`**

In `src/shared/commandCatalog.ts`:

- Append `'saveDraftPurchaseOrderReceipt'` and `'abandonDraftPurchaseOrderReceipt'` to the `commandNames` literal array (place near the other purchase-order commands for readability).
- Add labels:
  - `saveDraftPurchaseOrderReceipt: 'Save PO receipt draft'`
  - `abandonDraftPurchaseOrderReceipt: 'Abandon PO receipt draft'`
- Add minRole entries — both `'operator'`.
- Add reversal policies:
  - `saveDraftPurchaseOrderReceipt: { disposition: 'terminal', guidance: 'Use abandonDraftPurchaseOrderReceipt to discard a draft, or save again to update it. No automatic reverse.' }`
  - `abandonDraftPurchaseOrderReceipt: { disposition: 'terminal', guidance: 'Use saveDraftPurchaseOrderReceipt to create a new draft after abandoning. No automatic reverse.' }`

- [ ] **Step 3: Run test**

Run: `pnpm test -- src/shared/commandCatalog.receiptCommands.test.ts`
Expected: PASS.

- [ ] **Step 4: Run audit parity check (expected interim gap)**

Run: `pnpm audit:parity`
Expected: FAIL with "missing frontend wiring for saveDraftPurchaseOrderReceipt / abandonDraftPurchaseOrderReceipt". This is expected because the frontend wiring lands in Task 16. To avoid a red audit between Task 9 and Task 16 commits:

**Option A (preferred):** Combine Task 9 and Task 16 into a single commit — register the commands in `commandCatalog.ts` AND wire the frontend callsites in `PurchaseOrdersView` in the same commit, then run `audit:parity` once after the combined commit.

**Option B:** Add the two commands temporarily to `internalOnlyCommandNames` (or equivalent internal-only listing) in Task 9, then remove them in Task 16 after the frontend wires them.

If combining, update the commit message to cover both the catalog registration and the frontend wiring.

- [ ] **Step 5: Commit**

```bash
git add src/shared/commandCatalog.ts src/shared/commandCatalog.receiptCommands.test.ts
git commit -m "feat(receipts): register saveDraft/abandonDraft PO receipt commands (#113)"
```

---

### Task 10: Integrate snapshot service into existing PO commands (`finalize` + `unfinalize`)

**Files:**
- Modify: `src/server/services/commandBus.ts` (functions `finalizePurchaseOrder`, `unfinalizePurchaseOrder`, plus the `tablePairs` array inside `snapshotByAffectedIds`)
- Create: `src/server/services/commandBus.poSnapshot.test.ts`

The constraint is to **wrap, not replace**. Add a snapshot side effect at the end of each existing function; do not change the existing validation, the existing toast text, or the existing `affectedIds`.

- [ ] **Step 1: Write the failing integration tests**

Create `src/server/services/commandBus.poSnapshot.test.ts`. The file consumes the shared `inMemoryDbMock` helper created in Task 7b. The preamble below MUST appear in the test file as-is.

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createInMemoryState,
  resetInMemoryState,
  makeMockedDb,
  type InMemoryState
} from './__tests__/inMemoryDbMock';

// Use valid UUIDs everywhere — the documentSnapshots router schemas require
// `z.string().uuid()`, and the partial unique index also expects UUIDs.
const PO_ID = '11111111-1111-4111-8111-111111111111';
const VENDOR_ID = '22222222-2222-4222-8222-222222222222';
const LINE_ID = '33333333-3333-4333-8333-333333333333';
const OPERATOR_USER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

// Exported so individual tests can read seeded state directly.
export const inMemoryState: InMemoryState = createInMemoryState();

function seedDraftPurchaseOrder(s: InMemoryState) {
  s.vendors.push({ id: VENDOR_ID, name: 'Acme Farms', alias: 'ACME' });
  s.purchaseOrders.push({
    id: PO_ID, poNo: 'PO-2026-001', vendorId: VENDOR_ID, status: 'draft',
    paymentTerms: 'net_14', prepaymentAmount: '0.00', total: '1200.00',
    expectedDate: null, orderedAt: null, finalizedAt: null,
    buyerNotes: null, internalNotes: null, externalNotes: null,
    refereeRelationshipId: null, refereeCreditAmount: null
  });
  s.purchaseOrderLines.push({
    id: LINE_ID, purchaseOrderId: PO_ID, itemId: null,
    productName: 'Mendo Breath', category: 'Flower', tags: [],
    qty: '1.000', receivedQty: '0.000', uom: 'lb',
    unitCost: '1200.00', unitPrice: '1800.00',
    costRangeLow: null, costRangeHigh: null,
    sourceCode: null, shorthand: null, legacyMarker: null,
    ownershipStatus: 'C', notes: null, internalNotes: null,
    externalNotes: null, status: 'planned'
  });
}

// Mock `../db` to route every select/insert/update/execute through the shared
// in-memory mock. `commandBus.ts` calls `db.transaction(fn)` to obtain a tx;
// the mock runs `fn(tx)` against `inMemoryState`.
vi.mock('../db', () => {
  const mocked = makeMockedDb(inMemoryState);
  return { db: mocked.db, pool: { query: async () => ({ rows: [] }) } };
});

import { executeCommand } from './commandBus';
import type { SessionUser } from '../../shared/types';

const operatorUser: SessionUser = {
  id: OPERATOR_USER_ID, name: 'Op', role: 'owner', email: 'owner@terpagro.local'
} as unknown as SessionUser;
const ioStub = { emit: () => {} } as any;

beforeEach(() => {
  resetInMemoryState(inMemoryState);
  seedDraftPurchaseOrder(inMemoryState);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('finalizePurchaseOrder side effect — snapshot creation', () => {
  it('writes a document_snapshots row with status=finalized for the PO', async () => {
    const result = await executeCommand({
      name: 'finalizePurchaseOrder',
      payload: { purchaseOrderId: PO_ID },
      idempotencyKey: 'k1', reason: 'test'
    } as any, operatorUser, ioStub);
    expect(result.ok).toBe(true);
    const rows = inMemoryState.documentSnapshots.filter((r) => r.subjectId === PO_ID);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('finalized');
    expect(rows[0].version).toBe(1);
  });

  it('refinalize after unfinalize creates v2 and v1 remains void (NOT superseded)', async () => {
    await executeCommand({ name: 'finalizePurchaseOrder', payload: { purchaseOrderId: PO_ID }, idempotencyKey: 'k1', reason: 'test' } as any, operatorUser, ioStub);
    await executeCommand({ name: 'unfinalizePurchaseOrder', payload: { purchaseOrderId: PO_ID }, idempotencyKey: 'k2', reason: 'test' } as any, operatorUser, ioStub);
    await executeCommand({ name: 'finalizePurchaseOrder', payload: { purchaseOrderId: PO_ID }, idempotencyKey: 'k3', reason: 'test' } as any, operatorUser, ioStub);
    const rows = inMemoryState.documentSnapshots.filter((r) => r.subjectId === PO_ID).sort((a, b) => (a.version as number) - (b.version as number));
    expect(rows).toHaveLength(2);
    expect(rows[0].status).toBe('void');
    expect(rows[1].status).toBe('finalized');
    expect(rows[1].version).toBe(2);
    expect(rows.some((r) => r.status === 'superseded')).toBe(false);
  });

  it('finalize after saveDraft consumes the draft IN PLACE (same row id, version=1, status flips to finalized)', async () => {
    const saveResult = await executeCommand({
      name: 'saveDraftPurchaseOrderReceipt',
      payload: { purchaseOrderId: PO_ID },
      idempotencyKey: 'd1', reason: 'test'
    } as any, operatorUser, ioStub);
    expect(saveResult.ok).toBe(true);
    const draftId = inMemoryState.documentSnapshots.find((r) => r.subjectId === PO_ID && r.status === 'draft')!.id;

    const finalizeResult = await executeCommand({
      name: 'finalizePurchaseOrder',
      payload: { purchaseOrderId: PO_ID },
      idempotencyKey: 'k1', reason: 'test'
    } as any, operatorUser, ioStub);
    expect(finalizeResult.ok).toBe(true);

    const rows = inMemoryState.documentSnapshots.filter((r) => r.subjectId === PO_ID);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(draftId);
    expect(rows[0].status).toBe('finalized');
    expect(rows[0].version).toBe(1);
  });

  it('finalizePurchaseOrder is rolled back when projection throws — no orphan snapshot row', async () => {
    // Static-import-safe: use vi.spyOn on the already-imported projection module
    // so the override is applied AFTER commandBus.ts has resolved its imports.
    // `vi.doMock` does not affect modules that have already been statically
    // imported (commandBus.ts is imported at the top of this file), which is
    // why we cannot use it here.
    const projection = await import('./documentSnapshots/poProjection');
    const spy = vi.spyOn(projection, 'projectExternal').mockImplementationOnce(() => {
      throw new Error('projection failure');
    });
    try {
      const beforeStatus = inMemoryState.purchaseOrders.find((r) => r.id === PO_ID)!.status;
      const result = await executeCommand({ name: 'finalizePurchaseOrder', payload: { purchaseOrderId: PO_ID }, idempotencyKey: 'k1', reason: 'test' } as any, operatorUser, ioStub);
      expect(result.ok).toBe(false);
      expect(inMemoryState.purchaseOrders.find((r) => r.id === PO_ID)!.status).toBe(beforeStatus);
      expect(inMemoryState.documentSnapshots.filter((r) => r.subjectId === PO_ID)).toHaveLength(0);
    } finally {
      spy.mockRestore();
    }
  });
});

describe('unfinalizePurchaseOrder side effect — snapshot void', () => {
  it('voids the active finalized snapshot when unfinalizing', async () => {
    await executeCommand({ name: 'finalizePurchaseOrder', payload: { purchaseOrderId: PO_ID }, idempotencyKey: 'k1', reason: 'test' } as any, operatorUser, ioStub);
    await executeCommand({ name: 'unfinalizePurchaseOrder', payload: { purchaseOrderId: PO_ID }, idempotencyKey: 'k2', reason: 'test' } as any, operatorUser, ioStub);
    const row = inMemoryState.documentSnapshots.find((r) => r.subjectId === PO_ID)!;
    expect(row.status).toBe('void');
  });
  it('no-op when there is no active snapshot (legacy POs)', async () => {
    const result = await executeCommand({ name: 'unfinalizePurchaseOrder', payload: { purchaseOrderId: PO_ID }, idempotencyKey: 'k2', reason: 'test' } as any, operatorUser, ioStub);
    expect(result.ok).toBe(true);
    expect(inMemoryState.documentSnapshots.filter((r) => r.subjectId === PO_ID)).toHaveLength(0);
  });
});

describe('saveDraftPurchaseOrderReceipt + abandonDraftPurchaseOrderReceipt commands', () => {
  it('saveDraft on a draft PO creates a draft snapshot at v1', async () => {
    const r = await executeCommand({ name: 'saveDraftPurchaseOrderReceipt', payload: { purchaseOrderId: PO_ID }, idempotencyKey: 'd1', reason: 'test' } as any, operatorUser, ioStub);
    expect(r.ok).toBe(true);
    const rows = inMemoryState.documentSnapshots.filter((r) => r.subjectId === PO_ID);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('draft');
    expect(rows[0].version).toBe(1);
  });
  it('saveDraft is idempotent: a second call updates rather than creates', async () => {
    await executeCommand({ name: 'saveDraftPurchaseOrderReceipt', payload: { purchaseOrderId: PO_ID }, idempotencyKey: 'd1', reason: 'test' } as any, operatorUser, ioStub);
    await executeCommand({ name: 'saveDraftPurchaseOrderReceipt', payload: { purchaseOrderId: PO_ID }, idempotencyKey: 'd2', reason: 'test' } as any, operatorUser, ioStub);
    const rows = inMemoryState.documentSnapshots.filter((r) => r.subjectId === PO_ID);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('draft');
  });
  it('saveDraft rejects a finalized PO (server-side guard)', async () => {
    await executeCommand({ name: 'finalizePurchaseOrder', payload: { purchaseOrderId: PO_ID }, idempotencyKey: 'k1', reason: 'test' } as any, operatorUser, ioStub);
    const r = await executeCommand({ name: 'saveDraftPurchaseOrderReceipt', payload: { purchaseOrderId: PO_ID }, idempotencyKey: 'd1', reason: 'test' } as any, operatorUser, ioStub);
    expect(r.ok).toBe(false);
    // Toast text from the handler in Task 10 Step 3.
    expect(r.toast).toMatch(/can only be saved for draft purchase orders/i);
  });
  it('abandonDraft transitions draft to void', async () => {
    await executeCommand({ name: 'saveDraftPurchaseOrderReceipt', payload: { purchaseOrderId: PO_ID }, idempotencyKey: 'd1', reason: 'test' } as any, operatorUser, ioStub);
    const r = await executeCommand({ name: 'abandonDraftPurchaseOrderReceipt', payload: { purchaseOrderId: PO_ID }, idempotencyKey: 'd2', reason: 'test' } as any, operatorUser, ioStub);
    expect(r.ok).toBe(true);
    const row = inMemoryState.documentSnapshots.find((r) => r.subjectId === PO_ID)!;
    expect(row.status).toBe('void');
  });
  it('abandonDraft is a no-op when no draft exists', async () => {
    const r = await executeCommand({ name: 'abandonDraftPurchaseOrderReceipt', payload: { purchaseOrderId: PO_ID }, idempotencyKey: 'd2', reason: 'test' } as any, operatorUser, ioStub);
    expect(r.ok).toBe(true);
    expect(inMemoryState.documentSnapshots.filter((r) => r.subjectId === PO_ID)).toHaveLength(0);
  });
});

describe('command-history leak guard — documentSnapshots payloads never reach viewer-readable journal output', () => {
  // These tests harden the tablePairs exclusion AND the affectedIds-PO-only
  // invariant described in Task 10 Step 4.
  const VIEWER_USER_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const viewerUser: SessionUser = {
    id: VIEWER_USER_ID, name: 'Viewer', role: 'viewer', email: 'viewer@test'
  } as unknown as SessionUser;

  async function fetchRelatedCommandsAsViewer(entityId: string) {
    const { appRouter } = await import('../routers');
    const caller = appRouter.createCaller({ user: viewerUser } as any);
    // The real router signature is `{ entityId: z.string().uuid() }` — see
    // src/server/routers/queries.ts. The historical `{ commandId }` shape does
    // not exist on this procedure and must not be used in tests.
    return caller.queries.relatedCommands({ entityId });
  }

  // The command bus exposes `reverseCommandById` as a command, not a query.
  // `queries.reversalPreview({ commandId })` is the read-only preview path used
  // for viewer surfacing; that is the shape under test here.
  async function fetchReversalPreviewAsViewer(commandId: string) {
    const { appRouter } = await import('../routers');
    const caller = appRouter.createCaller({ user: viewerUser } as any);
    return caller.queries.reversalPreview({ commandId });
  }

  it.each([
    ['finalizePurchaseOrder'],
    ['unfinalizePurchaseOrder'],
    ['saveDraftPurchaseOrderReceipt'],
    ['abandonDraftPurchaseOrderReceipt']
  ] as const)('receipt command %s — affectedIds contains the PO id only (no snapshot UUID)', async (name) => {
    // Seed the prerequisite state for each command.
    if (name === 'unfinalizePurchaseOrder' || name === 'abandonDraftPurchaseOrderReceipt') {
      await executeCommand({ name: name === 'unfinalizePurchaseOrder' ? 'finalizePurchaseOrder' : 'saveDraftPurchaseOrderReceipt', payload: { purchaseOrderId: PO_ID }, idempotencyKey: 'seed', reason: 'test' } as any, operatorUser, ioStub);
    }
    const result = await executeCommand({ name, payload: { purchaseOrderId: PO_ID }, idempotencyKey: `k-${name}`, reason: 'test' } as any, operatorUser, ioStub);
    expect(result.ok).toBe(true);
    expect(result.affectedIds).toEqual([PO_ID]);
    // No snapshot row id ever appears in affectedIds.
    const snapshotIds = new Set(inMemoryState.documentSnapshots.map((r) => r.id));
    for (const id of result.affectedIds) expect(snapshotIds.has(id)).toBe(false);
  });

  it('queries.relatedCommands({ entityId: PO_ID }) viewer response does NOT include internalPayload, externalPayload, or any snapshot UUID', async () => {
    await executeCommand({ name: 'finalizePurchaseOrder', payload: { purchaseOrderId: PO_ID }, idempotencyKey: 'k1', reason: 'test' } as any, operatorUser, ioStub);
    const related = await fetchRelatedCommandsAsViewer(PO_ID);
    const serialized = JSON.stringify(related);
    expect(serialized).not.toMatch(/internalPayload/);
    expect(serialized).not.toMatch(/externalPayload/);
    expect(serialized).not.toMatch(/documentSnapshots/);
    expect(serialized).not.toMatch(/INTERNAL — DO NOT SEND/);
    for (const snap of inMemoryState.documentSnapshots) {
      expect(serialized).not.toContain(String(snap.id));
    }
  });

  it('command_journal row for a finalize command — beforeSnapshot/afterSnapshot do not have a documentSnapshots key', async () => {
    const finalize = await executeCommand({ name: 'finalizePurchaseOrder', payload: { purchaseOrderId: PO_ID }, idempotencyKey: 'k1', reason: 'test' } as any, operatorUser, ioStub);
    const journalRow = inMemoryState.commandJournal.find((r) => r.id === finalize.commandId);
    expect(journalRow).toBeTruthy();
    const beforeSnap = (journalRow!.beforeSnapshot ?? {}) as Record<string, unknown>;
    const afterSnap = (journalRow!.afterSnapshot ?? {}) as Record<string, unknown>;
    expect(Object.keys(beforeSnap)).not.toContain('documentSnapshots');
    expect(Object.keys(afterSnap)).not.toContain('documentSnapshots');
  });

  it('queries.reversalPreview({ commandId }) for a finalize command does NOT expose internalPayload, externalPayload, or the watermark to viewer', async () => {
    const finalize = await executeCommand({ name: 'finalizePurchaseOrder', payload: { purchaseOrderId: PO_ID }, idempotencyKey: 'k1', reason: 'test' } as any, operatorUser, ioStub);
    const preview = await fetchReversalPreviewAsViewer(finalize.commandId);
    const serialized = JSON.stringify(preview);
    expect(serialized).not.toMatch(/internalPayload/);
    expect(serialized).not.toMatch(/externalPayload/);
    expect(serialized).not.toMatch(/documentSnapshots/);
    expect(serialized).not.toMatch(/INTERNAL — DO NOT SEND/);
  });

  it('direct commandBus reverseCommandById preview path (operator-only) returns safe output for receipt-related commands', async () => {
    // Reverse-by-id is exercised via the command bus, not a query. We invoke
    // it as an operator (the only role that can) and assert the returned
    // safeOutput shape contains no snapshot internals. Viewer reachability is
    // already covered above via queries.reversalPreview.
    const finalize = await executeCommand({ name: 'finalizePurchaseOrder', payload: { purchaseOrderId: PO_ID }, idempotencyKey: 'k1', reason: 'test' } as any, operatorUser, ioStub);
    const reversal = await executeCommand({
      name: 'reverseCommandById',
      payload: { commandId: finalize.commandId },
      idempotencyKey: 'k-rev', reason: 'test'
    } as any, operatorUser, ioStub);
    const serialized = JSON.stringify(reversal);
    expect(serialized).not.toMatch(/internalPayload/);
    expect(serialized).not.toMatch(/externalPayload/);
    expect(serialized).not.toMatch(/INTERNAL — DO NOT SEND/);
  });
});
```

Run: `pnpm test -- src/server/services/commandBus.poSnapshot.test.ts`
Expected: FAIL on every case (commands not registered, side effects not wired).

- [ ] **Step 2: Wire side effects in `finalizePurchaseOrder` / `unfinalizePurchaseOrder` (commandBus.ts)**

At the top of `src/server/services/commandBus.ts`, add:

```ts
import {
  createFinalizedSnapshotForPurchaseOrder,
  voidActiveSnapshotForPurchaseOrder,
  saveOrUpdateDraftSnapshotForPurchaseOrder,
  abandonDraftSnapshotForPurchaseOrder
} from './documentSnapshots/snapshotService';
import { documentSnapshots } from '../schema';
```

In `finalizePurchaseOrder` (line ~1068), AFTER the existing `tx.update(purchaseOrders)...` call and BEFORE the `return` statement, add:

```ts
const { snapshotId, version, consumedDraftId } = await createFinalizedSnapshotForPurchaseOrder(tx, purchaseOrderId, commandId);
// affectedIds intentionally contains the parent PO id ONLY. The snapshot row id
// is NOT added here — see Task 10 Step 4 leak-guard. Snapshot provenance is
// recorded on the document_snapshots row itself via generatedByCommandId.
// snapshotId / consumedDraftId are kept locally for telemetry/logging only and
// are not surfaced through the command result.
void snapshotId;
void consumedDraftId;
return {
  ok: true,
  commandId,
  affectedIds: [purchaseOrderId],
  toast: `${order.poNo} finalized and ready for approval. Receipt v${version} saved.`
};
```

The toast text MUST contain the literal substring `Receipt v<number> saved` because:
- `commandBus.poSnapshot.test.ts` asserts `toast` matches `/Receipt v\d+ saved/` for finalize success.
- Task 18 manual smoke and Task 23 Playwright spec assert the same substring with regex `/Receipt v1 saved/` and `/Receipt v2 saved/`.

Replace the existing `return` only — preserve the existing validation, the existing `set(...)`, and the existing error messages.

In `unfinalizePurchaseOrder` (line ~1106), after `tx.update(purchaseOrders).set({ status: 'draft', ... })`, add:

```ts
const { voidedId } = await voidActiveSnapshotForPurchaseOrder(tx, purchaseOrderId, commandId);
// affectedIds is PO-id only; voidedId is intentionally not surfaced. See Task
// 10 Step 4 leak-guard.
void voidedId;
return {
  ok: true,
  commandId,
  affectedIds: [purchaseOrderId],
  toast: `${order.poNo} returned to draft.`
};
```

- [ ] **Step 3: Register two new commands**

In the `runCommand(tx, name, payload, user, commandId, reason)` switch in `commandBus.ts`, add:

```ts
case 'saveDraftPurchaseOrderReceipt':
  return saveDraftPurchaseOrderReceipt(tx, payload, commandId);
case 'abandonDraftPurchaseOrderReceipt':
  return abandonDraftPurchaseOrderReceipt(tx, payload, commandId);
```

Add handler functions near the existing PO functions:

```ts
async function saveDraftPurchaseOrderReceipt(tx: Tx, payload: Payload, commandId: string): Promise<CommandResult> {
  const purchaseOrderId = requiredId(payload.purchaseOrderId ?? payload.id, 'purchaseOrderId');
  const [po] = await tx.select().from(purchaseOrders).where(eq(purchaseOrders.id, purchaseOrderId)).limit(1);
  if (!po) throw new Error('Purchase order not found.');
  // Tranche 1 guard: draft snapshots are allowed only on draft POs.
  if (po.status !== 'draft') {
    return { ok: false, commandId, affectedIds: [purchaseOrderId], toast: 'Draft receipts can only be saved for draft purchase orders.' };
  }
  const { snapshotId, created } = await saveOrUpdateDraftSnapshotForPurchaseOrder(tx, purchaseOrderId, commandId);
  // affectedIds is PO-id only — snapshot id stays out of the command result.
  void snapshotId;
  return {
    ok: true,
    commandId,
    affectedIds: [purchaseOrderId],
    toast: created ? `${po.poNo} draft receipt saved.` : `${po.poNo} draft receipt updated.`
  };
}

async function abandonDraftPurchaseOrderReceipt(tx: Tx, payload: Payload, commandId: string): Promise<CommandResult> {
  const purchaseOrderId = requiredId(payload.purchaseOrderId ?? payload.id, 'purchaseOrderId');
  const [po] = await tx.select().from(purchaseOrders).where(eq(purchaseOrders.id, purchaseOrderId)).limit(1);
  if (!po) throw new Error('Purchase order not found.');
  const { voidedId } = await abandonDraftSnapshotForPurchaseOrder(tx, purchaseOrderId, commandId);
  // affectedIds is PO-id only; voidedId is intentionally not surfaced.
  void voidedId;
  return {
    ok: true,
    commandId,
    affectedIds: [purchaseOrderId],
    toast: voidedId ? `${po.poNo} draft receipt abandoned.` : `${po.poNo} had no draft receipt.`
  };
}
```

- [ ] **Step 4: Two enforcements: do NOT add `documentSnapshots` to `tablePairs` AND do NOT add snapshot ids to `affectedIds` (command-history leak guard)**

Two distinct leak vectors must be closed in Tranche 1:

(a) Adding raw `documentSnapshots` rows with `internalPayload` to the generic `snapshotByAffectedIds` snapshots would leak internal document data into the command journal, which may be exposed to viewers via `queries.relatedCommands` or `queries.reversalPreview`.

(b) Adding the snapshot row id to `affectedIds` would surface the snapshot UUID through `queries.relatedCommands({ entityId: snapshotId })` (and even with PO-id queries the snapshot UUID would appear inside the `affectedIds` array of returned journal rows), giving viewers a handle they could then probe.

Concrete enforcement:

1. **`tablePairs` exclusion (vector a).** In `src/server/services/commandBus.ts`, locate the `tablePairs` array used by `snapshotByAffectedIds`. Do NOT add `['documentSnapshots', documentSnapshots]` (or the camelCase Drizzle handle) to that array. If a future engineer is tempted, the leak-guard tests below will fail.
2. **`affectedIds` PO-only (vector b).** As shown in Step 2/3 of this task, all four receipt-related commands (`finalizePurchaseOrder`, `unfinalizePurchaseOrder`, `saveDraftPurchaseOrderReceipt`, `abandonDraftPurchaseOrderReceipt`) return `affectedIds: [purchaseOrderId]`. The snapshot row id is captured locally for telemetry (or simply discarded via `void`) but never surfaced through the command result, the command journal's `affectedIds` column, or any router output.
3. **Provenance recording.** Snapshot provenance for an operator audit trail is already covered by writing `generatedByCommandId` on the `document_snapshots` row itself. The command journal does NOT need to mirror payloads OR snapshot ids.
4. **Test coverage (already required in Step 1).** The `command-history leak guard` describe block in `commandBus.poSnapshot.test.ts` asserts these invariants concretely:
   - For every receipt-related command, `result.affectedIds === [PO_ID]` and contains no snapshot UUID.
   - `queries.relatedCommands({ entityId: PO_ID })` response (called as viewer) MUST NOT contain the literal strings `internalPayload`, `externalPayload`, `documentSnapshots`, or the `INTERNAL — DO NOT SEND` watermark, AND MUST NOT contain any seeded snapshot UUID.
   - The `command_journal` row's `beforeSnapshot`/`afterSnapshot` JSON does NOT have a `documentSnapshots` key.
   - `queries.reversalPreview({ commandId })` response (called as viewer) MUST NOT contain `internalPayload`, `externalPayload`, `documentSnapshots`, or the watermark string.
   - The direct `reverseCommandById` command path (operator-only) MUST NOT include snapshot internals in its return.

These tests are required: a green Tranche 1 closeout requires every assertion above to pass for every command listed. The leak-guard `describe` block in Step 1 parametrizes over all four commands.

- [ ] **Step 5: Run tests**

Run: `pnpm test -- src/server/services/commandBus.poSnapshot.test.ts`
Expected: PASS on every case from Step 1.

Run: `pnpm test -- src/server/services/commandBus.idempotency.test.ts`
Expected: PASS (existing tests still green — the new side effect must not regress idempotency).

- [ ] **Step 6: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/server/services/commandBus.ts src/server/services/commandBus.poSnapshot.test.ts
git commit -m "feat(receipts): wire PO finalize/unfinalize snapshot side effects + draft commands (#113)"
```

---

### Task 11: `documentSnapshots` tRPC router with role-gated endpoints

**Files:**
- Create: `src/server/routers/documentSnapshots.ts`
- Create: `src/server/routers/documentSnapshots.test.ts`
- Modify: `src/server/routers/index.ts`

Public router shape (minimized outputs — see roadmap §4.5 "External router responses are minimized"):

```ts
// Operator+ only. Tranche 1 hard-restricts to documentType='purchase_order'.
// Input requires the documentType literal so the bound type is checked at
// validation; the handler ALSO verifies row.documentType === 'purchase_order'
// after fetch (defence in depth) and throws NOT_FOUND for any other type so
// `getById` cannot be used as a cross-type bypass.
documentSnapshots.getById({ id, documentType: 'purchase_order' }) -> DocumentSnapshotRecord

// Operator+ only. Returns the full DocumentSnapshot row for the active snapshot
// (draft or finalized). This is the operator-only draft preview path.
documentSnapshots.getInternalBySubjectId({ documentType, subjectId }) -> DocumentSnapshotRecord

// Any authenticated user. Returns ONLY the three fields below for the active
// FINALIZED snapshot. No id, no subjectId, no generatedByCommandId, no status
// (finalized-only is implied), no createdAt.
documentSnapshots.getExternalBySubjectId({ documentType, subjectId }) -> { version: number; projectionVersion: number; externalPayload: Record<string, unknown> }

// Operator+ only. Returns version history for the subject.
documentSnapshots.listVersions({ documentType, subjectId }) -> Array<{ id, version, status, createdAt, generatedByCommandId }>

// mode='external' default: viewer-accessible, finalized-only (no draft visible).
// mode='internal': operator+ only.
// includeDrafts: operator-only flag. When true AND caller is operator+, the
//   procedure looks up the ACTIVE snapshot (draft or finalized) instead of the
//   active-finalized one and renders against that row's payload. Passing
//   includeDrafts=true as viewer is FORBIDDEN. This is the operator-only draft
//   preview path for external rendering.
// Minimized to three fields; no id/subjectId/status/createdAt.
documentSnapshots.getReceiptText({ documentType, subjectId, mode, includeDrafts? }) -> { text: string; version: number; projectionVersion: number }
```

For Tranche 1 the only `documentType` value accepted is `purchase_order` (validated via `documentTypeSchema` AND, on `getById`, by the row-level documentType check after fetch). The router throws `TRPCError({ code: 'NOT_FOUND' })` when no active finalized snapshot exists for a subject reachable by the caller's role (used by the UI to decide whether to render the "Preview receipt" button).

- [ ] **Step 1: Write the failing test**

Create `src/server/routers/documentSnapshots.test.ts`. The test seeds rows via the shared `inMemoryDbMock` helper from Task 7b and constructs a tRPC caller via `appRouter.createCaller`. The preamble below MUST appear in the file as-is.

> **Why not `seededRows.filter(predicate)`?** Drizzle predicates returned by
> `eq(...)` and `and(...)` are SQL ASTs, not JavaScript functions. Calling
> `Array.prototype.filter` with them returns the entire array and does not
> actually evaluate any condition, which silently passes every test.
> `inMemoryDbMock` inspects the AST shape and routes the lookup to explicit
> table-aware helpers keyed by documentType + subjectId + status (or id).

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createInMemoryState,
  resetInMemoryState,
  makeMockedDb,
  type InMemoryState
} from '../services/__tests__/inMemoryDbMock';

// Subject ids and snapshot ids are valid UUIDs because the input schemas
// declare `z.string().uuid()` on every router procedure that takes one.
const PO_FINALIZED = '11111111-1111-4111-8111-111111111111';
const PO_DRAFT_ONLY = '22222222-2222-4222-8222-222222222222';
const PO_NO_SNAPSHOT = '33333333-3333-4333-8333-333333333333';
const SNAP_FINALIZED_ID = '44444444-4444-4444-8444-444444444444';
const SNAP_DRAFT_ID = '55555555-5555-4555-8555-555555555555';
const SNAP_WRONG_TYPE_ID = '66666666-6666-4666-8666-666666666666';

const fixtureExternalPayload = {
  poNo: 'PO-2026-001', vendorName: 'Acme Farms', vendorAlias: 'ACME',
  expectedDate: '2026-06-01T00:00:00.000Z', paymentTerms: 'net_14',
  prepaymentAmount: 0, externalNotes: null, finalizedAt: '2026-05-20T15:00:00.000Z',
  total: 1200,
  lines: [{ productName: 'Mendo Breath', category: 'Flower', qty: 1, uom: 'lb',
    unitCost: 1200, costRangeLow: null, costRangeHigh: null, externalNotes: null }]
};
const fixtureInternalPayload = {
  poNo: 'PO-2026-001', vendorId: 'vend', vendorName: 'Acme Farms', vendorAlias: 'ACME',
  status: 'finalized', expectedDate: '2026-06-01T00:00:00.000Z', orderedAt: null,
  finalizedAt: '2026-05-20T15:00:00.000Z', paymentTerms: 'net_14',
  prepaymentAmount: 0, total: 1200,
  buyerNotes: 'BUYER ONLY — do not share', internalNotes: 'INTERNAL — margin target 30%',
  externalNotes: null, refereeRelationshipId: null, refereeCreditAmount: null,
  lines: [{ id: 'l-1', purchaseOrderId: PO_FINALIZED, itemId: null,
    productName: 'Mendo Breath', category: 'Flower', tags: [],
    qty: 1, receivedQty: 0, uom: 'lb', unitCost: 1200, unitPrice: 1800,
    costRangeLow: null, costRangeHigh: null, sourceCode: null, shorthand: null,
    legacyMarker: null, ownershipStatus: 'C', notes: null, internalNotes: 'Internal target $1250',
    externalNotes: null, status: 'planned' }]
};

const state: InMemoryState = createInMemoryState();

function seedRouterRows(s: InMemoryState) {
  s.documentSnapshots.push({
    id: SNAP_FINALIZED_ID, documentType: 'purchase_order', subjectId: PO_FINALIZED,
    version: 1, status: 'finalized', projectionVersion: 1,
    internalPayload: fixtureInternalPayload, externalPayload: fixtureExternalPayload,
    generatedByCommandId: 'cmd-1',
    createdAt: new Date('2026-05-20T15:00:00Z'), updatedAt: new Date('2026-05-20T15:00:00Z')
  });
  s.documentSnapshots.push({
    id: SNAP_DRAFT_ID, documentType: 'purchase_order', subjectId: PO_DRAFT_ONLY,
    version: 1, status: 'draft', projectionVersion: 1,
    internalPayload: fixtureInternalPayload, externalPayload: fixtureExternalPayload,
    generatedByCommandId: 'cmd-2',
    createdAt: new Date('2026-05-20T15:00:00Z'), updatedAt: new Date('2026-05-20T15:00:00Z')
  });
  // A snapshot whose documentType is NOT purchase_order, used to assert that
  // getById refuses to return it even though the row id is well-formed.
  s.documentSnapshots.push({
    id: SNAP_WRONG_TYPE_ID, documentType: 'sales_order', subjectId: PO_FINALIZED,
    version: 1, status: 'finalized', projectionVersion: 1,
    internalPayload: {}, externalPayload: {},
    generatedByCommandId: 'cmd-3',
    createdAt: new Date('2026-05-20T15:00:00Z'), updatedAt: new Date('2026-05-20T15:00:00Z')
  });
}

vi.mock('../db', () => {
  const mocked = makeMockedDb(state);
  return { db: mocked.db };
});

beforeEach(() => {
  resetInMemoryState(state);
  seedRouterRows(state);
});

import { appRouter } from './index';
import type { SessionUser } from '../../shared/types';

const operatorUser = { id: 'op-id', role: 'operator', email: 'op@test', name: 'Op' } as unknown as SessionUser;
const managerUser  = { id: 'mg-id', role: 'manager',  email: 'mg@test', name: 'Mg' } as unknown as SessionUser;
const ownerUser    = { id: 'ow-id', role: 'owner',    email: 'ow@test', name: 'Ow' } as unknown as SessionUser;
const viewerUser   = { id: 'vw-id', role: 'viewer',   email: 'vw@test', name: 'Vw' } as unknown as SessionUser;

function callerFor(user: SessionUser) {
  return appRouter.createCaller({ user } as any);
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('documentSnapshots router — getExternalBySubjectId (minimized output)', () => {
  it('returns ONLY { version, projectionVersion, externalPayload } for finalized snapshot', async () => {
    const result = await callerFor(operatorUser).documentSnapshots.getExternalBySubjectId({
      documentType: 'purchase_order', subjectId: PO_FINALIZED
    });
    expect(Object.keys(result).sort()).toEqual(['externalPayload', 'projectionVersion', 'version']);
    expect(result).not.toHaveProperty('id');
    expect(result).not.toHaveProperty('subjectId');
    expect(result).not.toHaveProperty('generatedByCommandId');
    expect(result).not.toHaveProperty('status');
    expect(result).not.toHaveProperty('createdAt');
    expect(result).not.toHaveProperty('internalPayload');
  });

  it('throws NOT_FOUND when no active snapshot exists', async () => {
    await expect(callerFor(operatorUser).documentSnapshots.getExternalBySubjectId({
      documentType: 'purchase_order', subjectId: PO_NO_SNAPSHOT
    })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('viewer receives NOT_FOUND when subject only has a draft snapshot', async () => {
    await expect(callerFor(viewerUser).documentSnapshots.getExternalBySubjectId({
      documentType: 'purchase_order', subjectId: PO_DRAFT_ONLY
    })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('rejects non-PO documentType with NOT_IMPLEMENTED', async () => {
    await expect(callerFor(operatorUser).documentSnapshots.getExternalBySubjectId({
      documentType: 'sales_order', subjectId: PO_FINALIZED
    })).rejects.toMatchObject({ code: 'NOT_IMPLEMENTED' });
  });
});

describe('documentSnapshots router — getInternalBySubjectId (operator+ only)', () => {
  it('returns the full row for owner / manager / operator', async () => {
    for (const user of [ownerUser, managerUser, operatorUser]) {
      const result = await callerFor(user).documentSnapshots.getInternalBySubjectId({
        documentType: 'purchase_order', subjectId: PO_FINALIZED
      });
      expect(result).toHaveProperty('internalPayload');
      expect(result).toHaveProperty('externalPayload');
    }
  });

  it('returns FORBIDDEN for viewer', async () => {
    await expect(callerFor(viewerUser).documentSnapshots.getInternalBySubjectId({
      documentType: 'purchase_order', subjectId: PO_FINALIZED
    })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

describe('documentSnapshots router — listVersions (operator+ only)', () => {
  it('returns rows ordered by version desc', async () => {
    const rows = await callerFor(operatorUser).documentSnapshots.listVersions({
      documentType: 'purchase_order', subjectId: PO_FINALIZED
    });
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows[0].version).toBeGreaterThanOrEqual(rows[rows.length - 1].version);
  });

  it('is FORBIDDEN for viewer', async () => {
    await expect(callerFor(viewerUser).documentSnapshots.listVersions({
      documentType: 'purchase_order', subjectId: PO_FINALIZED
    })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

describe('documentSnapshots router — getReceiptText (minimized output)', () => {
  it('mode=external (no includeDrafts) returns ONLY { text, version, projectionVersion } and contains no INTERNAL/unitPrice/internalNotes', async () => {
    const result = await callerFor(operatorUser).documentSnapshots.getReceiptText({
      documentType: 'purchase_order', subjectId: PO_FINALIZED, mode: 'external'
    });
    expect(Object.keys(result).sort()).toEqual(['projectionVersion', 'text', 'version']);
    expect(result).not.toHaveProperty('id');
    expect(result).not.toHaveProperty('status');
    expect(result.text).not.toMatch(/INTERNAL/);
    expect(result.text).not.toMatch(/internalNotes/);
    expect(result.text).not.toMatch(/unitPrice/);
    expect(result.text).toMatch(/Vendor unit price/);
  });

  it('mode=external WITHOUT includeDrafts returns NOT_FOUND for a draft-only subject (viewer + operator)', async () => {
    for (const user of [viewerUser, operatorUser]) {
      await expect(callerFor(user).documentSnapshots.getReceiptText({
        documentType: 'purchase_order', subjectId: PO_DRAFT_ONLY, mode: 'external'
      })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    }
  });

  it('mode=external WITH includeDrafts=true returns the draft preview for operator', async () => {
    const result = await callerFor(operatorUser).documentSnapshots.getReceiptText({
      documentType: 'purchase_order', subjectId: PO_DRAFT_ONLY, mode: 'external', includeDrafts: true
    });
    expect(result.text).toMatch(/Vendor unit price/);
    // External rendering of a draft still omits internal-only terms.
    expect(result.text).not.toMatch(/INTERNAL/);
    expect(result.text).not.toMatch(/unitPrice/);
  });

  it('mode=external WITH includeDrafts=true is FORBIDDEN for viewer', async () => {
    await expect(callerFor(viewerUser).documentSnapshots.getReceiptText({
      documentType: 'purchase_order', subjectId: PO_DRAFT_ONLY, mode: 'external', includeDrafts: true
    })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('mode=internal is FORBIDDEN for viewer (with or without includeDrafts)', async () => {
    for (const include of [undefined, true]) {
      await expect(callerFor(viewerUser).documentSnapshots.getReceiptText({
        documentType: 'purchase_order', subjectId: PO_FINALIZED, mode: 'internal', includeDrafts: include
      })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    }
  });

  it('mode=internal includes "INTERNAL — DO NOT SEND" watermark for operator', async () => {
    const result = await callerFor(operatorUser).documentSnapshots.getReceiptText({
      documentType: 'purchase_order', subjectId: PO_FINALIZED, mode: 'internal'
    });
    expect(result.text).toMatch(/^INTERNAL — DO NOT SEND/);
  });
});

describe('documentSnapshots router — getById (operator+ only, documentType-bound)', () => {
  it('requires documentType = "purchase_order" literal in Tranche 1', async () => {
    // The input schema rejects any other documentType at validation time.
    await expect(callerFor(operatorUser).documentSnapshots.getById({
      id: SNAP_FINALIZED_ID, documentType: 'sales_order' as any
    })).rejects.toBeDefined();
  });

  it('returns full row for operator when documentType matches', async () => {
    const result = await callerFor(operatorUser).documentSnapshots.getById({
      id: SNAP_FINALIZED_ID, documentType: 'purchase_order'
    });
    expect(result).toHaveProperty('internalPayload');
    expect(result.documentType).toBe('purchase_order');
  });

  it('returns NOT_FOUND when the row id belongs to a non-PO documentType (defence in depth)', async () => {
    // SNAP_WRONG_TYPE_ID exists in the seeded data with documentType=sales_order.
    // Even with the validated input claim of 'purchase_order', the handler must
    // refuse to leak the row.
    await expect(callerFor(operatorUser).documentSnapshots.getById({
      id: SNAP_WRONG_TYPE_ID, documentType: 'purchase_order'
    })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('is FORBIDDEN for viewer in Tranche 1', async () => {
    await expect(callerFor(viewerUser).documentSnapshots.getById({
      id: SNAP_FINALIZED_ID, documentType: 'purchase_order'
    })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
```

Run: `pnpm test -- src/server/routers/documentSnapshots.test.ts`
Expected: FAIL (router not implemented).

- [ ] **Step 2: Implement the router**

Create `src/server/routers/documentSnapshots.ts`:

```ts
import { TRPCError } from '@trpc/server';
import { and, desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db';
import { protectedProcedure, router } from '../trpc';
import { documentSnapshots } from '../schema';
import { documentTypeSchema } from '../../shared/documentSnapshots';
import { getProjectionFor } from '../services/documentSnapshots';

const INTERNAL_ROLES = new Set(['owner', 'manager', 'operator']);

// Tranche 1: only purchase_order is implemented.
function assertTranche1Type(documentType: string) {
  if (documentType !== 'purchase_order') {
    throw new TRPCError({ code: 'NOT_IMPLEMENTED', message: `document_type "${documentType}" is not yet supported in Tranche 1.` });
  }
}

async function findActiveSnapshot(documentType: string, subjectId: string) {
  const rows = await db.select().from(documentSnapshots)
    .where(and(
      eq(documentSnapshots.documentType, documentType),
      eq(documentSnapshots.subjectId, subjectId),
      sql`${documentSnapshots.status} in ('draft','finalized')`
    ))
    .orderBy(desc(documentSnapshots.version))
    .limit(1);
  return rows[0];
}

async function findActiveFinalizedSnapshot(documentType: string, subjectId: string) {
  const rows = await db.select().from(documentSnapshots)
    .where(and(
      eq(documentSnapshots.documentType, documentType),
      eq(documentSnapshots.subjectId, subjectId),
      eq(documentSnapshots.status, 'finalized')
    ))
    .orderBy(desc(documentSnapshots.version))
    .limit(1);
  return rows[0];
}

export const documentSnapshotsRouter = router({
  getById: protectedProcedure
    .input(z.object({
      id: z.string().uuid(),
      // Tranche 1: hard-bind to purchase_order. The literal is rejected by zod
      // for any other value, and the handler ALSO checks row.documentType
      // after fetch (defence in depth) so a stale id of a future document
      // type can never leak.
      documentType: z.literal('purchase_order')
    }))
    .query(async ({ ctx, input }) => {
      if (!INTERNAL_ROLES.has(ctx.user.role)) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Snapshot detail requires operator access in Tranche 1.' });
      }
      const [row] = await db.select().from(documentSnapshots).where(eq(documentSnapshots.id, input.id)).limit(1);
      if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: 'Snapshot not found.' });
      if (row.documentType !== input.documentType) {
        // Treat type mismatches as NOT_FOUND so the caller cannot probe for the
        // existence of non-PO snapshots via this endpoint.
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Snapshot not found.' });
      }
      return row;
    }),
  getExternalBySubjectId: protectedProcedure
    .input(z.object({ documentType: documentTypeSchema, subjectId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      assertTranche1Type(input.documentType);
      // Finalized-only at the source. Even operator+ callers receive the same
      // minimized shape from this endpoint; use getInternalBySubjectId for the
      // full row with internal payload, or getReceiptText with includeDrafts.
      const row = await findActiveFinalizedSnapshot(input.documentType, input.subjectId);
      if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: 'No finalized snapshot for this subject.' });
      // Minimized output: only the three fields the UI/viewer needs. See roadmap §4.5.
      return {
        version: row.version,
        projectionVersion: row.projectionVersion,
        externalPayload: row.externalPayload
      };
    }),
  getInternalBySubjectId: protectedProcedure
    .input(z.object({ documentType: documentTypeSchema, subjectId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      assertTranche1Type(input.documentType);
      if (!INTERNAL_ROLES.has(ctx.user.role)) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Internal receipts require operator access.' });
      }
      const row = await findActiveSnapshot(input.documentType, input.subjectId);
      if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: 'No active snapshot for this subject.' });
      return row;
    }),
  listVersions: protectedProcedure
    .input(z.object({ documentType: documentTypeSchema, subjectId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      assertTranche1Type(input.documentType);
      if (!INTERNAL_ROLES.has(ctx.user.role)) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Version history requires operator access in Tranche 1.' });
      }
      const rows = await db.select({
        id: documentSnapshots.id,
        version: documentSnapshots.version,
        status: documentSnapshots.status,
        createdAt: documentSnapshots.createdAt,
        generatedByCommandId: documentSnapshots.generatedByCommandId
      }).from(documentSnapshots)
        .where(and(eq(documentSnapshots.documentType, input.documentType), eq(documentSnapshots.subjectId, input.subjectId)))
        .orderBy(desc(documentSnapshots.version));
      return rows;
    }),
  getReceiptText: protectedProcedure
    .input(z.object({
      documentType: documentTypeSchema,
      subjectId: z.string().uuid(),
      mode: z.enum(['external', 'internal']),
      // Operator-only flag — when true, the external/internal lookup uses the
      // active snapshot (draft OR finalized) instead of only-finalized.
      // Viewer callers MUST NOT pass true; the handler rejects that as FORBIDDEN.
      includeDrafts: z.boolean().optional()
    }))
    .query(async ({ ctx, input }) => {
      assertTranche1Type(input.documentType);
      const isInternalRole = INTERNAL_ROLES.has(ctx.user.role);
      if (input.mode === 'internal' && !isInternalRole) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Internal receipts require operator access.' });
      }
      if (input.includeDrafts && !isInternalRole) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Draft receipts require operator access.' });
      }
      // For external mode without includeDrafts, only finalized snapshots are reachable.
      // For internal mode, operator+ always reads the active row (draft or finalized).
      // For external mode WITH includeDrafts (operator+ only), read the active row too
      // and render its external_payload with renderPlainTextExternal.
      const row = (input.mode === 'external' && !input.includeDrafts)
        ? await findActiveFinalizedSnapshot(input.documentType, input.subjectId)
        : await findActiveSnapshot(input.documentType, input.subjectId);
      if (!row) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: (input.mode === 'external' && !input.includeDrafts)
            ? 'No finalized snapshot for this subject.'
            : 'No active snapshot for this subject.'
        });
      }
      const projection = getProjectionFor(input.documentType);
      const text = input.mode === 'external'
        ? projection.renderPlainTextExternal(row.externalPayload as Record<string, unknown>)
        : projection.renderPlainTextInternal(row.internalPayload as Record<string, unknown>);
      // Minimized output: { text, version, projectionVersion } only.
      return { text, version: row.version, projectionVersion: row.projectionVersion };
    })
});
```

- [ ] **Step 3: Mount router in `src/server/routers/index.ts`**

```ts
import { documentSnapshotsRouter } from './documentSnapshots';

export const appRouter = router({
  // ...existing
  documentSnapshots: documentSnapshotsRouter
});
```

- [ ] **Step 4: Run router tests**

Run: `pnpm test -- src/server/routers/documentSnapshots.test.ts`
Expected: PASS for every case in Step 1.

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/server/routers/documentSnapshots.ts src/server/routers/documentSnapshots.test.ts src/server/routers/index.ts
git commit -m "feat(receipts): add role-gated documentSnapshots tRPC router (#113)"
```

---

### Task 12: `ReceiptPreview` client component (renderer + copy + print + watermark)

**Files:**
- Create: `src/client/components/ReceiptPreview.tsx`
- Create: `src/client/components/ReceiptPreview.test.tsx`

Component contract:

```tsx
interface ReceiptPreviewProps {
  documentType: 'purchase_order'; // Tranche 1 only purchase_order
  subjectId: string;
  initialMode?: 'external' | 'internal';
  onClose: () => void;
}
```

Behavior:

- Opens as a modal overlay (`role="dialog"`, `aria-modal="true"`) — does NOT unmount the grid behind it. Keeps `useUiStore` state intact.
- **Renders via React portal to `document.body`.** The overlay's outermost element (`.receipt-preview-overlay`) is a direct child of `document.body` so the print stylesheet in Task 13 (`body.print-receipt-only > *:not(.receipt-preview-overlay) { display: none !important; }`) correctly preserves the receipt during print. Without a portal, the overlay would be nested inside `PurchaseOrdersView`'s `view-stack` and the print stylesheet would hide its parent.
- Toggle between external (default) and internal modes. Internal mode renders the body prefixed by a visible `INTERNAL — DO NOT SEND` banner (`<div role="status" aria-live="polite" data-testid="internal-watermark">`).
- Fetches `trpc.documentSnapshots.getReceiptText` with the active mode + subjectId. Uses `enabled: Boolean(subjectId)`.
- **Operator-only draft preview path.** When the current user's role is `owner | manager | operator`, the component passes `includeDrafts: true` so it can preview the active draft snapshot in both external and internal modes (the external rendering of the draft is produced server-side from the draft's stored `external_payload` via the operator-gated path; the operator does NOT route through the viewer endpoint). Viewers never pass the flag and so receive NOT_FOUND for draft-only subjects.
- Mode toggle is disabled when `me.data?.role === 'viewer'` (cannot switch into internal).
- "Copy" button writes the displayed plain text to the clipboard (`navigator.clipboard.writeText`). For internal mode, the copied text MUST also include the watermark line at the top (the renderer already prepends it; we still assert this in tests).
- "Print" button calls `window.print()` after applying a `.print-receipt-only` body class so a CSS print stylesheet (added in Task 13) hides everything except the receipt content.
- Uses semantic classes from `src/client/styles.css`: `secondary-button`, `primary-button`, `compact-action`, `inline-panel`, `view-stack`. The watermark uses `selection-pill danger` styling.

- [ ] **Step 1: Write the failing test**

Create `src/client/components/ReceiptPreview.test.tsx` (uses `@testing-library/react`, the existing test setup). The `ReceiptPreviewWrapper` helper below MUST be defined inline in the test file — it wraps the component with the same QueryClientProvider + tRPC provider as `src/client/hooks/useCommandRunner.test.tsx` uses, and stubs both `trpc.documentSnapshots.getReceiptText` and `trpc.auth.me`.

```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReceiptPreview } from './ReceiptPreview';

// Inline mocks for the two tRPC hooks ReceiptPreview consumes. The shape
// returned must match what useQuery returns in the real client (data,
// isLoading, isSuccess, error). The implementing agent should follow the
// pattern in src/client/hooks/useCommandRunner.test.tsx — extract a shared
// `createMockTrpc(overrides)` helper if it does not already exist.
type RoleOverride = 'owner' | 'manager' | 'operator' | 'viewer';
let currentRole: RoleOverride = 'operator';
let currentMode: 'external' | 'internal' = 'external';

// Captures the most recent input passed to getReceiptText so individual tests
// can assert the operator path passes includeDrafts=true and the viewer path
// does not.
const recordedInputs: Array<{ mode: 'external' | 'internal'; includeDrafts?: boolean; subjectId: string }> = [];

vi.mock('../api/trpc', () => ({
  trpc: {
    auth: {
      me: { useQuery: () => ({ data: { id: 'u-1', role: currentRole, name: 'Op' }, isSuccess: true, isLoading: false }) }
    },
    documentSnapshots: {
      getReceiptText: {
        useQuery: (input: { mode: 'external' | 'internal'; subjectId: string; includeDrafts?: boolean }) => {
          recordedInputs.push({ mode: input.mode, includeDrafts: input.includeDrafts, subjectId: input.subjectId });
          const text = input.mode === 'internal'
            ? 'INTERNAL — DO NOT SEND\nPurchase Order PO-2026-001 for Acme Farms.\nInternal notes: margin target 30%.\nResale/markup: $1800.00'
            : 'Purchase Order PO-2026-001 for Acme Farms.\nLines:\n1. Mendo Breath — Flower, 1 lb at Vendor unit price $1200.00.';
          return { data: { text, version: 1, projectionVersion: 1 }, isLoading: false, error: null };
        }
      }
    }
  }
}));

vi.mock('../store/uiStore', () => ({
  useUiStore: (selector: any) => selector({ pushToast: vi.fn() })
}));

// Wrapper exposes role + initial mode for individual tests.
function ReceiptPreviewWrapper(props: {
  subjectId?: string;
  initialMode?: 'external' | 'internal';
  roleOverride?: RoleOverride;
  onClose?: () => void;
}) {
  currentRole = props.roleOverride ?? 'operator';
  currentMode = props.initialMode ?? 'external';
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <ReceiptPreview
        documentType="purchase_order"
        subjectId={props.subjectId ?? '11111111-1111-4111-8111-111111111111'}
        initialMode={currentMode}
        onClose={props.onClose ?? (() => {})}
      />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  // jsdom doesn't provide clipboard by default; install a spyable stub.
  Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
  recordedInputs.length = 0;
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('ReceiptPreview', () => {
  it('renders the external plain text by default and excludes internal watermark', async () => {
    render(<ReceiptPreviewWrapper initialMode="external" />);
    await waitFor(() => expect(screen.getByTestId('receipt-preview-body')).toHaveTextContent(/Purchase Order/));
    expect(screen.queryByTestId('internal-watermark')).not.toBeInTheDocument();
  });
  it('switching to Internal shows the INTERNAL — DO NOT SEND banner', async () => {
    render(<ReceiptPreviewWrapper initialMode="external" />);
    await waitFor(() => expect(screen.getByTestId('receipt-preview-body')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Internal/i }));
    await waitFor(() => expect(screen.getByTestId('internal-watermark')).toBeVisible());
  });
  it('disables the Internal toggle for viewer role', async () => {
    render(<ReceiptPreviewWrapper roleOverride="viewer" />);
    await waitFor(() => expect(screen.getByRole('button', { name: /Internal/i })).toBeDisabled());
  });
  it('Copy button writes displayed text to clipboard', async () => {
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);
    render(<ReceiptPreviewWrapper initialMode="external" />);
    await waitFor(() => expect(screen.getByTestId('receipt-preview-body')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Copy/i }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(expect.stringContaining('Purchase Order')));
    writeText.mockRestore();
  });
  it('Copy in internal mode includes the watermark line in the copied text', async () => {
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);
    render(<ReceiptPreviewWrapper initialMode="internal" />);
    await waitFor(() => expect(screen.getByTestId('receipt-preview-body')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Copy/i }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(expect.stringMatching(/^INTERNAL — DO NOT SEND/)));
    writeText.mockRestore();
  });
  it('Print button calls window.print after setting body class (internal mode keeps watermark visible)', async () => {
    const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {});
    render(<ReceiptPreviewWrapper initialMode="internal" />);
    await waitFor(() => expect(screen.getByTestId('receipt-preview-body')).toBeInTheDocument());
    // Watermark must be in the DOM at the moment window.print is called so the
    // print stylesheet does not hide it.
    expect(screen.getByTestId('internal-watermark')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: /Print/i }));
    expect(document.body.classList.contains('print-receipt-only')).toBe(true);
    expect(printSpy).toHaveBeenCalledTimes(1);
    printSpy.mockRestore();
  });
  it('Close button calls onClose', async () => {
    const onClose = vi.fn();
    render(<ReceiptPreviewWrapper onClose={onClose} />);
    await waitFor(() => expect(screen.getByTestId('receipt-preview-body')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Close/i }));
    expect(onClose).toHaveBeenCalled();
  });

  it('renders the overlay as a DIRECT child of document.body (React portal — required for print stylesheet)', async () => {
    render(
      <ReceiptPreviewWrapper roleOverride="operator" initialMode="external" />,
      // Mount the testing-library container inside a wrapper so we can assert
      // the overlay is NOT inside that container but IS a direct body child.
      { container: document.body.appendChild(document.createElement('div')) }
    );
    await waitFor(() => expect(screen.getByTestId('receipt-preview-overlay')).toBeInTheDocument());
    const overlay = screen.getByTestId('receipt-preview-overlay');
    expect(overlay.parentElement).toBe(document.body);
  });

  it('operator role passes includeDrafts=true to getReceiptText (so active drafts are previewable)', async () => {
    render(<ReceiptPreviewWrapper roleOverride="operator" initialMode="external" />);
    await waitFor(() => expect(recordedInputs.length).toBeGreaterThan(0));
    const last = recordedInputs[recordedInputs.length - 1];
    expect(last.includeDrafts).toBe(true);
  });

  it('viewer role does NOT pass includeDrafts to getReceiptText (viewer never sees drafts)', async () => {
    render(<ReceiptPreviewWrapper roleOverride="viewer" initialMode="external" />);
    await waitFor(() => expect(recordedInputs.length).toBeGreaterThan(0));
    const last = recordedInputs[recordedInputs.length - 1];
    expect(last.includeDrafts).toBeUndefined();
  });
});
```

Run: `pnpm test -- src/client/components/ReceiptPreview.test.tsx`
Expected: FAIL (component missing).

- [ ] **Step 2: Implement `ReceiptPreview.tsx`**

```tsx
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { trpc } from '../api/trpc';
import { useUiStore } from '../store/uiStore';

type Mode = 'external' | 'internal';

export interface ReceiptPreviewProps {
  documentType: 'purchase_order';
  subjectId: string;
  initialMode?: Mode;
  onClose: () => void;
}

const INTERNAL_ROLES = new Set(['owner', 'manager', 'operator']);

export function ReceiptPreview({ documentType, subjectId, initialMode = 'external', onClose }: ReceiptPreviewProps) {
  const me = trpc.auth.me.useQuery();
  // Default to false while auth.me is loading; never default to true.
  const canSeeInternal = me.isSuccess && me.data?.role ? INTERNAL_ROLES.has(me.data.role) : false;
  const [mode, setMode] = useState<Mode>(canSeeInternal ? initialMode : 'external');
  const pushToast = useUiStore((state) => state.pushToast);

  // Operator+ callers pass includeDrafts=true so they can preview active drafts
  // through the operator-gated path. Viewers omit the flag and so only ever
  // receive finalized snapshots; draft-only subjects return NOT_FOUND for them.
  const query = trpc.documentSnapshots.getReceiptText.useQuery(
    canSeeInternal
      ? { documentType, subjectId, mode, includeDrafts: true }
      : { documentType, subjectId, mode },
    { enabled: Boolean(subjectId) }
  );

  async function handleCopy() {
    if (!query.data?.text) return;
    await navigator.clipboard.writeText(query.data.text);
    pushToast(mode === 'internal' ? 'Internal receipt copied (includes watermark).' : 'External receipt copied.', 'success');
  }

  function handlePrint() {
    document.body.classList.add('print-receipt-only');
    try {
      window.print();
    } finally {
      // Defer so the print dialog still sees the class on first event-loop turn.
      setTimeout(() => document.body.classList.remove('print-receipt-only'), 0);
    }
  }

  // Render through a portal so the overlay is a DIRECT child of document.body.
  // This is required for the print stylesheet in Task 13, which uses
  // `body.print-receipt-only > *:not(.receipt-preview-overlay) { display: none }`.
  // If the overlay were nested inside PurchaseOrdersView's view-stack, its
  // ancestor would be hidden during print and the receipt would not render.
  // Guard for non-browser test environments where document is undefined.
  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="receipt-preview-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Receipt preview"
      data-testid="receipt-preview-overlay"
    >
      <div className="inline-panel receipt-preview-panel">
        <div className="control-band subtle-band">
          <div className="page-title">Receipt preview</div>
          <div className="control-band">
            <button
              className={`secondary-button compact-action${mode === 'external' ? ' is-active' : ''}`}
              type="button"
              onClick={() => setMode('external')}
            >
              External
            </button>
            <button
              className={`secondary-button compact-action${mode === 'internal' ? ' is-active' : ''}`}
              type="button"
              disabled={!canSeeInternal}
              onClick={() => setMode('internal')}
              title={canSeeInternal ? 'Switch to internal view' : 'Viewers cannot read internal receipts.'}
            >
              Internal
            </button>
            <button className="secondary-button compact-action" type="button" onClick={handleCopy} disabled={!query.data?.text}>
              Copy
            </button>
            <button className="secondary-button compact-action" type="button" onClick={handlePrint} disabled={!query.data?.text}>
              Print
            </button>
            <button className="text-button compact-action" type="button" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
        {mode === 'internal' ? (
          <div className="selection-pill danger" role="status" aria-live="polite" data-testid="internal-watermark">
            INTERNAL — DO NOT SEND
          </div>
        ) : null}
        <pre className="receipt-preview-body" data-testid="receipt-preview-body">
          {query.isLoading ? 'Loading…' : query.data?.text ?? (query.error?.message ?? 'No snapshot.')}
        </pre>
      </div>
    </div>,
    document.body
  );
}
```

- [ ] **Step 3: Run tests**

Run: `pnpm test -- src/client/components/ReceiptPreview.test.tsx`
Expected: PASS.

- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/client/components/ReceiptPreview.tsx src/client/components/ReceiptPreview.test.tsx
git commit -m "feat(receipts): add ReceiptPreview component (copy/print/internal watermark) (#113)"
```

---

### Task 13: CSS — semantic classes for receipt preview + print stylesheet

**Files:**
- Modify: `src/client/styles.css`

- [ ] **Step 1: Add semantic classes**

In `src/client/styles.css`, append (use `@apply` consistent with the rest of the file):

```css
.receipt-preview-overlay {
  @apply fixed inset-0 z-50 flex items-start justify-center bg-zinc-900/30 p-6 overflow-auto;
}

.receipt-preview-panel {
  @apply w-full max-w-3xl bg-field rounded shadow-lg p-4 space-y-3;
}

.receipt-preview-body {
  @apply whitespace-pre-wrap font-mono text-sm text-ink bg-panel border border-line rounded p-3 max-h-[60vh] overflow-auto;
}

/* Print stylesheet — hides everything except the receipt preview body when
   .print-receipt-only is set on <body> by ReceiptPreview.handlePrint.
   This selector works because ReceiptPreview renders the overlay via a React
   portal targeting document.body (Task 12), so `.receipt-preview-overlay` is a
   DIRECT child of <body>. If the overlay were rendered nested inside the
   PurchaseOrdersView subtree, the `*:not(.receipt-preview-overlay)` selector
   would hide the overlay's ancestor and the receipt body would not print.
   Task 12 tests assert the direct-body-child invariant. */
@media print {
  body.print-receipt-only > *:not(.receipt-preview-overlay) {
    display: none !important;
  }
  body.print-receipt-only .receipt-preview-overlay {
    position: static !important;
    background: transparent !important;
    padding: 0 !important;
  }
  body.print-receipt-only .receipt-preview-panel {
    box-shadow: none !important;
    max-width: 100% !important;
  }
  body.print-receipt-only .control-band,
  body.print-receipt-only .text-button,
  body.print-receipt-only .secondary-button,
  body.print-receipt-only .primary-button {
    display: none !important;
  }
}
```

- [ ] **Step 2: Verify the build still type-checks (no JS code change)**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Visual confirmation deferred to Task 18**

Do NOT attempt manual smoke of the Preview receipt button here — the button is added in Tasks 16/17, which come after this CSS task. Visual confirmation of overlay + watermark happens in Task 18 manual smoke. The Playwright spec in Task 23 is the gating automated proof.

- [ ] **Step 4: Commit**

```bash
git add src/client/styles.css
git commit -m "feat(receipts): add receipt preview semantic classes + print stylesheet (#113)"
```

---



### Task 15: tRPC client surface check — confirm types reach the client

**Files:**
- Modify (if necessary): none. tRPC type inference is automatic via `AppRouter`.

- [ ] **Step 1: Verify the new procedure types are reachable from the client**

Add a temporary smoke test `src/client/api/documentSnapshots.smoke.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import type { AppRouter } from '../../server/routers';
import type { inferRouterInputs, inferRouterOutputs } from '@trpc/server';

type In = inferRouterInputs<AppRouter>;
type Out = inferRouterOutputs<AppRouter>;

describe('documentSnapshots tRPC surface', () => {
  it('exposes the five procedures with strongly typed inputs', () => {
    const input: In['documentSnapshots']['getExternalBySubjectId'] = { documentType: 'purchase_order', subjectId: '00000000-0000-0000-0000-000000000000' };
    expect(input.documentType).toBe('purchase_order');
    // Pure compile-time check; runtime expect is a witness. getReceiptText
    // output is the minimized `{ text, version, projectionVersion }` shape; all
    // three fields are required so the type literal must include them.
    const _outputCheck: Out['documentSnapshots']['getReceiptText'] = { text: '', version: 1, projectionVersion: 1 };
    expect(_outputCheck.text).toBe('');
    expect(_outputCheck.version).toBe(1);
    expect(_outputCheck.projectionVersion).toBe(1);

    // getById input now requires the documentType literal (Tranche 1 binds to
    // purchase_order only).
    const byIdInput: In['documentSnapshots']['getById'] = { id: '00000000-0000-0000-0000-000000000000', documentType: 'purchase_order' };
    expect(byIdInput.documentType).toBe('purchase_order');

    // getReceiptText input accepts the optional includeDrafts flag.
    const textInput: In['documentSnapshots']['getReceiptText'] = { documentType: 'purchase_order', subjectId: '00000000-0000-0000-0000-000000000000', mode: 'external', includeDrafts: true };
    expect(textInput.includeDrafts).toBe(true);
  });
});
```

Run: `pnpm test -- src/client/api/documentSnapshots.smoke.test.ts`
Expected: PASS.

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/client/api/documentSnapshots.smoke.test.ts
git commit -m "test(receipts): smoke test documentSnapshots tRPC client types (#113)"
```

---

### Task 16: `PurchaseOrdersView` — wire Save Draft / Abandon Draft buttons through `useCommandRunner`

**Files:**
- Modify: `src/client/views/OperationsViews.tsx` (`PurchaseOrdersView`)

- [ ] **Step 1: Add buttons to the per-row expansion actions**

Inside `purchaseOrderExpansionConfig.actionsRenderer`, append (after the existing Cancel draft PO button):

```tsx
<button
  className="secondary-button compact-action"
  disabled={isRunning || !canWrite || !row.id || row.status !== 'draft'}
  onClick={() => runCommand('saveDraftPurchaseOrderReceipt', { purchaseOrderId: row.id }, 'Save PO receipt draft')}
  type="button"
>
  Save draft receipt
</button>
<button
  className="secondary-button compact-action"
  disabled={isRunning || !canWrite || !row.id}
  onClick={() => runCommand('abandonDraftPurchaseOrderReceipt', { purchaseOrderId: row.id }, 'Abandon PO receipt draft')}
  type="button"
>
  Abandon draft receipt
</button>
```

- [ ] **Step 2: Confirm `purchaseOrderExpansionConfig`'s `useMemo` deps include the closure-referenced values**

The existing memo deps `[isRunning, runCommand, canWrite]` already cover these two callbacks. No change required.

- [ ] **Step 3: Run targeted typecheck**

Run: `pnpm typecheck`
Expected: PASS. `runCommand('saveDraftPurchaseOrderReceipt', ...)` must type-check because Task 9 added both names to `commandNames`.

- [ ] **Step 4: Run audit parity**

Run: `pnpm audit:parity`
Expected: PASS for the two new commands now that the frontend calls them.

- [ ] **Step 5: Commit**

```bash
git add src/client/views/OperationsViews.tsx
git commit -m "feat(receipts): expose Save/Abandon PO receipt draft from PO row actions (#113)"
```

---

### Task 17: `PurchaseOrdersView` — Preview receipt entry point

**Files:**
- Modify: `src/client/views/OperationsViews.tsx`

- [ ] **Step 1: Add local state + handler**

Inside `PurchaseOrdersView` (near the existing `useState` calls):

```tsx
const [receiptPreviewSubjectId, setReceiptPreviewSubjectId] = useState<string | null>(null);
```

- [ ] **Step 2: Add the Preview button as a viewer-visible READ action (OUTSIDE `canWrite`)**

Preview receipt is a read action and MUST render for viewers when a finalized snapshot exists. It must therefore be placed OUTSIDE any `{canWrite ? ... : null}` wrapper. Save draft / Abandon draft remain INSIDE the `canWrite` wrapper because they mutate.

In `PurchaseOrdersView`, locate the existing `actions` block on the top `OperatorGrid`. Today the block is structured roughly like:

```tsx
actions={(
  <>
    {/* viewer-visible read actions */}
    {/* (new Preview receipt button goes here) */}
    {canWrite ? (
      <>
        {/* existing write actions: Finalize, Approve, Record Prepayment, ... */}
      </>
    ) : null}
  </>
)}
```

Add the Preview receipt button in the viewer-visible block, NOT inside the `canWrite` branch:

```tsx
actions={(
  <>
    {/* READ ACTIONS — visible to viewers when a finalized snapshot exists. */}
    <button
      className="secondary-button compact-action"
      type="button"
      disabled={!selectedPo?.id}
      onClick={() => selectedPo?.id && setReceiptPreviewSubjectId(String(selectedPo.id))}
      title="Preview the active vendor receipt for this PO"
    >
      Preview receipt
    </button>

    {/* WRITE ACTIONS — operator+ only. */}
    {canWrite ? (
      <>
        {/* existing Save draft / Abandon draft / Finalize / Approve / Record Prepayment / ... */}
      </>
    ) : null}
  </>
)}
```

If the existing layout does not yet have an explicit "read actions" sub-fragment separate from the `canWrite` branch, introduce one in the same edit. The end result is that a viewer-role user sees ONLY the Preview receipt button on the actions bar and no write controls.

Also expose the same Preview button on the selected-PO header strip (around the existing `runPurchaseOrderPrimary` button). Same rule applies: place it OUTSIDE `canWrite`:

```tsx
{/* READ ACTION — outside canWrite. */}
<button
  className="secondary-button compact-action"
  type="button"
  disabled={!selectedPo?.id}
  onClick={() => selectedPo?.id && setReceiptPreviewSubjectId(String(selectedPo.id))}
>
  Preview receipt
</button>

{canWrite ? (
  /* existing Finalize PO / Unfinalize / Approve / Record Prepayment write controls */
) : null}
```

The per-row expansion `Save draft receipt` / `Abandon draft receipt` buttons from Task 16 remain INSIDE the `canWrite` branch (they mutate). Do not move those.

- [ ] **Step 3: Mount `ReceiptPreview` when `receiptPreviewSubjectId` is set**

Add an import at the top:

```ts
import { ReceiptPreview } from '../components/ReceiptPreview';
```

And at the end of the JSX (after the line lines OperatorGrid but inside the outer `<div className="view-stack">`):

```tsx
{receiptPreviewSubjectId ? (
  <ReceiptPreview
    documentType="purchase_order"
    subjectId={receiptPreviewSubjectId}
    onClose={() => setReceiptPreviewSubjectId(null)}
  />
) : null}
```

- [ ] **Step 4: Verify table state preservation**

The receipt preview is mounted as a sibling inside the same `view-stack`; it overlays via CSS (`position: fixed`). The grid is NOT unmounted, so AG Grid keeps its selection model, sort, and viewport. The `useUiStore.selectedRows.purchaseOrders` is untouched by the preview (no calls to `setSelectedRows`).

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/client/views/OperationsViews.tsx
git commit -m "feat(receipts): preview-receipt entry point in PurchaseOrdersView (#113)"
```

---

### Task 18: Manual browser smoke — end-to-end PO finalization receipt round trip

This is operator-eyes verification before the automated Playwright spec is written. Do not commit; capture findings.

- [ ] **Step 1: Run dev server**

Run: `pnpm dev`
Wait for both server and Vite to come up at `http://127.0.0.1:5173`.

- [ ] **Step 2: Sign in and exercise the operator flow as `owner@terpagro.local` / `terp-demo`**

> The operator-console e2e suite uses `owner@terpagro.local` (with role `owner`, which is operator+ for snapshot read/write purposes). The legacy `operator@terpagro.local` user is not provisioned in the seeded fixtures; using owner here keeps the manual smoke consistent with the Playwright spec in Task 23.

1. Create a new PO with a vendor and one line (qty=1, unitCost=100). Save without approving (status remains `draft`).
2. From the PO row's expansion actions, click **Save draft receipt**. Toast should read "PO-… draft receipt saved." A subsequent click should toast "draft receipt updated."
3. Open **Preview receipt** while the PO is still draft — because the operator role sets `includeDrafts=true` on the request, the active draft snapshot must preview here (operator-only path). Confirm the external preview renders. Toggle to **Internal** and confirm the `INTERNAL — DO NOT SEND` banner appears and the body includes `Internal notes`/`Resale/markup` strings.
4. Click **Copy** in external mode — confirm clipboard contents do NOT contain the watermark.
5. Click **Copy** in internal mode — confirm clipboard contents START with `INTERNAL — DO NOT SEND`.
6. Click **Print** — confirm the browser print dialog opens; the page preview should show only the receipt body and (in internal mode) the watermark line. Cancel.
7. Click **Close**.
8. Click **Abandon draft receipt** — toast reads "PO-… draft receipt abandoned." Preview receipt button should become disabled (no active snapshot — Task 19 gating).
9. From the grid, click **Finalize PO** (primary button). Toast reads "PO-… finalized and ready for approval. Receipt v1 saved."
10. Open **Preview receipt** again — confirm a finalized v1 receipt is shown.
11. Click **Unfinalize** from the row actions. Toast reads "PO-… returned to draft." The Preview button becomes disabled (no active snapshot).
12. Click **Finalize PO** again. Toast reads "Receipt v2 saved." Preview receipt now shows v2 content. From the row's Recent commands history (existing drawer), confirm the v1 row's status is now `void` and v2 is `finalized`.

- [ ] **Step 3: Confirm grid table state preservation**

Before clicking Preview receipt, sort the grid by Total descending and apply a quick filter like `status:draft`. After closing the preview, the sort order and filter persist; the previously selected PO is still selected; the scroll position is unchanged. Because the preview is rendered into a portal at `document.body`, the grid behind it is never unmounted.

- [ ] **Step 4: Sign in as `viewer@terpagro.local` and verify viewers cannot see drafts**

1. Open the Purchase Orders view. Save / Abandon buttons must be hidden because `canWrite === false`. Preview receipt is a read action and is visible to viewers, but is **disabled** for any PO that does not have an active **finalized** snapshot (the gating in Task 19 uses `getExternalBySubjectId` presence, which is finalized-only).
2. Select a PO whose only active snapshot is a draft. Preview receipt must be disabled. Use devtools to call `trpc.documentSnapshots.getReceiptText.query({ documentType: 'purchase_order', subjectId: '<draftPoId>', mode: 'external' })` directly — expect `NOT_FOUND`.
3. With the same draft PO selected, attempt to call `trpc.documentSnapshots.getReceiptText.query({ documentType: 'purchase_order', subjectId: '<draftPoId>', mode: 'external', includeDrafts: true })` — expect `FORBIDDEN` (viewer cannot pass the operator-only flag).
4. Select a PO with a finalized snapshot. Preview receipt must enable. Open it; confirm the Internal toggle is disabled and the rendered body contains `Vendor unit price` but no `INTERNAL` / `unitPrice` / `internalNotes` text.
5. Attempt to call `documentSnapshots.getInternalBySubjectId` directly via devtools — expect `FORBIDDEN`.

- [ ] **Step 5: Document any defects as new GitHub issues with the `Known issue` template**

Use `gh issue create --template known_issue.yml`. Do not silently fix during this task; if defects are minor and in-scope, add a quick fix task between here and Task 23.

- [ ] **Step 6: No commit**

This is verification-only.

---

### Task 19: Disable Preview/Abandon buttons when no active snapshot exists

Polish task discovered in Task 18 manual smoke.

**Files:**
- Modify: `src/client/views/OperationsViews.tsx`

- [ ] **Step 1: Add presence queries**

The external endpoint is finalized-only and returns only `{ version, projectionVersion, externalPayload }` (no `status`). Use `getExternalBySubjectId` to detect finalized presence (for the viewer Preview path) and `getInternalBySubjectId` (operator+ only) to detect an active snapshot — draft or finalized — for operators (so the operator-only draft preview path is reachable). Viewers never see Abandon draft because it lives inside `canWrite`.

Near `lines`:

```ts
const subjectIdForQuery = String(selectedPo?.id ?? '00000000-0000-0000-0000-000000000000');

// Finalized presence — gates the Preview receipt button for viewers.
const finalizedSnapshot = trpc.documentSnapshots.getExternalBySubjectId.useQuery(
  { documentType: 'purchase_order', subjectId: subjectIdForQuery },
  { enabled: Boolean(selectedPo?.id), retry: false }
);
const hasFinalizedSnapshot = Boolean(finalizedSnapshot.data);

// Active (draft or finalized) presence — gates the Preview receipt button for
// operators (so the operator-only draft preview path is exposed) AND gates
// Abandon draft. Operator-only; viewers never reach this query because
// `enabled` is gated by `canWrite`.
const activeInternal = trpc.documentSnapshots.getInternalBySubjectId.useQuery(
  { documentType: 'purchase_order', subjectId: subjectIdForQuery },
  { enabled: Boolean(selectedPo?.id) && canWrite, retry: false }
);
const hasActiveDraft = activeInternal.data?.status === 'draft';
const hasAnyActiveSnapshot = canWrite ? Boolean(activeInternal.data) : hasFinalizedSnapshot;
```

- [ ] **Step 2: Gate the buttons**

- "Preview receipt" (READ action, outside `canWrite`): `disabled={!selectedPo?.id || !hasAnyActiveSnapshot}`. Operators see the button enabled whenever an active draft OR finalized snapshot exists (the operator-only draft preview path); viewers see it enabled only when a finalized snapshot exists.
- "Abandon draft receipt" (per-row, inside `canWrite`): `disabled={isRunning || !canWrite || !row.id || !hasActiveDraft}`. If the per-row callback cannot reach the top-level `hasActiveDraft` (the row is rendered in `actionsRenderer` without the selected-row context), accept the looser `disabled={isRunning || !canWrite || !row.id}` gating and rely on the server-side `abandonDraftPurchaseOrderReceipt` no-op toast to clarify when there is no draft.

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 4: No unit test for this view**

There is currently no `OperationsViews.test.tsx`. Rely on Playwright proof in Task 23.

- [ ] **Step 5: Commit**

```bash
git add src/client/views/OperationsViews.tsx
git commit -m "feat(receipts): gate Preview/Abandon buttons by active snapshot presence (#113)"
```

---

### Task 20: Re-run audit:parity and confirm zero deferred-frontend findings

**Files:**
- None (verification).

- [ ] **Step 1: Run audit**

Run: `pnpm audit:parity`
Expected: PASS. If a residual finding mentions `saveDraftPurchaseOrderReceipt` or `abandonDraftPurchaseOrderReceipt`, re-check Task 16 wiring.

- [ ] **Step 2: Run typecheck + full unit suite**

Run: `pnpm typecheck && pnpm test -- run`
Expected: PASS. (Use `pnpm test -- run` to run vitest in single-pass mode.)

If a non-receipt test regresses, stop and triage. The most likely failure mode is a test that asserted exact `affectedIds.length` from `finalizePurchaseOrder` / `unfinalizePurchaseOrder`; those changed to include the snapshot id when applicable. Fix the test to assert presence rather than exact length and commit the fix in this task.

- [ ] **Step 3: Commit (if any fixes were needed in Step 2)**

```bash
git add -p
git commit -m "test: update PO command tests for snapshot-aware affectedIds (#113)"
```

---

### Task 21: Database invariant test — partial unique index actually blocks double active

**Files:**
- Create: `src/server/services/documentSnapshots/snapshotService.invariant.test.ts`

This is an integration test that requires the real DB (gated like `migrate.test.ts`). It guards the schema-level promise that there can only ever be ONE active row per subject.

- [ ] **Step 1: Write the test**

Create the file. Skip when no `DATABASE_URL` is set, mirroring the gating used in `migrate.test.ts`.

```ts
import { describe, it, expect } from 'vitest';
import { randomUUID } from 'crypto';
import { db } from '../../db';
import { documentSnapshots } from '../../schema';

const dbUrl = process.env.DATABASE_URL ?? '';
const suite = dbUrl ? describe : describe.skip;

suite('document_snapshots active-row partial unique index', () => {
  it('blocks a second active (draft or finalized) row for the same subject', async () => {
    const subjectId = randomUUID();
    await db.insert(documentSnapshots).values({
      documentType: 'purchase_order', subjectId, version: 1, status: 'finalized',
      internalPayload: {}, externalPayload: {}, projectionVersion: 1
    });
    await expect(db.insert(documentSnapshots).values({
      documentType: 'purchase_order', subjectId, version: 2, status: 'draft',
      internalPayload: {}, externalPayload: {}, projectionVersion: 1
    })).rejects.toMatchObject({ message: expect.stringMatching(/unique|duplicate/i) });
  });
});
```

- [ ] **Step 2: Run with a live database**

Run: `DATABASE_URL=$DATABASE_URL pnpm test -- src/server/services/documentSnapshots/snapshotService.invariant.test.ts`
Expected: PASS. When no DATABASE_URL is set, the suite is skipped cleanly.

- [ ] **Step 3: Commit**

```bash
git add src/server/services/documentSnapshots/snapshotService.invariant.test.ts
git commit -m "test(receipts): integration test for active-snapshot unique index (#113)"
```

---

### Task 22: Touch existing PO operator-console Playwright assertions so they still pass

**Files:**
- Modify (only if needed): `tests/e2e/operator-console.spec.ts`

The existing PO smoke test at line 184 asserts the "Approve PO" button is visible on the PO grid actions. After Task 17, the actions row includes a new "Preview receipt" button. The existing assertion is `getByRole('button', { name: 'Approve PO' })` which still matches an unrelated button. Verify no regression.

- [ ] **Step 1: Re-run the existing operator-console PO smoke**

Run: `PLAYWRIGHT_SKIP_WEB_SERVER=1 pnpm exec playwright test tests/e2e/operator-console.spec.ts --project=chromium --workers=1 --grep "backend-wired operator abilities"`
Expected: PASS unchanged.

- [ ] **Step 2: If a regression is detected, scope the fix to that one test**

Adjust the assertion to be more specific (e.g., `getByRole('button', { name: /^Preview receipt$/ })` if a name conflict appears). Do NOT broaden the spec scope.

- [ ] **Step 3: Commit only if a fix was needed**

```bash
git add tests/e2e/operator-console.spec.ts
git commit -m "test(receipts): keep operator-console PO smoke passing after preview button (#113)"
```

---

### Task 23: New Playwright spec — PO finalize → receipt preview → copy/print + table state preservation

**Files:**
- Create: `tests/e2e/po-finalization-receipt.spec.ts`

This is the Deep QA browser-proof gate.

- [ ] **Step 1: Write the spec**

Create `tests/e2e/po-finalization-receipt.spec.ts`. Patterns used:

- Sign-in via `auth.login` tRPC POST + `page.goto('/')`, mirroring `tests/e2e/tags-matchmaking.spec.ts`.
- Seed via `commands.run` tRPC POST batched payloads (`createPurchaseOrder`, `addPurchaseOrderLine`), mirroring `tests/e2e/tags-matchmaking.spec.ts:31-44`. Returns the new PO's id. **This is the exact existing e2e command pattern.** No stubbed fixture, no `__terp_seed` hook, no test-only seeding endpoint is introduced.
- Row expansion uses the existing `.expansion-chevron-cell` selector / `aria-label="Expand row details"`, as used in `tests/e2e/phase2-inline-expansion-qa.spec.ts:48-55`. There is no global `Slash` quick-filter binding in the operator console; do not press Slash. There is no "More" button menu on the operator console row actions; do not use a `getByRole('button', { name: 'More' })` selector — interact with the explicit row action buttons (Save draft receipt, Abandon draft receipt, Preview receipt) by their visible names instead.
- Print proof is captured by stubbing `window.print` before clicking Print, then asserting the spy was called and the body has (or had transiently) the `print-receipt-only` class.

The primary test uses `owner@terpagro.local` for maximal access (the operator-console e2e suite does not currently provision a generic `operator@…` user). The viewer test uses `viewer@terpagro.local` (already established in `tests/e2e/operator-console.spec.ts`).

The seeding helper below is named `seedDraftPurchaseOrder` (not `seedDraftPO`) to avoid the prior naming that suggested a deterministic fixture. The helper drives the real tRPC command bus end-to-end via `commands.run`; if the PO does not appear in the grid after seeding (e.g., the reference data has zero vendors in this DB), the test fails fast with a clear message rather than silently skipping.

```ts
import { test, expect, type Page, type APIRequestContext } from '@playwright/test';
import type { CommandName } from '../../src/shared/commandCatalog';

const OWNER_EMAIL = 'owner@terpagro.local';
const VIEWER_EMAIL = 'viewer@terpagro.local';
const PASSWORD = 'terp-demo';

async function signIn(page: Page, email: string) {
  await expect.poll(async () => (await page.request.get('/api/health')).ok(), { timeout: 45_000 }).toBe(true);
  const response = await page.request.post('/trpc/auth.login?batch=1', {
    data: { 0: { json: { email, password: PASSWORD } } }
  });
  expect(response.ok()).toBe(true);
  await page.goto('/');
}

async function trpcQuery(page: Page, path: string, inputValue: unknown = null) {
  return page.evaluate(async ({ queryPath, queryInput }) => {
    const input = encodeURIComponent(JSON.stringify({ 0: { json: queryInput } }));
    return (await fetch(`/trpc/${queryPath}?batch=1&input=${input}`, { credentials: 'include' })).json();
  }, { queryPath: path, queryInput: inputValue });
}

async function runCommand(page: Page, name: CommandName, payload: Record<string, unknown>, reason = 'po-receipts e2e') {
  return page.evaluate(
    async ({ commandName, commandPayload, commandReason }) => {
      const response = await fetch('/trpc/commands.run?batch=1', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          0: {
            json: {
              name: commandName, payload: commandPayload, reason: commandReason,
              idempotencyKey: `${commandName}-${crypto.randomUUID()}`
            }
          }
        })
      });
      return { status: response.status, json: await response.json() };
    },
    { commandName: name, commandPayload: payload, commandReason: reason }
  );
}

function commandData(response: Awaited<ReturnType<typeof runCommand>>) {
  return response.json[0]?.result?.data?.json as { ok: boolean; commandId: string; affectedIds: string[]; toast?: string };
}

// Seed a draft PO with one line via the real command bus. Returns
// { purchaseOrderId, poNo }. This is not a stubbed fixture — it drives the
// actual tRPC commands end-to-end, mirroring tests/e2e/tags-matchmaking.spec.ts.
async function seedDraftPurchaseOrder(page: Page): Promise<{ purchaseOrderId: string; poNo: string }> {
  const reference = await trpcQuery(page, 'queries.reference');
  const vendor = reference[0].result.data.json.vendors[0];
  expect(vendor?.id, 'reference data must include at least one vendor; seed the DB before running').toBeTruthy();
  const po = commandData(await runCommand(page, 'createPurchaseOrder', { vendorId: vendor.id }, 'receipts e2e seed'));
  expect(po.ok, `createPurchaseOrder failed: ${JSON.stringify(po)}`).toBe(true);
  const purchaseOrderId = po.affectedIds[0];
  const lineResult = commandData(await runCommand(page, 'addPurchaseOrderLine', {
    purchaseOrderId,
    productName: 'Receipts QA Flower',
    category: 'Flower',
    qty: 1,
    unitCost: 1200,
    unitPrice: 1800
  }, 'receipts e2e line seed'));
  expect(lineResult.ok, `addPurchaseOrderLine failed: ${JSON.stringify(lineResult)}`).toBe(true);
  const grid = await trpcQuery(page, 'queries.grid', { view: 'purchaseOrders' });
  const row = grid[0].result.data.json.find((r: { id?: string; poNo?: string }) => r.id === purchaseOrderId);
  expect(row?.poNo, 'seeded PO must be reachable via queries.grid').toBeTruthy();
  return { purchaseOrderId, poNo: row.poNo as string };
}

async function expandPurchaseOrderRow(page: Page, poNo: string) {
  // Find the row by poNo, then click its expansion chevron — same pattern as
  // tests/e2e/phase2-inline-expansion-qa.spec.ts.
  const row = page.locator(`.ag-center-cols-container .ag-row:has-text("${poNo}")`).first();
  await expect(row).toBeVisible();
  await row.click(); // select first
  const chevron = row.locator('.expansion-chevron-cell').first();
  await expect(chevron).toHaveAttribute('aria-label', 'Expand row details');
  await chevron.click();
  return row;
}

test.describe('PO finalization receipts', () => {
  test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

  test('finalize → preview → copy → print → table state preserved', async ({ page }) => {
    test.setTimeout(120_000);
    await signIn(page, OWNER_EMAIL);
    await page.getByRole('navigation').getByRole('button', { name: /Purchase Orders/ }).click();

    const { purchaseOrderId, poNo } = await seedDraftPurchaseOrder(page);

    const row = await expandPurchaseOrderRow(page, poNo);

    // Capture sort + selection state before actions for preservation assertion.
    const sortBefore = await page.locator('.ag-header-cell-sorted-asc, .ag-header-cell-sorted-desc').count();
    const selectedBefore = await row.evaluate((el) => el.classList.contains('ag-row-selected'));

    // Save draft receipt — operator+ button inside the row expansion actions.
    await page.getByRole('button', { name: 'Save draft receipt' }).click();
    await expect(page.getByText(/draft receipt (saved|updated)/i)).toBeVisible();

    // Operator-only draft preview path — owner can preview the active draft via
    // the operator-gated includeDrafts=true path. Verify the dialog renders and
    // contains the seeded poNo.
    await page.getByRole('button', { name: 'Preview receipt' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Receipt preview' });
    await expect(dialog).toBeVisible();
    // Assert overlay is a direct child of document.body (portal contract).
    const overlayIsBodyChild = await dialog.evaluate((el) => el.parentElement === document.body);
    expect(overlayIsBodyChild).toBe(true);
    await expect(dialog.getByTestId('receipt-preview-body')).toContainText(poNo);
    await expect(dialog.getByTestId('internal-watermark')).toHaveCount(0);

    // Toggle to internal mode (owner role → allowed).
    await dialog.getByRole('button', { name: 'Internal' }).click();
    await expect(dialog.getByTestId('internal-watermark')).toBeVisible();

    // Copy in internal mode — clipboard must start with the watermark.
    await dialog.getByRole('button', { name: 'Copy' }).click();
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    expect(clip.startsWith('INTERNAL — DO NOT SEND')).toBe(true);

    // Print proof — stub window.print, click Print, assert it was called and
    // the body had the print-only class set at the moment print fired.
    await page.evaluate(() => {
      const w = window as unknown as { __printCallCount?: number; __printHadPrintClass?: boolean };
      w.__printCallCount = 0;
      w.__printHadPrintClass = false;
      window.print = () => {
        w.__printCallCount = (w.__printCallCount ?? 0) + 1;
        w.__printHadPrintClass = document.body.classList.contains('print-receipt-only');
      };
    });
    await dialog.getByRole('button', { name: 'Print' }).click();
    const printState = await page.evaluate(() => {
      const w = window as unknown as { __printCallCount?: number; __printHadPrintClass?: boolean };
      return { count: w.__printCallCount ?? 0, hadClass: w.__printHadPrintClass ?? false };
    });
    expect(printState.count).toBeGreaterThanOrEqual(1);
    expect(printState.hadClass).toBe(true);
    // Watermark still in the DOM right after print so a printed internal copy
    // would include it. The print stylesheet (Task 13) does not hide the
    // watermark because the overlay is a direct body child (portal contract).
    await expect(dialog.getByTestId('internal-watermark')).toBeVisible();

    // Close.
    await dialog.getByRole('button', { name: 'Close' }).click();
    await expect(dialog).toBeHidden();

    // Finalize the PO via the existing primary action.
    await page.getByRole('button', { name: /Finalize PO/ }).click();
    await expect(page.getByText(/Receipt v1 saved/)).toBeVisible();

    // Sort + selection preserved after the finalize round-trip.
    const selectedAfter = await row.evaluate((el) => el.classList.contains('ag-row-selected'));
    expect(selectedAfter).toBe(selectedBefore);
    const sortAfter = await page.locator('.ag-header-cell-sorted-asc, .ag-header-cell-sorted-desc').count();
    expect(sortAfter).toBe(sortBefore);

    // Re-open preview — finalized v1 should be visible and external-only by default.
    await row.click();
    await page.getByRole('button', { name: 'Preview receipt' }).first().click();
    await expect(dialog.getByTestId('receipt-preview-body')).toContainText(poNo);
    const body = await dialog.getByTestId('receipt-preview-body').innerText();
    expect(body).not.toMatch(/INTERNAL/);
    expect(body).not.toMatch(/unitPrice/);
    expect(body).toMatch(/Vendor unit price/);

    // Refinalize round-trip: unfinalize + finalize creates v2 with v1 void.
    await dialog.getByRole('button', { name: 'Close' }).click();
    const unfinalize = commandData(await runCommand(page, 'unfinalizePurchaseOrder', { purchaseOrderId }, 'receipts e2e unfinalize'));
    expect(unfinalize.ok).toBe(true);
    const refinalize = commandData(await runCommand(page, 'finalizePurchaseOrder', { purchaseOrderId }, 'receipts e2e refinalize'));
    expect(refinalize.ok).toBe(true);
    expect(refinalize.toast).toMatch(/Receipt v2 saved/);
  });

  test('viewer cannot see drafts; can preview only finalized; cannot switch into internal mode', async ({ page }) => {
    // Step 1: owner seeds a draft PO + saves a draft receipt (no finalize yet).
    await signIn(page, OWNER_EMAIL);
    await page.getByRole('navigation').getByRole('button', { name: /Purchase Orders/ }).click();
    const draftOnly = await seedDraftPurchaseOrder(page);
    expect(commandData(await runCommand(page, 'saveDraftPurchaseOrderReceipt', { purchaseOrderId: draftOnly.purchaseOrderId }, 'viewer e2e draft seed')).ok).toBe(true);

    // Step 2: owner seeds a second PO and finalizes it so a finalized snapshot exists.
    const finalized = await seedDraftPurchaseOrder(page);
    expect(commandData(await runCommand(page, 'finalizePurchaseOrder', { purchaseOrderId: finalized.purchaseOrderId }, 'viewer e2e finalize seed')).ok).toBe(true);

    // Step 3: log out + sign in as viewer.
    await page.context().clearCookies();
    await signIn(page, VIEWER_EMAIL);
    await page.getByRole('navigation').getByRole('button', { name: /Purchase Orders/ }).click();

    // Viewer + draft-only PO: Preview receipt is disabled. Direct tRPC call without
    // includeDrafts returns NOT_FOUND.
    const draftRow = page.locator(`.ag-center-cols-container .ag-row:has-text("${draftOnly.poNo}")`).first();
    await expect(draftRow).toBeVisible();
    await draftRow.click();
    const previewBtnDraft = page.getByRole('button', { name: 'Preview receipt' }).first();
    await expect(previewBtnDraft).toBeDisabled();
    const draftQueryAsViewer = await trpcQuery(page, 'documentSnapshots.getReceiptText', { documentType: 'purchase_order', subjectId: draftOnly.purchaseOrderId, mode: 'external' });
    expect(draftQueryAsViewer[0]?.error?.json?.data?.code).toBe('NOT_FOUND');
    // Viewer with includeDrafts=true must be FORBIDDEN.
    const draftQueryWithFlag = await trpcQuery(page, 'documentSnapshots.getReceiptText', { documentType: 'purchase_order', subjectId: draftOnly.purchaseOrderId, mode: 'external', includeDrafts: true });
    expect(draftQueryWithFlag[0]?.error?.json?.data?.code).toBe('FORBIDDEN');

    // Viewer + finalized PO: Preview enables; Internal toggle disabled; body is external-only.
    const finalizedRow = page.locator(`.ag-center-cols-container .ag-row:has-text("${finalized.poNo}")`).first();
    await expect(finalizedRow).toBeVisible();
    await finalizedRow.click();
    const previewBtn = page.getByRole('button', { name: 'Preview receipt' }).first();
    await expect(previewBtn).toBeEnabled();
    await previewBtn.click();
    const dialog = page.getByRole('dialog', { name: 'Receipt preview' });
    await expect(dialog).toBeVisible();
    const internalBtn = dialog.getByRole('button', { name: 'Internal' });
    await expect(internalBtn).toBeDisabled();
    const body = await dialog.getByTestId('receipt-preview-body').innerText();
    expect(body).not.toMatch(/INTERNAL/);
    expect(body).not.toMatch(/unitPrice/);
    expect(body).toMatch(/Vendor unit price/);
  });
});
```

- [ ] **Step 2: Run the spec**

Run: `PLAYWRIGHT_SKIP_WEB_SERVER=1 pnpm exec playwright test tests/e2e/po-finalization-receipt.spec.ts --project=chromium --workers=1`
Expected: PASS.

Run the existing operator-console spec to confirm no regression:

Run: `PLAYWRIGHT_SKIP_WEB_SERVER=1 pnpm exec playwright test tests/e2e/operator-console.spec.ts --project=chromium --workers=1`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/po-finalization-receipt.spec.ts
git commit -m "test(receipts): Playwright proof for PO finalize→preview→copy/print (#113)"
```

---

### Task 24: Append decisions-log entry + regenerate components inventory

**Files:**
- Modify: `docs/design-system/decisions-log.md`
- Modify: `docs/design-system/components/_inventory.json` (auto-generated)

- [ ] **Step 1: Append a Tranche 1 implementation entry**

At the top of `docs/design-system/decisions-log.md` (after the format block), add:

```markdown
## 2026-05-20: Tranche 1 (PO vertical) of finalization receipts shipped
**Decision:** The PO vertical of finalization receipts is wired through a shared `document_snapshots` table, a per-type pure projection module (`poProjection.ts`), and a `documentSnapshots` tRPC router with role-gated internal/external endpoints. `PurchaseOrdersView` exposes Save draft / Abandon draft / Preview receipt as additive controls; existing PO commands (`finalizePurchaseOrder`, `unfinalizePurchaseOrder`) gain snapshot side effects but their existing behavior is unchanged.
**Rationale:** The shared foundation is now load-bearing for future verticals (Sales, payments, vendor payouts). Server-side allowlist projection prevents `unitPrice`, `internalNotes`, `buyerNotes`, and referee/credit fields from reaching vendor-facing payloads. The client never branches on role to hide fields inside an external payload.
**Example:** `src/server/services/documentSnapshots/poProjection.ts`, `src/server/routers/documentSnapshots.ts`, `src/client/components/ReceiptPreview.tsx`, `tests/e2e/po-finalization-receipt.spec.ts`.
**Author:** OpenCode planning + execution via Evan
**Related:** GitHub #113, `docs/roadmap/2026-finalization-receipts-roadmap.md`, plan `docs/superpowers/plans/2026-05-20-finalization-receipts-tranche-1.md`.
```

- [ ] **Step 2: Regenerate components inventory**

Run: `pnpm docs:inventory`
Expected: `docs/design-system/components/_inventory.json` regenerates and includes `ReceiptPreview`.

- [ ] **Step 3: Commit**

```bash
git add docs/design-system/decisions-log.md docs/design-system/components/_inventory.json
git commit -m "docs(receipts): decisions-log + components inventory entry for Tranche 1 (#113)"
```

---

### Task 25: Full local audit + Deep QA / Critical closeout gate

This is the proof-of-done checkpoint. It is required for `Deep QA` (overall) and `Critical` (leak-control slice) per the roadmap §8.

**Files:**
- None (verification only).

- [ ] **Step 1: Full audit**

Run: `pnpm audit:self`
Expected: PASS. This is `typecheck + audit:parity + audit:product-roadmap + build`.

- [ ] **Step 2: Run vitest suite end-to-end**

Run: `pnpm test -- run`
Expected: PASS. Capture the run summary as evidence.

- [ ] **Step 3: Run the new Playwright spec + the existing operator-console smoke**

Run: `PLAYWRIGHT_SKIP_WEB_SERVER=1 pnpm exec playwright test tests/e2e/po-finalization-receipt.spec.ts tests/e2e/operator-console.spec.ts --project=chromium --workers=1`
Expected: PASS.

- [ ] **Step 4: Spec-coverage review (Deep QA)**

Walk through `docs/roadmap/2026-finalization-receipts-roadmap.md` §7 Acceptance Criteria and confirm each Tranche 1 item is satisfied by a task above. Record any gap as a follow-up issue using the `Known issue` template, separating `product gap`, `coverage gap`, `runtime bug` per `AGENTS.md`.

| AC | Implemented by |
|---|---|
| 7.2 — Finalizing a PO creates a `document_snapshots` row | Task 10 + Task 8 |
| 7.2 — Operator can open a receipt preview from a finalized PO; vendor-safe fields only | Task 11 + Task 12 + Task 17 |
| 7.2 — Operator-only draft preview path (operator can preview active draft; viewer cannot) | Task 11 (`includeDrafts` flag) + Task 12 (ReceiptPreview operator path) + Task 18 + Task 23 viewer assertions |
| 7.2 — Operator can copy/print the receipt; internal copy includes watermark | Task 12 + Task 13 |
| 7.2 — Operator can save / abandon a draft snapshot | Task 8 + Task 9 + Task 10 + Task 16 |
| 7.2 — Unfinalizing voids the active snapshot | Task 10 |
| 7.2 — Refinalizing after unfinalize creates new version; prior finalized row remains `void` (NOT `superseded`); no Tranche 1 path writes `superseded` | Task 8 + Task 10 |
| 7.2 — Table state preserved across finalize/save-draft/abandon | Task 17 + Task 23 |
| 7.2 — Plain text output is human-readable | Task 6 + Task 11 |
| 7.2 — Preview receipt visible to viewers only when finalized snapshot exists | Task 19 (gating) + Task 23 viewer test |
| 7.3 — PO external returns `unitCost` / `costRangeLow` / `costRangeHigh`, never `unitPrice` / internal notes / buyer notes | Task 6 + Task 11 + Task 23 |
| 7.3 — Sales external never returns cost/margin fields | N/A for Tranche 1 (Phase 2). Spec adherence is confirmed by the absence of a sales projection in the registry; `getProjectionFor('sales_order')` throws. |
| 7.3 — `external_payload` contains only allowlisted keys | Task 6 (projection assertion + tests) |
| 7.3 — Any `EXTERNAL_FIELDS` change bumps `PROJECTION_VERSION` | Convention enforced by reviewer checklist (called out in this task §6 below) |
| 7.3 — No client-side role-branching on external payload fields | Task 12 (ReceiptPreview never inspects role inside the displayed text) |
| 7.3 — Command history leak: receipt commands' `affectedIds` is PO-id-only; viewer command history never exposes `internalPayload`/`externalPayload`/snapshot UUIDs | Task 10 Step 4 (`affectedIds` invariant + tablePairs exclusion + leak-guard tests) |
| 7.3 — `getById` is bound to `documentType='purchase_order'` and refuses cross-type rows (NOT_FOUND) | Task 11 (`getById` schema literal + row-type check) |
| 7.4 — Existing PO columns unchanged | Schema review: no `ALTER TABLE purchase_orders` in migration 0047 |
| 7.4 — Existing commands continue to work, gain snapshot side effects | Task 10 + Task 20 |
| 7.4 — Existing PO grid and finalization UI continue to function | Task 22 |
| Print stylesheet — overlay is a direct body child via React portal so the receipt body and internal watermark render during print | Task 12 (`createPortal(..., document.body)`) + Task 12 portal test + Task 13 CSS + Task 23 print proof |

- [ ] **Step 5: Adversarial QA (AQA) — meaningful done claim**

Run the `aqa` skill against the Tranche 1 deliverable. Capture the report path (e.g., `~/.cache/aqa/reports/<timestamp>.md`) and the adversarial score. Target: ≥ 95/100. If below, repair-loop on the highest-impact findings and re-run.

Required AQA focus areas:

1. **Leak-control:** try to construct a request that gets `unitPrice`, `internalNotes`, `buyerNotes`, `refereeCreditAmount`, or any internal-only field into an external payload by calling `documentSnapshots.getExternalBySubjectId` and inspecting the JSON.
2. **Role gating:** confirm `viewer` cannot reach `getInternalBySubjectId`, `listVersions`, `getById`, or `getReceiptText` mode=`internal`. Verify both UI gating and FORBIDDEN from the server.
3. **Viewer draft exposure:** confirm a viewer calling `getExternalBySubjectId` for a subject that has only a draft snapshot receives `NOT_FOUND` (not the draft). Confirm a viewer calling `getReceiptText` with `includeDrafts: true` receives `FORBIDDEN`.
4. **Operator-only draft preview path works:** confirm an operator calling `getReceiptText({ mode: 'external', includeDrafts: true })` for a draft-only subject renders the draft's external payload AND does not include `INTERNAL`/`unitPrice`/internal-notes text.
5. **Router rejection:** confirm `document_type = 'sales_order'`, `'customer_payment'`, and `'vendor_payout'` are rejected at the router boundary with `NOT_IMPLEMENTED` (or equivalent). Confirm `getById({ id, documentType: 'purchase_order' })` returns `NOT_FOUND` when the seeded row id belongs to a non-PO type (defence-in-depth row check).
6. **Command-history leak path:** confirm receipt-related commands' `affectedIds` contains only the PO id (no snapshot UUID). Confirm `queries.relatedCommands({ entityId: PO_ID })` and `queries.reversalPreview({ commandId })` responses (called as viewer) do not contain `internalPayload`, `externalPayload`, `documentSnapshots`, snapshot UUIDs, or the `INTERNAL — DO NOT SEND` watermark.
7. **Frontend UX:** tab order through the preview modal, ESC closes, focus trap (the existing focus-trap pattern in `CommandPalette.tsx` is not required for read-only preview but should be evaluated for parity). Confirm the overlay is a direct child of `document.body` (portal contract) by inspecting the DOM in devtools.
8. **Print fidelity:** trigger a print preview while the receipt is open in internal mode; confirm the watermark line and receipt body are visible in the preview and the surrounding app chrome is hidden.
9. **Concurrency:** two operators clicking Save draft for the same PO simultaneously — confirm the partial unique index produces a clear error (or the second call updates the existing draft idempotently, per Task 8 semantics).
10. **Refinalize round-trip:** confirm `version` increments monotonically and `listVersions` returns the full history.

- [ ] **Step 6: Reviewer checklist for projection-version invariant**

Add a brief note in the PR body (when the PR is opened):

> Reviewer checklist:
> - [ ] `EXTERNAL_FIELDS` in any projection module changed? If yes, `PROJECTION_VERSION` was bumped in the same PR.
> - [ ] Any new `document_snapshots` write path goes through `snapshotService.ts`, not raw inserts.
> - [ ] No client code branches on `role` to hide fields inside an external payload.

- [ ] **Step 7: Closeout evidence summary**

Capture in the PR body or closing comment:

- QA tier: Deep QA (overall) + Critical (leak-control slice).
- Commands/tests/runtime checks run: `pnpm audit:self`, `pnpm test -- run`, both Playwright specs.
- AQA report path: from Step 5.
- Adversarial score: numeric, with reducers itemized if any.
- Spec coverage result: table from Step 4, with N/A justifications for Phase 2/3 items.
- Accepted findings fixed: listed by AQA report ID.
- Rejected findings with evidence: listed by AQA report ID.
- Remaining non-blockers: tracked GitHub issues (with `#NN` references) or in-PR follow-ups.

- [ ] **Step 8: No commit**

This task produces evidence only. The PR itself is the closeout artifact; do not commit summary text to the repo.

---

## Self-review checklist

Run this after writing the plan (and again before opening the PR).

**1. Spec coverage.** Walk through `docs/roadmap/2026-finalization-receipts-roadmap.md` §7 line by line:

- 7.2 PO snapshot row on finalize → Task 10
- 7.2 receipt preview with vendor-safe fields → Tasks 11, 12, 17
- 7.2 copy/print + watermark → Tasks 12, 13
- 7.2 save / abandon draft → Tasks 8, 9, 10, 16
- 7.2 unfinalize voids snapshot → Task 10
- 7.2 refinalize after unfinalize creates new version; prior row remains `void`, not `superseded` → Tasks 8, 10
- 7.2 table state preserved → Tasks 17, 23
- 7.2 plain text output → Tasks 6, 11
- 7.3 PO external allowlist (with `unitCost`/range, no `unitPrice`/internal/buyer) → Task 6, 11, 23
- 7.3 Sales external excludes cost/margin → N/A this tranche; deferred to Phase 2.
- 7.3 external_payload allowlist invariant → Task 6
- 7.3 projection-version bump on allowlist change → Task 25 reviewer checklist
- 7.3 no client role-branching on external fields → Task 12
- 7.4 existing columns unchanged → Tasks 2, 3, 25
- 7.4 existing commands gain side effects, not replacement → Task 10
- 7.4 existing PO grid/UI continue to function → Task 22

**2. Placeholder scan.** Search this plan for any of `TBD`, `TODO`, `fill in later`, `similar to Task`, `add appropriate`, `write tests for the above`. There are none above. If a revision adds any of those, replace with concrete code/commands.

**3. Type consistency.** The names used across tasks are consistent:

- Service helpers: `createFinalizedSnapshotForPurchaseOrder`, `voidActiveSnapshotForPurchaseOrder`, `saveOrUpdateDraftSnapshotForPurchaseOrder`, `abandonDraftSnapshotForPurchaseOrder` — used in Tasks 8, 10.
- Commands: `saveDraftPurchaseOrderReceipt`, `abandonDraftPurchaseOrderReceipt` — Tasks 9, 10, 16.
- Router procedures: `getById`, `getInternalBySubjectId`, `getExternalBySubjectId`, `listVersions`, `getReceiptText` — Tasks 11, 15, 23.
- Types: `DocumentType`, `DocumentStatus`, `ProjectionResult`, `DocumentSnapshotRecord` — Tasks 4, 11.
- Component: `ReceiptPreview` (only this name) — Tasks 12, 13, 17, 23.

**4. QA gate.** Deep QA components are explicitly scheduled:

- AQA: Task 25 Step 5 (before the done claim).
- Spec coverage: Task 25 Step 4 (table mapping AC → task).
- Frontend/UX priority: Task 18 manual smoke + Task 23 Playwright; viewer-mode error path covered in Task 23.
- Adversarial score: Task 25 Step 5 target ≥ 95.
- Non-blocking issue discipline: Task 18 Step 5 and Task 25 Step 7 require tracking durable issues for any unresolved finding.

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-20-finalization-receipts-tranche-1.md`. Two execution options:

1. **Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks, fast iteration. Required sub-skill: `superpowers:subagent-driven-development`.
2. **Inline Execution** — execute tasks in this session with checkpoints. Required sub-skill: `superpowers:executing-plans`.

Which approach?
