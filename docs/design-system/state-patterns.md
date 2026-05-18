# State Management Patterns

> Three kinds of state, three tools. **Server state goes through tRPC** (not raw TanStack Query). **Mutations go through `useCommandRunner`** (not raw `useMutation`). **UI state goes in `useUiStore`** (one Zustand store, persist+immer). **Form-local state stays in `useState`**.

## The contracts

| State category | Tool | Source of truth |
|---|---|---|
| Server data (reads) | `trpc.<router>.<endpoint>.useQuery` | Server |
| Server data (writes) | `useCommandRunner.runCommand(name, payload, reason)` | Server (via command journal) |
| UI state shared across components (active view, drawers, palette, selections, toasts) | `useUiStore` | Client (persisted to localStorage) |
| Form drafts, local toggles, refs | `useState`, `useRef` | Component-local |

**Never duplicate server state into `useUiStore` or `useState`.** Re-render off the query. If you must derive, use `useMemo` against `query.data`.

---

## Server state (reads): tRPC

The tRPC client (`src/client/api/trpc.ts`) wraps TanStack Query v4. Every read uses a `.useQuery()`:

```tsx
const me = trpc.auth.me.useQuery();
const reference = trpc.queries.reference.useQuery();
const orders = trpc.queries.grid.useQuery({ view: 'sales' });
const facets = trpc.filters.getFacets.useQuery();
```

### Conditional / deferred fetching

A sentinel UUID + `enabled` is the standard idiom for "don't fetch until I have an ID":

```tsx
const blankId = '00000000-0000-0000-0000-000000000000';
const workspace = trpc.queries.customerWorkspace.useQuery(
  { customerId: customerId || blankId },
  { enabled: Boolean(customerId) }
);
```

You can also pass `enabled: false` and call `.refetch()` imperatively, but it's rare in this codebase.

### Common queries

| Endpoint | Returns | Used in |
|---|---|---|
| `trpc.auth.me.useQuery()` | Current user (or null) — read `.role` for canWrite gating | Everywhere |
| `trpc.queries.grid.useQuery({ view })` | Rows for an `OperatorGrid` (sales / inventory / vendors / payments / clients) | View components, `ReportsRouteShell` |
| `trpc.queries.reference.useQuery()` | Reference data (customers, vendors, products) | Forms, matchmaking, ledger |
| `trpc.queries.customerWorkspace.useQuery({ customerId })` | Per-customer workspace data | `SalesView`, `ContextDrawer` |
| `trpc.queries.relatedCommands.useQuery({ entityId })` | Command journal for a row | `RowCommandHistoryDrawer` |
| `trpc.queries.matchmakingBoard.useQuery()` | Matchmaking board state | `MatchmakingView` |
| `trpc.filters.getFacets.useQuery()` | Filter facet definitions | `AdvancedFilterBuilder` |
| `trpc.queries.paymentAllocationPreview.useQuery(...)` | Allocation preview | `QuickLedgerGrid` |
| `trpc.queries.transactionLedger.useQuery()` | Ledger rows | `QuickLedgerGrid` |
| `trpc.queries.inventoryMovements.useQuery({ batchId })` | Movement history for a batch | `RowCommandHistoryDrawer` |

### Query keys

Don't manage keys directly. tRPC + TanStack handle them. When you need to invalidate, use `queryClient.invalidateQueries()` or `trpc.useUtils()` — but `useCommandRunner` already does this for you on mutations.

---

## Server state (writes): `useCommandRunner`

Every state-changing operation goes through:

```ts
// src/client/components/useCommandRunner.ts
export function useCommandRunner() {
  const queryClient = useQueryClient();
  const pushToast = useUiStore((state) => state.pushToast);
  const mutation = trpc.commands.run.useMutation({
    onSuccess: async (result) => {
      pushToast(result.toast ?? (result.ok ? 'Command completed.' : 'Command failed.'),
                result.ok ? 'success' : 'error');
      await queryClient.invalidateQueries();
    },
    onError: (error) => pushToast(error.message, 'error')
  });

  return {
    runCommand: (name: CommandName, payload: Record<string, unknown> = {}, reason?: string) =>
      mutation.mutateAsync({
        name,
        payload,
        reason,
        idempotencyKey: `${name}-${crypto.randomUUID()}`
      }),
    isRunning: mutation.isLoading
  };
}
```

What it gives you:
- **Single mutation endpoint** (`trpc.commands.run`) dispatches to the named server-side handler.
- **Idempotency key** stamped automatically per call.
- **Toast on success/error** via `useUiStore.pushToast`.
- **`queryClient.invalidateQueries()` with no args** — every cached query refetches. Wide blast radius; intentional.
- **`isRunning`** to disable submit buttons.

Usage:

```tsx
const { runCommand, isRunning } = useCommandRunner();

await runCommand('flagBatch', { batchId, reason }, 'Flag intake lot from grid');
await runCommand('postSalesOrder', { orderId }, 'Post sales order from grid');
await runCommand('logPayment', { customerId, amount, allocationIntent: 'fifo' }, 'Log payment from quick ledger');
```

Signature: `runCommand(name, payload, reason?)` returns `Promise<{ ok: boolean; toast?: string; ...handlerSpecific }>`.

`name` is typed as `CommandName` (`src/shared/commandCatalog.ts` — 83 names). TypeScript will catch typos.

### Optimistic updates

`useCommandRunner` doesn't do optimistic updates by default. If you need one, use `trpc.useUtils()` directly inside your component:

