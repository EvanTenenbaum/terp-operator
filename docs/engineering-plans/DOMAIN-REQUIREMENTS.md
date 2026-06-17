# Domain Requirements — TERP Operator

**Date:** 2026-06-17  
**Source:** Evan (operator-specified)  
**Status:** Active. Carries the weight of ARCH rules. Check before any view or component implementation.

---

## DR-1: Subcategory Priority Over Category

**Rule:** If a subcategory is present on an item, SKU, batch, or lot, **always prioritize it over the category.**

- In display: subcategory appears first, more prominent
- In filtering: filters default to subcategory when available
- In sorting: sort by subcategory, then category
- In entity-schemas.ts Tier 0 fields: subcategory at Tier 0, category at Tier 1

**Why:** Category is broad ("Flower"), subcategory is specific ("Iceberg"). Operators need specificity.

**Applies to:** `entity-schemas.ts` field ordering, `useColumnDefs.ts` Tier assignments, FilterToolbar presets, AG Grid sort configs.

---

## DR-2: No Collapsed Tables Below Main Table

**Rule:** Collapsed/expandable context tables stacked vertically below the primary grid are **forbidden**.

**Alternatives (use any):**
- **(a)** Slide-over tab — detail context is one click away, not zero
- **(b)** Tooltip or popover on the row — hover/click for brief context
- **(c)** Master-detail split view — side-by-side, not stacked

**Justification:** UX-3 (one primary surface). Stacked context tables add visual noise, push the grid down, and habituate operators to ignore them.

**Migration target:** Any existing collapsed table below a grid must be moved to a slide-over tab or split view before Phase 2 merge.

---

## DR-3: Cell Selection (Drag to Multi-Select Cells)

**Rule:** All AG Grid tables must support **cell-level multi-selection** by drag.

- Drag to select a range of cells
- Selected cells show a summary (sum, count, average) in a status bar
- Copy (⌘C) copies selected cells to clipboard
- Paste (⌘V) pastes into selected cell range (where editable)

**Implementation:** AG Grid `enableRangeSelection: true`, `enableCellTextSelection: true`, custom status bar component for selection summary.

**Priority:** Phase 4 polish. Not required for Phase 0-3 merge.

---

## DR-4: No Barcode Scanner / Label Support

**Rule:** The system does **not** need barcode scanner integration, barcode label printing, or any barcode-related functionality.

- No barcode input fields
- No scanner device detection
- No label printing templates
- If any barcode code exists, it can be removed

**Scope exclusion.** This is permanent — do not design for barcodes in any view.

---

## DR-5: Intake / Pick / Pack — Operator Speed

**Rule:** The Intake, Pick, and Pack views must **never slow the operator down** or block them with unnecessary confirmations.

**Requirements:**
- No wizard with "are you sure?" between steps
- No blocking confirmation dialogs on routine actions
- CSV paste must be supported (existing in IntakeView — preserve)
- Batch operations via single click/keystroke, not multi-step forms
- The system should feel like a tool, not a form

**Applies to:** IntakeView (refactor to MasterDetail or GridView), PickView (WizardView replacement), FulfillmentView (GridView already adopted).

**Anti-pattern:** A wizard with Next → Next → Confirm → Done. Operators should move as fast as they can think.

---

## Agent Checklist

Before implementing any view, check:
- [ ] DR-1: Subcategory prioritized over category in schema tier?
- [ ] DR-2: Any collapsed tables below grid? If so, moved to slide-over?
- [ ] DR-3: Cell range selection enabled? (Phase 4)
- [ ] DR-4: No barcode features designed or implemented?
- [ ] DR-5: Intake/Pick/Pack views let operator move fast?
