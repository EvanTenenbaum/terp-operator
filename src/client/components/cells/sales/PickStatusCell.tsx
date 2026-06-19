/**
 * PickStatusCell — replaces lineColumns[pickStatus].cellRenderer (SalesView.tsx:330-332).
 *
 * Thin wrapper rendering the PickStatusChip component for a given pick status value.
 */

interface PickStatusChipProps {
  status: string | undefined;
}

function PickStatusChip({ status }: PickStatusChipProps) {
  const label = status ?? 'unreleased';
  const colorClass =
    label === 'released' ? 'bg-blue-100 text-blue-800' :
    label === 'picking' ? 'bg-amber-100 text-amber-800' :
    label === 'picked' ? 'bg-green-100 text-green-800' :
    label === 'recall_pending' ? 'bg-red-100 text-red-800' :
    'bg-zinc-100 text-zinc-600'; // unreleased / default
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ${colorClass}`}>
      {label.replace('_', ' ')}
    </span>
  );
}

export interface PickStatusCellProps {
  value: unknown;
}

export function PickStatusCell(params: PickStatusCellProps): JSX.Element {
  return <PickStatusChip status={params.value ? String(params.value) : 'unreleased'} />;
}
