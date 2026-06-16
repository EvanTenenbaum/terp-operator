# QA Findings — 2026-06-01

Deep adversarial audit of docs/feature-reference.md, docs/customer-journey-map.md, and docs/technical-specification.md against live codebase.

## Critical Wrong Facts (must fix immediately)

### Technical Specification
- SPEC-001 CRITICAL: App uses react-router-dom v7 (BrowserRouter, Routes, Route). "No URL router" claim is categorically false.
- SPEC-002 CRITICAL: App uses AG Grid Enterprise (ag-grid-enterprise ^32.3.3, LicenseManager). Not Community.
- SPEC-003 CRITICAL: Command bus pipeline is wrong. Journal row is INSERTed FIRST with status='pending' as atomic claim (ON CONFLICT DO NOTHING), then UPDATEd after execution. Not inserted at end.
- SPEC-004 CRITICAL: Failed command retry: spec says "allow retry" — actual code replays cached failed result to caller (no re-execution).
- SPEC-005 CRITICAL: 26 of 130 commands (20%) have no frontend: 8 internalOnlyCommandNames + 18 pendingFrontendCommandNames. Spec implies all 130 are live.
- SPEC-006 CRITICAL: inventory_movements schema is completely wrong. Actual columns: id, batchId, commandId, kind, qtyDelta, reason, createdAt. No eventType, no quantityBefore/After, no statusBefore/After, no actorId FK.
- SPEC-007 CRITICAL: Drawer state machine wrong. cycleDrawer cycles standard→wide→focus→standard only. peek is entered via setDrawerTab on closed drawer only.
- SPEC-008 HIGH: SameSite=Lax (not Strict) — auth.ts:31
- SPEC-009 HIGH: bcryptjs (not bcrypt) — pure-JS impl, different perf
- SPEC-010 HIGH: tRPC v10 (not v11), TanStack Query v4 (not v5)
- SPEC-011 HIGH: 3 REST routes exist outside tRPC: uploadRoute, mediaRoute, exportCsvRoute. "No REST API" is false.
- SPEC-012 HIGH: MEDIA_DIR doesn't exist. Actual var is MEDIA_STORAGE_PATH. JSONL goes to JOURNAL_DIR not ARCHIVE_DIR.
- SPEC-013 HIGH: Missing security: helmet, CSP, per-IP login rate limiter (5 attempts/15min), upload/media rate limiters, trust proxy, body-size limit 4mb.
- SPEC-015 HIGH: Socket.io broadcast payload is {commandId, commandName, actorId, affectedIds} — no result field (PII concern). Peer toasts are stripped.
- SPEC-019 HIGH: Missing critical deps: decimal.js (all money math), pdfkit, multer, sharp, file-type, superjson (tRPC transformer), immer (Zustand middleware).
- SPEC-022 HIGH: Credit engine ALSO runs nightly cron (pnpm cron:credit-engine-nightly). Not on-demand only.
- SPEC-025 HIGH: Mobile shell architecture entirely absent. 6 mobile views, MobileShell, auto-redirect of mobile viewports.
- SPEC-027 HIGH: docker-compose.prod.yml already exists with named volumes. Phase 7 deployment is NOT "planned" — artifacts exist.

### Customer Journey Map
- CJM-050 CRITICAL: flagBatch does NOT change batch status to 'flagged'. It only appends to validationIssues. There is no 'flagged' status value.
- CJM-052 CRITICAL: DYN-H4 (matchmaking status lifecycle) is CLOSED. assertValidNeedStatusTransition and assertValidSupplyStatusTransition are implemented in commandBus.ts:5197-5224. Not an open gap.
- CJM-053 HIGH: Connector request default status is 'open' not 'pending' (schema.ts:481 default='open').
- CJM-054 CRITICAL: publishBatchMedia does NOT update batches.mediaStatus. Only legacy attachBatchPhoto does. Modern upload+publish flow leaves batches.mediaStatus as 'open'.
- CJM-055 HIGH: 'has_alerts' status does not exist. recordWeighAndPack just sets fulfillmentLines.status='packed'.
- CJM-056 HIGH: overrideUnscheduled is NOT role-gated server-side. Any role with recordVendorPayment access can pass it.
- CJM-057 HIGH: verifyBatch is not a real command. Only verifyAllIntake exists.
- CJM-001 HIGH: Contacts/Appointments system missing entirely (12 commands, 4 tables, 2 views).
- CJM-003 HIGH: Referee/Broker Credit journey missing (6 commands, 3 tables).
- CJM-004 HIGH: postTransactionLedgerRow unified Money-In/Money-Out entrypoint not covered.
- CJM-021 HIGH: logPayment auto-allocation gap (J05/DYN-H3) is CLOSED. Code auto-executes and degrades gracefully. "Known Gap" entry is stale.

### Feature Reference
- FR-260 CRITICAL: Wrong file path: src/server/db/schema.ts doesn't exist. Actual: src/server/schema.ts
- FR-261 CRITICAL: src/server/commands/ directory doesn't exist. All handlers in src/server/services/commandBus.ts (7389 lines).
- FR-061 CRITICAL: 'priced' is a fabricated sales order status. Never written to salesOrders.status in code.
- FR-062 CRITICAL: 'closed' and 'shipped' are fabricated sales order statuses. Never written in code.
- FR-060 CRITICAL: vendorBills.status 'created' never written in code. 'voided' is wrong — actual is 'void' on vendorPayments.
- FR-065 HIGH: pickLists.status 'in_progress', 'has_alerts', 'ready_to_close', 'closed' are derived UI states not DB states. Schema only has 'open' and 'fulfilled'.
- FR-018 HIGH: Many Credit Review commands are internalOnlyCommandNames (#111) with no UI: setCustomerEngineMax, setCustomerStance, disableCreditEngineForCustomer, createCreditEngineStance, updateCreditEngineStance, deleteCreditEngineStance, bulkRevertCustomersToEngine.
- FR-017 HIGH: routeConnectorRequest IS exposed in UI as "Reassign inbound request" button (OperationsViews.tsx:2463). Doc says it shouldn't be.
- FR-031 CRITICAL: logPayment auto-allocation is implemented (commandBus.ts:3697-3731). J05 "Known Gap" is stale.
- FR-220 CRITICAL: Multiple RBAC claims wrong. cancelSalesOrder requires manager, not operator. adjustBatchQuantity requires manager. setInventoryStatus requires manager. transferInventoryOwnership requires manager. applyClientCredit requires manager.
- FR-030 CRITICAL: approvePurchaseOrder auto-runs receivePurchaseOrder internally. Doc's workflow steps 5 and 7 treat these as separate operator actions.
- FR-080-098: 20+ DB entities missing from feature sections.

## Summary Scores
- Technical Specification: ~18/100 — multiple categorical wrong claims
- Customer Journey Map: ~28/100 — 4 critical wrong facts, 2 missing journeys, stale gap entries
- Feature Reference: ~22/100 — fabricated statuses, wrong paths, wrong RBAC, stale gaps
