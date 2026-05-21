/**
 * Inline sale-line exception controls (#64 reviewer fix).
 *
 * Replaces the older `window.prompt`-chain UI for setLineLandedCost /
 * setLineBelowFloorReason / resolveVendorApproval with a small inline form
 * inside the sales-line expansion row:
 *   - numeric landed COGS input + basis select + optional override reason
 *   - below-floor reason select + optional note
 *   - vendor approval Approve / Decline buttons
 *
 * Cost-revealing controls are hidden when the operator has toggled showMargin
 * off (customer-facing screen-share posture). The landed-COGS and below-floor
 * sections collapse in that mode so cost context cannot leak, but a
 * non-cost-revealing vendor approval pending action row remains visible.
 *
 * Uses shared BELOW_FLOOR_REASONS / LANDED_COST_BASIS_VALUES so the prompt
 * vocabulary stays in lockstep with server validation.
 */
import { useEffect, useState } from 'react';
import {
  BELOW_FLOOR_REASONS,
  LANDED_COST_BASIS_VALUES,
  type BelowFloorReason,
  type LandedCostBasis
} from '../../shared/saleLineCostExceptions';
import { parsePriceRange } from '../../shared/priceRange';
import type { CommandName } from '../../shared/commandCatalog';
import type { CommandResult } from '../../shared/types';
import type { GridRow } from '../../shared/types';

interface SaleLineExceptionControlsProps {
  row: GridRow;
  isRunning: boolean;
  canWrite: boolean;
  showMargin: boolean;
  runCommand: (
    name: CommandName,
    payload?: Record<string, unknown>,
    reason?: string
  ) => Promise<CommandResult>;
}

function defaultLandedCostFromRow(row: GridRow): string {
  // Prefer midpoint of explicit numeric cost range if present.
  const low = Number((row as Record<string, unknown>).costRangeLow ?? NaN);
  const high = Number((row as Record<string, unknown>).costRangeHigh ?? NaN);
  if (Number.isFinite(low) && Number.isFinite(high)) {
    return (Math.round(((low + high) / 2) * 100) / 100).toFixed(2);
  }
  // Fall back to parsing a string priceRange like "60-72".
  const priceRange = (row as Record<string, unknown>).priceRange as string | null | undefined;
  if (priceRange) {
    const parsed = parsePriceRange(priceRange);
    if (parsed) {
      return (Math.round(((parsed.low + parsed.high) / 2) * 100) / 100).toFixed(2);
    }
  }
  const current = Number(row.unitCost ?? NaN);
  return Number.isFinite(current) ? current.toFixed(2) : '';
}

