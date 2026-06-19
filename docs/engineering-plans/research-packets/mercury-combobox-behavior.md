# Mercury Combobox Behavior — Research Evidence

**Source:** https://demo.mercury.com/transactions
**Date observed:** 2026-06-15
**Method:** Playwright browser inspection + DOM evaluation

---

## Observed Behavior

### DOM Structure
Mercury's Category/GL Code combobox uses a custom component, not a native `<select>`:

```html
<input role="combobox" aria-haspopup="listbox" aria-autocomplete="list" 
       autocomplete="garbage" readonly="false" />
<button aria-label="Open combobox menu">
  <!-- chevron icon -->
</button>
<button aria-label="Clear combobox selection">
  <!-- × icon -->
</button>
```

### Dropdown Rendering
Two overlay layers appear when the combobox opens:
1. **Standard listbox:** `div._listbox` — `position: absolute, z-index: 2`
2. **Popover listbox:** `div._popover` — `position: relative, z-index: 4`

Options use `role="option"` class. "Create new" option has `_actionable` class.

### Interactive Behavior (Confirmed)

1. **Click to open:** Click empty combobox → dropdown opens with 7-8 options
2. **Keyboard navigation:** ArrowDown navigates options. Enter selects. Escape closes.
3. **Immediate save:** Selecting an option saves immediately — no "Save" or "Confirm" button. AG Grid equivalent: `stopEditing()` called after selection.
4. **Clear button:** "Clear combobox selection" button appears when value is set. Clicking clears value.
5. **Typeahead:** `aria-autocomplete="list"` + `readonly="false"` indicates type-to-filter behavior.
6. **Three visual states observed:**
   - Empty: "Category Open combobox menu" (placeholder)
   - Filled: "Category [Value] Clear combobox selection"
   - Warning/Error: "GL Code 404 - Inactive GL Code"

### Not Fully Observed (Agent step limit)
- Typeahead filtering behavior (typing while dropdown open)
- "Create new" flow (clicking "Create new category")
- Save error state (how does Mercury handle API failures on inline edits?)
- Bulk selection interaction with combobox cells

---

## Design Implication for TERP

1. **Immediate save pattern is critical.** Mercury users don't expect a "Save" step after selecting a combobox value. TERP's ComboboxCellEditor must auto-commit on selection via the existing `onCellCommit` pipeline.

2. **Clear button is essential.** Mercury shows a clear button on value-set cells. TERP must match this.

3. **Typeahead for large lists.** Mercury's `aria-autocomplete="list"` enables type-to-filter. TERP's combobox must support this for lists >50 options (TERP categories have 50+ options vs. Mercury's ~8).

4. **Error state is rare in Mercury** (banking data is simpler). TERP must handle async save errors gracefully — Mercury's combobox doesn't show us how they handle this.

5. **"Create new" option.** Mercury allows creating new categories inline. TERP should support this for extensible enums (tags, categories).
