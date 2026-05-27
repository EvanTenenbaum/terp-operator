# Real-Time Sales Order ↔ Pick/Pack Coordination — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire real-time coordination between the sales desktop grid and the mobile pick/pack screens — status badges on sales lines, inline Release/Recall buttons, picker alerts on recall, and bi-directional socket events.

**Architecture:** Extend the existing Socket.IO `emitPickEvent` pattern with a new `emitSalesLineEvent` helper. Add `fulfillmentActionsColumn` inside `SalesView` (useMemo, needs component state) for badges and buttons. Extend `PickView`'s useEffect to detect recalled lines. All real-time invalidation follows the existing `socket.onAny` wildcard pattern in `App.tsx`.

**Tech Stack:** tRPC, React Query, Socket.IO, AG Grid (ColDef cellRenderer), TypeScript, Zod

**Spec:** `docs/superpowers/specs/2026-05-27-realtime-sales-pick-coordination-design.md`

---

## File Map

| File | Change |
|------|--------|
| `src/server/sockets.ts` | Add `emitSalesLineEvent` helper |
| `src/server/services/commandBus.ts` | Emit `sales:order:*` after `releaseLineForPicking`, `recallLineFromPicking`, line removal; add warehouse alert to recall |
| `src/client/App.tsx` | Extend `pick:order:*` handler; add `sales:order:*:line:changed` wildcard handler |
| `src/client/views/SalesView.tsx` | Add `RELEASED_PICK_STATUSES`, `fulfillmentActionsColumn`, make editable columns status-aware, add `refetchInterval`, fix bulk-release toast |
| `src/client/views/PickView.tsx` | Add `recalledLine` state; detect when active line disappears from pick list |
| `src/client/components/pick/PickListScreen.tsx` | Add amber banner when any line has active alerts |
| `src/client/components/pick/PickLineScreen.tsx` | Add `recalled` prop + recall overlay; pin alert card above pack controls |
| `src/client/components/pick/pickTypes.ts` | Add `recalled` boolean to `PickLine` (optional) |

---

## Task 1: Add `emitSalesLineEvent` to `sockets.ts`

**Files:**
- Modify: `src/server/sockets.ts`

- [ ] **Step 1: Add the export after `emitPickOrderAndQueue`**

Open `src/server/sockets.ts`. After line 68 (end of `emitPickOrderAndQueue`), add:

```ts
/**
 * Real-time sales ↔ pick coordination — emit a sales:order:*:line:changed event.
 * Called from commandBus after mutations that affect a released/picked line.
 * Gracefully no-ops if socket server is not initialized.
 */
export function emitSalesLineEvent(
  orderId: string,
  payload: { kind: string; lineId?: string; at: string }
): void {
  if (!_io) return;
  _io.emit(`sales:order:${orderId}:line:changed`, payload);
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
pnpm typecheck 2>&1 | grep -i "sockets"
```

Expected: no errors referencing `sockets.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/server/sockets.ts
git commit -m "feat(sockets): add emitSalesLineEvent for sales/pick coordination"
```

---

## Task 2: Wire socket emissions in `commandBus.ts`

**Files:**
- Modify: `src/server/services/commandBus.ts`

- [ ] **Step 1: Import `emitSalesLineEvent` at the top of commandBus.ts**

Find the existing import at line 114:
```ts
import { emitPickEvent, emitPickOrderAndQueue } from '../sockets';
```

Change to:
```ts
import { emitPickEvent, emitPickOrderAndQueue, emitSalesLineEvent } from '../sockets';
```

- [ ] **Step 2: Add sales event emission in the post-commit block**

Find the pick event emission block at lines 728–743 (the `PICK_QUEUE_AND_ORDER_CMDS` / `PICK_ORDER_ONLY_CMDS` block). After the existing `try/catch` block that emits pick events (around line 742), add:

```ts
    // Emit sales:order:*:line:changed so the sales grid and pick screens
    // can invalidate the affected order's salesOrderLines query in real time.
    const SALES_LINE_CMDS = ['releaseLineForPicking', 'releaseLinesForPicking', 'recallLineFromPicking'];
    if (commandResult.ok && commandResult.orderId && SALES_LINE_CMDS.includes(input.name)) {
      try {
        emitSalesLineEvent(commandResult.orderId, {
          kind: input.name,
          lineId: typeof commandResult.affectedIds?.[0] === 'string' ? commandResult.affectedIds[0] : undefined,
          at: new Date().toISOString(),
        });
      } catch (e) {
        console.warn('[commandBus] sales line event emit failed after commit:', e instanceof Error ? e.message : e);
      }
    }
```

