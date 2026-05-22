import { useState } from 'react';
import { trpc } from '../api/trpc';
import { useCommandRunner } from './useCommandRunner';
import { parsePriceRange } from '../../shared/priceRange';
import { applyPricingRule, resolvePricingRuleEntry } from '../../shared/inventoryPricingShared';
import type { CustomerPricingRule, PricingRuleApplication } from '../../shared/types';
import { BELOW_FLOOR_REASONS, type BelowFloorReason } from '../../shared/saleLineCostExceptions';
import {
  LandedCostExceptionChip,
  LANDED_COST_EXCEPTION_REASON_LABELS as EXCEPTION_REASON_LABELS
} from './LandedCostExceptionChip';
import { PricingRuleChainEditor } from './PricingRuleChainEditor';
import type { PricingRuleClauseInput } from './PricingRuleClauseCard';

function moneyFmt(value: unknown) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n.toLocaleString('en-US', { maximumFractionDigits: 2 }) : '0';
}

function asRule(value: unknown): CustomerPricingRule {
  if (value && typeof value === 'object') return value as CustomerPricingRule;
  return {};
}

function ruleSourceLabel(app: PricingRuleApplication): string {
  switch (app.source) {
    // New clause-based sources
    case 'customer-clause':
      return app.clauseName ? `customer · ${app.clauseName}` : 'customer rule';
    case 'global-clause':
      return app.clauseName ? `global · ${app.clauseName}` : 'global rule';
    // Legacy sources (from old journal entries)
    case 'customer-category':
      return `customer · ${app.category ?? ''}`;
    case 'customer-default':
      return 'customer · default';
    case 'settings-category':
      return `settings · ${app.category ?? ''}`;
    case 'settings-default':
      return 'settings · default';
    case 'fallback':
      return 'fallback 30%';
  }
}

interface OrderPricingPanelProps {
  orderId: string;
  customerId?: string;
  // #143: when the Sales margin visibility toggle is off, hide the COGS/cost
  // section so it does not leak vendor cost posture during screen-sharing.
  // Defaults to true (visible) so non-Sales contexts are unaffected.
  showMargin?: boolean;
}

