# TERP Operator Handoff — Coverage Matrix (Completeness Proof)

> Auto-generated cross-check at commit `895a3c9`. Each artifact from `00-MASTER-INVENTORY.md` is whole-word grep-matched (`grep -lw`) across all handoff dossiers.
> **Invariant: every row resolves to at least one document. A `MISSING` cell is a documentation defect.**

Document key: 01 Overview/Roles · 02 Global UX · 03 Capability Registry · 04 Auth/Mobile/Doc-procs · 10 Purchasing/Intake · 11 Inventory/Tags/Media · 12 Sales/Pricing/Matchmaking · 13 Fulfillment/Picking · 14 Money AR/AP/Closeout/Recovery · 15 Credit Engine · 16 Contacts/Referees/Connectors/Processors · 20 Platform Spec

## Coverage summary
| Artifact class | Total | Coverage |
| --- | --- | --- |
| Write-path commands | 130 | 100% |
| Domain tables | 45 | 100% |
| queries.ts procedures | 71 | 100% |
| Views (desktop + mobile) | 19 | 100% |
| Components | 96 | 100% |
| Server services | 18 | 100% |
| Credit-engine modules | 15 | 100% |

## 1. Command → Document(s)
| Command | Documented in |
| --- | --- |
| `acceptMatchmakingMatch` | 03 12  |
| `acknowledgeWarehouseAlert` | 13  |
| `addContactRole` | 16  |
| `addPurchaseOrderLine` | 03 10  |
| `addRefereeRelationship` | 16  |
| `addSalesOrderLine` | 03 12  |
| `adjustBatchQuantity` | 01 03 10 11 20  |
| `adjustFulfillmentLine` | 03 13  |
| `allocateOrderToFulfillment` | 03 12 13  |
| `allocatePayment` | 01 03 14  |
| `applyClientCredit` | 01 03 12 20  |
| `applyEarlyPayDiscount` | 03 14  |
| `applyTags` | 01 03 11  |
| `approveConnectorRequest` | 03 16  |
| `approvePurchaseOrder` | 01 03 10  |
| `approveVendorBill` | 01 03 14  |
| `archiveContact` | 16  |
| `archivePeriod` | 01 03 14  |
| `attachBatchPhoto` | 03 11  |
| `bulkRevertCustomersToEngine` | 01 15  |
| `cancelAppointment` | 16  |
| `cancelFulfillmentLine` | 12 13  |
| `cancelPurchaseOrder` | 01 03 10  |
| `cancelSalesOrder` | 01 03 12 13 20  |
| `completeAppointment` | 16  |
| `confirmSalesOrder` | 01 02 03 12 15 20  |
| `createAppointment` | 16  |
| `createBatch` | 01 03 10 11 20  |
| `createContact` | 16  |
| `createCorrectionJournalEntry` | 03 14 20  |
| `createCreditEngineStance` | 15  |
| `createCustomerNeed` | 03 12  |
| `createCustomerSheetSnapshot` | 12  |
| `createPaymentProcessor` | 16  |
| `createPickList` | 01 03 12 13  |
| `createPurchaseOrder` | 01 03 10  |
| `createReferee` | 16  |
| `createSalesOrder` | 01 03 12  |
| `createVendor` | 03 10 16  |
| `createVendorBill` | 03 14  |
| `createVendorSupply` | 03 12  |
| `deactivateRefereeRelationship` | 16  |
| `deleteBatch` | 01 03 11  |
| `deleteBatchMedia` | 11  |
| `deleteCreditEngineStance` | 15  |
| `disableCreditEngineForCustomer` | 15  |
| `dismissMatchmakingMatch` | 03 12  |
| `dismissMatchmakingWorkQueueItem` | 12  |
| `documentCommandFailure` | 14 20  |
| `enableCreditEngineForCustomer` | 15  |
| `finalizePurchaseOrder` | 10 20  |
| `flagBatch` | 10 11  |
| `importBatchesCsv` | 03 10 11  |
| `linkContactToExistingEntity` | 16  |
| `linkContactToUser` | 16  |
| `lockPeriod` | 01 03 14  |
| `logPayment` | 01 03 14 20  |
| `markOrderFulfilled` | 03 13  |
| `markUserFeeCollected` | 01 16  |
| `mintPhotoUploadToken` | 01 11 20  |
| `noteMatchmakingOutreach` | 12  |
| `postPeriodAdjustments` | 03 14 20  |
| `postPurchaseReceipt` | 02 03 10 11 20  |
| `postSalesOrder` | 01 03 12 14 20  |
| `postTransactionLedgerRow` | 14 16 20  |
| `priceSalesOrder` | 03 12  |
| `printLabels` | 03 13  |
| `publishBatchMedia` | 11  |
| `recallLineFromPicking` | 12 13  |
| `receivePurchaseOrder` | 03 10 20  |
| `recordVendorPayment` | 01 03 14 20  |
| `recordVendorPrepayment` | 10 14  |
| `recordWeighAndPack` | 01 03 13  |
| `refundPayment` | 01 03 14  |
| `rejectBatch` | 10 11  |
| `rejectConnectorRequest` | 03 16  |
| `releaseLineForPicking` | 12 13  |
| `releaseLinesForPicking` | 12 13  |
| `removePurchaseOrderLine` | 03 10  |
| `removeSalesOrderLine` | 03 12 13  |
| `reopenMatchmakingMatch` | 12  |
| `repriceOrder` | 03 12  |
| `reserveInventoryForOrder` | 03 12 13  |
| `resolveVendorApproval` | 10 12  |
| `restoreFromBackupPoint` | 01 03 14 16 20  |
| `returnPickedUnits` | 12 13  |
| `reverseCommandById` | 01 02 03 10 11 13 14 20  |
| `revertCustomerCreditToEngine` | 15 20  |
| `revokePhotoUploadToken` | 01 11  |
| `routeConnectorRequest` | 03 16  |
| `scheduleVendorPayment` | 03 14  |
| `setBatchLotInfo` | 03 11  |
| `setBatchMediaRole` | 11  |
| `setBatchPrice` | 03 11  |
| `setCreditEngineConfig` | 15  |
| `setCustomerCreditLimit` | 01 15 20  |
| `setCustomerEngineMax` | 15  |
| `setCustomerPricingRule` | 12  |
| `setCustomerStance` | 15  |
| `setDefaultPricingRule` | 12 14  |
| `setDeliveryWindow` | 03 12  |
| `setInventoryStatus` | 01 03 10 11 20  |
| `setItemAlias` | 11  |
| `setLineBelowFloorReason` | 12  |
| `setLineLandedCost` | 12  |
| `snoozeCustomerCreditReminder` | 15 20  |
| `transferInventoryLocation` | 03 11 20  |
| `transferInventoryOwnership` | 03 11 20  |
| `unallocatePayment` | 01 03 14  |
| `unfinalizePurchaseOrder` | 10  |
| `updateAppointment` | 16  |
| `updateBatch` | 03 11 20  |
| `updateContact` | 16  |
| `updateCreditEngineStance` | 15  |
| `updateCustomerNeed` | 03 12  |
| `updateMatchmakingSettings` | 12  |
| `updateProcessor` | 16  |
| `updateProcessorFeeStatus` | 16  |
| `updatePurchaseOrder` | 03 10  |
| `updatePurchaseOrderLine` | 03 10  |
| `updateReferee` | 16  |
| `updateRefereeRelationship` | 16  |
| `updateSalesOrderLine` | 03 12  |
| `updateVendor` | 16  |
| `updateVendorSupply` | 03 12  |
| `uploadBatchMedia` | 01 11  |
| `upsertTransactionType` | 14  |
| `verifyAllIntake` | 10 11  |
| `voidRefereeCredit` | 16  |
| `voidVendorPayment` | 01 03 14  |

