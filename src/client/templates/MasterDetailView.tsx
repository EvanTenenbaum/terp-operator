/**
 * MasterDetailView — split-panel master/detail layout template.
 *
 * Provides a split-panel layout with a master grid area (top/left) and an
 * optional detail panel (bottom/right). Designed for views like Intake that
 * need persistent detail content alongside the master data grid.
 *
 * Supports AG Grid's built-in masterDetail expandable rows — the master
 * grid area passes children through, which can use AG Grid's masterDetail
 * directly (as IntakeView does) or any other grid configuration.
 *
 * For IntakeView specifically, set useLegacyIntake={true} to signal that
 * the existing domain components (batch verification, TSV paste, verify-all,
 * batch posting) are preserved within the master area.
 *
 * This template is additive — it does not replace IntakeView.tsx or any
 * existing component. It provides a reusable split-panel layout pattern
 * for master/detail views.
 */

import type { ReactNode } from 'react';
import type { ViewKey } from '../../shared/types';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MasterDetailViewProps {
  /** View key from the view registry. Used for data attributes. */
  viewKey: ViewKey;
  /** Primary entity type driving columns and state. */
  entityType: string;
  /** Content for the detail panel when visible. Rendered below or beside the
   *  master grid area depending on splitDirection. */
  detailContent?: ReactNode;
  /** When true, signals that the existing IntakeView domain components
   *  (batch verification, TSV paste, verify-all flow, batch posting) are
   *  preserved within the master area. Used as metadata — does not alter
   *  template rendering behavior. */
  useLegacyIntake?: boolean;
  /** Split direction.
   *  'vertical'   — master on top, detail on bottom (default, Intake orientation).
   *  'horizontal' — master on left, detail on right. */
  splitDirection?: 'vertical' | 'horizontal';
  /** Whether the detail panel is visible. When false, the master grid area
   *  fills the entire available space. */
  detailOpen?: boolean;
  /** Children render in the master grid area (top/left). This is where the
   *  AG Grid, OperatorGrid, or any master content lives. */
  children?: ReactNode;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function MasterDetailView({
  viewKey,
  entityType,
  detailContent,
  useLegacyIntake = false,
  splitDirection = 'vertical',
  detailOpen = false,
  children,
}: MasterDetailViewProps): ReactNode {
  const isVertical = splitDirection === 'vertical';

  return (
    <div
      className={`master-detail-view flex min-h-0 flex-1 ${isVertical ? 'flex-col' : 'flex-row'}`}
      data-view-key={viewKey}
      data-entity-type={entityType}
      data-legacy-intake={useLegacyIntake ? 'true' : undefined}
      data-detail-open={detailOpen ? 'true' : undefined}
    >
      {/* Master area — fills available space when detail is closed, shares
          when detail is open. Respects both min-h-0 and min-w-0 so flex
          children inside AG Grid root wrappers don't overflow. */}
      <div className="master-area flex-1 min-h-0 min-w-0">
        {children}
      </div>

      {/* Detail panel — rendered below (vertical) or to the right (horizontal)
          when detailOpen is true and detailContent is provided. */}
      {detailOpen && detailContent ? (
        <div
          className={`detail-panel overflow-auto bg-white ${
            isVertical
              ? 'h-2/5 border-t border-line'
              : 'w-2/5 border-l border-line'
          }`}
        >
          {detailContent}
        </div>
      ) : null}
    </div>
  );
}