- [ ] **Step 3: Add warehouse alert on `recallLineFromPicking` for started lines**

Find `recallLineFromPicking` at line 4014. Currently it throws when `fl.status !== 'open' || Number(fl.actualQty) > 0`. We need it to handle packed lines by setting a `recall_pending` status and creating a warehouse alert instead of throwing.

Replace lines 4022–4038 with:

```ts
  const [fl] = await tx.select().from(fulfillmentLines).where(eq(fulfillmentLines.orderLineId, lineId)).limit(1);
  if (fl) {
    if (Number(fl.actualQty) > 0) {
      // Line has been picked/packed — cannot delete FL. Instead set recall_pending and add a warehouse alert
      // so the picker sees it and must acknowledge before proceeding.
      const existingAlerts = Array.isArray(fl.warehouseAlerts)
        ? (fl.warehouseAlerts as Array<Record<string, unknown>>)
        : [];
      const recallAlert = {
        id: `recall-${Date.now()}`,
        type: 'recall',
        message: 'Recalled by sales — verify quantity with operator before completing this line.',
        status: 'pending',
        createdAt: new Date().toISOString(),
      };
      await tx.update(fulfillmentLines)
        .set({
          warehouseAlerts: [...existingAlerts, recallAlert],
          statusExtended: 'recall_pending',
          updatedAt: new Date(),
        })
        .where(eq(fulfillmentLines.id, fl.id));
    } else {
      // Line is open and unpicked — safe to delete the FL
      if (fl.status !== 'open') {
        throw new Error('Cannot recall a line that is in an unexpected state. Contact support.');
      }
      await tx.delete(fulfillmentLines).where(eq(fulfillmentLines.id, fl.id));
      const remaining = await tx.select().from(fulfillmentLines).where(eq(fulfillmentLines.pickListId, fl.pickListId));
      if (!remaining.length) {
        await tx.delete(pickLists).where(eq(pickLists.id, fl.pickListId));
      }
    }
  }
  await tx.update(salesOrderLines)
    .set({ pickReleasedAt: null, pickReleasedBy: null, updatedAt: new Date() })
    .where(eq(salesOrderLines.id, lineId));
  const affected: string[] = [lineId];
  if (fl) affected.push(fl.id, fl.pickListId);
  return { ok: true, commandId, affectedIds: affected, toast: 'Line recalled from picking.', orderId: line.orderId };
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
pnpm typecheck 2>&1 | grep -E "commandBus|sockets"
```

Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add src/server/services/commandBus.ts
git commit -m "feat(commandBus): emit sales:order:* events on release/recall; handle packed-line recall with alert"
```

---

## Task 3: Extend `App.tsx` socket handlers

**Files:**
- Modify: `src/client/App.tsx` (around lines 109–123)

- [ ] **Step 1: Add `salesOrderLines` invalidation to the existing `pick:order:*` handler**

Find lines 118–123:
```ts
    socket.onAny((event: string) => {
      if (event.startsWith('pick:order:')) {
        const orderId = event.slice('pick:order:'.length);
        if (orderId) void invalidateAffectedQueries(queryClient, [orderId]);
      }
    });
```

Replace with:
```ts
    socket.onAny((event: string) => {
      if (event.startsWith('pick:order:')) {
        const orderId = event.slice('pick:order:'.length);
        if (orderId) {
          void invalidateAffectedQueries(queryClient, [orderId]);
          // Invalidate salesOrderLines so status badges refresh when pick state changes
          void queryClient.invalidateQueries({ predicate: (q) => JSON.stringify(q.queryKey).includes(orderId) });
        }
      }
      if (event.startsWith('sales:order:') && event.endsWith(':line:changed')) {
        // "sales:order:{orderId}:line:changed"
        const parts = event.split(':');
        const orderId = parts[2]; // index 2 = orderId
        if (orderId) {
          void queryClient.invalidateQueries({ predicate: (q) => JSON.stringify(q.queryKey).includes(orderId) });
          // Also refresh pick queue and pick list for the affected order
          void queryClient.invalidateQueries({ predicate: (q) => JSON.stringify(q.queryKey).includes('pickQueue') });
        }
      }
    });
