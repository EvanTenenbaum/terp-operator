/**
 * System/Recovery/Closeout domain schemas.
 *
 * Extracted from src/server/services/commandBus.ts inline handlers
 * during the final command-registry migration wave. Uses .passthrough()
 * everywhere to avoid tightening validation during migration.
 */
import { z } from 'zod';

// ── Tags ──────────────────────────────────────────────────────────────────────
export const applyTagsPayloadSchema = z.object({
  entityType: z.string().min(1),
  entityId: z.string().optional(),
  id: z.string().optional(),
  tags: z.unknown().optional(),
  mode: z.string().optional(),
}).passthrough();

// ── Fulfillment / Warehouse ───────────────────────────────────────────────────
export const acknowledgeWarehouseAlertPayloadSchema = z.object({
  fulfillmentLineId: z.string().uuid().optional(),
  id: z.string().uuid().optional(),
  alertIndex: z.union([z.number(), z.string()]).optional(),
}).passthrough();

export const cancelFulfillmentLinePayloadSchema = z.object({
  fulfillmentLineId: z.string().uuid().optional(),
  id: z.string().uuid().optional(),
}).passthrough();

export const markOrderFulfilledPayloadSchema = z.object({
  orderId: z.string().uuid(),
  tracking: z.string().optional(),
}).passthrough();

// ── Connector Requests ────────────────────────────────────────────────────────
export const approveConnectorRequestPayloadSchema = z.object({
  requestId: z.string().uuid().optional(),
  id: z.string().uuid().optional(),
  operatorNotes: z.string().optional(),
  routedTo: z.string().optional(),
}).passthrough();

export const rejectConnectorRequestPayloadSchema = approveConnectorRequestPayloadSchema;
export const routeConnectorRequestPayloadSchema = approveConnectorRequestPayloadSchema;

// ── Ledger / Journal ──────────────────────────────────────────────────────────
export const createCorrectionJournalEntryPayloadSchema = z.object({
  period: z.string().optional(),
  amount: z.coerce.number(),
  memo: z.string().min(1),
  date: z.union([z.string(), z.date()]).optional(),
  createdAt: z.union([z.string(), z.date()]).optional(),
  invoiceId: z.string().uuid().optional(),
  reason: z.string().optional(),
  findReplace: z.unknown().optional(),
}).passthrough();

export const postTransactionLedgerRowPayloadSchema = z.object({
  direction: z.string().min(1),
  entityType: z.string().min(1),
  transactionType: z.string().min(1),
  amount: z.coerce.number(),
  entityId: z.string().uuid().optional(),
  entityName: z.string().optional(),
  kind: z.string().optional(),
  method: z.union([z.string(), z.null()]).optional(),
  reference: z.union([z.string(), z.null()]).optional(),
  notes: z.string().optional(),
  allocationTargetType: z.string().optional(),
  allocationTargetId: z.string().uuid().optional(),
  allocationIntent: z.string().optional(),
  bucket: z.string().optional(),
  date: z.union([z.string(), z.date()]).optional(),
}).passthrough();

export const upsertTransactionTypePayloadSchema = z.object({
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
}).passthrough();

// ── Command Lifecycle / Recovery ──────────────────────────────────────────────
export const reverseCommandByIdPayloadSchema = z.object({
  commandId: z.string().uuid(),
}).passthrough();

export const documentCommandFailurePayloadSchema = z.object({
  commandId: z.string(),
  reason: z.string(),
}).passthrough();

export const restoreFromBackupPointPayloadSchema = z.object({
  backupId: z.string(),
}).passthrough();

// ── Period Closeout ───────────────────────────────────────────────────────────
export const postPeriodAdjustmentsPayloadSchema = z.object({
  period: z.string().optional(),
  amount: z.coerce.number().optional(),
  memo: z.string().optional(),
  adjustments: z.array(z.unknown()).optional(),
}).passthrough();

export const lockPeriodPayloadSchema = z.object({
  period: z.string(),
}).passthrough();

export const archivePeriodPayloadSchema = z.object({
  period: z.string().min(1),
}).passthrough();

