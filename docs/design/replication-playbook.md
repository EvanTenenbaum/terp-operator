# TERP Agro Frontend — Replication Playbook

**For**: implementing agents and engineers adding features the spec / wireframes don't explicitly cover.
**Status**: companion to `docs/design/spec.md`. Where they conflict, the spec wins.
**Purpose**: turn the patterns embodied in W1-W32 into reusable recipes so any new feature integrates as if it were designed in the original pass.

---

## How to use this doc

When a new feature, control, column, status, action, or entity needs to land in the TERP Agro frontend and is **not explicitly covered** by a wireframe or the spec:

1. **Stop. Do not invent.** The spec already encodes a paradigm (§1.3), a canvas grammar (§2), a placement law (§3), an integration discipline (§19), and a status-aware primary table for all 14 surfaces (§10). New features must fit *inside* those rules, not next to them.
2. **Run the new feature through the decision framework below.**
3. **Find the recipe** matching the closest existing pattern and apply it.
4. **Run the smoke test** (last section).
5. **Document the decision** in `docs/roadmap/integration-notes.md` if your output is a roadmap, or in the PR body if your output is code. Cite the recipe used.

If the new feature does not fit any recipe and cannot be made to fit through small adjustments, **surface the gap to the user**. Do not invent a new pattern silently.

---

## Decision framework — the 9-step pipeline

Every new feature runs through these 9 questions in order. Skip none. Skipping is how a clean design becomes a bolted-on cockpit.

```
1. Operator moment        — What real work is this serving?
2. Existing coverage      — Is this already in MR-* / TA-* / GAP-* / JY-* /
                            cockpit-table / contract? Cite the identifier.
3. Paradigm test          — Does this respect §1.3 anchors?
4. Placement law          — Which of the 8 slots (§3) does this belong in?
5. Reuse before create    — Is there an existing component / token / pattern
                            that does this? Use it.
6. Status-awareness       — If this is an action, does its primary verb
                            depend on the row's status? Add to §10 table.
7. Vocabulary             — Does the label match the operator's words
                            (Files, OFC, 25 flex, Inv Posted)?
8. Integration discipline — Does this respect §19 rules (no new colors,
                            no React Context, no React Router, etc.)?
9. Smoke test             — Run the per-phase integration smoke (§19.14)
                            on the change before merge.
```

If any step returns "no" or "I don't know," stop and resolve before coding.

---

## R1. Adding a new drawer tab

**When**: you have a new piece of supporting context that an operator wants to see while working on an entity. Examples: "show the customer's compliance status," "show the vendor's tax classification," "show the batch's chain of custody."

**Where it goes**: a new tab in the existing `ContextDrawer` for the active entity type. Never a new panel on the canvas.

**Recipe**:

1. **Identify the active entity type** the tab applies to (Customer / Vendor / Batch / Order / PO / Vendor bill / Payment / Pick / Connector request / Recovery row / Closeout period / Report row, or a queue-state).
2. **Pick the tab key**: lowercase, hyphenated, ≤20 chars. e.g., `compliance`, `chain-of-custody`, `tax-class`. Must be unique across the entity's tab set.
3. **Pick the tab label**: 1-2 words, Title Case, ≤14 chars (so it fits in peek-mode tab strip alongside others). e.g., "Compliance", "Custody chain", "Tax class".
4. **Pick the tab's data source**: an existing tRPC query that returns the data the tab needs (cite the query name from §4.7 list). If no existing query fits, **flag as a new-query request** in §21 OPEN items — do not silently add a query.
5. **Component file**: `src/client/components/drawerTabs/<EntityType><TabName>Tab.tsx`. E.g., `CustomerComplianceTab.tsx`. Default export = `DrawerTabModule` shape per §11.
6. **Register**: add the new tab to `src/client/components/drawerTabs/registry.ts` keyed by `${entityType}:${tabKey}`.
7. **Update the entity's default tab list** in the view's `<ContextDrawer tabs={…}>` array. Default position: between existing tabs in priority order (most-frequent first). For Customer, default position is after `Balance` if it's reference data; after `Notes` if it's static profile data.
8. **Read-only by default**. The tab renders the data. Click on a row inside the tab routes to that entity's surface (use `setActiveView` + `setDrawerEntity`). No mutations inside the tab.
9. **Tests**: add a Playwright spec `tests/e2e/drawer-tab-<key>.spec.ts` that opens the entity, presses `]` to open the drawer, switches to the new tab, asserts content rendered.
10. **Update §2.7 drawer tab catalog** in the spec via a follow-up PR.

