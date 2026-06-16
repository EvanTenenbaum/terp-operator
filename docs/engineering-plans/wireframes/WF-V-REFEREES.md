# Wireframe: WF-V-REFEREES — RefereesView

**Template:** GridView
**Entity:** Referee
**Wireframe ID:** WF-V-REFEREES

---

## Full View — Default State (Tab: All, No Selection)

```
┌─View Header──────────────────────────────────────────────────────────────┐
│ Referees                                                      [Add Referee]│
└───────────────────────────────────────────────────────────────────────────┘
┌─FilterToolbar────────────────────────────────────────────────────────────┐
│ [▾ Data views]  │  Date ▾  │  Keyword ▾  │  Type ▾  │ Company ▾  │ Sort ▾ │ ⬇ │
└───────────────────────────────────────────────────────────────────────────┘
┌─GridSummaryStrip─────────────────────────────────────────────────────────┐
│ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐      │
│ │ 487 Referees │ │ 312 Active   │ │ $1.8M Total  │ │ 4.2 Avg      │      │
│ │    Total     │ │    64% Rate  │ │   Credits    │ │   Rating     │      │
│ └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘      │
└───────────────────────────────────────────────────────────────────────────┘
┌─ViewTabBar───────────────────────────────────────────────────────────────┐
│  All (487) │ Active (312) │ Inactive (142) │ Pending (33)                 │
└───────────────────────────────────────────────────────────────────────────┘
┌─AG Grid (32px rows, checkboxes, sortable headers)────────────────────────┐
│ ☐ │ ID        │ Name               │ Type       │ Company          │ Status  │ Contact          │
├───┼───────────┼────────────────────┼────────────┼──────────────────┼─────────┼──────────────────┤
│ ☐ │ REF-0487  │ Marco Rivera       │ Inspector  │ USDA             │ Active  │ m.rivera@usda.gov│
│   │           │ ★★★★☆ (4.2)       │            │                  │         │ +1 (559) 555-0101│
│ ☐ │ REF-0486  │ Sarah Chen         │ Broker     │ FreshLink LLC    │ Active  │ sarah@freshlink..│
│   │           │ ★★★★★ (4.8)       │            │                  │         │ +1 (415) 555-0142│
│ ☑ │ REF-0485  │ James Okonkwo      │ Inspector  │ PrimusGFS        │ Active  │ j.okonkwo@primus │
│   │           │ ★★★★☆ (4.1)       │            │                  │         │ +1 (209) 555-0178│
│ ☐ │ REF-0484  │ Ana Gutierrez      │ Surveyor   │ Independent      │ Active  │ ana.g@email.com  │
│   │           │ ★★★☆☆ (3.7)       │            │                  │         │ +1 (661) 555-0134│
│ ☐ │ REF-0483  │ David Park         │ Auditor    │ SGS              │ Pending │ d.park@sgs.com   │
│   │           │ — (new)            │            │                  │         │ +1 (310) 555-0199│
│ ☐ │ REF-0482  │ Lisa Tran          │ Inspector  │ NSF International│ Inactive│ —                │
│   │           │ ★★★★☆ (4.0)       │            │                  │         │                  │
│ ☐ │ REF-0481  │ Carl Johansson     │ Inspector  │ Eurofins         │ Active  │ carl.j@eurofins..│
│   │           │ ★★★★★ (4.6)       │            │                  │         │ +46 70 555 0123  │
└───┴───────────┴────────────────────┴────────────┴──────────────────┴─────────┴──────────────────┘
┌─BulkActionBar (conditional)──────────────────────────────────────────────┐
│ 1 referee selected                                                        │
│ [View Profile] [Assign to Inspection] [Deactivate] [Export]               │
└───────────────────────────────────────────────────────────────────────────┘
┌─DetailSlideover: Peek (280px)────────────────────────────────────────────┐
│ REF-0485                                             ×                   │
│ James Okonkwo · Inspector                                                 │
│ PrimusGFS                                                                │
│ ★★★★☆ 4.1 · 42 inspections                                              │
│ Credit Balance: $1,200                                                   │
│ Status: Active                                                           │
│ [View Profile] [Assign Inspection]                                       │
│ ◀ drag                                                                    │
└───────────────────────────────────────────────────────────────────────────┘
```

---

## DetailSlideover: Standard (420px) — Credits Tab

