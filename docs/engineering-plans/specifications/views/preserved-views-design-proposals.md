# Preserved Views — Design Proposals

**Date:** 2026-06-17
**Branch:** `docs/mercury-ux-retrofit-master-plan`
**Status:** Design intent. Not implementation specs. Use these to draft per-view _TEMPLATE.md specs in priority order.
**Authority:** Anchored to [MERCURY-ARCHITECTURE-MANIFESTO.md](../../MERCURY-ARCHITECTURE-MANIFESTO.md) (ARCH-1..12), [mercury-ux-integrated-analysis.md](../../mercury-ux-integrated-analysis.md) (UX-1..12), [DOMAIN-REQUIREMENTS.md](../../DOMAIN-REQUIREMENTS.md) (DR-1..6).

---

## Why these five need custom proposals

These five views do not fit the canonical `PrimaryGridView` shape on first attempt. Each has at least one of: domain-specific layout (split tables, search-first), non-grid interaction model (multi-tab settings), or scale (1887 lines) where a generic template applied naïvely will erase or break working behavior. The proposals below name the design intent — what the modernized view *is*, not how to write it. Specs come next.

**Priority order (`Order:` field below):**

| # | View | Lines | Risk | Why first |
|---|---|---|---|---|
| 1 | PaymentsView | 288 | T2 | Smallest, money-critical, daily operator surface, clear split-table modernization |
| 2 | MatchmakingView | 785 | T2 | Heavy `WorkspacePanel` stack (4 panels), 3 stacked grids violate DR-2, well-scoped |
| 3 | RecoveryView | 348 | T2 | Admin tools panel is the canonical UX-3 violation; search-first reshape is straightforward |
| 4 | SalesView | 1887 | T3 | Phase 3A/B partial. The biggest one. Spec it after the other four sharpen the template. |
| 5 | SettingsView | 869 | T1 | Not an operator workflow — admin page. Lowest urgency. Modernize after Phase 3D. |

---

## 1. PaymentsView (288 lines)

**Operator workflow.** Operator records cash/check/wire/crypto receipts, then allocates each payment against open invoices for one customer. The constant rhythm is: log a payment via the Quick Ledger row → select the row → allocate (auto-apply oldest, pick a specific order, or apply a discount). "Money In" and "Money Out" are domain-distinct views on the same row stream.

**Rules in play.**
- UX-3, ARCH-1, ARCH-8: one primary surface. The current view stacks `QuickLedgerGrid` + `PaymentAllocationTools` (in a `WorkspacePanel`) + the payments grid + `FilterPresetStrip` + `UnappliedCountBadge` + `StatusActionBar`. Three of those compete for the operator's eye.
- UX-6, ARCH-4: allocation tools belong in a slide-over, not an always-visible `WorkspacePanel` below the entry row.
- UX-9: the "Money In / Money Out" split is a *filter*, not a *navigation*. It must read as a fluid pill toggle, not as tabs that imply mode change.
- DR-2: no collapsed/stacked tables below the main grid.

**Proposed modernization.**
- **Toolbar (top):** `FilterToolbar` with `StatusFilterPill` (Money In, Money Out, Unapplied, Overdue, Posted, Reversed) — *multi-select pills*, not tabs. Keyword search. `UnappliedCountBadge` becomes a single Tier 0 KPI tile in the `SummaryStrip` directly below.
- **SummaryStrip:** 4 tiles — Cash In Today, Cash Out Today, Unapplied $, Open Allocations. Hidden when `BulkActionBar` is mounted (ARCH-4).
- **Quick Ledger row (Tier 0 inline):** thin, single-row inline form anchored above the grid as part of the toolbar shelf (still a Quick Ledger experience — operators must be able to log a payment in two keystrokes; do *not* push it behind a "+ New Payment" button). Treat it like Mercury's "Send money" inline trigger row.
- **PrimaryGrid:** payments table is the view. Money In/Money Out is a `direction` column with status pill; the filter pills above re-shape what shows.
- **SlideOver (on row click):** payment detail. Tabs: `Allocations` (current `PaymentAllocationTools` content — allocate, unallocate, apply discount), `Receipt` (existing `ReceiptPanel`), `Linked Orders` (existing `PaymentLinkedOrdersTab`), `Activity`. ARCH-3: tabs lazy-mount; allocation preview query gates on tab activation.
- **BulkActionBar:** appears on selection > 0. Actions from `entity-actions.payments`: Auto-apply oldest, Allocate remaining, Mark unapplied. Replaces the row of `StatusActionBar` and the inline allocation panel.

