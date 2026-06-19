# Credit Domain

## Public API

| Export | Type | Description |
|--------|------|-------------|
| `commands.ts` → `assessCustomerCredit` | Command | Run a credit assessment |
| `commands.ts` → `setCreditLimit` | Command | Manually set credit limit |
| `commands.ts` → `enableCreditEngine` | Command | Enable auto credit engine |
| `commands.ts` → `disableCreditEngine` | Command | Disable auto credit engine |

## Depends On

- `src/server/services/creditEngine/` — credit scoring engine
- `src/server/schema.ts` — customer table references
- `src/shared/customerSafeStatus.ts` — safe status computation

## Consumed By

- `src/client/views/CreditView.tsx` — credit management view
- `src/server/routers/credit.ts` — credit query router

## Tests

- `src/server/routers/credit.test.ts` — credit router tests
- `src/server/routers/credit.negativeRoles.test.ts` — role gating tests
- `src/domains/credit/__tests__/integration.test.ts` — command integration
