# 11 — Domain Bible: Inventory / Batches, Movements, Tags & Brands, Photography / Media

> Ground truth = code. All citations are `file:line` against the repo at the time of writing.
> Scope: batch lifecycle, inventory movements (qty / status / location / ownership), tags & brands,
> CSV import, alias snapshots, and the full photography / media pipeline (queue → upload via
> operator or tokenized share link → role assignment → publish → customer-safe display →
> retention / cleanup).

Primary sources:
- Command catalog / RBAC / reversal policy: `src/shared/commandCatalog.ts`
- Command handlers + envelope: `src/server/services/commandBus.ts`
- Media services: `src/server/services/mediaStorage.ts`, `mediaValidation.ts`, `photoUploadTokens.ts`, `csv.ts`
- Schema: `src/server/schema.ts`
- Shared logic: `src/shared/tags.ts`, `inventoryPricing.ts`, `inventoryPricingShared.ts`
- Read models: `src/server/routers/queries.ts`
- HTTP routes / middleware: `src/server/routes/uploadRoute.ts`, `mediaRoute.ts`, `middleware/requireOperatorOrUploadToken.ts`, `requirePhotographyEnabled.ts`
- Client: `src/client/views/MediaView.tsx`, `views/mobile/MobileInventoryView.tsx`, `components/{MediaBatchDrawer,MediaList,MediaUploadMobile,PhotographyQueuePanel}.tsx`, `components/drawerTabs/Lot{Photos,Movement,History}Tab.tsx`
- Migrations: 0005, 0008, 0018, 0020/0026-0028/0031, 0034-0037, 0042, 0073

---

## How every write flows: the command-bus envelope

All inventory / tag / media mutations go through one entry point: `executeCommand(input, user, io)`
(`commandBus.ts:480`). Understanding this envelope is prerequisite to every command below.

1. **RBAC gate** — `assertCommandAccess(user, name)` (`:481`) enforces `commandMinRole[name]`
   from `commandCatalog.ts:336`. Roles are ordered `viewer < operator < manager < owner`.
2. **Journal-safe payload** — `journalSafePayload(name, payload)` (`:482`) sanitizes the input
   before it is persisted to `command_journal.input_payload`.
3. **Before-snapshot** — `snapshotFromPayload(input.payload)` (`:485`) captures affected entities
   for reversal.
4. **Atomic idempotency claim** — inserts a `pending` row into `command_journal` with
   `onConflictDoNothing(idempotencyKey)` (`:490-508`). Losers replay the winner's cached result,
   poll while `pending`, detect different-command/different-payload reuse (409-equivalent error),
   and sweep orphaned pending claims older than 5 min (`:540-599`).
5. **Winner executes in a single DB transaction** — `runCommand(tx, name, payload, user, commandId, reason)`
   (`:606-607`) is the big dispatch `switch` (`:817`). Handlers mutate tables and write
   `inventory_movements` rows inside the same tx.
6. **After-snapshot + finalize** — `snapshotByAffectedIds` then UPDATE the journal row to `ok`/`failed`,
   storing `redactSensitiveDeltaFields(name, storedResult)` (`:614-622`). Redaction map:
   `mintPhotoUploadToken → ['token']` (`:159-161`) — the raw upload token is replaced with
   `<redacted>` before it ever lands in Postgres or the JSONL audit.
7. **JSONL on-disk audit** — `appendJsonlJournal(...)` with the same redacted result (`:632-644`).
8. **Socket broadcast** — `io.to('authenticated').emit('command:completed', { commandId, commandName, actorId, affectedIds })` (`:655-660`). Toast is intentionally stripped from the broadcast (may contain customer names); the actor gets their toast via the tRPC `onSuccess` callback. Peers receive only the cache-invalidation signal (`affectedIds`).
9. **Failure path** — on throw, the journal row is set `failed` with a scrubbed message and
   `io.to('authenticated').emit('command:failed', { commandId, commandName, actorId, toast: safeMessage })` (`:807`).

> There is **one** movement-row writer pattern: handlers call
> `tx.insert(inventoryMovements).values({ batchId, commandId, kind, qtyDelta, reason })`. The
> `commandId` ties each movement back to the journal row, so movements are auditable and
> reversal-aware.

---

# SECTION A — JOURNEY MAP

## A1. Intake → posted inventory (where batches come from)

Batches are born as **drafts** (`createBatch`, status `draft`/`ready`/`needs_fix`) and become real
inventory only when posted. Two posting paths feed inventory:

- **`postPurchaseReceipt`** (`commandBus.ts:1223`) — operator selects draft/ready intake rows
  sharing one vendor and at most one PO; it inserts a `purchase_receipts` row + per-line
  `purchase_receipt_lines`, flips each batch to `status='posted'`, sets `availableQty = intakeQty`,
  `arrivalStatus='arrived'`, stamps `postedAt`, writes an `inventory_movements` row of
  `kind='intake_posted'` with `qtyDelta = intakeQty`, **auto-enqueues a `photography_queue`
  row** (`status='open'`, note "Auto-queued from receipt …") (`:1291`), reconciles PO line
  `receivedQty`/`status`, and generates per-vendor `vendor_bills` with Decimal-precise totals.
