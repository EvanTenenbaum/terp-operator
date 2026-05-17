import { Check, ChevronDown, ChevronRight, Plus, RotateCcw, SlidersHorizontal } from 'lucide-react';
import { useMemo, useState } from 'react';
import { trpc } from '../api/trpc';
import { useUiStore } from '../store/uiStore';
import type { GridRow } from '../../shared/types';
import { useCommandRunner } from './useCommandRunner';
import { WorkspacePanel } from './WorkspacePanel';

type LedgerDirection = 'receiving' | 'paying';
type LedgerEntityType = 'customer' | 'vendor' | 'referee' | 'staff' | 'processor' | 'other';
type LedgerStatus = 'draft' | 'posted' | 'needs_fix';

interface LedgerDraft {
  id: string;
  date: string;
  direction: LedgerDirection;
  entityType: LedgerEntityType;
  entityId: string;
  entityName: string;
  transactionType: string;
  allocationTargetType: string;
  allocationTargetId: string;
  amount: string;
  method: string;
  bucket: string;
  reference: string;
  notes: string;
  status: LedgerStatus;
  issue?: string;
  // Processor fields (optional)
  processorId?: string;
  grossAmount?: string;
  processingFeeTotal?: string;
  userSplitPercent?: string;
}

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

const methods = ['cash', 'check', 'card', 'crypto', 'wire', 'journal'];
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
  const activeQuickLaunch = useUiStore((state) => state.activeQuickLaunch);
  const { runCommand, isRunning } = useCommandRunner();
  const [collapsed, setCollapsed] = useState<Record<LedgerDirection, boolean>>({ receiving: false, paying: false });
  const [drafts, setDrafts] = useState<LedgerDraft[]>(() => [makeRow(activeQuickLaunch === 'moneyOut' ? 'paying' : 'receiving')]);
  const [activeRowId, setActiveRowId] = useState(drafts[0]?.id ?? '');
  const [typeDrawerOpen, setTypeDrawerOpen] = useState(false);
  const [typeDraft, setTypeDraft] = useState<TypeDraft>(() => makeTypeDraft('paying'));

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
    setDrafts((current) => [row, ...current]);
    setActiveRowId(row.id);
    setCollapsed((current) => ({ ...current, [direction]: false }));
  }

  function updateRow(id: string, patch: Partial<LedgerDraft>) {
    setDrafts((current) =>
      current.map((row) => {
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
          next.method = direction === 'paying' ? 'cash' : 'cash';
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
      })
    );
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
      setDrafts((current) => [replacement, ...current.filter((draft) => draft.id !== row.id)]);
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
      'Transaction ledger: save custom type'
    );
    if (result.ok) {
      setTypeDraft(makeTypeDraft(typeDraft.direction));
      setTypeDrawerOpen(false);
    }
  }

  function mark(id: string, patch: Partial<LedgerDraft>) {
    setDrafts((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }

  function section(direction: LedgerDirection) {
    const draftRows = drafts.filter((row) => row.direction === direction);
    const postedRows = direction === 'receiving' ? posted.receiving : posted.paying;
    const title = direction === 'receiving' ? 'Receiving Ledger' : 'Paying Ledger';
    const entityHeader = direction === 'receiving' ? 'Cash received from' : 'Entity paying cash to';
    const total = postedRows.reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
    const hidden = collapsed[direction];
    return (
      <section className="transaction-ledger-section" key={direction}>
        <div className="transaction-ledger-section-header">
          <button className="text-button compact-action" type="button" onClick={() => setCollapsed((current) => ({ ...current, [direction]: !current[direction] }))}>
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
                  <th>#</th>
                  <th>Date</th>
                  <th>Entity type</th>
                  <th>{entityHeader}</th>
                  <th>Payment type</th>
                  <th>Gross</th>
                  <th>Processor</th>
                  <th>Fee</th>
                  <th>Split %</th>
                  <th>Net</th>
                  <th>PO / FIFO / target</th>
                  <th>Amount</th>
                  <th>Method</th>
                  <th>Bucket</th>
                  <th>Notes</th>
                  <th>Trace</th>
                  <th>Status</th>
                  <th>Source</th>
                  <th>Commit</th>
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
                    allocationPreview={row.id === activeRowId ? preview.data?.label : undefined}
                    accessIssue={canPostLedgerRow ? undefined : 'Manager access required to post transaction ledger rows'}
                    disabled={isRunning || !canPostLedgerRow}
                    onCommit={commit}
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
      title="Transaction Ledger"
      subtitle="Manual rows, workflow-created payments, PO product payments, and accounting handoff in one audit surface."
      contentClassName="p-3"
      actions={
        <>
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
      <div className="transaction-ledger-workbench">
        {section('receiving')}
        {section('paying')}
      </div>
      {typeDrawerOpen ? (
        <aside className="transaction-type-drawer" aria-label="Custom transaction type">
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
              <option value="fifo">FIFO</option>
              <option value="po_fifo">Open PO FIFO</option>
              <option value="selected_po">Selected PO</option>
              <option value="selected_invoice">Selected invoice</option>
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
  onFocus,
  onUpdate
}: {
  row: LedgerDraft;
  rowNumber: number;
  reference: any;
  openBills: GridRow[];
  typeOptions: TransactionTypeOption[];
  allocationPreview?: string;
  accessIssue?: string;
  disabled: boolean;
  onCommit: (row: LedgerDraft) => void;
  onFocus: () => void;
  onUpdate: (patch: Partial<LedgerDraft>) => void;
}) {
  const entities = entityOptions(row.entityType, reference);
  const transactionTypes = optionsForEntity(typeOptions, row.direction, row.entityType);
  const targetOptions = allocationTargets(row, reference, openBills);
  const impact = row.issue ?? accessIssue ?? allocationPreview ?? ledgerImpact(row, reference, openBills);

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
      <td><input type="date" value={row.date} onFocus={onFocus} onChange={(event) => onUpdate({ date: event.target.value })} /></td>
      <td>
        <select value={row.entityType} onFocus={onFocus} onChange={(event) => onUpdate({ entityType: event.target.value as LedgerEntityType })}>
          {entityTypes.map((entityType) => <option key={entityType} value={entityType}>{labelFromToken(entityType)}</option>)}
        </select>
      </td>
      <td>
        {row.entityType === 'other' ? (
          <input value={row.entityName} onFocus={onFocus} onChange={(event) => onUpdate({ entityName: event.target.value })} placeholder="Name" />
        ) : (
          <select value={row.entityId} onFocus={onFocus} onChange={(event) => onUpdate({ entityId: event.target.value, allocationTargetId: '' })}>
            <option value="">Choose</option>
            {entities.map((entity) => <option key={entity.id} value={entity.id}>{entity.name}</option>)}
          </select>
        )}
      </td>
      <td>
        <select value={row.transactionType} onFocus={onFocus} onChange={(event) => onUpdate({ transactionType: event.target.value })}>
          {transactionTypes.map((type) => <option key={type.slug} value={type.slug}>{type.label}</option>)}
        </select>
      </td>
      {/* Processor fields - show if processor transaction type */}
      {isProcessorTransaction ? (
        <>
          <td>
            <input
              type="number"
              value={row.grossAmount || ''}
              onFocus={onFocus}
              onChange={(event) => onUpdate({ grossAmount: event.target.value })}
              placeholder="Gross"
              step="0.01"
            />
          </td>
          <td>
            <select
              value={row.processorId || ''}
              onFocus={onFocus}
              onChange={(event) => onUpdate({ processorId: event.target.value })}
            >
              <option value="">Choose processor</option>
              {processors.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </td>
          <td>
            <input
              type="number"
              value={row.processingFeeTotal || calculatedFee.toFixed(2)}
              onFocus={onFocus}
              onChange={(event) => onUpdate({ processingFeeTotal: event.target.value })}
              placeholder="Fee"
              step="0.01"
            />
          </td>
          <td>
            <input
              type="number"
              value={row.userSplitPercent || (selectedProcessor ? selectedProcessor.defaultUserSplit : '')}
              onFocus={onFocus}
              onChange={(event) => onUpdate({ userSplitPercent: event.target.value })}
              placeholder="%"
              step="1"
              min="0"
              max="100"
            />
          </td>
          <td className="calculated-display">
            {customerCredit > 0 ? `$${customerCredit.toFixed(2)}` : '-'}
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
        <select value={`${row.allocationTargetType}:${row.allocationTargetId}`} onFocus={onFocus} onChange={(event) => {
          const [allocationTargetType, allocationTargetId = ''] = event.target.value.split(':');
          onUpdate({ allocationTargetType, allocationTargetId });
        }}>
          {targetOptions.map((target) => <option key={`${target.type}:${target.id}`} value={`${target.type}:${target.id}`}>{target.label}</option>)}
        </select>
      </td>
      <td><input value={row.amount} inputMode="decimal" onFocus={onFocus} onChange={(event) => onUpdate({ amount: event.target.value })} /></td>
      <td>
        <select value={row.method} onChange={(event) => onUpdate({ method: event.target.value })}>
          {methods.map((method) => <option key={method} value={method}>{labelFromToken(method)}</option>)}
        </select>
      </td>
      <td>
        <select value={row.bucket} onChange={(event) => onUpdate({ bucket: event.target.value })}>
          {buckets.map((bucket) => <option key={bucket} value={bucket}>{bucketLabel(bucket)}</option>)}
        </select>
      </td>
      <td><input value={row.notes} onChange={(event) => onUpdate({ notes: event.target.value })} placeholder="Notes" /></td>
      <td className="transaction-ledger-impact">{impact}</td>
      <td><span className={row.status === 'posted' ? 'finder-chip success' : row.status === 'needs_fix' ? 'finder-chip warning' : 'finder-chip'}>{labelFromToken(row.status)}</span></td>
      <td><span className="transaction-ledger-source">Draft</span></td>
      <td>
        <button className="icon-button" type="button" disabled={disabled || row.status === 'posted'} onClick={() => onCommit(row)} title={accessIssue ?? 'Commit ledger row'}>
          <Check className="h-4 w-4" aria-hidden="true" />
          <span className="sr-only">Commit ledger row</span>
        </button>
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
      { type: 'fifo', id: '', label: 'FIFO oldest open invoices' },
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
      { type: 'po_fifo', id: '', label: 'FIFO open purchase orders' },
      ...purchaseOrders.map((po: any) => ({
        type: 'selected_po',
        id: po.id,
        label: `${po.poNo} / ${labelFromToken(po.status)} / $${money(Number(po.total ?? 0))}`
      }))
    ];
  }

  return [{ type: 'unapplied', id: '', label: 'Manual journal / no target' }];
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
      return `Amount exceeds referee balance $${(Number(referee.balance ?? 0)).toFixed(2)}`;
    }
  }
  return null;
}

function ledgerImpact(row: LedgerDraft, reference: any, openBills: GridRow[]) {
  const amount = Number(row.amount || 0);
  if (!Number.isFinite(amount) || amount <= 0) return 'Enter amount to preview';
  if (row.direction === 'receiving' && row.entityType === 'customer') {
    const invoices = (reference?.openInvoices ?? []).filter((invoice: any) => invoice.customerId === row.entityId);
    const open = invoices.reduce((sum: number, invoice: any) => sum + Math.max(0, Number(invoice.total ?? 0) - Number(invoice.amountPaid ?? 0)), 0);
    if (row.allocationTargetType === 'unapplied') return `Leaves $${money(amount)} unapplied`;
    if (row.allocationTargetType === 'selected_invoice') return `Applies to selected invoice, then tracks residual`;
    return `Applies up to $${money(Math.min(open, amount))}; $${money(Math.max(0, amount - open))} remains`;
  }
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
