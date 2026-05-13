# Matchmaking PRD

Status: implemented in current slice  
Primary loop: Sell, Buy, Decide  
Capability: CAP-029  
Replication recipes: R6 view/route, R8 entity type, R12 cross-entity workflow, R2 grid column

## Product Intent

Matchmaking is a deterministic demand-and-supply workboard. It is not the existing buyer-fit suggestions feature.

Operators record:

- customer needs that may not currently be in stock,
- vendor stock that vendors have available or expect to sell to the office,
- deterministic matches between those two lists.

The system then scores matches using visible rules: category fit, tag overlap, product-name overlap, quantity fit, price fit, and timing fit. It never auto-posts, never creates ledgers, and does not use AI.

## North-Star Fit

- Spreadsheet first: needs, vendor supply, and matches are dense grids with inline editing.
- Operator fast: quick-entry strips add a need or supply row without modal wizards.
- Status first: needs and supplies move through `open`, `matched`, `accepted`, `dismissed`, and `closed`.
- Ledger safe: accepting a match records intent only; purchase, intake, and sale still happen through existing PO/intake/sales workflows.
- Quiet power: one route, one primary board, no broad workflow redesign.
- Familiar vocabulary: labels use `Customer need`, `Vendor stock`, `Match`, `Target price`, `Ask`.

## Required Behavior

1. Operators can quickly add a customer need with customer, product/request, category, tags, quantity range, target price, needed-by date, urgency, and notes.
2. Operators can quickly add vendor stock with vendor, product, category, tags, available quantity, asking price, available date, location, and notes.
3. Creating or updating a need or supply recomputes deterministic match rows.
4. The match grid shows score, reason chips, customer, vendor, request, product, category, quantity fit, price fit, and status.
5. Operators can accept or dismiss a match.
6. Accepting a match does not create a purchase order, sale, intake row, invoice, payable, or inventory movement.
7. Match rows are traceable through command journal.

## Data Model

- `customer_needs`
  - `customer_id`
  - `need_code`
  - `product_name`
  - `category`
  - `tags`
  - `qty_min`, `qty_max`
  - `target_price`
  - `needed_by`
  - `urgency`
  - `notes`
  - `status`
- `vendor_supply`
  - `vendor_id`
  - `supply_code`
  - `product_name`
  - `category`
  - `tags`
  - `available_qty`
  - `asking_price`
  - `available_date`
  - `location`
  - `grade`
  - `terms`
  - `notes`
  - `status`
- `matchmaking_matches`
  - `customer_need_id`
  - `vendor_supply_id`
  - `score`
  - `reasons`
  - `status`
  - `reviewed_by`

## Scoring Rules

Total score caps at 100.

- Category match: +35
- Tag overlap: +8 per shared tag, capped at +24
- Product-name token overlap: +10
- Supply quantity covers minimum need: +12
- Asking price is at or below target: +12
- Supply available by needed-by date: +7

Rows under score 35 are ignored unless there are no other matches for the need, in which case the best available candidate may be shown for manual review.

## Commands

- `createCustomerNeed`
- `updateCustomerNeed`
- `createVendorSupply`
- `updateVendorSupply`
- `acceptMatchmakingMatch`
- `dismissMatchmakingMatch`

All commands are typed, idempotent, role-gated, audited, and replay-safe.

## Frontend Requirements

- Add `Matchmaking` under the Sell navigation group.
- Provide two compact row-entry strips: Customer need and Vendor stock.
- Render three grids:
  - Open customer needs
  - Open vendor stock
  - Deterministic matches
- Keep accept/dismiss as selection actions on the match grid.
- Do not use modal wizards.
- Do not crowd the global Keel with new chips. Command palette may open the route.

## Non-Goals

- No AI matching.
- No auto purchase order creation.
- No auto sales order creation.
- No customer-facing output.
- No connector mutation path.

## Acceptance

- Creating a need and a compatible vendor supply produces an open match with explainable reasons.
- Updating tags, category, quantity, or price recomputes matches.
- Accepting a match marks the match accepted and moves the need/supply into matched/held state.
- Dismissing a match keeps need and supply open unless no accepted match exists.
- Viewer role can inspect but cannot create, edit, accept, or dismiss.
