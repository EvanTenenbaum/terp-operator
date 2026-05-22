# Design: Photography Batch Media Side Drawer

**Date:** 2026-05-22  
**Status:** Approved  
**Route:** `/photography`  
**Files affected:** `MediaView.tsx`, `MediaDetailPanel.tsx` (retired), new `MediaBatchDrawer.tsx`, new server upload endpoint

---

## Problem

The Batch Media panel currently renders as a `WorkspacePanel` below the main AG Grid table on the `/photography` page. This buries media management below the fold, compresses the grid, and does not support direct desktop file upload.

---

## Solution

Replace the bottom panel with a push-style side drawer (`MediaBatchDrawer`) that opens to the right of the grid when a batch row is selected. The grid shrinks to fill available space; the drawer takes a fixed ~480px right column. The drawer supports both desktop file upload (file picker + drag-and-drop) and the existing mobile upload link / share link flow.

---

## Layout

`MediaView` becomes a `flex flex-row h-full` container:

- **Left:** existing `OperatorGrid` — `flex-1 min-w-0`, shrinks when the drawer is open
- **Right:** `MediaBatchDrawer` — `w-[480px] flex-shrink-0`, animates in/out via CSS transition on `width` and `opacity`

Row selection opens the drawer. Deselecting (or clicking ✕) closes it and the grid re-expands. No overlay, no backdrop.

The current `<div className="border-t">` block at the bottom of `MediaView` (which renders `MediaDetailPanel` or the "Select a batch" placeholder) is removed entirely.

The `selectionActions` toolbar in the grid (currently shows "Copy mobile link") is also removed — those actions now live exclusively in the drawer.

---

## Drawer Structure (`MediaBatchDrawer`)

Self-contained `<aside>` component. CSS classes: `media-batch-drawer` (base), `media-batch-drawer-open` (when visible). No changes to `uiStore`, `ContextDrawer`, or any other view.

### Header
- Batch code + batch name (truncated)
- ✕ close button (calls `onClose`, which sets `selectedBatchId` to null in `MediaView`)

### Upload Zone (always visible at top of body)

**Desktop upload:**
- Drag-and-drop zone: `<label>` wrapping `<input type="file" multiple accept="image/*,video/*">`
- Visual: dashed border, icon, "Drop files here or click to upload" text
- On file select/drop: POST each file to `POST /api/media/upload` (new endpoint), then call existing `uploadBatchMedia` command with the returned path
- Per-file progress bar via `XMLHttpRequest` upload progress events
- On completion: `query.refetch()` to refresh the media list

**Mobile upload:**
- "Copy mobile link" button (same as today)
- "Mint share link (2h)" button (manager/owner only, same as today)
- Minted share link amber alert renders inline here (same as today)

### Media List (scrollable)
- Existing media table: thumbnail, filename, type, role, status, published date, actions (set primary photo/video, demote, publish, delete with confirm)
- Scrolls independently within the drawer
- Loading/error/empty states same as today

---

## Server Upload Endpoint

**Route:** `POST /api/media/upload`  
**Auth:** Session-authenticated (same middleware as all other `/api` routes)  
**Body:** `multipart/form-data` with one or more file fields  
**Behavior:**
1. Validate MIME type is `image/*` or `video/*`
2. Write to the same controlled media directory used by the mobile upload flow
3. Return `{ path: string, mediaType: 'photo' | 'video', originalFilename: string }`

No new storage system. Same path, same permissions as the mobile flow.

**Follow-up call:** client calls `uploadBatchMedia` tRPC command with `{ batchId, mediaPath: path }` — same command, same audit trail, same `batch_media` row creation.

---

## CSS

New classes added to the existing stylesheet:

```
.media-batch-drawer          — base drawer aside (width: 0, overflow hidden, transition)
.media-batch-drawer-open     — open state (width: 480px)
.media-batch-drawer-header   — header row (flex, space-between, border-b)
.media-batch-drawer-body     — scrollable body (flex-col, overflow-y-auto)
.media-upload-zone           — drag-and-drop target area (dashed border, centered content)
.media-upload-zone-active    — dragover highlight state
.media-upload-progress       — per-file progress bar row
```

---

## Components Changed / Created

| File | Change |
|------|--------|
| `src/client/views/MediaView.tsx` | Refactor to flex-row layout; remove bottom panel block; remove `selectionActions` toolbar; mount `MediaBatchDrawer` |
| `src/client/components/MediaBatchDrawer.tsx` | **New** — full drawer with upload zone + media list |
| `src/client/components/MediaDetailPanel.tsx` | **Retired** — logic migrated into `MediaBatchDrawer` |
| `src/server/uploadRoute.ts` (or equivalent) | **New** — `POST /api/media/upload` multipart endpoint |
| `src/client/styles/` (or global CSS) | New drawer + upload zone CSS classes |
| `src/client/components/MediaDetailPanel.test.tsx` | Update/migrate tests to `MediaBatchDrawer` |

---

## Out of Scope

- QR code display for mobile link (mobile link button is sufficient)
- Drawer resize states (peek/standard/wide) — fixed 480px width for now
- Bulk upload progress summary — per-file bars are sufficient
- Changing the mobile upload flow (`/photography/mobile/:batchId`) — untouched
