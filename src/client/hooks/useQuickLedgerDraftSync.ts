import { useEffect, useRef, useState } from 'react';
import { trpc } from '../api/trpc';
import { useUiStore } from '../store/uiStore';
import type { LedgerDraft } from '../store/uiStore';

// UX-A04 / CAP-024 / Execution Decision 2 (docs/ux-audit-2026-06-12.md):
// server-side per-user Quick Ledger draft persistence.
//
// Drafts NEVER enter the localStorage partialize (uiStore.ts) — they carry
// counterparty names and amounts, the same PII class the shared-workstation
// rationale (PR #80/#89) keeps out of localStorage. The server row
// (user_view_drafts, viewKey 'quickLedger') is the ONLY durable home.
//
// Flow:
//  - load on mount → hydrate the store ONCE, and only when the local store is
//    still pristine (a single empty draft). If the operator typed before the
//    query resolved, local work wins and the next debounced save overwrites
//    the server copy (latest-writer-wins; drafts are single-operator state).
//  - every draft change after hydration schedules a debounced save.
//  - posting a row already removes the draft from the store, so the follow-up
//    debounced save clears it server-side too — no extra wiring needed.
//  - failures are surfaced truthfully via `status: 'error'` so the grid can
//    show a "drafts not synced" indicator instead of faking success.

export type LedgerDraftSyncStatus = 'loading' | 'synced' | 'saving' | 'error';

export const LEDGER_DRAFT_SAVE_DEBOUNCE_MS = 800;

/** A pristine working set = the single empty row the store seeds on init. */
export function isPristineDraftSet(drafts: LedgerDraft[]): boolean {
  if (drafts.length !== 1) return false;
  const draft = drafts[0];
  return draft.status === 'draft' && draft.amount === '' && draft.entityId === '' && draft.entityName === '' && draft.notes === '';
}

/** Server drafts worth hydrating = at least one row with operator-entered content. */
export function hasDraftContent(drafts: LedgerDraft[]): boolean {
  return drafts.some((draft) => draft.amount !== '' || draft.entityId !== '' || draft.entityName !== '' || draft.notes !== '');
}

export function useQuickLedgerDraftSync(): { status: LedgerDraftSyncStatus } {
  const ledgerDrafts = useUiStore((state) => state.ledgerDrafts);
  const setLedgerDrafts = useUiStore((state) => state.setLedgerDrafts);
  const query = trpc.queries.quickLedgerDrafts.useQuery(undefined, {
    refetchOnWindowFocus: false,
    staleTime: Infinity,
    retry: 1
  });
  const save = trpc.queries.saveQuickLedgerDrafts.useMutation();
  const saveRef = useRef(save);
  saveRef.current = save;

  const [hydrated, setHydrated] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  // Serialized form of the last server-confirmed draft set, so unchanged
  // states (including the post-hydration echo) don't trigger a save.
  const lastSyncedRef = useRef<string | null>(null);

  // Hydrate once on first load result (success OR error — on error we proceed
  // with local-only drafts and let `status` report the degraded mode).
  useEffect(() => {
    if (hydrated) return;
    if (query.isError) {
      setHydrated(true);
      return;
    }
    if (!query.isSuccess) return;
    const serverDrafts = (query.data?.drafts ?? null) as LedgerDraft[] | null;
    if (
      Array.isArray(serverDrafts) &&
      serverDrafts.length > 0 &&
      hasDraftContent(serverDrafts) &&
      isPristineDraftSet(useUiStore.getState().ledgerDrafts)
    ) {
      setLedgerDrafts(serverDrafts);
      lastSyncedRef.current = JSON.stringify(serverDrafts);
    }
    setHydrated(true);
  }, [hydrated, query.isSuccess, query.isError, query.data, setLedgerDrafts]);

  // Debounced save on any draft change after hydration.
  useEffect(() => {
    if (!hydrated) return;
    const serialized = JSON.stringify(ledgerDrafts);
    if (serialized === lastSyncedRef.current) return;
    const timer = setTimeout(() => {
      saveRef.current.mutate(
        { drafts: ledgerDrafts },
        {
          onSuccess: () => {
            lastSyncedRef.current = serialized;
            setSaveFailed(false);
          },
          onError: () => setSaveFailed(true)
        }
      );
    }, LEDGER_DRAFT_SAVE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [hydrated, ledgerDrafts]);

  const status: LedgerDraftSyncStatus =
    query.isError || saveFailed ? 'error' : save.isLoading ? 'saving' : !hydrated ? 'loading' : 'synced';
  return { status };
}
