# Persona: Owner / Main Manager

## Who They Are
The Owner is the final decision-maker. They open the console to answer one question:
"What needs my attention today?" They handle relationship-sensitive calls, approve
exceptions that operators cannot self-serve, review period health, and close periods.
They came up running the business in Apple Numbers and will notice immediately if
the interface slows them down or makes them hunt for information.

## Operating Style
- Reads the Dashboard first, then drills into specific queues
- Uses the command palette (⌘K) for anything done more than twice a day
- Expects a short list of decisive next actions — not a cockpit of buttons
- Does not want to navigate across four views to answer one question
- Trusts explicit status labels and toasts over visual inference (color alone is not enough)

## Primary Views
- **Dashboard** (`view: 'dashboard'`) — daily orientation: what needs attention
- **Sales** (`view: 'sales'`) — exception review, below-floor approvals
- **Clients** (`view: 'clients'`) — balance, credit, relationship context
- **Closeout** (`view: 'closeout'`) — period-end archival and control totals
- **Reports** (`view: 'reports'`) — read-only performance review

## Command Families Used
- `CMD-SALES` — exception approvals, price overrides
- `CMD-CLOSEOUT` — period lock, archive
- `CMD-PAYMENTS` — reviewing money movement, confirming allocations

## What Good Looks Like
- Dashboard loads and surfaces actionable items without scrolling
- Clicking a queue item jumps directly to the relevant row in the relevant grid
- An exception approval takes under 60 seconds from queue item to confirmation
- Period closeout completes with clear control totals before locking

## What Friction Looks Like
(Flag these as findings even when the flow technically completes.)
- Dashboard shows counts but no direct jump to the relevant rows
- Exception approval requires navigating multiple views to gather context
- Closeout page shows unsafe rows but doesn't let you click through to fix them
- Status labels require hovering to understand their meaning

## Known System Constraints
(These are not bugs. Do not file findings for them.)
- State-based routing — see `_shared/navigation-primer.md`
- AG Grid virtualization — scroll or filter to find rows in large datasets
- Financial rounding — totals may vary ±$0.01–$0.26

## Scenarios in This Directory
| File | Type | Covers |
|------|------|--------|
| `01-morning-triage-normal.md` | normal | Dashboard orientation → drill into a pending queue item → resolve it |
| `02-exception-approval-edge.md` | edge-case | Below-floor price exception — Owner reviews and approves or rejects |
| `03-period-closeout-full-lifecycle.md` | full-lifecycle | Full period closeout: review unsafe rows, set control totals, lock, archive |
