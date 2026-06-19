# Matchmaking Domain

## Public API

| Export | Type | Description |
|--------|------|-------------|
| `commands.ts` → `createCustomerNeed` | Command | Register a customer need |
| `commands.ts` → `createVendorSupply` | Command | Register vendor supply |
| `commands.ts` → `createMatch` | Command | Match need to supply |

## Depends On

- `src/domains/shared/journal.ts` — command journal writer
- `src/shared/statuses.ts` — MatchmakingMatchStatus enum

## Consumed By

- Matchmaking grid view

## Tests

- `src/domains/matchmaking/__tests__/integration.test.ts` — command integration
