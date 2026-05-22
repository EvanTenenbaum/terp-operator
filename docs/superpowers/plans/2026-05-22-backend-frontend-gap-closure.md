# Backend-Frontend Gap Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire every confirmed orphaned backend tRPC procedure to a frontend surface, document blocked gaps, and close the backend-frontend parity audit opened 2026-05-22.

**Architecture:** Three independent workstreams — (A) saved filter CRUD management UI on `InventoryFinderPanel`, (B) credit ops dashboard panels in `CreditReviewView`, (C) housekeeping comments for infrastructure-blocked gaps. Deferred items (`applyBatchFilters` architecture decision, `releaseEligibility` CAP-030 dependency) are documented but not implemented here.

**Tech Stack:** React 18, tRPC v10, Tailwind + semantic CSS classes (TERP design system), Vitest + Testing Library, Lucide icons.

**Registry IDs assigned by this plan:** CAP-031 (saved filter management), CAP-032 (credit engine ops surfaces).

---

## Pre-work: Registry + Linear

### Task 0: Add CAP-031 and CAP-032 to capability registry, create Linear issues

**Files:**
- Modify: `docs/product/capability-registry.md` (add two rows to "Product Kernel Capabilities" table)

- [x] **Step 0.1: Add CAP-031 and CAP-032 rows to capability registry**

Open `docs/product/capability-registry.md`. Find the last row in the "Product Kernel Capabilities" table (currently CAP-030). Add after it:

```
| CAP-031 Saved filter management | Backend-frontend gap audit 2026-05-22 | Sell, Receive, Decide | control | Keep | none | `filters.updateFilter` and `filters.deleteFilter` exist on server; no edit/delete UI in `SavedFiltersDropdown`. Users can save and load filters but cannot rename or delete them. Linear: TER-1561. | Implement `SavedFiltersManager` component with inline rename (updateFilter) and inline confirm-delete (deleteFilter). Wire into `InventoryFinderPanel`. |
| CAP-032 Credit engine ops surfaces | Backend-frontend gap audit 2026-05-22 | Decide, Support | context, control | Keep | none | `credit.divergenceReport` (owner-only) and `credit.creditRecomputeQueueHealth` (manager+) exist on server with no frontend surface. Linear: TER-1562. | Implement `CreditDivergencePanel` and `CreditQueueHealthWidget`, wire both into `CreditReviewView` with role gates. |
```

- [x] **Step 0.2: Linear issue for CAP-031 — TER-1561**

Linear issue created: TER-1561 "CAP-031: Saved filter management UI (rename/delete)"

- [x] **Step 0.3: Linear issue for CAP-032 — TER-1562**

Linear issue created: TER-1562 "CAP-032: Credit engine ops surfaces (divergence report + queue health)"

- [x] **Step 0.4: Add BE-011 and BE-012 rows to Backend Gaps table**

In the same file, find the "Backend Gaps Carried Forward" table. After BE-010, add:

```
| BE-011 WebSocket transport for subscriptions | Backend-frontend gap audit 2026-05-22 | Infrastructure | infrastructure | Defer | Add `wsLink`/`httpSubscriptionLink` split to `src/client/api/trpc.ts` when real-time push is needed. Required before `subscriptions.heartbeat` can be consumed from the frontend. |
| BE-012 Server-side batch filter path | Backend-frontend gap audit 2026-05-22 | Receive, Decide | projection | Defer | `filters.applyBatchFilters` is fully implemented on the server (cursor pagination, rate limiting, role-scoped columns). Current `InventoryFinderPanel` filters client-side from `queries.reference` data. Connecting this path requires: (1) removing the `queries.reference` pre-fetch from the panel, (2) making filter state reactive and server-routed, (3) adding loading/pagination UI. Implement when inventory size makes client-side filtering impractical (>500 active batches). |
```

- [x] **Step 0.5: Create a feature branch**

```bash
git stash push -m "cap-030-wip before gap-closure branch"
git checkout main
git checkout -b feat/cap-031-032-gap-closure
```

Expected: branch created from clean main.

---

## Workstream A: Saved Filter Management UI

**Addresses gaps:** `filters.getFilter` (available for future), `filters.updateFilter` (rename), `filters.deleteFilter` (delete).

### Task 1: Create `SavedFiltersManager` component

**Files:**
- Create: `src/client/components/SavedFiltersManager.tsx`
- Create: `src/client/components/SavedFiltersManager.test.tsx`

- [ ] **Step 1.1: Write the failing test**

