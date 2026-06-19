## Wireframe: WF-V-CONTACTS — ContactsView (GridView)

### UX Posture

The contacts table is the only primary surface. Status filter is a pill in the FilterToolbar (no ViewTabBar). Profile, associated records, activity and history all live in the slide-over.

### Layout (ASCII)

```
┌─FilterToolbar───────────────────────────────────────────────────────────────┐
│  [+ New Contact ▾] │ Status ▾ │ Data views │ Keyword │ Company │ Role │   │
│                    │ Sort ▾ │ Export ▾                                     │
│  [✕ company:acme-corp] [✕ role:buyer] [✕ status:active]                    │
├─KPI Line────────────────────────────────────────────────────────────────────┤
│  312 contacts · 18 companies · 4 roles · 12 new this month                  │
│                                                       [Show breakdown ▾]    │
├─AG Grid Table───────────────────────────────────────────────────────────────┤
│  ┌──────┬──────────┬────────────────────┬──────────────┬──────────┬────────┐│
│  │  ☐   │ ID       │ Name               │ Company      │ Role     │ Status │
│  ├──────┼──────────┼────────────────────┼──────────────┼──────────┼────────┤│
│  │  ☐   │ CON-0042 │ Maria Gonzalez     │ Acme Corp    │ Buyer    │ Active │
│  │  ☑   │ CON-0038 │ James Chen         │ Beta Inc     │ Mgr      │ Active │
│  │  ☐   │ CON-0051 │ Sarah Williams     │ Gamma LLC    │ Owner    │ Active │
│  │  ☐   │ CON-0033 │ David Park         │ Delta Corp   │ A/P      │Inactive│
│  │  ☑   │ CON-0047 │ Lisa Thompson      │ Epsilon Inc  │ Broker   │ Active │
│  │  ☐   │ CON-0029 │ Robert Kim         │ Zeta LLC     │ Dispatch │ Active │
│  │  ☐   │ CON-0055 │ Amanda Foster      │ Acme Corp    │ Buyer    │ Active │
│  └──────┴──────────┴────────────────────┴──────────────┴──────────┴────────┘│
│                       (row height: 32px Mercury standard)                    │
├─BulkActionBar (appears only when rows selected)─────────────────────────────┤
│  2 selected   [Email] [More ▾: Edit Role | Add Tag | Export | Deactivate]  │
└─────────────────────────────────────────────────────────────────────────────┘

Detail Slide-over (right, 420px, opens on row click):
  Tabs: Profile | Associated Records | Activity | History
  Footer actions (state-gated):
    Active   → [Edit Contact] [Send Email] [Call] [Deactivate]
    Inactive → [Reactivate]
```

### State-Gated Action Surface

| Contact State | Visible Actions                          |
|---------------|------------------------------------------|
| Active        | `Edit Contact`, `Send Email`, `Call`, `Deactivate` |
| Inactive      | `Reactivate`                             |

### Dimensions

| Component              | Width           | Height       | Notes                          |
|------------------------|-----------------|--------------|--------------------------------|
| FilterToolbar          | 100%            | 44px + 32px  | Menubar + active-chip row      |
| KPI line               | 100%            | 32px / ~96px expanded | Inter 13px |
| AG Grid Table          | 100%            | fills remain | Row height 32px                |
| BulkActionBar          | 100%            | 48px         | Slide-up, fixed bottom         |
| Slide-over             | 420px standard  | 100% vh      | 280px peek mode                |
| Avatar placeholder     | 48px × 48px     | —            | Circle, initials               |

### Interactive Elements

- **[+ New Contact ▾]**: Split button — opens contact creation slide-over.
- **Status ▾ pill**: Multi-select with `Active (287)`, `Inactive (25)`. Replaces prior ViewTabBar.
- **Company ▾**: Multi-select; searchable.
- **Role ▾**: Buyer, Manager, Owner, A/P, Broker, Dispatch, Sales Rep, Warehouse, Driver.
- **⋮ Actions**: State-gated context menu.
- **Slide-over tabs**: Profile, Associated Records, Activity, History.
- **Profile tab**: Avatar (initials, 48px circle). Inline-editable fields: Name, Company ▾, Role ▾, Email, Phone, Status toggle, Notes.

### States Shown

