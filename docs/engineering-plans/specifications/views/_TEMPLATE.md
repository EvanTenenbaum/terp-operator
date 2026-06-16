# [ViewName] — Retrofit Specification

**Template:** [GridView | MasterDetailView | DashboardView | WizardView | Custom]
**Current file:** `src/client/views/[ViewName].tsx` ([N] lines)
**Target file:** `src/client/views/[ViewName].tsx` (~[M] lines after retrofit)

---

## Current Layout (Pre-Retrofit)

[Describe current panel arrangement. What's visible simultaneously?]

## Target Layout (Post-Retrofit)

```
┌─[ASCII diagram of retrofitted layout]─────────────────────┐
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Component Wiring

| Component | Configuration | Notes |
|-----------|--------------|-------|
| **Template** | [template name] | |
| **FilterToolbar** | Presets: [...] | |
| **ViewTabBar** | Tabs: [...] | |
| **GridSummaryStrip** | Metrics: [...] | Aggregate query: `trpc.queries.[...].useQuery()` |
| **BulkActionBar** | Entity state machine: `[entityName]` | |
| **DetailSlideover** | Entity type: `[entityType]` | Tabs: [...] |
| **ComboboxCellEditor** | Columns: [field1, field2, ...] | |

## Preserved Functionality

| Current Feature | How Preserved |
|----------------|---------------|
| [command/action] | [trigger path in retrofitted layout] |
| [context panel] | [location: inline / slide-over tab / modal] |
| [filter preset] | [ViewTabBar tab or FilterToolbar preset] |
| [expansion config] | [kept as row expansion OR moved to slide-over] |
| ... | ... |

## Cross-Reference Workflows

| Workflow | Panels Needed | Preservation Strategy |
|----------|--------------|----------------------|
| [workflow description] | [panels] | [inline / slide-over / modal] |
| ... | ... | ... |

## Existing Tests

| Test File | Must Pass? |
|-----------|-----------|
| `[ViewName].[test-suffix].test.tsx` | ✅ |
| ... | ... |

## Acceptance Criteria

- [ ] Template renders correctly
- [ ] FilterToolbar functional
- [ ] ViewTabBar tabs filter correctly
- [ ] GridSummaryStrip shows correct aggregates
- [ ] BulkActionBar shows correct actions per status
- [ ] DetailSlideover opens on row click with correct tabs
- [ ] ComboboxCellEditor functional on specified columns
- [ ] All existing functionality preserved (see Preserved Functionality table)
- [ ] All existing tests pass
- [ ] Typecheck passes
- [ ] Manual browser QA passes

## Agent Notes

[Warnings, gotchas, context specific to this view. Anything that would trip up an agent.]