Create `src/client/components/SavedFiltersManager.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const updateFilterMutate = vi.fn();
const deleteFilterMutate = vi.fn();

vi.mock('../api/trpc', () => ({
  trpc: {
    filters: {
      updateFilter: {
        useMutation: ({ onSuccess }: { onSuccess?: () => void }) => ({
          mutate: (input: unknown) => { updateFilterMutate(input); onSuccess?.(); },
          isPending: false,
        }),
      },
      deleteFilter: {
        useMutation: ({ onSuccess }: { onSuccess?: () => void }) => ({
          mutate: (input: unknown) => { deleteFilterMutate(input); onSuccess?.(); },
          isPending: false,
        }),
      },
    },
  },
}));

import { SavedFiltersManager } from './SavedFiltersManager';
import type { SavedFilterOutput } from '../../shared/filterSchemas';

function makeFilter(overrides: Partial<SavedFilterOutput> = {}): SavedFilterOutput {
  return {
    id: 'filter-1',
    userId: 'user-1',
    name: 'My Filter',
    description: undefined,
    targetView: 'inventory',
    filterDefinition: { op: 'and', conditions: [] },
    schemaVersion: 1,
    isGlobal: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'user-1',
    updatedBy: 'user-1',
    ...overrides,
  };
}

describe('SavedFiltersManager', () => {
  beforeEach(() => {
    updateFilterMutate.mockClear();
    deleteFilterMutate.mockClear();
  });

  it('shows empty message when no filters', () => {
    render(
      <SavedFiltersManager
        savedFilters={[]}
        currentUserId="user-1"
        canManageGlobal={false}
        onFiltersChanged={() => {}}
      />
    );
    expect(screen.getByText('No saved filters yet.')).toBeInTheDocument();
  });

  it('renders filter name with edit and delete buttons for owner', () => {
    render(
      <SavedFiltersManager
        savedFilters={[makeFilter()]}
        currentUserId="user-1"
        canManageGlobal={false}
        onFiltersChanged={() => {}}
      />
    );
    expect(screen.getByText('My Filter')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /rename filter My Filter/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /delete filter My Filter/i })).toBeInTheDocument();
  });

  it('hides edit and delete buttons for other user personal filter', () => {
    render(
      <SavedFiltersManager
        savedFilters={[makeFilter({ userId: 'other-user' })]}
        currentUserId="user-1"
        canManageGlobal={false}
        onFiltersChanged={() => {}}
      />
    );
    expect(screen.queryByRole('button', { name: /rename/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /delete/i })).toBeNull();
  });

  it('shows edit and delete for global filter when canManageGlobal', () => {
    render(
      <SavedFiltersManager
        savedFilters={[makeFilter({ isGlobal: true, userId: 'other-user' })]}
        currentUserId="user-1"
        canManageGlobal={true}
        onFiltersChanged={() => {}}
      />
    );
    expect(screen.getByRole('button', { name: /rename/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument();
  });

  it('enters rename mode on pencil click and calls updateFilter on save', async () => {
    const user = userEvent.setup();
    render(
      <SavedFiltersManager
        savedFilters={[makeFilter()]}
        currentUserId="user-1"
        canManageGlobal={false}
        onFiltersChanged={() => {}}
      />
    );
    await user.click(screen.getByRole('button', { name: /rename filter My Filter/i }));
    const input = screen.getByRole('textbox', { name: /filter name/i });
    expect(input).toBeInTheDocument();
    await user.clear(input);
    await user.type(input, 'New Name');
    await user.click(screen.getByRole('button', { name: /save name/i }));
    expect(updateFilterMutate).toHaveBeenCalledWith({ id: 'filter-1', data: { name: 'New Name' } });
  });

  it('cancels rename on Escape key', async () => {
    const user = userEvent.setup();
    render(
      <SavedFiltersManager
        savedFilters={[makeFilter()]}
        currentUserId="user-1"
        canManageGlobal={false}
        onFiltersChanged={() => {}}
      />
    );
    await user.click(screen.getByRole('button', { name: /rename filter My Filter/i }));
    await user.keyboard('{Escape}');
    expect(screen.getByText('My Filter')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('enters confirm-delete mode on trash click', async () => {
    const user = userEvent.setup();
    render(
      <SavedFiltersManager
        savedFilters={[makeFilter()]}
        currentUserId="user-1"
        canManageGlobal={false}
        onFiltersChanged={() => {}}
      />
    );
    await user.click(screen.getByRole('button', { name: /delete filter My Filter/i }));
    expect(screen.getByRole('button', { name: /confirm delete/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
  });

  it('calls deleteFilter mutation on confirm-delete click', async () => {
    const user = userEvent.setup();
    render(
      <SavedFiltersManager
        savedFilters={[makeFilter()]}
        currentUserId="user-1"
        canManageGlobal={false}
        onFiltersChanged={() => {}}
      />
    );
    await user.click(screen.getByRole('button', { name: /delete filter My Filter/i }));
    await user.click(screen.getByRole('button', { name: /confirm delete/i }));
    expect(deleteFilterMutate).toHaveBeenCalledWith({ id: 'filter-1' });
  });

  it('cancels delete on cancel click', async () => {
    const user = userEvent.setup();
    render(
      <SavedFiltersManager
        savedFilters={[makeFilter()]}
        currentUserId="user-1"
        canManageGlobal={false}
        onFiltersChanged={() => {}}
      />
    );
    await user.click(screen.getByRole('button', { name: /delete filter My Filter/i }));
    await user.click(screen.getByRole('button', { name: /cancel/i }));
    expect(deleteFilterMutate).not.toHaveBeenCalled();
    expect(screen.getByText('My Filter')).toBeInTheDocument();
  });
});
```

- [ ] **Step 1.2: Run test to verify it fails**

```bash
pnpm vitest run src/client/components/SavedFiltersManager.test.tsx
```

Expected: FAIL — "Cannot find module './SavedFiltersManager'"

- [ ] **Step 1.3: Create `SavedFiltersManager.tsx`**

Create `src/client/components/SavedFiltersManager.tsx`:

