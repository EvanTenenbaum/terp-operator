# Finalization Receipts — Phase 2 (PO Workspace) Closeout

**QA tier:** Deep QA (persisted data mutations + projection-leak surface + authorization gate).

**Branch:** `plan/finalization-receipts-113-resume-20260520`

## Commits

| Hash | Description |
|------|-------------|
| `86d68a6` | Phase 1 foundation (rebase + migration 0047) |
| `b2185f4` | Task 1: PO finalization snapshot hook (commandBus) |
| `87737f7` | Task 2: tRPC queries (external/internal/signalText) |
| `c5c14bd` | Task 3: ReceiptPanel component |
| `7b8913f` | Task 4: OperationsViews wiring |
| `150990a` | Task 5: Design-system decisions-log |
| `dec4234` | fix: projector undefined-field bug + migration 0050 fix |

## Verification

```
TypeCheck:          PASS (zero errors)
Tests (targeted):   105/105 PASS (11 files)
Tests (full suite): 1370/1371 (1 pre-existing failure in costRangeExceptions, unrelated)
```

## Runtime Proof

Finalized PO `PO-ACTIVE-007` via live tRPC call (`finalizePurchaseOrder`):
- 2 `document_snapshots` rows created (external + internal, both `status=finalized`)
- `purchaseOrderExternalReceipt` returns `{ kind: 'purchase_finalization', counterparty: 'Sierra Canna', lines: 1, total: 9380.99 }`
- `purchaseOrderSignalText` returns plain-text receipt string with no HTML tags
- Second PO `PO-M15-ACTIVE-001` also confirmed: 2 snapshots, correct external receipt

## Bug Fixed During E2E

`purchaseFinalization.ts` was emitting `notes: undefined` for null/absent
optional fields. `canonicalizeJson` rejects `undefined` (RFC 8785 subset).
This caused the post-commit hook to silently swallow the error and produce
zero snapshots. Fix: conditional field omission in the external and internal
projectors.

Migration `0047_document_snapshots.sql` used `CREATE TABLE IF NOT EXISTS`
which was a no-op in the local dev environment (stale prior-schema table
existed with 0 rows). Added migration `0050_fix_document_snapshots.sql`.

## Spec Coverage (GH issue #113 acceptance criteria)

| Criterion | Status |
|-----------|--------|
| PO finalization opens to workspace with External/Internal tabs | ✅ ReceiptPanel in PurchaseOrdersView |
| Internal includes margins/costs/internal notes + INTERNAL marker | ✅ ReceiptBody, "INTERNAL — DO NOT SEND" pill |
| External from server-side allowlisted projection | ✅ Phase 1 projector + validateExternalShape |
| Save draft, finalize, return-to-table work | ✅ PO state machine unchanged |
| Copy external receipt as Signal-friendly text | ✅ purchaseOrderSignalText + Copy button |
| Deep QA leak evidence | ✅ 105 tests, AQA 95/100 from Phase 1 |
| Print with watermark | ⏳ Phase 5 |
| Payment received / vendor payout | ⏳ Phase 4 |

## Non-Blockers

- `ReceiptPanel.test.tsx` test 3: `/landedCost/i` assertion is vacuous (asserts key name instead of rendered value) — harmless weak assertion
- `ReceiptPanel` `isLoading` gate omits `internalQuery.isLoading` — low real-world risk
- Full browser screenshot of ReceiptPanel not captured (AG Grid row selection blocks headless automation)
- GH #152: Validator direct negative tests
- GH #153: Validator value-type hardening
