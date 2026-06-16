# Mercury UX Retrofit — Wireframe Inventory

**Last updated:** 2026-06-16
**Files:** 47 source wireframes + `DESIGN-RULES.md` + `review.html`

---

## What's in this directory

| Artifact | Purpose |
|----------|---------|
| `WF-V-*.md` (27 files) | **View wireframes** — one per top-level operator view (Dashboard, SalesView, PurchaseOrders, Intake, etc.) |
| `WF-C-*.md` (10 files) | **Component wireframes** — reusable surfaces (DetailSlideover, FilterToolbar, ComboboxCellEditor, BulkActionBar, ViewTabBar, etc.) |
| `WF-F-*.md` (10 files) | **Flow wireframes** — multi-step interactions (PO Create, Sale Edit, Error Recover, Bulk Action, etc.) |
| `DESIGN-RULES.md` | **Design rules v2.0** — UX-first rules every wireframe must conform to |
| `review.html` | **Visual review artifact** — 10 representative wireframes rendered with current tokens for cross-team review |
| `images/` | Screenshots and reference imagery for review.html |

---

## How to use this directory

**Read in this order before any UI implementation:**

1. **[../mercury-ux-integrated-analysis.md](../mercury-ux-integrated-analysis.md)** — **UX Authority.** 12 UX rules, top-7 friction points, operator attention budget. Single authoritative UX analysis. Cross-model validated (Claude Opus 4.7 + GPT-4o, independently). **Read this first.**
2. **[DESIGN-RULES.md](./DESIGN-RULES.md)** — Design rules v2.0, derived from the UX authority. Every wireframe must conform.
3. **[../mercury-design-ground-up-analysis.md](../mercury-design-ground-up-analysis.md)** — Visual tokens (weights, opacities, max-widths, motion) and component API shapes. Authoritative on visual system; defers to UX authority for behavior.
4. **The specific `WF-*.md` files** for the surface you're implementing.

**When the UX authority and a wireframe disagree, the UX authority wins.** The wireframe must be updated.

---

## Quick index — which wireframe covers which pattern

### Templates (used across many views)
| Wireframe | Covers | UX rules it exemplifies |
|-----------|--------|------------------------|
| `WF-C-GRIDVIEW.md` | The 3-zone GridView template (filter row, KPI line, table) | UX-3 (one primary surface), UX-4 (bulk on selection) |
| `WF-C-MASTERDETAIL.md` | Master/detail template (Intake) | UX-3, UX-11 (URL state) |
| `WF-C-DASHBOARD.md` | Dashboard template (4-card KPI strip, focus, queues, activity) | UX-3, UX-12 (empty states with next step) |
| `WF-C-WIZARD.md` | Step-wise guided flow (Pick) | UX-7 (mode visibility), UX-10 (explicit save) |

### Reusable surfaces
| Wireframe | Covers | UX rules |
|-----------|--------|----------|
| `WF-C-SLIDEOVER.md` | DetailSlideover (entity, tool, form modes) with URL state | UX-2 (info one click away), UX-6 (tools/forms in slide-overs), UX-11 (URL) |
| `WF-C-FILTER.md` | FilterToolbar (search, filter pills, advanced) | UX-9 (filtering is fluid, not navigation) |
| `WF-C-TABBAR.md` | ViewTabBar (content-kind tabs only, not status filters) | UX-9 |
| `WF-C-SUMMARY.md` | Single KPI line + expandable breakdown | UX-3 |
| `WF-C-COMBOBOX.md` | ComboboxCellEditor with immediate save + Clear | UX-5 (validation at point of impact), UX-10 (immediate save) |
| `WF-C-BULK.md` | BulkActionBar with selection totals + partial-failure result | UX-4 (bulk on selection), UX-8 (state resolves in place) |

### Flagship views (high-complexity)
| Wireframe | UX risks called out by integrated analysis |
|-----------|--------------------------------------------|
| `WF-V-SALES.md` | **Highest friction in TERP.** Multi-section view that must collapse to one primary surface + slide-overs for context. Anti-pattern: 8 simultaneous panels. (See integrated analysis §1, Friction Point #1.) |
| `WF-V-PO.md` | PO authoring must be opt-in (slide-over), not pre-staged. Action buttons must be state-gated, not disabled. (Friction Point #4.) |
| `WF-V-INTAKE.md` | Already close to Mercury per Claude. Gap: cross-PO bulk selection. |
| `WF-V-DASH.md` | Must give the eye a default landing zone. 4-card KPI strip is the anchor; 8 equal-weight panels is the anti-pattern. (Friction Point #3.) |
| `WF-V-RECOVERY.md` | Failed commands must be foregrounded. Admin tools demoted. Row click → slide-over with command context. (Friction Point #5.) |

### Other views
| Group | Files |
|-------|-------|
| Order / fulfillment / payment data views | `WF-V-ORDERS.md`, `WF-V-FULFILLMENT.md`, `WF-V-PAYMENTS.md`, `WF-V-VPAYABLES.md`, `WF-V-PRECEIPTS.md`, `WF-V-DISPUTES.md` |
| Inventory / catalog | `WF-V-INVENTORY.md`, `WF-V-ITEMS.md`, `WF-V-MEDIA.md`, `WF-V-MATCH.md` |
| Entities (vendors/customers/contacts) | `WF-V-VENDORS.md`, `WF-V-CLIENTS.md`, `WF-V-CPROFILE.md`, `WF-V-CONTACTS.md`, `WF-V-REFEREES.md`, `WF-V-PROCESSORS.md` |
| Financial / operational | `WF-V-CREDIT.md`, `WF-V-CLOSEOUT.md`, `WF-V-CONNECTORS.md` |
| Power-user / settings | `WF-V-MERGE.md`, `WF-V-SETTINGS.md`, `WF-V-PICK.md` |

### Flows
| Wireframe | Pattern |
|-----------|---------|
| `WF-F-PO-CREATE.md`, `WF-F-PO-RECEIVE.md` | PO authoring + receipt — opt-in slide-over, state-gated actions |
| `WF-F-SALE-CREATE.md`, `WF-F-SALE-EDIT.md` | Sale flow — preserved state across context switches (UX-11) |
| `WF-F-INTAKE-VERIFY.md` | Cross-batch verification |
| `WF-F-DETAIL-NAVIGATE.md` | Row click → peek → "Open full view" pattern |
| `WF-F-FILTER-ADVANCED.md` | Advanced filter builder as a tool-mode slide-over |
| `WF-F-BULK-ACTION.md` | Bulk dispatch with partial-failure result |
| `WF-F-ERROR-RECOVER.md` | Recovery slide-over with command context (UX-5) |
| `WF-F-DASHBOARD.md` | Dashboard → focused action flow |

---

## Conventions every wireframe follows

- **3-zone main area**: FilterToolbar + KPI line + Table. No view header. No tab bar above the table for status filtering.
- **Shadow-only depth**: cards have no borders. Focus uses a 2px ring on `:focus-visible`.
- **Whitespace as a primary visual element**: page max-width 1440px, table max-width 968px.
- **State is in the URL**: slide-over open, filters, tab, selection all encode into the URL. Browser back works.
- **Validation appears at the point of impact**: no permanent "all checks passed" panels.
- **Action buttons are state-gated**: if an action doesn't apply, it's absent, not disabled.

For evidence, anti-examples, and the philosophy behind each, see [../mercury-ux-integrated-analysis.md](../mercury-ux-integrated-analysis.md) and [DESIGN-RULES.md](./DESIGN-RULES.md).