```tsx
import React, { useState } from 'react';
import { Pencil, Trash2, Check, X } from 'lucide-react';
import { trpc } from '../api/trpc';
import type { SavedFilterOutput } from '../../shared/filterSchemas';

interface SavedFiltersManagerProps {
  savedFilters: SavedFilterOutput[];
  currentUserId: string | undefined;
  canManageGlobal: boolean;
  onFiltersChanged: () => void;
}

export function SavedFiltersManager({
  savedFilters,
  currentUserId,
  canManageGlobal,
  onFiltersChanged,
}: SavedFiltersManagerProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const updateFilter = trpc.filters.updateFilter.useMutation({ onSuccess: onFiltersChanged });
  const deleteFilter = trpc.filters.deleteFilter.useMutation({ onSuccess: onFiltersChanged });

  function canEdit(filter: SavedFilterOutput): boolean {
    if (filter.isGlobal) return canManageGlobal;
    return filter.userId === currentUserId;
  }

  function startEdit(filter: SavedFilterOutput) {
    setEditingId(filter.id);
    setEditName(filter.name);
    setConfirmDeleteId(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditName('');
  }

  function commitEdit(filterId: string) {
    const trimmed = editName.trim();
    if (!trimmed) return;
    updateFilter.mutate({ id: filterId, data: { name: trimmed } });
    setEditingId(null);
    setEditName('');
  }

  function startDelete(filterId: string) {
    setConfirmDeleteId(filterId);
    setEditingId(null);
  }

  function commitDelete(filterId: string) {
    deleteFilter.mutate({ id: filterId });
    setConfirmDeleteId(null);
  }

  if (savedFilters.length === 0) {
    return <p className="text-sm text-zinc-500 py-1">No saved filters yet.</p>;
  }

  const globalFilters = savedFilters.filter((f) => f.isGlobal);
  const personalFilters = savedFilters.filter((f) => !f.isGlobal);

  function renderGroup(filters: SavedFilterOutput[], groupLabel: string) {
    if (filters.length === 0) return null;
    return (
      <div>
        <p className="mb-1 text-xs font-medium uppercase tracking-wide text-zinc-400">
          {groupLabel}
        </p>
        <ul className="space-y-1">
          {filters.map((filter) => (
            <li key={filter.id} className="flex items-center gap-2 py-1">
              {editingId === filter.id ? (
                <>
                  <input
                    className="input compact flex-1"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitEdit(filter.id);
                      if (e.key === 'Escape') cancelEdit();
                    }}
                    autoFocus
                    aria-label="Filter name"
                    maxLength={120}
                  />
                  <button
                    type="button"
                    className="secondary-button compact-action"
                    onClick={() => commitEdit(filter.id)}
                    disabled={!editName.trim() || updateFilter.isPending}
                    aria-label="Save name"
                  >
                    <Check size={14} aria-hidden />
                  </button>
                  <button
                    type="button"
                    className="secondary-button compact-action"
                    onClick={cancelEdit}
                    aria-label="Cancel rename"
                  >
                    <X size={14} aria-hidden />
                  </button>
                </>
              ) : confirmDeleteId === filter.id ? (
                <>
                  <span className="flex-1 truncate text-sm text-zinc-700">{filter.name}</span>
                  <button
                    type="button"
                    className="secondary-button compact-action text-red-600"
                    onClick={() => commitDelete(filter.id)}
                    disabled={deleteFilter.isPending}
                    aria-label="Confirm delete"
                  >
                    Confirm delete
                  </button>
                  <button
                    type="button"
                    className="secondary-button compact-action"
                    onClick={() => setConfirmDeleteId(null)}
                    aria-label="Cancel"
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <span className="flex-1 truncate text-sm text-zinc-700">{filter.name}</span>
                  {canEdit(filter) && (
                    <>
                      <button
                        type="button"
                        className="icon-button"
                        onClick={() => startEdit(filter)}
                        aria-label={`Rename filter ${filter.name}`}
                      >
                        <Pencil size={14} aria-hidden />
                      </button>
                      <button
                        type="button"
                        className="icon-button"
                        onClick={() => startDelete(filter.id)}
                        aria-label={`Delete filter ${filter.name}`}
                      >
                        <Trash2 size={14} aria-hidden />
                      </button>
                    </>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="saved-filters-manager space-y-3 rounded-lg border border-zinc-200 bg-white p-3">
      {renderGroup(globalFilters, 'Global filters')}
      {renderGroup(personalFilters, 'My filters')}
    </div>
  );
}
```

- [ ] **Step 1.4: Run tests to verify they pass**

```bash
pnpm vitest run src/client/components/SavedFiltersManager.test.tsx
```

Expected: All tests PASS.

- [ ] **Step 1.5: Commit**

```bash
git add src/client/components/SavedFiltersManager.tsx src/client/components/SavedFiltersManager.test.tsx
git commit -m "feat(filters): add SavedFiltersManager component (CAP-031)"
```

---

### Task 2: Wire `SavedFiltersManager` into `InventoryFinderPanel`

**Files:**
- Modify: `src/client/components/InventoryFinderPanel.tsx`

The panel already fetches `savedFilters` and calls `trpc.filters.saveFilter`. We add:
1. A "Manage" toggle button next to the existing `SavedFiltersDropdown`
2. The `SavedFiltersManager` panel shown when `manageOpen` is true

- [ ] **Step 2.1: Write failing test**

Create `src/client/components/InventoryFinderPanel.filterManage.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Minimal stubs — only mock what these tests exercise
vi.mock('../api/trpc', () => {
  const savedFilters = [
    {
      id: 'f1', userId: 'u1', name: 'Aging premium', description: undefined,
      targetView: 'inventory', filterDefinition: { op: 'and', conditions: [] },
      schemaVersion: 1, isGlobal: false, createdAt: new Date(), updatedAt: new Date(),
      createdBy: 'u1', updatedBy: 'u1',
    },
  ];
  return {
    trpc: {
      queries: { reference: { useQuery: () => ({ data: { availableBatches: [], vendors: [] }, isLoading: false }) } },
      filters: {
        listSavedFilters: { useQuery: () => ({ data: savedFilters }) },
        saveFilter: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
        updateFilter: { useMutation: ({ onSuccess }: any) => ({ mutate: vi.fn().mockImplementation(() => onSuccess?.()), isPending: false }) },
        deleteFilter: { useMutation: ({ onSuccess }: any) => ({ mutate: vi.fn().mockImplementation(() => onSuccess?.()), isPending: false }) },
      },
      auth: { me: { useQuery: () => ({ data: { id: 'u1', role: 'operator' } }) } },
      useContext: () => ({ filters: { listSavedFilters: { invalidate: vi.fn() } } }),
    },
  };
});

import { InventoryFinderPanel } from './InventoryFinderPanel';

describe('InventoryFinderPanel filter management', () => {
  it('shows Manage button next to saved-filter dropdown', () => {
    render(<InventoryFinderPanel onAddBatch={vi.fn()} />);
    expect(screen.getByRole('button', { name: /manage saved filters/i })).toBeInTheDocument();
  });

  it('toggles SavedFiltersManager on Manage button click', async () => {
    const user = userEvent.setup();
    render(<InventoryFinderPanel onAddBatch={vi.fn()} />);
    expect(screen.queryByText('My filters')).toBeNull();
    await user.click(screen.getByRole('button', { name: /manage saved filters/i }));
    expect(screen.getByText('My filters')).toBeInTheDocument();
  });

  it('closes SavedFiltersManager on second click', async () => {
    const user = userEvent.setup();
    render(<InventoryFinderPanel onAddBatch={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: /manage saved filters/i }));
    await user.click(screen.getByRole('button', { name: /manage saved filters/i }));
    expect(screen.queryByText('My filters')).toBeNull();
  });
});
```

- [ ] **Step 2.2: Run test to verify it fails**

```bash
pnpm vitest run src/client/components/InventoryFinderPanel.filterManage.test.tsx
```

