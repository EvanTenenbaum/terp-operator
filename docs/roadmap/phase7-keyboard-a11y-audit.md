# Phase 7 Keyboard + Accessibility Audit

Audit date: 2026-05-25
Auditor: search-specialist subagent (CAP-006 / Phase 7 prep)
Source tree: src/client/ (views + components), commit 88f7ba9 (HEAD of feat/phase7-prep, branched from main)
Phase 7 acceptance: "All core journeys can be completed keyboard-only or with documented exception."

---

## Summary

**Keyboard gaps: 12 total — 3 blocking, 5 major, 4 minor**
**Accessibility gaps: 11 total**

The codebase has a strong foundation: `useFocusTrap` is applied consistently to dialogs and modals, `Hotkeys.tsx` provides global Escape/nav hotkeys, `SelectionSummary` uses `aria-live`, `ToastCenter` uses `aria-live="polite"`, `Shell.tsx` uses `aria-current="page"`, `StatusPill` uses both color and shape, and `CommandPalette` is fully keyboard-accessible. The gaps are concentrated in three areas: (1) the main ContextDrawer has no focus trap, (2) RowCommandHistoryDrawer lacks a focus trap and Escape handling, and (3) several secondary drawers and inline form controls lack keyboard reach.

---

## Keyboard Gaps Table

### Blocking Gaps (cannot complete a core journey keyboard-only)

| # | Surface | Gap description | Severity | Suggested fix |
|---|---------|----------------|----------|---------------|
| K1 | **ContextDrawer** (`ContextDrawer.tsx`) | No `useFocusTrap` and no `onKeyDown` Escape handler on the drawer itself. Escape is handled globally in `Hotkeys.tsx` and does close the drawer via `setDrawerState`, but only when no other overlay is open. If focus moves into the drawer tab panel, Tab can escape to the background grid, allowing the user to interact with the main AG Grid while the drawer is open. For a keyboard user doing a Sales or Payments workflow, this means losing orientation mid-task. | **Blocking** | Add `useFocusTrap(drawerState !== 'closed', () => setDrawerState(activeView, 'closed'))` to the `<aside className="context-drawer">` ref. The global Escape handler in Hotkeys already handles the key; the trap prevents Tab bleed only. |
| K2 | **RowCommandHistoryDrawer** (`RowCommandHistoryDrawer.tsx`) | No `useFocusTrap` and no Escape handler. The close button (`aria-label="Close row history"`) is focusable, but Tab freely leaves the drawer into the background AG Grid. Opening row history is a core Recovery/Reversal journey step (Phase 7 smoke test item 8). | **Blocking** | Add `useFocusTrap(true, onClose)` to the `<aside className="row-history-drawer">` ref. Pattern is identical to `AddRefereeRelationshipDrawer`. |
| K3 | **RecoveryView — Correction button keyboard reach** (`OperationsViews.tsx:2408`) | The "Correction" button (`createCorrectionJournalEntry`) lives inside the `showAdminTools` toggle section. The toggle button (`aria-expanded={showAdminTools}`) is keyboard-reachable, but once expanded, the Period/Amount/Memo inputs inside have no `id` / `htmlFor` association (they use `field-inline` class wrapper but no explicit `<label>` id linkage). A keyboard-only user cannot reliably discover which input they are in when the form expands. | **Blocking** | Add `id` to each input and matching `htmlFor` to each label inside the admin tools band. |

### Major Gaps (significant friction, requires workaround)

