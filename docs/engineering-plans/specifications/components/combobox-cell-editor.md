# ComboboxCellEditor — Component Specification

**Type:** AG Grid ICellEditor
**Replaces:** Inline text editing for enum/discrete-value columns
**Research reference:** `research-packets/mercury-combobox-behavior.md`

---

## Purpose
Inline dropdown editor for AG Grid cells. Used for columns with discrete, known values (status, category, method, tags, pricing strategy). Matches Mercury's Category/GL Code combobox pattern.

---

## API Contract

```typescript
interface ComboboxCellEditorProps {
  // From AG Grid ICellEditorParams
  value: string | null;          // Current cell value
  stopEditing: (suppressNavigate?: boolean) => void;
  column: Column;
  node: RowNode;
  data: GridRow;
  
  // Custom params (passed via cellEditorParams in ColDef)
  options: ComboboxOption[];     // Dropdown options
  placeholder?: string;          // Default: "Select..."
  allowCreate?: boolean;         // Default: false. Show "Create new" option
  createLabel?: string;          // Default: 'Create "{value}"'
  onCommit: (value: string | null) => Promise<void>;  // Async save
  disabled?: boolean;            // Read-only mode
  maxOptions?: number;           // Default: 500. Above this, use async fetch
  onSearch?: (query: string) => Promise<ComboboxOption[]>;  // Async fetch
  emptyMessage?: string;         // Default: "No options available"
}

interface ComboboxOption {
  label: string;                 // Display text
  value: string;                 // Stored value
  description?: string;          // Optional subtitle (shown in dropdown)
  group?: string;                // Optional group header
  disabled?: boolean;            // Option cannot be selected
  icon?: string;                 // Optional icon (emoji or component name)
}
```

---

## States

### State 1: Empty (initial)
```
┌──────────────────────┐
│ Select...        ▾   │  ← placeholder text, grey
└──────────────────────┘
```
- **Trigger:** Cell value is null/undefined/empty string
- **Visual:** Placeholder text in `text-zinc-400`, 13px font. Chevron icon on right.
- **Interaction:** Click anywhere in cell → opens dropdown (State 3)

### State 2: Focused (no dropdown)
```
┌──────────────────────┐
│ Select...        ▾   │  ← blue focus ring
└──────────────────────┘
```
- **Trigger:** Tab into cell or click cell
- **Visual:** Blue focus ring (`box-shadow: 0 0 0 2px #3b82f6`). Placeholder still visible.
- **Interaction:** Press Enter or click → opens dropdown. Press Escape → closes editor (AG Grid default).

### State 3: Open (dropdown visible)
```
┌──────────────────────┐
│ Select...        ▾   │  ← blue focus ring
│──────────────────────│  ← dropdown border
│  Legal Fees          │  ← option (hover: grey bg)
│  Travel - Accomm...  │
│  Travel - Vehicles   │
│  Venue Rental        │
│  Employee Gifts      │
│  Software            │
│  Investments         │
│──────────────────────│
│ + Create "New Cat"   │  ← create new (if allowCreate)
└──────────────────────┘
```
- **Trigger:** Click cell or press Enter on focused cell
- **Visual:** Dropdown appears below (or above if near viewport bottom). Max height: 280px. Scrollable. Option height: 32px. Hovered option: `bg-zinc-100`.
- **Interaction:** ArrowUp/Down navigates. Enter selects. Escape closes dropdown (returns to State 2). Click outside closes dropdown. Click option selects it.
- **Position:** `position: absolute; top: 100%; left: 0; z-index: 50; min-width: 200px`. Dropdown renders within cell container (AG Grid `isPopup: false`).

### State 4: Option Hovered
```
┌──────────────────────┐
│ Select...        ▾   │
│──────────────────────│
│  Legal Fees          │
│▐ Travel - Accomm... ▌│  ← dark highlight bg
│  Travel - Vehicles   │
│  ...                 │
└──────────────────────┘
```
- **Visual:** Hovered option: `bg-zinc-100` or `bg-blue-50`. Current value (if any): checkmark on right.
- **Interaction:** Mouse hover or ArrowUp/Down navigation.

