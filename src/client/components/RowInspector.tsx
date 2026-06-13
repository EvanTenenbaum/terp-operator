import { AlertTriangle, History, Users } from 'lucide-react';
import type { GridRow, ViewKey } from '../../shared/types';
import { InspectorDrawer, type InspectorTab } from './templates';
import { RowCommandHistoryBody, historyRowLabel } from './RowCommandHistoryDrawer';
import { RelationshipSummaryBody, relationshipAvailable } from './RelationshipDrawer';
import { IssueActionsBody } from './IssueSidecar';
import { SelectionSupportPacket } from './SelectionSupportPacket';

/**
 * Unified row inspector — ONE right-edge drawer for everything about the
 * selected row, replacing the three mutually-exclusive drawers
 * (RowCommandHistoryDrawer / RelationshipDrawer / IssueSidecar) that
 * OperatorGrid previously mounted side by side.
 *
 * Powerful simplicity: the operator opens context once and moves between
 * History · Relationship · Issue as tabs. Same backdrop, same focus trap,
 * same Escape, same header. The SelectionSummary icons now deep-link to a
 * tab instead of launching different drawers.
 */
export type RowInspectorTab = 'history' | 'relationship' | 'issue';

export interface RowInspectorProps {
  row: GridRow | null;
  view: ViewKey;
  tab: RowInspectorTab | string;
  onTabChange: (tab: RowInspectorTab | string) => void;
  onClose: () => void;
  /** Issue tab posts audited commands — hidden for viewer role. */
  canWrite: boolean;
  /**
   * View-specific tabs appended after the core three (e.g. Payments adds a
   * Receipt tab). This is THE extension point for row context: new context
   * surfaces become inspector tabs instead of new drawers or stacked panels.
   */
  extraTabs?: InspectorTab[];
}

export function RowInspector({ row, view, tab, onTabChange, onClose, canWrite, extraTabs }: RowInspectorProps) {
  if (!row) return null;
  const hasRelationship = relationshipAvailable(row, view);

  const tabs = [
    {
      key: 'history',
      label: 'History',
      icon: <History className="h-3.5 w-3.5" aria-hidden="true" />,
      render: () => <RowCommandHistoryBody row={row} />
    },
    {
      key: 'relationship',
      label: 'Relationship',
      icon: <Users className="h-3.5 w-3.5" aria-hidden="true" />,
      available: hasRelationship,
      unavailableReason: 'No customer or vendor is linked to this row.',
      render: () => <RelationshipSummaryBody row={row} view={view} />
    },
    ...(canWrite
      ? [
          {
            key: 'issue',
            label: 'Issue',
            icon: <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />,
            // UX-M02: SelectionSupportPacket renders below the IssueActionsBody.
            // IssueSidecar.tsx is owned by another wave agent so the export
            // affordance is added here at the RowInspector mount layer instead.
            render: () => (
              <>
                <IssueActionsBody row={row} view={view} onDone={onClose} />
                <SelectionSupportPacket rows={[row]} view={view} />
              </>
            )
          }
        ]
      : []),
    ...(extraTabs ?? [])
  ];

  return (
    <InspectorDrawer
      open
      title="Row Inspector"
      subtitle={historyRowLabel(row)}
      ariaLabel="Row inspector"
      tabs={tabs}
      activeTab={tab}
      onTabChange={onTabChange}
      onClose={onClose}
    />
  );
}