| # | Surface | Gap description | Severity | Suggested fix |
|---|---------|----------------|----------|---------------|
| K4 | **VendorContextDrawer** (`VendorContextDrawer.tsx`) | Has `role="dialog"` and `aria-label` but no `useFocusTrap`. Tab can escape to background. The drawer has tablist/tab roles implemented correctly but focus is not trapped. | **Major** | Add `useFocusTrap(isOpen, onClose)` to the `<div role="dialog">` ref. |
| K5 | **ReceiptPreviewDrawer** (`ReceiptPreviewDrawer.tsx`) | Has `aria-label="Receipt preview"` and a close button but no focus trap. The receipt preview is a key step in the PO → Receive Inventory journey. | **Major** | Add `useFocusTrap(true, onClose)` to the `<aside>` ref. |
| K6 | **QuickLedgerGrid — Payment type selection** (`QuickLedgerGrid.tsx`) | The custom transaction type aside drawer (`<aside className="transaction-type-drawer">`) has `aria-label="Custom transaction type"` and a close button, but no focus trap and no Escape handler. A keyboard user can Tab into this drawer but cannot close it with Escape — they must mouse-click or Tab until they find the close button, which is not in a predictable position. | **Major** | Add `useFocusTrap(typeDrawerOpen, () => setTypeDrawerOpen(false))` to the aside ref. Add `onKeyDown={(e) => { if (e.key === 'Escape') setTypeDrawerOpen(false); }}`. |
| K7 | **PaymentsView — allocation workflow** (`OperationsViews.tsx:1152-1245`) | The `PaymentAllocationTools` component renders a `<select>` for "Choose invoice" and a preview table. None of the inputs in this component have explicit `id` / `htmlFor` label associations — they rely on adjacent visual placement. For a keyboard-only user navigating the allocate-payment workflow, the purpose of each control is unclear without visual context. | **Major** | Add `id` to the invoice select and label with `htmlFor`. Add `aria-label` to unlabeled inputs in the allocation table. |
| K8 | **FulfillmentView — Alerts drawer** (`OperationsViews.tsx`, `alertsDrawerOpen`) | The alerts drawer (`alertsDrawerOpen` state) renders conditionally but no focus trap or Escape handler is set up for it. The fulfillment pack smoke test (Phase 7 item 6) must be keyboard-completable. | **Major** | Add `useFocusTrap(alertsDrawerOpen, () => setAlertsDrawerOpen(false))` to the alerts drawer ref. Add Escape handler. |

### Minor Gaps (polish/nice-to-have)

| # | Surface | Gap description | Severity | Suggested fix |
|---|---------|----------------|----------|---------------|
| K9 | **SalesView — inline item add input** (`SalesView.tsx:768`) | The item add input has `onKeyDown` for Enter/submit correctly. But when the add form opens (via quicklaunch), focus is not moved to the input automatically — `SalesView.tsx:448` manually focuses `customerSelectRef` on quicklaunch, but the item input itself relies on the user Tab-navigating to it. | **Minor** | After toggling to the item add state, focus the item input ref explicitly. Pattern: `itemInputRef.current?.focus()`. |
| K10 | **SalesSourcePane tab panel** (`SalesSourcePane.tsx`) | Tab switching uses `tabIndex={activeTab === 'finder' ? 0 : -1}` pattern correctly, and `onKeyDown` handles arrow keys for the tab list. However, when a tab panel becomes active, focus is not moved into the panel — the operator must Tab again. | **Minor** | After `setActiveTab`, call `panelRef.current?.focus()` on the newly revealed panel. |
| K11 | **SideNav hotkey chips** (`Shell.tsx:159`) | Hotkey chips (`<kbd>⌘1</kbd>` etc.) are visible when the nav is expanded and correctly describe the shortcuts. However, the `<kbd>` chips render inside the nav link `<button>`, and `aria-label` for the button is not supplemented — a screen reader would read "Dashboard ⌘1" which is acceptable but could be improved. | **Minor** | Add `aria-keyshortcuts="Meta+1"` to the nav button elements that have registered hotkeys. This is optional ARIA but correct. |
| K12 | **ExpansionPanel** (`ExpansionPanel.tsx:37,64`) | The expansion chevron uses `tabIndex={0}` and `onKeyDown` for Enter/Space. The outer container also has `tabIndex={0}`. This creates two focusable elements for one logical toggle action — a keyboard user will Tab to both. | **Minor** | Remove `tabIndex={0}` from the container element; keep it only on the chevron button (or convert to a proper `<button>` element). |

---

## Accessibility Gaps Table

