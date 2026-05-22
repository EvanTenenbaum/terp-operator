# TERP Agro Capability Registry

Date: 2026-05-12
Status: active PM control plane

Every backend command, frontend surface, conceptual requirement, and future roadmap item must have a registry row before implementation. This file is the anti-sprawl map.

## Field Definitions

| Field | Meaning |
| --- | --- |
| ID | Stable capability identifier. |
| Source | Where the requirement came from. |
| Work loop | Buy, Receive, Sell, Collect/Pay, Fulfill, Recover/Close, Decide, Support, Infrastructure. |
| Exposure | `core_workflow`, `context`, `control`, `projection`, `infrastructure`, or `rejected`. |
| Product decision | Keep, merge, defer, reject, already covered, or needs decision. |
| Recipe | Replication Playbook recipe or `none`. |
| Current evidence | Current implementation or gap evidence. |
| Next product move | What should happen next. |

## Product Kernel Capabilities

| ID | Source | Work loop | Exposure | Product decision | Recipe | Current evidence | Next product move |
| --- | --- | --- | --- | --- | --- | --- | --- |
| CAP-001 New Sale start | MR-004, JY-03, AC-01 | Sell | core_workflow | Keep | R4, R12 | Sales/customer workspace exists, design spec upgrades to Keel + customer identity. | Phase 1 makes customer workspace identity/drawer based and first line focused. |
| CAP-002 New PO start | Purchase order completion, JY-09 | Buy | core_workflow | Keep | R4 | Purchase Orders commands and UI exist. | Phase 2 rebuilds PO as header + editable Lines drawer tab + status-aware primary. |
| CAP-003 Receive Inventory start | MR-023, J02 | Receive | core_workflow | Keep | R4 | Intake and PO receiving to draft intake exist. | Phase 2 keeps Receive separate from Purchase and moves receipt support into drawer. |
| CAP-004 Money In / Money Out start | MR-013, UF-008, AC-04 | Collect/Pay | core_workflow | Keep | R4 | Quick Ledger baseline exists. | Phase 3 makes ledger rows the primary money entry model and persists draft rows. |
| CAP-005 Product Finder | UF-005, GAP-022, AC-02 | Sell, Receive, Fulfill, Decide | projection | Keep | R9, R12 | Finder has broad filters and saved slices. | Phase 2 extracts global Finder core and overlay; backend later becomes reusable finder service. |
| CAP-006 Status-aware primary action | Design §10 | All loops | core_workflow | Keep | R4 | Current UI has several sibling controls. | Phases 0-7 replace visible button bands with one primary plus tray. |
| CAP-007 Context Drawer | Design §2.6, §2.7 | All loops | context | Keep | R1 | Drawer not yet built as primitive. | Phase 0 creates primitive; later phases add tabs. |
| CAP-008 Identity Ribbon | Design §2.4 | All loops | context | Keep | none | Current headers are per-view panels. | Phase 0 creates identity ribbon; phases wire active entities. |
| CAP-009 Row command history | MR-016, UF-009, AC-08 | Recover/Close, Support | context | Keep | R1, R12 | Row history drawer exists as baseline. | Phase 5 makes row-origin recovery the daily path. |
| CAP-010 Reversal preview | J09, AC-08 | Recover/Close | control | Keep | R4 | `reversalPreview` and `reverseCommandById` exist. | Keep manager+ gated; expose through row history and Recovery drawer. |
| CAP-011 Vendor receipt from selection | MR-012, AC-05, GAP-010 | Receive | projection, control | Keep | R10, R12 | `receiptPreview` and `postPurchaseReceipt` exist. | Phase 2 makes Receipt preview a drawer tab and blocks conflicts visibly. |
| CAP-012 Customer-safe output | MR-041, S10 | Sell, Support | projection | Keep | R10 | Catalog mode hides cost/margin. | Phase 1 moves output into Customer/Order drawer and adds copy offer. |
| CAP-013 Pricing risk visibility | MR-042, pricing contract | Sell | context, control | Keep | R2, R4 | Bounded backend guardrails now resolve standard/premium/clearance profiles from existing strategy/customer tags, lift reprices to floor, and store confirmation pricing snapshots in command journal results. Dedicated pricing tables/snapshot columns remain deferred. | Add dedicated pricing profile tables and customer assignments when frontend needs editable commercial policy management. |
| CAP-014 Tag governance | Tag contract, J11 | Sell, Receive, Decide | control, projection | Keep | R2, R9, R12 | Tags are row-native on PO lines, intake, inventory, needs, and vendor stock; `tag_catalog` normalizes vocabulary; `applyTags` and existing row commands audit changes. | Keep tags out of modal pickers; add reports/saved slices only if operators need more rollups. |
| CAP-015 Search index / global search | Search contract, J14 | Support | projection | Merge | R9, R12 | `globalSearch` exists as direct SQL query. | Keep query short-term; later add freshness metadata or generated projection if needed. |
| CAP-016 Smart suggestions | Smart suggestions contract, J13 | Sell | projection | Keep | R9 | `salesSuggestions` query exists but not persisted/advisory table. | Later backend converts to persisted advisory rows with accept/dismiss trace. |
| CAP-017 Connector review | J08, AC-11 | Support, Sell, Fulfill, Collect/Pay | core_workflow | Keep | R16, R4 | Approve/reject/route commands exist; no direct ledger mutation. | Phase 4 makes Route primary, safety banner persistent, history drawer first-class. |
| CAP-018 Connector posting bridge | Live/mobile contracts | Support | control | Defer | R16 | No `postAcceptedConnectorRequest` command. | Backend Phase C after review UX stabilizes. |
| CAP-019 Inventory status/location/ownership transfer | GAP-001, GAP-002, GAP-003 | Receive, Fulfill | control | Keep | R4, R12 | Inventory view now surfaces status, location, and ownership movement controls; backend writes movement rows and reversible command snapshots. | Keep controls selected-row scoped; later move the same controls into the Inventory drawer tab if the drawer becomes the dominant operator surface. |
| CAP-020 Archive safety gates | J10, GAP-025 | Recover/Close | control | Keep | R4 | `closeoutPreview` and `archivePeriod` share the same blocker/control-total helper, including POs, connectors, fulfillment, failed commands, drafts, receipts, invoices, payments, vendor bills, and command totals. | Keep parity audited by command-contract coverage; add unsafe row drilldown in Phase 5. |
| CAP-021 Reports lane | Design OPEN-03, AC-12 | Decide | projection | Keep | R7 | Design mandates Reports as 14th route. | Phase 6 adds Reports route with 7 client-side aggregations. |
| CAP-022 Dual-role relationship | JY-07, AC-14 | Support, Collect/Pay, Sell | context | Keep | R1, R12 | Relationship summary exists; separate client/vendor surfaces remain. | Phase 4 promotes relationship tab for dual-role counterparties. |
| CAP-023 Photography/media readiness | JY-17 | Receive, Sell | context | Keep | R2, R9 | Media fields/queue exist. | Phase 2/4 keep media columns and drawer tabs; no top-level route. |
| CAP-024 Quick Ledger draft persistence | AC-15 | Collect/Pay | core_workflow | Keep | R2 | Quick Ledger baseline exists. | Phase 3 persists ledger drafts in UI store. |
| CAP-025 Closeout unsafe row drilldown | J10, JY-19 | Recover/Close | core_workflow | Keep | R4, R12 | Closeout preview exists. | Phase 5 makes unsafe rows inline-expand and drawer-backed. |
| CAP-026 Support packet | J09 | Support | control | Keep | R10 | `supportPacket` query exists. | Keep in Recovery drawer/row packet export; no daily nav. |
| CAP-027 Backup/restore preview | J09 | Recover/Close | control | Keep | R10 | Restore preview is read-only. | Preserve read-only in app; offline destructive restore remains out of app. |
| CAP-028 Legacy marker preservation | Legacy marker contract, MR-002 | All loops | context | Keep | R2 | Raw marker fields exist. | Preserve; add legends/review queue later without remapping prematurely. |
| CAP-029 Matchmaking demand/supply board | User clarification 2026-05-13 | Sell, Buy, Decide | core_workflow, projection | Keep | R6, R8, R12 | Matchmaking route records customer needs, vendor stock, and deterministic match rows with reasons. | Keep as intent tracking only; purchase/sale/intake consequences stay in existing workflows. |
| CAP-031 Saved filter management | Backend-frontend gap audit 2026-05-22 | Sell, Receive, Decide | control | Keep | none | `filters.updateFilter` and `filters.deleteFilter` exist on server; no edit/delete UI in `SavedFiltersDropdown`. Users can save and load filters but cannot rename or delete them. Linear: TER-1561. | Implement `SavedFiltersManager` component with inline rename (updateFilter) and inline confirm-delete (deleteFilter). Wire into `InventoryFinderPanel`. |
| CAP-032 Credit engine ops surfaces | Backend-frontend gap audit 2026-05-22 | Decide, Support | context, control | Keep | none | `credit.divergenceReport` (owner-only) and `credit.creditRecomputeQueueHealth` (manager+) exist on server with no frontend surface. Linear: TER-1562. | Implement `CreditDivergencePanel` and `CreditQueueHealthWidget`, wire both into `CreditReviewView` with role gates. |

