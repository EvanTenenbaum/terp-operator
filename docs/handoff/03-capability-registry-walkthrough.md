# 03 — Capability Registry Walkthrough (CAP-001 … CAP-042)

> Developer-handoff "bible", section 3. Walks every capability in `docs/product/capability-registry.md`
> (the PM "anti-sprawl" control plane) plus the CMD-* backend command families and carried-forward gaps.
> Each row's status/evidence is taken from the registry and cross-checked against `src/` where feasible.
> Citations: registry rows are `capability-registry.md:NN`; command minimums are `src/shared/commandCatalog.ts`.

---

## How to read this

The registry (`docs/product/capability-registry.md`) is the source of truth for *what should exist*. Every backend command, frontend surface, and roadmap item must have a registry row before implementation (`capability-registry.md:6`). Each row carries: **ID + name**, **source**, **work loop** (Buy/Receive/Sell/Collect-Pay/Fulfill/Recover-Close/Decide/Support/Infrastructure), **exposure** (`core_workflow | context | control | projection | infrastructure | rejected`), **product decision** (Keep/Merge/Defer/Reject/Needs Assessment/Done), **recipe** (R1–R16 replication playbook, `capability-registry.md:120-137`), **current evidence**, and **next product move**.

Status legend used below:
- **Shipped** — registry evidence says it exists in code (Keep / Already covered / Done).
- **Partial** — backend or a precursor exists; UX or full scope pending.
- **Needs Assessment** — registry decision is "Needs Assessment"; no/partial implementation, awaiting product sign-off with Evan.

The capability registry is titled "TERP Agro Capability Registry" (`capability-registry.md:1`) — a legacy name; per CLAUDE.md this is the same active **TERP Operator** codebase.

---

## Product Kernel Capabilities (CAP-001 … CAP-042)

### CAP-001 — New Sale start  ·  Sell  ·  core_workflow  ·  Shipped
- **Function:** Entry point to begin a customer sale from the customer/sales workspace, first-line focused.
- **Context:** Sales is the brokerage's revenue loop; the operator needs an identity/drawer-based fast start (sources MR-004, JY-03, AC-01).
- **Use case:** Operator hits "New Sale" (Keel chip / ⌘3 Sales view), picks a customer, and lands on the first sales-order line.
- **Evidence:** Sales/customer workspace exists; Phase 1 made it identity/drawer-based (`capability-registry.md:25`). Realized by `SalesView.tsx`, `customerWorkspace` query, CMD-SALES commands.

### CAP-002 — New PO start  ·  Buy  ·  core_workflow  ·  Shipped
- **Function:** Begin a purchase order as header + editable Lines drawer tab with a status-aware primary action.
- **Context:** Buy loop; vendor ordering (PO completion, JY-09).
- **Use case:** Operator starts a PO, adds lines in the drawer, advances Draft→Finalized→Approved→Received.
- **Evidence:** PO commands + UI exist (`capability-registry.md:26`). `PurchaseOrdersView`, CMD-PO.

### CAP-003 — Receive Inventory start  ·  Receive  ·  core_workflow  ·  Shipped
- **Function:** Physical intake of product into a draft intake, kept separate from purchasing.
- **Context:** Receive loop; intake is distinct from the PO that ordered the goods (MR-023, J02).
- **Use case:** Product arrives; operator receives it (Keel "Receive" chip / ⌘2 Intake), verifies/flags/rejects batches.
- **Evidence:** Intake + PO receiving to draft intake exist (`capability-registry.md:27`). `IntakeView`, CMD-INTAKE, `postPurchaseReceipt`.

### CAP-004 — Money In / Money Out start  ·  Collect/Pay  ·  core_workflow  ·  Shipped
- **Function:** Ledger-row-based money entry for both money-in and money-out, with persisted draft rows.
- **Context:** The collect/pay loop; quick-ledger first (MR-013, UF-008, AC-04).
- **Use case:** Operator opens Money in / Money out (Keel chips / ⌘4), enters ledger rows.
- **Evidence:** Quick Ledger baseline exists; Phase 3 made rows primary (`capability-registry.md:28`). `QuickLedgerGrid.tsx`, CMD-PAYMENTS / CMD-VENDOR.

