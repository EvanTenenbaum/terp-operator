# Matchmaking Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend matchmaking from a manual scratchpad (Leg 1 capture only) into a three-leg demand-supply intelligence layer: capture (Leg 1), inventory-to-customer matching (Leg 2), and gap-to-vendor sourcing (Leg 3), with slim entry forms, ambient signals in Clients/Vendors grids and the work queue, and a tunable settings panel.

**Architecture:** New `matchmaking_settings` table holds workspace-wide thresholds; two new tRPC queries (`matchmakingOpportunities`, `matchmakingEntityCounts`) power Legs 2/3 and ambient badges; `MatchmakingView` gains a settings panel and two new panels; `OperationsViews` gains conditional ambient columns; the work queue gains matchmaking lane items. All mutations go through the command bus.

**Tech Stack:** React 18 + TypeScript strict + tRPC v10 + Drizzle ORM + PostgreSQL 16 + AG Grid Enterprise v32 + Zod + `useCommandRunner`.

**Spec:** `docs/superpowers/specs/2026-05-25-matchmaking-redesign.md`

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `migrations/0056_matchmaking_settings.sql` | Create | New settings table |
| `src/server/schema.ts` | Modify | Add `matchmakingSettings` Drizzle table |
| `src/shared/commandCatalog.ts` | Modify | Add 3 new commands + role gates |
| `src/server/services/commandBus.ts` | Modify | Add handlers + state machine guards |
| `src/server/routers/queries.ts` | Modify | Add 3 new queries + work queue branches |
| `src/client/views/MatchmakingView.tsx` | Modify | Settings panel, 6-field strips, trimmed grids, Leg 2/3 panels, URL params |
| `src/client/views/OperationsViews.tsx` | Modify | Ambient matchmaking columns in clients/vendors |
| `src/server/services/matchmakingStatus.test.ts` | Modify | Extend with state machine tests |

---

## Task 1: DB migration + Drizzle schema for `matchmaking_settings`

**Files:**
- Create: `migrations/0056_matchmaking_settings.sql`
- Modify: `src/server/schema.ts`

- [ ] **Step 1: Write the migration SQL**

Create `migrations/0056_matchmaking_settings.sql`:

```sql
create table matchmaking_settings (
  id uuid primary key default gen_random_uuid(),
  match_quality_floor integer not null default 35,
  work_queue_threshold integer not null default 75,
  history_lookback_days integer not null default 90,
  repeat_threshold integer not null default 3,
  gap_floor_qty integer not null default 0,
  show_clients_column boolean not null default false,
  show_vendors_column boolean not null default false,
  work_queue_enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references users(id) on delete set null
);

-- Insert the single workspace row with defaults on migration
insert into matchmaking_settings default values;
```

- [ ] **Step 2: Add Drizzle table to `src/server/schema.ts`**

Find the end of the `matchmakingMatches` table definition (around line 554). Add after it:

```typescript
export const matchmakingSettings = pgTable('matchmaking_settings', {
  id: id(),
  matchQualityFloor: integer('match_quality_floor').notNull().default(35),
  workQueueThreshold: integer('work_queue_threshold').notNull().default(75),
  historyLookbackDays: integer('history_lookback_days').notNull().default(90),
  repeatThreshold: integer('repeat_threshold').notNull().default(3),
  gapFloorQty: integer('gap_floor_qty').notNull().default(0),
  showClientsColumn: boolean('show_clients_column').notNull().default(false),
  showVendorsColumn: boolean('show_vendors_column').notNull().default(false),
  workQueueEnabled: boolean('work_queue_enabled').notNull().default(true),
  updatedAt: updated(),
  updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
});
```

Also add `matchmakingSettings` to the existing imports at the top of `commandBus.ts` where schema imports live (search for `import {` near the top and add `matchmakingSettings` to the destructured list).

- [ ] **Step 3: Run migration to verify it applies cleanly**

```bash
pnpm db:migrate
```

Expected: migration applies without error. Verify with:

```bash
psql $DATABASE_URL -c "select * from matchmaking_settings;"
```

Expected: one row with all default values.

