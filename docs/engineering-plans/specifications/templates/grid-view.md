# GridView — Template Specification

**Type:** View layout template
**Used by:** ~15 views
**Replaces:** Per-view layout code, GridJourney factory

## API Contract
```typescript
interface GridViewProps {
  viewKey: ViewKey;
  headerContent?: ReactNode;        // Above FilterToolbar (bespoke)
  preGridContent?: ReactNode;       // Between SummaryStrip and grid (bespoke)
  postGridContent?: ReactNode;      // Below grid (bespoke)
}
```

## Layout
```
┌─FilterToolbar────────────────────────────────────────────┐
├─GridSummaryStrip──────────────────────────────────────────┤
├─ViewTabBar────────────────────────────────────────────────┤
├─OperatorGrid──────────────────────────────────────────────┤
├─BulkActionBar (conditional)───────────────────────────────┘
  DetailSlideover (right, conditional)
```

## Extension Slots
Views inject bespoke content via slots. Standard views don't use slots. Complex views (SalesView) use them for workspace context, customer header, etc.

## Data Flow
1. Template reads `viewKey` → `getViewConfig(viewKey)` from registry
2. Config provides: entity schema, state machine, summary query, detail tabs, filter presets
3. Template renders components from config + grid data from `useViewData(viewKey)`
4. Extension slots inject bespoke sections where needed

## File
`src/client/templates/GridView.tsx`
