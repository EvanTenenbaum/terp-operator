/**
 * statuses.ts — canonical status enumerations for TERP Operator.
 *
 * This is the single source of truth for every lifecycle status that an
 * operator-facing entity can be in. Command-bus state transitions,
 * Zod validation, view filtering, and reducer guards must all import
 * their status enums from this file rather than re-declaring inline.
 *
 * Discovery method (do not invent statuses):
 *   1. `src/server/schema.ts`             — declared status columns & defaults.
 *   2. `src/server/services/commandBus.ts` — actual `set({ status: '...' })`
 *      sites and reversal/correction code paths.
 *   3. `src/shared/schemas.ts`            — payload schemas (intake-side
 *      validation) for entry-point validation.
 *
 * When schema-default and command-bus transitions disagree, BOTH values are
 * included (the command bus is the runtime source of truth; the schema
 * default seeds the entry value).
 *
 * Each enum exports as both a Zod schema (runtime parse) and an inferred
 * TypeScript type via TS value/type namespace merging (idiomatic in this
 * codebase — see `src/shared/schemas.ts`).
 */

import { z } from 'zod';

// ─────────────────────────────────────────────────────────────────────────────
// PurchaseOrder (purchase_orders)
// Default: 'draft' (schema.ts:187)
//   draft               — initial entry, editable, not yet committed.
//   finalized           — buyer-locked; ready to be approved/ordered.
//   approved            — vendor-ordered (orderedAt set); lines move to planned.
//   partially_received  — at least one line received but not all.
//   received            — every line fully received.
//   cancelled           — order voided; referee credits voided.
//   reversed            — command-bus reversal (restoreFromBackupPoint /
//                         reverseCommandById); inventory rolled back.
// ─────────────────────────────────────────────────────────────────────────────
export const PurchaseOrderStatus = z.enum([
  'draft',
  'finalized',
  'approved',
  'partially_received',
  'received',
  'cancelled',
  'reversed'
]);
export type PurchaseOrderStatus = z.infer<typeof PurchaseOrderStatus>;

// ─────────────────────────────────────────────────────────────────────────────
// PurchaseOrderLine (purchase_order_lines)
// Default: 'planned' (schema.ts:235)
//   planned             — line exists, awaiting receipt against it.
//   partially_received  — some quantity received against the line.
//   cancelled           — line/PO cancelled.
// (Schema default is 'planned' but line is created at 'draft' for in-draft
//  POs in some code paths — see entry default in commandBus addPOLine paths.)
// ─────────────────────────────────────────────────────────────────────────────
export const PurchaseOrderLineStatus = z.enum([
  'draft',
  'planned',
  'partially_received',
  'cancelled'
]);
export type PurchaseOrderLineStatus = z.infer<typeof PurchaseOrderLineStatus>;

// ─────────────────────────────────────────────────────────────────────────────
// SalesOrder (sales_orders)
// Default: 'draft' (schema.ts:342)
//   draft       — initial entry, lines being added/edited.
//   confirmed   — operator-confirmed; pricing & customer locked.
//   posted      — financially posted; inventory committed; invoice issued.
//   fulfilled   — packed & shipped (pickList.fulfilled + packed=true).
//   cancelled   — order voided; reservations released.
//   reversed    — command-bus reversal (restore/reverse pathway).
// ─────────────────────────────────────────────────────────────────────────────
export const SalesOrderStatus = z.enum([
  'draft',
  'confirmed',
  'posted',
  'fulfilled',
  'cancelled',
  'reversed'
]);
export type SalesOrderStatus = z.infer<typeof SalesOrderStatus>;

// ─────────────────────────────────────────────────────────────────────────────
// SalesOrderLine (sales_order_lines)
// Default: 'draft' (schema.ts:388)
//   draft       — line added to a draft order, editable.
//   reserved    — inventory soft-reserved against the batch.
//   posted      — inventory posted (inventoryPosted=true).
//   reversed    — command-bus reversal.
// Intake-validation schema (shared/schemas.ts:94) also accepts 'confirmed',
// 'fulfilled', 'cancelled', 'needs_fix' on the salesOrderPayloadSchema —
// those values are observed in legacy intake but are NOT runtime line-state
// writes; the runtime state machine for lines uses the four values above.
// ─────────────────────────────────────────────────────────────────────────────
export const SalesOrderLineStatus = z.enum([
  'draft',
  'reserved',
  'posted',
  'reversed'
]);
export type SalesOrderLineStatus = z.infer<typeof SalesOrderLineStatus>;

