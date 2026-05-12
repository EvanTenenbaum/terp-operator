# TERP Agro Front-End Interaction Surface Audit

This audit compares the TERP Agro app against the broad TERP / TERP Numbers interaction specs and the product-browser patterns recovered from adjacent TERP apps.

## Source Set

- `../terp-numbers-command-system-roadmap/docs/control/UI_UX_CONTROL_SURFACE_ARC_REPORT.md`
- `../terp-numbers-command-system-roadmap/docs/control/FEATURE_SCOPE_LEDGER.md`
- `../terp-numbers-mockups/MOCKUPS_GUIDE.md`
- `../TERP/TERP-so-po-next-steps-20260401/client/src/components/spreadsheet-native/ProductBrowserGrid.tsx`
- `../TERP/TERP-so-po-next-steps-20260401/client/src/components/sales/InventoryBrowser.tsx`
- Current TERP Agro implementation under `src/client`, `src/server/routers`, and `src/server/services/commandBus.ts`

## Capture System

Each requirement is captured with the same shape so UX "feel" and hard behavior are tracked together:

| Field | Meaning |
| --- | --- |
| ID | Stable requirement ID for code, tests, and future audits |
| Source | Where the requirement came from |
| Operator moment | The human workflow moment being protected |
| Surface | Dashboard, global helper, grid, inline panel, command palette, or export |
| Speed target | The fastest acceptable path for trained operators |
| Data needed | The live data required to make the surface truthful |
| Control pattern | Grid edit, add-first row, filter chip, bulk action, direct command, or drilldown |
| Vibe target | The product feel: sheet-native, calm, dense, reversible, brokerage-aware, privacy-preserving |
| Failure mode | What would make the app feel worse than the spreadsheet |
| Acceptance check | Concrete proof that the app meets the requirement |

## Vibe Rubric

| Vibe | Required expression |
| --- | --- |
| Spreadsheet-native | Dense rows, inline edits, visible statuses, copyable values, grid-first journeys |
| Command-console confidence | Every write is explicit, audited, reversible where posted, and accompanied by plain-language feedback |
| Start-work speed | New sale, purchase order, receiving, receipt of money, and vendor payout start from a persistent operator strip |
| Brokerage fit | Selling starts from a client or from inventory; buying starts from vendor context; consignment and due money remain visible |
| Product-finder power | Operators can slice inventory by many variables without leaving the order/procurement moment |
| Operator-controlled workspace | Operators can minimize secondary sections or expand the active panel when the grid/finder needs the room |
| Calm utility | Compact controls, no decorative hero/card marketing layout, no modal wizard for core work |
| Privacy/local control | No third-party SaaS dependency for operational data |

## Requirement Matrix And Gap Closure

| ID | Operator moment | Spec target | Built before this pass | Gap | Fix |
| --- | --- | --- | --- | --- | --- |
| FE-START-001 | Start new sale | One obvious customer-aware action to create a draft order and continue in sales grid | Sales view had a customer select and small Order button, but no global start surface | Too slow if operator is on dashboard, payments, inventory, or closeout | Added persistent Quick Start bar with `New Sale`; it runs `createSalesOrder` and opens Sales |
| FE-START-002 | Start new purchase order | One obvious vendor-aware action to start a planned procurement document before product arrives | Intake had a generic `Row` action; no real purchase-order table or lifecycle | Buying flow skipped the actual purchasing step and jumped straight to receiving | Added a dedicated Purchase Orders workspace, `New PO`, PO line grid, approval, cancel, and receive-to-intake path |
| FE-START-003 | Receive money | One obvious client + amount action to log money, with FIFO allocation when desired | Payments view supported logging, but only after navigating to Payments | Operator could not receive money quickly from wherever they are | Added Quick Start `Receive Money` with method and FIFO toggle; it logs payment and optionally allocates FIFO |
| FE-START-004 | Pay money | One obvious vendor bill payout start/action | Vendor view had Pay only after selecting a scheduled row | Payment start was buried in the vendor grid | Added Quick Start `Pay Vendor`; it selects an open payable, schedules a real immediate payout event if needed, then records the payout |
| FE-FINDER-001 | Find sellable inventory | Search plus slice by category, vendor, tag, location, ownership, qty, price, aging | Sales suggestions had a few filters but no dedicated finder | Not enough slicing/dicing to replace spreadsheet/ProductBrowser behavior | Added `InventoryFinderPanel` on Sales with multi-variable filters, active chips, result counts, and add-first quantity controls |
| FE-FINDER-002 | Add from inventory to order | Add-first row with quantity while staying in the selling document | Suggestions could add one selected row; no inline quantity per inventory result | Too slow for common order building | Finder rows now include quantity input and one-click add into selected order |
| FE-FINDER-003 | Keep internal pricing private | Internal sheet can show cost/margin; catalog hides them | Existing Sales Sheet/Catalog toggle already hid margin/cost in catalog export | No change needed | Preserved; finder remains internal-only inside operator console |
| FE-SHEET-001 | Sheet-native control surface | Core work happens in grids/inline panels, not modal wizards | App already used AG Grid for journeys | Quick starts and finder needed to respect that pattern | Implemented as persistent strip and inline side panel, not modals |
| FE-STATUS-001 | Status-first visibility | Draft, Ready, Posted, Needs Fix, Reversed remain visible | Existing grids had status columns | No critical gap | Preserved |
| FE-SPACE-001 | Focus the active work area | Each page should let operators minimize secondary sections or expand the panel they are working in | Panels were fixed-height/fixed-presence, and the side rail/Quick Start strip always consumed space | Operators could not reclaim room for dense grid work | Added shared panel minimize/focus controls, collapsible Quick Start, collapsible side rail, and `Esc` restore |

## Product Finder Functional Extraction

The old TERP `ProductBrowserGrid` and `InventoryBrowser` should not be copied visually into TERP Agro, but their functional primitives are critical:

- Tab/source switching: supplier history, low stock, catalog, and availability context.
- Search across product name, category, supplier/vendor, strain/lot/context.
- Add-first rows: quantity input lives directly beside the add action.
- Duplicate awareness: rows already in the document are visually/operationally guarded.
- Availability context: stock, batch status, supplier/vendor, cost/price, margin, and applied rule context.
- Keyboard acceleration: Enter from quantity should add the row and keep the operator moving.
- Split work surface: product browser and working document are visible at the same time.

TERP Agro now applies the same capabilities in a different operator-console shape: a live inventory finder beside Sales Orders, with filter chips and posted-batch data from the local Postgres database.

## Purchase Order Boundary Closed

The app now separates planned procurement from receiving:

- `New PO` creates a purchase order header in the dedicated Purchase Orders workspace.
- Operators add planned PO lines before physical product arrives.
- `Approve` marks the planned buy ready to receive.
- `Receive to Intake` creates draft intake rows linked back to the PO without posting inventory or payables.
- `Process / Receipt` in Intake remains the ledger-posting step that creates inventory movement and vendor payable consequences.
