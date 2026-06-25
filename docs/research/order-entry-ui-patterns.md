# Order-Entry UI Patterns: Should TERP Operator Move Off the Editable Grid?

**Research report — 2026-06-25**
Question: Is there a better UI than the table/grid view for **New Purchase Order** and **New Sales Order** entry? Deep research into how other ERPs (especially open-source ones whose frontend you can read) structure order entry.

Method: fan-out web research (5 search angles, ~17 source extractions, 75 adversarial verification votes — 66 claims upheld, 9 refuted) + direct read of the TERP Operator codebase. Confidence is flagged per finding. Sources listed at the end.

---

## TL;DR

**Don't rip out the grid. Augment it.** Every source-examinable ERP that does serious line-item entry — ERPNext/Frappe and Odoo both — uses an **editable data grid as the backbone**, exactly like you do. The grid is the *correct* pattern for dense, comparison-heavy transactional data.

But the research surfaced one decisive, adversarially-verified finding that maps directly onto your code: **inline-cell editing only stays low-friction for simple, single-field, low-stakes edits. It degrades for complex multi-field rows with dependent logic** — which is precisely your 23-column Sales line with pricing floors, landed-cost resolution, credit, and vendor-approval state. The claim "inline editing is the least-friction approach" was *refuted 2/3* for over-generalizing past that boundary.

So the highest-leverage move is **not** a different paradigm — it's a **hybrid**: keep the grid, but (1) add a fast **search-as-you-type / barcode quick-add** row on top, and (2) push the heavy per-line fields out of the grid into the **row-detail side panel you already have** (`DetailSlideover`). This is the consensus design the best ERPs and the enterprise design systems (PatternFly, Pencil&Paper) converge on.

---

## 1. What you have today (codebase grounding)

Both flows use **AG Grid Enterprise 32.3.3** wrapped in `OperatorGrid`, with inline cell editing committed via `onCellCommit` over tRPC.

| | Purchase Order | Sales Order |
|---|---|---|
| File | `src/client/views/PurchaseOrdersView.tsx` | `src/client/views/SalesView.tsx` (+ `sales/SalesBuildMode.tsx`, flag-gated) |
| Surface | Editable grid, ~10 pre-seeded draft rows | Editable grid, customer-scoped |
| Columns | ~14 | **~23**, many custom renderers (markup, derived COGS, landed-cost exception, pick status…) |
| Quick-add | Historical-product buttons (side panel) | **`SaleLineItemTypeahead` (UX-F03)** + inventory-finder slide-over |
| Per-line detail | Right context panel | `DetailSlideover` w/ tabbed panels |

**Key observations:**
- You are *already* partway to the recommended hybrid: a typeahead quick-add and a detail slideover both exist on the Sales side.
- The PO side is the more "plain grid" of the two and has **no type-ahead quick-add** — that's the biggest gap.
- A 23-column inline-editable grid is past the point where the research says inline editing stays comfortable.

---

## 2. How the source-examinable ERPs actually do it