### CAP-005 — Product Finder  ·  Sell/Receive/Fulfill/Decide  ·  projection  ·  Shipped
- **Function:** Global cross-entity finder with broad filters and saved slices.
- **Context:** Operators repeatedly search inventory/needs across loops (UF-005, GAP-022, AC-02).
- **Use case:** ⌘⇧F opens the Global Finder; operator filters and saves slices.
- **Evidence:** Finder has broad filters and saved slices (`capability-registry.md:29`). `InventoryFinderPanel`, Keel "Find" button (`Shell.tsx:225-233`).

### CAP-006 — Status-aware primary action  ·  All loops  ·  core_workflow  ·  Shipped
- **Function:** One primary action per surface that changes by entity status, replacing button bands.
- **Context:** Numbers-native single-primary discipline (Design §10).
- **Use case:** The primary button on a PO row reads "Finalize" then "Approve" then "Receive" as status advances.
- **Evidence:** Phases 0–7 replaced button bands with one primary + tray (`capability-registry.md:30`). Canvas grammar (feature-flagged, `App.tsx:52-54`).

### CAP-007 — Context Drawer  ·  All loops  ·  context  ·  Shipped
- **Function:** The right-side contextual drawer primitive (peek→standard→wide→focus state machine).
- **Context:** Spreadsheet-native context without leaving the grid (Design §2.6/§2.7).
- **Use case:** Selecting a row opens the drawer with tabs (lines, history, vendor, etc.).
- **Evidence:** Phase 0 created the primitive (`capability-registry.md:31`). `ContextDrawer.tsx`, drawer state in `uiStore.ts`.

### CAP-008 — Identity Ribbon  ·  All loops  ·  context  ·  Shipped
- **Function:** A persistent ribbon showing the active entity/identity context.
- **Context:** Replaces per-view header panels (Design §2.4).
- **Use case:** Ribbon shows the customer/vendor currently in focus across views.
- **Evidence:** Phase 0 created it; phases wire active entities (`capability-registry.md:32`). `IdentityRibbon.tsx` (`App.tsx:115`).

### CAP-009 — Row command history  ·  Recover/Close, Support  ·  context  ·  Shipped
- **Function:** Per-row drawer of the command history that produced/changed the row.
- **Context:** Mistake recovery from the row itself (MR-016, UF-009, AC-08).
- **Use case:** Operator opens a row's history drawer to see and reverse prior commands.
- **Evidence:** Row history drawer exists (`capability-registry.md:33`). `RowCommandHistoryDrawer.tsx`, `commandJournal` / `relatedCommands` queries.

### CAP-010 — Reversal preview  ·  Recover/Close  ·  control  ·  Shipped (manager+ gated)
- **Function:** Preview the effect of reversing a command before committing.
- **Context:** Reversible-postings principle; gated to manager+ (J09, AC-08).
- **Use case:** Manager previews a reversal from row history / Recovery, then reverses.
- **Evidence:** `reversalPreview` query + `reverseCommandById` command exist (`capability-registry.md:34`). `reverseCommandById` min role = manager (`commandCatalog.ts:401`).

### CAP-011 — Vendor receipt from selection  ·  Receive  ·  projection+control  ·  Shipped
- **Function:** Generate a vendor receipt preview from selected rows and post it.
- **Context:** Receiving needs a receipt artifact with conflict visibility (MR-012, AC-05, GAP-010).
- **Use case:** Operator selects received lines, reviews receipt preview in a drawer tab, posts.
- **Evidence:** `receiptPreview` query + `postPurchaseReceipt` command exist (`capability-registry.md:35`).

### CAP-012 — Customer-safe output  ·  Sell, Support  ·  projection  ·  Shipped
- **Function:** Catalog/output mode that hides cost and margin from customer-facing copy.
- **Context:** Don't leak buy-side economics to customers (MR-041, S10).
- **Use case:** Operator copies an offer/catalog for a customer without cost/margin.
- **Evidence:** Catalog mode hides cost/margin (`capability-registry.md:36`). `MobileCatalogView`, sales output tabs.

