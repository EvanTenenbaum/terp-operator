> ⚠️ **ARCHITECTURE GATE:** This spec must comply with [MERCURY-ARCHITECTURE-MANIFESTO.md](../../MERCURY-ARCHITECTURE-MANIFESTO.md).
> Before implementing, read §§1–3 and §6 of the manifesto.

---

# Procedure Spec: `commands.runBulk`

**Type:** `procedure`
**Target file:** `src/server/routers/commands.ts` (procedure entry) + `src/server/services/commandBus.ts` (transactional core, new exports)
**Agent:** `build` (primary) with `qa-reviewer` review; escalate to `opus-build` only if a backend reviewer flags a transactional-correctness concern during implementation.

Resolves: **CPO Audit F5** (bulk semantics unspecified). Feeds: **P0-2** (runBulk backend spec) and **P0-7** (DB migration audit, command-journal extension).

References, by path:

- [docs/engineering-plans/MERCURY-ARCHITECTURE-MANIFESTO.md](../../MERCURY-ARCHITECTURE-MANIFESTO.md) §3.6 (all mutations through `useCommandRunner` + new `commands.runBulk`), §6.2 (backend anti-patterns), §6.3 (database anti-patterns — bulk journal entries written exclusively through `commandBus`).
- [docs/engineering-plans/CPO-AUDIT-REPORT.md](../../CPO-AUDIT-REPORT.md) §F5 (the unspecified bulk semantics).
- [src/shared/statuses.ts](../../../../src/shared/statuses.ts) (canonical status enums, P0-1; this spec references `PurchaseOrderStatus`, `SalesOrderStatus`, etc. via that file — never inline strings).
- [src/server/services/commandBus.ts](../../../../src/server/services/commandBus.ts) lines 654–1020 (the single-command flow this spec extends: atomic claim → tx → snapshot → broadcast).
- [src/shared/commandCatalog.ts](../../../../src/shared/commandCatalog.ts) `commandMinRole` (per-command role gates) and `reversalPolicies` (used to derive money-mutating cohort).
- [src/server/rbac.ts](../../../../src/server/rbac.ts) `assertCommandAccess` (per-command role check applied to every row).
- [src/client/components/useCommandRunner.ts](../../../../src/client/components/useCommandRunner.ts) (canonical client wrapper; `commands.runBulk` will be the bulk counterpart, see §8).

---

## Manifesto Anchoring (DO NOT SKIP)

| Field | Value |
|-------|-------|
| **UX Rule(s) Served** | UX-4 (bulk action bar appears only on selection), UX-7 (immediate, in-place mutation feedback), UX-8 (state changes resolve in place; no navigation for confirmations). |
| **ARCH Rule(s) Followed** | ARCH-7 (mutations are immediate and in-place; targeted invalidation), ARCH-12 (atomic forms — bulk = atomic per-row plus atomic transactional cohort for money). Backend rule: all bulk writes flow through `commandBus`; no side channel (§3.6, §6.3). |
| **Attention Budget Tier** | Tier 0 (the action the operator just took). Per-row results are surfaced in the `BulkActionBar` (Tier 0 strip), not in a separate page. |
| **Old Pattern Replaced** | (a) Client-side N parallel `useCommandRunner` calls to simulate bulk (forbidden by manifesto §3.6: "Client never issues N parallel single-command mutations to simulate bulk."). (b) Per-view `StatusActionBar` decision-table commits that bypass any group identity in the journal. |
| **URL State Encoded** | None directly. The triggering selection lives in `useUiStore.selectedRows[view]` (transient) and may serialize to `sel` per ARCH-6 (future work, P1 #9); the bulk **result group** is identified by its returned `groupKey` so the UI can re-query progress and durably link the operation in `RecoveryView` and command history. |
| **Existing Infra Leveraged** | `commandBus.executeCommand` (atomic claim, journal, snapshot, broadcast), `commandJournal` table (extended with `bulkGroupKey`, `bulkSequence`), `assertCommandAccess` (per-command role gate), `reversalPolicies` (informs money-mutating cohort), `useCommandRunner` (client wrapper extended with `runBulkCommand`). |
| **Anti-Patterns Avoided** | No bulk-only side channel for journal writes (§6.3). No N+1 client mutations (§3.6). No swallowing of per-row failures behind a single boolean (§6.2). No mutation of `commandBus.executeCommand`'s atomic-claim contract — the bulk procedure **composes** it for non-money rows and uses a new in-transaction sibling for money rows. No global rollback semantics for non-financial actions (a fulfillment-line release that fails on row 3 must not undo row 1's release; that would lose work the operator already saw succeed). |
| **Compliance Check** | (1) Grep `src/server/` for direct writes to `commandJournal` outside `commandBus.ts` — must be zero. (2) Open the network panel during a bulk: exactly **one** `commands.runBulk` request, regardless of selection size. (3) Query `command_journal` for a known `bulkGroupKey` — every row in the response has the same `bulkGroupKey` and contiguous `bulkSequence` values starting at 0. (4) Trigger a money-cohort failure: every money row in the group reports `status='rolled_back'`; no `command_journal` row exists for any money command in that group (the outer tx rolled back). Non-money rows in the same group still report `status='success'` or `'failed'` and DO have journal rows. (5) Submit the same `idempotencyKey` set twice: second call returns all `status='skipped'` with the original `commandResult` payloads replayed from the journal. |

---

## §1 — Semantic Decision

