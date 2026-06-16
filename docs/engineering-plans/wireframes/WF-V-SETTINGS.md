## Wireframe: WF-V-SETTINGS — SettingsView (Tabbed Full-Page with Sidebar)

### UX Posture

Settings is a multi-section management view. The sidebar selects which section is the primary surface; within each section, cards are sequenced (not competing). Per UX-3, "one primary surface per view" applies as: the active sidebar selection sets the primary section; cards within are stacked vertically with the most-edited card first. Edit mode is per-card to avoid mode-switching the entire page. Settings menu items are role-gated.

### Layout (ASCII)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  Page Title (minimal): "Settings"                                            │
├────────────────────────────┬─────────────────────────────────────────────────┤
│  Settings Sidebar          │  ▼ General Tab Content (primary section)        │
│  ┌──────────────────────┐  │  ┌─────────────────────────────────────────────┐│
│  │  General          ●  │  │  │  Company Profile                        [✏] ││
│  │  Users & Permissions │  │  │  Company Name: Terp Agro Wholesale       [✏]││
│  │  Workflows           │  │  │  Logo:  [🏢 Logo Preview]  [Upload]         ││
│  │  Integrations        │  │  │  Default Currency: USD ▾                    ││
│  │  Billing             │  │  │  Timezone: America/Chicago ▾                ││
│  │  Audit Log           │  │  │  Date Format: MM/DD/YYYY ▾                  ││
│  │  (role-gated entries │  │  └─────────────────────────────────────────────┘│
│  │  hidden for          │  │  ┌─────────────────────────────────────────────┐│
│  │  non-admins)         │  │  │  Defaults                              [✏]  ││
│  │                      │  │  │  Default PO Terms:  Net 30 ▾                ││
│  │                      │  │  │  Default Sales Terms: Net 15 ▾              ││
│  │                      │  │  │  Default Warehouse:  Main Warehouse ▾       ││
│  │                      │  │  │  Default Unit:      Case (cs) ▾             ││
│  │                      │  │  │  Tax Rate (%):      8.25    [✏]             ││
│  │                      │  │  └─────────────────────────────────────────────┘│
│  │                      │  │  ┌─────────────────────────────────────────────┐│
│  │                      │  │  │  Regional Settings                     [✏]  ││
│  │                      │  │  │  Language:  English (US) ▾                  ││
│  │                      │  │  │  Number Format: 1,234.56 ▾                  ││
│  │                      │  │  │  Week Starts: Sunday ▾                      ││
│  │                      │  │  └─────────────────────────────────────────────┘│
│  └──────────────────────┘  │                                                 │
└────────────────────────────┴─────────────────────────────────────────────────┘

Users & Permissions tab (when selected, becomes the primary section):
  Users table (primary card on this tab)
  Roles table (secondary card)

