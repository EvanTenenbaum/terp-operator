<!--
HOW TO FILL THIS OUT
====================
1. Read MERCURY-ARCHITECTURE-MANIFESTO.md §§1–3, §6 before filling any field.
2. Fill every field marked with * in the Manifesto Anchoring table.
3. "e.g." values in the table are placeholders — replace them with real
   rule numbers, tier labels, old patterns, URL params, infra names,
   anti-patterns, and a concrete compliance check.
4. The Manifesto Anchoring section is MANDATORY. A spec missing any * field
   is not ready for agent dispatch (§7.3).
5. Body sections (Purpose through Risk Notes) are also mandatory.
   Every state (loading, empty, error, edge) must be defined.
6. Delete this comment block before committing the spec.
-->

> ⚠️ **ARCHITECTURE GATE:** This spec must comply with [MERCURY-ARCHITECTURE-MANIFESTO.md](../MERCURY-ARCHITECTURE-MANIFESTO.md).
> Before filling this out, read §§1–3, §6 of the manifesto.
> **A spec missing the Manifesto Anchoring section is not ready for agent dispatch.**

---

# [View / Component / Hook / Procedure] Spec: [Name]

<!-- Pick one type above; delete the others. -->

**Type:** `view` | `component` | `hook` | `procedure`
**Target file:** `src/[client|server]/[path/to/file].{ts|tsx}`
**Agent:** `build` | `fast-build` | `opus-build` | `terminal`

---

## Manifesto Anchoring (DO NOT SKIP)

| Field* | Value |
|--------|-------|
| **UX Rule(s) Served** | <!-- e.g., UX-3 (one primary surface), UX-1 (state-gated actions) --> |
| **ARCH Rule(s) Followed** | <!-- e.g., ARCH-3 (one data source), ARCH-1 (entity state gate) --> |
| **Attention Budget Tier** | <!-- 0-hop / 1-hop / 2+-hop --> |
| **Old Pattern Replaced** | <!-- e.g., per-view ColDef arrays → entity-schemas.ts. If nothing replaced, say "None — new surface" with rationale. --> |
| **URL State Encoded** | <!-- e.g., activeSaleId, slideOverEntity, activeFilter, drawState. If none, say "None" and justify. --> |
| **Existing Infra Leveraged** | <!-- e.g., ContextDrawer (refactored to SlideOver), useUiStore, useCommandRunner, OperatorGrid, useConfirm. If nothing, justify why parallel build is necessary (rare). --> |
| **Anti-Patterns Avoided** | <!-- e.g., no per-view useMemo closures, no useQuery outside useViewData, no WorkspacePanel wrapper, no window.confirm. List the §6 patterns that would be tempting here but are explicitly forbidden. --> |
| **Compliance Check** | <!-- 2-4 line summary of HOW a reviewer verifies this spec complies. Be concrete. e.g., "Open React DevTools on cold view load. Tree should contain FilterToolbar, SummaryStrip, PrimaryGrid. If SlideOver or BulkActionBar is mounted, fail." --> |

---

## 1. Purpose

<!-- One sentence. What problem does this solve for the operator? -->

## 2. API Contract

<!-- FOR COMPONENTS/HOOKS: props, return types, query keys, callbacks -->
<!-- FOR BACKEND PROCEDURES: input schema (Zod), output type, tRPC route, role gate -->
<!-- Delete the section that does not apply. -->

### 2a. Props / Signature

```ts
// Props type or procedure signature
```

### 2b. Data Sources

| Query / Mutation | When Issued | Gate |
|-----------------|-------------|------|
| <!-- e.g., trpc.queries.grid.useQuery({ view }) --> | <!-- on mount --> | <!-- enabled: true (primary only) --> |
| <!-- e.g., trpc.queries.entityDetail.useQuery({ id }) --> | <!-- on slide-over open --> | <!-- enabled: Boolean(entityId) --> |

### 2c. Events / Callbacks

<!-- What this component emits, or what hooks the parent wires. -->

## 3. States

<!-- Every state must be defined. Delete rows that do not apply; add rows as needed. -->

| State | Trigger | Visual | Data Behavior |
|-------|---------|--------|---------------|
| **Loading** | <!-- initial mount, refetch --> | <!-- skeleton / spinner / progress --> | <!-- query loading, no data --> |
| **Empty** | <!-- query returned [] --> | <!-- empty-state message with next step --> | <!-- no rows to show --> |
| **Error** | <!-- query/mutation failed --> | <!-- inline error strip, retry button if recoverable --> | <!-- error payload preserved for "Show details" --> |
| **Partial** | <!-- some rows failed in bulk op --> | <!-- success marks + failure marks on affected rows --> | <!-- partial success preserved --> |
| **Success** | <!-- query returned data, mutation committed --> | <!-- normal render, inline confirmation at point of action --> | <!-- primary data rendered --> |
| **Edge: [name]** | <!-- e.g., entity deleted while slide-over open --> | <!-- e.g., slide-over closes, toast --> | <!-- invalidate entity from UI --> |

## 4. Keyboard & Accessibility

<!-- Focus order, ARIA roles, screen reader labels, keyboard shortcuts. -->

| Element | Role | Label | Keyboard |
|---------|------|-------|----------|
| <!-- e.g., PrimaryGrid --> | <!-- grid --> | <!-- "Purchase Orders table" --> | <!-- Arrow keys navigate cells; Enter opens slide-over --> |
| <!-- e.g., SlideOver close button --> | <!-- button --> | <!-- "Close purchase order details" --> | <!-- Escape closes; focus returns to triggering row --> |
| <!-- ... --> | | | |

### Focus Order

<!-- e.g., FilterToolbar → PrimaryGrid → SlideOver (if open) → BulkActionBar (if visible) -->

### Screen Reader Summary

<!-- What a screen reader user hears when landing on this view. -->

## 5. Acceptance Criteria

<!-- Checklist format. Testable, observable, unambiguous. -->

- [ ] <!-- AC-1: e.g., Template renders with FilterToolbar + SummaryStrip + PrimaryGrid on cold load -->
- [ ] <!-- AC-2: e.g., Row click opens SlideOver with correct entity and tabs -->
- [ ] <!-- AC-3: e.g., Selecting rows shows BulkActionBar with intersection of allowed actions -->
- [ ] <!-- AC-4: e.g., All mutations go through useCommandRunner -->
- [ ] <!-- AC-5: e.g., URL encodes drawer state, entity, active tab -->
- [ ] <!-- AC-6: e.g., Typecheck passes -->
- [ ] <!-- AC-7: e.g., Existing tests pass -->
- [ ]

## 6. Dependencies

<!-- What must exist before this can be built. Reference other spec sheets, tasks, or PRs. -->

| Dependency | Status | Blocker? |
|-----------|--------|----------|
| <!-- e.g., entity-schemas.ts must contain purchaseOrder fields --> | <!-- EXISTS / NEEDS_BUILD / BLOCKED --> | <!-- yes / no --> |
| <!-- e.g., SlideOver refactor (ContextDrawer → SlideOver) --> | | |
| <!-- ... --> | | |

## 7. Risk Notes

<!-- What breaks if this is wrong. What to watch for during review. -->

- <!-- e.g., If entity-schemas.ts field types mismatch Zod schemas, cell editors will reject commits at runtime -->
- <!-- e.g., If SlideOver mounts while ContextDrawer is still mounted, double-drawer renders -->

---

## Agent Notes

<!-- Warnings, gotchas, context specific to this item. Anything that would trip up an agent. Delete if empty. -->