### 1.1 — Transaction model

**Per-row by default, with a transactional cohort for money-mutating commands.**

A `commands.runBulk` invocation accepts an ordered list of single-row commands. The server partitions the list into two cohorts:

1. **Non-money cohort**: each command runs in its own transaction via the existing `commandBus.executeCommand`. Failures are isolated; siblings already committed are preserved. Results are reported per row (`success | failed | skipped`).
2. **Money cohort**: all money-mutating commands in the group share **one outer transaction**. They commit together or roll back together. A failure of any one money command produces `status='rolled_back'` for every other money command in the same bulk. The non-money cohort in that same bulk is unaffected.

### 1.2 — Why not pure all-or-nothing

The manifesto §3.6 cites "single transactional envelope" as the goal, and the CPO audit F5 recommends per-row with partial success. These appear to conflict; this spec resolves the conflict by being explicit:

- Pure all-or-nothing across an entire bulk is operationally hostile. A bulk "release 14 lines for picking" that fails on one bad line and rolls back the other 13 — which already triggered downstream warehouse signals via `emitPickEvent` — creates worse confusion than a partial result. The warehouse already moved.
- Pure per-row partial success is unsafe for money. A bulk "record 8 vendor payments" that succeeds on 5 and fails on 3 leaves the books inconsistent; the operator must reconcile by hand. Operators have explicitly asked for "treat the financial set as a unit."
- The hybrid model gives strict atomicity exactly where it matters (financial ledger consistency) and resilient progress everywhere else (warehouse, intake, matchmaking).

This matches the CPO audit's recommendation literally: "per-row with idempotency keys + partial success report. Full rollback ONLY for money-mutating commands."

### 1.3 — Which commands are money-mutating

A command is money-mutating if any of the following is true:

- It writes to a financial ledger: `client_ledger_entries`, `contact_ledger_entries`, `correction_journal_entries`, or `transaction_types` posting paths.
- It writes to or transitions `payments`, `payment_allocations`, `invoices`, `invoice_disputes` (resolution), `vendor_bills`, or `vendor_payments`.
- It writes referee credits, processor fees, or customer credit limits.
- It posts a sales order (issues invoice), posts a purchase receipt (issues vendor bill), or finalizes a vendor bill payment schedule.

The canonical money-mutating set, derived by inspecting `commandBus.ts` body and `reversalPolicies`, is exported as a new constant `MONEY_MUTATING_COMMANDS` in `src/shared/commandCatalog.ts`:

```ts
// src/shared/commandCatalog.ts (added)
export const MONEY_MUTATING_COMMANDS: ReadonlySet<CommandName> = new Set([
  // Client receivables / cash in
  'logPayment',
  'allocatePayment',
  'unallocatePayment',
  'refundPayment',
  'applyDiscount',
  'applyClientCredit',
  // Customer credit overrides
  'setCustomerCreditLimit',
  'revertCustomerCreditToEngine',
  'setCustomerEngineMax',
  'bulkRevertCustomersToEngine',
  // Vendor payables / cash out
  'createVendorBill',
  'approveVendorBill',
  'scheduleVendorPayment',
  'recordVendorPayment',
  'voidVendorPayment',
  'recordVendorPrepayment',
  // Order posting / financial closeout
  'postSalesOrder',          // issues invoice
  'postPurchaseReceipt',     // issues vendor bill
  'verifyAllIntake',         // same posting path as postPurchaseReceipt
  // Ledger direct
  'postTransactionLedgerRow',
  'createCorrectionJournalEntry',
  'postPeriodAdjustments',
  // Period closeout
  'lockPeriod',
  'archivePeriod',
  // Referee credit money movement
  'voidRefereeCredit',
  // Processor fees
  'markUserFeeCollected'
]);
```

**Rule for additions**: any new command added to `commandBus.ts` that touches one of the tables listed above MUST be added to this set in the same PR. A static check in CI (P0-7 follow-up) should warn when `commandBus.ts` references `clientLedgerEntries`, `contactLedgerEntries`, `payments`, `paymentAllocations`, `invoices`, `vendorBills`, `vendorPayments`, `correctionJournalEntries`, `customers.credit*`, or `refereeCredits` from a command handler that is not in `MONEY_MUTATING_COMMANDS`.

`confirmSalesOrder`, `cancelSalesOrder`, `priceSalesOrder`, and `repriceOrder` are deliberately **not** in the money set: they change pricing and reservations but do not write the ledger. A bulk that mixes them with `postSalesOrder` will treat the post calls as the money cohort and the confirm/cancel/price calls as non-money, which is the correct semantics.

### 1.4 — Cohort execution order

1. Money cohort runs **first**, in a single outer DB transaction. If any money row throws, the entire outer tx rolls back. No money journal rows are written, no broadcasts emitted.
2. Non-money cohort runs **after** the money cohort resolves (either committed or fully rolled back). Each non-money row runs through `commandBus.executeCommand` independently and reports per-row status.
3. The runBulk procedure returns the combined report. The HTTP/tRPC response is a single object — never streaming.

Why money first: if the money commits, downstream warehouse/intake actions can proceed knowing the books are right. If the money rolls back, the operator sees `rolled_back` for those rows in the same response as any non-money successes, and decides whether to retry (with new idempotency keys) or undo the non-money actions via the existing `reverseCommandById` path.

---

## §2 — Idempotency

### 2.1 — Key shape