## 2. Table → Document(s)
| Table | Documented in |
| --- | --- |
| `appointments` | 16  |
| `archive_runs` | 14  |
| `backup_snapshots` | 14 20  |
| `brands` | 03 11 16 20  |
| `client_ledger_entries` | 12 14 16 20  |
| `connector_requests` | 16  |
| `contact_ledger_entries` | 14 16  |
| `contact_merge_candidates` | 03 16  |
| `contacts` | 01 04 10 12 14 16 20  |
| `correction_journal_entries` | 12 14 20  |
| `credit_engine_config` | 15 20  |
| `credit_engine_config_history` | 15  |
| `credit_engine_daily_audit` | 15  |
| `credit_engine_stance_history` | 15  |
| `credit_engine_stances` | 15  |
| `credit_overrides` | 15  |
| `credit_recompute_queue` | 15 20  |
| `customer_balance_reconciliation` | 14 20  |
| `customer_credit_assessments` | 15  |
| `customers` | 01 02 03 12 14 15 16 20  |
| `fulfillment_lines` | 12 13  |
| `inventory_movements` | 10 11 12 13 20  |
| `invoice_disputes` | 14 15  |
| `invoices` | 02 03 12 14 15 16 20  |
| `items` | 01 02 10 11  |
| `matchmaking_settings` | 02 12  |
| `media_cleanup_log` | 03 11  |
| `media_retention_policies` | 03 11  |
| `payment_allocations` | 14  |
| `payments` | 01 02 03 04 10 12 14 15 16 20  |
| `period_locks` | 14  |
| `photography_queue` | 10 11  |
| `pick_lists` | 03 12 13  |
| `purchase_receipt_lines` | 10 11  |
| `purchase_receipts` | 10 11 14  |
| `sales_order_lines` | 10 11 12 13  |
| `sales_orders` | 10 12 13 14 20  |
| `saved_filters` | 20  |
| `session` | 01 02 04 11 15 16 20  |
| `system_settings` | 12 14  |
| `user_dismissed_banners` | 03  |
| `users` | 01 10 11 12 13 14 15 16 20  |
| `vendor_bills` | 04 10 11 14 16  |
| `vendor_payments` | 04 10 14  |
| `vendors` | 01 02 03 10 11 12 14 16 20  |

