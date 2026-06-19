# Vendor Management Domain

## Public API

| Export | Type | Description |
|--------|------|-------------|
| `commands.ts` → `createVendorBill` | Command | Create a vendor bill |
| `commands.ts` → `approveVendorBill` | Command | Approve a vendor bill |
| `commands.ts` → `scheduleVendorPayment` | Command | Schedule vendor payment |

## Depends On

- `src/domains/shared/journal.ts` — command journal writer
- `src/shared/statuses.ts` — VendorBillStatus enum

## Consumed By

- `src/client/views/VendorPayablesView.tsx` — vendor payables view

## Tests

- `src/domains/vendor-management/__tests__/integration.test.ts` — command integration
