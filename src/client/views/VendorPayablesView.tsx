import { Ban, CalendarClock, Landmark, Pencil, ShieldCheck } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { trpc } from '../api/trpc';
import { StatusActionBar, type StatusActionTable, FormDialog, FormField } from '../components/templates';
import { WorkspacePanel } from '../components/WorkspacePanel';
import { GridView } from '../templates/GridView';
import { useCommandRunner } from '../components/useCommandRunner';
import { useUiStore } from '../store/uiStore';
import { useConfirm } from '../hooks/useConfirm';
import { ReceiptPanel } from '../components/ReceiptPanel';
import type { GridRow } from '../../shared/types';
import { labelFromToken, moneyish } from './operations/shared';

// ─── UX-Q04: UpdateVendorDialog ─────────────────────────────────────────────
interface UpdateVendorDialogProps {
  vendorId: string;
  initialName: string;
  initialTermsDays: number;
  onClose: () => void;
}

function UpdateVendorDialog({ vendorId, initialName, initialTermsDays, onClose }: UpdateVendorDialogProps) {
  const { runCommand, isRunning } = useCommandRunner();
  const [name, setName] = useState(initialName);
  const [alias, setAlias] = useState('');
  const [termsDays, setTermsDays] = useState(String(initialTermsDays ?? 14));
  const [consignmentDefault, setConsignmentDefault] = useState(false);
  const [contact, setContact] = useState('');
  const [notes, setNotes] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!name.trim()) { setFormError('Vendor name is required.'); return; }
    const result = await runCommand(
      'updateVendor',
      {
        vendorId,
        name: name.trim(),
        alias: alias.trim() || null,
        termsDays: termsDays ? Number(termsDays) : undefined,
        consignmentDefault,
        contact: contact.trim() || null,
        notes: notes.trim() || null,
      },
      'Edit vendor details'
    );
    if (result.ok) onClose();
  }

  return (
    <FormDialog
      title="Edit Vendor"
      titleId="update-vendor-title"
      onClose={onClose}
      onSubmit={handleSubmit}
      submitLabel="Save"
      pendingLabel="Saving…"
      pending={isRunning}
      submitDisabled={!name.trim()}
      error={formError}
      maxWidthClass="max-w-lg"
    >
      <FormField id="uv-name" label="Vendor name *">
        <input
          id="uv-name"
          required
          className="w-full rounded border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-accent"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </FormField>
      <FormField id="uv-alias" label="Alias (short name)">
        <input
          id="uv-alias"
          className="w-full rounded border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-accent"
          value={alias}
          onChange={(e) => setAlias(e.target.value)}
          placeholder="Optional short name used in summaries"
        />
      </FormField>
      <FormField id="uv-terms" label="Payment terms (days)">
        <input
          id="uv-terms"
          type="number"
          min="0"
          step="1"
          className="w-full rounded border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-accent"
          value={termsDays}
          onChange={(e) => setTermsDays(e.target.value)}
        />
      </FormField>
      <label className="flex items-center gap-2 text-sm cursor-pointer">
        <input
          id="uv-consignment"
          type="checkbox"
          checked={consignmentDefault}
          onChange={(e) => setConsignmentDefault(e.target.checked)}
        />
        <span className="font-medium text-zinc-700">Consignment default</span>
      </label>
      <FormField id="uv-contact" label="Contact info">
        <textarea
          id="uv-contact"
          rows={2}
          className="w-full rounded border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-accent resize-none"
          value={contact}
          onChange={(e) => setContact(e.target.value)}
          placeholder="Phone, email, or other contact details"
        />
      </FormField>
      <FormField id="uv-notes" label="Notes">
        <textarea
          id="uv-notes"
          rows={3}
          className="w-full rounded border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-accent resize-y"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </FormField>
    </FormDialog>
  );
}