```
${groupKey}:${rowId}:${commandName}
```

- `groupKey`: a UUID v4 generated by the client per bulk submission. Stable for retries of the same logical bulk.
- `rowId`: the entity ID the command targets (e.g., a purchase order UUID, a sales order line UUID). When a row targets multiple entities, the client uses the primary entity ID as documented in each command's payload schema.
- `commandName`: the canonical command name from `commandCatalog`.

The bulk envelope also carries the `groupKey` at the top level so the server can verify each per-row idempotency key has the same prefix. A row whose key does not start with `${groupKey}:` is rejected as a `VALIDATION_FAILED` (see §6) before any execution.

### 2.2 — Generation responsibility

**Client-generated.** This matches the existing `useCommandRunner` contract, which generates idempotency keys as `${name}-${crypto.randomUUID()}` (see `src/client/components/useCommandRunner.ts:221`). For bulk, the client constructs the structured key shape above so the server can verify membership and the operator can correlate retries with their original group.

The server **must not** regenerate or normalize the key — that would silently change idempotency semantics across retries.

### 2.3 — Duplicate detection

Reuses the existing atomic-claim mechanism in `commandBus.executeCommand` (lines 664–806 of `commandBus.ts`).

- **Non-money rows**: each row's call into `executeCommand` performs the standard `INSERT … ON CONFLICT (idempotency_key) DO NOTHING RETURNING …`. If the row loses the race, `executeCommand` validates `commandName` + canonicalized payload, then returns the cached `result`. The bulk procedure surfaces that row as `status='skipped'` with the prior `commandResult` payload attached.
- **Money rows**: inside the outer transaction, the new helper `executeCommandWithinTx` (§5.2) performs the same atomic-claim insert but participates in the outer tx. If a money row loses the claim race AND the existing journal row is `status='ok'`, the helper returns the cached result; the row reports `status='skipped'`. If the existing row is `status='pending'`, the entire bulk fails with `JOURNAL_WRITE_FAILED` (a concurrent money-cohort tx is in flight; retrying is safe because the outer tx rolled back).

Duplicate detection happens **after** Zod input validation (entry-point), **after** `assertCommandAccess` (role gate), and **before** payload-specific handler validation. This matches `executeCommand`'s ordering and keeps the response shape stable across single and bulk calls.

### 2.4 — On duplicate

- Status: `'skipped'`.
- `commandResult`: the original `result` payload from the prior successful execution, replayed verbatim. The bulk procedure does NOT emit a second socket broadcast — the original broadcast already fired when the original command committed.
- `bulkGroupKey` on the prior journal row stays unchanged. The current bulk's `groupKey` is recorded in the response but never overwrites the original row.

The operator UX: "5 of 8 succeeded, 3 were already done — that's expected" (when the user clicked Submit twice).

---

## §3 — Input Schema (Zod)

The procedure is added to `src/server/routers/commands.ts` as a new procedure named `runBulk`. The schema lives in `src/shared/schemas.ts` next to `commandInputSchema`.

```ts
// src/shared/schemas.ts (added)

export const bulkCommandRowSchema = z.object({
  entityType: z.string().min(1).max(40),
  // entity-scoped primary key; for commands that operate on a parent entity
  // (e.g. recordVendorPayment), pass the parent entity id here.
  entityId: z.string().uuid(),
  commandName: commandNameSchema,           // narrowed to known commands
  payload: z.record(z.unknown()).default({}),
  idempotencyKey: z
    .string()
    .min(8, 'Bulk row idempotencyKey is required.')
    .max(180, 'Bulk row idempotencyKey may not exceed 180 chars (DB column width).')
});

export const bulkCommandInputSchema = z.object({
  groupKey: z.string().uuid({
    message: 'groupKey must be a UUID v4 (client-generated, stable across retries).'
  }),
  // Operator-visible reason for the whole bulk. Each per-row journal entry
  // records this same reason to preserve the existing reason-on-write
  // contract from commandInputSchema (min 3 chars).
  reason: z
    .string()
    .trim()
    .min(3, 'Reason must be at least 3 characters and explain why the bulk was issued.')
    .max(500, 'Reason must be 500 characters or fewer.'),
  commands: z
    .array(bulkCommandRowSchema)
    .min(1, 'At least one command is required.')
    // Hard cap to bound the outer transaction and the response size.
    // Larger operations should be chunked client-side (BulkActionBar will
    // chunk for the operator transparently in T-0-09 follow-on work).
    .max(500, 'A single bulk submission may contain at most 500 commands.')
}).superRefine((input, ctx) => {
  // Cross-row checks the schema can enforce statically.
  for (let i = 0; i < input.commands.length; i++) {
    const row = input.commands[i];
    const expectedPrefix = `${input.groupKey}:`;
    if (!row.idempotencyKey.startsWith(expectedPrefix)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['commands', i, 'idempotencyKey'],
        message:
          'Bulk row idempotencyKey must be `${groupKey}:${rowId}:${commandName}`.'
      });
    }
  }
  // Detect duplicate idempotency keys within the same submission. Two rows
  // with the same key would race their own atomic claim and one would
  // always replay the other's result — almost certainly a client bug.
  const seen = new Set<string>();
  for (let i = 0; i < input.commands.length; i++) {
    const k = input.commands[i].idempotencyKey;
    if (seen.has(k)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['commands', i, 'idempotencyKey'],
        message: 'Duplicate idempotencyKey within the same bulk submission.'
      });
    }
    seen.add(k);
  }
});

export type BulkCommandInput = z.infer<typeof bulkCommandInputSchema>;
export type BulkCommandRow = z.infer<typeof bulkCommandRowSchema>;
```

