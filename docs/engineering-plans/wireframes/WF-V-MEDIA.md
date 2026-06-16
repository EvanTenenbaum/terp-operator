# Wireframe: WF-V-MEDIA — MediaView

**Template:** GridView
**Entity:** MediaRecord
**Wireframe ID:** WF-V-MEDIA

---

## Full View — Default State (Tab: All, No Selection)

```
┌─View Header──────────────────────────────────────────────────────────────┐
│ Media Library                                                  [Upload]   │
└───────────────────────────────────────────────────────────────────────────┘
┌─FilterToolbar────────────────────────────────────────────────────────────┐
│ [▾ Data views]  │  Date ▾  │  Keyword ▾  │  Type ▾  │ Entity ▾  │ Sort ▾ │ ⬇ │
└───────────────────────────────────────────────────────────────────────────┘
┌─GridSummaryStrip─────────────────────────────────────────────────────────┐
│ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐      │
│ │ 3,421 Files  │ │ 2.4 GB       │ │ 847 Images   │ │ 1,203 Linked │      │
│ │    Total     │ │   Total Size │ │   Photos     │ │   to Orders  │      │
│ └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘      │
└───────────────────────────────────────────────────────────────────────────┘
┌─ViewTabBar───────────────────────────────────────────────────────────────┐
│  All (3,421) │ Images (847) │ Documents (2,104) │ Spreadsheets (470)      │
└───────────────────────────────────────────────────────────────────────────┘
┌─AG Grid (32px rows, checkboxes, sortable headers)────────────────────────┐
│ ☐ │ ID        │ Thumb │ Name               │ Type      │ Linked To       │ Upload    │ Size  │
├───┼───────────┼───────┼────────────────────┼───────────┼─────────────────┼───────────┼───────┤
│ ☐ │ MED-5214  │ [🏞]  │ PO-8841_pallet.jpg │ Image     │ PO-8841         │ 2026-06-14│ 2.4MB │
│   │           │       │ Pallet photograph   │ JPEG      │ Acme Corp       │           │       │
│ ☐ │ MED-5213  │ [📄]  │ SO-7732_invoice.pdf│ Document  │ SO-7732         │ 2026-06-14│ 156KB │
│   │           │       │ Customer invoice    │ PDF       │ BerryBest       │           │       │
│ ☑ │ MED-5212  │ [📊]  │ Q2_inventory.xlsx  │ Sprdsheet │ —               │ 2026-06-13│ 1.8MB │
│   │           │       │ Q2 stock count      │ XLSX      │ Unlinked        │           │       │
│ ☐ │ MED-5211  │ [🏞]  │ LOT-4412_batch.jpg │ Image     │ LOT-4412        │ 2026-06-13│ 3.1MB │
│   │           │       │ Quality inspection  │ JPEG      │ Strawberries    │           │       │
│ ☐ │ MED-5210  │ [📄]  │ V-992_cert.pdf     │ Document  │ V-992           │ 2026-06-13│ 89KB  │
│   │           │       │ Organic cert 2026   │ PDF       │ TerraFruits     │           │       │
│ ☐ │ MED-5209  │ [📄]  │ contract_2026.docx │ Document  │ CUST-441        │ 2026-06-12│ 412KB │
│   │           │       │ Supply agreement    │ DOCX      │ GlobalFresh     │           │       │
│ ☐ │ MED-5208  │ [🏞]  │ damage_report.png  │ Image     │ DISP-118        │ 2026-06-12│ 5.8MB │
│   │           │       │ Loading dock damage │ PNG       │ Dispute #118    │           │       │
└───┴───────────┴───────┴────────────────────┴───────────┴─────────────────┴───────────┴───────┘
┌─BulkActionBar (conditional)──────────────────────────────────────────────┐
│ 1 file selected                                                           │
│ [Download] [Link to Entity] [Delete] [Share]                              │
└───────────────────────────────────────────────────────────────────────────┘
┌─DetailSlideover: Peek (280px)────────────────────────────────────────────┐
│ MED-5212                                             ×                   │
│ ┌────────────────────────────┐                                            │
│ │ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ │  ← thumbnail preview (XLSX icon placeholder)│
│ │ ▓▓▓▓  📊  XLSX  ▓▓▓▓▓▓▓▓ │                                            │
│ │ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ │                                            │
│ └────────────────────────────┘                                            │
│ Q2_inventory.xlsx                                                        │
│ Spreadsheet · 1.8 MB                                                     │
│ Uploaded: Jun 13, 2026                                                   │
│ [Download] [Link] [Delete]                                               │
│ ◀ drag                                                                    │
└───────────────────────────────────────────────────────────────────────────┘
```

---

## DetailSlideover: Standard (420px) — Preview Tab (Image)