### CAP-013 — Pricing risk visibility  ·  Sell  ·  context+control  ·  Shipped (bounded)
- **Function:** Backend guardrails resolving standard/premium/clearance pricing profiles from existing strategy/customer tags, lifting reprices to floor, and snapshotting confirmation pricing into the command journal.
- **Context:** Prevent below-floor sales; surface pricing risk (MR-042, pricing contract).
- **Use case:** During pricing, the system enforces min-margin/max-discount/vendor-floor and records a snapshot.
- **Evidence:** Bounded guardrails landed; dedicated pricing tables/snapshot columns deferred (`capability-registry.md:37`; see BE-001). `pricing.ts`, `priceSalesOrder`. **Note:** superseded/extended by CAP-030.

### CAP-014 — Tag governance  ·  Sell/Receive/Decide  ·  control+projection  ·  Shipped
- **Function:** Row-native tags on PO lines, intake, inventory, needs, vendor stock; `tag_catalog` normalizes vocabulary; `applyTags` audits changes.
- **Context:** Operator-speed tagging without modal pickers (Tag contract, J11).
- **Use case:** Operator tags rows inline; the catalog keeps vocabulary searchable.
- **Evidence:** Tags row-native; `applyTags` audits (`capability-registry.md:38`; BE-002). `applyTags` min role = operator (`commandCatalog.ts:367`).

### CAP-015 — Search index / global search  ·  Support  ·  projection  ·  Shipped (Merge)
- **Function:** Global search across entities via direct SQL.
- **Context:** Fast cross-entity lookup (Search contract, J14).
- **Use case:** ⌘K palette / search hits `globalSearch`.
- **Evidence:** `globalSearch` exists as direct SQL query (`capability-registry.md:39`). Freshness/projection deferred (BE-007).

### CAP-016 — Smart suggestions  ·  Sell  ·  projection  ·  Partial
- **Function:** Sales suggestions surfaced to the operator.
- **Context:** Nudge cross-sell / replenishment (Smart suggestions contract, J13).
- **Use case:** Sales workspace shows `salesSuggestions`.
- **Evidence:** `salesSuggestions` query exists but is not persisted/advisory (`capability-registry.md:40`; deferred persisted table = BE-006).

### CAP-017 — Connector review  ·  Support/Sell/Fulfill/Collect-Pay  ·  core_workflow  ·  Shipped
- **Function:** Approve/reject/route connector requests with a persistent safety banner and history drawer; no direct ledger mutation.
- **Context:** External integrations must be human-reviewed (J08, AC-11).
- **Use case:** Operator reviews a connector request in `ConnectorsView` and approves/rejects; Route is internal.
- **Evidence:** Approve/reject/route commands exist (`capability-registry.md:41`). CMD-CONNECTOR.

### CAP-018 — Connector posting bridge  ·  Support  ·  control  ·  Deferred
- **Function:** A `postAcceptedConnectorRequest` command bridging accepted connector requests to postings.
- **Context:** Close the loop from accepted → posted (Live/mobile contracts).
- **Use case:** (Future) accepted connector request auto-posts after review UX stabilizes.
- **Evidence:** **No** such command exists yet (`capability-registry.md:42`; BE-004). Deferred to backend Phase C.

### CAP-019 — Inventory status/location/ownership transfer  ·  Receive, Fulfill  ·  control  ·  Shipped
- **Function:** Selected-row controls to change inventory status, location, and ownership, writing movement rows + reversible snapshots.
- **Context:** Inventory state must be explicit and auditable (GAP-001/002/003).
- **Use case:** Operator selects a batch and changes status/location/owner from the Inventory view.
- **Evidence:** Controls surfaced; movement rows + reversal exist (`capability-registry.md:43`; BE-003). `setInventoryStatus` (manager), `transferInventoryLocation` (operator), `transferInventoryOwnership` (manager) (`commandCatalog.ts:356-358`).

### CAP-020 — Archive safety gates  ·  Recover/Close  ·  control  ·  Shipped
- **Function:** `closeoutPreview` and `archivePeriod` share one blocker/control-total helper (POs, connectors, fulfillment, failed commands, drafts, receipts, invoices, payments, vendor bills, command totals).
- **Context:** Don't archive a period with open/unsafe rows (J10, GAP-025).
- **Use case:** Owner runs closeout; blockers prevent unsafe archival.
- **Evidence:** Shared helper enforces parity (`capability-registry.md:44`; BE-005). `closeout.ts`, `archivePeriod` (owner, `commandCatalog.ts:407`).