```

- [ ] **Step 2: Verify no TypeScript errors**

```bash
pnpm typecheck 2>&1 | grep -i "app.tsx"
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/client/App.tsx
git commit -m "feat(App): extend socket handlers for sales/pick bi-directional invalidation"
```

---

## Task 4: Add `RELEASED_PICK_STATUSES` constant and status-aware `editable` to `SalesView.tsx`

**Files:**
- Modify: `src/client/views/SalesView.tsx` (around lines 111–175)

- [ ] **Step 1: Add the constant before `lineColumns`**

Find line 111 (`const lineColumns: ColDef<GridRow>[] = [`). Immediately before it, add:

```ts
/** Pick statuses where the sales-side row should be read-only (operator must Recall first to edit). */
const RELEASED_PICK_STATUSES = new Set(['released', 'picking', 'picked', 'recall_pending']);

function isRowEditLocked(params: { data?: GridRow }): boolean {
  return RELEASED_PICK_STATUSES.has(String(params.data?.pickStatus ?? ''));
}
```

- [ ] **Step 2: Make each `editable: true` column in `lineColumns` status-aware**

In `lineColumns` (lines 111–174), find every column with `editable: true` and change it to `editable: (params) => !isRowEditLocked(params)`. Columns to update:

- Line 112: `{ field: 'legacyStatusMarker', ..., editable: true, ...}` → `editable: (params) => !isRowEditLocked(params)`
- Line 133: `{ field: 'itemName', ..., editable: true, ...}` → same
- Line 136: `{ field: 'qty', editable: true, ...}` → same
- Line 137: `{ field: 'unitPrice', editable: true, ...}` → same
- Line 152: `{ field: 'packed', editable: true, ...}` → same
- Line 153: `{ field: 'inventoryPosted', ..., editable: true, ...}` → same
- Line 154: `{ field: 'paymentFollowup', ..., editable: true, ...}` → same

After this change each of those ColDef entries looks like e.g.:
```ts
{ field: 'qty', editable: (params) => !isRowEditLocked(params), type: 'numericColumn', width: 95 },
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
pnpm typecheck 2>&1 | grep -i "salesview"
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/client/views/SalesView.tsx
git commit -m "feat(SalesView): lock row edits when line is in pick queue (released/picking/picked/recall_pending)"
```

---

## Task 5: Add `fulfillmentActionsColumn` + `refetchInterval` to `SalesView.tsx`

**Files:**
- Modify: `src/client/views/SalesView.tsx`

- [ ] **Step 1: Add the `fulfillmentActionsColumn` useMemo inside `SalesView()`**

Find line 221 (`const visibleOrderColumns = useMemo...`). After the three existing `useMemo` column lines (221–223), add:

```tsx
  const fulfillmentActionsColumn = useMemo<ColDef<GridRow>>(() => ({
    headerName: 'Pick',
    colId: 'fulfillmentActions',
    width: 190,
    pinned: 'right' as const,
    sortable: false,
    suppressMovable: true,
    cellRenderer: (params: { data?: GridRow }) => {
      const row = params.data;
      if (!row) return null;
      const ps = String(row.pickStatus ?? '');
      const isQueued = ps === 'released' || ps === 'picking' || ps === 'recall_pending';
      const isPacked = ps === 'picked' || row.packed === true;
      const eligibility = releaseEligibility.data?.find((e) => e.lineId === row.id);
      const alreadyReleased = eligibility?.alreadyReleased ?? isQueued ?? isPacked;
      const canRelease = !alreadyReleased && eligibility?.eligible === true;
      const inactiveRelease = !alreadyReleased && eligibility && !eligibility.eligible;
      const releaseTitle = inactiveRelease
        ? (releaseEligibility.data?.find((e) => e.lineId === row.id)?.reasons ?? []).join(' ')
        : '';
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {isQueued ? (
            <span className="selection-pill info" style={{ fontSize: 11 }}>Queued</span>
          ) : isPacked ? (
            <span className="selection-pill success" style={{ fontSize: 11 }}>Packed</span>
          ) : null}
          {canRelease && canWrite ? (
            <button
              className="primary-button compact-action"
              style={{ fontSize: 11, padding: '2px 8px' }}
              disabled={isRunning}
              onClick={() => void runCommand('releaseLineForPicking', { lineId: row.id }, 'Release line for picking')}
            >
              Release
            </button>
          ) : null}
          {inactiveRelease && canWrite ? (
            <button
              className="primary-button compact-action"
              style={{ fontSize: 11, padding: '2px 8px', opacity: 0.5 }}
              disabled
              title={releaseTitle}
            >
              Release
            </button>
          ) : null}
          {(isQueued || isPacked) && canWrite ? (
            <button
              className="secondary-button compact-action"
              style={{ fontSize: 11, padding: '2px 8px' }}
              disabled={isRunning}
              onClick={() => void runCommand('recallLineFromPicking', { lineId: row.id }, 'Recall line from picking')}
            >
              Recall
            </button>
          ) : null}
        </div>
      );
    },
  }), [releaseEligibility.data, isRunning, canWrite, runCommand]);