Workflows / Integrations / Billing / Audit Log tabs: similar pattern —
each tab makes one section primary; cards within are sequenced.
```

### State-Gated Action Surface

Edit actions are per-card. Per-card footer shows `[Save]` and `[Cancel]` only when the card is in edit mode. The page never enters a global "edit mode" — each card is independent.

| Sidebar Item        | Role Gating          |
|---------------------|----------------------|
| General             | All users            |
| Users & Permissions | Admin / Manager only |
| Workflows           | Admin / Manager only |
| Integrations        | Admin only           |
| Billing             | Admin only           |
| Audit Log           | Admin only           |

Sidebar items hidden entirely for roles that lack permission (UX-1 + UX-7).

### Dimensions

| Component              | Width           | Height       | Notes                          |
|------------------------|-----------------|--------------|--------------------------------|
| Page max-width         | 1200px          | —            | Full-page settings layout      |
| Page title             | 100%            | 40px         | Minimal — Inter 18px           |
| Settings sidebar       | 240px           | 100% vh-40px | Fixed left, border-right       |
| Sidebar item           | 240px           | 40px         | Inter 13px, 12px padding       |
| Sidebar active item    | —               | —            | Left accent bar 3px, bold      |
| Content area           | flex remaining  | 100%         | 32px padding, scrollable       |
| Settings card          | 100%            | auto         | 16px padding, 8px border-radius|
| Card header            | 100%            | 36px         | Inter 15px semibold + [✏] edit |
| Setting field row      | 100%            | 40px         | Label 180px + value flex       |
| Users table            | 100%            | auto         | Row height 44px                |
| Roles table            | 100%            | auto         | Row height 48px                |

### Interactive Elements

- **Settings Sidebar**:
  - **[General]**: Active by default; shows Company Profile, Defaults, Regional Settings cards (sequenced).
  - **[Users & Permissions]**: Users table is primary; Roles table secondary.
  - **[Workflows]**: Workflow configuration cards — PO approval chain, Sales workflow, Intake verification, Payment approval.
  - **[Integrations]**: Connected integrations as cards with status indicator.
  - **[Billing]**: Subscription plan, usage meters, payment method, invoice history.
  - **[Audit Log]**: Full audit trail table with filters and export.
  - Sidebar items navigate; active item has accent bar.
- **[✏] edit icon on card header**: Toggles only that card into edit mode (per UX-3 — page never enters global edit mode).
- **Save / Cancel buttons on card footer** (edit mode only): Save commits; Cancel discards.
- **Company Name field**: Click to edit inline.
- **Logo upload**: Click [Upload] opens file picker; drag-and-drop also supported.
- **Currency / Timezone / Date Format / Terms / Warehouse / Unit / Language / Number Format / Week Starts**: All ComboboxCellEditor.
- **Tax Rate**: Numeric input with % suffix; validation 0-100.
- **[+ Add User]**: Opens modal — Email (required), Name, Role, invitation email checkbox.
- **User row [···]**: Kebab menu — "Edit Role", "Resend Invite" (if Pending), "Deactivate", "Remove". All state-gated.
- **[+ Add Role]**: Opens modal — Role name, permission checkboxes grouped by module.
- **Role row [···]**: "Edit", "Duplicate", "Delete" (absent if users assigned, per state-gating UX-1).
- **Workflows**: Per-workflow toggle on/off; threshold inputs; approver dropdowns.
- **Integrations [Connect]/[Disconnect]**: Per-integration card; status indicator.
- **API Keys [Generate New Key]**: Generates new key; shown once.
- **Audit Log [Export]**: CSV export with filters applied.

### States Shown

- **General — Default (view mode)**: Cards show field values read-only; [✏] icons on headers.
- **General — Edit mode (single card)**: That card's fields editable; Save/Cancel at card bottom; card accent border.
- **Saving (per card)**: Save spinner; fields disabled; success toast.
- **Unsaved changes warning (navigation away)**: Modal confirmation if sidebar item clicked with unsaved card.
- **Logo upload**: Preview updates optimistically; error toast on failure.
- **Users — Empty**: "Invite your first team member" CTA.
- **Users — Pending invite**: Warning badge "Pending"; `Resend Invite` available.
- **Roles — Delete blocked**: Action absent (state gating): "Cannot delete: 3 users assigned."
- **API Key — New key generated**: Modal shows key once with copy button; warning banner.
- **Integration — Connection error**: Warning status; "Connection error" with retry/reconfigure.
- **Audit Log — Filtered empty**: "No audit entries match filters. [Clear filters]"
- **Audit Log — Export large dataset**: Progress bar with cancel.
- **Billing — Past due**: Error banner at top.
- **Error saving**: Toast with retry.

### ARIA Annotations

- Page title: `role="heading"`, `aria-level="1"`, `aria-label="Settings"`
- Settings sidebar: `role="navigation"`, `aria-label="Settings categories"`
- Sidebar item [General]: `role="link"`, `aria-current="page"` when active
- Settings cards: `role="region"` with `aria-label` matching card title
- [✏] edit icon: `role="button"`, `aria-label="Edit company profile settings"`, `aria-pressed="true"` in edit mode
- Field combobox: `role="combobox"`, `aria-label="..."`, `aria-expanded="false"`
- Tax Rate input: `role="spinbutton"`, `aria-valuemin="0"`, `aria-valuemax="100"`, `aria-valuenow="8.25"`
- Save button: `role="button"`, `aria-label="Save settings"`
- Cancel button: `role="button"`, `aria-label="Discard settings changes"`
- Users table: `role="table"`, `aria-label="Users list"`
- Roles table: `role="table"`, `aria-label="Roles list"`
- [+ Add User]: `role="button"`, `aria-label="Add new user"`, `aria-haspopup="dialog"`
- User row [···]: `role="button"`, `aria-label="Actions for Maria Gonzalez"`, `aria-haspopup="menu"`
- Integration card status: `role="status"`, `aria-label="QuickBooks: Connected"`
- Audit Log table: `role="table"`, `aria-label="Audit log"`, `aria-sort="descending"` on timestamp
- [⬇ Export Audit Log]: `role="button"`, `aria-label="Export audit log to CSV"`
- Unsaved dialog: `role="alertdialog"`, `aria-label="Unsaved changes"`

### Edge Cases Handled

- **Sidebar navigation with unsaved changes**: Modal confirmation.
- **Very long company name**: Truncated; tooltip; full text editable in edit mode.
- **Logo file too large**: Inline error.
- **Logo in wrong format**: Inline error.
- **Timezone not found in search**: Filtered list with fallback.
- **Tax rate over 100%**: Inline validation; field error border.
- **User invite to existing email**: Modal error with link to existing user.
- **User invite to invalid email**: Inline validation.
- **Remove last Owner**: Modal warning blocks operation.
- **Delete role with assigned users**: Action absent (state gating).
- **API Key — last key deleted / no keys**: "Generate your first key" CTA.
- **Integration connection timeout**: Error state with retry.
- **Audit Log — very large date range**: Warning if > 1 year.
- **Billing — no payment method**: CTA card.
- **Concurrent settings edit**: Optimistic save; conflict toast.
- **Mobile (<768px)**: Sidebar collapses to horizontal scroll or hamburger.
- **Keyboard navigation**: Tab through sidebar → content. Enter toggles edit. Escape cancels. Ctrl+S saves.

### UX Compliance

| UX Rule | Status | Note |
|---------|--------|------|
| UX-1: Action visibility follows entity state | ✓ | Resend Invite only Pending; Reactivate only Inactive; Delete Role absent if users assigned. Sidebar items role-gated. |
| UX-2: Supporting info one click away, never zero | ✓ | Sidebar selects which section is primary. Each card has progressive disclosure via [✏] edit. |
| UX-3: One primary surface per view | ✓ | Active sidebar selection drives primary section. Cards within sequenced, not competing. Per-card edit mode keeps the page never globally "in edit mode." |
| UX-4: Bulk actions appear only on selection | N/A | Mostly single-entity management. Bulk applies to Users table only and follows the same rule. |
| UX-5: Validation errors at point of impact | ✓ | Tax rate validation at field. Past due banner at top of Billing tab only. |
| UX-6: Tools and forms in slide-overs; modals for confirmations | ✓ | Add User/Role in modals (they're dialog-shaped). Unsaved changes confirmation modal. Sensitive operations (Delete) modal. |
| UX-7: System never hides what mode the operator is in | ✓ | Sidebar active item indicator. Card edit mode accent border. Role-gated items hidden entirely. |
| UX-8: State changes resolve in place | ✓ | Saves update cards inline. No navigation. |
| UX-9: Filtering is fluid; navigation is durable | ✓ | Audit log filters fluid. Sidebar nav durable. |
| UX-10: Cell-level interactions save immediately; forms have explicit save | ✓ | Per-card edit mode has explicit Save. Single-field comboboxes save on commit when not in edit mode (where appropriate). |
| UX-11: URL is the session memory | ✓ | Active sidebar item encodes into URL `/settings/{section}`. Browser back returns to previous section. |
| UX-12: Empty states give the operator a next step | ✓ | Empty users → invite CTA. Empty API keys → generate CTA. Empty integration → connect CTA. Empty audit filter → Clear filters. |