export function OrderPricingPanel({ orderId, customerId, showMargin = true }: OrderPricingPanelProps) {
  const lines = trpc.queries.salesOrderLines.useQuery({ orderId }, { enabled: Boolean(orderId), refetchOnWindowFocus: false });
  const reference = trpc.queries.reference.useQuery(undefined, { refetchOnWindowFocus: false });
  const relationship = trpc.queries.relationshipSummary.useQuery({ customerId }, { enabled: Boolean(customerId) });
  const { runCommand, isRunning } = useCommandRunner();
  const [customCogs, setCustomCogs] = useState<Record<string, string>>({});
  const [customExceptionReason, setCustomExceptionReason] = useState<Record<string, BelowFloorReason | ''>>({});
  const [customExceptionNote, setCustomExceptionNote] = useState<Record<string, string>>({});

  const customerRule = asRule((relationship.data?.customer as Record<string, unknown> | undefined)?.pricingRule);
  const defaultsRule = asRule(reference.data?.defaultPricingRule);

  async function setCogs(
    lineId: string,
    landedCost: number,
    basis: 'manual' | 'pick-low' | 'pick-mid' | 'pick-high',
    exception?: { reason: BelowFloorReason; note?: string }
  ) {
    const payloadObj: Record<string, unknown> = { lineId, landedCost, basis };
    if (exception) {
      payloadObj.exceptionReason = exception.reason;
      if (exception.note?.trim()) payloadObj.exceptionNote = exception.note.trim();
    }
    await runCommand('setLineLandedCost', payloadObj, `Resolve landed COGS via ${basis}`);
    await lines.refetch();
  }

  async function applyRule() {
    await runCommand('priceSalesOrder', { orderId, strategy: 'customer-rule' }, 'Apply customer pricing rule to order');
    await lines.refetch();
  }

  const rows = (lines.data ?? []) as Array<Record<string, unknown>>;

  return (
    <div className="context-drawer-card" data-testid="order-pricing-panel">
      <h2 className="mt-1 truncate text-base font-semibold text-ink">Order pricing</h2>
      <div className="mt-1 text-[11px] uppercase text-zinc-500">
        Internal only · Rule source: customer rule {customerRule.default || customerRule.categories ? '✓' : '—'} · settings default {defaultsRule.default || defaultsRule.categories ? '✓' : '—'}
      </div>
      {rows.length === 0 ? (
        <div className="mt-4 text-sm text-zinc-600">No lines on this order yet.</div>
      ) : (
        <div className="mt-3 grid gap-3">
          {rows.map((line) => {
            const lineId = String(line.id);
            const range = parsePriceRange(line.priceRange as string | null);
            const category = (line.batchCategory as string | undefined) ?? undefined;
            const eff = resolvePricingRuleEntry(customerRule, defaultsRule, category);
            const unitCost = Number(line.unitCost ?? 0);
            const resolved = line.unitCostResolved === true;
            const suggested = applyPricingRule(unitCost, eff);
            const customValue = customCogs[lineId] ?? '';
            // #64 PR-2: server-projected below-range exception metadata from
            // the latest successful `setLineLandedCost` journal row. Renders
            // an accessible amber warning chip (see `LandedCostExceptionChip`)
            // beside the row header — especially important for
            // `vendor_approval_pending` so operators see the unresolved
            // vendor handshake without opening the journal.
            const projectedExceptionReason =
              typeof line.landedCostExceptionReason === 'string' && line.landedCostExceptionReason
                ? line.landedCostExceptionReason
                : null;
            const projectedExceptionNote =
              typeof line.landedCostExceptionNote === 'string' ? line.landedCostExceptionNote : null;
            const projectedRangeLow =
              typeof line.landedCostExceptionRangeLow === 'number' ? line.landedCostExceptionRangeLow : null;
            const projectedRangeHigh =
              typeof line.landedCostExceptionRangeHigh === 'number' ? line.landedCostExceptionRangeHigh : null;
            return (
              <div key={lineId} className="border border-line p-3 text-sm" data-testid={`pricing-line-${lineId}`}>
                <div className="flex items-baseline justify-between gap-2">
                  <strong>{String(line.itemName)}</strong>
                  <div className="flex items-center gap-2">
                    {showMargin && projectedExceptionReason ? (
                      <LandedCostExceptionChip
                        reason={projectedExceptionReason}
                        note={projectedExceptionNote}
                        rangeLow={projectedRangeLow}
                        rangeHigh={projectedRangeHigh}
                        testId={`pricing-line-exception-chip-${lineId}`}
                      />
                    ) : null}
                    <span className="text-[11px] uppercase text-zinc-500">{String(line.status ?? '')}</span>
                  </div>
                </div>
                <div className="text-xs text-zinc-600">
                  {category ?? '—'} · qty {String(line.qty)} · unit price ${moneyFmt(line.unitPrice)}
                  {(line as Record<string, unknown>).guardrailApplied === true && (
                    <span
                      className="finder-chip warning"
                      title={`Price lifted to guardrail floor (profile: ${String((line as Record<string, unknown>).guardrailProfile ?? '')})`}
                      data-testid={`guardrail-chip-${lineId}`}
                    >
                      ⚠ guardrail
                    </span>
                  )}
                </div>
                {/* #143: COGS range, unit cost controls, projected exception
                    chip, and below-range picker are operator-only. Hide the
                    entire cost block when showMargin is off so vendor cost
                    posture is not visible during screen-sharing. */}
                {showMargin ? (
                  range ? (
                    <div className="mt-2 grid gap-2">
                      <div className="text-xs">
                        COGS range <strong>${moneyFmt(range.low)}–${moneyFmt(range.high)}</strong>
                        {' · landed COGS '}
                        <strong>${moneyFmt(unitCost)}</strong>{' '}
                        {resolved ? <span style={{ color: '#16a34a' }}>✓ resolved</span> : <span style={{ color: '#dc2626' }}>⚠ unresolved</span>}
                        {' · basis '}
                        <em>{String(line.landedCostBasis ?? '—')}</em>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button type="button" className="text-button" disabled={isRunning} onClick={() => setCogs(lineId, range.low, 'pick-low')} data-testid={`pick-low-${lineId}`}>Low ${moneyFmt(range.low)}</button>
                        <button type="button" className="text-button" disabled={isRunning} onClick={() => setCogs(lineId, (range.low + range.high) / 2, 'pick-mid')} data-testid={`pick-mid-${lineId}`}>Mid ${moneyFmt((range.low + range.high) / 2)}</button>
                        <button type="button" className="text-button" disabled={isRunning} onClick={() => setCogs(lineId, range.high, 'pick-high')} data-testid={`pick-high-${lineId}`}>High ${moneyFmt(range.high)}</button>
                        {(() => {
                          const customNum = Number(customValue);
                          const customValid = customValue !== '' && Number.isFinite(customNum) && customNum >= 0;
                          const customInRange = customValid && customNum >= range.low && customNum <= range.high;
                          const customBelowRange = customValid && customNum < range.low;
                          const customAboveRange = customValid && customNum > range.high;
                          const reasonChoice = customExceptionReason[lineId] ?? '';
                          const noteValue = customExceptionNote[lineId] ?? '';
                          const canSubmit = customValid && (customInRange || (customBelowRange && reasonChoice !== ''));
                          return (
                            <>
                              <input
                                type="number"
                                min={0}
                                step="0.01"
                                value={customValue}
                                onChange={(event) => setCustomCogs((current) => ({ ...current, [lineId]: event.target.value }))}
                                placeholder="custom"
                                aria-label="Custom COGS value"
                                className={`border px-2 py-1 text-xs ${customAboveRange ? 'border-red-400' : customBelowRange ? 'border-amber-400' : 'border-line'}`}
                                style={{ width: 110 }}
                                data-testid={`pick-custom-input-${lineId}`}
                              />
                              {customAboveRange ? (
                                <span className="text-xs text-red-600" data-testid={`pick-custom-range-error-${lineId}`}>
                                  Above range max ${moneyFmt(range.high)} — use override basis with manager approval
                                </span>
                              ) : null}
                              {customBelowRange ? (
                                <div className="w-full mt-1 border border-amber-300 bg-amber-50 p-2 text-xs" data-testid={`pick-custom-below-range-${lineId}`}>
                                  <div className="text-amber-800 font-medium mb-1">Below range floor ${moneyFmt(range.low)} — select a reason to proceed</div>
                                  <select
                                    value={reasonChoice}
                                    onChange={(event) => setCustomExceptionReason((current) => ({ ...current, [lineId]: event.target.value as BelowFloorReason | '' }))}
                                    aria-label="Below-range exception reason"
                                    className="border border-line px-2 py-1 text-xs w-full"
                                    data-testid={`pick-custom-exception-reason-${lineId}`}
                                  >
                                    <option value="">Select reason…</option>
                                    {BELOW_FLOOR_REASONS.map((r) => (
                                      <option key={r} value={r}>{EXCEPTION_REASON_LABELS[r]}</option>
                                    ))}
                                  </select>
                                  <input
                                    type="text"
                                    value={noteValue}
                                    onChange={(event) => setCustomExceptionNote((current) => ({ ...current, [lineId]: event.target.value }))}
                                    placeholder="Optional note"
                                    aria-label="Exception note"
                                    className="mt-1 border border-line px-2 py-1 text-xs w-full"
                                    data-testid={`pick-custom-exception-note-${lineId}`}
                                  />
                                </div>
                              ) : null}
                              <button
                                type="button"
                                className="text-button"
                                disabled={isRunning || !canSubmit}
                                onClick={() => {
                                  const exception =
                                    customBelowRange && reasonChoice !== ''
                                      ? { reason: reasonChoice as BelowFloorReason, note: noteValue }
                                      : undefined;
                                  void setCogs(lineId, customNum, 'manual', exception);
                                  setCustomCogs((current) => ({ ...current, [lineId]: '' }));
                                  setCustomExceptionReason((current) => ({ ...current, [lineId]: '' }));
                                  setCustomExceptionNote((current) => ({ ...current, [lineId]: '' }));
                                }}
                                data-testid={`pick-custom-${lineId}`}
                              >
                                Set custom
                              </button>
                            </>
                          );
                        })()}
                      </div>
                      <div className="text-xs text-zinc-700">
                        Rule: <strong>{eff.basis === 'percent' ? `${(eff.amount * 100).toFixed(1)}%` : `+$${moneyFmt(eff.amount)}`}</strong> ({ruleSourceLabel(eff)}) · suggested sale ${moneyFmt(suggested)}
                      </div>
                    </div>
                  ) : (
                    <div className="mt-2 text-xs text-zinc-600">No COGS range (fixed cost batch).</div>
                  )
                ) : null}
              </div>
            );
          })}
          <button
            type="button"
            className="text-button"
            disabled={isRunning || rows.some((r) => r.unitCostResolved === false)}
            onClick={applyRule}
            data-testid="apply-pricing-rule"
          >
            Apply customer pricing rule to all lines
          </button>
        </div>
      )}
    </div>
  );
}