### 3.1 — Role gate

The procedure is `protectedProcedure` (matches existing `commands.run`). Minimum role at the procedure boundary is `operator` (rejects `viewer`). Per-command role gating is **also** enforced for each row via `assertCommandAccess(user, commandName)` before that row runs. A bulk that includes a command requiring `manager` while the actor is `operator` fails that row with `UNAUTHORIZED` (and, if the row is in the money cohort, rolls back the whole money cohort — see §6).

### 3.2 — Why role check is per-row, not per-bulk

A bulk may legitimately mix commands at different role floors (e.g., `recordWeighAndPack` at `operator` plus `markOrderFulfilled` at `operator`). Hoisting the gate to "max of all rows" would be over-restrictive in some flows; hoisting it to "min of all rows" would silently grant excess access to a subset of rows. Per-row matches the existing `executeCommand` semantics exactly.

---

## §4 — Output Schema (Zod)

```ts
// src/shared/schemas.ts (added)

export const bulkCommandRowResultSchema = z.object({
  idempotencyKey: z.string(),
  status: z.enum(['success', 'failed', 'skipped', 'rolled_back']),
  // bulkSequence == index in the original input.commands array. Surfaced so
  // the UI can render results in submission order without rebuilding it.
  bulkSequence: z.number().int().min(0),
  // The successful or replayed CommandResult, when available.
  commandResult: z
    .object({
      ok: z.boolean(),
      commandId: z.string().uuid(),
      affectedIds: z.array(z.string()),
      toast: z.string().optional(),
      delta: z.record(z.unknown()).optional(),
      orderId: z.string().optional(),
      warnings: z.array(z.string()).optional()
    })
    .optional(),
  error: z
    .object({
      code: z.enum([
        'VALIDATION_FAILED',
        'UNAUTHORIZED',
        'COMMAND_FAILED',
        'ROLLED_BACK',
        'JOURNAL_WRITE_FAILED'
      ]),
      // Scrubbed message — safe to surface to clients. Same scrubbing path
      // as scrubDatabaseError in src/server/trpc.ts.
      message: z.string()
    })
    .optional()
});

export const bulkCommandResultSchema = z.object({
  groupKey: z.string().uuid(),
  totalCommands: z.number().int().min(1),
  succeeded: z.number().int().min(0),
  failed: z.number().int().min(0),
  skipped: z.number().int().min(0),
  rolledBack: z.number().int().min(0),
  // The money cohort's overall disposition. 'na' means no money commands
  // were in the bulk; 'committed' / 'rolled_back' apply only when at least
  // one money command was present.
  moneyCohort: z.enum(['na', 'committed', 'rolled_back']),
  results: z.array(bulkCommandRowResultSchema)
});

export type BulkCommandResult = z.infer<typeof bulkCommandResultSchema>;
```

### 4.1 — Invariants the procedure MUST satisfy

1. `totalCommands === results.length === succeeded + failed + skipped + rolledBack`.
2. `results[i].bulkSequence === i` for every `i` in `0..totalCommands - 1`.
3. If `moneyCohort === 'rolled_back'`, every money row reports `status === 'rolled_back'` and no money row has a `commandResult.commandId` value (no journal row exists for them).
4. If `moneyCohort === 'committed'`, every money row reports `status` in `{'success', 'skipped'}` and never `'failed'` or `'rolled_back'`. (A row that fails inside the outer tx triggers rollback for the whole cohort.)
5. `groupKey` in the response equals `input.groupKey`.

### 4.2 — `BulkActionBar` consumption

`BulkActionBar` reads the result like this:

```ts
const { succeeded, failed, skipped, rolledBack, moneyCohort, results } = await runBulkCommand(...);

if (failed === 0 && rolledBack === 0) {
  // Full or skipped-success path. Clear selection.
  uiStore.clearSelection(view);
} else {
  // Preserve selection so the operator can retry only the failed rows.
  uiStore.setSelection(view, results
    .filter((r) => r.status === 'failed' || r.status === 'rolled_back')
    .map((r) => /* re-derive row id from idempotencyKey or commandResult */));
}
```

The bar surfaces a small per-row summary ("12 of 14 done · 2 failed · click to retry"), and a "Show details" link that opens the failed/rolled-back row list using the entity link from the original selection.

---

## §5 — Command Journal Extension

This section defines **what** the journal needs. P0-7 owns **how** the migration is shaped (SQL file, rollback policy, index strategy).

### 5.1 — Required additions to `command_journal`

Two new nullable columns on the `command_journal` table:

| Column | Type | Nullable | Index | Purpose |
|--------|------|----------|-------|---------|
| `bulk_group_key` | `uuid` | yes | yes (btree, named `command_journal_bulk_group_idx`) | Identifies all rows produced by the same `commands.runBulk` invocation. NULL for single-command writes from the existing `commands.run` path. |
| `bulk_sequence` | `integer` | yes | composite with `bulk_group_key` (`(bulk_group_key, bulk_sequence)`, named `command_journal_bulk_group_seq_idx`) | Index of this command within its bulk submission. NULL for single-command writes. Always equals `input.commands[i]` index. |

Both columns are nullable on purpose: existing single-command writes (`commands.run`) MUST NOT be required to populate them, and the migration MUST NOT backfill historical rows.

