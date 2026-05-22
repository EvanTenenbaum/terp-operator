# Seed State Reference

> Generated from: `pnpm qa:env:setup` with `pnpm db:seed:realistic` (110-day scenario)
> Last confirmed: 2026-05-22 (QA run 2026-05-22-all)
> **Re-query the database if entities seem missing — do not hand-edit names or IDs.**

## Current Seed State

The realistic 110-day seed ran successfully: 110 days of data, $15,275,869 revenue.

**What this means for each flow type:**
- Flows needing Live inventory batches → must complete Intake first (no live batches in fresh seed; setup steps below)
- Flows needing open sales orders → **521 open sales orders exist** — usable directly
- Flows needing open POs → **172 open purchase orders exist** — usable directly for intake tests
- Flows needing payment history → log payments during setup (none pre-seeded)
- Flows using customers or vendors → use names from tables below

**Credit-hold customer (naturally):** **Canyon Market** is already over its credit limit ($949,874 balance vs $905,000 limit — $44,874 over). Use Canyon Market directly for credit-hold tests without any setup modification.

**Good-standing customer:** Use **Capitol Cure** ($33,104 balance, $80,000 limit — 41% used, well under limit).

---

## Customers (23 total)

| Name | Credit Limit | Current Balance | Over Limit? | Notes |
|------|-------------|-----------------|-------------|-------|
| Canyon Market | $905,000 | $949,874 | **Yes** | **Already over limit — use for credit-hold tests** |
| Capitol Cure | $80,000 | $33,104 | No | **Default good-standing customer** |
| Coastal Corner | $95,000 | $54,354 | No | |
| Cobalt Reserve | $450,000 | $798,441 | **Yes** | Over limit |
| East Bay Select | $35,000 | $34,644 | No | Nearly at limit ($356 headroom) |
| Golden Gate Buyers | $645,000 | $916,737 | **Yes** | Over limit |
| Green Door Collective | $95,000 | $105,606 | **Yes** | Over limit |
| Harbor Wellness | $580,000 | $956,300 | **Yes** | Over limit |
| Lagoon Wellness | $80,000 | $16,367 | No | Good standing |
| Lighthouse Retail Group | $775,000 | $775,456 | **Yes** | Just over limit |
| Maven Provisions | $710,000 | $802,799 | **Yes** | Over limit |
| Metro Herb | $65,000 | $40,375 | No | Good standing |
| Mission Relief | $80,000 | $32,136 | No | Good standing |
| Moss Landing Co-op | $65,000 | $11,049 | No | Good standing |
| Northside Patient Care | $35,000 | $34,332 | No | Near limit ($668 headroom) |
| Oak Street Wellness | $50,000 | $49,955 | No | Near limit ($45 headroom) |
| Pine Hill Supply | $50,000 | $32,597 | No | Good standing |
| Prairie House | $65,000 | $32,102 | No | Good standing |
| Redwood Buyers Club | $840,000 | $845,566 | **Yes** | Over limit |
| Silver Lake Buyers | $95,000 | $19,808 | No | Good standing — large headroom |
| Sunset Collective | $515,000 | $814,854 | **Yes** | Over limit |
| Valley Meds | $35,000 | $29,374 | No | Good standing |
| Vista Patient Group | $50,000 | $44,965 | No | Near limit ($1,035 headroom) |

**Default good-standing customer for normal flows:** Use **Capitol Cure** (clean balance, 41% of limit used).
**Default credit-hold customer:** Use **Canyon Market** (already $44,874 over $905,000 limit).

---

## Vendors (19 total)

| Name | Notes |
|------|-------|
| Boulder Creek | |
| Canyon Flower | |
| Coastal Cure | |
| Emerald Triangle Supply | Active vendor — good for intake tests |
| Fogline Farms | |
| Golden State Supply | |
| High Desert House | |
| Humboldt Depot | |
| Marin Harvest | |
| Mendocino Lane | |
| Monarch Outdoor | |
| North Coast Gardens | Active vendor |
| Pacific Resin Co | |
| Redwood Ridge | |
| Sierra Canna | |
| Sun Valley Mixed Light | Active vendor — most active |
| Upland Craft Farm | Active vendor |
| Valley Cure | |
| Vista Verde | |

**Default vendor for intake/PO tests:** Use **Emerald Triangle Supply** or **Sun Valley Mixed Light**.

---

## Live Inventory Batches

**None currently exist.** The realistic seed creates sales orders and POs but does not create live batches.

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

**172 open purchase orders** exist — these ARE useful for active PO and intake tests.
(Previous reference showed 164 received-only POs; the full realistic seed creates open POs too.)

**For active PO tests:** Use one of the existing open POs, or create a new one.

---

## Open Sales Orders

**521 open sales orders** exist. Usable directly for fulfillment and sales inspection flows.

---

## Payments

None pre-seeded. All payment flows must log payments as part of scenario setup.

---

## Known Entities Missing from Seed

| Entity | Needed By | How to Create |
|--------|----------|---------------|
| Connector record | All `connector-actor/` flows | Money → Processors → create new processor |
| Live inventory batch | Sale/fulfillment flows that need NEW inventory | Follow intake setup steps above |
