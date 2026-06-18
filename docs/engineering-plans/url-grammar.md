# URL State Grammar — Mercury View Parameters

**Status:** Design doc — defines the canonical URL query parameter grammar for Mercury views.
**Authority:** `REMAINING-WORK-EXECUTION-PLAN.md` R-10; `MERCURY-ARCHITECTURE-MANIFESTO.md` ARCH-6 (URL as session memory).

---

## Design Principle (UX-11)

> URL is the session memory. Refresh, share, and back must reproduce the exact view including slide-over, filters, tab, selection.

Every Mercury view encodes its recoverable state in the URL query string. State that does **not** survive in the URL (transient UI-only state like scroll position, column resize, or hover) is explicitly documented as transient.

---

## Parameter Grammar

Parameters use short keys to keep URLs compact. All values are strings. Lists use `,` as separator. Special characters in values are percent-encoded.

| Param     | Example              | Encodes                                   | Back-Compat Note |
|-----------|----------------------|-------------------------------------------|------------------|
| `status`  | `open`               | Active status filter (single value). Empty=all. | Replaces legacy `ViewTabBar` tab key. |
| `f`       | `vendor:acme,amt>100`| Grid filter string (compact `field:val` pairs, comma-separated). | Same format as `uiStore.gridFilters[view]` today. |
| `q`       | `tomatoes`           | Free-text keyword search.                 | New. |
| `customer`| `uuid-here`          | Active customer context (SalesView).      | Already used by SalesView/MatchmakingView. |
| `vendor`  | `uuid-here`          | Active vendor context (MatchmakingView).  | Already used by MatchmakingView. |
| `tab`     | `timeline`           | Active slide-over tab key.                | New; replaces read from `uiStore.drawerByView.tab`. |
| `drawer`  | `standard`           | Slide-over state: `closed`, `peek`, `standard`, `wide`. | Preserves `useDrawerUrlSync` param name. |
| `entityType` | `sale`           | Active entity type in slide-over.         | Preserves `useDrawerUrlSync` param name. |
| `entityId` | `uuid-here`        | Active entity UUID in slide-over.         | Preserves `useDrawerUrlSync` param name. |
| `sel`     | `id1,id2,id3`        | Comma-separated selected row IDs (max 50). | New; compact; truncated if >500 chars. |
| `page`    | `3`                  | Current AG Grid page (server-side pagination). | New. |
| `sort`    | `status:asc,amt:desc`| Sort model (field:dir pairs, comma-separated). | New; format aligned with AG Grid sort model. |

---

## Compression Rules

1. **Default values are omitted.** `drawer=closed`, `status` empty, `page=1`, empty `sel` — none appear in URL.
2. **`entityId` requires `entityType`.** If `entityType` is absent, `entityId` is ignored.
3. **`tab` requires `entityType`+`entityId`.** A tab key without an active entity is ignored.
4. **Length cap on `sel`:** If the serialized `sel` value exceeds 500 characters, truncate at the last complete UUID before the limit; selection restoration is best-effort.
5. **Order stability:** Parameters are sorted alphabetically when written so URL comparison is deterministic.

---

## Example URL

```
/app/purchase-orders?drawer=standard&entityId=abc-123&entityType=purchaseOrder&f=vendor:acme&page=2&q=tomato&sort=deliveryDate:asc&status=open&tab=lines
```

---

## Implementation Hook

`src/client/hooks/useViewUrlState.ts` wraps `useDrawerUrlSync` and extends it with the full grammar. Views call one hook instead of ad-hoc `useSearchParams` reads.

```ts
interface ViewUrlState {
  // Slide-over
  drawer: SlideoverState;
  entityType: string | null;
  entityId: string | null;
  tab: string | null;
  // Filters
  status: string;
  filter: string;       // mapped to f=
  keyword: string;      // mapped to q=
  // Selection / pagination
  selectedIds: string[];
  page: number;
  sort: Array<{ colId: string; sort: 'asc' | 'desc' }>;
}
```

---

## Migration Path

1. **Phase 0b:** `useViewUrlState` lands; `GridView` (PrimaryGridView) adopts it for `status`, `f`, `drawer`, `entityType`, `entityId`.
2. **Phase 2:** Per-view migration adds `tab`, `q` support as views adopt `FilterToolbar`.
3. **Phase 3C:** SalesView `customer` param integrated into the unified hook.
4. **Phase 4:** Legacy `useDrawerUrlSync` removed; all views use `useViewUrlState`.

---

## Back-Compat

- `useDrawerUrlSync` param names (`drawer`, `entityType`, `entityId`) are **preserved**.
- Views not yet migrated continue to use `useDrawerUrlSync` directly.
- The new `f` param uses the same `field:val` format as today's `uiStore.gridFilters` — no migration needed for stored filters.
