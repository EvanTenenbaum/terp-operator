import type { SlideOverTab, SlideOverTabProps } from './registry';

function PoVendorTab({ entityId }: SlideOverTabProps): JSX.Element {
  return (
    <div className="p-4">
      <p className="text-sm text-zinc-600">Vendor info for PO {entityId.slice(0, 8)}…</p>
      <p className="text-xs text-zinc-400 mt-2">Vendor details, open bills, payment history, and prior POs for the vendor on this purchase order.</p>
    </div>
  );
}

export const poVendorTab: SlideOverTab = {
  key: 'vendor',
  label: 'Vendor',
  component: PoVendorTab,
};
