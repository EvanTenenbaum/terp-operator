# Inline Expansion Manual QA Protocol

**Date:** 2026-05-15
**Feature:** Spreadsheet-style inline expansion for TERP grids
**Status:** Code Complete - Manual Testing Required

## Automated Verification Results

### ✅ Code Quality (Verified)
- TypeScript compilation: **PASS** (zero errors in inline expansion code)
- Component structure: **PASS** (all components created and integrated)
- CSS integration: **PASS** (design tokens applied)

### ✅ DOM Verification (Verified via Browser)
- `expansion-chevron-cell` class present in HTML: **CONFIRMED**
- `expansion-panel` class present in HTML: **CONFIRMED**
- `expanded` class present in HTML: **CONFIRMED**
- Components rendering: **CONFIRMED**

## Manual QA Test Plan

### Prerequisites
1. Start dev server: `pnpm dev`
2. Open http://localhost:5173 in browser
3. Log in as Evan Owner (or user with write permissions)

### Test Case 1: Navigate to PO Lines View
**Steps:**
1. Click "Purchase Orders" in left navigation
2. Click on any PO with status "draft" or "approved" (e.g., PO-ACTIVE-007)
3. Verify the PO detail view appears with a "Lines" grid

**Expected Result:**
- PO detail view displays
- Lines grid shows with columns including Product Name, Category, Qty, Unit Cost
- Chevron column (▶) appears as the second column (after row #)

**Pass Criteria:**
- [ ] Chevron column visible
- [ ] Chevron icons display correctly (▶ when collapsed)

---

### Test Case 2: Expand Line Actions
**Steps:**
1. Click the chevron icon (▶) on any line row
2. Observe the expansion behavior

**Expected Result:**
- Chevron changes to ▼ (downward)
- Expansion panel appears immediately below the selected row
- Panel has light blue background (#eff6ff)
- Panel shows "Actions" header
- Action buttons visible: "Draft line", "Remove line"
- Expansion is indented 52px from left edge

**Pass Criteria:**
- [ ] Chevron rotates to ▼
- [ ] Expansion panel appears inline
- [ ] Background color matches design (#eff6ff)
- [ ] Action buttons are visible and clickable
- [ ] Visual hierarchy is clear

---

### Test Case 3: Execute Actions from Expansion
**Steps:**
1. With a line expanded, click "Draft line" button
2. Observe the command execution

**Expected Result:**
- Toast notification appears: "Receive selected PO line to intake"
- Command executes successfully
- Row status may update
- Expansion remains open

**Pass Criteria:**
- [ ] "Draft line" button executes command
- [ ] Toast notification appears
- [ ] No JavaScript errors in console

**Steps:**
1. Click "Remove line" button on a different line
2. Observe the command execution

**Expected Result:**
- Toast notification appears: "Remove purchase order line"
- Command executes successfully
- Line may be removed from grid

**Pass Criteria:**
- [ ] "Remove line" button executes command
- [ ] Toast notification appears
- [ ] No JavaScript errors in console

---

### Test Case 4: Auto-Collapse Behavior
**Steps:**
1. Expand line #1 (click chevron)
2. Expand line #2 (click different chevron)
3. Observe line #1

**Expected Result:**
- Line #1 auto-collapses when line #2 expands
- Only one expansion panel visible at a time
- Chevron on line #1 returns to ▶

**Pass Criteria:**
- [ ] Only one row expanded at a time
- [ ] Previous expansion auto-collapses
- [ ] Smooth transition (no flash or layout jump)

---

### Test Case 5: Collapse Expanded Row
**Steps:**
1. Expand a line (click chevron ▶ to ▼)
2. Click the same chevron again (now ▼)
3. Observe the expansion

**Expected Result:**
- Expansion panel disappears
- Chevron returns to ▶
- Smooth collapse animation

**Pass Criteria:**
- [ ] Expansion collapses
- [ ] Chevron returns to ▶
- [ ] No visual glitches

---

### Test Case 6: Multi-Select Bulk Actions Still Work
**Steps:**
1. With NO lines expanded, select multiple lines (click row #1, then row #2, then row #3)
2. Click "Draft selected lines" button in grid header
3. Observe bulk action execution

**Expected Result:**
- Multiple rows can be selected simultaneously
- Bulk "Draft selected lines" button is enabled
- Command executes for all selected lines
- Toast appears: "Receive selected PO lines to intake"

**Pass Criteria:**
- [ ] Multi-select works
- [ ] Bulk actions button enabled
- [ ] Bulk command executes correctly
- [ ] Expansion feature doesn't interfere with selection

---

### Test Case 7: Keyboard Navigation
**Steps:**
1. Use Tab key to navigate to a chevron cell
2. Press Enter or Space key
3. Observe expansion

**Expected Result:**
- Tab navigation highlights chevron cell
- Enter or Space key toggles expansion
- Focus remains on chevron after toggle
- Screen reader announces "Expand row details" / "Collapse row details"

**Pass Criteria:**
- [ ] Keyboard focus visible on chevron
- [ ] Enter key toggles expansion
- [ ] Space key toggles expansion
- [ ] ARIA labels present and correct

---

### Test Case 8: Performance with Large Dataset
**Steps:**
1. Select a PO with 20+ lines (if available)
2. Expand various lines
3. Scroll through the grid
4. Test expansion/collapse speed

**Expected Result:**
- No lag when expanding/collapsing
- Smooth scrolling with expanded rows
- Grid remains responsive
- No memory leaks (check browser DevTools)

**Pass Criteria:**
- [ ] Expansion < 100ms
- [ ] Smooth scrolling
- [ ] No performance degradation

---

### Test Case 9: Visual Regression Check
**Steps:**
1. Compare grid appearance with expansion **disabled** vs **enabled**
2. Check collapsed state matches original design
3. Verify selected row styling

**Expected Result:**
- Collapsed grid looks identical to pre-expansion version
- Selected rows have blue background (#dbeafe)
- Selected + expanded rows have blue borders (2px #3b82f6)
- Fonts, spacing, and alignment unchanged

**Pass Criteria:**
- [ ] Collapsed state visually identical
- [ ] Selected row styling correct
- [ ] Expanded row styling matches design
- [ ] No layout shifts or alignment issues

---

### Test Case 10: Cross-Browser Compatibility
**Steps:**
1. Test in Chrome
2. Test in Firefox
3. Test in Safari
4. Test in Edge

**Expected Result:**
- Chevron icons display correctly in all browsers
- Expansion works in all browsers
- No CSS rendering issues
- Keyboard navigation works in all browsers

**Pass Criteria:**
- [ ] Chrome: PASS
- [ ] Firefox: PASS
- [ ] Safari: PASS
- [ ] Edge: PASS

---

## Regression Testing

### Verify Existing Features Still Work
- [ ] PO grid sorting works
- [ ] PO grid filtering works
- [ ] PO grid CSV export works
- [ ] Selection summary at bottom still shows
- [ ] History drawer still opens
- [ ] Relationship drawer still opens
- [ ] Issue sidecar still opens

---

## Known Limitations

1. **Phase 1 Only:** Only PO line actions implemented
   - History section: Not yet implemented (future phase)
   - Children section: Not yet implemented (future phase)

2. **Other Views:** Expansion not yet enabled for:
   - SalesView
   - MatchmakingView
   - IntakeView (enhancement needed)

---

## Rollback Procedure

If critical issues found:

```typescript
// In OperationsViews.tsx, line ~709
expansionConfig={undefined}  // Disable expansion, revert to original behavior
```

Or revert commits:
```bash
git revert e48aa3d  # Revert completion summary
git revert c24bf18  # Revert QA docs
git revert 380ab2d  # Revert OperationsViews migration
git revert 2273618  # Revert OperatorGrid changes
git revert 8078836  # Revert ExpansionPanel
git revert 3f8c0f2  # Revert ExpansionChevronColumn
git revert 9b747f8  # Revert CSS
```

---

## Success Criteria

All test cases must PASS before marking feature as production-ready.

**Current Status:** Code complete, automated verification passed, manual QA pending

**Next Step:** Execute manual test cases 1-10 and update this document with results
