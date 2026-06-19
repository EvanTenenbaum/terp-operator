# Mercury → TERP Design Analysis & Ground-Up Improvement Plan

> **Authority note (2026-06-16):** [mercury-ux-integrated-analysis.md](./mercury-ux-integrated-analysis.md) is now the **authoritative UX analysis** for the Mercury retrofit. This document covers **visual design tokens, component architecture, and source-of-truth reconciliation**. For UX behavior — what's shown, when, how many clicks away, attention budget, friction-point ranking — defer to the integrated analysis. Where the two documents discuss the same topic (e.g., design rules), the integrated analysis wins on UX intent; this document remains authoritative on visual tokens and component API shape.

**Date:** 2026-06-16
**Version:** 1.0 — derived from first principles
**Inputs:** `MASTER-EXECUTION-DOCUMENT.md` §14 (lines 1490–1593), `research-packets/mercury-combobox-behavior.md`, `terp-feature-to-mercury-mapping.md` (579 lines), `wireframes/DESIGN-RULES.md` (97 lines), `wireframes/review.html` (1300 lines), 47 `wireframes/WF-*.md` files, `src/shared/schemas.ts`, `src/client/views/SalesView.tsx` (1986 lines), `src/server/routers/queries.ts` (3174 lines).
**Scope:** Audit Mercury fidelity, verify TERP feature coverage, resolve source-of-truth conflicts, rewrite design rules, produce executable action plan.
**Posture:** Opinionated. Every claim cites a line number or section. The previous audit scored 53/100 — this plan targets 95+.

---

## 0. TL;DR Verdict

The current state has three classes of failure:

1. **Mercury rationalizations.** Several "TERP adjustments" (Rule #3 tab pills, Rule #4 metric cards, Rule #5 view headers, Rule #7 card borders, Rule #8 weight cap 600) are operator-comfort rationalizations dressed as domain needs. They individually look reasonable; collectively they neutralize Mercury's table-dominance and content-first philosophy.
2. **Internal inconsistency.** Page max-width is 1200/1240/1440 in three different places. Row height is 32/44/48/49/56/280 px depending on which wireframe you open. Rule #7 says "0.08–0.12 opacity borders" but also "Mercury cards have NO borders" and also "optional subtle border for accessibility" — three positions in one rule.
3. **Pre-Mercury legacy.** The 47 `WF-*.md` files were written before the post-QA design rules. The post-QA `review.html` rebuilds the same views with different conventions. The two now disagree, and neither references the other as source of truth.

Net: the plan describes Mercury-fidelity but the artifacts implement Mercury-lite. Operators will not notice Mercury restraint because we have not actually applied it.

This document derives a Mercury-faithful posture from raw research, audits TERP feature coverage against it, and produces a phased plan to update artifacts so the next 108 implementation tasks produce something that actually feels like Mercury.

---

## 1. Mercury Design DNA Audit

### 1.1 What Mercury actually does (from raw observation)

From `MASTER-EXECUTION-DOCUMENT.md` §14 (lines 1539–1593) and `research-packets/mercury-combobox-behavior.md`:

| Trait | Evidence | Citation |
|---|---|---|
| **3 elements in transactions main area** | filter pills row, single KPI line, table | §14 lines 1541–1545 |
| **4 elements on dashboard** | greeting, quick actions, ONE balance card, recent activity table with tab pills | §14 lines 1546–1551 |
| **No tab bars above tables** | status filtering done in filter pills, not tabs | §14 line 1553 |
| **No summary strips — single KPI line** | "Net change ... Money in ... Money out" — one line, expandable | §14 lines 1554, 1543 |
| **No view headers** | page identity comes from sidebar nav | §14 line 1555 |
| **No card borders — shadow only** | `box-shadow: 0 0 2px ..., 0 1px 4px ...` | §14 lines 1516–1517 |
| **Pill borders at 0.16 opacity** | `1px solid rgba(112, 115, 147, 0.16)` | §14 line 1521 |
| **Table headers 13px, regular case, NOT uppercase, NOT bold** | observed in DOM | §14 line 1560 |
| **Font weight never exceeds 480** | tokens `--fw-light: 360, --fw-regular: 400, --fw-medium: 480` — no `--fw-semibold` or `--fw-bold` defined | §14 line 1509 |
| **Massive whitespace** | 968px table inside 1440px viewport → 238px margins | §14 line 1562 |
| **Row height 49px** | `--row-height: 49px` | §14 line 1533 |
| **Sidebar carries context (account balances)** | not crammed into main view | §14 line 1563 |
| **Detail panel ~424px slide-over, z-index 2, URL updates on open** | observed | §14 lines 1572–1576 |
| **Combobox immediate save on Enter, no Save button** | observed | combobox-behavior.md lines 36, 54 |
| **Combobox has Clear button on value-set cells** | observed | combobox-behavior.md line 37 |
| **Combobox "Create new" at dropdown bottom** | observed | combobox-behavior.md line 30 |

The unifying philosophy is **restraint as deference to data**. Mercury does not add chrome to make the UI feel more "professional" — they remove it so transactions feel important.

### 1.2 What the current design rules got right

| Rule | Verdict | Why |
|---|---|---|
| #1 Content-first, chrome-second | ✅ correct intent | matches Mercury's IA observation |
| #2 Progressive disclosure | ✅ correct | matches Mercury's bulk-bar/detail-on-demand pattern |
| #6 Table dominance | ✅ correct | matches 968px-in-1440px observation |
| #10 Clear error states | ✅ correct adjustment | berry-red → #d92d20 is a defensible accessibility call |

### 1.3 What the current design rules got wrong

**Rule #3 — "Subtle tab pills with count badges"**

Mercury explicitly does NOT have tab bars above tables (§14 line 1553). The rule justifies keeping them with: "TERP has 8 statuses per entity. Operators triage by status."

This is a half-truth. TERP does have 8 sales-order statuses (`schemas.ts` line 94: `'draft', 'reserved', 'confirmed', 'posted', 'fulfilled', 'cancelled', 'reversed', 'needs_fix'`). But Mercury also has multi-status data (transactions: Pending, Cleared, Failed, Returned, Reconciled, etc.) and chose filter pills over tabs. Mercury's solution is "Status" as a filter chip that opens a multi-select popover, not a row of pre-bound tabs.

**Ruling:** REJECT as written. Status filtering should use a filter pill ("Status: All ▾") that opens a multi-select popover, with quick-pin to recent statuses. This costs 1 click for status switch (vs 0 for tabs), but recovers a full vertical zone and matches Mercury exactly. Counter-evidence: if operator research shows status-switch is the dominant action (>50% of clicks), reinstate tab pills but in the same row as filter pills, not as a separate zone.

**Rule #4 — "3-5 subtle metric cards above tables"**

Mercury has ONE KPI line on transactions (§14 line 1543) and ONE balance card on dashboard (§14 line 1549). The rule promotes this to 3-5 cards in TERP, justified as "operators need count, value, and status breakdown at a glance."

This is operator-comfort thinking. Mercury operators also need balance, change, money-in, money-out at a glance — they get them as a single line. Cards add chrome to data already present.

**Ruling:** REJECT as written. Default to ONE KPI line per view: "15 POs · $124,500 total · 4 Draft · 3 Ordered · 6 Received · 2 Finalized" — comma-separated, single 28px line. Add an inline "Show breakdown ▾" affordance that expands to a vertical card grid if the operator wants visual separation. Dashboard KPIs remain as cards because the dashboard IS a metric-card surface; data views do not need them.

**Rule #5 — "Minimal view headers (title + actions)"**

Mercury has NO view headers (§14 line 1555). The rule justifies keeping them with "TERP has 27 views. Operators need orientation."

The sidebar already provides orientation. The active nav item is highlighted (`review.html` `.nav-item.active`). Adding a view header above the filter pills is redundant chrome.

**Ruling:** PARTIAL REJECT. Remove the framed view header (which review.html shows as a full bordered band, lines 548–551). Replace with: (a) sidebar handles identity via active nav item; (b) primary action button ("+ New PO") moves to the right end of the filter pill row, matching Mercury's mental model of "filters + the one create action are equivalent toolbar items"; (c) secondary actions move to a kebab on the right end of the row.

**Rule #7 — "Invisible chrome, 0.08–0.12 opacity borders, cards shadow-only with optional subtle border for accessibility"**

Three positions in one rule:
- "borders at 0.08–0.12 opacity" (TERP claim)
- "cards: shadow-only" (Mercury claim, §14 line 1517)
- "optional subtle border for accessibility in dense views" (escape hatch)

Mercury's actual pill border is 0.16 (§14 line 1521), not 0.08–0.12. The rule is simultaneously stricter (cards) and looser (escape hatch) than Mercury.

**Ruling:** Restructure. Cards: shadow-only, no border, ever. Focus accessibility via 2px `--accent-blue` focus ring on `:focus-visible`, not border. Pills: 0.16 opacity to match Mercury exactly. Table row dividers: 0.04 opacity (effectively invisible until needed). One number per surface type, no escape hatches.

**Rule #8 — "Inter/system-ui, weights 400-600"**

Mercury's max weight is 480 (§14 line 1509). The rule allows 600, justified as "operator scannability."

This is the most insidious rationalization. 600 is bold. Mercury's restraint comes from never being bold. Allowing 600 sneaks bold back into "subtle" surfaces.

**Ruling:** Cap at 500 for body and table content. Reserve 600 ONLY for: (a) primary numerical values in the dashboard KPI cards (one per card), (b) the entity title in the slide-over header. Everywhere else, 400 or 500. No table headers in 600. No tab labels in 600. No filter pills in 600.

### 1.4 What the design rules failed to derive

These exist in §14 evidence but are absent from the 10 rules:

| Mercury trait | Why it matters | Proposed rule |
|---|---|---|
| Page max-width 1440px with 968px table = 238px side margins | Restraint comes from breathing room, not from cramming | New rule: **whitespace as primary visual element** — main content max 1440px, table max 968px, side margins 100px+ |
| Sidebar carries contextual data (account balances) | Reduces in-view clutter | New rule: **sidebar carries identity AND ambient context** — bookmarks, balances, counts |
| Combobox immediate save with Clear button | Defines TERP's editing UX completely | Promote combobox semantics to a top-level rule |
| URL updates on slide-over open | Reflects depth and enables share/refresh | New rule: **URL is the single source of view state** |
| Mercury's `cubic-bezier(0.2, 0.8, 0.4, 1)` ease | Restrained motion that feels native | Already in tokens, but no rule about applying it consistently |

---

## 2. TERP Feature Coverage Audit

### 2.1 Per-data-point audit (against the mapping doc Appendix lines 563–578)

| Data Point | Current location | Mapping promise | Wireframe coverage | Verdict |
|---|---|---|---|---|
| Vendor name + terms | side panel (always visible) | Slide-over Vendor tab (1 click) | `WF-V-PO.md` lines 96-101 ✅ + `WF-C-SLIDEOVER.md` State 3 ✅ | **Covered** |
| Customer balance + credit | workspace header (always) | Context header when customer selected (0 clicks) | `review.html` lines 795-799 (`wf-sa-context` bar) ✅ | **Covered** |
| PO line details | PO expanded (always) | Slide-over Lines tab (1 click) | `WF-V-PO.md` lines 86-93 ✅ | **Covered** |
| Intake batch details | master/detail (0 clicks) | Master/detail preserved (0 clicks) | `WF-V-INTAKE.md` lines 134-135 ✅ | **Covered** |
| Photography queue | side panel (always) | Slide-over Photos tab (1-2 clicks) | `WF-V-SALES.md` & `WF-V-CLIENTS.md` reference but no Photos tab spec exists | **Gap** |
| Purchase history | side panel (always) | Slide-over History tab (1-2 clicks) | `WF-V-CLIENTS.md` mentions tabs but no Purchase History tab content | **Gap** |
| Inventory finder | left pane (always) | Slide-over from Add line (1 click) | No `WF-C-INVENTORY-FINDER.md` exists; mapping doc says "SalesSourcePane → Slide-over from Add line action" | **Gap (Critical)** |
| Sheet preview | panel (always) | Slide-over from Preview button (1 click) | No `WF-C-SHEET-PREVIEW.md` exists | **Gap** |
| Order actions | expansion buttons | Row expansion OR slide-over actions | `WF-V-PO.md` lines 78-80 ✅ | **Covered** |
| Bulk actions | inline StatusActionBar | Sticky BulkActionBar | `WF-C-BULK.md` ✅ | **Covered** |
| Market signals | inline panel | Slide-over Vendor tab | No tab content spec | **Gap** |
| Pre-post validation issues | inline panel | Inline warning strip when issues exist | No warning-strip component wireframe | **Gap** |
| Selection totals | inline strip in IntakeView | BulkActionBar | `WF-C-BULK.md` ✅ | **Covered** |

**Score:** 7 covered, 6 gaps. The mapping doc claims "nothing lost" (line 154); the wireframe inventory does not back this up. 5 of the 6 gaps are because the mapping points to a slide-over tab content that has no wireframe.

### 2.2 Per-action audit (against mapping doc §1.2 lines 73–82)

| TERP Pattern | Mercury Replacement | Wireframe coverage |
|---|---|---|
| FilterPresetStrip | ViewTabBar | `WF-C-TABBAR.md` exists; per-view tabs vary |
| AdvancedFilterBuilder | FilterToolbar Advanced button | `WF-F-FILTER-ADVANCED.md` exists ✅ |
| CommandPalette | Keep | No wireframe but spec preserves it (mapping line 79) ✅ |
| Expansion actions | Keep + slide-over actions | `WF-V-PO.md` row expansion ✅ |
| Grid cell editing | + ComboboxCellEditor | `WF-C-COMBOBOX.md` ✅ |
| BatchRowActions | Keep | `WF-V-INTAKE.md` ✅ |

**Score:** 6/6 covered with one caveat: the FilterPresetStrip → ViewTabBar migration is in question per §1 above; if status filtering moves to a Filter pill multi-select popover, the ViewTabBar collapses.

### 2.3 Per-filter audit

| Current TERP filter | Promised location | Verified? |
|---|---|---|
| FilterPresetStrip status pills | ViewTabBar tabs | `WF-C-TABBAR.md` ✅ |
| AdvancedFilterBuilder | FilterToolbar Advanced button | `WF-F-FILTER-ADVANCED.md` ✅ |
| SavedFiltersDropdown | FilterToolbar Data views dropdown | Mentioned in `WF-V-PO.md` line 14 but no popover spec |
| Grid quick filter text | FilterToolbar keyword | Mentioned in `WF-V-PO.md` line 14 but no popover spec |
| RecoveryView command family chips | FilterToolbar chips | `WF-V-RECOVERY.md` exists but doesn't detail the chip behavior |

**Score:** 2 fully covered, 3 partially. SavedFiltersDropdown and keyword search need their own component wireframes.

### 2.4 Per-cell-editor audit

| Cell type | Promised editor | Spec exists? |
|---|---|---|
| Text/numeric | AG Grid default | N/A — preserved |
| Status/arrivalStatus | ComboboxCellEditor | `WF-C-COMBOBOX.md` ✅ |
| Category/subcategory | ComboboxCellEditor | `WF-C-COMBOBOX.md` ✅ |
| BoolCol checkboxes | AG Grid default | N/A — preserved |
| Date pickers | AG Grid default | N/A — preserved |
| Below-floor price exception editor | Not specified | **Gap** — `schemas.ts` line 125 `exceptionReason: z.enum(BELOW_FLOOR_REASONS)` requires a special editor (combobox + reason text); no wireframe |

**Score:** 4/5 covered, 1 gap that the mapping doc missed entirely.

### 2.5 Coverage summary

The mapping doc's claim "Nothing lost" (line 154) is overstated. Actual coverage:
- 7/13 data points fully covered
- 6/6 actions covered
- 2/5 filters fully covered (3 partially)
- 4/5 cell editors covered

**Net:** ~19 of ~29 surfaces fully covered. 6 gaps need new wireframes; 3 gaps need wireframe extensions. The retrofit is closer to ~70% spec-complete than the mapping doc implies.

---

## 3. Progressive Disclosure Access Cost Matrix

For each surface, current clicks → post-retrofit clicks. "Click" = a discrete user action (mouse click, keystroke shortcut, etc.). Ruling: **keep** = current target click count is correct, **push** = current count is too low (visible should be on-demand), **revert** = retrofit went too deep, pull back to fewer clicks.

| Data surface | Current | Retrofit target | Mercury equivalent | Ruling |
|---|---|---|---|---|
| **Always-visible main grid** | 0 | 0 | 0 (table is always there) | **keep** |
| **Vendor terms + open AP** | 0 (always visible side panel) | 1 (row click → Vendor tab) | 1 (row click → detail) | **keep** |
| **Customer balance + credit** | 0 (always visible workspace header) | 0 (context header when customer selected) | 0 (Mercury sidebar shows account balances) | **keep** |
| **Customer credit limit detail** | 0 (always visible) | 2 (row click → Credit tab → detail) | 2 (account → detail) | **keep** |
| **PO line items** | 0 (always when PO expanded) | 1 (row click → Lines tab default) | 1 | **keep** |
| **Intake batches (master/detail)** | 0 (always when expanded) | 0 (expansion preserved) | N/A (Mercury has no master/detail) | **keep** |
| **Photography queue for customer** | 0 (always visible) | 2 (row click → Photos tab) | N/A | **push** — operator photography is queue-time work, not browsing-time |
| **Customer purchase history** | 0 (always visible) | 2 (row click → History tab) | 1 (Mercury account → history is default tab) | **revert** — make this the default tab when opening a customer slide-over, so it's 1 click |
| **Inventory finder during Sale build** | 0 (always visible left pane) | 1 (Add line → slide-over finder) | N/A | **keep** |
| **Sheet preview** | 0 (always visible) | 1 (Preview button → slide-over) | N/A | **keep** |
| **Bulk action menu** | 0 (inline StatusActionBar) | 0 (BulkActionBar appears on selection) | 0 (selection bar appears) | **keep** |
| **Market signals for vendor** | 0 (always visible) | 1 (row click → Vendor tab → scroll) | N/A | **keep** |
| **Pre-post validation issues** | 0 (always when issues exist) | 0 (inline warning strip when issues exist) | 0 (Mercury inline errors) | **keep** |
| **Selection totals** | 0 (always when selected) | 0 (in BulkActionBar) | 0 | **keep** |
| **Filter applied state** | 0 (always visible chips) | 0 (active filter pills below toolbar) | 0 | **keep** |
| **Saved filter views ("Data views")** | 1 (dropdown click) | 1 (dropdown click) | 1 | **keep** |
| **Status filtering (single status)** | 0 (tab click) | 0 (tab click) OR 1 (Status filter pill multi-select) | 1 (Mercury filter pill multi-select) | **TIEBREAKER NEEDED** — see §1.3 |
| **Row detail summary** | 1 (open drawer) | 1 (row click → Peek 280px) | 1 (row click) | **keep** |
| **Row detail tabs (Lines/Vendor/History)** | 2 (open drawer → click tab) | 2 (row click → click tab in peek) | 2 | **keep** |
| **Full-page entity detail** | 2 (drawer → "View full") | 2 (peek → "Open full view") OR direct URL = 0 if shared/bookmarked | 1 inside Mercury app | **keep** |
| **Quick-add vendor product** | 1 (button in vendor pane) | 2 (open PO slide-over → Vendor tab → Quick Add) | N/A | **revert** — surface this as a row-level action on the PO authoring grid, not as a tab in another tab |
| **Print/Export current view** | 1 (export button) | 1 (FilterToolbar → Export) | 1 | **keep** |
| **Recovery: retry a failed command** | 1 (inline retry button) | 1 (row click → action) OR 2 (row click → slide-over → action) | N/A | **TIEBREAKER NEEDED** — inline retry per row is operator-critical; should be 1 click |

### 3.1 Access cost rulings summary

- 18 surfaces correctly at their target click count → **keep**
- 1 surface should be made 1 click cheaper (Customer purchase history) → **revert**
- 1 surface should be made 1 click cheaper (Quick-add vendor product) → **revert**
- 1 surface should be made 1 click cheaper (Photography queue is a borderline case; current ruling is to leave at 2 since it's not a primary browsing task)
- 2 tiebreakers (status filtering, Recovery retry) need operator decision

### 3.2 Net result on philosophy claim

The mapping doc says (line 578): "Some context that was always visible now requires 1-2 clicks to access. In exchange, the main view becomes dramatically cleaner."

Verified against the matrix: **20 surfaces stay at 0–1 clicks** (matches Mercury), **3 surfaces incorrectly drift to 2 clicks** (purchase history, quick-add vendor product, retry on row). Fix these three and the philosophy claim is honest.

---

## 4. Component Architecture Verification

### 4.1 The 18-drawer consolidation claim (mapping doc §3.1 lines 380–404)

For each promised consolidation, verify the DetailSlideover API (`mapping.md` lines 452–469) can express it:

```typescript
interface DetailSlideoverProps {
  entityType: string;
  entityId: string;
  state: 'closed' | 'standard' | 'wide';
  tabs?: DetailTab[];
  actions?: DetailAction[];
  headerSummary?: ReactNode;
}
```

| # | Drawer being replaced | Maps to | API sufficient? |
|---|---|---|---|
| 1 | ContextDrawer (5 states) | `state` prop + tabs | ✅ |
| 2 | VendorContextDrawer | `entityType="po"` + Vendor tab | ✅ |
| 3 | RelationshipDrawer | Tab in PO/sales slide-over | ✅ |
| 4 | InventoryFinderPanel | `entityType="finder"` + tabs `[Available, Recent, Search]` | ⚠️ **Awkward fit** — finder is not "an entity" but a tool. Treating it as an entity with stubbed `entityId` works but forces inappropriate semantics on the URL (`/finder/blank` ?). Better: split shell-from-content. |
| 5 | PhotographyQueuePanel | Tab in customer slide-over | ✅ |
| 6 | RowCommandHistoryDrawer | Tab in entity slide-over | ✅ |
| 7 | IssueSidecar | Section in entity slide-over | ✅ |
| 8 | ReceiptPanel | Tab in entity slide-over | ✅ |
| 9 | ReceiptPreviewDrawer | Slide-over from button | ✅ if treated as PO with preview tab |
| 10 | RecordPrepaymentDialog | Slide-over with form | ⚠️ **Awkward fit** — this is a form, not an entity view. Tabs don't help. `actions` slot doesn't hold form content. Needs a different surface: same slide-over shell, content = form. |
| 11 | RefereeDialog | Slide-over for edit | ⚠️ same as #10 (form, not entity view) |
| 12 | RefereeRelationshipDialog | Slide-over for add | ⚠️ same |
| 13 | RefereeDetailPanel | Slide-over for view | ✅ |
| 14 | MediaBatchDrawer | Slide-over for batch detail | ✅ |
| 15 | ProcessorDetailPanel | Slide-over for processor detail | ✅ |
| 16 | CustomerPurchaseHistoryPanel | Tab in customer slide-over | ✅ |
| 17 | SalesSourcePane | Slide-over from "Add line" | ⚠️ same as #4 (tool, not entity) |
| 18 | WorkspacePanel (Sale Builder) | Context header + grid (panels become tabs) | ⚠️ **This is a top-level layout change**, not a drawer replacement. The mapping table conflates two unrelated migrations: "make Sale Builder a header strip" is a layout decision; "collapse drawers" is a component decision. Tracking together is confusing. |

**Score:** 12 of 18 are clean fits. 6 have architectural mismatches:
- 3 are "tools" (InventoryFinder, SalesSourcePane, AdvancedFilterBuilder) being squeezed into an "entity detail" API
- 3 are "forms" (RecordPrepayment, RefereeDialog, RefereeRelationshipDialog) being squeezed into a "tabs + entity" API
- 1 (WorkspacePanel/Sale Builder) is a layout change miscategorized as a drawer

### 4.2 Required API extension

The current API needs a `mode` extension and a non-tab content slot:

```typescript
interface DetailSlideoverProps {
  entityType?: string;       // optional now
  entityId?: string;          // optional now
  state: 'closed' | 'standard' | 'wide';
  mode: 'entity' | 'tool' | 'form';
  // entity mode:
  tabs?: DetailTab[];
  actions?: DetailAction[];
  headerSummary?: ReactNode;
  // tool / form mode:
  title: string;             // required for tool/form (entity infers from entityType+entityId)
  content?: ReactNode;       // single-pane content for tool/form mode
  primaryAction?: { label: string; onSubmit: () => Promise<void>; disabled?: boolean };
  secondaryActions?: DetailAction[];
}
```

URL behavior also splits:
- entity mode: `/<view>/<entityType>/<entityId>` (Mercury pattern, §14 line 1573)
- tool mode: `/<view>?tool=inventory-finder&context=so-1052` (transient state)
- form mode: `/<view>?action=record-prepayment&entityId=cust-42` (transient state)

### 4.3 Filter system consolidation (mapping doc §3.2 lines 408–414)

| Current | Becomes | API trace |
|---|---|---|
| AdvancedFilterBuilder | "Advanced" button in FilterToolbar | Opens DetailSlideover in `mode: 'tool'` ✅ if we adopt §4.2 |
| FilterPresetStrip | ViewTabBar tabs | See §1.3 — tab pills may collapse into filter pills entirely |
| SavedFiltersDropdown | FilterToolbar "Data views" dropdown | Native popover, not slide-over ✅ |
| Grid quick filter text | FilterToolbar keyword | Inline text input ✅ |
| Inline filter chips | FilterToolbar chips | Native chip component ✅ |

**Verdict:** 4 of 5 are clean. The "Status as tab vs Status as filter" question (§1.3 Rule #3) needs a decision.

### 4.4 Selection action consolidation (mapping doc §3.3 lines 418–423)

| Current | Becomes | Verdict |
|---|---|---|
| StatusActionBar | BulkActionBar | ✅ — same decision table, different placement |
| StatusActionTable | Decision table logic in BulkActionBar | ✅ |
| Selection totals strip | BulkActionBar | ✅ |
| Per-row expansion actions | Keep in expansion | ✅ |

**Verdict:** Clean.

---

## 5. Source-of-Truth Reconciliation

### 5.1 Conflicts between §14 (Mercury), DESIGN-RULES.md, and review.html

| Topic | §14 / Mercury reality | DESIGN-RULES.md says | review.html shows | Ruling |
|---|---|---|---|---|
| Page max-width | 1440px (§14 line 1530) | not stated | 1240px (review.html line 40 `--page-max: 1240px`) | **1440px** — match Mercury |
| Row height | 49px (§14 line 1533) | not stated | 44px (review.html line 42 `--row-h: 44px`) | **44px is acceptable** — slightly denser is fine; document it once |
| Row height (`WF-V-PO`, `WF-V-SALES`) | 49px | not stated | 44px (review.html) but 280px in WF-V-PO.md line 53 and WF-V-SALES.md line 179 | **44–49px** — the 280px values are bugs, override |
| Card border | NO border, shadow-only (§14 line 1517) | "0.08–0.12 opacity ... optional subtle border for accessibility" | no border (review.html line 109 `box-shadow:` only) | **NO border** — match Mercury; accessibility via focus ring |
| Pill border opacity | 0.16 (§14 line 1521) | "0.08–0.12" | 0.14 (review.html line 31 `--border-pill: rgba(112, 115, 147, 0.14)`) | **0.14** — close enough to Mercury, document the deviation rationale; correct DESIGN-RULES.md |
| Font weight max | 480 (§14 line 1509) | "400-600" | 600 (review.html line 24) | **500 cap** (see §1.3 Rule #8); 600 reserved for KPI values + slide-over title |
| Tab bars above tables | NONE (§14 line 1553) | Rule #3 keeps as "Mercury-style pill toggles" | shown above filter pills in WF2 (review.html lines 552–558) | **collapse into filter pills** unless operator data overrules |
| Summary strips | NONE, single KPI line (§14 line 1554) | Rule #4 "3-5 metric cards" | 4 cards shown (review.html lines 564–569) | **single KPI line default + "Show breakdown" expansion** |
| View headers | NONE, sidebar provides identity (§14 line 1555) | Rule #5 keeps "minimal headers" | shown as bordered band (review.html lines 548–551) | **remove framed header; action button moves to filter row** |
| Combobox immediate save | yes (combobox-behavior.md line 36) | Not stated | Not stated | **rule** — add as new top-level rule |
| URL updates on slide-over | yes (§14 line 1573) | Not stated | Not stated | **rule** — add as new top-level rule |
| Sidebar bookmarks | yes, with balances (§14 line 1563) | Mentioned in integration map | Yes (review.html lines 462–463) ✅ | **already aligned** |

### 5.2 Conflicts between the 47 WF-*.md files and the design rules/review.html

The 47 WF files were created in Phase -1 before §17.9 design rules were finalized. They use pre-Mercury assumptions in three repeated ways:

**(a) 280px row height in flagship views (`WF-V-PO.md` line 53, 117; `WF-V-SALES.md` line 179)**

Cited rationale: "spreadsheet-native display." This is operator-comfort thinking. Other views (`WF-V-PROCESSORS`, `WF-V-REFEREES`, `WF-V-MATCH`, `WF-V-CREDIT`, `WF-V-PICK`, `WF-V-MEDIA`) use 32px; `WF-V-INTAKE` uses 48px master + 56px detail; `WF-V-MERGE` and `WF-V-SETTINGS` use 44px. Mercury uses 49px.

A 280px row is ~6x a Mercury row. At 280px row height in an 800px viewport, the operator sees 2-3 rows. That is not "spreadsheet-native" — it is a card list with a faux-table layout. This decisively breaks Rule #6 (table dominance).

**Ruling:** Force `WF-V-PO.md` and `WF-V-SALES.md` to 44–49px row height. Any per-row content that genuinely needs more space goes in the slide-over Peek or row expansion, not in the row itself.

**(b) Page max-width drift (`WF-V-PO`, `WF-V-INTAKE`, `WF-V-SALES` say 1440px; `WF-V-DASH`, `WF-V-CPROFILE`, `WF-V-SETTINGS` say 1200px; `WF-V-MERGE` says 1280px; review.html says 1240px)**

There is no domain reason for view-by-view variation. Page width is part of the visual system, not the view-level decision.

**Ruling:** Set page max-width to 1440px globally (Mercury parity). Update all WF-*.md and review.html.

**(c) Five-zone header (`WF-V-PO.md` lines 6–30 show: Page Header → FilterToolbar → Active filters → GridSummaryStrip → ViewTabBar → Table)**

That's 5 zones above the table. Mercury has 3. Even after correcting the design rules (no view header, single KPI line, no tab bar), the wireframe still has a Page Header, FilterToolbar, and GridSummaryStrip — three zones — which matches Mercury.

**Ruling:** Rewrite `WF-V-PO.md`, `WF-V-SALES.md`, and all GridView wireframes to use the 3-zone layout per the corrected rules:

```
Zone 1: FilterToolbar (search | Data views ▾ | Date ▾ | Status ▾ | Vendor ▾ | ... | + New PO)
Zone 2: KPI line (15 POs · $124,500 · Draft 4 · Ordered 3 · Received 6 · Finalized 2 [Show breakdown ▾])
Zone 3: Table
```

Active filters as dismissible chips appear below Zone 1 only when filters are applied. BulkActionBar appears below Zone 3 only when rows are selected. No View Header. No Tab Bar.

### 5.3 Source-of-truth hierarchy decision

Right now no document claims authority. Multiple "single source of truth" claims exist:
- `MASTER-EXECUTION-DOCUMENT.md` claims it (§17.11 line 296, last line 1658)
- `terp-feature-to-mercury-mapping.md` is referenced as "predecessor" (line 6) → not source of truth
- `wireframes/DESIGN-RULES.md` is a "post-QA" extract → unclear authority
- `wireframes/review.html` is a "supplement, not replacement" (§17.11 line 305)
- 47 `WF-*.md` files are "the inventory" per §17.4

**Ruling:** Adopt this hierarchy:
1. **MASTER-EXECUTION-DOCUMENT.md §14** — Mercury research (immutable evidence). Reference, never edit unless re-doing DOM extraction.
2. **MASTER-EXECUTION-DOCUMENT.md §17.9 + this document's §6** — Design Rules (TERP-adapted but Mercury-faithful). Single source of truth for all visual + interaction patterns.
3. **WF-V-*.md, WF-C-*.md, WF-F-*.md** — Per-view/component/flow wireframes. MUST conform to rules. When rule and wireframe conflict, rule wins; wireframe must be updated.
4. **review.html** — Visual rendering of the rules across 10 representative wireframes. MUST be regenerated when rules change.

Implementation: add a `## Authority Hierarchy` section to `MASTER-EXECUTION-DOCUMENT.md` after §17.9 stating this hierarchy explicitly, so future agents do not have to derive it.

---

## 6. Ground-Up Design Rules [⚠️ SUPERSEDED FOR UX INTENT]

> **DO NOT USE THESE RULES FOR UX BEHAVIOR DECISIONS.**  
> These 13 rules were derived from token analysis (font weights, border opacities, pixel ratios).  
> For UX behavior (what to show, when, how many clicks), use **[DESIGN-RULES.md](wireframes/DESIGN-RULES.md) v2.0** (12 UX-first rules).  
> For implementation specs (exact px, tokens), the rules below remain authoritative for VISUAL implementation.
>
> **Authority:** mercury-ux-integrated-analysis.md (UX) → DESIGN-RULES.md v2.0 (UX rules) → This document (visual tokens)

 (Revised)

> **Superseded for UX intent (2026-06-16):** The 13 visual-system rules below have been superseded by the **UX-first rules in [DESIGN-RULES.md v2.0](./wireframes/DESIGN-RULES.md)**, which encode the 12 UX rules (UX-1 through UX-12) from [mercury-ux-integrated-analysis.md](./mercury-ux-integrated-analysis.md). The rules in this section remain authoritative for **visual tokens** (weights, opacities, max-widths, motion easing) and **layout grammar** (3-zone main area, sidebar context). For action visibility, progressive disclosure, validation placement, and URL/state semantics, follow the UX rules. When the two systems agree, that's because the visual rules below were already Mercury-faithful on those points; when they diverge, UX wins.

Derived fresh from §14 evidence + corrected for operator domain need. 13 rules instead of 10. Each cites evidence and includes one anti-example.

### Rule 1 — Three-zone main area

Every data view (GridView, MasterDetailView) shows exactly three zones above the data:
1. **FilterToolbar** (filter pills + primary action button)
2. **KPI line** (single comma-separated line, expandable)
3. **Table** (the data)

No view header. No separate tab bar. No separate summary strip. No "Active filters" appears as a separate zone — active filters render as dismissible chips inside the FilterToolbar.

**Evidence:** §14 line 1541 (Mercury has 3 elements in main area).
**Anti-example:** `WF-V-PO.md` lines 6–30 with 5 zones.

### Rule 2 — Whitespace as a primary visual element

Page max-width 1440px. Tables max-width 968px. Side margins 100–238px. Vertical spacing 24px+ between zones, 12px+ between rows.

**Evidence:** §14 line 1530 (--page-max: 1440px), line 1532 (--table-w: 968px), line 1562 (Massive whitespace).
**Anti-example:** review.html line 40 `--page-max: 1240px` (cramped).

### Rule 3 — Shadow-only depth

Cards, KPI surfaces, and detail panels use shadow only — never borders. Focus indicators use a 2px `--accent-blue` ring on `:focus-visible`. The only borders allowed are: (a) pill borders at 0.16 opacity, (b) horizontal dividers between zones at 0.10 opacity, (c) table row dividers at 0.04 opacity.

**Evidence:** §14 line 1517 (Cards have NO borders), line 1521 (Pills at 0.16).
**Anti-example:** `wireframes/DESIGN-RULES.md` Rule #7 "optional subtle border for accessibility" — replaces shadow with border drift.

### Rule 4 — Restrained typography (cap at 500)

Inter / system-ui. Weights 400 and 500 only for body, table, pills, tabs, filters, KPI labels, slide-over body. Weight 600 reserved for: (a) primary KPI values in dashboard cards (one per card), (b) entity title in slide-over header. Table headers 13px regular case (not uppercase, not bold), table cells 15px regular. View titles, when they exist in full-page detail routes, are 20px medium (weight 500), not 600.

**Evidence:** §14 line 1509 (Mercury caps at weight 480), line 1560 (table headers 13px regular case).
**Anti-example:** review.html line 24 `--fw-semibold: 600` applied broadly.

### Rule 5 — Progressive disclosure for action and context

Bulk actions, detail panels, filter popovers, and supplementary sections appear on demand. They are not pre-shown.

**Evidence:** §14 lines 1556–1557 (no bulk bar or detail panels visible by default).

### Rule 6 — Sidebar carries identity and ambient context

The left sidebar is the only persistent identity surface. It contains: (a) primary nav with active-state highlight, (b) count badges on nav items where action is required, (c) ambient context (AR/AP balances, AR aging, today's open count) as bookmarks. No view-level header repeats sidebar identity.

**Evidence:** §14 line 1555 (no view headers), line 1563 (sidebar carries account balances).
**Anti-example:** WF-V-PO.md lines 6–10 "Page Header: Purchase Orders" duplicating the sidebar's "Purchase Orders" active item.

### Rule 7 — Status filtering uses filter pills, not tabs

Status filtering uses a "Status" filter pill that opens a multi-select popover, identical in interaction to "Vendor" or "Date." Frequently-used statuses (≤ 3) may be promoted to quick-filter chips next to the Status pill. Tab bars above tables are reserved for non-data view modes (e.g., Dashboard's "My Drafts / Recent Activity / Credit Watch") where the tab represents a *content kind*, not a *filter*.

**Evidence:** §14 line 1553 (no tab bars, status via filter pills).
**Anti-example:** `WF-V-PO.md` lines 25–30 with 5-status tab bar.
**Override condition:** If operator research shows a single view averages > 5 status switches per session, that view may add a status-pill row inline (same row as filter pills, not above).

### Rule 8 — One KPI line, expandable

Above each data table: a single 28px line of comma-separated metrics ("15 POs · $124,500 · Draft 4 · Ordered 3 · Received 6 · Finalized 2"). The line ends with "Show breakdown ▾" which expands an inline card grid for the same metrics. Card grid is hidden by default. Dashboard is exempt — Dashboard's metric grid IS the dashboard, not a strip above another view.

**Evidence:** §14 lines 1543, 1549.

### Rule 9 — Collapsible supporting sections in multi-section views

Multi-section views (SalesView, IntakeView when in builder mode) show one primary surface (the active grid). Supplementary sections (Suggestions, Purchase History, Draft Lines) are collapsible via `[▸ Section Name]` toggles. Default collapsed unless context requires otherwise.

**Evidence:** §14 references "Show graphs" toggle as the progressive-disclosure pattern.

### Rule 10 — Combobox immediate save with Clear

ComboboxCellEditor saves immediately on Enter or option select — no Save button. Filled cells show a Clear (×) button. Empty cells show only the chevron. Typeahead via `aria-autocomplete="list"`. "Create new" option at dropdown bottom for extensible enums.

**Evidence:** combobox-behavior.md lines 36–38, 30.

### Rule 11 — URL is the single source of view state

Slide-over open state, active filter values, active tab, and selected row encode into the URL. Slide-over opens update URL to `/<view>/<entityType>/<entityId>`. Filters encode as query params. Tab kind encodes as fragment (`#lines`, `#vendor`). Browser back closes slide-over before navigating views.

**Evidence:** §14 line 1573 (URL updates on detail panel open).

### Rule 12 — Error states are contextual and inline

`#d92d20` for error color. Cell errors: 3px left red border + inline message. Bulk failures: BulkActionBar shows "2 done · 1 failed [View]". Empty states: centered single CTA. Loading: pulsing skeleton rows. No modal error dialogs.

**Evidence:** Mercury inline error rgb(176,23,95), adjusted for WCAG AA.

### Rule 13 — Motion is restrained and consistent

All non-instant transitions use `cubic-bezier(0.2, 0.8, 0.4, 1)`. Durations: 200ms for fades, 300ms for slide-overs and width changes, 0ms (instant) for tab switches and filter applies. Reduced-motion preference disables all transitions.

**Evidence:** §14 line 1536 (--ease-out).

---

## 7. Integration Map (Revised — Complete)

| Mercury Pattern (§14) | Revised Rule | TERP Feature(s) | Wireframe ID(s) | Status |
|---|---|---|---|---|
| 3 elements in main area | Rule 1, Rule 2 | All GridView, MasterDetailView | WF-V-PO, WF-V-ORDERS, WF-V-SALES, WF-V-INTAKE, WF-V-FULFILLMENT, WF-V-PAYMENTS, WF-V-INVENTORY, WF-V-CONNECTORS, WF-V-VPAYABLES, WF-V-DISPUTES, WF-V-PRECEIPTS, WF-V-CLOSEOUT, WF-V-RECOVERY, WF-V-MEDIA, WF-V-MATCH, WF-V-CREDIT, WF-V-REFEREES, WF-V-CONTACTS, WF-V-VENDORS, WF-V-CLIENTS, WF-V-ITEMS, WF-V-PROCESSORS, WF-V-PICK (queue screen) | **needs update** in all listed |
| On-demand detail panel | Rule 5, Rule 11 | ContextDrawer → DetailSlideover | WF-C-SLIDEOVER | mostly aligned; needs URL behavior + form/tool modes |
| Filter pills (incl. status) | Rule 7 | FilterPresetStrip + AdvancedFilterBuilder → FilterToolbar | WF-C-FILTER, WF-F-FILTER-ADVANCED | **needs update** to show Status pill, remove dedicated tab bar |
| Single KPI line | Rule 8 | StatusActionBar/GridSummaryStrip → KPI line | WF-C-SUMMARY | **needs full rewrite** |
| Inline combobox | Rule 10 | Cell editors → ComboboxCellEditor | WF-C-COMBOBOX | aligned ✅ |
| Selection bar on demand | Rule 5 | Bulk actions → BulkActionBar | WF-C-BULK, WF-F-BULK-ACTION | aligned ✅ |
| Collapsible sections | Rule 9 | WorkspacePanels → collapsible | WF-V-SALES, WF-V-INTAKE | aligned ✅ |
| One primary metric card | Rule 8 (Dashboard exempt) | Dashboard KPIs | WF-V-DASH | mostly aligned; verify weight 600 only on values |
| Sidebar bookmarks for context | Rule 6 | Nav groups → simplified sidebar | All views | aligned ✅ |
| Card shadow-only | Rule 3 | All cards, KPI surfaces, slide-over | All component wireframes | **needs update** in WF-*.md files using borders |
| Whitespace 1440px / 968px | Rule 2 | Page layout | All views | **needs update** — 1440px globally |
| Row height 49px | Rule 1 (implied) | All data grids | WF-V-PO (280→49), WF-V-SALES (280→49), rest already 32-56 | **WF-V-PO and WF-V-SALES need fix** |
| Typography weight cap | Rule 4 | All typography | All wireframes, review.html | **needs update** to 500 default, 600 reserved |
| Status filter as pill (not tab) | Rule 7 | ViewTabBar | WF-C-TABBAR | **needs full rewrite or deletion** |
| Combobox immediate save | Rule 10 | ComboboxCellEditor | WF-C-COMBOBOX | aligned ✅ |
| URL on slide-over open | Rule 11 | DetailSlideover | WF-C-SLIDEOVER | **needs explicit URL spec** |
| `cubic-bezier(0.2, 0.8, 0.4, 1)` | Rule 13 | All transitions | All component wireframes | mostly aligned |
| Inline error states | Rule 12 | All forms, cells, bulk actions | WF-C-COMBOBOX (cell error), WF-C-BULK (partial), WF-F-ERROR-RECOVER | aligned ✅ |
| Mercury IA on dashboard | Rule 1 + Rule 8 | DashboardView | WF-V-DASH, WF-C-DASHBOARD, WF-F-DASHBOARD | aligned ✅ |
| Tab bar for content-kind only | Rule 7 | Dashboard activity tabs, ContactProfile tabs, Settings tabs, slide-over tabs | WF-V-DASH, WF-V-CPROFILE, WF-V-SETTINGS, WF-C-SLIDEOVER | aligned ✅ |
| Wizard for guided flows | (preserved) | PickView | WF-V-PICK, WF-C-WIZARD | aligned ✅ |
| Profile / full-page detail | Rule 11 | EntityProfilePage | WF-F-DETAIL-NAVIGATE, profile sections | aligned ✅ |
| Per-cell exception editors | Rule 10 + new | Below-floor exception editor | **GAP — needs new WF-C-EXCEPTION-EDITOR.md** | new spec |
| Tool-mode slide-over | Rule 5 + new API | InventoryFinder, SalesSourcePane, AdvancedFilterBuilder | **GAP — needs new WF-C-SLIDEOVER-TOOL.md** | new spec |
| Form-mode slide-over | Rule 5 + new API | RecordPrepayment, Referee CRUD, single-step create dialogs | **GAP — needs new WF-C-SLIDEOVER-FORM.md** | new spec |

### 7.1 Wireframe gap registry (must be filled before Phase 0 ships)

1. `WF-C-EXCEPTION-EDITOR.md` — below-floor price exception editor (combobox + reason text).
2. `WF-C-SLIDEOVER-TOOL.md` — slide-over in tool mode for finders/builders.
3. `WF-C-SLIDEOVER-FORM.md` — slide-over in form mode for dialogs.
4. `WF-C-INVENTORY-FINDER.md` — the finder content for tool-mode slide-over.
5. `WF-C-SHEET-PREVIEW.md` — the sheet preview content.
6. `WF-C-VENDOR-TAB.md` (or expand WF-V-PO) — Vendor tab content including market signals, open AP, prior POs, Quick Add affordance.
7. `WF-C-CUSTOMER-TAB.md` — Customer slide-over tab spec: Overview, Orders, **Purchase History as DEFAULT tab**, Photography, Credit.
8. `WF-C-PRE-POST-WARNING.md` — inline warning strip pattern.
9. `WF-C-DATA-VIEWS.md` — Saved-filter "Data views" dropdown popover.
10. `WF-C-KEYWORD-SEARCH.md` — Quick keyword search in FilterToolbar.

---

## 8. Action Plan

This plan is **executable by a terminal agent** without further design judgment. Each step lists exact files, target line ranges (where mutating), and the substantive change. Numbers reference §14, §17.9, etc., from `MASTER-EXECUTION-DOCUMENT.md` and rules from §6 of this document.

### Phase A — Single source of truth (1 day, do first)

**A.1** Add Authority Hierarchy section to MASTER-EXECUTION-DOCUMENT.md.
- File: `docs/engineering-plans/MASTER-EXECUTION-DOCUMENT.md`
- Insert after line 305 (end of §17.11), before line 308 (start of §18):
  ```
  ### 17.12 Authority Hierarchy

  When sources conflict, this order wins:
  1. §14 — Mercury research (DOM evidence, immutable)
  2. §17.9 — Design Rules (TERP-adapted, Mercury-faithful)
  3. mercury-design-ground-up-analysis.md §6 — Revised rules (supersede §17.9 on adoption)
  4. WF-*.md — Per-surface wireframes (MUST conform to rules)
  5. wireframes/review.html — Visual rendering (regenerated from rules)

  Resolve disagreements by walking up this list. Lower items must be updated to match higher items, not the reverse.
  ```

**A.2** Replace §17.9 design rules with §6 of this document.
- File: `docs/engineering-plans/MASTER-EXECUTION-DOCUMENT.md`
- Replace lines 263–294 (§17.9 + §17.10) with the 13 rules and revised integration map from §6 and §7 of this document.

**A.3** Sync `wireframes/DESIGN-RULES.md` with §6.
- File: `docs/engineering-plans/wireframes/DESIGN-RULES.md`
- Full rewrite, replacing the 10 rules with the 13 rules from §6. Keep the same structure (Rule → Mercury source → TERP application → Affects → Wireframes).

### Phase B — Token / variable corrections (0.5 day)

**B.1** Fix page max-width.
- File: `docs/engineering-plans/wireframes/review.html`
- Line 40: change `--page-max: 1240px;` to `--page-max: 1440px;`
- Update any "centered max width" references in WF-V-CPROFILE.md (line 82), WF-V-DASH.md (line 92), WF-V-MERGE.md (line 87), WF-V-SETTINGS.md (line 68) from 1200/1280px to 1440px.

**B.2** Cap font weight at 500 for default body/table; 600 reserved.
- File: `docs/engineering-plans/wireframes/review.html`
- Line 24: change `--fw-regular: 400; --fw-medium: 500; --fw-semibold: 600;` to `--fw-regular: 400; --fw-medium: 500;` and define `--fw-display: 600` separately (used only for KPI card values and slide-over titles).
- Audit all `font-weight: var(--fw-semibold)` usages: keep only on `.wf-metric-value` (line 194), `.wf-so-title` (line 248), `.wf-welcome` (line 261). Remove from `.wf-table th` (none — already medium), `.wf-tab-pill.active` (line 177 — drop to `--fw-medium`), `.wf-cb.checked::after` (line 215 — drop to `--fw-medium`), `.brand` (line 68 — drop to `--fw-medium`).

**B.3** Remove card borders.
- File: `docs/engineering-plans/wireframes/review.html`
- Search for `border:` inside `.wireframe`, `.wf-metric-card`, `.wf-so` rules. Remove all card borders. Confirm `box-shadow: var(--card-shadow)` is the only depth signal. Add `:focus-visible` outline of `2px solid var(--blue)` (offset 2px) on interactive surfaces.

**B.4** Set pill opacity to 0.16 (Mercury exact) or 0.14 (current) consistently and remove `0.08–0.12` claims.
- File: `docs/engineering-plans/wireframes/review.html` line 31: `--border-pill: rgba(112, 115, 147, 0.14)` (keep current).
- Update DESIGN-RULES.md Rule 7 to say "0.14 opacity (within Mercury's 0.16 tolerance)" not "0.08–0.12."

### Phase C — Wireframe surgery (2 days, parallel-safe across files)

**C.1** Fix 280px row height in flagship views.
- File: `docs/engineering-plans/wireframes/WF-V-PO.md`
- Line 53: replace `(row height: 280px)` with `(row height: 44px)`.
- Line 117: replace `| AG Grid row height | 280px (tall rows for spreadsheet-native display) |` with `| AG Grid row height | 44px (Mercury parity, dense scannable) |`.
- File: `docs/engineering-plans/wireframes/WF-V-SALES.md`
- Line 179: replace `| AG Grid row height | 280px |` with `| AG Grid row height | 44px |`.

**C.2** Remove view headers from all GridView wireframes; promote `+ New` button to filter row.
- Files: WF-V-PO.md (lines 6–10), WF-V-ORDERS.md, WF-V-SALES.md, WF-V-INTAKE.md, WF-V-FULFILLMENT.md, WF-V-PAYMENTS.md, WF-V-INVENTORY.md, WF-V-CONNECTORS.md, WF-V-VPAYABLES.md, WF-V-DISPUTES.md, WF-V-PRECEIPTS.md, WF-V-CLOSEOUT.md, WF-V-RECOVERY.md, WF-V-MEDIA.md, WF-V-MATCH.md, WF-V-CREDIT.md, WF-V-REFEREES.md, WF-V-CONTACTS.md, WF-V-VENDORS.md, WF-V-CLIENTS.md, WF-V-ITEMS.md, WF-V-PROCESSORS.md.
- For each, locate the "Page Header" / "View Header" zone (typically the first ASCII section). Remove it. Move the primary action button (`[+ New PO]` or equivalent) to the right end of the FilterToolbar row.

**C.3** Collapse ViewTabBar into FilterToolbar Status pill.
- Files: WF-V-PO.md, WF-V-ORDERS.md, WF-V-SALES.md, WF-V-INTAKE.md, WF-V-FULFILLMENT.md, WF-V-PAYMENTS.md, WF-V-INVENTORY.md, WF-V-CONNECTORS.md, WF-V-VPAYABLES.md, WF-V-DISPUTES.md, WF-V-PRECEIPTS.md, WF-V-CLOSEOUT.md, WF-V-RECOVERY.md, WF-V-MEDIA.md, WF-V-MATCH.md, WF-V-CREDIT.md, WF-V-REFEREES.md.
- For each, locate the "ViewTabBar" zone (typically zone 4). Remove it as a separate zone. Add a "Status ▾" filter pill to the FilterToolbar that opens a multi-select popover listing statuses with counts.
- File: `docs/engineering-plans/wireframes/WF-C-TABBAR.md` — repurpose to describe content-kind tabs (Dashboard activity, Profile tabs, slide-over tabs) only. Add a header note "Status filtering uses WF-C-FILTER-STATUS.md not this component."
- Create `docs/engineering-plans/wireframes/WF-C-FILTER-STATUS.md` — spec for Status filter pill multi-select with count badges and quick-pin support.

**C.4** Replace GridSummaryStrip with single KPI line + expandable breakdown.
- File: `docs/engineering-plans/wireframes/WF-C-SUMMARY.md` — full rewrite.
- New ASCII layout:
  ```
  ┌───────────────────────────────────────────────────────────────────────────┐
  │  15 POs · $124,500 total · Draft 4 · Ordered 3 · Received 6 · Finalized 2  │
  │  [Show breakdown ▾]                                                       │
  └───────────────────────────────────────────────────────────────────────────┘
  ```
- Expanded state shows 4–6 cards in a row, each with label + value, opening below the KPI line.
- Update all view wireframes that reference GridSummaryStrip to use this two-state layout.

**C.5** Update DetailSlideover spec with mode + URL.
- File: `docs/engineering-plans/wireframes/WF-C-SLIDEOVER.md`
- Add `## Modes` section: entity, tool, form (per §4.2 above).
- Add `## URL State` section: entity → `/<view>/<entityType>/<entityId>`, tool → `?tool=...`, form → `?action=...`. Browser back closes slide-over before changing routes.
- Update interface in line 5 or near top to match §4.2.

**C.6** Customer slide-over default tab = Purchase History.
- File: `docs/engineering-plans/wireframes/WF-V-CLIENTS.md`
- In the Slideover Standard state spec (around line 118 reference), change default tab from Overview to Purchase History. Justification: matches Mercury Account page where transaction history is the default view.

**C.7** Add Quick Add affordance to PO authoring grid.
- File: `docs/engineering-plans/wireframes/WF-V-PO.md` (and/or new `WF-F-PO-CREATE.md`)
- In the PO authoring flow (when "+ New PO" is clicked), add a per-row Quick Add affordance that opens vendor's prior products list inline. Promotes Quick Add from a 2-click vendor-tab interaction to a 1-click row-level interaction.

### Phase D — New wireframes (3 days, parallel-safe)

Create the 10 wireframes listed in §7.1. Use the existing WF-*.md format (Layout ASCII → Dimensions → Interactive Elements → States → ARIA → Edge Cases).

**D.1** `WF-C-EXCEPTION-EDITOR.md` — Below-floor price exception editor.
**D.2** `WF-C-SLIDEOVER-TOOL.md` — Tool-mode slide-over (single content pane, no entity).
**D.3** `WF-C-SLIDEOVER-FORM.md` — Form-mode slide-over (form fields, primary submit, cancel).
**D.4** `WF-C-INVENTORY-FINDER.md` — Inventory Finder content for tool-mode slide-over.
**D.5** `WF-C-SHEET-PREVIEW.md` — Sheet preview content (CSV preview + copy + export).
**D.6** `WF-C-VENDOR-TAB.md` — Vendor slide-over tab (terms, open AP, prior POs, market signals, Quick Add).
**D.7** `WF-C-CUSTOMER-TAB.md` — Customer slide-over tabs: Purchase History (default), Overview, Orders, Photography, Credit.
**D.8** `WF-C-PRE-POST-WARNING.md` — Inline warning strip for pre-post validation failures.
**D.9** `WF-C-DATA-VIEWS.md` — "Data views" saved-filter dropdown popover.
**D.10** `WF-C-KEYWORD-SEARCH.md` — Keyword search behavior inside FilterToolbar.

### Phase E — Regenerate review.html (1 day)

**E.1** Regenerate the 10 review.html wireframes using the corrected rules.
- Remove view headers (lines 548–551, 620–623, 694–697, 779–782, 877–880, 951–953, 1093–1096).
- Remove tab pills as a separate zone above filter pills (lines 552–558, 624–630, 698–702, 783–789, 881–885, 1097–1101, 1033–1038). Replace with a Status filter pill in the filter pills row.
- Replace 4-card metric grid with single KPI line + "Show breakdown" affordance (lines 564–569, 636–641, 707–710, 800–805, 886–891, 1121–1126).
- Set `--page-max` to `1440px` (line 40).
- Drop `--fw-semibold` and reapply weights per Phase B.2.
- Drop card borders, ensure shadow-only.

### Phase F — Implementation primitives (2 days, after A–E reviewed and approved)

These are scoped backend / frontend primitive changes that operationalize the rules. They are NOT view-level work — they are foundation work that the existing 108 Phase 0–4 tasks depend on.

**F.1** Add CSS token contract file at `src/client/styles/tokens.css` (or update existing) to mirror review.html `:root`.
- One source of truth for `--page-max`, `--row-h`, `--fw-*`, `--card-shadow`, `--border-pill`, `--border-subtle`, `--accent-*`, `--text-*`, `--ease-out`.

**F.2** Add `FilterToolbar` schema in `src/client/config/filter-toolbar-schema.ts` with first-class support for `quickFilters: { name: 'Status', type: 'multi-select-enum', options: [...] }` so that adding a Status filter pill is a one-line config change per view.

**F.3** Add `DetailSlideover.tsx` skeleton with `mode: 'entity' | 'tool' | 'form'` API per §4.2.

**F.4** Add URL state encoder in `src/client/hooks/useViewUrlState.ts` that reads/writes `entity`, `tool`, `action`, `filters`, `tab` query/path params consistently.

**F.5** Add `KpiLine.tsx` component that renders the single comma-separated line with `[Show breakdown ▾]` affordance, expanding to an inline `KpiCardGrid` on click. Replace `GridSummaryStrip` usage progressively in Phase 0 tasks.

### Phase G — Acceptance verification (1 day)

**G.1** Run the access-cost matrix (§3) against the updated wireframes. Every "keep" row must verify; "revert" rows must now hit the target.

**G.2** Diff §14 Mercury observations against §6 rules. Every observation must map to at least one rule.

**G.3** Pick 3 representative views (PurchaseOrders, SalesView, Dashboard). Walk the 3-zone rule, the 1-KPI-line rule, the no-view-header rule, the no-tab-bar rule (except content-kind tabs). Confirm wireframe ASCII reflects each.

**G.4** Confirm review.html rendering matches Phase B token corrections in browser.

**G.5** Update `docs/engineering-plans/AI-TODO.md` to insert these phases A–G as prerequisites to existing Phase 0 tasks. No Phase 0 implementation begins until G is signed off.

### Estimated total effort

| Phase | Effort | Parallelizable? |
|---|---|---|
| A | 1 day | sequential (foundation) |
| B | 0.5 day | sequential after A |
| C | 2 days | yes, across files |
| D | 3 days | yes, 10 wireframes in parallel |
| E | 1 day | sequential after C+D |
| F | 2 days | yes, across modules |
| G | 1 day | sequential, final gate |

**Total: 7-10 days** for design surgery before Phase 0 implementation tasks resume. Compresses to 4–5 days with parallel dispatch.


---

## 9. Resolved design questions (Evan decisions, 2026-06-16)

1. **Status filtering: Filter pill (Mercury parity).** Evan: "no, in fact drafts are not used very often." The Status filter pill in the FilterToolbar is the correct default. No per-view tab pills. If a specific view later shows operator triage by status >5x per session, an override can be documented — but the default is Mercury-faithful.

2. **Recovery retry: 2 clicks (slide-over).** Evan: "two clicks, ideally this is almost never needed." Recovery is not an emergency surface; it is a last-resort tool. A failed command should open its detail slide-over where retry + context is available. One-click inline retry is removed from the plan.

These decisions tighten the Mercury fidelity: both eliminate operator-comfort rationalizations in favor of the Mercury pattern. The 13 design rules in §6 already reflect the filter-pill default; the Recovery ruling updates §3's access-cost matrix (1-click → 2-click for Recovery retry).

> **UX analysis confirmation (2026-06-16):** Both decisions were independently validated by the cross-model UX analysis ([mercury-ux-integrated-analysis.md](./mercury-ux-integrated-analysis.md)). The filter-pill-over-tabs ruling aligns with UX-9 (filtering is fluid; navigation is durable) and the Recovery 2-click ruling aligns with UX-2 (supporting information one click away, never zero, except for continuous monitoring). Both decisions reduce always-visible chrome and respect the operator attention budget. No conflict between Evan's decisions and the UX authority.

## 10. What this plan does not do

For transparency: this plan focuses on **visual + interaction rules + wireframe coverage**. It does not:

- Re-audit the backend gaps in §18 of MASTER-EXECUTION-DOCUMENT.md (Entity Schema → DB Column Mapping, State Machines, etc.). Those are real blockers but live in a different lane.
- Re-evaluate the Phase 0–4 task ordering in §1 of MASTER-EXECUTION-DOCUMENT.md.
- Address the BUG-REGISTRY.md (103 lines, not opened here).
- Specify mobile or accessibility audit details beyond what the rules imply.

These are tracked separately and should not block this plan.

---

*End of Mercury → TERP Design Analysis & Ground-Up Improvement Plan.*