## 3. queries.ts procedure → Document(s)
| Procedure | Documented in |
| --- | --- |
| `activeProcessors` | 16  |
| `batchMediaList` | 11  |
| `closeoutBlockerRows` | 03 14  |
| `closeoutPreview` | 03 04 14  |
| `commandJournal` | 03 14  |
| `contactAppointments` | 16  |
| `contactDirectory` | 16  |
| `contactLedger` | 14 16  |
| `contactProfile` | 16  |
| `csvExport` | 12 20  |
| `customerLastOrderedQty` | 12  |
| `customerOrderHistory` | 12  |
| `customerPurchaseHistory` | 12  |
| `customerSheetSnapshotById` | 12 14  |
| `customerWorkspace` | 03 12  |
| `dashboard` | 01 02 04 13  |
| `drilldown` | 02 03 12 14  |
| `findReplacePreview` | 04  |
| `fulfillmentLines` | 13  |
| `globalSearch` | 02 03  |
| `grid` | 02 03 10 11 13 16 20  |
| `health` | 01 02 03 12 14 15 20  |
| `intakeQueue` | 10  |
| `inventoryMovements` | 02 11  |
| `matchmakingBoard` | 03 12  |
| `matchmakingEntityCounts` | 12  |
| `matchmakingOpportunities` | 03 12  |
| `matchmakingSettings` | 12  |
| `mergeCandidateCount` | 16  |
| `myDrafts` | 02  |
| `paymentAllocationPreview` | 14  |
| `paymentAllocations` | 14  |
| `paymentExternalReceipt` | 14  |
| `paymentInternalReceipt` | 14  |
| `paymentPrintHtml` | 14  |
| `paymentSignalText` | 14  |
| `photographyQueue` | 03 11  |
| `pickListWithLines` | 13  |
| `pickQueue` | 02 13 20  |
| `poContextSignals` | 10  |
| `processorFees` | 16  |
| `processorWithTotals` | 16  |
| `purchaseOrderExternalReceipt` | 02 10  |
| `purchaseOrderInternalReceipt` | 02 10  |
| `purchaseOrderLines` | 10  |
| `purchaseOrderPrintHtml` | 10  |
| `purchaseOrderSignalText` | 10  |
| `receiptPreview` | 02 03 10  |
| `recentCustomerSheets` | 03 12  |
| `recoverySearch` | 12 14  |
| `refereeCredits` | 16  |
| `reference` | 02 03 04 10 12 14 16 20  |
| `relatedCommands` | 02 03 14 16  |
| `relationshipSummary` | 02 03 10 16  |
| `releaseEligibility` | 10 13  |
| `reversalPreview` | 03 04 14  |
| `salesOrderExternalReceipt` | 12  |
| `salesOrderInternalReceipt` | 12  |
| `salesOrderLines` | 02 12 13  |
| `salesOrderPrintHtml` | 12  |
| `salesOrderSignalText` | 12  |
| `salesSuggestions` | 03 12  |
| `snapshotDiff` | 14  |
| `supportPacket` | 03 14  |
| `transactionLedger` | 14  |
| `vendorPaymentExternalReceipt` | 04  |
| `vendorPaymentInternalReceipt` | 04  |
| `vendorPaymentPrintHtml` | 04 14  |
| `vendorPaymentSignalText` | 04 14  |
| `vendorPayments` | 14  |
| `workQueue` | 02 13 16  |

