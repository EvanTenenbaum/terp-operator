# TERP Operator — Human-Lens UX Simplicity Review

**Date:** 2026-06-12 · **Tree reviewed:** `docs/ux-simplicity-review-handoff` tip (full fix stack: PRs #477→#485 + post-stack fixes, post-162-item-audit, post-7-wave execution)
**Method:** live operator-style walkthroughs of every desktop route + mobile shell at 1512×945 (Playwright, owner/sales/intake/viewer logins), six parallel click-by-click coverage agents (sell / buy / money / warehouse / chrome / long-tail lanes, each driving its own headless browser — chrome, money, and warehouse completed in full; sell, buy, and long-tail were cut short by an external budget limit and contribute salvaged error captures only, see Part 5 residual debt), code-level density review of the 8 suspect surfaces, and web benchmarking of Odoo 17/18, NetSuite, ERPNext v15, Dynamics 365 Business Central, Linear, Airtable Interfaces, and Shopify admin (Polaris).
**Mandate (Evan):** catch overcomplication and bad design decisions; assess information density in both directions; propose the placement standard the design system is missing; benchmark against the best; **zero functionality loss** — relocate, collapse, disclose, merge, re-default; never remove.
**Companion docs:** prior audit `docs/ux-audit-2026-06-12.md` (format precedent), `docs/design-system/components/templates.md` (the six-job rule this review extends), `docs/design-system/decisions-log.md` (wave ship notes).

Scoring matches the prior audit: **Severity** (S3 blocks/corrupts mental model · S2 major friction · S1 annoying · S0 polish) × **Frequency** (F3 daily · F2 weekly · F1 occasional · F0 rare) → **P0** (5–6) · **P1** (3–4) · **P2** (1–2) · **P3** (0). Effort S < 1 day · M 1–3 days · L 1+ week. Item IDs `SX-§##` are stable.

---

# Part 0 — The two-paragraph verdict

**On composition (the original mandate):** the 7-wave remediation fixed trust vocabulary and capability reach, and the spine (OperatorGrid / StatusActionBar / ContextDrawer / FormDialog) is genuinely good and benchmark-competitive. What it left behind is a **prominence problem**: each wave mounted its feature where it was easiest to mount — inline, expanded, above the grid — so the product's three densest surfaces (Sales, Dashboard, Payments) all bury their primary work object under secondary panels, and the same money facts render up to three times on one page. Nothing needs removing. Roughly thirty items need *demoting* — collapsed, relocated, re-defaulted, or bounded — and the design system needs the one rule it never wrote down: **what earns the right to render above the primary work surface, and in what state** (Part 1).

**On flows (found by actually driving them):** click-by-click coverage contradicts the "shipped and gated" picture in important places. The five most-load-bearing pieces of connective tissue are broken at HEAD: the command palette crashes the app on every open and close; ⌘1–⌘6 and every store-driven deep link (palette launches, "Open in Recovery", "View order") change the store but never the URL; toast action buttons never render; money-IN Quick Ledger posting fails 100% of the time; and manual payment allocation silently ignores the chosen invoice. None of these are visible to typecheck/vitest gates — they live in the seams (conditional hooks, store↔router sync, render-scoped state, client/server schema drift) that only end-to-end interaction exposes. Part 4 §§I–K carries the full set with root causes; the worst belong in GitHub Issues per repo convention (repo-level bugs), and Part 5 sequences them ahead of the density work — there is no point perfecting the prominence of a surface whose primary verb fails.

---

# Part 1 — The placement standard (proposal)

## 1.1 What exists and what's missing

`templates.md` already answers six placement questions (entity context → ContextDrawer · row context → RowInspector · selection actions → StatusActionBar · pre-selection filters → FilterPresetStrip · repeated work tools → WorkspacePanel · one-shot entry → FormDialog). Every one of those is a **chrome-family** rule: *given this job, which container?*

What it never answers is the **page-composition** question: *given a page, which blocks may be present, in what order, and in what default state?* That's why "random tables" accumulate: every feature that arrives as "a panel on the X view" passes the six-job rule (it IS a WorkspacePanel!) while degrading the page. The Photography Queue on Sales, the divergence report on Credit Review, the Matchmaking settings panel, and the Dashboard's Money Buckets all individually comply with the chrome rules and collectively violate a rule that was never written.

Benchmark calibration (full notes in Part 3): Polaris encodes exactly this missing layer — one primary action per page, primary content gets ⅔ of the width, "don't allow cards to become so tall that they are difficult to overview." Business Central encodes it as the FastTab/FactBox split with three formal field-visibility tiers. Linear states it as "parts central to the user's task should stay in focus; ones that support orientation should recede." TERP has the primitives; it's missing this composition law.

## 1.2 The decision tree

For **any block** (panel, table, strip, banner, tile) a feature wants to put on a page, walk this tree **in order** — the first match wins:

```
1. Is it the page's PRIMARY work object — the thing the route's persona
   came to act on (the queue, the grid, the builder)?
   → Inline, first content block, ≥60% of initial viewport.
     EXACTLY ONE primary block per route. Everything else yields.

2. Is it edited AS PART OF the primary document (line items, draft rows)?
   → Inline grid INSIDE the primary block (already the rule everywhere).

3. Is it CONTEXT about an entity the operator is working — read-mostly,
   consulted not edited?
   → ContextDrawer tab (default), or the page's reserved context aside
     ONLY in an authoring workspace that already has a context column
     (PO authoring). Never both: one context home per route.

4. Is it a SECONDARY work surface the persona needs most visits,
   but never first (suggestions, recent sheets, registry grids)?
   → WorkspacePanel BELOW the primary, collapsed by default,
     with a live count/summary in the collapsed header.
     `collapsedSummary` is mandatory — a collapsed panel with no
     scent is a removal, and removal is forbidden.

5. Is it needed WEEKLY or less (diagnostics, divergence reports,
   admin tools, tuning knobs)?
   → Collapsed panel at the BOTTOM of the page, or a drawer tab,
     or Reports. Never above anything daily.

6. Does it serve a DIFFERENT PERSONA than the route's owner
   (photography readiness on Sales/Inventory)?
   → Its own route (it has one: /photography) plus, at most, a
     COUNT PILL or preset chip on the host route that deep-links.
     A persona's whole workstation never mounts expanded inside
     another persona's flow.

7. Is it CONFIGURATION (changes how the system behaves, not what
   work exists today)?
   → Settings. And the inverse holds: operational queues do not
     live in Settings (the Requests tab violates this today).
```

## 1.3 Page-composition invariants

These hold regardless of the tree:

- **I1 — One primary, nothing above it.** Above the primary block only: the page title/control band and blocking alerts (connection lost). A banner that doesn't block work is not a blocking alert.
- **I2 — A fact renders once per page.** If a number (payables total, customer balance) already shows in a page block, no other block on that page may show it as content — only reference it as a link. (Dashboard violates ×3 today.)
- **I3 — No unbounded DOM.** Any block whose row count follows data volume must virtualize, paginate, or hard-cap with "View all N" — the page never scrolls because a *secondary* block grew. (Finder ~5,900px and Quick Ledger ~50,000px violate today.)
- **I4 — Expanded panels are glanceable.** An expanded secondary panel ≤ ⅓ viewport; taller means it's either primary (rule 1) or needs internal scroll. (Polaris: "don't allow cards to become so tall that they are difficult to overview.")
- **I5 — Collapsed ≠ hidden.** Every collapsed panel carries a live summary (count, total, last-activity) so the disclosure has scent. This is the zero-functionality-loss guarantee in collapsed form.
- **I6 — One door per job.** A related-records set gets ONE home per route (drawer tab OR inline section OR aside — never two simultaneously). (PO lines render in both the drawer Lines tab and an off-screen inline grid today; PO authoring renders vendor context in both an aside and a drawer.)

## 1.4 Where current UI violates the standard

| Violation | Rule | Surface, evidence | Fixed by |
|---|---|---|---|
| Photography Queue expanded above primary | 6, I1 | Sales (`SalesView.tsx:1393`), Inventory (`OperationsViews` inventory stack) — 365px expanded panel above the work object on both | SX-B01 |
| Finder unvirtualized, stretches page to ~9,500px | I3, 1 | `InventoryFinderPanel` table, 78 rows → 5,671px; orders grid lands at y≈6,089 cold-start, suggestions at y≈9,777 in customer mode | SX-B02 |
| Quick Ledger renders all drafts as one DOM table | I3, 1 | `/payments` "Payment entry": 454-row table = 50,126px; posted-payments grid at y≈52,920 | SX-D01 |
| Money facts ×3 | I2 | Dashboard: KPI band, Today-Focus tiles, Money Buckets all show the same cash/payables/receivables (`DashboardView.tsx:225-372`) | SX-C01 |
| Work queues below diagnostics | 4 | Dashboard: queues at y≈1,773 under 519px Credit Watch + Money Buckets + drafts | SX-C02 |
| Registry grids compete with action grid | 4 | Matchmaking: Customer Needs + Vendor Stock + Inventory-to-Move + Gaps-to-Fill all expanded; Deterministic Matches pushed to y≈540 by settings+entry | SX-E01 |
| Tuning knobs above the work | 5/7 | Matchmaking Settings panel expanded at top (`MatchmakingView.tsx:497`, `collapsedSummary` already wired, unused) | SX-E01 |
| Weekly diagnostic above daily queue | 5 | Credit Review: 865px divergence report above the review queue (`CreditReviewView.tsx:107-111`) | SX-E02 |
| Two context homes in one route | I6 | PO authoring aside (`PurchaseOrdersView.tsx:706-736`) duplicates `VendorContextDrawer` (738-752); PO row click opens drawer Lines tab AND mounts inline lines grid off-screen (y≈1,140) | SX-F01, SX-F02 |
| Operational queue inside Settings | 7 | Settings default tab = "Requests" (= ConnectorsView, a work queue); route-away chips ("Action log →", "Archive →") styled identically to tabs (`SettingsView.tsx:44-89`) | SX-G01 |
| Sheet preview mounts empty | 4 | Sales sheet panel renders whenever a customer is selected (`sheetRows.length || customerId`, `SalesView.tsx:1810`) with a "Select suggestions…" empty state | SX-B03 |

## 1.5 Adoption

Add §"Page composition" to `templates.md` with the tree + invariants; add a PR-checklist line ("does anything new render above a primary? does any fact render twice?"); retrofit via the Part 5 waves. The tree is deliberately mechanical so future audits can flag violations by inspection — the same property that made the §10 status decision tables enforceable.

---

# Part 2 — Per-surface density assessment

*(Live geometry measured at 1512×945 as owner; "viewport" = 945px ≈ one screen. Verdicts: **too much** / **too little** / **right**, each direction assessed.)*

## 2.1 Sales — too much (the product's worst page), and too little where it counts

- **Cold start (no customer):** page is 6,387px (~7 viewports). The finder renders all 78 result rows as one HTML table (5,671px, no internal scroll, no virtualization), so the **Sales Orders grid — the operator's home base — starts at y≈6,089**. The persona bar is "new sale draft < 30s cold start"; today the operator can't even *see* orders without seven screens of scrolling. At the BE-012 threshold (~500 active batches) this table grows ~6×.
- **Customer mode (Golden Gate Buyers):** page is 10,297px (~11 viewports). What the first viewport actually shows (screenshot evidence): collapsed purchase-history bar, then the **Photography Queue fully expanded — a 365px media workstation with its own batch table, URL inputs, and Attach buttons** — then the top of the finder/builder. The line-entry typeahead (the core action) sits at y≈1,027, one full screen down. **Smart Suggestions sits at y≈9,777** — ten viewports below the typeahead it feeds, because the finder column stretches the shared row. The sheet-preview panel mounts even with zero sheet rows (its own empty state asks you to go select suggestions — the panel indicts itself).
- **Too little, simultaneously:** the *right* things are under-surfaced — suggestions are effectively unreachable; the typeahead (excellent: shorthand search, price/qty in results, honest "Enter keeps unresolved" helper) is below the fold; and the customer header facts compete with a credit-engine banner + referee pill for the space that should be the builder's.
- **Interaction bug found while driving the flow:** selecting a customer fires one `customerLastOrderedQty` query **per finder row**, batched into a single GET — 80 inputs → URL too long → **HTTP 431, all last-ordered data silently fails**. A per-row query design that breaks at exactly the row counts the finder renders.
- **Verdict:** structure (finder ⇄ builder two-column) is right and benchmark-aligned; the prominence map is inverted. Fixes: SX-B01–B05, SX-A01.

## 2.2 Dashboard — too much, in the wrong order

- 2,800px+ (~3.8 viewports at 1200px width). Vertical order: KPI band (7 tiles) → Today Focus (410px: top-3 decisions + 5 money/queue tiles) → Money Buckets (265px) → Credit Watch (519px, 10 rows) → Your drafts → **Pending work queues at y≈1,773** → Recent activity → My Open Work (a full 100-row OperatorGrid).
- **The same three money totals render three times** (KPI band → Today-Focus tiles → Money Buckets: $6,868,537 / $7,799,343 / $7,907,213 each appear in all three). Today's Top Decisions and My Open Work render the same ranked rows twice (list + grid).
- The owner persona file says "dashboard actionable without scrolling"; the actionable queues are two viewports down, under a diagnostic (Credit Watch) and a duplicate (Money Buckets). "Payments ready **495**" also shows a queue count with no bounded framing — a number that big is a backlog, not a queue.
- **Verdict:** BC-role-center ingredients in NetSuite-portlet order. Fixes: SX-C01–C04.

## 2.3 Payments — too much by three orders of magnitude

- Page height **53,366px (~56 viewports)**. The "Payment entry" Quick Ledger renders **454 draft rows + 49 posted-section rows as two plain DOM tables** (50,126px + 2,529px). The posted-payments OperatorGrid — the accounting persona's reconciliation surface — starts at y≈52,920.
- Wave 4's server-side draft persistence (CAP-024) made this structural: drafts now survive forever per-user, accumulate without bound, and there is no visible draft-hygiene affordance (archive/clear-posted/collapse). The seeded 454 is extreme but the design must bound it regardless.
- **Verdict:** the Quick Ledger grid itself (columns, negative-flip, FIFO preview) is good; it needs virtualization/pagination + draft hygiene + the posted grid above the fold. Fixes: SX-D01–D02.

## 2.4 Matchmaking — too much: three jobs on one page

- 2,188px; **seven regions, five grids, all expanded**. Settings (235px of tuning knobs — which already has a `collapsedSummary` wired and unused) + Entry forms push the actual decision surface (Deterministic Matches) to y≈540; below it, two intelligence grids (Inventory to Move, Gaps to Fill) and two registry grids (Customer Needs, Vendor Stock) all compete.
- Three distinct jobs are interleaved: *decide on matches* (daily), *browse opportunities* (weekly), *maintain the input registry* (occasional). Fixes: SX-E01.

## 2.5 Purchase Orders — right, with one duplication and one default miss

- List mode is the house exemplar: control band + one grid, 865px. Authoring is a proper two-column workspace with pinned header/total.
- Misses: (a) vendor context has **two homes** — the always-visible authoring aside and the `VendorContextDrawer` behind a "Context" button, same content; (b) clicking a PO row opens the drawer **and** mounts an inline lines grid at y≈1,140 that most operators will never notice (two doors, one of them invisible); (c) 3 of 8 default columns are prepayment fields (occasional data promoted to permanent slots); (d) the prepayment amount field renders in the authoring band even when payment terms ≠ prepayment. Fixes: SX-F01–F03, SX-H02.

## 2.6 Intake, Fulfillment, Orders — right

- Intake default: one queue section, 447px. Fulfillment: master grid + lines grid, 986px — a clean master-detail. Orders: one grid, 8 sensible columns, 4 presets including "Needs marks" (the owner's daily slice). These three prove the system can compose pages correctly; they are the pattern the dense surfaces should regress toward. (Orders' "Source conflict" default column is the one quibble — an exception flag in a permanent slot; indicator-ize it per the Odoo optional-column principle, SX-H02.)
- Inventory would join this list except the Photography Queue (365px, expanded) leads the page above the batches grid — same rule-6 violation as Sales. Fix: SX-B01.

## 2.7 Credit Review — too much for the persona who opens it

- The owner-only divergence report (865px expanded) renders above the review queue — a weekly diagnostic ahead of the daily work. `defaultCollapsed` + a live divergence count fixes it in one line. Fix: SX-E02.

## 2.8 Settings — incoherent container

- Default tab is "Requests" — a live operational queue (ConnectorsView) as the face of Settings. Credit Engine tab mixes config, per-customer operational commands, and audit history in one scroll. "Action log →" / "Archive →" chips are pixel-identical to tabs but navigate away. Strain aliases + Pricing + System are genuinely settings. Fixes: SX-G01–G02.

## 2.9 Global chrome — right, with earned credit

- The nav "More" disclosures, drawer state-cycle button + coachmark, shortcuts overlay, palette tiers, and StatusActionBar uniformity all landed well; the button-pressure complaint from the fit audit (4/10) is visibly improved. Remaining chrome items are interaction-level (Part 4 from coverage lanes), not composition-level.

---

# Part 3 — ERP benchmark notes per surface

*(Researched 2026-06-12: official docs — Polaris pattern library, Microsoft Learn, Oracle NetSuite Help, Odoo 18 docs, Frappe/ERPNext docs, Linear docs/essays, Airtable support — plus credible teardowns; citations inline.)*

## 3.1 Orders / records list views

- **Odoo** ships ~6–8 default columns with opt-in optional columns; one omnibox where applied filters render as removable chips, and Favorites are nameable, shareable, default-able saved searches. **Business Central** ships denser (8–10), with a filter pane + personal named Views, and **Analysis Mode** (tabs, drag-to-group, live aggregate footer) for exploring a list without leaving it. **NetSuite** is the cautionary tale: 8–12 columns, saved-search power locked behind expert knowledge, and a UI whose density complaints Oracle itself conceded by shipping Redwood. **Linear** holds density high deliberately but makes non-task elements *recede* ("parts central to the user's task should stay in focus; ones that support orientation and navigation should recede").
- **TERP today:** OperatorGrid + FilterPresetStrip + saved views + quick filter + density toggle is genuinely competitive with the best of these — Orders (8 cols, 4 presets) is the house exemplar. The gaps are *defaults, not capability*: PO spends 3 of its 8 default columns on prepayment (an occasional case — Odoo would put those behind the optional-columns toggle); the orders-list "Source conflict" column is an exception flag promoted to permanent column where BC would use a cue/indicator.
- **Verdict:** keep the machinery; re-derive defaults persona-first (SX-H02), and adopt the Odoo principle that *exception data is opt-in column, default indicator*.

## 3.2 Record detail / related records

- The industry has three placement strategies, ranked by glanceability-vs-weight: **count + navigate** (Odoo smart buttons in the form *header*; ERPNext buries the same idea in a last-position Connections tab and is criticized for it), **persistent side panel** (BC FactBoxes — read-mostly context, collapsible, visible *while* working), and **inline tables behind tabs** (NetSuite Related Records — maximum information, maximum page weight, the pattern most correlated with "cluttered and slow" complaints). The distilled rule: *inline grid only for data edited as part of the document; side panel for read-mostly context; count-button/drawer for whole related documents; separate page only when the related record has its own lifecycle.*
- **TERP today:** ContextDrawer with per-entity tabs (+ Timeline) **is** the BC-FactBox/Airtable-sidesheet pattern, and Airtable's record-detail default ("sidesheet… best when collaborators need to browse multiple records sequentially") validates drawer-first. TERP's violations are where it runs *two* strategies at once (PO aside + drawer; PO drawer Lines tab + inline lines grid) — NetSuite-style weight without NetSuite's excuse.
- **Verdict:** drawer-first is right; enforce I6 (one door per job). The PO authoring aside may stay as the one sanctioned FactBox-style exception *because authoring reserves the column* — but then the drawer trigger goes (SX-F01).

## 3.3 Posting / confirmation flows

- Shared industry skeleton: **one status-gated primary verb in a fixed position** (Odoo top-left buttons + clickable statusbar breadcrumb; BC ribbon Post with the Ship/Invoice/Both dialog; ERPNext Submit + Create ▾ chain; NetSuite stage buttons), a parameter dialog only when there's a real choice, and — the two ideas worth stealing — **BC Preview Posting** (inspect the ledger entries a post *would* create before committing) and **NetSuite's dual lane** (per-record buttons for exceptions, batch screens for throughput).
- **TERP today:** StatusActionBar decision tables + ⌘↵ + pre-post strip + receipt/reversal previews already exceed Odoo/ERPNext on confidence-before-commit, and the Quick Ledger *is* the NetSuite batch lane for money. TERP's status visualization (StatusPill in a grid column) sits between Odoo's breadcrumb (best) and BC's bare field (worst) — adequate, not a priority.
- **Verdict:** the posting spine is the strongest part of the product; nothing in this lane needs structural change. Coverage-lane flow results (step counts, dialog/toast quality) feed Part 4 items only.

## 3.4 Dashboard / home

- The two most operations-mature designs agree: **home = actionable counts with one-click drill-down to a filtered worklist** — BC role centers (cues with threshold colors, ordered Headline → cues → action tiles → charts) and NetSuite Reminders (any saved search becomes a count). Shopify Home = 4 metrics + open task counts; deep analytics live in a separate section. Linear goes further: home is an **Inbox** built for keyboard triage (snooze, mark read) with zero charts. Documented anti-pattern: NetSuite's unbounded portlet canvas degrading into the canonical slow, cluttered ERP homepage.
- **TERP today:** all the right ingredients — queue pills, ranked decisions, My Open Work, Credit Watch — assembled in the wrong order (KPI band → 410px Today Focus → Money Buckets → 519px Credit Watch → drafts → queues at y≈1,773 → 100-row grid), with the same three money totals rendered three times. It currently reads as "NetSuite portlet canvas," and one re-ordering away from "BC role center."
- **Verdict:** queues and ranked decisions move up; money facts render once; Credit Watch caps at 5 with View-all; the full grid becomes the bottom block (SX-C01–C03). Role-tailored dashboards (BC's per-profile role centers) are the natural follow-on but are out of scope as new capability.

## 3.5 Sales workspace (no direct ERP equivalent — composite)

- The honest benchmark is composite: Odoo's sales-order form keeps the *line grid* as the only inline grid and pushes relationship context to smart buttons; Shopify's order page gives primary content ⅔ width with status/metadata in the secondary column; Airtable's record-review layout is explicitly "list left, detail right, optimized to switch between records." Nobody mounts a second persona's workstation inside the selling surface.
- **TERP today:** the two-column finder/builder core matches Airtable record-review logic and is right. Everything *around* it violates the composition rules: Photography Queue (another persona's workstation, expanded, above), customer-intelligence facts + credit banner + referee pill stacked between the builder header and the typeahead, suggestions stranded ~9 viewports down by the finder's unvirtualized table, sheet panel mounted empty.
- **Verdict:** SX-B01–B05; the structure survives, the prominence map inverts.

## 3.6 Settings

- Odoo is the cautionary benchmark ("hidden settings" is its top recurring complaint); BC splits configuration (Setup pages) from operations (role-center cues) cleanly. Nobody benchmarked puts a live operational queue inside Settings.
- **TERP today:** "Requests" (a connector work queue) is the *default* Settings tab; Credit Engine mixes config + per-customer operations + audit history in one scroll; two navigation chips are visually identical to tabs but route away.
- **Verdict:** SX-G01–G02.

---

# Part 4 — The tick list

Every item is independently implementable, cites evidence, and preserves all functionality (relocation/disclosure/re-default only). IDs are stable.

## §A · Interaction bugs found by driving the flows (fix before the density work)

- [ ] **SX-A01 [P0·S]** Per-row `customerLastOrderedQty` batching breaks at scale: selecting a customer on Sales issues one query per visible finder row in a single batched GET; at ~80 rows the URL exceeds header limits → **HTTP 431** and every "last ordered" affordance silently fails. Evidence: console + network on customer select (80-input `/trpc/...customerLastOrderedQty×80...` URL). Fix: replace per-row queries with one `customerLastOrderedQtyBulk(customerId)` returning the map (or fold into the existing `customerWorkspace`/finder payload); cap any remaining batched GET below header limits or use POST batching.

## §B · Sales composition (decision-tree rules 1, 4, 6; invariants I1, I3)

- [ ] **SX-B01 [P0·M]** Photography Queue mounts expanded above the primary on BOTH Sales (`SalesView.tsx:1393`) and Inventory. Per rule 6 a persona's workstation never renders expanded inside another persona's flow. Fix: collapse by default with live `collapsedSummary` ("N batches need media") on both mounts — or demote to a count pill beside the finder header deep-linking `/photography`. Zero capability loss; the panel stays one click away.
- [ ] **SX-B02 [P0·L]** Finder result table is unbounded DOM (78 rows → 5,671px today; ~6× at the BE-012 threshold). It buries Sales Orders (cold start) and Smart Suggestions (customer mode) by 6–10 viewports. Fix: give `finder-table-wrap` a max-height (~60vh) with internal scroll **and** row virtualization (or windowed "Show more"); the finder pane becomes a fixed-height workspace column like the builder. This single fix un-buries two core surfaces.
- [ ] **SX-B03 [P1·S]** Sheet preview panel mounts with zero sheet rows (`SalesView.tsx:1810`, condition `sheetRows.length || customerId`). Fix: render only when `sheetRows.length > 0`; the output verbs live in its header and appear exactly when output exists.
- [ ] **SX-B04 [P1·S]** Credit-engine banner + referee pill + customer facts stack between the builder header and the typeahead (`SalesView.tsx:1443-1519`), pushing line entry below the fold. Fix: customer facts compress to one strip line; credit indicator becomes a status chip that opens the existing credit panel; referee pill relocates to the Sale tray (its moment is confirm-time, and the confirm flow already surfaces it).
- [ ] **SX-B05 [P1·S]** Purchase-history panel collapsed state is good — but it renders above the finder/builder rather than below; suggestions ("why shown" chips) should be the secondary panel directly under the builder per rule 4. Fix: reorder customer-mode stack to: control band → finder/builder → suggestions (collapsed, count summary) → history (collapsed) → sheet (when non-empty).

## §C · Dashboard composition (rules 1, 4, 5; invariant I2)

- [ ] **SX-C01 [P0·S]** Money facts render ×3 (KPI band `DashboardView.tsx:225-250`, Today-Focus tiles 304-338, Money Buckets 347-372). Fix: delete the Money Buckets panel (its per-bucket cash rows move into the existing KPI cash drilldown) and reduce Today-Focus tiles to the two non-duplicates (Open Orders, Intake ready). KPI cards take the click-throughs Money Buckets had. One fact, one home, one click.
- [ ] **SX-C02 [P0·S]** Queues below diagnostics: Pending work queues sit at y≈1,773 under Credit Watch (519px). Fix: new order — KPI band → Today Focus (decisions + 2 tiles) → **Pending work queues** → My Open Work → Credit Watch (cap 5 rows + "View all (N)" → filtered `/clients`) → drafts → Recent activity. BC role-center order: cues before charts, action before diagnostics.
- [ ] **SX-C03 [P1·S]** Today's Top Decisions (top-3 + "View all (100)") and My Open Work (100-row grid) render the same ranked rows twice. Fix: "View all" expands *into* the My Open Work grid (scroll + focus) instead of a second in-place list; the list stays top-3 only.
- [ ] **SX-C04 [P1·S]** Queue counts without bounded framing ("Payments ready 495"). Fix: cap pill display at "99+" and add the owner's actual question to the label ("495 unapplied payments — oldest 47d") or split aging buckets in the drilldown. A number that can't be worked today needs a triage hint, not just a count.

## §D · Payments / Quick Ledger (invariant I3)

- [ ] **SX-D01 [P0·L]** Quick Ledger renders every draft as DOM (454 rows → 50,126px; posted grid at y≈52,920). Fix: virtualize or paginate the draft table (window of ~30 with sticky entry row), give the "Payment entry" panel a max-height with internal scroll, and put the posted Payments grid back above the fold (entry panel collapsed-by-default when there are 0 dirty drafts is acceptable since the Keel "Money In" chip reopens it).
- [ ] **SX-D02 [P1·M]** No draft hygiene: server-persisted drafts (CAP-024) accumulate forever; no archive/clear-posted/bulk-discard affordance surfaced. Fix: selection-strip verbs on draft rows — "Discard selected drafts", "Clear posted" — plus an aging hint ("12 drafts older than 30d"). (Registry row needed if a new command is required; flag at recommendation stage.)

## §E · Matchmaking & Credit Review (rules 4, 5)

- [ ] **SX-E01 [P1·M]** Matchmaking: collapse Settings by default (its `collapsedSummary` is already wired at `MatchmakingView.tsx:500`); wrap Customer Needs + Vendor Stock in one collapsed "Input registry (N needs · M stocks)" panel; wrap Inventory-to-Move + Gaps-to-Fill in a collapsed "Proactive opportunities" panel. Result: Entry + Deterministic Matches above the fold; the other two jobs one click away with live counts.
- [ ] **SX-E02 [P1·S]** Credit Review: add `defaultCollapsed` + live divergence-count summary to the Divergence report panel (`CreditReviewView.tsx:107-111`) so the queue leads for the owner.

## §F · Purchase Orders (invariant I6)

- [ ] **SX-F01 [P1·S]** Two vendor-context homes in authoring: the aside (`PurchaseOrdersView.tsx:706-736`) and `VendorContextDrawer` (738-752) duplicate content. Fix: the aside is the sanctioned authoring FactBox — keep it; remove the "Context" drawer trigger from authoring (drawer remains for non-authoring surfaces).
- [ ] **SX-F02 [P1·S]** PO row click opens the drawer Lines tab AND mounts an inline lines grid + header strip below the fold (y≈1,140) — two doors, one invisible. Fix: pick the drawer as the door (it's where the click visibly lands); the inline lines grid renders only when the operator explicitly expands ("Open lines below" action in the drawer) or scrolls — at minimum, scroll the inline section into view on selection so it isn't a phantom.
- [ ] **SX-F03 [P2·S]** Prepayment amount field always renders in the 8-field authoring band (`PurchaseOrdersView.tsx:613-622`). Fix: render only when payment terms = prepayment.

## §G · Settings coherence (rule 7)

- [ ] **SX-G01 [P1·M]** Requests (ConnectorsView — an operational queue) is the default Settings tab. Fix: make Strain aliases or System the default; retitle the tab "Connector requests"; when `CONNECTOR_SURFACES_ENABLED` flips on, requests get their nav route back per UX-A12 and the tab becomes a link chip. Per-customer credit-engine overrides move from Settings→Credit Engine into `/credit-review` (the per-customer credit surface); Settings keeps stance CRUD + global config + history.
- [ ] **SX-G02 [P2·S]** "Action log →" / "Archive →" chips are pixel-identical to tabs but navigate away (`SettingsView.tsx:79-89`). Fix: `report-chip-external` variant (muted + external-arrow styling) or a separated "Go to" group with a divider.

## §H · Defaults & vocabulary

- [ ] **SX-H01 [P1·S]** Legacy "TERP Agro" still ships in operator-facing copy: page `<title>`, KPI descriptions ("Posted payments recorded in TERP Agro"). Fix: sweep client copy for `TERP Agro` → "TERP Operator" (title, KPI strings, any toasts); keep DB/deploy identifiers untouched.
- [ ] **SX-H02 [P1·M]** Column-default misallocations (the ≤8 *count* was enforced; the *choice* wasn't re-derived): PO spends 3 of 8 on prepayment columns (demote Prepaid + Prepay remaining to optional; keep one "Prepay" indicator); Orders' "Source conflict" exception flag becomes a row indicator/chip rather than a permanent column. Re-run the keep/hide derivation per grid against persona need (the audit's method, fresh data).

## §I · Global chrome & keyboard — found by the chrome coverage lane

*(Full repro detail, root causes, and screenshots: `docs/ux-simplicity-review-evidence/findings-chrome.md`; screenshots local under `.ux-review-scratch/shots/`. Root causes verified against the clean tree @ `ba4414a`.)*

- [ ] **SX-I01 [P0·S]** ⌘K / ⌘⇧F / ⌘⌥K crash the entire app to the error boundary on **every palette open and close**. Root cause: conditional hook — `useCommandRunner()` at `CommandPalette.tsx:280` sits below the `if (!open) return null;` early return at line 178. "Try again" recovers but leaves a blank main pane and swallows any palette-initiated navigation. Fix: hoist the hook above the early return. (One-line fix; the single highest-frequency surface in the product.)
- [ ] **SX-I02 [P0·M]** Store-only navigation never navigates: `Hotkeys.tsx` ⌘1–⌘6 call `setActiveView` (store) while routing is URL-driven and `LocationSync` syncs URL→store only — so the sidenav highlight moves and the content doesn't. Same dead pattern kills palette quick-start launches, entity-search "Go to", error-toast "Open in Recovery", and OrdersView "View order" cross-links (also seen as money lane F-16). Bonus casualty: ⌘3 during a modal closes the dialog without navigating. Fix: one `navigateToView()` helper that pushes the URL (router navigate) and let LocationSync do the rest; sweep all `setActiveView` callers.
- [ ] **SX-I03 [P0·S]** Toast action buttons (Copy details / Open in Recovery / View order) **never render** — `_pendingCallContext` in `useCommandRunner.ts` is a render-scoped local that the `isPending` re-render nulls before `onSuccess`/`onError` run. The entire UX-D01/D02 affordance shipped dead. Fix: `useRef`.
- [ ] **SX-I04 [P0·S]** Raw Zod JSON arrays render verbatim in operator-facing error toasts (palette "Log payment", every failed Quick Ledger post — where the JSON is then saved into the draft's issue field and breaks autosave at the 500-char limit). Fix: central `humanizeCommandError()` (field → label, first issue + count), raw JSON only behind the (currently dead) "Copy details".
- [ ] **SX-I05 [P1·M]** `queries.relatedCommands` returns **HTTP 500 "Database error"** for many entities (PO/lot drawer History tabs, payment rows, mobile contact history — 9+ captures across three lanes; `queries.ts:965` `affected_ids && $1::uuid[]`), and every consuming surface masks it as "No commands found"/"No history yet". Row history is the product's recovery spine — it must error loudly and work. Fix server query + add error states to History tabs.
- [ ] **SX-I06 [P1·S]** "Export support packet" (RowInspector Issue tab) 500s (`queries.selectionSupportPacket`) with **zero UI feedback** — button idles as if nothing happened. Fix query + failure toast.
- [ ] **SX-I07 [P1·S]** Advanced-filter builder: `filters.getFacets` 500s on open → enum value pickers render empty, hobbling faceted conditions. Fix query; builder should surface the load failure.
- [ ] **SX-I08 [P0·M]** Inventory inline editing is dead with **false-success feedback**: double-click/Enter never open an editor; row objects are frozen (`Cannot assign to read only property 'availableQty'`); TSV paste toasts "2 rows pasted" with no change; ⌘D fill-down toasts "Adjusted … by 0" and journals zero-delta commands. Misleading success over a no-op is the worst feedback shape for data-entry trust. Fix: clone rows for AG Grid (or mutable row adapter), make paste/fill write real drafts or refuse truthfully; then re-verify undo/redo.
- [ ] **SX-I09 [P1·S]** Drawer digit hotkeys don't match the numbers printed on the tabs (`Hotkeys.tsx:391` hardcodes stale per-view tab lists; clients digit 2 → tab labelled 3; Timeline unreachable by key on every view except purchaseOrders). Fix: derive digit mapping from the rendered tab order — delete the hardcoded lists.
- [ ] **SX-I10 [P1·M]** Half the drawer tabs render the same generic facts card: orders (Lines/Customer/Output/History), payments (Allocations/Customer/Impact/History), clients (Profile/Balance/Purchases/Notes/History) all fall through `ContextDrawerContent`'s if-chain to one body. A tab either shows tab-specific content or doesn't exist — five identical tabs erode trust in the whole drawer. Fix: implement or remove per tab map (removing a tab that renders generic content is not functionality loss; the content remains on the surviving tab).
- [ ] **SX-I11 [P0·M]** /fulfillment grid rebuilds its row DOM continuously while idle (~2,000 nodes/sec, zero network; both warehouse and chrome lanes measured it; automation clicks fail "element detached", operators get misclicks + CPU burn). Fix: hunt the unstable prop/key (likely a new array/object identity per render into AG Grid) and memoize.
- [ ] **SX-I12 [P1·S]** Hotkey layering: one Esc closes overlay **and** drawer (two handlers consume one keydown); `]` and `?` fire behind open modal dialogs (dialog guard sits after those branches in `Hotkeys.tsx`). Fix: move the dialog guard first; make Esc consume one layer per press in the registry's documented order.
- [ ] **SX-I13 [P1·S]** Grid row-count subtitle ignores free-text quick filters ("173 row(s)" while 1 row is visible; Payments "508 row(s)" likewise — two lanes). Fix: drive the subtitle from AG Grid's post-filter displayed-row count.
- [ ] **SX-I14 [P2·S]** Registry drift: drawer cycle has 4 states (Peek missing from overlay copy); ⌥M is global but listed Sales-only; ⌘D's grid fill-down meaning unlisted. Fix: registry copy pass.
- [ ] **SX-I15 [P2·S]** `F` focus mode produces no visible layout change on Sales/Inventory — only the SR announcement flips. Either make it visibly collapse chrome or pull it from the overlay until it does.
- [ ] **SX-I16 [P2·S]** Viewer-role leaks (lockdown otherwise solid): dashboard fires manager-only `creditWatchlist` → 403 every load; ⌘K lists operator+ commands to viewer (server refuses cleanly — no escalation, just noise). Fix: role-gate the query mount + filter palette commands by `commandMinRole`.

## §J · Money loop — found by the money coverage lane

*(Full detail: `docs/ux-simplicity-review-evidence/findings-money.md`. The S3 cluster should be filed as GitHub Issues per repo convention.)*

- [ ] **SX-J01 [P0·M]** **Money-IN Quick Ledger posting is completely broken** — all four receiving types fail: `postTransactionLedgerRow` rejects the client's clean payload (`date` "Expected string, received date", `reference` "Expected string, received null" — server coerces then re-validates against string schemas; crypto type additionally sets `method:'crypto'` which the schema doesn't accept). Money-OUT through the same command works. The collect loop cannot post a single customer payment from its primary entry surface.
- [ ] **SX-J02 [P0·M]** **Manual allocation to a chosen invoice is impossible**: the allocations panel's Order picker is decorative — the only enabled action sends `allocatePayment` with `{paymentId}` only and FIFOs, making unallocate a one-way door. Fix: pass the selected order/invoice through and add an "Apply to selected" action; until then the picker is a fake affordance.
- [ ] **SX-J03 [P1·S]** After re-allocation the finder row's "Applied to INV-X" trace goes stale (panel and Linked Orders disagree with the grid). Invalidate/refresh the trace projection on allocation changes.
- [ ] **SX-J04 [P0·S]** All three Payments presets (Unpaid/Overdue/Unapplied) return **0 of 508 rows** — they stuff token filters (`unappliedAmount:>0`, `category:overdue`, `status:active`) the grid filter can't evaluate; and the UX-J03 "Unapplied (N)" count pill never shipped. Also the 0-row state shows "No payments yet — press Money In" (wrong message for a filter miss). Fix: align preset tokens with real evaluable fields, add the count, add a "no matches — clear filters" empty state.
- [ ] **SX-J05 [P1·S]** Client balance triple-truth: Harbor Wellness shows grid Balance `956300.14`, drawer "Owes us $307,569.61", and a constant `1021366.82` on every ledger line — three disagreeing numbers, no reconciliation hint, balance cell not drillable, and the columns are unformatted floats. Fix: one canonical balance figure + per-surface labels ("invoice balance" vs "ledger balance"), formatted, and the cell click opens the ledger drawer.
- [ ] **SX-J06 [P1·S]** Customer name cell in Client Balances doesn't navigate to the contact profile (linked branch; click does nothing — likely the SX-I02 store-navigation root). Also the unlinked branch dispatches `linkContactToExistingEntity` with an empty placeholder contactId (guaranteed server rejection when reachable).
- [ ] **SX-J07 [P1·S]** Vendor "bill and payout tools" panel can't see the vendor's own bills/payouts (Boulder Creek with open + partially-paid bills shows "0 payout(s) · Bill none · Open $0"), so payout voiding is unusable; no prepayment ledger anywhere on /vendors.
- [ ] **SX-J08 [P1·S]** Early-pay discount unreachable: Apply Discount never enables in any state combination; its companion input is unlabeled. Wire it or remove it from the panel until wired (palette remains the interim home — flag in UI copy).
- [ ] **SX-J09 [P1·S]** `/` (root) renders a blank main pane after login while the sidenav highlights Dashboard — the dashboard lives only at /dashboard. Redirect `/` → `/dashboard`. *(The dead KPI-card/Money-Buckets drilldowns the money lane hit are the SX-C01 rework + SX-I02 navigation root.)*
- [ ] **SX-J10 [P1·S]** A $99,999,999 vendor payout posts with zero friction (and with reversal unreachable per SX-I05, it's effectively permanent). Fix: sanity threshold confirm on amounts > N× the counterparty's open exposure ("This exceeds open POs by 1,300× — post anyway?").
- [ ] **SX-J11 [P1·S]** Quick Ledger keyboard path is broken for daily entry: native 50-option `<select>`s with no typeahead-search; Enter in Amount doesn't commit the row; 21+ keys per row with button-hunting at the end. Fix: combobox with search for counterparty pickers (the sale-line typeahead is the house pattern), Enter-in-amount commits, and aria-labels on the unlabeled inputs.
- [ ] **SX-J12 [P2·S]** 27 `reaper-test-*` customers pollute every counterparty dropdown (test residue reaches operator surfaces); allocation pickers render unrounded floats (`$884.9499999999999`); the "Will apply $X" banner shows stale computations. Seed hygiene + `formatNumber` + recompute-on-change.
- [ ] **SX-J13 [P2·S]** Posted-payment Receipt tab says "Finalize the payment to produce one" — "Finalize" doesn't exist anywhere on the row (dead-end guidance). Fix copy + actually generate or hide.
- [ ] **SX-J14 [P2·S]** Topbar Quick actions "Money in"/"Money out" are silent no-ops on /payments (probable SX-I02 sibling). Fix with the navigation helper; when already on /payments they should focus the entry panel.
- [ ] **SX-J15 [P3·S]** Operator-entered payment references don't exist (auto-generated only), so bank/check reconciliation and duplicate-reference detection have no input. Product call — flag for registry.

## §K · Fulfillment & mobile — found by the warehouse coverage lane

*(Full detail: `docs/ux-simplicity-review-evidence/findings-warehouse.md`.)*

- [ ] **SX-K01 [P0·S]** **Mobile "Record Receipt" reports success while every receipt fails**: `MobilePaymentsView.tsx:167-201` sends capitalized `'Cash'` to an enum wanting lowercase AND sends the payment row id as `customerId`; the UI toasts "✓ Receipt logged" and dismisses the row while the journal shows `failed`. Silent money loss. Fix both payload bugs + surface command failure.
- [ ] **SX-K02 [P0·S]** Fulfillment queue filter chips: every click throws an uncaught Immer `enableMapSet` crash (`uiStore.ts:549` builds a Set in a producer) — and even fixed, the chips filter on statuses (`needs_picking`/`in_progress`/`ready_to_close`/`has_alerts`) that don't exist in the data model. Fix: `enableMapSet()` (or use arrays) + rewrite chips against real signals (open/fulfilled + alert join per SX-K03).
- [ ] **SX-K03 [P0·S]** Desktop dispatcher is blind to warehouse alerts: the fulfillment grid SQL never returns `alertCount`, so the Alerts column is permanently "—" and the alerts drawer (`FulfillmentView.tsx:479`) is unreachable — proven with a live alert visible on /pick at the same moment. Fix: add the alert count join to the grid query.
- [ ] **SX-K04 [P0·S]** "Hold" on the pick-line screen always fails ("Sales order line not found.") — `PickLineScreen.handleHold` sends the **fulfillment** line id to `recallLineFromPicking`, which looks up sales-order lines (`commandBus.ts:4570`). Pickers have no working exception path. Fix: pass `orderLineId`.
- [ ] **SX-K05 [P0·S]** At phone width **every** desktop deep link dumps to /mobile/dashboard, losing the target — the UX-R04 redirect effect is non-idempotent under StrictMode double-invoke (first run lands on /mobile/payments, second re-maps segment "mobile" → fallback). Fix: early-return guard `if (pathname.startsWith('/mobile')) return;` (`App.tsx:104-133`).
- [ ] **SX-K06 [P0·S]** The picks grid and lines grid share one `gridFilters['fulfillment']` slot: filtering the picks grid silently empties the lines grid (inherited `pickNo:` chip), and the shared default `status:open` makes **packed lines vanish from the lines panel as you pack them** while "Mark fulfilled" stays enabled — the operator is told to fulfill a pick with "no lines". Fix: distinct grid-filter keys (the SalesView A8 slot-clearing precedent).
- [ ] **SX-K07 [P1·S]** Fully-packed picks vanish from /pick before "Complete Order" (`pickQueue` SQL requires a line with `actual_qty = 0`), orphaning the order for phone-only pickers while it stays open on desktop. Fix: include fully-packed-but-open picks as "ready to close".
- [ ] **SX-K08 [P1·S]** Mobile "Receive Payment" list is past payment records dressed as overdue invoices: every row "$0", "⚠ 133d overdue" = days since the *payment*, prefill always 0 (`view:'payments'` as the data source). Fix: source open invoices/balances, or relabel as payment history and drop the entry affordance until SX-K01 lands.
- [ ] **SX-K09 [P1·S]** Pick queue cards read literally "/ to pick" (client renders `linesPicked`/`lineCount`; server sends `openLines`/`totalLines`) and raw status `open`. Fix: bind the real fields; map status labels.
- [ ] **SX-K10 [P1·S]** Browser/edge-swipe Back mid-pack exits the whole pick flow (3 screens are component state on one route; Forward returns to the queue with pick/line/weight lost). Fix: encode screen + pick + line in the URL (history entries per screen).
- [ ] **SX-K11 [P1·S]** Discrepancy capture is bypassable and ephemeral: double-Enter (the natural scale-operator rhythm) packs without the note; the note that *is* captured becomes a toast only — the promised Issue-tab record never exists (known L02 caveat, now operator-visible). Fix: require explicit button press on the prompt (Enter ≠ confirm twice), and schedule the server-side note command (registry row needed).
- [ ] **SX-K12 [P1·S]** Pack step count is 3 (tap line → tap weight field → Enter) vs the persona bar of ≤2 — the weight field is not auto-focused on line open. Fix: autofocus weight (the keyboard already pops on mobile).
- [ ] **SX-K13 [P2·S]** "Manifest ✓" chip tooltips a CSV at a server filesystem path with no download route — an affordance pointing at an unreachable artifact. Fix: serve the manifest behind an authenticated download or change the chip to status-only copy.
- [ ] **SX-K14 [P2·S]** Raw enum strings reach pickers (`recall_pending`, `open` chips). Map to labels.
- [ ] **SX-K15 [P2·M]** There is no warehouse role: pickers run as owner/manager/sales and the mobile shell exposes full financials (dashboard, payments, contact balances) to whoever holds the picking phone; the only mobile gate found is `canPayVendor`. Flag as a role-model/registry product call (new role = new capability row), not a UI fix.

## §L · Role-gating noise — salvaged from the partial sell/buy lanes

*(The sell, buy, and long-tail lanes were cut short by an external budget limit before writing findings docs; their error captures (`docs/ux-simplicity-review-evidence/issues-sell*.json`, `issues-buy.json`) still carry signal. Items below are verified from those captures; a follow-up lane should finish their checklists — see Part 5.)*

- [ ] **SX-L01 [P1·S]** As **sales@**, every Sales customer selection fires manager-gated `credit.creditEngineStances` + `credit.isBannerDismissed` → 74× HTTP 403 + 130× "This action requires manager access" console errors in one session. The queries must be role-gated at mount (the UI already hides the banner for non-managers — the requests shouldn't fire at all).
- [ ] **SX-L02 [P1·S]** The 431 batch failure (SX-A01) also produces 86× `Unexpected end of JSON input` TRPC errors downstream — confirming the whole batched read (customerWorkspace, salesSuggestions, purchaseHistory…) dies together: customer-mode Sales silently loses its intelligence panels for large finders. (Same fix as SX-A01; recorded for severity justification.)
- [ ] **SX-L03 [P2·S]** As **intake@**, an `approvePurchaseOrder requires manager access. Your role is operator.` rejection surfaced as an **uncaught pageerror** — the approve verb appears enabled for a role the server refuses, and the refusal isn't caught into a toast. Verify the PO decision-table gates verbs by `commandMinRole` and route refusals through the standard error path.

---

# Part 5 — Sequencing

**Wave 1 — Stop the line (broken primary flows; small fixes, huge blast radius).** SX-I01 (palette conditional hook), SX-I02 (store→URL navigation helper + caller sweep), SX-I03 (toast actions useRef), SX-J01 (money-IN schema drift), SX-J02 (allocation picker wiring), SX-K01 (mobile receipt payload), SX-K02 (Immer MapSet + chip predicates), SX-K05 (StrictMode redirect guard), SX-A01/L02 (431 bulk query), SX-J09 (`/` → /dashboard). Most are one-to-ten-line root causes already located. **File the S3s as GitHub Issues** (repo convention: repo-level bugs) so they survive independently of this doc. Gate: the §3 full gate **plus** the relevant lane repro scripts (`docs/ux-simplicity-review-evidence/repro-scripts/` are rerunnable) — vitest alone proved blind to every one of these.

**Wave 2 — Silent failures & lying feedback.** SX-I04 (error humanizer), SX-I05 (relatedCommands 500 — recovery spine), SX-I06/I07 (support packet, facets), SX-I08 (frozen-row editing + false-success toasts), SX-J04 (presets + count pill), SX-K03/K04/K06 (alerts join, hold id, filter-slot split), SX-I11 (fulfillment render loop), SX-K09 ("/ to pick").

**Wave 3 — Composition & density (the simplicity core of this review).** SX-B01–B05 (Sales prominence inversion), SX-C01–C04 (Dashboard role-center re-order), SX-D01–D02 (Quick Ledger bounding + draft hygiene), SX-E01–E02 (Matchmaking, Credit Review), SX-F01–F03 (PO one-door), SX-G01–G02 (Settings coherence). Adopt the Part 1 placement standard into `templates.md` **in the same wave** so the retrofit and the rule land together.

**Wave 4 — Coherence & polish.** SX-I09/I10 (drawer digits + generic tabs), SX-I12–I16, SX-J03/J05–J08/J10–J14, SX-K07/K08/K10–K14, SX-H01–H02 (naming + column choice re-derivation), SX-L01/L03 (role-gated query mounts).

**Wave 5 — Product calls to route (not UI fixes).** SX-J15 (payment references), SX-K15 (warehouse role + mobile financial exposure), draft-hygiene command if SX-D02 needs a new procedure — each needs a registry row / Evan decision first.

**Residual coverage debt:** the sell, buy, and long-tail lanes were cut short by an external budget limit (their checklists in `docs/ux-simplicity-review-evidence/AGENT-BRIEF.md` + the lane prompts are reusable verbatim). Highest-value unfinished probes: full sale draft→confirm→post step-count + below-floor/delivery-window edit persistence; PO authoring→partial-receive→bill→pay end-to-end; reports content pass; matchmaking accept→next-links; referee/contacts/items/disputes/photography CRUD dialogs; credit-review queue actions. Run those as one follow-up lane before Wave 3 locks the Sales/PO compositions.

---

# Appendix — evidence index

- **Committed evidence:** `docs/ux-simplicity-review-evidence/` — `findings-{chrome,money,warehouse}.md` (51 lane findings with repro + root cause), `issues-*.json` (raw console/HTTP captures incl. the salvaged sell/buy/longtail lanes), `repro-scripts/run-*.cjs` (rerunnable headless repros; run from repo root with the dev server up), benchmark digests, code-density review notes, and the reusable lane brief (`AGENT-BRIEF.md`).
- **Local-only (too heavy to commit, now gitignored under `.ux-review-scratch/`):** `shots/` — 540+ screenshots referenced by filename from the findings docs.
- **Lane mutations to the demo DB** are itemized at the end of each findings file (posted orders SO-ACTIVE-008/SO-MQBN83X4-783, fulfilled picks, a $99,999,999 probe payout, ~10 undeletable money-in drafts — the last two are themselves evidence for SX-J10/SX-D02).
- **Live-walk geometry** (Part 2 numbers) captured at 1512×945, owner login, 2026-06-12, tree `ba4414a`.

# Totals

**70 items**: §A 1 · §B 5 · §C 4 · §D 2 · §E 2 · §F 3 · §G 2 · §H 2 · §I 16 · §J 15 · §K 15 · §L 3 — of which **21 P0** (15 of them functional breaks found only by driving the flows), 37 P1, 11 P2, 1 P3. (SX-J15 and SX-K15 are product calls to route, not fixes.) Composition items trace to the Part 1 decision tree; functional items carry verified root causes and rerunnable repros.