```

- [ ] **Step 2: Add `fulfillmentActionsColumn` to the lines grid and `refetchInterval` to `orderLines`**

Find line 239:
```ts
  const orderLines = trpc.queries.salesOrderLines.useQuery({ orderId: ... }, { enabled: Boolean(selectedOrder?.id) });
```

Add `refetchInterval: 30_000`:
```ts
  const orderLines = trpc.queries.salesOrderLines.useQuery(
    { orderId: String(selectedOrder?.id ?? '00000000-0000-0000-0000-000000000000') },
    { enabled: Boolean(selectedOrder?.id), refetchInterval: 30_000 }
  );
```

Find line 790 (the `OperatorGrid` for Customer Draft Lines). Change `columns={visibleLineColumns}` to:
```tsx
columns={[...visibleLineColumns, fulfillmentActionsColumn]}
```

- [ ] **Step 3: Verify TypeScript compiles and no runtime errors**

```bash
pnpm typecheck 2>&1 | grep -i "salesview"
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/client/views/SalesView.tsx
git commit -m "feat(SalesView): add fulfillment status badges + Release/Recall inline buttons + 30s polling"
```

---

## Task 6: Fix bulk-release toast to distinguish skipped vs. failed

**Files:**
- Modify: `src/client/views/SalesView.tsx` (around lines 797–823 — `selectionActions`)

- [ ] **Step 1: Replace the bulk release button handler**

Find the existing bulk release button `onClick` at line 808–815:
```ts
onClick={() => {
  const eligible = rows.filter((r) => {
    const elig = releaseEligibility.data?.find((e) => e.lineId === r.id);
    return !elig || (elig.eligible && !elig.alreadyReleased);
  });
  if (eligible.length > 0) {
    runCommand('releaseLinesForPicking', { lineIds: eligible.map((r) => r.id) }, 'Bulk release lines for picking');
  }
}}
```

Replace with:
```ts
onClick={async () => {
  const total = rows.length;
  const eligible = rows.filter((r) => {
    const elig = releaseEligibility.data?.find((e) => e.lineId === r.id);
    return elig ? (elig.eligible && !elig.alreadyReleased) : false;
  });
  const skipped = total - eligible.length;
  if (eligible.length === 0) return;
  let failed = 0;
  try {
    await runCommand(
      'releaseLinesForPicking',
      { lineIds: eligible.map((r) => r.id) },
      'Bulk release lines for picking'
    );
  } catch {
    failed = eligible.length; // conservative: if batch command fails, all failed
  }
  const released = eligible.length - failed;
  const parts = [`${released} of ${total} lines released`];
  if (skipped > 0) parts.push(`${skipped} skipped (not eligible)`);
  if (failed > 0) parts.push(`${failed} failed`);
  // useCommandRunner already shows a toast for success/failure — this is a
  // supplemental count toast only when skipped or failed counts are non-zero
  if (skipped > 0 || failed > 0) {
    // push via existing toast infrastructure if available, else console
    console.info('[bulk release]', parts.join(' — '));
  }
}}
```

> **Note:** `useCommandRunner` already surfaces the backend toast on success and error. This handler adds supplemental count information. Wire to the existing `pushToast` if it is accessible in scope; otherwise this is a follow-up when the toast infrastructure is confirmed.

- [ ] **Step 2: Verify TypeScript compiles**

```bash
pnpm typecheck 2>&1 | grep -i "salesview"
```

- [ ] **Step 3: Commit**

```bash
git add src/client/views/SalesView.tsx
git commit -m "feat(SalesView): bulk release toast distinguishes skipped vs. failed counts"
```

---

## Task 7: Add recalled-line detection to `PickView.tsx`

**Files:**
- Modify: `src/client/views/PickView.tsx`

- [ ] **Step 1: Add `recalledLine` state**

Find line 17 (`const [activeInterrupt, setActiveInterrupt] = useState<WarehouseAlertInterrupt | null>(null);`). After it, add:

```ts
  // Scenario B: track when the picker is on a line that gets recalled mid-pick.
  const [recalledLineItem, setRecalledLineItem] = useState<string | null>(null); // stores itemName for display