- [ ] **Step 4: Run typecheck**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add migrations/0056_matchmaking_settings.sql src/server/schema.ts
git commit -m "feat(matchmaking): add matchmaking_settings table + Drizzle schema"
```

---

## Task 2: `updateMatchmakingSettings` command

**Files:**
- Modify: `src/shared/commandCatalog.ts`
- Modify: `src/server/services/commandBus.ts`

- [ ] **Step 1: Write a failing test**

In `src/server/services/matchmakingStatus.test.ts`, add:

```typescript
describe('updateMatchmakingSettings', () => {
  it('updates threshold settings', async () => {
    const result = await runCommandDirect('updateMatchmakingSettings', {
      matchQualityFloor: 40,
      workQueueThreshold: 80,
    });
    expect(result.ok).toBe(true);
  });

  it('rejects workQueueThreshold < matchQualityFloor', async () => {
    await expect(
      runCommandDirect('updateMatchmakingSettings', {
        matchQualityFloor: 80,
        workQueueThreshold: 40,
      })
    ).rejects.toThrow('Work queue threshold must be ≥ match quality floor');
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
pnpm test src/server/services/matchmakingStatus.test.ts
```

Expected: FAIL — `updateMatchmakingSettings` not found in command catalog.

- [ ] **Step 3: Add command to catalog**

In `src/shared/commandCatalog.ts`, add to the commands array:

```typescript
'updateMatchmakingSettings',
'noteMatchmakingOutreach',
'dismissMatchmakingWorkQueueItem',
```

Add to the `commandLabels` map:

```typescript
updateMatchmakingSettings: 'Update matchmaking settings',
noteMatchmakingOutreach: 'Note matchmaking outreach',
dismissMatchmakingWorkQueueItem: 'Dismiss matchmaking work queue item',
```

Add to the `commandRoles` map:

```typescript
updateMatchmakingSettings: 'manager',
noteMatchmakingOutreach: 'operator',
dismissMatchmakingWorkQueueItem: 'operator',
```

- [ ] **Step 4: Add handler to `commandBus.ts`**

In the main `switch` statement in `commandBus.ts` (around line 785 near the existing matchmaking cases), add:

```typescript
case 'updateMatchmakingSettings':
  return updateMatchmakingSettings(tx, payload, user.id, commandId);
case 'noteMatchmakingOutreach':
  return noteMatchmakingOutreach(tx, payload, user.id, commandId);
case 'dismissMatchmakingWorkQueueItem':
  return dismissMatchmakingWorkQueueItem(tx, payload, user.id, commandId);
```

Add the handler function near the existing matchmaking handlers (around line 4900+):

```typescript
export async function updateMatchmakingSettings(
  tx: Tx,
  payload: Payload,
  userId: string,
  commandId: string
): Promise<CommandResult> {
  const floor = payload.matchQualityFloor != null ? Number(payload.matchQualityFloor) : undefined;
  const threshold = payload.workQueueThreshold != null ? Number(payload.workQueueThreshold) : undefined;

  // Fetch current settings to validate against
  const [current] = await tx.select().from(matchmakingSettings).limit(1);
  const effectiveFloor = floor ?? current?.matchQualityFloor ?? 35;
  const effectiveThreshold = threshold ?? current?.workQueueThreshold ?? 75;

  if (effectiveThreshold < effectiveFloor) {
    throw new Error('Work queue threshold must be ≥ match quality floor.');
  }

  const values: Record<string, unknown> = { updatedAt: new Date(), updatedBy: userId };
  if (floor != null) values.matchQualityFloor = floor;
  if (threshold != null) values.workQueueThreshold = threshold;
  if (payload.historyLookbackDays != null) values.historyLookbackDays = Number(payload.historyLookbackDays);
  if (payload.repeatThreshold != null) values.repeatThreshold = Number(payload.repeatThreshold);
  if (payload.gapFloorQty != null) values.gapFloorQty = Number(payload.gapFloorQty);
  if (payload.showClientsColumn != null) values.showClientsColumn = Boolean(payload.showClientsColumn);
  if (payload.showVendorsColumn != null) values.showVendorsColumn = Boolean(payload.showVendorsColumn);
  if (payload.workQueueEnabled != null) values.workQueueEnabled = Boolean(payload.workQueueEnabled);

  if (current) {
    await tx.update(matchmakingSettings).set(values).where(eq(matchmakingSettings.id, current.id));
  } else {
    await tx.insert(matchmakingSettings).values({ ...values } as typeof matchmakingSettings.$inferInsert);
  }

  return { ok: true, commandId, affectedIds: [], toast: 'Matchmaking settings updated.' };
}
```

- [ ] **Step 5: Run test to confirm it passes**

```bash
pnpm test src/server/services/matchmakingStatus.test.ts
```

Expected: new tests PASS.

- [ ] **Step 6: Typecheck**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/shared/commandCatalog.ts src/server/services/commandBus.ts src/server/services/matchmakingStatus.test.ts
git commit -m "feat(matchmaking): updateMatchmakingSettings command + catalog entries"
```

---

## Task 3: `queries.matchmakingSettings` tRPC endpoint

**Files:**
- Modify: `src/server/routers/queries.ts`

- [ ] **Step 1: Add import**

Near the top of `queries.ts` where schema imports are destructured, add `matchmakingSettings` to the import.

- [ ] **Step 2: Add the query**

Find the `matchmakingBoard` query procedure (around line 50 in the queries router). Add immediately after it:

```typescript
matchmakingSettings: protectedProcedure.query(async () => {
  const [row] = await pool.query(
    `select
       match_quality_floor as "matchQualityFloor",
       work_queue_threshold as "workQueueThreshold",
       history_lookback_days as "historyLookbackDays",
       repeat_threshold as "repeatThreshold",
       gap_floor_qty as "gapFloorQty",
       show_clients_column as "showClientsColumn",
       show_vendors_column as "showVendorsColumn",
       work_queue_enabled as "workQueueEnabled"
     from matchmaking_settings
     limit 1`
  );
  // Safe fallback: return defaults if no row exists yet
  return row ?? {
    matchQualityFloor: 35,
    workQueueThreshold: 75,
    historyLookbackDays: 90,
    repeatThreshold: 3,
    gapFloorQty: 0,
    showClientsColumn: false,
    showVendorsColumn: false,
    workQueueEnabled: true,
  };
}),
```

- [ ] **Step 3: Typecheck**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/server/routers/queries.ts
git commit -m "feat(matchmaking): matchmakingSettings tRPC query"
```

---

## Task 4: Settings panel UI in MatchmakingView

**Files:**
- Modify: `src/client/views/MatchmakingView.tsx`

- [ ] **Step 1: Add tRPC query and command runner wiring at top of component**

In `MatchmakingView`, add after the existing `const board = trpc.queries.matchmakingBoard.useQuery();` line:

```typescript
const settings = trpc.queries.matchmakingSettings.useQuery();
const s = settings.data ?? {
  matchQualityFloor: 35,
  workQueueThreshold: 75,
  historyLookbackDays: 90,
  repeatThreshold: 3,
  gapFloorQty: 0,
  showClientsColumn: false,
  showVendorsColumn: false,
  workQueueEnabled: true,
};

async function updateSettings(patch: Record<string, unknown>) {
  await runCommand('updateMatchmakingSettings', patch, 'Update matchmaking settings');
  settings.refetch();
}
```

- [ ] **Step 2: Add the settings panel JSX**

In the returned JSX, add as the first child inside `<div className="view-stack">`, before the existing `{canWrite ? <WorkspacePanel ...>` block:

```tsx
<WorkspacePanel
  panelId="matchmaking:settings"
  title="⚙ Matchmaking Settings"
  collapsedSummary={`Showing matches ≥ ${s.matchQualityFloor} · Work queue alerts ≥ ${s.workQueueThreshold} · ${s.historyLookbackDays}-day history`}
  contentClassName="p-3"
>
  <div className="space-y-4">
    {/* Threshold controls */}
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <label className="field-inline">
        Show matches scoring at least
        <input
          className="input compact"
          type="number"
          min={0}
          max={100}
          disabled={!canWrite || isRunning}
          defaultValue={s.matchQualityFloor}
          onBlur={(e) => updateSettings({ matchQualityFloor: Number(e.target.value) })}
        />
        pts
      </label>
      <label className="field-inline">
        Add to work queue at
        <input
          className="input compact"
          type="number"
          min={0}
          max={100}
          disabled={!canWrite || isRunning}
          defaultValue={s.workQueueThreshold}
          onBlur={(e) => updateSettings({ workQueueThreshold: Number(e.target.value) })}
        />
        pts
      </label>
      <label className="field-inline">
        Look back
        <select
          className="select compact"
          disabled={!canWrite || isRunning}
          value={s.historyLookbackDays}
          onChange={(e) => updateSettings({ historyLookbackDays: Number(e.target.value) })}
        >
          <option value={30}>30 days</option>
          <option value={60}>60 days</option>
          <option value={90}>90 days</option>
          <option value={180}>180 days</option>
        </select>
      </label>
      <label className="field-inline">
        Flag as repeat after
        <select
          className="select compact"
          disabled={!canWrite || isRunning}
          value={s.repeatThreshold}
          onChange={(e) => updateSettings({ repeatThreshold: Number(e.target.value) })}
        >
          <option value={2}>2 purchases</option>
          <option value={3}>3 purchases</option>
          <option value={5}>5 purchases</option>
        </select>
      </label>
      <label className="field-inline">
        Flag gaps when on hand drops to
        <input
          className="input compact"
          type="number"
          min={0}
          disabled={!canWrite || isRunning}
          defaultValue={s.gapFloorQty}
          onBlur={(e) => updateSettings({ gapFloorQty: Number(e.target.value) })}
        />
        units
      </label>
    </div>

    {/* Discovery toggles */}
    <div className="flex flex-wrap gap-4 text-sm">
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          className="h-4 w-4"
          disabled={!canWrite || isRunning}
          checked={s.showClientsColumn}
          onChange={(e) => updateSettings({ showClientsColumn: e.target.checked })}
        />
        Show matchmaking signals in Clients grid
      </label>
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          className="h-4 w-4"
          disabled={!canWrite || isRunning}
          checked={s.showVendorsColumn}
          onChange={(e) => updateSettings({ showVendorsColumn: e.target.checked })}
        />
        Show matchmaking signals in Vendors grid
      </label>
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          className="h-4 w-4"
          disabled={!canWrite || isRunning}
          checked={s.workQueueEnabled}
          onChange={(e) => updateSettings({ workQueueEnabled: e.target.checked })}
        />
        Show matchmaking opportunities in work queue
      </label>
    </div>

    {/* Scoring rubric */}
    <details className="text-sm text-zinc-500">
      <summary className="cursor-pointer select-none hover:text-zinc-700">How scores are calculated</summary>
      <pre className="mt-2 font-mono text-xs leading-relaxed">
{`Category match:                    +35
Tag overlap (per shared tag):       +8  (capped at +24)
Product name token overlap:        +10
Vendor qty covers need minimum:    +12
Asking price ≤ target price:       +12
Supply available by needed-by:      +7
────────────────────────────────────
Maximum score:                     100`}
      </pre>
    </details>
  </div>
</WorkspacePanel>
```

Note: `WorkspacePanel` must support a `collapsedSummary` prop. Check `src/client/components/WorkspacePanel.tsx` — if this prop does not exist, add it: the panel renders the `collapsedSummary` string as muted text next to the title when collapsed.

- [ ] **Step 3: Add `collapsedSummary` prop to `WorkspacePanel` if missing**

Open `src/client/components/WorkspacePanel.tsx`. If `collapsedSummary` is not in the props interface, add:

```typescript
collapsedSummary?: string;
```

And in the render, when the panel is collapsed, show it:

```tsx
{isCollapsed && collapsedSummary && (
  <span className="ml-2 text-xs text-zinc-400 font-normal">{collapsedSummary}</span>
)}
```

- [ ] **Step 4: Typecheck**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/client/views/MatchmakingView.tsx src/client/components/WorkspacePanel.tsx
git commit -m "feat(matchmaking): settings panel UI — thresholds, discovery toggles, scoring rubric"
```

---

## Task 5: DYN-H4 State machine enforcement

**Files:**
- Modify: `src/server/services/commandBus.ts`
- Modify: `src/server/services/matchmakingStatus.test.ts`

The existing `reviewMatchmakingMatch` already handles the accept cascade correctly. This task adds:
1. Guards on `updateCustomerNeed` / `updateVendorSupply` to block invalid status transitions.
2. A fix to `reopenMatchmakingMatch` to correctly revert need/supply status when no other accepted match exists.

- [ ] **Step 1: Write failing tests**

In `matchmakingStatus.test.ts`, add:

```typescript
describe('state machine guards', () => {
  it('blocks invalid need status transition (closed → open)', async () => {
    // Create a need and close it
    const { needId } = await createNeedAndClose();
    await expect(
      runCommandDirect('updateCustomerNeed', { customerNeedId: needId, status: 'open' })
    ).rejects.toThrow('Invalid status transition');
  });

  it('allows valid need manual close (open → closed)', async () => {
    const { needId } = await createOpenNeed();
    const result = await runCommandDirect('updateCustomerNeed', { customerNeedId: needId, status: 'closed' });
    expect(result.ok).toBe(true);
  });

  it('reopenMatchmakingMatch reverts need to open when no other accepted match', async () => {
    const { matchId, needId } = await createAndAcceptMatch();
    await runCommandDirect('reopenMatchmakingMatch', { matchId });
    const need = await getNeed(needId);
    expect(need.status).toBe('open');
  });

  it('reopenMatchmakingMatch keeps need matched when another accepted match exists', async () => {
    const { matchId, needId } = await createNeedWithTwoAcceptedMatches();
    // reopen only one
    await runCommandDirect('reopenMatchmakingMatch', { matchId });
    const need = await getNeed(needId);
    expect(need.status).toBe('matched'); // other match still accepted
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
pnpm test src/server/services/matchmakingStatus.test.ts
```

Expected: new state machine tests FAIL.

- [ ] **Step 3: Add status transition guard to `updateCustomerNeed`**

Find the `updateCustomerNeed` handler in `commandBus.ts` (around line 4815). After fetching `current`, add before the `.update()` call:

```typescript
// State machine guard
if (payload.status != null && payload.status !== current.status) {
  const validTransitions: Record<string, string[]> = {
    open: ['matched', 'closed'],
    matched: ['open', 'closed'],
    closed: [],
  };
  const allowed = validTransitions[current.status] ?? [];
  if (!allowed.includes(payload.status)) {
    throw new Error(`Invalid status transition for customer need: ${current.status} → ${payload.status}`);
  }
}
```

- [ ] **Step 4: Add status transition guard to `updateVendorSupply`**

Find the `updateVendorSupply` handler (around line 4878). Apply the same pattern with vendor supply valid transitions:

```typescript
if (payload.status != null && payload.status !== current.status) {
  const validTransitions: Record<string, string[]> = {
    open: ['held_for_match', 'closed'],
    held_for_match: ['open', 'closed'],
    closed: [],
  };
  const allowed = validTransitions[current.status] ?? [];
  if (!allowed.includes(payload.status)) {
    throw new Error(`Invalid status transition for vendor supply: ${current.status} → ${payload.status}`);
  }
}
```

- [ ] **Step 5: Fix `reopenMatchmakingMatch` to revert need/supply status**

Find `reopenMatchmakingMatch` (around line 4922). After the `await tx.update(matchmakingMatches)...` line, add:

```typescript
// Revert need to open if no other accepted match exists for this need
const [otherAcceptedForNeed] = await tx
  .select({ id: matchmakingMatches.id })
  .from(matchmakingMatches)
  .where(
    and(
      eq(matchmakingMatches.customerNeedId, match.customerNeedId),
      eq(matchmakingMatches.status, 'accepted'),
      sql`${matchmakingMatches.id} <> ${matchId}`
    )
  )
  .limit(1);
if (!otherAcceptedForNeed) {
  await tx.update(customerNeeds)
    .set({ status: 'open', updatedAt: new Date() })
    .where(eq(customerNeeds.id, match.customerNeedId));
}

// Revert supply to open if no other accepted match exists for this supply
const [otherAcceptedForSupply] = await tx
  .select({ id: matchmakingMatches.id })
  .from(matchmakingMatches)
  .where(
    and(
      eq(matchmakingMatches.vendorSupplyId, match.vendorSupplyId),
      eq(matchmakingMatches.status, 'accepted'),
      sql`${matchmakingMatches.id} <> ${matchId}`
    )
  )
  .limit(1);
if (!otherAcceptedForSupply) {
  await tx.update(vendorSupply)
    .set({ status: 'open', updatedAt: new Date() })
    .where(eq(vendorSupply.id, match.vendorSupplyId));
}
```

- [ ] **Step 6: Run tests — confirm they pass**

```bash
pnpm test src/server/services/matchmakingStatus.test.ts
```

Expected: all tests PASS.

- [ ] **Step 7: Typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 8: Commit**

```bash
git add src/server/services/commandBus.ts src/server/services/matchmakingStatus.test.ts
git commit -m "fix(matchmaking): DYN-H4 — state machine guards on need/supply + reopen revert cascade"
```

---

## Task 6: Leg 1 — 6-field entry strips

**Files:**
- Modify: `src/client/views/MatchmakingView.tsx`

- [ ] **Step 1: Replace customer need entry strip state**

Remove state vars that are no longer in the 6-field strip: `urgency`, `needNotes`, `qtyMax`. Keep: `customerId`, `needProduct`, `needCategory`, `qtyMin`, `targetPrice`, `neededBy`.

Remove these `useState` declarations:
```typescript
// REMOVE these:
const [urgency, setUrgency] = useState('normal');
const [needNotes, setNeedNotes] = useState('');
const [qtyMax, setQtyMax] = useState('');
// Also remove: needTags, supplyTags, location, grade, terms, supplyNotes
// (still passed to commands via inline edit; not needed in strip state)
```

Keep for vendor strip: `vendorId`, `supplyProduct`, `supplyCategory`, `availableQty`, `askingPrice`, `availableDate`.

- [ ] **Step 2: Fix `createNeed` to only send strip fields**

Replace the existing `createNeed` function:

```typescript
async function createNeed() {
  await runCommand(
    'createCustomerNeed',
    {
      customerId,
      productName: needProduct,
      category: needCategory,
      qtyMin: Number(qtyMin),
      targetPrice: targetPrice ? Number(targetPrice) : undefined,
      neededBy: neededBy || undefined,
    },
    'Add customer need'
  );
  // Reset: keep customer + category, clear the rest
  setNeedProduct('');
  setQtyMin('0');
  setTargetPrice('');
  setNeededBy('');
  needProductRef.current?.focus();
}
```

- [ ] **Step 3: Fix `createSupply` reset behavior**

Replace the existing `createSupply` function:

```typescript
async function createSupply() {
  await runCommand(
    'createVendorSupply',
    {
      vendorId,
      productName: supplyProduct,
      category: supplyCategory,
      availableQty: Number(availableQty),
      askingPrice: askingPrice ? Number(askingPrice) : undefined,
      availableDate: availableDate || undefined,
    },
    'Add vendor stock'
  );
  // Reset: keep vendor + category, clear the rest
  setSupplyProduct('');
  setAvailableQty('0');
  setAskingPrice('');
  setAvailableDate('');
  supplyProductRef.current?.focus();
}
```

- [ ] **Step 4: Replace entry strip JSX with 6-field versions**

Replace the two `<div className="control-band subtle-band">` blocks inside `WorkspacePanel`:

**Customer need strip:**
```tsx
<div className="control-band subtle-band">
  <label className="field-inline">
    Customer
    <select className="select" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
      <option value="">Select customer</option>
      {reference.data?.customers.map((c) => (
        <option key={c.id} value={c.id}>{c.name}</option>
      ))}
    </select>
  </label>
  <label className="field-inline grow">
    Need
    <input ref={needProductRef} className="input" value={needProduct}
      onChange={(e) => setNeedProduct(e.target.value)} placeholder="e.g. Indica flower" />
  </label>
  <label className="field-inline">
    Category
    <select className="select compact" value={needCategory} onChange={(e) => setNeedCategory(e.target.value)}>
      <option value="">Category</option>
      {reference.data?.categories.map((cat) => <option key={cat}>{cat}</option>)}
    </select>
  </label>
  <label className="field-inline">
    Qty
    <input className="input compact" value={qtyMin} inputMode="decimal"
      onChange={(e) => setQtyMin(e.target.value)} />
  </label>
  <label className="field-inline">
    Target $
    <input className="input compact" value={targetPrice} inputMode="decimal"
      onChange={(e) => setTargetPrice(e.target.value)} />
  </label>
  <label className="field-inline">
    By
    <input className="input compact" type="date" value={neededBy}
      onChange={(e) => setNeededBy(e.target.value)} />
  </label>
  <button
    className="primary-button"
    type="button"
    disabled={!customerId || !needProduct.trim() || !needCategory || Number(qtyMin) <= 0 || isRunning}
    onClick={createNeed}
  >
    <Plus className="h-4 w-4" aria-hidden="true" />
    Add Need
  </button>
</div>
```

**Vendor stock strip:**
```tsx
<div className="control-band subtle-band">
  <label className="field-inline">
    Vendor
    <select className="select" value={vendorId} onChange={(e) => setVendorId(e.target.value)}>
      <option value="">Select vendor</option>
      {reference.data?.vendors.map((v) => (
        <option key={v.id} value={v.id}>{v.name}</option>
      ))}
    </select>
  </label>
  <label className="field-inline grow">
    Stock
    <input ref={supplyProductRef} className="input" value={supplyProduct}
      onChange={(e) => setSupplyProduct(e.target.value)} placeholder="e.g. Blue Dream 28g" />
  </label>
  <label className="field-inline">
    Category
    <select className="select compact" value={supplyCategory} onChange={(e) => setSupplyCategory(e.target.value)}>
      <option value="">Category</option>
      {reference.data?.categories.map((cat) => <option key={cat}>{cat}</option>)}
    </select>
  </label>
  <label className="field-inline">
    Qty
    <input className="input compact" value={availableQty} inputMode="decimal"
      onChange={(e) => setAvailableQty(e.target.value)} />
  </label>
  <label className="field-inline">
    Ask $
    <input className="input compact" value={askingPrice} inputMode="decimal"
      onChange={(e) => setAskingPrice(e.target.value)} />
  </label>
  <label className="field-inline">
    Date
    <input className="input compact" type="date" value={availableDate}
      onChange={(e) => setAvailableDate(e.target.value)} />
  </label>
  <button
    className="primary-button"
    type="button"
    disabled={!vendorId || !supplyProduct.trim() || !supplyCategory || Number(availableQty) <= 0 || isRunning}
    onClick={createSupply}
  >
    <Plus className="h-4 w-4" aria-hidden="true" />
    Add Stock
  </button>
</div>
```

- [ ] **Step 5: Typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 6: Commit**

```bash
git add src/client/views/MatchmakingView.tsx
git commit -m "feat(matchmaking): slim entry strips to 6 fields, fix post-submit reset"
```

---

## Task 7: Trim grids to ≤8 columns + computed priceFit/qtyFit

**Files:**
- Modify: `src/client/views/MatchmakingView.tsx`

- [ ] **Step 1: Replace `needColumns`**

```typescript
const needColumns: ColDef<GridRow>[] = [
  { field: 'needCode', headerName: 'Need', pinned: 'left', width: 120 },
  { field: 'customer', width: 170 },
  { field: 'productName', headerName: 'Request', editable: true, minWidth: 180 },
  { field: 'category', editable: true, width: 120 },
  { field: 'qtyMin', headerName: 'Qty', editable: true, type: 'numericColumn', width: 100 },
  { field: 'targetPrice', headerName: 'Target $', editable: true, type: 'numericColumn', width: 110 },
  { field: 'neededBy', headerName: 'By', editable: true, width: 130 },
  { field: 'status', width: 115 },
];
```

- [ ] **Step 2: Replace `supplyColumns`**

```typescript
const supplyColumns: ColDef<GridRow>[] = [
  { field: 'supplyCode', headerName: 'Stock', pinned: 'left', width: 120 },
  { field: 'vendor', width: 170 },
  { field: 'productName', headerName: 'Product', editable: true, minWidth: 180 },
  { field: 'category', editable: true, width: 120 },
  { field: 'availableQty', headerName: 'Qty', editable: true, type: 'numericColumn', width: 100 },
  { field: 'askingPrice', headerName: 'Ask $', editable: true, type: 'numericColumn', width: 110 },
  { field: 'availableDate', headerName: 'Available', editable: true, width: 130 },
  { field: 'status', width: 115 },
];
```

- [ ] **Step 3: Replace `matchColumns` with computed priceFit/qtyFit**

```typescript
const matchColumns: ColDef<GridRow>[] = [
  { field: 'score', pinned: 'left', type: 'numericColumn', width: 75 },
  { field: 'customer', width: 160 },
  { field: 'needProduct', headerName: 'Request', minWidth: 170 },
  { field: 'vendor', width: 160 },
  { field: 'vendorProduct', headerName: 'Stock', minWidth: 170 },
  {
    headerName: 'Price fit',
    width: 150,
    valueGetter: (params) => {
      const ask = Number(params.data?.askingPrice ?? 0);
      const target = Number(params.data?.targetPrice ?? 0);
      if (!ask || !target) return '';
      const fit = ask <= target;
      return `$${ask} ask / $${target} target ${fit ? '✓' : '✗'}`;
    },
  },
  {
    headerName: 'Qty fit',
    width: 140,
    valueGetter: (params) => {
      const avail = Number(params.data?.availableQty ?? 0);
      const need = Number(params.data?.qtyMin ?? 0);
      if (!avail || !need) return '';
      const fit = avail >= need;
      return `${avail} avail / ${need} need ${fit ? '✓' : '✗'}`;
    },
  },
  { field: 'status', width: 115 },
];
```

- [ ] **Step 4: Apply match quality floor dimming**

Wrap the match grid's `rows` prop to pass `matchQualityFloor` into row class rules. In the `OperatorGrid` for matches, add a `getRowClass` prop (check if `OperatorGrid` supports it; if not, pass via `gridOptions`):

```typescript
// In MatchmakingView, near matchColumns:
const matchRowClassRules = useMemo(() => ({
  'opacity-40': (params: { data?: GridRow }) => {
    const score = Number(params.data?.score ?? 0);
    return score < s.matchQualityFloor && score >= 35;
  },
}), [s.matchQualityFloor]);
```

Pass to the matches `OperatorGrid`:
```tsx
rowClassRules={matchRowClassRules}
```

Also add a `"Low confidence"` chip to the `score` column for rows below the hard floor (35). Replace the `score` entry in `matchColumns`:

```typescript
{
  field: 'score',
  pinned: 'left',
  type: 'numericColumn',
  width: 100,
  cellRenderer: (params: { value: number; data?: GridRow }) => {
    const score = Number(params.value ?? 0);
    const isLowConfidence = score < 35;
    return (
      <span className="flex items-center gap-1">
        <span>{score}</span>
        {isLowConfidence && (
          <span className="inline-flex rounded-full bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-500">
            Low
          </span>
        )}
      </span>
    );
  },
},
```

- [ ] **Step 5: Typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 6: Commit**

```bash
git add src/client/views/MatchmakingView.tsx
git commit -m "feat(matchmaking): trim all grids to ≤8 cols, add priceFit/qtyFit computed columns"
```

---

## Task 8: `noteMatchmakingOutreach` and `dismissMatchmakingWorkQueueItem` commands

**Files:**
- Modify: `src/server/services/commandBus.ts`
- Modify: `src/server/services/matchmakingStatus.test.ts`

(Catalog entries were already added in Task 2.)

- [ ] **Step 1: Write failing tests**

```typescript
describe('noteMatchmakingOutreach', () => {
  it('creates a journal entry for a customer outreach', async () => {
    const { customerId, categorySlug } = await getTestCustomerAndCategory();
    const result = await runCommandDirect('noteMatchmakingOutreach', {
      entityType: 'customer',
      entityId: customerId,
      context: categorySlug,
      leg: 2,
    });
    expect(result.ok).toBe(true);
    expect(result.toast).toMatch(/noted/i);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
pnpm test src/server/services/matchmakingStatus.test.ts
```

- [ ] **Step 3: Add handlers to `commandBus.ts`**

Add after the `updateMatchmakingSettings` handler:

```typescript
export async function noteMatchmakingOutreach(
  tx: Tx,
  payload: Payload,
  _userId: string,
  commandId: string
): Promise<CommandResult> {
  const entityType = String(payload.entityType ?? '');
  const entityId = requiredId(payload.entityId, 'entityId');
  const context = String(payload.context ?? '');
  const leg = Number(payload.leg ?? 0);

  if (!['customer', 'vendor'].includes(entityType)) {
    throw new Error('entityType must be customer or vendor');
  }
  if (![2, 3].includes(leg)) {
    throw new Error('leg must be 2 or 3');
  }
  if (!context) {
    throw new Error('context (category slug or batch id) is required');
  }

  // No DB mutation beyond the command journal entry — the journal itself is the snooze record.
  // Leg 2/3 queries check command_journal for recent noteMatchmakingOutreach entries to exclude snoozed pairs.
  return {
    ok: true,
    commandId,
    affectedIds: [entityId],
    toast: `Outreach noted. This suggestion will be hidden for 30 days.`,
  };
}

export async function dismissMatchmakingWorkQueueItem(
  tx: Tx,
  payload: Payload,
  userId: string,
  commandId: string
): Promise<CommandResult> {
  const itemType = String(payload.itemType ?? '');
  const itemId = String(payload.itemId ?? '');

  if (!['match', 'opportunity'].includes(itemType)) {
    throw new Error('itemType must be match or opportunity');
  }

  if (itemType === 'opportunity' && payload.entityType && payload.entityId && payload.context) {
    // Re-route to noteMatchmakingOutreach logic for opportunity items
    return noteMatchmakingOutreach(tx, {
      entityType: payload.entityType,
      entityId: payload.entityId,
      context: payload.context,
      leg: payload.leg,
    }, userId, commandId);
  }

  // For match items: snooze via a journal entry (same pattern)
  return {
    ok: true,
    commandId,
    affectedIds: itemId ? [itemId] : [],
    toast: 'Removed from work queue for 30 days.',
  };
}
```

- [ ] **Step 4: Run tests**

```bash
pnpm test src/server/services/matchmakingStatus.test.ts
```

Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

```bash
pnpm typecheck
git add src/server/services/commandBus.ts src/server/services/matchmakingStatus.test.ts
git commit -m "feat(matchmaking): noteMatchmakingOutreach + dismissMatchmakingWorkQueueItem commands"
```

---

## Task 9: `queries.matchmakingOpportunities` backend

**Files:**
- Modify: `src/server/routers/queries.ts`

- [ ] **Step 1: Add the query**

Add after `matchmakingSettings` in `queries.ts`:

```typescript
matchmakingOpportunities: protectedProcedure.query(async () => {
  // Fetch current settings for thresholds
  const [settingsRow] = (await pool.query('select * from matchmaking_settings limit 1')).rows;
  const settings = settingsRow ?? { history_lookback_days: 90, repeat_threshold: 3, gap_floor_qty: 0 };
  const lookback = Number(settings.history_lookback_days);
  const repeatThreshold = Number(settings.repeat_threshold);
  const gapFloor = Number(settings.gap_floor_qty);

  // ── Leg 2: Inventory to move ──────────────────────────────────────────────
  // Find (inventory item, customer) pairs where customer has signal (need or history)
  // and no existing accepted match for a need in that category.
  const toMoveResult = await pool.query(
    `with in_stock as (
       select b.id as batch_id,
              b.name as product,
              b.category,
              b.available_qty as on_hand
       from batches b
       where b.status in ('processed', 'available', 'ready')
         and b.available_qty > 0
     ),
     customer_history as (
       select sol.item_id,
              i.category,
              so.customer_id,
              c.name as customer_name,
              count(*) as purchase_count,
              max(so.created_at) as last_activity
       from sales_order_lines sol
       join items i on i.id = sol.item_id
       join sales_orders so on so.id = sol.order_id
       join customers c on c.id = so.customer_id
       where so.created_at > now() - ($1 || ' days')::interval
         and so.status not in ('cancelled', 'void')
       group by sol.item_id, i.category, so.customer_id, c.name
     ),
     posted_needs as (
       select cn.customer_id,
              cu.name as customer_name,
              cn.category,
              cn.id as need_id,
              cn.product_name as need_product,
              cn.target_price
       from customer_needs cn
       join customers cu on cu.id = cn.customer_id
       where cn.status = 'open'
     ),
     already_matched as (
       select cn.customer_id, cn.category
       from matchmaking_matches mm
       join customer_needs cn on cn.id = mm.customer_need_id
       where mm.status = 'accepted'
     )
     select
       s.batch_id as "batchId",
       s.product,
       s.category,
       s.on_hand as "onHand",
       coalesce(pn.customer_id, ch.customer_id) as "customerId",
       coalesce(pn.customer_name, ch.customer_name) as customer,
       case
         when pn.customer_id is not null and ch.purchase_count >= $2 then 'both'
         when pn.customer_id is not null then 'need'
         else 'history'
       end as signal,
       coalesce(ch.last_activity, now()) as "lastActivity",
       coalesce(ch.purchase_count, 0) as "purchaseCount"
     from in_stock s
     left join posted_needs pn on pn.category = s.category
     left join customer_history ch
       on ch.category = s.category
       and (pn.customer_id is null or ch.customer_id = pn.customer_id)
       and ch.purchase_count >= $2
     where (pn.customer_id is not null or ch.customer_id is not null)
       and not exists (
         select 1 from already_matched am
         where am.customer_id = coalesce(pn.customer_id, ch.customer_id)
           and am.category = s.category
       )
     order by
       case when pn.customer_id is not null and ch.purchase_count >= $2 then 0
            when pn.customer_id is not null then 1
            else 2 end,
       ch.last_activity desc nulls last
     limit 25`,
    [lookback, repeatThreshold]
  );

  // ── Leg 3: Gaps to fill ───────────────────────────────────────────────────
  // Find categories with on-hand ≤ gap floor, match to vendors with signal.
  const toSourceResult = await pool.query(
    `with inventory_by_category as (
       select coalesce(b.category, 'Unknown') as category,
              sum(b.available_qty) as on_hand
       from batches b
       where b.status in ('processed', 'available', 'ready')
       group by b.category
     ),
     gaps as (
       select category, on_hand
       from inventory_by_category
       where on_hand <= $1
     ),
     vendor_history as (
       select pol.item_id,
              i.category,
              po.vendor_id,
              v.name as vendor_name,
              count(*) as supply_count,
              max(po.created_at) as last_activity
       from purchase_order_lines pol
       join items i on i.id = pol.item_id
       join purchase_orders po on po.id = pol.po_id
       join vendors v on v.id = po.vendor_id
       where po.created_at > now() - ($2 || ' days')::interval
         and po.status not in ('cancelled', 'void')
       group by pol.item_id, i.category, po.vendor_id, v.name
     ),
     posted_supply as (
       select vs.vendor_id,
              ve.name as vendor_name,
              vs.category,
              vs.available_qty as posted_qty,
              vs.available_date
       from vendor_supply vs
       join vendors ve on ve.id = vs.vendor_id
       where vs.status = 'open'
     ),
     snoozed_vendors as (
       select (input_payload->>'entityId')::uuid as vendor_id,
              input_payload->>'context' as category
       from command_journal
       where command_name = 'noteMatchmakingOutreach'
         and input_payload->>'entityType' = 'vendor'
         and created_at > now() - interval '30 days'
     )
     select
       g.category,
       g.on_hand as "onHand",
       case when g.on_hand = 0 then 'empty' else 'low' end as "gapLevel",
       coalesce(ps.vendor_id, vh.vendor_id) as "vendorId",
       coalesce(ps.vendor_name, vh.vendor_name) as vendor,
       case
         when ps.vendor_id is not null and vh.supply_count >= $3 then 'both'
         when ps.vendor_id is not null then 'supply'
         else 'history'
       end as signal,
       coalesce(vh.last_activity, now()) as "lastActivity",
       ps.posted_qty as "postedQty"
     from gaps g
     left join posted_supply ps on ps.category = g.category
     left join vendor_history vh
       on vh.category = g.category
       and (ps.vendor_id is null or vh.vendor_id = ps.vendor_id)
       and vh.supply_count >= $3
     where (ps.vendor_id is not null or vh.vendor_id is not null)
       and not exists (
         select 1 from snoozed_vendors sv
         where sv.vendor_id = coalesce(ps.vendor_id, vh.vendor_id)
           and sv.category = g.category
       )
     order by
       case when g.on_hand = 0 then 0 else 1 end,
       case when ps.vendor_id is not null and vh.supply_count >= $3 then 0
            when ps.vendor_id is not null then 1
            else 2 end
     limit 25`,
    [gapFloor, lookback, repeatThreshold]
  );

  return {
    toMove: toMoveResult.rows,
    toSource: toSourceResult.rows,
  };
}),
```

- [ ] **Step 2: Verify query runs against the seed DB**

```bash
pnpm db:seed:realistic
```

Then manually invoke via a quick tRPC test or check via `psql`. The query must complete in < 200ms. If it doesn't, add indexes:

```sql
-- If slow on vendor_history join:
create index if not exists po_lines_item_id_idx on purchase_order_lines(item_id);
create index if not exists so_lines_item_id_idx on sales_order_lines(item_id);
```

- [ ] **Step 3: Typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 4: Commit**

```bash
git add src/server/routers/queries.ts
git commit -m "feat(matchmaking): matchmakingOpportunities query — Leg 2 (toMove) + Leg 3 (toSource)"
```

---

## Task 10: Panel 3 — Inventory to Move (Leg 2)

**Files:**
- Modify: `src/client/views/MatchmakingView.tsx`

- [ ] **Step 1: Add opportunities query + column definitions**

At the top of `MatchmakingView`, add:

```typescript
const opportunities = trpc.queries.matchmakingOpportunities.useQuery();

const toMoveColumns: ColDef<GridRow>[] = [
  { field: 'product', minWidth: 180, pinned: 'left' },
  { field: 'category', width: 120 },
  { field: 'onHand', headerName: 'On hand', type: 'numericColumn', width: 110 },
  { field: 'customer', minWidth: 160 },
  {
    field: 'signal',
    headerName: 'Signal',
    width: 130,
    cellRenderer: (params: { value: string }) => {
      const label = params.value === 'both' ? 'Both' : params.value === 'need' ? 'Posted need' : 'History';
      const cls = params.value === 'both'
        ? 'bg-emerald-100 text-emerald-800'
        : params.value === 'need'
        ? 'bg-blue-100 text-blue-800'
        : 'bg-zinc-100 text-zinc-600';
      return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>{label}</span>;
    },
  },
  {
    field: 'lastActivity',
    headerName: 'Last activity',
    width: 140,
    valueFormatter: (params) => params.value ? new Date(params.value as string).toLocaleDateString() : '—',
  },
  {
    headerName: 'Action',
    width: 130,
    cellRenderer: (params: { data?: GridRow }) => (
      <button
        className="secondary-button compact-action"
        disabled={isRunning || !canWrite}
        onClick={() => {
          if (!params.data?.customerId || !params.data?.category) return;
          runCommand('noteMatchmakingOutreach', {
            entityType: 'customer',
            entityId: params.data.customerId,
            context: params.data.category,
            leg: 2,
          }, 'Note customer outreach').then(() => opportunities.refetch());
        }}
        type="button"
      >
        Note contact
      </button>
    ),
  },
];
```

- [ ] **Step 2: Add Panel 3 to JSX**

After the Deterministic Matches `OperatorGrid`, add:

```tsx
<OperatorGrid
  view="matchmaking"
  title="Inventory to Move"
  subtitle={`Based on purchase history (last ${s.historyLookbackDays} days)`}
  rows={(opportunities.data?.toMove ?? []) as GridRow[]}
  columns={toMoveColumns}
  loading={opportunities.isLoading}
  emptyTitle="No opportunities yet"
  emptyChildren="Inventory opportunities appear once customers have purchase history or posted needs."
/>
```

- [ ] **Step 3: Typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 4: Commit**

```bash
git add src/client/views/MatchmakingView.tsx
git commit -m "feat(matchmaking): Panel 3 — Inventory to Move (Leg 2)"
```

---

## Task 11: Panel 4 — Gaps to Fill (Leg 3)

**Files:**
- Modify: `src/client/views/MatchmakingView.tsx`

- [ ] **Step 1: Add column definitions**

```typescript
const toSourceColumns: ColDef<GridRow>[] = [
  { field: 'category', minWidth: 150, pinned: 'left' },
  { field: 'onHand', headerName: 'On hand', type: 'numericColumn', width: 110 },
  {
    field: 'gapLevel',
    headerName: 'Gap',
    width: 100,
    cellRenderer: (params: { value: string }) => {
      const isEmpty = params.value === 'empty';
      return (
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
          isEmpty ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'
        }`}>
          {isEmpty ? 'Empty' : 'Low'}
        </span>
      );
    },
  },
  { field: 'vendor', minWidth: 160 },
  {
    field: 'signal',
    headerName: 'Signal',
    width: 130,
    cellRenderer: (params: { value: string }) => {
      const label = params.value === 'both' ? 'Both' : params.value === 'supply' ? 'Posted supply' : 'History';
      const cls = params.value === 'both'
        ? 'bg-emerald-100 text-emerald-800'
        : params.value === 'supply'
        ? 'bg-blue-100 text-blue-800'
        : 'bg-zinc-100 text-zinc-600';
      return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>{label}</span>;
    },
  },
  {
    field: 'lastActivity',
    headerName: 'Last activity',
    width: 140,
    valueFormatter: (params) => params.value ? new Date(params.value as string).toLocaleDateString() : '—',
  },
  { field: 'postedQty', headerName: 'Posted qty', type: 'numericColumn', width: 110 },
  {
    headerName: 'Action',
    width: 130,
    cellRenderer: (params: { data?: GridRow }) => (
      <button
        className="secondary-button compact-action"
        disabled={isRunning || !canWrite}
        onClick={() => {
          if (!params.data?.vendorId || !params.data?.category) return;
          runCommand('noteMatchmakingOutreach', {
            entityType: 'vendor',
            entityId: params.data.vendorId,
            context: params.data.category,
            leg: 3,
          }, 'Note vendor outreach').then(() => opportunities.refetch());
        }}
        type="button"
      >
        Note contact
      </button>
    ),
  },
];
```

- [ ] **Step 2: Add Panel 4 to JSX**

After Panel 3, add:

```tsx
<OperatorGrid
  view="matchmaking"
  title="Gaps to Fill"
  subtitle={`Based on purchase history (last ${s.historyLookbackDays} days)`}
  rows={(opportunities.data?.toSource ?? []) as GridRow[]}
  columns={toSourceColumns}
  loading={opportunities.isLoading}
  emptyTitle="No gaps detected"
  emptyChildren="Sourcing suggestions appear when inventory in a category drops to or below the gap threshold."
