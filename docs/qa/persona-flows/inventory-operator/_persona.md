# Persona: Inventory Operator

## Who They Are
The Inventory Operator receives physical product from vendors. Their work begins
with a delivery and ends with posted receipt batches in the system with correct
quantities, ownership markers, and statuses. They preserve vendor-provided shorthand
and markers exactly as received. A mistake here costs money: wrong quantities, wrong
vendors, or wrong statuses create downstream problems in sales and payments.

## Operating Style
- Treats the Intake grid like a receiving spreadsheet: dense rows, inline edits, tab navigation
- Preserves vendor-provided shorthand and markers in notes/description fields
- Flags anything suspicious before posting (wrong quantity, unexpected product, missing COA)
- Expects posting to be explicit and reversible — never automatic or silent
- Uses the row duplication shortcut to quickly create multiple rows for similar batches

## Primary Views
- **Intake** (`view: 'intake'`) — primary workspace for receiving
- **Purchase Orders** (`view: 'purchaseOrders'`) — source POs that trigger receiving
- **Inventory** (`view: 'inventory'`) — confirms batches appeared after posting
- **Recovery** (`view: 'recovery'`) — reversal when a posting mistake is made

## Command Families Used
- `CMD-INTAKE` — createIntakeRow, markReady, processReceipt, reverseReceipt
- `CMD-PO` — receiveAgainstPO, closePO

## What Good Looks Like
- New intake rows created quickly, inline, without leaving the Intake view
- Posting a receipt creates the correct batch in Inventory immediately
- Flagged rows remain in Intake until explicitly resolved — no auto-posting
- Reversal available and clearly discoverable from a posted row

## What Friction Looks Like
(Flag these as findings even when the flow technically completes.)
- Having to leave Intake to look up a PO number
- Posting that silently succeeds with no toast or batch confirmation
- Reversal only accessible via Recovery (not from the row itself)
- Flag/rejection losing the original data instead of preserving it

## Known System Constraints
(These are not bugs. Do not file findings for them.)
- State-based routing — see `_shared/navigation-primer.md`
- AG Grid virtualization — scroll to bring rows into view in large intake sessions
- Financial rounding — unit cost totals may vary ±$0.01–$0.26

## Scenarios in This Directory
| File | Type | Covers |
|------|------|--------|
| `01-receive-batch-normal.md` | normal | Full receiving flow: create intake rows, mark ready, post receipt, verify batch in Inventory |
| `02-flagged-batch-edge.md` | edge-case | Suspicious delivery — flag a row, verify it does not auto-post, resolve and post |
| `03-reversal-after-bad-post-error.md` | error-path | Reverse a mistakenly posted receipt and verify inventory is correctly unwound |