**Anti-patterns**:
- Don't add a tab to "Show this when…" custom logic. Tabs are static per-entity-type.
- Don't make a tab editable. The only editable drawer tab is PO Lines.
- Don't load a tab's data eagerly. The tRPC query must use `enabled: drawerState.activeTab === '<key>' && drawerState.state !== 'closed'`.

**Smoke check**: drawer in `peek` showing tab pagination indicator (`3/10 ›`) — your new tab visible in cycle. `1..9` key index reaches it.

---

## R2. Adding a new grid column

**When**: a per-row attribute the operator scans, sorts, filters, or edits. Examples: "show carrier name on fulfillment lines," "show consignment expiration date on inventory batches."

**Where it goes**: a new entry in the view's `ColDef<GridRow>[]`. Never as a strip control or drawer field.

**Recipe**:

1. **Confirm it's per-row.** If the data is the same across all rows in the view, it's not a column — it's a strip element or a drawer tab.
2. **Pick the field name** matching the existing camelCase convention. If the data already exists on `GridRow` (via `queries.grid` or another query), use the existing name verbatim. If not, **flag** that the underlying query needs to project the field.
3. **Pick the column header label**: 1-2 words, sentence case (matches existing convention — `Source · code · Date · Vendor · Ticket cost`). Use operator vocabulary (see §19.7).
4. **Pick the width**:
   - Pinned identifier column (batchCode, orderNo, billNo): 110-150px, `pinned: 'left'`
   - Status / pill column: 90-130px
   - Numeric column: 70-100px with `type: 'numericColumn'`
   - Short text (raw marker, owner, category): 60-110px
   - Flex text (item · shorthand, notes): `minWidth: 180` with no fixed width
   - Date column: 140-170px
5. **Editability**:
   - Read-only by default. `editable: false` (or omit).
   - If editable, use the existing per-status logic from `IntakeView` as the model: `editable: (params) => params.data?.status !== 'posted'`.
   - Commits via the existing `onCellCommit` handler which calls `useCommandRunner.runCommand(<commandName>, { id, [field]: newValue }, '<plain-language description>')`.
6. **Status-aware formatting**: if the value should change color based on status (e.g., red for overdue), use a `cellRenderer` that wraps the value in a `<StatusPill>` or returns text with `className='text-red-700'` — never inline `style` props.
7. **Column groups**: if the new column fits a visual group (Identity / Item / Cost / Quantity / Status), insert it among siblings. If it doesn't fit, the column joins the catch-all "Metadata" group at the right.
8. **Tests**: extend the view's existing E2E spec — assert the column header is present and the value renders for at least one seeded row.

**Anti-patterns**:
- Don't add a column whose value is "yes/no" or a single icon — that belongs as a small icon inside another column (e.g., the `⚠` next to Price).
- Don't add a column that duplicates info from the Status pill (the "Next action" duplication was killed in §21 P2-16).
- Don't add a hover-only "tooltip" column. If it's worth showing, give it real estate.

**Smoke check**: column appears in the visible header at default density, sortable, filterable. Value renders correctly for the first 5 seeded rows.

---

## R3. Adding a new status pill tone

**When**: the existing 4-tone palette + red (§21 P2-03) doesn't cover the new status. Examples: "we need a `frozen` state for inventory legal hold."

**Where it goes**: extend `StatusPill.tsx`'s tone enum.

**Recipe**:

1. **First, try to reuse an existing tone**:
   - Amber (`#fef9c3` bg): pending / draft / ready / open — anything that's "in progress, waiting"
   - Indigo (`#e0e7ff` bg): confirmed / approved / scheduled — anything that's "in-flight, committed but not terminal"
   - Green (`#dcfce7` bg): posted / paid / received / fulfilled — anything that's "terminal-good, done"
   - Grey (`#f4f4f5` bg): cancelled / archived / locked — anything that's "terminal-closed, no further action"
   - Red (`#fee2e2` bg): failed / rejected — anything that's "terminal-bad, needs human"
2. **If your new status genuinely doesn't fit**, ask: is it really terminal? Is it really good/bad? Is it really in-flight? Most "new" statuses fit one of the 4 categories under a different word.
3. **If you confirm a new tone is needed**, propose it in writing:
   - Reason it doesn't fit existing 4+red
   - Proposed tone (pick from Tailwind's existing palette — don't invent hex)
   - Contrast verification: ≥4.5:1 against pill background
   - Which existing tones it might conflict with at a glance
4. **Surface as an open-question** to the user. Don't add tones silently.
5. **If accepted**: add to `StatusPill.tsx` tone union, add to `--color-*` tokens in `index.css`, add to §13 color-tokens table.

**Anti-patterns**:
- Don't use italics or weight changes as a "sub-tone." That's noise.
- Don't add a tone just because a new status exists. The 4 buckets above cover ~95% of operator statuses.

**Smoke check**: at 1280×800 with the existing 5 tones already on screen (e.g., on Vendor Payouts queue showing scheduled / paid / partial / open / approved), the new tone is visually distinguishable from all five.

---

## R4. Adding a new action verb

**When**: an operator needs to do something on a selected row that doesn't already have a primary or tray slot in §10. Examples: "split a shipment," "merge two batches," "clone a customer profile."

**Where it goes**: into a row's status-aware decision table (§10) — as primary or tray secondary. Never as an always-visible button.

**Recipe**:

1. **Identify the surface** the action lives on (one of the 14 routes).
2. **Identify the row status** (or statuses) when this action is valid.
3. **Determine if it's primary or tray**:
   - **Primary** if it's the *one* obvious next action at this status. Usually status-transition (e.g., `Confirm` on a `draft` order). At most one primary per status.
   - **Tray** if it's a less-frequent or alternative action. Tray verbs are 2-4 per status.
4. **Pick the verb**: imperative, 1-3 words, operator vocabulary. `Split shipment`, not `Initiate shipment partition`. `Merge lots`, not `Consolidate inventory entities`.
5. **Pick the backend command**: must exist in `src/shared/commandCatalog.ts`. If it doesn't, **flag as a new-command request** in §21 OPEN items — new commands are not in scope for the design pass.
6. **Update §10 table** for that surface: add the row-status row with the new primary or tray entry.
7. **Update `SelectionSummary` consumer** in the view: the `primaryAction` or `moreActions` prop gets the new entry.
8. **Disabled-with-reason**: if the action requires conditions beyond status (e.g., "Split shipment requires ≥2 lines"), add a clear `disabledReason` string. Plain language: "Split shipment requires at least 2 lines selected."
9. **Tests**: add a Playwright spec asserting the verb appears as primary when status matches, disappears otherwise.
10. **Hotkey**: only if the action will be used 10+ times/day per operator. Otherwise, palette + alias.

**Anti-patterns**:
- Don't add a button that's "available in all states." That's a hint the action isn't selection-bound and should be a route-level affordance instead.
- Don't add an action whose primary verb varies by viewport size or by anything other than row status. Status is the single dimension.

**Smoke check**: select a row in the matching status. Press `⌘↵`. Confirm the new verb fires and the command appears in the journal. Select a row in a different status. Confirm the verb is hidden or disabled-with-reason.

---

## R5. Adding a new hotkey

**When**: an operator does the action 10+ times per day per operator and the action is too slow via mouse / palette. Examples: rare — the existing keyboard model (§2.9) covers most cases.

**Where it goes**: into `Hotkeys.tsx`'s registry.

**Recipe**:

1. **Check the reserved chord list in §20.6**. If your candidate hotkey is reserved, pick a different one.
2. **Prefer single-key when possible**, modified only when conflicts arise. `]` is reserved; `[` is available. Avoid `⌘+letter` when single-letter would work (those conflict with browser shortcuts).
3. **Verify physical-key compatibility**: use `event.code` (e.g., `KeyD`, `BracketRight`), not `event.key`. Non-US keyboards rely on this.
4. **Add to `Hotkeys.tsx`** as a new `keydown` branch, guarded by `isEditingText(target)` to avoid hijacking text input.
5. **Add to §2.9 keyboard model table** in the spec via follow-up PR.
6. **Add to the first-entry toast** for the relevant surface (per §21 P2-14 focus mode pattern) so the hotkey is discoverable.
7. **Tests**: add a Playwright spec firing the hotkey and asserting the action.

**Anti-patterns**:
- Don't reuse a reserved chord with "different meaning depending on context." Operators won't track that.
- Don't add a hotkey for a once-a-week action.

**Smoke check**: hotkey fires from a clean grid focus state. Does NOT fire when an `<input>` is focused. Works on macOS, Linux, Windows.

---

## R6. Adding a new view / route

**When**: rare. The 14 existing routes cover all current operator surfaces. New routes should be exceptional.

**Where it goes**: a new file in `src/client/views/`, registered in `App.tsx` route switcher and `Shell.tsx` `navItems`.

**Recipe — before you build**:

1. **First, prove the new content doesn't fit as a drawer tab, a chip filter on an existing view, or a section within an existing route.** 95% of "new view" needs are actually one of these.
2. **If a new route is genuinely needed**, propose:
   - Why no existing surface works
   - Which §1.5 non-goal might apply (if you're proposing a customer / vendor workspace route, that's been rejected)
   - Which Nav group (Decide / Procure / Sell / Money / Resolve) it fits into
3. **Surface as an open-question** to the user. Don't ship a new route silently.

**Recipe — once approved**:

1. **Add the `ViewKey` literal** in `src/shared/types.ts`. One line.
2. **Add the view file** `src/client/views/<Name>View.tsx`. Follow the existing pattern from `OrdersView.tsx` (split per Phase 4).
3. **Update `App.tsx`** route switch to render the new view.
4. **Add to `Shell.tsx` `navItems`** in the correct nav group. Pick an `lucide-react` icon. Add `data-testid="sidenav-item-<viewKey>"`.
5. **Add to `navVisibleForUser`** — by default, owner + manager see it; viewer is opt-in based on whether the route writes commands.
6. **Apply canvas grammar**:
   - Pre-selection strip with ≤3 affordances
   - Status-aware selection strip (define decision table in §10)
   - Drawer tabs per active entity type (define in §2.7)
   - Identity ribbon when entity active
7. **Add ACs**: at minimum one Playwright spec per acceptance scenario.
8. **Update spec sections**: §2.3 (SideNav), §5 (Wireframe Index — add a wireframe), §10 (status-aware), §6 (AC), §12 (drawer tab contracts).

**Anti-patterns**:
- Don't add a route that depends on a single entity type — that's a workspace, and workspaces stay as panels/drawers (§1.5 wedge Option B rejection).
- Don't add a route that's just "all the data, no clear job" — that's the Inventory route already.

---

## R7. Adding a new report

**When**: a cross-entity, period-bounded aggregation is needed for owner / accounting / sales decisions. Examples: "Refund rate by category," "Inventory turnover by vendor."

**Where it goes**: a new chip in the Reports route's chip-row picker. Never its own route.

**Recipe**:

1. **Pick the report key**: lowercase, hyphenated. e.g., `refund-rate`, `turnover-by-vendor`.
2. **Pick the report label**: 2-3 words, Title Case. Visible in the chip row.
3. **Pick the data sources**: one or more existing `queries.grid({ view: <X> })` calls, joined client-side. **If joining is too expensive or returns too many rows, the report is too ambitious** — narrow the period or surface in a dedicated drawer tab on the relevant entity instead.
4. **Pick the parameters strip controls**:
   - Period (always): Last 30 days / Last 90 days / Specific period / YTD / Custom
   - Group by: choose 2-4 dimensions relevant to the report
   - Include filters: status pills (posted ✓ / draft toggles)
   - Free-text filter (`/`-style): always available
