# Wireframe: WF-V-MEDIA — MediaView

**Template:** GridView
**Entity:** MediaRecord
**Wireframe ID:** WF-V-MEDIA

---

### UX Posture

The media library table is the only primary surface. Type filter is a pill in the FilterToolbar. Preview, metadata, linked records, and history live in the slide-over. Upload zone appears only when triggered, not pre-staged.

---

## Full View — Default State (no selection)

```
┌─FilterToolbar────────────────────────────────────────────────────────────┐
│ [+ Upload] │ Type ▾ │ Data views │ Date │ Keyword │ Entity │ Sort ▾ │   │
│            │ Export ▾                                                     │
└──────────────────────────────────────────────────────────────────────────┘
┌─KPI Line─────────────────────────────────────────────────────────────────┐
│ 3,421 files · 2.4 GB · 847 images · 2,104 documents · 1,203 linked       │
│                                                       [Show breakdown ▾] │
└──────────────────────────────────────────────────────────────────────────┘
┌─AG Grid (32px rows, checkboxes, sortable headers)────────────────────────┐
│ ☐ │ ID        │ Thumb │ Name               │ Type      │ Linked To       │ Upload    │ Size  │
├───┼───────────┼───────┼────────────────────┼───────────┼─────────────────┼───────────┼───────┤
│ ☐ │ MED-5214  │ [🏞]  │ PO-8841_pallet.jpg │ Image     │ PO-8841         │ 2026-06-14│ 2.4MB │
│ ☐ │ MED-5213  │ [📄]  │ SO-7732_invoice.pdf│ Document  │ SO-7732         │ 2026-06-14│ 156KB │
│ ☑ │ MED-5212  │ [📊]  │ Q2_inventory.xlsx  │ Spreadsht │ —               │ 2026-06-13│ 1.8MB │
│ ☐ │ MED-5211  │ [🏞]  │ LOT-4412_batch.jpg │ Image     │ LOT-4412        │ 2026-06-13│ 3.1MB │
│ ☐ │ MED-5210  │ [📄]  │ V-992_cert.pdf     │ Document  │ V-992           │ 2026-06-13│ 89KB  │
│ ☐ │ MED-5209  │ [📄]  │ contract_2026.docx │ Document  │ CUST-441        │ 2026-06-12│ 412KB │
│ ☐ │ MED-5208  │ [🏞]  │ damage_report.png  │ Image     │ DISP-118        │ 2026-06-12│ 5.8MB │
└───┴───────────┴───────┴────────────────────┴───────────┴─────────────────┴───────────┴───────┘
┌─BulkActionBar (appears only when rows selected)──────────────────────────┐
│ 1 file selected                                                           │
│ [Download] [Link to Entity] [More ▾: Share | Delete]                     │
└──────────────────────────────────────────────────────────────────────────┘
```

---

### State-Gated Action Surface

| File State    | Visible Actions                              |
|---------------|----------------------------------------------|
| Linked        | `Download`, `Share`, `Re-link`, `Delete`     |
| Unlinked      | `Download`, `Link to Entity`, `Delete`       |
| Processing    | `Cancel Upload`                              |

---

## DetailSlideover — Tabs: Preview | Metadata | Linked Records | History

Footer actions follow state-gating.

---

## Image Thumbnail Column — Inline Preview

- Thumb column: 48px wide. Centered icon/thumbnail.
- Icons by type: image (🏞), document (📄), spreadsheet (📊), video (🎥), other (📦).
- When actual thumbnail available: 28×28 rounded.
- Hover: 120×120 preview tooltip (300ms delay).

---

## Dimensions

- View container: 100vw × 100vh
- FilterToolbar: 44px tall (plus 32px chip row)
- KPI line: 32px / ~96px expanded
- AG Grid: 32px row height; Thumb 48px; ID 110px; Name 240px (two-line); Type 100px; Linked To 180px; Upload 130px; Size 90px
- Thumbnail preview (detail): 240×240 standard; scales to fit slide-over width in wide view
- BulkActionBar: 52px
- Slide-over: Peek 280px → Standard 420px → Wide 60vw
- Font: Inter 13px body, 11px secondary, 14px header

---

## Interactive Elements

- **[+ Upload]**: Opens upload zone overlay (slide-over) above grid. Accepts any file type.
- **Drag-and-drop zone**: Appears in upload slide-over (not pre-staged on grid).
- **Type ▾ pill**: Multi-select with `Images (847)`, `Documents (2,104)`, `Spreadsheets (470)`. Replaces prior ViewTabBar.
- **Upload progress**: Per-file progress bars; cancel per file.
- **Inline thumbnail**: Click → opens slide-over Preview tab. Hover → 120×120 tooltip.
- **Name cell**: Double-click → inline rename.
- **Type cell**: Display-only.
- **Linked To cell**: Click → navigates to linked entity. "Unlinked" in muted text. ComboboxCellEditor to link.
- **Row click**: Single → slide-over peek. Double → standard.
- **BulkActionBar Download**: Individual or ZIP if multiple.
- **BulkActionBar Link to Entity**: Opens entity lookup.
- **BulkActionBar Delete**: Modal confirmation.
- **Preview tab — Image**: Zoomable; rotatable.
- **Preview tab — Document/Spreadsheet**: Embedded viewer (PDF.js / iframe).
- **Metadata tab — Edit Tags**: Inline tag editor.
- **Metadata tab — Replace File**: File picker; version history preserved.

