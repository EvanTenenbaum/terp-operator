# Wave 5 — Product Calls to Route

These three items are product/registry decisions, not code fixes. Each needs a registry row and Evan decision before implementation.

## SX-J15 — Operator-entered payment references

**Finding:** Operator-entered payment references don't exist (auto-generated only), so bank/check reconciliation and duplicate-reference detection have no input.

**Recommendation:** Add a `reference` field to the Quick Ledger row and the `postTransactionLedgerRow` command. The field should be optional but visible. A duplicate-reference warning (same reference + same counterparty within N days) would prevent double-entry. Registry row needed: new capability under CMD-PAYMENTS.

**Effort:** M (new field + duplicate check)

## SX-K15 — Warehouse/picker role

**Finding:** There is no warehouse role. Pickers run as owner/manager/sales and the mobile shell exposes full financials (dashboard, payments, contact balances) to whoever holds the picking phone. The only mobile gate found is `canPayVendor`.

**Recommendation:** Registry row for a new `warehouse` role (or `picker` role) that has read-only access to fulfillment/pick surfaces and no access to financials. The mobile shell should scope to pick-relevant views only when running as warehouse. This is a new capability row (CAP-NNN), not a UI fix.

**Effort:** L (new role + mobile shell scoping + permissions audit)

## Draft-hygiene command (SX-D02 follow-up)

**Finding:** SX-D02 added per-row discard buttons, but bulk operations (bulk discard, clear posted) and a full draft-hygiene command may need server-side procedures.

**Recommendation:** If bulk draft operations need transactional guarantees or audit trails, a new `clearQuickLedgerDrafts` or `discardQuickLedgerDrafts` command should be added. Registry row under CMD-PAYMENTS if needed. The current per-row discard via `saveQuickLedgerDrafts` mutation may be sufficient — monitor operator feedback.

**Effort:** S (if per-row discard suffices) / M (if new command needed)