// ─────────────────────────────────────────────────────────────────────────────
// PurchaseReceipt (purchase_receipts)
// Default: 'posted' (schema.ts:321)
//   posted   — receipt recorded; batches written to inventory.
//   reversed — command-bus reversal.
// ─────────────────────────────────────────────────────────────────────────────
export const PurchaseReceiptStatus = z.enum(['posted', 'reversed']);
export type PurchaseReceiptStatus = z.infer<typeof PurchaseReceiptStatus>;

// ─────────────────────────────────────────────────────────────────────────────
// Batch (batches) — the canonical "lot"/inventory unit in TERP Operator.
// (There is no separate `lots` table; lotCode is a column on batches. This
//  enum is the closest analogue to "Lot" status.)
// Default: 'draft' (schema.ts:286)
//
// Intake lifecycle (pre-posting):
//   draft        — created via intake or POReceipt, awaiting validation.
//   ready        — intake-validation cleared; ready to post.
//   needs_fix    — validation flagged the row; operator must resolve.
// Posted lifecycle (post-receipt; setInventoryStatus drives transitions):
//   posted       — live inventory available to sell.
//   held         — operator-paused; not sellable.
//   damaged      — written off the sellable pool.
//   returned     — vendor-returned OR rejected after intake.
//   in_transit   — moving between locations.
// Terminal/correction:
//   reversed     — command-bus reversal; availableQty zeroed.
// ─────────────────────────────────────────────────────────────────────────────
export const BatchStatus = z.enum([
  'draft',
  'ready',
  'needs_fix',
  'posted',
  'held',
  'damaged',
  'returned',
  'in_transit',
  'reversed'
]);
export type BatchStatus = z.infer<typeof BatchStatus>;

// ─────────────────────────────────────────────────────────────────────────────
// Invoice (invoices)
// Default: 'open' (schema.ts:412)
//   open     — issued; amountPaid < total.
//   paid     — fully allocated.
//   reversed — command-bus reversal.
// ─────────────────────────────────────────────────────────────────────────────
export const InvoiceStatus = z.enum(['open', 'paid', 'reversed']);
export type InvoiceStatus = z.infer<typeof InvoiceStatus>;

// ─────────────────────────────────────────────────────────────────────────────
// Payment (payments) — client-side payments.
// Default: 'posted' (schema.ts:435)
//   posted   — recorded; allocations may exist against open invoices.
//   refunded — fully refunded.
//   reversed — command-bus reversal.
// ─────────────────────────────────────────────────────────────────────────────
export const PaymentStatus = z.enum(['posted', 'refunded', 'reversed']);
export type PaymentStatus = z.infer<typeof PaymentStatus>;

// ─────────────────────────────────────────────────────────────────────────────
// VendorBill (vendor_bills)
// Default: 'open' (schema.ts:466)
//   open       — bill created from receipt, awaiting approval.
//   approved   — operator-approved as payable.
//   scheduled  — payment event/appointment scheduled.
//   partial    — partially paid (amountPaid > 0, < amount).
//   paid       — fully paid.
//   void       — voided.
//   reversed   — command-bus reversal.
// ─────────────────────────────────────────────────────────────────────────────
export const VendorBillStatus = z.enum([
  'open',
  'approved',
  'scheduled',
  'partial',
  'paid',
  'void',
  'reversed'
]);
export type VendorBillStatus = z.infer<typeof VendorBillStatus>;

// ─────────────────────────────────────────────────────────────────────────────
// VendorPayment (vendor_payments)
// Default: 'posted' (schema.ts:483)
//   posted — payment recorded against vendor bill.
//   void   — voided.
// ─────────────────────────────────────────────────────────────────────────────
export const VendorPaymentStatus = z.enum(['posted', 'void']);
export type VendorPaymentStatus = z.infer<typeof VendorPaymentStatus>;

// ─────────────────────────────────────────────────────────────────────────────
// PickList (pick_lists)
// Default: 'open' (schema.ts:491)
//   open      — created/assigned; warehouse working it.
//   fulfilled — order packed & marked fulfilled.
// ─────────────────────────────────────────────────────────────────────────────
export const PickListStatus = z.enum(['open', 'fulfilled']);
export type PickListStatus = z.infer<typeof PickListStatus>;

// ─────────────────────────────────────────────────────────────────────────────
// FulfillmentLine (fulfillment_lines)
// Default: 'open' (schema.ts:511)
//   open   — line awaiting weigh & pack.
//   packed — recordWeighAndPack written.
// (Cancellation is recorded on `status_extended`, not `status`.)
// ─────────────────────────────────────────────────────────────────────────────
export const FulfillmentLineStatus = z.enum(['open', 'packed']);
export type FulfillmentLineStatus = z.infer<typeof FulfillmentLineStatus>;