**Preserved.** `QuickLedgerGrid` (relocated, behavior unchanged). `PaymentAllocationTools` content (moved into a slide-over tab; the JSX body keeps the same controls). `ReceiptPanel`, `PaymentLinkedOrdersTab`. `usePaymentDeepLink` (the success-toast deep-link contract). `paymentAllocationPreview` query (now gated on slide-over `Allocations` tab activation, per ARCH-3). Buyer-credit detection and impact preview text.

**Removed.** `WorkspacePanel` wrapping `PaymentAllocationTools` (DR-2, UX-3). `FilterPresetStrip` as a separate component (folded into `StatusFilterPill`). Inline `StatusActionBar` ribbon (folded into `BulkActionBar` mounted on selection). The "Money In / Money Out" interpretation as separate tables — single table, status pills filter.

**Risk:** T2. Money path; needs Deep QA on allocation, discount, unapply. Not Critical because no migration or destructive bulk path is introduced.

**Order: 1.**

---

## 2. MatchmakingView (785 lines)

**Operator workflow.** Operator enters customer needs and vendor stock, scans a deterministic match grid, accepts/dismisses matches, and follows accepted matches into a PO or sale. Two proactive opportunity tables ("To move" inventory, "Gaps to fill") sit underneath. Settings (score floor, work-queue threshold, history window) live at the top.

**Rules in play.**
- UX-3, ARCH-1: today there are five surfaces visible on load — settings `WorkspacePanel`, entry `WorkspacePanel` (two side-by-side bands), the Matches grid (primary), the proactive opportunities `WorkspacePanel` (containing two more grids), and the input registry `WorkspacePanel` (two more grids). Eight grids total. Canonical UX-3 violation.
- DR-2: three sets of stacked tables below the primary grid are forbidden.
- UX-9: matchmaking has its own "filter by customer/vendor" URL params today; preserve and surface them in the toolbar.
- ARCH-2/UX-1: the per-row Accept/Dismiss/Reopen/Create-PO/Create-Sale actions are already state-machine-shaped — formalize them in `entity-actions.matchmakingMatch`.

**Proposed modernization.**
- **Toolbar (top):** `FilterToolbar` with `StatusFilterPill` (Open, Accepted, Dismissed, Low confidence), customer/vendor combobox filter pills (reads `?customer=` / `?vendor=` URL params), keyword search across product name.
- **Settings:** moved off the canvas. A `⚙ Settings` trigger in the toolbar opens a slide-over (right side) with the existing settings controls. Settings is Tier 2 (rarely touched after initial calibration) — never mount on view load (ARCH-5). The collapsed summary chip ("Showing ≥35 · Work queue ≥75 · 90-day history") stays in the toolbar as a compact read-only badge so operators see the current calibration without opening the panel.
- **SummaryStrip:** 4 tiles — Open Matches, Avg Score, To Move (count), Gaps to Fill (count).
- **PrimaryGrid:** the Matches grid is the only Tier 0 grid. Expansion config (Accept/Dismiss/Reopen + Next-step links) stays as inline row expansion — this is UX-11-correct because the operator switches between matches and reasoning rapidly without leaving the surface.
- **Entry row:** moved into a slide-over triggered by `+ Add Need` / `+ Add Stock` buttons in the toolbar. The dual-band entry panel becomes two tabs in the slide-over (`New Customer Need` / `New Vendor Stock`). Quick-launch focus behavior preserved.
- **Proactive Opportunities and Input Registry:** the four grids inside these two `WorkspacePanel`s move to a `ViewTabBar` *above the SummaryStrip* with tabs: `Matches` (default) | `To Move` | `Gaps to Fill` | `Customer Needs` | `Vendor Stock`. Per UX-9 this is a filter, not navigation — the URL encodes it; the grid swaps; settings/toolbar/slide-over state persist.