```
┌─Main Content (shifts left)───────────────────┬─DetailSlideover: Standard─┐
│                                               │ REF-0485                   │
│  [Grid is narrower, fully functional]         │ James Okonkwo              │
│                                               │ Inspector · PrimusGFS      │
│                                               │ ★★★★☆ 4.1 · 42 inspections│
│                                               │ [View Profile] [Assign]    │
│                                               │────────────────────────────│
│                                               │ Profile│ Trans│ Cred│ His  │
│                                               │        │      │  ▾  │      │
│                                               │────────────────────────────│
│                                               │ Credit Account:            │
│                                               │ ┌────────────────────────┐ │
│                                               │ │ Balance    $1,200.00   │ │
│                                               │ │ Pending    $350.00     │ │
│                                               │ │ Total      $1,550.00   │ │
│                                               │ │ Last Used  Jun 12 2026 │ │
│                                               │ └────────────────────────┘ │
│                                               │ Recent Credits:            │
│                                               │ ┌────────────────────────┐ │
│                                               │ │ Jun 12  +$350  Pending │ │
│                                               │ │   Lot 4412 inspection  │ │
│                                               │ │ May 28  +$200  Applied │ │
│                                               │ │   SO-7621 quality ck   │ │
│                                               │ │ May 15  +$500  Applied │ │
│                                               │ │   PO-8741 pre-shipment │ │
│                                               │ │ Apr 30  +$150  Applied │ │
│                                               │ │   LOT-4300 arrival insp│ │
│                                               │ └────────────────────────┘ │
│                                               │ [Add Credit] [View All →]  │
└───────────────────────────────────────────────┴────────────────────────────┘
```

---

## DetailSlideover — Profile Tab

```
│ Profile│ Trans│ Cred│ His  │
│    ▾    │      │     │      │
│────────────────────────────│
│ ┌────────────────────────┐ │
│ │ James Okonkwo          │ │
│ │ j.okonkwo@primusgfs.com│ │
│ │ +1 (209) 555-0178      │ │
│ │ Fresno, CA · USA       │ │
│ │ Languages: English,    │ │
│ │   Igbo, Spanish        │ │
│ └────────────────────────┘ │
│ Certifications:            │
│ ┌────────────────────────┐ │
│ │ ✓ PrimusGFS Auditor    │ │
│ │ ✓ HACCP Certified      │ │
│ │ ✓ Organic Inspector    │ │
│ │ ✓ FSMA Preventive Ctrl │ │
│ └────────────────────────┘ │
│ Specializations:           │
│ ┌────────────────────────┐ │
│ │ • Fresh produce        │ │
│ │ • Cold chain           │ │
│ │ • Organic compliance   │ │
│ │ • Food safety audits   │ │
│ └────────────────────────┘ │
│ [Edit Profile]             │
```

---

## DetailSlideover — Linked Transactions Tab

```
│ Profile│ Trans│ Cred│ His  │
│        │  ▾   │     │      │
│────────────────────────────│
│ Inspections (42):          │
│ ┌────────────────────────┐ │
│ │ Jun 12  LOT-4412       │ │
│ │   Strawberries · Pass  │ │
│ │ Jun 08  PO-8843        │ │
│ │   Mixed veg · Pass     │ │
│ │ May 28  SO-7621        │ │
│ │   Citrus · Pass*       │ │
│ │   *minor finding        │ │
│ │ ... 39 more            │ │
│ │ [View All Inspections] │ │
│ └────────────────────────┘ │
│ Quality Checks (18):       │
│ ┌────────────────────────┐ │
│ │ May 15  PO-8741        │ │
│ │   Apples · Grade A     │ │
│ │ ... 17 more            │ │
│ └────────────────────────┘ │
```

---

## Dimensions

- View container: 100vw × 100vh
- View Header: 56px tall. [Add Referee] button.
- FilterToolbar: 44px tall. Type quick filter: Inspector/Broker/Surveyor/Auditor/Other. Company filter: autocomplete.
- GridSummaryStrip: 80px tall, 4 metric cards.
- ViewTabBar: 40px tall. Tabs 130px wide.
- AG Grid: 32px row height. ID column 110px. Name column 220px (two-line: name + rating stars). Type column 110px. Company column 170px. Status column 100px. Contact column 200px (two-line: email + phone).
- Star rating: 16px star characters. Inline with name.
- Credit Balance (detail): Large number display. "Balance $1,200.00" in Inter 24px.
- Profile certifications: 28px rows. Checkmark + certification name.
- Specializations: 24px rows. Bullet + text.
- Linked Transactions: 48px rows. Date + ID + description + result.
- BulkActionBar: 52px tall.
- DetailSlideover: Peek 280px → Standard 420px → Wide 60vw.
- Font: Inter 13px body, 11px secondary, 14px header, 24px credit balance.

---

## Interactive Elements