// ── Customer Needs ────────────────────────────────────────────────────────────
export const createCustomerNeedPayloadSchema = z.object({
  customerId: z.string().uuid(),
  productName: z.string().optional(),
  name: z.string().optional(),
  category: z.string().min(1),
  qtyMin: z.coerce.number().optional(),
  qty: z.coerce.number().optional(),
  qtyMax: z.coerce.number().optional(),
  tags: z.array(z.string()).optional(),
  targetPrice: z.coerce.number().optional(),
  neededBy: z.string().optional(),
  urgency: z.unknown().optional(),
  notes: z.string().optional(),
  status: z.string().optional(),
}).passthrough();

export const updateCustomerNeedPayloadSchema = z.object({
  customerNeedId: z.string().uuid().optional(),
  id: z.string().uuid().optional(),
}).passthrough();

// ── Items / Aliases ───────────────────────────────────────────────────────────
export const setItemAliasPayloadSchema = z.object({
  itemId: z.string().uuid().optional(),
  id: z.string().uuid().optional(),
  alias: z.string().optional(),
}).passthrough();

// ── Referee System ────────────────────────────────────────────────────────────
export const createRefereePayloadSchema = z.object({
  name: z.string().min(1),
  email: z.string().optional(),
  notes: z.string().optional(),
}).passthrough();

export const updateRefereePayloadSchema = z.object({
  refereeId: z.string().uuid().optional(),
  id: z.string().uuid().optional(),
}).passthrough();

export const addRefereeRelationshipPayloadSchema = z.object({
  refereeId: z.string().uuid(),
  customerId: z.string().uuid(),
  relationshipType: z.string().optional(),
}).passthrough();

export const updateRefereeRelationshipPayloadSchema = z.object({
  relationshipId: z.string().uuid().optional(),
  id: z.string().uuid().optional(),
}).passthrough();

export const deactivateRefereeRelationshipPayloadSchema = z.object({
  relationshipId: z.string().uuid().optional(),
  id: z.string().uuid().optional(),
}).passthrough();

export const voidRefereeCreditPayloadSchema = z.object({
  creditId: z.string().uuid().optional(),
  id: z.string().uuid().optional(),
}).passthrough();

// ── Payment Processors ────────────────────────────────────────────────────────
export const createPaymentProcessorPayloadSchema = z.object({
  name: z.string().min(1),
  feePct: z.coerce.number().optional(),
  notes: z.string().optional(),
}).passthrough();

export const updateProcessorFeeStatusPayloadSchema = z.object({
  processorId: z.string().uuid().optional(),
  id: z.string().uuid().optional(),
  feeStatus: z.string().optional(),
}).passthrough();

// ── System Settings ───────────────────────────────────────────────────────────
export const updateSystemSettingPayloadSchema = z.object({
  key: z.string().min(1),
  value: z.unknown().optional(),
}).passthrough();

// ── Items (CRUD) ──────────────────────────────────────────────────────────────
export const createItemPayloadSchema = z.object({
  name: z.string().min(1),
  category: z.string().min(1),
  tags: z.array(z.string()).optional(),
  sku: z.string().optional(),
  alias: z.string().optional(),
}).passthrough();

export const updateItemPayloadSchema = z.object({
  itemId: z.string().uuid().optional(),
  id: z.string().uuid().optional(),
}).passthrough();

export const toggleItemStatusPayloadSchema = z.object({
  itemId: z.string().uuid().optional(),
  id: z.string().uuid().optional(),
}).passthrough();

// ── Invoice Disputes ──────────────────────────────────────────────────────────
export const resolveInvoiceDisputePayloadSchema = z.object({
  disputeId: z.string().uuid().optional(),
  id: z.string().uuid().optional(),
  resolution: z.string().optional(),
}).passthrough();

export const rejectInvoiceDisputePayloadSchema = z.object({
  disputeId: z.string().uuid().optional(),
  id: z.string().uuid().optional(),
  reason: z.string().optional(),
}).passthrough();

// ── Merge Candidates ──────────────────────────────────────────────────────────
export const approveMergeCandidatePayloadSchema = z.object({
  candidateId: z.string().uuid().optional(),
  id: z.string().uuid().optional(),
}).passthrough();

export const dismissMergeCandidatePayloadSchema = z.object({
  candidateId: z.string().uuid().optional(),
  id: z.string().uuid().optional(),
}).passthrough();
