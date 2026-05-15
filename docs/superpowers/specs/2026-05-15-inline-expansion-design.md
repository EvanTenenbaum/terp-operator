# Inline Expansion Pattern for TERP Grids

**Date:** 2026-05-15  
**Status:** Approved  
**Implementation:** ag-Grid Master-Detail Extension

## Problem

Currently, row-specific actions and details appear in separate UI modules (trays, drawers) below or beside grids. This forces operators to look away from their data to take actions, creating visual fragmentation and cognitive overhead.

Example: In OperationsViews, selecting a PO line shows actions in a separate tray below the grid. Operators must mentally connect the selected row (in the table) with the actions (in the tray below).

## Solution

Implement spreadsheet-style inline expansion where row-specific content (actions, history, child records) expands directly below the selected row within the grid itself. This keeps operators' focus in one place and creates clear visual hierarchy through color and indentation.

## Design Decisions

### What Expands Inline vs. What Stays in Drawers

**Inline Expansion (directly related to the row's workflow):**
- Row actions (Draft, Remove, Edit)
- Brief command history (recent events for that row)
- Validation issues for that specific row
- Child records (batches under POs, line items under orders)

**Drawers (contextual/adjacent information):**
- Customer/vendor relationships and details
- Pricing rules, credit limits, payment terms
- Complex editing interfaces
- Cross-entity information

**Rationale:** Inline expansion is for workflow actions on the current record. Drawers are for looking up related context from other entities.

### Interaction Model

**Expansion Trigger:** Dedicated chevron icon column (▶/▼)
- Click chevron to expand/collapse
- Separate from row selection (preserves multi-select for bulk actions)
- Familiar spreadsheet pattern

**Auto-Collapse:** Only one row expanded at a time
- Selecting a different row auto-collapses the previous expansion
- Keeps the grid clean and focused
- ag-Grid's master-detail handles this automatically

**Multi-Level Nesting:** Accordion pattern within expansions
- Top level: Actions panel
- Nested: History, child items, validation details
- Each nested section has its own expand/collapse control
- Visual hierarchy through indentation and color

### Visual Design System

**Level 1 (Primary Expansion):**
- Background: `#eff6ff` (light blue)
- Border: `2px solid #3b82f6` (blue top and bottom)
- Indent: `52px` (aligns with content past row number column)

**Level 2 (Nested Within Expansion):**
- Background: `#f0f9ff` (lighter blue)
- Border: `2px solid #60a5fa` (lighter blue left border)
- Additional indent: `+20px`

**Selected Row Styling:**
- Background: `#dbeafe` (selected blue)
- Border: `2px solid #3b82f6` (matches expansion border)
- Creates visual connection between row and its expansion

**Chevron Column:**
- Width: `48px`
- Pinned left (after row number column)
- Icon size: `16px`
- Color: `#9ca3af` (collapsed), `#3b82f6` (expanded)

## Architecture

### Component Structure

```
OperatorGrid (modified)
├── ag-Grid props: masterDetail={true}
├── Custom chevron column (replaces default expand icon)
├── detailCellRendererParams
│   └── ExpansionPanel component
│       ├── Actions section
│       ├── History section (collapsible)
│       └── Children section (collapsible, recursive)
```

### Modified Components

**OperatorGrid.tsx**
- Add `expansionConfig` prop to enable inline expansion
- Add `isRowMaster` predicate (determines which rows can expand)
- Add chevron column to column definitions
- Configure `detailCellRendererParams` with ExpansionPanel renderer
- Remove tray state management (`lineTrayOpen`, etc.)

**OperationsViews.tsx**
- Remove tray toggle buttons and state
- Pass expansion config to OperatorGrid
- Move tray action buttons into expansion config
- Clean up unused tray UI code

### New Components

**ExpansionPanel.tsx**
```typescript
interface ExpansionPanelProps {
  row: GridRow;
  view: ViewKey;
  expansionTypes: Array<'actions' | 'history' | 'children'>;
  actionsRenderer?: (row: GridRow) => ReactNode;
  historyRenderer?: (row: GridRow) => ReactNode;
  childrenRenderer?: (row: GridRow) => ReactNode;
}
```
- Renders inside ag-Grid's detail row
- Accordion sections for each expansion type
- Handles nested expansion state
- Manages loading states for async content (history fetching)

**ExpansionChevronColumn.tsx**
- Custom column component
- Shows ▶ (collapsed) / ▼ (expanded) based on ag-Grid state
- Only renders on rows where `isRowMaster === true`
- Handles click to toggle expansion

### Data Flow

1. User clicks chevron on row
2. ag-Grid expands row → `detailCellRenderer` mounts `<ExpansionPanel>`
3. `ExpansionPanel` reads `row` data and `expansionTypes` config
4. Renders appropriate sections (actions always visible, history/children collapsed by default)
5. User can expand nested sections within the panel
6. Clicking different row's chevron → ag-Grid auto-collapses previous expansion

### State Management

**ag-Grid Manages:**
- Which row is expanded (via master-detail state)
- Auto-collapse behavior
- Keyboard navigation

**React State (within ExpansionPanel):**
- Which nested sections are expanded (history, children)
- Loading states for async content

**No Global State Needed:**
- Expansion is ephemeral UI state, not application state
- Each grid instance manages its own expansion independently

## Migration Strategy

### Phase 1: OperationsViews PO Lines (Pilot)
- Convert `lineTrayOpen` state → inline expansion
- Move "Draft selected", "Remove line" buttons into expansion panel
- Add chevron column
- Remove tray toggle button
- Test with existing PO workflows

**Success Criteria:**
- Operators can expand/collapse line actions via chevron
- Actions work identically to current tray buttons
- Multi-select + bulk actions still work
- No visual regressions in grid layout

### Phase 2: Add History to Expansions
- Implement history section in ExpansionPanel
- Fetch command history for selected row
- Show recent events in accordion style
- Test with various row types

### Phase 3: IntakeView Enhancement
- Keep existing batch expansion (true parent-child relationship)
- Add actions panel to batch detail rows
- Add history panel to both PO and batch rows
- Test intake verification workflow

### Phase 4: Systematic Rollout
- Audit all views with `*TrayOpen` state:
  - `poTrayOpen`, `payoutTrayOpen`, `printTrayOpen` in OperationsViews
  - Any trays in SalesView, MatchmakingView
- Migrate each to inline expansion
- Remove tray UI code after migration

### Rollback Plan
Add feature flag to OperatorGrid:
```typescript
interface OperatorGridProps {
  useInlineExpansion?: boolean; // default: false
}
```
Enable per-view during migration. If issues arise, disable flag to revert to tray pattern.

## Integration Points

### Existing Systems
- **SelectionSummary**: Stays at bottom (always-visible aggregates, not row-specific)
- **Drawers**: Customer/vendor relationship drawers remain unchanged
- **Sidecars**: Issue sidecars remain for complex editing
- **IntakeView master-detail**: Enhance, don't replace

### ag-Grid Configuration
```typescript
// OperatorGrid additions
<AgGridReact
  masterDetail={expansionConfig?.enabled ?? false}
  detailRowAutoHeight={true}
  detailCellRendererParams={{
    detailGridOptions: expansionDetailRenderer(row, view, expansionConfig)
  }}
  isRowMaster={(dataItem) => {
    // Rows with actions, history, or children can expand
    return hasExpandableContent(dataItem, expansionConfig);
  }}
/>
```

### Accessibility
- Chevron has `aria-label="Expand row details"` / `"Collapse row details"`
- Expansion panel has `role="region"` and `aria-label` describing content
- Keyboard: Space/Enter on chevron toggles expansion
- Screen readers announce expansion state changes

## Error Handling

**History Fetch Failure:**
- Show inline error message: "Unable to load history"
- Provide "Retry" button
- Log error to console for debugging

**Child Records Fetch Failure:**
- Show error state in children section
- Don't block other expansion sections (actions still work)

**Expansion Rendering Error:**
- Catch with error boundary
- Show fallback UI: "Unable to display row details"
- Log error with row ID and view name

**Performance Degradation:**
- If grid has 500+ rows, consider lazy-loading expansion content
- Monitor render time, warn if expansion takes >100ms

## Testing Strategy

### Unit Tests
- ExpansionPanel renders actions section correctly
- ExpansionPanel renders history section when configured
- Chevron column shows correct icon for expanded/collapsed state
- Auto-collapse works when expanding different row
- Nested accordion sections toggle independently

### Integration Tests
- Multi-select works with inline expansion enabled
- Bulk actions work when multiple rows selected (none expanded)
- CSV export excludes expansion row content
- Grid filtering/sorting doesn't break expansion state
- Keyboard navigation (arrows, enter, space) works correctly

### Live QA Checklist
- [ ] Launch dev server (`pnpm dev`)
- [ ] Navigate to Operations → Purchase Orders
- [ ] Select a PO with lines
- [ ] Click chevron on a line → actions expand inline
- [ ] Click "Draft selected" → command executes correctly
- [ ] Click chevron on different line → previous auto-collapses
- [ ] Expand history section within actions → shows recent events
- [ ] Multi-select 3 lines → bulk "Draft selected" works
- [ ] Test with 100+ line PO → no performance issues
- [ ] Test keyboard navigation (tab, enter, arrows)
- [ ] Test screen reader announces expansion state

### Visual Regression
- Screenshot grids before and after (collapsed state should look identical)
- Screenshot expanded state with actions
- Screenshot nested expansion (actions + history)
- Compare indentation, colors, borders match design tokens

## Performance Considerations

**Rendering:**
- ExpansionPanel only mounts when row is expanded (lazy)
- History fetching is async, doesn't block actions section
- Auto-collapse ensures max one expansion panel mounted at a time

**Large Datasets:**
- ag-Grid's virtual scrolling handles large row counts
- Expansion content is scoped to one row → no N×M rendering problem
- Consider pagination or infinite scroll for child records if >100 items

**Memory:**
- Unmount expansion panel when collapsed (ag-Grid does this)
- Don't cache history data in React state (refetch on expand)

## Future Enhancements

**Quick Actions Menu:**
- Right-click on row → context menu with most common actions
- Keyboard shortcut (Cmd+K) to open action palette for selected row

**Pinned Expansions:**
- Option to "pin" an expansion open while selecting other rows
- Useful for comparing two rows side-by-side

**Inline Editing:**
- Edit row fields directly within expansion panel
- Avoid jumping to edit modal for simple field changes

**Expansion Templates:**
- Let users customize which sections show by default
- Save preferences per view in localStorage

## Success Metrics

**UX Improvement:**
- Time to perform action on selected row (target: <2 seconds vs. current ~4 seconds with tray)
- Operator feedback: "easier to find actions" (qualitative)

**Code Quality:**
- Reduction in tray-related state management code (-30%)
- Increased reusability (ExpansionPanel used across 4+ views)

**Performance:**
- Grid render time unchanged (expansion is lazy)
- Time-to-interactive unchanged or better

## Open Questions & Decisions

**Q: Should expansion persist across page navigation?**  
A: No. Expansion is ephemeral UI state. Navigating away and back resets to collapsed.

**Q: What if a row has no actions but does have history?**  
A: Show history section only. Actions section is optional based on config.

**Q: Can users resize the expansion panel height?**  
A: Not in v1. ag-Grid's `detailRowAutoHeight` handles this automatically.

**Q: Should expansion state sync across browser tabs?**  
A: No. Independent UI state per tab.

**Q: What about mobile/tablet?**  
A: Out of scope for v1 (TERP is desktop-first). Future: consider touch gestures for expand/collapse.

## Implementation Checklist

- [ ] Create `ExpansionPanel.tsx` component
- [ ] Create `ExpansionChevronColumn.tsx` component  
- [ ] Modify `OperatorGrid.tsx` to support `expansionConfig` prop
- [ ] Add master-detail configuration to ag-Grid
- [ ] Implement `isRowMaster` predicate
- [ ] Add visual design tokens to CSS
- [ ] Migrate OperationsViews line tray to inline expansion
- [ ] Remove `lineTrayOpen` state and UI
- [ ] Write unit tests for ExpansionPanel
- [ ] Write integration tests for OperatorGrid expansion
- [ ] Manual QA: test all checklist items
- [ ] Visual regression: compare screenshots
- [ ] Performance test: 100+ row grid
- [ ] Accessibility audit: keyboard nav + screen reader
- [ ] Update user documentation
- [ ] Migrate remaining trays (PO, payout, print)
- [ ] Remove old tray code
- [ ] Final verification: all views work correctly
- [ ] Push to main
