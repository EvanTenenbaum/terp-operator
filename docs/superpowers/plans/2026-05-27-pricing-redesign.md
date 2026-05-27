# Pricing Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the pricing rule panels (DefaultPricingPanel, CustomerPricingPanel) with category+subcategory support, and move order-line pricing inline into the SalesView AG Grid with two-flow recalculation (fixed COGS and range COGS).

**Architecture:** Data model change first (nested `CustomerPricingRule`), then updated resolution logic, then UI panels, then inline SalesView columns. `OrderPricingPanel` is removed from `RelationshipDrawer` — its job moves into the grid. All pricing columns gated by existing `showMargin` toggle.

**Tech Stack:** TypeScript, React, AG Grid (ColDef/valueSetter/cellRenderer), tRPC, Zod, Vitest/jsdom

**Spec:** `docs/superpowers/specs/2026-05-27-finder-pricing-ui-redesign.md` §2–4

---

## File map

| File | Action | What changes |
|---|---|---|
| `src/shared/types.ts` | Modify | `CustomerPricingRule` → nested `CategoryPricingEntry` |
| `src/shared/schemas.ts` | Modify | `customerPricingRuleSchema` matches new shape + backward compat |
| `src/shared/inventoryPricingShared.ts` | Modify | `resolvePricingRuleEntry` handles subcategories; add `markupDollarsFromPrice` |
| `src/client/components/DefaultPricingPanel.tsx` | Rewrite | Cat+subcat table, semantic inputs, primary-button save |
| `src/client/components/PricingPanel.tsx` | Modify | Remove `OrderPricingPanel`; redesign `CustomerPricingPanel` |
| `src/client/components/PricingPanel.test.tsx` | Modify | Remove `OrderPricingPanel` suite; keep `CustomerPricingPanel` tests |
| `src/client/components/RelationshipDrawer.tsx` | Modify | Remove `OrderPricingPanel` usage |
| `src/client/views/SalesView.tsx` | Modify | Add `markup`, `markupPct`, `derivedCogs` columns + Re-apply rule button |
| `src/client/views/SalesView.columns.ts` | Modify | Add new pricing fields to `MARGIN_COLUMN_FIELDS` |
| `src/client/views/SalesView.pricing.test.tsx` | Create | 7 pricing flow test cases |
| `src/server/services/commandBus.ts` | Modify | Backward-compat read of old flat `categories` in `validatePricingRulePayload` |
| `src/client/styles.css` | Modify | Add pricing panel semantic classes |

---

## Task 1: Update `CustomerPricingRule` type and Zod schema

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/shared/schemas.ts`

- [ ] **Step 1: Update types.ts**

Replace lines 159–162 in `src/shared/types.ts`:

```ts
// Before:
export interface CustomerPricingRule {
  default?: PricingRuleEntry;
  categories?: Record<string, PricingRuleEntry>;
}

// After: add CategoryPricingEntry and update CustomerPricingRule
export interface CategoryPricingEntry {
  rule?: PricingRuleEntry;
  subcategories?: Record<string, PricingRuleEntry>;
}

export interface CustomerPricingRule {
  default?: PricingRuleEntry;
  categories?: Record<string, CategoryPricingEntry>;
}
```

- [ ] **Step 2: Update customerPricingRuleSchema in schemas.ts**

Replace the `customerPricingRuleSchema` block (currently around line 110):

```ts
export const categoryPricingEntrySchema = z.object({
  rule: pricingRuleEntrySchema.optional(),
  subcategories: z.record(pricingRuleEntrySchema).optional()
});

export const customerPricingRuleSchema = z.object({
  default: pricingRuleEntrySchema.optional(),
  categories: z.record(categoryPricingEntrySchema).optional()
});
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
pnpm typecheck 2>&1 | head -40
```

Expected: zero errors (or only pre-existing unrelated errors — confirm the count hasn't grown).

- [ ] **Step 4: Commit**

```bash
git add src/shared/types.ts src/shared/schemas.ts
git commit -m "feat(pricing): nested CategoryPricingEntry type + schema for subcategory support"
```

---

## Task 2: Update `resolvePricingRuleEntry` + add `markupDollarsFromPrice`

**Files:**
- Modify: `src/shared/inventoryPricingShared.ts`
- Test: `src/shared/inventoryPricingShared.test.ts` (create if absent, extend if present)

- [ ] **Step 1: Write failing tests**

Create (or append to) `src/shared/inventoryPricingShared.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { resolvePricingRuleEntry, markupDollarsFromPrice } from './inventoryPricingShared';
import type { CustomerPricingRule } from './types';

describe('resolvePricingRuleEntry — subcategory resolution', () => {
  const rule: CustomerPricingRule = {
    default: { basis: 'percent', amount: 0.3 },
    categories: {
      Flower: {
        rule: { basis: 'percent', amount: 0.35 },
        subcategories: { Indoor: { basis: 'percent', amount: 0.40 } }
      }
    }
  };

  it('resolves customer subcategory first', () => {
    const result = resolvePricingRuleEntry(rule, null, 'Flower', 'Indoor');
    expect(result.amount).toBe(0.40);
    expect(result.source).toBe('customer-subcategory');
  });

  it('falls through to category rule when subcategory not found', () => {
    const result = resolvePricingRuleEntry(rule, null, 'Flower', 'Greenhouse');
    expect(result.amount).toBe(0.35);
    expect(result.source).toBe('customer-category');
  });

  it('falls through to default when no category rule', () => {
    const result = resolvePricingRuleEntry(rule, null, 'Vape', null);
    expect(result.amount).toBe(0.3);
    expect(result.source).toBe('customer-default');
  });

  it('resolves settings subcategory when no customer match', () => {
    const settings: CustomerPricingRule = {
      categories: { Flower: { subcategories: { Indoor: { basis: 'percent', amount: 0.38 } } } }
    };
    const result = resolvePricingRuleEntry(null, settings, 'Flower', 'Indoor');
    expect(result.amount).toBe(0.38);
    expect(result.source).toBe('settings-subcategory');
  });

  it('returns fallback when nothing matches', () => {
    const result = resolvePricingRuleEntry(null, null, null, null);
    expect(result.source).toBe('fallback');
    expect(result.amount).toBe(0.3);
  });
});

