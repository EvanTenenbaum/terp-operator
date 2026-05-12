import { BadgeDollarSign, ChevronDown, ChevronRight, ClipboardList, Landmark, PackagePlus, ShoppingCart } from 'lucide-react';
import { useMemo, useState } from 'react';
import { trpc } from '../api/trpc';
import { useUiStore } from '../store/uiStore';
import type { GridRow, PaymentMethod } from '../../shared/types';
import { useCommandRunner } from './useCommandRunner';

const methods: PaymentMethod[] = ['cash', 'check', 'card', 'crypto', 'wire'];

export function QuickStartBar() {
  const me = trpc.auth.me.useQuery();
  const reference = trpc.queries.reference.useQuery();
  const vendorBills = trpc.queries.grid.useQuery({ view: 'vendors' });
  const setActiveView = useUiStore((state) => state.setActiveView);
  const setActiveCustomerId = useUiStore((state) => state.setActiveCustomerId);
  const setSalesRequestText = useUiStore((state) => state.setSalesRequestText);
  const setSelectedRows = useUiStore((state) => state.setSelectedRows);
  const focusedPanelId = useUiStore((state) => state.focusedPanelId);
  const quickStartCollapsed = useUiStore((state) => Boolean(state.collapsedPanels['global:quick-start']));
  const activeQuickLaunch = useUiStore((state) => state.activeQuickLaunch);
  const setActiveQuickLaunch = useUiStore((state) => state.setActiveQuickLaunch);
  const togglePanelCollapsed = useUiStore((state) => state.togglePanelCollapsed);
  const { runCommand, isRunning } = useCommandRunner();
  const [customerId, setCustomerId] = useState('');
  const [vendorId, setVendorId] = useState('');
  const [billId, setBillId] = useState('');
  const [incomingAmount, setIncomingAmount] = useState('1000');
  const [outgoingAmount, setOutgoingAmount] = useState('');
  const [salesRequest, setSalesRequest] = useState('');
  const [expectedDate, setExpectedDate] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [fifo, setFifo] = useState(true);

  const selectedVendorId = vendorId || reference.data?.vendors[0]?.id || '';
  const payables = useMemo(() => {
    const rows = ((vendorBills.data ?? []) as GridRow[]).filter((row) => {
      const balance = Number(row.amount ?? 0) - Number(row.amountPaid ?? 0);
      return balance > 0 && ['open', 'approved', 'scheduled', 'partial'].includes(String(row.status));
    });
    return selectedVendorId ? rows.filter((row) => row.vendorId === selectedVendorId) : rows;
  }, [selectedVendorId, vendorBills.data]);
  const selectedBill = payables.find((row) => row.id === billId) ?? payables[0];
  const billBalance = selectedBill ? Number(selectedBill.amount ?? 0) - Number(selectedBill.amountPaid ?? 0) : 0;

  async function startSale() {
    if (!customerId) return;
    const result = await runCommand('createSalesOrder', { customerId }, 'Quick Start: new sale');
    if (result.ok && result.affectedIds[0]) setSelectedRows('sales', [{ id: result.affectedIds[0] }]);
    setActiveCustomerId(customerId);
    setSalesRequestText(salesRequest.trim());
    setActiveView('sales');
  }

  async function startPurchaseOrder() {
    if (!selectedVendorId) return;
    const result = await runCommand(
      'createPurchaseOrder',
      {
        vendorId: selectedVendorId,
        expectedDate: expectedDate || undefined,
        buyerNotes: 'Started from Quick Start'
      },
      'Quick Start: new purchase order'
    );
    if (result.ok && result.affectedIds[0]) setSelectedRows('purchaseOrders', [{ id: result.affectedIds[0] }]);
    setActiveView('purchaseOrders');
  }

  async function startReceiveInventory() {
    if (!selectedVendorId) return;
    const sourceCode = `DROP-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`;
    const result = await runCommand(
      'createBatch',
      {
        vendorId: selectedVendorId,
        sourceCode,
        shorthand: 'Ins/candy',
        name: 'New receiving line',
        category: 'Infused',
        intakeDate: new Date().toISOString(),
        intakeQty: 1,
        unitCost: 0,
        unitPrice: 0,
        ticketCost: 0,
        priceRange: '',
        ownershipStatus: 'UNKNOWN',
        status: 'draft',
        location: 'Receiving',
        notes: 'Started from Quick Start'
      },
      'Quick Start: new receiving draft'
    );
    if (result.ok && result.affectedIds[0]) setSelectedRows('intake', [{ id: result.affectedIds[0] }]);
    setActiveView('intake');
  }

  async function receiveMoney() {
    if (!customerId) return;
    const amount = Number(incomingAmount);
    const result = await runCommand('logPayment', { customerId, amount, method, locationBucket: 'quick-start', notes: 'Quick Start receipt' }, 'Quick Start: receive money');
    const paymentId = result.ok ? result.affectedIds[0] : null;
    if (fifo && amount > 0 && paymentId) await runCommand('allocatePayment', { paymentId }, 'Quick Start: FIFO payment allocation');
    setActiveView('payments');
  }

  async function payVendor() {
    if (!selectedBill) return;
    const vendorBillId = selectedBill.id;
    const amount = Number(outgoingAmount || billBalance);
    if (selectedBill.status !== 'scheduled') {
      await runCommand('scheduleVendorPayment', { vendorBillId, scheduledFor: new Date().toISOString() }, 'Quick Start: schedule vendor payout now');
    }
    await runCommand('recordVendorPayment', { vendorBillId, amount, method, reference: 'quick-start' }, 'Quick Start: pay vendor');
    setActiveView('vendors');
  }

  if (focusedPanelId || me.data?.role === 'viewer') return null;

  const launchChips = [
    { key: 'sale' as const, label: 'Sale', icon: ShoppingCart },
    { key: 'purchaseOrder' as const, label: 'Purchase', icon: ClipboardList },
    { key: 'receiving' as const, label: 'Receiving', icon: PackagePlus },
    { key: 'moneyIn' as const, label: 'Money In', icon: BadgeDollarSign },
    { key: 'moneyOut' as const, label: 'Money Out', icon: Landmark }
  ];

  return (
    <section className="quick-start-bar" aria-label="Quick Start">
      <button type="button" className="quick-start-title" onClick={() => togglePanelCollapsed('global:quick-start')} aria-expanded={!quickStartCollapsed}>
        {quickStartCollapsed ? <ChevronRight className="h-4 w-4" aria-hidden="true" /> : <ChevronDown className="h-4 w-4" aria-hidden="true" />}
        Quick Start
      </button>
      {quickStartCollapsed ? <span className="text-xs text-zinc-600">Sale, purchase, receiving, money in, and money out controls are minimized.</span> : null}
      {quickStartCollapsed ? null : (
        <>
      <div className="launch-chip-row" role="tablist" aria-label="Launch options">
        {launchChips.map((chip) => {
          const Icon = chip.icon;
          return (
            <button
              key={chip.key}
              type="button"
              className={activeQuickLaunch === chip.key ? 'launch-chip launch-chip-active' : 'launch-chip'}
              onClick={() => setActiveQuickLaunch(chip.key)}
              aria-pressed={activeQuickLaunch === chip.key}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              {chip.label}
            </button>
          );
        })}
      </div>
      {activeQuickLaunch === 'sale' ? (
        <>
      <label className="field-inline">
        Client
        <select className="select compact" value={customerId} onChange={(event) => setCustomerId(event.target.value)}>
          <option value="">Choose</option>
          {reference.data?.customers.map((customer) => (
            <option key={customer.id} value={customer.id}>
              {customer.name}
            </option>
          ))}
        </select>
      </label>
      <label className="field-inline grow">
        Request
        <input className="input" value={salesRequest} placeholder="source, item, tag, price hint" onChange={(event) => setSalesRequest(event.target.value)} onKeyDown={(event) => {
          if (event.key === 'Enter' && customerId) void startSale();
        }} />
      </label>
      <button className="primary-button" type="button" disabled={!customerId || isRunning} onClick={startSale}>
        <ShoppingCart className="h-4 w-4" aria-hidden="true" />
        New Sale
      </button>
        </>
      ) : null}
      {activeQuickLaunch === 'purchaseOrder' ? (
        <>
      <label className="field-inline">
        Vendor
        <select
          className="select compact"
          value={vendorId}
          onChange={(event) => {
            setVendorId(event.target.value);
            setBillId('');
          }}
        >
          <option value="">Default</option>
          {reference.data?.vendors.map((vendor) => (
            <option key={vendor.id} value={vendor.id}>
              {vendor.name}
            </option>
          ))}
        </select>
      </label>
      <label className="field-inline">
        Expected
        <input className="input compact" type="date" value={expectedDate} onChange={(event) => setExpectedDate(event.target.value)} />
      </label>
      <button className="secondary-button" type="button" disabled={!selectedVendorId || isRunning} onClick={startPurchaseOrder}>
        <ClipboardList className="h-4 w-4" aria-hidden="true" />
        New PO
      </button>
        </>
      ) : null}
      {activeQuickLaunch === 'receiving' ? (
        <>
      <label className="field-inline">
        Vendor
        <select
          className="select compact"
          value={vendorId}
          onChange={(event) => {
            setVendorId(event.target.value);
            setBillId('');
          }}
        >
          <option value="">Default</option>
          {reference.data?.vendors.map((vendor) => (
            <option key={vendor.id} value={vendor.id}>
              {vendor.name}
            </option>
          ))}
        </select>
      </label>
      <button className="secondary-button" type="button" disabled={!selectedVendorId || isRunning} onClick={startReceiveInventory}>
        <PackagePlus className="h-4 w-4" aria-hidden="true" />
        Receive Inventory
      </button>
        </>
      ) : null}
      {activeQuickLaunch === 'moneyIn' ? (
        <>
      <label className="field-inline">
        Client
        <select className="select compact" value={customerId} onChange={(event) => setCustomerId(event.target.value)}>
          <option value="">Choose</option>
          {reference.data?.customers.map((customer) => (
            <option key={customer.id} value={customer.id}>
              {customer.name}
            </option>
          ))}
        </select>
      </label>
      <label className="field-inline">
        Money in
        <input className="input compact money-input" value={incomingAmount} inputMode="decimal" onChange={(event) => setIncomingAmount(event.target.value)} />
      </label>
      <label className="field-inline">
        Method
        <select className="select compact method-select" value={method} onChange={(event) => setMethod(event.target.value as PaymentMethod)}>
          {methods.map((option) => (
            <option key={option}>{option}</option>
          ))}
        </select>
      </label>
      <label className="field-inline checkbox-inline">
        <input type="checkbox" checked={fifo} onChange={(event) => setFifo(event.target.checked)} />
        FIFO
      </label>
      <button className="secondary-button" type="button" disabled={!customerId || Number(incomingAmount) === 0 || isRunning} onClick={receiveMoney}>
        <BadgeDollarSign className="h-4 w-4" aria-hidden="true" />
        Receive Money
      </button>
        </>
      ) : null}
      {activeQuickLaunch === 'moneyOut' ? (
        <>
      <label className="field-inline">
        Vendor
        <select
          className="select compact"
          value={vendorId}
          onChange={(event) => {
            setVendorId(event.target.value);
            setBillId('');
          }}
        >
          <option value="">Default</option>
          {reference.data?.vendors.map((vendor) => (
            <option key={vendor.id} value={vendor.id}>
              {vendor.name}
            </option>
          ))}
        </select>
      </label>
      <label className="field-inline">
        Bill
        <select className="select compact bill-select" value={billId || selectedBill?.id || ''} onChange={(event) => setBillId(event.target.value)}>
          <option value="">Choose bill</option>
          {payables.map((bill) => (
            <option key={bill.id} value={bill.id}>
              {bill.billNo ? String(bill.billNo) : 'Vendor bill'} / ${money(Number(bill.amount ?? 0) - Number(bill.amountPaid ?? 0))}
            </option>
          ))}
        </select>
      </label>
      <label className="field-inline">
        Money out
        <input className="input compact money-input" value={outgoingAmount} inputMode="decimal" placeholder={billBalance ? money(billBalance) : '0'} onChange={(event) => setOutgoingAmount(event.target.value)} />
      </label>
      <button className="secondary-button" type="button" disabled={!selectedBill || billBalance <= 0 || isRunning} onClick={payVendor}>
        <Landmark className="h-4 w-4" aria-hidden="true" />
        Pay Vendor
      </button>
        </>
      ) : null}
        </>
      )}
    </section>
  );
}

function money(value: number) {
  return value.toLocaleString('en-US', { maximumFractionDigits: 2, minimumFractionDigits: 2 });
}