Expected: FAIL — "Manage saved filters" button not found.

- [ ] **Step 2.3: Add state and Manage button to `InventoryFinderPanel.tsx`**

In `src/client/components/InventoryFinderPanel.tsx`, make these changes:

**Add import** at the top of the imports block (after the `SavedFiltersDropdown` import on line 9):

```tsx
import { SavedFiltersManager } from './SavedFiltersManager';
```

**Add `manageOpen` state** inside the `InventoryFinderPanel` function body, alongside the other `useState` declarations (around line 72). Add after `const [selectedSavedFilter, setSelectedSavedFilter] = useState<string | null>(null);`:

```tsx
const [manageFiltersOpen, setManageFiltersOpen] = useState(false);
```

**Add `me` query** alongside the other queries at the top of the function body (after the `saveFilterMutation` declaration around line 61):

```tsx
const me = trpc.auth.me.useQuery();
```

**Replace the existing `<SavedFiltersDropdown>` JSX** with the dropdown plus Manage button plus conditional manager panel. Find the rendered `<SavedFiltersDropdown ... />` component in the JSX (search for `SavedFiltersDropdown` in the render section) and replace it with:

```tsx
<div className="flex flex-col gap-2">
  <div className="flex items-center gap-2">
    <SavedFiltersDropdown
      savedFilters={savedFilters ?? []}
      selectedId={selectedSavedFilter}
      onSelect={(id) => {
        const saved = savedFilters?.find((f) => f.id === id);
        if (saved) {
          setAdvancedFilter(saved.filterDefinition);
          setSelectedSavedFilter(id);
        }
      }}
    />
    <button
      type="button"
      className="secondary-button compact-action"
      onClick={() => setManageFiltersOpen((v) => !v)}
      aria-label="Manage saved filters"
      aria-expanded={manageFiltersOpen}
    >
      Manage
    </button>
  </div>
  {manageFiltersOpen && (
    <SavedFiltersManager
      savedFilters={savedFilters ?? []}
      currentUserId={me.data?.id}
      canManageGlobal={me.data?.role === 'manager' || me.data?.role === 'owner'}
      onFiltersChanged={() => {
        void trpc.useContext().filters.listSavedFilters.invalidate();
      }}
    />
  )}
</div>
```

**Important:** Find the original `onSelect` logic in `InventoryFinderPanel` (around line 235). If it was previously inlined at the `SavedFiltersDropdown` callsite, it is now in the block above. Remove any duplicate.

- [ ] **Step 2.4: Run tests to verify they pass**

```bash
pnpm vitest run src/client/components/InventoryFinderPanel.filterManage.test.tsx
```

Expected: All 3 tests PASS.

- [ ] **Step 2.5: Run full filter test suite**

```bash
pnpm vitest run src/client/components/SavedFiltersDropdown.a11y.test.tsx src/client/components/SavedFiltersManager.test.tsx src/client/components/InventoryFinderPanel.filterManage.test.tsx
```

Expected: All tests PASS.

- [ ] **Step 2.6: Commit**

```bash
git add src/client/components/InventoryFinderPanel.tsx src/client/components/InventoryFinderPanel.filterManage.test.tsx
git commit -m "feat(filters): wire SavedFiltersManager into InventoryFinderPanel (CAP-031)"
```

---

## Workstream B: Credit Engine Ops Surfaces

**Addresses gaps:** `credit.divergenceReport` (owner-only), `credit.creditRecomputeQueueHealth` (manager+).

### Task 3: Create `CreditQueueHealthWidget` component

**Files:**
- Create: `src/client/components/credit/CreditQueueHealthWidget.tsx`
- Create: `src/client/components/credit/CreditQueueHealthWidget.test.tsx`

- [ ] **Step 3.1: Write failing test**

Create `src/client/components/credit/CreditQueueHealthWidget.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const queueHealthMock = vi.fn();

vi.mock('../../api/trpc', () => ({
  trpc: {
    credit: {
      creditRecomputeQueueHealth: {
        useQuery: (input: unknown, options: unknown) => queueHealthMock(input, options),
      },
    },
  },
}));

import { CreditQueueHealthWidget } from './CreditQueueHealthWidget';

function mockHealth(data: {
  pendingCount: number;
  oldestPendingAgeSeconds: number | null;
  processingCount: number;
  doneCount: number;
  failedTerminalCount: number;
  staleProcessingCount: number;
}) {
  queueHealthMock.mockReturnValue({ data, isLoading: false });
}

describe('CreditQueueHealthWidget', () => {
  it('renders nothing while loading', () => {
    queueHealthMock.mockReturnValue({ data: undefined, isLoading: true });
    const { container } = render(<CreditQueueHealthWidget />);
    expect(container.firstChild).toBeNull();
  });

  it('renders healthy state when all counts are zero', () => {
    mockHealth({ pendingCount: 0, oldestPendingAgeSeconds: null, processingCount: 0, doneCount: 10, failedTerminalCount: 0, staleProcessingCount: 0 });
    render(<CreditQueueHealthWidget />);
    expect(screen.getByLabelText('Credit recompute queue health')).toBeInTheDocument();
    expect(screen.getByText(/Pending: 0/)).toBeInTheDocument();
  });

  it('highlights stale processing count in red', () => {
    mockHealth({ pendingCount: 0, oldestPendingAgeSeconds: null, processingCount: 2, doneCount: 5, failedTerminalCount: 0, staleProcessingCount: 3 });
    render(<CreditQueueHealthWidget />);
    const staleEl = screen.getByText(/Stale: 3/);
    expect(staleEl.className).toContain('text-red-600');
  });

  it('highlights failed terminal count in red', () => {
    mockHealth({ pendingCount: 0, oldestPendingAgeSeconds: null, processingCount: 0, doneCount: 5, failedTerminalCount: 2, staleProcessingCount: 0 });
    render(<CreditQueueHealthWidget />);
    const failedEl = screen.getByText(/Failed: 2/);
    expect(failedEl.className).toContain('text-red-600');
  });

  it('shows oldest pending age when pending count > 0', () => {
    mockHealth({ pendingCount: 3, oldestPendingAgeSeconds: 180, processingCount: 1, doneCount: 0, failedTerminalCount: 0, staleProcessingCount: 0 });
    render(<CreditQueueHealthWidget />);
    expect(screen.getByText(/Oldest: 3m/)).toBeInTheDocument();
  });

  it('uses amber border when unhealthy (stale or failed)', () => {
    mockHealth({ pendingCount: 0, oldestPendingAgeSeconds: null, processingCount: 1, doneCount: 0, failedTerminalCount: 1, staleProcessingCount: 0 });
    render(<CreditQueueHealthWidget />);
    const widget = screen.getByLabelText('Credit recompute queue health');
    expect(widget.className).toContain('border-amber-300');
  });

  it('uses zinc border when healthy', () => {
    mockHealth({ pendingCount: 0, oldestPendingAgeSeconds: null, processingCount: 0, doneCount: 10, failedTerminalCount: 0, staleProcessingCount: 0 });
    render(<CreditQueueHealthWidget />);
    const widget = screen.getByLabelText('Credit recompute queue health');
    expect(widget.className).toContain('border-zinc-200');
  });
});
```