// UX-D01: deep-link helper — navigate to the vendors (payables) view filtered
// and drawered to a specific bill row. Mirrors the CountPill pattern (E01).
function useVendorBillDeepLink() {
  const setActiveView = useUiStore((state) => state.setActiveView);
  const setGridFilter = useUiStore((state) => state.setGridFilter);
  const setDrawerEntity = useUiStore((state) => state.setDrawerEntity);
  const setDrawerState = useUiStore((state) => state.setDrawerState);
  const navigate = useNavigate();
  return (billId: string | undefined) => {
    if (!billId) return;
    setGridFilter('vendors', `id:${billId}`);
    setDrawerEntity('vendors', 'vendorBill', billId);
    setDrawerState('vendors', 'standard');
    navigate('/vendors');
    setActiveView('vendors');
  };
}

const MS_PER_DAY = 86400000;

export function VendorPayablesView() {
  const selectedRows = useUiStore((state) => state.selectedRows.vendors);
  const selectedBill = selectedRows?.[0];
  const { runCommand, setNextSuccessActions, isRunning } = useCommandRunner();
  const me = trpc.auth.me.useQuery();
  // UX-D01: deep-link for "View bill" success toast action
  const openVendorBillDeepLink = useVendorBillDeepLink();
  const canWrite = me.data?.role !== 'viewer';
  const canVoid = me.data?.role === 'manager' || me.data?.role === 'owner';
  const navigate = useNavigate();
  const matchSettings = trpc.queries.matchmakingSettings.useQuery();
  const matchCounts = trpc.queries.matchmakingEntityCounts.useQuery(undefined, {
    enabled: matchSettings.data?.showVendorsColumn ?? false,
  });

  const confirm = useConfirm();

  return (
    <div className="h-full flex flex-col">
      {/* ── Pre/post-selection workspace panels ───────────────────────────── */}
      {/* Pre/post-selection band swap (spec §1.4 #2): the payout commit
          row appears only once a bill is selected — no disabled-control
          strip before that. Both tools use WorkspacePanel chrome
          (collapsible, persisted) like Payments allocations. */}
      {selectedBill ? (
        <WorkspacePanel panelId="vendors-money-out" title="Record payout" subtitle="Commits against the selected bill." headingLevel={2}>
          <VendorMoneyOutStrip selectedBill={selectedBill} />
        </WorkspacePanel>
      ) : null}
      <WorkspacePanel panelId="vendors-bill-tools" title="Vendor bill and payout tools" subtitle="Manual bill creation and payout voiding — no selection required." headingLevel={2}>
        <VendorBillTools selectedBill={selectedBill} />
      </WorkspacePanel>

      {/* ── Main grid — GridView template handles column defs, filtering, bulk actions, slide-over ── */}
      <div className="flex-1 min-h-0">
        <GridView viewKey="vendors" entityType="vendorBill" />
      </div>
    </div>
  );
}