## Backend Command Families

| ID | Commands | Work loop | Exposure | Product decision | Next product move |
| --- | --- | --- | --- | --- | --- |
| CMD-INTAKE | `createBatch`, `updateBatch`, `deleteBatch`, `postPurchaseReceipt`, `adjustBatchQuantity`, `setInventoryStatus`, `transferInventoryLocation`, `transferInventoryOwnership`, `setBatchPrice`, `setBatchLotInfo`, `attachBatchPhoto`, `importBatchesCsv` | Receive | core_workflow, control | Already covered | Intake and Inventory surfaces expose draft edits, quantity/price/lot/media edits, validate-first CSV import, purchase receipt posting, and selected-batch status/location/ownership movements. |
| CMD-PO | `createPurchaseOrder`, `updatePurchaseOrder`, `addPurchaseOrderLine`, `updatePurchaseOrderLine`, `removePurchaseOrderLine`, `approvePurchaseOrder`, `receivePurchaseOrder`, `cancelPurchaseOrder` | Buy, Receive | core_workflow | Already covered | Phase 2 improves placement; later partial quantity receiving. |
| CMD-SALES | `createSalesOrder`, `addSalesOrderLine`, `updateSalesOrderLine`, `removeSalesOrderLine`, `reserveInventoryForOrder`, `priceSalesOrder`, `confirmSalesOrder`, `cancelSalesOrder` | Sell | core_workflow | Already covered | Phase 1 re-homes into customer workspace and status primary. |
| CMD-POSTING | `postSalesOrder`, `allocateOrderToFulfillment`, `applyClientCredit`, `setDeliveryWindow` | Sell, Fulfill | core_workflow, control | Already covered | Add pre-post checklist and row-native failure context. |
| CMD-PAYMENTS | `logPayment`, `allocatePayment`, `unallocatePayment`, `refundPayment`, `applyEarlyPayDiscount` | Collect/Pay | core_workflow, control | Already covered | Phase 3 ledger row model and allocation drawer. |
| CMD-VENDOR | `createVendorBill`, `approveVendorBill`, `scheduleVendorPayment`, `recordVendorPayment`, `voidVendorPayment` | Collect/Pay | core_workflow, control | Already covered | Phase 3 status-aware payable flow. |
| CMD-FULFILLMENT | `createPickList`, `recordWeighAndPack`, `markOrderFulfilled`, `printLabels`, `adjustFulfillmentLine` | Fulfill | core_workflow | Already covered | Phase 4 inline pack and manifest drawer. |
| CMD-CONNECTOR | `approveConnectorRequest`, `rejectConnectorRequest`, internal `routeConnectorRequest` | Support | core_workflow | Partial | Add accepted-to-posted backend bridge later; operators approve/reject while routing/default assignment stays internal. |
| CMD-RECOVERY | `createCorrectionJournalEntry`, `reverseCommandById`, `restoreFromBackupPoint`, `repriceOrder` | Recover/Close | control | Already covered | Reversal matrix now marks every command reversible, offsettable, or terminal; Phase 5 drawer tools expose the guidance. |
| CMD-CLOSEOUT | `postPeriodAdjustments`, `lockPeriod`, `archivePeriod` | Recover/Close | control | Partial | Archive blockers/control totals are hardened; unsafe row drilldown remains frontend Phase 5. |
| CMD-TAGS | `applyTags` | Buy, Receive, Sell, Decide | core_workflow, control | Covered | Tag edits are inline on operational rows; the explicit command supports palette/API use and audited tag replacement. |
| CMD-MATCHMAKING | `createCustomerNeed`, `updateCustomerNeed`, `createVendorSupply`, `updateVendorSupply`, `acceptMatchmakingMatch`, `dismissMatchmakingMatch` | Sell, Buy, Decide | core_workflow | Covered | Matchmaking route exposes quick-entry strips, three grids, and deterministic accept/dismiss actions. |