- **Star rating:** Displayed inline. Stars filled proportionally (4.2 = 4 filled + 1 fifth-filled). Hover: tooltip "4.2 average from 42 inspections." ARIA: role="img", aria-label="Rating: 4.2 out of 5 from 42 inspections."
- **Status cell:** Double-click → ComboboxCellEditor (Active/Inactive/Pending). Inactive triggers confirmation: "Deactivate Marco Rivera? They will not appear in inspection assignments."
- **Name cell:** Click → opens profile view. Double-click → DetailSlideover standard.
- **Contact cell:** Click email → mailto link. Click phone → tel link. Copy button on hover.
- **Row click:** Single-click → DetailSlideover peek. Double-click → standard.
- **Add Referee button:** Opens creation form. Fields: Name, Type dropdown, Company, Email, Phone, Certifications (multi-select), Specializations (tag input), Languages (tag input).
- **BulkActionBar Assign to Inspection:** Opens inspection assignment dialog. Select inspection from list or create new.
- **BulkActionBar Deactivate:** Sets selected referees to Inactive. Confirmation with count. "Deactivate 3 referees?"
- **BulkActionBar Export:** Exports referee list as CSV/Excel. Includes all visible columns + certifications.
- **Profile tab — Edit Profile:** Inline editing. All fields editable. Certifications: multi-select combobox.
- **Credits tab — Add Credit:** Opens credit issuance form. Amount, reference (inspection/order ID), notes. Credit auto-applied to referee balance.
- **Credits tab — Credit rows:** Click → navigates to linked transaction. Hover: tooltip with full notes.
- **Linked Transactions tab:** Click row → navigates to inspection/order detail. Paginated if >10.
- **Rating recalculation:** Triggered when new inspection completed. Rating updates with animation (count-up effect).

---

## States Shown

- **Default (All tab):** Full referee directory. Active referees have green status dot. Pending have amber dot. Inactive have grey dot.
- **Pending tab:** Only newly registered referees awaiting approval. "Approve" button in row actions.
- **Inactive tab:** Greyed rows. "Reactivate" action available. Shows deactivation date.
- **Empty state:** "No referees yet." CTA: "Add your first referee." Import referees from CSV link.
- **New referee (no rating):** Rating shows "—" with "New" badge. Rating updates after first inspection.
- **High-value referee (total credits >$5k):** Star badge on row. "Top Referee" label in detail.
- **Deactivated referee with pending inspections:** Warning on deactivation. "2 pending inspections will need reassignment."
- **Certification expiring:** Amber warning badge if certification expires within 30 days. "PrimusGFS Auditor expires Jul 15, 2026."
- **Credit balance zero/near-zero:** Grey balance display. "No credits available."
- **Credit balance high:** Green balance display. "Credits available for future inspections."
- **Error state:** Toast for failed status change. Network error on profile save.

---

## ARIA Annotations

- View container: role="region", aria-label="Referees directory"
- FilterToolbar: role="menubar", aria-label="Filter and data controls"
- GridSummaryStrip: role="region", aria-label="Referee summary metrics"
- ViewTabBar: role="tablist", aria-label="Referee status filters"
- AG Grid: role="grid", aria-label="Referee records"
- Row: role="row", aria-selected, aria-expanded
- Star rating: role="img", aria-label="Rating: [value] out of 5 from [count] inspections"
- Name cell: role="gridcell". Name text: aria-label="Referee name". Rating: aria-describedby for rating details.
- Status cell: role="gridcell". Status dot: aria-hidden="true". Status text is semantic.
- Status cell (editing): role="combobox", aria-haspopup="listbox"
- Contact cell: email as role="link", aria-label="Email [name]". Phone as role="link", aria-label="Call [name]"
- BulkActionBar: role="toolbar", aria-label="Referee actions"
- DetailSlideover: role="complementary", aria-label="Referee details"
- Profile tab: role="tabpanel", aria-label="Referee profile"
- Certifications: role="list", aria-label="Certifications". Items: role="listitem"
- Specializations: role="list", aria-label="Specializations"
- Credits tab: role="tabpanel", aria-label="Credit account". Balance: role="status", aria-label="Credit balance: $1,200"
- Credit rows: role="row". Amount: aria-label="Credit of $350 — pending"
- Linked Transactions tab: role="tabpanel", aria-label="Linked inspections and quality checks"
- History tab: role="tabpanel", aria-label="Referee activity history"

---

## Edge Cases Handled

- **Referee with no contact info:** "No contact information" shown in muted text. Edit Profile to add.
- **Referee with multiple certifications (10+):** Profile tab scrollable. "Showing 10 of 14 certifications." Expand link.
- **Referee assigned to inspection while being deactivated:** Deactivation blocked. Toast: "Cannot deactivate — currently assigned to LOT-4412 inspection."
- **Duplicate referee detection:** On Add Referee, if email matches existing: "A referee with this email already exists. Merge profiles?" option.
- **International phone numbers:** Formatted with country code. Flag emoji next to non-US numbers for quick visual identification.
- **Referee with zero inspections (new):** Rating shows "—" not "0". "No inspections completed yet." Profile Tab shows registration date.
- **Referee with negative credit balance:** Red balance display. "Credits overdrawn — $150.00." Tooltip: "Referee has used more credits than issued."
- **Bulk deactivation with active assignments:** Warning dialog listing all active assignments. Option to reassign or proceed with deactivation.
- **Certification expiration bulk view:** Filter preset "Expiring Certifications" shows referees with certs expiring in 30/60/90 days.
- **Multiple referees from same company:** "Same Company" grouping indicator. "3 referees from PrimusGFS" in company column.