5. **Pick the visualization**:
   - Mini bar chart at 60px height with value labels (per §21 P2-13)
   - Or: no chart if data isn't time-series and grouping doesn't benefit from visual
6. **Pick the grid columns**: at most 6 columns. More columns = report is too dense; consider splitting.
7. **Selection primary**: a status-aware route-out to the owning entity. e.g., Aging inventory row → primary "Open lots in Inventory."
8. **Drawer tabs**: at minimum `Definition · Export · Saved views` (see §12 Report row).
9. **Component**: add a render function to `ReportsView.tsx`. Don't create a separate file per report unless ≥100 lines.
10. **Tests**: AC-12 covers Reports rendering + math. Extend by adding a math-correctness test with a seeded fixture asserting exact values.

**Anti-patterns**:
- Don't add a report that requires a new backend aggregation query (unless flagged as a §21 P0-11 type touchpoint).
- Don't add real-time charts. Reports are calm utility, not dashboards.
- Don't add interactive drilldown beyond row selection — that turns Reports into Dashboard.

**Smoke check**: chip-row picker shows new report. Default parameters render data. At least one row routes out via primary action.

---

## R8. Adding a new entity type

**When**: very rare. Examples: "we need a `shipment` entity that's distinct from a `pickList`."

**Where it goes**: requires backend schema change (out of scope for this design pass). **Flag as a new-entity request** and surface to the user.

**If approved at user level**, the entity needs:

1. **Backend schema + tRPC queries + commands** — out of this spec's scope.
2. **`ViewKey` extension** if it gets a dedicated route.
3. **Drawer tab catalog row** in §2.7 — list the tabs that apply to this entity type.
4. **Active-entity behavior**: identity ribbon, drawer state persistence, route history.
5. **Status pill**: pick a tone from the existing 4+red palette.
6. **Status-aware decision table** in §10 if the entity has actionable status.
7. **Wireframes**: at minimum 2 (default + selection state).

