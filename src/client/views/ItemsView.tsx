import { Plus } from 'lucide-react';
import { useState } from 'react';
import { trpc } from '../api/trpc';
import { GridView } from '../templates/GridView';
import { FormDialog, FormField } from '../components/templates/FormDialog';
import { useCommandRunner } from '../components/useCommandRunner';
import type { GridRow } from '../../shared/types';
import { parseTagInput } from '../../shared/tags';

const CATEGORIES = ['Flower', 'Infused', 'Extract', 'Pre-roll', 'Vape', 'Edible', 'Other'];

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  active:   { label: 'Active',   cls: 'm-badge m-badge-ready' },
  inactive: { label: 'Inactive', cls: 'm-badge m-badge-neutral' }
};

export function ItemsView() {
  const reference = trpc.queries.reference.useQuery();
  const { runCommand, isRunning } = useCommandRunner();
  const me = trpc.auth.me.useQuery();
  const canWrite = me.data?.role !== 'viewer';
  const canManage = me.data?.role === 'manager' || me.data?.role === 'owner';

  const [showCreate, setShowCreate] = useState(false);
  const [editingRow, setEditingRow] = useState<GridRow | null>(null);
  /** Row staged for deactivation — opens the danger-tone confirmation dialog. */
  const [deactivatingRow, setDeactivatingRow] = useState<GridRow | null>(null);

  // Create form state
  const [createName, setCreateName] = useState('');
  const [createCategory, setCreateCategory] = useState('Flower');
  const [createAlias, setCreateAlias] = useState('');
  const [createTags, setCreateTags] = useState('');
  const [createDescription, setCreateDescription] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);

  // Edit form state
  const [editName, setEditName] = useState('');
  const [editCategory, setEditCategory] = useState('Flower');
  const [editAlias, setEditAlias] = useState('');
  const [editTags, setEditTags] = useState('');
  const [editDescription, setEditDescription] = useState('');

  const referenceItems: GridRow[] = (reference.data?.items ?? []) as GridRow[];
  const activeCount = referenceItems.filter((r) => String(r.status ?? '') !== 'inactive').length;
  const inactiveCount = referenceItems.filter((r) => String(r.status ?? '') === 'inactive').length;

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
    setCreateError(null);
    setShowCreate(false);
  }

  function resetEdit() {
    setEditingRow(null);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!createName.trim()) {
      setCreateError('Item name is required.');
      return;
    }
    setCreateError(null);
    await runCommand('createItem', {
      name: createName.trim(),
      category: createCategory,
      alias: createAlias.trim() || undefined,
      tags: parseTagInput(createTags),
      description: createDescription.trim() || undefined
    }, `Create item: ${createName.trim()}`);
    resetCreate();
  }

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
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

  async function handleConfirmDeactivate(e: React.FormEvent) {
    e.preventDefault();
    if (!deactivatingRow) return;
    const row = deactivatingRow;
    setDeactivatingRow(null);
    await runCommand('toggleItemStatus', {
      itemId: row.id
    }, `Deactivate item: ${String(row.name ?? '')}`);
  }

  async function handleActivate(row: GridRow) {
    await runCommand('toggleItemStatus', {
      itemId: row.id
    }, `Activate item: ${String(row.name ?? '')}`);
  }

  return (
    <div className="flex h-full flex-col">
      {/* ── Header with counts + New Item button ─────────────────────────── */}
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

      {/* ── Main grid — GridView template handles column defs, filtering, bulk actions, slide-over ── */}
      <div className="flex-1 min-h-0">
        <GridView viewKey="items" entityType="item" />
      </div>

      {/* ── Create Item dialog — UX-Q01 ──────────────────────────────────── */}
      {showCreate ? (
        <FormDialog
          title="New Item / SKU"
          onClose={resetCreate}
          onSubmit={handleCreate}
          submitLabel="Create item"
          pending={isRunning}
          submitDisabled={!createName.trim()}
          error={createError}
        >
          <FormField id="ci-name" label="Name *">
            <input
              id="ci-name"
              className="input"
              value={createName}
              onChange={(e) => { setCreateName(e.target.value); if (createError) setCreateError(null); }}
              placeholder="Item name"
              autoFocus
            />
          </FormField>
          <FormField id="ci-category" label="Category">
            <select
              id="ci-category"
              className="select"
              value={createCategory}
              onChange={(e) => setCreateCategory(e.target.value)}
            >
              {CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </FormField>
          <FormField id="ci-alias" label="Alias (customer-facing)">
            <input
              id="ci-alias"
              className="input"
              value={createAlias}
              onChange={(e) => setCreateAlias(e.target.value)}
              placeholder="e.g. Sunset OG"
            />
          </FormField>
          <FormField id="ci-tags" label="Tags">
            <input
              id="ci-tags"
              className="input"
              value={createTags}
              onChange={(e) => setCreateTags(e.target.value)}
              placeholder="indoor, premium"
            />
          </FormField>
          <FormField id="ci-description" label="Description">
            <input
              id="ci-description"
              className="input"
              value={createDescription}
              onChange={(e) => setCreateDescription(e.target.value)}
              placeholder="Brief description"
            />
          </FormField>
        </FormDialog>
      ) : null}

      {/* ── Edit Item dialog — UX-Q01 ────────────────────────────────────── */}
      {editingRow ? (
        <FormDialog
          title={`Edit: ${String(editingRow.name ?? 'Item')}`}
          onClose={resetEdit}
          onSubmit={handleUpdate}
          submitLabel="Save changes"
          pending={isRunning}
          description={
            editingRow.sku ? (
              <span className="font-mono text-xs text-zinc-400">{String(editingRow.sku)}</span>
            ) : undefined
          }
        >
          <FormField id="ei-name" label="Name">
            <input
              id="ei-name"
              className="input"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              placeholder="Item name"
            />
          </FormField>
          <FormField id="ei-category" label="Category">
            <select
              id="ei-category"
              className="select"
              value={editCategory}
              onChange={(e) => setEditCategory(e.target.value)}
            >
              {CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </FormField>
          <FormField id="ei-alias" label="Alias">
            <input
              id="ei-alias"
              className="input"
              value={editAlias}
              onChange={(e) => setEditAlias(e.target.value)}
              placeholder="Customer-facing alias"
            />
          </FormField>
          <FormField id="ei-tags" label="Tags">
            <input
              id="ei-tags"
              className="input"
              value={editTags}
              onChange={(e) => setEditTags(e.target.value)}
              placeholder="indoor, premium"
            />
          </FormField>
          <FormField id="ei-description" label="Description">
            <input
              id="ei-description"
              className="input"
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              placeholder="Brief description"
            />
          </FormField>
        </FormDialog>
      ) : null}

      {/* ── Deactivate confirmation dialog — UX-Q01 (tone='danger') ──────── */}
      {deactivatingRow ? (
        <FormDialog
          title="Deactivate Item"
          onClose={() => setDeactivatingRow(null)}
          onSubmit={handleConfirmDeactivate}
          submitLabel="Deactivate"
          pending={isRunning}
          tone="danger"
          description={
            <>
              Deactivate <strong>{String(deactivatingRow.name ?? 'this item')}</strong>? It will be hidden from new sales and finder results but will remain in historical records.
            </>
          }
        >
          {/* No extra fields — description + danger tone convey the consequence */}
          <span />
        </FormDialog>
      ) : null}
    </div>
  );
}
