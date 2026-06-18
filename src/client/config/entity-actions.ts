/**
 * State Machine Registry — Available actions per entity state.
 *
 * Purpose: Every entity with a lifecycle has a state machine here. The UI calls
 * `getAllowedActions({ entity, status, role? })` and renders only the result.
 * Buttons for invalid states are ABSENT, not disabled — ARCH-2.
 *
 * ARCH-1: Actions follow entity state. Buttons for invalid states are absent.
 * UX-1: State-gated actions. No per-view StatusActionTable.
 *
 * Server alignment: Every command guard in commandBus.ts must reject actions
 * the state machine forbids (ARCH-2 contract).
 */

import type { Role } from '../../shared/types';
import {
  PurchaseOrderStatus,
  SalesOrderStatus,
  PaymentStatus,
  InvoiceStatus,
  VendorBillStatus,
  PurchaseReceiptStatus,
  VendorPaymentStatus,
  BatchStatus,
  FulfillmentLineStatus,
  ConnectorRequestStatus,
  PickListStatus,
} from '../../shared/statuses';

// ─── Architecture Compliance Checklist ──────────────────────────────────────
// [ ] No per-view ColDef arrays — all definitions originate here
// [ ] No inline cell renderers — use stable components
// [ ] No per-view StatusActionTable — state machine governs visibility
// [ ] No direct db queries — all data through tRPC
// [ ] No new Zustand stores — useUiStore only
// ─────────────────────────────────────────────────────────────────────────────

// ─── Action type ────────────────────────────────────────────────────────────

export interface EntityAction {
  /** Unique action identifier — matches command name in `commandCatalog.ts`. */
  id: string;
  /** Human-readable button label. */
  label: string;
  /** Lucide icon name (the string after the import, e.g. 'Plus' for Plus icon). */
  icon?: string;
  /** tRPC command route. Typically `commands.run` with command name. */
  commandRoute: string;
  /** If true, operator must confirm before execution (useConfirm gate). */
  confirmationRequired?: boolean;
  /** If set, opens a SlideOver component instead of executing a command. */
  slidesOver?: string;
  /** Minimum role required. Absent = all roles with write access. */
  minRole?: Role;
}

// ─── State machine type ─────────────────────────────────────────────────────

/**
 * Maps entity status → allowed actions.
 * Status values must come from the canonical enums in `src/shared/statuses.ts`
 * (use computed `[XStatus.enum.foo]:` keys so a typo/renamed value is caught
 * at type-check time rather than producing a silently unreachable state).
 * Actions listed here are the EXCLUSIVE set — no fallback, no catch-all.
 */
export type StateMachine = Record<string, EntityAction[]>;

export interface EntityActionConfig {
  entity: string;
  label: string;
  /** Status → allowed actions map. */
  states: StateMachine;
}

// ─── PurchaseOrder state machine (worked example) ───────────────────────────
//
// Status flow (canonical enum: src/shared/statuses.ts → PurchaseOrderStatus):
//   draft → finalized → approved → partially_received → received
//   any → cancelled (terminal)
//   reversed (terminal — command-bus reversal)
//
// The 'ordered' and 'posted' keys below are documentation-only placeholders:
// runtime POs never carry those statuses (commandBus.ts sets 'approved' when
// orderedAt is recorded; posting acts on batches, not the PO row). They remain
// for the time being to preserve UI intent until the Sales/Intake state
// machines are fleshed out and the PO flow is re-validated end-to-end. Do not
// add new keys outside `PurchaseOrderStatus.enum` without an explicit decision.
//
// Command names (from src/shared/commandCatalog.ts):
//   saveDraft       → createPurchaseOrder / updatePurchaseOrder
//   finalize        → finalizePurchaseOrder
//   approve         → approvePurchaseOrder
//   cancel          → cancelPurchaseOrder
//   draftIntake     → receivePurchaseOrder
//   recordPrepayment→ recordVendorPrepayment
//   post            → (via intake posting flow)
//   edit            → updatePurchaseOrder (draft only)