```

- [ ] **Step 2: Extend the useEffect to detect line disappearance**

Find the `useEffect` at lines 58–82. After the `if (!rawLine) return;` at line 64, replace that early return with:

```ts
    if (!rawLine) {
      // The line the picker was on is no longer in the pick list.
      // This means it was recalled by the sales operator (Scenario B).
      if (selectedLine) {
        setRecalledLineItem(selectedLine.itemName);
        setActiveInterrupt(null);
      }
      return;
    }
    setRecalledLineItem(null); // clear any stale recalled state
```

- [ ] **Step 3: Pass `recalled` and `recalledItemName` to `PickLineScreen` and handle "Got it"**

Find lines 124–137 (the `if (screen === 'line')` render block). Replace with:

```tsx
  if (screen === 'line') {
    return (
      <PickLineScreen
        line={selectedLine}
        pickNo={selectedPickList?.pickNo ?? ''}
        customer={selectedPickList?.customer ?? ''}
        interrupt={activeInterrupt}
        recalled={Boolean(recalledLineItem)}
        recalledItemName={recalledLineItem ?? ''}
        onBack={() => {
          setActiveInterrupt(null);
          setRecalledLineItem(null);
          setScreen('list');
        }}
        onPicked={handleLinePicked}
      />
    );
  }
