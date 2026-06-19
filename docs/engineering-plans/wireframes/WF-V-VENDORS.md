## Wireframe: WF-V-VENDORS — VendorsView

### UX Posture

The vendors table is the only primary surface. Status filter is a pill in the FilterToolbar (no ViewTabBar). Vendor context (open bills, terms, prior POs) lives in the slide-over — not in a permanent panel.

### Layout (ASCII)

```
┌─FilterToolbar──────────────────────────────────────────────────────────────┐
│  [+ Add Vendor ▾] │ Status ▾ │ Data views │ Keyword │ Terms │ Category │  │
│                   │ Sort ▾ │ Export ▾                                       │
│  [✕ status:active] [✕ terms:net-30] [✕ category:produce]                   │
├─KPI Line───────────────────────────────────────────────────────────────────┤
│  28 vendors · 24 active · $142,800 total AP · 5 open bills                 │
│                                                       [Show breakdown ▾]   │
├─AG Grid Table──────────────────────────────────────────────────────────────┤
│  ┌──────┬─────────┬──────────────┬─────────────────┬───────┬──────────┬──┐│
│  │  ☐   │ ID      │ Name         │ Contact         │Terms  │Open Bills│PO││
│  ├──────┼─────────┼──────────────┼─────────────────┼───────┼──────────┼──┤│
│  │  ☐   │ VND-112 │ Dole Fresh   │ sales@dole.com  │Net 30 │ $28,400  │6/││
│  │  ☑   │ VND-111 │ Chiquita     │ orders@chiq.com │Net 15 │ $12,200  │6/││
│  │  ☑   │ VND-110 │ Del Monte    │ ap@delmonte.com │Net 30 │        $0│6/││
│  │  ☐   │ VND-109 │ Sunkist      │ citrus@sunkist. │Net 45 │  $8,800  │6/││
│  │  ☐   │ VND-108 │ Driscoll's   │ berries@drisco. │Due on │ $15,600  │6/││
│  │  ☑   │ VND-107 │ Taylor Farms │ greens@taylor.. │Net 30 │  $4,200  │6/││
│  │  ☐   │ VND-106 │ Fresh Express│ orders@freshx.. │Net 15 │        $0│3/││
│  └──────┴─────────┴──────────────┴─────────────────┴───────┴──────────┴──┘│
│                       (row height: 32px Mercury standard)                  │
├─BulkActionBar (appears only when rows selected)────────────────────────────┤
│  3 selected · $16,400 AP   [Email] [More ▾: Tag | Export | Deactivate]    │
└────────────────────────────────────────────────────────────────────────────┘

Detail Slide-over (right, 420px, opens on row click):
  Tabs: Profile | POs | Invoices | History
  Footer actions (state-gated):
    Active    → [Edit] [New PO] [Deactivate]
    Inactive  → [Reactivate]
    On Hold   → [Release Hold] (with approval) [View Notes]
    Blacklisted → [View Notes] (read-only except admin Reinstate)
```

### State-Gated Action Surface

| Vendor State    | Visible Actions                                  |
|-----------------|--------------------------------------------------|
| Active          | `Edit`, `New PO`, `Deactivate`, `Record Invoice` |
| Inactive        | `Reactivate`                                     |
| On Hold         | `Release Hold` (with approval), `View Notes`     |
| Blacklisted     | `View Notes` (read-only except admin Reinstate)  |

### Dimensions

| Component              | Width           | Height       | Notes                          |
|------------------------|-----------------|--------------|--------------------------------|
| FilterToolbar          | 100%            | 44px + 32px  | Menubar + active-chip row      |
| KPI line               | 100%            | 32px / ~96px expanded | Inter 13px |
| AG Grid Table          | 100%            | fills remain | Row height 32px                |
| BulkActionBar          | 100%            | 48px         | Slide-up, fixed bottom         |
| Slide-over             | 420px standard  | 100% vh      | 280px peek mode                |

### Interactive Elements

- **[+ Add Vendor ▾]**: Split button — opens vendor creation slide-over.
- **Status ▾ pill**: Multi-select with `Active (24)`, `Inactive (4)`, `On Hold`, `Blacklisted`. Replaces prior ViewTabBar.
- **Terms ▾**: Filter popover (Net 7, Net 15, Net 30, Net 45, Net 60, Due on Receipt, Custom).
- **Category ▾**: Filter (Produce, Dairy, Dry Goods, Beverage, Packaging, Logistics, Other).
- **Vendor Name cell**: Click opens slide-over.
- **Open Bills cell**: $0 muted; > $10,000 warning highlight.
- **Terms cell**: Hover tooltip shows full terms text.
- **⋮ Actions**: State-gated context menu.
- **Slide-over tabs**: Profile, POs, Invoices, History.

