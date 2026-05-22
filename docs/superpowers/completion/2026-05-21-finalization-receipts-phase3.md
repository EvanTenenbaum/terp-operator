# Finalization Receipts — Phase 3 (Sales Confirmation + Invoice) Closeout

**QA tier:** Deep QA (persisted data mutations + projection-leak surface + money-relevant workflow).

**Branch:** `plan/finalization-receipts-phase3-113`

## Commits

| Hash | Description |
|------|-------------|
| `de67c6d` | Phase 3 plan |
| `67d7415` | Task 1: salesConfirmationReceipts hook + undefined-field fix |
| `6779a82` | Task 2: invoiceReceipts hook |
| `2b3f9d5` | Fix: conditional spread for cogs/margin/diagnostics in salesConfirmation + invoice |
| `5470f13` | Task 3: tRPC sales receipt procedures |
| `3c8674a` | Task 4: ReceiptPanel kind discriminator + SalesView wiring |

## Verification

```
TypeCheck:          PASS (zero errors)
Tests (targeted):   133/133 PASS (14 files)
```

Includes:
- 87 Phase 1+2 tests still green
- 7 salesConfirmationReceipts tests
- 8 invoiceReceipts tests
- 9 salesOrderReceipt router tests
- 10 ReceiptPanel tests (6 PO + 4 sales mode)
- 53 projector suite (with undefined-field fix)

## Bug fixed during implementation

Same undefined-field `canonicalizeJson` bug applied to `salesConfirmation.ts` and `invoice.ts`:
- Line-level `notes: undefined` → conditional key omission
- `cogs: undefined`, `margin: undefined`, `diagnostics: undefined` → conditional spread

## Spec coverage (#113 Phase 3)

| Criterion | Status |
|-----------|--------|
| confirmSalesOrder wired to snapshots | ✅ createSalesConfirmationReceipts hook |
| postSalesOrder wired to invoice snapshots | ✅ createInvoiceReceipts hook |
| Invoice receipt via same pipeline | ✅ invoice projector, sourceEntityType='invoice' |
| Leak guards (6 internal line fields) | ✅ helper tests assert external payload has none |
| Receipt visible in SalesView | ✅ ReceiptPanel in Sale Builder for confirmed/posted/fulfilled |
| Manager-only Internal tab | ✅ assertRole + isManagerOrOwner gate |
| Copy for Signal | ✅ salesOrderSignalText with invoice-first precedence |
| Print with watermark | ⏳ Phase 5 |
| Payment/vendor payout receipts | ⏳ Phase 4 |

## Non-blockers

- GH #152: Validator direct negative tests
- GH #153: Validator value-type hardening
- Phase 5: print HTML + watermark
- Phase 4: payment_received / vendor_payout real projectors