### ERPNext / Frappe — editable grid is the canon *(confidence: HIGH, primary sources)*
- Sales Order entry is a child-doctype **Items table (editable grid)**: enter item + qty row by row; **Rate auto-populates** from Item Prices and is overwritable inline. Header-first, then grid, then Save→Submit. [frappe sales-order docs]
- The grid component is **`frappe/datatable`** — a purpose-built, dependency-light (vanilla JS, MIT) data grid with inline cell editors, keyboard navigation, copy, and **virtualized rendering of large row counts**. "Originally built for ERPNext… where line-item transactions are central." [github.com/frappe/datatable]
- **Master-detail rows**: each line expands (inverted-triangle toggle) to reveal billed amount, valuation rate, gross profit — i.e. dense per-line data lives in an *expansion*, not in more columns. [frappe sales-order docs]
- **Auto-fill across rows** (enter delivery date in row 1 → copies down). [frappe sales-order docs]
- **Barcode quick-add applies to PO *and* SO** uniformly: a dynamically-created barcode input above the table; first scan inserts a line at top (`item_code`, qty=1), re-scan increments qty. Generic to any doctype with an `items` child table. [erpnext PR #15329 + barcode docs]

> Takeaway: ERPNext = grid backbone + barcode/keyboard quick-add layered on top + heavy per-line data hidden in row expansion. That is the hybrid, shipped.

### Odoo — grid by default, but it *deliberately falls back to a form/modal when lines get complex* (confidence: HIGH, primary + corroborating)
- Order lines render as an **inline-editable list** (OWL `one2many` widget, `editable="top"/"bottom"`), with `<control>` elements for inline add/remove and an **autocomplete Many2One** product picker (`.o-autocomplete--input`) that fires async RPC validation on select. [odoo 19 view-architectures; dev.to OWL]
- **Critically:** enabling richer per-line features — *Manage Secondary UoM, Product Packaging, Properties on lines* — **forces Odoo to switch that line from inline-grid editing to a per-line form dialog.** Multiple independent sources confirm this; it's configuration-driven, not fixed. [odoo forum 62850; forum 32983]

> Takeaway: the most widely-deployed open ERP **explicitly abandons pure inline editing once a line carries enough fields/side-effects** — and routes to a form. This is the single most relevant precedent for your 23-column Sales line.

### Dynamics 365 Commerce POS — the "catalog + cart / split-pane" alternative *(confidence: HIGH, primary)*
- Not a spreadsheet grid: a **split-pane** — configurable product/category **button grid** + search + barcode on one side, a **receipt panel** (sales lines) on the other; ML "recommended products"; full vs compact layouts for desktop/tablet vs phone. [learn.microsoft.com pos-screen-layouts]

### Lightspeed Retail — keyboard-driven rapid entry *(confidence: HIGH, primary)*
- Dedicated shortcuts: **Alt+I** jump to Add-Item box (scan/type), Alt+2 new sale, Alt+3 item search, Alt+C customer. The speed model a high-throughput entry screen emulates. [lightspeed keyboard shortcuts]

### CS-Cart POS — catalog-picker + cart *(confidence: MEDIUM, vendor blog)*
- Click product in catalog → cart; barcode scan → cart; search by name/SKU. Tablet/desktop (≥768px). [webkul CS-Cart POS]

> **Scope honesty:** the research did *not* deeply reach Dolibarr, Tryton, Apache OFBiz, Medusa, Metasfresh, or Ever Gauzy — searches kept surfacing ERPNext, Odoo, Dynamics, and Lightspeed as the substantive, source-examinable order-entry implementations. Treat those six as "not examined here," not "no good pattern." (From general knowledge: Dolibarr and Tryton are also editable-table-based; Medusa is headless/admin-cart-style — but that's not from this verified research.)

---

## 3. The grid vs. alternatives verdict (verified UX principles)

**When the editable table is right** *(upheld 3/0)*: when users compare attributes across rows, sort columns, and need many fields visible at once — and for enterprise contexts with large datasets where users scan/compare/edit. That *is* PO/SO line entry. [uxpatterns.dev table-vs-list-vs-cards; LogRocket]

**Where inline editing breaks** *(the refuted-overreach finding — this is the important one)*:
- "Inline editing is the least-friction approach" was **REFUTED 2/3**. The sources scope it: inline is least-friction *only* for "quick changes — correcting a typo, toggling a status, updating a dropdown." [pencilandpaper.io]
- For rows that need additional data, confirmation, or have **side effects** (dependent pricing, credit, multi-field), the same sources say **open a side panel / row-detail / modal instead.** [pencilandpaper.io; uxdworld inline-editing]
- Inline editing "becomes difficult for complex data tables containing many fields" and "is not suitable for larger text fields." *(upheld)* [uxdworld]
- Inline validation is a *known hard problem* in grids, and inline editing works cleanly **only when rows are independent** — one row's change not affecting another. Your pricing-floor / landed-cost / credit logic is the flagged anti-pattern. *(upheld)* [uxdworld validation]

**Cards / lists** are for *browsing* catalogs, not dense comparative entry. *(upheld)* Not a fit to replace your order grid. [uxpatterns.dev]

**Autocomplete / search-as-you-type** is the right primitive for picking from a large catalog: show suggestions on focus, mix categories + products w/ thumbnails/price/availability, full keyboard nav (↑↓/Enter/Esc/Tab), debounce + virtualize for large sets. *(upheld)* [smart-interface-design-patterns; uxpatterns.dev autocomplete]

---

## 4. Recommendation for TERP Operator

**Keep the AG Grid backbone. Adopt the hybrid the best ERPs already use.** Concretely, in priority order:

1. **Add a search-as-you-type quick-add row to the PO screen** (it has none). Mirror the Sales `SaleLineItemTypeahead`: focus → suggestions (recent vendors' products first) → Enter drops a line. This is the single biggest win and reuses an existing pattern. *(High value, low risk)*

2. **Move heavy per-line fields out of the grid into the `DetailSlideover`.** Follow Odoo's own escalation rule: keep the grid lean (product, qty, price/cost, line total, status — the comparison columns), and put markup, landed-cost resolution, price-floor reasons, vendor-approval, notes into the row-detail side panel you already render. A 23-column inline grid is past the verified comfort boundary; this directly attacks it. *(High value, medium effort)*

3. **Add barcode/SKU quick-add, uniformly across PO and SO**, ERPNext-style: a scan/type input above the table; new SKU → new line, repeat SKU → increment qty. Valuable if/when operators handle physical inventory or labeled SKUs. *(Medium value; depends on workflow)*

4. **Invest in keyboard-driven entry** (Lightspeed model): a documented shortcut to jump to quick-add, Enter-to-commit-and-advance, arrow nav. High-throughput brokers live on the keyboard. *(Medium value, low effort)*

5. **Use ERPNext-style row expansion for occasional detail** (gross-profit/COGS breakdown) rather than ever-more columns. Complements #2.

6. **Strengthen inline validation surfacing** (pinned top-of-view message or row-background change) since grid validation is a known weak spot and your lines have dependent logic. *(You already have `SalePrePostStrip` — extend it.)*

**What NOT to do:** don't replace the order grid with a cards/list layout, and don't move to a pure catalog-picker+cart for the *order document itself* (that POS model fits fast retail checkout, not multi-attribute brokerage lines with cost ranges, floors, and credit). Borrow the catalog+cart's *quick-add and split-pane ideas*, not its data model.

**Net:** your instinct ("is the plain grid the best we can do?") is half-right. The grid is right; the *plain, everything-inline, 23-column* grid is what the research says to evolve — toward grid + typeahead quick-add + side-panel detail. You're already ~60% there on the Sales side; the work is finishing that pattern and bringing PO up to parity.

---

## Sources

Primary / source-examinable:
- ERPNext Sales Order — https://docs.frappe.io/erpnext/sales-order
- ERPNext barcode entry — https://docs.frappe.io/erpnext/track-items-using-barcode
- ERPNext barcode quick-add PR #15329 — https://github.com/frappe/erpnext/pull/15329
- Frappe DataTable (grid source) — https://github.com/frappe/datatable
- Odoo view architectures — https://www.odoo.com/documentation/19.0/developer/reference/user_interface/view_architectures.html
- Odoo OWL components — https://www.odoo.com/documentation/18.0/developer/reference/frontend/owl_components.html
- Odoo line form↔inline mode — https://www.odoo.com/forum/help-1/how-to-switch-sales-order-line-from-form-mode-back-to-line-mode-62850
- Odoo sale_product_field / OWL extension — https://dev.to/jeevanizm/odoo-owl-framework-extend-and-customize-component-and-widget-47jj
- Dynamics 365 Commerce POS layouts — https://learn.microsoft.com/en-us/dynamics365/commerce/pos-screen-layouts
- Lightspeed Retail keyboard shortcuts — https://retail-support.lightspeedhq.com/hc/en-us/articles/228839547-Keyboard-shortcuts

UX pattern authorities:
- Enterprise data tables (when to leave inline) — https://www.pencilandpaper.io/articles/ux-pattern-analysis-enterprise-data-tables
- Inline editing in tables — https://uxdworld.com/inline-editing-in-tables-design/
- Inline editing + validation — https://uxdworld.com/inline-editing-and-validation-in-tables/
- Table vs List vs Cards — https://uxpatterns.dev/pattern-guide/table-vs-list-vs-cards
- Autocomplete UX — https://smart-interface-design-patterns.com/articles/autocomplete-ux/
- Autocomplete pattern (dev) — https://uxpatterns.dev/patterns/forms/autocomplete
- PatternFly inline edit guidelines — https://www.patternfly.org/components/inline-edit/design-guidelines/
- Order-entry redesign case study — https://www.kimpascarelli.com/ux-design-for-order-entry-system

Secondary (POS/catalog-cart):
- CS-Cart POS — https://webkul.com/blog/cs-cart-point-of-sale-pos/
- Lightspeed Restaurant POS layout — https://o-series-support.lightspeedhq.com/hc/en-us/articles/31329442916891-Design-your-POS-look-and-layout

*Not examined in this research (coverage gap): Dolibarr, Tryton, Apache OFBiz, Medusa, Metasfresh, Ever Gauzy.*
