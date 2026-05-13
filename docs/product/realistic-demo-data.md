# Realistic Demo Data Scenario

Status: active
Scenario key: `realistic_100d`

This scenario is the DigitalOcean demo dataset for operator QA. It is intentionally separate from the lightweight local seed so daily development tests stay fast and predictable.

## North-Star Fit

- Spreadsheet-first: every generated operational entity lands in the same grids operators already use.
- Status-first: purchases, intake, sales, invoices, payments, vendor bills, fulfillment, connector requests, and matches all carry real statuses.
- Ledger-safe: the scenario writes coherent ledgers directly during seed; connectors and matchmaking remain advisory and do not mutate committed ledgers.
- Easy to change: business mix lives in one config surface through `DEMO_*` environment variables.

## Defaults

- 110 days of data, satisfying the 100-day minimum.
- About `$4M` revenue per latest 30-day window.
- About `95%` of revenue through flower.
- About `85%` of purchased flower quantity is consigned.
- About `50%` of consigned flower quantity has a COGS range.
- 8 whale customers, 15 smaller customers.
- 4 larger vendors, 15 other vendors.
- Flower average sale price targets:
  - Outdoor: `$150/lb`
  - Mixed light / deps: `$550/lb`
  - Indoor: `$1100/lb`

## Scenario Coverage

- Purchase orders, received purchase lines, purchase receipts, posted batches, and inventory movements.
- Flower and non-flower inventory with tags for filtering, searching, slicing, and reporting.
- Posted sales, fulfilled sales, invoices, partial payments, FIFO-style allocations, buyer credits, overdue invoices, discounts, credit overrides, disputes, and correction journals.
- Vendor bills, scheduled payables, partial/paid vendor payouts, consignment-triggered payables.
- Pick lists, fulfillment lines, bag/label/manifest fields.
- Connector requests that remain non-authoritative.
- Customer needs, vendor stock, and deterministic matchmaking rows.
- Command journal rows showing pricing/range-resolution and accounting events.
- Active operator work layered on top of history: draft/approved POs, ready intake rows, draft/confirmed sales, ready payment rows, open pick lists, open connector requests, and open matchmaking rows.

## Config Knobs

```bash
DEMO_SEED_SCENARIO=realistic_100d
DEMO_DAYS=110
DEMO_MONTHLY_REVENUE=4000000
DEMO_FLOWER_REVENUE_SHARE=0.95
DEMO_CONSIGNED_FLOWER_PURCHASE_SHARE=0.85
DEMO_CONSIGNED_FLOWER_RANGE_SHARE=0.50
DEMO_WHALE_CUSTOMERS=8
DEMO_SMALL_CUSTOMERS=15
DEMO_LARGE_VENDORS=4
DEMO_OTHER_VENDORS=15
DEMO_OUTDOOR_AVG_PRICE=150
DEMO_DEPS_AVG_PRICE=550
DEMO_INDOOR_AVG_PRICE=1100
DEMO_RANDOM_SEED=520126
```

## Run Locally

```bash
ALLOW_DEMO_SEED=true DEMO_SEED_SCENARIO=realistic_100d pnpm db:seed
pnpm audit:realistic-demo
```

The seed takes roughly 10-20 seconds on a local laptop database and around the same order of magnitude during App Platform startup. Staging intentionally defaults to this scenario so reviewers see a useful operating business instead of a tiny fixture.

To opt out for a faster smoke database:

```bash
ALLOW_DEMO_SEED=true DEMO_SEED_SCENARIO=baseline pnpm db:seed
```

## Acceptance

`pnpm audit:realistic-demo` must pass before the scenario is deployed to the DigitalOcean demo app. The staging start command also runs this audit after seeding; if the data mix drifts or a partial seed happens, the app refuses to start instead of presenting misleading demo data.