- [ ] **Step 3.2: Run test to verify it fails**

```bash
pnpm vitest run src/client/components/credit/CreditQueueHealthWidget.test.tsx
```

Expected: FAIL — "Cannot find module './CreditQueueHealthWidget'"

- [ ] **Step 3.3: Create `CreditQueueHealthWidget.tsx`**

Create `src/client/components/credit/CreditQueueHealthWidget.tsx`:

```tsx
import React from 'react';
import { trpc } from '../../api/trpc';

export function CreditQueueHealthWidget() {
  const { data, isLoading } = trpc.credit.creditRecomputeQueueHealth.useQuery(undefined, {
    refetchInterval: 30_000,
  });

  if (isLoading || !data) return null;

  const hasStale = data.staleProcessingCount > 0;
  const hasFailed = data.failedTerminalCount > 0;
  const isHealthy = !hasStale && !hasFailed && data.pendingCount === 0;

  return (
    <div
      className={`flex items-center gap-3 rounded border px-3 py-1.5 text-xs ${
        isHealthy
          ? 'border-zinc-200 bg-zinc-50 text-zinc-600'
          : 'border-amber-300 bg-amber-50 text-amber-800'
      }`}
      aria-label="Credit recompute queue health"
    >
      <span className="font-medium">Recompute queue</span>
      <span>Pending: {data.pendingCount}</span>
      <span>Processing: {data.processingCount}</span>
      {hasStale && (
        <span className="font-medium text-red-600">Stale: {data.staleProcessingCount}</span>
      )}
      {hasFailed && (
        <span className="font-medium text-red-600">Failed: {data.failedTerminalCount}</span>
      )}
      {data.oldestPendingAgeSeconds !== null && data.pendingCount > 0 && (
        <span>Oldest: {Math.round(data.oldestPendingAgeSeconds / 60)}m</span>
      )}
    </div>
  );
}
```

- [ ] **Step 3.4: Run tests to verify they pass**

```bash
pnpm vitest run src/client/components/credit/CreditQueueHealthWidget.test.tsx
```

Expected: All tests PASS.

- [ ] **Step 3.5: Commit**

```bash
git add src/client/components/credit/CreditQueueHealthWidget.tsx src/client/components/credit/CreditQueueHealthWidget.test.tsx
git commit -m "feat(credit): add CreditQueueHealthWidget for ops dashboard (CAP-032)"
```

---

### Task 4: Create `CreditDivergencePanel` component

**Files:**
- Create: `src/client/components/credit/CreditDivergencePanel.tsx`
- Create: `src/client/components/credit/CreditDivergencePanel.test.tsx`

- [ ] **Step 4.1: Write failing test**

Create `src/client/components/credit/CreditDivergencePanel.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const divergenceQueryMock = vi.fn();
const refetchMock = vi.fn();

vi.mock('../../api/trpc', () => ({
  trpc: {
    credit: {
      divergenceReport: {
        useQuery: (input: unknown, options: unknown) => divergenceQueryMock(input, options),
      },
    },
  },
}));

import { CreditDivergencePanel } from './CreditDivergencePanel';

function makeKpi(overrides = {}) {
  return {
    withinTolerance: 8,
    outsideTolerance: 2,
    pctWithinTolerance: 80,
    blockerCount: 0,
    noConfidenceApplied: 0,
    passes: true,
    reasons: [],
    ...overrides,
  };
}

function makeReport(kpiOverrides = {}, rowsOverride = []) {
  return {
    rows: rowsOverride,
    generatedAt: new Date(),
    totalCustomers: 10,
    customersWithRecommendation: 8,
    customersInTolerance: 8,
    customersWithoutRecommendation: 2,
    kpi: makeKpi(kpiOverrides),
  };
}

describe('CreditDivergencePanel', () => {
  beforeEach(() => {
    divergenceQueryMock.mockReset();
    refetchMock.mockReset();
  });

  it('shows loading text while fetching', () => {
    divergenceQueryMock.mockReturnValue({ data: undefined, isLoading: true, isError: false, refetch: refetchMock });
    render(<CreditDivergencePanel />);
    expect(screen.getByText(/loading divergence report/i)).toBeInTheDocument();
  });

  it('shows error message on failure', () => {
    divergenceQueryMock.mockReturnValue({ data: undefined, isLoading: false, isError: true, refetch: refetchMock });
    render(<CreditDivergencePanel />);
    expect(screen.getByText(/failed to load/i)).toBeInTheDocument();
  });

  it('renders KPI tiles when data is available', () => {
    divergenceQueryMock.mockReturnValue({ data: makeReport(), isLoading: false, isError: false, refetch: refetchMock });
    render(<CreditDivergencePanel />);
    expect(screen.getByText('Total customers')).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument();
    expect(screen.getByText('80.0%')).toBeInTheDocument();
  });

  it('shows green pass banner when kpi.passes is true', () => {
    divergenceQueryMock.mockReturnValue({ data: makeReport(), isLoading: false, isError: false, refetch: refetchMock });
    render(<CreditDivergencePanel />);
    expect(screen.getByText(/meets criteria for live-mode flip/i)).toBeInTheDocument();
  });

  it('shows red fail banner when kpi.passes is false', () => {
    divergenceQueryMock.mockReturnValue({
      data: makeReport({ passes: false, reasons: ['< 75% within tolerance', 'blockerCount > 0'] }),
      isLoading: false, isError: false, refetch: refetchMock,
    });
    render(<CreditDivergencePanel />);
    expect(screen.getByText(/not ready to flip/i)).toBeInTheDocument();
    expect(screen.getByText('< 75% within tolerance')).toBeInTheDocument();
  });

  it('shows blocker warning when blockerCount > 0', () => {
    divergenceQueryMock.mockReturnValue({
      data: makeReport({ blockerCount: 3, passes: false, reasons: ['blockerCount > 0'] }),
      isLoading: false, isError: false, refetch: refetchMock,
    });
    render(<CreditDivergencePanel />);
    expect(screen.getByText(/3 customers with open invoices/i)).toBeInTheDocument();
  });

  it('calls refetch on Refresh button click', async () => {
    const user = userEvent.setup();
    divergenceQueryMock.mockReturnValue({ data: makeReport(), isLoading: false, isError: false, refetch: refetchMock });
    render(<CreditDivergencePanel />);
    await user.click(screen.getByRole('button', { name: /refresh/i }));
    expect(refetchMock).toHaveBeenCalledTimes(1);
  });

  it('renders divergence rows in a table', () => {
    const rows = [
      {
        customerId: 'c1', customerName: 'Acme Corp', currentLimit: 5000,
        source: 'manual' as const, engineRecommendation: 6000,
        recommendationConfidence: { overallScore: 0.8, minDataCount: 5, maxDataCount: 10 },
        deltaAbs: 1000, deltaPct: 20, suggestedAction: 'engine_recommends_raise' as const,
      },
    ];
    divergenceQueryMock.mockReturnValue({ data: makeReport({}, rows), isLoading: false, isError: false, refetch: refetchMock });
    render(<CreditDivergencePanel />);
    expect(screen.getByText('Acme Corp')).toBeInTheDocument();
    expect(screen.getByText('$5,000')).toBeInTheDocument();
    expect(screen.getByText('$6,000')).toBeInTheDocument();
    expect(screen.getByText('Raise recommended')).toBeInTheDocument();
  });
});
```

