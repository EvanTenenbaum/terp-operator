import { useEffect, useMemo, useState } from 'react';
import { trpc } from '../api/trpc';
import { useCommandRunner } from './useCommandRunner';
import { parsePriceRange } from '../../shared/priceRange';
import { applyPricingRule, resolvePricingRuleEntry } from '../../shared/inventoryPricingShared';
import type { CustomerPricingRule, PricingRuleApplication, PricingRuleEntry } from '../../shared/types';

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
    case 'customer-category': return `customer · ${app.category ?? ''}`;
    case 'customer-default': return 'customer · default';
    case 'settings-category': return `settings · ${app.category ?? ''}`;
    case 'settings-default': return 'settings · default';
    case 'fallback': return 'fallback 30%';
  }
}

interface OrderPricingPanelProps {
  orderId: string;
  customerId?: string;
}

export function OrderPricingPanel({ orderId, customerId }: OrderPricingPanelProps) {
  const lines = trpc.queries.salesOrderLines.useQuery({ orderId }, { enabled: Boolean(orderId), refetchOnWindowFocus: false });
  const reference = trpc.queries.reference.useQuery(undefined, { refetchOnWindowFocus: false });
  const relationship = trpc.queries.relationshipSummary.useQuery({ customerId }, { enabled: Boolean(customerId) });
  const { runCommand, isRunning } = useCommandRunner();
  const [customCogs, setCustomCogs] = useState<Record<string, string>>({});

  const customerRule = asRule((relationship.data?.customer as Record<string, unknown> | undefined)?.pricingRule);
  const defaultsRule = asRule(reference.data?.defaultPricingRule);

  async function setCogs(lineId: string, landedCost: number, basis: 'manual' | 'pick-low' | 'pick-mid' | 'pick-high') {
    await runCommand('setLineLandedCost', { lineId, landedCost, basis }, `Resolve landed COGS via ${basis}`);
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
            return (
              <div key={lineId} className="border border-line p-3 text-sm" data-testid={`pricing-line-${lineId}`}>
                <div className="flex items-baseline justify-between gap-2">
                  <strong>{String(line.itemName)}</strong>
                  <span className="text-[11px] uppercase text-zinc-500">{String(line.status ?? '')}</span>
                </div>
                <div className="text-xs text-zinc-600">
                  {category ?? '—'} · qty {String(line.qty)} · unit price ${moneyFmt(line.unitPrice)}
                </div>
                {range ? (
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
                        const customInRange = customValue !== '' && Number.isFinite(customNum) && customNum >= range.low && customNum <= range.high;
                        const customOutOfRange = customValue !== '' && !customInRange;
                        return (
                          <>
                            <input
                              type="number"
                              min={range.low}
                              max={range.high}
                              step="0.01"
                              value={customValue}
                              onChange={(event) => setCustomCogs((current) => ({ ...current, [lineId]: event.target.value }))}
                              placeholder="custom"
                              className={`border px-2 py-1 text-xs ${customOutOfRange ? 'border-red-400' : 'border-line'}`}
                              style={{ width: 110 }}
                              data-testid={`pick-custom-input-${lineId}`}
                            />
                            {customOutOfRange ? (
                              <span className="text-xs text-red-600" data-testid={`pick-custom-range-error-${lineId}`}>
                                Must be ${moneyFmt(range.low)}–${moneyFmt(range.high)}
                              </span>
                            ) : null}
                            <button
                              type="button"
                              className="text-button"
                              disabled={isRunning || !customInRange}
                              onClick={() => {
                                void setCogs(lineId, customNum, 'manual');
                                setCustomCogs((current) => ({ ...current, [lineId]: '' }));
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
                )}
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
  const relationship = trpc.queries.relationshipSummary.useQuery({ customerId }, { enabled: Boolean(customerId) });
  const reference = trpc.queries.reference.useQuery(undefined, { refetchOnWindowFocus: false });
  const { runCommand, isRunning } = useCommandRunner();

  const initialRule = asRule((relationship.data?.customer as Record<string, unknown> | undefined)?.pricingRule);
  const defaultsRule = asRule(reference.data?.defaultPricingRule);

  const [basis, setBasis] = useState<'percent' | 'dollar'>(initialRule.default?.basis ?? 'percent');
  const [amountText, setAmountText] = useState<string>(initialRule.default ? String(initialRule.default.amount) : '');
  const [categoryDrafts, setCategoryDrafts] = useState<Record<string, { basis: 'percent' | 'dollar'; amount: string }>>({});
  const [newCategory, setNewCategory] = useState<string>('');

  useEffect(() => {
    if (relationship.data?.customer) {
      const rule = asRule((relationship.data.customer as Record<string, unknown>).pricingRule);
      setBasis(rule.default?.basis ?? 'percent');
      setAmountText(rule.default ? String(rule.default.amount) : '');
      const drafts: Record<string, { basis: 'percent' | 'dollar'; amount: string }> = {};
      if (rule.categories) {
        for (const [cat, entry] of Object.entries(rule.categories)) {
          drafts[cat] = { basis: entry.basis, amount: String(entry.amount) };
        }
      }
      setCategoryDrafts(drafts);
    }
  }, [relationship.data?.customer]);

  const categories = useMemo(() => reference.data?.categories ?? ['Flower', 'Infused', 'Extract', 'Pre-roll', 'Vape'], [reference.data?.categories]);

  async function save() {
    const next: CustomerPricingRule = {};
    const amount = Number(amountText);
    if (amountText && Number.isFinite(amount)) next.default = { basis, amount };
    const cats: Record<string, PricingRuleEntry> = {};
    for (const [cat, draft] of Object.entries(categoryDrafts)) {
      const v = Number(draft.amount);
      if (draft.amount && Number.isFinite(v)) cats[cat] = { basis: draft.basis, amount: v };
    }
    if (Object.keys(cats).length) next.categories = cats;
    await runCommand('setCustomerPricingRule', { customerId, pricingRule: next }, 'Update customer pricing rule');
    await relationship.refetch();
  }

  const customerName = (relationship.data?.customer as Record<string, unknown> | undefined)?.name ?? 'Customer';
  const fallbackText = defaultsRule.default
    ? defaultsRule.default.basis === 'percent'
      ? `${(defaultsRule.default.amount * 100).toFixed(1)}%`
      : `+$${defaultsRule.default.amount.toFixed(2)}`
    : 'fallback 30%';

  return (
    <div className="context-drawer-card" data-testid="customer-pricing-panel">
      <h2 className="mt-1 truncate text-base font-semibold text-ink">{String(customerName)} pricing rule</h2>
      <div className="mt-1 text-[11px] uppercase text-zinc-500">Internal only — never shown to customer</div>
      <div className="mt-3 grid gap-3 text-sm">
        <div>
          <div className="text-xs uppercase text-zinc-500">Default markup</div>
          <div className="mt-1 flex items-center gap-2">
            <select className="border border-line px-2 py-1 text-xs" value={basis} onChange={(event) => setBasis(event.target.value as 'percent' | 'dollar')} data-testid="rule-default-basis">
              <option value="percent">% markup</option>
              <option value="dollar">$ markup</option>
            </select>
            <input
              className="border border-line px-2 py-1 text-xs"
              style={{ width: 100 }}
              type="number"
              step="0.01"
              min={0}
              value={amountText}
              onChange={(event) => setAmountText(event.target.value)}
              placeholder={basis === 'percent' ? '0.30 (= 30%)' : '50.00'}
              data-testid="rule-default-amount"
            />
            <span className="text-xs text-zinc-500">{basis === 'percent' ? 'as decimal: 0.30 = 30%' : 'dollars added to landed COGS'}</span>
          </div>
        </div>

        <div>
          <div className="text-xs uppercase text-zinc-500">Per-category override</div>
          <div className="mt-1 grid gap-1">
            {Object.entries(categoryDrafts).map(([cat, draft]) => (
              <div key={cat} className="flex items-center gap-2">
                <strong style={{ width: 90 }}>{cat}</strong>
                <select
                  className="border border-line px-2 py-1 text-xs"
                  value={draft.basis}
                  onChange={(event) =>
                    setCategoryDrafts((current) => ({ ...current, [cat]: { ...current[cat], basis: event.target.value as 'percent' | 'dollar' } }))
                  }
                  data-testid={`rule-cat-basis-${cat}`}
                >
                  <option value="percent">%</option>
                  <option value="dollar">$</option>
                </select>
                <input
                  className="border border-line px-2 py-1 text-xs"
                  style={{ width: 90 }}
                  type="number"
                  step="0.01"
                  min={0}
                  value={draft.amount}
                  onChange={(event) =>
                    setCategoryDrafts((current) => ({ ...current, [cat]: { ...current[cat], amount: event.target.value } }))
                  }
                  data-testid={`rule-cat-amount-${cat}`}
                />
                <button
                  type="button"
                  className="text-button"
                  onClick={() =>
                    setCategoryDrafts((current) => {
                      const next = { ...current };
                      delete next[cat];
                      return next;
                    })
                  }
                >
                  Remove
                </button>
              </div>
            ))}
            <div className="flex items-center gap-2">
              <select className="border border-line px-2 py-1 text-xs" value={newCategory} onChange={(event) => setNewCategory(event.target.value)} data-testid="rule-new-category">
                <option value="">Add category…</option>
                {categories.filter((cat: string) => !categoryDrafts[cat]).map((cat: string) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
              <button
                type="button"
                className="text-button"
                disabled={!newCategory}
                onClick={() => {
                  if (!newCategory) return;
                  setCategoryDrafts((current) => ({ ...current, [newCategory]: { basis: 'percent', amount: '' } }));
                  setNewCategory('');
                }}
              >
                Add
              </button>
            </div>
          </div>
        </div>

        <div className="text-xs text-zinc-600">If no rule is set for a category, the system default ({fallbackText}) is used.</div>

        <button type="button" className="text-button" disabled={isRunning} onClick={save} data-testid="rule-save">Save rule</button>
      </div>
    </div>
  );
}
