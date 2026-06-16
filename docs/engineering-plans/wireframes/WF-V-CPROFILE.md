## Wireframe: WF-V-CPROFILE — ContactProfileView (Tabbed Full-Page)

### Layout (ASCII)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ ← Back to Contacts                                                           │
├──────────────────────────────────────────────────────────────────────────────┤
│  Profile Header                                                              │
│  ┌──────────────────────────────────────────────────────────────────────────┐│
│  │ [👤 MG] Maria Gonzalez            [Active ●]                             ││
│  │         Buyer · Acme Corp         [📧 Email] [📞 Call] [✏ Edit] [··· ▾] ││
│  └──────────────────────────────────────────────────────────────────────────┘│
├──────────────────────────────────────────────────────────────────────────────┤
│  Tab Bar                                                                     │
│  ┌──────────────────────────────────────────────────────────────────────────┐│
│  │ [Overview] [Activity] [Related Records] [Documents] [Settings]           ││
│  └──────────────────────────────────────────────────────────────────────────┘│
├──────────────────────────────────────────────────────────────────────────────┤
│  ▼ Overview Tab Content (2-column layout)                                    │
│  ┌─────────────────────────────┬────────────────────────────────────────────┐│
│  │  Contact Details            │  Recent Activity                           ││
│  │  ┌────────────────────────┐ │  ┌──────────────────────────────────────┐ ││
│  │  │ Name: Maria Gonzalez   │ │  │ Jun 14 · Added to PO #1012           │ ││
│  │  │                        │ │  │         by Evan T.                   │ ││
│  │  │ Company: Acme Corp ▾   │ │  │ ────────────────────────────────────│ ││
│  │  │ Role:    Buyer ▾       │ │  │ Jun 12 · Email sent                 │ ││
│  │  │                        │ │  │         Re: Quote for apples         │ ││
│  │  │ Email: maria@acmeco..  │ │  │ ────────────────────────────────────│ ││
│  │  │ Phone: (555) 234-5678  │ │  │ Jun 11 · Status changed             │ ││
│  │  │                        │ │  │         Inactive → Active            │ ││
│  │  │ Status: Active ▾       │ │  │ ────────────────────────────────────│ ││
│  │  │                        │ │  │ Jun 09 · Linked to Gamma LLC        │ ││
│  │  │ Notes:                 │ │  │         as secondary contact         │ ││
│  │  │ Primary contact for    │ │  │                                      │ ││
│  │  │ all produce orders.    │ │  │  [View all 47 activities →]          │ ││
│  │  │ Prefers email comms.   │ │  └──────────────────────────────────────┘ ││
│  │  └────────────────────────┘ │                                            ││
│  ├─────────────────────────────┼────────────────────────────────────────────┤│
│  │                             │  Associated Records                        ││
│  │                             │  ┌──────────────────────────────────────┐ ││
│  │                             │  │ Purchase Orders (12)                 │ ││
│  │                             │  │  PO-1012 · $18,200 · Confirmed      │ ││
│  │                             │  │  PO-1009 · $12,400 · Draft          │ ││
│  │                             │  │  PO-1004 · $9,800  · Posted         │ ││
│  │                             │  │  [View all 12 →]                     │ ││
│  │                             │  ├──────────────────────────────────────┤ ││
│  │                             │  │ Sales Orders (8)                     │ ││
│  │                             │  │  SO-2047 · $6,300  · Confirmed      │ ││
│  │                             │  │  SO-2031 · $4,200  · Posted         │ ││
│  │                             │  │  [View all 8 →]                      │ ││
│  │                             │  ├──────────────────────────────────────┤ ││
│  │                             │  │ Companies (2)                        │ ││
│  │                             │  │  Acme Corp (Primary)                 │ ││
│  │                             │  │  Gamma LLC  (Secondary)              │ ││
│  │                             │  └──────────────────────────────────────┘ ││
│  └─────────────────────────────┴────────────────────────────────────────────┘│
├──────────────────────────────────────────────────────────────────────────────┤
│  ▼ Activity Tab (full timeline)                                              │
│  ┌──────────────────────────────────────────────────────────────────────────┐│
│  │  Filter: [All ▾]         Date range: [Last 90 days ▾]                    ││
│  │  ────────────────────────────────────────────────────────────────────────││
│  │  ● Jun 14, 2026  3:42 PM                                                 ││
│  │    Added to Purchase Order PO-1012 as Buyer                              ││
│  │    by Evan Tenenbaum                                                     ││
│  │  ● Jun 12, 2026 10:15 AM                                                 ││
│  │    Email sent: "Quote for Roma Tomatoes"                                 ││
│  │    Status: Delivered · Opened                                            ││
│  │  ● Jun 11, 2026  9:00 AM                                                 ││
│  │    Status changed from Inactive to Active                                ││
│  │    by Evan Tenenbaum                                                     ││
│  │  ...                                                                     ││
│  │  [Load more activities]                                                  ││
│  └──────────────────────────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────────────────────┘
```

### Dimensions

| Component              | Width           | Height       | Notes                          |
|------------------------|-----------------|--------------|--------------------------------|
| Page max-width         | 1200px centered | —            | Not a full-width grid view     |
| Back link              | auto            | 32px         | Inter 13px, muted, ← arrow     |
| Profile header         | 100%            | 80px         | Flex row, avatar + info + actions |
| Avatar                 | 48px × 48px     | —            | Circle, initials "MG", muted bg|
| Status badge           | auto            | 24px         | Pill: green bg "Active", grey "Inactive" |
| Tab bar                | 100%            | 44px         | Tab height 36px, bottom border |
| Overview layout        | 2 columns       | auto         | Left 380px, Right flex         |
| Contact Details card   | 380px           | auto         | 12px padding, 8px border-radius|
| Recent Activity card   | flex remaining  | auto         | Max 6 items shown              |
| Associated Records card| flex remaining  | auto         | Below activity card, mt-16px   |
| Activity timeline      | 100%            | auto         | Full-width on Activity tab     |
| Field label            | 80px            | 28px         | Muted, right-aligned, 12px gap |
| Field value (inline)   | flex remaining  | 28px         | Inter 13px, editable on click  |
| Document list items    | 100%            | 44px         | Row: icon + name + date + size |

### Interactive Elements

- **[← Back to Contacts]**: Returns to ContactsView GridView; preserves filter/tab state if possible
- **Profile Header**:
  - **[👤 MG Avatar]**: Click to upload/change photo; shows file picker dialog
  - **Name "Maria Gonzalez"**: Click to edit inline; becomes text input; Enter or blur saves, Escape cancels
  - **Company "Acme Corp ▾"**: Inline ComboboxCellEditor — searchable company picker
  - **Role "Buyer ▾"**: Inline ComboboxCellEditor — role dropdown (Buyer, Manager, Owner, A/P, Broker, Dispatch, Sales Rep, Warehouse, Driver)
  - **[Active ●]**: Status toggle — click cycles Active ↔ Inactive; confirmation dialog when deactivating
  - **[📧 Email]**: Quick action button — opens mailto or email composer
  - **[📞 Call]**: Quick action button — shows phone as tel: link or copies to clipboard
  - **[✏ Edit]**: Enters full edit mode — all Contact Details fields become editable at once
  - **[··· ▾]**: Overflow menu — "Duplicate Contact", "Merge with Another", "Export vCard", "Delete Contact"
- **Tab Bar**:
  - **[Overview]**: Default tab; 2-column layout with Contact Details + Recent Activity + Associated Records
  - **[Activity]**: Full timeline with date filter; paginated (load more); includes email opens, status changes, record associations
  - **[Related Records]**: Grouped tables — Purchase Orders, Sales Orders, Companies, Payments. Each row clickable to navigate to that record.
  - **[Documents]**: File list grid (uploaded docs, emails, PDFs). [+ Upload] button. File preview on click. Download/delete actions.
  - **[Settings]**: Contact preferences — notification settings, default communication method, timezone, custom fields
- **Contact Details card (Overview tab)**:
  - **Name**: Click to edit inline; text input
  - **Company**: ComboboxCellEditor; searchable; "Add new company…" option
  - **Role**: ComboboxCellEditor; dropdown with standard roles
  - **Email**: Click to edit; email input with validation; "Add another email" link
  - **Phone**: Click to edit; phone input; "Add another phone" link
  - **Status**: Toggle Active/Inactive
  - **Notes**: Multiline textarea; auto-expands; placeholder "Add notes about this contact…"
- **Recent Activity card**: Each activity item is a row with timestamp dot, description, and actor. "View all →" navigates to Activity tab.
- **Associated Records card**: Each entity section shows top 3 records with link counts. "View all →" navigates to Related Records tab.
- **Activity tab**: Date-filtered timeline. "All" filter shows everything; presets: Last 7 days, Last 30 days, Last 90 days, Custom. "Load more" pagination button. Each entry clickable to navigate to related record.

### States Shown

- **Default (Overview)**: 2-column layout; all sections populated with real data; edit-in-place fields at rest
- **Edit mode (✏ Edit clicked)**: All fields get input/combobox styling; cursor in first field; Save/Cancel button bar appears at bottom of Contact Details card
- **Saving**: Brief spinner on Save button; fields disabled during save; success toast "Contact updated"
- **Inline field editing**: Single field becomes input on click; other fields remain display-only; Enter saves, Escape cancels; green flash on save
- **Empty contact (new, no data)**: "Complete contact profile" banner at top; fields show placeholder text
- **No recent activity**: Card shows "No activity recorded yet" with contact creation date
- **No associated records**: Card shows "No linked records. Contacts are linked when added to purchase orders, sales orders, or companies."
- **No documents**: Tab shows empty state with upload CTA: "No documents. [Upload a file]"
- **Activity loading**: Skeleton timeline items (3 shimmer rows); "Load more" disabled
- **Company not found (typing in combobox)**: "No companies match. [Add "NewCo LLC" as new company]"
- **Deactivating contact**: Dialog: "Deactivate Maria Gonzalez? They will not appear in contact selectors for new orders. Existing records are preserved." Confirm / Cancel
- **Deleting contact**: Critical warning dialog: "Delete Maria Gonzalez? This cannot be undone. This contact is linked to 20 records. Consider deactivating instead." [Deactivate Instead] [Delete Anyway] [Cancel]
- **Error saving**: Toast: "Could not save contact. [Retry]"
- **Document upload in progress**: Progress bar on document; filename shown; cancel upload [×]

### ARIA Annotations

- **← Back to Contacts**: `role="link"`, `aria-label="Back to contacts list"`
- **Profile Header**: `role="banner"`, `aria-label="Contact profile header"`
- **Avatar**: `role="img"`, `aria-label="Maria Gonzalez avatar"`. If no photo: `aria-label="Contact avatar placeholder"`
- **Status badge [Active ●]**: `role="status"`, `aria-label="Status: Active"`
- **[📧 Email]**: `role="button"`, `aria-label="Send email to Maria Gonzalez"`
- **[📞 Call]**: `role="button"`, `aria-label="Call Maria Gonzalez at 555 234 5678"`
- **[✏ Edit]**: `role="button"`, `aria-label="Edit contact details"`, `aria-pressed="false"` (true in edit mode)
- **[··· ▾]**: `role="button"`, `aria-label="More actions for Maria Gonzalez"`, `aria-haspopup="menu"`
- **Tab Bar**: `role="tablist"`, `aria-label="Contact profile sections"`
- **[Overview] tab**: `role="tab"`, `aria-selected="true"`, `aria-controls="panel-overview"`
- **Overview panel**: `role="tabpanel"`, `id="panel-overview"`, `aria-label="Contact overview"`
- **Contact Details card**: `role="region"`, `aria-label="Contact details"`
- **Name field (editable)**: `role="textbox"`, `aria-label="Contact name"`, `aria-readonly="true"` (false in edit mode)
- **Company combobox**: `role="combobox"`, `aria-label="Company"`, `aria-expanded="false"`
- **Role combobox**: `role="combobox"`, `aria-label="Role"`, `aria-expanded="false"`
- **Email field**: `role="textbox"`, `aria-label="Email address"`, `aria-readonly="true"`
- **Phone field**: `role="textbox"`, `aria-label="Phone number"`, `aria-readonly="true"`
- **Status toggle**: `role="combobox"`, `aria-label="Status"`, `aria-expanded="false"`
- **Notes textarea**: `role="textbox"`, `aria-label="Contact notes"`, `aria-multiline="true"`
- **Recent Activity card**: `role="region"`, `aria-label="Recent activity"`
- **Activity item**: `role="listitem"` within a `role="list"` container
- **Activity "View all →"**: `role="link"`, `aria-label="View all 47 activities"`
- **Associated Records card**: `role="region"`, `aria-label="Associated records"`
- **Document list**: `role="list"`, `aria-label="Contact documents"`
- **Document item**: `role="listitem"`. Download button: `aria-label="Download file-name.pdf"`
- **[+ Upload]**: `role="button"`, `aria-label="Upload document"`
- **Save button (edit mode)**: `role="button"`, `aria-label="Save contact changes"`
- **Cancel button (edit mode)**: `role="button"`, `aria-label="Discard changes"`
- **Activity timeline filter**: `role="combobox"`, `aria-label="Filter activity by type"`
- **Date range filter**: `role="combobox"`, `aria-label="Filter activity by date range"`
- **Document upload progress**: `role="progressbar"`, `aria-label="Uploading file-name.pdf"`, `aria-valuenow="65"`

### Edge Cases Handled

- **No avatar set**: Placeholder circle with initials ("MG"); first letter of first + last name
- **Very long name**: Name wraps to 2 lines max in header; truncated with tooltip
- **Very long company name**: Truncated with ellipsis at 300px; full name in tooltip
- **Contact with no company**: Shows "—" in header; Company combobox value is empty
- **Contact with no email**: Email field shows "No email on file" muted text; [📧 Email] button hidden
- **Contact with no phone**: Phone field shows "No phone on file"; [📞 Call] button hidden
- **Notes with very long text**: Textarea scrolls at 200px max-height; expand/collapse toggle if > 500 chars
- **Activity with 500+ entries**: Paginated at 50; "Load more" button; filters reduce visible set
- **Related records across 50+ POs**: Each section shows top 3; "View all →" navigates to full filtered list
- **Document upload exceeds limit**: Inline error "File must be under 10MB." with retry
- **Unsupported file type**: Inline error "File type .exe is not supported. Allowed: PDF, DOCX, XLSX, PNG, JPG, CSV."
- **Concurrent edit by another user**: Optimistic save fails; toast "Contact was modified by another user. Reloading." page refreshes
- **Delete contact with active links**: Warning shows count of linked records; suggests deactivation as safer alternative
- **Inline edit escape**: Reverts field to previous value; no save
- **Tab state in URL**: URL updates to `/contacts/:id?tab=activity`; back button returns to previous tab
- **Mobile (<768px)**: Single column layout; Contact Details card above Activity; Associated Records below; header stacks vertically
- **Keyboard navigation**: Tab through header actions → tab bar → content. Enter activates edit. Ctrl+S saves in edit mode. Escape cancels edit.