### CAP-021 — Reports lane  ·  Decide  ·  projection  ·  Shipped
- **Function:** A Reports route with client-side aggregations over sales/inventory/vendors/payments/clients.
- **Context:** Operator needs read-only decision views (Design OPEN-03, AC-12).
- **Use case:** Operator opens Reports and reviews aggregations.
- **Evidence:** Reports mandated as a route; Phase 6 adds 7 aggregations (`capability-registry.md:45`). `ReportsRouteShell` (`App.tsx:174`).

### CAP-022 — Dual-role relationship  ·  Support/Collect-Pay/Sell  ·  context  ·  Partial
- **Function:** A relationship tab for counterparties that are both customer and vendor.
- **Context:** Many counterparties play dual roles (JY-07, AC-14).
- **Use case:** Operator views a dual-role contact's combined relationship.
- **Evidence:** Relationship summary exists; separate client/vendor surfaces remain (`capability-registry.md:46`). `relationshipSummary` query, `RelationshipDrawer`.

### CAP-023 — Photography/media readiness  ·  Receive, Sell  ·  context  ·  Shipped
- **Function:** Media fields, photography queue, and drawer tabs (no top-level route originally).
- **Context:** Listings need photos before sale (JY-17).
- **Use case:** Operator queues a batch for photography; media attaches to the lot.
- **Evidence:** Media fields/queue exist (`capability-registry.md:47`). `MediaView`/`/photography`, `photographyQueue` query, CMD-INTAKE media commands.

### CAP-024 — Quick Ledger draft persistence  ·  Collect/Pay  ·  core_workflow  ·  Shipped
- **Function:** Persist Quick Ledger draft rows in the UI store.
- **Context:** Don't lose in-progress money entry (AC-15).
- **Use case:** Operator's unsubmitted ledger rows survive navigation.
- **Evidence:** Phase 3 persists ledger drafts in UI store (`capability-registry.md:48`). `QuickLedgerGrid`, `uiStore`.

### CAP-025 — Closeout unsafe row drilldown  ·  Recover/Close  ·  core_workflow  ·  Partial
- **Function:** Inline-expand + drawer-backed drilldown into the unsafe rows blocking closeout.
- **Context:** Operators must fix blockers, not just see counts (J10, JY-19).
- **Use case:** During closeout, operator expands an unsafe-rows group to resolve each.
- **Evidence:** Closeout preview exists; Phase 5 adds inline drilldown (`capability-registry.md:49`). `closeoutBlockerRows` query.

### CAP-026 — Support packet  ·  Support  ·  control  ·  Shipped
- **Function:** Export a support packet for an entity/issue.
- **Context:** Diagnostics/handoff bundle (J09).
- **Use case:** Operator exports a support packet from the Recovery drawer / row.
- **Evidence:** `supportPacket` query exists (`capability-registry.md:50`).

### CAP-027 — Backup/restore preview  ·  Recover/Close  ·  control  ·  Shipped (read-only)
- **Function:** Read-only preview of a backup restore point.
- **Context:** In-app restore stays read-only; destructive restore is offline (J09).
- **Use case:** Owner previews a backup point; `restoreFromBackupPoint` is owner-gated.
- **Evidence:** Restore preview is read-only (`capability-registry.md:51`). `restoreFromBackupPoint` min role = owner (`commandCatalog.ts:403`); typed backup commands deferred (BE-008).

### CAP-028 — Legacy marker preservation  ·  All loops  ·  context  ·  Shipped
- **Function:** Preserve raw legacy marker fields rather than remapping prematurely.
- **Context:** Continuity with the prior Numbers system (Legacy marker contract, MR-002).
- **Use case:** Imported rows keep their legacy markers; legends/review come later.
- **Evidence:** Raw marker fields exist (`capability-registry.md:52`).