export function SaleLineExceptionControls({
  row,
  isRunning,
  canWrite,
  showMargin,
  runCommand
}: SaleLineExceptionControlsProps) {
  const [landedCost, setLandedCost] = useState<string>(() => defaultLandedCostFromRow(row));
  const [landedCostEdited, setLandedCostEdited] = useState(false);
  const [basis, setBasis] = useState<LandedCostBasis>('manual');
  const [overrideReason, setOverrideReason] = useState('');
  const [floorReason, setFloorReason] = useState<BelowFloorReason | ''>('');
  const [floorNote, setFloorNote] = useState('');

  // Update the default landed cost when the row's range or unit cost changes,
  // but only until the operator has manually edited the field.
  useEffect(() => {
    if (!landedCostEdited) {
      setLandedCost(defaultLandedCostFromRow(row));
    }
  }, [
    row.id,
    (row as Record<string, unknown>).costRangeLow,
    (row as Record<string, unknown>).costRangeHigh,
    (row as Record<string, unknown>).priceRange,
    row.unitCost,
    landedCostEdited
  ]);

  const lineId = String(row.id ?? '');
  const cogsUnresolved = row.unitCostResolved === false;
  const priceFloor = row.priceFloor != null ? Number(row.priceFloor) : null;
  const unitPrice = Number(row.unitPrice ?? 0);
  const belowFloor = priceFloor != null && Number.isFinite(priceFloor) && unitPrice < priceFloor;
  const vendorApprovalPending = row.vendorApprovalState === 'pending';

  // Issue #63 reviewer fix: when margin is hidden the operator is sharing
  // screen with the customer or showing a clean view. Cost-revealing controls
  // (landed COGS inputs, below-floor reason copy) are gated by showMargin,
  // but a non-cost-revealing vendor approval pending action row remains
  // visible and actionable even when showMargin is false.
  const showCostControls = showMargin;
  const showFloorControls = showMargin;

  if (!showCostControls && !showFloorControls && !vendorApprovalPending) return null;

  const disabled = isRunning || !canWrite || !lineId;

  async function submitLandedCost() {
    if (disabled) return;
    const value = Number(landedCost);
    if (!Number.isFinite(value)) return;
    const reason = basis === 'override' ? overrideReason.trim() : '';
    if (basis === 'override' && !reason) return;
    await runCommand(
      'setLineLandedCost',
      { lineId, landedCost: value, basis, reason },
      'Set landed COGS for sale line'
    );
  }

  async function submitBelowFloorReason() {
    if (disabled || !floorReason) return;
    await runCommand(
      'setLineBelowFloorReason',
      { lineId, reason: floorReason, note: floorNote.trim() },
      'Record below-floor reason'
    );
  }

  async function submitVendorApproval(state: 'approved' | 'declined') {
    if (disabled) return;
    await runCommand(
      'resolveVendorApproval',
      { lineId, state },
      'Resolve vendor approval on sale line'
    );
  }

  return (
    <div className="sale-line-exception-controls" data-testid={`sale-line-exception-controls-${lineId}`}>
      {cogsUnresolved && showCostControls ? (
        <div className="sale-line-exception-group">
          <label className="field-inline">
            Landed COGS
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              className="input compact"
              value={landedCost}
              onChange={(event) => {
                setLandedCostEdited(true);
                setLandedCost(event.target.value);
              }}
              aria-label={`Landed COGS for ${row.itemName ?? 'line'}`}
            />
          </label>
          <label className="field-inline">
            Basis
            <select
              className="select compact"
              value={basis}
              onChange={(event) => setBasis(event.target.value as LandedCostBasis)}
              aria-label="Landed cost basis"
            >
              {LANDED_COST_BASIS_VALUES.filter((value) => value !== 'fixed').map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          {basis === 'override' ? (
            <label className="field-inline grow">
              Override reason
              <input
                type="text"
                className="input"
                value={overrideReason}
                onChange={(event) => setOverrideReason(event.target.value)}
                placeholder="Required for out-of-range cost"
                aria-label="Override reason"
              />
            </label>
          ) : null}
          <button
            type="button"
            className="primary-button compact-action"
            disabled={disabled || !landedCost.trim() || (basis === 'override' && !overrideReason.trim())}
            onClick={() => {
              void submitLandedCost();
            }}
          >
            Pick COGS
          </button>
        </div>
      ) : null}
      {belowFloor && !row.belowFloorReason && showFloorControls ? (
        <div className="sale-line-exception-group">
          <label className="field-inline">
            Below-floor reason
            <select
              className="select compact"
              value={floorReason}
              onChange={(event) => setFloorReason(event.target.value as BelowFloorReason | '')}
              aria-label="Below-floor reason"
            >
              <option value="">Choose reason</option>
              {BELOW_FLOOR_REASONS.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label className="field-inline grow">
            Note
            <input
              type="text"
              className="input"
              value={floorNote}
              onChange={(event) => setFloorNote(event.target.value)}
              placeholder="Optional context"
              aria-label="Below-floor note"
            />
          </label>
          <button
            type="button"
            className="secondary-button compact-action"
            disabled={disabled || !floorReason}
            onClick={() => {
              void submitBelowFloorReason();
            }}
          >
            Set below-floor reason
          </button>
        </div>
      ) : null}
      {vendorApprovalPending ? (
        <div className="sale-line-exception-group">
          <span className="text-xs font-medium text-zinc-600">Vendor approval:</span>
          <button
            type="button"
            className="primary-button compact-action"
            disabled={disabled}
            onClick={() => {
              void submitVendorApproval('approved');
            }}
          >
            Approve
          </button>
          <button
            type="button"
            className="secondary-button compact-action"
            disabled={disabled}
            onClick={() => {
              void submitVendorApproval('declined');
            }}
          >
            Decline
          </button>
        </div>
      ) : null}
    </div>
  );
}
