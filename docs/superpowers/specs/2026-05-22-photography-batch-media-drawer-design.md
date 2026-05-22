# Design: Photography Batch Media Side Drawer

**Date:** 2026-05-22  
**Status:** Approved  
**Route:** `/photography`  
**Files affected:** `MediaView.tsx`, `MediaDetailPanel.tsx` (retired), new `MediaBatchDrawer.tsx`, CSS additions

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

The `selectionActions` toolbar in the grid (currently shows "Copy mobile link" on row select) is also removed — those actions now live exclusively in the drawer.

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
- Files are uploaded one at a time (the existing endpoint uses `multer.single('file')`)
- Per-file flow:
  1. POST `multipart/form-data` to existing **`POST /api/upload/media`** with `{ batchId, file }` — session auth, already exists in `uploadRoute.ts`
  2. On success, call existing `uploadBatchMedia` tRPC command with the returned `{ batchId, filePath, originalFilename, fileSize, mimeType, mediaType, thumbnailPath, mediumPath }`
- Per-file progress bar via `XMLHttpRequest` upload progress events
- On all files complete: `query.refetch()` to refresh the media list

**Mobile upload:**
- "Copy mobile link" button (same as today)
- "Mint share link (2h)" button (manager/owner only, same as today)
- Minted share link amber alert renders inline here (same as today)

### Media List (scrollable)
- Existing media table: thumbnail, filename, type, role, status, published date, actions (set primary photo/video, demote, publish, delete with confirm)
- Scrolls independently within the drawer
- Loading/error/empty states same as today

---

## Server Changes

**None.** The upload endpoint already exists at `POST /api/upload/media` (in `src/server/routes/uploadRoute.ts`). It handles:
- Session-authenticated operators: stores file, returns `{ filePath, originalFilename, fileSize, mimeType, thumbnailPath, mediumPath }` — client must then call `uploadBatchMedia` command
- Token-authenticated photographers (existing mobile flow): auto-creates the `batch_media` row — no further client call needed

The `uploadBatchMedia` command signature (`commandBus.ts`):
```
{ batchId, filePath, originalFilename, fileSize, mimeType, mediaType, thumbnailPath?, mediumPath?, notes? }
```

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
| Global CSS | New drawer + upload zone CSS classes |
| `src/client/components/MediaDetailPanel.test.tsx` | Migrate tests to `MediaBatchDrawer.test.tsx` |

---

## Out of Scope

- QR code display for mobile link (button is sufficient)
- Drawer resize states (peek/standard/wide) — fixed 480px for now
- Bulk upload progress summary — per-file bars are sufficient
- Changing the mobile upload flow (`/photography/mobile/:batchId`) — untouched
- New server endpoints — `POST /api/upload/media` already covers the desktop flow