### State 5: Value Selected
```
┌──────────────────────┐
│ Legal Fees     × ▾   │  ← selected value, dark text, clear button
└──────────────────────┘
```
- **Trigger:** User selects option (click or Enter)
- **Visual:** Selected value shown in dark text. Clear button (×) on left of chevron. Chevron still present for re-open.
- **Interaction:** Click × → clears value, returns to State 1. Click cell → re-opens dropdown (State 3). Press Escape → AG Grid stops editing.
- **Auto-commit:** Selection triggers `onCommit(value)`. No separate "Save" button (matches Mercury pattern).

### State 6: Saving
```
┌──────────────────────┐
│ Legal Fees     ◌ ▾   │  ← spinner instead of chevron
└──────────────────────┘
```
- **Trigger:** `onCommit(value)` is in flight (Promise pending)
- **Visual:** Spinner animation where chevron was. Cell border grey. Cannot interact.
- **Duration:** Until `onCommit` resolves or rejects.

### State 7: Saved (Success)
```
┌──────────────────────┐
│ Legal Fees     ✓ ▾   │  ← green checkmark flash
└──────────────────────┘
```
- **Trigger:** `onCommit` resolved successfully
- **Visual:** Green checkmark flashes for 200ms, then fades to normal State 5.
- **AG Grid:** Cell value updated. Editor closed (AG Grid standard flow).

### State 8: Error
```
┌──────────────────────┐
│ Legal Fees     ⚠ ▾   │  ← red border, error icon
│ Save failed. Retry?  │  ← tooltip on hover
└──────────────────────┘
```
- **Trigger:** `onCommit` rejected
- **Visual:** Red border (`border-red-500`). Red error icon (⚠). Tooltip on hover/focus: error message.
- **Interaction:** Click cell → retries save. Click × → clears value (discards failed edit). Press Escape → keeps current value, stops editing.

### State 9: Typeahead Active
```
┌──────────────────────┐
│ Law|            ▾    │  ← typed text with cursor
│──────────────────────│
│  Legal Fees          │  ← filtered to matching
│  Law Firm Services   │
│──────────────────────│
│  No other matches    │  ← if no results
└──────────────────────┘
```
- **Trigger:** User types while dropdown is open
- **Visual:** Typed text in input with cursor. Dropdown filters to matching options (case-insensitive substring match).
- **No matches:** Show "No results" with "Create '[value]'" option if `allowCreate: true`.
- **Filtering:** Client-side for `options.length ≤ maxOptions`. Async via `onSearch(query)` for larger lists.
- **Debounce:** 150ms for async search.

### State 10: Disabled
```
┌──────────────────────┐
│ Legal Fees            │  ← greyed text, no chevron, no clear
└──────────────────────┘
```
- **Trigger:** `disabled: true` or `canWrite: false` from grid
- **Visual:** Grey text. No chevron. No clear button. No interaction.
- **AG Grid:** `editable: false` on the column.

---

## Keyboard Behavior

| Key | State | Action |
|-----|-------|--------|
| Enter | Focused (2) | Open dropdown |
| Enter | Open (3) | Select hovered option, commit |
| Escape | Open (3) | Close dropdown, return to State 2 |
| Escape | Focused (2) | Stop editing (AG Grid default) |
| ArrowDown | Focused (2) | Open dropdown, focus first option |
| ArrowDown | Open (3) | Move focus to next option |
| ArrowUp | Open (3) | Move focus to previous option |
| Tab | Any | Commit current value, move to next editable cell |
| Shift+Tab | Any | Commit current value, move to previous cell |
| Backspace | Value set (5) | If input is focused: delete char. If not: clear value. |
| A-Z, 0-9 | Open (3) | Typeahead: filter options (focus stays in input) |

---

## AG Grid Integration

### ICellEditor Interface Implementation

```typescript
class ComboboxCellEditor implements ICellEditor {
  // Required
  getValue(): string | null;        // Returns selected value
  isPopup(): boolean;               // Returns false (renders inline)
  focusIn(): void;                  // Focus the input element
  afterGuiAttached(): void;         // Called after DOM mounted — set up listeners
  
  // Optional but implemented
  isCancelBeforeStart(): boolean;   // Don't open if disabled
  isCancelAfterEnd(): boolean;      // Don't cancel if value changed
  destroy(): void;                  // Clean up event listeners
}
```