/>
```

- [ ] **Step 3: Typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 4: Commit**

```bash
git add src/client/views/MatchmakingView.tsx
git commit -m "feat(matchmaking): Panel 4 — Gaps to Fill (Leg 3)"
```

---

## Task 12: URL parameter support (`?customer=` / `?vendor=`)

**Files:**
- Modify: `src/client/views/MatchmakingView.tsx`

- [ ] **Step 1: Add URL param reading**

At the top of `MatchmakingView`, add:

```typescript
import { useSearchParams } from 'react-router-dom';

// Inside the component:
const [searchParams, setSearchParams] = useSearchParams();
const filterCustomerId = searchParams.get('customer') ?? '';
const filterVendorId = searchParams.get('vendor') ?? '';
const hasFilter = Boolean(filterCustomerId || filterVendorId);

function clearFilter() {
  setSearchParams({});
}
```

- [ ] **Step 2: Apply filter to Open Signals grids (Panel 1)**

For the Open Needs grid, filter rows client-side:

```typescript
const filteredNeeds = useMemo(() => {
  const rows = (board.data?.needs ?? []) as GridRow[];
  if (!filterCustomerId) return rows;
  return rows.filter((r) => r.customerId === filterCustomerId || r.customer_id === filterCustomerId);
}, [board.data?.needs, filterCustomerId]);

