# Finalization Receipts — Phase 4 (Money Receipts) Closeout

**QA tier:** Deep QA (persisted data mutations + external API + multi-step side effects).
**Branch:** plan/finalization-receipts-phase4-113

## Verification
- TypeCheck: PASS (zero errors)
- Tests: 171/171 PASS (17 files)

## Spec coverage (#113 Phase 4)
- logPayment → payment_received snapshots: createPaymentReceivedReceipts hook
- recordVendorPayment → vendor_payout snapshots: createVendorPayoutReceipts hook
- 6 tRPC procedures for money receipts (all protectedProcedure)
- ReceiptPanel widened to 4 kinds (discriminated union)
- PaymentsView wired (gated on selectedPayment.id)
- VendorBillTools wired (gated on chosenPaymentId)
- Stub projector hygiene: conditional spread fixes for both stubs
- Print/watermark: Phase 5

## Follow-ups (Decision 16)
- Ledger-driven payments via postLedgerRow → logPayment NOT hooked (Phase 5 ticket)
- vendor_payments has no per-payout notes column; surfaces bill discrepancy_notes
- refundPayment/voidVendorPayment do NOT supersede existing snapshots