## 4. View → Document(s)
| View | Documented in |
| --- | --- |
| `ContactProfileView` | 01 16  |
| `ContactsView` | 01 16  |
| `CreditReviewView` | 01 03 15  |
| `DashboardView` | 01 02  |
| `IntakeView` | 01 03 10  |
| `LoginView` | 04  |
| `MatchmakingView` | 01 03 12  |
| `MediaView` | 01 03 11  |
| `OperationsViews` | 02 10 14 16  |
| `PickView` | 01 03 13  |
| `ProcessorsView` | 01 16  |
| `RefereesView` | 01 03 16  |
| `SalesView` | 01 02 03 12 13  |
| `mobile/MobileCatalogView` | 01 03 04  |
| `mobile/MobileContactProfileView` | 01 04 16  |
| `mobile/MobileContactsView` | 01 04 16  |
| `mobile/MobileDashboardView` | 01 04  |
| `mobile/MobileInventoryView` | 01 04 11  |
| `mobile/MobilePaymentsView` | 01 04 14  |

## 5. Component → Document(s)
| Component | Documented in |
| --- | --- |
| `AddRefereeRelationshipDrawer` | 16  |
| `AdvancedFilterBuilder` | 02  |
| `CommandPalette` | 02  |
| `ConfirmRoot` | 02  |
| `ContactCreateModal` | 16  |
| `ContextDrawer` | 01 02 03  |
| `CountPill` | 02  |
| `CustomerPurchaseHistoryPanel` | 12  |
| `DeactivateRefereeRelationshipDialog` | 16  |
| `DefaultPricingPanel` | 12  |
| `EmptyState` | 02 04  |
| `ErrorBoundary` | 02 20  |
| `ExpansionChevronColumn` | 02  |
| `ExpansionPanel` | 02  |
| `FeedbackCapture` | 02  |
| `Hotkeys` | 02  |
| `IdentityRibbon` | 01 02 03  |
| `InventoryFinderPanel` | 02 03 12  |
| `IssueSidecar` | 02  |
| `KpiCard` | 02  |
| `LandedCostExceptionChip` | 12  |
| `MediaBatchDrawer` | 11  |
| `MediaList` | 11  |
| `MediaUploadMobile` | 03 11  |
| `OperatorGrid` | 02 20  |
| `PhotographyQueuePanel` | 11  |
| `PricingPanel` | 12  |
| `ProcessorDetailPanel` | 16  |
| `ProcessorFeesGrid` | 16  |
| `QuickLedgerGrid` | 02 03 14 16  |
| `ReceiptPanel` | 10  |
| `ReceiptPreviewDrawer` | 02  |
| `ReceiptPreviewOverlay` | 02  |
| `RecentSheetsPanel` | 03 12  |
| `RecordPrepaymentDialog` | 10 14  |
| `RefereeCreditsList` | 16  |
| `RefereeDetailPanel` | 03 16  |
| `RefereeDialog` | 16  |
| `RefereeRelationshipDialog` | 16  |
| `RefereeRelationshipsList` | 16  |
| `RelationshipDrawer` | 02 03 16  |
| `ReportsRouteShell` | 01 03  |
| `RowCommandHistoryDrawer` | 01 02 03  |
| `SaleLineExceptionControls` | 12  |
| `SalesSourcePane` | 12  |
| `SavedFiltersDropdown` | 02  |
| `SavedFiltersManager` | 02 03  |
| `SelectionSummary` | 02  |
| `Shell` | 01 02 03 04  |
| `StatusPill` | 02  |
| `ToastCenter` | 02 04  |
| `UpdateRefereeRelationshipDialog` | 16  |
| `VendorContextDrawer` | 16  |
| `VerifyAllPreviewBody` | 10  |
| `VoidRefereeCreditDialog` | 16  |
| `WorkspacePanel` | 02  |
| `credit/CreditDivergencePanel` | 03 15  |
| `credit/CreditQueueHealthWidget` | 03 15  |
| `credit/CustomerCreditPanel` | 02 15  |
| `credit/EditCreditLimitModal` | 15  |
| `credit/ShadowModeBanner` | 03 15  |
| `drawerTabs/CommandReversalTab` | 14  |
| `drawerTabs/LotHistoryTab` | 11  |
| `drawerTabs/LotMovementTab` | 02 11  |
| `drawerTabs/LotPhotosTab` | 11  |
| `drawerTabs/PoCommandsTab` | 10  |
| `drawerTabs/PoHistoryTab` | 10  |
| `drawerTabs/PoLinesTab` | 02 10  |
| `drawerTabs/PoLinkedIntakeTab` | 10  |
| `drawerTabs/PoVendorTab` | 10  |
| `drawerTabs/SalesCommandHistoryTab` | 12  |
| `drawerTabs/SalesOutputTab` | 12  |
| `drawerTabs/SalesPricingTab` | 02 12  |
| `drawerTabs/VendorBillDetailsTab` | 02 14  |
| `drawerTabs/VendorBillTraceTab` | 14  |
| `drawerTabs/VendorPaymentHistoryTab` | 14  |
| `mobile/MobileConfirmSheet` | 04 11  |
| `mobile/MobileContactCard` | 04 16  |
| `mobile/MobileEmptyState` | 04  |
| `mobile/MobileFilterChips` | 04  |
| `mobile/MobileSearchInput` | 04  |
| `mobile/MobileShell` | 01 04 20  |
| `mobile/MobileToast` | 04  |
| `pick/PickLineScreen` | 03 13  |
| `pick/PickListScreen` | 13  |
| `pick/QueueScreen` | 13  |
| `profile/AppointmentModal` | 16  |
| `profile/ContactAppointmentsPanel` | 16  |
| `profile/ContactCustomerPanel` | 16  |
| `profile/ContactHistoryPanel` | 16  |
| `profile/ContactMoneyPanel` | 16  |
| `profile/ContactOverviewPanel` | 16  |
| `profile/ContactProfileHeader` | 16  |
| `profile/ContactSettingsPanel` | 16  |
| `profile/ContactVendorPanel` | 16  |
| `profile/EntityProfileTabs` | 16  |

