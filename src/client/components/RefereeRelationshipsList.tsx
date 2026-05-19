import { useState } from 'react';
import { Pencil, PowerOff } from 'lucide-react';
import { trpc } from '../api/trpc';
import { UpdateRefereeRelationshipDialog } from './UpdateRefereeRelationshipDialog';
import { DeactivateRefereeRelationshipDialog } from './DeactivateRefereeRelationshipDialog';

interface RefereeRelationshipsListProps {
  refereeId: string;
}

// Shape returned by `reference.refereeRelationships` (queries.ts:50-65).
// NOTE: the reference query returns ONLY active relationships (WHERE rr.active)
// and does NOT include `notes`. Deactivated relationships disappear here.
interface RelationshipRow {
  id: string;
  refereeId: string;
  refereeName: string;
  entityType: string;
  entityId: string;
  entityName: string;
  feeType: 'percentage' | 'fixed' | 'hybrid';
  feePercentage: number | null;
  feeFixedAmount: number | null;
  applyByDefault: boolean;
  active: boolean;
}

export function RefereeRelationshipsList({ refereeId }: RefereeRelationshipsListProps) {
  const reference = trpc.queries.reference.useQuery();
  const [editing, setEditing] = useState<RelationshipRow | null>(null);
  const [deactivating, setDeactivating] = useState<RelationshipRow | null>(null);

  const allRelationships = (reference.data?.refereeRelationships ?? []) as RelationshipRow[];
  const rows = allRelationships.filter((r) => r.refereeId === refereeId);

  if (reference.isLoading) {
    return <div className="p-4 text-sm text-zinc-500">Loading relationships...</div>;
  }
  if (rows.length === 0) {
    return <div className="p-4 text-sm text-zinc-500">No relationships yet.</div>;
  }

  return (
    <div className="overflow-auto">
      <table className="w-full text-sm">
        <thead className="bg-zinc-50 text-left text-xs font-medium uppercase text-zinc-500">
          <tr>
            <th className="px-3 py-2">Entity</th>
            <th className="px-3 py-2">Fee</th>
            <th className="px-3 py-2">Default</th>
            <th className="px-3 py-2">Active</th>
            <th className="px-3 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className={`border-t border-zinc-100 ${!r.active ? 'opacity-50' : ''}`}>
              <td className="px-3 py-2">
                <div className="font-medium">{r.entityName}</div>
                <div className="text-xs text-zinc-500">{r.entityType}</div>
              </td>
              <td className="px-3 py-2">
                {r.feeType === 'percentage' && `${r.feePercentage}%`}
                {r.feeType === 'fixed' && `$${Number(r.feeFixedAmount).toFixed(2)}`}
                {r.feeType === 'hybrid' && `${r.feePercentage}% + $${Number(r.feeFixedAmount).toFixed(2)}`}
              </td>
              <td className="px-3 py-2">{r.applyByDefault ? 'Yes' : 'No'}</td>
              <td className="px-3 py-2">{r.active ? 'Active' : 'Inactive'}</td>
              <td className="px-3 py-2 text-right">
                {r.active && (
                  <div className="inline-flex gap-1">
                    <button onClick={() => setEditing(r)} className="secondary-button compact-action" title="Edit relationship">
                      <Pencil className="h-3.5 w-3.5" />
                      Edit
                    </button>
                    <button onClick={() => setDeactivating(r)} className="secondary-button compact-action" title="Deactivate relationship">
                      <PowerOff className="h-3.5 w-3.5" />
                      Deactivate
                    </button>
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {editing && (
        <UpdateRefereeRelationshipDialog
          relationshipId={editing.id}
          initialFeeType={editing.feeType}
          initialFeePercentage={editing.feePercentage}
          initialFeeFixedAmount={editing.feeFixedAmount}
          initialApplyByDefault={editing.applyByDefault}
          initialNotes={null}
          onClose={() => setEditing(null)}
        />
      )}
      {deactivating && (
        <DeactivateRefereeRelationshipDialog
          relationshipId={deactivating.id}
          entityName={deactivating.entityName}
          onClose={() => setDeactivating(null)}
        />
      )}
    </div>
  );
}
