# Seed State Reference

> Generated from: database query against `postgres://terp_agro:terp_agro@localhost:55432/terp_agro`
> Last confirmed: 2026-05-22
> **Re-query the database if entities seem missing — do not hand-edit names or IDs.**

## Current Seed State

The `pnpm db:seed:realistic` command is currently broken on this branch due to a
missing `snapshotService` module import. The seed ran partially: customers, vendors,
and purchase orders were created but **no batches, sales orders, or payments exist**.

**What this means for each flow type:**
- Flows needing Live inventory batches → must complete Intake first (see setup steps in those scenarios)
- Flows needing open sales orders → must create a sale first via the normal path
- Flows needing payment history → must log payments during setup
- Flows using customers or vendors → use names from tables below directly

**Credit-hold customer:** No customer currently has balance > credit limit (all balances are $0.00).
For `sales-operator/02-customer-credit-hold-edge.md`, the agent must manually lower a
customer's credit limit below $0.01 via the Clients view before running that flow.
**Recommended:** Use **East Bay Select** (credit limit $35,000) — set credit limit to $0
to trigger a credit hold on the next sale.

---

## Customers (23 total)

| Name | Credit Limit | Current Balance | Over Limit? | Notes |
|------|-------------|-----------------|-------------|-------|
| Canyon Market | $905,000 | $0.00 | No | Largest credit limit — good for high-value sale tests |
| Capitol Cure | $80,000 | $0.00 | No | |
| Coastal Corner | $95,000 | $0.00 | No | |
| Cobalt Reserve | $450,000 | $0.00 | No | |
| East Bay Select | $35,000 | $0.00 | No | **Use for credit-hold tests** — set limit to $0 |
| Golden Gate Buyers | $645,000 | $0.00 | No | |
| Green Door Collective | $95,000 | $0.00 | No | |
| Harbor Wellness | $580,000 | $0.00 | No | |
| Lagoon Wellness | $80,000 | $0.00 | No | |
| Lighthouse Retail Group | $775,000 | $0.00 | No | |
| Maven Provisions | $710,000 | $0.00 | No | |
| Metro Herb | $65,000 | $0.00 | No | Smallest mid-tier limit — good for edge tests |
| Mission Relief | $80,000 | $0.00 | No | |
| Moss Landing Co-op | $65,000 | $0.00 | No | |
| Northside Patient Care | $35,000 | $0.00 | No | |
| Oak Street Wellness | $50,000 | $0.00 | No | |
| Pine Hill Supply | $50,000 | $0.00 | No | |
| Prairie House | $65,000 | $0.00 | No | |
| Redwood Buyers Club | $840,000 | $0.00 | No | |
| Silver Lake Buyers | $95,000 | $0.00 | No | |
| Sunset Collective | $515,000 | $0.00 | No | |
| Valley Meds | $35,000 | $0.00 | No | |
| Vista Patient Group | $50,000 | $0.00 | No | |

**Default good-standing customer for normal flows:** Use **Canyon Market** (highest limit, clean balance).

---

## Vendors (19 total)

| Name | Notes |
|------|-------|
| Boulder Creek | |
| Canyon Flower | |
| Coastal Cure | |
| Emerald Triangle Supply | Has received POs — good for intake tests |
| Fogline Farms | |
| Golden State Supply | |
| High Desert House | |
| Humboldt Depot | |
| Marin Harvest | |
| Mendocino Lane | |
| Monarch Outdoor | |
| North Coast Gardens | Has received POs |
| Pacific Resin Co | |
| Redwood Ridge | |
| Sierra Canna | |
| Sun Valley Mixed Light | Has received POs — most active vendor |
| Upland Craft Farm | Has received POs |
| Valley Cure | |
| Vista Verde | |

**Default vendor for intake/PO tests:** Use **Emerald Triangle Supply** or **Sun Valley Mixed Light** — both have historical PO activity.

---

## Live Inventory Batches

**None currently exist.** The realistic seed did not create batches due to the seed error described above.

**Setup steps for flows that need Live inventory:**
1. Navigate to Purchase Orders (Procure → Purchase Orders)
2. Create a new PO for **Emerald Triangle Supply** with 1 line item (any product name, 50 units, $10/unit)
3. Finalize and approve the PO
4. Navigate to Intake (Procure → Intake or ⌘2) — use "Receive" from Quick Start
5. Create intake rows from the PO, mark them Ready, and process the receipt
6. Navigate to Inventory (⌘5) — verify the batch appeared with status `Live`
7. Note the batch name for use in sale flows

---

## Purchase Orders

164 POs exist, all in `received` status (completed historical receipts).
These are **not** useful as active POs for testing — they are already received.

**For active PO tests:** Create a new PO as part of the scenario setup (see Intake setup steps above).

---

## Open Sales Orders

None. All sales orders must be created as part of scenario setup.

---

## Payments

None. All payment flows must log payments as part of scenario setup.

---

## Known Entities Missing from Seed

| Entity | Needed By | How to Create |
|--------|----------|---------------|
| Connector record | All `connector-actor/` flows | Money → Processors → create new processor |
| Live inventory batch | All sale/fulfillment flows | Follow intake setup steps above |
| Credit-hold customer | `sales-operator/02-customer-credit-hold-edge.md` | Set East Bay Select credit limit to $0 via Clients view |
| Open sales order | Fulfillment flows | Create via Sales → New Sale |
| Payment records | Payments/accounting flows | Log via Payments → Money in |
