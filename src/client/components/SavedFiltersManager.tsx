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
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const updateFilter = trpc.filters.updateFilter.useMutation({
    onSuccess: onFiltersChanged,
    onError: () => setUpdateError('Failed to rename filter. Please try again.'),
  });
  const deleteFilter = trpc.filters.deleteFilter.useMutation({
    onSuccess: onFiltersChanged,
    onError: () => setDeleteError('Failed to delete filter. Please try again.'),
  });

  function canEdit(filter: SavedFilterOutput): boolean {
    // Global filters require manager/owner role regardless of who created them.
    // The creator-owns check must NOT short-circuit for global filters.
    if (filter.isGlobal) return canManageGlobal;
    return filter.userId === currentUserId;
  }

  function startEdit(filter: SavedFilterOutput) {
    setEditingId(filter.id);
    setEditName(filter.name);
    setConfirmDeleteId(null);
    setUpdateError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditName('');
    setUpdateError(null);
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
    setDeleteError(null);
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
            <li key={filter.id} className="py-1">
              {editingId === filter.id ? (
                <>
                  <div className="flex items-center gap-2">
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
                  </div>
                  {updateError && (
                    <p className="text-xs text-red-600 mt-1">{updateError}</p>
                  )}
                </>
              ) : confirmDeleteId === filter.id ? (
                <>
                  <div className="flex items-center gap-2">
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
                      onClick={() => { setConfirmDeleteId(null); setDeleteError(null); }}
                      aria-label="Cancel"
                    >
                      Cancel
                    </button>
                  </div>
                  {deleteError && (
                    <p className="text-xs text-red-600 mt-1">{deleteError}</p>
                  )}
                </>
              ) : (
                <div className="flex items-center gap-2">
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
                </div>
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