| # | Component / Surface | Issue description | WCAG criterion | Suggested fix |
|---|---------------------|-------------------|----------------|---------------|
| A1 | **KpiCard** (`KpiCard.tsx:14-21`) | The severity indicator is a colored square with `aria-hidden="true"`. The color meaning (good/watch/bad/neutral) is not conveyed to screen readers — the metric's label and value are read, but the severity state is invisible to AT. A screen reader user cannot distinguish a "bad" KPI from a "good" one. | 1.4.1 Use of Color | Add `aria-label` or visually hidden text to the severity indicator, e.g. `<span className="sr-only">{metric.severity}</span>` next to the colored square, or add a suffix to the button's accessible label: `aria-label={`${metric.label}: ${metric.severity}`}`. |
| A2 | **StatusPill** (`StatusPill.tsx`) | StatusPill already uses a small colored square (`<span className="h-2 w-2 rounded-sm bg-current" aria-hidden="true">`) plus text. This is correct shape+color. However, the shape is a square for every status — no differentiation by shape between status categories. North-stars say "Status must use shape+color and announce results." The shape discrimination is missing. | 1.4.1 Use of Color (partial) | Consider distinct shapes per status category: circle for active states (ready, open), diamond for warning states (needs_fix), dash/strike for terminal states (reversed, archived). Can be done with CSS clip-path or separate SVG glyphs. |
| A3 | **QuickLedgerGrid table** (`QuickLedgerGrid.tsx:289-302`) | The `<th>` elements have no `scope` attribute. Screen readers may not correctly associate headers with data cells in the data rows. | 1.3.1 Info and Relationships | Add `scope="col"` to all `<th>` elements in the ledger table. |
| A4 | **ContextDrawer** — no `role="dialog"` or `aria-modal` | The ContextDrawer `<aside>` has `aria-label="Context drawer"` but no `role="dialog"` and no `aria-modal="true"`. When the drawer is open, screen readers are not informed that a modal-like overlay is active. `VendorContextDrawer` correctly uses `role="dialog"` — the main `ContextDrawer` should match. | 4.1.2 Name, Role, Value | Add `role="dialog"` and `aria-modal="true"` to the `<aside className="context-drawer">` when `drawerState !== 'closed'`. |
| A5 | **Toasts — command results** (`ToastCenter.tsx`) | `ToastCenter` has `aria-live="polite"` wrapping a visually-hidden region. This is correct. However, the visible toast DOM is rendered elsewhere (in the main toast container) and does not have `aria-live`. This means the polite region announces but the visible toast does not — meaning AT users get a text-only announcement while sighted users see a styled toast. This is acceptable but creates a dual-path inconsistency. | 4.1.3 Status Messages | Consider rendering toasts inside the `aria-live` region rather than in two separate places. Low priority but worth fixing for consistency. |
| A6 | **EmptyState** (`EmptyState.tsx`) | `EmptyState` renders a visually prominent "no rows" state, but has no `role` or `aria-live` attribute. When a grid transitions from loading to empty, screen readers do not receive an announcement that the view is now empty. | 4.1.3 Status Messages | Add `role="status"` to the EmptyState wrapper div so AT users are informed when the component appears. |
| A7 | **Loading states — OperatorGrid** (`OperatorGrid.tsx`) | The `loading` prop toggles AG Grid's loading overlay, but AG Grid's built-in loading overlay does not emit an accessible announcement. There is no `aria-busy` on the grid container or `aria-live` region for "loading" → "ready" transitions. | 4.1.3 Status Messages | Add `aria-busy={loading}` to the AG Grid wrapper div in `OperatorGrid.tsx`. Consider a visually-hidden `aria-live="polite"` region that announces "Loading complete" when `loading` transitions from `true` to `false`. |
| A8 | **SaleLineExceptionControls** — missing label associations | `SaleLineExceptionControls.tsx` uses `aria-label` on inputs (correct). However, the select for "Landed cost basis" has `aria-label="Landed cost basis"` but the adjacent `<label className>` text is not programmatically associated (no `htmlFor`/`id` pair). AT reads `aria-label` but a visual label is also present — creates redundancy. Minor but inconsistent. | 1.3.1 Info and Relationships | Either use `aria-label` alone (remove visual label text, keep visual affordance via placeholder), or use `id`/`htmlFor` and remove `aria-label`. Pick one pattern consistently. |
| A9 | **RecoveryView admin tools form** — unlabeled inputs | The admin tools section in `RecoveryView` uses `<label className="field-inline">` wrappers but the inputs inside (`period`, `amount`, `memo`) have no `id` attributes, and the labels have no `htmlFor`. The `field-inline` CSS class provides visual containment but no programmatic label association. | 1.3.1 Info and Relationships | Add `id="recovery-period"`, `id="recovery-amount"`, `id="recovery-memo"` to each input and matching `htmlFor` to each label. Same fix as K3. |
| A10 | **CommandPalette search area** (`CommandPalette.tsx:132`) | The `<input autoFocus>` inside `CommandPalette` lacks an explicit `id` and associated `<label>`. The field has `aria-label` implied by placeholder text but no explicit accessible label. Placeholder text disappears on input. | 1.3.1 Info and Relationships | Add `aria-label="Search commands"` to the command palette input (or a visually-hidden `<label>` with `htmlFor`). |
| A11 | **Dashboard KPI severity — color-only** | The "Receivables" and "Payables" definition-item buttons in the Dashboard (`DashboardView.tsx:81-87`) have no severity state — they are plain buttons with a bold heading and subtitle. If these buttons need to communicate urgency (e.g., overdue receivables), there is no accessible mechanism to convey that. Not a current violation, but a Phase 7 gap to watch. | 1.4.1 Use of Color (future risk) | If urgency indicators are added to these buttons, ensure they use both color and text/shape, not color alone. Flag for review when adding dashboard severity states in Phase 7. |

