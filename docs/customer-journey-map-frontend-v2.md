# TERP Operator Frontend Customer Journey Map v2

This document provides an exhaustive breakdown of all user journeys within the TERP Operator frontend. It is generated from a detailed analysis of the source code as of 2026-06-02.

**Note:** The file `src/client/views/RecoveryView.tsx` was not found during the analysis and is therefore not included in this document.

---

## 1. Dashboard View (`DashboardView.tsx`)

### 1.1. What screen/view the operator is on

-   **ViewKey:** `dashboard`
-   **URL:** `/`

### 1.2. What they see

The dashboard is the main landing page, providing a high-level overview of the business.

-   **Header:** "Owner Daily Decision View" with the subtitle "Today’s money, inventory, open work, and recent activity."
-   **Refresh Button:** A button with a "Refresh" icon.
-   **KPI Cards:** A grid of 4 `KpiCard` components displaying key metrics. Based on the code, these are likely:
    -   Cash Position
    -   What we owe vendors (Payables)
    -   What clients owe (Receivables)
    -   Another metric from `dashboard.data.metrics`.
-   **Today Focus Panel:** A `WorkspacePanel` titled "Today Focus".
    -   **Today's Top Decisions:** A list of the top 3 most urgent work items from the work queue.
    -   **Today Focus Tiles:** 5 tiles for:
        -   Cash Position
        -   What we owe vendors
        -   What clients owe
        -   Open Orders
        -   Intake ready
-   **Money Buckets Panel:** A `WorkspacePanel` displaying different cash buckets.
-   **Your Drafts Panel:** A `WorkspacePanel` showing drafts created by the current user. (Visible only if there are drafts).
-   **Pending work queues Panel:** A `WorkspacePanel` listing queues with pending items (e.g., Intake, Sales, Payments).
    -   Also displays a "Health checks" status pill.
-   **Recent activity Panel:** A `WorkspacePanel` showing a log of recent commands executed in the system.
-   **My Open Work Grid:** An `OperatorGrid` titled "My Open Work", showing a detailed, sortable list of all items in the work queue.
-   **Drilldown Grid:** An `OperatorGrid` that appears when a KPI card is clicked, showing the source data for that metric.

### 1.3. What they click/type

-   **Refresh Button:** Clicks to refetch all dashboard data.
-   **KPI Cards:** Clicks a card to "drill down", which opens the **Drilldown Grid** showing the underlying data.
-   **Today's Top Decisions Items:** Clicks an item to navigate to the relevant view (e.g., clicking an Intake item navigates to `/intake`).
-   **Today Focus Tiles:** Clicks a tile to either open a drilldown grid or navigate to a relevant view.
-   **Money Buckets:** Clicks a bucket to open the "cash" drilldown grid.
-   **Your Drafts Items:** Clicks a draft to navigate to its respective view and continue the work.
-   **Pending work queues Items:** Clicks a queue to navigate to that view with a pre-applied filter (e.g., clicking "Intake" goes to `/intake` with `status:ready` filter).
-   **My Open Work Grid:**
    -   Clicks a row to navigate to the relevant view.
    -   Clicks the expansion chevron on a "Matchmaking" item to see more details and a "Dismiss for 30 days" button.
    -   Clicks "Open top item" button to navigate to the route of the most urgent work item.
-   **Drilldown Grid:** Clicks "Close drilldown" to hide the grid.

### 1.4. Their intent/motivation

-   **Primary Goal:** To get a quick, actionable overview of the state of the business at the start of the day.
-   **Key Questions:**
    -   "What is our cash situation?"
    -   "What are the most urgent tasks I need to work on right now?"
    -   "Are there any new orders or intake items that need my attention?"
    -   "What did the team accomplish recently?"
    -   "Is the system healthy?"

### 1.5. AG Grid columns

#### My Open Work Grid (`workQueue`)

| Field | Header Text | Width | Notes |
| :--- | :--- | :--- | :--- |
| `lane` | Lane | 125 | Pinned left. |
| `title` | Title | 180 | |
| `status` | Status | 125 | |
| `detail` | Detail | 280 (min) | |
| `createdAt`| Created At | 180 | |

#### Drilldown Grid (`drilldown`)

| Field | Header Text | Width | Notes |
| :--- | :--- | :--- | :--- |
| `id` | id | 120 | Pinned left. |
| `status` | status | 120 | |
| `name` | name | - | |
| `customer` | customer | - | |
| `vendor` | vendor | - | |
| `needProduct`| Need | - | |
| `vendorProduct`| Vendor stock | - | |
| `score` | score | - | |
| `reasons` | reasons | - | |
| `amount` | amount | - | |
| `total` | total | - | |
| `availableQty`| availableQty| - | |
| `createdAt`| createdAt | - | |

### 1.6. Context Drawer behavior

The Dashboard view does not appear to use the main `ContextDrawer`. Clicking on items navigates the user to other views where the drawer is then used.

### 1.7. Selection Summary Bar

There is no `SelectionSummary` bar on the dashboard grids, as they are primarily for navigation and information, not bulk actions.

### 1.8. Available filters

The Dashboard does not have a user-facing filter input. The "Pending work queues" panel acts as a set of predefined filters that navigate the user to other views.

### 1.9. Client-side gates

-   The visibility of launch actions in the command palette (which can be accessed from the dashboard) is gated by the user's role (`viewVisibleForUser`, `startVisibleForUser`).

### 1.10. UI gaps

-   The code for the drilldown grid uses a generic `columns` definition. The columns shown will depend entirely on the data returned by the `drilldown` query for a given metric, which might lead to inconsistent or poorly formatted columns.

---

## 2. Sales View (`SalesView.tsx`)

### 2.1. What screen/view the operator is on

-   **ViewKey:** `sales`
-   **URL:** `/sales`

### 2.2. What they see

The Sales view is a comprehensive workspace for managing customer sales, from creating new orders to managing existing ones. The view's layout changes depending on whether a customer is selected.

**Without a Customer Selected:**

-   **Control Band:**
    -   "Customer" dropdown `<select>`.
    -   "New Sale" primary button (disabled).
    -   "Show/Hide Margin" toggle button (`<Eye>`/`<EyeOff>` icon).
    -   "Sale tray" button to expand more actions.
-   **Grids:**
    -   **`OperatorGrid` for "Sales Orders":** Shows all recent sales orders across all customers.
    -   **`SalesSourcePane`:** A panel containing:
        -   **Inventory Finder:** A search input to find available inventory.
        -   **Recent Sheets:** Tabs for "Internal" and "Catalog" recent sheets.
        -   **Purchase History:** Shows customer purchase history (empty state until a customer is selected).

**With a Customer Selected:**

-   **Control Band:**
    -   "Customer" dropdown is now selected.
    -   Primary button label changes dynamically (e.g., "New Sale", "Price + Confirm", "Reserve").
    -   A "selection pill" appears showing the current Order # and Status.
    -   "Sale tray" button.
-   **CustomerPurchaseHistoryPanel:** Appears below the control band, showing historical purchases for the selected customer.
-   **Two-Column Layout:**
    -   **Left Column (`SalesSourcePane`):** Inventory Finder, Recent Sheets, and now populated Purchase History.
    -   **Right Column (`WorkspacePanel` for "Sale Builder"):**
        -   Header with customer name, notes, and financial facts (Balance, Credit).
        -   **Shadow Mode Banner:** A banner related to the credit engine, if active.
        -   **Credit Indicator:** A dismissible warning if the credit engine recommends a lower limit.
        -   **Draft Line Input:** Form fields for "Request / item" and "Qty", with an "Add sale line" button.
        -   **`OperatorGrid` for "Customer Draft Lines":** Shows the line items for the selected or newly created sales order.
        -   **`ReceiptPanel`:** Appears for confirmed/posted/fulfilled orders.

### 2.3. What they click/type

-   **Customer Dropdown:** Selects a customer to begin a sales workflow.
-   **Primary Button ("New Sale", etc.):**
    -   Clicks "New Sale" to create a new draft order for the selected customer.
    -   Clicks "Price + Confirm" to price the order and move it to `confirmed` status.
    -   Clicks "Reserve" to reserve inventory for a `confirmed` order.
-   **"Sale tray" Button:** Expands a secondary control band with actions: "Add suggestion", "Reserve", "Sales Sheet/Catalog" toggle, "Export".
-   **Inventory Finder:** Types a product name or batch code to search for inventory. Clicks "Add" on a result to add it to the current order.
-   **Draft Line Input:** Types a custom item name and quantity, then clicks "Add sale line" to add a non-inventoried (unresolved) line to the order.
-   **Sales Orders/Customer Draft Lines Grids:**
    -   Clicks a row to select it, which populates the Context Drawer.
    -   Double-clicks an editable cell (e.g., `qty`, `unitPrice`) to edit it.
    -   Clicks the expansion chevron to reveal row-level actions like "Confirm order", "Reserve inventory", "Cancel order", "Release for picking", "Recall from pick", "Pack", etc.
    -   Selects multiple rows to activate the **Selection Summary Bar** with bulk actions.
-   **"Show/Hide Margin" Button:** Toggles visibility of cost and margin-related columns (`internalMargin`, `unitCost`, `estimatedMargin`, etc.) for screen-sharing safety.
-   **Warehouse Alert Dialog:** If they edit a line that's already being picked, a dialog appears ("Warehouse alert required"). They must click "Continue" or "Cancel".

### 2.4. Their intent/motivation

-   **Primary Goal:** Create, manage, and fulfill customer sales orders efficiently.
-   **Journeys:**
    1.  **New Sale from Scratch:** Select a customer, start a new sale, add lines by searching inventory or typing free-text, price it, confirm it, and release it for picking.
    2.  **Upselling/Suggestions:** After selecting a customer, review the "Smart Suggestions" grid and "Purchase History" to add relevant items to a new or existing order.
    3.  **Order Management:** Find an existing order, review its status, check line item pick statuses, make edits (like changing quantity), or cancel it.
    4.  **Customer Communication:** Generate a "Customer Sales Catalog" or "Customer Offer" CSV to send to the client, which excludes internal cost/margin data.

### 2.5. AG Grid columns

#### Sales Orders Grid (`orderColumns`)

| Field | Header Text | Width/minWidth | Editable | Notes |
| :--- | :--- | :--- | :--- | :--- |
| `orderNo` | orderNo | 150 | No | Pinned left. |
| `customer` | customer | 180 | No | |
| `status` | status | 125 | No | |
| `pricingStrategy`| pricingStrategy | 145 | No | |
| `total` | total | 120 | No | Numeric. |
| `internalMargin`| Internal margin | 145 | No | Numeric. Hidden if `showMargin` is false. |
| `lines` | lines | 95 | No | |
| `linesPicked` | Lines picked | 135 | No | Formats as "X/Y picked". Styled by completion. |
| `deliveryWindow`| deliveryWindow | 180 (min) | Yes | |

#### Smart Suggestions Grid (`suggestionColumns`)

| Field | Header Text | Width/minWidth | Editable | Notes |
| :--- | :--- | :--- | :--- | :--- |
| `batchCode` | batchCode | 150 | No | Pinned left. |
| `name` | name | 180 (min) | No | |
| `category` | category | 110 | No | |
| `vendor` | vendor | 150 | No | |
| `availableQty`| availableQty | 130 | No | Numeric. |
| `unitPrice` | unitPrice | 110 | No | Numeric. |
| `unitCost` | unitCost | 110 | No | Numeric. Hidden if `showMargin` is false. |
| `estimatedMargin`| estimatedMargin | 150 | No | Numeric. Hidden if `showMargin` is false. |
| `tags` | tags | 140 (min) | No | |
| `reason` | reason | 260 (min) | No | |

#### Customer Draft Lines Grid (`lineColumns`)

