# Inventory Domain

## Public API

| Export | Type | Description |
|--------|------|-------------|
| `commands.ts` → `adjustInventory` | Command | Adjust batch quantities |
| `commands.ts` → `transferInventory` | Command | Transfer between locations |
| `inventory.router.ts` → `receiptPreview` | Query | Preview batch receipt before finalizing |

## Depends On

- `src/domains/shared/journal.ts` — command journal writer
- `src/shared/statuses.ts` — BatchStatus enum

## Consumed By

- `src/client/components/ReceiptPreviewDrawer.tsx` — receipt preview drawer
- `src/server/routers/index.ts` — appRouter merge

## Tests

- `src/domains/inventory/__tests__/integration.test.ts` — command integration
