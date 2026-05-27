import { Fragment, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { trpc } from '../api/trpc';
import { useCommandRunner } from './useCommandRunner';
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

export function DefaultPricingPanel() {
  const reference = trpc.queries.reference.useQuery(undefined, { refetchOnWindowFocus: false });
  const { runCommand, isRunning } = useCommandRunner();
  const initial = asRule(reference.data?.defaultPricingRule);

  const [basis, setBasis] = useState<'percent' | 'dollar'>(initial.default?.basis ?? 'percent');
  const [amountText, setAmountText] = useState<string>(initial.default ? String(initial.default.amount) : '0.30');
  const [categoryDrafts, setCategoryDrafts] = useState<Record<string, CategoryDraft>>({});
  const [newSubcategory, setNewSubcategory] = useState<Record<string, string>>({});

  useEffect(() => {
    const rule = asRule(reference.data?.defaultPricingRule);
    setBasis(rule.default?.basis ?? 'percent');
    setAmountText(rule.default ? String(rule.default.amount) : '0.30');
    setCategoryDrafts(buildCategoryDrafts(rule));
  }, [reference.data?.defaultPricingRule]);

  const categories = useMemo(
    () => reference.data?.categories ?? ['Flower', 'Infused', 'Extract', 'Pre-roll', 'Vape'],
    [reference.data?.categories]
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
        if (subDraft.amount && Number.isFinite(sv)) subs[sub] = { basis: subDraft.basis, amount: sv };
      }
      if (Object.keys(subs).length) entry.subcategories = subs;
      if (entry.rule || entry.subcategories) cats[cat] = entry;
    }
    if (Object.keys(cats).length) next.categories = cats;
    await runCommand('setDefaultPricingRule', { pricingRule: next }, 'Update system default pricing rule');
    await reference.refetch();
  }

  function addSubcategory(cat: string) {
    const sub = newSubcategory[cat]?.trim();
    if (!sub) return;
    setCategoryDrafts((prev) => ({
      ...prev,
      [cat]: {
        ...prev[cat],
        subcategories: { ...prev[cat].subcategories, [sub]: { basis: 'percent', amount: '' } }
      }
    }));
    setNewSubcategory((prev) => ({ ...prev, [cat]: '' }));
  }

  function removeSubcategory(cat: string, sub: string) {
    setCategoryDrafts((prev) => {
      const next = { ...prev[cat].subcategories };
      delete next[sub];
      return { ...prev, [cat]: { ...prev[cat], subcategories: next } };
    });
  }

  function removeCategory(cat: string) {
    setCategoryDrafts((prev) => {
      const next = { ...prev };
      delete next[cat];
      return next;
    });
  }

  function toggleExpand(cat: string) {
    setCategoryDrafts((prev) => ({ ...prev, [cat]: { ...prev[cat], expanded: !prev[cat].expanded } }));
  }

  const unusedCategories = categories.filter((c: string) => !categoryDrafts[c]);

  return (
    <div className="view-stack" data-testid="default-pricing-panel">
      <div>
        <h2 className="page-title">Default pricing rule</h2>
        <p className="page-subtitle">
          Applied to sales lines when a customer has no own rule.{' '}
          <span className="pricing-internal-badge">Internal only</span>
        </p>
      </div>

      <div className="inline-panel">
        {/* Default markup */}
        <div className="section-title">Default markup</div>
        <div className="field-inline mt-2">
          <span className="text-zinc-600 text-xs w-20">Basis</span>
          <select
            className="select compact"
            value={basis}
            onChange={(e) => setBasis(e.target.value as 'percent' | 'dollar')}
            data-testid="default-rule-basis"
          >
            <option value="percent">% markup</option>
            <option value="dollar">$ markup</option>
          </select>
        </div>
        <div className="field-inline mt-1">
          <span className="text-zinc-600 text-xs w-20">Amount</span>
          <input
            className="input compact"
            style={{ width: 90 }}
            type="number"
            step="0.01"
            min={0}
            value={amountText}
            onChange={(e) => setAmountText(e.target.value)}
            placeholder={basis === 'percent' ? '0.30' : '50.00'}
            data-testid="default-rule-amount"
          />
          <span className="text-xs text-zinc-400">{basis === 'percent' ? '0.30 = 30%' : '$ added to COGS'}</span>
        </div>

        {/* Category + subcategory overrides */}
        <div className="section-title mt-4">Category &amp; subcategory overrides</div>
        <table className="pricing-rule-table mt-2">
          <thead>
            <tr>
              <th>Category / Subcategory</th>
              <th style={{ width: 70 }}>Basis</th>
              <th style={{ width: 80 }}>Amount</th>
              <th style={{ width: 32 }}></th>
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
                    <span className="font-semibold ml-1">{cat}</span>
                    {draft.amount ? (
                      <span className="ml-2 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-accent/10 border border-accent/30 text-accent-dark">
                        {draft.basis === 'percent'
                          ? `${(Number(draft.amount) * 100).toFixed(0)}%`
                          : `$${draft.amount}`}
                      </span>
                    ) : null}
                  </td>
                  <td>
                    <select
                      className="select compact"
                      style={{ minWidth: 60 }}
                      value={draft.basis}
                      onChange={(e) =>
                        setCategoryDrafts((p) => ({ ...p, [cat]: { ...p[cat], basis: e.target.value as 'percent' | 'dollar' } }))
                      }
                      data-testid={`cat-basis-${cat}`}
                    >
                      <option value="percent">%</option>
                      <option value="dollar">$</option>
                    </select>
                  </td>
                  <td>
                    <input
                      className="input compact"
                      style={{ width: 70 }}
                      type="number"
                      step="0.01"
                      min={0}
                      value={draft.amount}
                      onChange={(e) =>
                        setCategoryDrafts((p) => ({ ...p, [cat]: { ...p[cat], amount: e.target.value } }))
                      }
                      data-testid={`cat-amount-${cat}`}
                    />
                  </td>
                  <td>
                    <button
                      type="button"
                      className="text-button compact-action text-zinc-400 hover:text-danger"
                      onClick={() => removeCategory(cat)}
                      aria-label={`Remove ${cat} category override`}
                    >✕</button>
                  </td>
                </tr>

                {draft.expanded && Object.entries(draft.subcategories).map(([sub, subDraft]) => (
                  <tr key={`${cat}::${sub}`} className="pricing-sub-row">
                    <td>
                      <span className="text-zinc-400 mr-1" aria-hidden="true">└</span>
                      {sub}
                    </td>
                    <td>
                      <select
                        className="select compact"
                        style={{ minWidth: 60 }}
                        value={subDraft.basis}
                        onChange={(e) =>
                          setCategoryDrafts((p) => ({
                            ...p,
                            [cat]: {
                              ...p[cat],
                              subcategories: {
                                ...p[cat].subcategories,
                                [sub]: { ...p[cat].subcategories[sub], basis: e.target.value as 'percent' | 'dollar' }
                              }
                            }
                          }))
                        }
                        data-testid={`sub-basis-${cat}-${sub}`}
                      >
                        <option value="percent">%</option>
                        <option value="dollar">$</option>
                      </select>
                    </td>
                    <td>
                      <input
                        className="input compact"
                        style={{ width: 70 }}
                        type="number"
                        step="0.01"
                        min={0}
                        value={subDraft.amount}
                        onChange={(e) =>
                          setCategoryDrafts((p) => ({
                            ...p,
                            [cat]: {
                              ...p[cat],
                              subcategories: {
                                ...p[cat].subcategories,
                                [sub]: { ...p[cat].subcategories[sub], amount: e.target.value }
                              }
                            }
                          }))
                        }
                        data-testid={`sub-amount-${cat}-${sub}`}
                      />
                    </td>
                    <td>
                      <button
                        type="button"
                        className="text-button compact-action text-zinc-400 hover:text-danger"
                        onClick={() => removeSubcategory(cat, sub)}
                        aria-label={`Remove ${cat} ${sub} subcategory override`}
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
                          style={{ minWidth: 130 }}
                          value={newSubcategory[cat] ?? ''}
                          onChange={(e) => setNewSubcategory((p) => ({ ...p, [cat]: e.target.value }))}
                          data-testid={`new-sub-select-${cat}`}
                        >
                          <option value="">+ Add subcategory…</option>
                          {((reference.data as unknown as { subcategories?: string[] })?.subcategories ?? [])
                            .filter((s: string) => !draft.subcategories[s])
                            .map((s: string) => <option key={s}>{s}</option>)}
                        </select>
                        {newSubcategory[cat] ? (
                          <button
                            type="button"
                            className="secondary-button compact-action"
                            onClick={() => addSubcategory(cat)}
                            data-testid={`add-sub-btn-${cat}`}
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
                  style={{ minWidth: 160 }}
                  value=""
                  onChange={(e) => {
                    const cat = e.target.value;
                    if (!cat) return;
                    setCategoryDrafts((p) => ({
                      ...p,
                      [cat]: { basis: 'percent', amount: '', subcategories: {}, expanded: true }
                    }));
                  }}
                  data-testid="new-category-select"
                >
                  <option value="">+ Add category override…</option>
                  {unusedCategories.map((c: string) => <option key={c}>{c}</option>)}
                </select>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div>
        <button
          type="button"
          className="primary-button"
          disabled={isRunning}
          onClick={save}
          data-testid="default-rule-save"
        >
          Save rule
        </button>
      </div>
    </div>
  );
}