| Field | Header Text | Width/minWidth | Editable | Notes |
| :--- | :--- | :--- | :--- | :--- |
| `legacyStatusMarker` | Raw | 90 | Yes (if not locked) | Pinned left. |
| `displayName` | Product name | 190 (min) | No | Pinned left. Shows alias indicator. |
| `itemName` | Canonical | 170 (min) | Yes (if not locked) | |
| `batchCode` | Source | 140 | No | |
| `unresolvedSourceText` | Unresolved source | 170 (min) | Yes (if not locked) | |
| `qty` | qty | 95 | Yes (if not locked) | Numeric. |
| `unitPrice` | unitPrice | 115 | Yes (if not locked) | Numeric. |
| `unitCost` | Cost | 105 | No | Numeric. Hidden if `showMargin` is false. |
| `markup` | Markup $ | 100 | Yes (if not locked) | Recalculates `unitPrice` or `derivedCogs`. Hidden if `showMargin` is false. |
| `markupPct` | Markup % | 85 | No | Derived value. Hidden if `showMargin` is false. |
| `derivedCogs` | COGS | 130 | No | Shows derived cost, rule source, and range check. Hidden if `showMargin` is false. |
| `landedCostExceptionReason` | COGS exception | 200 | No | Renders a chip for exceptions. Hidden if `showMargin` is false. |
| `rangeBadge` | Range / Exceptions | 220 | No | Shows cost range and other exceptions. Hidden if `showMargin` is false. |
| `availableQty` | Avail | 105 | No | Numeric. |
| `packed` | packed | 105 | Yes (if not locked) | |
| `inventoryPosted` | Inv Posted | 125 | Yes (if not locked) | |
| `paymentFollowup` | Pay/F-up | 125 | Yes (if not locked) | |
| `validationIssues` | Fix | 220 (min) | No | |
| `pickStatus` | Pick status | 140 | No | Renders a `PickStatusChip`. |
| `releasedAt` | Released at | 160 | No | Hidden by default. |
| `status` | status | 115 | No | |
| `fulfillmentActions` | Pick | 190 | No | Pinned right. Renders Release/Recall buttons. |

### 2.6. Context Drawer behavior

When a row is selected in the "Sales Orders" or "Customer Draft Lines" grid, the `ContextDrawer` opens.

-   **Entity Type:** `salesOrder`
-   **Tabs:** Balance, History, Notes, Pricing, Output, Commands.
-   **`Balance` Tab:** Shows financial summary for the order.
-   **`History` Tab:** Shows command history related to the order.
-   **`Notes` Tab:** Shows notes for the order.
-   **`Pricing` Tab (`SalesPricingTab`):** Allows re-applying pricing rules.
-   **`Output` Tab (`SalesOutputTab`):** Shows a preview of the "Internal Sales Sheet" or "Customer Sales Catalog". Allows toggling the mode and exporting to CSV.
-   **`Commands` Tab (`SalesCommandHistoryTab`):** Shows detailed command history for the order.

### 2.7. Selection Summary Bar

When one or more rows are selected in the "Customer Draft Lines" grid, a summary bar appears with bulk actions:

-   **Release X for picking:** Releases all eligible selected lines for warehouse picking.
-   **Packed:** Marks all selected lines as packed.
-   **Inv posted:** Marks all selected lines as inventory posted.
-   **Pay/F-up:** Marks all selected lines for payment follow-up.
-   **Remove:** Removes all selected lines from the order.
-   **Reserve:** Reserves inventory for the entire order.

### 2.8. Available filters

The `OperatorGrid` has a free-text filter input. An operator can type `field:value` to filter. For example: `status:draft`.
The "Sales Orders" grid also has a client-side filter chip that appears when a customer is active, showing "Filtered to [Customer Name]". Clicking the 'X' on this chip dismisses the filter and shows all orders again.

### 2.9. Client-side gates

-   **Write Access (`canWrite`):** Many buttons and editable cells are disabled if the user has a `viewer` role. This includes the main control band, draft line inputs, grid editing, and all action buttons.
-   **Order Status:** The main primary action button ("New Sale", "Price + Confirm", etc.) changes its label and behavior based on the selected order's status. It is disabled for terminal statuses like `posted`, `cancelled`, `fulfilled`. Expansion panel actions are also gated by status (e.g., you can only "Confirm order" on a `draft` order).
-   **Pick Status (`isRowEditLocked`):** Line item cells (`qty`, `unitPrice`, etc.) are locked (not editable) if the line has a `pickStatus` of `released`, `picking`, `picked`, or `recall_pending`. Editing these requires recalling the line first. A special dialog (`Warehouse alert required`) appears if an operator tries to edit a quantity on a released line.
-   **Margin Visibility (`showMargin`):** All columns related to cost and margin are conditionally rendered based on the `showMargin` flag in the `uiStore`. This allows an operator to quickly hide sensitive financial data.

### 2.10. UI gaps

-   The "Sale tray" functionality is basic; it just toggles a second row of buttons. More advanced tools could be housed here.
-   The `ReceiptPanel` is only shown for certain statuses, but there's no clear UI to indicate why it might be missing for other statuses.

---

---

## 3. Intake View (`IntakeView.tsx`)

### 3.1. What screen/view the operator is on

-   **ViewKey:** `intake`
-   **URL:** `/intake`

### 3.2. What they see

The Intake view is for managing incoming inventory from purchase orders (POs). It's a master-detail grid where master rows are POs and detail rows are the individual batches to be received.

-   **Control Band:**
    -   **"CSV import" button:** Toggles the visibility of the CSV import panel.
-   **CSV Import Panel (when open):**
    -   A `WorkspacePanel` titled "Validate-first CSV import".
    -   Buttons: "Validate" and "Import".
    -   A large `textarea` for pasting CSV data, which also acts as a drag-and-drop zone for `.csv` files.
    -   A `pre` block to show the JSON result of the validation or import command.
-   **Intake Queue Grid:**
    -   An `OperatorGrid` (within a `WorkspacePanel`) titled "Intake queue".
    -   Subtitle: "X purchase order(s) with batches awaiting verification".
    -   A note: "Yellow = qty differs from expected · Red = discrepancy reason required".
    -   Master rows representing Purchase Orders.
    -   Detail rows (expandable) representing individual batches within that PO.
-   **Receipt Preview Drawer:** A drawer (`ReceiptPreviewDrawer`) that slides in from the side to show a preview of the receipt document when the "Preview receipt" button is clicked.

### 3.3. What they click/type

-   **"CSV import" Button:** Toggles the CSV import panel.
-   **CSV Import Panel:**
    -   Pastes or drops a CSV file into the `textarea`.
    -   Clicks "Validate" to check the CSV data without importing.
    -   Clicks "Import" (enabled after successful validation) to create intake batches from the CSV.
-   **Intake Queue Grid (Master/PO Rows):**
    -   Clicks the expansion chevron to view the individual batches for a PO.
    -   Clicks a PO row to select it, which opens the **Context Drawer** with PO-level information.
    -   **"Verify all" Button:** Clicks this to open a confirmation dialog. Upon confirming, it verifies all pending batches for that PO in one action.
    -   **"Preview receipt" Button:** Clicks to open the `ReceiptPreviewDrawer`.
-   **Intake Queue Grid (Detail/Batch Rows):**
    -   Clicks a batch row to select it, opening the **Context Drawer** with lot-level information.
    -   Edits cells directly in the grid, such as `Actual qty` and `Discrepancy reason`. The `Actual qty` cell turns yellow if it doesn't match the `Expected qty`. The `Discrepancy reason` cell turns red if there's a mismatch but no reason is provided.
    -   **"Verify" Button:** Clicks to verify a single batch, post its receipt, and automatically flag quantity discrepancies.
    -   **"Reject" Button:** Opens an inline dropdown to select a rejection reason (e.g., "Quality fail", "Wrong product").
    -   **"Add note" Button:** Opens an inline input field to add a note to the batch.
    -   **"Market name" Button:** Opens an inline input to set a customer-facing alias for the product.
    -   **"Delete" Button:** (Visible only for `draft` status batches) Opens an inline confirmation to delete the draft batch.

### 3.4. Their intent/motivation

-   **Primary Goal:** To accurately receive and verify incoming inventory against purchase orders, documenting any discrepancies.
-   **Journeys:**
    1.  **Bulk Intake via CSV:** An operator has a manifest from a vendor as a CSV. They use the CSV import tool to validate and then import all the batches at once, creating draft intake rows.
    2.  **PO-by-PO Verification:** An operator works through the "Intake queue". They expand a PO, check the physical product against the expected batches, enter the actual quantities received, and provide reasons for any differences.
    3.  **Single Batch Verification:** An operator verifies batches one by one using the "Verify" button on each row.
    4.  **Handling Discrepancies:** If a product is wrong or damaged, the operator uses the "Reject" button. If quantity is off, they enter the actual quantity and a note in the "Discrepancy reason" field before verifying.
    5.  **Generating Paperwork:** Before finalizing, they might use the "Preview receipt" button to see what the final receipt document will look like.

### 3.5. AG Grid columns

#### Master Grid (Purchase Orders)

| Field | Header Text | Width/minWidth | Editable | Notes |
| :--- | :--- | :--- | :--- | :--- |
| `poNo` | PO | 180 (min) | No | Pinned left. Acts as expansion control. |
| `vendor` | Vendor | 160 (min) | No | |
| `status` | status | 140 (min) | No | |
| *Calculated* | Expected qty| - | No | Sum of `expectedTotalQty`. |
| *Calculated* | Received qty| - | No | Sum of `receivedTotalQty`. |
| *Calculated* | Expected $ | - | No | `expectedTotal` formatted as money. |
| *Calculated* | Verified $ | - | No | `total` formatted as money. |
| *Actions* | Actions | 280 (min) | No | Pinned right. Contains "Verify all" and "Preview receipt" buttons. Shows "X/Y verified" pill. |

#### Detail Grid (Batches)

| Field | Header Text | Width/minWidth | Editable | Notes |
| :--- | :--- | :--- | :--- | :--- |
| `batchCode` | Batch | 160 (min) | No | Pinned left. |
| `name` | name | 180 (min) | No | |
| `itemAlias`| Market name | 160 (min) | No | |
| `expectedQty`| Expected qty| 120 (min) | No | |
| `intakeQty`| Actual qty | 140 (min) | Yes (`canWrite`) | Numeric. Cell styled yellow on mismatch. |
| `discrepancyReason` | Discrepancy reason | 240 (min) | Yes (`canWrite`) | Cell styled red if required but empty. |
| `unitCost` | Unit cost | 110 (min) | No | Numeric. |
| `status` | status | 110 (min) | No | |
| `arrivalStatus`| Arrival | 110 | No | |
| `mediaStatus`| Media | 110 | No | |
| `notes` | Notes | 220 (min) | No | |
| *Actions* | Actions | 300 (min) | No | Pinned right. Renders inline action buttons (Verify, Reject, etc.). |

### 3.6. Context Drawer behavior

The drawer behavior is sensitive to what is clicked.

-   **Clicking a PO (Master) Row:**
    -   **Entity Type:** `po`
    -   **Tabs:** Relationship, Lines, Vendor, Linked intake, History, Commands.
-   **Clicking a Batch (Detail) Row:**
    -   **Entity Type:** `lot`
    -   **Tabs:** Relationship, Movement, Sales, Photos, History.

This allows the operator to see context for the entire PO or drill down into the lifecycle of a specific batch.

### 3.7. Selection Summary Bar

The `IntakeView` does not use the `SelectionSummary` bar for bulk actions. Actions are performed either per-row or per-PO group ("Verify all").

### 3.8. Available filters

The grid has the standard free-text filter input (`field:value`). There are no predefined filter preset buttons in this view.

### 3.9. Client-side gates

