import { trpc } from '../../api/trpc';
import { WorkspacePanel } from '../WorkspacePanel';
import type { ContactProfileData } from './types';

interface Props { data: ContactProfileData; }

export function ContactMoneyPanel({ data }: Props) {
  const contact = data.contact as Record<string, unknown>;
  const customer = data.customer as Record<string, unknown> | null;
  const vendor = data.vendor as Record<string, unknown> | null;
  const contactId = contact.id as string;

  const isContractorOrEmployee = Boolean(contact.is_contractor || contact.is_employee);

  const { data: ledger } = trpc.queries.contactLedger.useQuery(
    { contactId },
    { enabled: isContractorOrEmployee }
  );

  const receivable = Number(customer?.balance ?? 0);
  const payable    = Number(vendor?.open_bills_amount ?? 0);
  const net        = receivable - payable;
  const isDualRole = Boolean(contact.is_customer) && Boolean(contact.is_vendor);

  return (
    <div className="space-y-4">
      {isDualRole && (
        <div className="subtle-band flex items-center gap-6 px-4 py-2 text-sm">
          <span>Receivable (owed to you): <strong>${receivable.toFixed(2)}</strong></span>
          <span>Payable (owed to them): <strong>${payable.toFixed(2)}</strong></span>
          <span className={`selection-pill ${net < 0 ? 'warning' : ''}`}>
            Net: ${net.toFixed(2)} {net >= 0 ? '(favorable)' : '(unfavorable)'}
          </span>
        </div>
      )}

      {Boolean(contact.is_customer) && customer && (
        <WorkspacePanel panelId="contact-money-receivables" title="Receivables (Customer)">
          <div className="p-3 text-sm space-y-1">
            <div>
              Open invoices: <strong>{String(customer.open_invoices_count ?? 0)}</strong>{' '}
              totaling <strong>${Number(customer.open_invoices_amount ?? 0).toFixed(2)}</strong>
            </div>
            <div>Balance: <strong>${Number(customer.balance ?? 0).toFixed(2)}</strong></div>
          </div>
        </WorkspacePanel>
      )}

      {Boolean(contact.is_vendor) && vendor && (
        <WorkspacePanel panelId="contact-money-payables" title="Payables (Vendor)">
          <div className="p-3 text-sm space-y-1">
            <div>
              Open bills: <strong>{String(vendor.open_bills_count ?? 0)}</strong>{' '}
              totaling <strong>${Number(vendor.open_bills_amount ?? 0).toFixed(2)}</strong>
            </div>
          </div>
        </WorkspacePanel>
      )}

      {isContractorOrEmployee && (
        <WorkspacePanel panelId="contact-money-direct" title="Payment Ledger">
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line">
                  <th className="text-left px-3 py-2 text-xs font-medium text-zinc-500">Date</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-zinc-500">Kind</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-zinc-500">Amount</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-zinc-500">Running Balance</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-zinc-500">Reference</th>
                </tr>
              </thead>
              <tbody>
                {(ledger?.rows ?? []).length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-4 text-sm text-zinc-400 text-center">
                      No payments recorded.
                    </td>
                  </tr>
                )}
                {(ledger?.rows ?? [] as Record<string, unknown>[]).map((row: Record<string, unknown>) => (
                  <tr key={String(row.id)} className="border-t border-line">
                    <td className="px-3 py-2 text-xs text-zinc-500">
                      {new Date(String(row.created_at)).toLocaleDateString()}
                    </td>
                    <td className="px-3 py-2">{String(row.kind)}</td>
                    <td className="px-3 py-2">${Math.abs(Number(row.amount)).toFixed(2)}</td>
                    <td className="px-3 py-2">${Number(row.running_balance).toFixed(2)}</td>
                    <td className="px-3 py-2 text-zinc-500">{String(row.reference ?? '—')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </WorkspacePanel>
      )}
    </div>
  );
}
