# Persona: Photographer / Readiness Operator

## Who They Are
The Photographer tracks photo and media readiness for inventory. Their job is to
ensure product is visually ready to share with buyers before it appears in sales
catalogs. They work at the intersection of Inventory and Sales — a batch with no
photos should not be shared externally. They identify blockers, update readiness
status, and flag gaps to the Sales Operator.

## Operating Style
- Works from the Inventory view, scanning media/readiness columns
- Marks batches as photo-ready after a shoot session
- Flags batches that are blocking catalog readiness due to missing media
- Does not post, sell, or take financial actions
- Works in batches — processes a whole day's shoot in one session

## Primary Views
- **Inventory** (`view: 'inventory'`) — primary; media/readiness columns
- **Sales** (`view: 'sales'`) — verifies photo-ready batches are correctly surfaced for buyers

## Command Families Used
- `CMD-INTAKE` — updateBatchMedia, updateMediaStatus (readiness updates on batches)

## What Good Looks Like
- Media readiness status visible as a column in the Inventory grid
- Updating media status for a batch takes one inline edit or row action
- Catalog readiness — which batches are share-ready — determinable in under 60 seconds
- Batches without photos clearly distinguishable from batches with photos in a single filter

## What Friction Looks Like
(Flag these as findings even when the flow technically completes.)
- No media/readiness column visible in Inventory grid by default
- Updating photo status requires opening a modal rather than inline edit
- Cannot filter Inventory by "has photos" vs. "no photos"
- Photo readiness not surfaced in the Sales view where catalog decisions are made

## Known System Constraints
(These are not bugs. Do not file findings for them.)
- Photography module may be partially implemented — see `docs/PHOTOGRAPHY_MODULE.md`
- If media columns are not visible, document as a product gap (Linear), not a navigation error
- State-based routing — see `_shared/navigation-primer.md`

## Scenarios in This Directory
| File | Type | Covers |
|------|------|--------|
| `01-batch-photo-session-normal.md` | normal | Find batches needing photos; update media status for a session's batches |
| `02-missing-media-blocker-edge.md` | edge-case | Identify Live batches missing photos; surface and flag the blocker |
| `03-catalog-readiness-sweep-normal.md` | normal | Full sweep: determine which batches are catalog-ready vs. blocked |