---

## Working Well (Models to Follow)

These patterns are keyboard/a11y correct and should be replicated when building new views:

| Pattern | Where | Why it's a model |
|---------|-------|-----------------|
| `useFocusTrap` for dialogs | `EditCreditLimitModal`, `CommandPalette`, `AddRefereeRelationshipDrawer`, `RecordPrepaymentDialog`, all referee dialogs | Consistent, reusable hook. Handles both Tab trapping and Escape-to-close. |
| Global Escape/navigation hotkeys | `Hotkeys.tsx` | Centralized, not per-component. Handles Escape for drawer, palette, finder in priority order. |
| `aria-current="page"` on active nav item | `Shell.tsx:148` | Correct ARIA pattern for current page in navigation. |
| `aria-live="polite"` for selection announcements | `SelectionSummary.tsx:49` | Correct live region for non-urgent selection changes. |
| `aria-live="polite"` for toasts | `ToastCenter.tsx:21` | SR-only live region for command results. |
| `role="dialog"` + `aria-label` + `useFocusTrap` | `VendorContextDrawer.tsx` | Gold standard for drawer pattern. Main `ContextDrawer` should match. |
| StatusPill shape+color | `StatusPill.tsx:33` | `<span className="h-2 w-2 rounded-sm bg-current" aria-hidden="true" />` plus text label. Color is never the sole indicator. |
| `aria-label` on all icon buttons | `ContextDrawer.tsx:163,172,367,385` | Every icon-only action has a text alternative. |
| Tab panel pattern | `SalesSourcePane.tsx:71,80,93` | `role="tablist"`, `role="tab"`, `tabIndex` roving correctly implemented. |
| Focus-after-quicklaunch | `SalesView.tsx:448` | When a quicklaunch panel opens, focus is moved to the first relevant input automatically. |
| `aria-pressed` on filter chips | `OperationsViews.tsx:830,835,840` | Toggle state communicated to AT via `aria-pressed`. |
| `aria-expanded` on toggle controls | `RecoveryView` admin tools button, `Shell.tsx` quick-action | State change communicated to AT. |
| `scope="col"` pattern to aim for | QuickLedgerGrid needs it; implement it here as the baseline for all new tables. |

---

## Phase 7 Implementation Order

Suggested order based on severity and surface importance (core journey coverage first):

### Phase 7A — Blocking fixes (do first, unblock keyboard smoke test)
1. **K1** — Add `useFocusTrap` to `ContextDrawer`. Affects all journeys.
2. **K2** — Add `useFocusTrap` to `RowCommandHistoryDrawer`. Affects Recovery/Reversal journey (smoke test item 8).
3. **K3 + A9** — Label associations in RecoveryView admin tools. Affects correction workflow.

### Phase 7B — Major keyboard gaps (enables full keyboard journey pass)
4. **K4** — `VendorContextDrawer` focus trap.
5. **K5** — `ReceiptPreviewDrawer` focus trap.
6. **K6** — QuickLedgerGrid custom-type aside focus trap + Escape.
7. **K7 + A9** — `PaymentAllocationTools` label associations.
8. **K8** — FulfillmentView alerts drawer focus trap.

### Phase 7C — High-impact a11y fixes (screen reader and AT users)
9. **A4** — `ContextDrawer`: add `role="dialog"` + `aria-modal="true"`.
10. **A3** — QuickLedgerGrid table: add `scope="col"` to all `<th>`.
11. **A1** — KpiCard severity: add `sr-only` severity text.
12. **A6** — EmptyState: add `role="status"`.
13. **A7** — OperatorGrid: add `aria-busy={loading}`.

### Phase 7D — Polish (minor keyboard + a11y)
14. **K9** — SalesView item add: auto-focus input on quicklaunch.
15. **K10** — SalesSourcePane: focus panel after tab switch.
16. **K11** — SideNav: add `aria-keyshortcuts` to hotkey buttons.
17. **K12** — ExpansionPanel: remove redundant outer tabIndex.
18. **A2** — StatusPill: add shape differentiation by status category.
19. **A5** — Toast: consolidate to single `aria-live` DOM path.
20. **A8** — SaleLineExceptionControls: normalize label pattern.
21. **A10** — CommandPalette: add explicit `aria-label` to search input.
22. **A11** — Dashboard: monitor for color-only severity additions; fix on first occurrence.
