# Wireframe: WF-V-REFEREES — RefereesView

**Template:** GridView
**Entity:** Referee
**Wireframe ID:** WF-V-REFEREES

---

### UX Posture

The referees directory is the only primary surface. Status filter is a pill in the FilterToolbar. Profile, transactions, credits, and history live in the slide-over. Star ratings and contact links are at the row level for glanceable use.

---

## Full View — Default State (no selection)

```
┌─FilterToolbar────────────────────────────────────────────────────────────┐
│ [+ Add Referee] │ Status ▾ │ Data views │ Date │ Keyword │ Type │ Company│
│                 │ Sort ▾ │ Export ▾                                      │
└──────────────────────────────────────────────────────────────────────────┘
┌─KPI Line─────────────────────────────────────────────────────────────────┐
│ 487 referees · 312 active (64%) · $1.8M total credits · 4.2 avg rating   │
│                                                       [Show breakdown ▾] │
└──────────────────────────────────────────────────────────────────────────┘
┌─AG Grid (32px rows, checkboxes, sortable headers)────────────────────────┐
│ ☐ │ ID        │ Name               │ Type       │ Company          │ Status  │ Contact          │
├───┼───────────┼────────────────────┼────────────┼──────────────────┼─────────┼──────────────────┤
│ ☐ │ REF-0487  │ Marco Rivera       │ Inspector  │ USDA             │ Active  │ m.rivera@usda.gov│
│   │           │ ★★★★☆ (4.2)        │            │                  │         │ +1 (559) 555-0101│
│ ☐ │ REF-0486  │ Sarah Chen         │ Broker     │ FreshLink LLC    │ Active  │ sarah@freshlink..│
│ ☑ │ REF-0485  │ James Okonkwo      │ Inspector  │ PrimusGFS        │ Active  │ j.okonkwo@primus │
│ ☐ │ REF-0484  │ Ana Gutierrez      │ Surveyor   │ Independent      │ Active  │ ana.g@email.com  │
│ ☐ │ REF-0483  │ David Park         │ Auditor    │ SGS              │ Pending │ d.park@sgs.com   │
│ ☐ │ REF-0482  │ Lisa Tran          │ Inspector  │ NSF International│ Inactive│ —                │
│ ☐ │ REF-0481  │ Carl Johansson     │ Inspector  │ Eurofins         │ Active  │ carl.j@eurofins..│
└───┴───────────┴────────────────────┴────────────┴──────────────────┴─────────┴──────────────────┘
┌─BulkActionBar (appears only when rows selected)──────────────────────────┐
│ 1 referee selected                                                        │
│ [Assign to Inspection] [More ▾: Deactivate | Export | Edit Role]         │
└──────────────────────────────────────────────────────────────────────────┘
```

---

### State-Gated Action Surface

| Referee State | Visible Actions                                  |
|---------------|--------------------------------------------------|
| Active        | `Assign Inspection`, `Add Credit`, `Deactivate`  |
| Pending       | `Approve`, `Reject`, `Request More Info`         |
| Inactive      | `Reactivate`                                     |

---

## DetailSlideover — Tabs: Profile | Linked Transactions | Credits | History

Footer actions follow state-gating table.

---

## Dimensions

- View container: 100vw × 100vh
- FilterToolbar: 44px tall (plus 32px chip row)
- KPI line: 32px / ~96px expanded
- AG Grid: 32px row height; ID 110px; Name 220px (two-line with rating); Type 110px; Company 170px; Status 100px; Contact 200px (two-line: email + phone)
- Star rating: 16px stars inline with name
- BulkActionBar: 52px
- Slide-over: Peek 280px → Standard 420px → Wide 60vw
- Font: Inter 13px body, 11px secondary, 14px header, 24px credit balance

---

## Interactive Elements

- **[+ Add Referee]**: Opens creation form (slide-over). Fields: Name, Type, Company, Email, Phone, Certifications (multi-select), Specializations (tag input), Languages (tag input).
- **Status ▾ pill**: Multi-select with `Active (312)`, `Inactive (142)`, `Pending (33)`. Replaces prior ViewTabBar.
- **Star rating**: Inline with name. Stars filled proportionally. Hover → tooltip "4.2 average from 42 inspections."
- **Status cell**: ComboboxCellEditor (Active/Inactive/Pending). Inactive triggers modal confirmation.
- **Name cell**: Click → slide-over.
- **Contact cell**: Click email → mailto. Click phone → tel. Copy button on hover.
- **Row click**: Slide-over peek.
- **BulkActionBar Assign to Inspection**: Inspection assignment dialog.
- **BulkActionBar Deactivate**: Modal confirmation.
- **Profile tab — Edit Profile**: Inline editing.
- **Credits tab — Add Credit**: Form. Amount, reference, notes. Credit auto-applied.
- **Credits tab — Credit rows**: Click → navigates to linked transaction.
- **Linked Transactions tab**: Click row → navigates to inspection/order detail.
- **Rating recalculation**: Updates with animation when new inspection completed.

