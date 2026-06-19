# Pick Domain

## Public API

| Export | Type | Description |
|--------|------|-------------|
| `commands.ts` → `createPickList` | Command | Create a warehouse pick list |
| `commands.ts` → `releasePick` | Command | Release pick for fulfillment |
| `commands.ts` → `completePick` | Command | Mark pick as complete |

## Depends On

- `src/domains/shared/journal.ts` — command journal writer
- `src/shared/statuses.ts` — PickListStatus enum

## Consumed By

- Pick queue UI components
- Fulfillment workflow

## Tests

- `src/domains/pick/__tests__/integration.test.ts` — command integration