**Anti-patterns**:
- Don't add an "entity" that's actually a status (e.g., "frozen lot" — that's a status on `batches`, not a new entity).
- Don't add an "entity" that's actually a relationship (e.g., "consignment agreement" — that's a `relationship_summary` field, not a top-level entity).

---

## R9. Adding a new filter chip / saved slice

**When**: operators repeatedly apply the same set of filters and need a one-click shortcut. Examples: "show only consignment-coming-due," "show only items with low photo readiness."

**Where it goes**: into the existing chip row on the relevant surface (Sales Finder, Inventory Finder, Reports parameters strip, Connectors queue, Orders queue, Vendor Payouts queue, Closeout archives).

**Recipe**:

1. **Pick the slice key**: lowercase, hyphenated. e.g., `consignment-coming-due`, `low-photo-readiness`.
2. **Pick the label**: 2-4 words. Visible on the chip.
3. **Define the filter logic**: which fields it filters, what values, what combinator. Document inline in the source as a constant. If complex (>3 conditions), extract to a named function.
4. **Pick the default chip behavior**:
   - **Auto-applied** if the slice should always be active (e.g., always exclude `cancelled`). These aren't chips; they're query defaults.
   - **One-click** if the operator picks from a set. Most slices are this.
   - **Multi-select** if multiple slices can stack. Rare — only on filter-heavy surfaces like Inventory Finder.
5. **Persistence**: chip selection per-route persists via `uiStore` if it's a daily-use slice. Otherwise session-only.
6. **No new component**: slices use the existing `.chip` / `.finder-chip` CSS classes.
7. **Tests**: extend the surface's existing spec to verify the chip applies the filter.

**Anti-patterns**:
- Don't add a chip whose filter logic is opaque ("Recommended for you"). Slices must be explainable in plain English.
- Don't add chips that overlap semantically. If two chips both show "old stock," reconcile or remove one.

**Smoke check**: clicking the chip narrows the grid as expected. Clicking again clears (toggle behavior). Active chip count visible in the parametrized header.

---

## R10. Adding a new export / output format

**When**: an operator or customer needs a derived artifact (printed picklist, customer offer PDF, vendor receipt CSV). Examples: "we need a Slack-friendly summary of yesterday's posted orders."

**Where it goes**: a tray action on the selection strip (`More ▾ → Export X`) or a button in the `Output` drawer tab if it's customer-facing.

**Recipe**:

1. **Identify the source data**: the selected rows or the active entity.
2. **Identify the output format**: CSV / JSON / Markdown / clipboard plain text / PDF (via existing PDF generation). Don't introduce new formats.
3. **Customer-safe filtering**: if the output goes to a customer / vendor / public, hide cost, margin, internal notes, internal status markers. Reuse the `sheetMode === 'catalog'` filter pattern from `SalesView.tsx`.
4. **Filename pattern**: `terp-agro-<view>-<subtype>-<ISO-date>.<ext>`. Match existing `csvExport` query convention.
5. **Implementation**: client-side via `Blob` + `URL.createObjectURL` (per existing `downloadText` helper in `OperatorGrid.tsx`). No backend involvement unless format requires server-side rendering (PDFs are server-side per existing closeout archive pattern).
6. **Tests**: extend the surface's spec to assert clicking the export downloads a file with the correct filename pattern.

**Anti-patterns**:
- Don't show internal cost / margin in any customer-facing output.
- Don't add a "fancy" export format (e.g., HTML with inline CSS). CSV / Markdown / plain text only for clipboard targets.
- Don't add server-side PDF generation for one-off needs — reserve PDFs for closeout artifacts where they already exist.

---

## R11. Adding a new error / empty / loading state for a new surface

**When**: a new view or drawer tab needs to handle no-data, error, and loading states.

**Where it goes**: inline in the new component.

**Recipe**:

1. **Loading**: use AG Grid's built-in `loading` prop for grids. For drawer tabs, render a 32×32 spinner centered with `text-zinc-500` label "Loading…" — never a skeleton.
2. **Empty**: use `EmptyState` component with one line + one CTA. The CTA should be the primary action this surface enables. E.g., empty Orders → "No orders yet today" + `+ New Order` (routes to Sales). Empty Customer Purchases tab → "No orders in last 90 days" + `Open in Sales to start one`.
3. **Error**: red bordered banner above grid (`#991b1b border, #fee2e2 bg`) with the error message + retry button. Backed by tRPC's existing error envelope. No console-error reliance.
4. **Tests**: each state has its own Playwright spec. Use tRPC mocking or seeded-empty fixtures to trigger states.

**Anti-patterns**:
- Don't show a generic "Something went wrong" message. Use the tRPC error's `message` field — operator vocabulary preserved.
- Don't use amber for errors (conflicts with warning pills). Red for errors, amber for warnings.
- Don't use skeleton loaders — too aspirational. Spinner + label is restrained.

---

## R12. Adding a new cross-entity workflow

**When**: an operator workflow spans multiple entity types in a single session. Examples: "PO → Intake → Receipt → Bill → Payout" is already the canonical example (PO Linked-intake tab trace ribbon).

**Where it goes**: as a **traceability ribbon** in the originating entity's drawer (most common), or as a **linked-tab** cross-reference.

**Recipe**:

1. **Identify the entity chain**: the linear sequence of entity types involved.
2. **Pick the "anchor" entity** — the one the operator usually starts from. This is where the traceability ribbon lives.
3. **Decide on the ribbon vs. tab**:
   - **Ribbon** if the chain is short (≤5 hops) and the operator wants one-glance traceability. Use the PO Linked-intake ribbon pattern (§21.6, W11 reference).
   - **Tab** if the chain has multiple entries per node (e.g., a Customer has many Orders; the trace becomes a tree). Use a drawer tab per node type.
4. **Ribbon format**: `Entity-A → Entity-B → Entity-C → Entity-D → Entity-E`. Each is clickable. Click routes to that entity with state preservation (`pushRouteHistory` then `setActiveView` + `setSelectedRows`).
5. **Component**: reuse `TraceabilityRibbon` (added in Phase 2 per spec §7).
6. **Tests**: end-to-end trace test — click each node in the ribbon; assert the route + selection update; press `⌘←` to return; assert prior state restored.

**Anti-patterns**:
- Don't make the trace static / text-only. Each hop must be navigable.
- Don't link to an entity the operator can't access (RBAC) — show as text with `(no access)` suffix.

---

## R13. Adding a new telemetry event

**When**: a new operator behavior or system state worth tracking for later ease-of-use analysis.

**Where it goes**: a new entry in the `emitTelemetry({ event, payload })` calls scattered across components.

**Recipe**:

1. **Pick the event name**: `ui.<surface>.<action>.<modifier>`. e.g., `ui.reports.exported`, `ui.drawer.tab.switched`, `ui.connector.routed`.
2. **Pick the payload shape**: small, named keys, no entity IDs unless necessary for analysis (avoid leaking customer IDs into telemetry).
3. **Add to §17 spec table** via follow-up PR.
4. **Server-side**: confirm the existing telemetry sink accepts the event. If not, **flag** — server-side handling was a §21 OPEN-11 question.

**Anti-patterns**:
- Don't emit per-keystroke events.
- Don't include personally identifying data in payloads.
- Don't emit events for events' sake. Each event must answer a real question.

---

## R14. Adding a new keyboard model semantic

**When**: rare. The descending-scope `Esc` and band-swap patterns cover most flows.

**If needed**: surface as an open question, never invent silently. Adding a new keyboard semantic risks breaking the descending-scope `Esc` ordering.

---

## R15. Adding a new role / permission level

**Where it goes**: backend RBAC (out of design scope) + `navVisibleForUser` update.

**Recipe**:

1. **Backend RBAC change** — out of design scope. Surface to user.
2. **`Shell.tsx → navVisibleForUser`** updated to gate routes per role.
3. **Primary action disabled-with-reason** when the operator's role can't run the command. Plain language: "Manager+ approval required."
4. **No silent hiding**. If a feature is hidden by role, show a "limited access" pill on the row or in the drawer.

**Anti-patterns**:
- Don't hide entire surfaces from a role without an explanation. Operators who can see a teammate working on something they can't access lose trust.

---

## R16. Adding a new connector source type

**When**: a new external surface submits work into TERP Agro. Examples: "we're adding a Shopify integration."

**Where it goes**: as a new `source` value on the connector_requests table + a new `requestType` enum.

**Recipe**:

1. **Backend additions** are out of design scope — surface.
2. **Connectors route already accepts new sources** without UI changes (the `source` and `requestType` columns are free-text-ish).
3. **Drawer Session tab** must handle the new payload shape — extend with a new branch in `ConnectorSessionTab.tsx`.
4. **Routing destinations**: confirm the new source routes to existing target lanes (sales / intake / fulfillment / payments). If a new target is needed, that's a new view (R6).
5. **Safety banner stays.** No new source mutates ledgers directly.

---

## Aesthetic & vocabulary rules that don't fit a single recipe

- **Operator vocabulary always wins.** When in doubt, ask: "What does the operator call this?" Files. OFC. 25 flex. Inv Posted. Pay/F-up. New PO. Receive Inventory. Allocate FIFO. Buyer credit. Use these verbatim.
- **Calm utility over delight.** No decorative animations, hover effects, sparkles, confetti, success modals. The work IS the affordance.
- **Density discipline.** Operator console runs at compact density. New surfaces start at compact. If something needs more breathing room, it's wrong.
- **Square corners. 1px borders. `border-line`.** No `rounded-*` unless an existing component uses it. No `border-2`. No shadows except palette / overlay / drawer-pinned modal.
- **Status pills carry information; identity ribbons carry context; drawer tabs carry support.** Don't conflate.
- **Time is operator-relative.** "today 10:14" / "2m" / "4/29" not "May 11, 2026 at 10:14 AM UTC."
- **Dollar amounts**: `$1,420` not `$1,420.00` unless cents are operationally meaningful. Negative amounts: `-$500` with the warn-pill amber bg.
- **Counts use bold + space**: `12 orders` / `Σ qty 9` / `5 of 9 visible`. Avoid `Total: 12`.
- **Action verbs are imperative + present.** `Post`, `Schedule`, `Pack remaining`, `Mark Ready`. Not `Posting` or `To Post`.
- **The selection-strip primary verb is the same verb the queue-grid's `Next action` column (where present) shows.** Single source of truth.

---

## Anti-patterns (don't do these, ever)

| Anti-pattern | Why it breaks the design |
| --- | --- |
| Modal wizards for routine work | Violates row-as-working-memory |
| Decorative animations / hover effects | Calm utility brand promise |
| Visible JSON in default UI | Power-user tool; behind `⌘⌥K` only |
| Icon-only buttons without tooltips | Operator scanning needs labels |
| New third-party libraries | Stack is React + AG Grid + Lucide + Tailwind + Zustand + TanStack — that's it |
| New font imports | System stack only |
| New routing library | `uiStore.activeView` is the router |
| Per-component CSS-in-JS | `index.css` + Tailwind only |
| Background polling | Socket.io invalidation is the mechanism |
| New auth middleware on the client | Session cookie + existing tRPC interceptor |
| Customer-facing UI in this app | Internal operator console; customer outputs are exports, not surfaces |
| Hide a feature behind role without explanation | Trust erosion |
| Add a control panel "for power users" | All operators are power users by definition |
| "We'll fix this in a later phase" without an explicit phase number | False confidence — name the phase |

---

## The smoke test (run before any new feature merges)

For each new feature, verify all 10 in order:

1. ☐ **Operator moment identified.** Document which JY-* / J* / GAP-* / S* it addresses, or why it's worth doing without one.
2. ☐ **Placement law check.** The feature lives in exactly one of the 8 slots (§3). Document which.
3. ☐ **Recipe applied.** Cite the recipe (R1-R16) used or document why none applied + how the integration was approached.
4. ☐ **Paradigm anchors respected.** Document which of the 7 §1.3 anchors the feature reinforces (or be honest if it tests one).
5. ☐ **Existing components reused.** If the feature introduces a new component, justify why no existing one (WorkspacePanel / OperatorGrid / StatusPill / EmptyState / KpiCard / SelectionSummary / ContextDrawer / IdentityRibbon) was reusable.
6. ☐ **Tokens reused.** No new colors, fonts, spacings, or animation timings introduced. If introduced, justify and document in §13.
7. ☐ **Operator vocabulary verified.** Run a grep for ERP jargon ("GL", "AR aging", "trial balance", "create entity", "Customer ID:") — none should appear in user-facing strings.
8. ☐ **Keyboard model preserved.** New hotkey doesn't shadow a reserved chord. `Esc` descending-scope order still works.
9. ☐ **A11y check.** ARIA roles for new components. Keyboard reachable. Contrast ≥4.5:1 on text, ≥3:1 on pills. `prefers-reduced-motion` honored.
10. ☐ **Test added.** At minimum one Playwright spec asserting the feature behaves at the canonical operator moment.

If any check fails: stop, fix, re-run. Don't skip — that's how the next adversarial review finds 80 issues.

---

## When you're not sure

When in doubt:

1. Read the spec §1.3 (paradigm anchors), §2 (canvas grammar), §3 (placement law), §19 (integration discipline), §21 (adversarial resolutions).
2. Look at the closest existing surface in the wireframes. Do what it does.
3. If still unsure, surface to the user with a one-page memo: feature description, three options, your recommendation with reasoning, reversibility note.

Never invent in silence.

---

## Replication compass — the four questions to ask before ANY new pixel ships

1. **Does this match the operator paradigm or contradict it?** Cite the anchor.
2. **Does this match the canvas grammar or break it?** Name the zone.
3. **Does this match the placement law or bypass it?** Name the slot.
4. **Does this match the vocabulary or introduce jargon?** Quote both sides.

If you can answer all four with "match," ship it. If any answer is "I'm not sure," ask. If any answer is "break / bypass / introduce," redesign or reject.

---

*This playbook is a living document. As new patterns emerge during implementation that genuinely earn their place, append recipes here in follow-up PRs. Do not delete recipes — they preserve the rationale of decisions already made.*
