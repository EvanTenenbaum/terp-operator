import { Fragment, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { trpc } from '../api/trpc';
import { useCommandRunner } from './useCommandRunner';
import { formatMoney } from '../utils/format';
import type { CustomerPricingRule, CategoryPricingEntry, PricingRuleEntry } from '../../shared/types';

function asRule(value: unknown): CustomerPricingRule {
  if (value && typeof value === 'object') return value as CustomerPricingRule;
  return {};
}

interface SubcategoryDraft { basis: 'percent' | 'dollar'; amount: string }
interface CategoryDraft {
  basis: 'percent' | 'dollar';
  amount: string;
  subcategories: Record<string, SubcategoryDraft>;
  expanded: boolean;
}

function buildCategoryDrafts(rule: CustomerPricingRule): Record<string, CategoryDraft> {
  const result: Record<string, CategoryDraft> = {};
  for (const [cat, entry] of Object.entries(rule.categories ?? {})) {
    const subs: Record<string, SubcategoryDraft> = {};
    for (const [sub, subRule] of Object.entries(entry.subcategories ?? {})) {
      subs[sub] = { basis: subRule.basis, amount: String(subRule.amount) };
    }
    result[cat] = {
      basis: entry.rule?.basis ?? 'percent',
      amount: entry.rule ? String(entry.rule.amount) : '',
      subcategories: subs,
      expanded: true
    };
  }
  return result;
}

interface CustomerPricingPanelProps {
  customerId: string;
}

export function CustomerPricingPanel({ customerId }: CustomerPricingPanelProps) {
  const relationship = trpc.queries.relationshipSummary.useQuery(
    { customerId },
    { enabled: Boolean(customerId) }
  );
  const reference = trpc.queries.reference.useQuery(undefined, { refetchOnWindowFocus: false });
  const { runCommand, isRunning } = useCommandRunner();

  const initialRule = asRule(
    (relationship.data?.customer as Record<string, unknown> | undefined)?.pricingRule
  );
  const defaultsRule = asRule(reference.data?.defaultPricingRule);

  const [basis, setBasis] = useState<'percent' | 'dollar'>(initialRule.default?.basis ?? 'percent');
  const [amountText, setAmountText] = useState<string>(
    initialRule.default ? String(initialRule.default.amount) : ''
  );
  const [categoryDrafts, setCategoryDrafts] = useState<Record<string, CategoryDraft>>({});
  const [newSubcategory, setNewSubcategory] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (relationship.data?.customer) {
      const rule = asRule(
        (relationship.data.customer as Record<string, unknown>).pricingRule
      );
      setBasis(rule.default?.basis ?? 'percent');
      setAmountText(rule.default ? String(rule.default.amount) : '');
      setCategoryDrafts(buildCategoryDrafts(rule));
      setDirty(false);
    }
  }, [relationship.data?.customer]);

  const categories = useMemo(
    () => reference.data?.categories ?? ['Flower', 'Infused', 'Extract', 'Pre-roll', 'Vape'],
    [reference.data?.categories]
  );

  const fallbackText = defaultsRule.default
    ? defaultsRule.default.basis === 'percent'
      ? `${(defaultsRule.default.amount * 100).toFixed(1)}%`
      : `+${formatMoney(defaultsRule.default.amount)}`
    : 'fallback 30%';

  const customerName = String(
    (relationship.data?.customer as Record<string, unknown> | undefined)?.name ?? 'Customer'
  );

  async function save() {
    const next: CustomerPricingRule = {};
    const amount = Number(amountText);
    if (amountText && Number.isFinite(amount)) next.default = { basis, amount };
    const cats: Record<string, CategoryPricingEntry> = {};
    for (const [cat, draft] of Object.entries(categoryDrafts)) {
      const entry: CategoryPricingEntry = {};
      const v = Number(draft.amount);
      if (draft.amount && Number.isFinite(v)) entry.rule = { basis: draft.basis, amount: v };
      const subs: Record<string, PricingRuleEntry> = {};
      for (const [sub, subDraft] of Object.entries(draft.subcategories)) {
        const sv = Number(subDraft.amount);
        if (subDraft.amount && Number.isFinite(sv))
          subs[sub] = { basis: subDraft.basis, amount: sv };
      }
      if (Object.keys(subs).length) entry.subcategories = subs;
      if (entry.rule || entry.subcategories) cats[cat] = entry;
    }
    if (Object.keys(cats).length) next.categories = cats;
    await runCommand(
      'setCustomerPricingRule',
      { customerId, pricingRule: next },
      'Update customer pricing rule'
    );
    await relationship.refetch();
    setDirty(false);
  }

  function addSubcategory(cat: string) {
    const sub = newSubcategory[cat]?.trim();
    if (!sub) return;
    setCategoryDrafts((prev) => ({
      ...prev,
      [cat]: {
        ...prev[cat],
        subcategories: {
          ...prev[cat].subcategories,
          [sub]: { basis: 'percent', amount: '' }
        }
      }
    }));
    setNewSubcategory((prev) => ({ ...prev, [cat]: '' }));
    setDirty(true);
  }

  function removeSubcategory(cat: string, sub: string) {
    setCategoryDrafts((prev) => {
      const next = { ...prev[cat].subcategories };
      delete next[sub];
      return { ...prev, [cat]: { ...prev[cat], subcategories: next } };
    });
    setDirty(true);
  }

  function removeCategory(cat: string) {
    setCategoryDrafts((prev) => {
      const next = { ...prev };
      delete next[cat];
      return next;
    });
    setDirty(true);
  }

  function toggleExpand(cat: string) {
    setCategoryDrafts((prev) => ({
      ...prev,
      [cat]: { ...prev[cat], expanded: !prev[cat].expanded }
    }));
  }

  const unusedCategories = categories.filter((c: string) => !categoryDrafts[c]);

  return (
    <div className="context-drawer-card" data-testid="customer-pricing-panel">
      <div className="flex items-center gap-2 mt-1">
        <h2 className="truncate text-base font-semibold text-ink">
          {customerName} pricing rule
        </h2>
        <span className="pricing-internal-badge">Internal only</span>
      </div>
      <p className="mt-1 text-[11px] text-zinc-500">Overrides system default where set</p>

      <div className="mt-3">
        <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-1">
          Default markup
        </div>
        <div className="flex items-center gap-2 mb-1">
          <select
            className="select compact"
            style={{ minWidth: 100 }}
            value={basis}
            onChange={(e) => {
              setBasis(e.target.value as 'percent' | 'dollar');
              setDirty(true);
            }}
            data-testid="rule-default-basis"
          >
            <option value="percent">% markup</option>
            <option value="dollar">$ markup</option>
          </select>
          <input
            className="input compact"
            style={{ width: 80 }}
            type="number"
            step="0.01"
            min={0}
            value={amountText}
            placeholder={basis === 'percent' ? '0.30' : '50.00'}
            onChange={(e) => {
              setAmountText(e.target.value);
              setDirty(true);
            }}
            data-testid="rule-default-amount"
          />
          <span className="text-[11px] text-zinc-400">
            {basis === 'percent' ? '0.30 = 30%' : '$ added to COGS'}
          </span>
        </div>

        <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 mt-3 mb-1">
          Category &amp; subcategory overrides
        </div>
        <table className="pricing-rule-table">
          <thead>
            <tr>
              <th>Category / Subcategory</th>
              <th style={{ width: 60 }}>Basis</th>
              <th style={{ width: 72 }}>Amount</th>
              <th style={{ width: 28 }}></th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(categoryDrafts).map(([cat, draft]) => (
              <Fragment key={cat}>
                <tr className="pricing-cat-row">
                  <td>
                    <button
                      type="button"
                      className="text-button compact-action"
                      onClick={() => toggleExpand(cat)}
                      aria-expanded={draft.expanded}
                      aria-label={`${draft.expanded ? 'Collapse' : 'Expand'} ${cat}`}
                    >
                      {draft.expanded
                        ? <ChevronDown className="h-3 w-3 inline" aria-hidden="true" />
                        : <ChevronRight className="h-3 w-3 inline" aria-hidden="true" />}
                    </button>
                    <span className="font-semibold ml-1 text-xs">{cat}</span>
                    {draft.amount ? (
                      <span className="ml-1 text-[10px] px-1 rounded-full bg-accent/10 border border-accent/30 text-accent-dark">
                        {draft.basis === 'percent'
                          ? `${(Number(draft.amount) * 100).toFixed(0)}%`
                          : `$${draft.amount}`}
                      </span>
                    ) : null}
                  </td>
                  <td>
                    <select
                      className="select compact"
                      style={{ minWidth: 56 }}
                      value={draft.basis}
                      onChange={(e) => {
                        setCategoryDrafts((p) => ({
                          ...p,
                          [cat]: { ...p[cat], basis: e.target.value as 'percent' | 'dollar' }
                        }));
                        setDirty(true);
                      }}
                      data-testid={`rule-cat-basis-${cat}`}
                    >
                      <option value="percent">%</option>
                      <option value="dollar">$</option>
                    </select>
                  </td>
                  <td>
                    <input
                      className="input compact"
                      style={{ width: 68 }}
                      type="number"
                      step="0.01"
                      min={0}
                      value={draft.amount}
                      onChange={(e) => {
                        setCategoryDrafts((p) => ({
                          ...p,
                          [cat]: { ...p[cat], amount: e.target.value }
                        }));
                        setDirty(true);
                      }}
                      data-testid={`rule-cat-amount-${cat}`}
                    />
                  </td>
                  <td>
                    <button
                      type="button"
                      className="text-button compact-action text-zinc-400 hover:text-danger"
                      onClick={() => removeCategory(cat)}
                      aria-label={`Remove ${cat}`}
                    >✕</button>
                  </td>
                </tr>

                {draft.expanded && Object.entries(draft.subcategories).map(([sub, subDraft]) => (
                  <tr key={`${cat}::${sub}`} className="pricing-sub-row">
                    <td>
                      <span className="text-zinc-400 mr-1" aria-hidden="true">└</span>
                      <span className="text-xs">{sub}</span>
                    </td>
                    <td>
                      <select
                        className="select compact"
                        style={{ minWidth: 56 }}
                        value={subDraft.basis}
                        onChange={(e) => {
                          setCategoryDrafts((p) => ({
                            ...p,
                            [cat]: {
                              ...p[cat],
                              subcategories: {
                                ...p[cat].subcategories,
                                [sub]: {
                                  ...p[cat].subcategories[sub],
                                  basis: e.target.value as 'percent' | 'dollar'
                                }
                              }
                            }
                          }));
                          setDirty(true);
                        }}
                        data-testid={`rule-sub-basis-${cat}-${sub}`}
                      >
                        <option value="percent">%</option>
                        <option value="dollar">$</option>
                      </select>
                    </td>
                    <td>
                      <input
                        className="input compact"
                        style={{ width: 68 }}
                        type="number"
                        step="0.01"
                        min={0}
                        value={subDraft.amount}
                        onChange={(e) => {
                          setCategoryDrafts((p) => ({
                            ...p,
                            [cat]: {
                              ...p[cat],
                              subcategories: {
                                ...p[cat].subcategories,
                                [sub]: {
                                  ...p[cat].subcategories[sub],
                                  amount: e.target.value
                                }
                              }
                            }
                          }));
                          setDirty(true);
                        }}
                        data-testid={`rule-sub-amount-${cat}-${sub}`}
                      />
                    </td>
                    <td>
                      <button
                        type="button"
                        className="text-button compact-action text-zinc-400 hover:text-danger"
                        onClick={() => removeSubcategory(cat, sub)}
                        aria-label={`Remove ${cat} ${sub}`}
                      >✕</button>
                    </td>
                  </tr>
                ))}

                {draft.expanded && (
                  <tr key={`${cat}::add`} className="pricing-add-sub-row">
                    <td colSpan={4}>
                      <div className="flex items-center gap-1 py-0.5">
                        <select
                          className="select compact"
                          style={{ minWidth: 120 }}
                          value={newSubcategory[cat] ?? ''}
                          onChange={(e) =>
                            setNewSubcategory((p) => ({ ...p, [cat]: e.target.value }))
                          }
                          data-testid={`new-sub-select-${cat}`}
                        >
                          <option value="">+ Add subcategory…</option>
                          {((reference.data as { subcategories?: string[] } | undefined)?.subcategories ?? [])
                            .filter((s: string) => !draft.subcategories[s])
                            .map((s: string) => <option key={s}>{s}</option>)}
                        </select>
                        {newSubcategory[cat] ? (
                          <button
                            type="button"
                            className="secondary-button compact-action"
                            onClick={() => addSubcategory(cat)}
                          >
                            Add
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}

            <tr className="pricing-add-cat-row">
              <td colSpan={4}>
                <select
                  className="select compact"
                  style={{ minWidth: 150 }}
                  value=""
                  onChange={(e) => {
                    const cat = e.target.value;
                    if (!cat) return;
                    setCategoryDrafts((p) => ({
                      ...p,
                      [cat]: { basis: 'percent', amount: '', subcategories: {}, expanded: true }
                    }));
                    setDirty(true);
                  }}
                  data-testid="rule-new-category"
                >
                  <option value="">+ Add category override…</option>
                  {unusedCategories.map((c: string) => <option key={c}>{c}</option>)}
                </select>
              </td>
            </tr>
          </tbody>
        </table>

        <div className="mt-2 text-[11px] text-zinc-500 rounded border border-line bg-panel px-2 py-1.5">
          Categories without an override use the{' '}
          <strong>system default ({fallbackText})</strong>.
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          className="primary-button"
          disabled={isRunning}
          onClick={save}
          data-testid="rule-save"
        >
          Save rule
        </button>
        {dirty ? (
          <button
            type="button"
            className="secondary-button"
            disabled={isRunning}
            onClick={() => {
              const rule = asRule(
                (relationship.data?.customer as Record<string, unknown> | undefined)?.pricingRule
              );
              setCategoryDrafts(buildCategoryDrafts(rule));
              setBasis(rule.default?.basis ?? 'percent');
              setAmountText(rule.default ? String(rule.default.amount) : '');
              setDirty(false);
            }}
          >
            Discard
          </button>
        ) : null}
      </div>
    </div>
  );
}