- [ ] **Step 4.2: Run test to verify it fails**

```bash
pnpm vitest run src/client/components/credit/CreditDivergencePanel.test.tsx
```

Expected: FAIL — "Cannot find module './CreditDivergencePanel'"

- [ ] **Step 4.3: Create `CreditDivergencePanel.tsx`**

Create `src/client/components/credit/CreditDivergencePanel.tsx`:

```tsx
import React from 'react';
import { trpc } from '../../api/trpc';

type SuggestedAction =
  | 'engine_recommends_raise'
  | 'engine_recommends_lower'
  | 'within_tolerance'
  | 'no_recommendation_yet';

function formatAction(action: SuggestedAction): string {
  switch (action) {
    case 'engine_recommends_raise': return 'Raise recommended';
    case 'engine_recommends_lower': return 'Lower recommended';
    case 'within_tolerance': return 'Within tolerance';
    case 'no_recommendation_yet': return 'No recommendation';
    default: return action;
  }
}

interface KpiTileProps {
  label: string;
  value: string;
  highlight?: boolean;
}

function KpiTile({ label, value, highlight = false }: KpiTileProps) {
  return (
    <div
      className={`rounded-lg border p-3 ${
        highlight
          ? 'border-green-200 bg-green-50'
          : 'border-zinc-200 bg-zinc-50'
      }`}
    >
      <p className="text-xs text-zinc-500">{label}</p>
      <p
        className={`text-xl font-semibold ${
          highlight ? 'text-green-700' : 'text-zinc-900'
        }`}
      >
        {value}
      </p>
    </div>
  );
}

export function CreditDivergencePanel() {
  const { data, isLoading, isError, refetch } =
    trpc.credit.divergenceReport.useQuery(undefined, {
      refetchInterval: 120_000,
    });

  if (isLoading) {
    return (
      <div className="p-4 text-sm text-zinc-500">Loading divergence report…</div>
    );
  }

  if (isError) {
    return (
      <div className="p-4 text-sm text-red-600">
        Failed to load divergence report.
      </div>
    );
  }

  if (!data) return null;

  const {
    kpi,
    rows,
    totalCustomers,
    customersWithRecommendation,
    customersInTolerance,
  } = data;

  return (
    <div className="credit-divergence-panel space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-zinc-900">
          Credit Divergence Report
        </h2>
        <button
          type="button"
          className="secondary-button compact-action"
          onClick={() => void refetch()}
        >
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiTile label="Total customers" value={String(totalCustomers)} />
        <KpiTile
          label="With recommendation"
          value={String(customersWithRecommendation)}
        />
        <KpiTile
          label="Within tolerance"
          value={String(customersInTolerance)}
        />
        <KpiTile
          label="% within tolerance"
          value={`${kpi.pctWithinTolerance.toFixed(1)}%`}
          highlight={kpi.pctWithinTolerance >= 75}
        />
      </div>

      {kpi.blockerCount > 0 && (
        <div className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {kpi.blockerCount} customer
          {kpi.blockerCount !== 1 ? 's' : ''} with open invoices have $0 engine
          recommendation — flipping to engine would block their sales.
        </div>
      )}

      {kpi.passes ? (
        <div className="rounded border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
          Portfolio meets criteria for live-mode flip.
        </div>
      ) : (
        <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          <p className="font-medium">Not ready to flip to live mode:</p>
          <ul className="mt-1 list-inside list-disc space-y-0.5">
            {kpi.reasons.map((reason, i) => (
              <li key={i}>{reason}</li>
            ))}
          </ul>
        </div>
      )}

      {rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-xs font-medium text-zinc-500">
                <th className="pb-2 pr-4">Customer</th>
                <th className="pb-2 pr-4">Current limit</th>
                <th className="pb-2 pr-4">Engine rec.</th>
                <th className="pb-2 pr-4">Delta</th>
                <th className="pb-2">Suggested action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {rows.map((row) => (
                <tr key={row.customerId}>
                  <td className="py-2 pr-4 font-medium text-zinc-900">
                    {row.customerName}
                  </td>
                  <td className="py-2 pr-4 text-zinc-700">
                    ${row.currentLimit.toLocaleString()}
                  </td>
                  <td className="py-2 pr-4 text-zinc-700">
                    {row.engineRecommendation !== null
                      ? `$${row.engineRecommendation.toLocaleString()}`
                      : '—'}
                  </td>
                  <td className="py-2 pr-4 text-zinc-700">
                    {row.deltaAbs !== 0
                      ? `${row.deltaPct >= 0 ? '+' : ''}${row.deltaPct.toFixed(1)}%`
                      : '—'}
                  </td>
                  <td className="py-2 text-xs text-zinc-500">
                    {formatAction(row.suggestedAction)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4.4: Run tests to verify they pass**

```bash
pnpm vitest run src/client/components/credit/CreditDivergencePanel.test.tsx
```

Expected: All tests PASS.

- [ ] **Step 4.5: Commit**

```bash
git add src/client/components/credit/CreditDivergencePanel.tsx src/client/components/credit/CreditDivergencePanel.test.tsx
git commit -m "feat(credit): add CreditDivergencePanel for owner ops surface (CAP-032)"
```

---

### Task 5: Wire both credit components into `CreditReviewView`

**Files:**
- Modify: `src/client/views/CreditReviewView.tsx`

`CreditQueueHealthWidget` goes in the header bar (manager+ already satisfied by the view's own gate).
`CreditDivergencePanel` goes in a collapsible section below the queue rows, visible to owners only.

- [ ] **Step 5.1: Write failing test**

Create `src/client/views/CreditReviewView.creditOps.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../api/trpc', () => ({
  trpc: {
    auth: {
      me: {
        useQuery: () => ({ data: { role: 'owner', id: 'u1' }, isLoading: false }),
      },
    },
    credit: {
      creditReviewQueue: {
        useQuery: () => ({ data: { rows: [], counts: { staleManual: 0, engineDisabled: 0, nearSnoozeCap: 0 } }, isLoading: false }),
      },
      creditEngineStances: {
        useQuery: () => ({ data: { stances: [], config: { shadowMode: false } }, isLoading: false }),
      },
      creditRecomputeQueueHealth: {
        useQuery: () => ({
          data: { pendingCount: 0, oldestPendingAgeSeconds: null, processingCount: 0, doneCount: 5, failedTerminalCount: 0, staleProcessingCount: 0 },
          isLoading: false,
        }),
      },
      divergenceReport: {
        useQuery: () => ({
          data: {
            rows: [], generatedAt: new Date(), totalCustomers: 5,
            customersWithRecommendation: 4, customersInTolerance: 4, customersWithoutRecommendation: 1,
            kpi: { withinTolerance: 4, outsideTolerance: 1, pctWithinTolerance: 80, blockerCount: 0, noConfidenceApplied: 0, passes: true, reasons: [] },
          },
          isLoading: false, isError: false, refetch: vi.fn(),
        }),
      },
    },
  },
}));