## 6. Server service → Document(s)
| Service | Documented in |
| --- | --- |
| `balanceReconciliation` | 14 20  |
| `closeout` | 01 02 03 04 14 16 20  |
| `commandBus` | 01 10 11 12 13 14 15 16 20  |
| `csv` | 11 13 20  |
| `documentSnapshots` | 04 14 20  |
| `invoiceReceipts` | 14  |
| `journal` | 01 02 03 10 11 12 13 14 16 20  |
| `mediaStorage` | 11 20  |
| `mediaValidation` | 11 20  |
| `metrics` | 02 14 15 20  |
| `paymentReceivedReceipts` | 14  |
| `photoUploadTokens` | 11  |
| `poFinalizationReceipts` | 10  |
| `pricing` | 01 03 11 12 13 14  |
| `processorCommands` | 16  |
| `refereeCommands` | 16  |
| `salesConfirmationReceipts` | 12  |
| `vendorPayoutReceipts` | 14  |

## 7. Credit-engine module → Document(s)
| Module | Documented in |
| --- | --- |
| `creditEngine/base` | 10 13 15  |
| `creditEngine/coldStart` | 15  |
| `creditEngine/confidence` | 15  |
| `creditEngine/divergenceReport` | 03 15  |
| `creditEngine/effectiveStance` | 15  |
| `creditEngine/enqueue` | 15 20  |
| `creditEngine/index` | 01 02 03 10 11 13 14 15 16 20  |
| `creditEngine/inputGuards` | 15  |
| `creditEngine/metrics` | 02 14 15 20  |
| `creditEngine/nightlyCron` | 15 20  |
| `creditEngine/orchestrator` | 13 15 20  |
| `creditEngine/reaper` | 15  |
| `creditEngine/reconciliation` | 13 14 15 20  |
| `creditEngine/scoring` | 15 20  |
| `creditEngine/worker` | 03 15  |

## 8. Capabilities & cross-cutting artifacts
| Artifact | Documented in |
| --- | --- |
| Capabilities CAP-001 … CAP-042 | 03 (+ realizing code in 10–16, 20) |
| Auth router (me/login/logout) + LoginView | 04, 20 |
| credit/filters/commands/subscriptions router procs | 15, 20, domain docs |
| Socket events (command:completed/failed, health:pulse, order:subscribe/unsubscribe, pick:queue, pick:order) | 02, 13, 20 |
| Middleware (requireOperator, requireOperatorOrUploadToken, requirePhotographyEnabled, httpRateLimiters) | 11, 20 |
| HTTP routes (exportCsvRoute, mediaRoute, uploadRoute) | 11, 20 |
| Migrations 0001–0073 | introducing domain + 20 for schema-wide |
| Command bus / journal / projections / document snapshots | 14, 20 |
| RBAC roles + work-loop lanes | 01, 20 |

---
_Regenerate after any schema/command/view change to keep the guarantee honest._