- **`verifyAllIntake`** (`:1995`) — bulk "accept all as expected" for a PO. Clears validation
  issues, snaps mismatched `intakeQty` to the PO line qty, then delegates to `postPurchaseReceipt`.

This is the upstream context. The commands in this bible operate **on** these batches.

### Happy path: managing a posted lot
1. Operator opens Inventory grid (`queries.grid` view `inventory`, `queries.ts:2356`). The grid
   exposes `displayName = coalesce(item.alias, batch.name)`, `ageDays`, ownership, media status, and
   masks `unitCost` to `null` for non-managers (`grid` proc `queries.ts:141-143`).
2. To correct quantity: `adjustBatchQuantity` (delta + **required reason**) → writes a
   `manual_adjustment` movement.
3. To move state: `setInventoryStatus` (posted↔held↔damaged↔returned↔in_transit) → `status_transfer`
   movement.
4. To relocate: `transferInventoryLocation` → `location_transfer` movement.
5. To change consignment/ownership: `transferInventoryOwnership` → `ownership_transfer` movement.
6. To reprice: `setBatchPrice` (thin wrapper over `updateBatch`).
7. Movement history is read back via `queries.inventoryMovements` and rendered in
   `LotMovementTab.tsx` (net delta + newest-first timeline) and `drawerTabs/LotHistoryTab.tsx`.

