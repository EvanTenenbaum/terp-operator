# Backend / Frontend Parity Audit

Date: 2026-05-11
Purpose: confirm every backend command, query, and operator-facing ability has a visible frontend surface, then close any gaps.

## Method

1. Enumerated the backend command domain from `src/shared/commandCatalog.ts`.
2. Enumerated query endpoints from `src/server/routers/queries.ts`.
3. Compared each command against direct frontend `runCommand('commandName')` surfaces, not only the generic command palette.
4. Compared each query endpoint against `trpc.queries.*` frontend usage.
5. Audited table-backed projections for data that existed server-side but was not visible in operator context.
6. Added `pnpm audit:parity` as an automated drift check.

## Gaps Found And Fixed

| Backend capability | Gap found | Frontend surface added |
| --- | --- | --- |
| `importBatchesCsv` | No validate-first CSV import UI. | Intake CSV sidecar with Validate and Import actions plus row-level JSON result output. |
| `deleteBatch` | Draft batch deletion existed only in backend. | Intake selected-row Delete Draft action gated by backend RBAC/status rules. |
| `setBatchLotInfo` | Lot and expiration updates were not explicitly visible. | Intake selected-row lot/expiration controls and Inventory inline lot/expiration editing. |
| `removeSalesOrderLine` | Draft line removal was not exposed. | Sales customer draft line selected-row Remove action. |
| `reserveInventoryForOrder` | Reservation command was not visible. | Sales selected order Reserve action. |
| `setDeliveryWindow` | Delivery window edits used a generic order update path. | Orders inline delivery-window edits now route through the typed command. |
| `unallocatePayment` | Allocation reversal existed only in backend. | Payments allocation panel with selected allocation unallocate. |
| `applyEarlyPayDiscount` | Discount command had no operator control. | Payments allocation panel invoice/amount discount action. |
| `createVendorBill` | Manual payable creation was not exposed. | Vendor payables manual bill creator. |
| `voidVendorPayment` | Payout voiding existed only in backend. | Vendor payout trace panel with void action. |
| `createPickList` | Backend alias existed, but no literal UI command surface. | Orders selected-row Pick List action. |
| `approveConnectorRequest` | Approve action became hidden after simplifying connector review. | Connector review secondary Approve action restored beside Reject/Route. |
| `csvExport` | Deterministic server CSV endpoint was unused. | Operator grids now include Server CSV export for non-dashboard grids. |
| `inventoryMovements` | Movement history existed but was not directly row-visible. | Row command history drawer now shows inventory movements for selected batches. |
| `photographyQueue` | Queue table existed but panel used only inventory rows. | Photography Queue panel now reads the queue endpoint and attaches photos with the backend `photoUrl` field. |
| `relationshipSummary` detail rows | Ledger entries, credit overrides, invoice disputes, and purchase receipts were not visible. | Relationship drawer now includes those tables alongside orders/invoices/payments/bills/commands. |

## Current Command Parity

All 54 typed backend commands now have direct frontend surfaces:

- Intake: `createBatch`, `updateBatch`, `deleteBatch`, `postPurchaseReceipt`, `adjustBatchQuantity`, `setBatchPrice`, `setBatchLotInfo`, `attachBatchPhoto`, `importBatchesCsv`
- Purchase orders: `createPurchaseOrder`, `updatePurchaseOrder`, `addPurchaseOrderLine`, `updatePurchaseOrderLine`, `removePurchaseOrderLine`, `approvePurchaseOrder`, `receivePurchaseOrder`, `cancelPurchaseOrder`
- Sales: `createSalesOrder`, `addSalesOrderLine`, `updateSalesOrderLine`, `removeSalesOrderLine`, `reserveInventoryForOrder`, `priceSalesOrder`, `confirmSalesOrder`, `cancelSalesOrder`
- Posting: `postSalesOrder`, `allocateOrderToFulfillment`, `applyClientCredit`, `setDeliveryWindow`
- Payments: `logPayment`, `allocatePayment`, `unallocatePayment`, `refundPayment`, `applyEarlyPayDiscount`
- Vendor: `createVendorBill`, `approveVendorBill`, `scheduleVendorPayment`, `recordVendorPayment`, `voidVendorPayment`
- Fulfillment: `createPickList`, `recordWeighAndPack`, `markOrderFulfilled`, `printLabels`, `adjustFulfillmentLine`
- Connector: `approveConnectorRequest`, `rejectConnectorRequest`, `routeConnectorRequest`
- Recovery: `createCorrectionJournalEntry`, `reverseCommandById`, `restoreFromBackupPoint`, `repriceOrder`
- Closeout: `postPeriodAdjustments`, `lockPeriod`, `archivePeriod`

## Current Query Parity

All 27 protected query endpoints have frontend surfaces:

- Core: `dashboard`, `health`, `reference`, `grid`, `drilldown`, `workQueue`
- Purchase, sales, and intake: `purchaseOrderLines`, `salesOrderLines`, `customerWorkspace`, `receiptPreview`, `salesSuggestions`
- Recovery and audit: `recoverySearch`, `relatedCommands`, `supportPacket`, `snapshotDiff`, `findReplacePreview`, `reversalPreview`
- Money and relationships: `paymentAllocationPreview`, `paymentAllocations`, `relationshipSummary`, `vendorPayments`
- Fulfillment and media: `fulfillmentLines`, `inventoryMovements`, `photographyQueue`
- Search/export/closeout: `globalSearch`, `csvExport`, `closeoutPreview`

`subscriptions.heartbeat` remains an internal technical connection/health channel rather than an operator action. Authentication endpoints remain visible through login/logout/session state.

## Drift Prevention

`pnpm audit:parity` now fails if:

- a command in `commandCatalog.ts` has no direct frontend `runCommand('commandName')` surface, or
- a protected query endpoint in `queries.ts` has no frontend `trpc.queries.endpointName` usage.

Current proof:

```bash
pnpm audit:parity
# Backend/frontend parity OK: 54 commands and 27 query endpoints have frontend surfaces.
```
