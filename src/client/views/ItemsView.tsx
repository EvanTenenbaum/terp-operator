import { Pencil, Plus, Power, PowerOff } from 'lucide-react';
import { useState } from 'react';
import type { ColDef } from 'ag-grid-community';
import { trpc } from '../api/trpc';
import { OperatorGrid } from '../components/OperatorGrid';
import { useCommandRunner } from '../components/useCommandRunner';
import { useUiStore } from '../store/uiStore';
import type { GridRow } from '../../shared/types';
import { parseTagInput } from '../../shared/tags';

const CATEGORIES = ['Flower', 'Infused', 'Extract', 'Pre-roll', 'Vape', 'Edible', 'Other'];

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  active:   { label: 'Active',   cls: 'm-badge m-badge-ready' },
  inactive: { label: 'Inactive', cls: 'm-badge m-badge-neutral' }
};

export function ItemsView() {
  const grid = trpc.queries.grid.useQuery({ view: 'items' }, { refetchInterval: 120_000 });
  const reference = trpc.queries.reference.useQuery();
  const { runCommand, isRunning } = useCommandRunner();
  const pushToast = useUiStore((state) => state.pushToast);
  const me = trpc.auth.me.useQuery();
  const canWrite = me.data?.role !== 'viewer';
  const canManage = me.data?.role === 'manager' || me.data?.role === 'owner';

  const [showCreate, setShowCreate] = useState(false);
  const [editingRow, setEditingRow] = useState<GridRow | null>(null);

  // Create form state
  const [createName, setCreateName] = useState('');
  const [createCategory, setCreateCategory] = useState('Flower');
  const [createAlias, setCreateAlias] = useState('');
  const [createTags, setCreateTags] = useState('');
  const [createDescription, setCreateDescription] = useState('');

  // Edit form state
  const [editName, setEditName] = useState('');
  const [editCategory, setEditCategory] = useState('Flower');
  const [editAlias, setEditAlias] = useState('');
  const [editTags, setEditTags] = useState('');
  const [editDescription, setEditDescription] = useState('');

  const referenceItems = (reference.data?.items ?? []) as any[];
  const activeCount = referenceItems.filter((r: any) => r.status !== 'inactive').length;
  const inactiveCount = referenceItems.filter((r: any) => r.status === 'inactive').length;

  const columns: ColDef<GridRow>[] = [
    {
      field: 'name',
      headerName: 'Item Name',
      pinned: 'left',
      minWidth: 200,
      cellRenderer: (params: { data: GridRow; value: string }) => (
        <span>
          {params.data?.alias ? (
            <span title="Customer-facing alias active" className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-amber-400" />
          ) : null}
          {params.value}
        </span>
      )
    },
    {
      field: 'status',
      headerName: 'Status',
      width: 110,
      cellRenderer: (params: { value: string }) => {
        const badge = STATUS_BADGE[String(params.value ?? 'active')] ?? STATUS_BADGE.active;
        return <span className={badge.cls}>{badge.label}</span>;
      }
    },
    { field: 'sku', width: 140 },
    { field: 'alias', headerName: 'Alias', width: 160 },
    { field: 'category', width: 120 },
    { field: 'tags', minWidth: 180 },
    { field: 'batchCount', headerName: 'Batches', type: 'numericColumn', width: 100 },
    { field: 'totalAvailableQty', headerName: 'Avail Qty', type: 'numericColumn', width: 120 },
    { field: 'description', minWidth: 220 },
    { field: 'createdAt', width: 180 }
  ];

  function openEdit(row: GridRow) {
    setEditName(String(row.name ?? ''));
    setEditCategory(String(row.category ?? 'Flower'));
    setEditAlias(String(row.alias ?? ''));
    setEditTags(Array.isArray(row.tags) ? row.tags.join(', ') : String(row.tags ?? ''));
    setEditDescription(String(row.description ?? ''));
    setEditingRow(row);
  }

  function resetCreate() {
    setCreateName('');
    setCreateCategory('Flower');
    setCreateAlias('');
    setCreateTags('');
    setCreateDescription('');
    setShowCreate(false);
  }

  function resetEdit() {
    setEditingRow(null);
  }

  async function handleCreate() {
    if (!createName.trim()) {
      pushToast('Item name is required.', 'error');
      return;
    }
    await runCommand('createItem', {
      name: createName.trim(),
      category: createCategory,
      alias: createAlias.trim() || undefined,
      tags: parseTagInput(createTags),
      description: createDescription.trim() || undefined
    }, `Create item: ${createName.trim()}`);
    resetCreate();
  }

  async function handleUpdate() {
    if (!editingRow?.id) return;
    const current = editingRow;
    await runCommand('updateItem', {
      itemId: current.id,
      name: editName.trim() !== String(current.name ?? '').trim() ? editName.trim() : undefined,
      category: editCategory !== String(current.category ?? '') ? editCategory : undefined,
      alias: editAlias.trim() !== String(current.alias ?? '').trim() ? (editAlias.trim() || '') : undefined,
      tags: (() => {
        const currentTags = Array.isArray(current.tags) ? current.tags.join(', ') : String(current.tags ?? '');
        return editTags !== currentTags ? parseTagInput(editTags) : undefined;
      })(),
      description: editDescription.trim() !== String(current.description ?? '').trim() ? (editDescription.trim() || null) : undefined
    }, `Update item: ${editName || String(current.name ?? '')}`);
    resetEdit();
  }

  async function handleToggleStatus(row: GridRow) {
    await runCommand('toggleItemStatus', {
      itemId: row.id
    }, `${String(row.status) === 'inactive' ? 'Activate' : 'Deactivate'} item: ${String(row.name ?? '')}`);
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-zinc-200 bg-white px-4 py-3">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold text-zinc-900">Items / SKU Catalog</h1>
          <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
            {activeCount} active
          </span>
          {inactiveCount > 0 ? (
            <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-500">
              {inactiveCount} inactive
            </span>
          ) : null}
        </div>
        <div className="flex gap-2">
          {canWrite ? (
            <button
              onClick={() => setShowCreate(true)}
              className="btn-primary"
            >
              <Plus className="h-4 w-4" />
              New Item
            </button>
          ) : null}
        </div>
      </div>

      {/* Create form panel */}
      {showCreate ? (
        <div className="border-b border-zinc-200 bg-zinc-50 px-4 py-4" role="region" aria-label="Create new item">
          <h2 className="mb-3 text-sm font-semibold text-zinc-700">New Item / SKU</h2>
          <div className="flex flex-wrap items-end gap-3">
            <label className="field-inline">
              Name *
              <input
                className="input compact"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                placeholder="Item name"
                autoFocus
              />
            </label>
            <label className="field-inline">
              Category
              <select className="select" value={createCategory} onChange={(e) => setCreateCategory(e.target.value)}>
                {CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </label>
            <label className="field-inline">
              Alias (customer-facing)
              <input
                className="input compact"
                value={createAlias}
                onChange={(e) => setCreateAlias(e.target.value)}
                placeholder="e.g. Sunset OG"
              />
            </label>
            <label className="field-inline">
              Tags
              <input
                className="input compact"
                value={createTags}
                onChange={(e) => setCreateTags(e.target.value)}
                placeholder="indoor, premium"
              />
            </label>
            <label className="field-inline grow">
              Description
              <input
                className="input compact"
                value={createDescription}
                onChange={(e) => setCreateDescription(e.target.value)}
                placeholder="Brief description"
              />
            </label>
            <div className="flex gap-2">
              <button className="primary-button" type="button" disabled={!createName.trim() || isRunning} onClick={handleCreate}>
                Create item
              </button>
              <button className="secondary-button" type="button" onClick={resetCreate}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Edit form panel */}
      {editingRow ? (
        <div className="border-b border-zinc-200 bg-amber-50 px-4 py-4" role="region" aria-label="Edit item">
          <h2 className="mb-3 text-sm font-semibold text-zinc-700">
            Edit: {String(editingRow.name ?? 'Item')}
            <span className="ml-2 font-mono text-xs font-normal text-zinc-400">{String(editingRow.sku ?? '')}</span>
          </h2>
          <div className="flex flex-wrap items-end gap-3">
            <label className="field-inline">
              Name
              <input
                className="input compact"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Item name"
              />
            </label>
            <label className="field-inline">
              Category
              <select className="select" value={editCategory} onChange={(e) => setEditCategory(e.target.value)}>
                {CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </label>
            <label className="field-inline">
              Alias
              <input
                className="input compact"
                value={editAlias}
                onChange={(e) => setEditAlias(e.target.value)}
                placeholder="Customer-facing alias"
              />
            </label>
            <label className="field-inline">
              Tags
              <input
                className="input compact"
                value={editTags}
                onChange={(e) => setEditTags(e.target.value)}
                placeholder="indoor, premium"
              />
            </label>
            <label className="field-inline grow">
              Description
              <input
                className="input compact"
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                placeholder="Brief description"
              />
            </label>
            <div className="flex gap-2">
              <button className="primary-button" type="button" disabled={isRunning} onClick={handleUpdate}>
                Save changes
              </button>
              <button className="secondary-button" type="button" onClick={resetEdit}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="flex-1">
        <OperatorGrid
          view="items"
          title="Items / SKU Catalog"
          rows={(grid.data ?? []) as GridRow[]}
          columns={columns}
          loading={grid.isLoading}
          isError={grid.isError}
          onRetry={() => grid.refetch()}
          selectionActions={(rows) => {
            const first = rows[0];
            if (!first) return null;
            return (
              <>
                {canWrite ? (
                  <button
                    className="secondary-button compact-action"
                    disabled={!first}
                    onClick={() => openEdit(first)}
                    type="button"
                  >
                    <Pencil className="h-4 w-4" />
                    Edit
                  </button>
                ) : null}
                {canManage ? (
                  <button
                    className="secondary-button compact-action"
                    disabled={!first}
                    onClick={() => handleToggleStatus(first)}
                    type="button"
                    title={String(first.status) === 'inactive' ? 'Activate this item' : 'Deactivate this item'}
                  >
                    {String(first.status) === 'inactive' ? (
                      <Power className="h-4 w-4" />
                    ) : (
                      <PowerOff className="h-4 w-4" />
                    )}
                    {String(first.status) === 'inactive' ? 'Activate' : 'Deactivate'}
                  </button>
                ) : null}
              </>
            );
          }}
        />
      </div>
    </div>
  );
}