interface CustomerPricingPanelProps {
  customerId: string;
}

export function CustomerPricingPanel({ customerId }: CustomerPricingPanelProps) {
  const clauses = trpc.queries.pricingRuleClauses.useQuery(
    { scope: 'customer', customerId },
    { enabled: Boolean(customerId), refetchOnWindowFocus: false }
  );
  const summary = trpc.queries.pricingRulesSummary.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });
  const { runCommand, isRunning } = useCommandRunner();

  async function handleSave(
    updatedClauses: PricingRuleClauseInput[],
    fingerprint: string
  ) {
    await runCommand(
      'savePricingRuleChain',
      {
        scope: 'customer',
        customerId,
        clauses: updatedClauses,
        chainFingerprint: fingerprint,
      },
      'Update customer pricing rule'
    );
    await clauses.refetch();
    await summary.refetch();
  }

  if (clauses.isLoading) {
    return (
      <div className="context-drawer-card">
        <p className="text-sm text-zinc-500">Loading…</p>
      </div>
    );
  }

  return (
    <div className="context-drawer-card" data-testid="customer-pricing-panel">
      <h2 className="mt-1 truncate text-base font-semibold text-ink">
        Pricing rules
      </h2>
      <div className="mt-1 text-[11px] uppercase text-zinc-500">
        Internal only — never shown to customer
      </div>
      <div className="mt-3">
        <PricingRuleChainEditor
          scope="customer"
          customerId={customerId}
          clauses={clauses.data ?? []}
          chainFingerprint={`${clauses.data?.length ?? 0}:`}
          isRunning={isRunning}
          onSave={handleSave}
          compact
        />
      </div>
    </div>
  );
}
