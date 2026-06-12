// @vitest-environment jsdom
/**
 * UX-I06 — SavedFiltersManager "Set as my default" star button.
 *
 * Spec:
 *  (1) Personal filter owned by currentUser shows a star (StarOff initially).
 *  (2) Clicking the star calls setGridDefaultSavedFilter(view, filterId).
 *  (3) When the filter IS the current default, shows a filled Star + call to clear.
 *  (4) Global filters do NOT show the star button.
 *  (5) Personal filters owned by another user do NOT show the star button.
 *  (6) When view prop is omitted, no star button is shown.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import type { SavedFilterOutput } from '../../shared/filterSchemas';

// ── trpc mock ────────────────────────────────────────────────────────────────
vi.mock('../api/trpc', () => ({
  trpc: {
    filters: {
      updateFilter: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
      deleteFilter: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) }
    }
  }
}));

// ── uiStore mock ──────────────────────────────────────────────────────────────
const mockSetGridDefaultSavedFilter = vi.fn();
let mockGridDefaultSavedFilter: Record<string, string> = {};

vi.mock('../store/uiStore', () => ({
  useUiStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      gridDefaultSavedFilter: mockGridDefaultSavedFilter,
      setGridDefaultSavedFilter: mockSetGridDefaultSavedFilter
    })
}));

import { SavedFiltersManager } from './SavedFiltersManager';

const CURRENT_USER = 'user-1';
const OTHER_USER = 'user-2';

function makeFilter(overrides: Partial<SavedFilterOutput>): SavedFilterOutput {
  return {
    id: 'filter-1',
    name: 'My filter',
    userId: CURRENT_USER,
    isGlobal: false,
    targetView: 'inventory',
    filterDefinition: { logic: 'AND', conditions: [] } as unknown as SavedFilterOutput['filterDefinition'],
    description: undefined,
    schemaVersion: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: null,
    updatedBy: null,
    ...overrides
  };
}

describe('UX-I06 — SavedFiltersManager default-filter star button', () => {
  beforeEach(() => {
    mockSetGridDefaultSavedFilter.mockClear();
    mockGridDefaultSavedFilter = {};
  });

  it('shows star button for personal filter owned by currentUser when view provided', () => {
    const filter = makeFilter({});
    render(
      <SavedFiltersManager
        savedFilters={[filter]}
        currentUserId={CURRENT_USER}
        canManageGlobal={false}
        onFiltersChanged={vi.fn()}
        view="inventory"
      />
    );
    // Star button should be present (either StarOff or Star icon)
    const starBtn = screen.getByRole('button', { name: /set.*default|clear.*default/i });
    expect(starBtn).toBeTruthy();
  });

  it('clicking unset star calls setGridDefaultSavedFilter with filterId', () => {
    const filter = makeFilter({ id: 'filter-abc' });
    render(
      <SavedFiltersManager
        savedFilters={[filter]}
        currentUserId={CURRENT_USER}
        canManageGlobal={false}
        onFiltersChanged={vi.fn()}
        view="inventory"
      />
    );
    const starBtn = screen.getByRole('button', { name: /set.*default/i });
    fireEvent.click(starBtn);
    expect(mockSetGridDefaultSavedFilter).toHaveBeenCalledWith('inventory', 'filter-abc');
  });

  it('shows "clear" label when filter is the current default', () => {
    mockGridDefaultSavedFilter = { inventory: 'filter-abc' };
    const filter = makeFilter({ id: 'filter-abc' });
    render(
      <SavedFiltersManager
        savedFilters={[filter]}
        currentUserId={CURRENT_USER}
        canManageGlobal={false}
        onFiltersChanged={vi.fn()}
        view="inventory"
      />
    );
    const starBtn = screen.getByRole('button', { name: /clear.*default/i });
    expect(starBtn).toBeTruthy();
  });

  it('clicking star on current default calls setGridDefaultSavedFilter with null', () => {
    mockGridDefaultSavedFilter = { inventory: 'filter-abc' };
    const filter = makeFilter({ id: 'filter-abc' });
    render(
      <SavedFiltersManager
        savedFilters={[filter]}
        currentUserId={CURRENT_USER}
        canManageGlobal={false}
        onFiltersChanged={vi.fn()}
        view="inventory"
      />
    );
    const starBtn = screen.getByRole('button', { name: /clear.*default/i });
    fireEvent.click(starBtn);
    expect(mockSetGridDefaultSavedFilter).toHaveBeenCalledWith('inventory', null);
  });

  it('does NOT show star button for global filters', () => {
    const filter = makeFilter({ isGlobal: true });
    render(
      <SavedFiltersManager
        savedFilters={[filter]}
        currentUserId={CURRENT_USER}
        canManageGlobal={true}
        onFiltersChanged={vi.fn()}
        view="inventory"
      />
    );
    const starBtns = screen.queryAllByRole('button', { name: /default/i });
    expect(starBtns.length).toBe(0);
  });

  it('does NOT show star button for filters owned by another user', () => {
    const filter = makeFilter({ userId: OTHER_USER });
    render(
      <SavedFiltersManager
        savedFilters={[filter]}
        currentUserId={CURRENT_USER}
        canManageGlobal={false}
        onFiltersChanged={vi.fn()}
        view="inventory"
      />
    );
    const starBtns = screen.queryAllByRole('button', { name: /default/i });
    expect(starBtns.length).toBe(0);
  });

  it('does NOT show star button when view prop is omitted', () => {
    const filter = makeFilter({});
    render(
      <SavedFiltersManager
        savedFilters={[filter]}
        currentUserId={CURRENT_USER}
        canManageGlobal={false}
        onFiltersChanged={vi.fn()}
      />
    );
    const starBtns = screen.queryAllByRole('button', { name: /default/i });
    expect(starBtns.length).toBe(0);
  });
});