---

## States Shown

- **Default (no filter)**: Full directory; status dots indicate state.
- **Pending pre-selected**: Newly registered referees awaiting approval. "Approve" in row actions.
- **Inactive row**: Grey/dimmed.
- **Empty state**: "No referees yet." CTA: "Add your first referee."
- **New referee (no rating)**: Rating shows "—" with "New" badge.
- **High-value referee (>$5k credits)**: Star badge.
- **Deactivated referee with pending inspections**: Modal warning "2 pending inspections will need reassignment."
- **Certification expiring**: Warning badge if certification expires within 30 days.
- **Credit balance high**: Success-styled balance display.
- **Error state**: Toast for failed status change.

---

## ARIA Annotations

- FilterToolbar: `role="menubar"`, `aria-label="Referees filter toolbar"`
- Status ▾ pill: `role="combobox"`, `aria-haspopup="listbox"`, `aria-label="Filter by referee status"`, `aria-multiselectable="true"`
- KPI line: `role="status"`, `aria-live="polite"`, `aria-label="487 referees, 312 active at 64 percent, $1.8 million total credits, 4.2 average rating"`
- AG Grid: `role="grid"`, `aria-label="Referee records"`
- Star rating: `role="img"`, `aria-label="Rating: 4.2 out of 5 from 42 inspections"`
- Name cell: `role="gridcell"`, `aria-describedby` for rating details
- Status cell (editing): `role="combobox"`, `aria-haspopup="listbox"`
- Contact cell email: `role="link"`, `aria-label="Email [name]"`. Phone: `role="link"`, `aria-label="Call [name]"`
- BulkActionBar: `role="toolbar"`, `aria-label="Referee actions"`
- Slide-over: `role="dialog"`, `aria-label="Referee details"`
- Profile tab: `role="tabpanel"`, `aria-label="Referee profile"`
- Credits tab balance: `role="status"`, `aria-label="Credit balance: $1,200"`

---

## Edge Cases Handled

- **Referee with no contact info**: "No contact information."
- **Many certifications (10+)**: Scrollable; "Showing 10 of 14."
- **Assigned while deactivating**: Blocked: "Currently assigned to LOT-4412 inspection."
- **Duplicate referee detection**: On Add, if email matches: "Merge profiles?"
- **International phone numbers**: Country code formatted with flag emoji.
- **Referee with zero inspections (new)**: Rating "—"; "No inspections completed yet."
- **Negative credit balance**: Error styling; "Credits overdrawn."
- **Bulk deactivation with active assignments**: Modal listing active assignments; reassign or proceed.
- **Certification expiration bulk view**: Filter preset "Expiring Certifications."
- **Multiple referees from same company**: "Same Company" grouping indicator.

---

### UX Compliance

| UX Rule | Status | Note |
|---------|--------|------|
| UX-1: Action visibility follows entity state | ✓ | Approve only Pending; Reactivate only Inactive; Add Credit only Active. |
| UX-2: Supporting info one click away, never zero | ✓ | Profile, Linked Transactions, Credits, History as slide-over tabs. |
| UX-3: One primary surface per view | ✓ | Referees table is the only primary surface. |
| UX-4: Bulk actions appear only on selection | ✓ | BulkActionBar slides up only on selection. |
| UX-5: Validation errors at point of impact | ✓ | Certification expiry warning at the row. |
| UX-6: Tools and forms in slide-overs; modals for confirmations | ✓ | Add Referee in slide-over. Deactivate modal. |
| UX-7: System never hides what mode the operator is in | ✓ | Filter pills, slide-over header, status dots. |
| UX-8: State changes resolve in place | ✓ | Status transitions inline. |
| UX-9: Filtering is fluid; navigation is durable | ✓ | Status ▾ pill replaces tab bar. |
| UX-10: Cell-level interactions save immediately; forms have explicit save | ✓ | Cell edits save. Add Referee form explicit. |
| UX-11: URL is the session memory | ✓ | Filters, slide-over ID encode into URL. |
| UX-12: Empty states give the operator a next step | ✓ | Empty → Add Referee CTA. Empty filtered → Clear filters. |
