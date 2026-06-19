# Anti-Patterns

Before/after examples from the TERP Operator codebase.

## God Files

**Before (anti-pattern)**:
```typescript
// src/server/routers/queries.ts — 3,943 lines
// Contains 50+ procedures across 10+ domains:
// purchase orders, sales orders, payments, inventory,
// contacts, matchmaking, photography, disputes...
export const queriesRouter = router({
  purchaseOrderExternalReceipt: ...,
  salesOrderExternalReceipt: ...,
  paymentExternalReceipt: ...,
  contactProfile: ...,
  // ... 45 more procedures
});
```

**After (preferred)**:
```typescript
// src/server/routers/purchase-orders.router.ts — 60 lines
export const purchaseOrdersRouter = router({
  purchaseOrderExternalReceipt: ...,
  purchaseOrderInternalReceipt: ...,
  purchaseOrderSignalText: ...,
  purchaseOrderPrintHtml: ...,
});
```

## Silent Catches

**Before (anti-pattern)**:
```typescript
try {
  await pool.query(sql, params);
} catch (e) {
  // fail silently
}
```

**After (preferred)**:
```typescript
try {
  await pool.query(sql, params);
} catch (e) {
  logger.error('Failed to query purchase orders', { error: e });
  throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database query failed' });
}
```

## `as any` Type Assertions

**Before (anti-pattern)**:
```typescript
const data = result.rows as any;
data.entityType = entityType;
```

**After (preferred)**:
```typescript
const data = result.rows as Record<string, unknown>[];
(data as Record<string, unknown> & { entityType: string }).entityType = entityType;
// Or better: use a proper type guard
```

## `console.log` in Production

**Before (anti-pattern)**:
```typescript
console.log(`TERP Operator server listening on http://localhost:${env.PORT}`);
console.warn('[loadClientConfig] Timed out, proceeding without AG Grid license');
```

**After (preferred)**:
```typescript
import { logger } from './services/logger';
logger.info(`TERP Operator server listening on http://localhost:${env.PORT}`);
logger.warn('Timed out, proceeding without AG Grid license', { module: 'loadClientConfig' });
```

## No Error Boundaries

**Before (anti-pattern)**:
```tsx
function MyComponent() {
  const query = trpc.queries.grid.useQuery(input);
  // If query.error, component crashes
  return <Grid data={query.data} />;
}
```

**After (preferred)**:
```tsx
function MyComponent() {
  const query = trpc.queries.grid.useQuery(input);
  if (query.error) {
    return <ErrorFallback error={query.error} onRetry={() => query.refetch()} />;
  }
  if (query.isLoading) {
    return <LoadingSkeleton />;
  }
  return <Grid data={query.data} />;
}
```

## Inline Cell Renderers (client-side)

**Before (anti-pattern)**:
```typescript
{
  field: 'amount',
  cellRenderer: (params) => `<span>$${params.value.toFixed(2)}</span>`,
}
```

**After (preferred)**:
```typescript
// Define in entity-schemas.ts
{
  field: 'amount',
  type: 'currency',
  // Renderer handled by grid column factory from field type
}
```

## String-Interpolated SQL

**Before (anti-pattern — SECURITY RISK)**:
```typescript
const sql = `SELECT * FROM batches WHERE name = '${userInput}'`;
await pool.query(sql);
```

**After (preferred)**:
```typescript
const sql = `SELECT * FROM batches WHERE name = $1`;
await pool.query(sql, [userInput]);
```

## Circular Dependencies

**Before (anti-pattern)**:
```typescript
// gridWhere.ts imports from queries.ts
import type { viewSchema } from './queries';

// queries.ts imports from gridWhere.ts
import { BASE_WHERE, buildGridWhereClause } from './gridWhere';
// → Circular dependency!
```

**After (preferred)**:
```typescript
// gridWhere.ts imports from shared
import type { viewSchema } from '../../shared/grid-types';

// queries.ts imports from shared
import { viewSchema } from '../../shared/grid-types';
export { viewSchema }; // re-export for backward compat
// → No circular dependency
```
