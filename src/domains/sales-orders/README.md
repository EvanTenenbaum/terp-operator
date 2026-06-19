# Sales Orders Domain

## Public API

| Export | Type | Description |
|--------|------|-------------|
| `commands.ts` → `createSalesOrder` | Command | Create a new sales order |
| `commands.ts` → `updateSalesOrder` | Command | Update sales order fields |
| `commands.ts` → `confirmSalesOrder` | Command | Confirm a draft order |
| `commands.ts` → `postSalesOrder` | Command | Post to inventory/ledgers |
| `sales-orders.router.ts` → `salesOrderExternalReceipt` | Query | External-facing confirmation |
| `sales-orders.router.ts` → `salesOrderInternalReceipt` | Query | Internal receipt with margin data |
| `sales-orders.router.ts` → `salesOrderSignalText` | Query | SMS/signal text summary |
| `sales-orders.router.ts` → `salesOrderPrintHtml` | Query | Printable HTML receipt |

## Depends On

- `src/domains/shared/journal.ts` — command journal writer
- `src/domains/shared/socket-emitter.ts` — real-time notifications
- `src/server/services/documentSnapshots.ts` — receipt projection
- `src/shared/schemas.ts` — Zod validation schemas
- `src/shared/statuses.ts` — SalesOrderStatus enum

## Consumed By

- `src/client/views/SalesView.tsx` — main sales grid view
- `src/client/views/sales/SalesBuildMode.tsx` — sales order builder
- `src/client/components/ReceiptPanel.tsx` — receipt viewer
- `src/server/routers/index.ts` — appRouter merge

## Tests

- `src/server/routers/queries.salesReceipts.test.ts` — receipt query tests
- `src/domains/sales-orders/__tests__/integration.test.ts` — command integration
