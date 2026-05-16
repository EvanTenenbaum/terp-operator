import { useState, type ReactNode } from 'react';
import { ChevronRight, ChevronDown } from 'lucide-react';
import type { GridRow, ViewKey } from '../../shared/types';

interface ExpansionPanelProps {
  row: GridRow;
  view: ViewKey;
  actionsRenderer?: (row: GridRow) => ReactNode;
  historyRenderer?: (row: GridRow) => ReactNode;
  childrenRenderer?: (row: GridRow) => ReactNode;
}

export function ExpansionPanel({ row, view, actionsRenderer, historyRenderer, childrenRenderer }: ExpansionPanelProps) {
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [childrenExpanded, setChildrenExpanded] = useState(false);

  return (
    <div className="expansion-panel">
      {/* Actions Section - Always Visible */}
      {actionsRenderer ? (
        <div>
          <div className="expansion-panel-header">Actions</div>
          <div className="expansion-actions">
            {actionsRenderer(row)}
          </div>
        </div>
      ) : null}

      {/* History Section - Collapsible */}
      {historyRenderer ? (
        <div className="expansion-section">
          <div
            className="expansion-section-header"
            onClick={() => setHistoryExpanded(!historyExpanded)}
            role="button"
            aria-expanded={historyExpanded}
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setHistoryExpanded(!historyExpanded);
              }
            }}
          >
            {historyExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            <span>History</span>
          </div>
          {historyExpanded ? (
            <div className="expansion-section-content">
              {historyRenderer(row)}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Children Section - Collapsible */}
      {childrenRenderer ? (
        <div className="expansion-section">
          <div
            className="expansion-section-header"
            onClick={() => setChildrenExpanded(!childrenExpanded)}
            role="button"
            aria-expanded={childrenExpanded}
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setChildrenExpanded(!childrenExpanded);
              }
            }}
          >
            {childrenExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            <span>Child Items</span>
          </div>
          {childrenExpanded ? (
            <div className="expansion-section-content">
              {childrenRenderer(row)}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