function VendorMoneyOutStrip({ selectedBill }: { selectedBill?: GridRow }) {
  const { runCommand, isRunning } = useCommandRunner();
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState('cash');
  const [bucket, setBucket] = useState('accounting');
  const [amount, setAmount] = useState('');
  const [reference, setReference] = useState('');
  const openAmount = Number(selectedBill?.amount ?? 0) - Number(selectedBill?.amountPaid ?? 0);
  const payoutAmount = amount ? Number(amount) : openAmount;
  const selectedStatus = String(selectedBill?.status ?? '');
  const trace = selectedBill ? `${moneyBucketLabel(bucket)} to ${String(selectedBill.billNo ?? 'bill')}` : `${moneyBucketLabel(bucket)} to selected bill`;
  const impact = selectedBill ? `Pays ${moneyish(Math.min(Math.max(openAmount, 0), Math.max(payoutAmount, 0)))} on ${String(selectedBill.billNo ?? 'bill')}` : 'Select bill to preview payout';

  async function commit() {
    if (!selectedBill?.id) return;
    if (selectedStatus !== 'scheduled') {
      const scheduled = await runCommand('scheduleVendorPayment', { vendorBillId: selectedBill.id, scheduledFor: new Date(date).toISOString() }, 'Money out row: schedule vendor payout');
      if (!scheduled.ok) return;
    }
    await runCommand('recordVendorPayment', { vendorBillId: selectedBill.id, amount: payoutAmount, method, reference }, 'Money out row: record vendor payout');
  }

  return (
    <section className="money-out-strip" aria-label="Money out payout row">
      <span className="selection-pill">{selectedBill ? `${String(selectedBill.vendor ?? 'Vendor')} / ${String(selectedBill.billNo ?? 'bill')}` : 'Select vendor bill'}</span>
      <label className="field-inline">
        Date
        <input className="input compact" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
      </label>
      <label className="field-inline">
        Method
        <select className="select compact" value={method} onChange={(event) => setMethod(event.target.value)}>
          <option value="cash">Cash</option>
          <option value="check">Check</option>
          <option value="wire">Wire</option>
          <option value="crypto">Crypto</option>
        </select>
      </label>
      <label className="field-inline">
        Bucket
        <select className="select compact" value={bucket} onChange={(event) => setBucket(event.target.value)}>
          <option value="accounting">Accounting</option>
          <option value="cash-file-a">Cash file A</option>
          <option value="cash-file-b">Cash file B</option>
          <option value="wire-clearing">Wire clearing</option>
        </select>
      </label>
      <label className="field-inline">
        Amount
        <input className="input compact" value={amount} placeholder={openAmount > 0 ? moneyish(openAmount) : '0'} inputMode="decimal" onChange={(event) => setAmount(event.target.value)} />
      </label>
      <label className="field-inline grow">
        Reference
        <input className="input" value={reference} onChange={(event) => setReference(event.target.value)} />
      </label>
      <span className="selection-pill">{impact}</span>
      <span className="selection-pill">{trace}</span>
      <button className="primary-button compact-action" type="button" disabled={!selectedBill?.id || payoutAmount <= 0 || isRunning} title={!selectedBill?.id ? 'Select a vendor bill first' : payoutAmount <= 0 ? 'Enter a payout amount greater than zero' : undefined} onClick={commit}>
        Commit payout
      </button>
    </section>
  );
}

function moneyBucketLabel(value: string) {
  const labels: Record<string, string> = {
    accounting: 'Accounting',
    'cash-file-a': 'Cash file A',
    'cash-file-b': 'Cash file B',
    'wire-clearing': 'Wire clearing'
  };
  return labels[value] ?? labelFromToken(value);
}

