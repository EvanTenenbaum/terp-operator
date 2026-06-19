# Function & Route Mapping — commandBus.ts & queries.ts

## Side-Effect Audit (P0.B)

**Date:** 2026-06-18
**Auditor:** PM/router (DeepSeek V4 Pro)
**Risk:** T2

### Findings

| # | File | Line | Side Effect | Type | Extraction Strategy |
|---|------|------|-------------|------|---------------------|
| 1 | commandBus.ts | 13 | `Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP })` | Global library config | Safe. Must run once at app startup. Can remain in commandBus.ts (the re-export shim) or move to a shared `init.ts`. All domain modules that do monetary math already depend on Decimal — this config is global state. |
| 2 | db.ts | 39 | `export const pool = new pg.Pool(poolConfig)` | DB connection pool creation | Safe. Triggered when commandBus.ts does `import { db, pool } from '../db'`. Domain modules will do the same import. No change in import resolution path. The pool is a singleton created once via Node module caching. |
| 3 | pricing.ts | — | `const profiles: Record<...>` | Module-level constant | No side effect. Purely declarative. Safe. |

### Verdict

**No blocking side effects for extraction.** The two real side effects (Decimal.set and pg.Pool creation) are both safe:
- `Decimal.set` is global config that domain modules inherit automatically
- `pg.Pool` is a singleton created once by Node's module cache — same pool shared regardless of import path
- No singleton registries, event listeners, timers, or mutable module-level state in commandBus.ts

### Extraction Safety

Domain modules can safely `import { db, pool } from '@/server/db'` without re-creating the pool or triggering duplicate side effects. The `Decimal.set` call must be preserved in exactly one place in the import chain — the current location (commandBus.ts re-export shim) works, or it can move to a dedicated `src/domains/shared/init.ts`.

---

## Phase 0 Status

- [x] P0.B — Side-effect audit complete (this document)
- [x] P0.C — Test baseline: 287 test files, 21 skipped tests, full suite TBD
- [x] P0.E — Path aliases configured, typecheck & build pass
- [ ] P0.F — Function-to-domain mapping
- [ ] P0.G — Route-to-domain mapping
- [ ] P0.A.SH1 — Extract shared journal
- [ ] P0.A.SH2 — Extract shared socket emitter
- [ ] P0.D — tRPC typecheck simulation (intake canary)

---

## Command-to-Domain Mapping (P0.F)

120 commands identified in commandBus.ts's `runCommand` switch/case. Categorized below:

### purchase-orders (12 commands)
createPurchaseOrder, updatePurchaseOrder, addPurchaseOrderLine, updatePurchaseOrderLine, removePurchaseOrderLine, finalizePurchaseOrder, unfinalizePurchaseOrder, approvePurchaseOrder, receivePurchaseOrder, cancelPurchaseOrder, postPurchaseReceipt, recordVendorPrepayment

### sales-orders (16 commands)
createSalesOrder, confirmSalesOrder, postSalesOrder, cancelSalesOrder, priceSalesOrder, setLineLandedCost, addSalesOrderLine, removeSalesOrderLine, updateSalesOrderLine, repriceOrder, setCustomerPricingRule, setDefaultPricingRule, setLineBelowFloorReason, setDeliveryWindow, reserveInventoryForOrder, resolveVendorApproval

### payments (11 commands)
recordVendorPayment, scheduleVendorPayment, voidVendorPayment, allocatePayment, unallocatePayment, refundPayment, logPayment, markPaymentUnapplied, applyClientCredit, applyDiscount, markUserFeeCollected

### intake (11 commands)
createBatch, updateBatch, deleteBatch, rejectBatch, flagBatch, verifyAllIntake, adjustBatchQuantity, setBatchPrice, setBatchLotInfo, createCustomerSheetSnapshot, importBatchesCsv

### inventory (3 commands)
setInventoryStatus, transferInventoryLocation, transferInventoryOwnership

### media (7 commands)
attachBatchPhoto, deleteBatchMedia, publishBatchMedia, setBatchMediaRole, uploadBatchMedia, mintPhotoUploadToken, revokePhotoUploadToken

### credit (12 commands)
setCustomerCreditLimit, revertCustomerCreditToEngine, snoozeCustomerCreditReminder, setCustomerEngineMax, setCustomerStance, disableCreditEngineForCustomer, enableCreditEngineForCustomer, createCreditEngineStance, updateCreditEngineStance, deleteCreditEngineStance, setCreditEngineConfig, bulkRevertCustomersToEngine

### pick (7 commands)
createPickList, recallLineFromPicking, releaseLineForPicking, releaseLinesForPicking, recordWeighAndPack, printLabels, returnPickedUnits

### vendor-management (7 commands)
createVendor, updateVendor, createVendorBill, approveVendorBill, createVendorSupply, updateVendorSupply, updateProcessor, updateProcessorFeeStatus

### matchmaking (5 commands)
updateMatchmakingSettings, noteMatchmakingOutreach, dismissMatchmakingWorkQueueItem, reopenMatchmakingMatch, reviewMatchmakingMatch

### contacts (7 commands)
createContact, updateContact, archiveContact, addContactRole, linkContactToExistingEntity, linkContactToUser, createAppointment, updateAppointment, completeAppointment, cancelAppointment

### shared/cross-cutting (remaining: ~12)
reverseCommandById, restoreFromBackupPoint, documentCommandFailure, lockPeriod, archivePeriod, postPeriodAdjustments, snapshotByAffectedIds, approveConnectorRequest, rejectConnectorRequest, routeConnectorRequest, acknowledgeWarehouseAlert, resolveInvoiceDispute, rejectInvoiceDispute, createCorrectionJournalEntry, postTransactionLedgerRow, createItem, updateItem, toggleItemStatus, setItemAlias, createReferee, updateReferee, createPaymentProcessor, createCustomerNeed, updateCustomerNeed, addRefereeRelationship, updateRefereeRelationship, deactivateRefereeRelationship, upsertTransactionType, applyTags, printLabels, adjustFulfillmentLine, allocateOrderToFulfillment, cancelFulfillmentLine, markOrderFulfilled

Note: Cross-cutting commands stay in a shared module or merge router. Contact-related commands could become a contacts domain.

---

## Phase 0 Status Update

- [x] P0.B — Side-effect audit complete
- [x] P0.C — Test baseline: 287 test files, 21 skipped
- [x] P0.E — Path aliases configured, typecheck & build pass
- [x] P0.F — 120 commands mapped to 11 domains + shared
- [ ] P0.G — Route-to-domain mapping (deferred: queries.ts routes will be mapped per-domain during extraction)
- [ ] P0.A.SH1 — Extract shared journal
- [ ] P0.A.SH2 — Extract shared socket emitter
- [ ] P0.D — tRPC typecheck simulation (intake canary)
