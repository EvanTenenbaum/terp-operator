import { randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import PDFDocument from 'pdfkit';
import Decimal from 'decimal.js';
import { and, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm';

// Money precision policy (TER-1566): all monetary accumulation goes through
// Decimal to avoid IEEE 754 drift on running sums. 20 digits of precision is
// more than enough headroom for numeric(12,4) DB columns; ROUND_HALF_UP
// matches accounting convention.
Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });
import type { Server as SocketServer } from 'socket.io';
import { z } from 'zod';
import { db, pool } from '../db';
import type { Tx } from '../db';
import { env } from '../env';
import { scrubDatabaseError } from '../trpc';
import { logger } from './logger';
import {
  appointments,
  archiveRuns,
  backupSnapshots,
  batches,
  barterSettlements,
  barterSettlementLines,
  barterSettlementAllocations,
  brands,
  clientLedgerEntries,
  commandJournal,
  connectorRequests,
  contacts,
  contactLedgerEntries,
  contactMergeCandidates,
  correctionJournalEntries,
  creditEngineConfig,
  creditEngineConfigHistory,
  creditEngineStanceHistory,
  creditEngineStances,
  customerCreditAssessments,
  customers,
  customerNeeds,
  customerSheetSnapshots,
  fulfillmentLines,
  inventoryMovements,
  invoiceDisputes,
  invoices,
  items,
  matchmakingMatches,
  matchmakingSettings,
  paymentAllocations,
  paymentProcessors,
  payments,
  periodLocks,
  pickLists,
  purchaseReceiptLines,
  purchaseReceipts,
  purchaseOrderLines,
  purchaseOrders,
  referees,
  refereeRelationships,
  refereeCredits,
  salesOrderLines,
  salesOrders,
  systemSettings,
  tagCatalog,
  transactionTypes,
  users,
  vendorBills,
  vendorPayments,
  vendorSupply,
  vendors
} from '../schema';
import { assertCommandAccess } from '../rbac';
import { appendJsonlJournal } from '@/domains/shared/journal';
import { emitCommandCompleted, emitCommandFailed } from '@/domains/shared/socket-emitter';
import { rowsToCsv, validateBatchCsv } from './csv';
import { getCloseoutSafety } from './closeout';
import { applyPricingRule, asCustomerPricingRule, evaluatePrice, resolvePricingProfile, resolvePricingRuleEntry } from './pricing';
import {
  commandInputSchema,
  customerPricingRuleSchema,
  setLineLandedCostPayloadSchema,
  // Contacts system (CAP-033 / TER-1564)
  createContactPayloadSchema,
  updateContactPayloadSchema,
  archiveContactPayloadSchema,
  addContactRolePayloadSchema,
  linkContactToExistingEntityPayloadSchema,
  linkContactToUserPayloadSchema,
  createAppointmentPayloadSchema,
  updateAppointmentPayloadSchema,
  cancelAppointmentPayloadSchema,
  completeAppointmentPayloadSchema,
  updateVendorPayloadSchema,
  updateProcessorPayloadSchema,
  // D2 — merge candidate review (RBAC + audit trail)
  approveMergeCandidatePayloadSchema,
  dismissMergeCandidatePayloadSchema
} from '../../shared/schemas';
import {
  accrueRefereeCredit,
  processRefereePayout,
  createReferee,
  updateReferee,
  addRefereeRelationship,
  updateRefereeRelationship,
  deactivateRefereeRelationship,
  voidRefereeCreditCommand
} from './refereeCommands';
import {
  createPaymentProcessor,
  updateProcessorFeeStatus
} from './processorCommands';
import { enqueueAllCustomers, enqueueCustomerRecompute } from './creditEngine';
import { reversalPolicies } from '../../shared/commandCatalog';
import { invalidateReferenceCache } from '../routers/queries';
import { emitPickEvent, emitPickOrderAndQueue, emitSalesLineEvent } from '../sockets';

import { randomBytes } from 'node:crypto';
import type { CommandName } from '../../shared/commandCatalog';
import type { CommandResult, SessionUser } from '../../shared/types';
import { normalizeTagSlug, parseTagInput } from '../../shared/tags';
import { parsePriceRange, rangeMidpoint, validateCostRange } from '../../shared/priceRange';
import {
  buildCustomerSheetSnapshotRows,
  redactCustomerSheetSnapshotJournalPayload,
  CUSTOMER_SHEET_MODES,
  type CustomerSheetMode
} from '../../shared/customerSheetSnapshot';
import {
  validateLandedCost,
  validateBelowFloorChoice,
  computeOrderExceptionTotals,
  canConfirmOrPost,
  BELOW_FLOOR_REASONS,
  type BelowFloorReason,
  type VendorApprovalState,
  type ExceptionLine,
  type CanConfirmOrPostLine,
  type ConfirmOrPostBlockedReason
} from '../../shared/saleLineCostExceptions';
import { createPoFinalizationReceipts } from './poFinalizationReceipts';
import { createSalesConfirmationReceipts } from './salesConfirmationReceipts';
import { createInvoiceReceipts } from './invoiceReceipts';
import { createPaymentReceivedReceipts } from './paymentReceivedReceipts';
import { createVendorPayoutReceipts } from './vendorPayoutReceipts';
import { createBarterReceipts } from './barterReceipts';

// PO domain commands extracted to @/domains/purchase-orders (P1.PO.EXTRACT).
// commandBus retains the helpers + schemas these handlers rely on; switch
// cases below still dispatch to them by name.
import {
  addPurchaseOrderLine,
  approvePurchaseOrder,
  cancelPurchaseOrder,
  createPurchaseOrder,
  finalizePurchaseOrder,
  postPurchaseReceipt,
  receivePurchaseOrder,
  recordVendorPrepayment,
  removePurchaseOrderLine,
  unfinalizePurchaseOrder,
  updatePurchaseOrder,
  updatePurchaseOrderLine,
} from '@/domains/purchase-orders';

// Payments domain commands extracted to @/domains/payments (P1.PAY.EXTRACT).
// commandBus retains the helpers + schemas these handlers rely on; switch
// cases below still dispatch to them by name.
import {
  allocatePayment,
  applyClientCredit,
  applyDiscount,
  logPayment,
  markPaymentUnapplied,
  markUserFeeCollected,
  recordVendorPayment,
  refundPayment,
  scheduleVendorPayment,
  unallocatePayment,
  voidVendorPayment,
} from '@/domains/payments';

// Sales Orders domain commands extracted to @/domains/sales-orders
// (P1.SAL.EXTRACT). commandBus retains the helpers, schemas, and sales-utility
// functions these handlers rely on; switch cases below still dispatch to them
// by name. `repriceOrder` is not a separate function — its switch case routes
// to `priceSalesOrder` with a different toast.
import {
  addSalesOrderLine,
  cancelSalesOrder,
  confirmSalesOrder,
  createSalesOrder,
  postSalesOrder,
  priceSalesOrder,
  removeSalesOrderLine,
  reserveInventoryForOrder,
  resolveVendorApproval,
  setCustomerPricingRule,
  setDefaultPricingRule,
  setDeliveryWindow,
  setLineBelowFloorReason,
  setLineLandedCost,
  updateSalesOrderLine,
} from '@/domains/sales-orders';

// Re-export sales handlers that were previously exported directly from this
// module so existing test imports (src/tests/pricingCommands.test.ts) keep
// working after P1.SAL.EXTRACT.
export {
  confirmSalesOrder,
  postSalesOrder,
  priceSalesOrder,
  setCustomerPricingRule,
  setDefaultPricingRule,
  setLineLandedCost,
} from '@/domains/sales-orders';

// Credit domain commands extracted to @/domains/credit (P1.CRED.EXTRACT).
// commandBus retains the shared helpers + the setCustomerCreditLimit payload
// schema these handlers rely on; switch cases below still dispatch to them
// by name. The 12 credit handlers are also re-exported below so existing test
// imports (src/server/services/creditCommands.test.ts) keep working.
// `applyClientCredit` lives in @/domains/payments; `voidRefereeCredit`
// intentionally remains in commandBus (referee-related, not credit-engine).
import {
  bulkRevertCustomersToEngine,
  createCreditEngineStance,
  deleteCreditEngineStance,
  disableCreditEngineForCustomer,
  enableCreditEngineForCustomer,
  revertCustomerCreditToEngine,
  setCreditEngineConfig,
  setCustomerCreditLimit,
  setCustomerEngineMax,
  setCustomerStance,
  snoozeCustomerCreditReminder,
  updateCreditEngineStance,
} from '@/domains/credit';

export {
  bulkRevertCustomersToEngine,
  createCreditEngineStance,
  deleteCreditEngineStance,
  disableCreditEngineForCustomer,
  enableCreditEngineForCustomer,
  revertCustomerCreditToEngine,
  setCreditEngineConfig,
  setCustomerCreditLimit,
  setCustomerEngineMax,
  setCustomerStance,
  snoozeCustomerCreditReminder,
  updateCreditEngineStance,
} from '@/domains/credit';

// Media domain commands extracted to @/domains/media (P1.MED.EXTRACT).
// commandBus retains the shared helpers (requiredId / requiredNumber /
// requiredString / stringValue / Payload type) these handlers rely on;
// switch cases below still dispatch to them by name. The
// ALLOWED_MEDIA_TYPES / ALLOWED_MEDIA_ROLES / PHOTO_UPLOAD_TOKEN_MAX_TTL_MINUTES
// constants moved with the handlers (domain-internal). The internal helpers
// previously named `mintPhotoUploadTokenCommand` / `revokePhotoUploadTokenCommand`
// are renamed to their natural names (`mintPhotoUploadToken` /
// `revokePhotoUploadToken`) in the domain module.
import {
  attachBatchPhoto,
  deleteBatchMedia,
  mintPhotoUploadToken,
  publishBatchMedia,
  revokePhotoUploadToken,
  setBatchMediaRole,
  uploadBatchMedia,
} from '@/domains/media';

// Re-export media handlers that were previously exported directly from this
// module so existing test imports (src/tests/mediaCommands.test.ts) keep
// working after P1.MED.EXTRACT.
export {
  deleteBatchMedia,
  publishBatchMedia,
  setBatchMediaRole,
  uploadBatchMedia,
} from '@/domains/media';

// Pick / fulfillment domain commands extracted to @/domains/pick (P1.PICK.EXTRACT).
// commandBus retains the helpers + schemas these handlers rely on; switch
// cases below still dispatch to them by name.
import {
  allocateOrderToFulfillment,
  printLabels,
  recallLineFromPicking,
  recordWeighAndPack,
  releaseLineForPicking,
  releaseLinesForPicking,
  returnPickedUnits,
} from '@/domains/pick';

// Intake domain commands extracted to @/domains/intake (P1.INT.EXTRACT).
// commandBus retains the helpers + schemas these handlers rely on; switch
// cases below still dispatch to them by name. setBatchPrice and setBatchLotInfo
// are thin wrappers that delegate to updateBatch (now in @/domains/intake).
import {
  adjustBatchQuantity,
  createBatch,
  createCustomerSheetSnapshot,
  deleteBatch,
  flagBatch,
  importBatchesCsv,
  rejectBatch,
  setBatchLotInfo,
  setBatchPrice,
  updateBatch,
  verifyAllIntake,
} from '@/domains/intake';

// Matchmaking domain commands extracted to @/domains/matchmaking (P1.MM.EXTRACT).
// commandBus retains the helpers + schemas these handlers rely on; switch
// cases below still dispatch to them by name. The rebuildMatchesForNeed /
// rebuildMatchesForSupply helpers are also re-imported here for use by
// applyTags and createCustomerNeed / updateCustomerNeed.
import {
  dismissMatchmakingWorkQueueItem,
  noteMatchmakingOutreach,
  rebuildMatchesForNeed,
  rebuildMatchesForSupply,
  reopenMatchmakingMatch,
  reviewMatchmakingMatch,
  updateMatchmakingSettings,
} from '@/domains/matchmaking';

// Vendor Management domain commands extracted to @/domains/vendor-management
// (P1.VM.EXTRACT). commandBus retains the helpers + schemas these handlers
// rely on; switch cases below still dispatch to them by name.
// ensureVendorBrand is re-exported below for existing intake consumers.
import {
  createVendor,
  createVendorBill,
  createVendorSupply,
  postVendorLedgerPayment,
  updateProcessor,
  updateVendor,
  updateVendorBillStatus,
  updateVendorSupply,
} from '@/domains/vendor-management';
import { setInventoryStatus, transferInventoryLocation, transferInventoryOwnership } from '@/domains/inventory';

// Barter settlement domain (product as monetary instrument).
// Phase 1: outbound vendor barter (payWithProduct).
// Phase 2: inbound client barter (settleDebtWithProduct). See
// docs/engineering-plans/product-as-monetary-instrument-plan.md.
import {
  payWithProduct,
  settleDebtWithProduct,
  assertBarterSettlementReversible,
} from '@/domains/barter';

// Contacts domain commands extracted to @/domains/contacts (P1.CT.EXTRACT).
// commandBus retains the helpers + schemas these handlers rely on; switch
// cases below still dispatch to them by name.
import {
  addContactRole,
  archiveContact,
  cancelAppointment,
  completeAppointment,
  createAppointment,
  createContact,
  linkContactToExistingEntity,
  linkContactToUser,
  updateAppointment,
  updateContact,
} from '@/domains/contacts';

export type CommandInput = z.infer<typeof commandInputSchema>;

// Re-export ensureVendorBrand from vendor-management so existing intake
// domain consumers don't need to change their import paths (P1.VM.EXTRACT).
export { ensureVendorBrand } from '@/domains/vendor-management';

// Re-export matchmaking handlers that were previously exported directly from
// this module so existing test imports (src/server/services/matchmakingStatus.test.ts)
// keep working after P1.MM.EXTRACT.
export {
  dismissMatchmakingWorkQueueItem,
  noteMatchmakingOutreach,
  reopenMatchmakingMatch,
  reviewMatchmakingMatch,
  updateMatchmakingSettings,
} from '@/domains/matchmaking';

// Re-export for other services that import Tx from commandBus (GH #301).
export type { Tx } from '../db';

/**
 * Per-command list of `result.delta.*` keys that must NOT be persisted in the
 * command journal (DB row OR on-disk JSONL). The command handler is free to
 * return the raw value to the caller in the live CommandResult — but the
 * journal-bound copy gets these fields replaced with the sentinel string
 * `'<redacted>'`. Without this, secrets returned to the client via delta
 * (e.g. mintPhotoUploadToken's raw bearer token, #93 F1) would land in the
 * DB and the JSONL audit, defeating their sha256-at-rest design.
 */
const SENSITIVE_DELTA_FIELDS_BY_COMMAND: Readonly<Record<string, readonly string[]>> = {
  mintPhotoUploadToken: ['token']
};

export function redactSensitiveDeltaFields(commandName: string, result: CommandResult): CommandResult {
  const sensitive = SENSITIVE_DELTA_FIELDS_BY_COMMAND[commandName];
  if (!sensitive || !result.delta || typeof result.delta !== 'object') return result;
  const redacted: Record<string, unknown> = { ...(result.delta as Record<string, unknown>) };
  for (const key of sensitive) {
    if (key in redacted) redacted[key] = '<redacted>';
  }
  return { ...result, delta: redacted };
}
export type Payload = Record<string, unknown>;

// ─── Per-command payload validation schemas (GH #302) ────────────────────────
// These schemas gate the 20 highest-traffic commands at the handler boundary so
// bad input types produce a structured ZodError instead of a generic thrown
// string. Fields are marked .optional() generously so callers that omit
// optional fields continue to work; the handlers' own requiredId /
// requiredString / requiredNumber guards remain in place for semantic checks.

const createBatchPayloadSchema = z.object({
  name: z.string().optional(),
  category: z.string().optional(),
  vendorId: z.string().uuid().optional(),
  shorthand: z.string().optional(),
  tags: z.array(z.string()).optional(),
  status: z.string().optional(),
  brandId: z.string().uuid().optional(),
  purchaseOrderId: z.string().uuid().optional(),
  purchaseOrderLineId: z.string().uuid().optional(),
  sourceCode: z.string().optional(),
  subcategory: z.string().optional(),
  intakeQty: z.coerce.number().optional(),
  availableQty: z.coerce.number().optional(),
  uom: z.string().optional(),
  unitCost: z.coerce.number().optional(),
  unitPrice: z.coerce.number().optional(),
  location: z.string().optional(),
  lotCode: z.string().optional(),
  intakeDate: z.string().optional(),
  ticketCost: z.coerce.number().optional(),
  priceRange: z.string().optional(),
  notes: z.string().optional(),
  legacyMarker: z.string().optional(),
  ownershipStatus: z.string().optional(),
  expirationDate: z.string().optional(),
  arrivalConfirmed: z.boolean().optional(),
  arrivalStatus: z.string().optional(),
  mediaStatus: z.string().optional(),
}).passthrough();

export const createPurchaseOrderPayloadSchema = z.object({
  vendorId: z.string().uuid(),
  expectedDate: z.string().optional(),
  paymentTerms: z.string().optional(),
  prepaymentAmount: z.coerce.number().optional(),
  buyerNotes: z.string().optional(),
  internalNotes: z.string().optional(),
  externalNotes: z.string().optional(),
});

export const createVendorPayloadSchema = z.object({
  name: z.string().min(1),
  termsDays: z.coerce.number().optional(),
  contact: z.string().optional(),
  notes: z.string().optional(),
  consignmentDefault: z.boolean().optional(),
});

export const finalizePurchaseOrderPayloadSchema = z.object({
  purchaseOrderId: z.string().uuid().optional(),
  id: z.string().uuid().optional(),
});

const rejectBatchPayloadSchema = z.object({
  batchId: z.string().uuid().optional(),
  id: z.string().uuid().optional(),
  reason: z.string().min(1),
});

export const createSalesOrderPayloadSchema = z.object({
  customerId: z.string().uuid(),
  notes: z.string().optional(),
});

export const updateSalesOrderLinePayloadSchema = z.object({
  lineId: z.string().uuid().optional(),
  id: z.string().uuid().optional(),
  orderId: z.string().uuid().optional(),
  batchId: z.string().uuid().nullable().optional(),
  itemName: z.string().optional(),
  qty: z.coerce.number().optional(),
  unitPrice: z.coerce.number().optional(),
  status: z.string().optional(),
  sourceRowKey: z.string().optional(),
  unresolvedSourceText: z.string().optional(),
  legacyStatusMarker: z.string().optional(),
  legacyStatusMarkers: z.string().optional(),
  packed: z.boolean().optional(),
  inventoryPosted: z.boolean().optional(),
  paymentFollowup: z.boolean().optional(),
  deliveryWindow: z.string().optional(),
  notes: z.string().optional(),
});

export const cancelSalesOrderPayloadSchema = z.object({
  orderId: z.string().uuid(),
});

export const postSalesOrderPayloadSchema = z.object({
  orderId: z.string().uuid(),
});

export const setDeliveryWindowPayloadSchema = z.object({
  orderId: z.string().uuid(),
  deliveryWindow: z.string().min(1),
});

export const logPaymentPayloadSchema = z.object({
  customerId: z.string().uuid(),
  amount: z.coerce.number(),
  // TER-1661: payment methods simplified to cash, check, other.
  method: z.enum(['cash', 'check', 'other']).optional(),
  date: z.string().optional(),
  createdAt: z.string().optional(),
  reference: z.string().optional(),
  locationBucket: z.string().optional(),
  notes: z.string().optional(),
  direction: z.string().optional(),
  category: z.string().optional(),
  allocationIntent: z.string().optional(),
  invoiceId: z.string().uuid().optional(),
});

export const allocatePaymentPayloadSchema = z.object({
  paymentId: z.string().uuid(),
  invoiceId: z.string().uuid().optional(),
  amount: z.coerce.number().optional(),
});

// TER-1662: applyEarlyPayDiscount renamed to applyDiscount — early-payment
// gating dropped; this is now a generic invoice discount command.
export const applyDiscountPayloadSchema = z.object({
  invoiceId: z.string().uuid(),
  amount: z.coerce.number(),
  reason: z.string().optional(),
});

const recordWeighAndPackPayloadSchema = z.object({
  fulfillmentLineId: z.string().uuid().optional(),
  id: z.string().uuid().optional(),
  actualQty: z.coerce.number().optional(),
  actualWeight: z.coerce.number().optional(),
  bagCode: z.string().optional(),
});

const markOrderFulfilledPayloadSchema = z.object({
  orderId: z.string().uuid(),
  tracking: z.string().optional(),
});

const releaseLineForPickingPayloadSchema = z.object({
  lineId: z.string().uuid().optional(),
  id: z.string().uuid().optional(),
});

const archivePeriodPayloadSchema = z.object({
  period: z.string().min(1),
});

const reverseCommandByIdPayloadSchema = z.object({
  commandId: z.string().uuid(),
});

export const setCustomerCreditLimitPayloadSchema = z.object({
  customerId: z.string().uuid(),
  amount: z.coerce.number().min(0, 'amount must be greater than or equal to zero'),
  reason: z.string().min(4, 'reason must be at least 4 characters'),
});

const createCustomerNeedPayloadSchema = z.object({
  customerId: z.string().uuid(),
  productName: z.string().optional(),
  name: z.string().optional(),
  category: z.string().min(1),
  qtyMin: z.coerce.number().optional(),
  qty: z.coerce.number().optional(),
  qtyMax: z.coerce.number().optional(),
  tags: z.array(z.string()).optional(),
});

// ─── Per-command payload validation schemas (GH #388) ────────────────────────
// Second tranche: ~20 highest-risk financial, purchase-order, and inventory
// command handlers that previously validated only via inline guards.

export const unallocatePaymentPayloadSchema = z.object({
  allocationId: z.string().uuid(),
});

export const refundPaymentPayloadSchema = z.object({
  paymentId: z.string().uuid(),
});

export const markPaymentUnappliedPayloadSchema = z.object({
  paymentId: z.string().uuid(),
});

export const applyClientCreditPayloadSchema = z.object({
  customerId: z.string().uuid(),
  amount: z.coerce.number(),
  reason: z.string().optional(),
});

export const createVendorBillPayloadSchema = z.object({
  vendorId: z.string().uuid(),
  amount: z.coerce.number(),
  dueDate: z.string().optional(),
  dueReason: z.string().optional(),
});

export const scheduleVendorPaymentPayloadSchema = z.object({
  vendorBillId: z.string().uuid().optional(),
  id: z.string().uuid().optional(),
  scheduledFor: z.string().optional(),
});