### Column Definition Usage
```typescript
{
  field: 'status',
  headerName: 'Status',
  cellEditor: ComboboxCellEditor,
  cellEditorParams: {
    options: STATUS_OPTIONS,
    placeholder: 'Select status...',
    onCommit: async (value) => {
      await runCommand('updateOrder', { id: data.id, status: value });
    },
  },
  // AG Grid standard
  editable: true,
  singleClickEdit: false,  // Require double-click or Enter to edit (matches Mercury)
}
```

### Integration with OperatorGrid
`OperatorGrid` already has `onCellCommit` callback. ComboboxCellEditor's `onCommit` flows through the same pipeline:
1. User selects option → `ComboboxCellEditor.onCommit(value)` called
2. `onCommit` calls `runCommand(...)` via the view's handler
3. `useCommandRunner` executes mutation
4. On success: toast + invalidate queries → grid refreshes
5. On error: ComboboxCellEditor shows error state (State 8)

---

## Accessibility

| Requirement | Implementation |
|-------------|---------------|
| `role="combobox"` | On the input element |
| `aria-haspopup="listbox"` | On the input |
| `aria-autocomplete="list"` | On the input when typeahead enabled |
| `aria-expanded="true/false"` | Toggles when dropdown opens/closes |
| `aria-activedescendant` | Points to currently focused option ID |
| `role="listbox"` | On the dropdown container |
| `role="option"` | On each option element |
| `aria-selected="true/false"` | On the currently selected option |
| `aria-label` | On clear button: "Clear selection" |
| `aria-label` | On dropdown toggle: "Open combobox menu" |
| Focus trap | Tab moves to next grid cell (AG Grid default), not trapped in dropdown |
| Screen reader | Announces: "X options available" on open, "Selected [value]" on select, "No results" on empty filter |

---

## Edge Cases

| Case | Behavior |
|------|----------|
| Options array empty | Show "No options available" in dropdown |
| Single option | Auto-select it on open (no navigation needed) |
| `options.length > maxOptions` | Use `onSearch` prop for async fetch. Show spinner while loading. |
| Rapid open/close | Debounce open animation (50ms). Ignore rapid clicks. |
| Cell value not in options | Show value as-is. Dropdown opens with "Current: [value]" header + options. This handles stale data. |
| Undo (Ctrl+Z) | AG Grid undo restores previous cell value. ComboboxCellEditor shows restored value. |
| Fill handle (drag to fill) | AG Grid fill handle copies value down. ComboboxCellEditor accepts the fill normally. |
| Clipboard paste | If pasted value matches an option, select it. If not, show "Pasted value not in list" tooltip. |
| Mobile/touch | Dropdown uses native feel. Touch scrolling in dropdown works. |
| Dark mode | Uses inherited CSS variables. No hardcoded colors. |

---

## File Locations

```
src/client/components/editors/
├── ComboboxCellEditor.tsx        Main component
├── ComboboxCellEditor.test.tsx   Unit + integration tests
└── types.ts                      ComboboxOption, ComboboxCellEditorProps
```

---

## Test Checklist

- [ ] Renders empty state (placeholder visible)
- [ ] Opens dropdown on click
- [ ] Opens dropdown on Enter
- [ ] Closes dropdown on Escape (returns to focused state)
- [ ] ArrowDown/Up navigates options
- [ ] Enter selects hovered option
- [ ] Click selects option
- [ ] Selection calls onCommit
- [ ] Shows saving spinner during onCommit
- [ ] Shows green checkmark on success
- [ ] Shows red border + error on failure
- [ ] Clear button removes value
- [ ] Clear button calls onCommit(null)
- [ ] Typeahead filters options
- [ ] Async search called for large lists
- [ ] "Create new" shown when allowCreate and no match
- [ ] Disabled state is non-interactive
- [ ] Single option auto-selects
- [ ] Empty options shows "No options"
- [ ] Tab commits and moves to next cell
- [ ] Undo restores previous value
- [ ] Integration: OperatorGrid onCellCommit fires correctly
- [ ] No memory leaks (event listeners cleaned up)
- [ ] ARIA roles and labels correct
- [ ] Keyboard navigation full cycle