// ─────────────────────────────────────────────────────────────────────────────
// ConnectorRequest (connector_requests)
// Default: 'open' (schema.ts:524)
//   open     — inbound external request, awaiting operator review.
//   approved — operator approved (may carry routedTo).
//   rejected — operator rejected.
//   routed   — operator routed to a downstream destination.
// ─────────────────────────────────────────────────────────────────────────────
export const ConnectorRequestStatus = z.enum([
  'open',
  'approved',
  'rejected',
  'routed'
]);
export type ConnectorRequestStatus = z.infer<typeof ConnectorRequestStatus>;

// ─────────────────────────────────────────────────────────────────────────────
// CustomerNeed (customer_needs)
// Default: 'open' (schema.ts:550)
//   open    — active demand row, eligible for matchmaking.
//   matched — paired with a vendor supply via matchmaking accept.
// ─────────────────────────────────────────────────────────────────────────────
export const CustomerNeedStatus = z.enum(['open', 'matched']);
export type CustomerNeedStatus = z.infer<typeof CustomerNeedStatus>;

// ─────────────────────────────────────────────────────────────────────────────
// VendorSupply (vendor_supply)
// Default: 'open' (schema.ts:579)
//   open            — vendor offer row, eligible for matchmaking.
//   held_for_match  — paired with a customer need via matchmaking accept.
// ─────────────────────────────────────────────────────────────────────────────
export const VendorSupplyStatus = z.enum(['open', 'held_for_match']);
export type VendorSupplyStatus = z.infer<typeof VendorSupplyStatus>;

// ─────────────────────────────────────────────────────────────────────────────
// MatchmakingMatch (matchmaking_matches)
// Default: 'open' (schema.ts:599)
//   open      — engine-suggested pair, awaiting review.
//   accepted  — operator accepted; underlying need/supply become matched/held.
//   dismissed — operator dismissed.
// ─────────────────────────────────────────────────────────────────────────────
export const MatchmakingMatchStatus = z.enum(['open', 'accepted', 'dismissed']);
export type MatchmakingMatchStatus = z.infer<typeof MatchmakingMatchStatus>;

// ─────────────────────────────────────────────────────────────────────────────
// CreditOverride (credit_overrides)
// Default: 'pending' (schema.ts:631)
//   pending — override request recorded; awaiting decision flow.
// ─────────────────────────────────────────────────────────────────────────────
export const CreditOverrideStatus = z.enum(['pending']);
export type CreditOverrideStatus = z.infer<typeof CreditOverrideStatus>;

// ─────────────────────────────────────────────────────────────────────────────
// InvoiceDispute (invoice_disputes)
// Default: 'open' (schema.ts:640)
//   open     — dispute filed; invoice excluded from debtAging.
//   resolved — operator marked resolved.
//   rejected — operator rejected.
// ─────────────────────────────────────────────────────────────────────────────
export const InvoiceDisputeStatus = z.enum(['open', 'resolved', 'rejected']);
export type InvoiceDisputeStatus = z.infer<typeof InvoiceDisputeStatus>;

// ─────────────────────────────────────────────────────────────────────────────
// CorrectionJournalEntry (correction_journal_entries)
// Default: 'posted' (schema.ts:664)
//   posted   — correction recorded.
//   reversed — command-bus reversal.
// ─────────────────────────────────────────────────────────────────────────────
export const CorrectionJournalEntryStatus = z.enum(['posted', 'reversed']);
export type CorrectionJournalEntryStatus = z.infer<typeof CorrectionJournalEntryStatus>;

// ─────────────────────────────────────────────────────────────────────────────
// PeriodLock (period_locks)
// Default: 'locked' (schema.ts:671)
//   locked — period closed; writes against the period blocked.
// ─────────────────────────────────────────────────────────────────────────────
export const PeriodLockStatus = z.enum(['locked']);
export type PeriodLockStatus = z.infer<typeof PeriodLockStatus>;

// ─────────────────────────────────────────────────────────────────────────────
// ArchiveRun (archive_runs)
// Default: 'archived' (schema.ts:679)
//   archived — closeout archive successfully written.
// ─────────────────────────────────────────────────────────────────────────────
export const ArchiveRunStatus = z.enum(['archived']);
export type ArchiveRunStatus = z.infer<typeof ArchiveRunStatus>;

// ─────────────────────────────────────────────────────────────────────────────
// PhotographyQueue (photography_queue)
// Default: 'open' (schema.ts:690)
//   open — batch queued for photography.
//   done — photography completed (auto-set on attach/upload).
// ─────────────────────────────────────────────────────────────────────────────
export const PhotographyQueueStatus = z.enum(['open', 'done']);
export type PhotographyQueueStatus = z.infer<typeof PhotographyQueueStatus>;