import { CreditReviewView } from './CreditReviewView';

describe('CreditReviewView credit ops integration', () => {
  it('renders CreditQueueHealthWidget in header for manager+', () => {
    render(<CreditReviewView />);
    expect(screen.getByLabelText('Credit recompute queue health')).toBeInTheDocument();
  });

  it('renders divergence report toggle button for owner', () => {
    render(<CreditReviewView />);
    expect(screen.getByRole('button', { name: /divergence report/i })).toBeInTheDocument();
  });

  it('shows divergence panel on toggle click', async () => {
    const user = userEvent.setup();
    render(<CreditReviewView />);
    await user.click(screen.getByRole('button', { name: /divergence report/i }));
    expect(screen.getByText('Total customers')).toBeInTheDocument();
  });
});
```

- [ ] **Step 5.2: Run test to verify it fails**

```bash
pnpm vitest run src/client/views/CreditReviewView.creditOps.test.tsx
```

Expected: FAIL — `CreditQueueHealthWidget` not rendered.

- [ ] **Step 5.3: Modify `CreditReviewView.tsx`**

Open `src/client/views/CreditReviewView.tsx`.

**Add imports** at the top (after the existing imports):

```tsx
import { CreditQueueHealthWidget } from '../components/credit/CreditQueueHealthWidget';
import { CreditDivergencePanel } from '../components/credit/CreditDivergencePanel';
```

**Add state** inside `CreditReviewView()` function body, after the existing `const isOwner` line:

```tsx
const [divergenceOpen, setDivergenceOpen] = useState(false);
```

**In the header JSX** — find the `<div className="flex items-center justify-between ...">` that wraps the `<h1>Credit Review</h1>`. Inside that div, after the sort select `<div>`, add before the closing tag of the flex container:

```tsx
{isManagerOrOwner && <CreditQueueHealthWidget />}
{isOwner && (
  <button
    type="button"
    className="secondary-button compact-action"
    onClick={() => setDivergenceOpen((v) => !v)}
    aria-label="Divergence report"
    aria-expanded={divergenceOpen}
  >
    Divergence report
  </button>
)}
```

**Add divergence panel** below the closing `</div>` of the tab nav section (the `<div className="flex gap-1 border-b ...">` tabs row) and before the queue rows area. Add:

```tsx
{divergenceOpen && isOwner && (
  <div className="border-b border-zinc-200">
    <CreditDivergencePanel />
  </div>
)}
```

- [ ] **Step 5.4: Run tests to verify they pass**

```bash
pnpm vitest run src/client/views/CreditReviewView.creditOps.test.tsx
```

Expected: All 3 tests PASS.

- [ ] **Step 5.5: Run all credit tests together**

```bash
pnpm vitest run src/client/components/credit/ src/client/views/CreditReviewView.creditOps.test.tsx
```

Expected: All tests PASS.

- [ ] **Step 5.6: Commit**

```bash
git add src/client/views/CreditReviewView.tsx src/client/views/CreditReviewView.creditOps.test.tsx
git commit -m "feat(credit): wire queue health widget and divergence panel into CreditReviewView (CAP-032)"
```

---

## Workstream C: Housekeeping

### Task 6: Document infrastructure-blocked gaps

**Addresses:** `subscriptions.heartbeat` (WS transport not configured), `queries.pickListAlerts` dead reference (intentionally deferred — CAP-030), `filters.applyBatchFilters` (architectural decision needed).

**Files:**
- Modify: `src/server/routers/subscriptions.ts` (add comment block)

- [ ] **Step 6.1: Add transport note to `subscriptions.ts`**

Open `src/server/routers/subscriptions.ts`. Replace its content with:

```typescript
/**
 * Subscriptions router.
 *
 * TRANSPORT NOTE (2026-05-22):
 * The tRPC client is currently configured with `httpBatchLink` only
 * (see `src/client/api/trpc.ts`). Subscriptions require a WebSocket or SSE
 * transport link (e.g. `wsLink` or `httpSubscriptionLink`).
 *
 * No frontend subscriber for `heartbeat` exists today. Before wiring the
 * frontend side, add a split-link config in `trpc.ts` that routes subscription
 * procedures to a WebSocket/SSE link. This is tracked as an infrastructure
 * item in the capability registry (see BE-011 when added).
 *
 * The procedure is retained as backend scaffolding so the server-side
 * observable infrastructure is tested when WS transport is added.
 */