export const purchaseOrderActions: EntityActionConfig = {
  entity: 'purchaseOrder',
  label: 'Purchase Order',
  states: {
    // ══ draft ══════════════════════════════════════════════════════════════════
    [PurchaseOrderStatus.enum.draft]: [
      {
        id: 'updatePurchaseOrder',
        label: 'Save draft',
        icon: 'Save',
        commandRoute: 'commands.run',
        minRole: 'operator',
      },
      {
        id: 'finalizePurchaseOrder',
        label: 'Finalize',
        icon: 'Check',
        commandRoute: 'commands.run',
        confirmationRequired: true,
        minRole: 'operator',
      },
      {
        id: 'cancelPurchaseOrder',
        label: 'Cancel',
        icon: 'Trash2',
        commandRoute: 'commands.run',
        confirmationRequired: true,
        minRole: 'manager',
      },
    ],

    // ══ finalized ═════════════════════════════════════════════════════════════
    [PurchaseOrderStatus.enum.finalized]: [
      {
        id: 'approvePurchaseOrder',
        label: 'Approve',
        icon: 'ClipboardCheck',
        commandRoute: 'commands.run',
        confirmationRequired: true,
        minRole: 'manager',
      },
      {
        id: 'unfinalizePurchaseOrder',
        label: 'Unfinalize',
        icon: 'Undo2',
        commandRoute: 'commands.run',
        confirmationRequired: true,
        minRole: 'operator',
      },
      {
        id: 'cancelPurchaseOrder',
        label: 'Cancel',
        icon: 'Trash2',
        commandRoute: 'commands.run',
        confirmationRequired: true,
        minRole: 'manager',
      },
    ],

    // ══ approved ══════════════════════════════════════════════════════════════
    [PurchaseOrderStatus.enum.approved]: [
      {
        id: 'recordVendorPrepayment',
        label: 'Record prepay',
        icon: 'CreditCard',
        commandRoute: 'commands.run',
        slidesOver: 'RecordPrepaymentForm',
        minRole: 'manager',
      },
      {
        id: 'cancelPurchaseOrder',
        label: 'Cancel',
        icon: 'Trash2',
        commandRoute: 'commands.run',
        confirmationRequired: true,
        minRole: 'manager',
      },
    ],

    // ══ ordered (orphan — not in PurchaseOrderStatus enum; unreachable) ═══════
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    ['ordered']: [
      {
        id: 'receivePurchaseOrder',
        label: 'Draft intake',
        icon: 'PackagePlus',
        commandRoute: 'commands.run',
        slidesOver: 'ReceiveLinesForm',
        minRole: 'operator',
      },
      {
        id: 'recordVendorPrepayment',
        label: 'Record prepay',
        icon: 'CreditCard',
        commandRoute: 'commands.run',
        slidesOver: 'RecordPrepaymentForm',
        minRole: 'manager',
      },
      {
        id: 'cancelPurchaseOrder',
        label: 'Cancel',
        icon: 'Trash2',
        commandRoute: 'commands.run',
        confirmationRequired: true,
        minRole: 'manager',
      },
    ],

    // ══ partially_received ════════════════════════════════════════════════════
    [PurchaseOrderStatus.enum.partially_received]: [
      {
        id: 'receivePurchaseOrder',
        label: 'Receive more',
        icon: 'PackagePlus',
        commandRoute: 'commands.run',
        slidesOver: 'ReceiveLinesForm',
        minRole: 'operator',
      },
      {
        id: 'cancelPurchaseOrder',
        label: 'Cancel remainder',
        icon: 'Trash2',
        commandRoute: 'commands.run',
        confirmationRequired: true,
        minRole: 'manager',
      },
    ],

    // ══ received ══════════════════════════════════════════════════════════════
    // All items received. Post happens via Intake, not the PO actions.
    [PurchaseOrderStatus.enum.received]: [
      // Post happens via the intake process — not a direct PO action.
      // The PO is complete; no actions available on the PO itself.
    ],

    // ══ posted (orphan — not in PurchaseOrderStatus enum; unreachable) ════════
    posted: [
      // Terminal state. Posted POs with fully posted inventory are immutable.
    ],

    // ══ cancelled ═════════════════════════════════════════════════════════════
    [PurchaseOrderStatus.enum.cancelled]: [
      // Terminal state. Cancelled POs are immutable.
    ],

    // ══ reversed ══════════════════════════════════════════════════════════════
    [PurchaseOrderStatus.enum.reversed]: [
      // No actions — reversed is a terminal state
    ],
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// SalesOrder
// ═══════════════════════════════════════════════════════════════════════════════
//
// Status flow: draft → confirmed → posted → fulfilled
//   any → cancelled (terminal)
//   reversed (terminal — command-bus reversal)
//
// Commands:
//   confirmSalesOrder           — draft → confirmed (operator)
//   cancelSalesOrder            — draft/confirmed → cancelled (manager)
//   postSalesOrder              — confirmed → posted (operator)
//   priceSalesOrder             — draft/confirmed: slide-over pricing (operator)
//   repriceOrder                — confirmed: reprice order (manager)
//   allocateOrderToFulfillment  — confirmed/posted: create pick list (operator)
//   applyClientCredit           — draft/confirmed: apply credit (manager)
//   setDeliveryWindow           — draft/confirmed: set delivery window (operator)
//   markOrderFulfilled          — posted → fulfilled (operator)

export const salesOrderActions: EntityActionConfig = {
  entity: 'salesOrder',
  label: 'Sales Order',
  states: {
    // ══ draft ══════════════════════════════════════════════════════════════════
    [SalesOrderStatus.enum.draft]: [
      {
        id: 'confirmSalesOrder',
        label: 'Confirm',
        icon: 'Check',
        commandRoute: 'commands.run',
        confirmationRequired: true,
        minRole: 'operator',
      },
      {
        id: 'priceSalesOrder',
        label: 'Price',
        icon: 'DollarSign',
        commandRoute: 'commands.run',
        slidesOver: 'PriceOrderForm',
        minRole: 'operator',
      },
      {
        id: 'applyClientCredit',
        label: 'Apply credit',
        icon: 'Wallet',
        commandRoute: 'commands.run',
        minRole: 'manager',
      },
      {
        id: 'setDeliveryWindow',
        label: 'Delivery window',
        icon: 'Calendar',
        commandRoute: 'commands.run',
        minRole: 'operator',
      },
      {
        id: 'cancelSalesOrder',
        label: 'Cancel',
        icon: 'Trash2',
        commandRoute: 'commands.run',
        confirmationRequired: true,
        minRole: 'manager',
      },
    ],

    // ══ confirmed ═════════════════════════════════════════════════════════════
    [SalesOrderStatus.enum.confirmed]: [
      {
        id: 'postSalesOrder',
        label: 'Post',
        icon: 'Send',
        commandRoute: 'commands.run',
        confirmationRequired: true,
        minRole: 'operator',
      },
      {
        id: 'repriceOrder',
        label: 'Reprice',
        icon: 'RefreshCw',
        commandRoute: 'commands.run',
        minRole: 'manager',
      },
      {
        id: 'allocateOrderToFulfillment',
        label: 'Fulfill',
        icon: 'Package',
        commandRoute: 'commands.run',
        minRole: 'operator',
      },
      {
        id: 'applyClientCredit',
        label: 'Apply credit',
        icon: 'Wallet',
        commandRoute: 'commands.run',
        minRole: 'manager',
      },
      {
        id: 'cancelSalesOrder',
        label: 'Cancel',
        icon: 'Trash2',
        commandRoute: 'commands.run',
        confirmationRequired: true,
        minRole: 'manager',
      },
    ],

    // ══ posted ═════════════════════════════════════════════════════════════════
    [SalesOrderStatus.enum.posted]: [
      {
        id: 'allocateOrderToFulfillment',
        label: 'Fulfill',
        icon: 'Package',
        commandRoute: 'commands.run',
        minRole: 'operator',
      },
      {
        id: 'markOrderFulfilled',
        label: 'Mark fulfilled',
        icon: 'CheckCheck',
        commandRoute: 'commands.run',
        confirmationRequired: true,
        minRole: 'operator',
      },
    ],

    // ══ fulfilled ═════════════════════════════════════════════════════════════
    [SalesOrderStatus.enum.fulfilled]: [
      // Terminal state. Fulfilled orders are immutable.
    ],

    // ══ cancelled ═════════════════════════════════════════════════════════════
    [SalesOrderStatus.enum.cancelled]: [
      // Terminal state.
    ],

    // ══ reversed ══════════════════════════════════════════════════════════════
    [SalesOrderStatus.enum.reversed]: [
      // Terminal state.
    ],
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// Payment
// ═══════════════════════════════════════════════════════════════════════════════
//
// Status flow: posted → refunded | reversed
//
// Commands:
//   allocatePayment   — posted: allocate to open/partial invoice (operator)
//   unallocatePayment — posted: reverse allocation (manager)
//   refundPayment     — posted → refunded (manager, requires confirmation)

export const paymentActions: EntityActionConfig = {
  entity: 'payment',
  label: 'Payment',
  states: {
    // ══ posted ═════════════════════════════════════════════════════════════════
    [PaymentStatus.enum.posted]: [
      {
        id: 'allocatePayment',
        label: 'Allocate',
        icon: 'ArrowRightLeft',
        commandRoute: 'commands.run',
        minRole: 'operator',
      },
      {
        id: 'unallocatePayment',
        label: 'Unallocate',
        icon: 'Undo2',
        commandRoute: 'commands.run',
        minRole: 'manager',
      },
      {
        id: 'refundPayment',
        label: 'Refund',
        icon: 'Undo',
        commandRoute: 'commands.run',
        confirmationRequired: true,
        minRole: 'manager',
      },
    ],

    // ══ refunded ══════════════════════════════════════════════════════════════
    [PaymentStatus.enum.refunded]: [
      // Terminal state. Refunded payments are immutable.
    ],

    // ══ reversed ══════════════════════════════════════════════════════════════
    [PaymentStatus.enum.reversed]: [
      // Terminal state.
    ],
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// Invoice
// ═══════════════════════════════════════════════════════════════════════════════
//
// Status flow: open → partial → paid
//   any → reversed (terminal — command-bus reversal)
//
// Invoice status is driven by payment allocations, not direct invoice commands:
//   - open: no allocations (amountPaid = 0)
//   - partial: partially allocated (0 < amountPaid < total)
//   - paid: fully allocated (amountPaid = total)
//
// Commands:
//   allocatePayment       — open/partial: allocate payment to invoice
//   unallocatePayment     — partial/paid: reverse an allocation
//   resolveInvoiceDispute — open: resolve a dispute (manager)
//   rejectInvoiceDispute  — open: reject a dispute (manager)

export const invoiceActions: EntityActionConfig = {
  entity: 'invoice',
  label: 'Invoice',
  states: {
    // ══ open ═══════════════════════════════════════════════════════════════════
    [InvoiceStatus.enum.open]: [
      {
        id: 'allocatePayment',
        label: 'Record payment',
        icon: 'CreditCard',
        commandRoute: 'commands.run',
        minRole: 'operator',
      },
    ],

    // ══ partial ═══════════════════════════════════════════════════════════════
    [InvoiceStatus.enum.partial]: [
      {
        id: 'allocatePayment',
        label: 'Record payment',
        icon: 'CreditCard',
        commandRoute: 'commands.run',
        minRole: 'operator',
      },
      {
        id: 'unallocatePayment',
        label: 'Reverse allocation',
        icon: 'Undo2',
        commandRoute: 'commands.run',
        minRole: 'manager',
      },
    ],

    // ══ paid ══════════════════════════════════════════════════════════════════
    [InvoiceStatus.enum.paid]: [
      {
        id: 'unallocatePayment',
        label: 'Reverse allocation',
        icon: 'Undo2',
        commandRoute: 'commands.run',
        minRole: 'manager',
      },
    ],

    // ══ reversed ══════════════════════════════════════════════════════════════
    [InvoiceStatus.enum.reversed]: [
      // Terminal state.
    ],
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// VendorBill
// ═══════════════════════════════════════════════════════════════════════════════
//
// Status flow: open → approved → scheduled → partial → paid
//   any → void (terminal)
//   any → reversed (terminal — command-bus reversal)
//
// Commands:
//   approveVendorBill      — open → approved (manager)
//   scheduleVendorPayment  — approved → scheduled (manager)
//   recordVendorPayment    — scheduled/partial → partial/paid (manager)
//   voidVendorPayment      — posted vendor payment → void (manager)

export const vendorBillActions: EntityActionConfig = {
  entity: 'vendorBill',
  label: 'Vendor Bill',
  states: {
    // ══ open ═══════════════════════════════════════════════════════════════════
    [VendorBillStatus.enum.open]: [
      {
        id: 'approveVendorBill',
        label: 'Approve',
        icon: 'ClipboardCheck',
        commandRoute: 'commands.run',
        confirmationRequired: true,
        minRole: 'manager',
      },
    ],

    // ══ approved ══════════════════════════════════════════════════════════════
    [VendorBillStatus.enum.approved]: [
      {
        id: 'scheduleVendorPayment',
        label: 'Schedule payment',
        icon: 'CalendarClock',
        commandRoute: 'commands.run',
        minRole: 'manager',
      },
      {
        id: 'recordVendorPayment',
        label: 'Record payment',
        icon: 'CreditCard',
        commandRoute: 'commands.run',
        minRole: 'manager',
      },
    ],

    // ══ scheduled ═════════════════════════════════════════════════════════════
    [VendorBillStatus.enum.scheduled]: [
      {
        id: 'recordVendorPayment',
        label: 'Record payment',
        icon: 'CreditCard',
        commandRoute: 'commands.run',
        minRole: 'manager',
      },
    ],

    // ══ partial ═══════════════════════════════════════════════════════════════
    [VendorBillStatus.enum.partial]: [
      {
        id: 'recordVendorPayment',
        label: 'Record payment',
        icon: 'CreditCard',
        commandRoute: 'commands.run',
        minRole: 'manager',
      },
      {
        id: 'voidVendorPayment',
        label: 'Void last payment',
        icon: 'Ban',
        commandRoute: 'commands.run',
        confirmationRequired: true,
        minRole: 'manager',
      },
    ],

    // ══ paid ══════════════════════════════════════════════════════════════════
    [VendorBillStatus.enum.paid]: [
      {
        id: 'voidVendorPayment',
        label: 'Void last payment',
        icon: 'Ban',
        commandRoute: 'commands.run',
        confirmationRequired: true,
        minRole: 'manager',
      },
    ],

    // ══ void ══════════════════════════════════════════════════════════════════
    [VendorBillStatus.enum.void]: [
      // Terminal state.
    ],

    // ══ reversed ══════════════════════════════════════════════════════════════
    [VendorBillStatus.enum.reversed]: [
      // Terminal state.
    ],
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// PurchaseReceipt
// ═══════════════════════════════════════════════════════════════════════════════
//
// Status flow: posted → reversed (terminal)
//
// Purchase receipts are created by postPurchaseReceipt and are immutable once
// posted. Reversal happens via reverseCommandById on the command journal entry,
// not through a direct entity action.

export const purchaseReceiptActions: EntityActionConfig = {
  entity: 'purchaseReceipt',
  label: 'Purchase Receipt',
  states: {
    // ══ posted ═════════════════════════════════════════════════════════════════
    [PurchaseReceiptStatus.enum.posted]: [
      // Posted receipts are immutable. Reversal via command journal recovery.
    ],

    // ══ reversed ══════════════════════════════════════════════════════════════
    [PurchaseReceiptStatus.enum.reversed]: [
      // Terminal state.
    ],
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// VendorPayment
// ═══════════════════════════════════════════════════════════════════════════════
//
// Status flow: posted → void (terminal)
//
// Commands:
//   recordVendorPayment  — creates payment with status 'posted' (manager)
//   voidVendorPayment    — posted → void (manager)

export const vendorPaymentActions: EntityActionConfig = {
  entity: 'vendorPayment',
  label: 'Vendor Payment',
  states: {
    // ══ posted ═════════════════════════════════════════════════════════════════
    [VendorPaymentStatus.enum.posted]: [
      {
        id: 'voidVendorPayment',
        label: 'Void',
        icon: 'Ban',
        commandRoute: 'commands.run',
        confirmationRequired: true,
        minRole: 'manager',
      },
    ],

    // ══ void ══════════════════════════════════════════════════════════════════
    [VendorPaymentStatus.enum.void]: [
      // Terminal state.
    ],
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// Batch
// ═══════════════════════════════════════════════════════════════════════════════
//
// Status flow (intake lifecycle):
//   draft → ready → posted → (held | damaged | returned | in_transit)
//   any → needs_fix (validation flagged)
//   any → reversed (terminal — command-bus reversal)
//
// Non-intake paths: batches can also be created directly in posted status
// (via adjustBatchQuantity, transferInventoryOwnership with new batches).
//
// Commands:
//   updateBatch               — draft/ready/needs_fix: edit fields (operator)
//   deleteBatch               — draft/ready: delete (manager)
//   rejectBatch               — draft/needs_fix: reject (operator)
//   flagBatch                 — needs_fix: flag for attention (operator)
//   adjustBatchQuantity       — posted: adjust quantity (manager)
//   setInventoryStatus        — posted/held/damaged/returned/in_transit: set status (manager)
//   transferInventoryLocation — posted/held/in_transit: move location (operator)
//   transferInventoryOwnership— posted: change ownership (manager)
//   setBatchLotInfo           — posted: set lot info (operator)
//   setBatchPrice             — posted: set price (operator)

export const batchActions: EntityActionConfig = {
  entity: 'batch',
  label: 'Batch',
  states: {
    // ══ draft ══════════════════════════════════════════════════════════════════
    [BatchStatus.enum.draft]: [
      {
        id: 'updateBatch',
        label: 'Edit',
        icon: 'Pencil',
        commandRoute: 'commands.run',
        minRole: 'operator',
      },
      {
        id: 'deleteBatch',
        label: 'Delete',
        icon: 'Trash2',
        commandRoute: 'commands.run',
        minRole: 'manager',
      },
    ],

    // ══ ready ═════════════════════════════════════════════════════════════════
    [BatchStatus.enum.ready]: [
      {
        id: 'updateBatch',
        label: 'Edit',
        icon: 'Pencil',
        commandRoute: 'commands.run',
        minRole: 'operator',
      },
      {
        id: 'deleteBatch',
        label: 'Delete',
        icon: 'Trash2',
        commandRoute: 'commands.run',
        minRole: 'manager',
      },
      {
        id: 'rejectBatch',
        label: 'Reject',
        icon: 'XCircle',
        commandRoute: 'commands.run',
        minRole: 'operator',
      },
    ],

    // ══ needs_fix ═════════════════════════════════════════════════════════════
    [BatchStatus.enum.needs_fix]: [
      {
        id: 'updateBatch',
        label: 'Edit',
        icon: 'Pencil',
        commandRoute: 'commands.run',
        minRole: 'operator',
      },
      {
        id: 'flagBatch',
        label: 'Flag',
        icon: 'Flag',
        commandRoute: 'commands.run',
        minRole: 'operator',
      },
      {
        id: 'rejectBatch',
        label: 'Reject',
        icon: 'XCircle',
        commandRoute: 'commands.run',
        minRole: 'operator',
      },
    ],

    // ══ posted ═════════════════════════════════════════════════════════════════
    [BatchStatus.enum.posted]: [
      {
        id: 'setInventoryStatus',
        label: 'Set status',
        icon: 'Tag',
        commandRoute: 'commands.run',
        minRole: 'manager',
      },
      {
        id: 'transferInventoryLocation',
        label: 'Move',
        icon: 'ArrowRightLeft',
        commandRoute: 'commands.run',
        minRole: 'operator',
      },
      {
        id: 'transferInventoryOwnership',
        label: 'Transfer',
        icon: 'Users',
        commandRoute: 'commands.run',
        minRole: 'manager',
      },
      {
        id: 'adjustBatchQuantity',
        label: 'Adjust qty',
        icon: 'Scale',
        commandRoute: 'commands.run',
        minRole: 'manager',
      },
      {
        id: 'setBatchLotInfo',
        label: 'Lot info',
        icon: 'Barcode',
        commandRoute: 'commands.run',
        minRole: 'operator',
      },
      {
        id: 'setBatchPrice',
        label: 'Set price',
        icon: 'DollarSign',
        commandRoute: 'commands.run',
        minRole: 'operator',
      },
    ],

    // ══ held ══════════════════════════════════════════════════════════════════
    [BatchStatus.enum.held]: [
      {
        id: 'setInventoryStatus',
        label: 'Set status',
        icon: 'Tag',
        commandRoute: 'commands.run',
        minRole: 'manager',
      },
      {
        id: 'transferInventoryLocation',
        label: 'Move',
        icon: 'ArrowRightLeft',
        commandRoute: 'commands.run',
        minRole: 'operator',
      },
    ],

    // ══ damaged ═══════════════════════════════════════════════════════════════
    [BatchStatus.enum.damaged]: [
      {
        id: 'setInventoryStatus',
        label: 'Set status',
        icon: 'Tag',
        commandRoute: 'commands.run',
        minRole: 'manager',
      },
    ],

    // ══ returned ══════════════════════════════════════════════════════════════
    [BatchStatus.enum.returned]: [
      {
        id: 'setInventoryStatus',
        label: 'Set status',
        icon: 'Tag',
        commandRoute: 'commands.run',
        minRole: 'manager',
      },
    ],

    // ══ in_transit ════════════════════════════════════════════════════════════
    [BatchStatus.enum.in_transit]: [
      {
        id: 'setInventoryStatus',
        label: 'Set status',
        icon: 'Tag',
        commandRoute: 'commands.run',
        minRole: 'manager',
      },
      {
        id: 'transferInventoryLocation',
        label: 'Move',
        icon: 'ArrowRightLeft',
        commandRoute: 'commands.run',
        minRole: 'operator',
      },
    ],

    // ══ reversed ══════════════════════════════════════════════════════════════
    [BatchStatus.enum.reversed]: [
      // Terminal state.
    ],
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// FulfillmentLine
// ═══════════════════════════════════════════════════════════════════════════════
//
// Status flow: open → packed
//
// Cancellation is recorded on `status_extended`, not `status`.
//
// Commands:
//   recordWeighAndPack   — open: record weigh and pack (operator)
//   adjustFulfillmentLine— open: adjust qty/weight (operator)
//   cancelFulfillmentLine— open/packed: mark cancelled (operator, sets statusExtended)
//   returnPickedUnits    — packed: return units (operator)
//   acknowledgeWarehouseAlert — acknowledge alerts (operator)

export const fulfillmentLineActions: EntityActionConfig = {
  entity: 'fulfillmentLine',
  label: 'Fulfillment Line',
  states: {
    // ══ open ═══════════════════════════════════════════════════════════════════
    [FulfillmentLineStatus.enum.open]: [
      {
        id: 'recordWeighAndPack',
        label: 'Weigh & pack',
        icon: 'PackageCheck',
        commandRoute: 'commands.run',
        minRole: 'operator',
      },
      {
        id: 'adjustFulfillmentLine',
        label: 'Adjust',
        icon: 'SlidersHorizontal',
        commandRoute: 'commands.run',
        minRole: 'operator',
      },
      {
        id: 'cancelFulfillmentLine',
        label: 'Cancel line',
        icon: 'Trash2',
        commandRoute: 'commands.run',
        confirmationRequired: true,
        minRole: 'operator',
      },
      {
        id: 'acknowledgeWarehouseAlert',
        label: 'Acknowledge',
        icon: 'BellOff',
        commandRoute: 'commands.run',
        minRole: 'operator',
      },
    ],

    // ══ packed ════════════════════════════════════════════════════════════════
    [FulfillmentLineStatus.enum.packed]: [
      {
        id: 'returnPickedUnits',
        label: 'Return units',
        icon: 'Undo2',
        commandRoute: 'commands.run',
        minRole: 'operator',
      },
      {
        id: 'cancelFulfillmentLine',
        label: 'Cancel line',
        icon: 'Trash2',
        commandRoute: 'commands.run',
        confirmationRequired: true,
        minRole: 'operator',
      },
    ],
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// ConnectorRequest
// ═══════════════════════════════════════════════════════════════════════════════
//
// Status flow: open → approved | rejected | routed
//
// Commands:
//   approveConnectorRequest  — open → approved (operator)
//   rejectConnectorRequest   — open → rejected (operator)
//   routeConnectorRequest    — open → routed (operator)

export const connectorRequestActions: EntityActionConfig = {
  entity: 'connectorRequest',
  label: 'Connector Request',
  states: {
    // ══ open ═══════════════════════════════════════════════════════════════════
    [ConnectorRequestStatus.enum.open]: [
      {
        id: 'approveConnectorRequest',
        label: 'Approve',
        icon: 'Check',
        commandRoute: 'commands.run',
        minRole: 'operator',
      },
      {
        id: 'rejectConnectorRequest',
        label: 'Reject',
        icon: 'XCircle',
        commandRoute: 'commands.run',
        minRole: 'operator',
      },
      {
        id: 'routeConnectorRequest',
        label: 'Route',
        icon: 'ArrowRightLeft',
        commandRoute: 'commands.run',
        minRole: 'operator',
      },
    ],

    // ══ approved ══════════════════════════════════════════════════════════════
    [ConnectorRequestStatus.enum.approved]: [
      // Terminal state. Reversal via command journal recovery.
    ],

    // ══ rejected ══════════════════════════════════════════════════════════════
    [ConnectorRequestStatus.enum.rejected]: [
      // Terminal state.
    ],

    // ══ routed ════════════════════════════════════════════════════════════════
    [ConnectorRequestStatus.enum.routed]: [
      // Terminal state. Reversal via command journal recovery.
    ],
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// PickList
// ═══════════════════════════════════════════════════════════════════════════════
//
// Status flow: open → fulfilled (terminal)
//
// Pick lists are created by allocateOrderToFulfillment and fulfill when the
// entire order is packed (markOrderFulfilled).
//
// Commands:
//   recordWeighAndPack   — per fulfillment line (operator)
//   markOrderFulfilled   — open → fulfilled (operator, requires all lines packed)
//   createPickList       — creates pick list with status 'open' (operator)

export const pickListActions: EntityActionConfig = {
  entity: 'pickList',
  label: 'Pick List',
  states: {
    // ══ open ═══════════════════════════════════════════════════════════════════
    [PickListStatus.enum.open]: [
      // Individual fulfillment lines are packed via recordWeighAndPack.
      // The overall pick list is fulfilled via markOrderFulfilled.
      {
        id: 'markOrderFulfilled',
        label: 'Mark fulfilled',
        icon: 'CheckCheck',
        commandRoute: 'commands.run',
        confirmationRequired: true,
        minRole: 'operator',
      },
      {
        id: 'printLabels',
        label: 'Print labels',
        icon: 'Printer',
        commandRoute: 'commands.run',
        minRole: 'operator',
      },
    ],

    // ══ fulfilled ═════════════════════════════════════════════════════════════
    [PickListStatus.enum.fulfilled]: [
      // Terminal state.
    ],
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// MatchmakingMatch
// ═══════════════════════════════════════════════════════════════════════════════
//
// Status flow: open → accepted | dismissed
//   accepted/dismissed → open (via reopen)
//
// Commands:
//   acceptMatchmakingMatch   — open → accepted (operator)
//   dismissMatchmakingMatch  — open → dismissed (operator)
//   reopenMatchmakingMatch   — accepted/dismissed → open (operator)
//
// Note: "Create PO" and "Create Sale" are navigation actions from the expansion
// config, not state-machine commands. They navigate to Purchasing/Sales views
// with quick-launch prefill — they don't mutate the match entity.

export const matchmakingMatchActions: EntityActionConfig = {
  entity: 'matchmakingMatch',
  label: 'Matchmaking Match',
  states: {
    // ══ open ═══════════════════════════════════════════════════════════════════
    open: [
      {
        id: 'acceptMatchmakingMatch',
        label: 'Accept',
        icon: 'Check',
        commandRoute: 'commands.run',
        minRole: 'operator',
      },
      {
        id: 'dismissMatchmakingMatch',
        label: 'Dismiss',
        icon: 'X',
        commandRoute: 'commands.run',
        minRole: 'operator',
      },
    ],

    // ══ accepted ══════════════════════════════════════════════════════════════
    accepted: [
      {
        id: 'reopenMatchmakingMatch',
        label: 'Reopen',
        icon: 'RotateCcw',
        commandRoute: 'commands.run',
        minRole: 'operator',
      },
    ],

    // ══ dismissed ═════════════════════════════════════════════════════════════
    dismissed: [
      {
        id: 'reopenMatchmakingMatch',
        label: 'Reopen',
        icon: 'RotateCcw',
        commandRoute: 'commands.run',
        minRole: 'operator',
      },
    ],
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// ACTION LOOKUP
// ═══════════════════════════════════════════════════════════════════════════════

/** Full registry of entity action configs. */
export const entityActionConfigs: Record<string, EntityActionConfig> = {
  purchaseOrder: purchaseOrderActions,
  salesOrder: salesOrderActions,
  payment: paymentActions,
  invoice: invoiceActions,
  vendorBill: vendorBillActions,
  purchaseReceipt: purchaseReceiptActions,
  vendorPayment: vendorPaymentActions,
  batch: batchActions,
  fulfillmentLine: fulfillmentLineActions,
  connectorRequest: connectorRequestActions,
  pickList: pickListActions,
  matchmakingMatch: matchmakingMatchActions,
};

/**
 * Get allowed actions for an entity in a given state.
 * Returns an empty array if the entity or state is not recognized.
 *
 * @param entity - Entity type key (e.g. 'purchaseOrder')
 * @param status - Current entity status string
 * @param role - Optional operator role for role-gating
 * @returns Array of allowed EntityAction objects (empty if none match)
 */
export function getAllowedActions(
  entity: string,
  status: string,
  role?: Role
): EntityAction[] {
  const config = entityActionConfigs[entity];
  if (!config) return [];
  const actions = config.states[status];
  if (!actions) return [];
  if (!role) return actions;
  return actions.filter((a) => !a.minRole || a.minRole === role ||
    // 'manager' sees owner-gated actions; 'owner' sees everything
    (role === 'owner') ||
    (role === 'manager' && a.minRole === 'manager'));
}