- **Default**: Contacts table only. Status ▾ defaults to Active.
- **Filtering**: Active chips appear.
- **Bulk selected**: BulkActionBar slides up.
- **Inactive contact row**: Dimmed text (50% opacity).
- **Slide-over peek (280px)**: Avatar, name, company, role, status, email, phone.
- **Slide-over standard (420px)**: Full detail with tabs.
- **Slide-over with unsaved changes**: Confirmation dialog on close.
- **Company combobox open**: Searchable dropdown; "Add new company…" at bottom.
- **Empty notes field**: Placeholder "No notes yet. [Add note]"
- **No associated records**: Tab shows empty state per entity type.
- **No activity history**: Timeline shows "No activity recorded."
- **Error**: Toast.
- **Deactivate confirmation**: Modal — "Deactivate Maria Gonzalez? Existing associations preserved."

### ARIA Annotations

- FilterToolbar: `role="menubar"`, `aria-label="Contacts filter toolbar"`
- Status ▾ pill: `role="combobox"`, `aria-haspopup="listbox"`, `aria-label="Filter by contact status"`, `aria-multiselectable="true"`
- KPI line: `role="status"`, `aria-live="polite"`, `aria-label="312 contacts, 18 companies, 4 roles"`
- AG Grid Table: `role="grid"`, `aria-label="Contacts table"`, `aria-rowcount="312"`, `aria-multiselectable="true"`
- ⋮ Actions: `role="button"`, `aria-label="More actions for Maria Gonzalez"`, `aria-haspopup="menu"`
- BulkActionBar: `role="toolbar"`, `aria-label="Bulk actions for 2 selected contacts"`
- Slide-over: `role="dialog"`, `aria-label="Contact Maria Gonzalez details"`, `aria-modal="false"`
- Slide-over tabs: `role="tablist"`, `aria-label="Contact detail sections"`
- Avatar: `role="img"`, `aria-label="Maria Gonzalez avatar"`
- Company combobox: `role="combobox"`, `aria-label="Company"`
- Role combobox: `role="combobox"`, `aria-label="Role"`
- Notes textarea: `role="textbox"`, `aria-label="Contact notes"`, `aria-multiline="true"`

### Edge Cases Handled

- **Zero contacts**: Empty state with "Add your first contact" CTA.
- **Zero filtered results**: "No contacts match" with "Clear filters".
- **Contact with no company**: Company cell shows "—"; filterable under "(No Company)".
- **Contact with multiple phone numbers**: Primary in grid; all numbers in slide-over.
- **Very long email addresses**: Truncated with tooltip.
- **Contact linked to zero records**: Tab shows empty per entity.
- **Duplicate contact detection**: Warning banner "Possible duplicate: CON-0047 has same email."
- **Bulk email with no addresses**: Email action accounts for selected without email.
- **Merge duplicates**: Navigates to MergeCandidatesView with pre-selected.
- **Concurrent edit conflict**: Optimistic save; rollback with toast.
- **Company combobox with 200+ companies**: Searchable; scrollable.

### UX Compliance

| UX Rule | Status | Note |
|---------|--------|------|
| UX-1: Action visibility follows entity state | ✓ | Active vs Inactive footer actions. |
| UX-2: Supporting info one click away, never zero | ✓ | Associated records, activity, history as slide-over tabs. |
| UX-3: One primary surface per view | ✓ | Contacts table is the only primary surface. |
| UX-4: Bulk actions appear only on selection | ✓ | BulkActionBar slides up only on selection. |
| UX-5: Validation errors at point of impact | ✓ | Cell-level errors at cell. |
| UX-6: Tools and forms in slide-overs; modals for confirmations | ✓ | Contact creation in slide-over. Deactivate modal. |
| UX-7: System never hides what mode the operator is in | ✓ | Filter pills, slide-over header. |
| UX-8: State changes resolve in place | ✓ | Status transitions inline. |
| UX-9: Filtering is fluid; navigation is durable | ✓ | Status ▾ pill replaces tab bar. |
| UX-10: Cell-level interactions save immediately; forms have explicit save | ✓ | Cell edits save. Contact form explicit. |
| UX-11: URL is the session memory | ✓ | Filters, slide-over ID encode into URL. |
| UX-12: Empty states give the operator a next step | ✓ | Empty → Add Contact CTA. Empty filtered → Clear filters. |