```tsx
const utils = trpc.useUtils();
await utils.queries.grid.cancel({ view: 'sales' });
const snapshot = utils.queries.grid.getData({ view: 'sales' });
utils.queries.grid.setData({ view: 'sales' }, (old) => /* …optimistic mutation… */);
try {
  await runCommand(...);
} catch (err) {
  utils.queries.grid.setData({ view: 'sales' }, snapshot);
  throw err;
}
```

This is rare in the codebase — most operations are fast enough that the toast + refetch suffice.

### The few exceptions to "always use `useCommandRunner`"

Direct `trpc.X.useMutation` calls are reserved for auth and a handful of bookkeeping operations:

```tsx
// LoginView.tsx
const login = trpc.auth.login.useMutation({
  onSuccess: () => utils.auth.me.invalidate()
});
```

If you're about to use raw `useMutation` for anything that mutates business data, stop and check `src/shared/commandCatalog.ts` first.

---

## UI state: `useUiStore`

A single Zustand store at `src/client/store/uiStore.ts`. Uses `persist` + `immer` middleware.

### What it manages

- View state: `activeView`, `activeCustomerId`, `activeQuickLaunch`, `activeSettingsTab`.
- Grid state: `selectedRows` per view, `gridFilters` per view.
- Drawer state: `drawerByView` (5 states), `activeDrawerEntityByView`.
- Palette state: `commandPaletteOpen`, `commandPaletteAdvancedOpen`.
- Layout state: `sideNavCollapsed`, `collapsedPanels`, `focusedPanelId`, `focusMode`.
- Route history: `routeHistory` (for in-app back navigation — distinct from browser history).
- Toasts: `toasts[]` (rendered by `ToastCenter`).
- A11y: `announcement` (used as a live region).

What it **doesn't** manage: any data from the server. Server data is in TanStack Query cache.

### Access pattern (selector-per-field)

```tsx
// Read
const activeView = useUiStore((state) => state.activeView);
const collapsed = useUiStore((state) => Boolean(state.collapsedPanels[panelId]));

// Write
const setActiveView = useUiStore((state) => state.setActiveView);
const pushToast = useUiStore((state) => state.pushToast);
```

One selector per field keeps re-renders narrow. Don't destructure the whole store:

```tsx
// Bad — re-renders on any store change
const { activeView, sideNavCollapsed, drawerByView } = useUiStore();
```

### Persistence

The store persists a subset to `localStorage` under the key `terp-agro-ui`:
- `activeView`, `sideNavCollapsed`, `collapsedPanels`
- `activeQuickLaunch`, `activeSettingsTab`
- `drawerByView`, `activeDrawerEntityByView`
- `gridFilters`

Non-persisted: `toasts`, `routeHistory`, `selectedRows`, `commandPaletteOpen`, focus state, announcement. These reset on reload.

**Audit issue #15** flagged localStorage data-exfil risk (frontend data exfil + role-blind CSV export). Don't put sensitive server data into the store's persisted slice.

### Adding a field

1. Extend `UiState` in `src/client/store/uiStore.ts`.
2. Set an initial value in the `create<UiState>()(...)` argument.
3. Add the setter action. Use Immer drafts (`set((state) => { state.x = y; })`).
4. If it should survive reload, add it to `partialize` at the bottom.

Don't create new Zustand stores. There's exactly one (`useUiStore`) and that's intentional. If you need cross-cutting state, extend this store.

---

## Local state: `useState` / `useRef`

For component-local state — form drafts, modal open flags, refs to AG Grid API:

```tsx
const [quickFilter, setQuickFilter] = useState(storedGridFilter);
const [historyRow, setHistoryRow] = useState<GridRow | null>(null);
const apiRef = useRef<GridApi<GridRow> | null>(null);
```

Don't reach for Zustand or TanStack cache for state that only one component needs.

---

## RBAC gating

Standard idioms, derived from `trpc.auth.me.useQuery()`:

```tsx
const me = trpc.auth.me.useQuery();
const canWrite = me.data?.role !== 'viewer';
const canReverse = me.data?.role === 'manager' || me.data?.role === 'owner';

// Use in JSX
{canWrite ? <button className="primary-button compact-action">Post</button> : null}
```

UI gating is convenience; server-side RBAC in command handlers is the real boundary.

---

## Real reference

- **Server state + UI state composed:** `OperatorGrid.tsx` (line ~40 onwards).
- **Form-local + server-mutation:** `RefereeRelationshipDialog.tsx`.
- **Complex Zustand store:** `uiStore.ts` (350 lines).
- **Mutation wrapper:** `useCommandRunner.ts` (27 lines — short, read it).
- **`@tanstack/react-query` direct usage:** rare; `App.tsx` uses `useQueryClient()` for one-off invalidation.

## Don'ts

❌ **Don't call `trpc.<router>.<endpoint>.useMutation` directly** for state-changing operations. Use `useCommandRunner`. The journal/idempotency/toast layer depends on it.

❌ **Don't mirror server data into `useUiStore` or `useState`.** Cache and derive instead.

❌ **Don't create a second Zustand store.** Extend `useUiStore`.

❌ **Don't destructure the whole store** — use field-level selectors.

❌ **Don't bypass `canWrite` gating in the UI.** Even though server enforces RBAC, exposing disabled-state actions to viewers is confusing.

❌ **Don't add sensitive server data to the persisted slice** of `useUiStore` (audit #15).

✅ **Do trust `useCommandRunner`'s invalidate-all on success** for the common case. Only reach for optimistic updates when you've measured a UX problem.

✅ **Do read `useCommandRunner.ts` once** before writing your first mutation — it's 27 lines and explains the contract better than this doc.