## Explicitly Rejected Old-Platform Units

| ID | Source | Decision | Rationale |
| --- | --- | --- | --- |
| REJ-001 AppleScript adapter operations | TERP Numbers manifest | Reject | Web app uses PostgreSQL/tRPC command bus, not Numbers workbook mutation. |
| REJ-002 Script Menu wrappers | TERP Numbers manifest | Reject | Command Palette, hotkeys, and row actions replace Script Menu. |
| REJ-003 iCloud collaboration timing contract | TERP Numbers manifest | Reject | Not relevant to self-hosted web app runtime. |
| REJ-004 Mac mini permission model | TERP Numbers manifest | Reject | Deployment/runtime docs may cover server permissions; not an operator product capability. |
| REJ-005 No-write-Numbers-programmatically gates | TERP Numbers manifest | Reject | Historical guardrail; current web app writes its own database through commands. |
| REJ-006 Workbook cockpit table adapter specs | TERP Numbers manifest | Merge as projection concept | Generated/read-only projection principle survives; workbook adapter mechanics do not. |

## Backend Gaps Carried Forward

| ID | Source | Work loop | Exposure | Product decision | Next product move |
| --- | --- | --- | --- | --- | --- |
| BE-001 Pricing profiles and guardrails | Pricing contract | Sell | control, context | Partial | Bounded existing-schema kernel landed: resolver, min-margin/max-discount/vendor-floor guardrails, and command-journal confirmation snapshots. Dedicated pricing profile tables, customer assignment rows, and order snapshot columns remain. |
| BE-002 Governed tag catalog | Tag contract | Sell, Receive | control, projection | Covered | `tag_catalog` plus `applyTags` and normalized row tag arrays preserve operator speed while adding searchable vocabulary. |
| BE-003 Inventory state transitions | GAP-001/002/003 | Receive, Fulfill | control | Already covered | `setInventoryStatus`, `transferInventoryLocation`, and `transferInventoryOwnership` are visible in Inventory controls and backed by movement rows plus reversal support. |
| BE-004 Connector accepted-to-posted bridge | J08/J14/S05/S15 | Support | control | Defer | Add after connector review UX is stabilized. |
| BE-005 Closeout blocker parity | J10/S07/S16 | Recover/Close | control | Already covered | Shared closeout safety helper makes preview and archive enforce the same blockers and control totals. |
| BE-006 Persisted suggestions | Smart suggestions contract | Sell | projection | Defer | Convert query suggestions to persisted advisory table with accept/dismiss trace. |
| BE-007 Search freshness | Search contract | Support | projection | Defer | Add freshness timestamp/index only if direct globalSearch becomes stale/slow. |
| BE-008 Explicit backup commands | Backup workflows | Recover/Close | control | Defer | Current preview/support packet is acceptable; typed backup commands later if owners use them daily. |
| BE-009 Partial PO quantity receiving | PO edge cases | Buy, Receive | core_workflow | Keep | Add simple receive-quantity column/action without modal. |
| BE-010 Reversal completeness matrix | Mistake recovery | Recover/Close | control | Already covered | `reversalPolicies` documents every command as reversible, offsettable, or terminal; `reverseCommandById` now refuses unsupported reversal instead of silently marking unknown commands reversed. |
| BE-011 WebSocket transport for subscriptions | Backend-frontend gap audit 2026-05-22 | Infrastructure | infrastructure | Defer | Add `wsLink`/`httpSubscriptionLink` split to `src/client/api/trpc.ts` when real-time push is needed. Required before `subscriptions.heartbeat` can be consumed from the frontend. |
| BE-012 Server-side batch filter path | Backend-frontend gap audit 2026-05-22 | Receive, Decide | projection | Defer | `filters.applyBatchFilters` is fully implemented on the server (cursor pagination, rate limiting, role-scoped columns). Current `InventoryFinderPanel` filters client-side from `queries.reference` data. Connecting this path requires: (1) removing the `queries.reference` pre-fetch from the panel, (2) making filter state reactive and server-routed, (3) adding loading/pagination UI. Implement when inventory size makes client-side filtering impractical (>500 active batches). |

## Replication Playbook Requirement

Every PR implementing a registry row must cite the recipe used:

- R1 drawer tab
- R2 grid column
- R3 status pill tone
- R4 action verb
- R5 hotkey
- R6 view/route
- R7 report
- R8 entity type
- R9 filter chip/saved slice
- R10 export/output
- R11 empty/error/loading state
- R12 cross-entity workflow
- R13 telemetry
- R14 keyboard semantic
- R15 role/permission
- R16 connector source

If no recipe applies, the PR must include a short deviation note and a smoke-test result.
