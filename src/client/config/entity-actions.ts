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
import { PurchaseOrderStatus } from '../../shared/statuses';

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
      },
      {
        id: 'finalizePurchaseOrder',
        label: 'Finalize',
        icon: 'Check',
        commandRoute: 'commands.run',
        confirmationRequired: true,
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
    ordered: [
      {
        id: 'receivePurchaseOrder',
        label: 'Draft intake',
        icon: 'PackagePlus',
        commandRoute: 'commands.run',
        slidesOver: 'ReceiveLinesForm',
      },
      {
        id: 'recordVendorPrepayment',
        label: 'Record prepay',
        icon: 'CreditCard',
        commandRoute: 'commands.run',
        slidesOver: 'RecordPrepaymentForm',
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
  },
};

// ─── Sale — template section ─────────────────────────────────────────────────
// TODO: add Sale entity state machine
// Statuses: draft, confirmed, posted, fulfilled, cancelled, reversed, needs_fix
// Commands: createSalesOrder, addSalesOrderLine, updateSalesOrderLine,
//   removeSalesOrderLine, reserveInventoryForOrder, priceSalesOrder,
//   confirmSalesOrder, cancelSalesOrder, postSalesOrder, allocateOrderToFulfillment

// ─── Intake — template section ───────────────────────────────────────────────
// TODO: add Intake (Batch) entity state machine

// ─── Payment — template section ──────────────────────────────────────────────
// TODO: add Payment entity state machine

// ─── Closeout — template section ──────────────────────────────────────────────
// TODO: add Closeout entity state machine

// ═══════════════════════════════════════════════════════════════════════════════
// ACTION LOOKUP
// ═══════════════════════════════════════════════════════════════════════════════

/** Full registry of entity action configs. */
export const entityActionConfigs: Record<string, EntityActionConfig> = {
  purchaseOrder: purchaseOrderActions,
  // TODO: add remaining entity action configs
  // sale: saleActions,
  // intake: intakeActions,
  // payment: paymentActions,
  // closeout: closeoutActions,
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
