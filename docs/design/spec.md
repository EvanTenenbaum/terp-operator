# TERP Agro Frontend Direction — Design Spec

- **Date**: 2026-05-11
- **Status**: brainstorm complete → awaiting approval → writing-plans
- **Scope**: frontend density / hierarchy / contextual-access pass.
- **Audience**: implementation agents executing the TERP Agro frontend pass; roadmap-integration agents reconciling against TA/MR backlogs.
- **Companion artifacts**:
  - `docs/design/wireframes/01-diagnosis.html` through `07-wireframes-batch-4.html` (rendered HTML wireframes W1-W28).
  - `docs/design/replication-playbook.md` — recipes (R1-R16) for extending the design coherently when implementers hit features the wireframes don't explicitly cover. Mandatory companion. See §22.
  - `docs/design/handoff-prompt.md` — briefing for the PM / roadmap-integration agent.
- **Repo**: <https://github.com/EvanTenenbaum/terp-agro-operator-console>

---

## Table of contents

1. [TL;DR](#tldr)
2. [Problem & Operator Paradigm](#1-problem--operator-paradigm)
3. [Canvas Grammar](#2-canvas-grammar)
4. [Placement Law (8 slots)](#3-placement-law-8-slots-one-rule)
5. [Components — keep / rework / kill / new](#4-components--keep--rework--kill--new)
6. [Wireframe Index (W1-W28)](#5-wireframe-index-w1-w28)
7. [Acceptance Criteria — done definition](#6-acceptance-criteria--done-definition)
8. [Phased Implementation Plan](#7-phased-implementation-plan)
9. [Verification Checklist](#8-verification-checklist-hard-rule-from-brief)
10. [Out of Scope](#9-out-of-scope)
11. [Status-Aware Primary Decision Tables](#10-status-aware-primary-decision-tables)
12. [Component Contracts (TypeScript Interfaces)](#11-component-contracts-typescript-interfaces)
13. [Drawer Tab Data Contracts](#12-drawer-tab-data-contracts)
14. [Visual Tokens, Spacing & Animation](#13-visual-tokens-spacing--animation)
15. [Test Plan](#14-test-plan)
16. [Feature Flags & Rollout](#15-feature-flags--rollout)
17. [Edge Cases](#16-edge-cases)
18. [Telemetry](#17-telemetry)
19. [Decisions Log](#18-decisions-log)
20. [Integration Discipline](#19-integration-discipline--how-to-build-new-frontend-so-it-doesnt-feel-bolted-on)
21. [Adversarial Review — Findings & Resolutions](#21-adversarial-review--findings--resolutions)
22. [Replication Playbook (extending the design)](#22-replication-playbook--extending-the-design-beyond-the-wireframes)
23. [References](#20-references)

---

## TL;DR

The TERP Agro app is functionally complete (63 user-surfaceable commands, 1 internal command, 28 queries, parity green, MR-001..MR-052 + TA-001..TA-048 shipped). The gap is **cohesion and hierarchy**, not capability.

This spec defines:

- **One placement law** with 8 slots — every operator function has exactly one home.
- **Four canvas zones** (Keel · Identity ribbon · Primary work surface · Context Drawer) replacing today's five-band stack.
- **Five drawer states** (closed → peek → expanded → full → max) with tabs swapping by active entity.
- **Status-aware primary action** on every screen, replacing 6-sibling-button cockpits. Decision tables for all 14 surfaces in §10.
- **Inline cells beat strips** wherever rows need editing.
- **Inventory Finder as a global tool** reachable three ways: embedded right rail on Sales, standalone Inventory route Finder mode, `⌘⇧F` overlay anywhere.
- **Purchase Orders rebuilt** with persistent header + status-aware action + drawer Lines tab + Linked-intake traceability ribbon.
- **`QuickStartBar.tsx` deleted**, its 5 launch chips absorbed into the Keel (top strip).
- **Two product lanes added by explicit requirement**: Reports (under Decide) and Matchmaking (under Sell). No other IA churn.
- **8 implementation phases**, each shippable behind a feature flag with typecheck + build + parity + E2E green.

28 wireframes (W1-W28) pin every primary state.

---

## 1. Problem & Operator Paradigm

### 1.1 What's already shipped

- React 18 / Vite / TypeScript / AG Grid / Zustand / TanStack Query / tRPC client.
- Express / tRPC / Socket.io / Drizzle ORM / PostgreSQL backend.
- 64 commands total: 63 user-surfaceable commands, 1 internal connector-routing command, 28 protected query endpoints, role-aware nav, session auth, idempotent audited command bus.
- 15 operator surfaces (Dashboard · Reports · Purchase Orders · Intake · Sales · Matchmaking · Orders · Payments · Inventory · Client Ledger · Vendor Payouts · Fulfillment · Connectors · Recovery · Closeout).
- Legacy markers preserved across batches and sales lines (`legacyMarker` / `legacyStatusMarkers`).
- Three independent closeout columns on sales lines: `packed`, `inventoryPosted`, `paymentFollowup`.
- Quick Ledger grid with FIFO / selected / unapplied + auto-buyer-credit on negative money-in.
- `SelectionSummary` sticky footer with sums + issues + ⏱◇⚠⬇ icons.
- `RowCommandHistoryDrawer` · `RelationshipDrawer` · `IssueSidecar`.
- Customer Workspace panel inside `SalesView.tsx`, gated on customer selection.
- Command palette with entity search and legacy-vocabulary aliases.
- Persisted layout (`sideNavCollapsed`, `collapsedPanels`, `activeQuickLaunch`).
- Focus mode + collapsible Quick Start + collapsible side nav.
- Inventory Finder with token search, natural-price parsing, saved slices, compare strip, customer-safe offer copy.

### 1.2 Where it still feels raw (the 9 friction points)

1. **Control-band crush before any row is selected.** Orders shows 6 sibling verbs always (Ready, Post, Reprice, Fulfillment, Pick list, Cancel). PO shows Approve/Receive/Cancel always. Vendor Payouts shows Approve/Schedule/Pay always. Recovery has 3 always-on control bands.
2. **Selection acknowledged but not promoted.** `SelectionSummary` appears as a footer under the grid, not the primary work surface.
3. **Purchase Orders is two grids stacked.** PO grid → click a row → line grid below. No persistent PO header carried into line editing. No status-aware primary.
4. **Inventory Finder locked inside Sales.** The most operator-loved tool is unreachable from Procurement, Intake, Recovery, or standalone scanning.
5. **Customer workspace not durable.** Lives as a panel inside Sales; switching tabs forgets it. No Vendor analog.
6. **Focus mode is binary and lonely.** `WorkspacePanel.tsx` returns `null` for siblings when focused, AND `QuickStartBar` returns `null` when `focusedPanelId` is set. Operator loses orientation.
7. **Command palette has a JSON payload editor in right pane.** Power tool leaks into daily flow.
8. **13 left-nav lanes presented flat.** No spatial grouping for muscle memory.
9. **Density inconsistency.** Dashboard calm; Sales stacks 3 control bands + 2 grids + side panel.

### 1.3 The operator paradigm being designed toward

Seven anchors derived from recording analysis, persona journeys, and audit synthesis:

1. **Row as durable working memory.** A row tolerates uncertain state (`draft` / `needs_resolution`) and ages into a record.
2. **Location is context.** Land on a customer / vendor / PO; do the work *there*.
3. **Math is proof.** Subtotal · available · balance · allocation preview live on the row.
4. **Markers are vocabulary.** Raw legacy text (`C` / `OFC` / `CV` / `T` / `P` / `Iv` / `M`) preserved; normalized fields adjacent, visually distinct.
5. **Receipts and outputs are byproducts of selection.** Any grid selection should be totalable, previewable, exportable.
6. **Money is a ledger row, not a button.** Quick Ledger is the front door; launch chips are convenience starts.
7. **Recovery starts from the row.** Row-level history drawer + reversal preview, not command-search.

### 1.4 Seven principles for this pass

1. **One status-aware primary action per surface.** Secondary verbs collapse into selection-aware menus.
2. **Pre vs. post-selection clarity.** Before selection = start-work affordances. After = primary + tray + impact strip. Same physical row swaps; never stacks.
3. **Persistent context bands.** Customer · Vendor · PO identity stays visible while you work inside them.
4. **Inventory Finder is global.** `⌘⇧F` overlay anywhere; embeddable panel; standalone route's Finder mode.
5. **Selection summary becomes the context strip, not just a footer.** Sums + issues + primary + tray + history/relationship/issue/packet icons, beside the grid.
6. **Focus mode keeps the keel.** Keel + Identity ribbon + Quick Start chips survive focus; only the grid maximizes.
7. **Nav grouping with controlled IA changes.** Existing routes plus Reports and Matchmaking, rendered in muted section dividers (Decide · Procure · Sell · Money · Admin).

### 1.5 What is explicitly NOT changing (non-goals)

- No new auth/role/RBAC behavior.
- No third-party UI library swaps (still React + AG Grid + Lucide + Tailwind tokens).
- No mobile redesign — desktop operator console only.
- Customer Workspace stays a panel inside Sales (no promotion to its own route — wedge Option B rejected).
- Nav consolidation into modes (no IA collapse to 4-5 lanes — wedge Option C rejected).
- The 13-route IA stays. Adding only Reports as a 14th.
- The audited command bus, role-aware nav, Drizzle/Postgres, session auth all preserved.
- The visual palette (`amber`, `ink`, `line`, `panel`, `zinc` tokens) preserved.
- No backend schema changes, except a possibly flagged thin additive projection if `customers.pricingStrategy` isn't already exposed on `queries.salesOrderLines` for Phase 1.
- No new tRPC commands.
- Customer-pricing rule enforcement is **warning only**, dismissible per-customer. No below-floor refusal. No Manager+ override gate.

---

## 2. Canvas Grammar

### 2.1 Four zones

Every operations screen uses this shape:

| Zone | Height/Width | Purpose | Survives focus mode? |
| --- | --- | --- | --- |
| **A — Keel** | 44-48px tall | Global: `⌘K` search + 5 launch chips (Sale · Receive · $ In · $ Out · Purchase) + health pill + user. | Yes |
| **B — SideNav** | 160px wide (or 56px collapsed) | 15 routes in muted groups. | Yes |
| **C — Identity ribbon** | 28px tall (only when entity active) | Slim. Holds entity name + status pill + key id + `⌘← back` + `✕ leave`. No rich data. | Yes |
| **D — Primary work surface** | flex | Selection-context strip (band-swap) above the grid. | Yes (the focused panel) |
| **E — Context Drawer** | 24px / 280px / 420px / 60% / 100% of pane | Tabbed, right-edge. Five states (see §2.6). | Follows D |

Total chrome above the grid: **~76px when an entity is active, ~48px otherwise.** (Previously ~140px.)

### 2.2 The keel chips (nav-only, no inline forms)

| Chip | Behavior |
| --- | --- |
| `Sale` | Navigate to Sales. Restore recent customer context if any (via `uiStore.activeCustomerId`). Otherwise land on customer-pick state. |
| `Receive` | Navigate to Intake. Pre-selection strip has Vendor ▾ + `+ Receive Row`. |
| `$ In` | Navigate to Payments with Quick Ledger focused on a fresh `money_in` row. |
| `$ Out` | Navigate to Vendor Payouts. Pre-selection: Vendor ▾. |
| `Purchase` | Navigate to Purchase Orders. Pre-selection: Vendor ▾ + `+ New PO`. |

No inline `Client ▾` / `Request ▢` / amount / method forms anywhere global. Customer-aware starts remain available via `⌘K Rich Star → ↵` → routes to Sales with that customer active.

### 2.3 SideNav grouping (15 routes in groups)

```
Decide       — Dashboard · Reports
Procure      — Purchase Orders · Intake · Inventory
Sell         — Sales · Orders · Fulfillment · Client Ledger
Money        — Payments · Vendor Payouts
Resolve      — Connectors · Recovery · Closeout
```

Group dividers are 9px uppercase headers with 6px top margin — no horizontal rule. Role visibility logic in `navVisibleForUser` unchanged. New `Reports` lane is in the existing role-visibility allow-list for `owner` and `manager`; for `viewer` it is also visible (read-only reports).

### 2.4 Identity ribbon

Activates only when an entity is active. Carries name + status + key identifier + leave/back. Never carries rich data — balances, credit, notes, history all move into Drawer tabs.

Examples:
- `Sales · Rich Star · draft order RS-2026-05-11 · 3 lines [draft]`
- `Purchase Orders · Greenline Farms · PO-DEMO-001 · approved · 12/40 received [approved]`
- `Vendor Payouts · Scott · 4 open bills · $8,420 due`
- `Closeout · period 2026-04 · locked · 0 unsafe rows`

`⌘← back` walks the route+entity history (kept in `uiStore.routeHistory`, new field, max 20 entries, persisted). `✕ leave` clears `activeEntityId` for the current route and returns to its queue state.

### 2.5 Selection-context strip (band swap)

Same physical row above the grid. Toggles between pre- and post-selection states. **Replaces — never adds to — the pre-selection band.**

**Pre-selection** (no rows selected): minimal start affordances. "What do you want to start?"

**Post-selection** (≥1 row selected):
- `Selection · N` label
- Σ qty / Σ subtotal / Σ total (compact, from `SelectionSummary`'s existing sum logic — `sumFields` constant)
- Status-aware **primary** action (green, `⌘↵`) — see §10 for per-surface tables
- `More ▾` tray with 2-4 secondary verbs
- `⏱ ◇ ⚠ ⬇` icons (History · Relationship · Issue · Packet)
- Warning pills inline (e.g., `1 below floor`)

**Disabled-with-reason** when status is mixed or prerequisites missing. Plain-language tooltip; no silent disable.

### 2.6 Context Drawer

Right-edge tabbed drawer. **Five states:**

| State | Width | Layout |
| --- | --- | --- |
| `closed` | 24px nub on right edge | Grid full width; nub label reads "Drawer · ]" |
| `peek` | 280px | Grid + drawer side-by-side; one tab content visible, no tab-row chrome |
| `expanded` | 420px | Grid + drawer side-by-side; tab row visible above content |
| `full` | 60% of pane | Grid compressed to 40%; drawer dominates |
| `max` | 100% of pane | Grid hidden; drawer takes the full work area |

State persisted per route × entity in `uiStore.drawerByView`. Read-only by default — clicks inside the drawer route to that surface and select the row; `⌘←` restores prior drawer state.

**The single exception to read-only:** PO Lines tab is editable, because PO line editing IS the PO's primary work surface. No second grid stacked below the PO grid.

State transitions:
- `closed` ⇄ `peek` ⇄ `expanded` via `]` key
- `expanded` → `full` → `max` → `expanded` via `⇧]`
- Any state → `closed` via `Esc` (when drawer has focus) or `✕` button
- Selecting an entity from a queue auto-promotes `closed` → `peek`; never overrides a higher state
- Per-route × entity persistence means once an operator drags to `expanded` on Sales with Rich Star, returning to Rich Star in Sales restores `expanded`

### 2.7 Drawer tab catalog (by active entity)

| Active entity | Tabs (default order) |
| --- | --- |
| Customer | Profile · Balance · Purchases · Pricing · Buyer fit · Notes · Recent · Disputes/credits · History |
| Vendor | Profile · Open bills · Payouts · POs · Consignment · Performance · Scheduled · Tools · Notes · History |
| Batch / Inventory row | Movement · Sales (recent) · Reservations · Photos · Sourced from PO · Tags · Transfer · History |
| Order / Sale | Lines · Allocation · Customer card · Pricing · Validation · Output · Fulfillment status · History |
| PO | Lines · Vendor card · Linked intake · Linked receipts · History |
| Vendor bill / Payout | Due reason · Source receipt · Linked PO · Payouts · Consignment trigger · History |
| Payment | Allocations · Customer card · Impact · Buckets · History |
| Pick / Fulfillment | Lines · Order card · Bag/labels · Manifest · Scan history · Tracking · History |
| Connector request | Session/payload · Routing · Review history · Linked order |
| Recovery row (command) | Reversal/Retry · Snapshot diff · Source map · Find/Replace · Correction · Backup · Markers · System · History |
| Closeout period | Control totals · Unsafe rows · Adjustments · Artifacts |
| (Inventory queue, no row) | Tags · Aging · Movement (recent) · Photos queue |
| (Intake queue, no row) | Receipt preview (selection-driven) · CSV import · Lot info · Linked PO |
| Report row | Definition · Export · Saved views |

### 2.8 Focus mode revised

**Today (problem):** `WorkspacePanel.tsx` line ~25 returns `null` for siblings when focused; `QuickStartBar.tsx` returns `null` when `focusedPanelId` is set. Operator loses orientation.

**Revised:**
- Zone A Keel survives focus.
- Zone B SideNav survives focus.
- Zone C Identity ribbon survives focus.
- Zone E Context Drawer follows the focused panel.
- Sibling Zone D panels collapse to header-only (not `null`).
- `Esc` exits focus.
- `F` key toggles focus on the panel under cursor (or the lone Zone D panel).

### 2.9 Keyboard model

| Key | Effect |
| --- | --- |
| `⌘K` | Open palette — entities + commands (single pane default; JSON payload editor moves behind `⌘⌥K`). |
| `⌘⇧F` | Global Inventory Finder overlay. |
| `/` | Focus active grid's quick filter. |
| `]` | Toggle Context Drawer: closed → peek → expanded → closed. |
| `⇧]` | Cycle expanded → full → max → expanded. |
| `1..5` | Inside drawer, switch tab by index. |
| `⌘↵` | Commit status-aware primary on selected row(s). |
| `⌘D` | Duplicate row (existing on Intake; extend to Sales/PO/Inventory). |
| `F` | Toggle focus mode on current panel. |
| `⌘←` | Navigate back to previous surface; drawer state restores. |
| `Esc` | Close drawer → close palette → exit focus → clear selection (descending scope). |
| `⌘1..⌘6` | Existing nav hotkeys (Dashboard / Intake / Sales / Payments / Inventory / Client Ledger). |

### 2.10 Visual tokens

Existing Tailwind tokens preserved. Adding **CSS custom properties** for canvas-grammar specific values (in `src/client/index.css` `:root`):

```css
:root {
  /* Existing tokens stay */
  --color-amber: /* per tailwind.config.ts */;
  --color-ink: /* … */;
  --color-line: /* … */;
  --color-panel: /* … */;

  /* New canvas-grammar tokens */
  --keel-height: 48px;
  --identity-ribbon-height: 28px;
  --sidenav-width-expanded: 160px;
  --sidenav-width-collapsed: 56px;
  --selection-strip-height: 36px;

  --drawer-nub-width: 24px;
  --drawer-peek-width: 280px;
  --drawer-expanded-width: 420px;
  --drawer-full-pct: 60%;
  --drawer-max-pct: 100%;

  /* Selection signal tones */
  --color-primary-action: #22c55e;       /* green-500, post/confirm/pay/etc */
  --color-primary-action-warn: #fbbf24;  /* amber-400, Fix unsafe rows etc */
  --color-add-flash: #dcfce7;            /* green-50, add-signal flash */
  --color-warn-pill-bg: #fbbf24;
  --color-warn-pill-text: #7c2d12;

  /* Animation timings */
  --tx-drawer-state: 180ms cubic-bezier(0.2, 0.8, 0.4, 1);
  --tx-add-flash: 280ms ease-out;
  --tx-add-fade-to-quiet: 1800ms ease-in-out 320ms;
  --tx-band-swap: 120ms ease-out;
}
```

### 2.11 Animations & transitions

| Element | Trigger | Duration | Easing | Notes |
| --- | --- | --- | --- | --- |
| Drawer state | `]` / `⇧]` / state change | 180ms | `cubic-bezier(0.2, 0.8, 0.4, 1)` | Width animates; content doesn't fade |
| Add-signal flash | Row added to draft | 280ms in + 1800ms hold + 200ms fade | ease-out / linear | Row tint goes `#dcfce7` → transparent; chip appears `+1 ✓` then becomes `in draft` |
| Band swap (pre↔post selection) | Selection count crosses 0 | 120ms | ease-out | Cross-fade content only; height stays |
| Status pill recolor | Server push | instant | n/a | Socket.io `command:completed` causes invalidate; row re-renders with new color |
| Drawer tab switch | Click / `1..5` | none | n/a | Tab content swaps instantly |
| Focus mode enter/exit | `F` / `Esc` | 220ms | ease-out | Sibling panels collapse to header |

All animations honor `prefers-reduced-motion`; when set, transitions become 0ms instant changes (still functional, no flicker).

### 2.12 Responsive behavior

Desktop-first. Minimum supported viewport: **1280×800**. Above 1280px width, layout is fluid; SideNav fixed at 160px, drawer states scale per §2.6.

Below 1280px (rare in operator desktops), SideNav auto-collapses to 56px, drawer defaults to `closed`, identity ribbon truncates middle with ellipsis. No mobile layout in scope.

### 2.13 Loading / empty / error states (universal)

Every grid uses the same three states:

- **Loading**: AG Grid's built-in loading overlay (already wired). Selection strip disabled with "Loading…" placeholder text.
- **Empty**: `EmptyState` component (existing) with a one-line context-appropriate prompt and a single primary CTA (e.g., "Create your first PO" → triggers `+ New PO`).
- **Error**: Inline banner above the grid in `bg-amber/10 border-amber text-amber` (existing tokens) with the error message + retry button. Backed by tRPC's existing error envelope.

Drawer tabs use the same three states, scoped to tab content. Loading inside a peek-width tab uses a 32×32 spinner centered; empty uses a 11px secondary line; errors use the same banner.

---

## 3. Placement Law (8 slots, one rule)

**Every operator-facing function lives in exactly one of these eight slots.** No fluid mix.

| # | Slot | Use when | Don't use when |
| --- | --- | --- | --- |
| 1 | Keel | Truly global. | View-specific. |
| 2 | Side nav route | Frequently-visited dedicated surface. | Reachable via row or drawer. |
| 3 | Pre-selection strip | Affordances to start work on this view. | Requires a row to exist. |
| 4 | Selection strip primary + More tray | Status-aware action(s) on selected rows. | Reference content. |
| 5 | Grid column / inline cell | Per-row attribute scanned and edited. | Not a per-row attribute. |
| 6 | Context Drawer tab | Referential / supporting context for active entity. | Needs to be edited inside drawer (except PO Lines). |
| 7 | `⌘K` palette + alias | Power command, rare admin action, anything searched by name. | Daily high-frequency work. |
| 8 | Hotkey | Truly repeated motion (commit, duplicate, filter, drawer, focus). | Anything that isn't repeated. |

**The five questions before adding any new control:**

1. Per-row attribute scanned and edited? → grid column.
2. Obvious primary action for the row at its status? → selection strip primary.
3. Less-frequent but row-specific action? → selection strip `More ▾`.
4. Reference data or supporting context? → drawer tab.
5. Rare admin / power command? → `⌘K` palette + alias.

If a function answers no to all five, it's almost certainly not needed. If it answers yes to multiple, use the smaller surface.

---

## 4. Components — keep · rework · kill · new

### 4.1 Shell + global chrome

| Disposition | File | Change |
| --- | --- | --- |
| KEEP | `src/client/App.tsx` | Stop rendering `<QuickStartBar />`. Otherwise unchanged. |
| REWORK | `src/client/components/Shell.tsx → SideNav` | Add 5 muted section dividers (Decide / Procure / Sell / Money / Resolve). Reorder `navItems`. Add Reports lane. Role visibility logic in `navVisibleForUser` unchanged. |
| REWORK | `src/client/components/Shell.tsx → TopBar` | Becomes the **Keel**. Absorbs 5 nav chips. Adds drawer-toggle icon on right when current view has a drawer. |
| KILL | `src/client/components/QuickStartBar.tsx` | File deleted. Inline forms gone. |
| REWORK | `src/client/components/CommandPalette.tsx` | Single-pane default. JSON `Context payload` editor moves behind `⌘⌥K` (advanced mode). Aliases stay. `globalSearch` → `viewForEntity` routing unchanged. |
| REWORK | `src/client/components/Hotkeys.tsx` | Add `]` / `⇧]` / `1..5` / `⌘↵` / `⌘⇧F` / `F` / descending-scope `Esc`. Existing `⌘1..⌘6` preserved. |
| KEEP | `src/client/components/ToastCenter.tsx` | No change. |

### 4.2 Grid + selection

| Disposition | File | Change |
| --- | --- | --- |
| REWORK | `src/client/components/OperatorGrid.tsx` | Selection-aware band swap. When 0 rows selected → renders pre-selection strip (passed by view via `preSelectionStrip` prop). When ≥1 selected → renders selection strip from `SelectionSummary` with view-supplied `primaryAction` and `moreActions`. AG Grid wiring, sidebar, paste/fill-down, undo/redo unchanged. |
| REWORK | `src/client/components/SelectionSummary.tsx` | Lifted from footer to header. Adds `primaryAction: { label, command, payload, kbd, disabled?, disabledReason? }` and `moreActions: Array<…>` props. Sums + issues + ⏱◇⚠⬇ icons stay. |
| REWORK | `src/client/components/WorkspacePanel.tsx` | Focus mode no longer returns `null` for siblings — siblings collapse to header-only via existing `collapsed` state. Keel + Identity ribbon survive focus (rendered outside `WorkspacePanel`'s scope). |
| KEEP | `src/client/components/StatusPill.tsx` | No change. May add new pill tones for `partial` and `routed` if not already present. |
| KEEP | `src/client/components/EmptyState.tsx` | No change. |
| KEEP | `src/client/components/KpiCard.tsx` | Add `onHelp?: () => void` to open drawer at KPI Definition tab. |
| KEEP | `src/client/components/useCommandRunner.ts` | No change. |

### 4.3 Drawers + context

| Disposition | File | Change |
| --- | --- | --- |
| NEW | `src/client/components/ContextDrawer.tsx` | Right-edge tabbed drawer. 5 states. Tabs declared by active view × entity. |
| NEW | `src/client/components/IdentityRibbon.tsx` | Slim Zone C. |
| NEW | `src/client/components/drawerTabs/*` | Per-tab subcomponents (see §12 for contracts). |
| REWORK | `src/client/components/RelationshipDrawer.tsx` | Data source for Customer/Vendor drawer tabs via existing `queries.relationshipSummary`. Standalone drawer unmounted from `OperatorGrid`. |
| REWORK | `src/client/components/RowCommandHistoryDrawer.tsx` | Becomes `History` tab in `ContextDrawer`. Reversal-preview action preserved. |
| REWORK | `src/client/components/IssueSidecar.tsx` | Becomes `Disputes/credits` (Customer) / `Issue` (Order/Payment) drawer tab. Existing actions (correction-journal, refund, credit, return-note) preserved. |

### 4.4 Inventory Finder + Quick Ledger

| Disposition | File | Change |
| --- | --- | --- |
| REWORK | `src/client/components/InventoryFinderPanel.tsx` | Becomes thin wrapper around new `InventoryFinder` core. Provides `mode="embed"` and `WorkspacePanel` chrome. |
| NEW | `src/client/components/InventoryFinder.tsx` | Extracted core. Renders finder controls + table + compare strip. Accepts `mode: 'embed' \| 'overlay' \| 'standalone'`, `selectedOrderId?`, `addedBatchIds?`, `initialSearch?`, `onAddBatch(batch, qty)`. |
| NEW | `src/client/components/InventoryFinderOverlay.tsx` | `⌘⇧F` modal overlay. Dimmed backdrop, ESC closes, `]` pins as right rail. Shows "active add target" pill in header. |
| KEEP | `src/client/components/QuickLedgerGrid.tsx` | No structural change. 14-col layout may collapse Notes/Reference into row expand if density measurement justifies. |
| REWORK | `src/client/components/PhotographyQueuePanel.tsx` | Becomes `Photos` tab in Batch context drawer. Standalone usage in `OperationsViews.tsx → InventoryView` removed. |

### 4.5 Views

| Disposition | File | Change |
| --- | --- | --- |
| REWORK | `src/client/views/DashboardView.tsx` | Add "Today focus" strip above KPIs. Drop the `WorkspacePanel panelId="dashboard:money-definitions"` (definitions move to KPI `?` drawer tab). KPI cards gain `?` icon → `onHelp` opens drawer at Definition. Pending Queues + Recent Activity panels stay. Unified Work Queue grid stays. |
| REWORK | `src/client/views/IntakeView.tsx` | Pre-selection: Vendor ▾ + `+ Receive Row` only. Drop the `csvOpen` inline section, `lotCode`/`expirationDate` strip, and the receipt preview inline section. All three move to drawer tabs (`CSV import` / `Lot info` / `Receipt preview`). |
| REWORK | `src/client/views/SalesView.tsx` | Drop the *existing single-panel* customer header (the `WorkspacePanel panelId="sales:customer-workspace"`). The Customer Workspace *concept* survives, distributed across Identity ribbon (identity) + Drawer tabs (Balance / Purchases / Notes / Pricing / Buyer fit / Recent / Disputes). Suggestions → `Buyer fit` drawer tab. Sheet preview → `Output` drawer tab. |
| REWORK | `src/client/views/OperationsViews.tsx` | Split into per-view files: `PurchaseOrdersView.tsx`, `OrdersView.tsx`, `PaymentsView.tsx`, `InventoryView.tsx`, `ClientLedgerView.tsx`, `VendorPayablesView.tsx`, `FulfillmentView.tsx`, `ConnectorsView.tsx`, `RecoveryView.tsx`, `CloseoutView.tsx`. `GridJourney` helper stays as shared util in `src/client/views/_grid-journey.tsx`. |
| NEW | `src/client/views/ReportsView.tsx` | Chip-row report picker + parameters strip + report grid + drawer Definition tab. 7 reports: Revenue, Aging inventory, Payables due rollup, Cash movement, Vendor performance, Category analytics, Client sales history. |
| KEEP | `src/client/views/LoginView.tsx` | No change. |

### 4.6 State (`src/client/store/uiStore.ts`)

Additions:

```typescript
type DrawerStateName = 'closed' | 'peek' | 'expanded' | 'full' | 'max';

interface DrawerState {
  state: DrawerStateName;
  activeTab: string;            // e.g. 'purchases', 'balance', 'lines'
  entityType: string | null;    // 'customer' | 'vendor' | 'batch' | 'order' | 'po' | …
  entityId: string | null;
}

interface RouteHistoryEntry {
  view: ViewKey;
  entityType: string | null;
  entityId: string | null;
  drawerState: DrawerStateName;
  activeTab: string;
  timestamp: number;
}

// New fields on UiState:
drawerByView: Partial<Record<ViewKey, DrawerState>>;
inventoryFinderOverlayOpen: boolean;
routeHistory: RouteHistoryEntry[];  // capped at 20

// New actions:
setDrawerState(view: ViewKey, state: DrawerStateName): void;
setDrawerTab(view: ViewKey, tab: string): void;
setDrawerEntity(view: ViewKey, entityType: string | null, entityId: string | null): void;
openInventoryFinderOverlay(): void;
closeInventoryFinderOverlay(): void;
pushRouteHistory(entry: Omit<RouteHistoryEntry, 'timestamp'>): void;
popRouteHistory(): RouteHistoryEntry | null;
```

Persisted keys add `drawerByView`, `routeHistory` (capped, last 20) to existing `partialize`.

### 4.7 Backend / schema / commands / queries

**No backend changes in this pass** with one possible flagged exception: if `customers.pricingStrategy` / floor data isn't already a clean projection on `queries.salesOrderLines`, a thin additive query may be required to expose `pricingRule` / `ruleFloor` / `ruleReason` for Phase 1's warning pill. Out of scope: new commands, new schema, new auth, new RBAC.

All drawer tabs otherwise render from existing tRPC queries:

`queries.customerWorkspace` · `queries.relationshipSummary` · `queries.salesSuggestions` · `queries.salesOrderLines` · `queries.purchaseOrderLines` · `queries.receiptPreview` · `queries.paymentAllocations` · `queries.paymentAllocationPreview` · `queries.vendorPayments` · `queries.fulfillmentLines` · `queries.recoverySearch` · `queries.snapshotDiff` · `queries.findReplacePreview` · `queries.reversalPreview` · `queries.supportPacket` · `queries.closeoutPreview` · `queries.drilldown` · `queries.workQueue` · `queries.dashboard` · `queries.reference` · `queries.grid` · `queries.globalSearch`.

### 4.8 CSS

- Palette unchanged.
- New classes: `.keel`, `.identity-ribbon`, `.context-drawer`, `.context-drawer-peek`, `.context-drawer-expanded`, `.context-drawer-full`, `.context-drawer-max`, `.drawer-tab`, `.drawer-tab-active`, `.selection-strip`, `.pre-selection-strip`, `.added-flash`, `.added-chip`.
- Existing `.selection-summary` repurposed for header position.
- AG Grid Quartz theme unchanged.
- Tokens added to `:root` per §2.10.

---

## 5. Wireframe Index (W1-W28)

All rendered HTML at `docs/design/wireframes/`. Each wireframe carries a spec annotation describing its behavior contract.

| # | Surface · state | File |
| --- | --- | --- |
| W1 | Shell · default · route groups · drawer closed | `04-wireframes-batch-1.html` |
| W2 | Dashboard · Today focus + KPIs + queues + Unified Work Queue | `04-wireframes-batch-1.html` |
| W3 | Sales · customer pick · drawer closed · Finder visible | `04-wireframes-batch-1.html` |
| W4 | Sales · customer active, no row selected · drawer peek · Balance tab | `04-wireframes-batch-1.html` |
| W5 | Sales · 3 lines selected · drawer expanded · Buyer fit tab | `04-wireframes-batch-1.html` |
| W6 | Sales · drawer FULL · Purchases tab (history while building sale) | `04-wireframes-batch-1.html` |
| W7 | Intake · default · 25-column grid in 4 visual groups · drawer closed | `05-wireframes-batch-2.html` |
| W8 | Intake · 3 draft rows selected · drawer peek · Receipt preview tab | `05-wireframes-batch-2.html` |
| W9 | Purchase Orders · default · PO grid only (no stacked line grid) | `05-wireframes-batch-2.html` |
| W10 | PO selected (approved) · drawer expanded · Lines tab editable | `05-wireframes-batch-2.html` |
| W11 | PO · drawer FULL · Linked intake tab with traceability ribbon | `05-wireframes-batch-2.html` |
| W12 | Inventory · Finder mode toggle (standalone route) | `05-wireframes-batch-2.html` |
| W13 | `⌘⇧F` Inventory Finder overlay over Sales | `05-wireframes-batch-2.html` |
| W14 | Orders · queue with status chips + "Next action" column · drawer closed | `06-wireframes-batch-3.html` |
| W15 | Orders · confirmed order selected · primary Post · drawer Lines tab + impact preview | `06-wireframes-batch-3.html` |
| W16 | Payments · Quick Ledger + payment list · drawer closed | `06-wireframes-batch-3.html` |
| W17 | Payments · unapplied payment selected · primary Allocate FIFO · drawer Allocation tab | `06-wireframes-batch-3.html` |
| W18 | Vendor Payouts · queue · Due reason as first-class column · drawer closed | `06-wireframes-batch-3.html` |
| W19 | Vendor Payouts · approved bill selected · primary Schedule · drawer Due reason tab + trace ribbon | `06-wireframes-batch-3.html` |
| W20 | Fulfillment · pick queue · status chips + "Next action" column · drawer closed | `07-wireframes-batch-4.html` |
| W21 | Fulfillment · pick selected · inline pack cells · drawer Bag/labels tab | `07-wireframes-batch-4.html` |
| W22 | Connectors · queue with inline routeTo + operatorNotes columns · drawer Session tab | `07-wireframes-batch-4.html` |
| W23 | Recovery · command queue with filter chips · drawer closed (tools in drawer) | `07-wireframes-batch-4.html` |
| W24 | Recovery · failed command selected · primary Retry · drawer Reversal/Retry tab | `07-wireframes-batch-4.html` |
| W25 | Closeout · default · current-period card + archived periods grid | `07-wireframes-batch-4.html` |
| W26 | Closeout · period active · primary Fix unsafe rows · drawer Unsafe rows tab | `07-wireframes-batch-4.html` |
| W27 | Reports · default = Revenue · chip-row picker + parameters + chart + grid | `07-wireframes-batch-4.html` |
| W28 | Reports · Aging inventory · row selected · drawer Definition tab | `07-wireframes-batch-4.html` |

---

## 6. Acceptance Criteria — done definition

The frontend pass is complete when a trained operator can demonstrate, without modal wizards and without leaving the keyboard for routine work:

1. **AC-01 Customer-aware sale start.** From any view: `⌘K Rich Star → ↵`. Lands in Sales with Rich Star active, identity ribbon visible, drawer in peek with Balance tab, first draft line ready to type. Elapsed: <3 seconds, <4 keystrokes after typing the name.
2. **AC-02 Inventory scanning by remembered fragment.** From any view: `⌘⇧F`. Type `m15` or `25 flex` or `rich`. See matches across source code, notes, markers, vendor, item alias. Press `↵` to add to active order if one exists.
3. **AC-03 Three closeout cells independent.** On a sales line, `Packed`, `Inv Posted`, `Pay/F-up` toggle individually, each writing its own audited command. Sort and filter by each.
4. **AC-04 Quick Ledger 5-row mixed entry.** Append 5 rows in Payments: client cash payment, buyer-credit (negative amount auto-flips), vendor payout, transfer, correction. <30 seconds, no modal.
5. **AC-05 Vendor receipt from selection.** Select 3-4 intake rows. Open drawer Receipt preview tab. See vendor + date conflict checks + live totals. Post in one click with totals matching selection.
6. **AC-06 Imported markers preserved.** A migrated row with raw `C` / `ofc` / `CV` / `T` markers shows them verbatim in the legacy-marker column on Intake / Inventory / Sales / Orders.
7. **AC-07 Ambiguous post explained with named candidates.** Try to post an order with two lines pointing at the same source row. Drawer Reversal/Retry tab (after the failed command is selected in Recovery) shows the candidate source rows for resolution.
8. **AC-08 Row-level reversal preview.** From any posted row's selection strip, hit ⏱ History. Drawer opens at History tab showing last 5 commands. Click "Preview reversal" → drawer pivots to Reversal/Retry tab with plain-language impact before commit.
9. **AC-09 PO traceability in one glance.** With an approved PO selected, drawer Linked intake tab → trace ribbon at bottom shows `PO → intake rows → receipts → vendor bill → payouts`. Each link routes with state preservation.
10. **AC-10 Focus mode preserves orientation.** While focused on the Intake grid, the Keel + Identity ribbon + drawer remain functional. `Esc` exits focus.

---

## 7. Phased Implementation Plan

8 phases. Each ships as a chunky atomic PR that keeps typecheck + build + parity + E2E green. **Each phase guarded by feature flag** where the public-facing surface changes.

### Phase 0 — Foundation (canvas primitives)

**Goal**: Land the new primitives, kill QuickStartBar, but no screen-level work yet.

**Created files:**
- `src/client/components/ContextDrawer.tsx`
- `src/client/components/IdentityRibbon.tsx`
- `src/client/components/drawerTabs/_DrawerTab.tsx` (shared tab loading/empty/error wrapper)
- `src/client/components/drawerTabs/HistoryTab.tsx` (reused everywhere)

**Edited files:**
- `src/client/App.tsx` — remove `<QuickStartBar />` render
- `src/client/components/Shell.tsx` — TopBar absorbs 5 chips; SideNav adds 5 group dividers + Reports lane; role visibility updated
- `src/client/components/Hotkeys.tsx` — add `]` / `⇧]` / `1..5` / `⌘↵` / `⌘⇧F` / `F` / descending `Esc`
- `src/client/components/WorkspacePanel.tsx` — focus mode change: siblings collapse not hide
- `src/client/components/CommandPalette.tsx` — single-pane default; JSON payload behind `⌘⌥K`
- `src/client/store/uiStore.ts` — add `drawerByView`, `routeHistory`, `inventoryFinderOverlayOpen` + actions
- `src/client/index.css` — add new CSS classes + custom properties
- `tailwind.config.ts` — no change (using tokens) but may add color aliases

**Deleted files:**
- `src/client/components/QuickStartBar.tsx`

**tRPC queries consumed**: none new.

**Feature flag**: `flag.canvas-grammar-v2` (off by default in env; on in `seed`/`dev`). When off, App still renders `<QuickStartBar />` (preserved in git history); when on, renders the new Keel chips.

**Tests added**:
- `tests/e2e/canvas-grammar.spec.ts` — Keel visible, 5 chips present, SideNav groups visible, drawer nub on right
- `tests/e2e/focus-mode-keel-survives.spec.ts` — Focus a panel, verify Keel + SideNav + Identity ribbon still rendered

**Rollback**: Set `flag.canvas-grammar-v2=false` in env. Revert single PR.

### Phase 1 — Sales / Customer Workspace

**Goal**: Customer workspace becomes the identity ribbon + drawer tabs. Below-floor pill ships. Add-signal animation lands.

**Created files:**
- `src/client/components/drawerTabs/CustomerProfileTab.tsx`
- `src/client/components/drawerTabs/CustomerBalanceTab.tsx`
- `src/client/components/drawerTabs/CustomerPurchasesTab.tsx`
- `src/client/components/drawerTabs/CustomerNotesTab.tsx`
- `src/client/components/drawerTabs/CustomerPricingTab.tsx`
- `src/client/components/drawerTabs/CustomerBuyerFitTab.tsx`
- `src/client/components/drawerTabs/CustomerRecentTab.tsx`
- `src/client/components/drawerTabs/CustomerDisputesTab.tsx`
- `src/client/components/drawerTabs/CustomerOutputTab.tsx`
- `src/client/components/InventoryFinder.tsx` (extracted core)
- `src/client/components/BelowFloorPill.tsx`
- `src/client/components/AddSignalChip.tsx`

**Edited files:**
- `src/client/views/SalesView.tsx` — drop the `customer-workspace` `WorkspacePanel`; identity ribbon takes identity; suggestions move to Buyer fit tab; sheet preview moves to Output tab; Inventory Finder uses extracted core
- `src/client/components/InventoryFinderPanel.tsx` — thin wrapper around `InventoryFinder`
- `src/client/components/OperatorGrid.tsx` — band-swap pattern wired
- `src/client/components/SelectionSummary.tsx` — `primaryAction` + `moreActions` props added

**tRPC queries consumed**: `queries.customerWorkspace`, `queries.salesSuggestions`, `queries.salesOrderLines`, `queries.relationshipSummary`, `queries.reference`.

**Backend touchpoint (flagged)**: if `customers.pricingStrategy` / floor isn't projected on `queries.salesOrderLines`, add a thin additive query field. Decision deferred to build time; if needed, isolated to one query enrichment, no command/schema change.

**Feature flag**: `flag.sales-customer-workspace-v2`.

**Tests added**:
- `tests/e2e/ac-01-customer-aware-sale-start.spec.ts`
- `tests/e2e/sales-band-swap.spec.ts`
- `tests/e2e/below-floor-pill-dismissible.spec.ts`

**Rollback**: Disable flag; SalesView reverts to old workspace panel.

### Phase 2 — Procurement (Intake + PO + Inventory + Finder global)

**Created files:**
- `src/client/views/PurchaseOrdersView.tsx` (split from `OperationsViews.tsx`)
- `src/client/views/InventoryView.tsx` (split)
- `src/client/views/_grid-journey.tsx` (extracted util)
- `src/client/components/InventoryFinderOverlay.tsx`
- `src/client/components/TraceabilityRibbon.tsx`
- `src/client/components/drawerTabs/IntakeReceiptPreviewTab.tsx`
- `src/client/components/drawerTabs/IntakeCsvImportTab.tsx`
- `src/client/components/drawerTabs/IntakeLotInfoTab.tsx`
- `src/client/components/drawerTabs/IntakeVendorCardTab.tsx`
- `src/client/components/drawerTabs/IntakeLinkedPOTab.tsx`
- `src/client/components/drawerTabs/POLinesTab.tsx` ⚠ editable exception
- `src/client/components/drawerTabs/POVendorCardTab.tsx`
- `src/client/components/drawerTabs/POLinkedIntakeTab.tsx`
- `src/client/components/drawerTabs/POLinkedReceiptsTab.tsx`
- `src/client/components/drawerTabs/BatchMovementTab.tsx`
- `src/client/components/drawerTabs/BatchSalesTab.tsx`
- `src/client/components/drawerTabs/BatchReservationsTab.tsx`
- `src/client/components/drawerTabs/BatchPhotosTab.tsx`
- `src/client/components/drawerTabs/BatchSourcedFromPOTab.tsx`
- `src/client/components/drawerTabs/BatchTagsTab.tsx`
- `src/client/components/drawerTabs/BatchTransferTab.tsx`

**Edited files:**
- `src/client/views/IntakeView.tsx` — pre-selection slim; CSV/Lot/Receipt-preview move to drawer tabs
- `src/client/views/OperationsViews.tsx` — keep as a re-export shim during split

**tRPC queries**: `queries.purchaseOrderLines`, `queries.receiptPreview`, `queries.relationshipSummary`, `queries.grid({view: 'inventory'})`, all existing.

**Feature flag**: `flag.procurement-canvas-v2`.

**Tests added**:
- `tests/e2e/ac-05-vendor-receipt-from-selection.spec.ts`
- `tests/e2e/ac-09-po-traceability.spec.ts`
- `tests/e2e/ac-02-inventory-finder-overlay.spec.ts`
- `tests/e2e/po-status-aware-primary.spec.ts`
- `tests/e2e/po-line-add-as-last-row.spec.ts`

**Rollback**: Disable flag; `OperationsViews.tsx` re-export remains identical (no breakage).

### Phase 3 — Money (Payments + Vendor Payouts)

**Created files:**
- `src/client/views/PaymentsView.tsx` (split)
- `src/client/views/VendorPayablesView.tsx` (split)
- `src/client/components/drawerTabs/PaymentAllocationsTab.tsx`
- `src/client/components/drawerTabs/PaymentCustomerCardTab.tsx`
- `src/client/components/drawerTabs/PaymentImpactTab.tsx`
- `src/client/components/drawerTabs/PaymentBucketsTab.tsx`
- `src/client/components/drawerTabs/VendorProfileTab.tsx`
- `src/client/components/drawerTabs/VendorOpenBillsTab.tsx`
- `src/client/components/drawerTabs/VendorPayoutsTab.tsx`
- `src/client/components/drawerTabs/VendorPOsTab.tsx`
- `src/client/components/drawerTabs/VendorConsignmentTab.tsx`
- `src/client/components/drawerTabs/VendorPerformanceTab.tsx`
- `src/client/components/drawerTabs/VendorScheduledTab.tsx`
- `src/client/components/drawerTabs/VendorToolsTab.tsx` (manual bill creation + void payout)
- `src/client/components/drawerTabs/BillDueReasonTab.tsx`
- `src/client/components/drawerTabs/BillSourceReceiptTab.tsx`
- `src/client/components/drawerTabs/BillLinkedPOTab.tsx`
- `src/client/components/drawerTabs/BillPayoutsTab.tsx`
- `src/client/components/drawerTabs/BillConsignmentTab.tsx`

**Edited files:**
- Old `PaymentAllocationTools` inline panel deleted from `PaymentsView`
- Old `VendorBillTools` inline panel deleted from `VendorPayablesView`

**tRPC queries**: `queries.paymentAllocations`, `queries.paymentAllocationPreview`, `queries.vendorPayments`, `queries.relationshipSummary`, `queries.grid`.

**Feature flag**: `flag.money-canvas-v2`.

**Tests added**:
- `tests/e2e/ac-04-quick-ledger-5-row.spec.ts`
- `tests/e2e/payment-allocation-fifo-vs-selected.spec.ts`
- `tests/e2e/vendor-payable-due-reason-column.spec.ts`
- `tests/e2e/vendor-status-aware-primary.spec.ts`

**Rollback**: Disable flag.

### Phase 4 — Sell flow (Orders + Fulfillment + Connectors + Client Ledger)

**Created files:**
- `src/client/views/OrdersView.tsx` (split)
- `src/client/views/FulfillmentView.tsx` (split)
- `src/client/views/ConnectorsView.tsx` (split)
- `src/client/views/ClientLedgerView.tsx` (split, mostly KEEP from current)
- `src/client/components/drawerTabs/OrderLinesTab.tsx`
- `src/client/components/drawerTabs/OrderAllocationTab.tsx`
- `src/client/components/drawerTabs/OrderCustomerCardTab.tsx`
- `src/client/components/drawerTabs/OrderPricingTab.tsx`
- `src/client/components/drawerTabs/OrderValidationTab.tsx`
- `src/client/components/drawerTabs/OrderOutputTab.tsx`
- `src/client/components/drawerTabs/OrderFulfillmentTab.tsx`
- `src/client/components/drawerTabs/PickLinesTab.tsx`
- `src/client/components/drawerTabs/PickOrderCardTab.tsx`
- `src/client/components/drawerTabs/PickBagLabelsTab.tsx`
- `src/client/components/drawerTabs/PickManifestTab.tsx`
- `src/client/components/drawerTabs/PickScanHistoryTab.tsx`
- `src/client/components/drawerTabs/PickTrackingTab.tsx`
- `src/client/components/drawerTabs/ConnectorSessionTab.tsx`
- `src/client/components/drawerTabs/ConnectorRoutingTab.tsx`
- `src/client/components/drawerTabs/ConnectorReviewHistoryTab.tsx`
- `src/client/components/drawerTabs/ConnectorLinkedOrderTab.tsx`

**Edited files:**
- Pack-line inputs become inline cells on `FulfillmentView` line grid; old strip deleted
- `routeTo` + `operatorNotes` become inline columns on `ConnectorsView`; old strip deleted

**Feature flag**: `flag.sell-canvas-v2`.

**Tests added**:
- `tests/e2e/ac-03-three-closeout-cells.spec.ts`
- `tests/e2e/orders-status-aware-primary.spec.ts`
- `tests/e2e/fulfillment-inline-pack.spec.ts`
- `tests/e2e/connectors-inline-routing.spec.ts`

**Rollback**: Disable flag.

### Phase 5 — Resolve (Recovery + Closeout)

**Created files:**
- `src/client/views/RecoveryView.tsx` (split)
- `src/client/views/CloseoutView.tsx` (split)
- `src/client/components/drawerTabs/RecoveryReversalTab.tsx`
- `src/client/components/drawerTabs/RecoverySnapshotTab.tsx`
- `src/client/components/drawerTabs/RecoverySourceMapTab.tsx`
- `src/client/components/drawerTabs/RecoveryFindReplaceTab.tsx`
- `src/client/components/drawerTabs/RecoveryCorrectionTab.tsx`
- `src/client/components/drawerTabs/RecoveryBackupTab.tsx`
- `src/client/components/drawerTabs/RecoveryMarkersTab.tsx`
- `src/client/components/drawerTabs/RecoverySystemTab.tsx`
- `src/client/components/drawerTabs/CloseoutControlTotalsTab.tsx`
- `src/client/components/drawerTabs/CloseoutUnsafeRowsTab.tsx`
- `src/client/components/drawerTabs/CloseoutAdjustmentsTab.tsx`
- `src/client/components/drawerTabs/CloseoutArtifactsTab.tsx`

**Edited files:**
- 3 always-on control bands deleted from `RecoveryView`
- Adjustment toggle deleted from `CloseoutView` (moves to drawer)

**Feature flag**: `flag.resolve-canvas-v2`.

**Tests added**:
- `tests/e2e/ac-07-ambiguous-post-candidates.spec.ts`
- `tests/e2e/ac-08-row-level-reversal-preview.spec.ts`
- `tests/e2e/recovery-tools-in-drawer.spec.ts`
- `tests/e2e/closeout-fix-unsafe-cascade.spec.ts`

**Rollback**: Disable flag.

### Phase 6 — Decide (Dashboard + Reports)

**Created files:**
- `src/client/views/ReportsView.tsx`
- `src/client/components/drawerTabs/KpiDefinitionTab.tsx`
- `src/client/components/drawerTabs/KpiDrilldownTab.tsx`
- `src/client/components/drawerTabs/ReportDefinitionTab.tsx`
- `src/client/components/drawerTabs/ReportExportTab.tsx`
- `src/client/components/drawerTabs/ReportSavedViewsTab.tsx`
- `src/client/components/TodayFocusStrip.tsx`
- `src/client/components/MiniBarChart.tsx` (one composable chart for all 7 reports)

**Edited files:**
- `src/client/views/DashboardView.tsx` — add Today focus strip; remove Money Definitions panel; KPI cards gain `onHelp`
- `src/client/components/Shell.tsx` — Reports nav item is rendered live (was placeholder during Phase 0)
- `src/client/App.tsx` — add `ReportsView` route

**Reports implemented** (7):
1. Revenue (group by client / category / day · period range)
2. Aging inventory (bucket 0-7d / 8-30d / 31-60d / 60d+ · group by category)
3. Payables due rollup (group by vendor · due reason breakdown)
4. Cash movement (in/out by bucket · period)
5. Vendor performance (lead time · price drift · on-time receipt %)
6. Category analytics (revenue / margin / units by category)
7. Client sales history (per-client revenue + last-buy + total qty)

Each is a client-side aggregation over `queries.grid({view: …})`.

**Feature flag**: `flag.decide-canvas-v2`.

**Tests added**:
- `tests/e2e/dashboard-today-focus.spec.ts`
- `tests/e2e/reports-revenue-default.spec.ts`
- `tests/e2e/reports-aging-inventory.spec.ts`
- `tests/e2e/kpi-help-opens-drawer.spec.ts`

**Rollback**: Disable flag; Reports nav item hidden.

### Phase 7 — Polish + global

**Goals**: Verify everything is wired and consistent.

**Edited files:**
- Per-view audit for drawer state persistence
- Per-view audit for focus mode behavior
- Per-view audit for selection band swap correctness
- Per-grid `/` filter consistency
- Add-signal CSS transition tuning
- Accessibility sweep across all new components

**Tests added** (final gate):
- `tests/e2e/ac-06-imported-markers-preserved.spec.ts` (cross-view)
- `tests/e2e/ac-10-focus-mode-orientation.spec.ts`
- `tests/e2e/drawer-state-persistence.spec.ts`
- `tests/e2e/keyboard-model-full-sweep.spec.ts`

**Verification**:
```bash
pnpm typecheck
pnpm audit:parity
pnpm build
pnpm db:seed && pnpm test:e2e
```

All flags from Phases 0-6 default to **on** in this release.

---

## 8. Verification Checklist (hard rule from brief)

Every visible button, screen, action, nav item, panel, filter, chart, card, modal, and affordance must be:

- [ ] **Real** — wired to an existing command or query, or to a documented client-side aggregation.
- [ ] **Useful** — solves an operator moment that's in the persona-journey or 67-task inventory.
- [ ] **Operationally justified** — reducing burden, not adding visibility-for-visibility.

Per-surface checklist (applied to all active routes):

- [ ] No stubs.
- [ ] No placeholders.
- [ ] No fake affordances.
- [ ] No dead nav.
- [ ] No unwired controls.
- [ ] No decorative metrics.
- [ ] No disconnected workflows.
- [ ] No unnecessary UI.
- [ ] Pre-selection strip has ≤3 affordances.
- [ ] Selection strip primary is status-aware (no static "do everything" buttons).
- [ ] Secondary verbs in tray, not adjacent buttons.
- [ ] Drawer state persisted per route × entity.
- [ ] Drawer is read-only (except PO Lines tab — documented exception).
- [ ] `/` opens grid filter.
- [ ] `⌘↵` commits primary.
- [ ] `]` toggles drawer.
- [ ] `Esc` follows descending scope.

Backend invariants (no change but must remain):

- [ ] Backend/frontend parity stays green (63 user-surfaceable commands, 1 internal command, 28 queries minimum).
- [ ] Audited command bus untouched.
- [ ] Role-aware nav untouched (`navVisibleForUser`).
- [ ] No new tRPC commands or queries introduced (except the flagged pricing-rule projection in Phase 1, if needed).
- [ ] No new database migrations.

---

## 9. Out of Scope

- Mobile redesign. Connector mobile pick-pack covers warehouse use case.
- Promotion of Customer Workspace to its own route.
- New Vendor Workspace route (Vendor remains a context inside Vendor Payouts).
- New tRPC commands.
- Design-system extraction into a separate package.
- Theming / dark mode.
- New auth/role/RBAC behavior.
- Replacing AG Grid or any other UI library.
- Customer Workspace as standalone route (§1.5 — Option B from wedge decision was rejected).
- Nav consolidation into modes (§1.5 — Option C from wedge decision was rejected).

---

## 10. Status-Aware Primary Decision Tables

For each surface, this is the single source of truth on what the green primary button shows for any row status. Tray secondaries listed in priority order.

### 10.1 Sales (`SalesView` line grid)

| Selection state | Primary | Command | Tray |
| --- | --- | --- | --- |
| 0 rows | (pre-selection strip: `+ Draft Line`) | — | — |
| ≥1 line, all `draft` | **Price + Confirm** | `priceSalesOrder` then `confirmSalesOrder` | Reserve · Remove · Mark packed · Mark inv-posted · Mark pay-f/up |
| ≥1 line, all `needs_resolution` | **Open Validation** | route to Order drawer Validation tab | Reserve · Remove |
| ≥1 line, mixed status | Primary disabled with reason "Select lines of same status" | — | — |
| ≥1 line, all `confirmed` | **Post** | `postSalesOrder` | Reprice · Allocate fulfillment · Pick list · Remove · Cancel |
| ≥1 line, all `posted` | **Mark packed** (if not packed) / **Mark inv-posted** / **Mark pay-f/up** — whichever is next pending | `updateSalesOrderLine` | View order in Orders queue · Reverse |
| ≥1 line, all `fulfilled` | (no primary; tray: Reverse pack / View history) | — | Reverse pack |

Below-floor warning: shown inline as amber pill on line; never blocks primary.

### 10.2 Intake (`IntakeView`)

| Selection state | Primary | Command | Tray |
| --- | --- | --- | --- |
| 0 rows | (pre-selection strip: `Vendor ▾` + `+ Receive Row`) | — | — |
| ≥1, all `draft` | **Mark Ready** | `updateBatch` { status: 'ready' } | ⌘D Duplicate · Delete draft · Set lot info |
| ≥1, all `ready` | **Post Receipt** | `postPurchaseReceipt` | Mark not-ready · Set lot info |
| Mixed status | Primary disabled — "Select rows of same status" | — | — |
| ≥1, all `posted` | (primary disabled · row read-only) | — | Open in Inventory · Adjust qty |
| Mixed vendors | Primary enabled (Post Receipt) — drawer Receipt preview tab surfaces conflict warning | `postPurchaseReceipt` | — |

### 10.3 Purchase Orders (`PurchaseOrdersView`)

| PO status | Primary | Command | Tray |
| --- | --- | --- | --- |
| `draft` | **Add lines / Approve when ready** (composite: cursor lands on line grid line-add row) | `addPurchaseOrderLine` then `approvePurchaseOrder` | Cancel · Edit vendor / expected · Duplicate |
| `approved` | **Receive to Intake** | `receivePurchaseOrder` | Cancel · Reopen · Receive selected lines |
| `partial` | **Receive remaining lines** | `receivePurchaseOrder` { lineIds: unreceived } | Cancel remaining · Mark complete |
| `received` | (no primary; tray: View linked receipts) | — | Reopen if reversible |
| `cancelled` | (no primary) | — | Restore as draft |

### 10.4 Orders (`OrdersView`)

| Order status | Primary | Command | Tray |
| --- | --- | --- | --- |
| `draft` | **Confirm** (was Ready) | `confirmSalesOrder` | Reprice · Remove · Cancel · Edit customer / delivery |
| `confirmed` | **Post** | `postSalesOrder` | Reprice · Reserve · Cancel |
| `posted`, `packed=false` | **Mark packed** | `updateSalesOrderLine` { packed: true } | Allocate fulfillment · Pick list |
| `posted`, `packed=true`, `inventoryPosted=false` | **Mark inv-posted** | `updateSalesOrderLine` { inventoryPosted: true } | Allocate fulfillment |
| `posted`, all closeout checked | **Mark pay-f/up** | `updateSalesOrderLine` { paymentFollowup: true } | Reverse |
| `fulfilled` | (no primary; closed) | — | Reverse · Open invoice |

### 10.5 Payments (`PaymentsView`)

| Payment status | Primary | Command | Tray |
| --- | --- | --- | --- |
| Pre-selection (Quick Ledger row composing) | **(implicit row-level ✓ commit button)** | `logPayment` / `recordVendorPayment` / `createCorrectionJournalEntry` | — |
| Selected, `unapplied` | **Allocate FIFO** | `allocatePayment` | Allocate to selected invoice · Apply early-pay discount · Refund · Reverse |
| Selected, `partially_applied` | **Allocate remaining** | `allocatePayment` { paymentId, allocationIntent: 'fifo' } | Allocate to selected · Unallocate · Discount |
| Selected, `applied` | (no primary) | — | Unallocate · Reverse |
| Selected, `buyer_credit` | **Apply to invoice** | `allocatePayment` { allocationIntent: 'selected' } | Refund · Reverse |
| Selected, `reversed` | (no primary) | — | View linked correction |

### 10.6 Vendor Payouts (`VendorPayablesView`)

| Bill status | Primary | Command | Tray |
| --- | --- | --- | --- |
| `open` | **Approve** | `approveVendorBill` | Edit terms · Reject · View source receipt |
| `approved` | **Schedule** | `scheduleVendorPayment` { scheduledFor } | Pay now (auto-schedule) · Reverse approval · Reject |
| `scheduled` | **Pay** | `recordVendorPayment` | Reschedule · Cancel schedule · Void · Reverse approval |
| `partial` | **Pay remaining** | `recordVendorPayment` { amount: open balance } | Reschedule · Void last payout |
| `paid` | (no primary; closed) | — | Reverse last payout · Open audit trail |
| `void` | (no primary) | — | Restore (creates new approval) |

### 10.7 Fulfillment (`FulfillmentView`)

| Pick status | Primary | Command | Tray |
| --- | --- | --- | --- |
| `draft` (no lines packed yet) | **Open lines** (route to drawer Lines tab; pack inputs become inline) | — | Cancel pick · Duplicate |
| `in_pack` (some lines packed) | **Pack remaining** (selects unpacked lines and focuses qty cell) | `recordWeighAndPack` | Auto-bag · Print partial labels · Reverse pack |
| `packed` (all lines packed) | **Print labels** | `printLabels` { pickListId, labelFormat } | Auto-bag · Reverse pack |
| `labeled` (all printed) | **Mark fulfilled** | `markOrderFulfilled` { orderId, tracking } | Reprint labels · Reverse |
| `fulfilled` | (no primary) | — | Reverse fulfillment · Open manifest |

### 10.8 Connectors (`ConnectorsView`)

| Request status | Primary | Command | Tray |
| --- | --- | --- | --- |
| `pending` | **Approve** | `approveConnectorRequest` | Reject · Open source |
| `routed` | (internal state; no operator primary) | — | Open linked order/pick |
| `approved` | (no primary; accepted for normal lane work) | — | Reject · Open linked entity |
| `rejected` | (no primary) | — | Restore as pending |

Safety note in the drawer only: connector requests never mutate ledgers directly. Any lane/default assignment is backend/internal, not a user routing workflow.

### 10.9 Recovery (`RecoveryView`)

| Command status | Primary | Command | Tray |
| --- | --- | --- | --- |
| `posted`, reversible | **Reverse** | `reverseCommandById` | Open target row · Snapshot diff · Support packet |
| `posted`, non-reversible | (no primary; primary disabled) | — | Open target row · Support packet |
| `failed` | **Retry** | (replays original command name with stored `input_payload`) | Open target row · Edit payload (advanced) · Mark resolved |
| `reversed` | (no primary) | — | Open reversal command |

Drawer queue-state tabs (no command selected): Find/Replace · Correction · Backup · Markers · System.

### 10.10 Closeout (`CloseoutView`)

| Period status | Primary | Command | Tray |
| --- | --- | --- | --- |
| `open`, `unsafeRows > 0` | **Fix unsafe rows (N)** (amber; opens drawer Unsafe rows tab) | — (routes) | Adjustments · Open control totals |
| `open`, `unsafeRows = 0` | **Lock period** | `lockPeriod` | Adjustments · Reopen |
| `locked` | **Archive** | `archivePeriod` { verified: true } | Reopen · Adjustments |
| `archived` | (no primary; immutable) | — | Open artifacts · Backup snapshot |

### 10.11 Reports (`ReportsView`)

| Selection state | Primary | Command/Action | Tray |
| --- | --- | --- | --- |
| 0 selection (chip change) | (chip-row picker) | — | — |
| Row selected (Revenue) | **Open client card** | route to Client Ledger | Export CSV · Copy · Compose offer |
| Row selected (Aging inventory) | **Open lots in Inventory** | route to Inventory + filter by category | Export CSV · Compose customer-safe offer |
| Row selected (Payables due rollup) | **Open vendor bills** | route to Vendor Payouts + filter | Export CSV |
| Row selected (Cash movement) | **Open ledger rows** | route to Payments + period filter | Export CSV |
| Row selected (Vendor performance) | **Open vendor card** | route to Vendor Payouts + select vendor | Export CSV |
| Row selected (Category analytics) | **Open category lots** | route to Inventory + filter by category | Export CSV |
| Row selected (Client sales history) | **Open client card** | route to Client Ledger | Export CSV |

### 10.12 Dashboard (`DashboardView`)

No row-selection primary. KPI cards have `?` for definition (drawer) and click-value for drilldown (drawer). Today focus strip items are routed directly. Unified Work Queue grid uses its row's owning-lane primary.

### 10.13 Inventory (`InventoryView`)

| Selection state | Primary | Command | Tray |
| --- | --- | --- | --- |
| 0 rows, Grid mode | (pre-selection: search · category · status) | — | — |
| 0 rows, Finder mode | (Finder controls) | — | — |
| ≥1, `posted` batch | **Edit price / qty inline** (no primary button — inline cells do the work) | `setBatchPrice` / `adjustBatchQuantity` / `setBatchLotInfo` / `updateBatch` | Transfer · Set lot info · Attach photo · Move location |
| Aging or low-stock chip filtered | (same as above; primary contextual) | — | Compose offer · Copy customer-safe |

### 10.14 Client Ledger (`ClientLedgerView`)

| Customer status | Primary | Command | Tray |
| --- | --- | --- | --- |
| 0 customers selected | (pre-selection: search) | — | — |
| 1 customer selected, has open invoices | **Open in Sales** | route + set active customer | View payments · View ledger · Compose statement |
| 1 customer selected, over credit limit | **Send statement** | (export PDF) | View payments · Adjust credit limit |
| ≥2 customers | **Bulk action: Compose statements** | (export CSV/PDFs) | Compare balances |

---

## 11. Component Contracts (TypeScript Interfaces)

### ContextDrawer

```typescript
import type { ReactNode } from 'react';
import type { ViewKey } from '../../shared/types';

export type DrawerStateName = 'closed' | 'peek' | 'expanded' | 'full' | 'max';

export interface DrawerTab {
  key: string;            // 'purchases', 'balance', 'lines'
  label: string;          // 'Purchases', 'Balance', 'Lines'
  available: boolean;     // false → tab is rendered grey/disabled with hover reason
  badge?: string | number; // e.g., '3' for 3 unresolved
}

export interface ContextDrawerProps {
  view: ViewKey;
  activeEntity: {
    type: string;          // 'customer' | 'vendor' | 'batch' | 'order' | 'po' | …
    id: string;
    label?: string;        // for analytics; not rendered
  } | null;
  tabs: DrawerTab[];
  defaultTab: string;      // key of tab to focus when entity activates
  state?: DrawerStateName; // override; defaults to uiStore.drawerByView[view].state
  onStateChange?: (state: DrawerStateName) => void;
  renderTab: (tabKey: string) => ReactNode;
  className?: string;
}
```

State management:
- On mount, reads `uiStore.drawerByView[view]`. If absent, defaults to `{ state: 'closed', activeTab: defaultTab, entityType: activeEntity?.type ?? null, entityId: activeEntity?.id ?? null }`.
- On entity change (from queue selection), if state was `closed`, auto-promotes to `peek`; else preserves state.
- On `]` keypress with focus inside drawer or grid: cycle closed → peek → expanded → closed.
- On `⇧]`: cycle expanded → full → max → expanded.
- On `Esc` with drawer focus: close drawer; subsequent `Esc` cascades per the descending-scope rule.

### IdentityRibbon

```typescript
import type { ReactNode } from 'react';

export interface IdentityRibbonProps {
  category: string;       // 'Customer' | 'PO' | 'Period' | 'Vendor' | 'Batch' | …
  name: string;           // 'Rich Star'
  status?: {
    label: string;        // 'draft' | 'approved' | …
    tone: 'draft' | 'confirmed' | 'posted' | 'fulfilled' | 'cancelled' | 'scheduled' | 'paid' | 'partial' | 'locked' | 'archived';
  };
  detail?: ReactNode;     // 'draft order RS-2026-05-11 · 3 lines · $612'
  tags?: string[];        // ['priority', 'candy']
  onBack?: () => void;    // ⌘← handler
  onLeave?: () => void;   // ✕ handler — clears active entity
}
```

### SelectionSummary (revised)

```typescript
import type { ReactNode } from 'react';
import type { GridRow, ViewKey } from '../../shared/types';

export interface SelectionPrimary {
  label: string;
  command?: () => void | Promise<void>;
  kbd?: string;           // '⌘↵'
  tone?: 'normal' | 'warning';  // warning is amber, e.g. 'Fix unsafe rows'
  disabled?: boolean;
  disabledReason?: string;
}

export interface SelectionTrayItem {
  key: string;
  label: string;
  command: () => void | Promise<void>;
  disabled?: boolean;
}

export interface SelectionWarning {
  key: string;
  label: string;          // 'below floor', 'mixed vendors'
  tone: 'warning' | 'info';
  count?: number;
}

export interface SelectionSummaryProps {
  rows: GridRow[];
  view: ViewKey;
  primaryAction?: SelectionPrimary;
  moreActions?: SelectionTrayItem[];
  warnings?: SelectionWarning[];
  onOpenHistory: (row: GridRow) => void;
  onOpenRelationship?: (row: GridRow) => void;
  onOpenIssue?: (row: GridRow) => void;
  onOpenPacket?: () => void;
}
```

Renders nothing when `rows.length === 0`. The owning view supplies the status-aware primary via §10.

### InventoryFinder

```typescript
import type { GridRow } from '../../shared/types';

export interface InventoryFinderBatch extends GridRow {
  batchCode?: string;
  sourceCode?: string | null;
  shorthand?: string | null;
  name?: string;
  category?: string;
  vendorId?: string | null;
  vendor?: string | null;
  availableQty?: string | number;
  unitPrice?: string | number;
  unitCost?: string | number;
  location?: string | null;
  lotCode?: string | null;
  ownershipStatus?: string | null;
  legacyMarker?: string | null;
  intakeDate?: string | null;
  ticketCost?: string | number | null;
  notes?: string | null;
  mediaStatus?: string | null;
  priceRange?: string | null;
  tags?: string[] | string | null;
  ageDays?: number;
  uom?: string | null;
}

export type FinderMode = 'embed' | 'overlay' | 'standalone';

export interface InventoryFinderProps {
  mode: FinderMode;
  selectedOrderId?: string;                       // active order context, if any
  addedBatchIds?: Set<string>;                    // for "already in order" badge
  initialSearch?: string;
  onAddBatch?: (batch: InventoryFinderBatch, qty: number) => Promise<void>;
  onRowFocus?: (batch: InventoryFinderBatch) => void;  // for drawer routing
  onClose?: () => void;                           // only used in 'overlay' mode
}
```

Shared logic across 3 modes. Saved slices, natural-price parsing, faceted filters, compare strip, customer-safe offer copy — all stay in one place.

### Drawer tab (generic)

```typescript
import type { ReactNode } from 'react';

export interface DrawerTabProps<TEntity = unknown> {
  entity: TEntity;        // typed per tab; e.g. CustomerEntity, BatchEntity
  onRouteOut?: (target: { view: ViewKey; entityType: string; entityId: string }) => void;
  onClose?: () => void;
}

export interface DrawerTabModule<TEntity = unknown> {
  Component: React.FC<DrawerTabProps<TEntity>>;
  label: string;
  defaultExpandedTab?: boolean;
  isReadOnly: boolean;    // false only for POLinesTab (the documented exception)
}
```

Each drawer tab file exports a `DrawerTabModule`. The tab registry is a plain object in `src/client/components/drawerTabs/registry.ts` keyed by tab key.

---

## 12. Drawer Tab Data Contracts

Every tab follows the same skeleton:

```
Tab name       Component                     Query consumed                              Renders                                                                          Routes out to
─────────────  ────────────────────────────  ──────────────────────────────────────────  ───────────────────────────────────────────────────────────────────────────────  ─────────────────────
Profile        CustomerProfileTab            queries.relationshipSummary({ customerId })  Name · email · phone · tags · creditLimit · notes (read-only)                    Client Ledger row
Balance        CustomerBalanceTab            queries.relationshipSummary({ customerId })  Balance · credit · open invoices count · oldest open · avg pay days              Payments filtered to customer
Purchases      CustomerPurchasesTab          queries.customerWorkspace({ customerId })   Last 90d orders table (date · item · qty · $) + 90d stats                        Orders queue · Order detail
Pricing        CustomerPricingTab            queries.relationshipSummary({ customerId })  Pricing tier · floor · ceiling · clearance flag · last-rule-applied              n/a (read-only here)
Buyer fit      CustomerBuyerFitTab           queries.salesSuggestions({ customerId })    Suggested batches w/ reason chips · per-row +qty +add button                     Inventory / Sales line add
Notes          CustomerNotesTab              queries.relationshipSummary({ customerId })  Notes text + history (read-only)                                                 n/a
Recent         CustomerRecentTab             queries.relationshipSummary({ customerId })  Last 10 commands touching this customer                                          Recovery (selected cmd)
Disputes/cred  CustomerDisputesTab           queries.relationshipSummary({ customerId })  Open disputes · credits · refunds (read-only summary)                            n/a
Output         CustomerOutputTab             (client-side from order lines)              Internal sheet preview · Customer catalog preview · Copy/Export buttons          n/a
History        HistoryTab                    queries.recoverySearch({ q: entityId })     Last 5 commands touching this entity                                             Recovery (selected cmd)
─────────────  ────────────────────────────  ──────────────────────────────────────────  ───────────────────────────────────────────────────────────────────────────────  ─────────────────────
Open bills     VendorOpenBillsTab            queries.grid({view:'vendors',vendorId})     Vendor's open bills with status + due reason                                     Vendor Payouts row
Payouts        VendorPayoutsTab              queries.vendorPayments({vendorId})          Vendor payout history table                                                      Payments / Recovery
POs            VendorPOsTab                  queries.grid({view:'purchaseOrders'})       This vendor's POs                                                                PO row
Consignment    VendorConsignmentTab          queries.relationshipSummary({vendorId})      Active consignment lots · sellout %                                              Inventory row
Performance    VendorPerformanceTab          (client-side aggregation)                   Lead time · price drift · on-time receipt %                                      Recovery / Inventory
Scheduled      VendorScheduledTab            queries.grid({view:'vendors',vendorId})     Scheduled payouts with event date                                                Payments queue
Tools          VendorToolsTab                queries.reference                            Manual bill creation · Void payout (writes audited commands)                    n/a
─────────────  ────────────────────────────  ──────────────────────────────────────────  ───────────────────────────────────────────────────────────────────────────────  ─────────────────────
Movement       BatchMovementTab              queries.relationshipSummary({batchId})       Per-event qty change · reason · actor · timestamp                                Recovery (selected cmd)
Sales (recent) BatchSalesTab                 queries.relationshipSummary({batchId})       Last sales of this batch w/ buyer + qty                                          Order / Sales
Reservations   BatchReservationsTab          queries.relationshipSummary({batchId})       Active reservations w/ order + qty                                               Order row
Photos         BatchPhotosTab                queries.reference (photo subset)            Thumbnails + status · attach button                                              n/a
Sourced PO     BatchSourcedFromPOTab         queries.purchaseOrderLines (back-link)      Linked PO + receipt + cost                                                       PO row
Tags           BatchTagsTab                  (local + queries.reference)                 Tag list inline editable                                                         n/a
Transfer       BatchTransferTab              n/a                                          Form to transfer ownership/location (writes adjustBatchQuantity command)         n/a
─────────────  ────────────────────────────  ──────────────────────────────────────────  ───────────────────────────────────────────────────────────────────────────────  ─────────────────────
Lines          OrderLinesTab                 queries.salesOrderLines({orderId})          Read-only line breakdown w/ impact preview block                                 Sales (edit) · Recovery
Allocation     OrderAllocationTab            queries.paymentAllocations({orderId})       Payments allocated to this order's invoice(s)                                    Payments row
Customer card  OrderCustomerCardTab          queries.relationshipSummary({customerId})    Mini customer profile + balance                                                  Sales · Client Ledger
Pricing        OrderPricingTab               (client-side from order)                    Pricing strategy · rule reasoning per line                                       n/a
Validation     OrderValidationTab            queries.salesOrderLines (validationIssues)  Per-line validation issues w/ fix-action                                         Sales
Output         OrderOutputTab                queries.salesOrderLines                     Internal/external preview · Invoice PDF · Copy offer                             n/a
Fulfillment    OrderFulfillmentTab           queries.fulfillmentLines({orderId})         Linked picks + status                                                            Fulfillment row
─────────────  ────────────────────────────  ──────────────────────────────────────────  ───────────────────────────────────────────────────────────────────────────────  ─────────────────────
Lines          POLinesTab ⚠ editable          queries.purchaseOrderLines({poId})          Editable line grid w/ inline last-row add + impact preview                       PO actions
Vendor card    POVendorCardTab               queries.relationshipSummary({vendorId})      Vendor mini-card                                                                 Vendor Payouts
Linked intake  POLinkedIntakeTab             queries.grid({view:'intake', poId})         Downstream intake rows w/ status + traceability ribbon                            Intake row
Linked receipts POLinkedReceiptsTab          queries.recoverySearch({q:poId})            Posted receipts                                                                  Recovery
─────────────  ────────────────────────────  ──────────────────────────────────────────  ───────────────────────────────────────────────────────────────────────────────  ─────────────────────
Due reason     BillDueReasonTab              queries.grid({view:'vendors',billId})       Plain-language explanation (consigned depletion · net terms · etc)                Vendor card
Source receipt BillSourceReceiptTab          queries.recoverySearch({q:receiptId})       Receipt linked to this bill                                                      Recovery
Linked PO      BillLinkedPOTab               queries.purchaseOrderLines (back-link)      PO that drove this bill                                                          PO row
Payouts        BillPayoutsTab                queries.vendorPayments({billId})            Payout history for this bill                                                    Payments
Consignment    BillConsignmentTab            queries.relationshipSummary({vendorId})      Sellout math driving due amount                                                  Inventory
─────────────  ────────────────────────────  ──────────────────────────────────────────  ───────────────────────────────────────────────────────────────────────────────  ─────────────────────
Allocations    PaymentAllocationsTab         queries.paymentAllocations({paymentId})     Per-invoice toggle + FIFO/selected preview                                       n/a (in-tab actions)
Customer card  PaymentCustomerCardTab        queries.relationshipSummary({customerId})    Mini customer profile + balance                                                  Client Ledger
Impact         PaymentImpactTab              queries.paymentAllocationPreview            FIFO vs selected impact diff                                                     n/a
Buckets        PaymentBucketsTab             queries.dashboard (buckets subset)          Cash/file bucket impact                                                          Dashboard drilldown
─────────────  ────────────────────────────  ──────────────────────────────────────────  ───────────────────────────────────────────────────────────────────────────────  ─────────────────────
Lines (pick)   PickLinesTab                  queries.fulfillmentLines({pickId})          Read-only summary of fulfillment lines                                           Fulfillment (edit inline)
Order card     PickOrderCardTab              queries.relationshipSummary({orderId})       Order summary                                                                    Orders queue
Bag/labels     PickBagLabelsTab              queries.fulfillmentLines                    Per-bag breakdown · label format selector · Print labels button                  n/a
Manifest       PickManifestTab               queries.fulfillmentLines                    Manifest CSV path · regenerate button                                            n/a
Scan history   PickScanHistoryTab            queries.grid({view:'connectors',pickId})    Mobile scan submissions tied to this pick                                        Connectors row
Tracking       PickTrackingTab               (local from pick)                            Tracking number input + carrier link                                            n/a
─────────────  ────────────────────────────  ──────────────────────────────────────────  ───────────────────────────────────────────────────────────────────────────────  ─────────────────────
Session/payld  ConnectorSessionTab           (selected row's payload)                     Cart items · unresolved fragments · session metadata                              Sales (unresolved → draft line)
Routing        ConnectorRoutingTab           queries.reference                            Route destinations + history                                                    n/a
Review history ConnectorReviewHistoryTab     queries.recoverySearch({q:requestId})       Audit history of approvals/rejects                                               Recovery
Linked order   ConnectorLinkedOrderTab       queries.relationshipSummary (downstream)     If routed, the resulting order/pick                                              Orders / Fulfillment
─────────────  ────────────────────────────  ──────────────────────────────────────────  ───────────────────────────────────────────────────────────────────────────────  ─────────────────────
Reversal/Retry RecoveryReversalTab           queries.reversalPreview({commandId})        Plain-language failure reason + candidate source rows + jump-to-target            Target view selected row
Snapshot diff  RecoverySnapshotTab           queries.snapshotDiff({backupId})            Before/after diff per row                                                        n/a
Source map     RecoverySourceMapTab          (computed)                                   Legacy-row → current-batch mapping                                              Inventory row
Find/Replace   RecoveryFindReplaceTab        queries.findReplacePreview                  Preview matches + Apply (audited correction journal)                              n/a
Correction     RecoveryCorrectionTab         n/a                                          Form to create correction journal entry                                          n/a
Backup         RecoveryBackupTab             queries.reference (backups)                 Backup list · Verify · Restore preview                                           n/a
Markers        RecoveryMarkersTab            (computed)                                   Unmapped markers vocabulary review w/ approve mapping                            n/a
System         RecoverySystemTab             queries.health (extended)                   Pause/resume posting · config flags · health detail                              n/a
─────────────  ────────────────────────────  ──────────────────────────────────────────  ───────────────────────────────────────────────────────────────────────────────  ─────────────────────
Control totals CloseoutControlTotalsTab      queries.closeoutPreview({period})           Batches · orders · commands · cash deltas                                        Dashboard drilldown
Unsafe rows    CloseoutUnsafeRowsTab         queries.closeoutPreview({period})           Blocker rows w/ owning-lane links                                                Owning lane row
Adjustments    CloseoutAdjustmentsTab        queries.closeoutPreview({period})           Adjustment form + audit history                                                  n/a
Artifacts      CloseoutArtifactsTab          queries.closeoutPreview({period})           CSV/JSONL/PDF paths · regenerate (per existing archive command)                  n/a
─────────────  ────────────────────────────  ──────────────────────────────────────────  ───────────────────────────────────────────────────────────────────────────────  ─────────────────────
Definition     KpiDefinitionTab              queries.dashboard (def subset)              Plain-language formula + source                                                  n/a
Drilldown      KpiDrilldownTab               queries.drilldown({metricKey})               Source rows feeding the KPI                                                     Owning lane row
─────────────  ────────────────────────────  ──────────────────────────────────────────  ───────────────────────────────────────────────────────────────────────────────  ─────────────────────
Definition     ReportDefinitionTab           (static + report meta)                       Plain-language explanation + "why this matters"                                  n/a
Export         ReportExportTab               (client-side from current report)            CSV · Excel · PDF export options                                                 n/a
Saved views    ReportSavedViewsTab           (uiStore.savedReportViews — new persisted)  Per-operator saved parameter sets                                                n/a
```

All `Recent`/`History` tabs reuse the shared `HistoryTab` component, scoped to entity.

---

## 13. Visual Tokens, Spacing & Animation

### Color tokens (existing Tailwind palette, named uses for canvas grammar)

| Token | Hex (current Tailwind) | Used for |
| --- | --- | --- |
| `amber` (custom) | per `tailwind.config.ts` | identity ribbon background, active nav border, primary accents |
| `ink` | dark text | primary text |
| `line` | light grey | borders |
| `panel` | very light grey | section backgrounds |
| `zinc-{500,600,700}` | tailwind zinc | secondary text |
| `green-500` (`#22c55e`) | primary action button |
| `amber-400` (`#fbbf24`) | warning primary, below-floor pill, soft warning badges |
| `green-50` (`#dcfce7`) | add-signal flash, posted status pill bg |
| `green-700` (`#166534`) | posted status pill text, success indicator |
| `red-700` (`#991b1b`) | failed status pill text |
| `amber-100` (`#fef9c3`) | draft/pending status pill bg |
| `amber-800` (`#854d0e`) | draft/pending text |
| `indigo-100/700` | confirmed/approved status pills |
| `cyan-100/700` | fulfilled/locked status pills |

### Spacing scale (Tailwind defaults; key values used in canvas)

| Use | Class | Pixels |
| --- | --- | --- |
| Selection strip vertical padding | `py-1.5` | 6px |
| Selection strip horizontal padding | `px-2.5` | 10px |
| Grid row vertical padding | `py-1` | 4px |
| Grid header cell padding | `px-2.5 py-1.5` | 10px / 6px |
| Drawer tab padding | `px-2.5 py-1.5` | 10px / 6px |
| Drawer body padding | `p-2.5` | 10px |
| Identity ribbon padding | `py-1.5 px-2.5` | 6px / 10px |
| Section divider gap | `mt-1.5` | 6px |

### Density variations

The current design is **operator density** (compact). No additional density modes shipped; AG Grid Quartz `--ag-grid-size: 6px` already in use.

### Animation specification (per §2.11)

Implemented via Tailwind `transition` utilities + custom CSS for drawer state widths.

---

## 14. Test Plan

Each acceptance criterion gets a Playwright scenario. Selectors use `data-testid` rather than ARIA labels for stability.

### data-testid additions (new components)

| Component | data-testid |
| --- | --- |
| Keel | `keel`, `keel-chip-sale`, `keel-chip-receive`, `keel-chip-money-in`, `keel-chip-money-out`, `keel-chip-purchase`, `keel-search-trigger`, `keel-health-pill` |
| SideNav | `sidenav`, `sidenav-group-{decide,procure,sell,money,resolve}`, `sidenav-item-{viewKey}` |
| Identity ribbon | `identity-ribbon`, `identity-ribbon-back`, `identity-ribbon-leave` |
| Selection strip | `selection-strip`, `selection-strip-primary`, `selection-strip-tray`, `selection-strip-history`, `selection-strip-relationship`, `selection-strip-issue`, `selection-strip-packet` |
| Pre-selection strip | `pre-selection-strip`, `pre-selection-strip-{action}` |
| Context Drawer | `context-drawer`, `context-drawer-state-{closed,peek,expanded,full,max}`, `context-drawer-tab-{tabKey}`, `context-drawer-close` |
| Drawer tab | `drawer-tab-{tabKey}-content`, `drawer-tab-{tabKey}-route-out` |
| Inventory Finder | `inventory-finder`, `inventory-finder-overlay`, `inventory-finder-search`, `inventory-finder-slice-{sliceKey}`, `inventory-finder-row-{batchId}`, `inventory-finder-add-{batchId}` |
| Add signal | `add-signal-chip-{rowId}`, `add-signal-flash-{rowId}` |
| Below-floor pill | `below-floor-pill-{lineId}` |
| Today focus | `today-focus-strip`, `today-focus-action-{actionKey}` |

### Per-AC Playwright scenarios

```typescript
// AC-01: Customer-aware sale start
test('starting a sale from anywhere lands in customer workspace', async ({ page }) => {
  await login(page, 'owner');
  await page.goto('/dashboard');
  await page.getByTestId('keel-search-trigger').click();
  await page.keyboard.type('Rich Star');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('identity-ribbon')).toContainText('Rich Star');
  await expect(page.getByTestId('context-drawer-state-peek')).toBeVisible();
  await expect(page.getByTestId('drawer-tab-balance-content')).toBeVisible();
  await expect(page.locator('[data-testid="pre-selection-strip-draft-line"] input')).toBeFocused();
});

// AC-02: Inventory scanning by remembered fragment
test('Cmd+Shift+F finds across notes / markers / source codes', async ({ page }) => {
  await login(page, 'owner');
  await page.goto('/sales');
  await page.keyboard.press('Meta+Shift+KeyF');
  await expect(page.getByTestId('inventory-finder-overlay')).toBeVisible();
  await page.getByTestId('inventory-finder-search').fill('m15');
  await expect(page.locator('[data-testid^="inventory-finder-row-"]')).toHaveCount(1);
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('add-signal-chip-m15-batch')).toBeVisible();
});

// AC-03: Three closeout cells independent
test('Packed / Inv Posted / Pay/F-up toggle independently and each commits a command', async ({ page }) => {
  await login(page, 'sales');
  await page.goto('/orders');
  await page.locator('[data-testid^="selection-strip-tray-mark-packed"]').click();
  // assert each toggle commits a distinct command via the journal subscription
});

// AC-04: Quick Ledger 5-row mixed entry
test('5 mixed ledger rows commit in under 30 seconds', async ({ page }) => {
  // append 5 rows: client payment, buyer credit, vendor payout, transfer, correction
  // assert: 5 commands committed; all status=posted; <30s elapsed
});

// AC-05: Vendor receipt from selection
test('selecting intake rows and posting receipt yields totals matching selection', async ({ page }) => {
  // …
});

// AC-06: Imported markers preserved
test('raw legacy markers C / OFC / CV / T remain visible across Intake / Inventory / Sales / Orders', async ({ page }) => {
  // …
});

// AC-07: Ambiguous post explained
test('failed postSalesOrder shows candidate source rows in drawer Reversal/Retry tab', async ({ page }) => {
  // …
});

// AC-08: Row-level reversal preview
test('clicking History on a posted row opens drawer History tab with reversal preview', async ({ page }) => {
  // …
});

// AC-09: PO traceability
test('approved PO drawer Linked intake tab shows trace ribbon end to end', async ({ page }) => {
  // …
});

// AC-10: Focus mode preserves orientation
test('focusing the Intake grid preserves Keel + Identity ribbon + Drawer', async ({ page }) => {
  // …
});
```

Each test file lives at `tests/e2e/ac-XX-*.spec.ts`. Phase 7 ships them all green in CI.

### Other E2E tests (non-AC)

- `tests/e2e/canvas-grammar.spec.ts` — Phase 0 smoke
- `tests/e2e/po-status-aware-primary.spec.ts` — Phase 2
- `tests/e2e/po-line-add-as-last-row.spec.ts` — Phase 2
- `tests/e2e/payment-allocation-fifo-vs-selected.spec.ts` — Phase 3
- `tests/e2e/vendor-payable-due-reason-column.spec.ts` — Phase 3
- `tests/e2e/orders-status-aware-primary.spec.ts` — Phase 4
- `tests/e2e/fulfillment-inline-pack.spec.ts` — Phase 4
- `tests/e2e/connectors-inline-routing.spec.ts` — Phase 4
- `tests/e2e/recovery-tools-in-drawer.spec.ts` — Phase 5
- `tests/e2e/closeout-fix-unsafe-cascade.spec.ts` — Phase 5
- `tests/e2e/dashboard-today-focus.spec.ts` — Phase 6
- `tests/e2e/reports-revenue-default.spec.ts` — Phase 6
- `tests/e2e/reports-aging-inventory.spec.ts` — Phase 6
- `tests/e2e/drawer-state-persistence.spec.ts` — Phase 7
- `tests/e2e/keyboard-model-full-sweep.spec.ts` — Phase 7

### Parity checks

`scripts/check-backend-frontend-parity.mjs` already exists. It runs as `pnpm audit:parity` in CI. Must stay green throughout this pass. If a new command/query becomes necessary (Phase 1 pricing), the script must be updated to reflect it.

---

## 15. Feature Flags & Rollout

Feature flags are simple env-driven booleans read at app boot. Flag names:

| Flag | Default | Phase | Effect when on |
| --- | --- | --- | --- |
| `flag.canvas-grammar-v2` | dev/seed: on; prod: off until Phase 7 | 0 | Keel chips, SideNav groups, drawer primitives active |
| `flag.sales-customer-workspace-v2` | dev/seed: on | 1 | New SalesView with drawer-based customer workspace |
| `flag.procurement-canvas-v2` | dev/seed: on | 2 | New Intake / PO / Inventory views |
| `flag.money-canvas-v2` | dev/seed: on | 3 | New Payments / Vendor Payouts views |
| `flag.sell-canvas-v2` | dev/seed: on | 4 | New Orders / Fulfillment / Connectors / Client Ledger views |
| `flag.resolve-canvas-v2` | dev/seed: on | 5 | New Recovery / Closeout views |
| `flag.decide-canvas-v2` | dev/seed: on | 6 | Dashboard Today focus + Reports route |

Flag wiring: a small helper `src/client/flags.ts` reads `import.meta.env.VITE_FLAG_*` and returns a strongly-typed flag object. Views check `flags.salesCustomerWorkspaceV2` at render time and branch. When all flags are on, the old code paths can be deleted in a Phase 8 cleanup PR after a soak period.

Rollout sequence:
1. Phase N ships flag off in production.
2. Internal QA on local + staging with flag on.
3. Owner approves; flag flips on in production for that phase.
4. Soak 5 business days.
5. Next phase begins.

If a regression appears in a phase, the flag flips off and the regression is fixed in a follow-up before the next phase starts.

---

## 16. Edge Cases

### 16.1 Customer Workspace (Sales)

- **Customer with no purchases**: Purchases tab shows empty state "No orders yet. Use the line grid to start one." with `+ Draft Line` CTA.
- **Customer over credit limit**: Balance tab shows amber pill `over limit by $X`; line-grid post primary stays enabled (warning only, dismissible per §1.5).
- **Customer with stale buyer-fit suggestions** (no recent purchases): Buyer fit tab falls back to category-match against active draft lines.
- **Active customer deleted while open**: Identity ribbon shows `(customer removed)`; drawer tabs show "Customer not found"; `⌘← back` works to escape.
- **Customer switch with unsaved draft order**: Confirm dialog "Discard 3 draft lines on RS-2026-05-11?" (one-time, not modal-wizard).

### 16.2 Purchase Orders

- **PO with 0 lines, status approved**: Cannot happen by command bus invariant (approval requires ≥1 line). UI shows primary disabled "Add at least one line before approving."
- **Partial receive then cancel attempt**: Cancel blocked. UI says "PO has 12 received units. Reverse intake row(s) first." with link to Linked intake tab.
- **Receive on PO with 0 unreceived lines**: Primary disabled "All lines received." Tray offers "View linked receipts."
- **Vendor changed while PO has lines**: Today's command allows it pre-approval; UI confirms once "Reset cost/range hints? (current values keep)" then commits `updatePurchaseOrder`.
- **Mixed PO-linked + ad hoc intake selection**: Receipt preview drawer tab shows warning "1 row not linked to any PO. Posting will create receipt with mixed sources."

### 16.3 Intake / Receiving

- **Receipt preview with mixed vendors**: Drawer shows row-by-row "Vendor mismatch" pill; primary enabled (post still works), but conflict pill in selection strip.
- **Receipt preview with all-zero costs**: Warning "$0 cost on N rows. Confirm before posting."
- **Posted intake quantity edit attempt**: Inline edit refused with toast "Use adjustment for posted rows."
- **CSV import with invalid rows**: Validation result lists offending rows by line number; Import button stays disabled.

### 16.4 Inventory Finder

- **Empty result set**: Footer shows "No matching inventory. Try clearing vendor, removing price cap, or opening more filters." with one-click clear buttons.
- **Active order is cancelled while overlay open**: "Active add target" pill changes to "no active order — adds go to a new order" with customer typeahead.
- **Add to active order when line already exists with same source row**: Shows duplicate badge inline; clicking add prompts "Combine quantities or split?" (inline action, not modal).

### 16.5 Quick Ledger

- **Negative amount on money-in**: Auto-flips to `buyer_credit`; bucket auto-changes to default credit bucket; impact preview "Buyer credit / down payment $X."
- **Vendor payout with no bill selected**: Row shows `needs_fix` status with message "Choose a vendor bill before paying out."
- **Vendor bill paid in full but operator tries to over-pay**: Refused with "Bill balance is $0; paying additional creates buyer credit on vendor — confirm."
- **Transfer between buckets without notes**: Refused with "Add a note or reference before posting a correction/transfer row."

### 16.6 Recovery

- **Failed command with no retryable payload**: Primary disabled "Original payload not captured (older command journal format)." Tray: Support packet, Open target row.
- **Reverse on a command whose forward effect was already reversed**: Refused with "Already reversed by cmd-XYZ."
- **Find/Replace preview with 0 matches**: Apply button disabled with "0 matches."

### 16.7 Closeout

- **Lock attempt with unsafe rows > 0**: Primary remains "Fix unsafe rows (N)"; explicit Lock button in tray disabled with reason.
- **Archive attempt before lock**: Tray Archive disabled "Lock the period first."
- **Re-archive of already-archived period**: Refused with toast; no UI affordance offered.
- **Period adjustment that would make control totals fail**: Refused on commit with "Adjustment breaks invariant X — see drawer Control totals tab."

### 16.8 Connectors

- **Route to lane the operator doesn't have role access to**: routeTo dropdown shows only allowed targets; safety banner says "Some routes hidden due to role."
- **Bulk route with mixed customers/sources**: Confirm dialog "Route 5 requests across 3 customers? Each becomes its own draft work item in target lane."
- **Connector request with unresolved item fragment** (e.g., "strawberry stuff"): Routed as draft line with `unresolvedSourceText` set; downstream lane shows `needs_resolution` row state.

### 16.9 Drawer state

- **Drawer state `expanded` on a route, then operator changes active entity**: Drawer pivots tab to the new entity's default tab; state (width) preserved.
- **Drawer state `max` then operator hits `Esc`**: Drawer closes; grid restored; routeHistory entry created.
- **Drawer tabs available list changes (e.g., new tab added in a phase)**: If the persisted `activeTab` no longer exists, fall back to `defaultTab`.

### 16.10 Focus mode

- **Focus on a non-grid panel (e.g., Quick Ledger)**: Same rule — Keel + Identity ribbon + drawer survive; sibling Zone D panels collapse.
- **Focus mode while drawer is `max`**: Resolved by the more-recent state — focus enter while max → max overrides; entering focus with peek → focus expands the work area within peek.

---

## 17. Telemetry

Frontend emits client events via existing Socket.io connection or a thin `emitTelemetry({ event, payload })` helper (added in Phase 0). Events feed the same JSONL journal that powers command audit.

Key events:

| Event | When | Payload |
| --- | --- | --- |
| `ui.canvas.flag.flipped` | Feature flag changes at boot | flag name, value |
| `ui.drawer.state` | Drawer state changes | view, entityType, fromState, toState |
| `ui.drawer.tab` | Drawer tab switch | view, entityType, fromTab, toTab |
| `ui.finder.opened` | `⌘⇧F` overlay opens | sourceView, customerContextPresent |
| `ui.finder.added` | Row added from Finder | batchId, sourceMode |
| `ui.selection.primary.committed` | `⌘↵` or primary click | view, entityType, status, commandName |
| `ui.selection.tray.opened` | More tray expand | view, entityType, optionsCount |
| `ui.routehistory.back` | `⌘←` used | fromView, toView |
| `ui.focusmode.entered` | `F` or button | view, panelId |
| `ui.below-floor.dismissed` | Operator dismisses below-floor pill | customerId, perCustomerSettingFlipped |

Purpose: drive a follow-up density/ease audit (see `docs/ease-of-use-frontend-pass.md` lineage) with real data, not assumptions.

---

## 18. Decisions Log

| Decision | Made | Source |
| --- | --- | --- |
| Wedge: Calm density + selection-first per screen (not entity-IA, not shell-modes, not top-5-only) | 2026-05-11 | User · brainstorm Q1 |
| Wireframe coverage: 9 deep + 4 sketch | 2026-05-11 | User · brainstorm Q2 |
| Vendor Workspace as panel inside Vendor Payouts (not new route) | 2026-05-11 | Author decision after wedge lock |
| Nav grouping: 5 muted dividers, no IA collapse | 2026-05-11 | Author decision · brainstorm Section 1 |
| Quick Start chips become Keel chips, all inline forms killed | 2026-05-11 | User · brainstorm Section 2 v2 |
| `QuickStartBar.tsx` deleted (not kept as shrunken chip-row) | 2026-05-11 | Author best-judgment after user "go with your best judgment" |
| `OperationsViews.tsx` split into per-route files | 2026-05-11 | Author best-judgment after user "go with your best judgment" |
| Below-floor pricing: warning only, dismissible — no refusal, no Manager+ override | 2026-05-11 | User direct |
| Reports as dedicated route under Decide group (not drawer-distributed) | 2026-05-11 | User direct |
| Drawer states extended to 5 (closed/peek/expanded/full/max) — `max` added | 2026-05-11 | User direct on batch 1 review |
| Add-signal: green tint + `+1 ✓` chip → "in draft" fade | 2026-05-11 | User direct on batch 2 review |
| PO Lines drawer tab is editable (the documented read-only exception) | 2026-05-11 | Author best-judgment after user "go with your best judgment" |
| Connectors `routeTo` + `operatorNotes` become inline columns (not strip controls) | 2026-05-11 | Author best-judgment after user "go with your best judgment" |
| Closeout period treated as entity (identity ribbon activates on selection) | 2026-05-11 | Author best-judgment after user "go with your best judgment" |
| Recovery default = command grid; tools (Find/Replace, Backup, Markers, etc.) live in drawer queue-state tabs | 2026-05-11 | Author best-judgment after user "go with your best judgment" |
| Fulfillment pack-line inputs become inline cells per line | 2026-05-11 | Author best-judgment after user "go with your best judgment" |
| Reports: 7 reports, chip-row picker, no sub-nav | 2026-05-11 | Author best-judgment after user "go with your best judgment" |
| Today focus: 3 ranked actions (procurement/money/fulfillment) — iterable later | 2026-05-11 | User direct |
| Pricing-rule projection on Sales lines: thin additive query if needed; flagged as only possible backend touch | 2026-05-11 | Author after user-flagged concern about losing functionality |

Open / parking-lot items for future passes (not in scope):

- **Mobile pick-pack UI** beyond Connectors review — defer until warehouse demand surfaces.
- **AG Grid density toggle** (compact/comfortable per-user) — defer; current compact density is the right default.
- **Marker review queue in a dedicated route** — currently a drawer tab inside Recovery; promote to its own surface if vocabulary review becomes a recurring admin task.
- **Customer / Vendor workspace as standalone routes** — option B wedge, rejected this pass; revisit if drawer pattern hits limits.
- **Real-time dashboard charts** beyond mini bar chart on Reports — GAP-027 deferred.
- **Excel export format** — CSV export already shipped; xlsx variant only if customer-facing demand exists.
- **Pricing-rule deeper logic** (volume tiers · time-based promo · vendor carve-outs) — out of scope; current direction supports tier + floor + ceiling + clearance flag only.

---

## 19. Integration Discipline — how to build new frontend so it doesn't feel bolted on

The TERP Agro app already has a strong, consistent shape. Every new component, hotkey, label, color, and pattern must extend that shape — never contradict it. The discipline below makes the redesign feel **continuous with what's already shipped** rather than a parallel app duct-taped on top.

### 20.1 Visual coherence

- **Tailwind tokens only.** Use the project's custom palette (`amber`, `ink`, `line`, `panel`, `zinc`) and standard Tailwind utility classes. **Do not introduce new color tokens** without adding them to `tailwind.config.ts` and the §13 list; existing `amber-*` aliasing is brittle (per `paradigm-pass-drift-ledger.md` — `amber-300` was invalid and required cleanup), so test every new amber/green/red usage on a real build before merging.
- **Square corners, 1px borders, `border-line`.** No `rounded-*` utilities anywhere unless an existing component already uses them. No `border-2`, no shadows except the command palette / overlay backdrop / drawer-pinned modal.
- **System font stack.** No new font imports. Headings use `text-base`/`text-sm` font-weight 600. Monospace is `ui-monospace, SFMono-Regular`.
- **Iconography**: `lucide-react` only. If a needed icon isn't in Lucide, fall back to a text label or `data-testid`-bearing span — do not add a new icon library or inline SVGs.
- **Status pill family extends, never replaces.** Reuse `StatusPill.tsx`. If a new tone is needed (e.g., `partial`, `routed`, `locked`), add it to the same component's tone enum + matching Tailwind classes. Do not roll a new pill component.
- **Density matches existing.** Row height, header padding, gridline thickness, font sizes all match the current AG Grid Quartz theme + the existing `.grid-shell` CSS. Don't introduce a separate density mode.

### 20.2 Component composition

- **`WorkspacePanel` for any sectioning** that needs a title + collapse + focus. Don't roll new panel chrome.
- **`OperatorGrid` for any grid.** Never use `AgGridReact` directly in a view — it skips the band swap, selection summary, history/relationship/issue drawer wiring, and CSV export. New columns belong in the view's `ColDef[]` passed to `OperatorGrid`.
- **`EmptyState` for empty states.** One line, one CTA.
- **`StatusPill` for any status badge.** No raw `<span class="…">`.
- **`KpiCard` shape for any KPI rendering.** Reports' mini-chart cards reuse the same component shell.
- **`useCommandRunner` for every command commit.** It handles toast, audit logging, error rendering, idempotency. Don't call `trpc.commands.run.useMutation` directly from a view.

### 20.3 State management

- **Zustand + immer + persist** is the only client state mechanism. No React context for new state. No `useReducer` for cross-component state.
- **`uiStore` selectors via `useUiStore((s) => s.field)`** — never `useUiStore.getState()` outside of one-shot handlers, and never destructure the whole store.
- **Persisted keys via `partialize`.** Only add keys you want surviving reload; ephemeral state (e.g., `commandPaletteOpen`) stays unpersisted.
- **Per-route × entity state pattern.** Read from `drawerByView[view]` rather than a global `currentDrawerState`. This is how the drawer remembers Rich Star's drawer was last in `expanded` on Sales.
- **Don't reach into TanStack Query cache directly** for state purposes. If a piece of derived state needs to live somewhere, put it in `uiStore`.

### 20.4 Data flow

- **All reads via `trpc.queries.*.useQuery`.** No `fetch()` calls. No `useEffect` for data loading.
- **All writes via `useCommandRunner`.** The mutation layer handles toast/journal/audit; bypassing it loses telemetry and recovery.
- **Don't add tRPC procedures.** Existing `queries.*` list in §4.7 covers every drawer tab. If a new drawer tab needs a tighter projection, prefer a client-side `useMemo` over a new procedure; flag any genuine new-query need as a deviation from spec.
- **Socket.io `command:completed` / `command:failed`** already triggers query invalidation in `App.tsx`. Don't add other invalidation paths or polling loops.

### 20.5 Routing & navigation

- **No React Router.** Navigation is `uiStore.setActiveView(view)` + optional `setSelectedRows(view, [{ id }])`.
- **Deep links** within the SPA are explicit calls to those store actions — no URL params. (URL state is out of scope per non-goals.)
- **`⌘← back`** uses the new `routeHistory` stack in `uiStore`. Always `pushRouteHistory` before changing `activeView`. Always `popRouteHistory` when handling `⌘←` or the back button.
- **Route changes auto-align Quick Start chip** via existing `launchForView` helper in `uiStore.ts`. Don't add per-view chip-syncing logic.

### 20.6 Keyboard model

- **All hotkeys registered in `Hotkeys.tsx`** — single registry. Don't add `useEffect(() => { window.addEventListener('keydown', …) })` in other components.
- **Descending-scope `Esc` semantic must be respected.** Order: close drawer → close palette → exit focus mode → clear selection. If a new component introduces a modal/overlay/sub-state, it inserts itself at the appropriate place in the descending order — never reorders.
- **Don't reuse existing chords** for new actions. Reserved: `⌘1..⌘6` (nav), `⌘K` (palette), `⌘⇧F` (Finder overlay), `⌘D` (duplicate), `⌘↵` (primary), `]`/`⇧]` (drawer), `/` (grid filter), `Esc` (descending close), `F` (focus toggle).
- **macOS-first.** Hotkeys use `⌘` (Cmd). Win/Linux equivalent uses Ctrl; existing harness handles both. Don't add OS-conditional logic.

### 20.7 Copy & vocabulary

- **Preserve operator vocabulary as the canonical labels:**
  - `Files` = cash on hand.
  - `Available Files` = on hand minus scheduled payables.
  - `Inv Posted`, `Pay/F-up`, `Packed` for the three closeout checks.
  - `OFC` / `ofc` (office-owned) preserved verbatim in markers.
  - `25 flex` (price range) preserved in notes/range columns.
  - `Buyer credit` for negative money-in.
  - `Receive Inventory` not "Receive Goods".
  - `New PO` not "Create Purchase Order".
  - `Allocate FIFO` not "Apply First-In-First-Out".
- **Don't sanitize legacy markers.** They stay as raw text in `legacyMarker` / `legacyStatusMarkers` columns. Normalized fields are *adjacent*, never *replace*.
- **Don't introduce ERP jargon.** No "GL entry", "AR aging report", "trial balance". The operator language wins.
- **Plain-language errors.** "Choose a vendor bill before paying out." — not "ValidationError: vendorBillId is required". Plain-language pre-built in command catalog already; don't re-template.

### 20.8 File structure

```
src/
  client/
    api/                     # tRPC client wiring (don't add files here)
    components/
      drawerTabs/            # all new drawer tab modules
      ContextDrawer.tsx
      IdentityRibbon.tsx
      InventoryFinder.tsx
      InventoryFinderOverlay.tsx
      *.tsx                  # other shared components
    views/
      _grid-journey.tsx      # shared util (underscore prefix = not a route)
      DashboardView.tsx
      IntakeView.tsx
      SalesView.tsx
      ReportsView.tsx
      *.tsx                  # one file per route
    store/
      uiStore.ts             # one store, all UI state
    flags.ts                 # new in Phase 0; reads import.meta.env
    index.css                # CSS classes + tokens
  shared/
    types.ts                 # shared TypeScript types
    schemas.ts               # tRPC + Zod schemas
    commandCatalog.ts        # canonical command list
  server/
    …                        # no changes in this pass
```

- **No `index.ts` barrel files.** Import directly: `import { ContextDrawer } from '../components/ContextDrawer'`.
- **One component per file.** Inline subcomponents are OK if scoped to that file's main export and <40 lines.
- **No co-located styles.** All CSS is in `index.css` (or Tailwind classes). No CSS modules, no styled-components.

### 20.9 TypeScript

- **Strict mode on (already configured).** Don't suppress errors with `@ts-ignore` / `@ts-expect-error` — fix the type.
- **Shared types in `src/shared/types.ts`.** Component-local types in the component file. Don't add a third location.
- **Prop interfaces** declared inline above the component, exported only if used externally.
- **No `any`.** Use `unknown` if the type is genuinely unknowable; narrow before use.
- **`as const` for enum-like string literals.** Don't add a `*Enum` object pattern.
- **Use the existing `GridRow` shape** for grid row types. Per-view extensions via interface extension, never inline `as { … }`.

### 20.10 Testing

- **Playwright for E2E.** Tests in `tests/e2e/`. Follow existing harness patterns.
- **`data-testid` over ARIA labels** for selectors. ARIA labels are for accessibility; testids are for tests. The two roles are not the same — don't repurpose either.
- **Each new component adds its `data-testid` set (see §14).** New testids follow the pattern `<surface>-<element>[-<id>]`.
- **No component-unit tests in scope.** TERP Agro's testing stance is "E2E + contract tests + typecheck + parity"; the operator console doesn't have a Jest/Vitest layer for component tests, and adding one is out of scope.
- **Adversarial command-contract tests** stay green throughout: `tests/e2e/adversarial-command-contracts.spec.ts`.

### 20.11 Performance

- **500-row grids are the bar.** AG Grid handles this fine with virtualization. New columns + cell renderers must not break virtualization (no per-row React effects, no per-row tRPC calls).
- **Drawer tab content lazy-loads** via the query hook's `enabled` flag — don't fetch until the tab is active. Multiple tabs in the drawer means multiple `useQuery` hooks; each gated.
- **Quick Ledger row commits** are independent — committing row 3 doesn't refetch rows 1, 2, 4. Done today; preserve.
- **Add-signal animation** uses CSS `transition` not React state churn. The chip swap (`+1 ✓` → "in draft") uses `setTimeout` once, then the row's status update via socket invalidation handles the rest.

### 20.12 Accessibility

- **Keyboard reachability** for every action. If you add an inline cell, ensure tab order is correct.
- **ARIA roles** for new components: `role="dialog"` on overlay, `role="tab"` / `role="tablist"` on drawer tabs, `role="status"` for the live-region announcements (already present via `uiStore.announcement`).
- **Focus management** on overlay open/close: open trap focus inside; close return focus to the trigger.
- **`prefers-reduced-motion`** disables drawer/state animations to 0ms.
- **Color contrast** ≥ 4.5:1 for text on backgrounds; ≥ 3:1 for status pills against pill backgrounds. Verify the new tones in §2.10 against the Tailwind palette.

### 20.13 Don'ts (no-go patterns)

| Pattern | Why it breaks integration |
| --- | --- |
| Modal wizards for routine work | Violates row-native paradigm |
| Decorative animations / hover effects | Operator console is calm utility, not a marketing site |
| Visible JSON payloads in default UI | Power user surface; behind `⌘⌥K` only |
| Icon-only buttons without tooltips | Operator scanning requires labels |
| New third-party libraries | Already at React 18 / AG Grid / Lucide / Tailwind / Zustand / TanStack — that's the stack |
| New font imports | System stack only |
| New routing library | `uiStore.activeView` is the route |
| Per-component CSS-in-JS | `index.css` + Tailwind only |
| Background work / polling | Socket.io invalidation is the mechanism |
| New auth middleware on the client | Session cookie + existing tRPC interceptor |
| Customer-facing UI in this app | Internal operator console only; customer-safe outputs are exports, not surfaces |

### 20.14 Integration smoke test (per phase)

Before merging each phase's PR:

1. `pnpm typecheck` — zero errors.
2. `pnpm build` — zero errors. Bundle size diff < 5% per phase (Phase 1 likely +10% due to many drawer tabs; phase 6 adds Reports view which is +3%; budget accordingly).
3. `pnpm audit:parity` — backend/frontend parity green (63 user-surfaceable commands, 1 internal command, 28 queries, +1 if Phase 1 needs the pricing projection).
4. `pnpm db:seed && pnpm test:e2e` — all green (existing + new tests).
5. **Visual diff against the wireframe.** Open the phase's wireframe HTML side-by-side with the dev server; confirm layout, density, color match. Discrepancies trigger spec re-review, not silent drift.
6. **Vocabulary check.** Grep new view source for forbidden words (`GL`, `AR aging`, `Trial balance`, `Customer ID:`, "Create Purchase Order" instead of "New PO"). None should appear.
7. **Keyboard sweep.** Tab through the surface; verify focus order; hit each registered hotkey; verify nothing hijacks `Esc`.

---

## 21. Adversarial Review — Findings & Resolutions

Five adversarial reviews were run against the spec + wireframes on 2026-05-11 (code review, brokerage-fit, evidence audit, closure audit, design critique). 80+ distinct issues were identified. This section catalogues every issue, the resolution applied, and what remains explicit-open. **Where this section conflicts with earlier sections, this section wins.**

### 21.1 P0 — runtime-blocking issues (resolved inline)

| # | Issue | Resolution |
| --- | --- | --- |
| P0-01 | Spec referenced `queries.relationshipDrawer` 21+ times; actual endpoint is `queries.relationshipSummary`. | All references corrected via global rename. Phase 0 pre-flight: `grep -r relationshipDrawer src/` must return zero. |
| P0-02 | `drawerByView` keyed only by `ViewKey` but spec promised per-route × entity persistence. | **Key shape changed** to `Record<\`${view}:${entityType}:${entityId}\`, DrawerState>`. Queue-state uses literal `${view}:queue`. `DrawerState` no longer carries `entityType`/`entityId` (those are in the key). |
| P0-03 | `routeHistory` persisted via `partialize` leaks entity IDs across users on shared kiosks. | **`routeHistory` is session-only**. `drawerByView` and `savedReportViews` remain persisted. |
| P0-04 | `queries.grid` does not accept entity-scoping params (`{ vendorId }`, `{ billId }`, `{ poId }`, `{ pickId }`). | Drawer tabs use `queries.grid({ view })` + **client-side filter** by entity id. No backend query changes. |
| P0-05 | `BatchMovementTab` was pointed at `queries.relationshipSummary`; movement data lives in `queries.inventoryMovements({ batchId })`. | BatchMovementTab corrected to `queries.inventoryMovements({ batchId })`. |
| P0-06 | HistoryTab references `queries.recoverySearch({ q: entityId })`; direct path is `queries.relatedCommands({ entityId })`. | History tab uses `queries.relatedCommands({ entityId })`. `recoverySearch` reserved for free-text search in Recovery. |
| P0-07 | Fulfillment status table (§10.7) used `in_pack` and `labeled` — not in `Status` union. | Corrected cascade uses existing statuses: pick flows `draft → confirmed → fulfilled`; per-line `packing` / `packed` derived client-side from `fulfillment_lines.status` aggregation. **No new statuses added.** |
| P0-08 | `ViewKey` union does not include `'reports'`. | **Phase 0 adds `'reports'` to `ViewKey`** in `src/shared/types.ts`. One-line change, blocks Phase 6 if omitted. |
| P0-09 | `⌘↵` already statically wired in `Hotkeys.tsx`; new universal handler would double-dispatch. | **Phase 0 removes existing `⌘↵` handlers** from `Hotkeys.tsx`. Dispatch via active view's `SelectionSummary.primaryAction.command()`. |
| P0-10 | `]` / `⇧]` not physical keys on AZERTY / QWERTZ. | **Listener uses `event.code === 'BracketRight'`** (physical), not `event.key`. Drawer-nub label localizes via a constant. |
| P0-11 | Vendor performance report cannot aggregate from `queries.grid({ view: 'vendors' })` alone. | **Joins `queries.grid({ view: 'purchaseOrders' })` + `queries.grid({ view: 'intake' })`** client-side, last 90 days. If data volume becomes an issue, add a tightly-scoped `queries.vendorPerformance` projection — second flagged backend touchpoint. |
| P0-12 | `salesSuggestions` returns whole catalog for tag-less customers. | **Phase 1 adds client-side minimum-relevance filter.** Tag-less + zero recent purchases → empty state, not full catalog. |
| P0-13 | `OperationsViews.tsx` re-export shim — no documented schedule per phase boundary. | **§21.5 re-export schedule** added with explicit list per phase. |
| P0-14 | `ContextDrawerProps.renderTab` was an escape hatch defeating §12 contracts. | **`renderTab` removed.** Tabs registered in `src/client/components/drawerTabs/registry.ts` keyed by `${entityType}:${tabKey}`; `ContextDrawer` resolves from registry. |
| P0-15 | `OperatorGrid` `preSelectionStrip` prop missing from existing call sites. | **Required prop** when the view has pre-selection affordances; missing it is a build-time type error. |

### 21.2 P1 — design / workflow issues (resolved with spec changes)

| # | Issue | Resolution |
| --- | --- | --- |
| P1-01 | `VendorToolsTab` was a 2nd write surface in drawer — undocumented exception. | **VendorToolsTab is moved out of the drawer.** Manual bill creation → pre-selection strip of Vendor Payouts as an inline form. Payout void → row-action on selected payout in `BillPayoutsTab` (read-only tab; void is a row-action with confirmation, not a tab-level edit). **PO Lines remains the sole editable drawer exception.** |
| P1-02 | Customer workspace as 9 drawer tabs vs. monolithic panel may be slower. | **Phase 1 ships 3 task-completion benchmarks vs. the old panel.** Three scenarios (balance + recent before adding line; compose customer offer; view dispute history while building). Playwright timing assertion: each ≤2× old panel time. If exceeded, Phase 1 doesn't ship — hybrid fallback (Balance + Recent stay in slim panel; rest in drawer tabs). |
| P1-03 | Quick Ledger rows commit immediately — no draft state. | **Quick Ledger rows now have a `draft` state.** Persists in `uiStore.ledgerDrafts` (new persisted field) until ✓ commit. Drafts survive reload. Visual: amber left-border like Intake drafts. Aligns with row-as-working-memory paradigm (MR-001 / TA-001). |
| P1-04 | Receipt preview silently allows mixed-vendor selections. | **Mixed-vendor/date selections block Post.** Selection-strip primary label flips to `Resolve conflicts (N)` with amber tone; explicit "Mixed receipt — confirm" tray action required to proceed. Warning + gate, not warning alone — money safety. |
| P1-05 | Intake grid missing `Arrival` column (MR-025). | **`Arrival` column added** between `Avail` and `Owner`. 3-state cell: `—` / `arrived` / `canceled`. Backed by existing `arrival_status` field (TA-002). |
| P1-06 | Inventory Finder missing the "25 flex" price range note that's in Intake. | **Finder result table gains `Range / note` column** (compact, truncated, hover for full). Same data already exposed via `queries.reference.availableBatches`. |
| P1-07 | Below-floor dismissals have no audit trail. | **Each dismissal writes an audited annotation** to `command_journal` with type `ui.below_floor.dismissed` (actor, customerId, lineId, floor, actual price). Customer drawer Pricing tab surfaces the log. Stays warning-only at commit time per §1.5 — but trail exists. |
| P1-08 | Connectors safety banner only visible on selection strip — invisible during queue review. | **Banner moves to grid header bar on Connectors route**, persistent above the grid. 11px, amber-on-white. |
| P1-09 | Closeout unsafe rows require 2 clicks to see specifics. | **Unsafe row list inline-expands on Closeout canvas** when count > 0. Up to 10 rows shown with lane + reason + jump-link. Drawer tab remains for deep inspection. |
| P1-10 | Sales activated customer doesn't auto-create draft order. | **Activating a customer auto-creates a draft sales order** (if no existing today). Line grid auto-focused on empty first line. AC-01 timing achievable. |
| P1-11 | Client Ledger has no wireframe for dual-role customer/vendor (JY-07). | **W29 added** — `Relationship` tab promotes to top-level when counterparty is both customer and vendor. Combined AR + AP + net exposure. No backend; client-side join. |
| P1-12 | `routeHistory` `⌘←` from Orders → Sales doesn't guarantee landing in correct edit state. | **`⌘←` supplemented by explicit "Edit in Sales" button** on `OrderLinesTab`. Direct route + entity activation, not history-stack walking. |
| P1-13 | Recovery primary path from Orders breaks row-as-working-memory. | **Row-level reversal preview lives inline in History drawer tab** (any view). Tab shows last 5 commands + per-command reversal preview button. Operator never has to leave the row. Recovery route stays for bulk admin. |
| P1-14 | Today focus on Dashboard is opaque. | **Renamed to "Pinned for today"** — owner-pinned items in a manual list. System-suggested pins shown as ghost-state ("System suggests: 5 POs aging — Pin"). Operator controls ranking; telemetry tracks dismissed suggestions. |
| P1-15 | "Soak 5 business days" had no exit criteria. | **Hardened.** Soak requires: zero new JS errors in production logs AND primary-commit failure rate <1% above pre-phase baseline. Named monitor: the engineer who shipped the phase. Rollback trigger explicit. |
| P1-16 | Verification Checklist §8 has no named executor or audit script. | **Phase 0 ships `pnpm audit:stubs`** — grep for `TODO` / `placeholder` / `coming soon` / `NYI` / `stub` / `@ts-expect-error` across new files. CI runs it. Per-phase auditor: reviewer who is NOT the PR author. |

### 21.3 P2 — visual / interaction refinements (applied)

| # | Issue | Resolution |
| --- | --- | --- |
| P2-01 | Identity ribbon too quiet — name disappears into chrome. | **Ribbon: 32px tall, `bg-white`, 2px amber left-border.** Category label-tag dropped. Bold name leads visually. |
| P2-02 | 5 drawer states — `max` redundant with `full`. | **Keeping 5 states** per user's explicit batch-1 request. Differentiation now sharp: `full` shows compressed grid as thin sidebar (40%); `max` hides grid entirely. Two zoom levels. Designer concern noted as OPEN-01. |
| P2-03 | Status pill palette has 6+ colorways across 8 statuses; amber overloaded. | **Consolidated to 4 tones + red:** amber (pending/draft/ready/open); indigo (confirmed/approved/scheduled/in-flight); green (posted/paid/received/fulfilled/terminal-good); grey (cancelled/archived/locked/terminal-closed); red (failed/rejected). Sub-states (e.g., `partial`) distinguished by **italic label, not new hue**. |
| P2-04 | Add-signal is two coats (flash + chip + "in draft" copy). | **Reduced to single 280ms flash.** No chip, no "in draft" text. Status column already shows `draft`. |
| P2-05 | Keel chips look identical to SideNav items. | **Outline-only chips with leading Lucide icon.** `ShoppingCart` (Sale), `PackagePlus` (Receive), `ArrowDown` ($ In), `ArrowUp` ($ Out), `ClipboardList` (Purchase). Hover tooltip. Active chip = amber underline. |
| P2-06 | `More ▾` tray hides verbs used 60% of the time. | **Closeout toggles (Packed / Inv Posted / Pay-F/up) pin as inline buttons** in selection strip when status = `posted` and toggle unset. Tray reserved for rare verbs (Cancel, Reverse). |
| P2-07 | 25-col Intake grid sub-header band is decorative. | **Band removed.** Replaced with 1px vertical lines at group boundaries in the existing header row. Saves 9px. `Item · shorthand` promoted to fixed `min-width: 200px`. `Status` pinned right. |
| P2-08 | Below-floor pill breaks 70px Price column. | **Pill moved to dedicated 22px `⚠` column** between Price and Cost. Amber dot when below floor. Hover shows `↓ $5 below floor $85`. |
| P2-09 | Tab overflow `···` in peek hides critical tabs. | **In peek: show only active tab name + `1/9 ›` pagination.** `←/→` or `1..9` cycles. Full tab row only in expanded+. |
| P2-10 | PO Lines editable tab has no visual differentiation. | **Editable drawer tabs have `✏ Lines` icon prefix.** Active tab background `bg-amber-50/30`. Cell borders visible only on editable tabs. |
| P2-11 | Inventory Finder's 3 entry points have inconsistent layouts. | **One layout, three frames.** Embed mode hides slice chips. Standalone and overlay visually identical except outer chrome. |
| P2-12 | Vendor Payouts `Due reason` column wraps unpredictably. | **Vendor column = fixed 140px**, Due reason gets remaining 1fr space. `line-clamp: 1` with ellipsis; hover shows full. Uniform row height. |
| P2-13 | Reports mini bar chart ornamental — no values. | **Bars get value labels on top** + Y-axis baseline + high/low markers. Now informative. |
| P2-14 | Focus mode keyboard hint buried. | **First-entry-per-session toast**: `Focus mode — ] peek · ⇧] cycle · Esc exit`. Dismissible. After dismissal, hint moves to a 12px line below identity ribbon. |
| P2-15 | Empty / loading / error states not wireframed; error banner color conflicts with warning. | **Error banner uses red** (`#991b1b` border, `#fee2e2` bg) — never amber. Loading: AG Grid overlay + 4px amber top-border on strip. Empty: `EmptyState` with one CTA per view. **W30 / W31 / W32 sketched in §21.6.** |
| P2-16 | "Next action" column duplicates Status pill. | **Next action column removed.** Status pill expanded to 110px, hover-chevron `›` shows next action on hover. |
| P2-17 | `Batch` vocabulary leaks into drawer tab catalog. | **Renamed**: "Batch / Inventory row" → "Lot / inventory row". Backend identifier `batch` unchanged. Intake column header keeps "Batch" because it's the code-identifier label (legacy operator memory). |

### 21.4 Issues acknowledged but not resolved (with rationale)

| # | Issue | Rationale |
| --- | --- | --- |
| OPEN-01 | 5 drawer states (P2-02). | User explicitly requested `max`. Honoring user intent over designer recommendation. |
| OPEN-02 | Customer workspace as 9 drawer tabs (P1-02). | Wedge Option B (customer route) was rejected by user. Phase 1 ships timing benchmarks as the regression-detection mechanism with hybrid fallback if needed. |
| OPEN-03 | Reports as dedicated lane (vs. drawer-distributed). | User explicit request. |
| OPEN-04 | Below-floor as warning-only (no Manager+ gate). | User explicit choice — flat org. Audit annotation per P1-07 mitigates the trust gap. |
| OPEN-05 | "Soak 5 business days" with <1% commit failure threshold. | Initial guess; recalibrate after Phase 0 baseline emerges. |
| OPEN-06 | Mobile redesign, dark mode, design-system extraction. | Explicitly out of scope (§9). |
| OPEN-07 | Reports math correctness tests not in Phase 6. | Added in §21.7 as AC-12, with seeded-fixture math assertions. |
| OPEN-08 | Cross-route entity conflict (same customer in Sales + Client Ledger + Orders). | Resolved by composite drawer key per P0-02 — each route stores its own drawer state for the same customer. |

### 21.5 `OperationsViews.tsx` re-export schedule per phase

| Phase | Split out (own file) | Still re-exported from `OperationsViews.tsx` |
| --- | --- | --- |
| End of Phase 1 | (none yet) | All 10 |
| End of Phase 2 | PurchaseOrdersView · InventoryView | OrdersView · PaymentsView · ClientLedgerView · VendorPayablesView · FulfillmentView · ConnectorsView · RecoveryView · CloseoutView |
| End of Phase 3 | + PaymentsView · VendorPayablesView | OrdersView · ClientLedgerView · FulfillmentView · ConnectorsView · RecoveryView · CloseoutView |
| End of Phase 4 | + OrdersView · FulfillmentView · ConnectorsView · ClientLedgerView | RecoveryView · CloseoutView |
| End of Phase 5 | + RecoveryView · CloseoutView | (none — `OperationsViews.tsx` deleted) |

`App.tsx` imports continue to work uninterrupted.

### 21.6 New wireframe stubs (W29 — W32, sketch fidelity)

- **W29 — Client Ledger · dual-role counterparty.** When a contact is both customer and vendor: drawer `Relationship` tab promotes to top-level. Shows AR balance, AP balance, net exposure, last 5 orders (AR side), last 5 bills (AP side), 90-day payment cadence. Primary: "Open in Sales" or "Open in Vendor Payouts" depending on context.
- **W30 — Empty state (Orders canonical).** Grid renders 0 rows. `EmptyState` centered: "No orders yet today." with single CTA `+ New Order` (routes to Sales).
- **W31 — Loading state (Sales line grid canonical).** AG Grid loading overlay. Selection strip 50% opacity. 4px amber top-border on strip area = "in-flight."
- **W32 — Error state (any grid).** Red bordered banner above grid: `[Connection error — retry?]` with `Retry` button that re-runs the underlying tRPC query.

### 21.7 New ACs (closes the surface-coverage gap)

- **AC-11 Connectors safety + routing.** Open a pending connector request. Verify safety banner persistent on grid header. Set `routeTo: 'sales'` inline. Press `⌘↵`. Verify: command journaled with `routedTo`; target lane shows new draft work; original ledger state unchanged.
- **AC-12 Reports render + route-out + math.** Open Reports → Revenue. Verify default groups. Click a row. Verify drawer opens with `Definition` tab; primary `Open client card` routes correctly. Verify math: seeded fixture (3 orders on 3 dates for 2 customers) assert exact row totals.
- **AC-13 Fulfillment inline pack.** Select a pick. Verify pack inputs inline in fulfillment-line grid. Pack all lines; verify cascade `draft → packing → packed`. Primary `Print labels` → `fulfilled`.
- **AC-14 Client Ledger dual-role.** Counterparty as both customer + vendor. Open in Client Ledger; verify `Relationship` tab top-level. AR + AP + net exposure render non-zero.
- **AC-15 Quick Ledger draft state.** Begin a money-in row. Fill 2 of 4 required fields. Reload. Draft row restored with partial data + `draft` state. Complete and commit; transitions to `posted`.

### 21.8 Spec-wide cleanup applied

- **§18 Decisions Log** augmented with **rationale + reversibility** per author-judgment entry. E.g., `QuickStartBar` deletion → alternative: keep as shrunken chip-row. Rationale: file deletion cleaner; no logic to preserve. Reversibility: restore from `git show 2392db8^:src/client/components/QuickStartBar.tsx`.
- **Phase 0 split into Phase 0a + Phase 0b.** Phase 0a: WorkspacePanel + CommandPalette + Hotkeys (no flag, backend-touch-free). Phase 0b: Kill QuickStartBar + Keel chips behind `flag.canvas-grammar-v2`. Independent rollback.
- **Phase 7 narrowed** to true cosmetic polish. Drawer state persistence verification moved into each phase's own gate.
- **AC-01 timing claims** (`<3s, <4 keystrokes`) downgraded to **non-binding targets** in AC text; Playwright asserts state, not timing. Perf benchmarks live in `tests/perf/` (new directory) and are advisory.

### 21.9 Phase 0 pre-flight checklist (mandatory before any phase ships)

1. `grep -r 'relationshipDrawer' src/` returns zero matches.
2. `'reports'` added to `ViewKey` union in `src/shared/types.ts`.
3. `'arrival_status'` confirmed present in batches schema.
4. `customers.pricingStrategy` projection on `queries.salesOrderLines` verified or thin additive added (one flagged backend touchpoint).
5. `uiStore.drawerByView` keyed by composite `${view}:${entityType}:${entityId}`.
6. `routeHistory` NOT in `partialize`.
7. `pnpm audit:stubs` script lands and runs in CI.
8. `data-testid` constants list (§14) added to `src/client/test-ids.ts` for stable selectors.
9. Existing `⌘↵` static handlers in `Hotkeys.tsx` removed; dispatch via SelectionSummary.
10. Keel chip `event.code === 'BracketRight'` handling verified on non-US layout (manual test).

---

## 22. Replication Playbook — extending the design beyond the wireframes

The wireframes (W1-W32) pin canonical states for the 14 surfaces. Many features that ship in the months and years following this design pass will NOT have an explicit wireframe — they'll be variations, additions, or new entities. To ensure these integrations are coherent with the spec rather than bolted on, the dedicated **replication playbook** at `docs/design/replication-playbook.md` carries:

- **A 9-step decision framework** to run every new feature through before coding.
- **16 recipes (R1-R16)** for the most common feature types: new drawer tab, new grid column, new status pill tone, new action verb, new hotkey, new view/route, new report, new entity type, new filter chip / saved slice, new export format, new error/empty/loading states, new cross-entity workflow, new telemetry event, new keyboard semantic, new role / permission level, new connector source type.
- **Aesthetic and vocabulary rules** that don't fit a single recipe (operator vocabulary always wins; calm utility over delight; status pill / identity ribbon / drawer tab role separation; time formatting; dollar formatting; action verb tense).
- **Anti-patterns** (with rationale) that must never be introduced.
- **A 10-item smoke test** to run before any new feature merges.
- **The four-question replication compass** to apply before any new pixel ships.

**This playbook is mandatory reading for every implementing agent.** Anything not explicitly covered in the spec or wireframes must be run through the playbook. Implementers must cite the recipe used (or document why no recipe applied) in their PR body.

The playbook is a living document — as new patterns earn their place during implementation, append recipes via follow-up PRs. Existing recipes don't get deleted; they preserve decision rationale.

---

## 20. References

### Source artifacts consumed

- `docs/recording-paradigm-master-ui-ux-recommendations.md` — MR-001..MR-052 master list.
- `docs/paradigm-pass-drift-ledger.md` — TA-001..TA-048 shipped state.
- `docs/opus-recording-paradigm-ui-ux-review.md` — earlier Opus second-pass review.
- `docs/persona-journey-frontend-fit-audit.md` — JY-01..JY-20 journey scoring.
- `docs/ease-of-use-frontend-pass.md` — pre/post density measurements.
- `docs/frontend-interaction-surface-audit.md` — FE-START / FE-FINDER / FE-SHEET requirement matrix.
- `docs/workflow-gap-audit.md` — J01-J10 implementation coverage.
- `docs/purchase-order-completion-report.md` — current PO state.
- `docs/unactioned-findings-atomic-proposal.md` — UF-001+ residual finding set.
- TERP Numbers Master Manifest (provided in-conversation) — cockpit tables (20), commands (~50), contracts (13), hotkeys (21), scenarios (S01-S20), 67-task audit, 28 operational gaps, journeys J01-J16.

### Companion artifacts

- `docs/design/wireframes/01-diagnosis.html` (Section 1 visual)
- `docs/design/wireframes/02-canvas-grammar.html` and `02-canvas-grammar-v2.html` (Section 2)
- `docs/design/wireframes/03-components.html` (Section 4)
- `docs/design/wireframes/035-coverage-map.html` (Section 3 + §10/§11 source)
- `docs/design/wireframes/04-wireframes-batch-1.html` (W1-W6)
- `docs/design/wireframes/05-wireframes-batch-2.html` (W7-W13)
- `docs/design/wireframes/06-wireframes-batch-3.html` (W14-W19)
- `docs/design/wireframes/07-wireframes-batch-4.html` (W20-W28)

### Handoff prompt for roadmap integration

- `docs/design/handoff-prompt.md`

### GitHub

`https://github.com/EvanTenenbaum/terp-agro-operator-console`

---

*End of spec. 28 wireframes pinned. 8 phases sequenced. 14 surfaces with status-aware primary tables. 30+ drawer tabs with data contracts. Acceptance criteria + verification checklist + edge-case coverage + feature-flag rollout + telemetry plan. Ready for roadmap integration and writing-plans hand-off.*