**Preserved.** All 6 grids (matches, to-move, gaps, needs, stock + the entry form). Matchmaking settings semantics (score floor, work-queue threshold, history window, repeat threshold, gap floor, column-visibility toggles). `whyShownCol` audit column. URL filter params (`?customer=`, `?vendor=`). Quick-launch deep-links to Purchasing/Sales. Score-tier opacity styling on low-confidence matches.

**Removed.** All four `WorkspacePanel` wrappers (settings, entry, opportunities, input registry). Stacked grids below the primary (DR-2). The simultaneous render of 8 grids.

**Risk:** T2. Lots of moving parts but no money-path or migration risk. Cell-edit behavior on Needs/Stock grids must be preserved exactly (`updateCustomerNeed` / `updateVendorSupply` via `useCommandRunner` — already correct).

**Order: 2.**

---

## 3. RecoveryView (348 lines)

**Operator workflow.** Operator searches the command journal for a failed or specific command, narrows by entity-ID or command-family chip, retries failed ones, reverses successful ones through the preview panel, or runs an admin task (backup/restore preview, correction journal entry, find-and-replace).

**Rules in play.**
- UX-3, UX-9, ARCH-9: today the Admin Tools `WorkspacePanel` (with three internal tabs) sits *above* the Action Log grid — exactly the failure pattern named in friction #5 of the integrated UX analysis ("the failure is not foregrounded"). The grid is the data; Admin Tools belong in Tier 2.
- ARCH-1: the primary data source is `recoverySearch` (search-driven), not the bare entity table. ARCH-9 says failures *are* first-class data here; that fits.
- UX-12: empty/no-results state must say *why* (no matches for query? no failed commands today?) and *what next* (clear filter? widen window?).

**Proposed modernization.**
- **Toolbar (top):** `FilterToolbar` with keyword search (the existing `recoverySearch q` param), an Entity ID input chip, command-family multi-select pills, and a `StatusFilterPill` (Failed, OK, Pending, Reversed). All filter state in URL (ARCH-6).
- **SummaryStrip:** 3 tiles — Failed Today, Pending, Reversible (24h). Tile click drills into the filter.
- **PrimaryGrid:** Action Log is the view, 100% of the surface. Inline `Retry` button stays on each failed row (ARCH-9: "the row is for action").
- **SlideOver (on row click):** command detail. Tabs: `Details` (command name, label via `commandLabelFor`, full input payload, affected IDs), `Reversal` (the existing `CommandReversalTab` — the confirm-flow panel for the destructive path), `History` (entity timeline for affected IDs), `Logs`.
- **Admin Tools — moved to Tier 2.** A separate route `/recovery/admin` (or a single `⚙ Admin Tools` button in the toolbar that opens a wide slide-over). The three existing tabs (Backup & support, Correction, Find & replace) remain as tabs inside that slide-over. These are owner/manager rarely-used tools; UX-3 forbids them from competing with the failure log for attention.
- **BulkActionBar:** Retry selected (all-failed gate stays). No bulk-reverse here — single-row reversal stays through the confirm-flow tab.

**Preserved.** `recoverySearch` query and `q`/entity-ID/family filter semantics. `CommandReversalTab` (relocated into a slide-over tab; behavior unchanged). `commandFamilies` filter logic. Support packet export, backup preview/restore, correction journal entry, find-and-replace preview-then-apply — all behaviors unchanged, only their visual home moves to a Tier 2 surface.

