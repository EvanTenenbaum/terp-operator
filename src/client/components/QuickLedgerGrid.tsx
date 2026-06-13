import { Check, ChevronDown, ChevronRight, Plus, RotateCcw, SlidersHorizontal, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useFocusTrap } from '../hooks/useFocusTrap';
// UX-A04 / CAP-024 / Execution Decision 2: server-side per-user draft sync.
import { useQuickLedgerDraftSync } from '../hooks/useQuickLedgerDraftSync';
import { trpc } from '../api/trpc';
import { useUiStore } from '../store/uiStore';
import type { LedgerDraft, LedgerDirection, LedgerEntityType } from '../store/uiStore';
import type { GridRow } from '../../shared/types';
import { useCommandRunner } from './useCommandRunner';
import { WorkspacePanel } from './WorkspacePanel';
import { formatMoney } from '../utils/format';
// UX-C02: TSV clipboard paste utilities.
import { parseTsv, mapTsvToFields, pasteSummary } from '../utils/clipboardPaste';

interface PostedLedgerRow {
  id: string;
  sourceType: string;
  sourceId: string;
  direction: LedgerDirection;
  date: string;
  entityId: string | null;
  entityType: LedgerEntityType;
  entityLabel: string;
  amount: string | number;
  method: string;
  bucket: string;
  transactionType: string;
  allocationIntent: string;
  allocationTargetLabel: string;
  reference: string | null;
  notes: string | null;
  status: string;
  impactPreview: string | null;
  commandId: string | null;
}

// UX-J04: shape returned by queries.paymentAllocationPreview — the server's
// own FIFO walk over open invoices (order by created_at, the exact ordering
// commandBus.ts allocatePayment uses).
export interface AllocationPreviewData {
  kind: string;
  label: string;
  rows: Array<{ invoiceId: string; invoiceNo: string; open: string; applied: string }>;
  unapplied: string;
}

interface TransactionTypeOption {
  id: string;
  slug: string;
  label: string;
  direction: LedgerDirection;
  allowedEntityTypes: LedgerEntityType[];
  defaultMethod: string | null;
  defaultBucket: string | null;
  defaultAllocationIntent: string | null;
  requiresApproval: boolean;
  isSystem: boolean;
}

interface TypeDraft {
  label: string;
  direction: LedgerDirection;
  allowedEntityTypes: LedgerEntityType[];
  defaultMethod: string;
  defaultBucket: string;
  defaultAllocationIntent: string;
  requiresApproval: boolean;
}

// TER-1661: payment methods simplified to cash, check, other. The legacy
// values ('card', 'crypto', 'wire') are no longer offered to operators —
// historical rows were migrated to 'other' by migrations/0074. 'journal'
// remains for non-payment ledger entries.
const methods = ['cash', 'check', 'other', 'journal'];
const buckets = ['cash-file-a', 'cash-file-b', 'office', 'accounting', 'crypto-wallet', 'wire-clearing'];
const entityTypes: LedgerEntityType[] = ['customer', 'vendor', 'referee', 'staff', 'processor', 'other'];
const processorTransactionTypes = ['crypto_payment_in', 'crypto_cashout', 'check_payment_in'];
const blankId = '00000000-0000-0000-0000-000000000000';

// Client-side processor fee calculations (duplicated from server for UI calculations)
function calculateProcessingFeeClient(
  amount: number,
  processor: { feeType: string; feePercentage: string | null; feeFixedAmount: string | null }
): number {
  const feePercentage = processor.feePercentage ? Number(processor.feePercentage) : 0;
  const feeFixedAmount = processor.feeFixedAmount ? Number(processor.feeFixedAmount) : 0;

  switch (processor.feeType) {
    case 'percentage':
      return Math.round((amount * feePercentage / 100) * 100) / 100;
    case 'fixed':
      return feeFixedAmount;
    case 'hybrid':
      const percentPart = Math.round((amount * feePercentage / 100) * 100) / 100;
      return percentPart + feeFixedAmount;
    default:
      return 0;
  }
}

function splitProcessingFeeClient(
  feeTotal: number,
  userSplitPercent: number
): { userShare: number; processorShare: number } {
  const userShare = Math.round((feeTotal * userSplitPercent / 100) * 100) / 100;
  const processorShare = Math.round((feeTotal - userShare) * 100) / 100;
  return { userShare, processorShare };
}

function calculateCustomerCreditClient(
  grossAmount: number,
  processorFeeShare: number,
  userFeeShare: number
): number {
  return Math.round((grossAmount - processorFeeShare - userFeeShare) * 100) / 100;
}