### States Shown

- **Default**: Vendors table only. Status ▾ defaults to Active.
- **Active vendor with open bills**: Normal styling.
- **Inactive vendor**: Slightly dimmed.
- **High open bills**: > $10,000 warning highlight; slide-over flags "Review payment schedule."
- **Zero open bills**: $0 in muted text; success checkmark.
- **Vendor on hold**: Warning status badge.
- **Slide-over peek (280px)**: ID, name, open AP, terms.
- **Slide-over open (420px)**: Full profile with tabs.
- **POs tab empty**: "No purchase orders yet. [+ Create PO]"
- **Invoices tab**: Lists unpaid invoices; aging color-coded.
- **Export in progress**: Button shows spinner.
- **Error**: Toast.

### ARIA Annotations

- FilterToolbar: `role="menubar"`, `aria-label="Vendors filter toolbar"`
- Status ▾ pill: `role="combobox"`, `aria-haspopup="listbox"`, `aria-label="Filter by vendor status"`, `aria-multiselectable="true"`
- KPI line: `role="status"`, `aria-live="polite"`, `aria-label="28 vendors, 24 active, 142,800 dollars total AP, 5 open bills"`
- AG Grid: `role="grid"`, `aria-label="Vendors table"`, `aria-rowcount="28"`, `aria-multiselectable="true"`
- Open Bills cell (high): `role="gridcell"`, `aria-label="Open bills $28,400, review recommended"`
- Terms cell: `role="gridcell"`, `aria-label="Terms: Net 30"`
- BulkActionBar: `role="toolbar"`, `aria-label="Bulk actions for 3 selected vendors"`
- Slide-over: `role="dialog"`, `aria-label="Vendor VND-111 Chiquita details"`
- Slide-over tabs: `role="tablist"`, `aria-label="Vendor detail sections"`
- Invoice aging indicator: `role="alert"`, `aria-label="Invoice 45 days past due"`
- High AP warning: `role="alert"`, `aria-label="Open accounts payable exceeds ten thousand dollars"`

### Edge Cases Handled

- **Zero results**: Empty state with "Clear filters".
- **Vendor with no POs**: Last PO "None"; POs tab empty state.
- **Vendor with no email**: Email action absent for that vendor.
- **Vendor on hold**: Row shows warning icon; tooltip explains hold reason; `New PO` absent (state-gated).
- **Vendor with custom terms**: Terms cell shows "Custom" with tooltip.
- **High AP aging**: Invoice aging badge at 31+ days error; slide-over promotes to top of Invoices tab.
- **Vendor merge**: "Merge Vendors" bulk action opens merge wizard.
- **Vendor deactivation with open POs**: Modal warning "This vendor has 2 open POs totaling $12,200. Deactivate anyway?"
- **Slide-over + bulk selection**: Both work independently.
- **Concurrent edits**: Optimistic update; rollback with toast.

### UX Compliance

| UX Rule | Status | Note |
|---------|--------|------|
| UX-1: Action visibility follows entity state | ✓ | New PO only on Active; Reactivate only on Inactive; Release Hold only on On Hold. |
| UX-2: Supporting info one click away, never zero | ✓ | POs, Invoices, History as slide-over tabs. |
| UX-3: One primary surface per view | ✓ | Vendors table is the only primary surface. |
| UX-4: Bulk actions appear only on selection | ✓ | BulkActionBar slides up only on selection. |
| UX-5: Validation errors at point of impact | ✓ | High AP, aging at the row. |
| UX-6: Tools and forms in slide-overs; modals for confirmations | ✓ | Vendor creation in slide-over. Deactivation modal. |
| UX-7: System never hides what mode the operator is in | ✓ | Filter pills, slide-over header, status badges. |
| UX-8: State changes resolve in place | ✓ | Status transitions inline. |
| UX-9: Filtering is fluid; navigation is durable | ✓ | Status ▾ pill replaces tab bar. |
| UX-10: Cell-level interactions save immediately; forms have explicit save | ✓ | Cell edits save. Vendor form explicit. |
| UX-11: URL is the session memory | ✓ | Filters, slide-over ID encode into URL. |
| UX-12: Empty states give the operator a next step | ✓ | Empty → Add Vendor CTA. Empty filtered → Clear filters. |