**Removed.** Admin Tools `WorkspacePanel` rendered above the grid (UX-3, UX-5 — the canonical "failure not foregrounded" violation). Reversal preview panel rendered as a stacked `inline-panel` below the grid (DR-2; reversal moves into a slide-over tab keyed by the selected command).

**Risk:** T2. Recovery touches the command journal but the migration is pure UI reshape; no command-bus changes. Find-and-replace destructive guard (`type REPLACE` confirm + preview gate) must be preserved verbatim.

**Order: 3.**

---

## 4. SalesView (1887 lines)

**Operator workflow.** Operator either browses Sales Orders or, with a customer selected, builds a sale: adds lines (via Inventory Finder, suggestions, or typeahead), prices each line (markup, COGS exception, vendor approvals), validates pre-post checks, generates a customer-facing sheet/CSV/offer, and posts. Mid-flow they jump between picks, photography, receipts, referee credit, and customer purchase history.

**Rules in play.**
- UX-3 / ARCH-1 / ARCH-8: the original ~8-panel layout (Orders + Draft Lines + Suggestions + Builder + Customer Purchase History + Photography Queue + Inventory Finder + ContextDrawer) is the canonical violation cited across every UX document.
- UX-5 / ARCH-3: permanent "All checks passed" pre-post strip is the named anti-pattern.
- UX-7: customer-selection context must persist visibly while mid-sale. Phase 3B `SalesCustomerContextHeader` already addresses this — keep and harden.
- UX-11: collapsibles only when operator *needs* the supplement alongside the primary surface (Suggestions during sale building). Tabs in slide-over otherwise.
- DR-5 / UX-10: Pick/Pack speed — no wizard "are you sure?" between steps; cell-level edits commit immediately (already correct via `useCommandRunner`).
- DR-2: stacked tables below the primary are forbidden — the Suggestions grid and Customer Sheet preview rows currently sit stacked.

**Proposed modernization.** Two-mode router (already scaffolded in Phase 3B) — keep it; this proposal defines *what each mode renders* once the layout swap actually happens.

**Mode A — Browse (no customer):**
- Toolbar: `FilterToolbar` with `StatusFilterPill` (Draft, Open, Posted, Voided, Partial-pick, Released), customer combobox filter, keyword search.
- SummaryStrip: 4 tiles — Open Orders, Drafts (mine), Today's Posted $, Lines awaiting pick.
- PrimaryGrid: Sales Orders. Selecting/clicking an order routes to Mode B with `?customer=<uuid>&order=<uuid>` (URL is session memory per ARCH-6).
- SlideOver on row click (without leaving Browse): order detail with `Lines`, `Receipt`, `Activity` tabs.