### CAP-029 — Matchmaking demand/supply board  ·  Sell/Buy/Decide  ·  core_workflow+projection  ·  Shipped
- **Function:** Record customer needs and vendor stock; produce deterministic match rows with reasons.
- **Context:** Pair demand and supply as intent tracking only (clarification 2026-05-13).
- **Use case:** Operator records needs/supply in `MatchmakingView`; accepts/dismisses matches.
- **Evidence:** Matchmaking route records needs/supply/matches (`capability-registry.md:53`). CMD-MATCHMAKING; `matchmakingBoard`/`matchmakingOpportunities` queries.

### CAP-030 — Pricing Rules Chain Manager  ·  Sell  ·  control+context  ·  Partial (planned)
- **Function:** A consolidated, multi-condition pricing rules chain (table-backed) with an editor.
- **Context:** Current pricing rules are flat JSONB per-customer/systemSettings — no consolidated view (operator request 2026-05-22).
- **Use case:** (Planned) operator manages a pricing rule chain in a Settings tab.
- **Evidence:** Not yet built; spec at `docs/superpowers/specs/2026-05-22-pricing-rules-chain-manager-design.md`. Plan: `pricing_rule_entries` table, `savePricingRuleChain` command, `PricingRulesView`, `PricingRuleChainEditor`, `resolvePricingRuleClause` (`capability-registry.md:54`). **Note:** the SideNav "Pick Queue" item comments tag `CAP-030 / TER-1563` (`Shell.tsx:64`) — that is a labeling artifact; the registry CAP-030 is the pricing chain manager.

### CAP-031 — Saved filter management  ·  Sell/Receive/Decide  ·  control  ·  Shipped (Done)
- **Function:** Rename/delete saved filters with inline UI.
- **Context:** Manage accumulated saved slices (gap audit 2026-05-22).
- **Use case:** Operator renames/deletes a saved filter from the inventory finder.
- **Evidence:** `filters.updateFilter`/`deleteFilter` server-side; `SavedFiltersManager` merged into `InventoryFinderPanel` (`capability-registry.md:55`; Linear TER-1561).

### CAP-032 — Credit engine ops surfaces  ·  Decide/Support  ·  context+control  ·  Shipped (Done)
- **Function:** Divergence report (owner-only) and recompute-queue health (manager+) panels.
- **Context:** Operate the credit engine (gap audit 2026-05-22).
- **Use case:** Manager/owner reviews credit divergence and queue health in `CreditReviewView`.
- **Evidence:** `credit.divergenceReport` (owner) + `credit.creditRecomputeQueueHealth` (manager+); `CreditDivergencePanel` + `CreditQueueHealthWidget` wired with role gates (`capability-registry.md:56`; Linear TER-1562). Role gates via `requireRole` (`src/server/routers/credit.ts:44-45`).

### CAP-033 — Banner dismiss  ·  All loops  ·  control  ·  Partial (planned)
- **Function:** DB-persisted dismissal of UI banners per user.
- **Context:** `user_dismissed_banners` table exists but nothing writes it; `ShadowModeBanner` dismisses to localStorage only (DB audit 2026-05-25).
- **Use case:** (Planned) operator dismisses a banner once, persisted across devices.
- **Evidence:** Table exists `(user_id, banner_key, dismissed_at)`; plan: `banners.getDismissedBanners`/`dismissBanner`, `bannerKeys.ts` (`capability-registry.md:57`; Linear TER-1587). Credit router already exposes `isBannerDismissed`/`dismissBanner`/`clearBannerDismissal` (`00-MASTER-INVENTORY.md:285`).

### CAP-034 — Vendor → brand identity model  ·  Buy/Receive  ·  infrastructure  ·  Partial (planned)
- **Function:** Add `vendor_id` to `brands` and `primary_brand_id` to `vendors`; auto-create a brand on `createVendor`; auto-resolve `brand_id` on `createBatch`/`updateBatch`.
- **Context:** `brands` has no `vendor_id`; `createBatch` never sets `brand_id` (always null); brands facet returns nothing (DB audit 2026-05-25).
- **Use case:** (Planned) creating a vendor creates its primary brand; batches inherit it.
- **Evidence:** Not yet implemented; backfill + transaction plan (`capability-registry.md:58`; Linear TER-1585). Migration `0068_brands_vendor_id.sql` exists (`00-MASTER-INVENTORY.md:522`).