-   **Write Access (`canWrite`):** The "Verify all" button, inline batch editing, and all batch action buttons (Verify, Reject, etc.) are disabled if the user has a `viewer` role. The CSV import buttons are also disabled.
-   **Batch Status:** The action buttons on a batch row are gated by the batch's `status`. For example, "Verify" is only enabled for `draft` or `ready` statuses. The "Delete" button only appears for `draft` batches.
-   **PO Status:** The "Verify all" and "Preview receipt" buttons are disabled if a PO has no pending batches.
-   **CSV Import:** The "Import" button is disabled until a successful "Validate" command has been run.

### 3.10. UI gaps

-   The view for handling a failed `intakeQueue` query is very basic ("Unable to load intake queue... Retry"). It could provide more context or diagnostics.
-   The CSV import error reporting is a raw JSON dump in a `pre` tag, which is not very user-friendly for operators.
-   The inline input fields for "Add note" and "Market name" are simple text inputs. They could be enhanced with more features (e.g., suggestions for market names).

---

---

## 4. Operations Views (`OperationsViews.tsx`)

This file contains multiple views that are central to day-to-day operations. Each is documented as a separate top-level section below.

---

### 4.1. Purchase Orders View

-   **ViewKey:** `purchaseOrders`
-   **URL:** `/purchase-orders`

#### 4.1.1. What they see

This view is for creating and managing Purchase Orders (POs) with vendors. It has two main modes: a grid view of existing POs and an "authoring workspace" for creating a new PO.

**Grid View (Default):**

-   **Control Band:**
    -   **"New PO" button:** Switches to the authoring workspace.
-   **`OperatorGrid` for "Recent purchase orders":**
    -   A list of all POs.
    -   **Filter Presets:** Buttons for "Active", "Ordered", "Finalized".
    -   **Primary Action Button:** A context-sensitive button (e.g., "Receive PO", "Approve PO", "Finalize PO").
-   **Selected PO Details (when a row is selected):**
    -   A header strip appears with the selected PO's number, vendor, status, and totals.
    -   A `ReceiptPanel` appears for POs with statuses `finalized` or later.
    -   An `OperatorGrid` for "[PO No] Lines" appears, showing the line items for the selected PO.

**Authoring Workspace (after clicking "New PO"):**

-   A full-screen layout with two main columns and multiple panels.
-   **Header Strip:** Shows "Draft workspace", the selected vendor, expected date, and PO total. A "Cancel draft PO" button is present.
-   **Main Control Band:** Contains fields for:
    -   Vendor (dropdown)
    -   Expected Date (date picker)
    -   Vendor receipt notes (text input)
    -   Payment terms (dropdown)
    -   Prepayment amount (number input)
    -   Referee credit (dropdown)
-   **"Add new vendor" Panel (expandable):** A form to create a new vendor on the fly.
-   **`OperatorGrid` for "New PO lines":** A grid of 10 blank rows to enter line items for the new PO.
-   **Right-hand Context Panel:**
    -   "Vendor context" section with facts like Terms, Open bills, and Prior POs.
    -   "Historical quick add" list, showing items previously purchased from the selected vendor, which can be clicked to add to the new PO.
    -   "Market signals" section.

#### 4.1.2. What they click/type

-   **"New PO" Button:** Enters the authoring workspace.
-   **In Authoring Workspace:**
    -   Selects a **Vendor** from the dropdown.
    -   Optionally clicks **"Add new vendor"** to open a form and create a new vendor.
    -   Enters an **Expected Date**.
    -   Types notes into the notes fields.
    -   Enters line items directly into the "New PO lines" grid (Product, Category, Cost, Qty, etc.).
    -   Clicks a product in the "Historical quick add" list to add it as a new line.
    -   Clicks **"Add line row"** to get more blank lines.
    -   Clicks **"Save draft"** to save the PO with `draft` status.
    -   Clicks **"Approve PO"** to save, finalize, and approve the PO, making it ready for intake.
    -   Clicks **"Cancel draft PO"** to exit the workspace.
-   **In Grid View:**
    -   Clicks a PO row to select it, which shows its lines below and opens the Context Drawer.
    -   Uses the **Filter Preset Buttons** ("Active", etc.) to quickly filter the PO list.
    -   Double-clicks an editable cell in the main grid (e.g., `expectedDate`, `buyerNotes`) to edit it.
    -   Double-clicks an editable cell in the lines grid (e.g., `productName`, `unitCost`, `qty`) to edit a line on an existing PO.
    -   Clicks the expansion chevron on a PO row to access actions: "Draft intake", "Unfinalize", "Cancel draft PO", "Record Prepayment".
    -   Clicks the **Primary Action Button** ("Receive PO", etc.) to perform the main action for the selected PO's status.

#### 4.1.3. Their intent/motivation

-   **Primary Goal:** To create formal purchase orders for inventory from vendors and manage their lifecycle until the goods are ready to be received.
-   **Journeys:**
    1.  **Creating a New PO:** An operator needs to order more of a product. They open the authoring workspace, select the vendor, fill in the line items (possibly using the historical quick-add for speed), set the terms, and approve it.
    2.  **Managing an Existing PO:** An operator needs to check the status of a PO. They find it in the grid, select it, and review its lines and history. They might need to edit a line to correct a mistake before it's received.
    3.  **Initiating Intake:** A shipment arrives. The operator finds the corresponding PO in the grid (which should be in `approved` or `ordered` status) and clicks "Receive PO" (or "Draft intake") to send it to the Intake view.

#### 4.1.4. AG Grid columns

##### Main Purchase Orders Grid

| Field | Header Text | Width | Editable | Notes |
| :--- | :--- | :--- | :--- | :--- |
| `poNo` | PO | 150 | No | Pinned left. |
| `vendor` | vendor | 190 | No | |
| `status` | status | 135 | No | |
| `expectedDate` | Expected | 165 | Yes | |
| `paymentTerms` | Terms | 140 | Yes | |
| `prepaymentAmount`| Prepay | 115 | Yes | Numeric. |
| `total` | total | 120 | No | Numeric. |
| `lines` | lines | 95 | No | |
| `orderedQty` | Ordered | 120 | No | Numeric. |
| `receivedQty`| Received | 120 | No | Numeric. |
| `buyerNotes` | Internal notes | 220 (min)| Yes | |
| `internalNotes`| Internal notes (ops) | 220 (min)| Yes | |
| `externalNotes`| External (vendor) | 220 (min)| Yes | |
| `orderedAt` | orderedAt | 170 | No | |
| `receivedAt` | receivedAt | 170 | No | |
| `createdAt` | createdAt | 170 | No | |

##### Purchase Order Lines Grid (in detail area and authoring)

| Field | Header Text | Width/minWidth | Editable | Notes |
| :--- | :--- | :--- | :--- | :--- |
| `productName` | Product / strain | 190 (min) | Yes | Pinned left. |
| `category` | category | 120 | Yes | |
| `subcategory`| subcategory | 140 | Yes | |
| `unitCost` | Unit cost | 120 | Yes | Numeric. |
| `costRangeLow`| Range low | 115 | Yes | Numeric. |
| `costRangeHigh`| Range high | 115 | Yes | Numeric. |
| `qty` | Units | 105 | Yes | Numeric. |
| `uom` | Unit type | 110 | Yes | |
| `lineTotal` | Row total | 120 | No | Numeric, calculated. |
| `externalNotes`| Vendor receipt notes | 190 (min)| Yes | |
| `internalNotes`| Internal notes | 180 (min)| Yes | |
| `tags` | tags | 160 (min)| Yes | |
| `receivedQty`| Received | 120 | No | |
| `status` | status | 120 | No | |

#### 4.1.5. Context Drawer behavior

When a PO row is selected:
-   **Entity Type:** `po`
-   **Tabs:** Relationship, Lines, Vendor, Linked intake, History, Commands.
-   **`Lines` Tab:** Shows the line items for the PO.
-   **`Vendor` Tab:** Shows detailed context about the vendor.
-   **`Linked intake` Tab:** Shows any intake batches that have been created from this PO.
-   **`History` Tab:** Shows the command history for this PO.
-   **`Commands` Tab:** Provides status-aware action buttons for the PO.

#### 4.1.6. Selection Summary Bar

The `SelectionSummary` bar is not used for bulk actions in this view. Actions are performed on a single selected PO.

#### 4.1.7. Available filters

-   **Preset Buttons:** "Active", "Ordered", "Finalized". These apply predefined `status:` filters.
-   **Free-text Input:** Standard grid filter allowing `field:value` searches.

#### 4.1.8. Client-side gates

-   **Write Access (`canWrite`):** The "New PO" button, editing cells, and all action buttons are disabled for `viewer` roles.
-   **PO Status:** The primary action button and expansion panel actions are all gated by the selected PO's `status`. For example, you cannot "Receive" a `draft` PO, and you cannot "Unfinalize" an `approved` PO.
-   **Authoring Workspace:** The "Approve PO" button is disabled until a vendor is selected and all entered lines have a product name, quantity, and either a unit cost or a valid cost range.

#### 4.1.9. UI gaps

-   Creating a new PO via the authoring workspace involves filling out a grid with 10 blank lines, which can be clunky. There's an "Add line row" button, but no way to remove lines.
-   The "Add new vendor" form is embedded within the authoring flow. If an operator makes a mistake, it might be disruptive to the PO creation process.
-   The "Record Prepayment" action opens a separate dialog (`RecordPrepaymentDialog`), while most other actions are inline or in the expansion panel. This is a slight inconsistency.

---

### 4.2. Orders View

-   **ViewKey:** `orders`
-   **URL:** `/orders`

#### 4.2.1. What they see

This view provides a master list of all sales orders, focused on post-confirmation and fulfillment statuses. It's distinct from the `SalesView` which is a workspace for *creating* sales. This view is for *managing* existing ones from an operational perspective.

-   **Control Band:**
    -   There is no primary control band for creating new entities. The main actions are within the grid.
-   **`OperatorGrid` for "Orders":**
    -   A grid listing all sales orders.
    -   **Filter Presets:** The code does not show filter presets for this view, but the `uiStore` logic is there, suggesting they could be added.
    -   **Referee Credit Dropdown:** If a selected order has an associated customer with a referee relationship, a dropdown appears in a "subtle-band" above the grid to optionally apply referee credit when posting the order.

#### 4.2.2. What they click/type

