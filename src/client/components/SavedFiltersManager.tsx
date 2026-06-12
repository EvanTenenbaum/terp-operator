import React, { useState } from 'react';
import { Pencil, Trash2, Check, X, Star, StarOff } from 'lucide-react';
import { trpc } from '../api/trpc';
import type { SavedFilterOutput } from '../../shared/filterSchemas';
import { useUiStore } from '../store/uiStore';
import type { ViewKey } from '../../shared/types';

interface SavedFiltersManagerProps {
  savedFilters: SavedFilterOutput[];
  currentUserId: string | undefined;
  canManageGlobal: boolean;
  onFiltersChanged: () => void;
  /** UX-I06: which view this manager panel is scoped to, for default-setting. */
  view?: ViewKey;
}

export function SavedFiltersManager({
  savedFilters,
  currentUserId,
  canManageGlobal,
  onFiltersChanged,
  view,
}: SavedFiltersManagerProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // UX-I06: read/write the per-view default saved-filter from the uiStore.
  const gridDefaultSavedFilter = useUiStore((state) => state.gridDefaultSavedFilter);
  const setGridDefaultSavedFilter = useUiStore((state) => state.setGridDefaultSavedFilter);
  const currentDefault = view ? (gridDefaultSavedFilter[view] ?? null) : null;

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
    // If deleting the current default, clear it.
    if (view && currentDefault === filterId) {
      setGridDefaultSavedFilter(view, null);
    }
    setConfirmDeleteId(null);
  }

  // UX-I06: toggle default — clicking the star on the current default clears it;
  // clicking a non-default sets it. Only personal filters (or global ones that the
  // user can edit) support being set as a default; no server mutation needed since
  // this is a per-user client-side preference.
  function toggleDefault(filterId: string) {
    if (!view) return;
    if (currentDefault === filterId) {
      setGridDefaultSavedFilter(view, null);
    } else {
      setGridDefaultSavedFilter(view, filterId);
    }
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
          {filters.map((filter) => {
            const isDefault = currentDefault === filter.id;
            return (
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
                    {/* UX-I06: "Set as my default" star button (personal filters only, scoped per view) */}
                    {view && !filter.isGlobal && filter.userId === currentUserId ? (
                      <button
                        type="button"
                        className="icon-button"
                        onClick={() => toggleDefault(filter.id)}
                        aria-label={isDefault ? `Clear default filter for this view` : `Set "${filter.name}" as my default filter for this view`}
                        title={isDefault ? 'Clear my default for this view' : 'Set as my default for this view'}
                      >
                        {isDefault ? (
                          <Star size={14} aria-hidden className="text-amber-500" />
                        ) : (
                          <StarOff size={14} aria-hidden className="text-zinc-400" />
                        )}
                      </button>
                    ) : null}
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
            );
          })}
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
