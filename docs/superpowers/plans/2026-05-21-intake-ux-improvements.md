# /intake UX Improvements Implementation Plan — TER-1529

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix six operator feedback items on the /intake page: per-batch verify actions, receipt preview as a side drawer, market name label standardization, table density, and PO-level action cleanup.

**Architecture:** Targeted frontend-only changes across IntakeView.tsx (bulk of the work), a new ReceiptPreviewDrawer component, OperatorGrid defaultColDef, styles.css, and label updates in SalesView/CustomerPurchaseHistoryPanel. No new backend commands — setItemAlias, flagBatch, postPurchaseReceipt, updateBatch all already exist.

**Tech Stack:** React, TypeScript, AG Grid (agGroupCellRenderer, master-detail), tRPC, useCommandRunner, Tailwind + semantic CSS classes (see design system INDEX.md)

**Branch:** `feat/ter-1529-intake-ux-improvements`
**Linear:** https://linear.app/terpcorp/issue/TER-1529
**Spec:** `docs/superpowers/specs/2026-05-21-intake-ux-improvements-design.md`

---

## Task 1: AG Grid density — detail grid row height + header text wrap

**Files:**
- Modify: `src/client/styles.css` (around line 853, `.ag-theme-quartz .ag-header-cell-label` block)
- Modify: `src/client/components/OperatorGrid.tsx` (defaultColDef)
- Modify: `src/client/views/IntakeView.tsx` (detailGridOptions, around line 121)

- [ ] **Step 1: Add header text-wrap CSS**

In `src/client/styles.css`, find the existing `.ag-theme-quartz .ag-header-cell-label` rule (around line 853) and update it to:

```css
.ag-theme-quartz .ag-header-cell-label {
  font-size: 10.5px;
  line-height: 1.1;
  white-space: normal;
  word-break: break-word;
  align-items: flex-start;
  padding-top: 3px;
}
```

- [ ] **Step 2: Add wrapHeaderText to OperatorGrid defaultColDef**

In `src/client/components/OperatorGrid.tsx`, find the `defaultColDef` object passed to `AgGridReact`. Add the two wrap properties:

```ts
const defaultColDef = useMemo<ColDef<GridRow>>(
  () => ({
    // ... existing properties ...
    wrapHeaderText: true,
    autoHeaderHeight: true,
  }),
  []
);
```