### CAP-035 — Secondary brands per vendor  ·  Buy/Receive  ·  control  ·  Partial (blocked by CAP-034)
- **Function:** Add/rename/deactivate secondary brands for multi-brand vendors.
- **Context:** Data model from CAP-034 supports multiple brands; no commands/UI yet (DB audit 2026-05-25).
- **Use case:** (Planned) operator adds a secondary brand to a vendor and selects it at intake.
- **Evidence:** Blocked by CAP-034; plan: `createSecondaryBrand`/`updateBrand`/`deactivateBrand` (`capability-registry.md:59`; Linear TER-1589). See CMD-BRANDS.

### CAP-036 — Sales Manager Dashboard  ·  Decide  ·  projection  ·  Needs Assessment
- **Function:** Pipeline view, rep performance, aged-inventory alerts, commission visibility for managers.
- **Context:** No implementation; Phase 6 must land first (2026-05-25 audit).
- **Use case:** (Proposed) sales manager monitors pipeline and rep performance.
- **Evidence:** No implementation; assess with Evan (`capability-registry.md:60`).

### CAP-037 — Customer Intelligence Platform  ·  Sell/Decide  ·  context+projection  ·  Needs Assessment
- **Function:** Persistent customer intelligence over time: purchase affinity, cadence, churn risk, profile enrichment.
- **Context:** CAP-001 covers point-of-sale start; this is cross-time intelligence (2026-05-25 audit).
- **Use case:** (Proposed) operator sees a customer's affinity/cadence/churn risk.
- **Evidence:** No implementation; partial — `customerWorkspace` fetches invoices/payments but doesn't render them (`capability-registry.md:61`).

### CAP-038 — Quick Order Mode  ·  Sell  ·  core_workflow  ·  Needs Assessment
- **Function:** Fast-path sale pre-filled from order history for repeat customers.
- **Context:** Distinct from CAP-001 New Sale start (2026-05-25 audit).
- **Use case:** (Proposed) operator re-orders a repeat customer's last sheet in one action.
- **Evidence:** No implementation; `recentCustomerSheets[0]` + addAll logic in `RecentSheetsPanel` is a precursor (`capability-registry.md:62`).

### CAP-039 — Broker/Referee Management Module  ·  Sell/Buy/Collect-Pay  ·  core_workflow+control  ·  Needs Assessment
- **Function:** Full broker CRM: bulk pay accrued, performance report, inline credit prompt during sales, deactivated-relationship history, credit ledger totals.
- **Context:** Extends the existing referee system (2026-05-25 audit).
- **Use case:** (Proposed) manager pays accrued referee credits in bulk and reviews performance.
- **Evidence:** Partial — referee/relationship/credit tables + commands + `RefereesView`/`RefereeDetailPanel` exist; the listed extensions are missing (`capability-registry.md:63`).

### CAP-040 — Offline Pick Mode  ·  Fulfill  ·  core_workflow  ·  Needs Assessment
- **Function:** Local-first pick list with sync-on-reconnect (service worker, IndexedDB action queue, conflict resolution).
- **Context:** `PickView` is online-only today (2026-05-25 audit).
- **Use case:** (Proposed) warehouse picks offline; actions sync on reconnect.
- **Evidence:** No implementation (`capability-registry.md:64`). Separate from CMD-FULFILLMENT (online).

### CAP-041 — Driver Manifest and Proof-of-Delivery  ·  Fulfill  ·  projection+control  ·  Needs Assessment
- **Function:** Post-pack delivery tracking, manifest generation, driver-facing token-auth view.
- **Context:** Distinct from packing (2026-05-25 audit).
- **Use case:** (Proposed) driver gets a manifest and records proof of delivery.
- **Evidence:** Partial — `writeBagManifest` runs on `recordWeighAndPack`/`markOrderFulfilled`; `pick_lists.tracking` exists; no driver view (`capability-registry.md:65`). Token pattern proven by `MediaUploadMobile`.

