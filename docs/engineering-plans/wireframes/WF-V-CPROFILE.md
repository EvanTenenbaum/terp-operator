## Wireframe: WF-V-CPROFILE — ContactProfileView (Tabbed Full-Page)

### UX Posture

This is a *single-entity detail view* — not a list. Per UX-3, "one primary surface per view" applies as: the profile is the one entity, the tab bar selects which slice of the entity is the primary surface, and the supporting cards on the Overview tab are sequenced (not competing). State-gated header actions follow contact state.

### Layout (ASCII)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ ← Back to Contacts                                                           │
├──────────────────────────────────────────────────────────────────────────────┤
│  Profile Header (sticky on scroll)                                           │
│  ┌──────────────────────────────────────────────────────────────────────────┐│
│  │ [👤 MG] Maria Gonzalez            [Active ●]                             ││
│  │         Buyer · Acme Corp         (state-gated actions below)            ││
│  │                                                                          ││
│  │  Footer actions (state-gated):                                           ││
│  │   Active   → [Send Email] [Call] [Edit] [Deactivate]                     ││
│  │   Inactive → [Reactivate]                                                ││
│  │   Pending  → [Approve] [Reject]                                          ││
│  └──────────────────────────────────────────────────────────────────────────┘│
├──────────────────────────────────────────────────────────────────────────────┤
│  Tab Bar                                                                     │
│  ┌──────────────────────────────────────────────────────────────────────────┐│
│  │ [Overview] [Activity] [Related Records] [Documents] [Settings]           ││
│  └──────────────────────────────────────────────────────────────────────────┘│
├──────────────────────────────────────────────────────────────────────────────┤
│  ▼ Overview Tab Content (sequenced; profile is primary, others supporting)   │
│  ┌─────────────────────────────┬────────────────────────────────────────────┐│
│  │  Contact Details            │  Recent Activity (top 4 only — full       ││
│  │  [Primary on this tab]      │  list on Activity tab)                    ││
│  │                             │                                            ││
│  │  Name: Maria Gonzalez       │  Jun 14 · Added to PO #1012 by Evan       ││
│  │  Company: Acme Corp ▾       │  Jun 12 · Email sent: "Quote for apples"  ││
│  │  Role:    Buyer ▾           │  Jun 11 · Status changed: Inactive→Active ││
│  │  Email:   maria@acmecorp.co │  Jun 09 · Linked to Gamma LLC             ││
│  │  Phone:   (555) 234-5678    │                                            ││
│  │  Status:  Active ▾          │  [View all 47 activities →]               ││
│  │  Notes:   Primary contact.. │                                            ││
│  │                             │  Associated Records (collapsed by default; ││
│  │                             │  click to expand)                          ││
│  │                             │  ▸ Purchase Orders (12)                   ││
│  │                             │  ▸ Sales Orders (8)                       ││
│  │                             │  ▸ Companies (2)                          ││
│  └─────────────────────────────┴────────────────────────────────────────────┘│
├──────────────────────────────────────────────────────────────────────────────┤
│  ▼ Activity Tab (full timeline; primary surface when selected)               │
│  Filter: [All ▾]         Date range: [Last 90 days ▾]                        │
│  ● Jun 14, 2026  3:42 PM   Added to PO-1012 as Buyer · by Evan T.            │
│  ● Jun 12, 2026 10:15 AM   Email sent: "Quote for Roma Tomatoes" · Opened    │
│  ● Jun 11, 2026  9:00 AM   Status changed from Inactive to Active            │
│  [Load more activities]                                                      │
└──────────────────────────────────────────────────────────────────────────────┘
```

### State-Gated Action Surface

| Contact State | Visible Header Actions                       |
|---------------|----------------------------------------------|
| Active        | `Send Email`, `Call`, `Edit`, `Deactivate`   |
| Inactive      | `Reactivate`                                 |
| Pending       | `Approve`, `Reject`                          |

### Dimensions

| Component              | Width           | Height       | Notes                          |
|------------------------|-----------------|--------------|--------------------------------|
| Page max-width         | 1200px centered | —            | Single-entity detail view      |
| Back link              | auto            | 32px         | Inter 13px, muted, ← arrow     |
| Profile header         | 100%            | 80px sticky  | Avatar + info + actions        |
| Avatar                 | 48px × 48px     | —            | Circle, initials               |
| Status badge           | auto            | 24px         | Pill encoding state            |
| Tab bar                | 100%            | 44px         | Tab height 36px, bottom border |
| Overview layout        | 2 columns       | auto         | Left 380px, Right flex         |
| Contact Details card   | 380px           | auto         | Primary on Overview tab        |
| Activity card (Overview)| flex remaining | auto         | Top 4 only                     |
| Associated Records     | flex remaining  | auto         | Collapsed by default           |
| Activity timeline (tab)| 100%            | auto         | Full-width on Activity tab     |

### Interactive Elements

- **[← Back to Contacts]**: Returns; preserves filter/tab state if possible.
- **Profile Header avatar**: Click to upload/change photo.
- **Profile Header — Name**: Click to edit inline.
- **Profile Header — Company ▾**: ComboboxCellEditor.
- **Profile Header — Role ▾**: ComboboxCellEditor.
- **Profile Header status badge**: Click cycles state with modal confirmation for deactivation.
- **Profile Header — State-gated footer actions**: Only actions valid for current contact state are visible (see table).
- **Tab Bar — Overview**: Default; sequenced cards.
- **Tab Bar — Activity**: Full timeline (the primary surface when selected).
- **Tab Bar — Related Records**: Grouped tables.
- **Tab Bar — Documents**: File list; [+ Upload].
- **Tab Bar — Settings**: Contact preferences.
- **Contact Details card** (Overview tab primary): Inline-editable fields.
- **Recent Activity card** (Overview tab top 4): "View all →" navigates to Activity tab.
- **Associated Records card** (Overview tab, collapsed): Each entity section expands on click. Sequenced — Purchase Orders first, then Sales Orders, then Companies.
- **Activity tab**: Date-filtered timeline; presets (Last 7 days, Last 30 days, Last 90 days, Custom); "Load more" pagination.

### States Shown

- **Default (Overview)**: Sequenced cards; edit-in-place at rest.
- **Edit mode (Edit clicked)**: All fields editable; Save/Cancel at bottom of Contact Details card.
- **Saving**: Spinner; fields disabled; success toast.
- **Inline field editing**: Single field becomes input; others remain display.
- **Empty contact (new, no data)**: "Complete contact profile" banner; placeholder text.
- **No recent activity**: "No activity recorded yet."
- **No associated records**: "No linked records."
- **No documents**: "No documents. [Upload a file]"
- **Company not found in combobox**: "Add 'NewCo LLC' as new company."
- **Deactivating contact**: Modal: "Deactivate Maria Gonzalez? Existing records preserved."
- **Deleting contact**: Critical modal warning: "Delete Maria Gonzalez? This cannot be undone. Linked to 20 records. Consider deactivating instead."
- **Error saving**: Toast with retry.
- **Document upload in progress**: Progress bar.

### ARIA Annotations

- ← Back to Contacts: `role="link"`, `aria-label="Back to contacts list"`
- Profile Header: `role="banner"`, `aria-label="Contact profile header"`
- Avatar: `role="img"`, `aria-label="Maria Gonzalez avatar"`
- Status badge: `role="status"`, `aria-label="Status: Active"`
- State-gated action buttons: `role="button"` each with descriptive `aria-label`
- Tab Bar: `role="tablist"`, `aria-label="Contact profile sections"`
- Overview tab: `role="tab"`, `aria-selected="true"`, `aria-controls="panel-overview"`
- Overview panel: `role="tabpanel"`, `aria-label="Contact overview"`
- Contact Details card: `role="region"`, `aria-label="Contact details"`
- Name field (editable): `role="textbox"`, `aria-label="Contact name"`
- Company combobox: `role="combobox"`, `aria-label="Company"`
- Role combobox: `role="combobox"`, `aria-label="Role"`
- Notes textarea: `role="textbox"`, `aria-label="Contact notes"`, `aria-multiline="true"`
- Recent Activity card: `role="region"`, `aria-label="Recent activity"`
- Activity items: `role="list"`. Each: `role="listitem"`.
- Associated Records card: `role="region"`, `aria-label="Associated records"`
- Section toggle (▸/▼): `role="button"`, `aria-expanded`
- Document list: `role="list"`, `aria-label="Contact documents"`
- Document item: `role="listitem"`
- Save button (edit mode): `role="button"`, `aria-label="Save contact changes"`
- Activity timeline filter: `role="combobox"`, `aria-label="Filter activity by type"`
- Document upload progress: `role="progressbar"`, `aria-label="Uploading file"`

### Edge Cases Handled

- **No avatar set**: Initials placeholder.
- **Very long name**: Wraps to 2 lines max; truncated with tooltip.
- **Very long company name**: Ellipsis at 300px; tooltip.
- **Contact with no company**: "—" in header.
- **Contact with no email**: "No email on file"; Send Email action absent (state gating).
- **Contact with no phone**: "No phone on file"; Call action absent.
- **Long notes**: Scrollable 200px max-height; expand toggle if > 500 chars.
- **Activity with 500+ entries**: Paginated 50 at a time.
- **Related records across 50+ POs**: Section shows top 3; "View all →" navigates to filtered list.
- **Document upload exceeds limit**: Inline error.
- **Unsupported file type**: Inline error.
- **Concurrent edit by another user**: Toast and refresh.
- **Delete with active links**: Warning with count; suggests deactivation.
- **Inline edit escape**: Reverts to previous value.
- **Tab state in URL**: `/contacts/:id?tab=activity`; back button works.
- **Mobile (<768px)**: Single column; cards stack; header stacks vertically.
- **Keyboard navigation**: Tab through header → tab bar → content. Enter activates edit. Ctrl+S saves. Escape cancels.

### UX Compliance

| UX Rule | Status | Note |
|---------|--------|------|
| UX-1: Action visibility follows entity state | ✓ | Header actions per contact state. Send Email/Call absent if no contact info. |
| UX-2: Supporting info one click away, never zero | ✓ | Recent Activity top 4 on Overview; full Activity is one click. Associated Records collapsed. |
| UX-3: One primary surface per view | ✓ | Contact Details is the primary surface on Overview. Tab selection changes which slice is primary. |
| UX-4: Bulk actions appear only on selection | N/A | Single-entity view. |
| UX-5: Validation errors at point of impact | ✓ | Field-level errors at the field. |
| UX-6: Tools and forms in slide-overs; modals for confirmations | ✓ | Edit mode in-place. Deactivate/Delete modals. |
| UX-7: System never hides what mode the operator is in | ✓ | Sticky profile header, tab bar, status badge. |
| UX-8: State changes resolve in place | ✓ | Status transitions inline; no navigation. |
| UX-9: Filtering is fluid; navigation is durable | ✓ | Activity tab filters fluid; tab bar is durable mode switch within entity. |
| UX-10: Cell-level interactions save immediately; forms have explicit save | ✓ | Inline edits save on commit. Edit mode has explicit Save. |
| UX-11: URL is the session memory | ✓ | `/contacts/:id?tab=...` encodes tab. Browser back works. |
| UX-12: Empty states give the operator a next step | ✓ | Empty contact → complete profile banner. Empty activity → explanation. Empty documents → Upload CTA. |
