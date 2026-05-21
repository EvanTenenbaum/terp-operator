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

  return (
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
  );
}
