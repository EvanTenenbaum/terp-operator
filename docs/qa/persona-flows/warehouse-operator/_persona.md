# Persona: Warehouse Operator

## Who They Are
The Warehouse Operator picks, weighs, bags, and fulfills orders. Their interface is
a tight working queue — one order at a time, minimal decisions per row, physical
actions confirmed digitally. Speed matters but accuracy matters more: a wrong weight
or a shipped-short order creates customer and accounting problems downstream.

## Operating Style
- Works through the Fulfillment queue top-to-bottom
- Weighs each pick, enters the actual weight, and confirms pack
- Marks fulfilled only after physical shipment is confirmed
- Expects the queue to update immediately after each fulfillment action
- Does not need full order context — just: product, qty ordered, pack it

## Primary Views
- **Fulfillment** (`view: 'fulfillment'`) — primary workspace
- **Orders** (`view: 'orders'`) — context when a fulfillment question arises

## Command Families Used
- `CMD-FULFILLMENT` — createPickList, recordWeighAndPack, markOrderFulfilled

## What Good Looks Like
- Fulfillment queue shows only open, pickable orders — no clutter
- Entering actual weight and confirming pack is one inline step per line
- Mark Fulfilled advances order to Fulfilled status immediately
- Fulfilled order is removed from the active queue promptly

## What Friction Looks Like
(Flag these as findings even when the flow technically completes.)
- Having to scroll or filter to find the right order in the queue
- Pack confirmation requiring more than two actions per line
- Fulfilled order remaining in the queue after completion
- Weight entry requiring a separate modal (should be inline)

## Known System Constraints
(These are not bugs. Do not file findings for them.)
- State-based routing — see `_shared/navigation-primer.md`
- AG Grid virtualization — scroll if the queue is long

## Scenarios in This Directory
| File | Type | Covers |
|------|------|--------|
| `01-pick-weigh-fulfill-normal.md` | normal | Pick a line, enter actual weight, confirm pack, mark fulfilled |
| `02-weight-discrepancy-edge.md` | edge-case | Actual weight differs significantly from ordered — system response |
| `03-partial-fulfillment-error.md` | error-path | Only part of the order is available to ship — partial fulfillment handling |
