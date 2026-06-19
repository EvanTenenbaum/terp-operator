# Purchase Orders Domain

## Public API

| Export | Type | Description |
|--------|------|-------------|
| `commands.ts` → `createPurchaseOrder` | Command | Create a new purchase order |
| `commands.ts` → `updatePurchaseOrder` | Command | Update PO header fields |
| `commands.ts` → `cancelPurchaseOrder` | Command | Cancel a PO |
| `commands.ts` → `receivePurchaseOrder` | Command | Mark PO as received |
| `purchase-orders.router.ts` → `purchaseOrderExternalReceipt` | Query | External-facing receipt projection |
| `purchase-orders.router.ts` → `purchaseOrderInternalReceipt` | Query | Internal receipt with cost details |
| `purchase-orders.router.ts` → `purchaseOrderSignalText` | Query | SMS/signal text summary |
| `purchase-orders.router.ts` → `purchaseOrderPrintHtml` | Query | Printable HTML receipt |

## Depends On

- `src/domains/shared/journal.ts` — command journal writer
- `src/domains/shared/socket-emitter.ts` — real-time notifications
- `src/server/services/documentSnapshots.ts` — receipt projection
- `src/shared/schemas.ts` — Zod validation schemas
- `src/shared/statuses.ts` — PurchaseOrderStatus enum

## Consumed By

- `src/client/views/PurchaseOrdersView.tsx` — main PO grid view
- `src/client/components/ReceiptPanel.tsx` — receipt viewer
- `src/client/components/ReceiptPreviewOverlay.tsx` — PO receipt overlay
- `src/server/routers/index.ts` — appRouter merge

## Tests

- `src/server/routers/queries.receipts.test.ts` — receipt query tests
- `src/domains/purchase-orders/__tests__/integration.test.ts` — command integration
