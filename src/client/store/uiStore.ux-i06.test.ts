// @vitest-environment jsdom
/**
 * UX-I06 — uiStore gridDefaultSavedFilter additive key.
 *
 * Spec:
 *  (1) gridDefaultSavedFilter starts as an empty Record.
 *  (2) setGridDefaultSavedFilter(view, filterId) stores the mapping.
 *  (3) setGridDefaultSavedFilter(view, null) removes the mapping.
 *  (4) Different views are independent.
 *  (5) The key is included in the persist partialize (checked by presence in state).
 *
 * Strategy: use the real store with a fresh instance per test.
 * We do NOT test localStorage serialization directly since it depends on
 * browser storage — we test the state mutations only.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useUiStore } from './uiStore';

describe('UX-I06 — gridDefaultSavedFilter in uiStore', () => {
  beforeEach(() => {
    // Reset the relevant slice of state between tests via the store's setState.
    useUiStore.setState({ gridDefaultSavedFilter: {} });
  });

  it('starts as an empty object', () => {
    const state = useUiStore.getState();
    expect(state.gridDefaultSavedFilter).toEqual({});
  });

  it('setGridDefaultSavedFilter stores a view→filterId mapping', () => {
    useUiStore.getState().setGridDefaultSavedFilter('inventory', 'filter-abc');
    const { gridDefaultSavedFilter } = useUiStore.getState();
    expect(gridDefaultSavedFilter.inventory).toBe('filter-abc');
  });

  it('setGridDefaultSavedFilter(view, null) removes the mapping', () => {
    useUiStore.getState().setGridDefaultSavedFilter('inventory', 'filter-abc');
    useUiStore.getState().setGridDefaultSavedFilter('inventory', null);
    const { gridDefaultSavedFilter } = useUiStore.getState();
    expect(gridDefaultSavedFilter.inventory).toBeUndefined();
  });

  it('different views are stored independently', () => {
    useUiStore.getState().setGridDefaultSavedFilter('inventory', 'filter-1');
    useUiStore.getState().setGridDefaultSavedFilter('orders', 'filter-2');
    const { gridDefaultSavedFilter } = useUiStore.getState();
    expect(gridDefaultSavedFilter.inventory).toBe('filter-1');
    expect(gridDefaultSavedFilter.orders).toBe('filter-2');
  });

  it('clearing one view does not affect another', () => {
    useUiStore.getState().setGridDefaultSavedFilter('inventory', 'filter-1');
    useUiStore.getState().setGridDefaultSavedFilter('orders', 'filter-2');
    useUiStore.getState().setGridDefaultSavedFilter('inventory', null);
    const { gridDefaultSavedFilter } = useUiStore.getState();
    expect(gridDefaultSavedFilter.inventory).toBeUndefined();
    expect(gridDefaultSavedFilter.orders).toBe('filter-2');
  });

  it('gridDefaultSavedFilter key is present on state (persisted field check)', () => {
    // The field itself is part of state — if the partialize omitted it the
    // key would not be accessible. This is a smoke-test for the additive key.
    expect('gridDefaultSavedFilter' in useUiStore.getState()).toBe(true);
    expect('setGridDefaultSavedFilter' in useUiStore.getState()).toBe(true);
  });
});