### CAP-042 — Barcode Scanning — Continuous Loop  ·  Receive/Fulfill  ·  core_workflow  ·  Needs Assessment
- **Function:** Continuous-scan UX, multi-format support, iOS polyfill (react-zxing), hardware peripheral integration.
- **Context:** Spans intake (receive) and fulfillment (pack) (2026-05-25 audit).
- **Use case:** (Proposed) operator scans batches continuously during receive/pack.
- **Evidence:** Partial — one-shot `BarcodeDetector` in `PickLineScreen` (Chrome/Android only) (`capability-registry.md:66`).

---

## Backend Command Families (CMD-*)

These group the write-path commands by loop (`capability-registry.md:68-84`). Minimum roles are from `src/shared/commandCatalog.ts` (`commandMinRole`).

| Family | Commands | Loop(s) | Status / notes |
| --- | --- | --- | --- |
| **CMD-INTAKE** | `createBatch`, `updateBatch`, `deleteBatch`, `postPurchaseReceipt`, `adjustBatchQuantity`, `setInventoryStatus`, `transferInventoryLocation`, `transferInventoryOwnership`, `setBatchPrice`, `setBatchLotInfo`, `attachBatchPhoto`, `importBatchesCsv` | Receive | Already covered. `createBatch` will auto-resolve `brand_id` once CAP-034 lands. `deleteBatch`/`adjustBatchQuantity`/`setInventoryStatus`/`transferInventoryOwnership` = manager; rest = operator (`commandCatalog.ts:337-366`). |
| **CMD-PO** | `createPurchaseOrder`, `updatePurchaseOrder`, `addPurchaseOrderLine`, `updatePurchaseOrderLine`, `removePurchaseOrderLine`, `approvePurchaseOrder`, `receivePurchaseOrder`, `cancelPurchaseOrder` | Buy, Receive | Already covered. `approvePurchaseOrder`/`cancelPurchaseOrder` = manager (`commandCatalog.ts:348, 350`). Partial PO qty receiving = BE-009. |
| **CMD-SALES** | `createSalesOrder`, `addSalesOrderLine`, `updateSalesOrderLine`, `removeSalesOrderLine`, `reserveInventoryForOrder`, `priceSalesOrder`, `confirmSalesOrder`, `cancelSalesOrder` | Sell | Already covered. `cancelSalesOrder` = manager (`commandCatalog.ts:375`). |
| **CMD-POSTING** | `postSalesOrder`, `allocateOrderToFulfillment`, `applyClientCredit`, `setDeliveryWindow` | Sell, Fulfill | Already covered. `applyClientCredit` = manager (`commandCatalog.ts:378`). |
| **CMD-PAYMENTS** | `logPayment`, `allocatePayment`, `unallocatePayment`, `refundPayment`, `applyEarlyPayDiscount` | Collect/Pay | Already covered. `unallocatePayment`/`refundPayment`/`applyEarlyPayDiscount` = manager (`commandCatalog.ts:382-384`). |
| **CMD-VENDOR** | `createVendorBill`, `approveVendorBill`, `scheduleVendorPayment`, `recordVendorPayment`, `voidVendorPayment` | Collect/Pay | Already covered. Approve/schedule/record/void = manager (`commandCatalog.ts:388-391`). |
| **CMD-FULFILLMENT** | `createPickList`, `recordWeighAndPack`, `markOrderFulfilled`, `printLabels`, `adjustFulfillmentLine` | Fulfill | Already covered. Operator-level (`commandCatalog.ts:392-394`). |
| **CMD-CONNECTOR** | `approveConnectorRequest`, `rejectConnectorRequest`, internal `routeConnectorRequest` | Support | Partial — accepted-to-posted bridge deferred (CAP-018/BE-004). |
| **CMD-RECOVERY** | `createCorrectionJournalEntry`, `reverseCommandById`, `restoreFromBackupPoint`, `repriceOrder` | Recover/Close | Already covered. `reverseCommandById` = manager; `restoreFromBackupPoint` = owner. Reversal matrix `reversalPolicies` marks every command reversible/offsettable/terminal (BE-010). |
| **CMD-CLOSEOUT** | `postPeriodAdjustments`, `lockPeriod`, `archivePeriod` | Recover/Close | Partial — blockers/control totals hardened; unsafe-row drilldown = CAP-025. `lockPeriod`/`archivePeriod` = owner (`commandCatalog.ts:406-407`). |
| **CMD-TAGS** | `applyTags` | Buy/Receive/Sell/Decide | Covered. Inline row tags; explicit command for palette/API (operator). |
| **CMD-MATCHMAKING** | `createCustomerNeed`, `updateCustomerNeed`, `createVendorSupply`, `updateVendorSupply`, `acceptMatchmakingMatch`, `dismissMatchmakingMatch` | Sell/Buy/Decide | Covered. Quick-entry strips + three grids + deterministic accept/dismiss. |
| **CMD-BRANDS** | `createSecondaryBrand`, `updateBrand`, `deactivateBrand` | Buy/Receive | Keep — **blocked by CAP-034** (TER-1589). Primary brand auto-created by `createVendor`. |

