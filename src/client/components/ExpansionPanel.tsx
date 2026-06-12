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

// UX-S05: ExpansionPanel collapsible headers are now native <button> elements
// instead of div+role=button. Native buttons receive focus automatically in the
// tab order, receive Enter/Space activation from the browser without a custom
// onKeyDown handler, and carry implicit button semantics for screen readers.
// The K12 leftover (div+role=button + custom keyDown) is eliminated here.
// Styling classes (expansion-section-header) are preserved unchanged so the
// visual appearance is unaffected.
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
          <button
            type="button"
            className="expansion-section-header"
            aria-expanded={historyExpanded}
            onClick={() => setHistoryExpanded((prev) => !prev)}
          >
            {historyExpanded ? <ChevronDown size={14} aria-hidden="true" /> : <ChevronRight size={14} aria-hidden="true" />}
            <span>History</span>
          </button>
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
          <button
            type="button"
            className="expansion-section-header"
            aria-expanded={childrenExpanded}
            onClick={() => setChildrenExpanded((prev) => !prev)}
          >
            {childrenExpanded ? <ChevronDown size={14} aria-hidden="true" /> : <ChevronRight size={14} aria-hidden="true" />}
            <span>Child Items</span>
          </button>
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