**Mode B — Build (customer selected):**
- Sticky context header (`SalesCustomerContextHeader`, already exists): customer name, credit pill, shadow-mode banner, clear button. This satisfies UX-7 and is the *only* always-visible auxiliary surface.
- Toolbar: order-scoped filters (My drafts, This customer's open, posted-today).
- PrimaryGrid: Draft Lines for the active order. This *is* the primary surface during a sale — not Orders.
- One collapsible sibling section directly below the lines grid: `Suggestions` (ARCH-11 exception — operator legitimately switches between Lines and Suggestions while building). Single-expansion group.
- Inventory Finder: moves into a slide-over triggered by `+ Add line` (and by `/` keyboard) — *not* a permanent panel. Slide-over `wide` state preserves the operator's view of the lines grid behind it.
- Customer Purchase History, Photography Queue, Recent Sheets, Vendor Relationship: tabs in a **customer slide-over** (one entity type, `entityType="customer"`). Opened on demand from the context header. Each tab lazy-mounts and lazy-queries (ARCH-3).
- ReceiptPanel + Customer Sheet preview: become tabs in the **order slide-over**, opened from the order action footer when needed.
- Pre-post checks: inline `severity-warning` strip *above the lines grid only when issues exist* (ARCH-3 + UX-5). The "All checks passed" green strip is deleted; absence means success.
- BulkActionBar (on line selection > 0): Release, Recall, Bulk-pick-status, Apply credit, Delete lines. Sourced from `entity-actions.salesOrderLine` intersected across selection (ARCH-2).

**Preserved.** All 7 extracted cell renderers (DisplayName, BatchCode, Markup, DerivedCogs, PickStatus, WhyShown, LandedCostException, FulfillmentActions). The full `lineColumns` schema (moves into `entity-schemas.salesOrderLine`). `useSalesLineRows`, `useSalePrePostChecks`. `SalePrePostStrip` rendering logic (now conditional on `issues.length > 0`). `SalesCustomerContextHeader`. `SnapshotRetryPill`. `SaleLineItemTypeahead`. The mode router (`SALES_VIEW_MERCURY` flag) — flip it on after migration. Order primary-table builder, pricing strategy column, referee credit pill (relocated to confirmation tray).

**Removed.** `WorkspacePanel` wrappers in SalesView (10 mounts). Permanent `CustomerPurchaseHistoryPanel`, `PhotographyQueuePanel`, `SalesSourcePane`, and `InventoryFinderPanel` as always-visible siblings. The "all checks passed" strip in its happy-path form. `FilterPresetStrip` (folded into `StatusFilterPill`). Inline `StatusActionBar` (folded into `BulkActionBar`). The bespoke "warehouse alert required" `fixed inset-0` modal — replace with `useConfirm()` (UX-6).

**Risk:** T3. Largest blast radius in the codebase; touches money, picks, posting, snapshots, referee credit. Deep QA + Critical reviewer required. Migration must run behind the existing `SALES_VIEW_MERCURY` flag with the legacy view byte-identical until the flag flips. Phase 3A extracted the cell renderers (HARD GATE done); Phase 3B added the mode router shell (done); this proposal is the spec input for the real layout swap that hasn't shipped.

**Order: 4.** Spec this after PaymentsView, MatchmakingView, and RecoveryView sharpen the template patterns it depends on (StatusFilterPill, lazy slide-over tabs, BulkActionBar from entity-actions intersection).

---

## 5. SettingsView (869 lines)

**Operator workflow.** Owner/manager configures system-wide settings: connector requests, strain aliases, default pricing, raw system_settings JSON, and (owner-only) the Credit Engine — stances CRUD, per-customer overrides, bulk revert, and read-only config/stance history.

**Rules in play.** SettingsView is *not* an operator workflow — it's a power-user admin page. The Mercury rules still apply, but the canonical templates (`PrimaryGridView`, `MasterDetailView`, `DashboardView`, `WizardView`) all assume an operator-grid posture this view does not have. The honest move: introduce a fifth template, `SettingsView` (template), or accept that this view stays a multi-tab content shell and apply Mercury principles within each tab.
- UX-6: every editor (stance CRUD form, system-setting JSON editor, per-customer override form) lives in a slide-over, not inline below the table.
- UX-8: confirmations stay where the operator is. The typed-phrase guards on bulk-revert and stance-delete are correct and stay verbatim.
- ARCH-2: there is no entity status machine here — settings don't have lifecycle status. State-gated action rules don't apply.

**Proposed modernization.**
- **Top-level shell:** a left-rail tab list (vertical, role-gated) replaces the current chip row — Connector Requests, Strain Aliases, Pricing, System, Credit Engine, plus the existing canonical-route shortcuts (Action Log → /recovery, Archive → /closeout). The vertical rail signals "admin sections," distinct from the horizontal `ViewTabBar` used in operator views (UX-9 reinforcement: tabs here genuinely *are* mode/section changes, not filters).
- **Per-tab body:** each tab renders inside the same `PrimaryGridView` shell where its content is grid-shaped (Strain Aliases, Connector Requests, raw System Settings table), otherwise a plain content-pane (Credit Engine — which itself is a sectioned admin page, not a grid).
- **Strain Aliases tab:** straight `PrimaryGridView`. `OperatorGrid` body unchanged. Editable `alias` column commits via `setItemAlias` through `useCommandRunner` (already correct). No slide-over needed — cell-level edit is the only mutation.
- **System tab:** `PrimaryGridView`-shaped (key/value table). Inline editor textarea moves into a slide-over (`Edit setting`) so the table layout doesn't reflow as rows expand. JSON validation stays inline above the textarea (UX-5).
- **Credit Engine tab (owner-only):** stays a content-pane composition with three slide-over–backed editors:
  1. Global config — inline form (atomic save, single `setCreditEngineConfig` command). Per ARCH-12 this is "a form."
  2. Stances table — `OperatorGrid` style. New/Edit opens `StanceEditorForm` in a slide-over (currently rendered inline below the table — moves out). Delete keeps existing confirm dialog.
  3. Per-customer overrides — currently a stacked form; moves into a slide-over triggered by `Override customer` button.
  4. Danger zone (bulk revert) — stays inline at the bottom of the Credit Engine tab with its existing typed-`REVERT TO ENGINE` guard and danger border. This is the one piece that needs to be visible without an extra click because it's owner-only land-mine territory and the visible warning text is part of the safety.
  5. Config Change History + Stance Change History — read-only tables, stay inline as bottom-of-tab append-only logs.

**Preserved.** Every existing command and confirmation: `updateSystemSetting`, `setItemAlias`, `setCreditEngineConfig`, `createCreditEngineStance`, `updateCreditEngineStance`, `deleteCreditEngineStance`, `setCustomerStance`, `disableCreditEngineForCustomer`, `bulkRevertCustomersToEngine`. Typed-phrase guards. Owner/manager role gating. Tab redirect logic (`actions`/`archive` → /recovery, /closeout). `ConnectorsView` embed under Connector Requests. `DefaultPricingPanel` content.

**Removed.** Inline `StanceEditorForm` rendered below the Stances table (replaced by slide-over). Inline per-customer override form (replaced by slide-over). The existing horizontal report-chip tab row (replaced by left-rail navigation to signal these are admin sections, not filters). System-settings inline textarea expanding the table row (replaced by slide-over `Edit setting`).

**Risk:** T1 for the shell move and Strain Aliases / System / Pricing tabs; T2 for Credit Engine (owner-only, but bulk-revert is destructive and stance changes recompute customer limits). Deep QA on Credit Engine if any of its commands or guards are touched; the others are layout-only.

**Order: 5.** Modernize after Phase 3D ships the operator-view template patterns. Settings has the lowest daily-attention impact and the highest "different interaction model" cost — defer.

---

## Cross-cutting notes

- **Template shape.** None of these five fits the unmodified `PrimaryGridView` (table-only) shape. PaymentsView needs an inline quick-entry row. MatchmakingView needs a `ViewTabBar` (filter, not nav) above the primary grid. RecoveryView is search-driven, not entity-driven. SalesView is the two-mode router. SettingsView is multi-tab admin. **Do not** try to force all five into one template — extend `PrimaryGridView` with optional `prelude` / `tabBar` slots (replacing today's `GridJourney` props with typed, narrow slots) and add a fifth `SettingsView` template shell.
- **Lazy data.** Every slide-over tab here must lazy-mount and lazy-query (ARCH-3). The current code patterns largely respect this for sub-queries but mount tabs eagerly — fix that as part of the migration.
- **URL state.** All five views need `useViewUrlState` extension to encode their filters and slide-over tab. RecoveryView's `q`, MatchmakingView's `?customer=`/`?vendor=`, and SalesView's mode router's `?customer=` are the existing prior art — preserve them and add `status`, `tab`, `sel` as ARCH-6 requires.
- **What this document is not.** This is design intent. It does not enumerate AC, API signatures, or test scaffolds. Use these proposals as the input to per-view `_TEMPLATE.md` specs in the priority order above.
