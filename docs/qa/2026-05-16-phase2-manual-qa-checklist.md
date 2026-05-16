# Phase 2 Inline Expansion - Manual QA Checklist

**Date:** 2026-05-16  
**Feature:** Phase 2 inline expansion implementations  
**Implementations:**
1. Vendor Bills - Payout actions
2. Purchase Orders - Secondary actions  
3. Sales Orders - Order actions

---

## Setup

1. Start dev server: `pnpm dev`
2. Open browser: http://localhost:5173
3. Login: owner@terpagro.local / terp-demo
4. Navigate to Operations view

---

## Test Case 1: Vendor Bills - Payout Actions Inline Expansion

### Navigation
- [ ] Click "Operations" in nav
- [ ] Verify "Vendor Bills" grid is visible

### Chevron Rendering
- [ ] Verify first column has chevron icon (▶)
- [ ] Verify chevron has button-like appearance
- [ ] Hover over chevron - verify cursor changes to pointer

### Expansion Behavior
- [ ] Click chevron on first vendor bill row
- [ ] Verify chevron rotates to ▼ (down arrow)
- [ ] Verify expansion panel appears below row
- [ ] Verify panel has light background color
- [ ] Verify panel has "Actions" header

### Action Buttons
- [ ] Verify "Approve" button visible with ShieldCheck icon
- [ ] Verify "Schedule" button visible with CalendarClock icon
- [ ] Verify "Pay" button visible with Landmark icon
- [ ] Verify buttons are styled correctly (primary/secondary)
- [ ] Verify disabled state if bill status doesn't allow action

### Collapse Behavior
- [ ] Click chevron again
- [ ] Verify panel collapses and disappears
- [ ] Verify chevron rotates back to ▶ (right arrow)

### Auto-Collapse
- [ ] Expand first vendor bill row
- [ ] Expand second vendor bill row
- [ ] Verify first row auto-collapses (only one expanded at a time)

### Keyboard Navigation
- [ ] Tab to chevron cell
- [ ] Press Enter
- [ ] Verify row expands
- [ ] Press Enter again
- [ ] Verify row collapses
- [ ] Press Space bar
- [ ] Verify row expands

### Action Execution
- [ ] Expand a vendor bill row
- [ ] Click "Approve" button (if enabled)
- [ ] Verify command executes (check for loading state)
- [ ] Verify action completes successfully
- [ ] Note: Do NOT actually approve bills in test data unless safe to do so

---

## Test Case 2: Purchase Orders - Secondary Actions Inline Expansion

### Navigation
- [ ] Verify "Purchase Orders" grid is visible (still in Operations view)
- [ ] Scroll to Purchase Orders grid if needed

### Chevron Rendering
- [ ] Verify first column has chevron icon (▶)
- [ ] Verify chevron renders for all PO rows

### Expansion Behavior
- [ ] Click chevron on first PO row
- [ ] Verify expansion panel appears
- [ ] Verify "Actions" header visible

### Action Buttons
- [ ] Verify "Draft intake" button visible (if PO is approved/ordered/partially_received)
- [ ] Verify "Unfinalize" button visible (if PO is finalized)
- [ ] Verify "Cancel draft PO" button visible
- [ ] Verify button disabled states match PO status

### Collapse & Auto-Collapse
- [ ] Click chevron to collapse
- [ ] Verify panel disappears
- [ ] Expand first PO, then expand second PO
- [ ] Verify auto-collapse behavior

---

## Test Case 3: Sales Orders - Order Actions Inline Expansion

### Navigation
- [ ] Click "Sales" in nav
- [ ] Verify "Sales Orders" grid is visible

### Chevron Rendering
- [ ] Verify first column has chevron icon (▶)
- [ ] Verify chevron renders for sales order rows

### Expansion Behavior
- [ ] Click chevron on first sales order row
- [ ] Verify expansion panel appears
- [ ] Verify "Actions" header visible

### Action Buttons
- [ ] Verify "Confirm order" button visible (primary style, disabled if not draft)
- [ ] Verify "Reserve inventory" button visible (secondary style, disabled if not confirmed)
- [ ] Verify "Cancel order" button visible (secondary style)
- [ ] Verify Send icon on Confirm button
- [ ] Verify PackagePlus icon on Reserve button

### Collapse & Auto-Collapse
- [ ] Click chevron to collapse
- [ ] Verify panel disappears
- [ ] Test auto-collapse with multiple rows

