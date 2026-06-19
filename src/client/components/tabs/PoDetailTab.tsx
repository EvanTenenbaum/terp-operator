import type { SlideOverTab, SlideOverTabProps } from './registry';

function PoDetailTab({ entityId }: SlideOverTabProps): JSX.Element {
  return (
    <div className="p-4">
      <p className="text-sm text-zinc-600">Purchase Order details for the selected PO.</p>
      <p className="text-xs text-zinc-400 mt-2">ID: {entityId.slice(0, 8)}…</p>
      <p className="text-xs text-zinc-400 mt-2">Full PO detail (lines, vendor context, history) is displayed below the main grid when a PO is selected.</p>
    </div>
  );
}

export const poDetailTab: SlideOverTab = {
  key: 'detail',
  label: 'Detail',
  component: PoDetailTab,
  defaultFor: ['purchaseOrder'],
};
