# Navigation Primer

> Agent quick-reference for navigating TERP Operator.
> Full reference: `docs/qa/navigation-guide.md`

---

## Golden Rule

**This app uses state-based routing. Never use browser URL navigation to reach a view.**
The URL does not change when you navigate. Always use the sidebar or Quick Start bar.

---

## Reaching Each View

| View | Sidebar path | Hotkey | Quick Start button |
|------|-------------|--------|-------------------|
| Dashboard | Decide → Dashboard | ⌘1 | — |
| Reports | Decide → Reports | — | — |
| Purchase Orders | Procure → Purchase Orders | — | New PO |
| Intake | Procure → Intake | ⌘2 | Receive |
| Inventory | Procure → Inventory | ⌘5 | — |
| Sales | Sell → Sales | ⌘3 | New Sale |
| Matchmaking | Sell → Matchmaking | — | — |
| Orders | Sell → Orders | — | — |
| Fulfillment | Sell → Fulfillment | — | — |
| Client Ledger | Sell → Client Ledger | ⌘6 | — |
| Payments | Money → Payments | ⌘4 | Money in |
| Vendor Payouts | Money → Vendor Payouts | — | Money out |
| Referees | Money → Referees | — | — |
| Processors | Money → Processors | — | — |
| Recovery | Admin → Recovery | — | — |
| Closeout | Admin → Closeout | — | — |
| Settings | Admin → Settings | — | — |

---

## How to Confirm You Are in the Right View

Each view renders an `h1` heading. After navigating, verify the heading matches
the view you intended before proceeding with flow steps. If the heading doesn't
appear within 3 seconds, the navigation may have failed — note it as a finding.

---

## AG Grid Interaction Patterns

- **Select a row:** single click anywhere on the row
- **Edit an inline cell:** double-click the cell, or single-click to select then press Enter
- **Move between cells:** Tab (forward), Shift+Tab (backward)
- **Confirm a cell edit:** Enter or Tab
- **Cancel a cell edit:** Escape
- **Copy selected range:** ⌘C
- **Command palette:** ⌘K (opens from anywhere)
- **Virtualization note:** AG Grid only renders rows visible in the viewport.
  If a row is not visible, scroll down or apply a filter to bring it into view.
  Never assume a row is missing just because it is not immediately visible.

---

## Sidebar Collapsed?

If sidebar links are not visible, look for an expand/toggle control on the left edge
and click it to reveal the sidebar sections.

---

## Navigation Blocker vs. Known Constraint

| Situation | Classification | Action |
|-----------|---------------|--------|
| Clicking a sidebar link does nothing; view never loads | **Navigation blocker** | File as finding |
| A view requires scrolling or filtering to find a row | **Known constraint** | Note it, do not file |
| An action requires selecting a row first | **Known constraint** | Select the row, retry |
| A button is disabled with no visible explanation | **Finding** (UX gap) | Note observed state, file as Medium |

---

## Common Issues

**Sidebar section not visible:**
The sidebar has collapsible sections (Decide, Procure, Sell, Money, Admin).
If a view is missing, expand the relevant section first.

**View loads but grid shows no rows:**
The grid may be filtered from a previous session or the dataset may genuinely be empty.
Check for active filters in the grid header before concluding data is missing.

**Quick Start bar not visible:**
Scroll up — the Quick Start bar is at the top of the page above the main content area.