```
┌─Main Content (shifts left)───────────────────┬─DetailSlideover: Standard─┐
│                                               │ MED-5214                   │
│  [Grid is narrower, fully functional]         │ ┌────────────────────────┐ │
│                                               │ │                        │ │
│                                               │ │  [Image Preview]       │ │
│                                               │ │  240×240 thumbnail     │ │
│                                               │ │  Strawberry pallet     │ │
│                                               │ │  photo                 │ │
│                                               │ │                        │ │
│                                               │ └────────────────────────┘ │
│                                               │ PO-8841_pallet.jpg        │
│                                               │ JPEG · 2.4 MB · 2400×1600 │
│                                               │ [Download] [View Full]    │
│                                               │────────────────────────────│
│                                               │ Preview│ Meta│ Linked│ His │
│                                               │    ▾    │     │       │     │
│                                               │────────────────────────────│
│                                               │ Image viewer (when full):  │
│                                               │ ┌────────────────────────┐ │
│                                               │ │ [Zoomable image here]  │ │
│                                               │ │ ← → rotate  ⊕ zoom     │ │
│                                               │ └────────────────────────┘ │
│                                               │ [Open in full view →]      │
└───────────────────────────────────────────────┴────────────────────────────┘
```

---

## DetailSlideover — Metadata Tab

```
│ Preview│ Meta│ Linked│ His │
│        │  ▾  │       │     │
│────────────────────────────│
│ File Details:              │
│ ┌────────────────────────┐ │
│ │ Filename   PO-8841...  │ │
│ │ Type       image/jpeg  │ │
│ │ Size       2.4 MB      │ │
│ │ Dimensions 2400 × 1600 │ │
│ │ Uploaded   Jun 14 2026 │ │
│ │ Uploaded by Sarah Chen │ │
│ │ SHA-256    a1b2c3...   │ │
│ │ Tags       pallet, po  │ │
│ └────────────────────────┘ │
│ [Edit Tags] [Replace File] │
```

---

## DetailSlideover — Linked Records Tab

```
│ Preview│ Meta│ Linked│ His │
│        │     │   ▾   │     │
│────────────────────────────│
│ Linked to:                 │
│ ┌────────────────────────┐ │
│ │ PO-8841 Purchase Order │ │  ← click navigates to PO
│ │ Acme Corp · $48,200    │ │
│ │ Ordered · Jun 14       │ │
│ └────────────────────────┘ │
│ Related Files:             │
│ ┌────────────────────────┐ │
│ │ MED-5210 V-992_cert... │ │  ← same PO
│ │ MED-5203 PO-8841_bill  │ │
│ └────────────────────────┘ │
│ [Link to Another Entity]   │
```

---

## Image Thumbnail Column — Inline Preview

```
│ [🏞]  │  ← 32×32 inline thumbnail. On hover → 120×120 tooltip preview.
```

- Thumb column: 48px wide. Centered icon/thumbnail.
- Icons by type: 🏞 image, 📄 document, 📊 spreadsheet, 🎥 video, 📦 other.
- When actual thumbnail available (image types): 28×28 rounded thumbnail.
- Hover: 120×120 preview tooltip. 300ms delay. Fade in 150ms.

---

## Dimensions

- View container: 100vw × 100vh
- View Header: 56px tall. [Upload] button right-aligned, opens file picker or drag-drop zone.
- FilterToolbar: 44px tall. Type quick filter replaces Amount (Images/Documents/Spreadsheets/Other). Entity filter: autocomplete lookup for linked entities.
- GridSummaryStrip: 80px tall, 4 metric cards.
- ViewTabBar: 40px tall. Tabs: All, Images, Documents, Spreadsheets (auto-detected from MIME type).
- AG Grid: 32px row height. Thumb column 48px. ID column 110px. Name column 240px (two-line: filename + description). Type column 100px. Linked To column 180px (two-line: ID + name). Upload date column 130px. Size column 90px.
- Thumbnail preview (detail): 240×240 in standard view. Scales to fit slideover width in wide view.
- Inline thumbnail: 28×28. Hover tooltip: 120×120.
- Image viewer (full): fills slideover width. Zoom 100-300%. Rotate buttons.
- Metadata rows: 28px each. Label-value pairs.
- Linked Records rows: 56px each. Clickable entity cards.
- BulkActionBar: 52px tall.
- DetailSlideover: Peek 280px → Standard 420px → Wide 60vw.
- Font: Inter 13px body, 11px secondary metadata, 14px header.

---

## Interactive Elements

