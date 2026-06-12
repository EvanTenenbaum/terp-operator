// @vitest-environment jsdom
/**
 * UX-C02 — Quick Ledger TSV paste wiring.
 *
 * Contract:
 * - Pasting a TSV string onto the workbench inserts draft money rows.
 * - Column order: counterparty, amount, method, memo.
 * - Header rows (first row whose cells match known field names) are skipped.
 * - Invalid amount (non-numeric / zero / negative) → row.status = 'needs_fix'.
 * - Invalid method (not in the allowed list) → row.status = 'needs_fix'.
 * - Valid rows land with status = 'draft', never 'posted'.
 * - A summary toast "N rows pasted, M need fixes" is shown after paste.
 * - Paste is additive — existing drafts are preserved.
 * - Paste target: the .transaction-ledger-workbench container (or descendant).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';

vi.mock('./useCommandRunner', () => ({
  useCommandRunner: () => ({ runCommand: vi.fn(), isRunning: false })
}));

vi.mock('../hooks/useQuickLedgerDraftSync', () => ({
  useQuickLedgerDraftSync: () => ({ status: 'synced' })
}));

vi.mock('../api/trpc', () => {
  const empty = () => ({ data: undefined, isLoading: false });
  const emptyMutation = () => ({ mutate: vi.fn(), isLoading: false });
  const procProxy: unknown = new Proxy(
    {},
    {
      get(_t, _p: string) {
        return { useQuery: empty, useMutation: emptyMutation };
      }
    }
  );
  return {
    trpc: {
      auth: { me: { useQuery: () => ({ data: { id: 'u-1', role: 'owner' } }) } },
      queries: procProxy
    }
  };
});

import { QuickLedgerGrid } from './QuickLedgerGrid';
import { useUiStore } from '../store/uiStore';

// ── helpers ──────────────────────────────────────────────────────────────────

function firePaste(target: Element, text: string) {
  fireEvent.paste(target, {
    clipboardData: {
      getData: (type: string) => (type === 'text/plain' ? text : '')
    }
  });
}

function workbench() {
  return document.querySelector('.transaction-ledger-workbench') as HTMLElement;
}

// ── setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  // Reset store to a clean single receiving draft so tests start fresh.
  useUiStore.setState({
    ledgerDrafts: [],
    toasts: []
  });
});

// ── tests ────────────────────────────────────────────────────────────────────

describe('QuickLedgerGrid TSV paste (UX-C02)', () => {
  it('inserts draft rows from a valid two-row TSV paste', () => {
    render(<QuickLedgerGrid />);

    firePaste(workbench(), 'Acme Corp\t100.00\tcash\tFirst payment\nBeta LLC\t250.50\tcheck\t');

    const drafts = useUiStore.getState().ledgerDrafts;
    const pasted = drafts.filter((d) => d.entityType === 'other');
    expect(pasted).toHaveLength(2);

    const acme = pasted.find((d) => d.entityName === 'Acme Corp');
    expect(acme).toBeDefined();
    expect(acme?.amount).toBe('100.00');
    expect(acme?.method).toBe('cash');
    expect(acme?.notes).toBe('First payment');
    expect(acme?.status).toBe('draft');

    const beta = pasted.find((d) => d.entityName === 'Beta LLC');
    expect(beta).toBeDefined();
    expect(beta?.amount).toBe('250.50');
    expect(beta?.method).toBe('check');
    expect(beta?.status).toBe('draft');
  });

  it('flags rows with a non-numeric amount as needs_fix', () => {
    render(<QuickLedgerGrid />);

    firePaste(workbench(), 'Bad Row\tnot-a-number\tcash\tcheck invoice #9');

    const drafts = useUiStore.getState().ledgerDrafts;
    const pasted = drafts.filter((d) => d.entityType === 'other');
    expect(pasted).toHaveLength(1);
    expect(pasted[0].status).toBe('needs_fix');
  });

  it('flags rows with a zero or negative amount as needs_fix', () => {
    render(<QuickLedgerGrid />);

    firePaste(workbench(), 'Row A\t0\tcash\tpayment one\nRow B\t-50\tcash\tpayment two');

    const drafts = useUiStore.getState().ledgerDrafts;
    const pasted = drafts.filter((d) => d.entityType === 'other');
    expect(pasted).toHaveLength(2);
    expect(pasted[0].status).toBe('needs_fix');
    expect(pasted[1].status).toBe('needs_fix');
  });

  it('flags rows with an unrecognised method as needs_fix', () => {
    render(<QuickLedgerGrid />);

    firePaste(workbench(), 'Vendor X\t75.00\twire\tpayment note');

    const drafts = useUiStore.getState().ledgerDrafts;
    const pasted = drafts.filter((d) => d.entityType === 'other');
    expect(pasted[0].status).toBe('needs_fix');
  });

  it('shows a summary toast with total and error counts after paste', () => {
    render(<QuickLedgerGrid />);

    firePaste(workbench(), 'Good\t100\tcash\t\nBad\tabc\tcash\t');

    const toasts = useUiStore.getState().toasts;
    expect(toasts.length).toBeGreaterThan(0);
    const toast = toasts[toasts.length - 1];
    expect(toast.message).toMatch(/2 rows pasted/i);
    expect(toast.message).toMatch(/1 need/i);
  });

  it('shows a clean summary toast when all rows are valid', () => {
    render(<QuickLedgerGrid />);

    firePaste(workbench(), 'Alice\t100\tcash\tNote');

    const toasts = useUiStore.getState().toasts;
    const toast = toasts[toasts.length - 1];
    expect(toast.message).toMatch(/1 row pasted/);
    expect(toast.message).not.toMatch(/fix/i);
  });

  it('skips a TSV header row when first row cells match known field names', () => {
    render(<QuickLedgerGrid />);

    firePaste(workbench(), 'counterparty\tamount\tmethod\tmemo\nAlpha Inc\t300\tother\t');

    const drafts = useUiStore.getState().ledgerDrafts;
    const pasted = drafts.filter((d) => d.entityType === 'other');
    // Header row skipped → only 1 data row inserted.
    expect(pasted).toHaveLength(1);
    expect(pasted[0].entityName).toBe('Alpha Inc');
  });

  it('does not auto-post pasted rows (status is never "posted")', () => {
    render(<QuickLedgerGrid />);

    firePaste(workbench(), 'Safe Corp\t500\tcash\tSafe note');

    const drafts = useUiStore.getState().ledgerDrafts;
    const pasted = drafts.filter((d) => d.entityType === 'other');
    expect(pasted.every((d) => d.status !== 'posted')).toBe(true);
  });

  it('is additive — existing drafts are preserved after paste', () => {
    const preExistingId = 'pre-existing-draft-id';
    useUiStore.setState({
      ledgerDrafts: [{
        id: preExistingId,
        date: '2026-01-01',
        direction: 'receiving',
        entityType: 'customer',
        entityId: 'cust-1',
        entityName: '',
        transactionType: 'client_payment',
        allocationTargetType: 'fifo',
        allocationTargetId: '',
        amount: '1000',
        method: 'cash',
        bucket: 'cash-file-a',
        reference: '',
        notes: '',
        status: 'draft',
        processorId: '',
        grossAmount: '',
        processingFeeTotal: '',
        userSplitPercent: ''
      }]
    });

    render(<QuickLedgerGrid />);
    firePaste(workbench(), 'New Entity\t50\tcash\t');

    const drafts = useUiStore.getState().ledgerDrafts;
    expect(drafts.some((d) => d.id === preExistingId)).toBe(true);
    expect(drafts.filter((d) => d.entityType === 'other')).toHaveLength(1);
  });

  it('ignores paste events outside the workbench (no new drafts added)', () => {
    render(<QuickLedgerGrid />);
    const initialCount = useUiStore.getState().ledgerDrafts.length;

    // Fire paste on body (outside the workbench).
    firePaste(document.body, 'External\t100\tcash\tMemo');

    expect(useUiStore.getState().ledgerDrafts.length).toBe(initialCount);
  });

  it('maps method column to bucket when value matches a bucket token', () => {
    render(<QuickLedgerGrid />);

    // "accounting" is a valid bucket but not a valid method → should still produce a valid row
    // because the column is mapped as method/bucket (if method invalid try as bucket, else needs_fix).
    firePaste(workbench(), 'Org\t200\taccounting\tNote');

    const drafts = useUiStore.getState().ledgerDrafts;
    const pasted = drafts.filter((d) => d.entityType === 'other');
    expect(pasted).toHaveLength(1);
    // bucket accepted as bucket value, method falls back to 'cash' (default)
    expect(pasted[0].bucket).toBe('accounting');
    expect(pasted[0].method).toBe('cash');
    expect(pasted[0].status).toBe('draft');
  });

  it('pasted rows use "receiving" direction and "other" entity type by default', () => {
    render(<QuickLedgerGrid />);

    firePaste(workbench(), 'Someone\t100\tcash\t');

    const drafts = useUiStore.getState().ledgerDrafts;
    const pasted = drafts.filter((d) => d.entityType === 'other');
    expect(pasted[0].direction).toBe('receiving');
    expect(pasted[0].entityType).toBe('other');
  });
});
