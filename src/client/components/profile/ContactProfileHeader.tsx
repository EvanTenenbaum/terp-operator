import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCommandRunner } from '../useCommandRunner';
import { trpc } from '../../api/trpc';
import type { ContactProfileData } from './types';
import { formatMoney } from '../../utils/format';
import { UpdateContactDialog, ArchiveContactDialog } from './ContactEditDialogs';

interface Props { data: ContactProfileData; }

export function ContactProfileHeader({ data }: Props) {
  const navigate = useNavigate();
  const me = trpc.auth.me.useQuery();
  const { isRunning } = useCommandRunner();
  const [showEdit, setShowEdit] = useState(false);
  const [showArchive, setShowArchive] = useState(false);
  if (!data) return null;

  const { contact, customer, vendor } = data;
  const canWrite = me.data?.role !== 'viewer';
  const _isMultiRole = contact.is_customer && contact.is_vendor;

  const roleLabels: Record<string, string> = {
    is_customer: 'Customer', is_vendor: 'Vendor', is_referee: 'Referee',
    is_processor: 'Processor', is_contractor: 'Contractor', is_employee: 'Employee',
  };

  const signals: Array<{ label: string; tone: 'danger' | 'warning' | 'info' }> = [];
  if (customer && Number(customer.balance ?? 0) > Number(customer.credit_limit ?? 0)) {
    signals.push({ label: 'Over credit limit', tone: 'danger' });
  }
  if (customer && Number(customer.oldest_open_invoice_days ?? 0) > 30) {
    signals.push({ label: 'Balance 30+ days overdue', tone: 'warning' });
  }
  if (data.upcomingAppointmentCount > 0) {
    signals.push({ label: `${data.upcomingAppointmentCount} upcoming appointment${data.upcomingAppointmentCount > 1 ? 's' : ''}`, tone: 'info' });
  }

  return (
    <div className="inline-panel space-y-3">
      <div className="flex flex-wrap items-baseline gap-3">
        <h1 className="page-title">{String(contact.name ?? '')}</h1>
        {Boolean(contact.display_name) && contact.display_name !== contact.name && (
          <span className="text-sm text-zinc-500">({String(contact.display_name)})</span>
        )}
        <div className="flex flex-wrap gap-1">
          {Object.entries(roleLabels).map(([flag, label]) =>
            Boolean(contact[flag]) ? (
              <span key={flag} className="selection-pill text-xs">{label}</span>
            ) : null
          )}
        </div>
      </div>

      {Boolean(contact.company_name) && <p className="page-subtitle">{String(contact.company_name)}</p>}

      <div className="flex flex-wrap gap-3">
        {Boolean(contact.is_customer) && Boolean(customer) && (
          <>
            <div className="kpi-card">
              <span className="kpi-label">Balance</span>
              <span className="kpi-value">{formatMoney(Number(customer?.balance ?? 0))}</span>
            </div>
            <div className="kpi-card">
              <span className="kpi-label">Open Orders</span>
              <span className="kpi-value">{String(customer?.open_invoices_count ?? 0)}</span>
            </div>
          </>
        )}
        {Boolean(contact.is_vendor) && Boolean(vendor) && (
          <div className="kpi-card">
            <span className="kpi-label">Open Bills</span>
            <span className="kpi-value">{formatMoney(Number(vendor?.open_bills_amount ?? 0))}</span>
          </div>
        )}
      </div>

      {signals.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {signals.map((s) => (
            <span key={s.label} className={`selection-pill ${s.tone === 'danger' ? 'danger' : s.tone === 'warning' ? 'warning' : ''}`}>
              {s.label}
            </span>
          ))}
        </div>
      )}

      {canWrite && (
        <div className="flex flex-wrap gap-2">
          {Boolean(contact.is_customer) && Boolean(customer) && (
            <button className="primary-button compact-action" disabled={isRunning}
              onClick={() => navigate('/sales')}>
              New Order
            </button>
          )}
          {Boolean(contact.is_vendor) && (
            <button className={`${Boolean(contact.is_customer) ? 'secondary-button' : 'primary-button'} compact-action`}
              onClick={() => navigate('/purchaseOrders')}>
              New PO
            </button>
          )}
          <button className="secondary-button compact-action">Add Appointment</button>
          <button
            className="secondary-button compact-action"
            aria-label="Edit contact"
            onClick={() => setShowEdit(true)}
            disabled={isRunning}
          >
            Edit
          </button>
          <button
            className="secondary-button compact-action text-red-600 hover:border-red-300"
            aria-label="Archive contact"
            onClick={() => setShowArchive(true)}
            disabled={isRunning}
            title="Archive this contact (irreversible while open work exists)"
          >
            Archive
          </button>
        </div>
      )}
      {showEdit && (
        <UpdateContactDialog data={data} onClose={() => setShowEdit(false)} />
      )}
      {showArchive && (
        <ArchiveContactDialog
          contactId={String(contact.id ?? '')}
          contactName={String(contact.name ?? '')}
          onClose={() => setShowArchive(false)}
        />
      )}
    </div>
  );
}
