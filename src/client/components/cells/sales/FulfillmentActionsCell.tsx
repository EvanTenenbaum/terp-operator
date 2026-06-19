/**
 * FulfillmentActionsCell — replaces fulfillmentActionsColumn useMemo
 * (SalesView.tsx:545-605).
 *
 * Accepts runtime dependencies via cellRendererParams instead of capturing
 * them in a closure. AG Grid threads cellRendererParams through at render time.
 *
 * Reads eligibilityDataRef.current per render to avoid stale data from
 * destructuring at param time (TER-1671 stable-identity pattern).
 */
import type { GridRow } from '../../../../shared/types';

// CAP-030 / TER-1508 — types matching live releaseEligibility API shape (backend now merged)
export interface ReleaseEligibilityResult {
  lineId: string;
  eligible: boolean;
  alreadyReleased: boolean;
  reasons: string[];
  pickStatus?: 'unreleased' | 'released' | 'picking' | 'picked' | 'recall_pending';
  releasedAt?: string;
}

export interface FulfillmentActionsCellParams {
  canWrite: boolean;
  isRunning: boolean;
  runCommand: (cmd: string, payload: Record<string, unknown>, label: string) => Promise<unknown>;
  eligibilityDataRef: React.MutableRefObject<ReleaseEligibilityResult[] | undefined>;
}

export interface FulfillmentActionsCellProps extends FulfillmentActionsCellParams {
  data?: GridRow;
}

export function FulfillmentActionsCell(params: FulfillmentActionsCellProps): JSX.Element | null {
  const { data: row, canWrite, isRunning, runCommand, eligibilityDataRef } = params;
  if (!row) return null;
  const ps = String(row.pickStatus ?? '');
  const isQueued = ps === 'released' || ps === 'picking' || ps === 'recall_pending';
  const isPacked = ps === 'picked' || row.packed === true;
  const eligibility = eligibilityDataRef.current?.find((e) => e.lineId === row.id);
  const alreadyReleased = eligibility?.alreadyReleased ?? (isQueued || isPacked);
  const canRelease = !alreadyReleased && eligibility?.eligible === true;
  const inactiveRelease = !alreadyReleased && eligibility != null && !eligibility.eligible;
  const releaseTitle = inactiveRelease
    ? (eligibility?.reasons ?? []).join(' ')
    : '';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      {isQueued ? (
        <span className="selection-pill info" style={{ fontSize: 11 }}>Queued</span>
      ) : isPacked ? (
        <span className="selection-pill success" style={{ fontSize: 11 }}>Packed</span>
      ) : null}
      {canRelease && canWrite ? (
        <button
          className="primary-button compact-action"
          style={{ fontSize: 11, padding: '2px 8px' }}
          disabled={isRunning}
          onClick={() => void runCommand('releaseLineForPicking', { lineId: row.id }, 'Release line for picking')}
        >
          Release
        </button>
      ) : null}
      {inactiveRelease && canWrite ? (
        <button
          className="primary-button compact-action"
          style={{ fontSize: 11, padding: '2px 8px', opacity: 0.5 }}
          disabled
          title={releaseTitle}
        >
          Release
        </button>
      ) : null}
      {(isQueued || isPacked) && canWrite ? (
        <button
          className="secondary-button compact-action"
          style={{ fontSize: 11, padding: '2px 8px' }}
          disabled={isRunning}
          onClick={() => void runCommand('recallLineFromPicking', { lineId: row.id }, 'Recall line from picking')}
        >
          Recall
        </button>
      ) : null}
    </div>
  );
}
