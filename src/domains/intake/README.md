# Intake Domain

## Public API

| Export | Type | Description |
|--------|------|-------------|
| `commands.ts` → `intakeBatch` | Command | Create a new batch (inbound inventory) |
| `commands.ts` → `updateBatch` | Command | Update batch fields |
| `commands.ts` → `postBatch` | Command | Post batch to available inventory |

## Depends On

- `src/domains/shared/journal.ts` — command journal writer
- `src/shared/schemas.ts` — Zod validation schemas
- `src/shared/statuses.ts` — BatchStatus enum

## Consumed By

- `src/client/views/IntakeView.tsx` — intake grid view
- `src/server/routers/intake.router.ts` — intake query router

## Tests

- `src/domains/intake/__tests__/integration.test.ts` — command integration
