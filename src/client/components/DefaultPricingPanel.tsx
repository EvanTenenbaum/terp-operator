import { useEffect, useMemo, useState } from 'react';
import { trpc } from '../api/trpc';
import { useCommandRunner } from './useCommandRunner';
import type { CustomerPricingRule, PricingRuleEntry } from '../../shared/types';

function asRule(value: unknown): CustomerPricingRule {
  if (value && typeof value === 'object') return value as CustomerPricingRule;
  return {};
}

export function DefaultPricingPanel() {
  const reference = trpc.queries.reference.useQuery(undefined, { refetchOnWindowFocus: false });
  const { runCommand, isRunning } = useCommandRunner();
  const initial = asRule(reference.data?.defaultPricingRule);

  const [basis, setBasis] = useState<'percent' | 'dollar'>(initial.default?.basis ?? 'percent');
  const [amountText, setAmountText] = useState<string>(initial.default ? String(initial.default.amount) : '0.30');
  const [categoryDrafts, setCategoryDrafts] = useState<Record<string, { basis: 'percent' | 'dollar'; amount: string }>>({});
  const [newCategory, setNewCategory] = useState<string>('');

  useEffect(() => {
    const rule = asRule(reference.data?.defaultPricingRule);
    setBasis(rule.default?.basis ?? 'percent');
    setAmountText(rule.default ? String(rule.default.amount) : '0.30');
    const drafts: Record<string, { basis: 'percent' | 'dollar'; amount: string }> = {};
    if (rule.categories) {
      for (const [cat, entry] of Object.entries(rule.categories)) {
        drafts[cat] = { basis: entry.basis, amount: String(entry.amount) };
      }
    }
    setCategoryDrafts(drafts);
  }, [reference.data?.defaultPricingRule]);

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
    await runCommand('setDefaultPricingRule', { pricingRule: next }, 'Update system default pricing rule');
    await reference.refetch();
  }

  return (
    <div className="view-stack" data-testid="default-pricing-panel">
      <div>
        <h2 className="page-title">Default pricing rule</h2>
        <p className="page-subtitle">Applied to sales lines when a customer has no own rule. Internal only — never shown to customers.</p>
      </div>

      <div className="border border-line p-4 text-sm">
        <div className="text-xs uppercase text-zinc-500">Default markup</div>
        <div className="mt-1 flex items-center gap-2">
          <select className="border border-line px-2 py-1 text-xs" value={basis} onChange={(event) => setBasis(event.target.value as 'percent' | 'dollar')} data-testid="default-rule-basis">
            <option value="percent">% markup</option>
            <option value="dollar">$ markup</option>
          </select>
          <input
            className="border border-line px-2 py-1 text-xs"
            style={{ width: 120 }}
            type="number"
            step="0.01"
            min={0}
            value={amountText}
            onChange={(event) => setAmountText(event.target.value)}
            placeholder={basis === 'percent' ? '0.30 (= 30%)' : '50.00'}
            data-testid="default-rule-amount"
          />
          <span className="text-xs text-zinc-500">{basis === 'percent' ? 'decimal: 0.30 = 30%' : '$ added to landed COGS'}</span>
        </div>

        <div className="mt-4">
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
                >
                  <option value="percent">%</option>
                  <option value="dollar">$</option>
                </select>
                <input
                  className="border border-line px-2 py-1 text-xs"
                  style={{ width: 100 }}
                  type="number"
                  step="0.01"
                  min={0}
                  value={draft.amount}
                  onChange={(event) =>
                    setCategoryDrafts((current) => ({ ...current, [cat]: { ...current[cat], amount: event.target.value } }))
                  }
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
              <select className="border border-line px-2 py-1 text-xs" value={newCategory} onChange={(event) => setNewCategory(event.target.value)}>
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

        <button type="button" className="text-button mt-4" disabled={isRunning} onClick={save} data-testid="default-rule-save">Save default rule</button>
      </div>
    </div>
  );
}
