// @vitest-environment jsdom
// UX-A04 / CAP-024 / Execution Decision 2: server-side per-user Quick Ledger
// draft sync — hydrate on load, debounced save on change, truthful error state.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';

const harness = vi.hoisted(() => ({
  queryState: { data: undefined as unknown, isSuccess: false, isError: false },
  mutate: vi.fn(),
  mutationState: { isLoading: false }
}));

vi.mock('../api/trpc', () => ({
  trpc: {
    queries: {
      quickLedgerDrafts: { useQuery: () => harness.queryState },
      saveQuickLedgerDrafts: { useMutation: () => ({ mutate: harness.mutate, isLoading: harness.mutationState.isLoading }) }
    }
  }
}));

import { useQuickLedgerDraftSync, isPristineDraftSet, hasDraftContent, LEDGER_DRAFT_SAVE_DEBOUNCE_MS } from './useQuickLedgerDraftSync';
import { useUiStore } from '../store/uiStore';
import type { LedgerDraft } from '../store/uiStore';

function pristineDraft(): LedgerDraft {
  return {
    id: 'local-pristine',
    date: '2026-06-12',
    direction: 'receiving',
    entityType: 'customer',
    entityId: '',
    entityName: '',
    transactionType: 'client_payment',
    allocationTargetType: 'fifo',
    allocationTargetId: '',
    amount: '',
    method: 'cash',
    bucket: 'cash-file-a',
    reference: '',
    notes: '',
    status: 'draft'
  };
}

function contentDraft(id = 'server-1'): LedgerDraft {
  return { ...pristineDraft(), id, amount: '125.50', entityId: '11111111-1111-1111-1111-111111111111' };
}

beforeEach(() => {
  vi.useFakeTimers();
  harness.queryState.data = undefined;
  harness.queryState.isSuccess = false;
  harness.queryState.isError = false;
  harness.mutate.mockReset();
  harness.mutationState.isLoading = false;
  useUiStore.setState({ ledgerDrafts: [pristineDraft()] });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useQuickLedgerDraftSync', () => {
  it('reports loading before the server query resolves', () => {
    const { result } = renderHook(() => useQuickLedgerDraftSync());
    expect(result.current.status).toBe('loading');
    expect(harness.mutate).not.toHaveBeenCalled();
  });

  it('hydrates a pristine store from server drafts and does not immediately re-save', () => {
    const serverDrafts = [contentDraft()];
    harness.queryState.data = { drafts: serverDrafts, updatedAt: '2026-06-12T10:00:00Z' };
    harness.queryState.isSuccess = true;
    const { result } = renderHook(() => useQuickLedgerDraftSync());
    expect(useUiStore.getState().ledgerDrafts).toEqual(serverDrafts);
    expect(result.current.status).toBe('synced');
    act(() => {
      vi.advanceTimersByTime(LEDGER_DRAFT_SAVE_DEBOUNCE_MS + 50);
    });
    // Hydrated state matches the server copy — no echo save.
    expect(harness.mutate).not.toHaveBeenCalled();
  });

  it('does not clobber local drafts the operator already started typing', () => {
    const localDraft = { ...pristineDraft(), id: 'local-typed', amount: '900' };
    useUiStore.setState({ ledgerDrafts: [localDraft] });
    harness.queryState.data = { drafts: [contentDraft()], updatedAt: null };
    harness.queryState.isSuccess = true;
    renderHook(() => useQuickLedgerDraftSync());
    expect(useUiStore.getState().ledgerDrafts).toEqual([localDraft]);
  });

  it('saves draft changes after the debounce window', () => {
    harness.queryState.data = { drafts: null, updatedAt: null };
    harness.queryState.isSuccess = true;
    renderHook(() => useQuickLedgerDraftSync());
    const changed = [contentDraft('local-changed')];
    act(() => {
      useUiStore.setState({ ledgerDrafts: changed });
    });
    expect(harness.mutate).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(LEDGER_DRAFT_SAVE_DEBOUNCE_MS + 50);
    });
    expect(harness.mutate).toHaveBeenCalledTimes(1);
    expect(harness.mutate.mock.calls[0][0]).toEqual({ drafts: changed });
  });

  it('reports error (not fake success) when a save fails', () => {
    harness.queryState.data = { drafts: null, updatedAt: null };
    harness.queryState.isSuccess = true;
    harness.mutate.mockImplementation((_input: unknown, opts: { onError: () => void }) => opts.onError());
    const { result } = renderHook(() => useQuickLedgerDraftSync());
    act(() => {
      useUiStore.setState({ ledgerDrafts: [contentDraft('local-fail')] });
    });
    act(() => {
      vi.advanceTimersByTime(LEDGER_DRAFT_SAVE_DEBOUNCE_MS + 50);
    });
    expect(result.current.status).toBe('error');
  });

  it('reports error when the initial load fails, but still allows local work', () => {
    harness.queryState.isError = true;
    const { result } = renderHook(() => useQuickLedgerDraftSync());
    expect(result.current.status).toBe('error');
    // Local edits still schedule saves (retry path once the server is back).
    act(() => {
      useUiStore.setState({ ledgerDrafts: [contentDraft('offline-typed')] });
    });
    act(() => {
      vi.advanceTimersByTime(LEDGER_DRAFT_SAVE_DEBOUNCE_MS + 50);
    });
    expect(harness.mutate).toHaveBeenCalledTimes(1);
  });
});

describe('draft-set predicates', () => {
  it('isPristineDraftSet is true only for the single empty seed row', () => {
    expect(isPristineDraftSet([pristineDraft()])).toBe(true);
    expect(isPristineDraftSet([contentDraft()])).toBe(false);
    expect(isPristineDraftSet([pristineDraft(), pristineDraft()])).toBe(false);
    expect(isPristineDraftSet([])).toBe(false);
  });

  it('hasDraftContent detects operator-entered content', () => {
    expect(hasDraftContent([pristineDraft()])).toBe(false);
    expect(hasDraftContent([pristineDraft(), contentDraft()])).toBe(true);
    expect(hasDraftContent([{ ...pristineDraft(), notes: 'call back' }])).toBe(true);
  });
});
