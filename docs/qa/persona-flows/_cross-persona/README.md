# Cross-Persona Lifecycle Flows

## Why These Exist

TERP Operator is a command-driven ERP where the most dangerous bugs occur at
persona boundaries — one operator's action creating state that breaks another
operator's flow. A Sales Operator posting a sale while an Inventory Operator is
reversing the same batch. A Payments/Accounting operator allocating a payment
against an order that was cancelled mid-allocation.

Single-persona flows cannot catch these bugs. Cross-persona flows simulate the
real operating environment where multiple roles work on the same data.

## These Flows Are Critical Tier

Both flows in this directory are **Critical risk tier**. Per the ship-gate rules:
- Both cross-persona flows must be run before any grade is valid for a ship decision.
- If either flow fails or is blocked, the ship gate is INVALID regardless of other scores.

## Flows in This Directory

| File | Covers | Est. Time |
|------|--------|-----------|
| `01-purchase-to-payment-lifecycle.md` | Full chain: PO → Intake → Inventory → Sales → Fulfillment → Payment | 25 min |
| `02-intake-reversal-mid-sale.md` | Inventory batch reversal while a sales order holds that inventory | 20 min |

## Running Cross-Persona Flows

Load `_shared/navigation-primer.md` and `_shared/seed-state-reference.md` before
beginning. Each step labels which persona perspective is active. The agent switches
persona context mid-flow — read the label at each step before acting.

## Setup Required

Neither flow can run without Live inventory batches. Follow the setup steps in
`_shared/seed-state-reference.md` (Intake setup section) to create at least one
Live batch before starting these flows.