### 5.2 — Updated `commandBus.ts` API surface

`commandBus.ts` exports two new functions to support runBulk; the existing `executeCommand` stays unchanged on its hot path:

```ts
// New: per-row entry point used inside the outer transaction for money rows.
// Variant of executeCommand that participates in the caller's transaction
// and defers JSONL audit + socket broadcast to after the outer commit.
export async function executeCommandWithinTx(
  tx: Tx,
  input: CommandInput,
  user: SessionUser,
  options: {
    bulkGroupKey: string;
    bulkSequence: number;
    // Deferred IO: the bulk procedure collects these and flushes them once
    // the outer tx commits. If the outer tx rolls back, the deferred IO is
    // discarded (no journal-on-disk write, no socket broadcast).
    deferredIo: {
      onCommit: Array<() => Promise<void>>;
    };
  }
): Promise<CommandResult>;

// New: non-money bulk dispatcher. Calls executeCommand per row and tags
// the resulting journal row with bulk_group_key / bulk_sequence by
// passing the metadata through to the existing claim insert.
export async function executeCommandAsBulkMember(
  input: CommandInput,
  user: SessionUser,
  io: SocketServer,
  options: { bulkGroupKey: string; bulkSequence: number }
): Promise<CommandResult>;
```

Both helpers thread `bulk_group_key` and `bulk_sequence` into the atomic-claim INSERT in `commandJournal` (same INSERT pattern as `executeCommand` lines 664–682). Neither helper changes `executeCommand`'s public contract.

### 5.3 — Query pattern

The UI queries "all commands from bulk group X" via a new server query (T-B-08 lineage, scoped under `src/server/routers/queries.ts`):

```ts
queries.bulkGroup.useQuery({ groupKey: 'a8d…' })
// returns { groupKey, totalCommands, succeeded, failed, skipped, rolledBack,
//           rows: Array<{ commandId, commandName, status, affectedIds,
//                         result, error, bulkSequence, createdAt }> }
```

This procedure is `protectedProcedure` (min role `viewer` — read-only). Rows are filtered by the existing `commandJournal` visibility rules in `src/server/routers/queries.ts` (currently every signed-in user can see journal rows; if/when that tightens, this procedure inherits).

Index usage: a single seek on `command_journal_bulk_group_seq_idx`, ordered by `bulk_sequence`, returns rows in submission order. No table scan.

### 5.4 — RecoveryView integration