const filteredSupplies = useMemo(() => {
  const rows = (board.data?.supplies ?? []) as GridRow[];
  if (!filterVendorId) return rows;
  return rows.filter((r) => r.vendorId === filterVendorId || r.vendor_id === filterVendorId);
}, [board.data?.supplies, filterVendorId]);

const filteredMatches = useMemo(() => {
  const rows = (board.data?.matches ?? []) as GridRow[];
  if (!filterCustomerId && !filterVendorId) return rows;
  return rows.filter((r) => {
    if (filterCustomerId && r.customerId !== filterCustomerId) return false;
    if (filterVendorId && r.vendorId !== filterVendorId) return false;
    return true;
  });
}, [board.data?.matches, filterCustomerId, filterVendorId]);
```

- [ ] **Step 3: Add filter chip UI**

After the `WorkspacePanel` settings panel but before Panel 1, add:

```tsx
{hasFilter && (
  <div className="flex items-center gap-2 px-1 py-1">
    <span className="text-sm text-zinc-500">
      Filtered to:{' '}
      {filterCustomerId && reference.data?.customers.find((c) => c.id === filterCustomerId)?.name}
      {filterVendorId && reference.data?.vendors.find((v) => v.id === filterVendorId)?.name}
    </span>
    <button className="text-xs text-zinc-400 hover:text-zinc-700 underline" onClick={clearFilter} type="button">
      Clear filter
    </button>
  </div>
)}
```

- [ ] **Step 4: Pass filtered rows to grids**

Replace `board.data?.needs` with `filteredNeeds`, `board.data?.supplies` with `filteredSupplies`, and `board.data?.matches` with `filteredMatches` in the respective `OperatorGrid` `rows` props.

- [ ] **Step 5: Typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 6: Commit**

```bash
git add src/client/views/MatchmakingView.tsx
git commit -m "feat(matchmaking): URL param filter support (?customer= / ?vendor=) + filter chip"
```

---

## Task 13: `matchmakingEntityCounts` query + ambient columns

**Files:**
- Modify: `src/server/routers/queries.ts`
- Modify: `src/client/views/OperationsViews.tsx`

- [ ] **Step 1: Add `matchmakingEntityCounts` query to `queries.ts`**

```typescript
matchmakingEntityCounts: protectedProcedure.query(async () => {
  // Only run if at least one column toggle is enabled
  const [settings] = (await pool.query(
    'select show_clients_column as "showClientsColumn", show_vendors_column as "showVendorsColumn" from matchmaking_settings limit 1'
  )).rows;

  if (!settings?.showClientsColumn && !settings?.showVendorsColumn) {
    return { customers: {}, vendors: {} };
  }

  const [customerCounts, vendorCounts] = await Promise.all([
    settings.showClientsColumn
      ? pool.query(`
          select cn.customer_id as id,
                 count(distinct cn.id) filter (where cn.status = 'open') as needs,
                 count(distinct mm.id) filter (where mm.status = 'accepted') as matches
          from customer_needs cn
          left join matchmaking_matches mm on mm.customer_need_id = cn.id
          group by cn.customer_id
        `)
      : Promise.resolve({ rows: [] }),
    settings.showVendorsColumn
      ? pool.query(`
          select vendor_id as id,
                 count(*) filter (where status = 'open') as supply
          from vendor_supply
          group by vendor_id
        `)
      : Promise.resolve({ rows: [] }),
  ]);

  const customers: Record<string, { needs: number; matches: number }> = {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const row of customerCounts.rows as any[]) {
    customers[row.id] = { needs: Number(row.needs), matches: Number(row.matches) };
  }

  const vendors: Record<string, { supply: number }> = {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const row of vendorCounts.rows as any[]) {
    vendors[row.id] = { supply: Number(row.supply) };
  }

  return { customers, vendors };
}),
```

- [ ] **Step 2: Add matchmaking column to clients in `OperationsViews.tsx`**

Find the `clients:` array in the `gridSchema` object (around line 144). Add a new column at the end. This column uses a `cellRenderer` that reads from the entity counts query, so it needs to be dynamic, not static. 

The pattern is: the component that renders the clients grid should conditionally add this column based on the settings query. Find the component in `OperationsViews.tsx` that renders the clients `OperatorGrid`. Add above it:

```typescript
const matchSettings = trpc.queries.matchmakingSettings.useQuery();
const matchCounts = trpc.queries.matchmakingEntityCounts.useQuery(undefined, {
  enabled: matchSettings.data?.showClientsColumn ?? false,
});
```

Then in the clients columns array (passed to the grid), conditionally add:

```typescript
const clientColumns = useMemo(() => {
  const base: ColDef<GridRow>[] = [
    { field: 'name', pinned: 'left', width: 190 },
    { field: 'creditLimit', type: 'numericColumn', width: 140 },
    { field: 'balance', type: 'numericColumn', width: 130 },
    { field: 'tags', minWidth: 180 },
    { field: 'notes', minWidth: 260 },
    { field: 'invoiceCount', width: 120 },
  ];
  if (!matchSettings.data?.showClientsColumn) return base;
  return [
    ...base,
    {
      headerName: 'Matchmaking',
      width: 160,
      cellRenderer: (params: { data?: GridRow }) => {
        const counts = matchCounts.data?.customers[params.data?.id ?? ''];
        if (!counts) return <span className="text-xs text-zinc-400">No activity</span>;
        return (
          <a
            href={`/matchmaking?customer=${params.data?.id}`}
            className="text-xs text-blue-600 hover:underline"
            onClick={(e) => { e.preventDefault(); navigate(`/matchmaking?customer=${params.data?.id}`); }}
          >
            {counts.needs} needs · {counts.matches} matches
          </a>
        );
      },
    },
  ];
}, [matchSettings.data?.showClientsColumn, matchCounts.data]);
```

Pass `clientColumns` (computed) instead of the static `gridSchema.clients` to the clients `OperatorGrid`.

Use `const navigate = useNavigate();` (import from `react-router-dom`) for the link navigation.

- [ ] **Step 3: Add matchmaking column to vendors similarly**

Apply the same pattern to the vendors grid section. The vendor counts entry is `matchCounts.data?.vendors[id]?.supply`.

```typescript
const vendorMatchColumns = useMemo(() => {
  const base: ColDef<GridRow>[] = [
    { field: 'vendor', pinned: 'left', width: 190 },
    { field: 'billNo', width: 150 },
    { field: 'amount', type: 'numericColumn', width: 120 },
    { field: 'amountPaid', type: 'numericColumn', width: 130 },
    { field: 'status', width: 125 },
    { field: 'dueDate', width: 180 },
    { field: 'scheduledFor', width: 180 },
    { field: 'dueReason', minWidth: 240 },
    { field: 'consignmentTriggered', width: 170 },
  ];
  if (!matchSettings.data?.showVendorsColumn) return base;
  return [
    ...base,
    {
      headerName: 'Matchmaking',
      width: 140,
      cellRenderer: (params: { data?: GridRow }) => {
        const counts = matchCounts.data?.vendors[params.data?.id ?? ''];
        if (!counts) return <span className="text-xs text-zinc-400">No activity</span>;
        return (
          <a
            href={`/matchmaking?vendor=${params.data?.id}`}
            className="text-xs text-blue-600 hover:underline"
            onClick={(e) => { e.preventDefault(); navigate(`/matchmaking?vendor=${params.data?.id}`); }}
          >
            {counts.supply} stock listed
          </a>
        );
      },
    },
  ];
}, [matchSettings.data?.showVendorsColumn, matchCounts.data]);
```

- [ ] **Step 4: Typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 5: Commit**

```bash
git add src/server/routers/queries.ts src/client/views/OperationsViews.tsx
git commit -m "feat(matchmaking): matchmakingEntityCounts query + ambient Clients/Vendors columns"
```

---

## Task 14: Work queue integration

**Files:**
- Modify: `src/server/routers/queries.ts`

- [ ] **Step 1: Add matchmaking branches to `workQueue` query**

Find the `workQueue` query (around line 237 in `queries.ts`). It returns a SQL UNION. Add two new branches at the end, guarded by the `workQueueEnabled` setting.

Replace the `workQueue` query with:

```typescript
workQueue: protectedProcedure.query(async () => {
  const [settings] = (await pool.query(
    'select work_queue_threshold as "workQueueThreshold", work_queue_enabled as "workQueueEnabled", gap_floor_qty as "gapFloorQty", history_lookback_days as "historyLookbackDays", repeat_threshold as "repeatThreshold" from matchmaking_settings limit 1'
  )).rows;
  const wqEnabled = settings?.workQueueEnabled ?? true;
  const wqThreshold = Number(settings?.workQueueThreshold ?? 75);
  const gapFloor = Number(settings?.gapFloorQty ?? 0);
  const lookback = Number(settings?.historyLookbackDays ?? 90);
  const repeatThreshold = Number(settings?.repeatThreshold ?? 3);

  // Build the matchmaking UNION branches only when enabled
  const matchmakingUnion = wqEnabled ? `
    union all
    select mm.id, 'matchmaking' as route, 'Matchmaking' as lane,
           concat(c.name, ' ↔ ', v.name) as title,
           mm.status,
           mm.updated_at as "createdAt",
           concat('Score: ', mm.score, ' · ', cn.product_name, ' / ', vs.product_name) as detail
    from matchmaking_matches mm
    join customer_needs cn on cn.id = mm.customer_need_id
    join customers c on c.id = cn.customer_id
    join vendor_supply vs on vs.id = mm.vendor_supply_id
    join vendors v on v.id = vs.vendor_id
    where mm.status = 'open'
      and mm.score >= ${wqThresholdSafe}
      and not exists (
        select 1 from command_journal cj
        where cj.command_name = 'dismissMatchmakingWorkQueueItem'
          and cj.input_payload->>'itemId' = mm.id::text
          and cj.created_at > now() - interval '30 days'
      )
    union all
    select gen_random_uuid() as id, 'matchmaking' as route, 'Matchmaking' as lane,
           concat('Source ', g.category, ' from ', v.name) as title,
           'open' as status,
           now() as "createdAt",
           concat('On hand: ', g.on_hand, ' units · ', case when vs.id is not null then 'Posted supply' else 'History' end) as detail
    from (
      select coalesce(b.category, 'Unknown') as category, sum(b.available_qty) as on_hand
      from batches b where b.status in ('processed', 'available', 'ready')
      group by b.category having sum(b.available_qty) = 0
    ) g
    left join vendor_supply vs on vs.category = g.category and vs.status = 'open'
    left join vendors v on v.id = vs.vendor_id
    where v.id is not null
      and not exists (
        select 1 from command_journal cj
        where cj.command_name = 'noteMatchmakingOutreach'
          and cj.input_payload->>'entityType' = 'vendor'
          and cj.input_payload->>'context' = g.category
          and cj.created_at > now() - interval '30 days'
      )
    limit 10
  ` : '';

  return (
    await pool.query(`
      select b.id, 'intake' as route, 'Intake' as lane, b.name as title, b.status, b.created_at as "createdAt",
             concat(coalesce(v.name, 'No vendor'), ' / ', b.intake_qty, ' ', b.uom) as detail
      from batches b left join vendors v on v.id = b.vendor_id
      where b.status in ('ready','needs_fix')
      union all
      select po.id, 'purchaseOrders' as route, 'Purchase' as lane, po.po_no as title, po.status, po.created_at as "createdAt",
             concat(coalesce(v.name, 'No vendor'), ' / ', po.total) as detail
      from purchase_orders po left join vendors v on v.id = po.vendor_id
      where po.status in ('draft','approved','ordered','partially_received')
      union all
      select so.id, 'orders' as route, 'Sales' as lane, so.order_no as title, so.status, so.created_at as "createdAt",
             coalesce(c.name, 'No customer') as detail
      from sales_orders so left join customers c on c.id = so.customer_id
      where so.status in ('draft','confirmed','partial')
      union all
      select i.id, 'payments' as route, 'Payments' as lane, i.invoice_no as title, i.status, i.created_at as "createdAt",
             concat(coalesce(c.name,'No customer'),' / ',i.amount_due) as detail
      from invoices i left join customers c on c.id = i.customer_id
      where i.status in ('draft','sent','overdue','partial')
      union all
      select vb.id, 'vendors' as route, 'Vendor' as lane, vb.bill_no as title, vb.status, vb.created_at as "createdAt",
             concat(coalesce(v.name,'No vendor'),' / ',vb.amount) as detail
      from vendor_bills vb left join vendors v on v.id = vb.vendor_id
      where vb.status in ('draft','approved','partial','overdue')
      union all
      select cr.id, 'connectors' as route, 'Connector' as lane, cr.source as title, cr.status, cr.created_at as "createdAt",
             cr.source as detail
      from connector_requests cr
      where cr.status in ('pending','error')
      union all
      select pl.id, 'fulfillment' as route, 'Fulfillment' as lane, pl.pick_no as title, pl.status, pl.created_at as "createdAt",
             concat(coalesce(c.name,'No customer'),' / ',pl.line_count,' lines') as detail
      from pick_lists pl left join sales_orders so on so.id = pl.order_id left join customers c on c.id = so.customer_id
      where pl.status in ('open','partial')
      ${matchmakingUnion}
      order by "createdAt" desc
      limit 100
    `)
  ).rows;
}),
```

- [ ] **Step 2: Typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 3: Verify work queue renders matchmaking items in the dashboard**

Start the dev server and open the dashboard. With `workQueueEnabled = true` and at least one match scoring ≥ 75 (or zero on-hand category in the seed), matchmaking items should appear in the work queue with lane badge "Matchmaking".

```bash
pnpm dev
```

- [ ] **Step 4: Commit**

```bash
git add src/server/routers/queries.ts
git commit -m "feat(matchmaking): work queue matchmaking lane — high-score matches + empty-gap vendors"
```

---

## Final checks

- [ ] **Full typecheck**

```bash
pnpm typecheck
```

Expected: zero errors.

- [ ] **Run full test suite**

```bash
pnpm test
```

Expected: all existing tests pass + new matchmaking tests pass.

- [ ] **Parity audit**

```bash
pnpm audit:parity
```

Expected: no new failures introduced.

- [ ] **Final commit summary**

```bash
git log --oneline -15
```

Confirm all 14 feature commits are present and correctly scoped.