function VendorBillTools({ selectedBill }: { selectedBill?: GridRow }) {
  const reference = trpc.queries.reference.useQuery();
  const vendorPayments = trpc.queries.vendorPayments.useQuery(
    { vendorBillId: selectedBill?.id as string | undefined, vendorId: selectedBill?.vendorId as string | undefined },
    { enabled: Boolean(selectedBill?.id || selectedBill?.vendorId) }
  );
  const { runCommand, isRunning } = useCommandRunner();
  const confirm = useConfirm();
  const [vendorId, setVendorId] = useState('');
  const [amount, setAmount] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [dueReason, setDueReason] = useState('Manual vendor payable');
  const [receiptPaymentId, setReceiptPaymentId] = useState('');

  // UX-Q04: edit vendor dialog state
  const [showEditVendor, setShowEditVendor] = useState(false);
  const activeVendorId = selectedBill?.vendorId ? String(selectedBill.vendorId) : (vendorId || '');
  const activeVendorRef = reference.data?.vendors.find(
    (v: { id: string; name: string; termsDays: number }) => v.id === activeVendorId
  );

  async function handleVoidPayment(paymentId: string, paymentAmount: unknown) {
    const ok = await confirm({
      title: 'Void this payout?',
      body: `Voiding reverses this payout (${moneyish(paymentAmount)} recorded). The bill will return to "approved" status and the amount paid will be decremented. You can then reschedule and re-record the payout. This action cannot be undone.`,
      primaryLabel: 'Void payout',
      tone: 'danger',
    });
    if (!ok) return;
    await runCommand('voidVendorPayment', { vendorPaymentId: paymentId }, 'Void selected vendor payout');
  }

  return (
    <section>
      <div className="flex flex-wrap items-center gap-2">
        <span className="selection-pill">{vendorPayments.data?.length ?? 0} payout(s)</span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <label className="field-inline">
          Vendor
          <select className="select" value={vendorId || String(selectedBill?.vendorId ?? '')} onChange={(event) => setVendorId(event.target.value)}>
            <option value="">Choose vendor</option>
            {reference.data?.vendors.map((vendor) => (
              <option key={vendor.id} value={vendor.id}>
                {vendor.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field-inline">
          Amount
          <input className="input compact" value={amount} inputMode="decimal" onChange={(event) => setAmount(event.target.value)} />
        </label>
        <label className="field-inline">
          Due
          <input className="input compact" type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
        </label>
        <label className="field-inline">
          Why
          <input className="input" value={dueReason} onChange={(event) => setDueReason(event.target.value)} />
        </label>
        <button
          className="secondary-button"
          type="button"
          disabled={!(vendorId || selectedBill?.vendorId) || !amount || isRunning}
          title={!(vendorId || selectedBill?.vendorId) ? 'Select a vendor to create a bill' : !amount ? 'Enter an amount to create a bill' : undefined}
          onClick={() => runCommand('createVendorBill', { vendorId: vendorId || selectedBill?.vendorId, amount: Number(amount), dueDate: dueDate || undefined, dueReason }, 'Create manual vendor bill')}
        >
          Create bill
        </button>
      </div>
      <div className="mt-3 grid gap-2 text-xs md:grid-cols-3">
        <span className="selection-pill">Bill {String(selectedBill?.billNo ?? 'none')}</span>
        <span className="selection-pill">Open ${moneyish(Number(selectedBill?.amount ?? 0) - Number(selectedBill?.amountPaid ?? 0))}</span>
        <span className="selection-pill success">{selectedBill ? String(selectedBill.dueReason ?? 'Due reason not recorded') : 'Select bill to see due reason'}</span>
      </div>

      {/* UX-Q04: Edit vendor affordance */}
      {activeVendorId && activeVendorRef && (
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            className="secondary-button compact-action text-xs"
            onClick={() => setShowEditVendor(true)}
            disabled={isRunning}
            data-testid="edit-vendor-button"
            title={`Edit vendor "${String(activeVendorRef.name)}"`}
          >
            <Pencil className="inline h-3 w-3 mr-1" aria-hidden="true" />
            Edit vendor
          </button>
        </div>
      )}
      {showEditVendor && activeVendorRef && (
        <UpdateVendorDialog
          vendorId={activeVendorId}
          initialName={String(activeVendorRef.name)}
          initialTermsDays={Number(activeVendorRef.termsDays ?? 14)}
          onClose={() => setShowEditVendor(false)}
        />
      )}
      {vendorPayments.data?.length ? (
        <div className="finder-table-wrap max-h-48">
          <table className="finder-table">
            <thead>
              <tr>
                <th>Bill</th>
                <th>Amount</th>
                <th>Method</th>
                <th>Reference</th>
                <th>Status</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {vendorPayments.data.map((payment) => {
                const isVoided = String(payment.status ?? '') === 'void';
                return (
                  <tr key={String(payment.id)}>
                    <td>{String(payment.billNo ?? selectedBill?.billNo ?? 'Bill')}</td>
                    <td>${moneyish(payment.amount)}</td>
                    <td>{labelFromToken(String(payment.method ?? '-'))}</td>
                    <td>{String(payment.reference ?? '-')}</td>
                    <td>{labelFromToken(String(payment.status ?? '-'))}</td>
                    <td>
                      {!isVoided ? (
                        <button
                          type="button"
                          className="compact-action text-xs text-red-600 hover:text-red-800 disabled:opacity-50"
                          disabled={isRunning}
                          title="Void this payout — returns bill to approved, decrements amount paid"
                          onClick={() => handleVoidPayment(String(payment.id), payment.amount)}
                        >
                          <Ban className="inline h-3 w-3 mr-0.5" aria-hidden="true" />
                          Void
                        </button>
                      ) : (
                        <span className="text-xs text-zinc-400">Voided</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
      {receiptPaymentId ? (
        <ReceiptPanel kind="vendor_payment" vendorPaymentId={receiptPaymentId} />
      ) : null}
    </section>
  );
}
