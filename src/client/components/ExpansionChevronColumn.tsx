import { ChevronRight, ChevronDown } from 'lucide-react';
import type { ICellRendererParams } from 'ag-grid-community';
import type { GridRow } from '../../shared/types';

interface ExpansionChevronParams extends ICellRendererParams<GridRow> {
  isExpanded: boolean;
  onToggle: () => void;
}

export function ExpansionChevronCell(params: ExpansionChevronParams) {
  const { isExpanded, onToggle } = params;

  return (
    <div
      className={`expansion-chevron-cell ${isExpanded ? 'expanded' : ''}`}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      role="button"
      aria-label={isExpanded ? 'Collapse row details' : 'Expand row details'}
      aria-expanded={isExpanded}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onToggle();
        }
      }}
    >
      {isExpanded ? <ChevronDown /> : <ChevronRight />}
    </div>
  );
}