`RecoveryView` already lists failed commands. After P0-7 ships the column, `RecoveryView` exposes a "Bulk group" facet that groups failures by `bulk_group_key`. Click-through opens the `BulkResultDetailSlideover` (spec to follow under P1 #14) and uses the same `queries.bulkGroup` to render per-row status with retry buttons gated by `commandLabelFor` and `commandMinRole`.

### 5.5 — What this spec does NOT decide

- Migration file format and exact column types (decimal vs integer for `bulk_sequence`, etc.) — defer to P0-7.
- Whether to add a `bulk_groups` parent table for richer group metadata. The current single-table design (just two columns on `command_journal`) is sufficient because every group property except `groupKey` is derivable from the rows. A parent table can be added later if/when a `bulk_groups.reason` distinct from per-row `reason` is needed.
- Retention/archival behavior of `bulk_group_key` when individual rows are archived — defer to the closeout/archive plan.

---

## §6 — Error Contract

### 6.1 — tRPC error envelope vs in-result error

The procedure is `protectedProcedure`. Errors fall into two categories:

| Category | Where it appears | Examples |
|---|---|---|
| **Envelope errors (thrown)** | tRPC error → client mutation `.onError` | Zod input validation, actor lacks `operator` role at the procedure boundary, internal exception in the procedure code path (not a per-row handler error) |
| **In-result errors** | `BulkCommandResult.results[i].error` | Per-row failures: command throws, role gate denies the specific command, money cohort rolls back, journal claim error |

### 6.2 — Error codes

`error.code` on a row uses these values:

- `VALIDATION_FAILED` — the row's `payload` failed the command's own Zod validation inside `commandBus.runCommand`, OR the row's `idempotencyKey` was malformed (when superRefine catches it, the whole bulk fails at the envelope; when individual rows fail per-command Zod, the row fails). Terminal for that row.
- `UNAUTHORIZED` — `assertCommandAccess(user, commandName)` for this specific row rejected the actor. The row never runs.
- `COMMAND_FAILED` — the command handler ran but threw or returned `{ ok: false }`. The row's transaction (for non-money) rolled back; siblings are unaffected.
- `ROLLED_BACK` — a money row that did not itself fail, but is reported as rolled back because **another** money row in the same outer tx threw. Only used in the money cohort.
- `JOURNAL_WRITE_FAILED` — the atomic-claim INSERT raised a DB error not covered by the on-conflict path (e.g., column type mismatch after a migration drift). Terminal for that row. If it occurs during the money cohort, the outer tx rolls back and every money row reports `ROLLED_BACK` (with the one offender annotated, see §6.4).

### 6.3 — What is terminal vs partial

| Failure | Behavior |
|---|---|
| Zod input on `bulkCommandInputSchema` itself (e.g., empty array, mismatched key prefix) | Envelope error (thrown). The bulk never starts. Client retries with a new payload. |
| Per-row Zod payload failure inside a command handler | In-result `VALIDATION_FAILED`. Other rows continue. |
| Per-row role gate failure | In-result `UNAUTHORIZED`. Other rows continue. The bulk does NOT short-circuit; the operator should see each unauthorized row. |
| Per-row command throw (non-money) | In-result `COMMAND_FAILED`. Other rows continue. |
| Per-row command throw (money) | In-result `COMMAND_FAILED` for the row that threw; `ROLLED_BACK` for every other money row in the bulk; non-money rows still execute. |
| Outer-tx DB failure during the money cohort (e.g., connection lost) | `JOURNAL_WRITE_FAILED` for the offender; `ROLLED_BACK` for sibling money rows. Procedure still returns a valid `BulkCommandResult` (does NOT throw an envelope error) so the client can correctly render the partial outcome. |
| Outer-tx unhandled internal procedure error | Envelope error (thrown), with `scrubDatabaseError` scrubbing. The bulk's effects are undone if and only if the failure happened during the money cohort; non-money rows already committed are preserved and surfaced via the journal even though the response is an error. The client should fall back to `queries.bulkGroup` to reconcile. |

### 6.4 — Annotating the offender in a rolled-back cohort

When the money cohort rolls back because row `k` threw, the response includes:

- Row `k`: `status = 'failed'`, `error.code = 'COMMAND_FAILED'`, `error.message` = scrubbed exception.
- All other money rows in the bulk: `status = 'rolled_back'`, `error.code = 'ROLLED_BACK'`, `error.message = 'Rolled back because row ${k} failed: ${scrubbedReason}.'` so the operator knows which row caused it without grepping logs.

### 6.5 — Toast messaging

The bulk does not return a single envelope `toast`. The client (`BulkActionBar`) composes a toast from the aggregate counts. `commandResult.toast` per row is preserved for "Show details" expansion.

---

## §7 — Test Sketches

These are intentional test contracts the implementer MUST write. File: `src/server/routers/commands.runBulk.test.ts`. Use the existing in-process DB harness used by `commandBus.idempotency.test.ts`.

### 7.1 — Happy path: 3 non-money commands, all succeed

```ts
it('runs 3 non-money commands and returns success per row', async () => {
  const groupKey = randomUUID();
  const rows = [
    makeRow(groupKey, line1Id, 'releaseLineForPicking', { lineId: line1Id }),
    makeRow(groupKey, line2Id, 'releaseLineForPicking', { lineId: line2Id }),
    makeRow(groupKey, line3Id, 'releaseLineForPicking', { lineId: line3Id })
  ];

  const result = await caller.commands.runBulk({
    groupKey,
    reason: 'release for picking — bulk',
    commands: rows
  });

  expect(result.totalCommands).toBe(3);
  expect(result.succeeded).toBe(3);
  expect(result.failed).toBe(0);
  expect(result.skipped).toBe(0);
  expect(result.rolledBack).toBe(0);
  expect(result.moneyCohort).toBe('na');
  expect(result.results.map((r) => r.status)).toEqual(['success', 'success', 'success']);
  expect(result.results.every((r) => r.commandResult?.ok === true)).toBe(true);

  // Journal rows must carry the bulk metadata.
  const journal = await db
    .select()
    .from(commandJournal)
    .where(eq(commandJournal.bulkGroupKey, groupKey));
  expect(journal).toHaveLength(3);
  expect(journal.map((r) => r.bulkSequence).sort()).toEqual([0, 1, 2]);
});
```

### 7.2 — Partial failure: 1 of 3 non-money rows fails

```ts
it('isolates a non-money failure from its siblings', async () => {
  const groupKey = randomUUID();
  // Middle row targets a non-existent line so releaseLineForPicking throws.
  const rows = [
    makeRow(groupKey, line1Id,      'releaseLineForPicking', { lineId: line1Id }),
    makeRow(groupKey, 'bogus-uuid', 'releaseLineForPicking', { lineId: 'bogus-uuid' }),
    makeRow(groupKey, line3Id,      'releaseLineForPicking', { lineId: line3Id })
  ];

  const result = await caller.commands.runBulk({
    groupKey,
    reason: 'release for picking — bulk with bad row',
    commands: rows
  });

  expect(result.totalCommands).toBe(3);
  expect(result.succeeded).toBe(2);
  expect(result.failed).toBe(1);
  expect(result.results[1].status).toBe('failed');
  expect(result.results[1].error?.code).toBe('COMMAND_FAILED');
  expect(result.moneyCohort).toBe('na');

  // The two successful rows DID commit and broadcast.
  expect(socketSpy.emitsTo('authenticated', 'command:completed')).toHaveLength(2);
});
```

### 7.3 — Full rollback: money command fails, sibling money rows roll back

```ts
it('rolls back every money row in the group when one money row fails', async () => {
  const groupKey = randomUUID();
  // 3 vendor payments; row 1 targets a bill whose amount has been changed
  // out from under the bulk so the recordVendorPayment guard throws.
  const rows = [
    makeRow(groupKey, billA, 'recordVendorPayment', { vendorBillId: billA, amount: 100 }),
    makeRow(groupKey, billB, 'recordVendorPayment', { vendorBillId: billB, amount: 999_999 }), // intentionally overpay → throws
    makeRow(groupKey, billC, 'recordVendorPayment', { vendorBillId: billC, amount: 50 })
  ];

  const result = await caller.commands.runBulk({
    groupKey,
    reason: 'pay vendors — bulk',
    commands: rows
  });

  expect(result.moneyCohort).toBe('rolled_back');
  expect(result.results[0].status).toBe('rolled_back');
  expect(result.results[1].status).toBe('failed');
  expect(result.results[2].status).toBe('rolled_back');
  expect(result.results[0].error?.code).toBe('ROLLED_BACK');
  expect(result.results[2].error?.code).toBe('ROLLED_BACK');

  // No journal rows exist for any money row in this bulk.
  const journal = await db
    .select()
    .from(commandJournal)
    .where(eq(commandJournal.bulkGroupKey, groupKey));
  expect(journal).toHaveLength(0);

  // billA and billC amountPaid unchanged.
  const [a, c] = await Promise.all([
    db.select().from(vendorBills).where(eq(vendorBills.id, billA)).limit(1),
    db.select().from(vendorBills).where(eq(vendorBills.id, billC)).limit(1)
  ]);
  expect(a[0].amountPaid).toBe(initialAmountPaidA);
  expect(c[0].amountPaid).toBe(initialAmountPaidC);
});
```

### 7.4 — Mixed cohort: money commits, non-money sibling still runs

```ts
it('commits money cohort and runs non-money rows independently', async () => {
  const groupKey = randomUUID();
  const rows = [
    // money:
    makeRow(groupKey, billA, 'recordVendorPayment', { vendorBillId: billA, amount: 100 }),
    // non-money:
    makeRow(groupKey, line1, 'releaseLineForPicking', { lineId: line1 })
  ];

  const result = await caller.commands.runBulk({
    groupKey,
    reason: 'mixed cohort',
    commands: rows
  });

  expect(result.moneyCohort).toBe('committed');
  expect(result.results[0].status).toBe('success'); // money
  expect(result.results[1].status).toBe('success'); // non-money
});
```

### 7.5 — Idempotency: resubmit the same bulk → all rows skipped

```ts
it('replays prior results when the same idempotencyKeys are resubmitted', async () => {
  const groupKey = randomUUID();
  const input = {
    groupKey,
    reason: 'release lines — bulk',
    commands: [
      makeRow(groupKey, line1Id, 'releaseLineForPicking', { lineId: line1Id }),
      makeRow(groupKey, line2Id, 'releaseLineForPicking', { lineId: line2Id })
    ]
  };

  const first = await caller.commands.runBulk(input);
  expect(first.succeeded).toBe(2);

  const second = await caller.commands.runBulk(input);
  expect(second.totalCommands).toBe(2);
  expect(second.skipped).toBe(2);
  expect(second.succeeded).toBe(0);
  expect(second.results.every((r) => r.status === 'skipped')).toBe(true);
  // Replayed CommandResult is identical to the first run for that row.
  expect(second.results[0].commandResult?.commandId)
    .toBe(first.results[0].commandResult?.commandId);

  // No additional socket broadcasts for the duplicate submission.
  expect(socketSpy.emitsTo('authenticated', 'command:completed')).toHaveLength(2);
});
```

### 7.6 — Role failure: viewer cannot bulk

```ts
it('rejects the whole bulk at the procedure boundary for viewer role', async () => {
  const viewerCaller = await callerFor({ role: 'viewer' });
  await expect(viewerCaller.commands.runBulk(validInput)).rejects.toMatchObject({
    code: 'FORBIDDEN'
  });
});
```

### 7.7 — Per-row role failure: operator submits a manager-only command in the mix

```ts
it('reports UNAUTHORIZED on the manager-only row without affecting siblings', async () => {
  const operatorCaller = await callerFor({ role: 'operator' });
  const groupKey = randomUUID();
  const rows = [
    // operator can run releaseLineForPicking
    makeRow(groupKey, line1Id, 'releaseLineForPicking', { lineId: line1Id }),
    // resolveInvoiceDispute is manager-gated (see commandMinRole)
    makeRow(groupKey, dispute1, 'resolveInvoiceDispute', { disputeId: dispute1 })
  ];

  const result = await operatorCaller.commands.runBulk({
    groupKey,
    reason: 'mixed role check',
    commands: rows
  });

  expect(result.results[0].status).toBe('success');
  expect(result.results[1].status).toBe('failed');
  expect(result.results[1].error?.code).toBe('UNAUTHORIZED');
});
```

### 7.8 — Cross-row schema check: malformed idempotency key prefix

```ts
it('rejects the whole bulk when a row idempotencyKey does not match the groupKey', async () => {
  const groupKey = randomUUID();
  const rows = [
    makeRow(groupKey, line1Id, 'releaseLineForPicking', { lineId: line1Id }),
    {
      entityType: 'fulfillmentLine',
      entityId: line2Id,
      commandName: 'releaseLineForPicking',
      payload: { lineId: line2Id },
      idempotencyKey: `wrong-group:${line2Id}:releaseLineForPicking`
    }
  ];

  await expect(
    caller.commands.runBulk({ groupKey, reason: 'r', commands: rows })
  ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
});
```

---

## §8 — Client Wrapper Contract (informative)

`useCommandRunner` gains a sibling `runBulkCommand` (implemented under P0-2, not in this spec). The bulk client wrapper:

1. Generates `groupKey = crypto.randomUUID()` once per Submit click.
2. Builds the per-row `idempotencyKey = ${groupKey}:${rowId}:${commandName}`.
3. Calls `trpc.commands.runBulk.useMutation` once with the structured input.
4. On success, invalidates the queries referencing `affectedIds` across all rows (use the existing `buildAffectedQueryPredicate` over the union of `commandResult.affectedIds`).
5. On envelope error, surfaces the error toast and the BulkActionBar offers `Retry` with a new `groupKey` (so the original `groupKey` is not "burned" — it still replays via idempotency, but the operator's retry intent is recorded as a fresh group for easier audit).

The client never issues N parallel single-command mutations to simulate bulk. The manifesto §3.6 forbids this and CI guard `pnpm lint:no-bulk-fan-out` (P1) enforces it.

---

## §9 — Dependencies

| Dependency | Status | Blocker? | Notes |
|------------|--------|----------|-------|
| `src/shared/statuses.ts` | EXISTS (P0-1) | no | Used indirectly via per-command Zod schemas. |
| Migration adding `bulk_group_key` and `bulk_sequence` to `command_journal` | NEEDS_BUILD (P0-7) | yes | This spec's §5 defines the requirements; P0-7 writes the SQL. |
| `MONEY_MUTATING_COMMANDS` constant in `src/shared/commandCatalog.ts` | NEEDS_BUILD (this PR) | yes | Defined in §1.3; added in the same PR that implements `runBulk`. |
| `executeCommandWithinTx` and `executeCommandAsBulkMember` helpers in `commandBus.ts` | NEEDS_BUILD (P0-2) | yes | Signatures defined in §5.2. |
| `useCommandRunner.runBulkCommand` client wrapper | NEEDS_BUILD (P0-2 client side) | no for backend implementation; yes for end-to-end E2E | Contract in §8. |
| `queries.bulkGroup` server query | NEEDS_BUILD (T-B-08 lineage) | no for runBulk itself | Required for `RecoveryView` group facet (§5.4). |

---

## §10 — Risk Notes

- **Money-mutating set drift.** If a new command is added to `commandBus.ts` that writes to the ledger but is not added to `MONEY_MUTATING_COMMANDS`, a bulk that includes it will silently use per-row semantics — partial financial commits become possible. Mitigation: CI guard described in §1.3.
- **Outer tx duration.** The money-cohort tx holds locks for the duration of every row in the cohort. Caps: max 500 commands per bulk (§3 hard cap); each command's existing per-handler timeout. The bar should chunk client-side when selection > 100 rows in a Critical view (future BulkActionBar work).
- **Snapshot accuracy under outer tx.** `snapshotFromPayload` and `snapshotByAffectedIds` (referenced from `commandBus.ts`) read from the DB outside the caller's transaction today. Inside `executeCommandWithinTx` they MUST read through the outer `tx` so each money row's `beforeSnapshot` reflects the in-progress cohort state, not a stale snapshot. Implementer must pass `tx` into these snapshot helpers in the new path.
- **Socket broadcast ordering.** If the outer tx commits the money cohort, the procedure flushes deferred `command:completed` events in `bulkSequence` order. Subscribers (`buildAffectedQueryPredicate` consumers) must not assume strict per-row ordering for non-money rows, only that all events for a given `bulkGroupKey` arrive eventually.
- **Idempotency key reuse across bulks.** If the same `${groupKey}:${rowId}:${commandName}` key is sent in two different bulks (an operator-side bug), the second bulk's row will report `'skipped'` even though its `groupKey` differs from the journal row's `bulk_group_key`. This is correct (the idempotency contract owns it), but the UI should show "skipped (previously executed in different bulk group)" so the operator understands why nothing happened.
- **`commands.run` parity.** Single-command `commands.run` must continue to write `bulk_group_key = NULL` and `bulk_sequence = NULL`. Implementer must NOT shortcut by sending single commands through `runBulk` internally — that would couple two separate write paths.

---

## §11 — Acceptance Criteria

- [ ] AC-1: `commands.runBulk` procedure is added to `src/server/routers/commands.ts` with `protectedProcedure` and `bulkCommandInputSchema` validation; minimum role at the boundary is `operator`.
- [ ] AC-2: `bulkCommandInputSchema` and `bulkCommandResultSchema` live in `src/shared/schemas.ts` and exactly match §§3–4.
- [ ] AC-3: `MONEY_MUTATING_COMMANDS` is exported from `src/shared/commandCatalog.ts` with the set defined in §1.3.
- [ ] AC-4: `commandBus.ts` exports `executeCommandWithinTx` and `executeCommandAsBulkMember` per §5.2; existing `executeCommand` signature/contract unchanged.
- [ ] AC-5: `command_journal` is extended with `bulk_group_key` (uuid, nullable, btree-indexed) and `bulk_sequence` (integer, nullable; composite index with `bulk_group_key`) via a migration owned by P0-7. Both columns are NULL for rows written via `commands.run`.
- [ ] AC-6: All test sketches in §7 are implemented and pass.
- [ ] AC-7: Repo-wide grep `(insert\(commandJournal\)|UPDATE.*command_journal)` outside `commandBus.ts` returns zero matches (manifesto §6.3 invariant).
- [ ] AC-8: `pnpm typecheck` clean.
- [ ] AC-9: `BulkActionBar` (T-0-09) consumes `BulkCommandResult` exactly per §4.2; failing rows are preserved in selection for retry.
- [ ] AC-10: `useCommandRunner.runBulkCommand` (P0-2 client) generates `groupKey` once per Submit and per-row idempotency keys per §2.1. Manifesto §3.6 forbidden pattern (N parallel single mutations) is not used.
