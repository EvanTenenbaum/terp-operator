## Wireframe: WF-V-CONTACTS — ContactsView (GridView)

### Layout (ASCII)

```
┌─View Header: "Contacts"                    [+ New Contact ▾] [⚙ Settings]───┐
├─FilterToolbar───────────────────────────────────────────────────────────────┤
│  [▾ Data views] [▾ Keyword ▾] [▾ Company ▾] [▾ Role ▾] [▾ Sort ▾] [⬇ Export]│
│  [✕ company:acme-corp] [✕ role:buyer] [✕ status:active]                     │
├─GridSummaryStrip────────────────────────────────────────────────────────────┤
│  [👤 312 contacts · 18 companies · 4 roles · 12 new this month]             │
├─ViewTabBar──────────────────────────────────────────────────────────────────┤
│  [All (312)] [Active (287)] [Inactive (25)]                                  │
├─AG Grid Table───────────────────────────────────────────────────────────────┤
│  ┌──────┬──────────┬────────────────────┬──────────────┬──────────┬────────┐│
│  │  ☐   │ ID       │ Name               │ Company      │ Role     │ Status │ •│
│  ├──────┼──────────┼────────────────────┼──────────────┼──────────┼────────┤│
│  │  ☐   │ CON-0042 │ Maria Gonzalez     │ Acme Corp    │ Buyer    │ Active │ ⋮│
│  │  ☑   │ CON-0038 │ James Chen         │ Beta Inc     │ Mgr      │ Active │ ⋮│
│  │  ☐   │ CON-0051 │ Sarah Williams     │ Gamma LLC    │ Owner    │ Active │ ⋮│
│  │  ☐   │ CON-0033 │ David Park         │ Delta Corp   │ A/P      │Inactive│ ⋮│
│  │  ☑   │ CON-0047 │ Lisa Thompson      │ Epsilon Inc  │ Broker   │ Active │ ⋮│
│  │  ☐   │ CON-0029 │ Robert Kim         │ Zeta LLC     │ Dispatch │ Active │ ⋮│
│  │  ☐   │ CON-0055 │ Amanda Foster      │ Acme Corp    │ Buyer    │ Active │ ⋮│
│  └──────┴──────────┴────────────────────┴──────────────┴──────────┴────────┘│
├─BulkActionBar (hidden until selection)───────────────────────────────────────┤
│  ┌───────────────────────────────────────────────────────────────────────┐   │
│  │  2 selected     [✏ Edit Role] [🏷 Add Tag] [📧 Email] [More ▾]        │  │
│  └───────────────────────────────────────────────────────────────────────┘   │
├─DetailSlideover (right side, 420px, when row clicked)────────────────────────┤
│  ┌─────────────────────────────┐                                            │
│  │ CON-0042 · Maria Gonzalez   │  ◀ Collapse                               │
│  ├─────────────────────────────┤                                            │
│  │ [Profile][Assoc Records]    │                                            │
│  │ [Activity][History]         │                                            │
│  ├─────────────────────────────┤                                            │
│  │ ▼ Profile tab               │                                            │
│  │ ┌─────────────────────────┐ │                                            │
│  │ │ [👤 Avatar placeholder]  │ │                                            │
│  │ │ Name: Maria Gonzalez    │ │                                            │
│  │ │ Company: Acme Corp ▾     │ │  ← ComboboxCellEditor                      │
│  │ │ Role: Buyer ▾            │ │  ← ComboboxCellEditor                      │
│  │ │ Email: maria@acmecorp.co │ │                                            │
│  │ │ Phone: (555) 234-5678   │ │                                            │
│  │ │ Status: Active ▾         │ │  ← Status toggle                           │
│  │ │ Notes: Primary contact.. │ │                                            │
│  │ └─────────────────────────┘ │                                            │
│  │                             │                                            │
│  │ [📧 Send Email] [📞 Call]  │  ← Quick action buttons                    │
│  │ [Edit Contact] [Deactivate]│                                            │
│  └─────────────────────────────┘                                            │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Dimensions

| Component              | Width           | Height       | Notes                          |
|------------------------|-----------------|--------------|--------------------------------|
| View Header            | 100%            | 56px         | Inter 20px bold, flex row      |
| FilterToolbar          | 100%            | 44px + 32px  | Menubar row + active-chip row  |
| GridSummaryStrip       | 100%            | 36px         | Inter 13px, muted background   |
| ViewTabBar             | 100%            | 40px         | Tab height 36px, Inter 13px    |
| AG Grid Table          | 100%            | fills remain | Row height 40px, header 40px   |
| BulkActionBar          | 100%            | 48px         | Slide-up, fixed bottom overlay |
| DetailSlideover        | 420px standard  | 100% vh      | Right panel, 280px peek mode   |
| Checkbox column        | 36px            | —            | Centered, 16px checkbox        |
| Actions column (⋮)     | 44px            | —            | Opens context menu             |
| Avatar placeholder     | 48px × 48px     | —            | Circle, initials, muted bg     |
| Quick action buttons   | 140px each      | 36px         | Email blue, Call green tint    |

### Interactive Elements

- **[+ New Contact ▾]**: Split button — click opens create modal; arrow opens dropdown with "Blank Contact", "From Company Import", "Import CSV"
- **[⚙ Settings]**: Opens GridSettingsPanel slideover (column visibility, sort defaults, density)
- **[▾ Data views]**: Dropdown of saved filter presets — "Default", "Active Buyers", "My Contacts", "By Company", plus "Save Current View…"
- **[▾ Keyword ▾]**: Filter popover with text input, searches across Name, Email, Phone, Notes, Company
- **[▾ Company ▾]**: Filter popover with multi-select checkboxes listing all companies; searchable
- **[▾ Role ▾]**: Filter popover with checkboxes — Buyer, Manager, Owner, A/P, Broker, Dispatch, Sales Rep, Warehouse, Driver
- **[▾ Sort ▾]**: Sort popover — "Name A–Z", "Name Z–A", "Company A–Z", "Recently Added", "Recently Active"
- **[⬇ Export]**: Exports visible rows as CSV; shows spinner during generation
- **[✕ chip]**: Removes that filter; updates grid immediately
- **[Tab: All, Active, Inactive]**: Sets status filter; badge shows count. Click updates grid
- **[☐ header checkbox]**: Selects all visible rows; indeterminate when partial selection
- **[☐ row checkbox]**: Toggles row selection; updates BulkActionBar
- **[⋮ Actions button]**: Opens ContextMenuTrigger — "View Profile", "Edit", "Send Email", "Copy Phone", "Deactivate", "Merge Duplicate"
- **[DetailSlideover tabs]**: Click switches between Profile, Associated Records, Activity, History panels
- **[◀ Collapse]**: Collapses slideover to 280px peek mode
- **[Profile tab]**: Avatar placeholder (initials, 48px circle). Inline-editable fields: Name, Company ▾, Role ▾, Email, Phone, Status toggle ▾, Notes textarea. Status toggles between Active/Inactive.
- **[📧 Send Email]**: Opens system mailto: or integrated email composer if available
- **[📞 Call]**: Shows phone number as tel: link or copies to clipboard with toast
- **[Associated Records tab]**: Mini tables — "Linked Purchase Orders (12)", "Linked Sales Orders (8)", "Linked Companies". Each row clickable.
- **[Activity tab]**: Timeline feed — "Jun 15: Added to PO #1012 by Evan", "Jun 12: Email sent by system", "Jun 10: Status changed to Active"
- **[History tab]**: Audit log table — field changes, timestamps, changed-by user
- **[BulkActionBar: ✏ Edit Role]**: Opens inline dropdown to bulk-set role on selected contacts
- **[BulkActionBar: 🏷 Add Tag]**: Opens tag picker for selected contacts
- **[BulkActionBar: 📧 Email]**: Opens mailto: with all selected email addresses in BCC
- **[BulkActionBar: More ▾]**: Dropdown with "Export Selected", "Deactivate", "Merge Duplicates", "Delete"

### States Shown

- **Empty**: "No contacts match your filters. [Clear filters]" — centered illustration + link
- **Loading**: AG Grid skeleton rows (7 shimmer rows, 40px each), tab badges show "—"
- **Filtering**: Active chips appear below menubar; grid re-queries with 300ms debounce
- **Partial selection**: Header checkbox in indeterminate state (dash icon)
- **Bulk selected**: BulkActionBar slides up; shows count; contextual actions
- **Inactive contact row**: Dimmed text (50% opacity), status badge "Inactive", email/phone still visible
- **Slideover peek (280px)**: Shows avatar, name, company, role, status badge, email, phone
- **Slideover standard (420px)**: Full detail panel with tabs and quick action buttons
- **Slideover with unsaved changes**: Confirmation dialog on close with "Discard" / "Keep Editing"
- **Empty notes field**: "No notes yet. [Add note]" placeholder text
- **No associated records**: Tab shows "No linked purchase orders, sales orders, or companies yet."
- **No activity history**: Timeline shows "No activity recorded" with date of contact creation
- **Company combobox open**: Searchable dropdown listing all companies; type to filter; "Add new company…" option at bottom
- **Error**: Toast notification: "Failed to load contacts. [Retry]" at top-right
- **Deactivate confirmation**: Dialog: "Deactivate Maria Gonzalez? They will not appear in contact selectors for new orders. Existing associations are preserved."

### ARIA Annotations

- **View Header**: `role="banner"`, `aria-label="Contacts view header"`
- **[+ New Contact ▾]**: `role="button"`, `aria-haspopup="menu"`, `aria-label="Create new contact"`
- **[⚙ Settings]**: `role="button"`, `aria-label="Grid settings"`, `aria-haspopup="dialog"`
- **FilterToolbar**: `role="toolbar"`, `aria-label="Filter and sort toolbar"`
- **[▾ Data views]**: `role="combobox"`, `aria-label="Saved data views"`, `aria-expanded="false"`
- **Active chip [✕]**: `role="button"`, `aria-label="Remove filter: company is Acme Corp"`
- **GridSummaryStrip**: `role="status"`, `aria-live="polite"`, `aria-label="312 contacts, 18 companies, 4 roles"`
- **ViewTabBar**: `role="tablist"`, `aria-label="Contact status filters"`
- **Tab [Active (287)]**: `role="tab"`, `aria-selected="true"`, `aria-label="Active contacts, 287 items"`
- **AG Grid Table**: `role="grid"`, `aria-label="Contacts table"`, `aria-rowcount="312"`, `aria-multiselectable="true"`
- **Header checkbox**: `role="columnheader"`, `aria-label="Select all rows"`
- **⋮ Actions button**: `role="button"`, `aria-label="More actions for Maria Gonzalez"`, `aria-haspopup="menu"`
- **BulkActionBar**: `role="toolbar"`, `aria-label="Bulk actions for 2 selected contacts"`, `aria-live="polite"`
- **DetailSlideover**: `role="complementary"`, `aria-label="Contact Maria Gonzalez details"`, `aria-modal="false"`
- **Slideover tabs**: `role="tablist"`, `aria-label="Contact detail sections"`
- **Slideover tab panel [Profile]**: `role="tabpanel"`, `aria-label="Contact profile"`
- **Avatar**: `role="img"`, `aria-label="Maria Gonzalez avatar"`
- **[📧 Send Email]**: `role="button"`, `aria-label="Send email to maria at acmecorp dot com"`
- **[📞 Call]**: `role="button"`, `aria-label="Call 555 234 5678"`
- **Company ▾ in slideover**: `role="combobox"`, `aria-label="Company"`, `aria-expanded="false"`
- **Role ▾ in slideover**: `role="combobox"`, `aria-label="Role"`, `aria-expanded="false"`
- **Status toggle ▾**: `role="combobox"`, `aria-label="Status, Active"`, `aria-expanded="false"`
- **Notes textarea**: `role="textbox"`, `aria-label="Contact notes"`, `aria-multiline="true"`
- **[Edit Contact]**: `role="button"`, `aria-label="Edit Maria Gonzalez"`
- **[Deactivate]**: `role="button"`, `aria-label="Deactivate Maria Gonzalez"`
- **Export spinner**: `role="progressbar"`, `aria-label="Exporting contacts"`

### Edge Cases Handled

- **Zero contacts in system**: Empty state with "Add your first contact" CTA; tabs all show 0
- **Zero results after filter**: "No contacts match your filters" with "Clear filters" link
- **Contact with no company**: Company cell shows "—" in muted text; filterable under "(No Company)"
- **Contact with multiple phone numbers**: Primary shown in grid; all numbers in slideover Profile tab
- **Very long email addresses**: Truncated with ellipsis at 200px; full email in tooltip
- **Contact linked to zero records**: Associated Records tab shows empty message per entity type
- **Duplicate contact detection**: If name + email match existing, show warning banner "Possible duplicate: CON-0047 has same email."
- **Bulk email with no addresses**: "📧 Email" button hidden if no selected contacts have email
- **Merge duplicates flow**: "Merge Duplicates" in BulkActionBar navigates to MergeCandidatesView with pre-selected contacts
- **Concurrent edit conflict**: Optimistic update on slideover save; rollback with toast
- **Keyboard navigation**: Tab through toolbar → grid → slideover. Space toggles checkbox. Enter opens slideover. Arrow keys navigate cells.
- **Company combobox with 200+ companies**: Searchable; scrollable; typeahead filters in real-time
- **Touch device**: 44px minimum touch targets; quick action buttons prominent on mobile
- **Export with no rows**: Export button hidden (not disabled)
- **Inactive contact selected for bulk action**: Bulk action buttons apply to inactive contacts too; status change possible
