# Ease-of-Use Frontend Pass

Date: 2026-05-11
Lens: click cost, visible-option load, intuition under pressure, and whether the console feels faster than spreadsheet plus memory.

## Operator Moments Reviewed

| Moment | Stress case | What good feels like |
| --- | --- | --- |
| Start sale | Buyer texts a product fragment while operator is on another page. | Customer, request text, and inventory finder line up without a detour. |
| Receive vendor drop | Vendor arrives with messy rows and shorthand. | One receiving lane, vendor context, grid ready for row work. |
| Receive money | Cash/crypto handoff during other work. | Client, amount, method, FIFO intent, and ledger impact are obvious. |
| Pay vendor | Owner asks whether a payout can happen now. | Bill, balance, scheduled event, and pay action are close together. |
| Product finding | Operator needs to slice inventory while talking to a buyer. | Search accepts remembered fragments and common price language; advanced filters do not crowd the screen. |
| Recovery | A row looks wrong after posting. | History/reversal tools are reachable from selected rows. |

## Measured UI Load Before Fixes

Measured with Playwright at 1440x950 after login as owner.

| Surface | Visible controls | Buttons | Inputs/selects | Ease finding |
| --- | ---: | ---: | ---: | --- |
| Dashboard | 48 | 46 | 2 | Dashboard plus global chrome felt button-heavy before any task. |
| Sales | 70 | 49 | 21 | Highest-pressure surface; too much visible at once for a live buyer moment. |
| Payments | 46 | 30 | 16 | Usable but still dense. |
| Vendor Payouts | 37 | 30 | 7 | Moderate density. |

## Findings

| ID | Severity | Finding | Impact | Fix |
| --- | --- | --- | --- | --- |
| EU-001 | Red | Clicking the active Quick Start chip toggled the lane off, leaving no task fields visible. | A trained operator can accidentally make the launch strip disappear while trying to start work. | Quick Start chips now keep one lane active; collapsing the strip is handled only by the Quick Start header. |
| EU-002 | Yellow | Quick Start stayed on a stale lane after navigating. Example: Sales could still show Money Out controls. | Operators see irrelevant money controls while trying to sell, increasing wrong-action risk. | Navigation now auto-aligns Quick Start: Sales/Orders = Sale, Intake/Inventory/Fulfillment = Receiving, Payments/Clients = Money In, Vendors = Money Out. |
| EU-003 | Yellow | New Sale started from customer only; product/request intent was retyped later in the finder. | Buyer text fragments are the real starting point, and forcing a second entry slows live selling. | Sale Quick Start now has a Request field; New Sale carries that text into the Sales draft line and Inventory Finder search. |
| EU-004 | Yellow | Finder exposed every slicer at once. | Power is good, but eight filters plus saved slices plus table controls overload the high-stress selling moment. | Finder now shows the common path first: search, category, vendor, max price. Tag/location/owner/min qty/aging live behind More filters. |
| EU-005 | Yellow | Natural price hints like "under 100" behaved like literal search terms. | Operators type how they talk; literal matching created false empty results. | Finder now parses `under/below/less than/<= $X` as a max-price filter and removes filler words from text matching. |
| EU-006 | Yellow | Sales showed empty Suggestions and Sales Sheet panels even before they had useful content. | Empty secondary panels made the main selling workspace feel more crowded than it was. | Suggestions appear once a customer context exists; sheet/catalog preview appears only when there are selected rows to preview. |

## Measured UI Load After Fixes

| Surface | Visible controls | Buttons | Inputs/selects | Delta |
| --- | ---: | ---: | ---: | --- |
| Dashboard | 37 | 34 | 3 | 11 fewer visible controls; Quick Start has a stable active lane. |
| Sales | 59 | 43 | 16 | 11 fewer visible controls; finder common path is clearer. |
| Payments | 49 | 30 | 19 | Slightly higher because Quick Start auto-aligns to Money In on Payments. This is acceptable for the task context. |
| Vendor Payouts | 39 | 30 | 9 | Slightly higher because Quick Start auto-aligns to Money Out on Vendor Payouts. This is acceptable for the task context. |

## Click-Cost Assessment

| Task | Current shortest path | Notes |
| --- | --- | --- |
| Start sale from dashboard | Sale lane visible by default, choose client, optional request, New Sale. | 2 clicks when no request; 2 clicks plus typing when buyer gave a product fragment. |
| Start sale from another task page | Navigate Sales or click Sale chip, choose client, New Sale. | Quick Start now follows Sales automatically, reducing stale-lane confusion. |
| Start purchase order | Purchase chip, optional vendor/expected date, New PO. | 2 clicks with default vendor; 3 with vendor choice; opens planned procurement before physical intake. |
| Start receiving | Receiving chip, optional vendor, Receive Inventory. | 2 clicks with default vendor; 3 with vendor choice; creates an ad hoc receiving row without pretending it is a PO. |
| Receive money | Money In chip, choose client, amount/method if needed, Receive Money. | FIFO remains visible because allocation intent is high consequence. |
| Pay vendor | Money Out chip, optional vendor/bill, Pay Vendor. | Defaults are useful, but the payout preview should be strengthened in a future pass. |
| Find product for buyer | Request in Quick Start or finder search, optional category/vendor/max price. | Natural price hint parsing removes a common false-empty trap. |

## Remaining Usability Risks

These are not fixed in this pass because they need a slightly larger interaction pattern, but they are the next highest-value simplifications:

1. Orders still exposes too many sibling actions at once: Ready, Post, Reprice, Fulfillment, Pick list, Cancel. It should become status-aware with one primary next action and a compact More menu.
2. Payments still shows allocation/discount tooling before a payment row is selected. It should become selected-payment-first.
3. Vendor Payables mixes bill creation and payout voiding in the same strip. It should prioritize bill creation until a bill/payout is selected.
4. The side nav still shows many lanes for owner/manager. Role-aware grouping would help, but must not add clicks for warehouse/payments operators.
5. Sales still has two mental models: finder and smart suggestions. Eventually these should converge into one result surface with explainable fit.

## Proof

Commands run after this pass:

```bash
pnpm typecheck
pnpm audit:parity
pnpm db:seed
pnpm test:e2e
pnpm build
```

Final results:

- TypeScript: green.
- Backend/frontend parity: 54 commands and 27 query endpoints covered.
- Seed: regenerated demo data.
- Playwright: 10 passed.
- Production build: green.