export function QuickLedgerGrid() {
  const reference = trpc.queries.reference.useQuery();
  const transactionLedger = trpc.queries.transactionLedger.useQuery();
  const vendorBills = trpc.queries.grid.useQuery({ view: 'vendors' });
  const me = trpc.auth.me.useQuery();
  const { runCommand, isRunning } = useCommandRunner();
  const [collapsed, setCollapsed] = useState<Record<LedgerDirection, boolean>>({ receiving: false, paying: false });
  // CAP-024: Drafts lifted to uiStore so they survive route changes.
  const activeQuickLaunch = useUiStore((state) => state.activeQuickLaunch);
  const ledgerDrafts = useUiStore((state) => state.ledgerDrafts);
  const setLedgerDrafts = useUiStore((state) => state.setLedgerDrafts);
  const upsertLedgerDraft = useUiStore((state) => state.upsertLedgerDraft);
  const removeLedgerDraft = useUiStore((state) => state.removeLedgerDraft);
  const pushToast = useUiStore((state) => state.pushToast);
  // Alias for ergonomics inside this file — same reference.
  const drafts = ledgerDrafts;
  // UX-A04 / CAP-024 / Execution Decision 2: load server drafts on mount,
  // debounced save on change. Server is the ONLY persistence (drafts stay out
  // of the localStorage partialize — shared-workstation PII rationale).
  const draftSync = useQuickLedgerDraftSync();
  // activeRowId remains local — it's ephemeral focus state, not worth persisting.
  const [activeRowId, setActiveRowId] = useState(drafts[0]?.id ?? '');

  // Issue 2: when activeQuickLaunch switches to/from moneyOut, reset the sole
  // pristine draft to the matching direction so the grid opens on the right side.
  useEffect(() => {
    const expectedDirection = activeQuickLaunch === 'moneyOut' ? 'paying' : 'receiving';
    if (
      ledgerDrafts.length === 1 &&
      ledgerDrafts[0].direction !== expectedDirection &&
      ledgerDrafts[0].amount === '' &&
      ledgerDrafts[0].status === 'draft'
    ) {
      setLedgerDrafts([makeRow(expectedDirection)]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeQuickLaunch]);
  const [typeDrawerOpen, setTypeDrawerOpen] = useState(false);
  const [typeDraft, setTypeDraft] = useState<TypeDraft>(() => makeTypeDraft('paying'));

  // K6 (phase7-keyboard-a11y-audit): Trap focus inside the custom transaction type drawer.
  const typeDrawerRef = useFocusTrap<HTMLElement>(typeDrawerOpen, () => setTypeDrawerOpen(false));

  const bills = (vendorBills.data ?? []) as GridRow[];
  const openBills = useMemo(() => bills.filter((bill) => Number(bill.amount ?? 0) - Number(bill.amountPaid ?? 0) > 0), [bills]);
  const typeOptions = (reference.data?.transactionTypes ?? []) as TransactionTypeOption[];
  const posted = (transactionLedger.data ?? { receiving: [], paying: [] }) as { receiving: PostedLedgerRow[]; paying: PostedLedgerRow[] };
  const canPostLedgerRow = ['owner', 'manager'].includes(me.data?.role ?? '');

  const activeRow = drafts.find((row) => row.id === activeRowId);
  const preview = trpc.queries.paymentAllocationPreview.useQuery(
    {
      customerId: activeRow?.entityType === 'customer' ? activeRow.entityId || blankId : blankId,
      amount: Number(activeRow?.amount || 0),
      invoiceId: activeRow?.allocationTargetType === 'selected_invoice' && activeRow.allocationTargetId ? activeRow.allocationTargetId : undefined,
      allocationIntent: activeRow?.allocationTargetType === 'selected_invoice' ? 'selected' : activeRow?.allocationTargetType === 'unapplied' ? 'unapplied' : 'fifo'
    },
    { enabled: Boolean(activeRow?.entityType === 'customer' && activeRow.entityId && activeRow.direction === 'receiving') }
  );

  function addRow(direction: LedgerDirection) {
    const row = makeRow(direction);
    setLedgerDrafts([row, ...drafts]);
    setActiveRowId(row.id);
    setCollapsed((current) => ({ ...current, [direction]: false }));
  }

  function updateRow(id: string, patch: Partial<LedgerDraft>) {
    const updated = drafts.map((row) => {
      if (row.id !== id) return row;
      const next = { ...row, ...patch, status: row.status === 'posted' ? row.status : 'draft' as const, issue: undefined };
      if (patch.direction || patch.entityType) {
        const direction = patch.direction ?? row.direction;
        const entityType = patch.entityType ?? row.entityType;
        next.transactionType = defaultTransactionType(direction, entityType);
        next.allocationTargetType = defaultAllocationTarget(direction, entityType, next.transactionType);
        next.allocationTargetId = '';
        next.entityId = patch.entityType ? '' : next.entityId;
        next.entityName = patch.entityType ? '' : next.entityName;
        next.method = 'cash';
        next.bucket = direction === 'paying' ? 'accounting' : 'cash-file-a';
      }
      if (patch.transactionType) {
        const selectedType = typeOptions.find((option) => option.slug === patch.transactionType);
        next.method = selectedType?.defaultMethod ?? next.method;
        next.bucket = selectedType?.defaultBucket ?? next.bucket;
        next.allocationTargetType = selectedType?.defaultAllocationIntent ?? defaultAllocationTarget(next.direction, next.entityType, patch.transactionType);
        next.allocationTargetId = '';
      }
      return next;
    });
    setLedgerDrafts(updated);
    setActiveRowId(id);
  }

  async function commit(row: LedgerDraft) {
    const issue = validate(row, reference.data);
    if (issue) {
      mark(row.id, { status: 'needs_fix', issue });
      return;
    }

    const result = await runCommand(
      'postTransactionLedgerRow',
      {
        direction: row.direction,
        entityType: row.entityType,
        entityId: row.entityId || undefined,
        entityName: row.entityName || undefined,
        transactionType: row.transactionType,
        allocationTargetType: row.allocationTargetType,
        allocationTargetId: row.allocationTargetId || undefined,
        date: row.date,
        method: row.method,
        bucket: row.bucket,
        amount: Number(row.amount),
        reference: row.reference,
        notes: row.notes
      },
      `${row.direction === 'receiving' ? 'Receiving' : 'Paying'} ledger: post row`
    );
    if (result.ok) {
      const replacement = makeRow(row.direction);
      // Issue 1: use atomic store actions so concurrent drafts added while the
      // command was in-flight are not silently dropped by a stale `drafts` snapshot.
      removeLedgerDraft(row.id);
      upsertLedgerDraft(replacement);
      setActiveRowId(replacement.id);
      setCollapsed((current) => ({ ...current, [row.direction]: false }));
      return;
    }
    mark(row.id, { status: 'needs_fix', issue: result.toast });
  }

  async function saveType() {
    const label = typeDraft.label.trim();
    if (!label) return;
    const result = await runCommand(
      'upsertTransactionType',
      {
        label,
        direction: typeDraft.direction,
        allowedEntityTypes: typeDraft.allowedEntityTypes,
        defaultMethod: typeDraft.defaultMethod,
        defaultBucket: typeDraft.defaultBucket,
        defaultAllocationIntent: typeDraft.defaultAllocationIntent,
        requiresApproval: typeDraft.requiresApproval
      },
      'Payment entry: save custom type'
    );
    if (result.ok) {
      setTypeDraft(makeTypeDraft(typeDraft.direction));
      setTypeDrawerOpen(false);
    }
  }

  function mark(id: string, patch: Partial<LedgerDraft>) {
    setLedgerDrafts(drafts.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }

  // UX-C02: TSV paste — map clipboard rows onto LedgerDraft objects.
  // Column order: counterparty, amount, method/bucket, memo.
  // A row with a header-matching first row is automatically skipped.
  // Amount must be a positive finite number; method must be in the allowed
  // list or recognised as a bucket alias. Invalid cells set status=needs_fix.
  // Pasted rows are prepended to existing drafts (additive, never auto-post).
  const handlePaste = useCallback(
    (event: React.ClipboardEvent<HTMLDivElement>) => {
      const raw = event.clipboardData.getData('text/plain');
      if (!raw.includes('\t')) return; // not a TSV paste — let browser handle it
      event.preventDefault();

      const FIELD_NAMES = ['counterparty', 'amount', 'method', 'memo'];
      const rawRows = parseTsv(raw);
      if (rawRows.length === 0) return;

      const mapped = mapTsvToFields(rawRows, FIELD_NAMES, {
        amount: (v) => {
          const n = Number(v);
          return Number.isFinite(n) && n > 0;
        },
        method: (v) => {
          // Valid if it's a known method OR a known bucket token.
          return methods.includes(v) || buckets.includes(v);
        }
      });

      const today = new Date().toISOString().slice(0, 10);
      const newDrafts: LedgerDraft[] = mapped.map((pastedRow) => {
        const get = (key: string) =>
          pastedRow.fields.find((f) => f.key === key)?.value ?? '';

        const counterparty = get('counterparty');
        const amountStr = get('amount');
        const methodOrBucket = get('method');
        const memo = get('memo');

        // Determine method/bucket split: prefer method, fall back to bucket.
        let method = 'cash';
        let bucket = 'cash-file-a';
        if (methods.includes(methodOrBucket)) {
          method = methodOrBucket;
        } else if (buckets.includes(methodOrBucket)) {
          bucket = methodOrBucket;
          // method stays 'cash' (default)
        }

        const amountField = pastedRow.fields.find((f) => f.key === 'amount');
        const methodField = pastedRow.fields.find((f) => f.key === 'method');
        const hasError = pastedRow.hasErrors;
        const status: LedgerDraft['status'] = hasError ? 'needs_fix' : 'draft';

        // Build the issue string for needs_fix rows so the operator knows why.
        let issue: string | undefined;
        if (amountField?.invalid) {
          issue = 'Pasted amount is not a positive number — edit before posting.';
        } else if (methodField?.invalid) {
          issue = `Unrecognised method/bucket "${methodOrBucket}" — edit before posting.`;
        }

        return {
          id: crypto.randomUUID(),
          date: today,
          direction: 'receiving' as LedgerDirection,
          entityType: 'other' as LedgerEntityType,
          entityId: '',
          entityName: counterparty,
          transactionType: 'other_receipt',
          allocationTargetType: 'unapplied',
          allocationTargetId: '',
          amount: amountStr,
          method,
          bucket,
          reference: '',
          notes: memo,
          status,
          issue,
          processorId: '',
          grossAmount: '',
          processingFeeTotal: '',
          userSplitPercent: ''
        };
      });

      const summary = pasteSummary(mapped);
      const tone = mapped.some((r) => r.hasErrors) ? 'info' : 'success';
      // Prepend so the newest pasted rows appear at the top of the receiving section.
      setLedgerDrafts([...newDrafts, ...drafts]);
      pushToast(summary, tone);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [drafts, setLedgerDrafts, pushToast]
  );

  function section(direction: LedgerDirection) {
    const draftRows = drafts.filter((row) => row.direction === direction);
    const postedRows = direction === 'receiving' ? posted.receiving : posted.paying;
    const title = direction === 'receiving' ? 'Money In' : 'Money Out';
    const entityHeader = direction === 'receiving' ? 'Cash received from' : 'Entity paying cash to';
    const total = postedRows.reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
    const hidden = collapsed[direction];
    return (
      <section className="transaction-ledger-section" key={direction}>
        <div className="transaction-ledger-section-header">
          <button className="text-button compact-action" type="button" aria-expanded={!hidden} onClick={() => setCollapsed((current) => ({ ...current, [direction]: !current[direction] }))}>
            {hidden ? <ChevronRight className="h-4 w-4" aria-hidden="true" /> : <ChevronDown className="h-4 w-4" aria-hidden="true" />}
            {title}
          </button>
          <span className="selection-pill">{postedRows.length} posted</span>
          <span className="selection-pill success">${money(total)}</span>
          <div className="transaction-ledger-actions">
            <button className="secondary-button compact-action" type="button" onClick={() => addRow(direction)}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              Row
            </button>
            <button
              className="secondary-button compact-action"
              type="button"
              onClick={() => {
                setTypeDraft(makeTypeDraft(direction));
                setTypeDrawerOpen(true);
              }}
            >
              <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
              Types
            </button>
          </div>
        </div>
        {!hidden ? (
          <div className="transaction-ledger-grid">
            <table className="transaction-ledger-table">
              <caption className="sr-only">{title}</caption>
              <thead>
                <tr>
                  <th scope="col">#</th>
                  <th scope="col">Date</th>
                  <th scope="col">Entity type</th>
                  <th scope="col">{entityHeader}</th>
                  <th scope="col">Payment type</th>
                  <th scope="col">Gross</th>
                  <th scope="col">Processor</th>
                  <th scope="col">Fee</th>
                  <th scope="col">Split %</th>
                  <th scope="col">Net</th>
                  <th scope="col">Applied to</th>
                  <th scope="col">Amount</th>
                  <th scope="col">Method</th>
                  <th scope="col">Bucket</th>
                  <th scope="col">Notes</th>
                  <th scope="col">Trace</th>
                  <th scope="col">Status</th>
                  <th scope="col">Source</th>
                  <th scope="col">Commit</th>
                </tr>
              </thead>
              <tbody>
                {draftRows.map((row, index) => (
                  <DraftLedgerRow
                    key={row.id}
                    row={row}
                    rowNumber={index + 1}
                    openBills={openBills}
                    typeOptions={typeOptions}
                    reference={reference.data}
                    allocationPreview={row.id === activeRowId ? (preview.data as AllocationPreviewData | undefined) : undefined}
                    accessIssue={canPostLedgerRow ? undefined : 'Manager access required to post payment entries'}
                    disabled={isRunning || !canPostLedgerRow}
                    onCommit={commit}
                    onDiscard={() => removeLedgerDraft(row.id)}
                    onFocus={() => setActiveRowId(row.id)}
                    onUpdate={(patch) => updateRow(row.id, patch)}
                  />
                ))}
                {postedRows.map((row, index) => (
                  <PostedLedgerTableRow key={`${row.sourceType}:${row.id}`} row={row} rowNumber={draftRows.length + index + 1} />
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    );
  }

  return (
    <WorkspacePanel
      panelId="payments:transaction-ledger"
      title="Payment entry"
      subtitle="Manual rows, workflow-created payments, PO product payments, and accounting handoff in one audit surface."
      contentClassName="p-3"
      actions={
        <>
          {/* UX-A04: truthful offline/failed-save indicator — drafts are kept
              in memory only (never localStorage), so a failed server sync
              means they will not survive a reload. No fake success. */}
          {draftSync.status === 'error' ? (
            <span className="selection-pill danger" role="status">
              Drafts not synced — will not survive reload
            </span>
          ) : null}
          <button className="primary-button compact-action" type="button" onClick={() => addRow('receiving')}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Receiving
          </button>
          <button className="secondary-button compact-action" type="button" onClick={() => addRow('paying')}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Paying
          </button>
        </>
      }
    >
      {/* UX-C02: onPaste scoped to the workbench — TSV rows become drafts. */}
      <div className="transaction-ledger-workbench" onPaste={handlePaste}>
        {section('receiving')}
        {section('paying')}
      </div>
      {typeDrawerOpen ? (
        <aside ref={typeDrawerRef} className="transaction-type-drawer" aria-label="Custom transaction type">
          <div className="transaction-type-drawer-header">
            <div>
              <h3>Custom Type</h3>
              <p>Add an entity-aware payment type without changing posted history.</p>
            </div>
            <button className="icon-button" type="button" onClick={() => setTypeDrawerOpen(false)} title="Close custom type drawer">
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              <span className="sr-only">Close custom type drawer</span>
            </button>
          </div>
          <label>
            Label
            <input className="input" value={typeDraft.label} onChange={(event) => setTypeDraft((current) => ({ ...current, label: event.target.value }))} />
          </label>
          <label>
            Direction
            <select className="select" value={typeDraft.direction} onChange={(event) => setTypeDraft((current) => ({ ...current, direction: event.target.value as LedgerDirection }))}>
              <option value="receiving">Receiving</option>
              <option value="paying">Paying</option>
            </select>
          </label>
          <fieldset className="transaction-type-entity-set">
            <legend>Entity options</legend>
            {entityTypes.map((entityType) => (
              <label key={entityType}>
                <input
                  type="checkbox"
                  checked={typeDraft.allowedEntityTypes.includes(entityType)}
                  onChange={(event) =>
                    setTypeDraft((current) => ({
                      ...current,
                      allowedEntityTypes: event.target.checked
                        ? Array.from(new Set([...current.allowedEntityTypes, entityType]))
                        : current.allowedEntityTypes.filter((candidate) => candidate !== entityType)
                    }))
                  }
                />
                {labelFromToken(entityType)}
              </label>
            ))}
          </fieldset>
          <div className="transaction-type-defaults">
            <label>
              Method
              <select className="select" value={typeDraft.defaultMethod} onChange={(event) => setTypeDraft((current) => ({ ...current, defaultMethod: event.target.value }))}>
                {methods.map((method) => <option key={method} value={method}>{labelFromToken(method)}</option>)}
              </select>
            </label>
            <label>
              Bucket
              <select className="select" value={typeDraft.defaultBucket} onChange={(event) => setTypeDraft((current) => ({ ...current, defaultBucket: event.target.value }))}>
                {buckets.map((bucket) => <option key={bucket} value={bucket}>{bucketLabel(bucket)}</option>)}
              </select>
            </label>
          </div>
          <label>
            Default target
            <select className="select" value={typeDraft.defaultAllocationIntent} onChange={(event) => setTypeDraft((current) => ({ ...current, defaultAllocationIntent: event.target.value }))}>
              <option value="fifo">Oldest order first</option>
              <option value="po_fifo">Oldest open PO first</option>
              <option value="selected_po">Selected PO</option>
              <option value="selected_invoice">Selected order</option>
              <option value="selected_bill">Selected bill</option>
              <option value="unapplied">Unapplied</option>
            </select>
          </label>
          <label className="field-inline">
            <input type="checkbox" checked={typeDraft.requiresApproval} onChange={(event) => setTypeDraft((current) => ({ ...current, requiresApproval: event.target.checked }))} />
            Requires approval
          </label>
          <button className="primary-button" type="button" disabled={isRunning || !typeDraft.label.trim() || typeDraft.allowedEntityTypes.length === 0} onClick={() => void saveType()}>
            Save type
          </button>
        </aside>
      ) : null}
    </WorkspacePanel>
  );
}

function DraftLedgerRow({
  row,
  rowNumber,
  reference,
  openBills,
  typeOptions,
  allocationPreview,
  accessIssue,
  disabled,
  onCommit,
  onDiscard,
  onFocus,
  onUpdate
}: {
  row: LedgerDraft;
  rowNumber: number;
  reference: any;
  openBills: GridRow[];
  typeOptions: TransactionTypeOption[];
  allocationPreview?: AllocationPreviewData;
  accessIssue?: string;
  disabled: boolean;
  onCommit: (row: LedgerDraft) => void;
  onDiscard: () => void;
  onFocus: () => void;
  onUpdate: (patch: Partial<LedgerDraft>) => void;
}) {
  const entities = entityOptions(row.entityType, reference);
  const transactionTypes = optionsForEntity(typeOptions, row.direction, row.entityType);
  const targetOptions = allocationTargets(row, reference, openBills);
  // UX-J02/UX-J04: precedence — row issue > access gate > server-computed
  // allocation preview (active row, exact server FIFO walk) > client-side
  // estimate from data already on the wire.
  const impact =
    row.issue ??
    accessIssue ??
    (allocationPreview ? formatServerAllocationPreview(allocationPreview, customerBalance(row, reference)) : undefined) ??
    ledgerImpact(row, reference, openBills);

  // Processor-specific logic
  const isProcessorTransaction = processorTransactionTypes.includes(row.transactionType);
  const processors = reference?.processors ?? [];
  const selectedProcessor = processors.find((p: any) => p.id === row.processorId);

  let calculatedFee = 0;
  let userShare = 0;
  let processorShare = 0;
  let customerCredit = 0;

  if (isProcessorTransaction && selectedProcessor && row.grossAmount) {
    const grossAmt = Number(row.grossAmount);
    calculatedFee = row.processingFeeTotal
      ? Number(row.processingFeeTotal)
      : calculateProcessingFeeClient(grossAmt, selectedProcessor);

    const splitPercent = row.userSplitPercent
      ? Number(row.userSplitPercent)
      : Number(selectedProcessor.defaultUserSplit);

    const split = splitProcessingFeeClient(calculatedFee, splitPercent);
    userShare = split.userShare;
    processorShare = split.processorShare;

    customerCredit = calculateCustomerCreditClient(grossAmt, processorShare, userShare);
  }

  return (
    <tr className={row.status === 'needs_fix' ? 'transaction-ledger-row-warning' : undefined}>
      <td className="transaction-ledger-row-number">{rowNumber}</td>
      <td><input aria-label="Date" type="date" value={row.date} onFocus={onFocus} onChange={(event) => onUpdate({ date: event.target.value })} /></td>
      <td>
        <select aria-label="Entity type" value={row.entityType} onFocus={onFocus} onChange={(event) => onUpdate({ entityType: event.target.value as LedgerEntityType })}>
          {entityTypes.map((entityType) => <option key={entityType} value={entityType}>{labelFromToken(entityType)}</option>)}
        </select>
      </td>
      <td>
        {row.entityType === 'other' ? (
          <input aria-label="Entity name" value={row.entityName} onFocus={onFocus} onChange={(event) => onUpdate({ entityName: event.target.value })} placeholder="Name" />
        ) : (
          <select aria-label="Entity id" value={row.entityId} onFocus={onFocus} onChange={(event) => onUpdate({ entityId: event.target.value, allocationTargetId: '' })}>
            <option value="">Choose</option>
            {entities.map((entity) => <option key={entity.id} value={entity.id}>{entity.name}</option>)}
          </select>
        )}
      </td>
      <td>
        <select aria-label="Transaction type" value={row.transactionType} onFocus={onFocus} onChange={(event) => onUpdate({ transactionType: event.target.value })}>
          {transactionTypes.map((type) => <option key={type.slug} value={type.slug}>{type.label}</option>)}
        </select>
      </td>
      {/* Processor fields - show if processor transaction type */}
      {isProcessorTransaction ? (
        <>
          <td>
            <input aria-label="Gross amount"
              type="number"
              value={row.grossAmount || ''}
              onFocus={onFocus}
              onChange={(event) => onUpdate({ grossAmount: event.target.value })}
              placeholder="Gross"
              step="0.01"
            />
          </td>
          <td>
            <select aria-label="Processor id"
              value={row.processorId || ''}
              onFocus={onFocus}
              onChange={(event) => onUpdate({ processorId: event.target.value })}
            >
              <option value="">Choose processor</option>
              {processors.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </td>
          <td>
            <input aria-label="Processing fee total"
              type="number"
              value={row.processingFeeTotal || calculatedFee.toFixed(2) || ''}
              onFocus={onFocus}
              onChange={(event) => onUpdate({ processingFeeTotal: event.target.value })}
              placeholder="Fee"
              step="0.01"
            />
          </td>
          <td>
            <input aria-label="User split percent"
              type="number"
              value={row.userSplitPercent || (selectedProcessor?.defaultUserSplit ?? '')}
              onFocus={onFocus}
              onChange={(event) => onUpdate({ userSplitPercent: event.target.value })}
              placeholder="%"
              step="1"
              min="0"
              max="100"
            />
          </td>
          <td className="calculated-display">
            {customerCredit > 0 ? formatMoney(customerCredit) : '-'}
          </td>
        </>
      ) : (
        <>
          <td>-</td>
          <td>-</td>
          <td>-</td>
          <td>-</td>
          <td>-</td>
        </>
      )}
      <td>
        <select aria-label="Allocation target type" value={`${row.allocationTargetType}:${row.allocationTargetId}`} onFocus={onFocus} onChange={(event) => {
          const [allocationTargetType, allocationTargetId = ''] = event.target.value.split(':');
          onUpdate({ allocationTargetType, allocationTargetId });
        }}>
          {targetOptions.map((target) => <option key={`${target.type}:${target.id}`} value={`${target.type}:${target.id}`}>{target.label}</option>)}
        </select>
      </td>
      <td>
        <input aria-label="Amount" value={row.amount} inputMode="decimal" onFocus={onFocus} onChange={(event) => onUpdate({ amount: event.target.value })} />
        {/* CAP-004: visual label when operator enters a negative amount (buyer credit / down payment) */}
        {row.amount.startsWith('-') || Number(row.amount) < 0 ? (
          <span className="selection-pill">Buyer credit / Down payment</span>
        ) : null}
      </td>
      <td>
        <select aria-label="Method" value={row.method} onChange={(event) => onUpdate({ method: event.target.value })}>
          {methods.map((method) => <option key={method} value={method}>{labelFromToken(method)}</option>)}
        </select>
      </td>
      <td>
        <select aria-label="Bucket" value={row.bucket} onChange={(event) => onUpdate({ bucket: event.target.value })}>
          {buckets.map((bucket) => <option key={bucket} value={bucket}>{bucketLabel(bucket)}</option>)}
        </select>
      </td>
      <td><input aria-label="Notes" value={row.notes} onChange={(event) => onUpdate({ notes: event.target.value })} placeholder="Notes" /></td>
      <td className="transaction-ledger-impact">{impact}</td>
      <td><span className={row.status === 'posted' ? 'finder-chip success' : row.status === 'needs_fix' ? 'finder-chip warning' : 'finder-chip'}>{labelFromToken(row.status)}</span></td>
      <td><span className="transaction-ledger-source">Draft</span></td>
      <td>
        <div className="flex items-center gap-1">
          <button className="icon-button" type="button" disabled={disabled || row.status === 'posted'} onClick={() => onCommit(row)} title={accessIssue ?? 'Record payment'}>
            <Check className="h-4 w-4" aria-hidden="true" />
            <span className="sr-only">Record payment</span>
          </button>
          {/* SX-D02: draft hygiene — per-row discard deletes from server-persisted drafts */}
          <button className="icon-button" type="button" disabled={row.status === 'posted'} onClick={onDiscard} title="Discard this draft row">
            <X className="h-4 w-4" aria-hidden="true" />
            <span className="sr-only">Discard draft</span>
          </button>
        </div>
        {/* CAP-004: role-gate note for viewers */}
        {accessIssue ? (
          <p className="text-xs text-zinc-400 mt-1">Manager or owner required to post ledger rows.</p>
        ) : null}
      </td>
    </tr>
  );
}

function PostedLedgerTableRow({ row, rowNumber }: { row: PostedLedgerRow; rowNumber: number }) {
  return (
    <tr className="transaction-ledger-posted-row">
      <td className="transaction-ledger-row-number">{rowNumber}</td>
      <td>{formatDate(row.date)}</td>
      <td>{labelFromToken(row.entityType)}</td>
      <td>{row.entityLabel}</td>
      <td>{labelFromToken(row.transactionType)}</td>
      <td>{row.allocationTargetLabel}</td>
      <td>${money(Number(row.amount ?? 0))}</td>
      <td>{labelFromToken(row.method)}</td>
      <td>{bucketLabel(row.bucket)}</td>
      <td>{row.notes ?? row.reference ?? ''}</td>
      <td className="transaction-ledger-impact">{row.impactPreview ?? row.commandId ?? row.sourceType}</td>
      <td><span className="finder-chip success">{labelFromToken(row.status)}</span></td>
      <td><span className="transaction-ledger-source">{labelFromToken(row.sourceType)}</span></td>
      <td><span className="transaction-ledger-source">-</span></td>
    </tr>
  );
}

function makeRow(direction: LedgerDirection): LedgerDraft {
  const entityType: LedgerEntityType = direction === 'paying' ? 'vendor' : 'customer';
  const transactionType = defaultTransactionType(direction, entityType);
  return {
    id: crypto.randomUUID(),
    date: new Date().toISOString().slice(0, 10),
    direction,
    entityType,
    entityId: '',
    entityName: '',
    transactionType,
    allocationTargetType: defaultAllocationTarget(direction, entityType, transactionType),
    allocationTargetId: '',
    amount: '',
    method: 'cash',
    bucket: direction === 'paying' ? 'accounting' : 'cash-file-a',
    reference: '',
    notes: '',
    status: 'draft',
    // Processor fields
    processorId: '',
    grossAmount: '',
    processingFeeTotal: '',
    userSplitPercent: ''
  };
}

function makeTypeDraft(direction: LedgerDirection): TypeDraft {
  return {
    label: '',
    direction,
    allowedEntityTypes: direction === 'paying' ? ['vendor'] : ['customer'],
    defaultMethod: 'cash',
    defaultBucket: direction === 'paying' ? 'accounting' : 'cash-file-a',
    defaultAllocationIntent: direction === 'paying' ? 'po_fifo' : 'fifo',
    requiresApproval: false
  };
}

function defaultTransactionType(direction: LedgerDirection, entityType: LedgerEntityType) {
  if (direction === 'paying' && entityType === 'vendor') return 'vendor_product_payment';
  if (direction === 'paying' && entityType === 'referee') return 'referee_payout';
  if (direction === 'paying' && entityType === 'staff') return 'staff_payment';
  if (direction === 'paying') return 'other_payment';
  if (entityType === 'customer') return 'client_payment';
  return 'other_receipt';
}

function defaultAllocationTarget(direction: LedgerDirection, entityType: LedgerEntityType, transactionType: string) {
  if (direction === 'paying' && entityType === 'vendor' && transactionType === 'vendor_payout') return 'selected_bill';
  if (direction === 'paying' && entityType === 'vendor') return 'po_fifo';
  if (direction === 'receiving' && entityType === 'customer') return 'fifo';
  return 'unapplied';
}

function optionsForEntity(types: TransactionTypeOption[], direction: LedgerDirection, entityType: LedgerEntityType) {
  const filtered = types.filter((type) => type.direction === direction && type.allowedEntityTypes.includes(entityType));
  if (filtered.length > 0) return filtered;
  return [{ id: 'fallback', slug: defaultTransactionType(direction, entityType), label: labelFromToken(defaultTransactionType(direction, entityType)), direction, allowedEntityTypes: [entityType], defaultMethod: 'cash', defaultBucket: direction === 'paying' ? 'accounting' : 'cash-file-a', defaultAllocationIntent: defaultAllocationTarget(direction, entityType, defaultTransactionType(direction, entityType)), requiresApproval: false, isSystem: true }];
}

function entityOptions(entityType: LedgerEntityType, reference: any): Array<{ id: string; name: string }> {
  if (entityType === 'customer') return reference?.customers ?? [];
  if (entityType === 'vendor') return reference?.vendors ?? [];
  if (entityType === 'referee') return reference?.referees ?? [];
  if (entityType === 'staff') return reference?.staff ?? [];
  return [];
}

function allocationTargets(row: LedgerDraft, reference: any, openBills: GridRow[]) {
  if (row.direction === 'receiving' && row.entityType === 'customer') {
    const invoices = (reference?.openInvoices ?? []).filter((invoice: any) => !row.entityId || invoice.customerId === row.entityId);
    return [
      { type: 'fifo', id: '', label: 'Oldest open orders first' },
      { type: 'unapplied', id: '', label: 'Unapplied / down payment' },
      ...invoices.map((invoice: any) => ({
        type: 'selected_invoice',
        id: invoice.id,
        label: `${invoice.invoiceNo} / open $${money(Number(invoice.total ?? 0) - Number(invoice.amountPaid ?? 0))}`
      }))
    ];
  }

  if (row.direction === 'paying' && row.entityType === 'vendor') {
    if (row.transactionType === 'vendor_payout') {
      return [
        { type: 'selected_bill', id: '', label: 'Choose open bill' },
        ...openBills
          .filter((bill) => !row.entityId || bill.vendorId === row.entityId)
          .map((bill) => ({
            type: 'selected_bill',
            id: String(bill.id),
            label: `${String(bill.billNo ?? 'Bill')} / open $${money(Number(bill.amount ?? 0) - Number(bill.amountPaid ?? 0))}`
          }))
      ];
    }
    const purchaseOrders = (reference?.activePurchaseOrders ?? []).filter((po: any) => !row.entityId || po.vendorId === row.entityId);
    return [
      { type: 'po_fifo', id: '', label: 'Oldest open PO first' },
      ...purchaseOrders.map((po: any) => ({
        type: 'selected_po',
        id: po.id,
        label: `${po.poNo} / ${labelFromToken(po.status)} / $${money(Number(po.total ?? 0))}`
      }))
    ];
  }

  return [{ type: 'unapplied', id: '', label: 'No order / unattributed' }];
}

function validate(row: LedgerDraft, reference: any) {
  const amount = Number(row.amount);
  if (!row.date) return 'Choose a transaction date.';
  if (!Number.isFinite(amount) || amount <= 0) return 'Amount must be greater than zero.';
  if (row.entityType === 'other' && !row.entityName.trim()) return 'Name the other entity before posting.';
  if (row.entityType !== 'other' && !row.entityId) return `Choose the ${row.entityType} before posting.`;
  if (row.direction === 'paying' && row.entityType === 'vendor' && row.transactionType === 'vendor_payout' && !row.allocationTargetId) return 'Choose the open bill before posting a vendor payout.';
  if (row.direction === 'paying' && row.entityType === 'referee') {
    const referee = (reference?.referees ?? []).find((r: any) => r.id === row.entityId);
    if (referee && amount > Number(referee.balance ?? 0)) {
      return `Amount exceeds referee balance ${formatMoney(Number(referee.balance ?? 0))}`;
    }
  }
  return null;
}

// UX-J04: format the server-computed allocation preview (queries.
// paymentAllocationPreview — the server's own FIFO walk, order by created_at,
// matching commandBus.ts allocatePayment exactly) into the one-line impact
// string. Labeled "Estimated" because allocation happens at post time against
// then-current invoice state. Exported for tests.
export function formatServerAllocationPreview(preview: AllocationPreviewData, balance: number | null): string | undefined {
  const unapplied = Number(preview.unapplied || 0);
  if (preview.kind === 'buyer_credit') {
    // commandBus.ts logPayment negative branch: balance decreases by the credit.
    if (unapplied <= 0) return undefined;
    return `Buyer credit / down payment — no invoice allocation${balance == null ? '' : `; balance → $${money(balance - unapplied)}`}`;
  }
  const appliedRows = preview.rows.filter((entry) => Number(entry.applied) > 0);
  const allocated = appliedRows.reduce((sum, entry) => sum + Number(entry.applied), 0);
  if (allocated <= 0 && unapplied <= 0) return undefined;
  if (preview.kind === 'unapplied') {
    // Unapplied money does not touch customer balance (commandBus.ts
    // allocatePayment only adjusts balance for the allocated total).
    return `Leaves $${money(unapplied)} unapplied; balance unchanged${balance == null ? '' : ` ($${money(balance)})`}`;
  }
  if (appliedRows.length === 0) {
    return `No open invoices — $${money(unapplied)} unapplied; balance unchanged${balance == null ? '' : ` ($${money(balance)})`}`;
  }
  const parts = appliedRows.map((entry) => `$${money(Number(entry.applied))} to ${entry.invoiceNo}`);
  const shown = parts.slice(0, 3).join(', ') + (parts.length > 3 ? ` (+${parts.length - 3} more)` : '');
  return `Estimated: allocates ${shown}; $${money(unapplied)} unapplied${balance == null ? '' : `; balance → $${money(balance - allocated)}`}`;
}

// UX-J02: customer balance from reference data already on the wire — feeds the
// "balance → $Z" effect preview. Exported for tests.
export function customerBalance(row: LedgerDraft, reference: any): number | null {
  if (row.entityType !== 'customer' || !row.entityId) return null;
  const customer = (reference?.customers ?? []).find((candidate: any) => candidate.id === row.entityId);
  if (!customer) return null;
  const balance = Number(customer.balance ?? 0);
  return Number.isFinite(balance) ? balance : null;
}

// UX-J02/UX-J04: client-side fallback estimate for customer receiving rows.
// Mirrors verified commandBus.ts behavior:
//  - buyer-credit transaction types / negative amounts → server stores a
//    negative payment and decreases balance by |amount| (logPayment).
//  - allocation decreases balance by the ALLOCATED total only; unapplied
//    money leaves balance unchanged (allocatePayment).
//  - FIFO order = open/partial invoices by created_at ASC; reference.
//    openInvoices arrives in exactly that order (queries.ts reference query).
//  - with zero open invoices, postTransactionLedgerRow flips fifo → unapplied.
function customerReceivingImpact(row: LedgerDraft, amount: number, reference: any): string {
  const balance = customerBalance(row, reference);
  // Sign flip mirrors commandBus.ts postTransactionLedgerRow's creditTypes list.
  const creditTypes = ['buyer_credit', 'down_payment', 'customer_down_payment'];
  const signed = creditTypes.includes(row.transactionType) ? -Math.abs(amount) : amount;
  if (signed < 0) {
    return `Buyer credit / down payment — no invoice allocation${balance == null ? '' : `; balance → $${money(balance - Math.abs(signed))}`}`;
  }
  const invoices = (reference?.openInvoices ?? []).filter((invoice: any) => invoice.customerId === row.entityId);
  if (row.allocationTargetType === 'unapplied') {
    return `Leaves $${money(amount)} unapplied; balance unchanged${balance == null ? '' : ` ($${money(balance)})`}`;
  }
  if (row.allocationTargetType === 'selected_invoice') {
    const invoice = invoices.find((candidate: any) => candidate.id === row.allocationTargetId);
    if (!invoice) return 'Applies to selected order, then tracks residual';
    const open = Math.max(0, Number(invoice.total ?? 0) - Number(invoice.amountPaid ?? 0));
    const applied = Math.min(open, amount);
    return `Estimated: allocates $${money(applied)} to ${invoice.invoiceNo}; $${money(amount - applied)} unapplied${balance == null ? '' : `; balance → $${money(balance - applied)}`}`;
  }
  if (invoices.length === 0) {
    return `No open invoices — $${money(amount)} unapplied; balance unchanged${balance == null ? '' : ` ($${money(balance)})`}`;
  }
  let remaining = amount;
  const parts: string[] = [];
  for (const invoice of invoices) {
    if (remaining <= 0) break;
    const open = Math.max(0, Number(invoice.total ?? 0) - Number(invoice.amountPaid ?? 0));
    const applied = Math.min(open, remaining);
    if (applied <= 0) continue;
    remaining -= applied;
    parts.push(`$${money(applied)} to ${invoice.invoiceNo}`);
  }
  const allocated = amount - remaining;
  const shown = parts.slice(0, 3).join(', ') + (parts.length > 3 ? ` (+${parts.length - 3} more)` : '');
  return `Estimated: allocates ${shown}; $${money(remaining)} unapplied${balance == null ? '' : `; balance → $${money(balance - allocated)}`}`;
}

// Exported for tests (UX-J02/UX-J04 colocated coverage).
export function ledgerImpact(row: LedgerDraft, reference: any, openBills: GridRow[]) {
  const amount = Number(row.amount || 0);
  if (!Number.isFinite(amount) || amount === 0) return 'Enter amount to preview';
  if (row.direction === 'receiving' && row.entityType === 'customer') {
    // UX-J02: negative amounts get the buyer-credit balance preview instead
    // of the old 'Enter amount to preview' dead end.
    return customerReceivingImpact(row, amount, reference);
  }
  if (amount <= 0) return 'Enter amount to preview';
  if (row.direction === 'paying' && row.entityType === 'referee') {
    const referee = (reference?.referees ?? []).find((r: any) => r.id === row.entityId);
    if (!referee) return 'Choose referee for payout';
    const balance = Number(referee.balance ?? 0);
    if (amount > balance) return `⚠️ Amount exceeds balance $${money(balance)}`;
    return `Pays $${money(amount)} from balance $${money(balance)}`;
  }
  if (row.direction === 'paying' && row.entityType === 'vendor') {
    if (row.transactionType === 'vendor_payout') {
      const bill = openBills.find((candidate) => candidate.id === row.allocationTargetId);
      return bill ? `Pays ${String(bill.billNo ?? 'bill')} from ${bucketLabel(row.bucket)}` : 'Choose bill for vendor payout';
    }
    if (row.allocationTargetType === 'selected_po') return `Applies product payment to selected PO`;
    return `Applies product payment FIFO to open POs`;
  }
  return `Posts ${row.direction} journal row through ${bucketLabel(row.bucket)}`;
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' });
}

function money(value: number) {
  return value.toLocaleString('en-US', { maximumFractionDigits: 2, minimumFractionDigits: 2 });
}

function bucketLabel(value: unknown) {
  const key = String(value || 'accounting');
  const labels: Record<string, string> = {
    'cash-file-a': 'Cash file A',
    'cash-file-b': 'Cash file B',
    office: 'Office',
    accounting: 'Accounting',
    'crypto-wallet': 'Crypto wallet',
    'wire-clearing': 'Wire clearing'
  };
  return labels[key] ?? labelFromToken(key);
}

function labelFromToken(value: unknown) {
  return String(value || 'unknown')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
