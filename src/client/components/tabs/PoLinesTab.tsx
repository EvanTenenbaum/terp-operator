import type { SlideOverTab, SlideOverTabProps } from './registry';

function PoLinesTab({ entityId }: SlideOverTabProps): JSX.Element {
  return (
    <div className="p-4">
      <p className="text-sm text-zinc-500">PO lines for {entityId.slice(0, 8)}</p>
      <p className="text-xs text-zinc-400 mt-2">Expand the lines panel below the main grid to view and edit PO lines.</p>
    </div>
  );
}

export const poLinesTab: SlideOverTab = {
  key: 'lines',
  label: 'Lines',
  component: PoLinesTab,
};
