# Tags PRD

Status: implemented in current slice  
Primary loop: Receive, Buy, Sell, Decide  
Capability: CAP-014 / BE-002  
Replication recipes: R2 grid column, R9 filter chip or saved slice, R12 cross-entity workflow

## Product Intent

Tags are compact operator vocabulary attached to products as they are purchased, intaked, and managed in inventory. They exist so operators can quickly search, sort, slice, sell, report, and reason over inventory without slowing down row entry.

Tags are not a modal taxonomy project. The row remains the source of daily work: PO lines, intake rows, and inventory batches expose editable `tags` cells. The catalog simply normalizes the vocabulary enough that filtering and reporting stay reliable.

## North-Star Fit

- Spreadsheet first: tags are inline grid cells, pasteable as comma/pipe separated text.
- Operator fast: tags can be entered during PO line entry or receiving, and they flow into batches.
- Familiar vocabulary: shorthand like `Ins/candy` can still create useful tags without blocking the row.
- Quiet power: the catalog is a projection/control layer, not a separate daily form.
- Ledger safe: tag edits are audited commands but do not move money, inventory quantity, or ledgers.

## Required Behavior

1. Operators can add tags when planning a purchase order line.
2. Operators can add or edit tags on intake rows.
3. Received PO line tags flow into the generated draft intake batch.
4. Posted inventory preserves tags and can still be filtered, sorted, and searched by tags.
5. Global search finds batches, needs, supplies, and tag catalog rows by tag.
6. Tag input accepts comma or pipe separators and normalizes to lowercase kebab-case slugs.
7. Unknown operator-entered tags are added to the local tag catalog automatically with a human label.
8. Tag changes are idempotent, role-gated, and audited in the command journal.

## Data Model

- `tag_catalog`: governed local vocabulary.
  - `slug`
  - `label`
  - `color`
  - `description`
  - `is_active`
  - timestamps
- Existing row arrays remain the operational source for row filtering:
  - `items.tags`
  - `purchase_order_lines.tags`
  - `batches.tags`
  - `customers.tags`

## Commands

- `applyTags`
  - Applies, removes, or replaces tags on one supported entity.
  - Supported entities: `item`, `purchaseOrderLine`, `batch`, `customer`, `customerNeed`, `vendorSupply`.
  - Required payload: `entityType`, `entityId`, `tags`.
  - Optional payload: `mode` = `add`, `remove`, or `replace`.

Existing commands that create or update products also normalize and upsert tags:

- `createBatch`
- `updateBatch`
- `addPurchaseOrderLine`
- `updatePurchaseOrderLine`
- `createCustomerNeed`
- `updateCustomerNeed`
- `createVendorSupply`
- `updateVendorSupply`

## Frontend Requirements

- Purchase Orders line grid has a `Tags` column and a compact tags entry field in the add-line strip.
- Intake grid has a `Tags` column and preserves tags on duplicate rows.
- Inventory grid has a `Tags` column and inline edits go through `updateBatch`.
- Matchmaking need/supply grids expose tags because they are used for deterministic matching.
- Grid filter supports `tags:premium,candy` style field filtering through the existing grid filter parser.

## Non-Goals

- No separate tag-management route.
- No huge dropdown picker during intake.
- No automatic remapping of legacy markers into tags.
- No AI tag generation.

## Acceptance

- A PO line created with tags produces an intake draft with the same normalized tags when received.
- Editing tags on intake or inventory persists after refresh.
- Global search returns tagged inventory for a matching tag query.
- `applyTags` is idempotent and writes command-journal before/after snapshots.
- Viewer role cannot mutate tags.