export const recordVendorPaymentPayloadSchema = z.object({
  vendorBillId: z.string().uuid().optional(),
  id: z.string().uuid().optional(),
  amount: z.coerce.number().optional(),
  method: z.string().optional(),
  reference: z.string().optional(),
  overrideUnscheduled: z.boolean().optional(),
  date: z.string().optional(),
  createdAt: z.string().optional(),
});

export const voidVendorPaymentPayloadSchema = z.object({
  vendorPaymentId: z.string().uuid().optional(),
  id: z.string().uuid().optional(),
});

export const recordVendorPrepaymentPayloadSchema = z.object({
  purchaseOrderId: z.string().uuid(),
  amount: z.coerce.number(),
  method: z.string().optional(),
  reference: z.string().optional(),
});

const postTransactionLedgerRowPayloadSchema = z.object({
  direction: z.string().min(1),
  entityType: z.string().min(1),
  transactionType: z.string().min(1),
  amount: z.coerce.number(),
  entityId: z.string().uuid().optional(),
  entityName: z.string().optional(),
  kind: z.string().optional(),
  // Accept both string and Date (pipeline may coerce date strings via superjson).
  // Nulls are handled by the command implementation (dateOrNull / stringValue).
  method: z.union([z.string(), z.null()]).optional(),
  reference: z.union([z.string(), z.null()]).optional(),
  notes: z.string().optional(),
  allocationTargetType: z.string().optional(),
  allocationTargetId: z.string().uuid().optional(),
  allocationIntent: z.string().optional(),
  bucket: z.string().optional(),
  date: z.union([z.string(), z.date()]).optional(),
});