-   **Grid Cells:** Clicks to select a row, opening the Context Drawer. Double-clicks editable cells (`deliveryWindow`, `notes`, `packed`, etc.) to modify them directly.
-   **Referee Credit Dropdown:** If visible, selects a referee from the list before posting the order.
-   **Primary Action (via Command Palette or Drawer):** The main actions like "Post Sales Order" are not on a primary button in the main view but are available through other means (like the command palette or potentially the context drawer, though not explicitly shown in the view's code). The `handlePostOrder` function exists to be called by some UI element.

#### 4.2.3. Their intent/motivation

-   **Primary Goal:** To monitor and manage the status of sales orders after they have been confirmed, especially through the fulfillment and payment lifecycle.
-   **Key Questions:**
    -   "Which orders are confirmed but not yet fulfilled?"
    -   "Which orders have been fulfilled but not yet paid?"
    -   "I need to update the delivery window for this customer's order."
    -   "I need to mark these three orders as 'packed' in bulk."

#### 4.2.4. AG Grid columns

##### Main Orders Grid

| Field | Header Text | Width | Editable | Notes |
| :--- | :--- | :--- | :--- | :--- |
| `orderNo` | orderNo | 150 | No | Pinned left. |
| `customer` | customer | 180 | No | |
| `status` | status | 125 | No | |
| `total` | total | 120 | No | Numeric. |
| `deliveryWindow`| deliveryWindow | 180 | Yes | |
| `notes` | notes | 180 (min)| Yes | |
| `invoiceNo` | invoiceNo | 150 | No | |
| `invoiceStatus`| invoiceStatus| 130 | No | |
| `packed` | packed | 105 | Yes | |
| `inventoryPosted`| Inv Posted | 125 | Yes | |
| `paymentFollowup`| Pay/F-up | 125 | Yes | |
| `legacyStatusMarkers`| Markers | 115 | No | |
| `validationIssues`| Fix | 200 (min)| No | |
| `postedAt` | postedAt | 180 | No | |
| `fulfilledAt`| fulfilledAt | 180 | No | |

#### 4.2.5. Context Drawer behavior

When an order row is selected:
-   **Entity Type:** `order`
-   **Tabs:** Relationship, Lines, Customer, Output, History.
-   This provides a focused view on the operational details of the order, its contents, and the customer it belongs to, differing slightly from the `salesOrder` entity in the Sales view.

#### 4.2.6. Selection Summary Bar

The `SelectionSummary` bar is present, but the view code does not define any specific bulk actions for it (`selectionActions` is not passed to the grid). However, the underlying `OperatorGrid` may provide default actions.

#### 4.2.7. Available filters

-   **Free-text Input:** Standard grid filter allowing `field:value` searches.
-   **Filter Presets:** The code includes a `toggleOrdersPreset` function, but no buttons are defined in the UI to call it. This is a UI gap.

#### 4.2.8. Client-side gates

-   **Write Access (`canWrite`):** Cell editing is disabled for `viewer` roles. The referee credit dropdown is not rendered.
-   **Referee Relationship:** The referee credit dropdown only appears if the selected order's customer has one or more referee relationships.

#### 4.2.9. UI gaps

-   There are no primary action buttons in the main view for common tasks like posting or fulfilling orders. The operator must rely on the command palette, context drawer, or inline grid actions, which might not be obvious.
-   The filter preset functionality is implemented in the store but not exposed in the UI with buttons.

---

---

### 4.3. Payments View

-   **ViewKey:** `payments`
-   **URL:** `/payments`

#### 4.3.1. What they see

This view is for tracking and managing all financial transactions, both incoming (from customers) and outgoing (to vendors, referees, etc.). It features a main grid of payment records and a powerful "Quick Ledger" for rapid data entry.

-   **"Quick Ledger" Panel (`QuickLedgerGrid`):**
    -   A `WorkspacePanel` that is likely the primary focus of this view.
    -   It contains a highly interactive grid for entering new payment or payout transactions.
    -   This component is complex, with its own state management for `ledgerDrafts` in the `uiStore`.
-   **Main `OperatorGrid` for "All Payments":**
    -   A comprehensive log of all historical payment records.
    -   Filter presets for "Needs Allocation", "Posted", and "Reversed".

#### 4.3.2. What they click/type

-   **In Quick Ledger:**
    -   Enters data directly into a spreadsheet-like interface.
    -   Selects values from dropdowns within cells for fields like `Direction`, `Entity Type`, `Transaction Type`, `Method`, etc.
    -   Types amounts, references, and notes.
    -   Uses an entity selector to find and link customers, vendors, etc.
    -   Clicks a "Post" button (or similar action) on each draft row to finalize the transaction.
-   **In All Payments Grid:**
    -   Clicks a row to select it and view its details in the Context Drawer.
    -   Uses the **Filter Preset Buttons** ("Needs Allocation", etc.) to navigate the payment history.
    -   Uses the free-text filter for specific searches.
-   **In Expansion Panel (for a payment row):**
    -   Clicks **"Reverse payment"** to undo a posted payment.

#### 4.3.3. Their intent/motivation

-   **Primary Goal:** To maintain an accurate ledger of all money flowing in and out of the business.
-   **Journeys:**
    1.  **Recording a Customer Payment:** A customer pays an invoice. The operator opens the Quick Ledger, creates a "Receiving" entry, links it to the customer, enters the amount and method, allocates it to the correct invoice, and posts it.
    2.  **Paying a Vendor Bill:** The operator needs to pay a vendor. They create a "Paying" entry in the Quick Ledger, link it to the vendor, enter the amount, and post it.
    3.  **Auditing Payments:** An operator needs to find a specific transaction. They use the filters on the "All Payments" grid to locate the record and review its details and history in the Context Drawer.
    4.  **Correcting a Mistake:** An operator realizes they recorded a payment incorrectly. They find the payment, expand it, and click "Reverse payment", then create a new, correct entry in the Quick Ledger.

#### 4.3.4. AG Grid columns

##### All Payments Grid

| Field | Header Text | Width | Editable | Notes |
| :--- | :--- | :--- | :--- | :--- |
| `customer` | customer | 180 | No | Pinned left. |
| `method` | method | 110 | No | |
| `direction` | direction | 120 | No | |
| `category` | category | 140 | No | |
| `amount` | amount | 120 | No | Numeric. |
| `unappliedAmount`| unappliedAmount | 150 | No | Numeric. |
| `allocationIntent`| allocationIntent | 145 | No | |
| `impactPreview`| impactPreview| 220 (min)| No | |
| `reference` | reference | 160 | No | |
| `locationBucket` | locationBucket | 150 | No | |
| `notes` | notes | 180 (min)| No | |
| `status` | status | 125 | No | |
| `createdAt` | createdAt | 180 | No | |

*Note: The columns for `QuickLedgerGrid` are managed within that component and are highly interactive, including dropdowns and custom editors.*

#### 4.3.5. Context Drawer behavior

When a payment row is selected:
-   **Entity Type:** `payment`
-   **Tabs:** Relationship, Allocations, Customer, Impact, History.
-   **`Allocations` Tab:** Shows how the payment has been applied (e.g., to which invoices). This is the most critical tab for this entity.
-   **`Impact` Tab:** Shows the effect of this payment on account balances.

#### 4.3.6. Selection Summary Bar

The view does not define specific bulk actions. The primary workflow is single-row entry in the Quick Ledger or single-row investigation in the main grid.

#### 4.3.7. Available filters

-   **Preset Buttons:** "Needs Allocation", "Posted", "Reversed".
-   **Free-text Input:** Standard grid filter.

#### 4.3.8. Client-side gates

-   **Write Access (`canWrite`):** The `QuickLedgerGrid` and the "Reverse payment" action are likely disabled for `viewer` roles.
-   **Payment Status:** "Reverse payment" is only available for payments that have been posted. You cannot reverse a draft or an already-reversed payment.

#### 4.3.9. UI gaps

-   The UI for `QuickLedgerGrid` is not fully detailed in `OperationsViews.tsx` itself, as it's a separate complex component. Its full functionality, including any gaps, would require analyzing `QuickLedgerGrid.tsx`.
-   The relationship between the "Quick Ledger" drafts and the main "All Payments" grid could be made clearer (e.g., a "Show drafts" toggle on the main grid).
---

---

### 4.4. Inventory View

-   **ViewKey:** `inventory`
-   **URL:** `/inventory`

#### 4.4.1. What they see

This view is a comprehensive master list of all inventory batches. It's used for auditing, managing, and making corrections to inventory data.

-   **`OperatorGrid` for "All Inventory":**
    -   A large grid showing every batch, with numerous columns covering everything from product name and quantity to cost, price, and status.
    -   **Filter Presets:** "Needs Media", "Available", "Issues".

#### 4.4.2. What they click/type

-   **Grid Cells:** Clicks to select a row, which opens the Context Drawer for that batch. Double-clicks editable cells (`availableQty`, `unitPrice`, `tags`, etc.) to make direct changes.
-   **Filter Presets:** Clicks "Needs Media", "Available", or "Issues" to apply quick filters to the inventory list.
-   **Expansion Panel Actions:**
    -   **"Apply tags":** Opens a prompt to add or remove tags from the batch.
    -   **"Adjust inventory":** Opens a prompt to enter a new quantity and a reason for the adjustment.
    -   **"Set unit cost":** Opens a prompt to change the `unitCost`.
    -   **"Set unit price":** Opens a prompt to change the `unitPrice`.

#### 4.4.3. Their intent/motivation

-   **Primary Goal:** To have a single source of truth for all inventory on hand, and to be able to make corrections or updates as needed.
-   **Journeys:**
    1.  **Inventory Audit:** An operator performs a cycle count. They filter the grid to a specific category or location, then compare the physical count to the `availableQty` in the grid. If they find a discrepancy, they use the "Adjust inventory" action to correct it, providing a reason.
    2.  **Price Update:** Management decides to change the price of a product. An operator finds the relevant batch(es) and uses the "Set unit price" action or edits the `unitPrice` cell directly.
    3.  **Media Management:** The operator for photography uses the "Needs Media" filter to find all batches that are missing photos or videos. They work through the list, and as media is added, the batches disappear from the filtered view.
    4.  **Troubleshooting:** An operator uses the "Issues" filter to find batches with validation problems or other flags, then investigates and corrects the data.

#### 4.4.4. AG Grid columns

##### All Inventory Grid

| Field | Header Text | Width | Editable | Notes |
| :--- | :--- | :--- | :--- | :--- |
| `batchCode` | batchCode | 150 | No | Pinned left. |
| `name` | name | 200 (min)| No | Shows alias indicator. |
| `itemAlias`| Market name | 180 (min)| Yes | |
| `category` | category | 120 | No | |
| `tags` | tags | 170 (min)| Yes | |
| `vendor` | vendor | 180 | No | |
| `availableQty`| availableQty | 130 | Yes | Numeric. |
| `reservedQty`| reservedQty | 130 | No | Numeric. |
| `uom` | uom | 90 | No | |
| `unitCost` | unitCost | 110 | No | Numeric. |
| `unitPrice` | unitPrice | 110 | Yes | Numeric. |
| `location` | location | 120 | No | |
| `legacyMarker`| Marker | 105 | Yes | |
| `ownershipStatus`| ownershipStatus | 120 | No | |
| `arrivalStatus`| arrivalStatus | 120 | No | |
| `mediaStatus`| Media | 120 | No | |
| `lotCode` | lotCode | 120 | Yes | |
| `expirationDate`| expirationDate| 140 | Yes | |
| `status` | status | 120 | No | |

#### 4.4.5. Context Drawer behavior

When an inventory (batch) row is selected:
-   **Entity Type:** `lot`
-   **Tabs:** Relationship, Movement, Sales, Photos, History.
-   **`Movement` Tab:** Shows the complete history of this batch, from intake to adjustments to sales. This is the most critical tab for auditing.
-   **`Sales` Tab:** Shows all sales orders this batch has been a part of.
-   **`Photos` Tab:** Shows media attached to the batch and their status.

#### 4.4.6. Selection Summary Bar

When rows are selected, the bar appears with these bulk actions:
-   **"Apply tags":** Applies tags to all selected batches.
-   **"Flag for review":** Flags all selected batches with a specified reason.

#### 4.4.7. Available filters

-   **Preset Buttons:** "Needs Media", "Available", "Issues".
-   **Free-text Input:** Standard grid filter.

#### 4.4.8. Client-side gates

-   **Write Access (`canWrite`):** All editing capabilities (inline cells, expansion actions, selection actions) are disabled for `viewer` roles.

#### 4.4.9. UI gaps

-   There is no "Create Batch" button directly in this view. New inventory must come from the Intake view. While this is logical, a manual "Create Batch" could be a useful feature for correcting major errors or handling one-off situations.
-   The "Adjust inventory" action uses a simple `prompt`, which is not a robust UI. A proper dialog with validation would be better.

---

---

### 4.5. Clients View

-   **ViewKey:** `clients`
-   **URL:** `/clients`

#### 4.5.1. What they see

This view is a directory of all customers (referred to as "clients" in the UI). It provides a high-level financial overview for each customer.

-   **`OperatorGrid` for "All Customers":**
    -   A grid listing all customers.
    -   **Filter Presets:** "Needs Credit Review", "Over Limit", "Past Due".
    -   **Primary Action Button:** A "New Sale" button that navigates to the `SalesView` with the selected customer pre-loaded.

#### 4.5.2. What they click/type

-   **Grid Rows:** Clicks a row to select a customer, which enables the "New Sale" button and opens the Context Drawer.
-   **Filter Presets:** Clicks "Needs Credit Review", "Over Limit", or "Past Due" to filter the customer list to those meeting the criteria.
-   **"New Sale" Button:** Clicks to start a new sales order for the selected customer, which navigates them to the `/sales` view.
-   **Expansion Panel Actions:**
    -   **"Log payment":** Opens a prompt to log a payment for the customer.
    -   **"Create invoice":** Opens a prompt to create a manual invoice.
    -   **"Adjust balance":** Opens a prompt to apply a credit or debit.
    -   **"Set credit limit":** Opens a prompt to change the customer's credit limit.

#### 4.5.3. Their intent/motivation

-   **Primary Goal:** To manage the customer roster and get a quick overview of their financial status.
-   **Journeys:**
    1.  **Starting a Sale:** An operator wants to create a sale for an existing customer. They find the customer in this view, select them, and click "New Sale".
    2.  **Credit Management:** A credit manager starts their day by using the "Needs Credit Review" and "Over Limit" filters to identify customers who require attention. They use the Context Drawer to investigate each customer's history and take action.
    3.  **Logging a Payment:** A customer calls to say they've sent a check. An operator finds the customer, expands their row, and uses the "Log payment" action to record it.

#### 4.5.4. AG Grid columns

##### All Customers Grid

| Field | Header Text | Width | Editable | Notes |
| :--- | :--- | :--- | :--- | :--- |
| `name` | name | 190 | No | Pinned left. |
| `creditLimit`| creditLimit | 140 | No | Numeric. |
| `balance` | balance | 130 | No | Numeric. |
| `tags` | tags | 180 (min)| No | |
| `notes` | notes | 260 (min)| No | |
| `invoiceCount`| invoiceCount | 120 | No | |

#### 4.5.5. Context Drawer behavior

When a customer row is selected:
-   **Entity Type:** `customer`
-   **Tabs:** Relationship, Profile, Balance, Purchases, Credit, Notes, History.
-   **`Balance` Tab:** Shows detailed financial ledger and invoices.
-   **`Purchases` Tab:** Shows historical sales orders.
-   **`Credit` Tab:** Opens the `CustomerCreditPanel` for detailed credit management.

#### 4.5.6. Selection Summary Bar

The view does not define specific bulk actions. Actions are primarily for a single selected customer.

#### 4.5.7. Available filters

-   **Preset Buttons:** "Needs Credit Review", "Over Limit", "Past Due".
-   **Free-text Input:** Standard grid filter.

#### 4.5.8. Client-side gates

-   **Write Access (`canWrite`):** All action buttons (New Sale, Log payment, etc.) are disabled for `viewer` roles.
-   **Selection:** The "New Sale" button is disabled until a customer row is selected.

#### 4.5.9. UI gaps

-   The expansion panel actions ("Log payment", "Create invoice", etc.) all use simple `prompt()` dialogs. This is a significant UI gap; these should be proper forms or modals with validation for handling financial data.
-   There is no "Create Customer" button in this view. New customers are likely created through other flows (e.g., in `ContactsView` or potentially on-the-fly in `SalesView`), but it's a missing feature for a dedicated "Clients" directory.

---

---

### 4.6. Vendors View

-   **ViewKey:** `vendors`
-   **URL:** `/vendors`

#### 4.6.1. What they see

This view is a directory of all vendor bills, serving as the accounts payable dashboard.

-   **`OperatorGrid` for "Vendor Bills":**
    -   A grid listing all vendor bills.
    -   **Filter Presets:** "Due Soon", "Past Due", "Unpaid".
    -   **Primary Action Button:** A "Pay Bills" button for paying selected bills.

#### 4.6.2. What they click/type

-   **Grid Rows:** Clicks a row to select a vendor bill, which enables the "Pay Bills" button and opens the Context Drawer.
-   **Filter Presets:** Clicks "Due Soon", "Past Due", or "Unpaid" to filter the bills list.
-   **"Pay Bills" Button:** Clicks to initiate payment for the selected bill(s). The code shows this opens a `prompt` for a payment date.
-   **Expansion Panel Actions:**
    -   **"Record payment":** Opens a prompt to manually record a payment against the bill.
    -   **"Schedule payment":** Opens a prompt to set a future payment date.

#### 4.6.3. Their intent/motivation

-   **Primary Goal:** To manage accounts payable by tracking and paying vendor bills in a timely manner.
-   **Journeys:**
    1.  **Paying Bills:** An operator responsible for payables uses the filters ("Due Soon", "Past Due") to identify bills that need to be paid. They select one or more bills and use the "Pay Bills" action to mark them as paid.
    2.  **Investigating a Bill:** An operator needs to verify the details of a bill. They find it in the grid, open the Context Drawer, and use the "Trace" tab to see which POs and intake batches it's associated with.

#### 4.6.4. AG Grid columns

##### Vendor Bills Grid

| Field | Header Text | Width | Editable | Notes |
| :--- | :--- | :--- | :--- | :--- |
| `vendor` | vendor | 190 | No | Pinned left. |
| `billNo` | billNo | 150 | No | |
| `amount` | amount | 120 | No | Numeric. |
| `amountPaid` | amountPaid | 130 | No | Numeric. |
| `status` | status | 125 | No | |
| `dueDate` | dueDate | 180 | No | |
| `scheduledFor`| scheduledFor | 180 | No | |
| `dueReason` | dueReason | 240 (min)| No | |
| `consignmentTriggered`| consignmentTriggered| 170 | No | |

#### 4.6.5. Context Drawer behavior

When a vendor bill row is selected:
-   **Entity Type:** `vendorBill`
-   **Tabs:** Details, Trace, Payments, Relationship, History.
-   **`Details` Tab:** Shows the main information about the bill.
-   **`Trace` Tab:** Provides a lineage, showing how the bill traces back to POs, intake batches, and sales, which is crucial for auditing consignment bills.
-   **`Payments` Tab:** Shows any payments that have been applied to this bill.

#### 4.6.6. Selection Summary Bar

The `SelectionSummary` bar includes a "Pay Bills" action for bulk payment processing.

#### 4.6.7. Available filters

-   **Preset Buttons:** "Due Soon", "Past Due", "Unpaid".
-   **Free-text Input:** Standard grid filter.

#### 4.6.8. Client-side gates

-   **Write Access (`canWrite`):** All action buttons are disabled for `viewer` roles.
-   **Selection:** The "Pay Bills" button is disabled until at least one bill is selected.

#### 4.6.9. UI gaps

-   All payment-related actions ("Pay Bills", "Record payment", "Schedule payment") use simple `prompt()` dialogs. For financial actions, this is a significant UI gap and should be replaced with robust, validated forms or modals.
-   There is no "Create Vendor Bill" button. Bills are generated automatically by the system (e.g., from consignment sales). A manual creation flow could be useful for non-standard payables.

---

---

### 4.7. Fulfillment View

-   **ViewKey:** `fulfillment`
-   **URL:** `/fulfillment`

#### 4.7.1. What they see

This view is the dashboard for the warehouse/fulfillment team. It shows "pick lists", which are groups of sales order lines that have been released for picking.

-   **`OperatorGrid` for "Pick Lists":**
    -   A grid where each row represents a pick list (a collection of items to be picked for a single sales order).
    -   **Filter Presets:** "Needs Picking", "Has Alerts", "Ready to Close".

#### 4.7.2. What they click/type

-   **Grid Rows:** Clicks a pick list row to select it, which opens the Context Drawer.
-   **Filter Presets:** Clicks the preset buttons to filter the pick lists.
-   **Expansion Panel Actions:**
    -   **"Open Pick List":** Navigates to the mobile-first `/pick` view for the selected list, where the actual picking work is done.
    -   **"Print Labels":** A disabled button, indicating a future feature.
    -   **"Generate Manifest":** Triggers the creation of a shipping manifest document.
-   **Detail Grid (Fulfillment Lines):** When a pick list is expanded, a detail grid shows the individual lines to be picked. An operator can edit `actualQty`, `actualWeight`, and `bagCode` directly in this grid.
-   **Warehouse Alerts:** When a picker in the `/pick` view reports an issue (e.g., "item not found"), a new "Warehouse Alert" is created. These alerts are visible in a separate grid on this view, allowing an operator to review and resolve them.

#### 4.7.3. Their intent/motivation

-   **Primary Goal:** To manage the workflow of picking, packing, and shipping orders.
-   **Journeys:**
    1.  **Starting a Pick:** A warehouse operator starts their shift. They open this view, use the "Needs Picking" filter, select a pick list, and click "Open Pick List" to begin their work in the dedicated picking UI.
    2.  **Handling Exceptions:** A manager sees that a pick list "Has Alerts". They expand the main "Warehouse Alerts" grid, find the alert, and see the picker's note (e.g., "Only found 8 units, not 10"). They investigate and then take corrective action (e.g., adjust the order, notify sales).
    3.  **Shipping:** Once a pick is complete, an operator returns to this view, selects the "Ready to Close" pick list, and clicks "Generate Manifest" to create the shipping document.

#### 4.7.4. AG Grid columns

##### Main Pick Lists Grid

| Field | Header Text | Width | Editable | Notes |
| :--- | :--- | :--- | :--- | :--- |
| `alertCount`| Alerts | 90 | No | Pinned left. Shows a count in a pill. |
| `pickNo` | pickNo | 150 | No | Pinned left. |
| `orderNo` | orderNo | 150 | No | |
| `customer` | customer | 180 | No | |
| `status` | status | 125 | No | |
| `unitsPerBag`| unitsPerBag | 130 | No | |
| `labelFormat`| labelFormat | 120 | No | |
| `labelsPrinted`| labelsPrinted| 140 | No | |
| `manifestPath`| manifestPath| 220 (min)| No | |
| `tracking` | tracking | 160 (min)| No | |
| `lines` | lines | 90 | No | |

##### Fulfillment Lines Detail Grid

| Field | Header Text | Width | Editable | Notes |
| :--- | :--- | :--- | :--- | :--- |
| `itemName` | itemName | 180 (min) | No | Pinned left. |
| `batchCode` | batchCode | 140 | No | |
| `expectedQty`| expectedQty | 130 | No | Numeric. |
| `actualQty` | actualQty | 120 | Yes | Numeric. |
| `actualWeight`| actualWeight | 140 | Yes | Numeric. |
| `bagCode` | bagCode | 140 | Yes | |
| `status` | status | 120 | No | |

#### 4.7.5. Context Drawer behavior

When a pick list row is selected:
-   **Entity Type:** `pick`
-   **Tabs:** Relationship, Lines, Order, Bag/labels, History.
-   **`Lines` Tab:** Shows the line items to be picked.
-   **`Order` Tab:** Provides context about the sales order this pick list belongs to.

#### 4.7.6. Selection Summary Bar

The view does not define specific bulk actions for the main grid.

#### 4.7.7. Available filters

-   **Preset Buttons:** "Needs Picking", "Has Alerts", "Ready to Close".
-   **Free-text Input:** Standard grid filter.

#### 4.7.8. Client-side gates

-   **Write Access (`canWrite`):** All action buttons are disabled for `viewer` roles.
-   **`Print Labels` Button:** This button is explicitly disabled in the code, indicating it is not yet implemented.

#### 4.7.9. UI gaps

-   **"Print Labels" button is disabled.** This is a key feature for a fulfillment view that is currently missing.
-   The workflow for handling alerts is not fully self-contained in this view. An operator sees the alert but the corrective action (e.g., adjusting the sales order) likely happens in another view (`SalesView` or `OrdersView`), which could be confusing.

---

---

### 4.8. Connectors View

-   **ViewKey:** `connectors`
-   **URL:** `/connectors`

#### 4.8.1. What they see

This view appears to be a log or queue for incoming requests from external systems (e.g., a website, an email parser).

-   **`OperatorGrid` for "Incoming Requests":**
    -   A grid listing each request.
    -   **Filter Presets:** "Needs Routing", "Held for Match".

#### 4.8.2. What they click/type

-   **Grid Rows:** Clicks a row to open the Context Drawer and investigate the request.
-   **Filter Presets:** Clicks the presets to filter the request list.
-   **Expansion Panel Actions:**
    -   **"Route to Sales":** Converts the request into a sales lead or draft.
    -   **"Route to Procurement":** Converts the request into a procurement need.
    -   **"Dismiss":** Discards the request.

#### 4.8.3. Their intent/motivation

-   **Primary Goal:** To triage and route incoming requests from external sources into actionable items within the TERP system.
-   **Journey:** An operator checks this view periodically. They use the "Needs Routing" filter to find new requests. For each one, they read the details in the grid and the Context Drawer. If it's a customer asking for a product, they click "Route to Sales". If it's a signal about a product they should source, they click "Route to Procurement". If it's spam or irrelevant, they "Dismiss" it.

#### 4.8.4. AG Grid columns

##### Incoming Requests Grid

| Field | Header Text | Width | Editable | Notes |
| :--- | :--- | :--- | :--- | :--- |
| `source` | From | 170 | No | Pinned left. Formats the source (e.g., 'web-form'). |
| `requestType`| Request | 170 | No | Formats the type (e.g., 'customer-need'). |
| `customer` | customer | 180 | No | |
| `status` | status | 125 | No | |
| `operatorNotes`| Notes | 220 (min)| No | |
| `createdAt` | createdAt | 180 | No | |

#### 4.8.5. Context Drawer behavior

When a request row is selected:
-   **Entity Type:** `connector`
-   **Tabs:** Relationship, Request, Source, History.
-   **`Request` Tab:** Shows the full content or payload of the incoming request.
-   **`Source` Tab:** Provides details about where the request originated.

#### 4.8.6. Selection Summary Bar

Bulk actions are not defined for this view. Triage is typically done one request at a time.

#### 4.8.7. Available filters

-   **Preset Buttons:** "Needs Routing", "Held for Match".
-   **Free-text Input:** Standard grid filter.

#### 4.8.8. Client-side gates

-   **Write Access (`canWrite`):** All action buttons are disabled for `viewer` roles.

#### 4.8.9. UI gaps

-   The view is very simple. More advanced routing options or automatic rule-based routing could be a future enhancement.
-   There's no visible way to create a request from within the UI; it assumes they all come from external systems.

---

---

### 4.9. Closeout View

-   **ViewKey:** `closeout`
-   **URL:** `/closeout`

#### 4.9.1. What they see

This view is for managing the end-of-period financial closeout process. It lists each closeout period and its status.

-   **`OperatorGrid` for "Period Closeouts":**
    -   A grid where each row represents a financial period (e.g., a month).
    -   The grid shows the status of the period (`open`, `locked`, `archived`) and links to the generated artifact files (CSV, JSONL, PDF).

#### 4.9.2. What they click/type

-   **Grid Rows:** Clicks a row to select a period and review its details in the Context Drawer.
-   **Expansion Panel Actions:**
    -   **"Run pre-flight checks":** Validates that a period is ready to be closed.
    -   **"Lock period":** Prevents any further transactions from being posted to that period.
    -   **"Archive period":** Generates the final financial reports and artifacts for the period.
    -   **"Retry archive":** Re-runs the archive process if it previously failed.

#### 4.9.3. Their intent/motivation

-   **Primary Goal:** To formally close financial periods and generate archival reports for accounting and compliance.
-   **Journey:** At the end of a month, an accounting operator comes to this view. They select the period that just ended. First, they "Run pre-flight checks" to ensure there are no outstanding issues. If it's all clear, they "Lock period" to prevent new data. Finally, they "Archive period" to generate the reports. If the archive fails for any reason, they investigate, fix the problem, and then use "Retry archive".

#### 4.9.4. AG Grid columns

##### Period Closeouts Grid

| Field | Header Text | Width | Editable | Notes |
| :--- | :--- | :--- | :--- | :--- |
| `period` | period | 100 | No | Pinned left. |
| `status` | status | 125 | No | |
| `controlTotals`| controlTotals | 220 (min)| No | |
| `csvPath` | CSV | 180 (min)| No | |
| `jsonlPath` | JSONL | 180 (min)| No | |
| `pdfPath` | PDF | 180 (min)| No | |
| `createdAt` | createdAt | 180 | No | |

#### 4.9.5. Context Drawer behavior

When a period row is selected:
-   **Entity Type:** `closeout`
-   **Tabs:** Control totals, Open work, Artifacts.
-   **`Control totals` Tab:** Shows the key financial totals for the period.
-   **`Open work` Tab:** Lists any transactions or items that are still open and preventing the period from being closed.
-   **`Artifacts` Tab:** Provides links to download the generated report files.

#### 4.9.6. Selection Summary Bar

This view does not use a selection summary bar; actions are performed on a single period at a time.

#### 4.9.7. Available filters

-   **Free-text Input:** Standard grid filter. No preset filters are defined.

#### 4.9.8. Client-side gates

-   **Write Access (`canWrite`):** All action buttons are disabled for `viewer` roles.
-   **Period Status:** The available actions in the expansion panel are dependent on the period's status. You can only "Lock" an `open` period, and you can only "Archive" a `locked` period.

#### 4.9.9. UI gaps

-   The view assumes a high level of user knowledge about the closeout process. More guidance, checklists, or clearer status indicators could improve the user experience.
-   Error messages from failed pre-flight checks or archives are likely shown only as toasts. A more persistent and detailed error report within the UI would be helpful for troubleshooting.

---

---

## 5. Matchmaking View (`MatchmakingView.tsx`)

### 5.1. What screen/view the operator is on

-   **ViewKey:** `matchmaking`
-   **URL:** `/matchmaking`

### 5.2. What they see

This view is a sophisticated workspace for matching customer demand (Needs) with vendor supply (Stock). It also provides proactive opportunities based on sales history.

-   **Settings Panel:** An expandable `WorkspacePanel` at the top titled "⚙ Matchmaking Settings". It contains various sliders and checkboxes to tune the matching algorithm.
-   **Matchmaking Entry Panel:** A `WorkspacePanel` with two forms for manual entry:
    -   **Customer Need Form:** Fields for Customer, Need (product), Category, Qty, Target $, and By (date).
    -   **Vendor Stock Form:** Fields for Vendor, Stock (product), Category, Qty, Ask $, and Date.
-   **Deterministic Matches Grid:** An `OperatorGrid` showing direct matches found by the system based on the defined rules.
-   **Inventory to Move Grid:** An `OperatorGrid` showing products currently in stock that a specific customer is likely to buy, based on their purchase history or open needs.
-   **Gaps to Fill Grid:** An `OperatorGrid` showing product categories where inventory is low but demand (based on history) is high, suggesting products the operator should source.
-   **Customer Needs Grid:** A grid listing all manually entered customer needs.
-   **Vendor Stock Grid:** A grid listing all manually entered vendor stock availability.

### 5.3. What they click/type

-   **Settings Panel:**
    -   Adjusts sliders for "Show matches scoring at least X pts" and "Add to work queue at X pts".
    -   Changes dropdowns for "Look back X days" and "Flag as repeat after X purchases".
    -   Toggles checkboxes to control where matchmaking signals appear in other grids.
-   **Matchmaking Entry Forms:**
    -   Selects a Customer or Vendor from dropdowns.
    -   Types product names, quantities, and prices.
    -   Selects categories and dates.
    -   Clicks "Add Need" or "Add Stock" to submit the form.
-   **Deterministic Matches Grid:**
    -   Selects one or more matches.
    -   Clicks **"Accept"** or **"Dismiss"** in the selection summary bar to action the selected matches.
    -   Expands a row to see the "Match Reasoning" and access row-level "Accept", "Dismiss", or "Reopen" buttons.
-   **Inventory to Move / Gaps to Fill Grids:**
    -   Clicks the **"Note contact"** button on a row to log that they have reached out to the customer or vendor about this opportunity.
-   **Needs/Stock Grids:** Double-clicks cells to edit existing need or stock entries.

### 5.4. Their intent/motivation

-   **Primary Goal:** To proactively connect supply with demand, both for explicit requests and for predicted opportunities, in order to drive sales and procurement.
-   **Journeys:**
    1.  **Fulfilling an Explicit Need:** A customer calls asking for a product. The operator enters it as a "Customer Need". They then check the "Deterministic Matches" grid. If a good match appears, they "Accept" it, which likely triggers a sales draft. If not, the need is logged for future matching.
    2.  **Proactive Sales:** A sales operator reviews the "Inventory to Move" grid. They see that "Customer A" has a "Both" signal (history + open need) for a product they have in stock. They call the customer to make the sale and then click "Note contact".
    3.  **Strategic Sourcing:** A procurement operator reviews the "Gaps to Fill" grid. They see they are "Empty" on a popular category. The grid also shows a "Signal" that a specific vendor has posted supply. They contact the vendor to create a PO and click "Note contact".
    4.  **Tuning the Engine:** A manager feels the match quality is too low. They open the "Settings" panel and increase the "Show matches scoring at least" threshold to reduce noise.

### 5.5. AG Grid columns

#### Deterministic Matches Grid

| Field | Header Text | Width | Editable | Notes |
| :--- | :--- | :--- | :--- | :--- |
| `score` | score | 100 | No | Pinned left. Shows a "Low" confidence pill if < 35. |
| `customer` | customer | 160 | No | |
| `needProduct`| Request | 170 (min)| No | |
| `vendor` | vendor | 160 | No | |
| `vendorProduct`| Stock | 170 (min)| No | |
| *Calculated* | Price fit | 150 | No | Shows "$X ask / $Y target ✓/✗". |
| *Calculated* | Qty fit | 140 | No | Shows "X avail / Y need ✓/✗". |
| `status` | status | 115 | No | |

#### Inventory to Move Grid

| Field | Header Text | Width | Editable | Notes |
| :--- | :--- | :--- | :--- | :--- |
| `product` | product | 180 (min)| No | Pinned left. |
| `category` | category | 120 | No | |
| `onHand` | On hand | 110 | No | Numeric. |
| `customer` | customer | 160 (min)| No | |
| `signal` | Signal | 130 | No | Renders a colored pill: "Both", "Posted need", "History". |
| `lastActivity`| Last activity | 140 | No | Date formatted. |
| *Action* | Action | 130 | No | Contains the "Note contact" button. |

#### Gaps to Fill Grid

| Field | Header Text | Width | Editable | Notes |
| :--- | :--- | :--- | :--- | :--- |
| `category` | category | 150 (min)| No | Pinned left. |
| `onHand` | On hand | 110 | No | Numeric. |
| `gapLevel` | Gap | 100 | No | Renders a pill: "Empty" (red) or "Low" (amber). |
| `vendor` | vendor | 160 (min)| No | |
| `signal` | Signal | 130 | No | Renders a pill: "Both", "Posted supply", "History". |
| `lastActivity`| Last activity | 140 | No | Date formatted. |
| `postedQty`| Posted qty | 110 | No | Numeric. |
| *Action* | Action | 130 | No | Contains the "Note contact" button. |

### 5.6. Context Drawer behavior

This view does not appear to use the main `ContextDrawer`. It is a self-contained workspace.

### 5.7. Selection Summary Bar

Used on the "Deterministic Matches" grid for bulk "Accept" and "Dismiss" actions.

### 5.8. Client-side gates

-   **Write Access (`canWrite`):** The entry forms and all action buttons ("Accept", "Dismiss", "Note contact") are disabled for `viewer` roles.
-   **Manager/Owner Access (`canManageSettings`):** The entire "Matchmaking Settings" panel content is disabled for roles other than `manager` or `owner`.
-   **Form Validation:** The "Add Need" and "Add Stock" buttons are disabled until the required fields (customer/vendor, product, category, qty) are filled.

### 5.9. UI gaps

-   The "Settings" panel is complex and could benefit from tooltips or more detailed explanations for what each setting does. A `details` element provides some information on scoring, but it's hidden by default.
-   The "Accept" action is not described. It's unclear if it creates a draft sales order, sends a notification, or does something else. This would be a critical piece of information for the user.

---

---

## 6. Credit Review View (`CreditReviewView.tsx`)

### 6.1. What screen/view the operator is on

-   **ViewKey:** `credit-review`
-   **URL:** `/credit-review`

### 6.2. What they see

This view is a specialized dashboard for managers and owners to review and manage customer credit limits, especially where manual overrides diverge from the credit engine's recommendations.

-   **Shadow Mode Banner:** A banner indicating if the credit engine is running in "shadow mode".
-   **Header:**
    -   Title: "Credit Review".
    -   **Sort Dropdown:** Options for "Days since review", "Delta %", "Dollar impact".
    -   `CreditQueueHealthWidget`: A component showing an overview of credit queue health.
    -   **"Divergence report" button:** Toggles the `CreditDivergencePanel`.
-   **Filter Tabs:** A row of buttons to filter the queue: "Stale manual", "Engine disabled", "Near snooze cap". Each tab shows a count of items in that queue.
-   **`CreditDivergencePanel` (when open):** A panel showing a report on the divergence between manual and engine-recommended credit limits.
-   **Main Table:** A table (not an `OperatorGrid`) listing customers that match the selected filter tab, with columns detailing their credit status.

### 6.3. What they click/type

-   **Sort Dropdown:** Selects a new sort order for the customer list.
-   **Filter Tabs:** Clicks a tab to switch between different credit review queues.
-   **"Divergence report" Button:** Toggles the visibility of the divergence panel.
-   **In the Main Table:**
    -   **"Open profile" Button:** Clicks to open the **Context Drawer** for that customer, focused on the "Credit" tab, allowing for detailed investigation.
    -   **"Revert to engine" Button:** (Visible for `manual` source limits) Clicks to immediately revert the customer's credit limit to the engine's recommendation.
    -   **"Snooze 60 days" Button:** (Visible in "Stale manual" queue) Clicks to dismiss the review reminder for this customer for 60 days.
    -   **"Enable engine" Button:** (Visible in "Engine disabled" queue) Clicks to re-enable the credit engine for this customer.

### 6.4. Their intent/motivation

-   **Primary Goal:** For managers/owners to maintain a healthy credit system by reviewing exceptions, overrides, and stale data, ensuring the company's financial risk is managed.
-   **Journeys:**
    1.  **Reviewing Stale Overrides:** A manager starts their review by clicking the "Stale manual" tab. They sort by "Dollar impact" to see the highest-risk customers first. For each customer, they click "Open profile" to review their payment history and recent activity. They then decide whether to "Revert to engine" or "Snooze 60 days" if they believe the manual override is still justified.
    2.  **Auditing Disabled Engines:** An owner wants to know why some customers aren't being managed by the credit engine. They click the "Engine disabled" tab, review the reasons, and may choose to "Enable engine" for customers where the disable reason is no longer valid.

### 6.5. AG Grid columns

This view uses a standard HTML `<table>`, not an `OperatorGrid`.

| Header | Content Source |
| :--- | :--- |
| Customer | `row.customerName` |
| Limit | `row.creditLimit` (formatted) |
| Engine Rec | `row.engineRecommendation` (formatted) |
| Source | `row.source` |
| Days since review | `row.daysSinceReview` |
| Days to snooze cap | `row.daysToSnoozeCap` |
| Manual reason | `row.manualReason` |
| Engine disabled reason | `row.engineDisabledReason` |
| Actions | Set of conditional buttons (Open profile, Revert, etc.) |

### 6.6. Context Drawer behavior

When "Open profile" is clicked for a customer:
-   **Entity Type:** `customer`
-   **ViewKey set to:** `credit-review`
-   **Action:** The drawer is opened directly, likely focusing on the "Credit" tab (`CustomerCreditPanel`) for immediate, detailed review of the customer's credit situation.

### 6.7. Selection Summary Bar

Not applicable, as this view does not use a selectable grid. Actions are performed per-row.

### 6.8. Available filters

The primary method of filtering is via the main filter tabs: "Stale manual", "Engine disabled", "Near snooze cap". There is no free-text search.

### 6.9. Client-side gates

-   **Role Access:** The entire view is gated and only visible to `manager` or `owner` roles.
-   **"Divergence report" and "Enable engine" buttons:** These are further restricted and only visible to the `owner` role.
-   **Conditional Actions:** The action buttons on each row ("Revert to engine", "Snooze", "Enable engine") are shown conditionally based on which filter tab is active and the data for that specific customer.

### 6.10. UI gaps

-   The view uses a plain `<table>`, which lacks the powerful sorting, filtering, and column management features of `OperatorGrid`. As the number of customers grows, this could become a limitation.
-   There are no bulk actions. A manager might want to snooze multiple stale reminders at once, but they must do it one by one.

---

---

## 7. Pick View (`PickView.tsx`)

### 7.1. What screen/view the operator is on

-   **ViewKey:** `pick`
-   **URL:** `/pick`

### 7.2. What they see

This is a specialized, mobile-first interface designed for warehouse staff to perform the physical picking of items for an order. It's a multi-screen wizard flow, not a dashboard. The operator moves through a sequence of screens.

1.  **Queue Screen (`QueueScreen`):**
    -   The initial screen.
    -   A simple list of all open pick lists, showing Pick #, Customer, and item counts.
    -   A "Refresh" button.
2.  **Pick List Screen (`PickListScreen`):**
    -   Shows all line items for the selected pick list.
    -   Each line shows Item Name, Batch Code, and Expected Qty. Picked items are visually distinct (e.g., greyed out or have a checkmark).
    -   A "Back" button to return to the queue.
    -   A "Complete Order" button appears once all lines are picked.
3.  **Pick Line Screen (`PickLineScreen`):**
    -   The main "work" screen, focused on a single item.
    -   Displays large text for Item Name, Batch Code, and Expected Qty.
    -   Input fields for "Actual Qty", "Actual Weight", and "Bag Code".
    -   A large "Confirm Pick" button.
    -   Buttons to report an issue: "Item not found", "Qty mismatch", "Damaged", "Other".
    -   **Interrupt Overlay:** If an operator on another screen flags this line (e.g., recalls it), a modal overlay appears telling the picker what happened (e.g., "Line has been recalled").

### 7.3. What they click/type

1.  **On Queue Screen:** Taps a pick list to start working on it, which navigates them to the Pick List Screen.
2.  **On Pick List Screen:** Taps a line item to start picking it, navigating to the Pick Line Screen.
3.  **On Pick Line Screen:**
    -   Physically finds the item in the warehouse.
    -   Enters the **Actual Qty** they picked.
    -   Optionally enters **Actual Weight** and a **Bag Code**.
    -   Taps **"Confirm Pick"**. This saves the data and automatically navigates them to the next unpicked item on the list (or back to the Pick List Screen if all items are done).
    -   **If there's a problem:** Instead of confirming, they tap one of the issue buttons (e.g., "Qty mismatch"). This opens a prompt or dialog where they can enter details about the problem, creating a "Warehouse Alert" for a manager to review in the `FulfillmentView`.

### 7.4. Their intent/motivation

-   **Primary Goal:** To accurately and efficiently pick items from the warehouse shelves to fulfill a customer order, while easily reporting any discrepancies found during the physical process.
-   **Journey:** A picker starts their work. They open the `/pick` URL on a tablet. They select the top pick list from the queue. They go to the first item's location, tap on it in the UI to open the `PickLineScreen`. They count the items, enter the quantity, and tap "Confirm Pick". The UI automatically advances to the next item. They repeat this until all items are picked. If they can't find an item, they tap "Item not found", type a note, and the UI advances, flagging the item for review. Once all lines are handled, they return to the `PickListScreen` and tap "Complete Order".

### 7.5. AG Grid columns

This view does not use `OperatorGrid`. It uses custom list components (`QueueScreen`, `PickListScreen`) tailored for a mobile-first, sequential workflow.

### 7.6. Context Drawer behavior

Not applicable. This is a full-screen, focused task UI and does not use the `ContextDrawer`.

### 7.7. Selection Summary Bar

Not applicable.

### 7.8. Available filters

The `QueueScreen` does not have filters. It presents the work in the order it was released from sales.

### 7.9. Client-side gates

-   **Work Loop Guard (`usePickWorkLoopGuard`):** The entire view is protected by a guard. If a user who is not assigned the `warehouse` work loop tries to access `/pick`, they are redirected away.
-   **"Complete Order" Button:** This button only becomes visible on the `PickListScreen` after all lines have been picked (status is `packed` or `cancelled`).
-   **Interrupts:** The UI flow is interrupted by an overlay if an alert is created for the line being worked on, or if the line is recalled by a sales operator.

### 7.10. UI gaps

-   The UI for reporting issues ("Item not found", etc.) is not fully detailed in the view code but likely involves simple prompts. More structured forms could help gather better data about picking issues.
-   The view is highly sequential. There is no easy way for a picker to jump between items out of order, which might be necessary in a real-world warehouse depending on physical layout.

---

---

## 8. Processors View (`ProcessorsView.tsx`)

### 8.1. What screen/view the operator is on

-   **ViewKey:** `processors`
-   **URL:** `/processors`

### 8.2. What they see

This view is for managing payment processors (e.g., specific credit card processors, check processing services).

-   **Header:**
    -   Title: "Payment Processors".
    -   An "X active" pill showing the count of active processors.
    -   **"New Processor" button.**
-   **`OperatorGrid` for "Payment Processors":** A grid listing all configured payment processors.
-   **`ProcessorDetailPanel`:** A panel that appears (likely sliding in or as a modal) when a processor's details are opened. This panel is not fully detailed in the view but seems to contain more in-depth information.

### 8.3. What they click/type

-   **"New Processor" Button:** Clicks this to start a series of `prompt()` dialogs to create a new processor. The prompts ask for:
    1.  Processor name
    2.  Processor type (crypto/check/wire)
    3.  Fee type (percentage/fixed/hybrid)
    4.  Fee percentage (if applicable)
    5.  Fixed fee amount (if applicable)
    6.  Default user split %
-   **Grid Rows:** Clicks a row to select it.
-   **Name Field in Grid:** If a processor is linked to a contact, the name is a button that navigates to that contact's detail page (`/contacts/:id`).
-   **Selection Summary Bar Actions:** When a processor is selected, an "Open Details" button appears. Clicking it opens the `ProcessorDetailPanel` for that processor.

### 8.4. Their intent/motivation

-   **Primary Goal:** To configure and monitor the fee structures and performance of different payment processors used by the business.
-   **Journey:** An administrator needs to add a new wire transfer option. They navigate to this view, click "New Processor", and enter the details through the prompts. Later, they might want to review how much in fees a specific processor has generated. They find it in the grid and open the details panel to see the financial summaries.

### 8.5. AG Grid columns

##### Payment Processors Grid

| Field | Header Text | Width | Editable | Notes |
| :--- | :--- | :--- | :--- | :--- |
| `name` | Processor Name | 200 | No | Pinned left. Renders as a link if `contactId` exists. |
| `processorType`| Type | 120 | No | |
| `feeFormula` | Fee Formula | 180 | No | Calculated value showing fee structure (e.g., "3.5%", "$0.30"). |
| `defaultSplit` | Default Split | 180 | No | Calculated value showing fee split (e.g., "User 25% / Proc 75%"). |
| `totalFeesProcessed`| Total Fees | 130 | No | Numeric. |
| `userFeesCollectible`| User Collectible | 150 | No | Numeric. |
| `userFeesCollected`| User Collected | 150 | No | Numeric. |
| `processorFeesUnpaid`| Proc Unpaid | 130 | No | Numeric. |
| `active` | active | 100 | No | |
| `createdAt` | createdAt | 180 | No | |

### 8.6. Context Drawer behavior

This view does not use the main `ContextDrawer`. It has its own detail panel, `ProcessorDetailPanel`, which is opened via the selection summary bar.

### 8.7. Selection Summary Bar

When one processor is selected, the bar shows an "Open Details" button.

### 8.8. Available filters

No preset filters are defined. Only the standard free-text grid filter is available.

### 8.9. Client-side gates

-   The `handleCreateProcessor` function is not explicitly role-gated in the component, but the underlying `createPaymentProcessor` command is likely protected on the backend.

### 8.10. UI gaps

-   **Creation via `prompt()`:** Creating a new processor through a series of six `prompt` dialogs is a major UI gap. This should be a proper form in a modal or a dedicated creation view with validation and better user experience.
-   **Editing:** There is no UI for editing an existing processor. The operator can only create new ones or view details. This seems like a significant omission.

---

---

## 9. Referees View (`RefereesView.tsx`)

### 9.1. What screen/view the operator is on

-   **ViewKey:** `referees`
-   **URL:** `/referees`

### 9.2. What they see

This view is for managing referees—individuals or entities who earn commission for referring business.

-   **Header:**
    -   Title: "Referees".
    -   **"New Referee" button.**
-   **`OperatorGrid` for "Referees":** A grid listing all referees and their financial summaries.
-   **Dialogs/Modals:** This view can launch several different modals that overlay the screen:
    -   `RefereeDialog`: A form for editing the details of an existing referee.
    -   `RefereeRelationshipDialog`: A form for linking a referee to a customer or vendor and defining their commission structure.
    -   `RefereeDetailPanel`: A panel showing a deep dive into a referee's performance and financials.

### 9.3. What they click/type

-   **"New Referee" Button:** Clicks this to trigger a series of `prompt()` dialogs to quickly create a new referee (asks for Name, Email, Phone).
-   **Grid Rows:** Clicks a row to select a referee, which activates the selection summary bar actions.
-   **Name Field in Grid:** If a referee is linked to a contact, the name is a button that navigates to that contact's detail page (`/contacts/:id`).
-   **Selection Summary Bar Actions:** When a referee is selected:
    -   **"Edit Referee":** Clicks to open the `RefereeDialog` modal with the selected referee's data pre-filled for editing.
    -   **"Add Relationship":** Clicks to open the `RefereeRelationshipDialog` modal, allowing the operator to link this referee to a new customer or vendor.
    -   **"Open Details":** Clicks to open the `RefereeDetailPanel` for the selected referee.

### 9.4. Their intent/motivation

-   **Primary Goal:** To manage the referee program, including onboarding new referees, defining their commission relationships, and tracking their earnings.
-   **Journeys:**
    1.  **Onboarding a New Referee:** A new referee joins the program. An operator clicks "New Referee" and enters their basic details. Then, they select the new referee, click "Add Relationship", and configure their first commission deal (e.g., "2% of all sales from Customer X").
    2.  **Editing Referee Details:** A referee updates their payment information. The operator finds them in the grid, clicks "Edit Referee", and updates the details in the dialog.
    3.  **Performance Review:** A manager wants to see how a referee is performing. They find the referee and click "Open Details" to see their lifetime earnings, active relationships, and recent payouts.

### 9.5. AG Grid columns

##### Referees Grid

| Field | Header Text | Width | Editable | Notes |
| :--- | :--- | :--- | :--- | :--- |
| `name` | Referee Name | 200 | No | Pinned left. Renders as a link if `contactId` exists. |
| `email` | email | 200 | No | |
| `phone` | phone | 150 | No | |
| `balance` | Balance | 130 | No | Numeric. |
| `lifetimeEarned`| Lifetime Earned| 150 | No | Numeric. |
| `relationshipsCount`| Relationships| 140 | No | Numeric. |
| `paymentMethod`| Payment Method| 150 | No | |
| `active` | active | 100 | No | |
| `notes` | notes | 250 (min)| Yes | |
| `createdAt` | createdAt | 180 | No | |

### 9.6. Context Drawer behavior

This view does not use the main `ContextDrawer`. It uses a combination of its own modals (`RefereeDialog`, `RefereeRelationshipDialog`) and a dedicated detail panel (`RefereeDetailPanel`) to show contextual information and forms.

### 9.7. Selection Summary Bar

The bar is a key part of the workflow, providing the main entry points for editing, adding relationships, and viewing details for the selected referee.

### 9.8. Available filters

No preset filters are defined. Only the standard free-text grid filter is available.

### 9.9. Client-side gates

-   The action buttons in the selection summary bar are disabled until a row is selected.
-   Command execution (`createReferee`) is likely role-gated on the backend.

### 9.10. UI gaps

-   **Creation via `prompt()`:** Like the Processors view, the primary "New Referee" button uses a series of `prompt()` dialogs, which is a poor UI for data entry. However, the `RefereeDialog` exists for editing, suggesting it could be repurposed for creation to provide a better experience.
-   The distinction between the "Edit Referee" dialog and the "Open Details" panel could be confusing. One is for changing data, the other for viewing it, but their content may overlap significantly.

---

---

## 10. Contacts View (`ContactsView.tsx`)

### 10.1. What screen/view the operator is on

-   **ViewKey:** `contacts`
-   **URL:** `/contacts`

### 10.2. What they see

This view serves as a master directory or "phonebook" for all entities the business interacts with, including customers, vendors, referees, etc.

-   **Header/Control Band:**
    -   Title: "Contacts", with a count of displayed contacts.
    -   **Search Input:** A text box for searching by name or email.
    -   **Role Filter Buttons:** A series of toggle buttons for each role ("customer", "vendor", "referee", etc.).
    -   **"New Contact" button.**
-   **`OperatorGrid` for "All Contacts":** A grid listing all contacts that match the current search and filter criteria.
-   **`ContactCreateModal`:** A modal dialog that appears when "New Contact" is clicked, containing a form to create a new contact.

### 10.3. What they click/type

-   **Search Input:** Types a name or email to filter the contact list.
-   **Role Filter Buttons:** Clicks one or more role buttons to narrow down the list (e.g., clicking "vendor" and "referee" shows contacts that are either a vendor or a referee).
-   **"New Contact" Button:** Clicks to open the `ContactCreateModal`.
-   **In `ContactCreateModal`:** Fills out the form with the new contact's details and clicks "Save".
-   **Name Field in Grid:** The `name` column is rendered as a button. Clicking it navigates the user to the detail page for that specific contact (e.g., `/contacts/123-abc`).

### 10.4. Their intent/motivation

-   **Primary Goal:** To find, manage, and create contact information for any person or business the company works with.
-   **Journeys:**
    1.  **Finding a Contact:** An operator needs to find the phone number for a specific vendor. They navigate to this view, click the "vendor" role filter, and type the vendor's name into the search box to quickly find their record.
    2.  **Creating a New Contact:** The company starts working with a new contractor. An operator clicks "New Contact", fills in their information in the modal, assigns them the "contractor" role, and saves.
    3.  **Viewing a Contact's Full Profile:** An operator wants to see all information related to a specific customer. They find the customer in the grid and click their name to navigate to the dedicated contact detail view, which provides a 360-degree view of that entity.

### 10.5. AG Grid columns

##### All Contacts Grid

| Field | Header Text | Flex | Notes |
| :--- | :--- | :--- | :--- |
| `name` | Name | 2 | Renders as a button that navigates to the contact's detail page. |
| `roles` | Roles | 2 | Calculated value that concatenates all roles (Customer, Vendor, etc.). |
| `companyName`| Company | 2 | |
| `phone` | Phone | 1 | |
| `email` | Email | 2 | |
| `customerBalance`| Balance | 1 | Formatted as money. |

### 10.6. Context Drawer behavior

This view does not use the main `ContextDrawer`. Interaction is focused on filtering, searching, creating, and navigating to dedicated contact detail pages.

### 10.7. Selection Summary Bar

Not applicable. The grid does not seem to have selection-based actions.

### 10.8. Available filters

-   **Role Filter Buttons:** "customer", "vendor", "referee", "contractor", "employee", "processor". These can be combined.
-   **Free-text Search:** A dedicated search input filters by name or email.

### 10.9. Client-side gates

-   The ability to create a new contact via the modal is likely gated by user role on the backend.

### 10.10. UI gaps

-   **No Editing:** There is no UI in this master view to quickly edit a contact. The operator must navigate to the contact's detail page to make changes. An inline edit or a quick-edit modal could be a useful addition.
-   **No Deleting/Archiving:** There is no UI for archiving or deleting contacts from this master list.
-   **No Merging:** The code contains a `// TODO` comment indicating that a contact merge/deduplication feature is planned but not yet implemented.

---

---

## 11. Media View (`MediaView.tsx`)

### 11.1. What screen/view the operator is on

-   **ViewKey:** `photography`
-   **URL:** `/photography`

### 11.2. What they see

This view is a dedicated queue for the photography and media team. It shows all inventory batches and their current media status.

-   **Header:**
    -   Title: "Photography Queue".
    -   An "X batches" pill showing the total count of items in the queue.
-   **Two-Column Layout:**
    -   **Left Column:** An `OperatorGrid` listing all batches, with a focus on their media status.
    -   **Right Column:** The `MediaBatchDrawer`. This is a persistent panel (not a modal or fly-out) that shows the media details for the currently selected batch from the grid.

### 11.3. What they click/type

-   **Grid Rows:** Clicks a batch row in the grid. This does not open the main `ContextDrawer`, but instead populates the `MediaBatchDrawer` on the right with that batch's media information.
-   **In `MediaBatchDrawer`:**
    -   The operator sees existing photos and videos for the selected batch.
    -   They can likely upload new media files (via a drag-and-drop zone or file input, though the specifics are in the `MediaBatchDrawer` component).
    -   They can set a primary photo/video.
    -   They can toggle media between "draft" and "published" states.
    -   They can delete media files.

### 11.4. Their intent/motivation

-   **Primary Goal:** To manage the photography workflow for all inventory, ensuring that products have high-quality, customer-ready photos and videos before being shown in catalogs or on websites.
-   **Journey:** A photographer has just finished shooting a new batch of product. They navigate to this view and find the batch in the grid. They click it to load it in the `MediaBatchDrawer`. They drag the new photos into the upload zone. They select the best one and mark it as the "primary photo". Finally, they publish the new photos, which updates the batch's media status and makes the images available to the rest of the system.

### 11.5. AG Grid columns

##### Photography Queue Grid

| Field | Header Text | Width | Editable | Notes |
| :--- | :--- | :--- | :--- | :--- |
| `batchCode` | Batch Code | 160 | No | Pinned left. |
| `name` | Batch Name | 200 | No | |
| `mediaUpdatedAt`| Media Updated| 160 | No | |
| `publishedMediaCount`| Published | 100 | No | Numeric. |
| `draftMediaCount`| Drafts | 100 | No | Numeric. |
| `mediaStatus`| Media status | 130 | No | Calculated value: "No media", "Has media", "Complete". |
| `hasPrimaryPhoto`| Photo? | 90 | No | "Yes" or "No". |
| `hasPrimaryVideo`| Video? | 90 | No | "Yes" or "No". |
| `createdAt` | Created | 160 | No | |

### 11.6. Context Drawer behavior

This view does not use the main `ContextDrawer`. It uses a dedicated, always-visible `MediaBatchDrawer` as its context panel.

### 11.7. Selection Summary Bar

Not applicable. Actions are performed on a single selected batch within the `MediaBatchDrawer`.

### 11.8. Available filters

The grid has a standard free-text filter, and the `mediaStatus` column has a set filter, allowing the operator to quickly find batches with "No media", for example. There are no preset buttons.

### 11.9. Client-side gates

-   The actions within `MediaBatchDrawer` (upload, publish, delete) are likely gated by user role.

### 11.10. UI gaps

-   The workflow is very batch-focused. There's no clear way to see media at a higher level (e.g., all media for a product, regardless of batch) or to manage a central library of reusable media assets.
-   There are no bulk actions. An operator cannot, for example, publish all draft media for multiple selected batches at once.

---
