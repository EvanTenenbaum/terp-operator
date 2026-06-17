import type { SlideOverTab, SlideOverTabProps } from './registry';

function PoLinkedIntakeTab({ entityId }: SlideOverTabProps): JSX.Element {
  return (
    <div className="p-4">
      <p className="text-sm text-zinc-600">Linked Intake for PO {entityId.slice(0, 8)}…</p>
      <p className="text-xs text-zinc-400 mt-2">View intake batches associated with this purchase order.</p>
    </div>
  );
}

export const poLinkedIntakeTab: SlideOverTab = {
  key: 'intake',
  label: 'Intake',
  component: PoLinkedIntakeTab,
};
