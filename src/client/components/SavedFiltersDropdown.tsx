import React from 'react';
import { SavedFilterOutput } from '../../shared/filterSchemas';

interface SavedFiltersDropdownProps {
  savedFilters: SavedFilterOutput[];
  selectedId: string | null;
  onSelect: (filterId: string) => void;
}

export function SavedFiltersDropdown({ savedFilters, selectedId, onSelect }: SavedFiltersDropdownProps) {
  const globalFilters = savedFilters.filter(f => f.isGlobal);
  const personalFilters = savedFilters.filter(f => !f.isGlobal);

  // Top 5 filters sorted by most-recently updated for quick-access chips
  const chipFilters = [...savedFilters]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 5);

  return (
    <div className="flex flex-col gap-1.5">
      {chipFilters.length > 0 && (
        <div className="finder-chip-row" role="group" aria-label="Quick-access saved filters">
          {chipFilters.map(filter => (
            <button
              key={filter.id}
              type="button"
              className={selectedId === filter.id ? 'finder-chip success' : 'finder-chip'}
              aria-pressed={selectedId === filter.id}
              onClick={() => onSelect(filter.id)}
            >
              {filter.name}
            </button>
          ))}
        </div>
      )}
      <select
        className="saved-filters-dropdown"
        aria-label="Load saved filter"
        value={selectedId ?? ''}
        onChange={(e) => e.target.value && onSelect(e.target.value)}
      >
        <option value="">Load saved filter...</option>

        {globalFilters.length > 0 && (
          <optgroup label="Global Filters">
            {globalFilters.map(filter => (
              <option key={filter.id} value={filter.id}>
                {filter.name} {filter.description && `- ${filter.description}`}
              </option>
            ))}
          </optgroup>
        )}

        {personalFilters.length > 0 && (
          <optgroup label="My Filters">
            {personalFilters.map(filter => (
              <option key={filter.id} value={filter.id}>
                {filter.name} {filter.description && `- ${filter.description}`}
              </option>
            ))}
          </optgroup>
        )}
      </select>
    </div>
  );
}