// ─────────────────────────────────────────────────────────────────────────────
// CommandJournal (command_journal) — internal command-bus audit row.
// No schema default (schema.ts:739). Observed values:
//   pending — write reserved; outcome not yet recorded.
//   failed  — command threw / validation rejected.
// (Successful commands are recorded with their result and not a status flag;
//  callers reading this should also check `error` and `result`.)
// ─────────────────────────────────────────────────────────────────────────────
export const CommandJournalStatus = z.enum(['pending', 'failed']);
export type CommandJournalStatus = z.infer<typeof CommandJournalStatus>;

// ─────────────────────────────────────────────────────────────────────────────
// DocumentSnapshot (document_snapshots)
// Values mirror `src/shared/documentSnapshots.ts` `documentStatuses`:
//   draft      — projection generated; not yet finalized.
//   finalized  — operator/system locked the snapshot.
//   superseded — replaced by a newer snapshot via supersedesId.
//   void       — voided.
// ─────────────────────────────────────────────────────────────────────────────
export const DocumentSnapshotStatus = z.enum([
  'draft',
  'finalized',
  'superseded',
  'void'
]);
export type DocumentSnapshotStatus = z.infer<typeof DocumentSnapshotStatus>;

// ─────────────────────────────────────────────────────────────────────────────
// RefereeCredit (referee_credits)
// Default: 'accrued' (schema.ts:864)
//   accrued — credit owed but not yet paid out.
//   paid    — paid via a vendor/operator payout transaction.
//   voided  — voided (e.g., PO cancelled).
// ─────────────────────────────────────────────────────────────────────────────
export const RefereeCreditStatus = z.enum(['accrued', 'paid', 'voided']);
export type RefereeCreditStatus = z.infer<typeof RefereeCreditStatus>;

// ─────────────────────────────────────────────────────────────────────────────
// BatchMedia (batch_media)
// Default: 'draft' (schema.ts:959)
//   draft     — uploaded; not yet promoted to customer-facing.
//   published — visible to customer-safe surfaces.
// ─────────────────────────────────────────────────────────────────────────────
export const BatchMediaStatus = z.enum(['draft', 'published']);
export type BatchMediaStatus = z.infer<typeof BatchMediaStatus>;

// ─────────────────────────────────────────────────────────────────────────────
// Item (items) — product catalog row.
// Default: 'active' (schema.ts:172)
//   active   — sellable / orderable.
//   inactive — soft-deactivated via toggleItemStatus.
// ─────────────────────────────────────────────────────────────────────────────
export const ItemStatus = z.enum(['active', 'inactive']);
export type ItemStatus = z.infer<typeof ItemStatus>;

// ─────────────────────────────────────────────────────────────────────────────
// Appointment (appointments)
// Default: 'scheduled' (schema.ts:1345)
//   scheduled — appointment booked.
//   completed — appointment occurred.
//   cancelled — appointment cancelled.
// ─────────────────────────────────────────────────────────────────────────────
export const AppointmentStatus = z.enum([
  'scheduled',
  'completed',
  'cancelled'
]);
export type AppointmentStatus = z.infer<typeof AppointmentStatus>;

// ─────────────────────────────────────────────────────────────────────────────
// CreditRecomputeQueue (credit_recompute_queue) — internal queue row.
// Default: 'pending' (schema.ts:1232)
//   pending — awaiting worker pickup.
// ─────────────────────────────────────────────────────────────────────────────
export const CreditRecomputeQueueStatus = z.enum(['pending']);
export type CreditRecomputeQueueStatus = z.infer<typeof CreditRecomputeQueueStatus>;

// ─────────────────────────────────────────────────────────────────────────────
// Convenience union — any status value from any entity in this file.
// Useful for generic status-formatting helpers; for state-machine guards
// always use the specific per-entity enum so the type system blocks
// cross-entity assignment.
// ─────────────────────────────────────────────────────────────────────────────
export type EntityStatus =
  | PurchaseOrderStatus
  | PurchaseOrderLineStatus
  | SalesOrderStatus
  | SalesOrderLineStatus
  | PurchaseReceiptStatus
  | BatchStatus
  | InvoiceStatus
  | PaymentStatus
  | VendorBillStatus
  | VendorPaymentStatus
  | PickListStatus
  | FulfillmentLineStatus
  | ConnectorRequestStatus
  | CustomerNeedStatus
  | VendorSupplyStatus
  | MatchmakingMatchStatus
  | CreditOverrideStatus
  | InvoiceDisputeStatus
  | CorrectionJournalEntryStatus
  | PeriodLockStatus
  | ArchiveRunStatus
  | PhotographyQueueStatus
  | CommandJournalStatus
  | DocumentSnapshotStatus
  | RefereeCreditStatus
  | BatchMediaStatus
  | ItemStatus
  | AppointmentStatus
  | CreditRecomputeQueueStatus;
