# Payments Domain

## Public API

| Export | Type | Description |
|--------|------|-------------|
| `commands.ts` → `allocatePayment` | Command | Allocate payment to invoices |
| `commands.ts` → `logPayment` | Command | Record a new payment |
| `commands.ts` → `refundPayment` | Command | Refund a payment |
| `commands.ts` → `recordVendorPayment` | Command | Record vendor payout |
| `payments.router.ts` → `paymentExternalReceipt` | Query | External receipt for customer payment |
| `payments.router.ts` → `paymentInternalReceipt` | Query | Internal receipt with allocation details |
| `payments.router.ts` → `paymentSignalText` | Query | SMS/signal text summary |
| `payments.router.ts` → `paymentPrintHtml` | Query | Printable HTML receipt |
| `payments.router.ts` → `vendorPaymentExternalReceipt` | Query | External vendor payout receipt |
| `payments.router.ts` → `vendorPaymentInternalReceipt` | Query | Internal vendor payout receipt |
| `payments.router.ts` → `vendorPaymentSignalText` | Query | SMS/signal text for vendor payout |
| `payments.router.ts` → `vendorPaymentPrintHtml` | Query | Printable HTML for vendor payout |

## Depends On

- `src/domains/shared/journal.ts` — command journal writer
- `src/server/services/documentSnapshots.ts` — receipt projection
- `src/shared/schemas.ts` — Zod validation schemas
- `src/shared/statuses.ts` — PaymentStatus enum

## Consumed By

- `src/client/views/PaymentsView.tsx` — main payments grid
- `src/client/views/VendorPayablesView.tsx` — vendor payments view
- `src/client/components/ReceiptPanel.tsx` — receipt viewer
- `src/server/routers/index.ts` — appRouter merge

## Tests

- `src/server/routers/queries.moneyReceipts.test.ts` — receipt query tests
- `src/domains/payments/__tests__/integration.test.ts` — command integration