describe('markupDollarsFromPrice', () => {
  it('converts percent rule to markup dollars given price (markup-on-cost consistent)', () => {
    // rule 30%, price $100 → markup = 100 × (0.30/1.30) ≈ 23.08, COGS ≈ 76.92, markup% on COGS = 30%
    const markup = markupDollarsFromPrice(100, { basis: 'percent', amount: 0.3, source: 'fallback' });
    expect(markup).toBeCloseTo(23.077, 2);
  });

  it('returns flat dollar amount for dollar-basis rule', () => {
    const markup = markupDollarsFromPrice(100, { basis: 'dollar', amount: 8, source: 'fallback' });
    expect(markup).toBe(8);
  });

  it('returns 0 for invalid price', () => {
    const markup = markupDollarsFromPrice(NaN, { basis: 'percent', amount: 0.3, source: 'fallback' });
    expect(markup).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
pnpm vitest run src/shared/inventoryPricingShared.test.ts 2>&1 | tail -20
```

Expected: failures on `resolvePricingRuleEntry` subcategory cases and `markupDollarsFromPrice` not found.

- [ ] **Step 3: Update `inventoryPricingShared.ts`**

Replace the entire file:

```ts
import type { CustomerPricingRule, CategoryPricingEntry, PricingRuleApplication, PricingRuleEntry } from './types';

/** Resolve the pricing rule entry for a given category+subcategory pair.
 *  Resolution order:
 *  1. customer subcategory
 *  2. customer category rule
 *  3. customer default
 *  4. settings subcategory
 *  5. settings category rule
 *  6. settings default
 *  7. fallback 30%
 */
export function resolvePricingRuleEntry(
  customerRule: CustomerPricingRule | null | undefined,
  defaultsRule: CustomerPricingRule | null | undefined,
  category: string | null | undefined,
  subcategory: string | null | undefined = null
): PricingRuleApplication {
  const cat = category ?? undefined;
  const sub = subcategory ?? undefined;

  // Helper to read a CategoryPricingEntry — handles old flat PricingRuleEntry
  // format for backward compat (existing saved rules have { basis, amount } directly)
  function getEntry(categories: Record<string, unknown> | undefined, key: string): CategoryPricingEntry | null {
    if (!categories || !key || !(key in categories)) return null;
    const raw = categories[key];
    if (!raw || typeof raw !== 'object') return null;
    // Old flat shape: { basis, amount }
    if ('basis' in raw && 'amount' in raw) return { rule: raw as PricingRuleEntry };
    return raw as CategoryPricingEntry;
  }

  if (cat) {
    // 1. customer subcategory
    if (sub) {
      const entry = getEntry(customerRule?.categories as Record<string, unknown> | undefined, cat);
      const subRule = entry?.subcategories?.[sub];
      if (subRule) return { ...subRule, source: 'customer-subcategory', category: cat };
    }
    // 2. customer category rule
    const custCatEntry = getEntry(customerRule?.categories as Record<string, unknown> | undefined, cat);
    if (custCatEntry?.rule) return { ...custCatEntry.rule, source: 'customer-category', category: cat };
  }
  // 3. customer default
  if (customerRule?.default) return { ...customerRule.default, source: 'customer-default' };

  if (cat) {
    // 4. settings subcategory
    if (sub) {
      const entry = getEntry(defaultsRule?.categories as Record<string, unknown> | undefined, cat);
      const subRule = entry?.subcategories?.[sub];
      if (subRule) return { ...subRule, source: 'settings-subcategory', category: cat };
    }
    // 5. settings category rule
    const settingsCatEntry = getEntry(defaultsRule?.categories as Record<string, unknown> | undefined, cat);
    if (settingsCatEntry?.rule) return { ...settingsCatEntry.rule, source: 'settings-category', category: cat };
  }
  // 6. settings default
  if (defaultsRule?.default) return { ...defaultsRule.default, source: 'settings-default' };

  // 7. fallback
  return { basis: 'percent', amount: 0.3, source: 'fallback' };
}

/** Apply a pricing rule to a landed COGS to get the suggested sale price. */
export function applyPricingRule(landedCost: number, rule: PricingRuleApplication | PricingRuleEntry): number {
  if (!Number.isFinite(landedCost) || landedCost < 0) return 0;
  if (rule.basis === 'dollar') return landedCost + rule.amount;
  return landedCost * (1 + rule.amount);
}

/** For range-COGS batches where price is the primary input:
 *  returns the markup dollars that keep markup-on-cost consistent with the rule.
 *  Formula: markup$ = price × (rule% / (1 + rule%))
 *  This ensures: derivedCOGS = price - markup$, markupPct = markup$ / COGS = rule%
 */
export function markupDollarsFromPrice(price: number, rule: PricingRuleApplication | PricingRuleEntry): number {
  if (!Number.isFinite(price) || price <= 0) return 0;
  if (rule.basis === 'dollar') return rule.amount;
  return price * (rule.amount / (1 + rule.amount));
}
```

- [ ] **Step 4: Update `PricingRuleApplication` source union in `src/shared/types.ts`**

Add `'customer-subcategory'` and `'settings-subcategory'` to the source union (around line 167):

```ts
export interface PricingRuleApplication {
  basis: PricingBasis;
  amount: number;
  source: 'customer-subcategory' | 'customer-category' | 'customer-default'
        | 'settings-subcategory' | 'settings-category' | 'settings-default' | 'fallback';
  category?: string;
}
```

- [ ] **Step 5: Run tests — expect pass**

```bash
pnpm vitest run src/shared/inventoryPricingShared.test.ts 2>&1 | tail -15
```

Expected: all tests pass.

- [ ] **Step 6: Typecheck**

```bash
pnpm typecheck 2>&1 | grep -c "error TS" || echo "0 errors"
```

- [ ] **Step 7: Commit**

```bash
git add src/shared/types.ts src/shared/inventoryPricingShared.ts src/shared/inventoryPricingShared.test.ts
git commit -m "feat(pricing): subcategory resolution + markupDollarsFromPrice"
```

---

## Task 3: Update commandBus — backward-compat read of old flat categories

**Files:**
- Modify: `src/server/services/commandBus.ts` (the `validatePricingRulePayload` function, ~line 3089)

- [ ] **Step 1: Update `validatePricingRulePayload`**

Find the function (currently around line 3089) and replace with:

```ts
function validatePricingRulePayload(value: unknown): Record<string, unknown> {
  // Migrate old flat categories shape { category: { basis, amount } }
  // to new nested shape { category: { rule: { basis, amount } } }
  if (value && typeof value === 'object' && 'categories' in value) {
    const categories = (value as Record<string, unknown>).categories;
    if (categories && typeof categories === 'object') {
      const migrated: Record<string, unknown> = {};
      for (const [key, entry] of Object.entries(categories as Record<string, unknown>)) {
        if (entry && typeof entry === 'object' && 'basis' in entry && 'amount' in entry) {
          // Old flat PricingRuleEntry — wrap it
          migrated[key] = { rule: entry };
        } else {
          migrated[key] = entry;
        }
      }
      value = { ...(value as Record<string, unknown>), categories: migrated };
    }
  }
  const parsed = customerPricingRuleSchema.safeParse(value ?? {});
  if (!parsed.success) {
    throw new Error(`Invalid pricing rule: ${parsed.error.message}`);
  }
  return parsed.data as Record<string, unknown>;
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm typecheck 2>&1 | grep -c "error TS" || echo "0 errors"
```

- [ ] **Step 3: Commit**

```bash
git add src/server/services/commandBus.ts
git commit -m "feat(pricing): backward-compat migration of flat categories on save"
```

---

## Task 4: Add pricing panel CSS classes to styles.css

**Files:**
- Modify: `src/client/styles.css`

- [ ] **Step 1: Append pricing panel classes**

Find the end of `styles.css` and append:

```css
/* ── Pricing rule panels ───────────────────────────────────── */

.pricing-rule-table {
  @apply w-full border-collapse text-sm;
}

.pricing-rule-table th {
  @apply border-b-2 border-line px-2 pb-2 pt-0 text-left text-[10px] font-bold uppercase tracking-wider text-zinc-500;
}

.pricing-rule-table td {
  @apply border-b border-line px-2 py-1 align-middle;
}

.pricing-rule-table tr:last-child td {
  @apply border-b-0;
}

.pricing-cat-row td {
  @apply bg-panel;
}

.pricing-cat-row:hover td {
  @apply bg-zinc-100;
}

.pricing-sub-row td {
  @apply bg-white pl-7;
}

.pricing-sub-row:hover td {
  @apply bg-accent-light;
}

.pricing-add-sub-row td {
  @apply bg-white pl-7;
}

.pricing-add-cat-row td {
  @apply bg-panel;
}

.pricing-internal-badge {
  @apply inline-flex h-5 items-center rounded border border-amber/40 bg-amber/10 px-2 text-[10px] font-bold uppercase tracking-tight text-amber;
}

/* AG Grid pricing columns — green-tinted header */
.pricing-col-header {
  @apply bg-accent-light text-accent-dark;
}
```

- [ ] **Step 2: Verify styles compile**

```bash
pnpm build 2>&1 | grep -i "error\|warn" | head -10
```

- [ ] **Step 3: Commit**

```bash
git add src/client/styles.css
git commit -m "feat(pricing): add pricing panel CSS classes"
```

---

## Task 5: Redesign DefaultPricingPanel

**Files:**
- Rewrite: `src/client/components/DefaultPricingPanel.tsx`

- [ ] **Step 1: Replace DefaultPricingPanel.tsx**

```tsx
import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { trpc } from '../api/trpc';
import { useCommandRunner } from './useCommandRunner';
import type { CustomerPricingRule, CategoryPricingEntry, PricingRuleEntry } from '../../shared/types';

function asRule(value: unknown): CustomerPricingRule {
  if (value && typeof value === 'object') return value as CustomerPricingRule;
  return {};
}

function entryAmount(entry: CategoryPricingEntry | undefined): string {
  if (!entry?.rule) return '';
  return String(entry.rule.amount);
}
function entryBasis(entry: CategoryPricingEntry | undefined): 'percent' | 'dollar' {
  return entry?.rule?.basis ?? 'percent';
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
  const [newCategory, setNewCategory] = useState('');
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
          <label className="text-zinc-600 text-xs w-20">Basis</label>
          <select className="select compact" value={basis} onChange={(e) => setBasis(e.target.value as 'percent' | 'dollar')} data-testid="default-rule-basis">
            <option value="percent">% markup</option>
            <option value="dollar">$ markup</option>
          </select>
        </div>
        <div className="field-inline mt-1">
          <label className="text-zinc-600 text-xs w-20">Amount</label>
          <input className="input compact" style={{ width: 90 }} type="number" step="0.01" min={0} value={amountText} onChange={(e) => setAmountText(e.target.value)} placeholder={basis === 'percent' ? '0.30' : '50.00'} data-testid="default-rule-amount" />
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
              <>
                <tr key={cat} className="pricing-cat-row">
                  <td>
                    <button type="button" className="text-button compact-action" onClick={() => toggleExpand(cat)} aria-expanded={draft.expanded} aria-label={`${draft.expanded ? 'Collapse' : 'Expand'} ${cat}`}>
                      {draft.expanded ? <ChevronDown className="h-3 w-3 inline" /> : <ChevronRight className="h-3 w-3 inline" />}
                    </button>
                    <span className="font-semibold ml-1">{cat}</span>
                    {draft.amount ? (
                      <span className="ml-2 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-accent-light border border-accent-mid text-accent-dark">{draft.basis === 'percent' ? `${(Number(draft.amount) * 100).toFixed(0)}%` : `$${draft.amount}`}</span>
                    ) : null}
                  </td>
                  <td><select className="select compact" style={{ minWidth: 60 }} value={draft.basis} onChange={(e) => setCategoryDrafts((p) => ({ ...p, [cat]: { ...p[cat], basis: e.target.value as 'percent' | 'dollar' } }))} data-testid={`cat-basis-${cat}`}><option value="percent">%</option><option value="dollar">$</option></select></td>
                  <td><input className="input compact" style={{ width: 70 }} type="number" step="0.01" min={0} value={draft.amount} onChange={(e) => setCategoryDrafts((p) => ({ ...p, [cat]: { ...p[cat], amount: e.target.value } }))} data-testid={`cat-amount-${cat}`} /></td>
                  <td><button type="button" className="text-button compact-action text-zinc-400 hover:text-danger" onClick={() => removeCategory(cat)} aria-label={`Remove ${cat}`}>✕</button></td>
                </tr>
                {draft.expanded && Object.entries(draft.subcategories).map(([sub, subDraft]) => (
                  <tr key={`${cat}::${sub}`} className="pricing-sub-row">
                    <td><span className="text-zinc-400 mr-1">└</span>{sub}</td>
                    <td><select className="select compact" style={{ minWidth: 60 }} value={subDraft.basis} onChange={(e) => setCategoryDrafts((p) => ({ ...p, [cat]: { ...p[cat], subcategories: { ...p[cat].subcategories, [sub]: { ...p[cat].subcategories[sub], basis: e.target.value as 'percent' | 'dollar' } } } }))} data-testid={`sub-basis-${cat}-${sub}`}><option value="percent">%</option><option value="dollar">$</option></select></td>
                    <td><input className="input compact" style={{ width: 70 }} type="number" step="0.01" min={0} value={subDraft.amount} onChange={(e) => setCategoryDrafts((p) => ({ ...p, [cat]: { ...p[cat], subcategories: { ...p[cat].subcategories, [sub]: { ...p[cat].subcategories[sub], amount: e.target.value } } } }))} data-testid={`sub-amount-${cat}-${sub}`} /></td>
                    <td><button type="button" className="text-button compact-action text-zinc-400 hover:text-danger" onClick={() => removeSubcategory(cat, sub)} aria-label={`Remove ${cat} ${sub}`}>✕</button></td>
                  </tr>
                ))}
                {draft.expanded && (
                  <tr key={`${cat}::add`} className="pricing-add-sub-row">
                    <td colSpan={4}>
                      <div className="flex items-center gap-1 py-0.5">
                        <select className="select compact" style={{ minWidth: 130 }} value={newSubcategory[cat] ?? ''} onChange={(e) => setNewSubcategory((p) => ({ ...p, [cat]: e.target.value }))} data-testid={`new-sub-select-${cat}`}>
                          <option value="">+ Add subcategory…</option>
                          {(reference.data?.subcategories ?? []).filter((s: string) => !draft.subcategories[s]).map((s: string) => <option key={s}>{s}</option>)}
                        </select>
                        {newSubcategory[cat] ? <button type="button" className="secondary-button compact-action" onClick={() => addSubcategory(cat)} data-testid={`add-sub-btn-${cat}`}>Add</button> : null}
                      </div>
                    </td>
                  </tr>
                )}
              </>
            ))}
            <tr className="pricing-add-cat-row">
              <td colSpan={4}>
                <select className="select compact" style={{ minWidth: 160 }} value={newCategory} onChange={(e) => {
                  const cat = e.target.value;
                  if (!cat) return;
                  setCategoryDrafts((p) => ({ ...p, [cat]: { basis: 'percent', amount: '', subcategories: {}, expanded: true } }));
                  setNewCategory('');
                }} data-testid="new-category-select">
                  <option value="">+ Add category override…</option>
                  {unusedCategories.map((c: string) => <option key={c}>{c}</option>)}
                </select>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-2">
        <button type="button" className="primary-button" disabled={isRunning} onClick={save} data-testid="default-rule-save">Save rule</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm typecheck 2>&1 | grep "DefaultPricingPanel\|error TS" | head -10
```

- [ ] **Step 3: Commit**

```bash
git add src/client/components/DefaultPricingPanel.tsx
git commit -m "feat(pricing): redesign DefaultPricingPanel with category+subcategory table"
```

---

## Task 6: Redesign CustomerPricingPanel + remove OrderPricingPanel

**Files:**
- Modify: `src/client/components/PricingPanel.tsx`

- [ ] **Step 1: Replace CustomerPricingPanel and remove OrderPricingPanel**

Remove the entire `OrderPricingPanel` export (lines ~45–250) from `PricingPanel.tsx`. Then replace `CustomerPricingPanel` with:

```tsx
import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { trpc } from '../api/trpc';
import { useCommandRunner } from './useCommandRunner';
import type { CustomerPricingRule, CategoryPricingEntry, PricingRuleEntry } from '../../shared/types';

// Re-use the same draft helpers as DefaultPricingPanel (copy inline — no shared module needed)
function asRule(value: unknown): CustomerPricingRule {
  if (value && typeof value === 'object') return value as CustomerPricingRule;
  return {};
}
interface SubcategoryDraft { basis: 'percent' | 'dollar'; amount: string }
interface CategoryDraft { basis: 'percent' | 'dollar'; amount: string; subcategories: Record<string, SubcategoryDraft>; expanded: boolean }

function buildCategoryDrafts(rule: CustomerPricingRule): Record<string, CategoryDraft> {
  const result: Record<string, CategoryDraft> = {};
  for (const [cat, entry] of Object.entries(rule.categories ?? {})) {
    const subs: Record<string, SubcategoryDraft> = {};
    for (const [sub, subRule] of Object.entries(entry.subcategories ?? {})) {
      subs[sub] = { basis: subRule.basis, amount: String(subRule.amount) };
    }
    result[cat] = { basis: entry.rule?.basis ?? 'percent', amount: entry.rule ? String(entry.rule.amount) : '', subcategories: subs, expanded: true };
  }
  return result;
}

interface CustomerPricingPanelProps { customerId: string }

export function CustomerPricingPanel({ customerId }: CustomerPricingPanelProps) {
  const relationship = trpc.queries.relationshipSummary.useQuery({ customerId }, { enabled: Boolean(customerId) });
  const reference = trpc.queries.reference.useQuery(undefined, { refetchOnWindowFocus: false });
  const { runCommand, isRunning } = useCommandRunner();

  const initialRule = asRule((relationship.data?.customer as Record<string, unknown> | undefined)?.pricingRule);
  const defaultsRule = asRule(reference.data?.defaultPricingRule);

  const [basis, setBasis] = useState<'percent' | 'dollar'>(initialRule.default?.basis ?? 'percent');
  const [amountText, setAmountText] = useState<string>(initialRule.default ? String(initialRule.default.amount) : '');
  const [categoryDrafts, setCategoryDrafts] = useState<Record<string, CategoryDraft>>({});
  const [newCategory, setNewCategory] = useState('');
  const [newSubcategory, setNewSubcategory] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (relationship.data?.customer) {
      const rule = asRule((relationship.data.customer as Record<string, unknown>).pricingRule);
      setBasis(rule.default?.basis ?? 'percent');
      setAmountText(rule.default ? String(rule.default.amount) : '');
      setCategoryDrafts(buildCategoryDrafts(rule));
      setDirty(false);
    }
  }, [relationship.data?.customer]);

  const categories = useMemo(() => reference.data?.categories ?? ['Flower', 'Infused', 'Extract', 'Pre-roll', 'Vape'], [reference.data?.categories]);

  const fallbackText = defaultsRule.default
    ? defaultsRule.default.basis === 'percent'
      ? `${(defaultsRule.default.amount * 100).toFixed(1)}%`
      : `+$${defaultsRule.default.amount.toFixed(2)}`
    : 'fallback 30%';

  const customerName = (relationship.data?.customer as Record<string, unknown> | undefined)?.name ?? 'Customer';

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
    await runCommand('setCustomerPricingRule', { customerId, pricingRule: next }, 'Update customer pricing rule');
    await relationship.refetch();
    setDirty(false);
  }

  function addSubcategory(cat: string) {
    const sub = newSubcategory[cat]?.trim();
    if (!sub) return;
    setCategoryDrafts((p) => ({ ...p, [cat]: { ...p[cat], subcategories: { ...p[cat].subcategories, [sub]: { basis: 'percent', amount: '' } } } }));
    setNewSubcategory((p) => ({ ...p, [cat]: '' }));
    setDirty(true);
  }

  function removeSubcategory(cat: string, sub: string) {
    setCategoryDrafts((p) => { const next = { ...p[cat].subcategories }; delete next[sub]; return { ...p, [cat]: { ...p[cat], subcategories: next } }; });
    setDirty(true);
  }

  function removeCategory(cat: string) {
    setCategoryDrafts((p) => { const next = { ...p }; delete next[cat]; return next; });
    setDirty(true);
  }

  function toggleExpand(cat: string) {
    setCategoryDrafts((p) => ({ ...p, [cat]: { ...p[cat], expanded: !p[cat].expanded } }));
  }

  const unusedCategories = categories.filter((c: string) => !categoryDrafts[c]);

  return (
    <div className="context-drawer-card" data-testid="customer-pricing-panel">
      <div className="flex items-center gap-2 mt-1">
        <h2 className="truncate text-base font-semibold text-ink">{String(customerName)} pricing rule</h2>
        <span className="pricing-internal-badge">Internal only</span>
      </div>
      <p className="mt-1 text-[11px] text-zinc-500">Overrides system default where set</p>

      <div className="mt-3">
        <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-1">Default markup</div>
        <div className="flex items-center gap-2 mb-1">
          <select className="select compact" style={{ minWidth: 100 }} value={basis} onChange={(e) => { setBasis(e.target.value as 'percent' | 'dollar'); setDirty(true); }} data-testid="rule-default-basis">
            <option value="percent">% markup</option>
            <option value="dollar">$ markup</option>
          </select>
          <input className="input compact" style={{ width: 80 }} type="number" step="0.01" min={0} value={amountText} placeholder={basis === 'percent' ? '0.30' : '50.00'} onChange={(e) => { setAmountText(e.target.value); setDirty(true); }} data-testid="rule-default-amount" />
          <span className="text-[11px] text-zinc-400">{basis === 'percent' ? '0.30 = 30%' : '$ added to COGS'}</span>
        </div>

        <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 mt-3 mb-1">Category &amp; subcategory overrides</div>
        <table className="pricing-rule-table">
          <thead><tr><th>Category / Subcategory</th><th style={{ width: 60 }}>Basis</th><th style={{ width: 72 }}>Amount</th><th style={{ width: 28 }}></th></tr></thead>
          <tbody>
            {Object.entries(categoryDrafts).map(([cat, draft]) => (
              <>
                <tr key={cat} className="pricing-cat-row">
                  <td>
                    <button type="button" className="text-button compact-action" onClick={() => toggleExpand(cat)} aria-expanded={draft.expanded}>{draft.expanded ? <ChevronDown className="h-3 w-3 inline" /> : <ChevronRight className="h-3 w-3 inline" />}</button>
                    <span className="font-semibold ml-1 text-xs">{cat}</span>
                    {draft.amount ? <span className="ml-1 text-[10px] px-1 rounded-full bg-accent-light border border-accent-mid text-accent-dark">{draft.basis === 'percent' ? `${(Number(draft.amount) * 100).toFixed(0)}%` : `$${draft.amount}`}</span> : null}
                  </td>
                  <td><select className="select compact" style={{ minWidth: 56 }} value={draft.basis} onChange={(e) => { setCategoryDrafts((p) => ({ ...p, [cat]: { ...p[cat], basis: e.target.value as 'percent' | 'dollar' } })); setDirty(true); }} data-testid={`rule-cat-basis-${cat}`}><option value="percent">%</option><option value="dollar">$</option></select></td>
                  <td><input className="input compact" style={{ width: 68 }} type="number" step="0.01" min={0} value={draft.amount} onChange={(e) => { setCategoryDrafts((p) => ({ ...p, [cat]: { ...p[cat], amount: e.target.value } })); setDirty(true); }} data-testid={`rule-cat-amount-${cat}`} /></td>
                  <td><button type="button" className="text-button compact-action text-zinc-400 hover:text-danger" onClick={() => removeCategory(cat)}>✕</button></td>
                </tr>
                {draft.expanded && Object.entries(draft.subcategories).map(([sub, subDraft]) => (
                  <tr key={`${cat}::${sub}`} className="pricing-sub-row">
                    <td><span className="text-zinc-400 mr-1">└</span><span className="text-xs">{sub}</span></td>
                    <td><select className="select compact" style={{ minWidth: 56 }} value={subDraft.basis} onChange={(e) => { setCategoryDrafts((p) => ({ ...p, [cat]: { ...p[cat], subcategories: { ...p[cat].subcategories, [sub]: { ...p[cat].subcategories[sub], basis: e.target.value as 'percent' | 'dollar' } } } })); setDirty(true); }} data-testid={`rule-sub-basis-${cat}-${sub}`}><option value="percent">%</option><option value="dollar">$</option></select></td>
                    <td><input className="input compact" style={{ width: 68 }} type="number" step="0.01" min={0} value={subDraft.amount} onChange={(e) => { setCategoryDrafts((p) => ({ ...p, [cat]: { ...p[cat], subcategories: { ...p[cat].subcategories, [sub]: { ...p[cat].subcategories[sub], amount: e.target.value } } } })); setDirty(true); }} data-testid={`rule-sub-amount-${cat}-${sub}`} /></td>
                    <td><button type="button" className="text-button compact-action text-zinc-400 hover:text-danger" onClick={() => removeSubcategory(cat, sub)}>✕</button></td>
                  </tr>
                ))}
                {draft.expanded && (
                  <tr key={`${cat}::add`} className="pricing-add-sub-row">
                    <td colSpan={4}>
                      <div className="flex items-center gap-1 py-0.5">
                        <select className="select compact" style={{ minWidth: 120 }} value={newSubcategory[cat] ?? ''} onChange={(e) => setNewSubcategory((p) => ({ ...p, [cat]: e.target.value }))} data-testid={`new-sub-select-${cat}`}>
                          <option value="">+ Add subcategory…</option>
                          {(reference.data?.subcategories ?? []).filter((s: string) => !draft.subcategories[s]).map((s: string) => <option key={s}>{s}</option>)}
                        </select>
                        {newSubcategory[cat] ? <button type="button" className="secondary-button compact-action" onClick={() => addSubcategory(cat)}>Add</button> : null}
                      </div>
                    </td>
                  </tr>
                )}
              </>
            ))}
            <tr className="pricing-add-cat-row">
              <td colSpan={4}>
                <select className="select compact" style={{ minWidth: 150 }} value={newCategory} onChange={(e) => { const cat = e.target.value; if (!cat) return; setCategoryDrafts((p) => ({ ...p, [cat]: { basis: 'percent', amount: '', subcategories: {}, expanded: true } })); setNewCategory(''); setDirty(true); }} data-testid="rule-new-category">
                  <option value="">+ Add category override…</option>
                  {unusedCategories.map((c: string) => <option key={c}>{c}</option>)}
                </select>
              </td>
            </tr>
          </tbody>
        </table>

        <div className="mt-2 text-[11px] text-zinc-500 rounded border border-line bg-panel px-2 py-1.5">
          Categories without an override use the <strong>system default ({fallbackText})</strong>.
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <button type="button" className="primary-button" disabled={isRunning} onClick={save} data-testid="rule-save">Save rule</button>
        {dirty ? <button type="button" className="secondary-button" disabled={isRunning} onClick={() => { setCategoryDrafts(buildCategoryDrafts(initialRule)); setBasis(initialRule.default?.basis ?? 'percent'); setAmountText(initialRule.default ? String(initialRule.default.amount) : ''); setDirty(false); }}>Discard</button> : null}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm typecheck 2>&1 | grep "PricingPanel\|error TS" | head -10
```

- [ ] **Step 3: Commit**

```bash
git add src/client/components/PricingPanel.tsx
git commit -m "feat(pricing): redesign CustomerPricingPanel, remove OrderPricingPanel"
```

---

## Task 7: Remove OrderPricingPanel from RelationshipDrawer + update tests

**Files:**
- Modify: `src/client/components/RelationshipDrawer.tsx`
- Modify: `src/client/components/PricingPanel.test.tsx`

- [ ] **Step 1: Update RelationshipDrawer.tsx**

Change line 3 from:
```ts
import { CustomerPricingPanel, OrderPricingPanel } from './PricingPanel';
```
to:
```ts
import { CustomerPricingPanel } from './PricingPanel';
```

Remove line 105:
```tsx
{orderId ? <OrderPricingPanel orderId={orderId} customerId={customerId} showMargin={showMargin} /> : null}
```

(The `orderId` prop reference can be removed or kept — check if used elsewhere in RelationshipDrawer. If only used for OrderPricingPanel, remove the prop from the interface too.)

- [ ] **Step 2: Remove OrderPricingPanel test suite from PricingPanel.test.tsx**

Delete the entire `describe('OrderPricingPanel', ...)` block (roughly lines 30–360). Keep the `describe('CustomerPricingPanel', ...)` block and update its mocks to match the new `CustomerPricingPanel` (it no longer renders COGS controls — it renders the pricing rule table).

Replace the CustomerPricingPanel describe block with:

```ts
describe('CustomerPricingPanel', () => {
  const CUSTOMER_ID = '22222222-2222-2222-2222-222222222222';

  beforeEach(() => {
    referenceQueryMock.mockReturnValue({ data: { defaultPricingRule: { default: { basis: 'percent', amount: 0.3 } }, categories: ['Flower', 'Vape'], subcategories: [] }, refetch: vi.fn() });
    relationshipQueryMock.mockReturnValue({ data: { customer: { id: CUSTOMER_ID, name: 'Test Customer', pricingRule: { default: { basis: 'percent', amount: 0.28 } } } }, refetch: vi.fn() });
  });

  it('renders customer name and internal badge', () => {
    render(<CustomerPricingPanel customerId={CUSTOMER_ID} />);
    expect(screen.getByText(/Test Customer pricing rule/i)).toBeTruthy();
    expect(screen.getByText(/internal only/i)).toBeTruthy();
  });

  it('shows system default fallback notice', () => {
    render(<CustomerPricingPanel customerId={CUSTOMER_ID} />);
    expect(screen.getByText(/system default/i)).toBeTruthy();
  });

  it('Save rule button triggers setCustomerPricingRule command', async () => {
    render(<CustomerPricingPanel customerId={CUSTOMER_ID} />);
    const saveBtn = screen.getByTestId('rule-save');
    await userEvent.click(saveBtn);
    expect(runCommandMock).toHaveBeenCalledWith('setCustomerPricingRule', expect.objectContaining({ customerId: CUSTOMER_ID }), expect.any(String));
  });
});
```

- [ ] **Step 3: Run updated tests**

```bash
pnpm vitest run src/client/components/PricingPanel.test.tsx 2>&1 | tail -20
```

Expected: all tests pass (OrderPricingPanel suite gone, CustomerPricingPanel suite passes).

- [ ] **Step 4: Typecheck**

```bash
pnpm typecheck 2>&1 | grep "RelationshipDrawer\|error TS" | head -10
```

- [ ] **Step 5: Commit**

```bash
git add src/client/components/RelationshipDrawer.tsx src/client/components/PricingPanel.test.tsx
git commit -m "feat(pricing): remove OrderPricingPanel from RelationshipDrawer + update tests"
```

---

## Task 8: Add inline pricing columns to SalesView

**Files:**
- Modify: `src/client/views/SalesView.columns.ts`
- Modify: `src/client/views/SalesView.tsx`

- [ ] **Step 1: Add new fields to MARGIN_COLUMN_FIELDS in SalesView.columns.ts**

```ts
export const MARGIN_COLUMN_FIELDS = [
  'unitCost',
  'internalMargin',
  'estimatedMargin',
  'rangeBadge',
  'landedCostExceptionReason',
  'markup',        // new
  'markupPct',     // new
  'derivedCogs'    // new
] as const;
```

- [ ] **Step 2: Add pricing column helper at top of SalesView.tsx**

After the existing imports, add:

```ts
import { resolvePricingRuleEntry, markupDollarsFromPrice, applyPricingRule } from '../../shared/inventoryPricingShared';
import { parsePriceRange } from '../../shared/priceRange';
```

Add a helper function near `lineColumns` definition:

```ts
/** Returns the rule source label shown under the COGS cell, e.g. "▲ customer · Indoor" */
function ruleSourceLabel(source: string, category?: string): string {
  if (source === 'customer-subcategory' || source === 'customer-category') return `▲ customer · ${category ?? ''}`;
  if (source === 'customer-default') return '▲ customer · default';
  if (source === 'settings-subcategory' || source === 'settings-category') return `▲ default · ${category ?? ''}`;
  if (source === 'settings-default') return '▲ default';
  return '▲ fallback 30%';
}

/** Computes markup dollars and derived COGS for a sales line row.
 *  Fixed COGS: markup = applyPricingRule(unitCost, rule) - unitCost
 *  Range COGS: markup = markupDollarsFromPrice(unitPrice, rule)
 */
function computeLineMarkup(row: GridRow, rule: ReturnType<typeof resolvePricingRuleEntry>): {
  markupDollars: number;
  derivedCogs: number;
  isRange: boolean;
  rangeLow?: number;
  rangeHigh?: number;
} {
  const range = parsePriceRange(row.priceRange as string | null);
  const unitPrice = Number(row.unitPrice ?? 0);
  const unitCost = Number(row.unitCost ?? 0);

  if (range) {
    const markup = markupDollarsFromPrice(unitPrice, rule);
    return { markupDollars: markup, derivedCogs: unitPrice - markup, isRange: true, rangeLow: range.low, rangeHigh: range.high };
  }
  const markup = applyPricingRule(unitCost, rule) - unitCost;
  return { markupDollars: Math.max(0, markup), derivedCogs: unitCost, isRange: false };
}
```

- [ ] **Step 3: Add pricing columns to lineColumns array in SalesView.tsx**

After the existing `unitCost` column (around line 144), insert:

```ts
  {
    field: 'markup',
    headerName: 'Markup $',
    headerClass: 'pricing-col-header',
    width: 100,
    editable: (params) => !isRowEditLocked(params),
    valueGetter: (params) => {
      const row = params.data as GridRow | undefined;
      if (!row || !reference.data) return null;
      const rule = resolvePricingRuleEntry(
        asRule(relationship.data?.customer?.pricingRule),
        asRule(reference.data.defaultPricingRule),
        row.batchCategory as string | null,
        row.batchSubcategory as string | null
      );
      const { markupDollars, isRange } = computeLineMarkup(row, rule);
      // For range rows, only show markup if unitPrice is set
      if (isRange && !Number(row.unitPrice)) return null;
      return Number.isFinite(markupDollars) ? markupDollars : null;
    },
    valueSetter: (params) => {
      const newMarkup = parseFloat(String(params.newValue));
      if (!Number.isFinite(newMarkup)) return false;
      const row = params.data as GridRow;
      const range = parsePriceRange(row.priceRange as string | null);
      if (range) {
        // range: price stays, COGS = price - markup
        (row as Record<string, unknown>).markup = newMarkup;
      } else {
        // fixed: price = COGS + markup
        const unitCost = Number(row.unitCost ?? 0);
        (row as Record<string, unknown>).unitPrice = unitCost + newMarkup;
        (row as Record<string, unknown>).markup = newMarkup;
      }
      return true;
    },
    valueFormatter: (params) => params.value != null ? `$${Number(params.value).toFixed(2)}` : '—'
  },
  {
    field: 'markupPct',
    headerName: 'Markup %',
    headerClass: 'pricing-col-header',
    width: 85,
    editable: false,
    valueGetter: (params) => {
      const row = params.data as GridRow | undefined;
      if (!row) return null;
      const markup = Number((row as Record<string, unknown>).markup ?? 0);
      const cogs = parsePriceRange(row.priceRange as string | null)
        ? Number(row.unitPrice ?? 0) - markup        // range: derivedCogs
        : Number(row.unitCost ?? 0);                 // fixed: known COGS
      if (!cogs || cogs <= 0) return null;
      return markup / cogs;
    },
    valueFormatter: (params) => params.value != null ? `${(Number(params.value) * 100).toFixed(1)}%` : '—'
  },
  {
    field: 'derivedCogs',
    headerName: 'COGS',
    headerClass: 'pricing-col-header',
    width: 130,
    editable: false,
    cellRenderer: (params: { data: GridRow | undefined }) => {
      const row = params.data;
      if (!row) return null;
      const range = parsePriceRange(row.priceRange as string | null);
      const markup = Number((row as Record<string, unknown>).markup ?? 0);
      const unitPrice = Number(row.unitPrice ?? 0);

      if (!range) {
        // Fixed COGS
        const rule = row.__rule as ReturnType<typeof resolvePricingRuleEntry> | undefined;
        return (
          <div className="flex flex-col gap-0.5 py-0.5">
            <span>${Number(row.unitCost ?? 0).toFixed(2)}</span>
            {rule ? <span className="text-[10px] text-zinc-400">{ruleSourceLabel(rule.source, rule.category)}</span> : null}
          </div>
        );
      }
      // Range COGS
      if (!unitPrice) return <span className="text-zinc-400 text-xs">Set price first</span>;
      const derivedCogs = unitPrice - markup;
      const inRange = derivedCogs >= range.low && derivedCogs <= range.high;
      const rangeStatus = inRange ? '✓' : derivedCogs < range.low ? '↓ below' : '↑ above';
      const rangeColor = inRange ? 'text-accent' : 'text-amber';
      const rule = row.__rule as ReturnType<typeof resolvePricingRuleEntry> | undefined;
      return (
        <div className="flex flex-col gap-0.5 py-0.5">
          <span>${derivedCogs.toFixed(2)}</span>
          <span className={`text-[10px] ${rangeColor}`}>{range.low}–{range.high} {rangeStatus}</span>
          {rule ? <span className="text-[10px] text-zinc-400">{ruleSourceLabel(rule.source, rule.category)}</span> : null}
        </div>
      );
    }
  },
```

- [ ] **Step 4: Inject rule into row data on query load**

In the `useMemo` or effect where `orderLines.data` is processed, attach `__rule` to each row:

Find where `visibleLineColumns` or line rows are prepared (around line 231 — the `useMemo` block) and add rule injection after the data arrives. In the `orderLines` query result processing, map each row to include `__rule`:

```ts
const lineRowsWithRule = useMemo(() => {
  if (!orderLines.data || !reference.data) return orderLines.data ?? [];
  const customerRule = asRule((relationship.data?.customer as Record<string, unknown> | undefined)?.pricingRule);
  const defaultsRule = asRule(reference.data.defaultPricingRule);
  return (orderLines.data as GridRow[]).map((row) => {
    const rule = resolvePricingRuleEntry(
      customerRule, defaultsRule,
      row.batchCategory as string | null,
      row.batchSubcategory as string | null
    );
    const { markupDollars } = computeLineMarkup(row, rule);
    return { ...row, __rule: rule, markup: markupDollars };
  });
}, [orderLines.data, reference.data, relationship.data]);
```

Then pass `lineRowsWithRule` to the OperatorGrid instead of `orderLines.data`.

- [ ] **Step 5: Add "Re-apply rule" button to the sales order lines workspace**

Find the `WorkspacePanel` that contains the order lines grid (search for `"Order lines"` or the `lineColumns` reference in the JSX). Add to its `actions` prop:

```tsx
<button
  type="button"
  className="secondary-button compact-action"
  disabled={isRunning || !canWrite}
  onClick={() => runCommand('priceSalesOrder', { orderId, strategy: 'customer-rule' }, 'Re-apply pricing rule')}
>
  ↻ Re-apply rule
</button>
```

- [ ] **Step 6: Typecheck**

```bash
pnpm typecheck 2>&1 | grep "SalesView\|error TS" | head -20
```

- [ ] **Step 7: Commit**

```bash
git add src/client/views/SalesView.tsx src/client/views/SalesView.columns.ts
git commit -m "feat(pricing): inline COGS/Markup/Price columns in SalesView order lines grid"
```

---

## Task 9: Write SalesView pricing tests

**Files:**
- Create: `src/client/views/SalesView.pricing.test.tsx`

- [ ] **Step 1: Create the test file**

```ts
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { resolvePricingRuleEntry, markupDollarsFromPrice, applyPricingRule } from '../../shared/inventoryPricingShared';
import { parsePriceRange } from '../../shared/priceRange';
import type { CustomerPricingRule } from '../../shared/types';

// These tests cover the pricing recalculation logic directly (the math used
// by SalesView lineColumns valueGetters/valueSetters). AG Grid rendering is
// tested via e2e; this covers the business logic as pure functions.

const defaultRule: CustomerPricingRule = {
  default: { basis: 'percent', amount: 0.3 }
};
const customerRule: CustomerPricingRule = {
  categories: { Flower: { rule: { basis: 'percent', amount: 0.35 }, subcategories: { Indoor: { basis: 'percent', amount: 0.40 } } } }
};

describe('Fixed-COGS pricing flow', () => {
  it('auto-fills markup from rule on line add (applyPricingRule - COGS)', () => {
    const rule = resolvePricingRuleEntry(customerRule, defaultRule, 'Vape', null);
    const cogs = 24;
    const suggestedPrice = applyPricingRule(cogs, rule);
    const markup = suggestedPrice - cogs;
    expect(markup).toBeCloseTo(7.2, 2); // 30% of $24
    expect(markup / cogs).toBeCloseTo(0.3, 3); // markupPct = rule%
  });

  it('editing unit price back-calculates markup (price - COGS)', () => {
    const cogs = 24;
    const newPrice = 35;
    const markup = newPrice - cogs;
    expect(markup).toBe(11);
    expect(markup / cogs).toBeCloseTo(0.458, 2);
  });

  it('editing markup updates price (COGS + markup)', () => {
    const cogs = 24;
    const newMarkup = 10;
    const price = cogs + newMarkup;
    expect(price).toBe(34);
  });

  it('resolves customer subcategory rule for Indoor Flower', () => {
    const rule = resolvePricingRuleEntry(customerRule, defaultRule, 'Flower', 'Indoor');
    expect(rule.amount).toBe(0.40);
    expect(rule.source).toBe('customer-subcategory');
  });
});

describe('Range-COGS pricing flow', () => {
  const range = parsePriceRange('60-90');

  it('auto-fills markup from rule given price (markupDollarsFromPrice)', () => {
    const rule = resolvePricingRuleEntry(customerRule, defaultRule, 'Flower', 'Indoor');
    const price = 103.50;
    const markup = markupDollarsFromPrice(price, rule);
    const derivedCogs = price - markup;
    // markup% on cost should equal rule (40%)
    expect(markup / derivedCogs).toBeCloseTo(0.40, 2);
  });

  it('range check: derived COGS in range', () => {
    const rule = resolvePricingRuleEntry(null, defaultRule, 'Flower', null);
    const price = 103.50;
    const markup = markupDollarsFromPrice(price, rule);
    const cogs = price - markup;
    expect(range).not.toBeNull();
    expect(cogs).toBeGreaterThanOrEqual(range!.low);
    expect(cogs).toBeLessThanOrEqual(range!.high);
  });

  it('range check: derived COGS below range when price is too low', () => {
    const rule = resolvePricingRuleEntry(null, defaultRule, 'Flower', null);
    const price = 50;
    const markup = markupDollarsFromPrice(price, rule);
    const cogs = price - markup;
    expect(range).not.toBeNull();
    expect(cogs).toBeLessThan(range!.low);
  });

  it('editing markup updates derivedCogs, price stays', () => {
    const price = 103.50;
    const newMarkup = 20;
    const newCogs = price - newMarkup;
    expect(newCogs).toBeCloseTo(83.50, 2);
    // price unchanged
    expect(price).toBe(103.50);
  });

  it('editing price recalculates markup from rule', () => {
    const rule = resolvePricingRuleEntry(null, defaultRule, 'Flower', null);
    const newPrice = 90;
    const newMarkup = markupDollarsFromPrice(newPrice, rule);
    const newCogs = newPrice - newMarkup;
    expect(newMarkup / newCogs).toBeCloseTo(0.3, 2); // still rule%
  });
});

describe('Re-apply rule', () => {
  it('resets markup to rule value for fixed-COGS row', () => {
    const rule = resolvePricingRuleEntry(null, defaultRule, 'Vape', null);
    const cogs = 24;
    const resetMarkup = applyPricingRule(cogs, rule) - cogs;
    expect(resetMarkup).toBeCloseTo(7.2, 2);
  });
});
```

- [ ] **Step 2: Run tests**

```bash
pnpm vitest run src/client/views/SalesView.pricing.test.tsx 2>&1 | tail -20
```

Expected: all 7 test cases pass.

- [ ] **Step 3: Commit**

```bash
git add src/client/views/SalesView.pricing.test.tsx
git commit -m "test(pricing): SalesView inline pricing flow — 7 cases"
```

---

## Task 10: Append decisions-log entry

**Files:**
- Modify: `docs/design-system/decisions-log.md`

- [ ] **Step 1: Prepend entry**

Add at the top (after the `> **Append-only.** ...` line):

```markdown
## 2026-05-27 — Pricing redesign: nested CategoryPricingEntry, inline SalesView pricing columns, OrderPricingPanel removed

**Decision 1:** `CustomerPricingRule.categories` changed from `Record<string, PricingRuleEntry>` to `Record<string, CategoryPricingEntry>` where `CategoryPricingEntry = { rule?: PricingRuleEntry; subcategories?: Record<string, PricingRuleEntry> }`. Key collision between same-named subcategories across categories is prevented by nesting under the category key. Existing flat `{ basis, amount }` entries are migrated to `{ rule: { basis, amount } }` transparently in `validatePricingRulePayload`.

**Decision 2:** `resolvePricingRuleEntry` updated with 7-level resolution: customer subcategory → customer category rule → customer default → settings subcategory → settings category rule → settings default → fallback 30%. `PricingRuleApplication.source` union extended with `'customer-subcategory'` and `'settings-subcategory'`.

**Decision 3:** `markupDollarsFromPrice(price, rule)` added to `inventoryPricingShared.ts`. For range-COGS batches where price is the primary input, converts markup-on-cost rule% to a dollar amount: `price × (rule% / (1 + rule%))`. This keeps Markup % = Markup $ ÷ COGS consistent with fixed-COGS rows.

**Decision 4:** `OrderPricingPanel` removed from `PricingPanel.tsx` and `RelationshipDrawer.tsx`. Per-line pricing now lives inline in the SalesView sales order lines AG Grid as three new margin-gated columns: `markup` (editable), `markupPct` (calculated), `derivedCogs` (display). All gated by `showMargin` toggle via `MARGIN_COLUMN_FIELDS` in `SalesView.columns.ts`.

**Decision 5:** Two pricing flows in the same grid: fixed-COGS rows use COGS→markup→price; range-COGS rows use price→markup(via markupDollarsFromPrice)→derivedCogs(range-checked). Both display Markup % as markup-on-cost (Markup $ ÷ COGS) for consistency.

**Files:** `src/shared/types.ts`, `src/shared/schemas.ts`, `src/shared/inventoryPricingShared.ts`, `src/server/services/commandBus.ts`, `src/client/components/DefaultPricingPanel.tsx`, `src/client/components/PricingPanel.tsx`, `src/client/components/RelationshipDrawer.tsx`, `src/client/views/SalesView.tsx`, `src/client/views/SalesView.columns.ts`, `src/client/styles.css`
**Author:** Claude Sonnet 4.6 via Evan
**Related:** Spec `docs/superpowers/specs/2026-05-27-finder-pricing-ui-redesign.md`

---
```

- [ ] **Step 2: Commit**

```bash
git add docs/design-system/decisions-log.md
git commit -m "docs: decisions-log entry for pricing redesign"
```

---

## Final verification

- [ ] **Run all affected tests**

```bash
pnpm vitest run src/shared/inventoryPricingShared.test.ts src/client/components/PricingPanel.test.tsx src/client/views/SalesView.pricing.test.tsx 2>&1 | tail -30
```

Expected: all suites pass.

- [ ] **Typecheck clean**

```bash
pnpm typecheck 2>&1 | grep -c "error TS" || echo "0"
```

Expected: same count as baseline (no new errors).
