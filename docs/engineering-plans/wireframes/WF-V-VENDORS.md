## Wireframe: WF-V-VENDORS — VendorsView

### Layout (ASCII)

```
┌─View Header: "Vendors"                     [+ Add Vendor ▾] [⚙ Settings]──┐
├─FilterToolbar──────────────────────────────────────────────────────────────┤
│  [▾ Data views] │ [▾ Keyword ▾] [▾ Terms ▾] [▾ Status ▾] [▾ Category ▾]   │
│                 │ [▾ Sort ▾] [⬇ Export]                                   │
│  [✕ status:active] [✕ terms:net-30] [✕ category:produce]                  │
├─GridSummaryStrip───────────────────────────────────────────────────────────┤
│  [🏭 Total: 28 vendors · 24 Active · $142,800 Total AP · 5 Open Bills]    │
├─ViewTabBar─────────────────────────────────────────────────────────────────┤
│  [All (28)] [Active (24)] [Inactive (4)]                                    │
├─AG Grid Table──────────────────────────────────────────────────────────────┤
│  ┌──────┬─────────┬──────────────┬─────────────────┬───────┬──────────┬──┐│
│  │  ☐   │ ID      │ Name         │ Contact         │Terms  │Open Bills│PO│•│││
│  ├──────┼─────────┼──────────────┼─────────────────┼───────┼──────────┼──┤│
│  │  ☐   │ VND-112 │ Dole Fresh   │ sales@dole.com  │Net 30 │ $28,400  │6/│⋮││
│  │  ☑   │ VND-111 │ Chiquita     │ orders@chiq.com │Net 15 │ $12,200  │6/│⋮││
│  │  ☑   │ VND-110 │ Del Monte    │ ap@delmonte.com │Net 30 │        $0│6/│⋮││
│  │  ☐   │ VND-109 │ Sunkist      │ citrus@sunkist. │Net 45 │  $8,800  │6/│⋮││
│  │  ☐   │ VND-108 │ Driscoll's   │ berries@drisco. │Due on │ $15,600  │6/│⋮││
│  │  ☑   │ VND-107 │ Taylor Farms │ greens@taylor.. │Net 30 │  $4,200  │6/│⋮││
│  │  ☐   │ VND-106 │ Fresh Express│ orders@freshx.. │Net 15 │        $0│3/│⋮││
│  └──────┴─────────┴──────────────┴─────────────────┴───────┴──────────┴──┘│
├─BulkActionBar (hidden until selection)─────────────────────────────────────┤
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │ 3 selected · $16,400 AP   [📧 Email] [🏷 Tag] [More ▾]              │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
├─DetailSlideover (right side, 420px, when row clicked)──────────────────────┤
│  ┌───────────────────────────┐                                              │
│  │ VND-111 · Chiquita        │  ◀ Collapse                                 │
│  ├───────────────────────────┤                                              │
│  │ [Profile] [POs]           │                                              │
│  │ [Invoices] [History]      │                                              │
│  ├───────────────────────────┤                                              │
│  │ Vendor Profile            │                                              │
│  │ ┌───────────────────────┐ │                                              │
│  │ │ Company   Chiquita    │ │                                              │
│  │ │ Contact   Maria Gomez │ │                                              │
│  │ │ Email     orders@chiq │ │                                              │
│  │ │ Phone     (555) 456.. │ │                                              │
│  │ │ Terms     Net 15      │ │                                              │
│  │ │ Category  Produce     │ │                                              │
│  │ │ Status    Active      │ │                                              │
│  │ │ Open AP   $12,200     │ │                                              │
│  │ │ YTD Spend $48,300     │ │                                              │
│  │ │ Since     2022-06     │ │                                              │
│  │ └───────────────────────┘ │                                              │
│  │                           │                                              │
│  │ Open POs (2)              │                                              │
│  │ ┌───────────────────────┐ │                                              │
│  │ │ PO-2041  $7,100 6/14  │ │                                              │
│  │ │ PO-2035  $5,100 6/12  │ │                                              │
│  │ │ Total:   $12,200      │ │                                              │
│  │ └───────────────────────┘ │                                              │
│  │                           │                                              │
│  │ [Edit] [New PO]           │                                              │
│  └───────────────────────────┘                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Dimensions

| Component              | Width           | Height       | Notes                          |
|------------------------|-----------------|--------------|--------------------------------|
| View Header            | 100%            | 56px         | Inter 20px bold, flex row      |
| FilterToolbar          | 100%            | 44px + 32px  | Menubar row + active-chip row  |
| GridSummaryStrip       | 100%            | 36px         | Inter 13px, muted bg           |
| ViewTabBar             | 100%            | 40px         | Tab height 36px, Inter 13px    |
| AG Grid Table          | 100%            | fills remain | Row height 32px, header 40px   |
| BulkActionBar          | 100%            | 48px         | Slide-up, fixed bottom overlay |
| DetailSlideover        | 420px standard  | 100% vh      | Right panel, 280px peek mode   |
| Checkbox column        | 36px            | —            | Centered, 16px checkbox        |
| Open Bills column      | —               | —            | Right-aligned, tabular nums    |
| Terms cell             | —               | —            | Plain text; click to see full terms detail |
| Actions column (•••)   | 44px            | —            | Opens context menu             |

### Interactive Elements

- **[+ Add Vendor ▾]**: Split button — opens create-vendor modal; arrow opens "Add Vendor", "Import Vendors", "Request W-9"
- **[⚙ Settings]**: Opens GridSettingsPanel slideover (column visibility, sort defaults, density)
- **[▾ Data views]**: Dropdown — "All Vendors", "Active Vendors", "Produce Suppliers", "High Spend", "Payment Due"
- **[▾ Keyword ▾]**: Filter popover with text input; searches across Name, Contact, Email, Phone, Notes, Tax ID
- **[▾ Terms ▾]**: Filter popover with checkboxes — Net 7, Net 15, Net 30, Net 45, Net 60, Due on Receipt, Custom
- **[▾ Status ▾]**: Filter popover with checkboxes — Active, Inactive, On Hold, Blacklisted
- **[▾ Category ▾]**: Filter popover with checkboxes — Produce, Dairy, Dry Goods, Beverage, Packaging, Logistics, Other
- **[▾ Sort ▾]**: "Name A–Z" (default), "Name Z–A", "Open Bills High–Low", "YTD Spend High–Low", "Last PO Newest"
- **[⬇ Export]**: Exports visible rows as CSV; spinner during generation
- **[✕ chip]**: Removes that filter; updates grid immediately
- **[Tab: All, Active, Inactive]**: Sets status filter; badge shows count
- **[☐ header checkbox]**: Selects all visible; indeterminate on partial selection
- **[☐ row checkbox]**: Toggles row selection; updates BulkActionBar
- **[Vendor Name cell]**: Click opens DetailSlideover; underline on hover
- **[Open Bills cell]**: Shows total AP amount; $0 shown in muted text; > $10,000 shown with amber highlight
- **[Terms cell]**: Displays payment terms; hover tooltip shows full terms text (e.g., "2% 10, Net 30")
- **[Last PO cell]**: Shows date; "None" in muted for vendors with no POs
- **[⋮ Actions]**: Context menu — "View Profile", "Edit", "New PO", "Record Invoice", "View Contact", "Deactivate"
- **[DetailSlideover tabs]**: Switch between Profile, POs, Invoices, History panels
- **[◀ Collapse]**: Collapses slideover to 280px peek mode
- **[Edit button]**: Opens vendor edit modal
- **[New PO button]**: Opens create PO modal pre-filled with this vendor
- **[BulkActionBar: 📧 Email]**: Opens email compose with selected vendors' contacts
- **[BulkActionBar: 🏷 Tag]**: Opens tag assignment popover
- **[BulkActionBar: More ▾]**: Dropdown — "Export Selected", "Deactivate Selected", "Merge Vendors", "Send W-9 Request"

### States Shown

- **Empty**: "No vendors match your filters. [Clear filters]" — centered illustration
- **Loading**: Skeleton rows (6 shimmer rows, 32px each); tab badges show "—"
- **Filtering**: Active chips appear; grid re-queries with 300ms debounce
- **Partial selection**: Header checkbox indeterminate
- **Bulk selected**: BulkActionBar slides up; shows count + total AP; actions contextual
- **Active vendor with open bills**: Open Bills in normal text; row fully opaque
- **Inactive vendor**: Row slightly dimmed (opacity 0.7); Active status badge gray
- **High open bills**: > $10,000 AP shows amber highlight on amount; detail slideover flags "Review payment schedule"
- **Zero open bills**: "$0" in muted text; green checkmark badge
- **Vendor on hold**: Status badge amber "On Hold"; tooltip explains reason
- **Slideover peek (280px)**: Shows vendor ID, name, open AP, terms badge
- **Slideover open (420px)**: Full profile with tabs
- **POs tab empty**: Shows "No purchase orders yet. [+ Create PO]"
- **Invoices tab**: Lists unpaid invoices; each shows amount, due date, aging
- **Invoice aging**: Color-coded — green (0-15 days), amber (16-30 days), red (31+ days)
- **Export in progress**: Button shows spinner + "Generating…"; disabled during export
- **Error**: Toast: "Failed to load vendors. [Retry]" at top-right

### ARIA Annotations

- **View Header**: `role="banner"`, `aria-label="Vendors view header"`
- **[+ Add Vendor ▾]**: `role="button"`, `aria-haspopup="menu"`, `aria-label="Add new vendor"`
- **[⚙ Settings]**: `role="button"`, `aria-label="Grid settings"`, `aria-haspopup="dialog"`
- **FilterToolbar**: `role="toolbar"`, `aria-label="Filter and sort toolbar"`
- **[▾ Terms ▾]**: `role="combobox"`, `aria-label="Filter by payment terms"`, `aria-expanded="false"`
- **[▾ Category ▾]**: `role="combobox"`, `aria-label="Filter by vendor category"`, `aria-expanded="false"`
- **Active chip [✕]**: `role="button"`, `aria-label="Remove filter: terms is net-30"`
- **GridSummaryStrip**: `role="status"`, `aria-live="polite"`, `aria-label="28 vendors, 24 active, 142,800 dollars total AP, 5 open bills"`
- **ViewTabBar**: `role="tablist"`, `aria-label="Vendor status filters"`
- **Tab [Active (24)]**: `role="tab"`, `aria-selected="true"`, `aria-label="Active vendors, 24 items"`
- **AG Grid Table**: `role="grid"`, `aria-label="Vendors table"`, `aria-rowcount="28"`, `aria-multiselectable="true"`
- **Header checkbox**: `role="columnheader"`, `aria-label="Select all rows"`
- **Row checkbox**: `role="gridcell"`, `aria-selected="true"` when checked
- **Open Bills cell (high)**: `role="gridcell"`, `aria-label="Open bills $28,400, review recommended"`
- **Terms cell**: `role="gridcell"`, `aria-label="Terms: Net 30"`
- **⋮ Actions**: `role="button"`, `aria-label="More actions for VND-111"`, `aria-haspopup="menu"`
- **BulkActionBar**: `role="toolbar"`, `aria-label="Bulk actions for 3 selected vendors"`, `aria-live="polite"`
- **DetailSlideover**: `role="complementary"`, `aria-label="Vendor VND-111 Chiquita details"`, `aria-modal="false"`
- **Slideover tabs**: `role="tablist"`, `aria-label="Vendor detail sections"`
- **Invoices tab panel**: `role="tabpanel"`, `aria-label="Open invoices for Chiquita"`
- **[Edit]**: `role="button"`, `aria-label="Edit vendor profile"`
- **[New PO]**: `role="button"`, `aria-label="Create new purchase order for Chiquita"`
- **Invoice aging indicator**: `role="alert"`, `aria-label="Invoice 45 days past due, requires attention"`
- **High AP warning**: `role="alert"`, `aria-label="Open accounts payable exceeds ten thousand dollars"`
- **Export spinner**: `role="progressbar"`, `aria-label="Exporting vendors"`

### Edge Cases Handled

- **Zero results**: Empty state with "Clear filters"; summary strip shows "0 vendors · $0"
- **All rows selected**: Header checkbox fully checked; BulkActionBar shows full count + total AP
- **Deselect all**: BulkActionBar slides down; hidden when count = 0
- **Vendor with no POs**: Last PO column shows "None" in muted text; POs tab empty state
- **Vendor with no email**: "Email" bulk action disabled for that vendor
- **Vendor on hold**: Row shows amber warning icon; tooltip explains hold reason; "New PO" button disabled in slideover
- **Vendor with custom terms**: Terms cell shows "Custom"; tooltip displays the actual terms text
- **High AP aging**: Invoice aging badge turns red at 31+ days; slideover promotes to top of Invoices tab
- **Vendor merge**: "Merge Vendors" bulk action opens merge wizard with conflict resolution for POs/Invoices
- **Vendor deactivation with open POs**: Warning dialog "This vendor has 2 open POs totaling $12,200. Deactivate anyway?"
- **DetailSlideover open + bulk selection**: Slideover stays; bulk selection independent
- **Keyboard navigation**: Tab through toolbar → grid → slideover. Enter on vendor name opens slideover. Space toggles checkbox. Arrow keys navigate cells.
- **Export with no rows**: Button disabled; tooltip "No vendors to export"
- **Long vendor names**: Truncated with ellipsis; full name in tooltip
- **Large AP values**: Formatted with $ and commas; right-aligned; amber highlight above $10,000
- **Slideover close via Escape**: Focus returns to triggering row
- **Concurrent edits**: Optimistic update on profile edit; rollback with toast on conflict
- **Touch device**: 44px minimum row touch target; swipe to quickly view profile or create PO