---

## States Shown

- **Default (no filter)**: All files visible.
- **Upload in progress**: Progress overlay; files appear in grid as they complete.
- **Upload complete**: Success state flash; toast.
- **Empty state (no files)**: "No files yet" + Upload CTA.
- **Empty filtered**: "No files match" + Clear filters.
- **Image preview loading**: Skeleton with spinner.
- **Image preview error**: Broken image icon; "Preview could not be loaded."
- **Delete confirm**: Modal listing files.
- **File linked/unlinked**: Toast.

---

## ARIA Annotations

- FilterToolbar: `role="menubar"`, `aria-label="Media filter toolbar"`
- Type ▾ pill: `role="combobox"`, `aria-haspopup="listbox"`, `aria-label="Filter by file type"`, `aria-multiselectable="true"`
- KPI line: `role="status"`, `aria-live="polite"`, `aria-label="3,421 files, 2.4 GB, 847 images, 2,104 documents, 1,203 linked"`
- Upload zone: `role="region"`, `aria-label="File upload area"`. Live region: `aria-live="polite"`.
- Upload progress: `role="progressbar"`, `aria-valuenow`, `aria-valuemax="100"`
- Thumbnail cell: `role="gridcell"`. Thumbnail: `role="img"`, `aria-label="Thumbnail of [filename]"`.
- Inline thumbnail hover preview: `role="tooltip"`, `aria-label="Preview of [filename]"`
- Name cell editing: `role="textbox"`, `aria-label="Rename file"`
- Type cell: `aria-label="File type: [MIME]"`
- Linked To cell: `role="link"`, `aria-label="Linked to [entity type] [entity ID]"`
- AG Grid: `role="grid"`, `aria-label="Media files"`
- BulkActionBar: `role="toolbar"`, `aria-label="File actions"`
- Delete button: `aria-label="Delete [count] files"`
- Slide-over: `role="dialog"`, `aria-label="File details"`
- Preview tab — image: `role="img"`, `aria-label="[filename] preview"`. Zoom controls: `role="button"`.
- Metadata tab: `role="tabpanel"`, `aria-label="File metadata"`
- Tags: `role="list"`, `aria-label="File tags"`. Items: `role="listitem"`.

---

## Edge Cases Handled

- **Large file upload (>100MB)**: Chunked with progress; pause/resume.
- **Duplicate filename in same linked entity**: Auto-rename "filename (2).jpg".
- **Unsupported file type**: Accepted; preview shows generic icon.
- **Unlinked file**: "Unlinked" badge; can be linked later.
- **Corrupted image file**: Broken image icon.
- **Concurrent delete+view**: If file deleted while another user has preview open, toast; preview closes.
- **Many linked records**: Detail Linked tab scrollable.
- **Very long filename**: Truncated with tooltip.
- **Spreadsheet preview**: First sheet only; "Sheet 1 of 4" selector.
- **Video files**: Thumbnail with ▶ overlay; embedded player.
- **Batch upload with mixed types**: Auto-categorized.

---

### UX Compliance

| UX Rule | Status | Note |
|---------|--------|------|
| UX-1: Action visibility follows entity state | ✓ | Re-link only on Linked; Link to Entity only on Unlinked. |
| UX-2: Supporting info one click away, never zero | ✓ | Preview, Metadata, Linked Records, History as slide-over tabs. |
| UX-3: One primary surface per view | ✓ | Files table is the only primary surface. Upload zone in slide-over. |
| UX-4: Bulk actions appear only on selection | ✓ | BulkActionBar slides up only on selection. |
| UX-5: Validation errors at point of impact | ✓ | Upload errors at the file. No permanent panel. |
| UX-6: Tools and forms in slide-overs; modals for confirmations | ✓ | Upload in slide-over. Delete modal. |
| UX-7: System never hides what mode the operator is in | ✓ | Filter pills, slide-over header. |
| UX-8: State changes resolve in place | ✓ | Link/unlink updates row inline. |
| UX-9: Filtering is fluid; navigation is durable | ✓ | Type ▾ pill replaces tab bar. |
| UX-10: Cell-level interactions save immediately; forms have explicit save | ✓ | Rename saves on commit. Upload explicit. |
| UX-11: URL is the session memory | ✓ | Filters, slide-over file ID encode into URL. |
| UX-12: Empty states give the operator a next step | ✓ | Empty → Upload CTA. Empty filtered → Clear filters. |
