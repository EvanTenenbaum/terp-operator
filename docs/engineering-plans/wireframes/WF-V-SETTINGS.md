## Wireframe: WF-V-SETTINGS — SettingsView (Tabbed Full-Page with Sidebar)

### Layout (ASCII)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  Page Header: "Settings"                                                     │
├────────────────────────────┬─────────────────────────────────────────────────┤
│  Settings Sidebar          │  ▼ General Tab Content                          │
│  ┌──────────────────────┐  │  ┌─────────────────────────────────────────────┐│
│  │  General          ●  │  │  │  Company Profile                        [✏] ││
│  │  Users & Permissions │  │  │  ┌─────────────────────────────────────────┐││
│  │  Workflows           │  │  │  │ Company Name: Terp Agro Wholesale  [✏]  │││
│  │  Integrations        │  │  │  │ Logo:  [🏢 Logo Preview]  [Upload]      │││
│  │  Billing             │  │  │  │ Default Currency: USD ▾                 │││
│  │  Audit Log           │  │  │  │ Timezone: America/Chicago ▾             │││
│  │                      │  │  │  │ Date Format: MM/DD/YYYY ▾               │││
│  │                      │  │  │  └─────────────────────────────────────────┘││
│  │                      │  │  └─────────────────────────────────────────────┘│
│  │                      │  │  ┌─────────────────────────────────────────────┐│
│  │                      │  │  │  Defaults                              [✏]  ││
│  │                      │  │  │  ┌─────────────────────────────────────────┐││
│  │                      │  │  │  │ Default PO Terms:  Net 30 ▾             │││
│  │                      │  │  │  │ Default Sales Terms: Net 15 ▾           │││
│  │                      │  │  │  │ Default Warehouse:  Main Warehouse ▾    │││
│  │                      │  │  │  │ Default Unit:      Case (cs) ▾          │││
│  │                      │  │  │  │ Tax Rate (%):      8.25    [✏]          │││
│  │                      │  │  │  └─────────────────────────────────────────┘││
│  │                      │  │  └─────────────────────────────────────────────┘│
│  │                      │  │  ┌─────────────────────────────────────────────┐│
│  │                      │  │  │  Regional Settings                     [✏]  ││
│  │                      │  │  │  ┌─────────────────────────────────────────┐││
│  │                      │  │  │  │ Language:  English (US) ▾               │││
│  │                      │  │  │  │ Number Format: 1,234.56 ▾               │││
│  │                      │  │  │  │ Week Starts: Sunday ▾                   │││
│  │                      │  │  │  └─────────────────────────────────────────┘││
│  │                      │  │  └─────────────────────────────────────────────┘│
│  └──────────────────────┘  │                                                 │
├────────────────────────────┴─────────────────────────────────────────────────┤
│  ▼ Users & Permissions Tab Content                                           │
│  ┌──────────────────────────────────────────────────────────────────────────┐│
│  │  Users                                                       [+ Add User] ││
│  │  ┌──────────┬────────────────────┬────────────────┬──────────┬────────┐  ││
│  │  │ Name     │ Email              │ Role           │ Status   │ Actions│  ││
│  │  ├──────────┼────────────────────┼────────────────┼──────────┼────────┤  ││
│  │  │ Evan T.  │ evan@terpagro.com  │ Owner          │ Active   │  [···] │  ││
│  │  │ Maria G. │ maria@acmecorp.com │ Operator       │ Active   │  [···] │  ││
│  │  │ James C. │ james@betainc.com  │ Viewer         │ Active   │  [···] │  ││
│  │  │ Sarah W. │ sarah@gamma.com    │ Operator       │ Pending  │  [···] │  ││
│  │  └──────────┴────────────────────┴────────────────┴──────────┴────────┘  ││
│  │                                                                          ││
│  │  Roles                                                        [+ Add Role]││
│  │  ┌──────────┬────────────────────────────────────────────────────┬──────┐  ││
│  │  │ Role     │ Permissions                                        │Users │  ││
│  │  ├──────────┼────────────────────────────────────────────────────┼──────┤  ││
│  │  │ Owner    │ Full access · All views · Manage billing · Admin   │  1   │  ││
│  │  │ Operator │ Create/edit POs, Sales, Items · View reports       │  3   │  ││
│  │  │ Viewer   │ Read-only · All views · Export                     │  2   │  ││
│  │  └──────────┴────────────────────────────────────────────────────┴──────┘  ││
│  └──────────────────────────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────────────────────┘
```

### Dimensions

| Component              | Width           | Height       | Notes                          |
|------------------------|-----------------|--------------|--------------------------------|
| Page max-width         | 1200px          | —            | Full-page settings layout      |
| Page header            | 100%            | 56px         | Inter 20px bold                |
| Settings sidebar       | 240px           | 100% vh-56px | Fixed left, border-right       |
| Sidebar item           | 240px           | 40px         | Inter 13px, 12px padding       |
| Sidebar active item    | —               | —            | Left accent bar 3px, bold      |
| Content area           | flex remaining  | 100%         | 32px padding, scrollable       |
| Settings card          | 100%            | auto         | 16px padding, 8px border-radius, 1px border |
| Card header            | 100%            | 36px         | Inter 15px semibold + [✏] edit |
| Setting field row      | 100%            | 40px         | Label 180px + value flex        |
| Field label            | 180px           | 40px         | Inter 13px, muted, right-aligned |
| Field value            | flex remaining  | 40px         | Inter 13px, editable on [✏]    |
| Users table            | 100%            | auto         | 4-column, row height 44px      |
| Roles table            | 100%            | auto         | 3-column, row height 48px      |
| [+ Add User] / [+ Add Role] | auto       | 36px         | Button, top-right of card      |
| [···] actions          | 36px            | —            | Kebab menu per user row        |

### Interactive Elements

- **Settings Sidebar**:
  - **[General]**: Active by default; shows Company Profile, Defaults, Regional Settings cards
  - **[Users & Permissions]**: Shows Users table + Roles table; manage access control
  - **[Workflows]**: Shows workflow configuration cards — PO approval chain, Sales order workflow, Intake verification steps, Payment approval thresholds
  - **[Integrations]**: Shows connected integrations — QuickBooks, email (SMTP), EDI, API keys. Each as a card with status indicator and Connect/Disconnect button
  - **[Billing]**: Shows subscription plan, usage meters, payment method, invoice history
  - **[Audit Log]**: Shows full audit trail table — timestamp, user, action, entity, details. Filterable by date, user, action type. Exportable.
  - **Sidebar items**: Click navigates to that section; active item has left accent bar and bold text; inactive items are muted
- **General Tab — Cards**:
  - **[✏] edit icon on card header**: Toggles card into edit mode; inline fields become editable; Save/Cancel buttons appear
  - **Company Name**: Click to edit inline; text input; Enter saves
  - **Logo upload**: Click [Upload] opens file picker; preview updates immediately; drag-and-drop supported on card
  - **Default Currency**: ComboboxCellEditor — USD, CAD, MXN, EUR with currency symbols
  - **Timezone**: ComboboxCellEditor — searchable, grouped by region (US, Canada, Mexico, etc.)
  - **Date Format**: ComboboxCellEditor — MM/DD/YYYY, DD/MM/YYYY, YYYY-MM-DD
  - **Default PO Terms**: ComboboxCellEditor — Net 15, Net 30, Net 45, Net 60, Due on Receipt
  - **Default Sales Terms**: Same as PO terms but independent
  - **Default Warehouse**: ComboboxCellEditor — lists all active warehouses
  - **Default Unit**: ComboboxCellEditor — Case (cs), Pound (lb), Each (ea), Pallet (plt), Bushel (bu)
  - **Tax Rate**: Numeric input with % suffix; decimal allowed; validation: 0–100
  - **Language**: ComboboxCellEditor — English (US), English (UK), Spanish, French
  - **Number Format**: ComboboxCellEditor — 1,234.56 (US), 1.234,56 (EU), 1 234,56
  - **Week Starts**: ComboboxCellEditor — Sunday, Monday
- **Users & Permissions Tab**:
  - **[+ Add User]**: Opens modal — Email (required), Name, Role (dropdown), "Send invitation email" checkbox. Submit sends invite.
  - **User row [···]**: Kebab menu — "Edit Role", "Resend Invite" (if Pending), "Deactivate", "Remove"
  - **User row click**: Opens user detail panel (slideover) — same as modal but editable; audit of user actions
  - **[+ Add Role]**: Opens modal — Role name, permission checkboxes (grouped by module: Orders, Inventory, Contacts, Settings, Billing), "Create Role"
  - **Role row click**: Opens role edit panel — rename, modify permissions
  - **Role row [···]**: "Edit", "Duplicate", "Delete" (disabled if users assigned)
- **Workflows Tab**: Each workflow as a card:
  - **PO Approval Chain**: Toggle on/off; threshold amount input; approver dropdown (multi-select, ordered)
  - **Sales Order Workflow**: Toggle require customer approval; auto-confirm threshold
  - **Intake Verification**: Toggle require verification; required fields checklist
  - **Payment Approval**: Threshold amount; dual approval toggle
- **Integrations Tab**: Each integration as a card with:
  - **Status indicator**: Green dot (Connected), Grey dot (Disconnected), Yellow dot (Error)
  - **QuickBooks**: [Connect] / [Disconnect] button; last sync timestamp; sync frequency dropdown
  - **Email (SMTP)**: SMTP server fields; test email button; "Send as" name/email
  - **EDI**: Partner ID, endpoint URL, certificate upload
  - **API Keys**: Table of generated keys with name, last used, created date. [Generate New Key] button. Key shown once on creation; masked afterward.
- **Billing Tab**: Subscription plan card, usage meters (orders/mo, users, storage), payment method card, invoice history table
- **Audit Log Tab**: Full table — Timestamp, User, Action (Created, Updated, Deleted, Viewed, Exported), Entity (PO, Contact, Setting), Details (JSON diff or summary). Filters at top. [⬇ Export Audit Log] button.

### States Shown

- **General — Default (view mode)**: All cards show field values as read-only text; [✏] icons visible on card headers
- **General — Edit mode (card-level)**: Card fields become inputs/comboboxes; Save and Cancel buttons at card bottom; card border changes to accent color
- **Saving (card-level)**: Save button shows spinner; fields disabled; success toast "Settings saved"
- **Unsaved changes warning**: If user navigates to another sidebar item with unsaved edit-mode card, confirmation dialog: "You have unsaved changes. Discard?"
- **Logo upload**: Preview updates optimistically; error toast if upload fails; supported formats hint: "PNG, JPG, or SVG. Max 2MB."
- **Users — Empty (no users besides owner)**: "Invite your first team member" CTA card
- **Users — Pending invite**: Row shows amber "Pending" badge; "Resend Invite" action available
- **Roles — Delete blocked**: "Cannot delete this role: 3 users are assigned. Reassign them first."
- **API Key — New key generated**: Key shown in modal once with copy button; "Copy and store this key now. It will not be shown again." Warning banner.
- **Integration — Connection error**: Card shows yellow status dot + "Connection error: Unable to reach QuickBooks. Last successful sync: Jun 14, 2026. [Retry] [Reconfigure]"
- **Audit Log — No results (filtered)**: "No audit entries match your filters. [Clear filters]"
- **Audit Log — Export large dataset**: Progress bar; "Exporting 12,847 audit entries…"; cancel available
- **Billing — Past due**: Red banner "Your payment is past due. [Update Payment Method]" at top of Billing tab
- **Error saving settings**: Toast: "Could not save settings. [Retry]"

### ARIA Annotations

- **Page header**: `role="banner"`, `aria-label="Settings"`
- **Settings sidebar**: `role="navigation"`, `aria-label="Settings categories"`
- **Sidebar item [General]**: `role="link"`, `aria-current="page"` when active, `aria-label="General settings"`
- **Sidebar item [Users & Permissions]**: `role="link"`, `aria-label="Users and permissions settings"`
- **Settings cards**: Each card is `role="region"` with `aria-label` matching card title (e.g., "Company profile settings")
- **[✏] edit icon**: `role="button"`, `aria-label="Edit company profile settings"`, `aria-pressed="true"` in edit mode
- **Company Name input**: `role="textbox"`, `aria-label="Company name"`, `aria-readonly="true"` (false in edit mode)
- **Logo [Upload]**: `role="button"`, `aria-label="Upload company logo"`, `aria-describedby="logo-hint"`
- **Default Currency ▾**: `role="combobox"`, `aria-label="Default currency"`, `aria-expanded="false"`
- **Timezone ▾**: `role="combobox"`, `aria-label="Timezone"`, `aria-expanded="false"`
- **Date Format ▾**: `role="combobox"`, `aria-label="Date format"`, `aria-expanded="false"`
- **Tax Rate input**: `role="spinbutton"`, `aria-label="Default tax rate, percent"`, `aria-valuemin="0"`, `aria-valuemax="100"`, `aria-valuenow="8.25"`
- **Save button**: `role="button"`, `aria-label="Save settings"`
- **Cancel button**: `role="button"`, `aria-label="Discard settings changes"`
- **Users table**: `role="table"`, `aria-label="Users list"`, `aria-rowcount="4"`
- **Roles table**: `role="table"`, `aria-label="Roles list"`, `aria-rowcount="3"`
- **[+ Add User]**: `role="button"`, `aria-label="Add new user"`, `aria-haspopup="dialog"`
- **[+ Add Role]**: `role="button"`, `aria-label="Add new role"`, `aria-haspopup="dialog"`
- **User row [···]**: `role="button"`, `aria-label="Actions for Maria Gonzalez"`, `aria-haspopup="menu"`
- **Integration card status dot**: `role="status"`, `aria-label="QuickBooks: Connected"` or "Disconnected" or "Error"
- **Integration [Connect]**: `role="button"`, `aria-label="Connect to QuickBooks"`
- **API Key [Generate New Key]**: `role="button"`, `aria-label="Generate new API key"`, `aria-haspopup="dialog"`
- **Audit Log table**: `role="table"`, `aria-label="Audit log"`, `aria-sort="descending"` on timestamp column
- **[⬇ Export Audit Log]**: `role="button"`, `aria-label="Export audit log to CSV"`
- **Billing payment status**: `role="status"`, `aria-label="Payment past due"` when applicable
- **Unsaved dialog**: `role="alertdialog"`, `aria-label="Unsaved changes"`, `aria-describedby="unsaved-message"`

### Edge Cases Handled

- **Sidebar navigation with unsaved changes**: Confirmation dialog; user can Discard, Keep Editing, or Save & Navigate
- **Very long company name**: Truncated with ellipsis in view mode; full text editable in edit mode
- **Logo file too large**: Inline error "File must be under 2MB. Current: 4.2MB." with retry
- **Logo in wrong format**: Inline error "Unsupported format. Use PNG, JPG, or SVG."
- **Timezone not found in search**: "No timezone matches 'xyz'. Showing all US timezones."
- **Tax rate over 100%**: Inline validation error "Tax rate cannot exceed 100%"; field border turns red
- **User invite to existing email**: Modal error "A user with this email already exists." with link to that user
- **User invite to invalid email**: Inline validation "Please enter a valid email address."
- **Remove last Owner**: Warning "You are the only Owner. Removing yourself will leave the account without an Owner. Promote another user to Owner first."
- **Delete role with assigned users**: Blocked with message "Reassign 3 users from this role before deleting."
- **API Key — last key deleted / no keys**: "No API keys generated yet. [Generate your first key]"
- **Integration connection timeout**: 30-second timeout; error state with retry
- **Audit Log — very large date range**: Warning if > 1 year: "Large date ranges may take longer to load. [Load anyway]"
- **Audit Log — empty after export**: Export still produces CSV with headers only
- **Billing — no payment method**: "No payment method on file. [Add payment method]" CTA card
- **Concurrent settings edit**: Optimistic save; if conflict, toast "Settings were modified by another session. Reloading." and refresh
- **Mobile (<768px)**: Sidebar collapses to horizontal scroll or hamburger dropdown at top; content area full-width
- **Keyboard navigation**: Tab through sidebar → content area. Enter toggles edit mode. Escape cancels edit mode. Ctrl+S saves.