(The exact location: search for `defaultColDef` inside `OperatorGrid`. If it's defined as a constant outside the component, add the two properties there instead.)

- [ ] **Step 3: Add rowHeight and headerHeight to IntakeView detailGridOptions**

In `src/client/views/IntakeView.tsx`, inside `detailCellRendererParams.detailGridOptions`, add:

```ts
detailGridOptions: {
  columnDefs: buildBatchColumns(...),
  defaultColDef: { resizable: true, sortable: true } as ColDef<IntakeBatchRow>,
  domLayout: 'autoHeight' as const,
  rowHeight: 28,        // ADD THIS
  headerHeight: 30,     // ADD THIS
  onCellValueChanged: ...
},
```

- [ ] **Step 4: Run typecheck**

```bash
pnpm typecheck
```

Expected: no new errors. Fix any that appear.

- [ ] **Step 5: Commit**

```bash
git add src/client/styles.css src/client/components/OperatorGrid.tsx src/client/views/IntakeView.tsx
git commit -m "feat(intake): compact detail grid rows and wrap multi-word column headers (TER-1529)"
```

---

## Task 2: Rename "Customer alias" → "Market name" / "Product name"

**Files:**
- Modify: `src/client/views/IntakeView.tsx` (line ~478, batch detail column)
- Modify: `src/client/views/SalesView.tsx` (line ~70, itemAlias column)
- Modify: `src/client/components/CustomerPurchaseHistoryPanel.tsx` (line ~130, table header)

- [ ] **Step 1: Fix IntakeView.tsx batch column header**

In `src/client/views/IntakeView.tsx` inside `buildBatchColumns`, find:

```ts
{
  field: 'itemAlias',
  headerName: 'Customer alias',
  editable: false,
  minWidth: 160,
  tooltipValueGetter: (params) =>
    params.value ? `Customer-facing name: ${params.value}. Vendor/audit surfaces keep ${params.data?.name ?? 'canonical'}.` : 'No alias set; canonical name shown to customers.'
},
```

Replace with:

```ts
{
  field: 'itemAlias',
  headerName: 'Market name',
  editable: false,
  minWidth: 160,
  tooltipValueGetter: (params) =>
    params.value ? `Market name: ${params.value}. Set via "Add market name" on this row.` : 'No market name set. Use "Add market name" to assign one.'
},
```

- [ ] **Step 2: Fix SalesView.tsx itemAlias column**

In `src/client/views/SalesView.tsx`, find the column definition for `itemAlias` (search for `Customer label` or `itemAlias` around line 67–90). It currently renders a yellow dot for aliased items with header "Customer label". Update the `headerName` to `'Product name'` and update the tooltip title attribute from `"Customer-facing alias"` to `"Product name (market alias)"`:

```ts
{
  // ... existing renderer with yellow dot ...
  headerName: 'Product name',
  // title attribute inside the span: change "Customer-facing alias" → "Product name (market alias)"
}
```

- [ ] **Step 3: Fix CustomerPurchaseHistoryPanel.tsx table header**

In `src/client/components/CustomerPurchaseHistoryPanel.tsx`, find the `<th>` cell that corresponds to the `itemAlias` column (around line 130, search for the `<th>` preceding `{row.itemAlias ?? '-'}`). Change its text to `Product name`:

```tsx
<th>Product name</th>
```

- [ ] **Step 4: Verify no remaining "Customer alias" occurrences in UI labels**

```bash
grep -rn "Customer alias\|customer alias\|Customer-facing alias" src/client/ --include="*.tsx" --include="*.ts"
```

Expected: zero results. Fix any remaining occurrences.

- [ ] **Step 5: Run typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 6: Commit**

```bash
git add src/client/views/IntakeView.tsx src/client/views/SalesView.tsx src/client/components/CustomerPurchaseHistoryPanel.tsx
git commit -m "feat(intake): rename 'Customer alias' to 'Market name' / 'Product name' (TER-1529)"
```

---

## Task 3: New ReceiptPreviewDrawer component

**Files:**
- Create: `src/client/components/ReceiptPreviewDrawer.tsx`

- [ ] **Step 1: Create the drawer component**

Create `src/client/components/ReceiptPreviewDrawer.tsx` with the full content:

```tsx
import { X } from 'lucide-react';
import { trpc } from '../api/trpc';
import type { IntakeOrderRow } from '../views/IntakeView.types';

interface ReceiptPreviewDrawerProps {
  order: IntakeOrderRow | null;
  onClose: () => void;
}

export function ReceiptPreviewDrawer({ order, onClose }: ReceiptPreviewDrawerProps) {
  const previewBatchIds = order
    ? order.batches
        .filter((batch) => ['draft', 'ready', 'needs_fix'].includes(batch.status))
        .map((batch) => batch.id)
    : [];

  const receiptPreview = trpc.queries.receiptPreview.useQuery(
    { batchIds: previewBatchIds },
    { enabled: previewBatchIds.length > 0 }
  );

  if (!order) return null;

  return (
    <aside className="context-drawer context-drawer-standard" aria-label="Receipt preview">
      <div className="context-drawer-header">
        <button
          type="button"
          className="icon-button"
          onClick={onClose}
          aria-label="Close receipt preview"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-ink">Receipt preview</div>
          <div className="truncate text-[11px] uppercase text-zinc-500">{order.poNo}</div>
        </div>
      </div>
      <div className="context-drawer-body">
        <div className="context-drawer-card">
          {receiptPreview.data ? (
            <div className="grid gap-3">
              <div className="grid gap-2 text-sm md:grid-cols-2">
                <span className="selection-pill">Vendor {receiptPreview.data.vendor || 'Mixed / missing'}</span>
                <span className="selection-pill">{receiptPreview.data.rows.length} row(s)</span>
                <span className="selection-pill">Total ${receiptPreview.data.total}</span>
                <span className={receiptPreview.data.ok ? 'selection-pill success' : 'selection-pill warning'}>
                  {receiptPreview.data.ok ? 'Ready to post' : `${receiptPreview.data.conflicts.length} conflict(s)`}
                </span>
              </div>
              {receiptPreview.data.conflicts.length ? (
                <div className="grid gap-1 text-sm text-red-700">
                  {receiptPreview.data.conflicts.map((conflict) => (
                    <div key={conflict}>{conflict}</div>
                  ))}
                </div>
              ) : null}
              <div className="finder-table-wrap max-h-96">
                <table className="finder-table">
                  <thead>
                    <tr>
                      <th>Batch</th>
                      <th>Name</th>
                      <th>Qty</th>
                      <th>Cost</th>
                      <th>Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {receiptPreview.data.rows.map((row) => (
                      <tr key={String(row.id)}>
                        <td>{String(row.batchCode)}</td>
                        <td>{String(row.name)}</td>
                        <td>{String(row.intakeQty)}</td>
                        <td>${String(row.unitCost)}</td>
                        <td>${Number(row.subtotal ?? 0).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : previewBatchIds.length === 0 ? (
            <div className="drawer-empty">No pending batches to preview.</div>
          ) : (
            <div className="drawer-empty">Loading preview…</div>
          )}
        </div>
      </div>
    </aside>
  );
}
```

> **Note:** Step 2 below extracts the `IntakeOrderRow` and `IntakeBatchRow` types into a shared file so both `IntakeView.tsx` and `ReceiptPreviewDrawer.tsx` can import them. Do that before this step if the types are not yet extracted.

- [ ] **Step 2: Extract IntakeOrderRow / IntakeBatchRow to a types file**

Create `src/client/views/IntakeView.types.ts`:

```ts
export interface IntakeBatchRow {
  id: string;
  purchaseOrderId: string;
  purchaseOrderLineId: string | null;
  batchCode: string;
  name: string;
  itemId?: string | null;
  itemAlias?: string | null;
  category: string;
  intakeQty: string;
  availableQty: string;
  unitCost: string;
  unitPrice: string;
  uom: string;
  status: string;
  notes: string | null;
  validationIssues: string[];
  mediaStatus: string;
  arrivalStatus: string;
  vendorId: string | null;
  tags: string[];
  location: string;
  lotCode: string | null;
  expectedQty: string | null;
  expectedUnitCost: string | null;
  discrepancyReason?: string;
  createdAt: string;
}

export interface IntakeOrderRow {
  id: string;
  poNo: string;
  vendor: string | null;
  vendorId: string | null;
  status: string;
  expectedDate: string | null;
  orderedAt: string | null;
  receivedAt: string | null;
  total: string;
  expectedTotal: string;
  expectedTotalQty: string;
  receivedTotalQty: string;
  internalNotes: string | null;
  buyerNotes: string | null;
  createdAt: string;
  batches: IntakeBatchRow[];
}
```

In `src/client/views/IntakeView.tsx`, replace the two inline interface declarations with:

```ts
import type { IntakeBatchRow, IntakeOrderRow } from './IntakeView.types';
```

- [ ] **Step 3: Run typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 4: Commit**

```bash
git add src/client/components/ReceiptPreviewDrawer.tsx src/client/views/IntakeView.types.ts src/client/views/IntakeView.tsx
git commit -m "feat(intake): extract IntakeView types; add ReceiptPreviewDrawer component (TER-1529)"
```

---

## Task 4: Wire ReceiptPreviewDrawer into IntakeView + PO actions column

**Files:**
- Modify: `src/client/views/IntakeView.tsx`

- [ ] **Step 1: Import ReceiptPreviewDrawer**

At the top of `src/client/views/IntakeView.tsx`, add:

```ts
import { ReceiptPreviewDrawer } from '../components/ReceiptPreviewDrawer';
```

- [ ] **Step 2: Remove old receiptPreview tRPC query and previewBatchIds from IntakeView**

Delete these lines from `IntakeView` (they move into `ReceiptPreviewDrawer`):

```ts
const previewBatchIds = previewOrder
  ? previewOrder.batches
      .filter((batch) => ['draft', 'ready', 'needs_fix'].includes(batch.status))
      .map((batch) => batch.id)
  : [];
const receiptPreview = trpc.queries.receiptPreview.useQuery(
  { batchIds: previewBatchIds },
  { enabled: previewBatchIds.length > 0 }
);
```

- [ ] **Step 3: Update PO-level Actions column**

In `IntakeView`, replace the `Actions` column `cellRenderer` (the one with "Verify intake", "Verify all", "Preview receipt") with:

```tsx
{
  headerName: 'Actions',
  pinned: 'right',
  minWidth: 280,
  cellRenderer: (params: ICellRendererParams<IntakeOrderRow>) => {
    const order = params.data;
    if (!order) return null;

    const postedCount = order.batches.filter((b) => b.status === 'posted').length;
    const totalCount = order.batches.length;
    const allVerified = totalCount > 0 && postedCount === totalCount;

    return (
      <div className="flex h-full items-center gap-2">
        <span className={allVerified ? 'selection-pill success' : 'selection-pill'}>
          {postedCount}/{totalCount} verified
        </span>
        <button
          type="button"
          className="secondary-button compact-action"
          disabled={!canWrite || busy || isRunning || !hasPendingBatches(order)}
          onClick={() => setConfirmVerifyAllFor(order)}
        >
          Verify all
        </button>
        <button
          type="button"
          className="secondary-button compact-action"
          disabled={!hasPendingBatches(order)}
          onClick={() => setPreviewOrder(order)}
        >
          Preview receipt
        </button>
      </div>
    );
  }
}
```

- [ ] **Step 4: Replace old receipt preview WorkspacePanel with ReceiptPreviewDrawer**

In the `IntakeView` return JSX, find and remove:

```tsx
{previewOrder ? (
  <WorkspacePanel
    panelId="intake:receipt-preview"
    title={`Receipt preview — ${previewOrder.poNo}`}
    contentClassName="p-3"
  >
    ...full receipt preview content...
  </WorkspacePanel>
) : null}
```

Replace with the drawer + side-by-side layout. Wrap the entire `view-stack` + drawer in a flex row:

```tsx
return (
  <div className="flex flex-row min-h-0 flex-1">
    <div className="view-stack flex-1 min-w-0">
      <div className="control-band">
        ...csv import button...
      </div>
      {csvOpen ? ( ...csv panel... ) : null}
      <WorkspacePanel panelId="intake:queue" ...>
        ...grid...
      </WorkspacePanel>
      {confirmVerifyAllFor ? ( ...confirm panel... ) : null}
    </div>
    <ReceiptPreviewDrawer
      order={previewOrder}
      onClose={() => setPreviewOrder(null)}
    />
  </div>
);
```

- [ ] **Step 5: Remove the old `canVerifyIntake` function** (it was only used by the now-deleted "Verify intake" button):

Delete the entire `canVerifyIntake` function from `IntakeView.tsx`.

- [ ] **Step 6: Run typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 7: Commit**

```bash
git add src/client/views/IntakeView.tsx src/client/components/ReceiptPreviewDrawer.tsx
git commit -m "feat(intake): receipt preview as side drawer; remove Verify intake button; add X/Y verified count (TER-1529)"
```

---

## Task 5: New BatchRowActions — Verify / Reject / Add note / Add market name

**Files:**
- Modify: `src/client/views/IntakeView.tsx` (the `BatchRowActions` component and `buildBatchColumns` function, starting at line 466)

- [ ] **Step 1: Update buildBatchColumns signature**

Replace the current `buildBatchColumns` function signature. The new one passes fewer callbacks — verify, reject, appendNote, setMarketName, each typed:

```ts
function buildBatchColumns(
  canWrite: boolean,
  onVerify: (batchId: string, intakeQty: string, expectedQty: string | null) => Promise<void>,
  onReject: (batchId: string, reason: string) => Promise<void>,
  onAppendNote: (batchId: string, currentNotes: string | null, addition: string) => Promise<void>,
  onSetMarketName: (itemId: string, alias: string) => Promise<void>
): ColDef<IntakeBatchRow>[]
```

Remove the `onFlag` and `onDeleteDraft` parameters.

- [ ] **Step 2: Add the onVerify handler in IntakeView**

In `IntakeView`, add a `verifyBatch` handler to pass to `buildBatchColumns`:

```ts
async function verifyBatch(batchId: string, intakeQty: string, expectedQty: string | null) {
  setBusy(true);
  try {
    // Auto-flag if discrepancy
    const actual = Number(intakeQty);
    const expected = Number(expectedQty ?? 0);
    if (expected > 0 && actual > 0 && actual !== expected) {
      await runCommand(
        'flagBatch',
        { batchId, reason: `Quantity discrepancy: expected ${expected}, received ${actual}` },
        'Auto-flag quantity discrepancy'
      );
    }
    await runCommand(
      'postPurchaseReceipt',
      { batchIds: [batchId] },
      'Verify single batch intake'
    );
  } finally {
    setBusy(false);
  }
}
```

- [ ] **Step 3: Add the onSetMarketName handler in IntakeView**

```ts
async function setMarketName(itemId: string, alias: string) {
  setBusy(true);
  try {
    await runCommand(
      'setItemAlias',
      { itemId, alias },
      alias ? `Set market name to "${alias}"` : 'Clear market name'
    );
  } finally {
    setBusy(false);
  }
}
```

- [ ] **Step 4: Update detailCellRendererParams to pass new handlers**

In the `detailCellRendererParams` useMemo, update the `buildBatchColumns` call:

```ts
columnDefs: buildBatchColumns(
  canWrite,
  async (batchId, intakeQty, expectedQty) => {
    await verifyBatch(batchId, intakeQty, expectedQty);
  },
  async (batchId, reason) => {
    setBusy(true);
    try {
      await runCommand('rejectBatch', { batchId, reason }, 'Reject intake lot from grid');
    } finally {
      setBusy(false);
    }
  },
  async (batchId, currentNotes, addition) => {
    setBusy(true);
    try {
      const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
      const actor = me.data?.name || 'operator';
      const merged = [currentNotes, `[${stamp} ${actor}] ${addition}`].filter(Boolean).join('\n');
      await runCommand('updateBatch', { id: batchId, notes: merged }, 'Update intake notes');
    } finally {
      setBusy(false);
    }
  },
  async (itemId, alias) => {
    await setMarketName(itemId, alias);
  }
),
```

Also update the `useMemo` dependency array to remove `me.data?.name` reference if needed, and remove old handlers that no longer exist.

- [ ] **Step 5: Replace BatchRowActions component**

Replace the entire `BatchRowActions` component (lines ~566–639) with this new version:

```tsx
function BatchRowActions({
  row,
  onVerify,
  onReject,
  onAppendNote,
  onSetMarketName,
}: {
  row: IntakeBatchRow;
  onVerify: (batchId: string, intakeQty: string, expectedQty: string | null) => Promise<void>;
  onReject: (batchId: string, reason: string) => Promise<void>;
  onAppendNote: (batchId: string, currentNotes: string | null, addition: string) => Promise<void>;
  onSetMarketName: (itemId: string, alias: string) => Promise<void>;
}) {
  const [mode, setMode] = useState<'idle' | 'reject' | 'note' | 'marketName'>('idle');
  const [inputValue, setInputValue] = useState('');

  const canVerify = row.status === 'draft' || row.status === 'ready';
  const canAct = row.status !== 'returned' && row.status !== 'posted';

  function openMode(next: 'reject' | 'note' | 'marketName', prefill = '') {
    setMode(next);
    setInputValue(prefill);
  }

  function cancel() {
    setMode('idle');
    setInputValue('');
  }

  if (mode === 'idle') {
    return (
      <div className="flex h-full items-center gap-1">
        <button
          type="button"
          className="primary-button compact-action"
          disabled={!canVerify}
          title={!canVerify ? `Cannot verify: batch is ${row.status}` : 'Verify this batch'}
          onClick={() => void onVerify(row.id, row.intakeQty, row.expectedQty)}
        >
          Verify
        </button>
        <button
          type="button"
          className="secondary-button compact-action"
          disabled={!canAct}
          onClick={() => openMode('reject')}
        >
          Reject
        </button>
        <button
          type="button"
          className="secondary-button compact-action"
          onClick={() => openMode('note')}
        >
          Add note
        </button>
        <button
          type="button"
          className="secondary-button compact-action"
          disabled={!row.itemId}
          title={!row.itemId ? 'Batch not linked to a catalog item' : 'Set market name for this item'}
          onClick={() => openMode('marketName', row.itemAlias ?? '')}
        >
          Market name
        </button>
      </div>
    );
  }

  const placeholder =
    mode === 'reject' ? 'Reject reason' :
    mode === 'note' ? 'Add a note…' :
    'Market name';

  const label =
    mode === 'reject' ? 'Reject' :
    mode === 'note' ? 'Save note' :
    'Set name';

  return (
    <div className="flex h-full items-center gap-1">
      <input
        className="input compact"
        autoFocus
        placeholder={placeholder}
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Escape') cancel(); }}
      />
      <button
        type="button"
        className="primary-button compact-action"
        disabled={mode !== 'note' && !inputValue.trim()}
        onClick={async () => {
          const value = inputValue.trim();
          if (mode === 'reject') {
            if (!value) return;
            await onReject(row.id, value);
          } else if (mode === 'note') {
            if (!value) { cancel(); return; }
            await onAppendNote(row.id, row.notes ?? null, value);
          } else if (mode === 'marketName') {
            if (!row.itemId) return;
            await onSetMarketName(row.itemId, value);
          }
          cancel();
        }}
      >
        {label}
      </button>
      <button type="button" className="secondary-button compact-action" onClick={cancel}>
        Cancel
      </button>
    </div>
  );
}
```

- [ ] **Step 6: Update buildBatchColumns actions column to use new BatchRowActions props**

In `buildBatchColumns`, update the Actions column `cellRenderer`:

```ts
{
  headerName: 'Actions',
  pinned: 'right',
  minWidth: 300,
  cellRenderer: (params: ICellRendererParams<IntakeBatchRow>) => {
    const row = params.data;
    if (!row || !canWrite) return null;
    return (
      <BatchRowActions
        row={row}
        onVerify={onVerify}
        onReject={onReject}
        onAppendNote={onAppendNote}
        onSetMarketName={onSetMarketName}
      />
    );
  }
}
```

- [ ] **Step 7: Remove the old inline Notes editable column**

The Notes column was previously editable inline (lines ~538–550) with `onCellValueChanged`. Remove that column from `buildBatchColumns` — note-appending is now done via the "Add note" button action. The notes field is still displayed in a read-only column if desired, but the inline edit handler is removed. To keep notes visible (read-only), simplify:

```ts
{ field: 'notes', headerName: 'Notes', editable: false, minWidth: 220 },
```

- [ ] **Step 8: Run typecheck**

```bash
pnpm typecheck
```

Expected: no errors. The most likely issues are: unused imports (`useFocusTrap` if it was only used for verify-all confirm — keep it, that confirm panel stays), missing prop types, or `me.data?.name` dependency in useMemo.

- [ ] **Step 9: Commit**

```bash
git add src/client/views/IntakeView.tsx
git commit -m "feat(intake): batch actions — Verify, Reject, Add note, Market name; auto-flag discrepancy (TER-1529)"
```

---

## Task 6: Clean up removals and run full typecheck

**Files:**
- Modify: `src/client/views/IntakeView.tsx` (remove dead code)

- [ ] **Step 1: Remove deleteDraftBatch function and related state**

In `IntakeView.tsx`, remove:

```ts
async function deleteDraftBatch(batchId: string) {
  setBusy(true);
  try {
    await runCommand('deleteBatch', { batchId }, 'Delete draft intake row from queue');
  } finally {
    setBusy(false);
  }
}
```

Also remove the `onFlag` handler lambda inside `detailCellRendererParams`.

- [ ] **Step 2: Remove verifyIntakeForOrder function**

Remove the entire `verifyIntakeForOrder` function (lines ~268–296) — no longer used.

- [ ] **Step 3: Run typecheck clean**

```bash
pnpm typecheck
```

Expected: zero type errors. If there are errors about missing imports, fix them. If there are unused variable warnings treated as errors, clean up those variables.

- [ ] **Step 4: Run Playwright smoke test**

```bash
PLAYWRIGHT_SKIP_WEB_SERVER=1 pnpm exec playwright test tests/e2e/operator-console.spec.ts --project=chromium --workers=1 2>&1 | tail -20
```

Note any failures. If the e2e test covers intake, verify it still passes. If it doesn't cover intake specifically, note that as a gap for the QA reviewer.

- [ ] **Step 5: Commit**

```bash
git add src/client/views/IntakeView.tsx
git commit -m "chore(intake): remove dead verifyIntakeForOrder, deleteDraftBatch, flag handler (TER-1529)"
```

---

## Task 7: Update decisions-log.md per AGENTS.md requirement

**Files:**
- Modify: `docs/design-system/decisions-log.md`

Per `AGENTS.md`: "Created a new component, semantic CSS class, or pattern? → Append a rationale entry to docs/design-system/decisions-log.md."

- [ ] **Step 1: Append entry to decisions-log.md**

Append to `docs/design-system/decisions-log.md`:

```markdown
## 2026-05-21 — ReceiptPreviewDrawer + intake UX improvements (TER-1529)

### ReceiptPreviewDrawer component
New component in `src/client/components/ReceiptPreviewDrawer.tsx`. Uses existing `.context-drawer context-drawer-standard` CSS classes (already defined in `styles.css`) for consistent 420px width and 180ms slide transition. Does NOT use the full `ContextDrawer` entity/tab system — the receipt preview is a single-purpose, no-tab panel that should stay open while the operator works batch rows. A full ContextDrawer integration would add unnecessary entity routing and tab management overhead.

### Batch line-item action set change
BatchRowActions now offers: Verify / Reject / Add note / Market name. Removed Flag (was rarely used) and Delete draft (too destructive next to Verify). Deletion remains accessible via the command palette.

### AG Grid header text wrap
Added `wrapHeaderText: true` + `autoHeaderHeight: true` to OperatorGrid defaultColDef and CSS `white-space: normal` to `.ag-theme-quartz .ag-header-cell-label`. Reduces horizontal column width for multi-word headers across all operator grids.

### "Market name" label standard
`itemAlias` field displays as "Market name" in all operator-facing surfaces (intake, inventory, operations). In customer-facing surfaces (SalesView, CustomerPurchaseHistoryPanel) it displays as "Product name". Field name `itemAlias` is unchanged in code.
```

- [ ] **Step 2: Commit**

```bash
git add docs/design-system/decisions-log.md docs/superpowers/specs/2026-05-21-intake-ux-improvements-design.md docs/superpowers/plans/2026-05-21-intake-ux-improvements.md
git commit -m "docs: intake UX improvements spec, plan, and design-system decisions-log (TER-1529)"
```

---

## Routing Plan

| Phase | Owner | Model | Actions | Proof gate | Handoff |
|---|---|---|---|---|---|
| Plan ✓ | pm | claude-sonnet-4-6 high | Design spec, issue, branch, plan | Spec approved by Evan | Implementation brief |
| Implementation | build | claude-sonnet-4-6 high | Tasks 1–7 in order | `pnpm typecheck` clean; Playwright passes | QA packet |
| QA | qa-reviewer | claude-sonnet-4-6 high | First-pass logic + UI review | Findings documented | AQA decision |
| AQA | aqa-reviewer | claude-opus-4-7 xhigh | Adversarial review ≥90/100 | Score ≥90 or repair loop | Closeout packet |
| PR + merge | terminal | gpt-5.5 high | `git push`, `gh pr create`, checks | PR open, checks green | Evan reviews |

---

## QA Checklist (for qa-reviewer)

- [ ] Batch Verify button disabled when status is `posted`, `returned`, `needs_fix`
- [ ] Batch Verify triggers auto-flag for discrepancies before posting receipt
- [ ] `setItemAlias` called with correct `itemId` (not `batchId`) when market name is set
- [ ] Market name input disabled when `row.itemId` is null
- [ ] PO actions shows `X/Y verified` count; no "Verify intake" button
- [ ] ReceiptPreviewDrawer opens/closes/updates correctly; stays open across row interactions
- [ ] Notes column now read-only (no inline edit); Add note action works
- [ ] `pnpm typecheck` passes with zero errors
- [ ] No "Only Draft or Ready" toast for normal per-batch verify flow
- [ ] Column headers with 2 words wrap to 2 lines
