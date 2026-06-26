import { useState } from 'react';
import { ArrowRightLeft, Plus, Trash2 } from 'lucide-react';
import { useCommandRunner } from '../components/useCommandRunner';

type BarterTab = 'pay' | 'settle';

interface PayLine {
  batchId: string;
  qty: number;
}

interface SettleLine {
  productName: string;
  qty: number;
  unitCost: number;
}

export function BarterView() {
  const { runCommand, isRunning } = useCommandRunner();
  const [activeTab, setActiveTab] = useState<BarterTab>('pay');

  // ── payWithProduct form state ───────────────────────────────────────────
  const [payForm, setPayForm] = useState({
    counterpartyType: 'vendor' as 'vendor' | 'customer',
    vendorId: '',
    customerId: '',
    lines: [{ batchId: '', qty: 1 }] as PayLine[],
    settlementAmount: '',
    overrideReason: '',
    reason: '',
    note: '',
  });

  // ── settleDebtWithProduct form state ────────────────────────────────────
  const [settleForm, setSettleForm] = useState({
    customerId: '',
    lines: [{ productName: '', qty: 1, unitCost: 0 }] as SettleLine[],
    settlementAmount: '',
    overrideReason: '',
    allocationIntent: 'unapplied' as 'fifo' | 'selected_invoice' | 'unapplied',
    invoiceId: '',
    reason: '',
    note: '',
  });

  // ── Pay line helpers ────────────────────────────────────────────────────
  const addPayLine = () => setPayForm((p) => ({ ...p, lines: [...p.lines, { batchId: '', qty: 1 }] }));

  const removePayLine = (i: number) =>
    setPayForm((p) => ({ ...p, lines: p.lines.filter((_, idx) => idx !== i) }));

  const updatePayLine = (i: number, patch: Partial<PayLine>) =>
    setPayForm((p) => ({
      ...p,
      lines: p.lines.map((l, idx) => (idx === i ? { ...l, ...patch } : l)),
    }));

  // ── Settle line helpers ─────────────────────────────────────────────────
  const addSettleLine = () =>
    setSettleForm((s) => ({
      ...s,
      lines: [...s.lines, { productName: '', qty: 1, unitCost: 0 }],
    }));

  const removeSettleLine = (i: number) =>
    setSettleForm((s) => ({ ...s, lines: s.lines.filter((_, idx) => idx !== i) }));

  const updateSettleLine = (i: number, patch: Partial<SettleLine>) =>
    setSettleForm((s) => ({
      ...s,
      lines: s.lines.map((l, idx) => (idx === i ? { ...l, ...patch } : l)),
    }));

  // ── Submit handlers ─────────────────────────────────────────────────────
  const handlePayWithProduct = async () => {
    const payload: Record<string, unknown> = {
      counterpartyType: payForm.counterpartyType,
      lines: payForm.lines.map((l) => ({ batchId: l.batchId, qty: Number(l.qty) })),
      ...(payForm.settlementAmount && { settlementAmount: Number(payForm.settlementAmount) }),
      ...(payForm.overrideReason && { overrideReason: payForm.overrideReason }),
      ...(payForm.note && { note: payForm.note }),
    };
    if (payForm.counterpartyType === 'vendor') {
      payload.vendorId = payForm.vendorId;
    } else {
      payload.customerId = payForm.customerId;
    }
    await runCommand('payWithProduct', payload, payForm.reason || undefined);
  };

  const handleSettleDebt = async () => {
    const payload: Record<string, unknown> = {
      customerId: settleForm.customerId,
      lines: settleForm.lines.map((l) => ({
        productName: l.productName,
        qty: Number(l.qty),
        unitCost: Number(l.unitCost),
      })),
      allocationIntent: settleForm.allocationIntent,
      ...(settleForm.settlementAmount && { settlementAmount: Number(settleForm.settlementAmount) }),
      ...(settleForm.overrideReason && { overrideReason: settleForm.overrideReason }),
      ...(settleForm.invoiceId && { invoiceId: settleForm.invoiceId }),
      ...(settleForm.note && { note: settleForm.note }),
    };
    await runCommand('settleDebtWithProduct', payload, settleForm.reason || undefined);
  };

  // ── Shared input class ──────────────────────────────────────────────────
  const inputClass =
    'w-full rounded-md border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500';
  const labelClass = 'block text-sm font-medium text-zinc-700 mb-1';
  const btnPrimary =
    'rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50';
  const btnSecondary =
    'rounded-md border border-line bg-white px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-50';

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="max-w-2xl mx-auto p-6">
      <div className="flex items-center gap-2 mb-6">
        <ArrowRightLeft className="w-5 h-5 text-zinc-600" />
        <h1 className="text-xl font-semibold text-ink">Barter Settlement</h1>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-line mb-6">
        {(['pay', 'settle'] as BarterTab[]).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={[
              'px-4 py-2 text-sm font-medium border-b-2 -mb-[1px] transition-colors',
              activeTab === tab
                ? 'text-blue-600 border-blue-600'
                : 'text-zinc-500 border-transparent hover:text-zinc-700',
            ].join(' ')}
          >
            {tab === 'pay' ? 'Pay with Product' : 'Settle Debt with Product'}
          </button>
        ))}
      </div>

      {/* ── Pay with Product form ────────────────────────────────────────── */}
      {activeTab === 'pay' && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handlePayWithProduct();
          }}
          className="space-y-5"
        >
          {/* Counterparty type */}
          <div>
            <label className={labelClass}>Counterparty Type</label>
            <select
              className={inputClass}
              value={payForm.counterpartyType}
              onChange={(e) =>
                setPayForm((p) => ({
                  ...p,
                  counterpartyType: e.target.value as 'vendor' | 'customer',
                }))
              }
            >
              <option value="vendor">Vendor</option>
              <option value="customer">Customer</option>
            </select>
          </div>

          {/* Counterparty ID */}
          {payForm.counterpartyType === 'vendor' ? (
            <div>
              <label className={labelClass}>Vendor ID</label>
              <input
                className={inputClass}
                type="text"
                placeholder="e.g. 11111111-1111-4111-8111-111111111111"
                value={payForm.vendorId}
                onChange={(e) => setPayForm((p) => ({ ...p, vendorId: e.target.value }))}
              />
            </div>
          ) : (
            <div>
              <label className={labelClass}>Customer ID</label>
              <input
                className={inputClass}
                type="text"
                placeholder="e.g. 44444444-4444-4444-8444-444444444444"
                value={payForm.customerId}
                onChange={(e) => setPayForm((p) => ({ ...p, customerId: e.target.value }))}
              />
            </div>
          )}

          {/* Lines */}
          <fieldset>
            <legend className={`${labelClass} mb-2`}>Lines</legend>
            <div className="space-y-3">
              {payForm.lines.map((line, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    className={inputClass}
                    type="text"
                    placeholder="Batch ID"
                    value={line.batchId}
                    onChange={(e) => updatePayLine(i, { batchId: e.target.value })}
                  />
                  <input
                    className={inputClass}
                    type="number"
                    placeholder="Qty"
                    min={1}
                    style={{ width: 100 }}
                    value={line.qty}
                    onChange={(e) => updatePayLine(i, { qty: Number(e.target.value) })}
                  />
                  {payForm.lines.length > 1 && (
                    <button
                      type="button"
                      className="p-2 text-zinc-400 hover:text-red-500"
                      onClick={() => removePayLine(i)}
                      title="Remove line"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button type="button" className={`${btnSecondary} mt-2 inline-flex items-center gap-1`} onClick={addPayLine}>
              <Plus className="w-3.5 h-3.5" />
              Add Line
            </button>
          </fieldset>

          {/* Settlement amount (optional override) */}
          <div>
            <label className={labelClass}>
              Settlement Amount <span className="text-zinc-400 font-normal">(optional — defaults to cost basis)</span>
            </label>
            <input
              className={inputClass}
              type="number"
              placeholder="0.00"
              step="0.01"
              value={payForm.settlementAmount}
              onChange={(e) => setPayForm((p) => ({ ...p, settlementAmount: e.target.value }))}
            />
          </div>

          {/* Override reason (required when settlementAmount differs from cost) */}
          <div>
            <label className={labelClass}>
              Override Reason{' '}
              <span className="text-zinc-400 font-normal">(required if settlement amount overrides cost)</span>
            </label>
            <input
              className={inputClass}
              type="text"
              placeholder="e.g. market adjustment"
              value={payForm.overrideReason}
              onChange={(e) => setPayForm((p) => ({ ...p, overrideReason: e.target.value }))}
            />
          </div>

          {/* Note */}
          <div>
            <label className={labelClass}>
              Note <span className="text-zinc-400 font-normal">(optional)</span>
            </label>
            <textarea
              className={inputClass}
              rows={2}
              placeholder="Internal note..."
              value={payForm.note}
              onChange={(e) => setPayForm((p) => ({ ...p, note: e.target.value }))}
            />
          </div>

          {/* Reason (audit) */}
          <div>
            <label className={labelClass}>
              Reason <span className="text-zinc-400 font-normal">(audit trail)</span>
            </label>
            <input
              className={inputClass}
              type="text"
              placeholder="Why this settlement is being issued"
              value={payForm.reason}
              onChange={(e) => setPayForm((p) => ({ ...p, reason: e.target.value }))}
            />
          </div>

          <button type="submit" disabled={isRunning} className={btnPrimary}>
            {isRunning ? 'Processing...' : 'Pay with Product'}
          </button>
        </form>
      )}

      {/* ── Settle Debt with Product form ─────────────────────────────────── */}
      {activeTab === 'settle' && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSettleDebt();
          }}
          className="space-y-5"
        >
          {/* Customer ID */}
          <div>
            <label className={labelClass}>Customer ID</label>
            <input
              className={inputClass}
              type="text"
              placeholder="e.g. 44444444-4444-4444-8444-444444444444"
              value={settleForm.customerId}
              onChange={(e) => setSettleForm((s) => ({ ...s, customerId: e.target.value }))}
            />
          </div>

          {/* Lines */}
          <fieldset>
            <legend className={`${labelClass} mb-2`}>Lines</legend>
            <div className="space-y-3">
              {settleForm.lines.map((line, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    className={inputClass}
                    type="text"
                    placeholder="Product name"
                    value={line.productName}
                    onChange={(e) => updateSettleLine(i, { productName: e.target.value })}
                  />
                  <input
                    className={inputClass}
                    type="number"
                    placeholder="Qty"
                    min={1}
                    style={{ width: 80 }}
                    value={line.qty}
                    onChange={(e) => updateSettleLine(i, { qty: Number(e.target.value) })}
                  />
                  <input
                    className={inputClass}
                    type="number"
                    placeholder="Unit cost"
                    step="0.01"
                    style={{ width: 110 }}
                    value={line.unitCost}
                    onChange={(e) => updateSettleLine(i, { unitCost: Number(e.target.value) })}
                  />
                  {settleForm.lines.length > 1 && (
                    <button
                      type="button"
                      className="p-2 text-zinc-400 hover:text-red-500"
                      onClick={() => removeSettleLine(i)}
                      title="Remove line"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button type="button" className={`${btnSecondary} mt-2 inline-flex items-center gap-1`} onClick={addSettleLine}>
              <Plus className="w-3.5 h-3.5" />
              Add Line
            </button>
          </fieldset>

          {/* Settlement amount (optional override) */}
          <div>
            <label className={labelClass}>
              Settlement Amount{' '}
              <span className="text-zinc-400 font-normal">(optional — defaults to cost basis)</span>
            </label>
            <input
              className={inputClass}
              type="number"
              placeholder="0.00"
              step="0.01"
              value={settleForm.settlementAmount}
              onChange={(e) => setSettleForm((s) => ({ ...s, settlementAmount: e.target.value }))}
            />
          </div>

          {/* Override reason */}
          <div>
            <label className={labelClass}>
              Override Reason{' '}
              <span className="text-zinc-400 font-normal">(required if settlement amount overrides cost)</span>
            </label>
            <input
              className={inputClass}
              type="text"
              placeholder="e.g. market adjustment"
              value={settleForm.overrideReason}
              onChange={(e) => setSettleForm((s) => ({ ...s, overrideReason: e.target.value }))}
            />
          </div>

          {/* Allocation intent */}
          <div>
            <label className={labelClass}>Allocation Intent</label>
            <select
              className={inputClass}
              value={settleForm.allocationIntent}
              onChange={(e) =>
                setSettleForm((s) => ({
                  ...s,
                  allocationIntent: e.target.value as 'fifo' | 'selected_invoice' | 'unapplied',
                }))
              }
            >
              <option value="unapplied">Unapplied (credit on account)</option>
              <option value="fifo">FIFO (apply to oldest invoices)</option>
              <option value="selected_invoice">Selected Invoice</option>
            </select>
          </div>

          {/* Invoice ID (only when selected_invoice) */}
          {settleForm.allocationIntent === 'selected_invoice' && (
            <div>
              <label className={labelClass}>Invoice ID</label>
              <input
                className={inputClass}
                type="text"
                placeholder="Invoice UUID"
                value={settleForm.invoiceId}
                onChange={(e) => setSettleForm((s) => ({ ...s, invoiceId: e.target.value }))}
              />
            </div>
          )}

          {/* Note */}
          <div>
            <label className={labelClass}>
              Note <span className="text-zinc-400 font-normal">(optional)</span>
            </label>
            <textarea
              className={inputClass}
              rows={2}
              placeholder="Internal note..."
              value={settleForm.note}
              onChange={(e) => setSettleForm((s) => ({ ...s, note: e.target.value }))}
            />
          </div>

          {/* Reason (audit) */}
          <div>
            <label className={labelClass}>
              Reason <span className="text-zinc-400 font-normal">(audit trail)</span>
            </label>
            <input
              className={inputClass}
              type="text"
              placeholder="Why this settlement is being accepted"
              value={settleForm.reason}
              onChange={(e) => setSettleForm((s) => ({ ...s, reason: e.target.value }))}
            />
          </div>

          <button type="submit" disabled={isRunning} className={btnPrimary}>
            {isRunning ? 'Processing...' : 'Settle Debt with Product'}
          </button>
        </form>
      )}
    </div>
  );
}
