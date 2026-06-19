# BulkActionBar — Component Specification

**Type:** Shared component
**Replaces:** StatusActionBar (per view)
**Research reference:** `research-packets/mercury-bulk-actions-behavior.md`

---

## Purpose
Sticky bottom bar showing selection count + total + contextual action buttons. Appears when rows are selected in a grid. Actions derived from entity state machine.

---

## API Contract

```typescript
interface BulkActionBarProps {
  selectedCount: number;
  selectedTotal?: string;              // e.g., "$24,500.00"
  entityLabel?: string;                // e.g., "order", "PO" (for pluralization)
  actions: BulkAction[];
  onClear: () => void;                 // Clears selection, hides bar
}

interface BulkAction {
  key: string;                         // Command name
  label: string;                       // Display label
  primary?: boolean;                   // Shown prominently (leftmost)
  variant?: 'primary' | 'secondary' | 'danger' | 'warning';
  disabled?: boolean;
  disabledReason?: string;             // Tooltip explaining why disabled
  requiresInput?: {                    // Bespoke inline input
    field: string;
    placeholder: string;
    type?: 'text' | 'number';
  };
  onAction: (inputValue?: string) => Promise<void>;  // Executes command
}
```

---

## States

### Hidden
```
[Not rendered]
```
- selectedCount === 0, or selection explicitly cleared

### Visible (Idle)
```
┌────────────────────────────────────────────────────────────┐
│ 3 orders selected · $24,500.00                             │
│ [Confirm] [Post to GL] [Allocate to Fulfillment] [···]     │
│  primary   secondary   secondary              more actions │
└────────────────────────────────────────────────────────────┘
```
- Animates up from bottom: `transform: translateY(0)`, 200ms ease-out
- Primary action: prominent style (filled button). Far left.
- Secondary actions: outlined/ghost style.
- "More" (···) if >4 actions: opens popover with remaining.

### Executing
```
┌────────────────────────────────────────────────────────────┐
│ 3 orders selected · $24,500.00                             │
│ [◌ Confirming...] [Post to GL] [Allocate]                  │
│  spinner + disabled   disabled     disabled                │
└────────────────────────────────────────────────────────────┘
```
- Active action shows spinner. All other buttons disabled.
- Bar stays visible during execution (async Promise).

### Partial Success
```
┌────────────────────────────────────────────────────────────┐
│ 2 confirmed · 1 failed                                     │
│ [View failures] [Dismiss]                                  │
└────────────────────────────────────────────────────────────┘
```
- After batch action where some rows succeed, some fail.
- Shows count of successes + failures.
- "View failures" highlights failed rows in grid.

### All Success
```
┌────────────────────────────────────────────────────────────┐
│ ✓ 3 orders confirmed                                       │
│  [green flash, 500ms, then bar hides]                      │
└────────────────────────────────────────────────────────────┘
```
- Green flash (500ms), then bar animates out.

### All Failure
```
┌────────────────────────────────────────────────────────────┐
│ ✗ Failed to confirm orders: [error message]               │
│ [Retry] [Dismiss]                                          │
└────────────────────────────────────────────────────────────┘
```
- Error message. Retry button re-executes the action.

### Bespoke Input
```
┌────────────────────────────────────────────────────────────┐
│ 1 request selected                                         │
│ Route to: [____________] [Route]                           │
│           inline input       action button                 │
└────────────────────────────────────────────────────────────┘
```
- When `requiresInput` is set, an inline input field appears next to the action button.

---

## Position & Animation

- `position: sticky; bottom: 0;` within the view container
- `z-index: 30` (above grid, below slide-over)
- `transform: translateY(0)` (visible) ←→ `translateY(100%)` (hidden)
- `transition: transform 200ms ease-out, opacity 200ms`
- Background: white with top border + shadow

---

## Keyboard

| Key | Action |
|-----|--------|
| Escape | Clear selection, hide bar |
| Enter | Trigger primary action (if enabled) |
| Tab | Cycle through action buttons |

---

## File

`src/client/components/BulkActionBar.tsx`
