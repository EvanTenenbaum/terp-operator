# 14 — Domain: Money (AR / AP / Ledger / Closeout / Recovery)

> Ground truth is the code. Every claim below cites `file:line`. This covers Accounts
> Receivable (payments, invoices, allocations, early-pay discounts, refunds), Accounts
> Payable (vendor bills + vendor payments), the unified money/transaction ledger and the
> command journal, period Closeout (`CMD-CLOSEOUT`), and Recovery (`CMD-RECOVERY`:
> reversal, correction journal, backup-restore preview, support packet).

All money write-paths flow through the CQRS command bus
(`src/server/services/commandBus.ts`). Every command is dispatched by
`executeCommand` (`commandBus.ts:480`) → `runCommand` switch (`commandBus.ts:817`,
money cases at `commandBus.ts:918-970`). Each command runs in a single Postgres
transaction, claims an idempotency key, snapshots affected rows, writes a
`command_journal` row, appends a JSONL on-disk audit entry, and emits a socket event.
Money math uses `decimal.js` (`commandBus.ts:6`) exclusively for cents-precision.

---

## SECTION A — JOURNEY MAP

### A0. The dispatch envelope (shared by every money command)

`executeCommand` (`commandBus.ts:480`):

1. **RBAC gate** — `assertCommandAccess(user, input.name)` (`commandBus.ts:481`,
   `rbac.ts:16`) checks `commandMinRole` from the catalog
   (`commandCatalog.ts:336-468`). Failure throws before any DB work.
2. **Before-snapshot** — `snapshotFromPayload` (`commandBus.ts:485`,`5832`) collects
   IDs out of the raw payload and reads current rows of ~23 tables
   (`snapshotByAffectedIds`, `commandBus.ts:5838-5877`).
3. **Atomic idempotency claim** — `INSERT … ON CONFLICT (idempotency_key) DO NOTHING
   RETURNING` (`commandBus.ts:490-508`). The returned row *is* the claim. Losers
   (`claimRows.length === 0`, `commandBus.ts:510`) validate the command name
   (`:527`) and a canonical-stringified payload hash (`:532-538`); a still-`pending`
   winner is polled up to 1s (`:576-595`) then replays the cached `result`; orphan
   `pending` rows older than 5 min are adopted to `failed` (`:549-570`).
4. **Winner path** — `db.transaction` runs `runCommand`, computes the
   `afterSnapshot` *inside the tx* (`commandBus.ts:608`, GH #150 fix so same-tx
   inserts are visible), and UPDATEs the claimed journal row to `ok`/`failed` with
   redacted `result` (`commandBus.ts:614-622`, `redactSensitiveDeltaFields`).
5. **Best-effort post-commit observers** (never fail the command):
   JSONL journal (`:633`), `command:completed` socket emit to the `authenticated`
   room — toast stripped (`:655-660`), and document-receipt hooks for
   `postSalesOrder`→invoice (`:703`), `logPayment`→payment_received (`:712`),
   `recordVendorPayment`→vendor_payout (`:721`).
6. **Failure path** (`commandBus.ts:763-813`): DB error text is scrubbed
   (`scrubDatabaseError`), the journal row is UPDATEd (never re-INSERTed) to
   `failed` with the raw message stored server-side in `error`, JSONL + a
   `command:failed` socket emit fire with the *scrubbed* message.

---

### A1. Money-In (Accounts Receivable)

#### A1.1 Log a payment — `logPayment` (`commandBus.ts:3649`)
Happy path: operator records a customer payment.
- Validates payload, rejects `amount === 0` (`:3653`); locks the customer row
  `FOR UPDATE` (`:3658`).
- Inserts `payments` with `unappliedAmount = max(0, amount)` (`:3669`), inferring
  `direction`/`category`/`allocationIntent` and an `impactPreview` string
  (`paymentImpactPreview`, `:7353`).
- **Negative amount branch** (`amount < 0`, `:3684`): treated as **buyer credit /
  down payment** — decrements `customers.balance` via Decimal and writes a
  `client_ledger_entries` row `kind='down_payment'` with `balanceAfter`.