```

- [ ] **Step 4: Verify TypeScript — expect prop errors on PickLineScreen (fixed in Task 8)**

```bash
pnpm typecheck 2>&1 | grep -E "PickView|PickLineScreen"
```

Expected: TypeScript will report `recalled` and `recalledItemName` as unknown props on `PickLineScreen`. That's correct — fix in Task 8.

- [ ] **Step 5: Commit after Task 8 fixes the types** (combined commit in Task 8 Step 5)

---

## Task 8: Add recall overlay and alert card to `PickLineScreen.tsx`

**Files:**
- Modify: `src/client/components/pick/PickLineScreen.tsx`
- Modify: `src/client/components/pick/pickTypes.ts` (no change needed — `recalled` is a prop not a type field)

- [ ] **Step 1: Extend the Props interface**

Find lines 8–16 (the `Props` interface). Add two new props:

```ts
interface Props {
  line: PickLine | null;
  pickNo: string;
  customer: string;
  interrupt: WarehouseAlertInterrupt | null;
  /** Scenario B: true when this line was recalled while the picker was actively on it */
  recalled?: boolean;
  /** The item name of the recalled line (for display in the overlay) */
  recalledItemName?: string;
  onBack: () => void;
  onPicked: () => void;
}
```

- [ ] **Step 2: Destructure the new props**

Find line 27 (`export function PickLineScreen({ line, pickNo, customer, interrupt, onBack, onPicked }: Props) {`). Replace with:

```ts
export function PickLineScreen({ line, pickNo, customer, interrupt, recalled, recalledItemName, onBack, onPicked }: Props) {
```

- [ ] **Step 3: Add recall overlay before the `!line` empty state**

Find lines 125–131 (the `if (!line)` block). Before it (after line 123 `// activeInterrupt will clear automatically...`), insert:

```tsx
  // Scenario B — line was recalled while picker was on this screen
  if (recalled) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-amber-50 p-8">
        <div className="text-4xl">↩️</div>
        <h2 className="text-xl font-bold text-amber-900">Line Recalled</h2>
        <p className="max-w-xs text-center text-base text-amber-800">
          <strong>{recalledItemName || 'This line'}</strong> was recalled by sales. Check with the sales operator for the updated quantity.
        </p>
        <button
          type="button"
          className="primary-button mt-4 w-full max-w-xs"
          style={{ minHeight: 56 }}
          onClick={onBack}
        >
          Got it
        </button>
      </div>
    );
  }
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
pnpm typecheck 2>&1 | grep -E "PickLineScreen|PickView"
```

Expected: no errors.

- [ ] **Step 5: Commit (includes PickView.tsx from Task 7)**

```bash
git add src/client/views/PickView.tsx src/client/components/pick/PickLineScreen.tsx
git commit -m "feat(pick): add Scenario B recall overlay when active line is pulled mid-pick"
```

---

## Task 9: Add amber banner to `PickListScreen.tsx`

**Files:**
- Modify: `src/client/components/pick/PickListScreen.tsx`

- [ ] **Step 1: Add the amber banner inside the list render**

Find line 63 (the opening `<>` just before `<ul className="divide-y divide-line">`). Insert the banner between the `<>` and the `<ul>`:

```tsx
          <>
            {/* Scenario C — amber banner when any line has unacknowledged alerts */}
            {lines.some((l) => l.alertCount > 0) ? (
              <div
                className="flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
                role="alert"
              >
                <span className="text-base">⚠️</span>
                <span>Sales updated this order — check flagged lines.</span>
              </div>
            ) : null}
            <ul className="divide-y divide-line">
```

The per-line `alertCount` warning badge (lines 83–87) already exists and shows on each line row. No changes needed there.

- [ ] **Step 2: Verify TypeScript compiles**

```bash
pnpm typecheck 2>&1 | grep -i "PickListScreen"
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/client/components/pick/PickListScreen.tsx
git commit -m "feat(PickListScreen): add Scenario C amber banner for unacknowledged line changes"
```

---

## Task 10: Smoke test — end-to-end runtime verification

- [ ] **Step 1: Start the dev server**

```bash
pnpm dev
```

Open `http://127.0.0.1:5173`.

- [ ] **Step 2: Verify status badges in the sales grid**

1. Navigate to a customer workspace that has an active sales order with released lines.
2. Confirm lines with `pickStatus === 'released'` show a **"Queued"** blue pill in the `Pick` column.
3. Confirm lines with `pickStatus === 'picked'` show a **"Packed"** green pill.
4. Confirm unreleased lines show a **`Release`** button.
5. Confirm released/packed lines show a **`Recall`** button.
6. Confirm released/packed rows are NOT editable — clicking a cell should not open an edit box.

- [ ] **Step 3: Verify Release button**

1. On an unreleased line with a valid batch and qty, click **`Release`**.
2. Confirm the line transitions to "Queued" badge.
3. Navigate to `/pick` — confirm the line appears in the pick queue.

- [ ] **Step 4: Verify Recall button**

1. On a "Queued" line, click **`Recall`**.
2. Confirm the line reverts to draft (no badge, `Release` button visible, row editable).
3. Confirm picker's pick list refreshes and the line is gone.

- [ ] **Step 5: Verify amber banner on picker side**

1. In a separate browser tab, navigate to `/pick` and select the active pick list.
2. From the sales tab, trigger a change (release a new line to the order).
3. Within 30s, confirm the amber banner *"Sales updated this order — check flagged lines"* appears on `PickListScreen`.

- [ ] **Step 6: Verify Scenario B recall overlay**

1. On `/pick`, navigate to an active line's `PickLineScreen`.
2. From the sales tab, recall that line.
3. Confirm the full-screen *"Line Recalled"* overlay appears on the picker's screen within 30s.
4. Tap **"Got it"** — confirm navigation back to `PickListScreen`.

- [ ] **Step 7: Commit any smoke-test fixes**

```bash
git add -p
git commit -m "fix(sales-pick): smoke test corrections"
```

---

## Dependency Gate Reminder

> The frontend changes in Tasks 3–9 depend on the backend changes in Tasks 1–2. Do not merge frontend tasks until:
> 1. `emitSalesLineEvent` is in `sockets.ts` ✓ (Task 1)
> 2. Socket emissions are wired in `commandBus.ts` ✓ (Task 2)
>
> The `fulfillmentStatus` query field (spec Section 5 backend contract item 1) is **not required for this plan** because the frontend derives "Queued"/"Packed" from the existing `pickStatus` field already returned by `salesOrderLines`. The backend item can be added as a clean-up in a follow-up if a dedicated field is preferred.
