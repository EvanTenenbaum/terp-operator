import { Ban, CalendarClock, Landmark, Pencil, ShieldCheck } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ColDef } from 'ag-grid-community';
import { trpc } from '../api/trpc';
import { StatusActionBar, type StatusActionTable, FormDialog, FormField } from '../components/templates';
import { WorkspacePanel } from '../components/WorkspacePanel';
import { useCommandRunner } from '../components/useCommandRunner';
import { useUiStore } from '../store/uiStore';
import { useConfirm } from '../hooks/useConfirm';
import { ReceiptPanel } from '../components/ReceiptPanel';
import type { GridRow } from '../../shared/types';
import { GridJourney, labelFromToken, moneyish } from './operations/shared';

// ─── UX-Q04: UpdateVendorDialog ─────────────────────────────────────────────
// Edit affordance for vendor rows: name, alias, terms, consignment default,
// contact info, notes.  Payload matches updateVendorPayloadSchema.
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

  const vendorMatchColumns = useMemo((): ColDef<GridRow>[] => {
    // UX-K01: dueReason and scheduledFor render as badge columns so operators
    // can scan "why due / when scheduled" inline without opening the drawer.
    // dueReason badge: amber for consignment signals, zinc for standard reasons.
    // scheduledFor badge: indigo when a payout event exists, zinc dash otherwise.
    const base: ColDef<GridRow>[] = [
      {
        field: 'vendor',
        pinned: 'left',
        width: 190,
        // UX-B03: (1) when linked, vendor name links to the contact profile;
        // (2) when unlinked, show a compact "Link contact" action that dispatches
        // linkContactToExistingEntity with entityType='vendor'.
        cellRenderer: (params: { data?: GridRow; value: string }) => {
          if (params.data?.contactId) {
            return (
              <button
                className="text-button font-medium text-left"
                onClick={() => navigate(`/contacts/${String(params.data!.contactId)}`)}
                type="button"
              >
                {params.value}
              </button>
            );
          }
          return (
            <span className="flex items-center gap-2">
              <span>{params.value}</span>
              <button
                type="button"
                className="compact-action text-xs text-blue-600 hover:text-blue-800"
                title="Link this vendor to a contact profile"
                onClick={() => {
                  const vendorId = String(params.data?.vendorId ?? params.data?.id ?? '');
                  if (!vendorId) return;
                  void runCommand(
                    'linkContactToExistingEntity',
                    { contactId: '', entityType: 'vendor', entityId: vendorId },
                    'Link vendor to contact'
                  );
                }}
              >
                Link contact
              </button>
            </span>
          );
        }
      },
      { field: 'billNo', width: 150 },
      { field: 'amount', type: 'numericColumn', width: 120 },
      { field: 'amountPaid', type: 'numericColumn', width: 130 },
      { field: 'status', width: 125 },
      { field: 'dueDate', width: 180 },
      {
        field: 'scheduledFor',
        headerName: 'Scheduled',
        width: 190,
        cellRenderer: (params: { value: unknown; data?: GridRow }) => {
          const raw = params.value;
          if (!raw) {
            return <span className="text-xs text-zinc-400">— not scheduled</span>;
          }
          const d = new Date(String(raw));
          const label = Number.isNaN(d.getTime()) ? String(raw) : d.toLocaleDateString('en-US');
          return (
            <span className="inline-flex items-center rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-semibold text-indigo-800">
              {label}
            </span>
          );
        }
      },
      {
        field: 'dueReason',
        headerName: 'Due reason',
        minWidth: 240,
        cellRenderer: (params: { value: unknown; data?: GridRow }) => {
          const raw = params.value;
          if (!raw) return <span className="text-xs text-zinc-400">—</span>;
          const text = String(raw);
          const isConsignment = Boolean(params.data?.consignmentTriggered) ||
            text.toLowerCase().includes('consign');
          const cls = isConsignment
            ? 'inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800'
            : 'inline-flex items-center rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700';
          return <span className={cls}>{text}</span>;
        }
      },
      { field: 'consignmentTriggered', width: 170 }
    ];
    if (!matchSettings.data?.showVendorsColumn) return base;
    return [
      ...base,
      {
        headerName: 'Matchmaking',
        width: 140,
        cellRenderer: (params: { data?: GridRow }) => {
          const counts = matchCounts.data?.vendors[String(params.data?.vendorId ?? '')];
          if (!counts) return <span className="text-xs text-zinc-400">No activity</span>;
          return (
            <a
              href={`/matchmaking?vendor=${params.data?.id}`}
              className="text-xs text-blue-600 hover:underline"
              onClick={(e) => { e.preventDefault(); navigate(`/matchmaking?vendor=${params.data?.id}`); }}
            >
              {counts.supply} stock listed
            </a>
          );
        },
      },
    ];
  }, [matchSettings.data?.showVendorsColumn, matchCounts.data, navigate, runCommand]);

  const confirm = useConfirm();

  const vendorBillExpansionConfig = useMemo(
    () => ({
      enabled: true,
      // CMD-VENDOR / TER-1517: status-aware inline actions — show only the
      // action that is valid for the current bill status. Void is visible to
      // manager+ for any non-terminal status. Viewer role sees a read-only note.
      actionsRenderer: (row: GridRow) => {
        const rowStatus = String(row.status ?? '');
        const isTerminal = rowStatus === 'paid' || rowStatus === 'voided';
        const showApprove = rowStatus === 'open' || rowStatus === 'pending';
        const showSchedule = rowStatus === 'approved';
        const showRecord = rowStatus === 'scheduled';

        if (!canWrite) {
          return (
            <span className="text-xs text-zinc-400">
              Manager or owner required to act on this bill.
            </span>
          );
        }

        return (
          <>
            {showApprove ? (
              <button
                className="primary-button compact-action"
                disabled={isRunning}
                onClick={() => {
                  if (!row.id || String(row.id).trim() === '') return;
                  runCommand('approveVendorBill', { vendorBillId: row.id }, 'Approve vendor bill');
                }}
                type="button"
              >
                <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                Approve
              </button>
            ) : null}

            {showSchedule ? (
              <button
                className="primary-button compact-action"
                disabled={isRunning}
                onClick={() => {
                  if (!row.id || String(row.id).trim() === '') return;
                  runCommand('scheduleVendorPayment', { vendorBillId: row.id, scheduledFor: new Date(Date.now() + MS_PER_DAY).toISOString() }, 'Schedule vendor payment');
                }}
                type="button"
              >
                <CalendarClock className="h-4 w-4" aria-hidden="true" />
                Schedule
              </button>
            ) : null}

            {showRecord ? (
              <button
                className="primary-button compact-action"
                disabled={isRunning}
                onClick={() => {
                  if (!row.id || String(row.id).trim() === '') return;
                  runCommand('recordVendorPayment', { vendorBillId: row.id }, 'Record vendor payout');
                }}
                type="button"
              >
                <Landmark className="h-4 w-4" aria-hidden="true" />
                Pay
              </button>
            ) : null}

            {!isTerminal && canVoid ? (
              // Void requires a vendorPaymentId — open the Payments drawer tab
              // (Details tab also surfaces Void) to select the specific payment.
              // This inline indicator is intentionally read-only; it confirms
              // void access and directs the operator to the drawer for the action.
              <span
                className="text-xs text-zinc-500"
                title="Open the Payments or Details drawer tab to void a specific payment"
              >
                <Ban className="inline h-3 w-3 mr-1 text-zinc-400" aria-hidden="true" />
                Void via drawer
              </span>
            ) : null}

            {isTerminal ? (
              <span className="text-xs text-zinc-400">
                {rowStatus === 'paid' ? 'Paid in full' : 'Voided'}
              </span>
            ) : null}
          </>
        );
      }
    }),
    [isRunning, runCommand, canWrite, canVoid]
  );

  return (
    <GridJourney
      view="vendors"
      title="Vendor Payouts"
      columns={vendorMatchColumns}
      // UX-D03: tailored empty state names the producing verb + surface.
      emptyTitle="No vendor bills — create a bill to schedule a payout"
      emptyChildren="Vendor bills are created from posted purchase receipts or manually via 'Create bill' above. Bills appear here once created."
      prelude={() => (
        <>
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
        </>
      )}
      selectionActions={(rows) => {
        // Spec §10.6 — status-aware primary decision table for vendor bills.
        // Status values verified against schema + commandBus (NOT the spec's
        // names): open → approved → scheduled → (partial →) paid, with
        // 'reversed' from reversals. There is no 'void' BILL status — void
        // applies to vendor_payments (TER-1517 expansion + VendorBillTools).
        // recordVendorPayment requires status 'scheduled', so Pay actions on
        // unscheduled bills schedule first (same sequence as the Money-out
        // commit row).
        // UX-D01: "View bill" action on pay success toast. Call
        // setNextSuccessActions immediately before runCommand so the hook
        // attaches the action to the success toast. runCommand stays 3-arg,
        // preserving the existing test contract in statusTables.test.tsx.
        // UX-K02: for open/pending bills the operator is bypassing the normal
        // approve → schedule → pay flow by clicking "Pay now" directly from the
        // tray. Show a confirm dialog whose body states exactly what the server
        // will do (schedule first, then record).
        // Scope: open + pending only — bills in 'approved' or 'partial' are
        // already further in the flow and the two-step is expected; 'scheduled'
        // bills go straight to recordVendorPayment (no scheduling step needed).
        // Copy verified against commandBus.ts:4238-4270: scheduleVendorPayment
        // sets status 'scheduled', then recordVendorPayment creates the payment
        // row and transitions to 'paid' (or 'partial'). The confirm copy is honest.
        const payBill = async (bill: GridRow | undefined) => {
          if (!bill?.id) return;
          const billId = String(bill.id);
          const billStatus = String(bill.status ?? '');
          const needsScheduleConfirm = billStatus === 'open' || billStatus === 'pending';
          if (needsScheduleConfirm) {
            const ok = await confirm({
              title: 'Confirm payout',
              body: 'This will schedule an immediate payout event, then record payment.',
              primaryLabel: 'Pay',
            });
            if (!ok) return;
          }
          if (billStatus !== 'scheduled') {
            const scheduled = await runCommand('scheduleVendorPayment', { vendorBillId: bill.id, scheduledFor: new Date().toISOString() }, 'Auto-schedule before payout');
            if (!scheduled.ok) return;
          }
          setNextSuccessActions?.([{ label: 'View bill', onAction: () => openVendorBillDeepLink(billId) }]);
          await runCommand('recordVendorPayment', { vendorBillId: bill.id }, 'Record vendor payout');
        };
        // UX-D01: "View bill" action on schedule success toast.
        const vAct = {
          approve: { key: 'approve', label: 'Approve', icon: <ShieldCheck className="h-4 w-4" aria-hidden="true" />, run: (r: GridRow[]) => runCommand('approveVendorBill', { vendorBillId: r[0].id }, 'Approve vendor bill') },
          schedule: (label: string) => ({ key: 'schedule', label, icon: <CalendarClock className="h-4 w-4" aria-hidden="true" />, run: (r: GridRow[]) => {
            const billId = String(r[0].id ?? '');
            setNextSuccessActions?.([{ label: 'View bill', onAction: () => openVendorBillDeepLink(billId) }]);
            return runCommand('scheduleVendorPayment', { vendorBillId: r[0].id, scheduledFor: new Date(Date.now() + MS_PER_DAY).toISOString() }, 'Schedule vendor payment');
          }}),
          pay: (label: string) => ({ key: 'pay', label, icon: <Landmark className="h-4 w-4" aria-hidden="true" />, run: (r: GridRow[]) => payBill(r[0]) })
        };
        const vendorBillTable: StatusActionTable = {
          rules: [
            { when: ['open', 'pending'], primary: vAct.approve, tray: [vAct.schedule('Schedule'), vAct.pay('Pay now')] },
            { when: 'approved', primary: vAct.schedule('Schedule'), tray: [vAct.pay('Pay now')] },
            { when: 'scheduled', primary: vAct.pay('Pay'), tray: [vAct.schedule('Reschedule')] },
            { when: 'partial', primary: vAct.pay('Pay remaining'), tray: [vAct.schedule('Reschedule')] },
            { when: ['paid', 'reversed'], primary: null, tray: [] },
            // Catch-all: every verb stays reachable on mixed/unknown statuses.
            { when: () => true, primary: null, tray: [vAct.approve, vAct.schedule('Schedule'), vAct.pay('Pay (schedules first)')] }
          ]
        };
        return <StatusActionBar rows={rows} table={vendorBillTable} busy={isRunning} />;
      }}
      expansionConfig={vendorBillExpansionConfig}
    />
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
  // UX-K04: useConfirm for void tray verb — keeps reversal-policy guidance in the dialog body.
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

  // UX-K04: void is a per-payment-row tray verb (TER-1517 expansion), not a
  // top-band button. The confirm dialog states the reversal policy: voiding
  // restores the bill to 'approved' and reverses amountPaid so the bill
  // can be rescheduled. Verified against commandBus.ts:4276-4298.
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
    /* Title/subtitle chrome is owned by the wrapping WorkspacePanel
       ("Vendor bill and payout tools") — this body keeps data + controls. */
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

      {/* UX-Q04: Edit vendor affordance — opens UpdateVendorDialog for the vendor
          associated with the selected bill (or the vendor chosen in the dropdown). */}
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
      {/* UX-K04: payment rows are the primary surface for voidVendorPayment.
          Each non-void payment row exposes a "Void" tray-verb button inline.
          The top-band payout selector + void button is removed — operators
          act directly on the row they can see, with policy guidance in the
          confirm dialog (not in the button label). */}
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