> The Master Inventory counts **130 commands** total in the catalog (`00-MASTER-INVENTORY.md:12, 22-154`); the families above are the product-grouped subset. Additional commands not in a named family include credit-engine, referee, processor, appointment, contact, media, period, and recovery commands (full list in the Master Inventory command catalog).

---

## Explicitly Rejected Units (REJ-001 … REJ-006)

Old TERP Numbers concepts that are **not** rebuilt (`capability-registry.md:88-95`): AppleScript adapter ops (REJ-001), Script Menu wrappers (REJ-002, replaced by Command Palette/hotkeys/row actions), iCloud collaboration timing (REJ-003), Mac mini permission model (REJ-004), no-write-Numbers gates (REJ-005). REJ-006 (workbook cockpit table adapter) is **merged as a projection concept** — the read-only/generated projection principle survives, the workbook mechanics do not.

---

## Backend Gaps Carried Forward (BE-001 … BE-014)

Tracked deferrals/infra in `capability-registry.md:101-114`:

- **BE-001** Pricing profiles/guardrails — Partial (bounded kernel landed; dedicated tables deferred) → see CAP-013/030.
- **BE-002** Governed tag catalog — Covered (`tag_catalog` + `applyTags`).
- **BE-003** Inventory state transitions — Covered (CAP-019 commands).
- **BE-004** Connector accepted-to-posted bridge — Defer (CAP-018).
- **BE-005** Closeout blocker parity — Covered (CAP-020 shared helper).
- **BE-006** Persisted suggestions — Defer (CAP-016).
- **BE-007** Search freshness — Defer (CAP-015).
- **BE-008** Explicit backup commands — Defer (CAP-027).
- **BE-009** Partial PO quantity receiving — Keep (CMD-PO).
- **BE-010** Reversal completeness matrix — Covered (`reversalPolicies`; `reverseCommandById` refuses unsupported reversal).
- **BE-011** WebSocket transport for subscriptions — Defer. `subscriptions.heartbeat` is a scaffold with no WS transport wired (`00-MASTER-INVENTORY.md:283`); needs `wsLink`/`httpSubscriptionLink` split in `src/client/api/trpc.ts`.
- **BE-012** Server-side batch filter path — Defer. `filters.applyBatchFilters` is implemented server-side but `InventoryFinderPanel` filters client-side from `queries.reference` until inventory exceeds ~500 active batches.
- **BE-013** Media retention lifecycle — Keep. `media_retention_policies`/`media_cleanup_log` tables exist with no code touching them; no default policy seeded (Linear TER-1590).
- **BE-014** Contact merge-candidate detection — Keep. `contact_merge_candidates` is queried for a (always-zero) badge but nothing populates it (Linear TER-1591).

---

## Replication Playbook recipes (R1–R16)

Every PR implementing a registry row must cite the recipe used (`capability-registry.md:120-137`): R1 drawer tab, R2 grid column, R3 status pill tone, R4 action verb, R5 hotkey, R6 view/route, R7 report, R8 entity type, R9 filter chip/saved slice, R10 export/output, R11 empty/error/loading state, R12 cross-entity workflow, R13 telemetry, R14 keyboard semantic, R15 role/permission, R16 connector source. No applicable recipe → deviation note + smoke-test result required.
