import { WorkspacePanel } from '../WorkspacePanel';
import type { ContactProfileData } from './types';
import { formatMoney } from '../../utils/format';

interface Props { data: ContactProfileData; }

export function ContactVendorPanel({ data }: Props) {
  const vendor = data.vendor as Record<string, unknown> | null;
  const vendorId = vendor?.id as string | undefined;

  if (!vendorId || !vendor) {
    return <p className="text-sm text-zinc-500 p-4">No vendor record linked.</p>;
  }

  return (
    <div className="space-y-4">
      <WorkspacePanel panelId="contact-vendor-account" title="Vendor Account">
        <div className="context-drawer-card p-3 space-y-1 text-sm">
          <label className="field-inline">
            <span className="text-zinc-500">Terms</span>
            <span>Net-{String(vendor.terms_days ?? 14)}</span>
          </label>
          <label className="field-inline">
            <span className="text-zinc-500">Consignment</span>
            <span>{vendor.consignment_default ? 'Yes' : 'No'}</span>
          </label>
          <label className="field-inline">
            <span className="text-zinc-500">Contact person</span>
            <span>{String(vendor.contact ?? '—')}</span>
          </label>
          <label className="field-inline">
            <span className="text-zinc-500">Open bills</span>
            <span>
              {String(vendor.open_bills_count ?? 0)} totaling {formatMoney(Number(vendor.open_bills_amount ?? 0))}
            </span>
          </label>
          <label className="field-inline">
            <span className="text-zinc-500">Open POs</span>
            <span>{String(vendor.open_po_count ?? 0)}</span>
          </label>
          <label className="field-inline">
            <span className="text-zinc-500">Total billed</span>
            <span>{formatMoney(Number(vendor.total_billed ?? 0))}</span>
          </label>
          <label className="field-inline">
            <span className="text-zinc-500">Total paid</span>
            <span>{formatMoney(Number(vendor.total_paid ?? 0))}</span>
          </label>
        </div>
      </WorkspacePanel>
    </div>
  );
}