const upsertTransactionTypePayloadSchema = z.object({
  label: z.string().min(1),
  slug: z.string().optional(),
  direction: z.string().min(1),
  allowedEntityTypes: z.union([z.array(z.string()), z.string()]).optional(),
  entityType: z.string().optional(),
  defaultMethod: z.string().optional(),
  defaultBucket: z.string().optional(),
  defaultAllocationIntent: z.string().optional(),
  requiresApproval: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

const resolveInvoiceDisputePayloadSchema = z.object({
  disputeId: z.string().uuid().optional(),
  id: z.string().uuid().optional(),
  resolution: z.string().optional(),
});

const rejectInvoiceDisputePayloadSchema = z.object({
  disputeId: z.string().uuid().optional(),
  id: z.string().uuid().optional(),
  reason: z.string().optional(),
});

export const addPurchaseOrderLinePayloadSchema = z.object({
  purchaseOrderId: z.string().uuid(),
  productName: z.string().optional(),
  name: z.string().optional(),
  category: z.string().optional(),
  qty: z.coerce.number(),
  unitCost: z.coerce.number().optional(),
  costRangeLow: z.coerce.number().optional(),
  costRangeHigh: z.coerce.number().optional(),
  uom: z.string().optional(),
  tags: z.array(z.string()).optional(),
  shorthand: z.string().optional(),
  sourceCode: z.string().optional(),
  subcategory: z.string().optional(),
  notes: z.string().optional(),
  internalNotes: z.string().optional(),
  externalNotes: z.string().optional(),
  legacyMarker: z.string().optional(),
  ownershipStatus: z.string().optional(),
});

export const removePurchaseOrderLinePayloadSchema = z.object({
  lineId: z.string().uuid().optional(),
  id: z.string().uuid().optional(),
});

export const approvePurchaseOrderPayloadSchema = z.object({
  purchaseOrderId: z.string().uuid().optional(),
  id: z.string().uuid().optional(),
});

export const receivePurchaseOrderPayloadSchema = z.object({
  purchaseOrderId: z.string().uuid().optional(),
  id: z.string().uuid().optional(),
  lineIds: z.array(z.string().uuid()).optional(),
  // UX-H04 / BE-009 lineage — Execution Decision 5 (2026-06-12): optional
  // per-line receive quantities for PARTIAL PO receiving. Keys are purchase
  // order line ids, values are the qty to receive now. Absent → the legacy
  // full-receive behavior is unchanged (backward compatible).
  lineQuantities: z.record(z.coerce.number().positive()).optional(),
});

export const cancelPurchaseOrderPayloadSchema = z.object({
  purchaseOrderId: z.string().uuid().optional(),
  id: z.string().uuid().optional(),
});

export const postPurchaseReceiptPayloadSchema = z.object({
  batchIds: z.array(z.string().uuid()).optional(),
  selectedIds: z.array(z.string().uuid()).optional(),
  discrepancyNotes: z.record(z.unknown()).optional(),
});

const verifyAllIntakePayloadSchema = z.object({
  purchaseOrderId: z.string().uuid().optional(),
  id: z.string().uuid().optional(),
});

const adjustBatchQuantityPayloadSchema = z.object({
  batchId: z.string().uuid().optional(),
  id: z.string().uuid().optional(),
  deltaQty: z.coerce.number().optional(),
  qtyDelta: z.coerce.number().optional(),
  reason: z.string().optional(),
});

// ─────────────────────────────────────────────────────────────────────────────

export const moneyScale = (value: unknown): string => {
  try {
    return new Decimal(String(value ?? 0)).toDecimalPlaces(2).toFixed(2);
  } catch {
    return '0.00';
  }
};

/**
 * Sum any number of money-shaped values with Decimal precision and return a
 * scaled string suitable for a numeric(12,4) column write. Use this anywhere
 * a running balance, total, or amount-paid is accumulated across rows.
 */
export const addMoney = (...values: unknown[]): string =>
  values
    .reduce<Decimal>(
      (acc, v) => acc.plus(new Decimal(String(v ?? 0))),
      new Decimal(0)
    )
    .toDecimalPlaces(2)
    .toFixed(2);

/**
 * Multiply two money-shaped values with Decimal precision (e.g. unit cost * qty).
 */
export const mulMoney = (a: unknown, b: unknown): string =>
  new Decimal(String(a ?? 0))
    .times(new Decimal(String(b ?? 0)))
    .toDecimalPlaces(2)
    .toFixed(2);

/**
 * Subtract two money-shaped values with Decimal precision. Returns a scaled
 * string. Result is NOT clamped — use subMoneyMin0 when the result cannot be
 * negative (e.g. reversing amountPaid that may have already been corrected).
 * Phase 1 cleanup for TER-1566: fixes reversal-handler sites missed in the
 * initial Decimal.js pass.
 */
export const subMoney = (a: unknown, b: unknown): string =>
  new Decimal(String(a ?? 0))
    .minus(new Decimal(String(b ?? 0)))
    .toDecimalPlaces(2)
    .toFixed(2);

/**
 * Same as subMoney but clamped at "0.00". Use when the result must be
 * non-negative (e.g. reversing bill.amountPaid or invoice.amountPaid where
 * concurrent corrections may have already reduced the value).
 */
export const subMoneyMin0 = (a: unknown, b: unknown): string => {
  const d = new Decimal(String(a ?? 0)).minus(new Decimal(String(b ?? 0)));
  return (d.isNegative() ? new Decimal(0) : d).toDecimalPlaces(2).toFixed(2);
};

export const qtyScale = (value: unknown) => Number(value ?? 0).toFixed(3);
export const code = (prefix: string) => `${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 999).toString().padStart(3, '0')}`;
export const oneWeek = () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

/**
 * Canonicalizes an object for comparison by sorting keys recursively.
 * This ensures { a: 1, b: 2 } and { b: 2, a: 1 } produce identical strings.
 * Includes circular reference detection to prevent stack overflow DoS.
 */
function canonicalStringify(obj: unknown, seen = new WeakSet<object>()): string {
  if (obj === null || obj === undefined) return JSON.stringify(obj);
  if (typeof obj !== 'object') return JSON.stringify(obj);

  // Circular reference detection
  if (seen.has(obj)) {
    throw new Error('Circular reference detected in command payload');
  }
  seen.add(obj);

  if (Array.isArray(obj)) {
    return JSON.stringify(obj.map((item) => {
      if (item && typeof item === 'object') {
        return JSON.parse(canonicalStringify(item, seen));
      }
      return item;
    }));
  }

  const sorted = Object.keys(obj as Record<string, unknown>)
    .sort()
    .reduce((acc, key) => {
      const value = (obj as Record<string, unknown>)[key];
      if (value !== undefined && typeof value === 'object' && value !== null) {
        acc[key] = JSON.parse(canonicalStringify(value, seen));
      } else {
        acc[key] = value;
      }
      return acc;
    }, {} as Record<string, unknown>);
  return JSON.stringify(sorted);
}

/**
 * Execute a command with atomic idempotency-key claim.
 *
 * Concurrency model (fixes #12 slice 1 / ARCH-02 and #24 / DYN-H1):
 *
 *   1. ATOMIC CLAIM: INSERT a "pending" journal row using
 *      `ON CONFLICT (idempotency_key) DO NOTHING RETURNING ...`. The row that
 *      is actually returned IS the claim. If no row comes back, another
 *      caller already owns this key — we never run the command.
 *
 *   2. LOSER PATH: SELECT the existing row, validate command_name + payload
 *      hash, then either replay the cached result (status='ok' or 'failed')
 *      or throw a SAFE message ("Command already in progress for this
 *      idempotency key.") if the winner is still running.
 *
 *   3. SUCCESS PATH: Run the command inside a transaction, then UPDATE the
 *      pending row to status='ok'/'failed' with the final result. The
 *      catch-path also UPDATEs (never re-INSERTs) the existing in-flight
 *      row, so unique-violations cannot escape into the tRPC envelope and
 *      leak SQL text (#24).
 *
 *   4. DOWNSTREAM OBSERVERS: The DB `command_journal` row is authoritative.
 *      JSONL on-disk audit and socket broadcasts are best-effort downstream
 *      observers; if they throw after the DB transaction commits, the error
 *      is logged but not rethrown and the DB status is NOT flipped (#12
 *      slice 2). A stale pending-claim sweeper is out of scope.
 */
function journalSafePayload(name: string, payload: Record<string, unknown>): Record<string, unknown> {
  if (name === 'createCustomerSheetSnapshot') {
    return redactCustomerSheetSnapshotJournalPayload(payload);
  }
  return payload;
}

export async function executeCommand(input: CommandInput, user: SessionUser, io: SocketServer): Promise<CommandResult> {
  assertCommandAccess(user, input.name);
  const journalPayload = journalSafePayload(input.name, input.payload as Record<string, unknown>);

  const commandId = randomUUID();
  const beforeSnapshot = await snapshotFromPayload(input.payload);

  // ------------------------------------------------------------------------
  // ATOMIC CLAIM
  // ------------------------------------------------------------------------
  const claimRows = await db
    .insert(commandJournal)
    .values({
      id: commandId,
      commandName: input.name,
      idempotencyKey: input.idempotencyKey,
      actorId: user.id,
      actorName: user.name,
      actorRole: user.role,
      reason: input.reason,
      inputPayload: journalPayload,
      status: 'pending',
      affectedIds: [],
      beforeSnapshot,
      afterSnapshot: {},
      result: {}
    })
    .onConflictDoNothing({ target: commandJournal.idempotencyKey })
    .returning();

  if (claimRows.length === 0) {
    // Lost the race. Read the row that beat us.
    const [existing] = await db
      .select()
      .from(commandJournal)
      .where(eq(commandJournal.idempotencyKey, input.idempotencyKey))
      .limit(1);

    if (!existing) {
      // Transient: the conflicting row vanished between INSERT and SELECT
      // (e.g. an admin cleanup). Surface a safe, retryable error.
      throw new Error('Idempotency claim failed: please retry.');
    }

    // Validate command_name + payload — same-key reuse with different
    // command or payload returns a 409-equivalent with a safe message that
    // includes the mismatching values so callers can diagnose the collision.
    if (existing.commandName !== input.name) {
      throw new Error(
        `Idempotency key reused with different command: first used '${existing.commandName}', now '${input.name}'.`
      );
    }
    const existingPayload = canonicalStringify(existing.inputPayload ?? {});
    const currentPayload = canonicalStringify(journalPayload ?? {});
    if (existingPayload !== currentPayload) {
      throw new Error(
        `Idempotency key reused with different payload for command '${input.name}'. Use a unique key for each distinct request.`
      );
    }

    if (existing.status === 'pending') {
      // Orphan pending-claim sweeper (GH #12 slice 2): a pending row that has
      // outlived a reasonable execution window almost certainly belongs to a
      // crashed/timed-out caller. Without this sweep, the idempotency key is
      // permanently denied — every retry sees the orphaned 'pending' row and
      // throws the "already in progress" error forever. Adopt the orphan by
      // flipping it to 'failed' (so the original idempotency key replays a
      // safe failed result on the next attempt) and surface a retryable
      // error to the caller so the retry uses a NEW idempotency key.
      const PENDING_STALE_THRESHOLD_MS = 5 * 60 * 1000;
      const age = Date.now() - new Date(existing.createdAt).getTime();
      if (age > PENDING_STALE_THRESHOLD_MS) {
        const orphanResult: CommandResult = {
          ok: false,
          commandId: existing.id,
          affectedIds: [],
          toast: 'Command timed out without completing. Please retry.'
        };
        // Atomic compare-and-swap: only flip to 'failed' if the row is still
        // 'pending'. Two concurrent sweepers racing on the same stale row will
        // both try this UPDATE, but only one will actually modify the row
        // (the second sees status already != 'pending' and gets zero rows back).
        // If we lost the sweep race, re-read and replay the cached result
        // (which the winning sweeper just wrote) instead of throwing a second
        // timeout error.
        const swept = await db
          .update(commandJournal)
          .set({
            status: 'failed',
            result: orphanResult as unknown as Record<string, unknown>,
            error: 'orphaned: pending claim exceeded stale threshold without completion'
          })
          .where(and(
            eq(commandJournal.id, existing.id),
            eq(commandJournal.status, 'pending')
          ))
          .returning();

        if (swept.length > 0) {
          // We won the sweep — surface a retryable error. We do NOT auto-re-execute
          // under the same idempotency key: the safer contract is that the caller
          // observes the timeout and re-submits with a fresh idempotency key.
          throw new Error('Previous attempt timed out. Please retry with a new request.');
        }

        // Lost the sweep race — another caller already flipped this row.
        // Re-read the current state and replay the cached result so we don't
        // throw a duplicate timeout error.
        const [sweptByAnother] = await db
          .select()
          .from(commandJournal)
          .where(eq(commandJournal.id, existing.id))
          .limit(1);

        if (sweptByAnother && sweptByAnother.status !== 'pending') {
          return sweptByAnother.result as unknown as CommandResult;
        }

        // Extremely unlikely: still pending after losing the sweep race.
        // Fall through to the poll loop below so we don't silently hang.
        // (This path should not be reachable in practice — the winning
        // sweeper's UPDATE committed before our re-read returns.)
      }
      // Winner still running — poll briefly so truly concurrent callers (e.g.
      // two simultaneous network requests with the same key) can replay the
      // winner's result rather than receiving a 500 immediately. This handles
      // the atomic-claim concurrency contract: one INSERT wins, the other polls
      // until the winner commits, then replays the cached result.
      const POLL_INTERVAL_MS = 50;
      const MAX_POLLS = 20; // up to 1 second total wait
      let polled = 0;
      let current = existing;
      while (current.status === 'pending' && polled < MAX_POLLS) {
        await new Promise<void>(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
        const [refreshed] = await db
          .select()
          .from(commandJournal)
          .where(eq(commandJournal.idempotencyKey, input.idempotencyKey))
          .limit(1);
        if (refreshed) current = refreshed;
        polled++;
      }
      if (current.status !== 'pending') {
        // Winner finished — replay the cached result atomically.
        return current.result as unknown as CommandResult;
      }
      // Still pending after polling — winner is taking too long.
      throw new Error('Command already in progress for this idempotency key.');
    }

    // Replay cached result (status 'ok' or 'failed').
    return existing.result as unknown as CommandResult;
  }

  // ------------------------------------------------------------------------
  // WINNER PATH — we own the claim. Execute the command.
  // ------------------------------------------------------------------------
  try {
    const { commandResult, afterSnapshot, storedResult } = await db.transaction(async (tx) => {
      const commandResult = await runCommand(tx, input.name, input.payload, user, commandId, input.reason);
      const afterSnapshot = await snapshotByAffectedIds(tx, commandResult.affectedIds);
      const storedResult = { ...commandResult, toast: commandResult.toast ?? 'Command completed.' };

      // Finalize the claimed row (UPDATE — not re-INSERT — per #92's atomic
      // idempotency claim). result is passed through redactSensitiveDeltaFields
      // so secrets (e.g. mintPhotoUploadToken raw token, #93 F1) never persist.
      await tx
        .update(commandJournal)
        .set({
          status: commandResult.ok ? 'ok' : 'failed',
          affectedIds: commandResult.affectedIds,
          afterSnapshot,
          result: redactSensitiveDeltaFields(input.name, storedResult) as unknown as Record<string, unknown>
        })
        .where(eq(commandJournal.id, commandId));

      return { commandResult, afterSnapshot, storedResult };
    });

    // JSONL on-disk audit also receives the redacted copy — the raw token
    // must never appear on disk either (#93 F1 follow-up from adversarial QA).
    // Reuses the transaction-derived afterSnapshot already persisted to
    // command_journal; later #12 snapshot/lock-order work should make snapshot
    // reads transaction-aware.
    try {
      await appendJsonlJournal({
        id: commandId,
        commandName: input.name,
        actor: user,
        idempotencyKey: input.idempotencyKey,
        reason: input.reason,
        inputPayload: journalPayload,
        beforeSnapshot,
        afterSnapshot,
        result: redactSensitiveDeltaFields(input.name, storedResult),
        createdAt: new Date().toISOString()
      });
    } catch (e) {
      logger.warn('appendJsonlJournal failed after commit', { module: 'commandBus', error: e instanceof Error ? e.message : String(e) });
    }

    try {
      // GH #329: emit only to 'authenticated' room.
      // Strip toast from broadcast: toast strings may contain customer names or
      // other operator-specific data that should not be visible to peer operators.
      // Actors receive their own toast via the mutation's onSuccess callback.
      // Peer clients receive only the cache-invalidation signal (affectedIds).
      emitCommandCompleted(io, {
        commandId,
        commandName: input.name,
        actorId: user.id,
        affectedIds: commandResult.affectedIds
      });
    } catch (e) {
      logger.warn('Socket emit failed after commit', { module: 'commandBus', error: e instanceof Error ? e.message : String(e) });
    }

    // Issue #113 Phase 2 — best-effort PO finalization receipt creation.
    // Runs AFTER the PO transaction commits and AFTER existing observers
    // (JSONL, socket) so a snapshot failure cannot fail the PO command.
    // createPoFinalizationReceipts itself catches and logs internally, but
    // we double-guard here so an unexpected synchronous throw still cannot
    // propagate. See src/server/services/poFinalizationReceipts.ts for the
    // amendment-aware logic and the choice of `pool` over `tx`.
    if (input.name === 'finalizePurchaseOrder' && commandResult.ok && commandResult.affectedIds[0]) {
      try {
        await createPoFinalizationReceipts(
          pool,
          commandResult.affectedIds[0],
          commandId,
          user.id
        );
      } catch (e) {
        logger.warn('PO finalization receipt hook failed after commit', { module: 'commandBus', error: e instanceof Error ? e.message : String(e) });
      }
    }

    // Issue #113 Phase 3 — best-effort sales-confirmation receipt creation.
    if (input.name === 'confirmSalesOrder' && commandResult.ok && commandResult.affectedIds[0]) {
      try {
        await createSalesConfirmationReceipts(
          pool,
          commandResult.affectedIds[0],
          commandId,
          user.id
        );
      } catch (e) {
        logger.warn('Sales-confirmation receipt hook failed after commit', { module: 'commandBus', error: e instanceof Error ? e.message : String(e) });
      }
    }

    // Issue #113 Phase 3 — best-effort invoice receipt creation on postSalesOrder.
    if (input.name === 'postSalesOrder' && commandResult.ok && commandResult.affectedIds[0]) {
      try {
        await createInvoiceReceipts(pool, commandResult.affectedIds[0], commandId, user.id);
      } catch (e) {
        logger.warn('Invoice receipt hook failed after commit', { module: 'commandBus', error: e instanceof Error ? e.message : String(e) });
      }
    }

    // Issue #113 Phase 4 — logPayment only (not postLedgerRow indirect payments)
    if (input.name === 'logPayment' && commandResult.ok && commandResult.affectedIds[0]) {
      try {
        await createPaymentReceivedReceipts(pool, commandResult.affectedIds[0], commandId, user.id);
      } catch (e) {
        logger.warn('Payment received receipt hook failed after commit', { module: 'commandBus', error: e instanceof Error ? e.message : String(e) });
      }
    }

    // recordVendorPayment returns affectedIds = [billId, vendorPaymentId] → index 1
    if (input.name === 'recordVendorPayment' && commandResult.ok && commandResult.affectedIds[1]) {
      try {
        await createVendorPayoutReceipts(pool, commandResult.affectedIds[1], commandId, user.id);
      } catch (e) {
        logger.warn('Vendor payout receipt hook failed after commit', { module: 'commandBus', error: e instanceof Error ? e.message : String(e) });
      }
    }

    // Barter settlement receipts
    if (commandResult.ok && (input.name === 'payWithProduct' || input.name === 'settleDebtWithProduct')) {
      const settlementIds = (commandResult.affectedIds || []).filter((id: string) => {
        // The settlement ID is the first affected ID for barter commands
        return id && id.length === 36;
      });
      for (const settlementId of settlementIds) {
        try {
          await createBarterReceipts(pool, settlementId);
        } catch (err) {
          logger.warn({ err, settlementId }, 'Barter receipt generation failed (non-fatal)');
        }
      }
    }

    // CAP-030 / TER-1518 — emit pick:queue and/or pick:order:{orderId} after pick mutations commit.
    // These events let warehouse pick screens refresh without waiting for react-query's staleness interval.
    // Gracefully no-ops if socket server is not initialized or orderId is missing.
    const PICK_QUEUE_AND_ORDER_CMDS = ['releaseLineForPicking', 'releaseLinesForPicking', 'recallLineFromPicking'];
    const PICK_ORDER_ONLY_CMDS = ['recordWeighAndPack', 'adjustFulfillmentLine', 'acknowledgeWarehouseAlert', 'returnPickedUnits', 'cancelFulfillmentLine'];
    if (commandResult.ok && commandResult.orderId) {
      try {
        if (PICK_QUEUE_AND_ORDER_CMDS.includes(input.name)) {
          emitPickOrderAndQueue(commandResult.orderId, { kind: input.name, at: new Date().toISOString() });
        } else if (PICK_ORDER_ONLY_CMDS.includes(input.name)) {
          emitPickEvent(`pick:order:${commandResult.orderId}`, { kind: input.name, at: new Date().toISOString() });
        }
      } catch (e) {
        logger.warn('Pick event emit failed after commit', { module: 'commandBus', error: e instanceof Error ? e.message : String(e) });
      }
    }

    // Emit sales:order:*:line:changed so the sales grid refreshes pick status
    // badges in real time and picker screens know when order lines change.
    // Intentionally mirrors PICK_QUEUE_AND_ORDER_CMDS. If you add a command to one, update the other.
    const SALES_LINE_CMDS = ['releaseLineForPicking', 'releaseLinesForPicking', 'recallLineFromPicking', 'removeSalesOrderLine'];
    if (commandResult.ok && commandResult.orderId && SALES_LINE_CMDS.includes(input.name)) {
      try {
        emitSalesLineEvent(commandResult.orderId, {
          kind: input.name,
          lineId: typeof commandResult.affectedIds?.[0] === 'string' ? commandResult.affectedIds[0] : undefined,
          at: new Date().toISOString(),
        });
      } catch (e) {
        logger.warn('Sales line event emit failed after commit', { module: 'commandBus', error: e instanceof Error ? e.message : String(e) });
      }
    }

    return storedResult;
  } catch (error) {
    // Scrub any Postgres/Drizzle error text before it flows into result.toast.
    // The catch path returns failed as a normal tRPC response, which bypasses
    // the errorFormatter — so an authenticated caller could still enumerate
    // schema by triggering FK/unique violations from inside a command without
    // this guard (#24 catch-path follow-up surfaced by adversarial QA).
    const { safeMessage } = scrubDatabaseError(error);
    const rawMessage = error instanceof Error ? error.message : 'Command failed.';
    const failed: CommandResult = { ok: false, commandId, affectedIds: [], toast: safeMessage };
    // UPDATE the existing in-flight row to 'failed' — DO NOT re-INSERT.
    // The previous design tried to insert a new row with the same
    // idempotencyKey here, which raced the unique index and leaked the
    // full INSERT statement through the tRPC envelope (#24 DYN-H1).
    await db
      .update(commandJournal)
      .set({
        status: 'failed',
        result: failed as unknown as Record<string, unknown>,
        // Preserve the raw message server-side (NOT exposed to clients —
        // the journal is read by reverseCommandById + admin tools only).
        error: rawMessage
      })
      .where(eq(commandJournal.id, commandId));

    try {
      await appendJsonlJournal({
        id: commandId,
        commandName: input.name,
        actor: user,
        idempotencyKey: input.idempotencyKey,
        reason: input.reason,
        inputPayload: journalPayload,
        beforeSnapshot,
        result: failed,
        error: rawMessage,
        createdAt: new Date().toISOString()
      });
    } catch (e) {
      logger.warn('appendJsonlJournal failed on failure path', { module: 'commandBus', error: e instanceof Error ? e.message : String(e) });
    }

    // GH #329: emit only to 'authenticated' room — must use scrubbed
    // message, not the raw one.
    try {
      emitCommandFailed(io, { commandId, commandName: input.name, actorId: user.id, toast: safeMessage });
    } catch (e) {
      logger.warn('Socket emit failed on failure path', { module: 'commandBus', error: e instanceof Error ? e.message : String(e) });
    }

    return failed;
  }
}

// Exported for focused commandBus tests / dispatcher-level QA.
export async function runCommand(tx: Tx, name: CommandName, payload: Payload, user: SessionUser, commandId: string, reason?: string): Promise<CommandResult> {
  switch (name) {
    case 'createBatch':
      return createBatch(tx, payload, commandId);
    case 'updateBatch':
      return updateBatch(tx, payload, commandId);
    case 'deleteBatch':
      return deleteBatch(tx, payload, commandId);
    case 'postPurchaseReceipt':
      return postPurchaseReceipt(tx, payload, commandId, reason);
    case 'createPurchaseOrder':
      return createPurchaseOrder(tx, payload, user.id, commandId);
    case 'updatePurchaseOrder':
      return updatePurchaseOrder(tx, payload, commandId);
    case 'addPurchaseOrderLine':
      return addPurchaseOrderLine(tx, payload, commandId);
    case 'updatePurchaseOrderLine':
      return updatePurchaseOrderLine(tx, payload, commandId);
    case 'removePurchaseOrderLine':
      return removePurchaseOrderLine(tx, payload, commandId);
    case 'finalizePurchaseOrder':
      return finalizePurchaseOrder(tx, payload, user.id, commandId);
    case 'unfinalizePurchaseOrder':
      return unfinalizePurchaseOrder(tx, payload, commandId);
    case 'approvePurchaseOrder':
      return approvePurchaseOrder(tx, payload, user.id, commandId);
    case 'recordVendorPrepayment':
      return recordVendorPrepayment(tx, payload, commandId);
    case 'receivePurchaseOrder':
      return receivePurchaseOrder(tx, payload, commandId);
    case 'cancelPurchaseOrder':
      return cancelPurchaseOrder(tx, payload, commandId);
    case 'rejectBatch':
      return rejectBatch(tx, payload, commandId);
    case 'flagBatch':
      return flagBatch(tx, payload, commandId);
    case 'verifyAllIntake':
      return verifyAllIntake(tx, payload, commandId, reason);
    case 'adjustBatchQuantity':
      return adjustBatchQuantity(tx, payload, commandId, reason);
    case 'setInventoryStatus':
      return setInventoryStatus(tx, payload, commandId, reason);
    case 'transferInventoryLocation':
      return transferInventoryLocation(tx, payload, commandId, reason);
    case 'transferInventoryOwnership':
      return transferInventoryOwnership(tx, payload, commandId, reason);
    case 'setBatchPrice':
      return updateBatch(tx, { ...payload, unitPrice: requiredNumber(payload.unitPrice, 'unitPrice') }, commandId, 'Batch price updated.');
    case 'setBatchLotInfo':
      return updateBatch(tx, payload, commandId, 'Lot information updated.');
    case 'attachBatchPhoto':
      return attachBatchPhoto(tx, payload, user.id, commandId);
    case 'deleteBatchMedia':
      return deleteBatchMedia(tx, payload, commandId);
    case 'publishBatchMedia':
      return publishBatchMedia(tx, payload, commandId);
    case 'setBatchMediaRole':
      return setBatchMediaRole(tx, payload, commandId);
    case 'uploadBatchMedia':
      return uploadBatchMedia(tx, payload, user.id, commandId);
    case 'importBatchesCsv':
      return importBatchesCsv(tx, payload, commandId);
    case 'applyTags':
      return applyTags(tx, payload, commandId);
    case 'createSalesOrder':
      return createSalesOrder(tx, payload, commandId);
    case 'addSalesOrderLine':
      return addSalesOrderLine(tx, payload, commandId);
    case 'updateSalesOrderLine':
      return updateSalesOrderLine(tx, payload, commandId);
    case 'removeSalesOrderLine':
      return removeSalesOrderLine(tx, payload, commandId);
    case 'reserveInventoryForOrder':
      return reserveInventoryForOrder(tx, payload, commandId);
    case 'priceSalesOrder':
      return priceSalesOrder(tx, payload, commandId);
    case 'confirmSalesOrder':
      return confirmSalesOrder(tx, payload, commandId);
    case 'cancelSalesOrder':
      return cancelSalesOrder(tx, payload, commandId);
    case 'postSalesOrder':
      return postSalesOrder(tx, payload, commandId);
    case 'allocateOrderToFulfillment':
    case 'createPickList':
      return allocateOrderToFulfillment(tx, payload, user.id, commandId);
    case 'releaseLineForPicking':
      return releaseLineForPicking(tx, payload, user.id, commandId);
    case 'releaseLinesForPicking':
      return releaseLinesForPicking(tx, payload, user.id, commandId);
    case 'recallLineFromPicking':
      return recallLineFromPicking(tx, payload, commandId);
    case 'acknowledgeWarehouseAlert':
      return acknowledgeWarehouseAlert(tx, payload, commandId);
    case 'returnPickedUnits':
      return returnPickedUnits(tx, payload, commandId);
    case 'cancelFulfillmentLine':
      return cancelFulfillmentLine(tx, payload, commandId);
    case 'applyClientCredit':
      return applyClientCredit(tx, payload, commandId);
    case 'setDeliveryWindow':
      return setDeliveryWindow(tx, payload, commandId);
    case 'logPayment':
      return logPayment(tx, payload, commandId);
    case 'allocatePayment':
      return allocatePayment(tx, payload, commandId);
    case 'unallocatePayment':
      return unallocatePayment(tx, payload, commandId);
    case 'refundPayment':
      return refundPayment(tx, payload, commandId);
    case 'markPaymentUnapplied':
      return markPaymentUnapplied(tx, payload, commandId);
    case 'applyDiscount':
      return applyDiscount(tx, payload, commandId);
    case 'createVendorBill':
      return createVendorBill(tx, payload, commandId);
    case 'approveVendorBill':
      return updateVendorBillStatus(tx, payload, 'approved', commandId, 'Vendor bill approved.');
    case 'scheduleVendorPayment':
      return scheduleVendorPayment(tx, payload, commandId);
    case 'recordVendorPayment':
      return recordVendorPayment(tx, payload, commandId);
    case 'voidVendorPayment':
      return voidVendorPayment(tx, payload, commandId);
    case 'payWithProduct':
      return payWithProduct(tx, payload, user, commandId);
    case 'settleDebtWithProduct':
      return settleDebtWithProduct(tx, payload, user, commandId);
    case 'recordWeighAndPack':
      return recordWeighAndPack(tx, payload, commandId);
    case 'markOrderFulfilled':
      return markOrderFulfilled(tx, payload, commandId);
    case 'printLabels':
      return printLabels(tx, payload, commandId);
    case 'adjustFulfillmentLine':
      return recordWeighAndPack(tx, payload, commandId, 'Fulfillment line adjusted.');
    case 'approveConnectorRequest':
      return reviewConnectorRequest(tx, payload, 'approved', user, commandId);
    case 'rejectConnectorRequest':
      return reviewConnectorRequest(tx, payload, 'rejected', user, commandId);
    case 'routeConnectorRequest':
      return reviewConnectorRequest(tx, payload, 'routed', user, commandId);
    case 'createCorrectionJournalEntry':
      return createCorrectionJournalEntry(tx, payload, commandId);
    case 'postTransactionLedgerRow':
      return postTransactionLedgerRow(tx, payload, user, commandId);
    case 'upsertTransactionType':
      return upsertTransactionType(tx, payload, commandId);
    case 'reverseCommandById':
      return reverseCommandById(tx, payload, commandId);
    case 'documentCommandFailure':
      return documentCommandFailure(tx, payload, commandId);
    case 'restoreFromBackupPoint':
      return restoreFromBackupPoint(tx, payload, commandId);
    case 'repriceOrder':
      return priceSalesOrder(tx, payload, commandId, 'Order repriced.');
    case 'postPeriodAdjustments':
      return postPeriodAdjustments(tx, payload, commandId);
    case 'lockPeriod':
      return lockPeriod(tx, payload, user.id, commandId);
    case 'archivePeriod':
      return archivePeriod(tx, payload, commandId);
    case 'createVendor':
      return createVendor(tx, payload, commandId);
    case 'createCustomerNeed':
      return createCustomerNeed(tx, payload, user.id, commandId);
    case 'updateCustomerNeed':
      return updateCustomerNeed(tx, payload, commandId);
    case 'createVendorSupply':
      return createVendorSupply(tx, payload, commandId);
    case 'updateVendorSupply':
      return updateVendorSupply(tx, payload, commandId);
    case 'acceptMatchmakingMatch':
      return reviewMatchmakingMatch(tx, payload, 'accepted', user.id, commandId);
    case 'dismissMatchmakingMatch':
      return reviewMatchmakingMatch(tx, payload, 'dismissed', user.id, commandId);
    case 'reopenMatchmakingMatch':
      return reopenMatchmakingMatch(tx, payload, user.id, commandId);
    case 'updateMatchmakingSettings':
      return updateMatchmakingSettings(tx, payload, user.id, commandId);
    case 'noteMatchmakingOutreach':
      return noteMatchmakingOutreach(tx, payload, user.id, commandId);
    case 'dismissMatchmakingWorkQueueItem':
      return dismissMatchmakingWorkQueueItem(tx, payload, user.id, commandId);
    case 'setItemAlias':
      return setItemAlias(tx, payload, commandId);
    case 'createReferee':
      return createReferee(tx, payload, commandId);
    case 'updateReferee':
      return updateReferee(tx, payload, commandId);
    case 'addRefereeRelationship':
      return addRefereeRelationship(tx, payload, commandId);
    case 'updateRefereeRelationship':
      return updateRefereeRelationship(tx, payload, commandId);
    case 'deactivateRefereeRelationship':
      return deactivateRefereeRelationship(tx, payload, commandId);
    case 'voidRefereeCredit':
      return voidRefereeCreditCommand(tx, payload, commandId);
    case 'createPaymentProcessor':
      return createPaymentProcessor(tx, payload, commandId);
    case 'markUserFeeCollected':
      return markUserFeeCollected(tx, payload, commandId);
    case 'updateProcessorFeeStatus':
      return updateProcessorFeeStatus(tx, payload, commandId);
    case 'setCustomerCreditLimit':
      return setCustomerCreditLimit(tx, payload, user, commandId);
    case 'revertCustomerCreditToEngine':
      return revertCustomerCreditToEngine(tx, payload, commandId);
    case 'snoozeCustomerCreditReminder':
      return snoozeCustomerCreditReminder(tx, payload, commandId);
    case 'setCustomerEngineMax':
      return setCustomerEngineMax(tx, payload, commandId);
    case 'setCustomerStance':
      return setCustomerStance(tx, payload, commandId);
    case 'disableCreditEngineForCustomer':
      return disableCreditEngineForCustomer(tx, payload, user.id, commandId);
    case 'enableCreditEngineForCustomer':
      return enableCreditEngineForCustomer(tx, payload, commandId);
    case 'createCreditEngineStance':
      return createCreditEngineStance(tx, payload, user.id, commandId);
    case 'updateCreditEngineStance':
      return updateCreditEngineStance(tx, payload, user.id, commandId);
    case 'deleteCreditEngineStance':
      return deleteCreditEngineStance(tx, payload, user.id, commandId);
    case 'setCreditEngineConfig':
      return setCreditEngineConfig(tx, payload, user.id, commandId);
    case 'bulkRevertCustomersToEngine':
      return bulkRevertCustomersToEngine(tx, payload, user, commandId);
    case 'setLineLandedCost':
      return setLineLandedCost(tx, payload, user, commandId);
    case 'createCustomerSheetSnapshot':
      return createCustomerSheetSnapshot(tx, payload, user, commandId);
    case 'setLineBelowFloorReason':
      return setLineBelowFloorReason(tx, payload, commandId);
    case 'resolveVendorApproval':
      return resolveVendorApproval(tx, payload, commandId);
    case 'setCustomerPricingRule':
      return setCustomerPricingRule(tx, payload, commandId);
    case 'setDefaultPricingRule':
      return setDefaultPricingRule(tx, payload, commandId);
    case 'updateSystemSetting':
      return updateSystemSetting(tx, payload, commandId);
    case 'mintPhotoUploadToken':
      return mintPhotoUploadToken(tx, payload, user.id, commandId);
    case 'revokePhotoUploadToken':
      return revokePhotoUploadToken(tx, payload, commandId);
    // ─── Contacts system (CAP-033 / TER-1564) ─────────────────────────────
    case 'createContact':
      return createContact(tx, payload, commandId);
    case 'updateContact':
      return updateContact(tx, payload, commandId);
    case 'archiveContact':
      return archiveContact(tx, payload, user, commandId);
    case 'addContactRole':
      return addContactRole(tx, payload, commandId);
    case 'linkContactToExistingEntity':
      return linkContactToExistingEntity(tx, payload, commandId);
    case 'linkContactToUser':
      return linkContactToUser(tx, payload, commandId);
    case 'createAppointment':
      return createAppointment(tx, payload, user.id, commandId);
    case 'updateAppointment':
      return updateAppointment(tx, payload, commandId);
    case 'cancelAppointment':
      return cancelAppointment(tx, payload, commandId);
    case 'completeAppointment':
      return completeAppointment(tx, payload, commandId);
    case 'updateVendor':
      return updateVendor(tx, payload, commandId);
    case 'updateProcessor':
      return updateProcessor(tx, payload, commandId);
    case 'createItem':
      return createItem(tx, payload, commandId);
    case 'updateItem':
      return updateItem(tx, payload, commandId);
    case 'toggleItemStatus':
      return toggleItemStatus(tx, payload, commandId);
    case 'resolveInvoiceDispute':
      return resolveInvoiceDispute(tx, payload, commandId);
    case 'rejectInvoiceDispute':
      return rejectInvoiceDispute(tx, payload, commandId);
    // D2 — merge candidate review (RBAC + audit trail)
    case 'approveMergeCandidate':
      return approveMergeCandidate(tx, payload, commandId);
    case 'dismissMergeCandidate':
      return dismissMergeCandidate(tx, payload, commandId);
    default:
      throw new Error(`Command not yet implemented in commandBus: ${name}`);
  }
}

async function applyTags(tx: Tx, payload: Payload, commandId: string): Promise<CommandResult> {
  const entityType = requiredString(payload.entityType, 'entityType');
  const entityId = requiredId(payload.entityId ?? payload.id, 'entityId');
  const incoming = tagValue(payload.tags);
  const mode = stringValue(payload.mode) || 'replace';
  if (!['add', 'remove', 'replace'].includes(mode)) throw new Error('Tag mode must be add, remove, or replace.');
  if (!incoming.length && mode !== 'replace') throw new Error('Enter at least one tag.');

  const current = await taggedEntity(tx, entityType, entityId);
  const currentTags = tagValue(current.tags);
  const nextTags =
    mode === 'add'
      ? [...new Set([...currentTags, ...incoming])]
      : mode === 'remove'
        ? currentTags.filter((tag) => !incoming.includes(tag))
        : incoming;

  await ensureTagCatalog(tx, nextTags);
  await updateTaggedEntity(tx, entityType, entityId, nextTags);
  if (entityType === 'customerNeed') await rebuildMatchesForNeed(tx, entityId);
  if (entityType === 'vendorSupply') await rebuildMatchesForSupply(tx, entityId);

  return {
    ok: true,
    commandId,
    affectedIds: [entityId],
    toast: nextTags.length ? `Tags updated: ${nextTags.join(', ')}.` : 'Tags cleared.',
    delta: { entityType, entityId, tags: nextTags }
  };
}

async function setItemAlias(tx: Tx, payload: Payload, commandId: string): Promise<CommandResult> {
  const itemId = requiredId(payload.itemId ?? payload.id, 'itemId');
  const [item] = await tx.select().from(items).where(eq(items.id, itemId)).limit(1);
  if (!item) throw new Error('Item not found.');
  const rawAlias = payload.alias;
  const trimmed = typeof rawAlias === 'string' ? rawAlias.trim() : '';
  if (trimmed.length > 120) throw new Error('Alias must be 120 characters or fewer.');
  const nextAlias = trimmed.length ? trimmed : null;
  if ((item.alias ?? null) === nextAlias) {
    return { ok: true, commandId, affectedIds: [itemId], toast: nextAlias ? `${item.name} alias already set to ${nextAlias}.` : `${item.name} has no alias.`, delta: { alias: nextAlias, unchanged: true } };
  }
  await tx.update(items).set({ alias: nextAlias, updatedAt: new Date() }).where(eq(items.id, itemId));
  const toast = nextAlias ? `${item.name} alias set to ${nextAlias}.` : `${item.name} alias cleared.`;
  return { ok: true, commandId, affectedIds: [itemId], toast, delta: { previousAlias: item.alias ?? null, alias: nextAlias } };
}

export async function resolveItemAlias(tx: Tx, itemId: string | null | undefined): Promise<string | null> {
  if (!itemId) return null;
  const [row] = await tx.select({ alias: items.alias }).from(items).where(eq(items.id, itemId)).limit(1);
  return row?.alias ?? null;
}

export const EDITABLE_SALES_ORDER_STATUSES = new Set(['draft', 'confirmed']);

export async function assertSalesOrderEditableById(tx: Tx, orderId: string): Promise<void> {
  const [order] = await tx.select().from(salesOrders).where(eq(salesOrders.id, orderId)).limit(1);
  if (!order) throw new Error('Sales order not found.');
  if (order.archivedAt != null) {
    throw new Error(
      `Sales order is archived and is not editable. ` +
      `Reopen or restore the order before changing COGS / below-floor / vendor-approval / line state.`
    );
  }
  if (!EDITABLE_SALES_ORDER_STATUSES.has(String(order.status))) {
    throw new Error(
      `Sales order is ${order.status} and is not editable. ` +
      `Only draft or confirmed orders can have COGS / below-floor / vendor-approval / line state changed.`
    );
  }
}

/**
 * TER-1634 / F-28: Read-derived draft reservation projection.
 *
 * Returns a map of batchId → total qty currently held by *other* draft/confirmed
 * sales orders so the availability guard in addSalesOrderLine and
 * updateSalesOrderLine can account for competing drafts before a hard reserve.
 *
 * IMPORTANT: This is a soft guard only.  The hard TOCTOU close happens at
 * reserveInventoryForOrder via a FOR UPDATE row-lock on the batch (GH #249).
 * Two operators who read this projection simultaneously (before either commits)
 * can both pass the soft guard — the residual race window is documented and
 * known.  This guard narrows the window in the common sequential case.
 *
 * Uses tx.execute() with raw SQL so it works with the existing test mock tx
 * (which returns `{ rows: [] }` for all execute calls → draftReservedQty=0,
 * falling back to the original availableQty - reservedQty guard semantics).
 *
 * @param tx             Drizzle transaction — keeps the read within the tx
 * @param batchIds       Batch UUIDs to check — pass only the IDs in scope
 * @param excludeOrderId UUID of the current order; own lines are excluded so
 *                       operators don't double-count their own existing lines
 */
export async function getDraftReservedQtyMap(
  tx: Tx,
  batchIds: string[],
  excludeOrderId?: string
): Promise<Record<string, number>> {
  if (!batchIds.length) return {};

  // Build `$1::uuid, $2::uuid, ...` placeholders via sql.join so drizzle
  // parameterizes each UUID correctly without manual string interpolation.
  const batchIdList = sql.join(
    batchIds.map((id) => sql`${id}::uuid`),
    sql`, `
  );
  const excludeClause = excludeOrderId
    ? sql`AND sol.order_id != ${excludeOrderId}::uuid`
    : sql``;

  const result = await tx.execute<{ batch_id: string; draft_reserved_qty: string }>(sql`
    SELECT sol.batch_id,
           SUM(sol.qty)::numeric(12,3) AS draft_reserved_qty
    FROM   sales_order_lines sol
    JOIN   sales_orders so ON so.id = sol.order_id
    WHERE  so.status IN ('draft', 'confirmed')
      AND  sol.status NOT IN ('reserved', 'allocated', 'posted', 'cancelled')
      AND  sol.batch_id IN (${batchIdList})
      ${excludeClause}
    GROUP BY sol.batch_id
  `);

  const map: Record<string, number> = {};
  for (const row of result.rows) {
    map[row.batch_id] = Number(row.draft_reserved_qty);
  }
  return map;
}

export async function loadDefaultPricingRule(tx: Tx) {
  const rows = await tx.select().from(systemSettings).where(eq(systemSettings.key, 'pricing.defaults')).limit(1);
  return asCustomerPricingRule(rows[0]?.value ?? null);
}

export async function loadCategoriesForLines(
  tx: Tx,
  lines: Array<typeof salesOrderLines.$inferSelect>
): Promise<Map<string, string | undefined>> {
  const batchIds = Array.from(
    new Set(
      lines
        .map((line) => (line.batchId ? String(line.batchId) : null))
        .filter((id): id is string => Boolean(id))
    )
  );
  if (!batchIds.length) return new Map();
  const rows = await tx
    .select({ id: batches.id, category: batches.category })
    .from(batches)
    .where(inArray(batches.id, batchIds));
  const map = new Map<string, string | undefined>();
  for (const row of rows as Array<{ id: string; category: string | null }>) {
    map.set(String(row.id), row.category ?? undefined);
  }
  return map;
}

export async function refreshOrderExceptionRollup(tx: Tx, orderId: string): Promise<void> {
  const lines = await tx.select().from(salesOrderLines).where(eq(salesOrderLines.orderId, orderId));
  const exceptionLines: ExceptionLine[] = lines.map((line: typeof salesOrderLines.$inferSelect) => ({
    qty: Number(line.qty),
    unitPrice: Number(line.unitPrice),
    unitCost: Number(line.unitCost),
    priceFloor: line.priceFloor != null ? Number(line.priceFloor) : null,
    belowFloorReason: (line.belowFloorReason as BelowFloorReason | null) ?? null,
    vendorApprovalState: (line.vendorApprovalState as VendorApprovalState) ?? 'none'
  }));
  const totals = computeOrderExceptionTotals(exceptionLines);
  await tx
    .update(salesOrders)
    .set({ vendorApprovalPending: totals.vendorApprovalPending, updatedAt: new Date() })
    .where(eq(salesOrders.id, orderId));
}

// createCustomerSheetSnapshot → @/domains/intake (P1.INT.EXTRACT)

function findExceptionBlockedLine(
  lines: Array<typeof salesOrderLines.$inferSelect>
): { line: typeof salesOrderLines.$inferSelect; reason: ConfirmOrPostBlockedReason } | null {
  for (const line of lines) {
    const candidate: CanConfirmOrPostLine = {
      batchId: line.batchId,
      itemName: line.itemName,
      unitCostResolved: line.unitCostResolved !== false,
      unitPrice: Number(line.unitPrice),
      unitCost: Number(line.unitCost),
      priceFloor: line.priceFloor != null ? Number(line.priceFloor) : null,
      belowFloorReason: (line.belowFloorReason as BelowFloorReason | null) ?? null,
      vendorApprovalState: (line.vendorApprovalState as VendorApprovalState) ?? 'none'
    };
    const reason = canConfirmOrPost(candidate);
    if (reason) return { line, reason };
  }
  return null;
}

function formatExceptionBlockerMessage(
  blocker: { line: typeof salesOrderLines.$inferSelect; reason: ConfirmOrPostBlockedReason },
  phase: 'confirming' | 'posting'
): string {
  const name = blocker.line.itemName;
  switch (blocker.reason) {
    case 'cogs_unresolved':
      return `${name} needs landed COGS picked before ${phase}. Use setLineLandedCost.`;
    case 'vendor_approval_pending':
      return `${name} is waiting on vendor approval. Resolve vendor approval before ${phase}.`;
    case 'vendor_approval_declined':
      return `${name} had vendor approval declined. Reprice above the floor or re-request approval before ${phase}.`;
    case 'below_floor_reason_missing':
      return `${name} is priced below its floor; record a below-floor reason before ${phase}.`;
  }
}

export async function updateSystemSetting(tx: Tx, payload: Payload, commandId: string): Promise<CommandResult> {
  const key = String(payload.key ?? '').trim();
  if (!key) throw new Error('Setting key is required.');
  if (key.length > 80) throw new Error('Setting key must be 80 characters or fewer.');
  // value must be a plain object — reject arrays, primitives, null
  const value = payload.value;
  if (value !== undefined && value !== null && (typeof value !== 'object' || Array.isArray(value))) {
    throw new Error('Setting value must be a JSON object (not an array, primitive, or null).');
  }
  const cleanValue = (value && typeof value === 'object' && !Array.isArray(value)) ? value as Record<string, unknown> : {};

  const [existing] = await tx.select().from(systemSettings).where(eq(systemSettings.key, key)).limit(1);
  let affectedId: string;
  if (existing) {
    await tx
      .update(systemSettings)
      .set({ value: cleanValue, updatedAt: new Date() })
      .where(eq(systemSettings.key, key));
    affectedId = existing.id;
  } else {
    const inserted = await tx
      .insert(systemSettings)
      .values({ key, value: cleanValue })
      .returning();
    affectedId = inserted[0]?.id ?? key;
  }
  invalidateReferenceCache();
  return {
    ok: true,
    commandId,
    affectedIds: [affectedId],
    toast: `System setting "${key}" updated.`,
    delta: { key, value: cleanValue, priorValue: existing?.value ?? null }
  };
}

export function validatePricingRulePayload(value: unknown): Record<string, unknown> {
  // Migrate old flat categories shape { category: { basis, amount } }
  // to new nested shape { category: { rule: { basis, amount } } }
  // so existing saved pricing rules continue to work.
  if (value && typeof value === 'object' && 'categories' in value) {
    const categories = (value as Record<string, unknown>).categories;
    if (categories && typeof categories === 'object') {
      const migrated: Record<string, unknown> = {};
      for (const [key, entry] of Object.entries(categories as Record<string, unknown>)) {
        if (entry && typeof entry === 'object' && 'basis' in entry && 'amount' in entry) {
          // Old flat PricingRuleEntry — wrap into new CategoryPricingEntry shape
          migrated[key] = { rule: entry };
        } else {
          migrated[key] = entry;
        }
      }
      value = { ...(value as Record<string, unknown>), categories: migrated };
    }
  }
  const parsed = customerPricingRuleSchema.safeParse(value ?? {});
  if (!parsed.success) {
    const detail = parsed.error.issues.map((issue) => issue.message).join('; ');
    throw new Error(`Invalid pricing rule: ${detail || 'malformed payload.'}`);
  }
  return parsed.data as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Photo Upload Tokens (issue #73)
// Mint / revoke tokenized share links for the photographer mobile upload
// flow. The raw token value is returned ONCE to the caller; only the sha256
// hash is persisted. See src/server/services/photoUploadTokens.ts for the
// runtime verification path used by the upload middleware.
//
// IMPORTANT: the raw token MUST NOT appear in the journal payload, snapshot,
// or toast — only the tokenId and expiresAt are safe to persist. The mint
// command returns the raw token via the `result.delta` channel for the UI to
// display once and then discard.
// ---------------------------------------------------------------------------

// allocateOrderToFulfillment → @/domains/pick (P1.PICK.EXTRACT)

// createVendorBill → stays in commandBus
// createVendorBill → @/domains/vendor-management (P1.VM.EXTRACT)
// updateVendorBillStatus → @/domains/vendor-management (P1.VM.EXTRACT)

// recordWeighAndPack → @/domains/pick (P1.PICK.EXTRACT)

// markOrderFulfilled → stays in commandBus
async function markOrderFulfilled(tx: Tx, payload: Payload, commandId: string): Promise<CommandResult> {
  markOrderFulfilledPayloadSchema.parse(payload);
  const orderId = requiredId(payload.orderId, 'orderId');
  const [order] = await tx.select().from(salesOrders).where(eq(salesOrders.id, orderId)).limit(1);
  if (!order) throw new Error('Sales order not found.');
  if (order.status !== 'posted') throw new Error(`${order.orderNo} must be posted before fulfillment.`);
  const [pick] = await tx.select().from(pickLists).where(eq(pickLists.orderId, orderId)).limit(1);
  if (!pick) throw new Error('Create a pick list before marking fulfilled.');
  const lines = await tx.select().from(fulfillmentLines).where(eq(fulfillmentLines.pickListId, pick.id));
  const unpacked = lines.find((line: typeof fulfillmentLines.$inferSelect) => Number(line.actualQty) <= 0);
  if (unpacked) throw new Error('Every fulfillment line needs an actual quantity before fulfillment.');
  await tx.update(pickLists).set({ status: 'fulfilled', tracking: stringValue(payload.tracking) || pick.tracking, updatedAt: new Date() }).where(eq(pickLists.id, pick.id));
  await tx.update(salesOrders).set({ status: 'fulfilled', packed: true, fulfilledAt: new Date(), updatedAt: new Date() }).where(eq(salesOrders.id, orderId));
  await tx.update(salesOrderLines).set({ packed: true, updatedAt: new Date() }).where(eq(salesOrderLines.orderId, orderId));
  await writeBagManifest(tx, pick.id);
  return { ok: true, commandId, affectedIds: [orderId, pick.id, ...lines.map((line: typeof fulfillmentLines.$inferSelect) => line.id)], toast: 'Order fulfilled.' };
}

// releaseLineForPicking & releaseLinesForPicking → @/domains/pick (P1.PICK.EXTRACT)

// markOrderFulfilled → stays in commandBus
// Two paths depending on pick progress:
//   • actualQty = 0 (nothing picked): deletes the fulfillment line; if the pick list
//     is then empty, deletes it too. Always clears pickReleasedAt/By on the SOL.
//   • actualQty > 0 (line picked or packed): does NOT delete the FL. Instead sets
//     statusExtended = 'recall_pending' and appends a warehouse alert so the picker
//     must acknowledge before the line can be re-packed. pickReleasedAt is still
//     cleared on the SOL so a subsequent releaseLineForPicking call can re-enter
//     the line into the queue (reusing the existing FL, which retains its alerts
//     until acknowledged by the picker).
// recallLineFromPicking → @/domains/pick (P1.PICK.EXTRACT)

// acknowledgeWarehouseAlert → stays in commandBus
// Splices the indexed alert out of the warehouse_alerts array. If no alerts remain,
// clears status_extended (so a 'recall_pending' marker auto-clears once the warehouse
// has reconciled every conflict the sales side raised).
async function acknowledgeWarehouseAlert(tx: Tx, payload: Payload, commandId: string): Promise<CommandResult> {
  const fulfillmentLineId = requiredId(payload.fulfillmentLineId ?? payload.id, 'fulfillmentLineId');
  const alertIndex = typeof payload.alertIndex === 'number'
    ? payload.alertIndex
    : Number.parseInt(String(payload.alertIndex), 10);
  if (!Number.isInteger(alertIndex) || alertIndex < 0) throw new Error('alertIndex must be a non-negative integer.');
  const [fl] = await tx.select().from(fulfillmentLines).where(eq(fulfillmentLines.id, fulfillmentLineId)).limit(1);
  if (!fl) throw new Error('Fulfillment line not found.');
  const alerts = Array.isArray(fl.warehouseAlerts) ? [...(fl.warehouseAlerts as Array<Record<string, unknown>>)] : [];
  if (alertIndex >= alerts.length) {
    throw new Error(`Alert index ${alertIndex} is out of range (${alerts.length} alert(s)).`);
  }
  alerts.splice(alertIndex, 1);
  const statusExtended = alerts.length === 0 ? null : fl.statusExtended;
  await tx.update(fulfillmentLines)
    .set({ warehouseAlerts: alerts, statusExtended, updatedAt: new Date() })
    .where(eq(fulfillmentLines.id, fulfillmentLineId));
  const [alertPick] = await tx.select({ orderId: pickLists.orderId }).from(pickLists).where(eq(pickLists.id, fl.pickListId)).limit(1);
  return {
    ok: true,
    commandId,
    affectedIds: [fulfillmentLineId, fl.pickListId],
    toast: alerts.length === 0 ? 'All alerts cleared.' : `Alert acknowledged. ${alerts.length} remaining.`,
    orderId: alertPick?.orderId
  };
}

// CAP-030 (TER-1488): Return picked units. Decrements actual_qty, restores available
// and reserved quantities on the batch, and writes an inventory_movements row of
// kind='pick_return'. Cannot return more than has been picked.
// returnPickedUnits → @/domains/pick (P1.PICK.EXTRACT)

// cancelFulfillmentLine → stays in commandBus If units have been picked, first
// returns them (via returnPickedUnits). Then releases any remaining reservation on
// the batch up to the sales order line qty. Marks status_extended='cancelled'.
// Idempotent: already-cancelled lines short-circuit.
async function cancelFulfillmentLine(tx: Tx, payload: Payload, commandId: string): Promise<CommandResult> {
  const fulfillmentLineId = requiredId(payload.fulfillmentLineId ?? payload.id, 'fulfillmentLineId');
  const [fl] = await tx.select().from(fulfillmentLines).where(eq(fulfillmentLines.id, fulfillmentLineId)).limit(1);
  if (!fl) throw new Error('Fulfillment line not found.');
  if (fl.statusExtended === 'cancelled') {
    return { ok: true, commandId, affectedIds: [fulfillmentLineId], toast: 'Fulfillment line already cancelled.' };
  }
  const affected: string[] = [fulfillmentLineId, fl.pickListId];
  // If actual_qty > 0, return the full picked amount first.
  if (Number(fl.actualQty) > 0) {
    const returnResult = await returnPickedUnits(
      tx,
      { ...payload, qty: Number(fl.actualQty), reason: 'Fulfillment line cancelled' },
      commandId
    );
    for (const id of returnResult.affectedIds) if (!affected.includes(id)) affected.push(id);
  }
  // Release any remaining reservation on the batch up to the sales order line qty.
  if (fl.batchId) {
    const [batch] = await tx.select().from(batches).where(eq(batches.id, fl.batchId)).limit(1);
    if (batch && Number(batch.reservedQty) > 0) {
      const [sol] = await tx.select().from(salesOrderLines).where(eq(salesOrderLines.id, fl.orderLineId)).limit(1);
      const releaseQty = sol ? Math.min(Number(batch.reservedQty), Number(sol.qty)) : 0;
      if (releaseQty > 0) {
        await tx.update(batches)
          .set({
            reservedQty: qtyScale(Math.max(0, Number(batch.reservedQty) - releaseQty)),
            updatedAt: new Date()
          })
          .where(eq(batches.id, fl.batchId));
        if (!affected.includes(fl.batchId)) affected.push(fl.batchId);
      }
    }
  }
  await tx.update(fulfillmentLines)
    .set({ statusExtended: 'cancelled', updatedAt: new Date() })
    .where(eq(fulfillmentLines.id, fulfillmentLineId));
  const [cancelPick] = await tx.select({ orderId: pickLists.orderId }).from(pickLists).where(eq(pickLists.id, fl.pickListId)).limit(1);
  return { ok: true, commandId, affectedIds: affected, toast: 'Fulfillment line cancelled.', orderId: cancelPick?.orderId };
}

// printLabels → @/domains/pick (P1.PICK.EXTRACT)

async function reviewConnectorRequest(tx: Tx, payload: Payload, status: string, user: SessionUser, commandId: string): Promise<CommandResult> {
  const requestId = requiredId(payload.requestId ?? payload.id, 'requestId');
  const [request] = await tx.select().from(connectorRequests).where(eq(connectorRequests.id, requestId)).limit(1);
  if (!request) throw new Error('Connector request not found.');
  const history = [
    ...(Array.isArray(request.reviewHistory) ? request.reviewHistory : []),
    { status, actorId: user.id, actorName: user.name, at: new Date().toISOString(), note: stringValue(payload.operatorNotes ?? payload.reason), routedTo: stringValue(payload.routedTo) }
  ];
  const routedTo = status === 'routed' ? requiredString(payload.routedTo, 'routedTo') : status === 'approved' ? stringValue(payload.routedTo) || request.routedTo || routeFromRequest(request.requestType) : request.routedTo;
  await tx
    .update(connectorRequests)
    .set({
      status,
      routedTo,
      operatorNotes: stringValue(payload.operatorNotes ?? payload.reason) || request.operatorNotes,
      reviewHistory: history,
      updatedAt: new Date()
    })
    .where(eq(connectorRequests.id, requestId));
  return { ok: true, commandId, affectedIds: [requestId], toast: `Connector request ${status}.` };
}

async function createCorrectionJournalEntry(tx: Tx, payload: Payload, commandId: string): Promise<CommandResult> {
  const period = periodValue(payload.period);
  await assertPeriodUnlocked(tx, period);
  const amount = requiredNumber(payload.amount, 'amount');
  const memo = requiredString(payload.memo, 'memo');
  const transactionDate = dateOrNull(payload.date ?? payload.createdAt) ?? new Date();
  const [entry] = await tx.insert(correctionJournalEntries).values({ period, amount: moneyScale(amount), memo, createdAt: transactionDate }).returning();
  const affected = [entry.id];
  if (payload.findReplace && typeof payload.findReplace === 'object') {
    affected.push(...(await applyFindReplace(tx, payload.findReplace as Payload)));
  }
  if (payload.invoiceId) {
    const invoiceId = requiredId(payload.invoiceId, 'invoiceId');
    const [dispute] = await tx
      .insert(invoiceDisputes)
      .values({ invoiceId, reason: stringValue(payload.reason) || memo, status: 'open' })
      .returning();
    affected.push(dispute.id);
    // Filing an invoice dispute is credit-relevant: signals already exclude
    // disputed invoices from debtAging. Enqueue if we can resolve the customer.
    const [invoiceRow] = await tx
      .select({ customerId: invoices.customerId })
      .from(invoices)
      .where(eq(invoices.id, invoiceId))
      .limit(1);
    if (invoiceRow?.customerId) {
      await enqueueCustomerRecompute(tx, invoiceRow.customerId, 'event:disputeInvoice', commandId);
    }
  }
  return { ok: true, commandId, affectedIds: affected, toast: payload.invoiceId ? 'Correction journal and invoice dispute posted.' : 'Correction journal entry posted.' };
}

async function postTransactionLedgerRow(tx: Tx, payload: Payload, user: SessionUser, commandId: string): Promise<CommandResult> {
  postTransactionLedgerRowPayloadSchema.parse(payload);
  const direction = requiredString(payload.direction, 'direction');
  const entityType = requiredString(payload.entityType, 'entityType');
  const transactionType = requiredString(payload.transactionType, 'transactionType');
  const amount = requiredNumber(payload.amount, 'amount');
  if (amount === 0) throw new Error('Transaction amount cannot be zero.');
  // SX-J10: sanity threshold on large payouts. Amounts above $1,000,000
  // must be confirmed through the advanced palette to prevent accidental
  // six-figure+ ledger entries from a single hotkey or mis-click.
  if (direction === 'paying' && Math.abs(amount) >= 1_000_000) {
    throw new Error('Amount exceeds sanity threshold — use the advanced palette to override');
  }
  const transactionDate = dateOrNull(payload.date) ?? new Date();
  const method = stringValue(payload.method) || 'cash';
  const reference = stringValue(payload.reference) || null;
  const notes = stringValue(payload.notes);
  const allocationTargetType = stringValue(payload.allocationTargetType);
  const allocationIntent = stringValue(payload.allocationIntent) || allocationTargetType || 'fifo';
  const targetId = stringValue(payload.allocationTargetId);

  // CAP-033 / TER-1564 — contact ledger branch.
  // For contractor/employee/standalone-contact entities, write directly to
  // contact_ledger_entries. Running balance is computed at read time via window
  // function; not stored here. No invoice allocation, no client_ledger_entries
  // touch — this is a flat append-only ledger.
  if (entityType === 'contact') {
    const contactId = requiredId(payload.entityId, 'entityId');
    const kind = stringValue(payload.kind) || (direction === 'paying' ? 'payment_out' : 'adjustment');
    // Sign convention: positive amount = money owed TO the contact.
    // direction='paying' means we are paying them out → reduces what we owe →
    // store as negative. direction='receiving' (rare for contacts) is the
    // reverse. Keeping the signed math here so archiveContact's SUM>0 guard
    // remains a clean "we still owe them" check.
    const signedAmount = direction === 'paying' ? -Math.abs(amount) : Math.abs(amount);

    const [entry] = await tx
      .insert(contactLedgerEntries)
      .values({
        contactId,
        kind,
        amount: signedAmount.toFixed(2),
        method,
        reference,
        note: notes ?? null,
        commandId
      })
      .returning();

    return {
      ok: true,
      commandId,
      affectedIds: [entry.id, contactId],
      toast: `Recorded ${direction === 'paying' ? 'payment of' : 'credit of'} $${Math.abs(amount).toFixed(2)} for contact.`
    };
  }

  if (entityType === 'customer' && direction === 'receiving') {
    const signedAmount = ['buyer_credit', 'down_payment', 'customer_down_payment'].includes(transactionType) ? -Math.abs(amount) : amount;
    let clientAllocationIntent = allocationTargetType === 'selected_invoice' ? 'selected' : allocationIntent;
    const customerId = requiredId(payload.entityId, 'entityId');
    // Enqueue credit recompute up-front so this command's source name wins
    // over the downstream logPayment/allocatePayment enqueues (idempotent: the
    // partial unique index makes subsequent inserts a no-op).
    await enqueueCustomerRecompute(tx, customerId, 'event:postLedgerRow', commandId);
    if (signedAmount > 0 && clientAllocationIntent === 'fifo') {
      const [openInvoice] = await tx
        .select({ id: invoices.id })
        .from(invoices)
        .where(and(eq(invoices.customerId, customerId), sql`${invoices.status} in ('open', 'partial')`))
        .limit(1);
      if (!openInvoice) clientAllocationIntent = 'unapplied';
    }
    const logged = await logPayment(
      tx,
      {
        customerId,
        amount: signedAmount,
        method,
        reference,
        locationBucket: stringValue(payload.bucket) || 'cash-file-a',
        notes,
        direction: 'money_in',
        category: signedAmount < 0 ? 'buyer_credit' : transactionType,
        allocationIntent: clientAllocationIntent,
        invoiceId: targetId && clientAllocationIntent === 'selected' ? targetId : undefined,
        date: transactionDate
      },
      commandId
    );
    if (logged.ok && signedAmount > 0 && clientAllocationIntent !== 'unapplied') {
      const allocated = await allocatePayment(tx, { paymentId: logged.affectedIds[0], invoiceId: clientAllocationIntent === 'selected' ? targetId || undefined : undefined }, commandId);
      return { ...logged, affectedIds: [...logged.affectedIds, ...allocated.affectedIds], toast: `${logged.toast} ${allocated.toast}` };
    }
    return logged;
  }

  if (entityType === 'vendor' && direction === 'paying') {
    if (!['owner', 'manager'].includes(user.role)) throw new Error('Vendor payouts require manager access.');
    return postVendorLedgerPayment(tx, payload, transactionDate, commandId);
  }

  if (entityType === 'referee' && direction === 'paying') {
    if (!['owner', 'manager'].includes(user.role)) throw new Error('Referee payouts require manager access.');
    const refereeId = requiredId(payload.entityId, 'entityId');
    const [referee] = await tx.select().from(referees).where(eq(referees.id, refereeId)).limit(1);
    if (!referee) throw new Error('Referee not found.');

    // Create correction journal entry for the payout transaction
    const transactionId = randomUUID();
    const correctionResult = await createCorrectionJournalEntry(
      tx,
      {
        period: transactionDate.toISOString().slice(0, 7),
        amount: -Math.abs(amount),
        memo: `Referee payout: ${referee.name} ${notes || reference || ''}`.trim(),
        date: transactionDate
      },
      commandId
    );

    // Process referee payout (marks credits as paid via FIFO)
    const { creditsMarkedPaid, totalPaid } = await processRefereePayout(
      tx,
      refereeId,
      amount,
      transactionId,
      commandId
    );

    return {
      ok: true,
      commandId,
      affectedIds: [refereeId, ...correctionResult.affectedIds],
      toast: `Paid $${totalPaid.toFixed(2)} to ${referee.name} (${creditsMarkedPaid} credit(s) marked paid).`
    };
  }

  const entityLabel = stringValue(payload.entityName) || entityType;
  const signedAmount = direction === 'paying' ? -Math.abs(amount) : Math.abs(amount);
  return createCorrectionJournalEntry(
    tx,
    {
      period: transactionDate.toISOString().slice(0, 7),
      amount: signedAmount,
      memo: [labelFromToken(transactionType), entityLabel, notes || reference].filter(Boolean).join(' / '),
      date: transactionDate
    },
    commandId
  );
}

// postVendorLedgerPayment → @/domains/vendor-management (P1.VM.EXTRACT)

async function upsertTransactionType(tx: Tx, payload: Payload, commandId: string): Promise<CommandResult> {
  upsertTransactionTypePayloadSchema.parse(payload);
  const label = requiredString(payload.label, 'label');
  const slug = stringValue(payload.slug) || slugFromLabel(label);
  const direction = requiredString(payload.direction, 'direction');
  const allowedEntityTypes = Array.isArray(payload.allowedEntityTypes) ? payload.allowedEntityTypes.map(String).filter(Boolean) : [requiredString(payload.entityType ?? 'other', 'entityType')];
  const values = {
    slug,
    label,
    direction,
    allowedEntityTypes,
    defaultMethod: stringValue(payload.defaultMethod) || 'cash',
    defaultBucket: stringValue(payload.defaultBucket) || (direction === 'paying' ? 'accounting' : 'cash-file-a'),
    defaultAllocationIntent: stringValue(payload.defaultAllocationIntent) || 'unapplied',
    requiresApproval: Boolean(payload.requiresApproval),
    isSystem: false,
    isActive: payload.isActive !== false,
    updatedAt: new Date()
  };
  const [row] = await tx
    .insert(transactionTypes)
    .values(values)
    .onConflictDoUpdate({
      target: transactionTypes.slug,
      set: values
    })
    .returning();
  return { ok: true, commandId, affectedIds: [row.id], toast: `Transaction type ${row.label} saved.` };
}

async function applyFindReplace(tx: Tx, payload: Payload) {
  const table = requiredString(payload.table, 'table');
  const find = requiredString(payload.find, 'find');
  const replacement = stringValue(payload.replacement);
  const pattern = `%${find}%`;
  const replace = (column: unknown) => sql`replace(coalesce(${column}, ''), ${find}, ${replacement})`;

  if (table === 'batches') {
    const rows = await tx
      .select({ id: batches.id })
      .from(batches)
      .where(or(ilike(batches.name, pattern), ilike(batches.sourceCode, pattern), ilike(batches.shorthand, pattern), ilike(batches.legacyMarker, pattern), ilike(batches.notes, pattern)));
    if (!rows.length) return [];
    await tx
      .update(batches)
      .set({ name: replace(batches.name), sourceCode: replace(batches.sourceCode), shorthand: replace(batches.shorthand), legacyMarker: replace(batches.legacyMarker), notes: replace(batches.notes), updatedAt: new Date() })
      .where(inArray(batches.id, rows.map((row: { id: string }) => row.id)));
    return rows.map((row: { id: string }) => row.id);
  }

  if (table === 'customers') {
    const rows = await tx.select({ id: customers.id }).from(customers).where(or(ilike(customers.name, pattern), ilike(customers.notes, pattern)));
    if (!rows.length) return [];
    await tx.update(customers).set({ name: replace(customers.name), notes: replace(customers.notes), updatedAt: new Date() }).where(inArray(customers.id, rows.map((row: { id: string }) => row.id)));
    return rows.map((row: { id: string }) => row.id);
  }

  if (table === 'vendors') {
    const rows = await tx.select({ id: vendors.id }).from(vendors).where(or(ilike(vendors.name, pattern), ilike(vendors.notes, pattern)));
    if (!rows.length) return [];
    await tx.update(vendors).set({ name: replace(vendors.name), notes: replace(vendors.notes), updatedAt: new Date() }).where(inArray(vendors.id, rows.map((row: { id: string }) => row.id)));
    return rows.map((row: { id: string }) => row.id);
  }

  if (table === 'sales_orders') {
    const rows = await tx.select({ id: salesOrders.id }).from(salesOrders).where(or(ilike(salesOrders.deliveryWindow, pattern), ilike(salesOrders.legacyStatusMarkers, pattern), ilike(salesOrders.notes, pattern)));
    if (!rows.length) return [];
    await tx
      .update(salesOrders)
      .set({ deliveryWindow: replace(salesOrders.deliveryWindow), legacyStatusMarkers: replace(salesOrders.legacyStatusMarkers), notes: replace(salesOrders.notes), updatedAt: new Date() })
      .where(inArray(salesOrders.id, rows.map((row: { id: string }) => row.id)));
    return rows.map((row: { id: string }) => row.id);
  }

  if (table === 'connector_requests') {
    const rows = await tx.select({ id: connectorRequests.id }).from(connectorRequests).where(ilike(connectorRequests.operatorNotes, pattern));
    if (!rows.length) return [];
    await tx.update(connectorRequests).set({ operatorNotes: replace(connectorRequests.operatorNotes), updatedAt: new Date() }).where(inArray(connectorRequests.id, rows.map((row: { id: string }) => row.id)));
    return rows.map((row: { id: string }) => row.id);
  }

  throw new Error('Find and replace is only available for approved text fields.');
}

export async function reverseCommandById(tx: Tx, payload: Payload, commandId: string): Promise<CommandResult> {
  reverseCommandByIdPayloadSchema.parse(payload);
  const originalId = requiredId(payload.commandId, 'commandId');
  const [original] = await tx.select().from(commandJournal).where(eq(commandJournal.id, originalId)).limit(1);
  if (!original) throw new Error('Original command not found.');
  if (original.reversedByCommandId) throw new Error('That command has already been reversed.');
  if (original.status !== 'ok') throw new Error('Only successful commands can be reversed.');

  const affected = [originalId];
  // Collect customer IDs affected by this reversal so we can enqueue credit
  // recomputes at the end. Idempotent — duplicates collapse via the partial
  // unique pending index.
  const customersToRecompute = new Set<string>();
  const snapshot = original.afterSnapshot as Record<string, any>;
  const beforeSnapshot = original.beforeSnapshot as Record<string, any>;
  const policy = reversalPolicies[original.commandName as CommandName];

  // Phase 4 §7 / §11.1 pre-flight: barter settlement reversal must check
  // that the received inventory has not been (partly) resold and that the
  // barter PO/receipt has not been amended downstream. Outbound is always
  // safe; inbound is the dangerous path. The guard throws with a directive
  // error message naming the offsetting outbound settlement as the operator
  // remediation. We run this BEFORE any snapshot-restore mutation so the
  // reversal is atomic-rejected when unsafe.
  if (original.commandName === 'payWithProduct' || original.commandName === 'settleDebtWithProduct') {
    const settlementRows = (snapshot.barterSettlements ?? []) as Array<{ id?: string }>;
    for (const row of settlementRows) {
      if (row?.id) {
        await assertBarterSettlementReversible(tx, row.id);
      }
    }
  }

  if (original.commandName === 'postSalesOrder') {
    for (const line of snapshot.salesOrderLines ?? []) {
      if (!line.batchId) continue;
      const [batch] = await tx.select().from(batches).where(eq(batches.id, line.batchId)).limit(1);
      if (batch) {
        await tx.update(batches).set({ availableQty: qtyScale(Number(batch.availableQty) + Number(line.qty)), updatedAt: new Date() }).where(eq(batches.id, batch.id));
        affected.push(batch.id);
      }
    }
    for (const invoice of snapshot.invoices ?? []) {
      const [currentInvoice] = await tx.select().from(invoices).where(eq(invoices.id, invoice.id)).limit(1);
      if (currentInvoice && Number(currentInvoice.amountPaid) > 0) throw new Error('Reverse payment allocations before reversing this sale.');
      await tx.update(invoices).set({ status: 'reversed', updatedAt: new Date() }).where(eq(invoices.id, invoice.id));
      if (invoice.customerId) {
        const [customer] = await tx.select().from(customers).where(eq(customers.id, invoice.customerId)).limit(1);
        if (customer) {
          // TER-1566: Decimal-precise balance reversal (balance may go negative if customer had credit).
          const nextBalance = subMoney(customer.balance, invoice.total);
          await tx.update(customers).set({ balance: nextBalance, updatedAt: new Date() }).where(eq(customers.id, customer.id));
          const [entry] = await tx
            .insert(clientLedgerEntries)
            .values({ customerId: customer.id, invoiceId: invoice.id, kind: 'sale_reversal', amount: moneyScale(-Number(invoice.total)), balanceAfter: nextBalance, note: `Reversal of ${original.commandName}` })
            .returning();
          affected.push(customer.id, entry.id);
          customersToRecompute.add(customer.id);
        }
      }
      affected.push(invoice.id);
    }
    for (const order of snapshot.salesOrders ?? []) {
      await tx.update(salesOrders).set({ status: 'reversed', updatedAt: new Date() }).where(eq(salesOrders.id, order.id));
      affected.push(order.id);
    }
    // #64 PR-3: reverse COGS exception correction journal entries if present
    // in snapshot. Note: snapshotByAffectedIds uses db.select() (pool connection)
    // and may not capture uncommitted inserts from this tx — see GitHub Issue
    // #150. Entries are marked 'reversed' rather than deleted to preserve audit
    // trail. The vendorBills.discrepancyNotes annotation is intentionally NOT
    // reversed (persists as AP audit).
    for (const entry of snapshot.correctionJournalEntries ?? []) {
      await tx
        .update(correctionJournalEntries)
        .set({ status: 'reversed' })
        .where(eq(correctionJournalEntries.id, entry.id));
      affected.push(entry.id);
    }
  } else if (original.commandName === 'approvePurchaseOrder') {
    for (const order of snapshot.purchaseOrders ?? []) {
      await tx.update(purchaseOrders).set({ status: 'draft', orderedAt: null, updatedAt: new Date() }).where(eq(purchaseOrders.id, order.id));
      affected.push(order.id);
    }
    for (const line of snapshot.purchaseOrderLines ?? []) {
      const status = purchaseOrderLineIssues(line).length ? 'needs_fix' : 'planned';
      await tx.update(purchaseOrderLines).set({ status, updatedAt: new Date() }).where(eq(purchaseOrderLines.id, line.id));
      affected.push(line.id);
    }
  } else if (original.commandName === 'receivePurchaseOrder') {
    for (const batch of snapshot.batches ?? []) {
      if (batch.status === 'posted') throw new Error('Reverse the posted purchase receipt before reversing PO receiving.');
      await tx.update(batches).set({ status: 'reversed', availableQty: '0.000', updatedAt: new Date() }).where(eq(batches.id, batch.id));
      affected.push(batch.id);
    }
    // UX-H04 / BE-009 (Execution Decision 5): restore the PRIOR per-line
    // receive state from beforeSnapshot when available. A partial receive on
    // a line that already has posted receipts must not wipe receivedQty back
    // to zero — only the drafted (unposted) progress from THIS command is
    // undone. Legacy full receives (no before-rows captured for lines) keep
    // the original zero/planned reset.
    const beforeReceiveLines = new Map<string, Record<string, unknown>>(
      ((beforeSnapshot.purchaseOrderLines ?? []) as Array<Record<string, unknown>>).map((l) => [String(l.id), l])
    );
    for (const line of snapshot.purchaseOrderLines ?? []) {
      const prior = beforeReceiveLines.get(String(line.id));
      await tx
        .update(purchaseOrderLines)
        .set({
          receivedQty: prior ? qtyScale(prior.receivedQty ?? 0) : '0.000',
          status: prior ? stringValue(prior.status) || 'planned' : 'planned',
          updatedAt: new Date()
        })
        .where(eq(purchaseOrderLines.id, line.id));
      affected.push(line.id);
    }
    const beforeReceiveOrders = new Map<string, Record<string, unknown>>(
      ((beforeSnapshot.purchaseOrders ?? []) as Array<Record<string, unknown>>).map((o) => [String(o.id), o])
    );
    for (const order of snapshot.purchaseOrders ?? []) {
      const prior = beforeReceiveOrders.get(String(order.id));
      await tx
        .update(purchaseOrders)
        .set({
          status: prior ? stringValue(prior.status) || 'approved' : 'approved',
          // beforeSnapshot round-trips through jsonb — rehydrate timestamps.
          receivedAt: prior?.receivedAt ? new Date(String(prior.receivedAt)) : null,
          updatedAt: new Date()
        })
        .where(eq(purchaseOrders.id, order.id));
      affected.push(order.id);
    }
  } else if (original.commandName === 'postPurchaseReceipt') {
    for (const batch of snapshot.batches ?? []) {
      await tx.update(batches).set({ status: 'reversed', availableQty: '0.000', updatedAt: new Date() }).where(eq(batches.id, batch.id));
      affected.push(batch.id);
    }
    for (const bill of snapshot.vendorBills ?? []) {
      await tx.update(vendorBills).set({ status: 'reversed', updatedAt: new Date() }).where(eq(vendorBills.id, bill.id));
      affected.push(bill.id);
    }
    for (const receipt of snapshot.purchaseReceipts ?? []) {
      await tx.update(purchaseReceipts).set({ status: 'reversed', updatedAt: new Date() }).where(eq(purchaseReceipts.id, receipt.id));
      affected.push(receipt.id);
    }
  } else if (original.commandName === 'setItemAlias') {
    for (const item of beforeSnapshot.items ?? []) {
      const priorAlias: string | null = ((item as Record<string, unknown>).alias as string | undefined) ?? null;
      await tx.update(items).set({ alias: priorAlias, updatedAt: new Date() }).where(eq(items.id, (item as { id: string }).id));
      affected.push((item as { id: string }).id);
    }
  } else if (['setInventoryStatus', 'transferInventoryLocation', 'transferInventoryOwnership'].includes(original.commandName)) {
    for (const batch of beforeSnapshot.batches ?? []) {
      const values: Record<string, unknown> = { updatedAt: new Date() };
      if (original.commandName === 'setInventoryStatus' && batch.status != null) values.status = batch.status;
      if (original.commandName === 'transferInventoryLocation' && batch.location != null) values.location = batch.location;
      if (original.commandName === 'transferInventoryOwnership') {
        if (batch.ownershipStatus != null) values.ownershipStatus = batch.ownershipStatus;
        if ('vendorId' in batch) values.vendorId = batch.vendorId;
      }
      await tx.update(batches).set(values).where(eq(batches.id, batch.id));
      await tx.insert(inventoryMovements).values({
        batchId: batch.id,
        commandId,
        kind: 'inventory_transfer_reversal',
        qtyDelta: '0.000',
        reason: `Reversal of ${original.commandName}`
      });
      affected.push(batch.id);
    }
  } else if (original.commandName === 'logPayment') {
    for (const payment of snapshot.payments ?? []) {
      const [currentPayment] = await tx.select().from(payments).where(eq(payments.id, payment.id)).limit(1);
      if (!currentPayment) continue;
      if (Number(currentPayment.unappliedAmount) !== Math.max(0, Number(currentPayment.amount))) {
        throw new Error('Unallocate this payment before reversing the payment log.');
      }
      await tx.update(payments).set({ status: 'reversed', unappliedAmount: '0.00', updatedAt: new Date() }).where(eq(payments.id, currentPayment.id));
      affected.push(currentPayment.id);
      if (currentPayment.customerId) {
        customersToRecompute.add(currentPayment.customerId);
      }
      if (Number(currentPayment.amount) < 0 && currentPayment.customerId) {
        const [customer] = await tx.select().from(customers).where(eq(customers.id, currentPayment.customerId)).limit(1);
        if (customer) {
          const nextBalance = new Decimal(String(customer.balance ?? 0)).plus(new Decimal(String(currentPayment.amount ?? 0)).abs()).toDecimalPlaces(2).toFixed(2);
          await tx.update(customers).set({ balance: nextBalance, updatedAt: new Date() }).where(eq(customers.id, customer.id));
          const [entry] = await tx
            .insert(clientLedgerEntries)
            .values({ customerId: customer.id, paymentId: currentPayment.id, kind: 'payment_reversal', amount: moneyScale(Math.abs(Number(currentPayment.amount))), balanceAfter: nextBalance, note: 'Buyer credit reversal' })
            .returning();
          affected.push(customer.id, entry.id);
        }
      }
    }
  } else if (original.commandName === 'allocatePayment') {
    for (const allocation of snapshot.paymentAllocations ?? []) {
      const [currentAllocation] = await tx.select().from(paymentAllocations).where(eq(paymentAllocations.id, allocation.id)).limit(1);
      if (!currentAllocation) continue;
      const [payment] = await tx.select().from(payments).where(eq(payments.id, currentAllocation.paymentId)).limit(1);
      const [invoice] = await tx.select().from(invoices).where(eq(invoices.id, currentAllocation.invoiceId)).limit(1);
      await tx.delete(paymentAllocations).where(eq(paymentAllocations.id, currentAllocation.id));
      // TER-1566: Decimal-precise allocation reversal — addMoney/subMoneyMin0 match the forward-path helpers.
      if (payment) await tx.update(payments).set({ unappliedAmount: addMoney(payment.unappliedAmount, currentAllocation.amount), updatedAt: new Date() }).where(eq(payments.id, payment.id));
      if (invoice) {
        const paid = subMoneyMin0(invoice.amountPaid, currentAllocation.amount);
        await tx.update(invoices).set({ amountPaid: paid, status: new Decimal(paid).lte(0) ? 'open' : 'partial', updatedAt: new Date() }).where(eq(invoices.id, invoice.id));
        if (invoice.customerId) {
          const [customer] = await tx.select().from(customers).where(eq(customers.id, invoice.customerId)).limit(1);
          if (customer) {
            const nextBalance = addMoney(customer.balance, currentAllocation.amount);
            await tx.update(customers).set({ balance: nextBalance, updatedAt: new Date() }).where(eq(customers.id, customer.id));
            const [entry] = await tx
              .insert(clientLedgerEntries)
              .values({ customerId: customer.id, invoiceId: invoice.id, paymentId: payment?.id, kind: 'allocation_reversal', amount: moneyScale(currentAllocation.amount), balanceAfter: nextBalance, note: 'Payment allocation reversal' })
              .returning();
            affected.push(customer.id, entry.id);
            customersToRecompute.add(customer.id);
          }
        }
      }
      affected.push(currentAllocation.id, currentAllocation.paymentId, currentAllocation.invoiceId);
    }
  } else if (original.commandName === 'postTransactionLedgerRow') {
    for (const payment of snapshot.payments ?? []) {
      const [currentPayment] = await tx.select().from(payments).where(eq(payments.id, payment.id)).limit(1);
      if (!currentPayment) continue;
      const currentAllocations = await tx.select().from(paymentAllocations).where(eq(paymentAllocations.paymentId, currentPayment.id));
      for (const allocation of currentAllocations) {
        const [invoice] = await tx.select().from(invoices).where(eq(invoices.id, allocation.invoiceId)).limit(1);
        await tx.delete(paymentAllocations).where(eq(paymentAllocations.id, allocation.id));
        if (invoice) {
          // TER-1566: Decimal-precise ledger reversal — match allocatePayment reversal pattern above.
          const paid = subMoneyMin0(invoice.amountPaid, allocation.amount);
          await tx.update(invoices).set({ amountPaid: paid, status: new Decimal(paid).lte(0) ? 'open' : 'partial', updatedAt: new Date() }).where(eq(invoices.id, invoice.id));
          if (invoice.customerId) {
            const [customer] = await tx.select().from(customers).where(eq(customers.id, invoice.customerId)).limit(1);
            if (customer) {
              const nextBalance = addMoney(customer.balance, allocation.amount);
              await tx.update(customers).set({ balance: nextBalance, updatedAt: new Date() }).where(eq(customers.id, customer.id));
              const [entry] = await tx
                .insert(clientLedgerEntries)
                .values({ customerId: customer.id, invoiceId: invoice.id, paymentId: currentPayment.id, kind: 'allocation_reversal', amount: moneyScale(allocation.amount), balanceAfter: nextBalance, note: 'Transaction ledger allocation reversal' })
                .returning();
              affected.push(customer.id, entry.id);
              customersToRecompute.add(customer.id);
            }
          }
          affected.push(invoice.id);
        }
        affected.push(allocation.id);
      }
      if (currentPayment.customerId) {
        customersToRecompute.add(currentPayment.customerId);
      }
      if (Number(currentPayment.amount) < 0 && currentPayment.customerId) {
        const [customer] = await tx.select().from(customers).where(eq(customers.id, currentPayment.customerId)).limit(1);
        if (customer) {
          const nextBalance = new Decimal(String(customer.balance ?? 0)).plus(new Decimal(String(currentPayment.amount ?? 0)).abs()).toDecimalPlaces(2).toFixed(2);
          await tx.update(customers).set({ balance: nextBalance, updatedAt: new Date() }).where(eq(customers.id, customer.id));
          const [entry] = await tx
            .insert(clientLedgerEntries)
            .values({ customerId: customer.id, paymentId: currentPayment.id, kind: 'payment_reversal', amount: moneyScale(Math.abs(Number(currentPayment.amount))), balanceAfter: nextBalance, note: 'Transaction ledger buyer credit reversal' })
            .returning();
          affected.push(customer.id, entry.id);
        }
      }
      await tx.update(payments).set({ status: 'reversed', unappliedAmount: '0.00', updatedAt: new Date() }).where(eq(payments.id, currentPayment.id));
      affected.push(currentPayment.id);
    }

    const beforeBills = new Map((beforeSnapshot.vendorBills ?? []).map((bill: Record<string, unknown>) => [bill.id, bill]));
    for (const payment of snapshot.vendorPayments ?? []) {
      const [currentPayment] = await tx.select().from(vendorPayments).where(eq(vendorPayments.id, payment.id)).limit(1);
      if (!currentPayment) continue;
      await tx.update(vendorPayments).set({ status: 'void' }).where(eq(vendorPayments.id, currentPayment.id));
      const [bill] = await tx.select().from(vendorBills).where(eq(vendorBills.id, currentPayment.vendorBillId)).limit(1);
      if (bill) {
        const beforeBill = beforeBills.get(bill.id) as Record<string, unknown> | undefined;
        if (beforeBill) {
          await tx
            .update(vendorBills)
            .set({
              amountPaid: moneyScale(beforeBill.amountPaid),
              status: String(beforeBill.status ?? 'approved'),
              scheduledFor: beforeBill.scheduledFor ? new Date(String(beforeBill.scheduledFor)) : null,
              dueReason: stringValue(beforeBill.dueReason) || null,
              updatedAt: new Date()
            })
            .where(eq(vendorBills.id, bill.id));
        } else {
          await tx.update(vendorBills).set({ amountPaid: '0.00', status: 'reversed', updatedAt: new Date() }).where(eq(vendorBills.id, bill.id));
        }
        affected.push(bill.id);
      }
      affected.push(currentPayment.id);
    }
    for (const bill of snapshot.vendorBills ?? []) {
      if (beforeBills.has(bill.id) || affected.includes(bill.id)) continue;
      await tx.update(vendorBills).set({ amountPaid: '0.00', status: 'reversed', updatedAt: new Date() }).where(eq(vendorBills.id, bill.id));
      affected.push(bill.id);
    }
    for (const entry of snapshot.correctionJournalEntries ?? []) {
      await tx.update(correctionJournalEntries).set({ status: 'reversed' }).where(eq(correctionJournalEntries.id, entry.id));
      affected.push(entry.id);
    }
  } else if (original.commandName === 'createVendorBill') {
    for (const bill of snapshot.vendorBills ?? []) {
      await tx.update(vendorBills).set({ status: 'reversed', updatedAt: new Date() }).where(eq(vendorBills.id, bill.id));
      affected.push(bill.id);
    }
  } else if (original.commandName === 'recordVendorPayment') {
    for (const payment of snapshot.vendorPayments ?? []) {
      const [currentPayment] = await tx.select().from(vendorPayments).where(eq(vendorPayments.id, payment.id)).limit(1);
      if (!currentPayment) continue;
      await tx.update(vendorPayments).set({ status: 'void' }).where(eq(vendorPayments.id, currentPayment.id));
      const [bill] = await tx.select().from(vendorBills).where(eq(vendorBills.id, currentPayment.vendorBillId)).limit(1);
      if (bill) {
        // TER-1566: Decimal-precise vendor bill reversal — mirrors recordVendorPayment forward path.
        const amountPaid = subMoneyMin0(bill.amountPaid, currentPayment.amount);
        await tx
          .update(vendorBills)
          .set({ amountPaid, status: bill.scheduledFor ? 'scheduled' : 'approved', updatedAt: new Date() })
          .where(eq(vendorBills.id, bill.id));
        affected.push(bill.id);
      }
      affected.push(currentPayment.id);
    }
  } else if (original.commandName === 'markOrderFulfilled') {
    for (const pick of snapshot.pickLists ?? []) {
      await tx.update(pickLists).set({ status: 'open', updatedAt: new Date() }).where(eq(pickLists.id, pick.id));
      affected.push(pick.id);
    }
    for (const order of snapshot.salesOrders ?? []) {
      await tx.update(salesOrders).set({ status: 'posted', fulfilledAt: null, updatedAt: new Date() }).where(eq(salesOrders.id, order.id));
      affected.push(order.id);
    }
  } else if (['approveConnectorRequest', 'routeConnectorRequest'].includes(original.commandName)) {
    for (const request of snapshot.connectorRequests ?? []) {
      await tx.update(connectorRequests).set({ status: 'open', routedTo: null, updatedAt: new Date() }).where(eq(connectorRequests.id, request.id));
      affected.push(request.id);
    }
  } else if (original.commandName === 'setCustomerPricingRule') {
    for (const customer of beforeSnapshot.customers ?? []) {
      const priorRule = ((customer as Record<string, unknown>).pricingRule ?? {}) as Record<string, unknown>;
      await tx
        .update(customers)
        .set({ pricingRule: priorRule, updatedAt: new Date() })
        .where(eq(customers.id, (customer as { id: string }).id));
      affected.push((customer as { id: string }).id);
    }
  } else if (original.commandName === 'setDefaultPricingRule') {
    const delta = ((original.result as Record<string, unknown> | null)?.delta ?? {}) as Record<string, unknown>;
    const priorRule = (delta.priorPricingRule ?? null) as Record<string, unknown> | null;
    const [current] = await tx.select().from(systemSettings).where(eq(systemSettings.key, 'pricing.defaults')).limit(1);
    if (priorRule === null) {
      if (current) {
        await tx.delete(systemSettings).where(eq(systemSettings.key, 'pricing.defaults'));
        affected.push(current.id);
      }
    } else if (current) {
      await tx
        .update(systemSettings)
        .set({ value: priorRule, updatedAt: new Date() })
        .where(eq(systemSettings.key, 'pricing.defaults'));
      affected.push(current.id);
    } else {
      const [row] = await tx.insert(systemSettings).values({ key: 'pricing.defaults', value: priorRule }).returning();
      if (row) affected.push(row.id);
    }
  } else if (original.commandName === 'setLineLandedCost') {
    for (const line of beforeSnapshot.salesOrderLines ?? []) {
      await tx
        .update(salesOrderLines)
        .set({
          unitCost: moneyScale((line as Record<string, unknown>).unitCost),
          unitCostResolved: Boolean((line as Record<string, unknown>).unitCostResolved),
          landedCostBasis: ((line as Record<string, unknown>).landedCostBasis as string | null) ?? null,
          updatedAt: new Date()
        })
        .where(eq(salesOrderLines.id, (line as { id: string }).id));
      affected.push((line as { id: string }).id);
    }
  } else if (['createCorrectionJournalEntry', 'postPeriodAdjustments'].includes(original.commandName)) {
    for (const entry of snapshot.correctionJournalEntries ?? []) {
      await tx.update(correctionJournalEntries).set({ status: 'reversed' }).where(eq(correctionJournalEntries.id, entry.id));
      affected.push(entry.id);
    }
  } else if (original.commandName === 'finalizePurchaseOrder') {
    // Reversal: finalized → draft (undo finalization, no lines were changed by this command)
    for (const order of snapshot.purchaseOrders ?? []) {
      await tx.update(purchaseOrders).set({ status: 'draft', finalizedAt: null, updatedAt: new Date() }).where(eq(purchaseOrders.id, order.id));
      affected.push(order.id);
    }
  } else if (original.commandName === 'unfinalizePurchaseOrder') {
    // Reversal: draft → finalized (re-finalize, restore finalizedAt from beforeSnapshot)
    const priorPOs = new Map(
      (beforeSnapshot.purchaseOrders ?? []).map((o: Record<string, unknown>) => [o.id, o])
    );
    for (const order of snapshot.purchaseOrders ?? []) {
      const prior = priorPOs.get(order.id) as Record<string, unknown> | undefined;
      await tx.update(purchaseOrders).set({
        status: 'finalized',
        finalizedAt: prior?.finalizedAt ? new Date(String(prior.finalizedAt)) : new Date(),
        updatedAt: new Date()
      }).where(eq(purchaseOrders.id, order.id));
      affected.push(order.id);
    }
  } else if (original.commandName === 'setCustomerCreditLimit') {
    // Reversal: restore prior credit limit and metadata from beforeSnapshot
    for (const prior of beforeSnapshot.customers ?? []) {
      const c = prior as Record<string, unknown>;
      await tx.update(customers).set({
        creditLimit: moneyScale(c.creditLimit),
        creditLimitSource: String(c.creditLimitSource ?? 'manual'),
        creditLimitManualSetAt: c.creditLimitManualSetAt ? new Date(String(c.creditLimitManualSetAt)) : null,
        creditLimitManualSetBy: (c.creditLimitManualSetBy as string | null) ?? null,
        creditLimitManualReason: (c.creditLimitManualReason as string | null) ?? null,
        creditLimitLastReviewedAt: c.creditLimitLastReviewedAt ? new Date(String(c.creditLimitLastReviewedAt)) : null,
        creditLimitSnoozeCount: Number(c.creditLimitSnoozeCount ?? 0),
        updatedAt: new Date()
      }).where(eq(customers.id, (prior as { id: string }).id));
      affected.push((prior as { id: string }).id);
      customersToRecompute.add((prior as { id: string }).id);
    }
  } else if (original.commandName === 'revertCustomerCreditToEngine') {
    // Reversal: restore prior manual credit limit from beforeSnapshot (undo engine revert)
    for (const prior of beforeSnapshot.customers ?? []) {
      const c = prior as Record<string, unknown>;
      await tx.update(customers).set({
        creditLimit: moneyScale(c.creditLimit),
        creditLimitSource: String(c.creditLimitSource ?? 'manual'),
        creditLimitManualSetAt: c.creditLimitManualSetAt ? new Date(String(c.creditLimitManualSetAt)) : null,
        creditLimitManualSetBy: (c.creditLimitManualSetBy as string | null) ?? null,
        creditLimitManualReason: (c.creditLimitManualReason as string | null) ?? null,
        creditLimitLastReviewedAt: c.creditLimitLastReviewedAt ? new Date(String(c.creditLimitLastReviewedAt)) : null,
        creditLimitSnoozeCount: Number(c.creditLimitSnoozeCount ?? 0),
        updatedAt: new Date()
      }).where(eq(customers.id, (prior as { id: string }).id));
      affected.push((prior as { id: string }).id);
      customersToRecompute.add((prior as { id: string }).id);
    }
  } else if (original.commandName === 'snoozeCustomerCreditReminder') {
    // Reversal: restore prior snooze fields from beforeSnapshot (undo the snooze increment)
    for (const prior of beforeSnapshot.customers ?? []) {
      const c = prior as Record<string, unknown>;
      await tx.update(customers).set({
        creditLimitLastReviewedAt: c.creditLimitLastReviewedAt ? new Date(String(c.creditLimitLastReviewedAt)) : null,
        creditLimitSnoozeCount: Number(c.creditLimitSnoozeCount ?? 0),
        creditLimitReminderDays: c.creditLimitReminderDays != null ? Number(c.creditLimitReminderDays) : null,
        updatedAt: new Date()
      }).where(eq(customers.id, (prior as { id: string }).id));
      affected.push((prior as { id: string }).id);
    }
  } else if (original.commandName === 'payWithProduct' || original.commandName === 'settleDebtWithProduct') {
    // Barter settlement reversal (§7):
    // - Restore batch availableQty (outbound: add back issued qty)
    // - Restore customer balance (inbound/outbound-customer: undo AR reduction)
    // - Restore vendor bill amounts (outbound-vendor / inbound AP netting)
    // - Mark barter settlements, lines, and allocations as 'reversed'
    // - Reverse gain/loss correction journal entry
    // - Reverse inventory movements
    //
    // The pre-flight guard (above) already verified:
    //   - Inbound: batch not partly resold, PO not amended
    //   - Outbound: always safe
    for (const settlement of snapshot.barterSettlements ?? []) {
      if (!settlement?.id) continue;
      
      // Mark settlement header reversed
      await tx.update(barterSettlements)
        .set({ status: 'reversed', updatedAt: new Date() })
        .where(eq(barterSettlements.id, settlement.id));
      affected.push(settlement.id);
      
      // Reverse lines: restore batch availableQty for outbound
      const lines = snapshot.barterSettlementLines ?? [];
      for (const line of lines) {
        if (line.batchId) {
          const beforeBatch = ((snapshot.batches ?? []) as Array<Record<string, unknown>>)
            .find((b: Record<string, unknown>) => b.id === line.batchId);
          if (beforeBatch && beforeBatch.availableQty !== undefined) {
            await tx.update(batches)
              .set({ availableQty: qtyScale(beforeBatch.availableQty), updatedAt: new Date() })
              .where(eq(batches.id, line.batchId));
            affected.push(line.batchId);
          }
        }
      }
      
      // Reverse allocations — delete rows cleanly to avoid CHECK constraint
      // violations that would arise when setting amount to '0.00' on a column
      // gated by a positive-amount constraint.
      await tx.delete(barterSettlementAllocations)
        .where(eq(barterSettlementAllocations.settlementId, settlement.id));
      
      // Reverse inventory movements for this settlement
      await tx.update(inventoryMovements)
        .set({ kind: sql`CASE WHEN kind = 'barter_issue' THEN 'barter_issue_reversal' ELSE kind END` })
        .where(and(eq(inventoryMovements.commandId, original.id), eq(inventoryMovements.kind, 'barter_issue')));
    }
    
    // Reverse client ledger entries: mark product_settlement entries as reversed
    for (const entry of snapshot.clientLedgerEntries ?? []) {
      await tx.update(clientLedgerEntries)
        .set({ kind: 'product_settlement_reversal' })
        .where(and(eq(clientLedgerEntries.id, (entry as Record<string, unknown>).id as string), eq(clientLedgerEntries.kind, 'product_settlement')));
    }
    
    // Restore customer balances (from beforeSnapshot)
    for (const cust of beforeSnapshot.customers ?? []) {
      const c = cust as Record<string, unknown>;
      await tx.update(customers)
        .set({ balance: moneyScale(c.balance), updatedAt: new Date() })
        .where(eq(customers.id, c.id as string));
      affected.push(c.id as string);
      customersToRecompute.add(c.id as string);
    }
    
    // Restore vendor bills (from beforeSnapshot)
    for (const bill of beforeSnapshot.vendorBills ?? []) {
      const b = bill as Record<string, unknown>;
      await tx.update(vendorBills)
        .set({ amountPaid: moneyScale(b.amountPaid), status: String(b.status ?? 'approved'), updatedAt: new Date() })
        .where(eq(vendorBills.id, b.id as string));
      affected.push(b.id as string);
    }
    
    // Reverse vendor payments (set to void)
    for (const payment of snapshot.vendorPayments ?? []) {
      await tx.update(vendorPayments)
        .set({ status: 'void' })
        .where(eq(vendorPayments.id, (payment as Record<string, unknown>).id as string));
      affected.push((payment as Record<string, unknown>).id as string);
    }
    
    // Reverse correction journal entries (gain/loss)
    for (const entry of snapshot.correctionJournalEntries ?? []) {
      await tx.update(correctionJournalEntries)
        .set({ status: 'reversed' })
        .where(eq(correctionJournalEntries.id, (entry as Record<string, unknown>).id as string));
      affected.push((entry as Record<string, unknown>).id as string);
    }
    
    // Reverse purchase orders (inbound)
    for (const po of snapshot.purchaseOrders ?? []) {
      await tx.update(purchaseOrders)
        .set({ status: 'reversed', updatedAt: new Date() })
        .where(eq(purchaseOrders.id, (po as Record<string, unknown>).id as string));
      affected.push((po as Record<string, unknown>).id as string);
    }
    
    // Reverse purchase receipts (inbound)
    for (const receipt of snapshot.purchaseReceipts ?? []) {
      await tx.update(purchaseReceipts)
        .set({ status: 'reversed', updatedAt: new Date() })
        .where(eq(purchaseReceipts.id, (receipt as Record<string, unknown>).id as string));
      affected.push((receipt as Record<string, unknown>).id as string);
    }
    
    // Reverse any NEW vendor bills created by the settlement (not in beforeSnapshot)
    const beforeBillIds = new Set((beforeSnapshot.vendorBills ?? []).map((b: Record<string, unknown>) => b.id));
    for (const bill of snapshot.vendorBills ?? []) {
      if (!beforeBillIds.has((bill as Record<string, unknown>).id as string)) {
        await tx.update(vendorBills)
          .set({ status: 'reversed', amountPaid: '0.00', updatedAt: new Date() })
          .where(eq(vendorBills.id, (bill as Record<string, unknown>).id as string));
        affected.push((bill as Record<string, unknown>).id as string);
      }
    }
    
    // Reverse any NEW batches created by inbound settlement (not in beforeSnapshot)
    const beforeBatchIds = new Set((beforeSnapshot.batches ?? []).map((b: Record<string, unknown>) => b.id));
    for (const batch of snapshot.batches ?? []) {
      if (!beforeBatchIds.has((batch as Record<string, unknown>).id as string)) {
        await tx.update(batches)
          .set({ status: 'reversed', availableQty: '0.000', intakeQty: '0.000', updatedAt: new Date() })
          .where(eq(batches.id, (batch as Record<string, unknown>).id as string));
        affected.push((batch as Record<string, unknown>).id as string);
      }
    }
    
    // Restore invoice amounts from beforeSnapshot (undo allocation side effects)
    for (const inv of beforeSnapshot.invoices ?? []) {
      const i = inv as Record<string, unknown>;
      await tx.update(invoices)
        .set({ amountPaid: moneyScale(i.amountPaid), status: String(i.status ?? 'open'), updatedAt: new Date() })
        .where(eq(invoices.id, i.id as string));
      affected.push(i.id as string);
    }
    
    // Rename down_payment ledger entries to down_payment_reversal so they are
    // excluded from credit-utilization signals (mirrors the product_settlement
    // rename already applied above).
    for (const entry of snapshot.clientLedgerEntries ?? []) {
      await tx.update(clientLedgerEntries)
        .set({ kind: sql`'down_payment_reversal'` })
        .where(and(
          eq(clientLedgerEntries.id, (entry as Record<string, unknown>).id as string),
          eq(clientLedgerEntries.kind, 'down_payment')
        ));
    }
  } else {
    throw new Error(`${original.commandName} is ${policy?.disposition ?? 'not'} reversible: ${policy?.guidance ?? 'No reversal policy is registered.'}`);
  }

  await tx.update(commandJournal).set({ reversedByCommandId: commandId }).where(eq(commandJournal.id, originalId));
  // Enqueue credit recompute for every customer affected by this reversal.
  // Use 'event:reverseSalesOrder' as the generic reversal source; idempotent
  // dedupe collapses any duplicates across branches.
  for (const cid of customersToRecompute) {
    await enqueueCustomerRecompute(tx, cid, 'event:reverseSalesOrder', commandId);
  }
  return { ok: true, commandId, affectedIds: affected, toast: `Reversed ${original.commandName}.` };
}

async function documentCommandFailure(tx: Tx, payload: Payload, commandId: string): Promise<CommandResult> {
  const targetId = String(payload['commandId'] ?? '');
  const reason = String(payload['reason'] ?? '').trim();
  if (!targetId || !reason) {
    return { ok: false, toast: 'Command ID and reason are required.', commandId, affectedIds: [] };
  }
  const result = await tx.execute(
    sql`UPDATE command_journal
        SET reason = ${reason}
        WHERE id = ${targetId}::uuid
          AND status = 'failed'`
  );
  if ((result.rowCount ?? 0) === 0) {
    return { ok: false, toast: 'Command not found or not in failed state.', commandId, affectedIds: [targetId] };
  }
  return {
    ok: true,
    toast: 'Terminal reason documented.',
    commandId,
    affectedIds: [targetId]
  };
}

async function restoreFromBackupPoint(tx: Tx, payload: Payload, commandId: string): Promise<CommandResult> {
  const backupId = requiredId(payload.backupId, 'backupId');
  const [backup] = await tx.select().from(backupSnapshots).where(eq(backupSnapshots.id, backupId)).limit(1);
  if (!backup) throw new Error('Backup snapshot not found.');
  return {
    ok: true,
    commandId,
    affectedIds: [backupId],
    toast: 'Restore preview generated. No ledgers were changed.',
    delta: { readOnly: true, label: backup.label, snapshot: backup.snapshot }
  };
}

async function postPeriodAdjustments(tx: Tx, payload: Payload, commandId: string): Promise<CommandResult> {
  const period = periodValue(payload.period);
  await assertPeriodUnlocked(tx, period);
  const adjustments = Array.isArray(payload.adjustments) ? payload.adjustments : [{ amount: payload.amount, memo: payload.memo }];
  const affected: string[] = [];
  for (const adjustment of adjustments as Array<Record<string, unknown>>) {
    const [entry] = await tx.insert(correctionJournalEntries).values({ period, amount: moneyScale(requiredNumber(adjustment.amount, 'amount')), memo: requiredString(adjustment.memo, 'memo') }).returning();
    affected.push(entry.id);
  }
  return { ok: true, commandId, affectedIds: affected, toast: `${affected.length} period adjustment(s) posted.` };
}

// Serializes lockPeriod/archivePeriod for the same period by acquiring a
// transaction-scoped Postgres advisory lock keyed on hashtext(period). Released
// automatically on commit or rollback.
async function acquirePeriodCloseoutLock(tx: Tx, period: string): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${period})::bigint)`);
}

async function lockPeriod(tx: Tx, payload: Payload, userId: string, commandId: string): Promise<CommandResult> {
  const period = periodValue(payload.period);
  await acquirePeriodCloseoutLock(tx, period);
  const [existing] = await tx.select().from(periodLocks).where(eq(periodLocks.period, period)).limit(1);
  if (existing) return { ok: true, commandId, affectedIds: [existing.id], toast: `${period} is already locked.` };
  const safety = await getCloseoutSafety(tx, period);
  if (safety.openWorkCount > 0) {
    throw new Error(`${period} cannot be locked yet: ${safety.blockers.map((blocker) => `${blocker.count} ${blocker.label.toLowerCase()}`).join(', ')}.`);
  }
  const recheck = await getCloseoutSafety(tx, period);
  if (recheck.openWorkCount > 0) {
    throw new Error(`${period} cannot be locked: unsafe work appeared during the lock attempt. Please retry.`);
  }
  const [lock] = await tx.insert(periodLocks).values({ period, lockedBy: userId, status: 'locked' }).returning();
  return { ok: true, commandId, affectedIds: [lock.id], toast: `${period} locked.` };
}

async function archivePeriod(tx: Tx, payload: Payload, commandId: string): Promise<CommandResult> {
  archivePeriodPayloadSchema.parse(payload);
  const period = periodValue(payload.period);
  await acquirePeriodCloseoutLock(tx, period);
  // Guard: prevent double-archiving the same period (idempotent protection under the advisory lock).
  const [existingArchive] = await tx.select({ id: archiveRuns.id })
    .from(archiveRuns)
    .where(eq(archiveRuns.period, period))
    .limit(1);
  if (existingArchive) {
    throw new Error(`Period ${period} has already been archived. Archive run ID: ${existingArchive.id}.`);
  }
  const safety = await getCloseoutSafety(tx, period);
  if (!safety.locked) throw new Error(`${period} must be locked before archiving.`);
  if (!safety.eligible) {
    throw new Error(`${period} cannot be archived: ${safety.blockers.map((blocker) => `${blocker.count} ${blocker.label.toLowerCase()}`).join(', ')}.`);
  }

  await fs.mkdir(env.ARCHIVE_DIR, { recursive: true });
  const archiveBase = path.join(env.ARCHIVE_DIR, period);
  const batchRows = await tx.select().from(batches).where(sql`to_char(${batches.createdAt}, 'YYYY-MM') = ${period}`);
  const journalRows = await tx.select().from(commandJournal).where(sql`to_char(${commandJournal.createdAt}, 'YYYY-MM') = ${period}`).orderBy(commandJournal.createdAt);
  // Phase 4 §9: barter settlements participate in the period archive. The
  // export is best-effort — if the barter tables are absent (pre-Phase-0
  // environments) we degrade to an empty file so the archive run still
  // succeeds with consistent control totals.
  let barterRows: Array<Record<string, unknown>> = [];
  try {
    barterRows = (await tx
      .select()
      .from(barterSettlements)
      .where(sql`to_char(${barterSettlements.createdAt}, 'YYYY-MM') = ${period}`)) as unknown as Array<Record<string, unknown>>;
  } catch {
    barterRows = [];
  }
  const controlTotals = safety.controlTotals;

  const csvPath = `${archiveBase}-batches.csv`;
  const jsonlPath = `${archiveBase}-commands.jsonl`;
  const pdfPath = `${archiveBase}-summary.pdf`;
  const barterCsvPath = `${archiveBase}-barter-settlements.csv`;
  await fs.writeFile(csvPath, rowsToCsv(batchRows as unknown as Array<Record<string, unknown>>, ['id', 'batchCode', 'name', 'category', 'intakeQty', 'availableQty', 'status']), 'utf8');
  await fs.writeFile(jsonlPath, journalRows.map((row: typeof commandJournal.$inferSelect) => JSON.stringify(row)).join('\n'), 'utf8');
  await fs.writeFile(
    barterCsvPath,
    rowsToCsv(barterRows, [
      'id',
      'settlementNo',
      'direction',
      'counterpartyType',
      'customerId',
      'vendorId',
      'settlementAmount',
      'costBasis',
      'gainLoss',
      'valueOverridden',
      'overrideReason',
      'status',
      'createdAt'
    ]),
    'utf8'
  );
  await writeArchivePdf(pdfPath, period, controlTotals);
  const [archive] = await tx.insert(archiveRuns).values({ period, controlTotals, csvPath, jsonlPath, pdfPath, status: 'archived' }).returning();
  await tx.update(batches).set({ archivedAt: new Date() }).where(sql`to_char(${batches.createdAt}, 'YYYY-MM') = ${period}`);
  await tx.update(salesOrders).set({ archivedAt: new Date() }).where(sql`to_char(${salesOrders.createdAt}, 'YYYY-MM') = ${period}`);
  return { ok: true, commandId, affectedIds: [archive.id], toast: `${period} archived with matching control totals.`, delta: { controlTotals, csvPath, jsonlPath, pdfPath, barterCsvPath } };
}

/** DYN-H4: Valid status transitions for customer needs. */
export function assertValidNeedStatusTransition(currentStatus: string, newStatus: string): void {
  const validTransitions: Record<string, string[]> = {
    open: ['matched', 'closed'],
    matched: ['open', 'closed'],
    closed: [],
  };
  const allowed = validTransitions[currentStatus] ?? [];
  if (!allowed.includes(newStatus)) {
    throw new Error(`Invalid status transition for customer need: ${currentStatus} → ${newStatus}`);
  }
}

/** DYN-H4: Valid status transitions for vendor supply rows. */
export function assertValidSupplyStatusTransition(currentStatus: string, newStatus: string): void {
  const validTransitions: Record<string, string[]> = {
    open: ['held_for_match', 'closed'],
    held_for_match: ['open', 'closed'],
    closed: [],
    // These states are set by the matchmaking match workflow, not by updateVendorSupply directly.
    // Treat them as effectively terminal from this command's perspective.
    accepted: [],
    dismissed: [],
  };
  const allowed = validTransitions[currentStatus] ?? [];
  if (!allowed.includes(newStatus)) {
    throw new Error(`Invalid status transition for vendor supply: ${currentStatus} → ${newStatus}`);
  }
}

async function createCustomerNeed(tx: Tx, payload: Payload, userId: string, commandId: string): Promise<CommandResult> {
  createCustomerNeedPayloadSchema.parse(payload);
  const customerId = requiredId(payload.customerId, 'customerId');
  const [customer] = await tx.select().from(customers).where(eq(customers.id, customerId)).limit(1);
  if (!customer) throw new Error('Customer not found.');
  const productName = requiredString(payload.productName ?? payload.name, 'productName');
  const category = requiredString(payload.category, 'category');
  const qtyMin = Math.max(0, requiredNumber(payload.qtyMin ?? payload.qty ?? 1, 'qtyMin'));
  if (qtyMin <= 0) throw new Error('Need quantity must be greater than zero.');
  const qtyMaxValue = isBlankValue(payload.qtyMax) ? null : requiredNumber(payload.qtyMax, 'qtyMax');
  if (qtyMaxValue != null && qtyMaxValue < qtyMin) throw new Error('Need max quantity cannot be below min quantity.');
  const tags = tagValue(payload.tags);
  await ensureTagCatalog(tx, tags);
  const [row] = await tx
    .insert(customerNeeds)
    .values({
      needCode: code('NEED'),
      customerId,
      productName,
      category,
      tags,
      qtyMin: qtyScale(qtyMin),
      qtyMax: qtyMaxValue == null ? null : qtyScale(qtyMaxValue),
      targetPrice: isBlankValue(payload.targetPrice) ? null : moneyScale(payload.targetPrice),
      neededBy: dateOrNull(payload.neededBy),
      urgency: urgencyValue(payload.urgency),
      ownerId: userId,
      notes: stringValue(payload.notes) || null,
      status: statusValue(payload.status, ['open', 'matched', 'accepted', 'dismissed', 'closed'], 'open')
    })
    .returning();
  const matchIds = await rebuildMatchesForNeed(tx, row.id);
  return { ok: true, commandId, affectedIds: [row.id, ...matchIds], toast: `Customer need added for ${customer.name}.`, delta: { matchCount: matchIds.length } };
}

async function updateCustomerNeed(tx: Tx, payload: Payload, commandId: string): Promise<CommandResult> {
  const needId = requiredId(payload.customerNeedId ?? payload.id, 'customerNeedId');
  const [current] = await tx.select().from(customerNeeds).where(eq(customerNeeds.id, needId)).limit(1);
  if (!current) throw new Error('Customer need not found.');
  const values: Record<string, unknown> = { updatedAt: new Date() };
  if (payload.customerId !== undefined) values.customerId = stringValue(payload.customerId) ? requiredId(payload.customerId, 'customerId') : null;
  if (payload.productName !== undefined || payload.name !== undefined) values.productName = requiredString(payload.productName ?? payload.name, 'productName');
  if (payload.category !== undefined) values.category = requiredString(payload.category, 'category');
  if (payload.tags !== undefined) {
    values.tags = tagValue(payload.tags);
    await ensureTagCatalog(tx, values.tags as string[]);
  }
  if (payload.qtyMin !== undefined || payload.qty !== undefined) {
    const qtyMin = requiredNumber(payload.qtyMin ?? payload.qty, 'qtyMin');
    if (qtyMin <= 0) throw new Error('Need quantity must be greater than zero.');
    values.qtyMin = qtyScale(qtyMin);
  }
  if (payload.qtyMax !== undefined) values.qtyMax = isBlankValue(payload.qtyMax) ? null : qtyScale(requiredNumber(payload.qtyMax, 'qtyMax'));
  if (payload.targetPrice !== undefined) values.targetPrice = isBlankValue(payload.targetPrice) ? null : moneyScale(payload.targetPrice);
  if (payload.neededBy !== undefined) values.neededBy = dateOrNull(payload.neededBy);
  if (payload.urgency !== undefined) values.urgency = urgencyValue(payload.urgency);
  if (payload.notes !== undefined) values.notes = stringValue(payload.notes) || null;
  if (payload.status !== undefined) values.status = statusValue(payload.status, ['open', 'matched', 'accepted', 'dismissed', 'closed'], 'open');
  const nextQtyMin = Number(values.qtyMin ?? current.qtyMin);
  const nextQtyMax = values.qtyMax == null ? null : Number(values.qtyMax);
  if (nextQtyMax != null && nextQtyMax < nextQtyMin) throw new Error('Need max quantity cannot be below min quantity.');
  const normalizedNextNeed = values.status != null ? String(values.status) : null;
  if (normalizedNextNeed != null && normalizedNextNeed !== current.status) {
    assertValidNeedStatusTransition(current.status, normalizedNextNeed);
  }
  await tx.update(customerNeeds).set(values).where(eq(customerNeeds.id, needId));
  const matchIds = await rebuildMatchesForNeed(tx, needId);
  return { ok: true, commandId, affectedIds: [needId, ...matchIds], toast: 'Customer need updated.', delta: { matchCount: matchIds.length } };
}

// createVendorSupply → @/domains/vendor-management (P1.VM.EXTRACT)
// updateVendorSupply → @/domains/vendor-management (P1.VM.EXTRACT)

/**
 * reopenMatchmakingMatch — reverse path for the #27 status guard.
 *
 * Flips an accepted or dismissed match back to `'open'` so reviewers can re-decide.
 *
 * Sibling-match note: when a match was originally accepted, `reviewMatchmakingMatch`
 * auto-dismissed sibling matches that shared the same customer need or vendor supply.
 * Reopening this match does NOT automatically restore those siblings — those
 * dismissals were independent decisions and stay dismissed. Operators who need a
 * specific sibling re-evaluated must reopen it explicitly with another
 * `reopenMatchmakingMatch` call.
 *
 * When reopened: if no other accepted match exists for the same customer need,
 * the need's status reverts to 'open'. If no other accepted match exists for
 * the same vendor supply, the supply's status reverts to 'open'. This cascade
 * revert is intentional — the need/supply return to the pool for re-matching.
 */
// updateMatchmakingSettings → @/domains/matchmaking (P1.MM.EXTRACT)
// noteMatchmakingOutreach → @/domains/matchmaking (P1.MM.EXTRACT)
// dismissMatchmakingWorkQueueItem → @/domains/matchmaking (P1.MM.EXTRACT)
// reopenMatchmakingMatch → @/domains/matchmaking (P1.MM.EXTRACT)
// reviewMatchmakingMatch → @/domains/matchmaking (P1.MM.EXTRACT)

export async function recalcOrder(tx: Tx, orderId: string, strategy?: string) {
  const lines = await tx.select().from(salesOrderLines).where(eq(salesOrderLines.orderId, orderId));
  // Decimal-precise accumulation: avoid floating-point drift on large line counts.
  const total = lines.reduce((sum: Decimal, line: typeof salesOrderLines.$inferSelect) =>
    sum.plus(new Decimal(String(line.qty ?? 0)).times(new Decimal(String(line.unitPrice ?? 0)))),
    new Decimal(0));
  const cost = lines.reduce((sum: Decimal, line: typeof salesOrderLines.$inferSelect) =>
    sum.plus(new Decimal(String(line.qty ?? 0)).times(new Decimal(String(line.unitCost ?? 0)))),
    new Decimal(0));
  const values: Record<string, unknown> = { total: moneyScale(total.toFixed()), internalMargin: moneyScale(total.minus(cost).toFixed()), updatedAt: new Date() };
  if (strategy) values.pricingStrategy = strategy;
  await tx.update(salesOrders).set(values).where(eq(salesOrders.id, orderId));
}

export function buildPricingSnapshot(lines: Array<typeof salesOrderLines.$inferSelect>, strategy: string, customerTags: string[]) {
  const profile = resolvePricingProfile(strategy, customerTags);
  return {
    strategy,
    profile,
    capturedAt: new Date().toISOString(),
    lines: lines.map((line) => {
      const evaluated = evaluatePrice({
        unitCost: Number(line.unitCost),
        basisUnitPrice: Number(line.unitPrice),
        candidateUnitPrice: Number(line.unitPrice),
        profile
      });
      return {
        lineId: line.id,
        itemName: line.itemName,
        qty: line.qty,
        unitCost: line.unitCost,
        unitPrice: line.unitPrice,
        minimumUnitPrice: moneyScale(evaluated.minimumUnitPrice),
        marginPct: evaluated.marginPct,
        guardrails: evaluated.guardrails
      };
    })
  };
}

export async function recalcPurchaseOrder(tx: Tx, purchaseOrderId: string) {
  const lines = await tx.select().from(purchaseOrderLines).where(eq(purchaseOrderLines.purchaseOrderId, purchaseOrderId));
  // Decimal-precise accumulation: avoid floating-point drift on large line counts.
  const total = lines.reduce((sum: Decimal, line: typeof purchaseOrderLines.$inferSelect) => {
    const qty = new Decimal(String(line.qty ?? 0));
    let cost = new Decimal(String(line.unitCost ?? 0));

    // If line has cost range instead of fixed cost, use midpoint for estimate
    if (cost.isZero() && line.costRangeLow != null && line.costRangeHigh != null) {
      const midpoint = rangeMidpoint(Number(line.costRangeLow), Number(line.costRangeHigh));
      cost = new Decimal(String(midpoint ?? 0));
    }

    return sum.plus(qty.times(cost));
  }, new Decimal(0));
  await tx.update(purchaseOrders).set({ total: moneyScale(total.toFixed()), updatedAt: new Date() }).where(eq(purchaseOrders.id, purchaseOrderId));
}

export function assertPurchaseOrderEditable(status: string) {
  // TER-1657: POs are editable at any lifecycle stage except 'cancelled'.
  // Data-integrity guards (receivedQty floor on qty edits, receivedQty>0 on line removal)
  // remain enforced at the line-level handlers.
  if (status === 'cancelled') {
    throw new Error('Cancelled purchase orders cannot be edited.');
  }
}

export function purchaseOrderLineIssues(line: Record<string, unknown>) {
  const issues: string[] = [];
  if (!stringValue(line.productName)) issues.push('enter product name.');
  if (!stringValue(line.category)) issues.push('enter category.');
  if (Number(line.qty ?? 0) <= 0) issues.push('enter quantity above zero.');

  // Check for either unitCost or valid cost range
  const hasFixedCost = Number(line.unitCost ?? 0) > 0;
  const hasRange = line.costRangeLow != null && line.costRangeHigh != null && Number(line.costRangeLow) > 0 && Number(line.costRangeHigh) > 0;

  if (!hasFixedCost && !hasRange) {
    issues.push('enter unit cost or cost range.');
  }

  return issues;
}

async function ensureVendor(tx: Tx, name: string) {
  const vendorName = name.trim();
  const [existing] = await tx.select().from(vendors).where(eq(vendors.name, vendorName)).limit(1);
  if (existing) return existing.id;
  const [created] = await tx.insert(vendors).values({ name: vendorName, termsDays: 14 }).returning();
  return created.id;
}

export async function ensureItem(tx: Tx, payload: Payload, name: string, category: string) {
  const itemId = stringValue(payload.itemId);
  if (itemId) return itemId;
  const sku = `${category.slice(0, 3).toUpperCase()}-${name.replace(/[^a-z0-9]/gi, '').slice(0, 8).toUpperCase()}-${Math.floor(Math.random() * 999)}`;
  const tags = tagValue(payload.tags);
  await ensureTagCatalog(tx, tags);
  const [created] = await tx.insert(items).values({ sku, name, category, tags }).returning();
  return created.id;
}

export async function ensureTagCatalog(tx: Tx, tags: string[]) {
  const unique = [...new Set(tags.map(normalizeTagSlug).filter(Boolean))];
  for (const slug of unique) {
    await tx
      .insert(tagCatalog)
      .values({ slug, label: tagLabel(slug), color: tagColor(slug) })
      .onConflictDoUpdate({
        target: tagCatalog.slug,
        set: { label: tagLabel(slug), updatedAt: new Date(), isActive: true }
      });
  }
}

async function taggedEntity(tx: Tx, entityType: string, entityId: string) {
  const table = taggedTable(entityType);
  const [row] = await tx.select().from(table).where(eq(table.id, entityId)).limit(1);
  if (!row) throw new Error(`${taggedEntityLabel(entityType)} not found.`);
  return row as Record<string, unknown>;
}

async function updateTaggedEntity(tx: Tx, entityType: string, entityId: string, tags: string[]) {
  const table = taggedTable(entityType);
  await tx.update(table).set({ tags, updatedAt: new Date() }).where(eq(table.id, entityId));
}

function taggedTable(entityType: string) {
  const TAGGED_TABLES = {
    batch: batches,
    purchaseOrderLine: purchaseOrderLines,
    item: items,
    customer: customers,
    customerNeed: customerNeeds,
    vendorSupply: vendorSupply,
  } as const;

  const table = TAGGED_TABLES[entityType as keyof typeof TAGGED_TABLES];
  if (!table) {
    throw new Error('Tags can be applied to item, purchaseOrderLine, batch, customer, customerNeed, or vendorSupply.');
  }
  return table;
}

function taggedEntityLabel(entityType: string) {
  return entityType.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
}

// rebuildMatchesForNeed → @/domains/matchmaking (P1.MM.EXTRACT)
// rebuildMatchesForSupply → @/domains/matchmaking (P1.MM.EXTRACT)
// createBestMatches → @/domains/matchmaking (P1.MM.EXTRACT)
// createBestMatchesForSupply → @/domains/matchmaking (P1.MM.EXTRACT)
// bestSupplyMatchesForNeed → @/domains/matchmaking (P1.MM.EXTRACT)
// scoreMatch → @/domains/matchmaking (P1.MM.EXTRACT)
// tokenOverlap → @/domains/matchmaking (P1.MM.EXTRACT)

async function snapshotFromPayload(payload: Payload) {
  const ids = collectIds(payload);
  return snapshotByAffectedIds(db, ids);
}

/** @internal Exported for unit testing. Pass `tx` inside a transaction so same-tx inserts are visible to the after-snapshot read (GH #150). */
export async function snapshotByAffectedIds(dbLike: typeof db | Tx, ids: string[]) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return {};
  const snapshot: Record<string, unknown> = {};
  const tablePairs = [
    ['batches', batches],
    ['salesOrders', salesOrders],
    ['salesOrderLines', salesOrderLines],
    ['invoices', invoices],
    ['payments', payments],
    ['vendorBills', vendorBills],
    ['vendorPayments', vendorPayments],
    ['purchaseOrders', purchaseOrders],
    ['purchaseOrderLines', purchaseOrderLines],
    ['purchaseReceipts', purchaseReceipts],
    ['pickLists', pickLists],
    ['fulfillmentLines', fulfillmentLines],
    ['connectorRequests', connectorRequests],
    ['customerNeeds', customerNeeds],
    ['vendorSupply', vendorSupply],
    ['matchmakingMatches', matchmakingMatches],
    ['tagCatalog', tagCatalog],
    ['transactionTypes', transactionTypes],
    ['customers', customers],
    ['paymentAllocations', paymentAllocations],
    ['clientLedgerEntries', clientLedgerEntries],
    ['correctionJournalEntries', correctionJournalEntries],
    ['items', items],
    ['barterSettlements', barterSettlements],
    ['barterSettlementLines', barterSettlementLines],
    ['barterSettlementAllocations', barterSettlementAllocations],
  ] as const;

  // GH #310: run all table lookups concurrently instead of 22 sequential round-trips.
  // Each table in tablePairs has a different Drizzle schema type — we cast
  // through the `batches` table shape since all snapshot tables share an `id`
  // column and use identical `select().from()` + `inArray()` patterns.
  const results = await Promise.all(
    tablePairs.map(([, table]) =>
      dbLike
        .select()
        .from(table as typeof batches)
        .where(inArray((table as typeof batches).id, unique))
    )
  );
  for (let i = 0; i < tablePairs.length; i++) {
    const rows = results[i];
    if (rows.length) snapshot[tablePairs[i][0]] = rows;
  }
  return snapshot;
}

export async function writeBagManifest(tx: Tx, pickListId: string) {
  const [pick] = await tx.select().from(pickLists).where(eq(pickLists.id, pickListId)).limit(1);
  if (!pick) throw new Error('Pick list not found.');
  const lines = await tx.select().from(fulfillmentLines).where(eq(fulfillmentLines.pickListId, pickListId));
  const manifestDir = path.join(env.ARCHIVE_DIR, 'bag-manifests');
  await fs.mkdir(manifestDir, { recursive: true });
  const manifestPath = path.join(manifestDir, `${pick.pickNo}.csv`);
  const rows = lines.map((line: typeof fulfillmentLines.$inferSelect) => ({
    pickNo: pick.pickNo,
    fulfillmentLineId: line.id,
    orderLineId: line.orderLineId,
    batchId: line.batchId,
    expectedQty: line.expectedQty,
    actualQty: line.actualQty,
    actualWeight: line.actualWeight,
    bagCode: line.bagCode,
    unitsPerBag: pick.unitsPerBag,
    labelFormat: pick.labelFormat,
    labelsPrinted: pick.labelsPrinted,
    tracking: pick.tracking,
    status: line.status
  }));
  await fs.writeFile(
    manifestPath,
    rowsToCsv(rows as unknown as Array<Record<string, unknown>>, [
      'pickNo',
      'fulfillmentLineId',
      'orderLineId',
      'batchId',
      'expectedQty',
      'actualQty',
      'actualWeight',
      'bagCode',
      'unitsPerBag',
      'labelFormat',
      'labelsPrinted',
      'tracking',
      'status'
    ]),
    'utf8'
  );
  await tx.update(pickLists).set({ manifestPath, updatedAt: new Date() }).where(eq(pickLists.id, pickListId));
  return manifestPath;
}


function collectIds(payload: Payload) {
  const values = [
    payload.id,
    payload.batchId,
    payload.orderId,
    payload.lineId,
    payload.customerId,
    payload.vendorId,
    payload.purchaseOrderId,
    payload.purchaseOrderLineId,
    payload.invoiceId,
    payload.paymentId,
    payload.vendorBillId,
    payload.vendorPaymentId,
    payload.pickListId,
    payload.fulfillmentLineId,
    payload.requestId,
    payload.customerNeedId,
    payload.vendorSupplyId,
    payload.matchId,
    payload.entityId,
    payload.allocationTargetId,
    payload.commandId,
    payload.backupId,
    payload.itemId,
    payload.settlementId,
    payload.receiptId,
    ...(Array.isArray(payload.settlementIds) ? payload.settlementIds : []),
    ...(Array.isArray(payload.batchIds) ? payload.batchIds : []),
    ...(Array.isArray(payload.lineIds) ? payload.lineIds : []),
    ...(Array.isArray(payload.selectedIds) ? payload.selectedIds : []),
    // UX-H04 / BE-009: partial-receive line ids — captures the lines' prior
    // receive state in beforeSnapshot so reversal can restore (not zero) it.
    ...(payload.lineQuantities && typeof payload.lineQuantities === 'object' && !Array.isArray(payload.lineQuantities)
      ? Object.keys(payload.lineQuantities as Record<string, unknown>)
      : []),
    // Barter settlement lines batchId traversal — captures per-line batch
    // references sent in payWithProduct / settleDebtWithProduct payloads
    // so the beforeSnapshot includes those batch rows.
    ...(Array.isArray(payload.lines) ? payload.lines
      .map((l: Record<string, unknown>) => l.batchId)
      .filter((id: unknown): id is string => typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id))
      : []),
  ];
  return values.filter((value): value is string => typeof value === 'string' && /^[0-9a-f-]{36}$/i.test(value));
}

async function writeArchivePdf(filePath: string, period: string, totals: Record<string, unknown>) {
  await new Promise<void>((resolve, reject) => {
    const doc = new PDFDocument({ margin: 48 });
    const stream = doc.pipe(createWriteStream(filePath));
    doc.fontSize(18).text(`TERP Agro Closeout ${period}`);
    doc.moveDown();
    doc.fontSize(11).text('Control totals');
    for (const [key, value] of Object.entries(totals)) doc.text(`${key}: ${value}`);
    doc.end();
    stream.on('finish', resolve);
    stream.on('error', reject);
  });
}

export function decodeShorthand(input?: string) {
  if (!input) return { name: '', category: '', tags: [] as string[] };
  const [prefix, rawName] = input.split('/');
  const categoryMap: Record<string, string> = {
    Ins: 'Infused',
    Flw: 'Flower',
    Ext: 'Extract',
    Prl: 'Pre-roll',
    Vap: 'Vape'
  };
  return {
    name: rawName ? rawName.replace(/[-_]/g, ' ') : input,
    category: categoryMap[prefix] ?? prefix,
    tags: [prefix.toLowerCase(), rawName?.toLowerCase()].filter(Boolean) as string[]
  };
}

// ─── Contacts system handlers (CAP-033 / TER-1564) ──────────────────────────
//
// All handlers follow the existing pattern: take the transaction, the raw
// payload (Record<string, unknown>), and the commandId; return a CommandResult
// with affectedIds for the journal. Payload validation goes through the Zod
// schemas added in src/shared/schemas.ts so the journal-side input matches the
// type the handler expects.

// createContact → @/domains/contacts (P1.CT.EXTRACT)
// updateContact → @/domains/contacts (P1.CT.EXTRACT)
// archiveContact → @/domains/contacts (P1.CT.EXTRACT)
// addContactRole → @/domains/contacts (P1.CT.EXTRACT)
// linkContactToExistingEntity → @/domains/contacts (P1.CT.EXTRACT)
// linkContactToUser → @/domains/contacts (P1.CT.EXTRACT)
// createAppointment → @/domains/contacts (P1.CT.EXTRACT)
// updateAppointment → @/domains/contacts (P1.CT.EXTRACT)
// cancelAppointment → @/domains/contacts (P1.CT.EXTRACT)
// completeAppointment → @/domains/contacts (P1.CT.EXTRACT)

// updateVendor → @/domains/vendor-management (P1.VM.EXTRACT)
// updateProcessor → @/domains/vendor-management (P1.VM.EXTRACT)

export function stringValue(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function isBlankValue(value: unknown) {
  return value == null || (typeof value === 'string' && !value.trim());
}

export function requiredString(value: unknown, name: string) {
  const text = stringValue(value);
  if (!text) throw new Error(`${name} is required.`);
  return text;
}

function labelFromToken(value: string) {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function slugFromLabel(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);
}

export function requiredId(value: unknown, name: string) {
  const id = requiredString(value, name);
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error(`${name} must be a valid ID.`);
  return id;
}

export function requiredIds(value: unknown, name: string) {
  if (!Array.isArray(value) || !value.length) throw new Error(`${name} must include at least one row.`);
  return value.map((item) => requiredId(item, name));
}

export function requiredNumber(value: unknown, name: string) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`${name} must be a number.`);
  return number;
}

export function tagValue(value: unknown, fallback: string[] = []) {
  return parseTagInput(value, fallback);
}

function tagLabel(slug: string) {
  return slug
    .split('-')
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(' ');
}

function tagColor(slug: string) {
  const map: Record<string, string> = {
    infused: 'purple',
    candy: 'orange',
    premium: 'green',
    flower: 'green',
    value: 'gray',
    extract: 'blue',
    live: 'blue',
    vape: 'yellow',
    'pre-roll': 'gray'
  };
  return map[slug] ?? 'gray';
}

function statusValue(value: unknown, allowed: string[], fallback: string) {
  const text = stringValue(value);
  return allowed.includes(text) ? text : fallback;
}

function urgencyValue(value: unknown) {
  return statusValue(value, ['watch', 'normal', 'high'], 'normal');
}

export function ownership(value: unknown) {
  const text = stringValue(value);
  return ['C', 'OFC', 'UNKNOWN'].includes(text) ? text : 'UNKNOWN';
}

function inventoryStatus(value: unknown) {
  const text = stringValue(value);
  if (['posted', 'held', 'damaged', 'returned', 'in_transit'].includes(text)) return text;
  throw new Error('Inventory status must be posted, held, damaged, returned, or in_transit.');
}

export function arrivalStatus(value: unknown, arrivalConfirmed = false) {
  const text = stringValue(value);
  if (['pending', 'arrived', 'cancelled'].includes(text)) return text;
  return arrivalConfirmed ? 'arrived' : 'pending';
}

export function batchValidationIssues(row: Record<string, unknown>) {
  const issues: string[] = [];
  if (!stringValue(row.vendorId)) issues.push('Choose a vendor.');
  if (!stringValue(row.name)) issues.push('Enter product name.');
  if (!stringValue(row.category)) issues.push('Enter category.');
  if (Number(row.intakeQty ?? 0) <= 0) issues.push('Enter intake quantity above zero.');
  if (Number(row.unitCost ?? 0) <= 0) issues.push('Enter unit cost above zero.');
  if (Number(row.unitPrice ?? 0) < 0) issues.push('Price cannot be negative.');
  if (stringValue(row.status) === 'ready' && stringValue(row.arrivalStatus) === 'pending' && !Boolean(row.arrivalConfirmed)) issues.push('Confirm arrival or leave row Draft.');
  return issues;
}

export function salesLineValidationIssues(row: Record<string, unknown>) {
  const issues: string[] = [];
  if (!stringValue(row.itemName)) issues.push('Enter item name.');
  if (Number(row.qty ?? 0) <= 0) issues.push('Enter quantity above zero.');
  if (Number(row.unitPrice ?? 0) < 0) issues.push('Price cannot be negative.');
  if (!stringValue(row.batchId)) issues.push('Choose exact inventory source row.');
  return issues;
}

export async function candidateSourceText(tx: Tx, line: Record<string, unknown>) {
  const raw = stringValue(line.unresolvedSourceText) || stringValue(line.itemName);
  if (!raw) return 'No source candidates found.';
  const terms = raw.split(/\s+/).map((term) => term.trim()).filter(Boolean).slice(0, 4);
  if (!terms.length) return 'No source candidates found.';
  const candidates = await tx
    .select({ batchCode: batches.batchCode, name: batches.name, sourceCode: batches.sourceCode })
    .from(batches)
    .where(
      and(
        eq(batches.status, 'posted'),
        or(
          ...terms.map((term) =>
            or(
              ilike(batches.batchCode, `%${term}%`),
              ilike(batches.sourceCode, `%${term}%`),
              ilike(batches.shorthand, `%${term}%`),
              ilike(batches.name, `%${term}%`),
              ilike(batches.notes, `%${term}%`),
              ilike(batches.legacyMarker, `%${term}%`)
            )
          )
        )
      )
    )
    .limit(5);
  if (!candidates.length) return 'No source candidates found.';
  return `Candidate source rows: ${candidates.map((row: { batchCode: string; name: string; sourceCode?: string | null }) => `${row.batchCode}/${row.sourceCode ?? 'no-code'} ${row.name}`).join('; ')}.`;
}

export function paymentImpactPreview(amount: number, allocationIntent: string) {
  if (amount < 0) return 'Buyer credit/down payment; customer balance decreases before invoice allocation.';
  if (allocationIntent === 'selected_invoice') return 'Payment will be ready for selected invoice allocation.';
  if (allocationIntent === 'unapplied') return 'Payment will stay unapplied as buyer credit until allocated.';
  return 'Payment will be available for oldest-open-invoice allocation.';
}

export function dateOrNull(value: unknown) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function periodValue(value: unknown) {
  const period = requiredString(value, 'period');
  if (!/^\d{4}-\d{2}$/.test(period)) throw new Error('Period must use YYYY-MM format.');
  return period;
}

// [DYNAMIC-AUDIT-P1] Guards write-side period commands from mutating a closed
// period. createCorrectionJournalEntry and postPeriodAdjustments used to write
// silently into locked periods, defeating the closeout boundary.
export async function assertPeriodUnlocked(tx: Tx, period: string) {
  const [lock] = await tx.select().from(periodLocks).where(eq(periodLocks.period, period)).limit(1);
  if (lock) throw new Error(`${period} is locked. Unlock the period before posting adjustments.`);
}

function routeFromRequest(requestType: string) {
  const text = requestType.toLowerCase();
  if (text.includes('payment')) return 'payments';
  if (text.includes('fulfillment') || text.includes('bag') || text.includes('scan')) return 'fulfillment';
  if (text.includes('intake') || text.includes('vendor')) return 'intake';
  return 'sales';
}

export function copyIfPresent(target: Record<string, unknown>, key: string, value: unknown) {
  if (value !== undefined) target[key] = value;
}

// ─── Items / SKU Catalog (TER-1651) ─────────────────────────────────────────

async function createItem(tx: Tx, payload: Payload, commandId: string): Promise<CommandResult> {
  const name = requiredString(payload.name, 'name');
  if (name.trim().length < 2) throw new Error('Item name must be at least 2 characters.');
  const category = requiredString(payload.category, 'category');
  if (!['Flower', 'Infused', 'Extract', 'Pre-roll', 'Vape', 'Edible', 'Other'].includes(category)) {
    throw new Error(`Category must be one of Flower, Infused, Extract, Pre-roll, Vape, Edible, Other.`);
  }
  const trimmedName = name.trim();
  // Reject duplicates by name + category
  const [existing] = await tx.select().from(items)
    .where(and(eq(items.name, trimmedName), eq(items.category, category)))
    .limit(1);
  if (existing) return { ok: true, commandId, affectedIds: [existing.id], toast: `Item ${trimmedName} already exists in ${category}.` };

  // Generate SKU with a large random suffix (6 hex chars = 16M+ slots)
  // to avoid collisions that the old 99-slot Math.random() space caused.
  const skuPrefix = `${trimmedName.replace(/[^a-z0-9]/gi, '').slice(0, 8).toUpperCase()}-${category.slice(0, 3).toUpperCase()}`;
  const tags = tagValue(payload.tags);
  await ensureTagCatalog(tx, tags);

  // Retry loop for the extremely rare case of a suffix collision (1 in 16M).
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const suffix = randomBytes(3).toString('hex').toUpperCase();
    const sku = `${skuPrefix}-${suffix}`;
    try {
      const [created] = await tx.insert(items).values({
        sku,
        name: trimmedName,
        alias: stringValue(payload.alias) || null,
        category,
        tags,
        description: stringValue(payload.description) || null,
        status: 'active'
      }).returning();

      invalidateReferenceCache();
      return { ok: true, commandId, affectedIds: [created.id], toast: `${trimmedName} created in ${category}.` };
    } catch (err: unknown) {
      lastErr = err;
      // Only retry on unique-constraint violations (collision); rethrow everything else.
      const msg = scrubDatabaseError(err).safeMessage;
      if (!/unique|duplicate|already exists/i.test(msg)) throw err;
      // Otherwise try again with a new suffix.
    }
  }
  throw lastErr;
}

async function updateItem(tx: Tx, payload: Payload, commandId: string): Promise<CommandResult> {
  const itemId = requiredId(payload.itemId ?? payload.id, 'itemId');
  const [item] = await tx.select().from(items).where(eq(items.id, itemId)).limit(1);
  if (!item) throw new Error('Item not found.');

  const values: Record<string, unknown> = { updatedAt: new Date() };
  if (payload.name !== undefined) {
    const name = requiredString(payload.name, 'name');
    if (name.trim().length < 2) throw new Error('Item name must be at least 2 characters.');
    values.name = name.trim();
  }
  if (payload.alias !== undefined) {
    const raw = stringValue(payload.alias);
    values.alias = (raw && raw.trim()) || null;
  }
  if (payload.category !== undefined) {
    const category = requiredString(payload.category, 'category');
    if (!['Flower', 'Infused', 'Extract', 'Pre-roll', 'Vape', 'Edible', 'Other'].includes(category)) {
      throw new Error(`Category must be one of Flower, Infused, Extract, Pre-roll, Vape, Edible, Other.`);
    }
    values.category = category;
  }
  if (payload.tags !== undefined) {
    const tags = tagValue(payload.tags);
    await ensureTagCatalog(tx, tags);
    values.tags = tags;
  }
  if (payload.description !== undefined) {
    values.description = stringValue(payload.description) || null;
  }

  // Prevent rename into a duplicate (name, category) pair
  if (payload.name !== undefined || payload.category !== undefined) {
    const effectiveName = (values.name as string) ?? item.name;
    const effectiveCategory = (values.category as string) ?? item.category;
    const [duplicate] = await tx.select().from(items)
      .where(and(eq(items.name, effectiveName), eq(items.category, effectiveCategory), sql`${items.id} <> ${itemId}`))
      .limit(1);
    if (duplicate) throw new Error(`An item named "${effectiveName}" already exists in the ${effectiveCategory} category.`);
  }

  if (Object.keys(values).length === 1) {
    return { ok: true, commandId, affectedIds: [itemId], toast: `${item.name}: no changes to make.` };
  }

  await tx.update(items).set(values).where(eq(items.id, itemId));
  invalidateReferenceCache();
  const changedFields = Object.keys(values).filter(k => k !== 'updatedAt').join(', ');
  return { ok: true, commandId, affectedIds: [itemId], toast: `${values.name || item.name} updated (${changedFields}).` };
}

async function toggleItemStatus(tx: Tx, payload: Payload, commandId: string): Promise<CommandResult> {
  const itemId = requiredId(payload.itemId ?? payload.id, 'itemId');
  const [item] = await tx.select().from(items).where(eq(items.id, itemId)).for('update').limit(1);
  if (!item) throw new Error('Item not found.');

  const currentStatus = item.status ?? 'active';
  const nextStatus = currentStatus === 'active' ? 'inactive' : 'active';
  await tx.update(items).set({ status: nextStatus, updatedAt: new Date() }).where(eq(items.id, itemId));
  const action = nextStatus === 'active' ? 'activated' : 'deactivated';
  return { ok: true, commandId, affectedIds: [itemId], toast: `${item.name} ${action}.`, delta: { previousStatus: currentStatus, status: nextStatus } };
}

async function resolveInvoiceDispute(tx: Tx, payload: Payload, commandId: string): Promise<CommandResult> {
  resolveInvoiceDisputePayloadSchema.parse(payload);
  const disputeId = requiredId(payload.disputeId ?? payload.id, 'disputeId');
  const resolution = stringValue(payload.resolution) || 'Resolved by operator.';
  const [row] = await tx.select().from(invoiceDisputes).where(eq(invoiceDisputes.id, disputeId)).limit(1);
  if (!row) throw new Error('Dispute not found.');
  if (row.status !== 'open') throw new Error('Only open disputes can be resolved.');
  await tx
    .update(invoiceDisputes)
    .set({ status: 'resolved', resolution: resolution || null, updatedAt: new Date() })
    .where(eq(invoiceDisputes.id, disputeId));

  // Enqueue credit recompute for the affected customer
  const [invoiceRow] = await tx
    .select({ customerId: invoices.customerId })
    .from(invoices)
    .where(eq(invoices.id, row.invoiceId))
    .limit(1);
  if (invoiceRow?.customerId) {
    await enqueueCustomerRecompute(tx, invoiceRow.customerId, 'event:resolveDispute', commandId);
  }

  return { ok: true, commandId, affectedIds: [disputeId], toast: 'Invoice dispute resolved.' };
}

async function rejectInvoiceDispute(tx: Tx, payload: Payload, commandId: string): Promise<CommandResult> {
  rejectInvoiceDisputePayloadSchema.parse(payload);
  const disputeId = requiredId(payload.disputeId ?? payload.id, 'disputeId');
  const reason = stringValue(payload.reason) || 'Rejected by operator.';
  const [row] = await tx.select().from(invoiceDisputes).where(eq(invoiceDisputes.id, disputeId)).limit(1);
  if (!row) throw new Error('Dispute not found.');
  if (row.status !== 'open') throw new Error('Only open disputes can be rejected.');
  await tx
    .update(invoiceDisputes)
    .set({ status: 'rejected', resolution: reason ? `Rejected: ${reason}` : 'Rejected: (no reason given)', updatedAt: new Date() })
    .where(eq(invoiceDisputes.id, disputeId));

  // Recompute credit for the customer (dispute rejection re-includes invoice in debtAging)
  const [invoiceRow] = await tx
    .select({ customerId: invoices.customerId })
    .from(invoices)
    .where(eq(invoices.id, row.invoiceId))
    .limit(1);
  if (invoiceRow?.customerId) {
    await enqueueCustomerRecompute(tx, invoiceRow.customerId, 'event:rejectDispute', commandId);
  }

  return { ok: true, commandId, affectedIds: [disputeId], toast: 'Invoice dispute rejected.' };
}

// ─── D2 — merge candidate review (RBAC + audit trail) ─────────────────────

/**
 * Mark a merge candidate as reviewed (manager-gated, command-journaled).
 * Does NOT actually merge contacts — just records the operator's review.
 * Merge execution is a separate capability.
 */
async function approveMergeCandidate(tx: Tx, payload: Payload, commandId: string): Promise<CommandResult> {
  approveMergeCandidatePayloadSchema.parse(payload);
  const candidateId = requiredId(payload.candidateId ?? payload.id, 'candidateId');
  const [row] = await tx.select().from(contactMergeCandidates).where(eq(contactMergeCandidates.id, candidateId)).limit(1);
  if (!row) throw new Error('Merge candidate not found.');
  if (row.reviewed) throw new Error('Merge candidate has already been reviewed.');
  await tx
    .update(contactMergeCandidates)
    .set({ reviewed: true, dismissed: false })
    .where(eq(contactMergeCandidates.id, candidateId));
  return { ok: true, commandId, affectedIds: [candidateId], toast: 'Merge candidate marked as reviewed. Actual contact merging is not yet available.' };
}

/**
 * Dismiss (reject) a merge candidate (manager-gated, command-journaled).
 */
async function dismissMergeCandidate(tx: Tx, payload: Payload, commandId: string): Promise<CommandResult> {
  dismissMergeCandidatePayloadSchema.parse(payload);
  const candidateId = requiredId(payload.candidateId ?? payload.id, 'candidateId');
  const [row] = await tx.select().from(contactMergeCandidates).where(eq(contactMergeCandidates.id, candidateId)).limit(1);
  if (!row) throw new Error('Merge candidate not found.');
  if (row.reviewed) throw new Error('Merge candidate has already been reviewed.');
  await tx
    .update(contactMergeCandidates)
    .set({ reviewed: true, dismissed: true })
    .where(eq(contactMergeCandidates.id, candidateId));
  return { ok: true, commandId, affectedIds: [candidateId], toast: 'Merge candidate dismissed.' };
}