- **Drag-and-drop zone:** Visible above grid when [Upload] clicked or files dragged. "Drop files here" with dashed border. Accepts any file type.
- **Upload progress:** Per-file progress bars. "Uploading 3 of 7 files... 2.4 MB / 8.1 MB". Cancel button per file.
- **Inline thumbnail (grid):** Click → opens DetailSlideover to Preview tab. Hover → 120×120 tooltip preview.
- **Thumbnail column icon:** Click → opens preview. Right-click → context menu (Download, Link, Delete, Share).
- **Name cell:** Double-click → inline rename. Enter commits. Validates: no duplicate name in same linked entity.
- **Type cell:** Non-editable. Derived from MIME type on upload.
- **Linked To cell:** Click → navigates to linked entity view. "Unlinked" shown as muted text. ComboboxCellEditor to link/unlink.
- **Row click:** Single-click → DetailSlideover peek. Double-click → standard.
- **Upload button:** Opens native file picker (multiple files allowed). Can also drag files onto view.
- **BulkActionBar Download:** Downloads selected files as individual downloads or ZIP if >1 file.
- **BulkActionBar Link to Entity:** Opens entity lookup to link all selected files.
- **BulkActionBar Delete:** Confirmation dialog. "Delete 3 files? This cannot be undone." Shows file names.
- **BulkActionBar Share:** Generates shareable link (time-limited, optional password).
- **Preview tab — Image:** Zoomable (scroll wheel or +/- buttons). Rotatable (← → buttons). Full-screen button expands to entire viewport.
- **Preview tab — Document/Spreadsheet:** Embedded viewer (PDF.js for PDFs, iframe for Office docs). Download button.
- **Preview tab — Unsupported type:** Generic file icon. "Preview not available for .xyz files." Download button.
- **Metadata tab — Edit Tags:** Inline tag editor. Type tag + Enter to add. × to remove. Autocomplete from existing tags.
- **Metadata tab — Replace File:** Opens file picker. Keeps same ID, links, metadata. "Replacing will update the file. Version history preserved."

---

## States Shown

- **Default (All tab):** All files visible. Thumbnail icons by type. Sortable by any column.
- **Upload in progress:** Progress bar overlay at top of view. "Uploading 3 files..." File list with individual progress. Files appear in grid as they complete.
- **Upload complete:** Green flash on new rows. "3 files uploaded successfully." Toast notification.
- **Empty state (no files):** "No files yet." Upload CTA centered. "Drag files here or click Upload to get started." FilterToolbar visible.
- **Empty tab (e.g., Spreadsheets):** "No spreadsheets uploaded." "Upload a spreadsheet" button.
- **Image preview loading:** Skeleton rectangle with spinner. "Loading preview..."
- **Image preview error:** Broken image icon. "Preview could not be loaded." File may be corrupted or unsupported format.
- **Delete confirm:** Modal dialog listing files. "Delete 3 files? This action cannot be undone." Red Delete button.
- **File linked/unlinked:** Green checkmark flash when linked. Toast: "Linked to PO-8841."

---

## ARIA Annotations

- View container: role="region", aria-label="Media library"
- Upload zone: role="region", aria-label="File upload area". Live region: aria-live="polite" for progress updates.
- Upload progress: role="progressbar", aria-valuenow, aria-valuemin="0", aria-valuemax="100", aria-label="Uploading file N of M"
- Thumbnail cell: role="gridcell". Thumbnail: role="img", aria-label="Thumbnail of [filename]". Decorative if adjacent text provides name.
- Inline thumbnail hover preview: role="tooltip", aria-label="Preview of [filename]"
- Name cell: role="gridcell". Editing: role="textbox", aria-label="Rename file"
- Type cell: role="gridcell", aria-label="File type: [MIME]"
- Linked To cell: role="gridcell". Link: role="link", aria-label="Linked to [entity type] [entity ID]"
- AG Grid: role="grid", aria-label="Media files"
- BulkActionBar: role="toolbar", aria-label="File actions"
- Delete button: aria-label="Delete [count] files". Includes aria-describedby for confirmation.
- DetailSlideover: role="complementary", aria-label="File details"
- Preview tab — image: role="img", aria-label="[filename] preview". Zoom controls: role="button", aria-label="Zoom in/Zoom out"
- Preview tab — no preview: role="status", aria-label="Preview not available for this file type"
- Metadata tab: role="tabpanel", aria-label="File metadata"
- Tags: role="list", aria-label="File tags". Tags: role="listitem". Remove: aria-label="Remove tag [tag name]"
- Linked Records tab: role="tabpanel", aria-label="Linked records"
- History tab: role="tabpanel", aria-label="File version history"

---

## Edge Cases Handled

- **Very large file upload (>100MB):** Chunked upload with progress. "Large file — uploading in chunks." Can pause/resume.
- **Duplicate filename in same linked entity:** Auto-rename: "filename (2).jpg". Warning toast: "A file with this name already exists."
- **Unsupported file type:** Upload accepted. Preview shows generic icon. Type categorized as "Other". Warning: "Preview not available for .xyz files."
- **File with no linked entity:** "Unlinked" badge in grid. Can be linked later via BulkActionBar or detail view. Filter: "Unlinked files" quick filter.
- **Corrupted image file:** Thumbnail shows broken image icon. Detail preview shows error state. "This file appears to be corrupted."
- **Concurrent delete+view:** If file deleted while another user has preview open, toast: "This file has been deleted." Preview closes.
- **Many linked records for one file:** Detail Linked tab scrollable. "Showing all 12 linked records."
- **File with very long name:** Truncated with ellipsis in grid. Full name in tooltip. Detail view shows full name.
- **Spreadsheet preview:** Shows first sheet only in embedded preview. "Sheet 1 of 4" selector. Download to view all sheets.
- **Video files:** Thumbnail shows ▶ overlay on first frame. Preview tab: embedded video player (HTML5).
- **Batch upload with mixed types:** Files auto-categorized into correct tabs. SummaryStrip updates after all uploads complete.