### Action Execution
- [ ] Expand a draft sales order
- [ ] Click "Confirm order" (if safe to do so)
- [ ] Verify command executes
- [ ] Verify order transitions to confirmed status
- [ ] Note: Test on safe test data only

---

## Test Case 4: Cross-View Consistency

### Visual Consistency
- [ ] Compare expansion panels across all three views
- [ ] Verify consistent background color
- [ ] Verify consistent action button styling
- [ ] Verify consistent chevron icon behavior

### Behavior Consistency
- [ ] Verify expand/collapse animation consistent
- [ ] Verify auto-collapse works in all views
- [ ] Verify keyboard navigation works in all views

---

## Test Case 5: Browser Console

### Console Errors
- [ ] Open browser dev tools console
- [ ] Navigate through Operations and Sales views
- [ ] Expand/collapse rows in each view
- [ ] Verify NO React errors appear
- [ ] Verify NO JavaScript runtime errors
- [ ] ag-Grid license warnings are OK (harmless)

---

## Test Case 6: Accessibility

### ARIA Attributes
- [ ] Inspect chevron cell in DOM
- [ ] Verify `role="button"`
- [ ] Verify `aria-label="Expand row details"`
- [ ] When collapsed: `aria-expanded="false"`
- [ ] When expanded: `aria-expanded="true"`

### Screen Reader
- [ ] Use VoiceOver (Mac) or NVDA (Windows)
- [ ] Tab to chevron
- [ ] Verify screen reader announces "Expand row details, button"
- [ ] Press Enter to expand
- [ ] Verify screen reader announces state change

---

## Test Case 7: Responsive/Mobile

### Desktop (1920x1080)
- [ ] Verify expansion works at full width
- [ ] Verify action buttons fit comfortably

### Tablet (768x1024)
- [ ] Verify expansion still works
- [ ] Verify buttons don't overflow

### Mobile (390x844)
- [ ] Verify chevron still clickable
- [ ] Verify expansion panel fits
- [ ] Verify action buttons stack or wrap appropriately

---

## Test Case 8: Performance

### Large Grids
- [ ] Navigate to view with many rows (100+)
- [ ] Verify grid scrolling is smooth
- [ ] Expand a row
- [ ] Verify no lag or jank
- [ ] Expand multiple rows in succession
- [ ] Verify performance remains good

### Memory Leaks
- [ ] Expand and collapse same row 20+ times rapidly
- [ ] Monitor browser memory usage
- [ ] Verify memory doesn't continuously grow

---

## Test Case 9: Edge Cases

### Empty Grids
- [ ] Navigate to view with no rows (if possible)
- [ ] Verify no errors
- [ ] Verify empty state message displays

### Single Row
- [ ] Find grid with only 1 row
- [ ] Verify expansion works
- [ ] Verify auto-collapse doesn't cause issues

### Rapid Clicking
- [ ] Click chevron rapidly 10+ times
- [ ] Verify expansion/collapse handles it gracefully
- [ ] Verify no errors in console

---

## Pass/Fail Criteria

### PASS if:
- ✅ All chevrons render correctly
- ✅ Expansion panels appear/disappear smoothly
- ✅ Action buttons render with correct labels and icons
- ✅ Button disabled states match row status
- ✅ Auto-collapse works (only one row expanded at a time)
- ✅ Keyboard navigation works (Enter/Space)
- ✅ ARIA attributes correct
- ✅ NO blocking console errors (ag-Grid warnings OK)
- ✅ Performance is good (no lag, no memory leaks)

### FAIL if:
- ❌ Chevrons don't render or don't respond to clicks
- ❌ Expansion panels don't appear
- ❌ Action buttons missing or incorrectly styled
- ❌ React errors or JavaScript runtime errors in console
- ❌ Expansion breaks grid layout
- ❌ Performance issues (lag, jank, memory leaks)
- ❌ Accessibility issues (missing ARIA, keyboard nav broken)

---

## Notes

- Test on Chrome, Firefox, Safari, and Edge if possible
- Test with keyboard only (no mouse) for accessibility
- Test with screen reader for full accessibility verification
- Document any issues found with screenshots or screen recordings
- File issues in Linear for any failures

---

**Test Execution Date:** _______________  
**Tester:** _______________  
**Overall Result:** ⬜ PASS  ⬜ FAIL  
**Issues Found:** _______________