import { observable } from '@trpc/server/observable';
import { protectedProcedure, router } from '../trpc';

export const subscriptionsRouter = router({
  heartbeat: protectedProcedure.subscription(() => {
    return observable<{ checkedAt: string; status: 'ok' }>((emit) => {
      const timer = setInterval(() => emit.next({ checkedAt: new Date().toISOString(), status: 'ok' }), 10_000);
      return () => clearInterval(timer);
    });
  }),
});
```

- [ ] **Step 6.2: Commit housekeeping**

```bash
git add src/server/routers/subscriptions.ts
git commit -m "docs(gaps): document heartbeat transport dependency (BE-011, BE-012)"
```

---

## Final Steps

### Task 7: Typecheck, full test run, PR

- [ ] **Step 7.1: Run typecheck**

```bash
pnpm typecheck
```

Expected: 0 errors.

- [ ] **Step 7.2: Run full test suite for changed files**

```bash
pnpm vitest run \
  src/client/components/SavedFiltersManager.test.tsx \
  src/client/components/SavedFiltersManager.a11y.test.tsx \
  src/client/components/InventoryFinderPanel.filterManage.test.tsx \
  src/client/components/SavedFiltersDropdown.a11y.test.tsx \
  src/client/components/credit/CreditQueueHealthWidget.test.tsx \
  src/client/components/credit/CreditDivergencePanel.test.tsx \
  src/client/views/CreditReviewView.creditOps.test.tsx
```

Note: `SavedFiltersManager.a11y.test.tsx` is created in the next step. Skip it if not yet created.

Expected: All tests PASS.

- [ ] **Step 7.2b: Add accessibility test for SavedFiltersManager**

Create `src/client/components/SavedFiltersManager.a11y.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('../api/trpc', () => ({
  trpc: {
    filters: {
      updateFilter: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
      deleteFilter: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
    },
  },
}));

import { SavedFiltersManager } from './SavedFiltersManager';

describe('SavedFiltersManager accessibility', () => {
  it('rename and delete buttons have accessible labels', () => {
    render(
      <SavedFiltersManager
        savedFilters={[{
          id: 'f1', userId: 'u1', name: 'My Filter', description: undefined,
          targetView: 'inventory', filterDefinition: { op: 'and', conditions: [] },
          schemaVersion: 1, isGlobal: false, createdAt: new Date(), updatedAt: new Date(),
          createdBy: 'u1', updatedBy: 'u1',
        }]}
        currentUserId="u1"
        canManageGlobal={false}
        onFiltersChanged={() => {}}
      />
    );
    const renameBtn = screen.getByRole('button', { name: /rename filter My Filter/i });
    const deleteBtn = screen.getByRole('button', { name: /delete filter My Filter/i });
    expect(renameBtn.getAttribute('aria-label')).toBeTruthy();
    expect(deleteBtn.getAttribute('aria-label')).toBeTruthy();
  });
});
```

Run again:

```bash
pnpm vitest run src/client/components/SavedFiltersManager.a11y.test.tsx
```

Expected: PASS.

- [ ] **Step 7.3: Commit accessibility test**

```bash
git add src/client/components/SavedFiltersManager.a11y.test.tsx
git commit -m "test(filters): add a11y test for SavedFiltersManager (CAP-031)"
```

- [ ] **Step 7.4: Check git status is clean**

```bash
git status
git diff --stat
```

Expected: working tree clean, only branch `feat/cap-031-032-gap-closure` has new commits.

- [ ] **Step 7.5: Open pull request**

```bash
git push -u origin feat/cap-031-032-gap-closure
gh pr create \
  --title "feat: backend-frontend gap closure — saved filter management + credit ops surfaces (CAP-031, CAP-032)" \
  --body "## Summary

Addresses every gap from the 2026-05-22 backend-frontend audit.

### Gaps closed
- **CAP-031** \`filters.updateFilter\` + \`filters.deleteFilter\` → \`SavedFiltersManager\` component with inline rename and inline confirm-delete, wired into \`InventoryFinderPanel\` behind a Manage toggle.
- **CAP-032** \`credit.divergenceReport\` → \`CreditDivergencePanel\` (owner-only toggle in CreditReviewView).
- **CAP-032** \`credit.creditRecomputeQueueHealth\` → \`CreditQueueHealthWidget\` in CreditReviewView header (manager+).

### Gaps documented (not implemented — blocked or deferred)
- **BE-011** \`subscriptions.heartbeat\` — WS/SSE transport not yet configured. Comment added to \`subscriptions.ts\`.
- **BE-012** \`filters.applyBatchFilters\` — architectural decision deferred until >500 active batches.

### Registry
Linear: CAP-031 TER-1561, CAP-032 TER-1562

### Tests
All new components have unit tests and accessibility tests. Full suite passes."
```