### Branches & guards
- **Posted immutability**: `updateBatch` rejects changes to `intakeQty` on a posted batch ("use
  adjustBatchQuantity") and refuses to move a posted batch back to draft/ready (`commandBus.ts:1164-1169`).
- **deleteBatch** only deletes drafts; posted batches throw "Reverse the posting instead" (`:1218`).
- **rejectBatch** is blocked on posted batches (use reversal/correction) (`:1934`); on draft/ready it
  flips to `returned`, zeros `availableQty`, appends a dated rejection note, and (if PO-linked) backs
  out PO-line `receivedQty` and reduces open vendor-bill amounts under `FOR UPDATE` row locks
  (`:1959-1969`).
- **No-op short circuits**: status/location/ownership transfers detect "already X" and return
  `delta.unchanged=true` without writing a movement (`:2055`, `:2074`, `:2098`).
- **adjustBatchQuantity** refuses to drive `availableQty` below zero (`:2040`) and **requires a
  reason** (`:2038`).

### Error states & recovery
- Concurrency: qty / location / ownership adjustments take `SELECT … FOR UPDATE` row locks and read
  raw snake_case columns via bracket notation to avoid `undefined → NaN` corruption (`:2029-2039`,
  `:2088-2097`).
- Reversal: `setInventoryStatus`, `transferInventoryLocation`, `transferInventoryOwnership`, and
  `setItemAlias` are **reversible** — `reverseCommandById` restores the prior value from the
  before-snapshot (policy in `commandCatalog.ts:490-492,553`). `adjustBatchQuantity` is **offsettable**
  — post an equal opposite adjustment (`:489`). `setBatchPrice`/`setBatchLotInfo` are **terminal** —
  re-run with the intended value.

### Mobile handoff
`MobileInventoryView.tsx` lets field staff search/filter inventory, expand a row, and run
`adjustBatchQuantity` (manager-gated via `me.role`) and `flagBatch` behind `MobileConfirmSheet`
confirmation sheets. Reason capture is enforced in-UI before the confirm.

## A2. Tagging journey

1. Operator edits tags on a batch / item / PO line / customer / need / vendor-supply.
2. `applyTags` (`commandBus.ts:2342`) normalizes via `parseTagInput`/`normalizeTagSlug`
   (`shared/tags.ts`), supports `mode` ∈ {add, remove, replace} (default replace), upserts each slug
   into `tag_catalog` (`ensureTagCatalog`, `:5654`), writes the merged array back to the entity, and —
   for `customerNeed`/`vendorSupply` — **rebuilds matchmaking matches** (`:2361-2362`).
3. Tags also flow implicitly through `createBatch`/`updateBatch` (which call `ensureTagCatalog`) and
   from shorthand decoding (`decodeShorthand`, `:6673`).

Branches: empty tags allowed only in `replace` mode (= clear); other modes require ≥1 tag (`:2348`).
Entity type must be one of the six supported tables or it throws (`taggedTable`, `:5679`).

## A3. Brand & alias snapshots (customer-safe naming)

- **Brands** (`schema.ts:58`) carry a customer-facing `alias` (default `'Brand TBD'`) and a nullable
  `vendorId`. `createBatch` auto-resolves a brand: explicit `brandId` wins, else if a vendor is
  present `ensureVendorBrand` finds-or-creates a default brand for that vendor (`commandBus.ts:1110-1118`,
  `:1430`).
- **Strain alias** (`setItemAlias`, `:2373`): one alias per master item (`items.alias`, ≤120 chars),
  used so customer artifacts show a friendly name while vendor/audit surfaces keep the canonical
  `items.name`. Reversible (restores prior alias from snapshot). The inventory grid surfaces it as
  `displayName = coalesce(i.alias, b.name)` (`queries.ts:2359`); sales lines snapshot it into
  `sales_order_lines.display_name` at commitment (migration 0008) so later renames don't mutate
  history.
- **DB trigger** `update_batch_alias_snapshots` (migration 0020, hardened by 0028/0031) fires
  `BEFORE INSERT OR UPDATE OF brand_id, vendor_id` and copies the brand/vendor name into
  `batches.brand_alias` / `vendor_alias`. The current NULL-safe version (0031) sets the snapshot to
  NULL when the FK is null/missing instead of raising, and only re-queries when the id actually
  changed (`OLD.x IS DISTINCT FROM NEW.x`). Migration 0026 backfilled aliases for pre-existing rows.

## A4. CSV import journey

1. Operator pastes/uploads CSV; client calls `importBatchesCsv` (`commandBus.ts:2297`).
2. **Validate-only is the default** (`validateOnly !== false`, `:2299`). `validateBatchCsv`
   (`csv.ts:23`) checks required headers (`name, category, vendor, intake_qty, unit_cost, unit_price`)
   and `intake_qty > 0`, returning `{ valid, rows, errors }` in `delta` for a preview UI.
3. On commit (`validateOnly:false`), invalid CSV throws before any insert (`:2310`). Each valid row:
   `ensureVendor` (find-or-create by name), then `createBatch` as a `draft` with tags split on `|`.
4. Imported drafts then flow through the normal intake→post path (A1). Reversal is **terminal** —
   delete/correct imported drafts row by row (`commandCatalog.ts:500`).

Edge cases: CSV parser handles quoted fields and `""` escapes (`splitCsvLine`); `rowsToCsv` is the
inverse used by exports and joins arrays with `|`.

## A5. Photography / media pipeline (the big one)

### Pipeline stages
```
[1] Queue ──▶ [2] Upload ──▶ [3] Role assign ──▶ [4] Publish ──▶ [5] Customer-safe display ──▶ [6] Retention/cleanup
              (operator OR
               tokenized link)
```

**[1] Queue.** Posting a receipt auto-inserts a `photography_queue` row (`status='open'`)
(`commandBus.ts:1291`). The legacy `attachBatchPhoto` URL flow also inserts a queue row (`status='done'`).
Operators see the queue two ways: the desktop **MediaView** (`grid` view `photography`,
`queries.ts:2436`, ordered "needs-photo first") and the **PhotographyQueuePanel** workspace widget
(`queries.photographyQueue`, `queries.ts:1057`).

**[2] Upload.** Two write models populate `batch_media`:
- *Legacy URL attach* — `attachBatchPhoto` (`:2108`) sets `batches.photo_url` + `mediaStatus='done'`
  and inserts a `done` queue row. Used by PhotographyQueuePanel's "Attach" button.
- *File upload* — `POST /api/upload/media` (`uploadRoute.ts:65`) saves the file to disk, then the
  caller registers a `batch_media` row. **Two auth paths into that route:**
  - **Operator session** (cookie): the browser uploads, gets back file metadata, then calls the
    `uploadBatchMedia` command (`commandBus.ts:2131`) which inserts the `batch_media` row through the
    journaled command bus. Driven by `MediaBatchDrawer` (drag/drop, multi-file, per-file progress) and
    `MediaUploadMobile` (session path).
  - **Tokenized share link** (`Authorization: Bearer <token>`): the route itself inserts the
    `batch_media` row directly via Drizzle (`uploadRoute.ts:164-184`), attributing `uploadedBy` to the
    token's issuer and noting the `tokenId`. The photographer has **no tRPC session**, so the client
    must NOT call `uploadBatchMedia` (`MediaUploadMobile.tsx:87-91`).
  Both paths land the row at `status='draft'`, `role='additional'`.

**[3] Role assignment.** `setBatchMediaRole` (`commandBus.ts:2177`) promotes a row to
`primary_photo` / `primary_video` or demotes to `additional`. When promoting to a primary role it
takes `FOR UPDATE` locks on the target and any existing published primary for that batch+role
(`:2197-2206`), and translates the partial-unique-index violation (Postgres `23505`) into the
operator-friendly "Another media row is already the primary…" (`:2222`).

**[4] Publish.** `publishBatchMedia` (`:2236`) flips `draft → published` (only from `draft`) and
stamps `published_at`. The partial unique indexes
`batch_media_primary_photo_unique` / `_primary_video_unique` (schema.ts:934-944, migration 0034)
guarantee **at most one published, non-replaced primary photo and one primary video per batch**.

**[5] Customer-safe display / serving.** Media is served only through `GET /api/media/:id` and
`/:id/thumb` (`mediaRoute.ts`). These set `X-Content-Type-Options: nosniff`, force
`Content-Disposition: attachment` for videos (inline for images), and support HTTP Range requests
(206) for video streaming. The read model `queries.batchMediaList` (`queries.ts:1069`) returns only
non-replaced rows ordered primary-photo → primary-video → additional, and exposes `hasThumbnail`
(boolean) rather than raw paths. `MediaList.tsx` and `LotPhotosTab.tsx` render these; the grid's
`photography` view aggregates counts from the `batch_media_summary` view (migration 0036).

**[6] Retention / cleanup.** `media_retention_policies` (migration 0035) seeds two policies —
"Draft Cleanup" (90 days, `applies_to='draft'`) and "Replaced Media Cleanup" (30 days,
`applies_to='replaced'`). Cleanup runs append a `media_cleanup_log` row (`files_deleted`,
`bytes_freed`, success/error). `deleteBatchMedia` (`:2262`) deletes the DB row first (source of
truth) then best-effort unlinks files via `deleteMedia`.

### Tokenized upload journey (field photographer, no login)
1. Manager/owner opens **MediaBatchDrawer**, clicks "Mint share link (2h)" → `mintPhotoUploadToken`
   (`batchId`, `ttlMinutes:120`).
2. Command (`commandBus.ts:3220`) verifies the batch exists, generates a 256-bit random token,
   stores only `sha256(token)` in `photo_upload_tokens`, and returns the **raw token once** in
   `result.delta.token`. The bus redacts `delta.token` before journaling (`:159-161`).
3. The drawer builds `…/photography/mobile/{batchId}?token=…`, copies it to clipboard, and warns
   "copy now, it will not be shown again" (`MediaBatchDrawer.tsx:45-57`).
4. Photographer opens the link on a phone → `MediaUploadMobileRoute` reads `?token=` and uploads with
   `Authorization: Bearer <token>` and `?batchId=` (`MediaUploadMobile.tsx:181-188`).
5. `requireOperatorOrUploadToken` verifies the token against the batch BEFORE multer parses
   (`requireOperatorOrUploadToken.ts:60-93`); the route re-checks body `batchId == token batchId`
   for defense-in-depth (`uploadRoute.ts:100-108`). On success the route auto-creates the draft
   `batch_media` row.
6. Manager can `revokePhotoUploadToken` (`:3273`) at any time (sets `revoked_at`); the share-link
   banner offers "Revoke now."

### Photography branches, errors, recovery
- **Feature kill-switch**: every media/upload route is gated by `requirePhotographyEnabled`
  (503 when `ENABLE_PHOTOGRAPHY` is set to anything other than unset/`true`).
- **Upload rejects** (all 4xx, file deleted on failure): bad extension (fileFilter, 400), missing/
  invalid `batchId` (400), size over per-type limit (50 MB photo / 200 MB video, 400), low disk
  (`checkDiskSpace`, 507), magic-bytes mismatch (`validateMagicBytes`, 400). HEIC is converted to
  JPEG server-side (`convertHeicToJpeg`) and the original is unlinked.
- **Token failures** use coarse codes to avoid leaking why: 401 for expired/revoked/unknown/malformed,
  403 only for wrong-batch (`requireOperatorOrUploadToken.ts:84-92`).
- **Orphaned staged files**: if the session-path follow-up command fails after a successful upload,
  `MediaUploadMobile` best-effort `DELETE /api/upload/media/staged` (operator-only, path-traversal
  guarded in `uploadRoute.ts:206-246`).
- **Delete recovery**: `deleteBatchMedia` is terminal — re-upload if accidental
  (`commandCatalog.ts:499`).

### Feature combinations / edge cases worth knowing
- `attachBatchPhoto` (legacy `photo_url` + `mediaStatus`) and the `batch_media` table run **in
  parallel** — they are different data stores. The grid's `mediaStatus` column derives from
  `batch_media` counts in MediaView but from `batches.media_status` in the inventory grid / mobile.
- The token path never touches the command bus, so tokenized uploads are **not** in `command_journal`
  (only the mint/revoke are). Their audit trail lives in `photo_upload_tokens.use_count/last_used_at`
  + the `batch_media.notes` "Uploaded via tokenized share link (tokenId=…)" marker.
- `viewer` role: MediaBatchDrawer hides the upload zone and action buttons (`canWrite = role !== 'viewer'`);
  mint is manager/owner only (`canMintShareLink`).

---

# SECTION B — BACKEND SPEC

## B1. Commands (schema · role · logic · tables · invariants · movement rows · failures)

Roles from `commandCatalog.ts:336`; reversal disposition from `:470`.

### `createBatch` — operator · terminal
- **Handler** `commandBus.ts:1084`. Validates via `createBatchPayloadSchema`; decodes `shorthand`.
- **Inputs**: `name|shorthand`, `category`, `vendorId?`, `brandId?`, `tags?`, `intakeQty?`, `unitCost?`,
  `unitPrice?`, `uom?`, `location?`, ownership/arrival fields, PO links, etc.
- **Logic**: `ensureItem` (find by `itemId` or create with generated SKU), `ensureTagCatalog`,
  `batchValidationIssues` (`:7302`), brand auto-resolution (`ensureVendorBrand`). Status defaults
  `draft`; `ready` downgrades to `needs_fix` if issues exist.
- **Tables**: insert `batches` (also touches `items`, `tag_catalog`, `brands`). The alias trigger
  populates `brand_alias`/`vendor_alias`.
- **Invariants**: name + category required; intakeQty/unitCost must be > 0 to be "ready". No movement
  row (drafts aren't inventory yet).

### `updateBatch` — operator · terminal  (also backs `setBatchPrice`, `setBatchLotInfo`)
- **Handler** `:1160`. Field-by-field `copyIfPresent`; scales money/qty. Recomputes
  `validationIssues`.
- **Invariants**: posted `intakeQty` immutable (`:1164`); posted batches can't return to draft/ready
  (`:1167`). `setBatchPrice` (`:863`) injects a required numeric `unitPrice`; `setBatchLotInfo` (`:865`)
  is the same handler with a different toast.

### `deleteBatch` — manager · terminal
- **Handler** `:1214`. Deletes only non-posted batches; throws on posted (`:1218`). No movement row.

### `rejectBatch` — operator · terminal
- **Handler** `:1928`. Requires `reason`. Posted → throw. Sets `status='returned'`, `availableQty=0`,
  dated note + validation issue. PO-linked: appends to `purchase_orders.internal_notes`, decrements
  PO-line `receivedQty`, and reduces open/unpaid `vendor_bills.amount` (Decimal `subMoneyMin0`) under
  `FOR UPDATE`. **No `inventory_movements` row** (rejection happens pre-post).

### `flagBatch` — operator · terminal
- **Handler** `:1974`. Requires `reason`. Appends a dated string to `batches.validation_issues`
  (and PO `internal_notes` if linked). No status/qty change, no movement row.

### `adjustBatchQuantity` — manager · offsettable
- **Handler** `:2025`. Requires `deltaQty|qtyDelta` and a reason. `FOR UPDATE` lock; reads
  `available_qty` via bracket notation. Rejects negative result.
- **Movement row**: `kind='manual_adjustment'`, `qtyDelta = scaled delta`, `reason`.
- **Reversal**: offsettable — post equal opposite adjustment.

### `setInventoryStatus` — manager · reversible
- **Handler** `:2046`. `inventoryStatus()` whitelist = {posted, held, damaged, returned, in_transit}
  (`:7290`). Only those source states may transition (`:2052`). No-op returns `unchanged`.
- **Movement row**: `kind='status_transfer'`, `qtyDelta='0.000'`, `reason='<from> -> <to>: <reason>'`.

### `transferInventoryLocation` — operator · reversible
- **Handler** `:2063`. Requires `location` + reason; `FOR UPDATE` lock; no-op short-circuit.
- **Movement row**: `kind='location_transfer'`, `qtyDelta='0.000'`, `reason='<from> -> <to>: …'`.

### `transferInventoryOwnership` — manager · reversible
- **Handler** `:2082`. `ownership()` whitelist = {C, OFC, UNKNOWN} (`:7285`). Consigned (`C`) requires
  a vendor (`:2097`). Optionally updates `vendorId`. `FOR UPDATE` lock; reads `vendor_id`/
  `ownership_status` via bracket notation.
- **Movement row**: `kind='ownership_transfer'`, `qtyDelta='0.000'`, `reason='<from> -> <to>: …'`.

### `setBatchPrice` — operator · terminal · `setBatchLotInfo` — operator · terminal
- Thin wrappers over `updateBatch` (`:863`, `:865`). No movement row.

### `attachBatchPhoto` — operator · terminal (legacy URL flow)
- **Handler** `:2108`. Requires `photoUrl` (http/https, ≤2048 chars). Sets `batches.photo_url` +
  `mediaStatus='done'`; inserts a `photography_queue` row (`status='done'`). Does **not** touch
  `batch_media`.

### `uploadBatchMedia` — operator · terminal
- **Handler** `:2131`. Inputs: `batchId`, `filePath`, `originalFilename`, `fileSize` (≥0),
  `mimeType`, `mediaType` ∈ {photo, video} (`ALLOWED_MEDIA_TYPES`, `:2128`), optional
  `thumbnailPath`/`mediumPath`/`notes`. Inserts `batch_media` (`role='additional'`, `status='draft'`,
  `uploadedBy=userId`). This is the **session** registration path; the token path inserts directly in
  the route.

### `setBatchMediaRole` — operator · terminal
- **Handler** `:2177`. `role` ∈ {primary_photo, primary_video, additional} (`ALLOWED_MEDIA_ROLES`,
  `:2129`). `FOR UPDATE` lock on target + existing published primary. Maps unique-violation `23505`
  to a friendly message and scrubs DB errors (`scrubDatabaseError`).

### `publishBatchMedia` — operator · terminal
- **Handler** `:2236`. `draft → published` only; stamps `published_at`. Throws "not in draft" if the
  conditional UPDATE affects 0 rows.

### `deleteBatchMedia` — operator · terminal
- **Handler** `:2262`. Deletes the `batch_media` row (source of truth), then best-effort
  `deleteMedia(filePath, thumbnailPath, mediumPath)` (logs, never throws).

### `importBatchesCsv` — operator · terminal
- **Handler** `:2297`. `validateOnly` defaults true → returns validation in `delta`. On commit,
  `ensureVendor` + `createBatch` per row. Affected ids = created batch ids.

### `applyTags` — operator · terminal
- **Handler** `:2342`. `entityType` ∈ {item, purchaseOrderLine, batch, customer, customerNeed,
  vendorSupply}; `mode` ∈ {add, remove, replace}. `ensureTagCatalog` upsert; rebuilds matchmaking for
  need/supply. `delta = { entityType, entityId, tags }`.

### `setItemAlias` — manager · reversible
- **Handler** `:2373`. Alias ≤120 chars; empty → NULL (clear). No-op short-circuit.
  `delta = { previousAlias, alias }`. Reversal restores prior alias.

### `mintPhotoUploadToken` — manager · reversible
- **Handler** `:3220`. Inputs: `batchId`, `ttlMinutes` (positive integer, ≤ `MAX_TTL_MINUTES`=1440).
  Verifies batch exists. `randomBytes(32).hex` raw token; stores `sha256` only; `expiresAt = now +
  ttl`. Inserts `photo_upload_tokens`. Returns raw token **once** in `delta.token` (redacted in
  journal). `affectedIds=[tokenId]`. Reversal = revoke.

### `revokePhotoUploadToken` — manager · terminal
- **Handler** `:3273`. Sets `revoked_at` where `revoked_at IS NULL`; throws "not found or already
  revoked" on 0 rows. Raw token is unrecoverable after revoke.

## B2. Tables — full column docs

### `batches` (`schema.ts:222`; cols added by 0018, 0073)
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `item_id` | uuid FK→items | ON DELETE set null |
| `vendor_id` | uuid FK→vendors | set null |
| `brand_id` | uuid FK→brands | **restrict** |
| `purchase_order_id` / `purchase_order_line_id` | uuid FK | set null; intake provenance |
| `batch_code` | varchar(80) unique notnull | `code('BATCH')` |
| `source_code`, `shorthand` | varchar(120) | shorthand decoded on create |
| `name` | varchar(180) notnull | canonical strain name |
| `category` | varchar(80) notnull | |
| `subcategory` | varchar(80) | |
| `brand_alias`, `vendor_alias` | varchar(80) | **snapshot** populated by alias trigger (0020/0028/0031) |
| `tags` | text[] notnull default [] | |
| `intake_qty` | numeric(12,3) | immutable after posting |
| `available_qty` | numeric(12,3) | mutated by adjust / post / reservation |
| `reserved_qty` | numeric(12,3) | sales reservation |
| `uom` | varchar(24) default 'lb' | |
| `unit_cost`, `unit_price` | numeric(12,2) | cost masked to non-managers in grid |
| `location` | varchar(120) default 'vault' | transfer target |
| `lot_code` | varchar(120) | |
| `intake_date`, `expiration_date`, `posted_at`, `archived_at` | timestamptz | |
| `ticket_cost` | numeric(12,2) | |
| `price_range` | varchar(120) | midpoint feeds pricing fallback |
| `notes` | text | rejection/discrepancy notes appended |
| `legacy_marker` | varchar(120) | |
| `ownership_status` | varchar(16) default 'UNKNOWN' | {C, OFC, UNKNOWN} |
| `arrival_confirmed` | boolean | |
| `arrival_status` | varchar(32) default 'pending' | {pending, arrived, cancelled} |
| `validation_issues` | jsonb string[] | recomputed on create/update |
| `media_status` | varchar(32) default 'open' | {open, in_progress, done} legacy media readiness |
| `status` | varchar(32) default 'draft' | draft/ready/needs_fix/posted/returned/held/damaged/in_transit |
| `sort_id` | integer (bigserial via 0018) | stable cursor pagination |
| `photo_url` | text | legacy `attachBatchPhoto` URL |
| `case_pack` | integer nullable (0073) | wholesale case pack qty |
| `created_at`, `updated_at` | timestamptz | |
Indexes: status, vendor, category (+ 0022/0030/0032 composites).

### `items` (`schema.ts:143`; `alias` added by 0008)
`id` · `sku` varchar(80) unique notnull · `name` varchar(180) notnull · `alias` varchar(180) (strain
alias, ≤120 enforced in command) · `category` varchar(80) notnull · `tags` text[] · `pricing_rule`
jsonb · `created_at`/`updated_at`.

### `brands` (`schema.ts:58`; 0016, vendor_id by 0068)
`id` · `name` varchar(80) notnull · `alias` varchar(80) notnull default `'Brand TBD'`
(customer-facing) · `notes` · `active` bool default true · `vendor_id` uuid FK→vendors set null
(auto-brand owner) · `created_by`/`updated_by`/`deleted_by` FK→users · `deleted_at` · timestamps.

### `tag_catalog` (`schema.ts:125`; migration 0005)
`id` · `slug` varchar(80) **unique** notnull · `label` varchar(120) notnull · `color` varchar(32)
default 'gray' · `description` text · `is_active` bool default true · timestamps. Upserted by
`ensureTagCatalog` (`onConflictDoUpdate` on slug). Seeded with infused/candy/premium/flower/value/
extract/live/vape/pre-roll.

### `inventory_movements` (`schema.ts:275`; migration 0003 row-native)
`id` · `batch_id` uuid FK→batches **cascade** notnull · `command_id` uuid (ties to command_journal) ·
`kind` varchar(48) notnull · `qty_delta` numeric(12,3) notnull · `reason` text · `created_at`.
**Known `kind` values written by handlers**: `intake_posted` (qty=intakeQty), `manual_adjustment`
(qty=delta), `status_transfer` / `location_transfer` / `ownership_transfer` (qty='0.000', reason holds
the `from -> to` transition). Append-only; read via `queries.inventoryMovements`.

### `batch_media` (`schema.ts:898`; migration 0034)
`id` · `batch_id` FK→batches **cascade** notnull · `file_path` text notnull · `original_filename`
varchar(255) notnull · `file_size` bigint notnull · `mime_type` varchar(100) notnull ·
`thumbnail_path` / `medium_path` text · `media_type` varchar(20) notnull CHECK ∈ {photo, video} ·
`role` varchar(30) default 'additional' CHECK ∈ {primary_photo, primary_video, additional} · `status`
varchar(20) default 'draft' CHECK ∈ {draft, published} · `published_at` · `replaced_at` · `replaced_by`
self-FK set null · `uploaded_by` FK→users set null · `notes` text · timestamps.
**Invariant**: partial unique indexes `batch_media_primary_photo_unique` /
`batch_media_primary_video_unique` enforce ≤1 published, non-replaced primary photo/video per batch.

### `photography_queue` (`schema.ts:642`)
`id` · `batch_id` FK→batches cascade notnull · `status` varchar(32) default 'open' · `requested_by`
FK→users set null · `notes` text · timestamps. Auto-inserted on receipt post (`open`) and on
`attachBatchPhoto` (`done`).

### `photo_upload_tokens` (`schema.ts:976`; migration 0042)
`id` · `batch_id` FK→batches cascade notnull · `token_hash` text **unique** notnull (sha256 only;
raw token never stored) · `issued_by` FK→users notnull · `issued_at` default now · `expires_at`
notnull · `revoked_at` · `last_used_at` · `use_count` int default 0. Indexes on batch_id and
expires_at.

### `media_retention_policies` (`schema.ts:948`; migration 0035)
`id` · `name` varchar(180) notnull · `description` · `days_to_keep` int notnull CHECK > 0 ·
`applies_to` varchar(20) notnull CHECK ∈ {draft, replaced} · `is_active` bool default true · timestamps.
Seeds: Draft Cleanup (90d/draft), Replaced Media Cleanup (30d/replaced).

### `media_cleanup_log` (`schema.ts:961`; migration 0035)
`id` · `policy_id` FK→media_retention_policies set null · `files_deleted` int notnull · `bytes_freed`
bigint notnull · `started_at`/`completed_at` timestamptz notnull · `success` bool default true ·
`error_message` text · `created_at`.

## B3. Query procs (read models)

- **`grid({view})`** (`queries.ts:135`) — RBAC masks `unitCost`→null for non-managers on `inventory`,
  and `internalMargin`/`marginWaivedTotal` on `sales`. `inventory` SQL (`:2356`) exposes
  `displayName=coalesce(alias,name)`, `ageDays`, ownership, `mediaStatus`. `photography` SQL (`:2436`)
  joins `batch_media_summary` (view, migration 0036) for counts and orders needs-photo-first.
- **`inventoryMovements({batchId?})`** (`:1043`) — last 100 movements joined to batch_code, newest
  first; batchId optional.
- **`photographyQueue()`** (`:1057`) — queue joined to batch name/media_status, ordered
  open→in_progress→done, limit 100.
- **`batchMediaList({batchId})`** (`:1069`) — non-replaced media for a batch, ordered primary_photo→
  primary_video→additional; returns `hasThumbnail` (boolean), not raw paths.

## B4. HTTP routes & middleware

- **`POST /api/upload/media`** (`uploadRoute.ts:65`) — `requirePhotographyEnabled` →
  `requireOperatorOrUploadToken` → `uploadRateLimiter` → multer (disk storage, dir =
  `resolveBatchMediaPath`, filename = `uuid_sanitized`, ext allowlist, 200 MB ceiling). Then:
  body-batchId == token-batchId recheck (403), per-type size refine (50/200 MB, 400),
  `checkDiskSpace` (507), `validateMagicBytes` (400), HEIC→JPEG, thumbnail generation, and (token
  path only) direct `batch_media` insert. Returns file metadata `{ fileId, filePath, …, mediaId? }`.
- **`DELETE /api/upload/media/staged`** (`:206`) — operator-only; path-traversal guard restricts to
  media storage root; cleans orphaned staged files.
- **`GET /api/media/:id`** (`mediaRoute.ts:36`) and **`/:id/thumb`** (`:96`) — operator-only,
  photography-gated, rate-limited. nosniff; attachment for video; HTTP Range / 206 streaming.
- **`requirePhotographyEnabled`** (`requirePhotographyEnabled.ts`) — 503 unless `ENABLE_PHOTOGRAPHY`
  is unset or `=true` (read at request time for live kill-switch).
- **`requireOperatorOrUploadToken`** (`requireOperatorOrUploadToken.ts`) — Bearer token path takes
  precedence when present: reads batchId from query/`x-batch-id`, `validateBatchIdFormat`,
  `verifyUploadToken(pool, token, batchId)`, sets `req.uploadContext`. Token errors → 401 (403 only
  for wrong-batch). Else cookie/session path requiring operator+.

## B5. Media service internals

- **`mediaStorage.ts`** — `uploadMedia` returns file metadata + thumbnails (images only).
  `generateThumbnails` (sharp): 200×200 cover JPEG q80 thumb + 800×800 inside JPEG q85 medium, written
  to `<storage>/.thumbnails/<batchId>/`. `convertHeicToJpeg` (rotate, q90) and unlinks the heic.
  `deleteMedia` best-effort unlinks file/thumb/medium.
- **`mediaValidation.ts`** — `validateBatchIdFormat` (UUID regex), `sanitizeFilename` (strip to
  `[a-zA-Z0-9_-]`, ≤100 + ext), `validateMagicBytes` (`file-type` sniff against allowlist:
  jpeg/png/heic/mp4/quicktime).
- **`photoUploadTokens.ts`** — `mintUploadToken` (256-bit, sha256 hash persisted, TTL 1 min..24 h),
  `verifyUploadToken` (well-formed check, hash lookup, revoked/expired/wrong-batch throws, best-effort
  `use_count`/`last_used_at` bump that never fails auth), `revokeUploadToken` (set `revoked_at`,
  idempotent).
- **`csv.ts`** — `parseCsv`, `validateBatchCsv`, `rowsToCsv`, quote-aware `splitCsvLine`/`quoteCsv`.

## B6. Alias trigger logic (DB-side)

`update_batch_alias_snapshots()` fires `BEFORE INSERT OR UPDATE OF brand_id, vendor_id ON batches`
(migration 0020 → optimized 0028 → NULL-safe 0031). Current behavior (0031): only when
`brand_id`/`vendor_id` actually changed, copies the brand/vendor **name** into `brand_alias` /
`vendor_alias`; if the FK is NULL or the referenced row is missing it sets the snapshot to NULL
(defensive) instead of raising. (The original 0020/0028 versions raised
`'Brand/Vendor ID % has no alias - cannot create batch'` — superseded.) Migration 0026 backfilled
existing rows. This snapshot is why renaming a brand/vendor does not retroactively change historical
batch labels.

## B7. Shared pricing helpers (display, not persistence)

- `computeInventoryUnitPrice` (`inventoryPricing.ts:35`) applies the pricing-rule cascade; basis cost
  falls back to `priceRange` midpoint when `unitCost` is 0/missing, never collapsing to 0.
- `resolvePricingRuleEntry` (`inventoryPricingShared.ts:13`) — 7-level resolution
  (customer subcat → customer cat → customer default → settings subcat → settings cat →
  settings default → 30% fallback). `applyPricingRule` (percent/dollar) and `markupDollarsFromPrice`
  keep markup-on-cost consistent for range-COGS rows.
- `formatInventoryUnitCost` / `inventoryUnitCostSortValue` drive the grid's "$30–$50" display vs.
  numeric sort by midpoint.

---

## Summary

In TERP Operator, all inventory, tag, brand, and media writes funnel through one journaled,
idempotent, RBAC-gated command bus (`executeCommand`, `commandBus.ts:480`) that wraps each handler in
a single transaction, writes append-only `inventory_movements` rows for every quantity/status/
location/ownership change, snapshots before/after state for reversal, redacts secrets (the
`mintPhotoUploadToken` raw token), and broadcasts `command:completed`/`failed` over Socket.io to the
`authenticated` room. Batches are drafts until a purchase receipt posts them — at which point a
photography-queue row is auto-created — and from there operators adjust, transfer, tag, and photograph
them. The photography pipeline (queue → operator-session **or** tokenized-share-link upload → role
assignment with partial-unique-index enforced single primary photo/video → publish → range-streamed
customer-safe serving → 90/30-day retention cleanup) is the most intricate flow, with a hash-only,
batch-scoped, TTL-bound, revocable upload-token security model and a feature kill-switch
(`ENABLE_PHOTOGRAPHY`) on every media route. Customer-safe naming is preserved by a NULL-safe Postgres
alias-snapshot trigger plus per-item strain aliases.

## Checklist of documented artifacts

**Commands (21):** createBatch · updateBatch · deleteBatch · rejectBatch · flagBatch ·
adjustBatchQuantity · setInventoryStatus · transferInventoryLocation · transferInventoryOwnership ·
setBatchPrice · setBatchLotInfo · attachBatchPhoto · uploadBatchMedia · setBatchMediaRole ·
publishBatchMedia · deleteBatchMedia · importBatchesCsv · applyTags · setItemAlias ·
mintPhotoUploadToken · revokePhotoUploadToken (plus upstream context: postPurchaseReceipt,
verifyAllIntake).

**Tables (10):** batches · items · brands · tag_catalog · inventory_movements · batch_media ·
photography_queue · photo_upload_tokens · media_retention_policies · media_cleanup_log.

**Query procs (4):** grid (inventory + photography views) · inventoryMovements · photographyQueue ·
batchMediaList.

**Routes/middleware (6):** POST /api/upload/media · DELETE /api/upload/media/staged · GET /api/media/:id ·
GET /api/media/:id/thumb · requireOperatorOrUploadToken · requirePhotographyEnabled.

**Services (4):** mediaStorage.ts · mediaValidation.ts · photoUploadTokens.ts · csv.ts.

**Shared logic (3):** tags.ts · inventoryPricing.ts · inventoryPricingShared.ts.

**Client (9):** MediaView.tsx · mobile/MobileInventoryView.tsx · MediaBatchDrawer.tsx · MediaList.tsx ·
MediaUploadMobile.tsx (+ MediaUploadMobileRoute) · PhotographyQueuePanel.tsx · drawerTabs/LotPhotosTab.tsx ·
drawerTabs/LotMovementTab.tsx · drawerTabs/LotHistoryTab.tsx.

**Migrations cited:** 0003 (row-native movements) · 0005 (tags) · 0008/0026 (aliases) ·
0018/0073 (batch fields, case_pack) · 0020/0028/0031 (alias trigger evolution) · 0034-0037 (media) ·
0042 (photo tokens).