- Enqueues a credit-engine recompute (`enqueueCustomerRecompute`, `:3694`).
- **Auto-allocation branch** (`amount > 0` and intent `fifo`/`selected_invoice`,
  `:3700`): calls `allocatePayment` in the same tx with a derived child command id
  `${commandId}-alloc-${payment.id}` (GH #295, `:3711`). If allocation throws
  (e.g. no open invoices) it is swallowed (`:3721`) — the payment is still logged
  and a "Auto-allocation skipped" toast returned (`:3729`).
- Handoff: post-commit creates external+internal `payment_received` document
  snapshots (`commandBus.ts:712`, `paymentReceivedReceipts.ts`).

#### A1.2 Allocate a payment — `allocatePayment` (`commandBus.ts:3737`)
- Locks payment `FOR UPDATE` via raw SQL; reads snake_case columns by bracket access
  to avoid `undefined→NaN` (`:3746-3752`). Rejects when `unapplied_amount <= 0`
  (`:3751`).
- Target invoices: a single `invoiceId` (`:3756`) or all `open`/`partial` invoices
  for the customer ordered by `createdAt` (FIFO oldest-first, `:3760`). Errors if
  none (`:3764`).
- Per invoice: `allocationAmount = min(open, remaining, payload.amount?)`,
  open = `subMoney(total, amount_paid)` (`:3770`). Skips non-positive allocations
  (`:3772`) → satisfies the `amount > 0` CHECK. Inserts `payment_allocations`,
  bumps `invoices.amount_paid` via `addMoney`, flips status to `paid` when
  `>= total` else `partial` (`:3777-3778`).
- Decrements `customers.balance` by total allocated (Decimal) and writes a
  `client_ledger_entries` `kind='payment_allocation'` row (`:3794-3800`).
- Edge: invoking on a buyer-credit payment is a no-op because `unappliedAmount` is 0.

#### A1.3 Unallocate — `unallocatePayment` (`commandBus.ts:3808`)
- Deletes one `payment_allocations` row; restores `payments.unapplied_amount` via
  `addMoney`, reduces `invoices.amount_paid` (clamped ≥0), resets status to
  `open`/`partial` (`:3826-3832`). **Does not** write a ledger entry or touch
  `customers.balance` — note this asymmetry vs. the allocate path (manager-gated,
  catalog disposition `terminal`).

#### A1.4 Refund — `refundPayment` (`commandBus.ts:3836`, manager)
- Locks payment; rejects double-refund (`:3847`). **Precondition**: payment must be
  fully unallocated — `unapplied_amount === max(0, amount)` (`:3856`), else
  "Unallocate this payment before refunding."
- Sets `status='refunded'`, `unapplied_amount='0.00'` (`:3860`).
- Only **negative (buyer-credit)** payments restore `customers.balance` (Decimal
  `+|amount|`) and write a `client_ledger_entries` `kind='payment_refund'`
  (`:3882-3897`). Positive fully-unallocated payments need no balance move.
- Error/gap handling: missing customer logs a ledger-gap warning, no throw
  (`:3903`). Disposition `terminal` — correct mistakes with a correction entry.

#### A1.5 Early-pay discount — `applyEarlyPayDiscount` (`commandBus.ts:3913`, manager)
- Locks invoice; rejects discount `> openBalance + 0.001` float tolerance
  (`:3928`) returning `ok:false` with guidance. Reduces `invoices.total`
  (`max(0, …)`), flips to `paid` if `amount_paid >= nextTotal` (`:3932-3933`).
  Disposition `offsettable` — offset via correction journal.

#### A1.6 Invoices
`invoices` are produced by `postSalesOrder` (Sales domain), not by money commands.
Money commands only mutate `amount_paid`/`status`/`total`. `invoice_disputes` are
opened from `createCorrectionJournalEntry` when an `invoiceId` is supplied (`:4353`).

---

### A2. Money-Out (Accounts Payable)

#### A2.1 Create vendor bill — `createVendorBill` (`commandBus.ts:3937`)
- Looks up the vendor; computes `dueDate = now + vendor.termsDays` if unspecified
  (`:3945`), defaults `dueReason='Net terms payable'`. Bill number via `code('VBILL')`.
  Disposition `reversible` (marks generated bills `reversed`).

#### A2.2 Approve — `approveVendorBill` (`commandBus.ts:3930` case → `updateVendorBillStatus`, `:3950`)
- Sets `status='approved'` (`offsettable`). UI gate: manager only
  (`VendorBillDetailsTab.tsx:71`).

#### A2.3 Schedule — `scheduleVendorPayment` (`commandBus.ts:3956`, manager)
- Sets `status='scheduled'`, `scheduledFor` (default +1 week, `oneWeek()`), and
  `dueReason='Scheduled payment event exists'` (`:3959`). The schedule is a
  hard precondition for recording the actual payout.

#### A2.4 Record vendor payment — `recordVendorPayment` (`commandBus.ts:3963`, manager)
- Locks the bill `FOR UPDATE`. **Requires** `status='scheduled'` unless
  `overrideUnscheduled === true` (`:3975`). Default amount =
  `subMoney(amount, amount_paid)` (`:3979`). Rejects `<= 0` and over-payment beyond
  the open balance (`:3980-3981`).
- Inserts `vendor_payments`; accumulates `vendor_bills.amount_paid` via `addMoney`,
  flips to `paid` when `>= amount` (Decimal) else `partial`, updates `dueReason`
  (`:3987-3989`). Disposition `reversible`.
- Handoff: post-commit creates `vendor_payout` document snapshots from
  `affectedIds[1]` (the payment id) (`commandBus.ts:721`, `vendorPayoutReceipts.ts`).

#### A2.5 Void vendor payment — `voidVendorPayment` (`commandBus.ts:3994`, manager)
- Sets `vendor_payments.status='void'`; subtracts the amount from
  `vendor_bills.amount_paid` (Decimal, clamped ≥0), resets bill status to
  `approved`, restores `dueReason` (consignment-aware, `:4013`). Disposition
  `terminal`.

#### A2.6 Vendor prepayment (related)
`recordVendorPrepayment` (manager, `commandCatalog.ts:18`) records a vendor payout
against an open PO; surfaced by `RecordPrepaymentDialog.tsx:34`, capped at the PO's
prepayment limit (`:29`).

---

### A3. The Quick Ledger (unified money entry) — `postTransactionLedgerRow`
Single operator surface for **any** money movement. UI: `QuickLedgerGrid.tsx`
(Money-In / Money-Out columns, draft rows persisted in `uiStore`,
`QuickLedgerGrid.tsx:107-115`; commit at `:191-228`). Manager/owner gated for posting
(`canPostLedgerRow`, `QuickLedgerGrid.tsx:143`; command minRole `manager`).

Handler `postTransactionLedgerRow` (`commandBus.ts:4374`) branches by
`entityType` × `direction`:
- **contact** (`:4393`): writes a flat append-only `contact_ledger_entries` row.
  Sign convention: `direction='paying'` stores negative (we owe less), `receiving`
  positive (`:4401`). No invoice allocation.
- **customer + receiving** (`:4424`): infers signed amount (buyer_credit /
  down_payment → negative), then delegates to `logPayment` + `allocatePayment`
  (`:4440-4458`). FIFO with no open invoice degrades to `unapplied` (`:4432-4438`).
- **vendor + paying** (`:4464`): manager-gated; `postVendorLedgerPayment` (`:4519`)
  either records against a selected bill (`recordVendorPayment` with
  `overrideUnscheduled`) or fabricates a paid `vendor_bills` + `vendor_payments` pair
  tied to an open PO when the type is a product/down payment (`:4536-4580`).
- **referee + paying** (`:4469`): manager-gated; posts a negative correction journal
  entry + `processRefereePayout` (FIFO credit marking).
- **fallback** (`:4505`): a signed `createCorrectionJournalEntry`.

`upsertTransactionType` (`commandBus.ts:4583`, manager) maintains the
`transaction_types` catalog (slug-unique upsert) that drives the dropdown defaults.
Read model: `transactionLedger` query (`queries.ts:146`) UNIONs payments +
vendor_payments + non-reversed correction entries into `receiving`/`paying` lists,
excluding `reversed`/`refunded`/`void` rows.

---

### A4. Period Closeout (`CMD-CLOSEOUT`)
UI: `OperationsViews.tsx` closeout panel (`:2729-2792`). All three commands are
**owner**-only (`commandCatalog.ts:405-407`).

1. **Preview** — `closeoutPreview` (`queries.ts:1242`) → `getCloseoutSafety`
   (`closeout.ts:23`). Computes 6 blocker counts (unsafe batches, open POs, open
   connectors, open fulfillment, failed-unretried commands, draft sales orders) and
   control totals for 10 entity classes for the `YYYY-MM` period
   (`closeout.ts:44-97`). `eligible = locked && unsafeRows === 0` (`:82`).
   Failed-command count excludes failures later superseded by an `ok` retry with the
   same name+payload (`countFailedUnretriedCommands`, `closeout.ts:106`).
2. **Blocker drilldown** — `closeoutBlockerRows` (`queries.ts:1245`) returns the
   actual rows behind a chosen blocker id (parameterized template map, `:1257`).
3. **Lock** — `lockPeriod` (`commandBus.ts:5144`). Takes a transaction-scoped
   advisory lock `pg_advisory_xact_lock(hashtext(period))`
   (`acquirePeriodCloseoutLock`, `:5140`). Idempotent if already locked (`:5148`).
   Re-checks safety twice (TOCTOU guard, `:5149-5156`); inserts `period_locks`.
4. **Post adjustments** — `postPeriodAdjustments` (`commandBus.ts:5125`). Guarded by
   `assertPeriodUnlocked` (`:5127`,`7375`) — **cannot** post into a locked period.
   Inserts one `correction_journal_entries` row per adjustment. Disposition
   `reversible`.
5. **Archive** — `archivePeriod` (`commandBus.ts:5161`). Advisory-locked; rejects
   double-archive (`:5170`), requires `locked && eligible` (`:5174-5176`). Writes a
   CSV (batches), JSONL (the period's command journal), and a summary PDF to
   `ARCHIVE_DIR`, inserts `archive_runs` with matching control totals, and stamps
   `archivedAt` on the period's batches and sales orders (`:5179-5193`). Terminal.

`createCorrectionJournalEntry` (`commandBus.ts:4342`, manager) is also period-locked
(`assertPeriodUnlocked`, `:4344`) and may optionally open an `invoice_disputes` row +
run a find/replace text fix (`:4350-4370`).

---

### A5. Recovery (`CMD-RECOVERY`)
UI: `OperationsViews.tsx` recovery panel (`:2537-2684`) + `CommandReversalTab.tsx`.

- **Reversal preview** — `reversalPreview` (`queries.ts:1220`) reads the journal row,
  attaches the `reversalPolicies` entry, and computes `reversible = status==='ok' &&
  !reversedByCommandId && disposition==='reversible'` plus a plain-language impact
  string (`:1233-1239`).
- **Reverse** — `reverseCommandById` (`commandBus.ts:4666`, manager). Validates the
  original is `ok` and not already reversed (`:4671-4672`), then dispatches a large
  per-command-name branch that *compensates* using `beforeSnapshot`/`afterSnapshot`
  (see B for mechanics). Finally stamps `reversed_by_command_id` on the original
  (`:5079`) and enqueues credit recomputes (`:5083`). Non-handled commands throw
  with their policy disposition/guidance (`:5075`). UI confirm flow gated owner|manager
  (`CommandReversalTab.tsx:38,84-112`).
- **Document a failure** — `documentCommandFailure` (`commandBus.ts:5089`, manager).
  Annotates a `failed` journal row's `reason` (`:5096`); no-op-safe with friendly
  `ok:false` toasts when the target is missing/not-failed (`:5101`). Terminal.
- **Correction journal** — `createCorrectionJournalEntry` (see A4) from the recovery
  panel (`OperationsViews.tsx:2605,2640`).
- **Backup restore preview** — `restoreFromBackupPoint` (`commandBus.ts:5112`,
  **owner**). Read-only: loads a `backup_snapshots` row and returns its JSON as a
  `delta.readOnly` preview — **no ledger is mutated** (`:5116-5122`). Paired with the
  `snapshotDiff` query (`queries.ts:1165`) which diffs snapshot counts vs. current
  counts for 9 entity classes.
- **Support packet** — `supportPacket` (`queries.ts:1146`): health + 8 entity counts
  + last 20 failed commands + last 40 commands.
- **Recovery search** — `recoverySearch` (`queries.ts:492`): searches the journal by
  id, command name, actor, affected ids, result toast, or reason; `inputPayload` is
  redacted below manager (FIX-5, `:503,524`).
- **Command journal** — `commandJournal` (`queries.ts:2119`, manager) and
  `relatedCommands` (`queries.ts:854`, resolves a contact's linked entity ids and
  matches `affected_ids &&`).

---

## SECTION B — BACKEND SPEC

### B0. Money model: double-entry, ledgers, decimal.js

TERP does **not** run a strict balanced double-entry GL. Instead it uses:
- **Authoritative operational tables** carrying running totals: `invoices.amount_paid`,
  `payments.unapplied_amount`, `vendor_bills.amount_paid`, `customers.balance`.
- **Append-only audit ledgers** that record every balance-affecting movement:
  `client_ledger_entries` (each row stores the signed `amount` *and* the
  `balanceAfter` it produced) and `contact_ledger_entries` (signed, running balance
  computed at read time via window function, `queries.ts:2037`).
- **Correction journal** (`correction_journal_entries`) — period-scoped manual
  adjustments and the GL-ish bucket for referee/other payouts.
- **Command journal** (`command_journal`) — the universal event/command log with
  before/after row snapshots that powers reversal.

**Invariant: `customers.balance == SUM(client_ledger_entries.amount)`.** It is *not*
DB-enforced; a nightly cron (`scripts/customer-balance-reconciliation-cron.ts` →
`reconcileCustomerBalances`, `balanceReconciliation.ts:64`) compares the two in SQL
(`SUM(cle.amount) - c.balance`, stays in `NUMERIC`) and writes a
`customer_balance_reconciliation` row for any customer whose `|drift| >
CUSTOMER_BALANCE_DRIFT_THRESHOLD` (default $0.01, `:29,56`).

**decimal.js money handling** (`commandBus.ts:350-405`): `moneyScale` (2dp string),
`addMoney`/`subMoney`/`subMoneyMin0` (clamped) /`mulMoney` are the canonical helpers;
all balance accumulation uses them so partial allocations sum *exactly* to totals
(TER-1566). `qtyScale` is 3dp. Raw `SELECT *` rows expose snake_case columns, read by
bracket access to avoid silent `undefined→NaN` (commented throughout, e.g. `:3742`).

### B0.1 Money invariants (storage layer)
- `payment_allocations.amount > 0` — CHECK `payment_allocations_amount_positive`
  (migration `0057`, schema `:411`). Strictly enforced (validated immediately).
- `invoices.amount_paid >= 0 AND <= total`, `payments.unapplied_amount >= 0`,
  `batches` qty non-negativity, `purchase_order_lines` qty non-negativity — added
  `NOT VALID` in `0041_money_invariants.sql`, **dropped** in `0046` (seed math tripped
  the boundary on staging), **restored** `NOT VALID` in `0055`. NOT VALID = future
  writes checked, legacy rows grandfathered until a manual `VALIDATE`. So at runtime
  these four are enforced for new writes but not retroactively guaranteed.

### B1. Command reference (schema / role / logic / tables / journal / disposition)

| Command (line) | Min role | Tables written | Reversal disposition |
|---|---|---|---|
| `logPayment` (`:3649`) | operator | payments, customers, client_ledger_entries (+nested allocatePayment) | reversible |
| `allocatePayment` (`:3737`) | operator | payment_allocations, invoices, payments, customers, client_ledger_entries | reversible |
| `unallocatePayment` (`:3808`) | manager | payment_allocations(del), payments, invoices | terminal |
| `refundPayment` (`:3836`) | manager | payments, customers, client_ledger_entries | terminal |
| `applyEarlyPayDiscount` (`:3913`) | manager | invoices | offsettable |
| `postTransactionLedgerRow` (`:4374`) | manager | contact_ledger_entries OR (delegates to logPayment/recordVendorPayment/correction) | offsettable |
| `upsertTransactionType` (`:4583`) | manager | transaction_types (slug upsert) | terminal |
| `createVendorBill` (`:3937`) | operator | vendor_bills | reversible |
| `approveVendorBill` (`:3950`) | manager | vendor_bills(status) | offsettable |
| `scheduleVendorPayment` (`:3956`) | manager | vendor_bills(status,scheduledFor) | offsettable |
| `recordVendorPayment` (`:3963`) | manager | vendor_payments, vendor_bills | reversible |
| `voidVendorPayment` (`:3994`) | manager | vendor_payments(status), vendor_bills | terminal |
| `createCorrectionJournalEntry` (`:4342`) | manager | correction_journal_entries, (invoice_disputes) | reversible |
| `reverseCommandById` (`:4666`) | manager | many (compensating), command_journal | terminal |
| `documentCommandFailure` (`:5089`) | manager | command_journal(reason) | terminal |
| `restoreFromBackupPoint` (`:5112`) | owner | none (read-only) | terminal |
| `postPeriodAdjustments` (`:5125`) | owner | correction_journal_entries | reversible |
| `lockPeriod` (`:5144`) | owner | period_locks | terminal |
| `archivePeriod` (`:5161`) | owner | archive_runs, batches/sales_orders(archivedAt), files | terminal |

Validation helpers: `requiredNumber` (finite, `:7243`), `periodValue` (`/^\d{4}-\d{2}$/`,
`:7366`), `requiredId`/`requiredString`/`stringValue`/`dateOrNull` (`:7360`).

### B2. Reversal mechanics — `reverseCommandById` branches (`commandBus.ts:4683-5077`)
Compensation reads `afterSnapshot` (the "snapshot" var) for forward-created rows and
`beforeSnapshot` for prior-value restores:
- `postSalesOrder` (`:4683`): restores batch `availableQty`, marks invoices
  `reversed` (refuses if `amountPaid>0` — must unallocate first, `:4694`), reverses
  customer balance with a `sale_reversal` ledger entry, marks orders + COGS correction
  entries `reversed`.
- `logPayment` (`:4791`): requires the payment fully unallocated (`:4795`); marks
  `reversed`; buyer-credit (`amount<0`) restores balance with a `payment_reversal`
  ledger row.
- `allocatePayment` (`:4816`): deletes allocations, restores
  payment.unapplied/invoice.amount_paid via `addMoney`/`subMoneyMin0`, restores
  customer balance with an `allocation_reversal` ledger row.
- `postTransactionLedgerRow` (`:4844`): the broadest branch — unwinds payment
  allocations, buyer-credit balance, voids derived vendor payments (restoring
  `vendor_bills` from `beforeSnapshot`), and marks correction entries `reversed`.
- `createVendorBill` (`:4927`) → bills `reversed`; `recordVendorPayment` (`:4932`) →
  payment `void` + bill `amountPaid` restored via `subMoneyMin0`, status back to
  `scheduled`/`approved`.
- `createCorrectionJournalEntry`/`postPeriodAdjustments` (`:5004`) → entries `reversed`.
- Inventory/PO/pricing/credit branches also handled; unhandled names throw the policy
  guidance (`:5075`).

Reversal links are FK-enforced: `command_journal.reversed_by_command_id` →
`command_journal(id) ON DELETE SET NULL` (migration `0061`, schema `:701`).

### B3. Journal & projection writes; document snapshots & receipts
- **Command journal** row written/finalized in `executeCommand` (`:490`,`:614`);
  JSONL mirror via `appendJsonlJournal` (`journal.ts:5`).
- **Document snapshots** (`document_snapshots`, schema `:711`) via post-commit hooks
  using the `pool` (not the tx) so a snapshot failure can never roll back money.
  `paymentReceivedReceipts.ts` and `vendorPayoutReceipts.ts` build external+internal
  projections (`projections/paymentReceived.ts`, `projections/vendorPayout.ts` — both
  `projectionVersion=1`, empty `lines`, `totals={subtotal,total}=amount`,
  internal adds `internalNotes`). `invoiceReceipts.ts` builds full invoice receipts
  on `postSalesOrder`.
- **Snapshot lifecycle** (`documentSnapshots.ts`): `createDraftSnapshot` →
  `finalizeSnapshot`, which holds a single PoolClient txn, takes a
  `pg_advisory_xact_lock` keyed on `entityType:entityId:audience` to serialize
  first-finalize, enforces a single live head per (entity, audience) via
  supersession (not voiding the predecessor), and a partial unique index on
  `(entity, audience, content_hash)`. Content hash = sha256 of canonical JSON
  (`hashSnapshot`, `:32`).
- **Receipt read procs**: `paymentExternalReceipt`/`paymentInternalReceipt`/
  `paymentSignalText`/`paymentPrintHtml` (`queries.ts:1545-1624`) and the
  `vendorPayment*` equivalents (`:1562-1637`) read the live finalized snapshot;
  internal variants are role-gated via `getInternalReceipt`.

### B4. Period-lock enforcement, socket events, failure modes
- **Period lock**: `assertPeriodUnlocked` blocks correction/adjustment writes into a
  locked period (`:7375`); `lockPeriod`/`archivePeriod` serialize on a per-period
  advisory lock and re-validate closeout safety to defeat TOCTOU races.
- **Socket events** (`commandBus.ts` post-commit): `command:completed` and
  `command:failed` emitted to the `authenticated` room only (GH #329), toast stripped
  from `completed` broadcasts (peers get only `affectedIds` for cache invalidation).
  Pick/sales events are non-money. All emits are wrapped in try/catch.
- **Failure modes**: zero amounts rejected (`logPayment:3653`,
  `postTransactionLedgerRow:4379`); over-allocation/over-payment rejected
  (`recordVendorPayment:3981`, `applyEarlyPayDiscount:3928`); refund/reversal of
  allocated payments rejected (`:3856`,`:4694`,`:4795`); unique idempotency-key reuse
  with a different payload/command throws a safe 409-style message
  (`:527-538`); DB errors are scrubbed before reaching the client (`:769`).

### B5. Full column docs (every money table)

**`customers`** (`schema.ts:77`) — `id`, `name`, `creditLimit numeric(12,2)`,
`balance numeric(12,2)` (denormalized AR balance; reconciled nightly), `tags[]`,
`pricingRule jsonb`, `notes`, `engineMax`, `stanceId`→stances, `creditLimitSource`,
`engineEnabled/DisabledAt/By/Reason`, `lastAssessmentId`,
`creditLimitManualSetAt/By/Reason`, `creditLimitReminderDays`,
`creditLimitLastReviewedAt`, `creditLimitSnoozeCount`, `contactId`→contacts,
`createdAt`,`updatedAt`.

**`invoices`** (`:372`) — `id`, `invoiceNo unique`, `customerId`→customers (SET NULL),
`orderId`→sales_orders (SET NULL), `status` (open/partial/paid/reversed),
`total numeric(12,2)`, `amountPaid numeric(12,2) default 0`, `dueDate`,
`createdAt`,`updatedAt`. CHECK (NOT VALID): `amount_paid>=0 AND <=total`.

**`payments`** (`:385`) — `id`, `customerId`→customers (SET NULL), `method`,
`amount numeric(12,2)`, `unappliedAmount numeric(12,2) default 0`, `reference`,
`locationBucket`, `notes`, `direction` (money_in/buyer_credit),
`category` (client_payment/buyer_credit/…), `allocationIntent`
(fifo/selected_invoice/unapplied), `impactPreview`, `status`
(posted/refunded/reversed), `createdAt`,`updatedAt`. CHECK (NOT VALID):
`unapplied_amount>=0`.

**`payment_allocations`** (`:403`) — `id`, `paymentId`→payments (CASCADE),
`invoiceId`→invoices (CASCADE), `amount numeric(12,2)`, `createdAt`. CHECK:
`amount > 0` (migration 0057, enforced).

**`invoice_disputes`** (`:592`) — `id`, `invoiceId`→invoices (CASCADE), `status`
(open/…), `reason notnull`, `resolution`, `createdAt`,`updatedAt`.

**`client_ledger_entries`** (`:602`) — `id`, `customerId`→customers (CASCADE),
`invoiceId`→invoices (SET NULL), `paymentId`→payments (SET NULL), `kind`
(down_payment / payment_allocation / payment_refund / sale_reversal /
payment_reversal / allocation_reversal), `amount numeric(12,2)` (signed),
`balanceAfter numeric(12,2)`, `note`, `createdAt`. Append-only.

**`contact_ledger_entries`** (`:1251`) — `id`, `contactId`→contacts (CASCADE),
`kind` (payment_out/adjustment/…), `amount numeric(12,2)` signed
(negative = we paid them), `method`, `reference`, `note`, `commandId`, `createdAt`.
Running balance computed at read time (window function). Append-only.

**`vendor_bills`** (`:414`) — `id`, `vendorId`→vendors (SET NULL),
`purchaseReceiptId`→purchase_receipts (SET NULL), `purchaseOrderId`→purchase_orders
(SET NULL; migration 0006), `billNo unique`, `amount numeric(12,2)`,
`amountPaid numeric(12,2) default 0`, `dueDate`, `status`
(open/approved/scheduled/partial/paid/reversed), `scheduledFor`,
`termsDays default 14`, `consignmentTriggered`, `dueReason`, `discrepancyNotes`,
`createdAt`,`updatedAt`.

**`vendor_payments`** (`:433`) — `id`, `vendorBillId`→vendor_bills (CASCADE),
`purchaseOrderId`→purchase_orders, `amount numeric(12,2)`, `method default cash`,
`reference`, `status` (posted/void), `createdAt`.

**`transaction_types`** (`:659`) — `id`, `slug` (unique idx), `label`, `direction`
(receiving/paying), `allowedEntityTypes text[]`, `defaultMethod`, `defaultBucket`,
`defaultAllocationIntent`, `requiresApproval`, `isSystem`, `isActive`,
`createdAt`,`updatedAt`. Seeded with 9 system types in migration 0006.

**`command_journal`** (`:683`) — `id`, `commandName`, `idempotencyKey` (unique idx),
`actorId`→users (SET NULL), `actorName`, `actorRole`, `reason`, `inputPayload jsonb`,
`status` (pending/ok/failed), `affectedIds text[]`, `beforeSnapshot jsonb`,
`afterSnapshot jsonb`, `result jsonb`, `error` (raw, server-only),
`reversedByCommandId`→self (SET NULL; migration 0061), `createdAt`. Indexes on
command name + actor.

**`correction_journal_entries`** (`:614`) — `id`, `period varchar(7)`,
`amount numeric(12,2)` (signed), `memo notnull`, `status` (posted/reversed),
`createdAt`.

**`period_locks`** (`:623`) — `id`, `period varchar(7) unique`, `status default
locked`, `lockedBy`→users (SET NULL), `lockedAt`.

**`archive_runs`** (`:631`) — `id`, `period`, `status default archived`,
`controlTotals jsonb`, `csvPath`, `jsonlPath`, `pdfPath`, `createdAt`.

**`backup_snapshots`** (`:652`) — `id`, `label`, `snapshot jsonb`, `createdAt`.
Read-only restore preview source.

**`customer_balance_reconciliation`** (`:1179`, migration 0045) — `id`,
`runId` (groups one nightly run), `customerId`→customers, `expected numeric(14,2)`
(SUM of ledger), `actual numeric(14,2)` (denorm balance), `drift numeric(14,2)`
(expected−actual), `detectedAt default now`. Wider precision than balance to avoid
overflow on runaway drift.

**`system_settings`** (`:364`) — `id`, `key varchar(80) unique`, `value jsonb`,
`createdAt`,`updatedAt`. Used by `setDefaultPricingRule` (`pricing.defaults` key);
reversal restores/deletes the prior value (`commandBus.ts:4972`).

**`document_snapshots`** (`:711`) — `id`, `kind`, `sourceEntityType`,
`sourceEntityId`, `commandId`→command_journal, `status` (draft/finalized),
`audience` (external/internal), `snapshotJson jsonb`, `projectionVersion`,
`contentHash`, `supersedesId`→self, `createdBy/finalizedBy/voidedBy`→users,
`createdAt/finalizedAt/voidedAt`. The receipt store for payment_received,
vendor_payout, and invoice receipts.

---

## DELIVERABLE SUMMARY

TERP Operator's money domain is a CQRS command-bus system where every AR/AP mutation
flows through `executeCommand` (atomic idempotency claim → transactional handler →
before/after snapshot → `command_journal` row → JSONL + socket + document-receipt
side effects), with all cents-precision math in `decimal.js`. Accounts Receivable
(`logPayment`/`allocatePayment` FIFO/selected with auto-allocation, `unallocatePayment`,
`refundPayment`, `applyEarlyPayDiscount`) and Accounts Payable
(`createVendorBill`→`approveVendorBill`→`scheduleVendorPayment`→`recordVendorPayment`,
`voidVendorPayment`) both write authoritative running totals plus append-only
`client_ledger_entries`/`contact_ledger_entries` audit rows; `customers.balance` is a
denormalized AR projection reconciled nightly against the ledger by a cron, since the
balance invariant is not DB-enforced (only the `payment_allocations.amount>0` CHECK is
fully validated; the 0041/0046/0055 invariants are NOT VALID). The unified Quick Ledger
(`postTransactionLedgerRow`) routes by entity×direction into payments, vendor bills,
contact ledger, or correction journal. Closeout (owner-only `lockPeriod`/
`postPeriodAdjustments`/`archivePeriod`, advisory-locked, blocker-gated) and Recovery
(`reverseCommandById` compensating-snapshot replay, `createCorrectionJournalEntry`,
read-only `restoreFromBackupPoint`, `documentCommandFailure`, plus `recoverySearch`/
`supportPacket`/`snapshotDiff`/`reversalPreview`) complete the audit/safety layer.

### Documented commands
- [x] `logPayment` · `allocatePayment` · `unallocatePayment` · `refundPayment` · `applyEarlyPayDiscount`
- [x] `postTransactionLedgerRow` · `upsertTransactionType`
- [x] `createVendorBill` · `approveVendorBill` · `scheduleVendorPayment` · `recordVendorPayment` · `voidVendorPayment`
- [x] `createCorrectionJournalEntry` · `reverseCommandById` · `documentCommandFailure` · `restoreFromBackupPoint`
- [x] `postPeriodAdjustments` · `lockPeriod` · `archivePeriod`
- [x] (related) `recordVendorPrepayment`

### Documented tables
- [x] `customers` · `invoices` · `payments` · `payment_allocations` · `invoice_disputes`
- [x] `client_ledger_entries` · `contact_ledger_entries` · `correction_journal_entries`
- [x] `vendor_bills` · `vendor_payments` · `transaction_types`
- [x] `command_journal` · `document_snapshots`
- [x] `period_locks` · `archive_runs` · `backup_snapshots`
- [x] `customer_balance_reconciliation` · `system_settings`

### Documented query procs
- [x] `transactionLedger` · `paymentAllocations` · `paymentAllocationPreview`
- [x] `payment{External,Internal}Receipt` · `paymentPrintHtml` · `paymentSignalText`
- [x] `vendorPayments` · `vendorPayment{External,Internal}Receipt` · `vendorPaymentPrintHtml` · `vendorPaymentSignalText`
- [x] `contactLedger` · `closeoutPreview` · `closeoutBlockerRows`
- [x] `reversalPreview` · `recoverySearch` · `supportPacket` · `snapshotDiff`
- [x] `commandJournal` · `relatedCommands` · `customerSheetSnapshotById`

### Documented components
- [x] `QuickLedgerGrid.tsx` · `RecordPrepaymentDialog.tsx`
- [x] `drawerTabs/VendorBillDetailsTab.tsx` · `VendorBillTraceTab.tsx` · `VendorPaymentHistoryTab.tsx`
- [x] `drawerTabs/CommandReversalTab.tsx`
- [x] `views/OperationsViews.tsx` (payments / closeout / recovery panels) · `mobile/MobilePaymentsView.tsx`

### Documented services / migrations
- [x] `journal.ts` · `closeout.ts` · `balanceReconciliation.ts` · `metrics.ts`
- [x] `invoiceReceipts.ts` · `paymentReceivedReceipts.ts` · `vendorPayoutReceipts.ts` · `documentSnapshots.ts`
- [x] `projections/{invoice,paymentReceived,vendorPayout}.ts`
- [x] `scripts/customer-balance-reconciliation-cron.ts`
- [x] migrations `0006`, `0041`/`0046`/`0055`/`0057`, `0045`, `0061`
