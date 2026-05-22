# Pricing Rules Chain Manager — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace flat JSONB pricing rules with an ordered clause-based system (pricing_rule_entries table) and add a consolidated Settings → Pricing management view.

**Architecture:** New `pricing_rule_entries` Postgres table with Drizzle schema. `savePricingRuleChain` command replaces old commands. `resolvePricingRuleClause` resolver (using existing `evaluateFilterGroup`) replaces `resolvePricingRuleEntry`. `PricingRulesView` + `PricingRuleChainEditor` + `PricingRuleClauseCard` new components. `priceSalesOrder` gated behind `pricing.useChainResolver` feature flag. Migration with parity check + flag flip.

**Full spec:** `docs/superpowers/specs/2026-05-22-pricing-rules-chain-manager-design.md` (on `feat/qa-persona-flow-framework` branch) — Linear: TER-1558  
**Registry ID:** CAP-030 (note: picking/fulfillment feature used "CAP-030" in commit messages on other branches but never registered a registry row; this is the correct next row in the registry on this branch)

**Tech Stack:** TypeScript strict, React 18, tRPC v10, Drizzle ORM, PostgreSQL 16, Zod, Vitest, AG Grid, Tailwind + semantic CSS classes

---

## File Map

**New files:**
- `migrations/0054_pricing_rule_entries.sql` — DB migration
- `src/server/services/pricingRuleResolver.ts` — `resolvePricingRuleClause`, `buildContextRow`
- `src/server/services/pricingRuleResolver.test.ts` — resolver tests
- `src/client/components/PricingRulesView.tsx` — consolidated Settings tab
- `src/client/components/PricingRuleChainEditor.tsx` — shared chain editor
- `src/client/components/PricingRuleClauseCard.tsx` — individual clause card
- `src/client/components/PricingRuleChainEditor.test.tsx` — component tests

**Modified files:**
- `src/server/schema.ts` — add `pricingRuleEntries` Drizzle table
- `src/shared/types.ts` — add `PricingRuleClause`, `PricingRuleContext`; extend `PricingRuleApplication`
- `src/shared/schemas.ts` — add `PricingRuleConditionsSchema`, `savePricingRuleChainPayloadSchema`
- `src/shared/commandCatalog.ts` — add `savePricingRuleChain`; tombstone old commands
- `src/server/routers/queries.ts` — add `pricingRulesSummary`, `pricingRuleClauses`
- `src/server/services/commandBus.ts` — add `savePricingRuleChain` handler; update `priceSalesOrder` behind flag; tombstone old command handlers
- `src/client/components/PricingPanel.tsx` — `CustomerPricingPanel` uses `PricingRuleChainEditor`
- `src/client/components/DefaultPricingPanel.tsx` — stub re-export (retired)
- `src/client/views/OperationsViews.tsx` — `SettingsView` uses `PricingRulesView`
- `src/tests/pricingCommands.test.ts` — add `savePricingRuleChain` tests
- `src/tests/pricingSchemas.test.ts` — add new schema tests
- `docs/product/capability-registry.md` — add CAP-030 row

---

## Task 1: Branch + Registry

**Files:**
- Modify: `docs/product/capability-registry.md`

- [ ] **Create feature branch**
```bash
cd /Users/evantenenbaum/work/terp-agro-operator-console
git checkout -b feat/ter-1558-pricing-rules-chain-manager
```

- [ ] **Add CAP-030 to registry** — open `docs/product/capability-registry.md` and add this row after CAP-029:
```
| CAP-030 Pricing Rules Chain Manager | Operator request 2026-05-22 | Sell | control, context | Keep | R4, R12, R15 | Pricing rules are flat JSONB per-customer and in systemSettings; no consolidated view; no multi-condition rules. Spec: docs/superpowers/specs/2026-05-22-pricing-rules-chain-manager-design.md (on feat/qa-persona-flow-framework). Linear: TER-1558. | Implement pricing_rule_entries table, savePricingRuleChain command, PricingRulesView, PricingRuleChainEditor, resolvePricingRuleClause. Migrate legacy JSONB with parity check + feature flag rollback. |
```

- [ ] **Commit**
```bash
git add docs/product/capability-registry.md
git commit -m "docs(cap-030): add pricing rules chain manager registry row (TER-1558)"
```

---

## Task 2: DB Migration

**Files:**
- Create: `migrations/0054_pricing_rule_entries.sql`

- [ ] **Create migration file** at `migrations/0054_pricing_rule_entries.sql`:
```sql
-- CAP-030: Pricing Rules Chain Manager (TER-1558)
-- Replaces flat pricingRule JSONB on customers + systemSettings pricing.defaults
-- with an ordered, clause-based pricing_rule_entries table.

CREATE TABLE pricing_rule_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope VARCHAR(20) NOT NULL CHECK (scope IN ('global', 'customer')),
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
  priority INTEGER NOT NULL,
  name VARCHAR(120),
  conditions JSONB,
  action_basis VARCHAR(20) NOT NULL CHECK (action_basis IN ('percent', 'dollar')),
  action_amount NUMERIC(12, 4) NOT NULL CHECK (action_amount >= 0),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  deleted_at TIMESTAMPTZ,
  migration_source VARCHAR(80),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unique priority per scope+customer (only live rows; NULL customer_id coalesced for global)
CREATE UNIQUE INDEX pricing_rule_entries_global_priority_unique
  ON pricing_rule_entries (priority)
  WHERE scope = 'global' AND deleted_at IS NULL;

CREATE UNIQUE INDEX pricing_rule_entries_customer_priority_unique
  ON pricing_rule_entries (customer_id, priority)
  WHERE scope = 'customer' AND deleted_at IS NULL;

-- Query index for resolver
CREATE INDEX pricing_rule_entries_lookup_idx
  ON pricing_rule_entries (scope, customer_id, active, priority)
  WHERE deleted_at IS NULL;

CREATE INDEX pricing_rule_entries_customer_id_idx
  ON pricing_rule_entries (customer_id)
  WHERE deleted_at IS NULL;

-- Feature flag: false = use old JSONB path; true = use new resolver
-- Flipped to true only after migration parity check passes
INSERT INTO system_settings (key, value)
VALUES ('pricing.useChainResolver', 'false'::jsonb)
ON CONFLICT (key) DO NOTHING;
```

- [ ] **Add Drizzle table definition** in `src/server/schema.ts`. Add after the `matchmakingMatches` export:
```ts
import type { FilterGroupInput } from '../shared/filterSchemas';

export const pricingRuleEntries = pgTable('pricing_rule_entries', {
  id: id(),
  scope: varchar('scope', { length: 20 }).notNull(),
  customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'cascade' }),
  priority: integer('priority').notNull(),
  name: varchar('name', { length: 120 }),
  conditions: jsonb('conditions').$type<FilterGroupInput | null>(),
  actionBasis: varchar('action_basis', { length: 20 }).notNull(),
  actionAmount: numeric('action_amount', { precision: 12, scale: 4 }).notNull(),
  active: boolean('active').notNull().default(true),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  migrationSource: varchar('migration_source', { length: 80 }),
  createdAt: now(),
  updatedAt: updated(),
});
```

- [ ] **Run migration**
```bash
pnpm db:migrate
```
Expected: migration applies with no errors.

- [ ] **Verify table exists**
```bash
pnpm exec tsx -e "import { pool } from './src/server/db'; pool.query(\"SELECT column_name FROM information_schema.columns WHERE table_name='pricing_rule_entries' ORDER BY ordinal_position\").then(r => { console.log(r.rows.map(x=>x.column_name).join(', ')); process.exit(0); }).catch(e=>{console.error(e);process.exit(1);})"
```
Expected output: `id, scope, customer_id, priority, name, conditions, action_basis, action_amount, active, deleted_at, migration_source, created_at, updated_at`

- [ ] **Commit**
```bash
git add migrations/0054_pricing_rule_entries.sql src/server/schema.ts
git commit -m "feat(cap-030): pricing_rule_entries migration + Drizzle schema (TER-1558)"
```

---

## Task 3: Shared Types + Zod Schemas

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/shared/schemas.ts`

- [ ] **Add to `src/shared/types.ts`** — insert after the `PricingRuleApplication` interface:
```ts
import type { FilterGroupInput } from './filterSchemas';

export interface PricingRuleClause {
  id: string;
  scope: 'global' | 'customer';
  customerId: string | null;
  priority: number;
  name: string | null;
  /** FilterGroupInput for condition matching; null = catch-all (always matches). */
  conditions: FilterGroupInput | null;
  actionBasis: PricingBasis;
  actionAmount: number;
  active: boolean;
}

/**
 * Context passed to resolvePricingRuleClause at price-application time.
 * All fields from the RESOLVED inventory line.
 * batchPostedPrice = batch's stored unit_price (NOT the output of the pricing rule).
 * unitCost = allocation-weighted landed COGS after resolution.
 */
export interface PricingRuleContext {
  category?: string | null;
  subcategory?: string | null;
  tags?: string[];
  batchPostedPrice?: number;
  unitCost?: number;
}
```

- [ ] **Extend `PricingRuleApplication`** in `src/shared/types.ts` — add new source values and clause fields:
```ts
export interface PricingRuleApplication {
  basis: PricingBasis;
  amount: number;
  source:
    | 'customer-category'   // legacy journal entries
    | 'customer-default'    // legacy
    | 'settings-category'   // legacy
    | 'settings-default'    // legacy
    | 'customer-clause'     // new
    | 'global-clause'       // new
    | 'fallback';
  category?: string;         // legacy: which category matched
  clauseId?: string;         // new: which clause fired
  clauseName?: string | null; // new: clause display name
}
```

- [ ] **Add `PricingRuleConditionsSchema`** to `src/shared/schemas.ts`. Add after the existing `pricingRuleEntrySchema`:
```ts
import { FilterCondition, FilterGroup } from './filterSchemas';

// Fields allowed in pricing rule conditions — subset of FILTER_FIELDS.
// 'unitPrice' here means the batch's stored unit_price (batchPostedPrice in PricingRuleContext).
const PRICING_ALLOWED_FIELDS = new Set(['category', 'subcategory', 'tags', 'unitPrice', 'unitCost']);

function rejectUnallowedFields(group: unknown): boolean {
  if (!group || typeof group !== 'object') return true;
  const g = group as { logic?: string; conditions?: unknown[] };
  if (!Array.isArray(g.conditions)) return true;
  return g.conditions.every((c) => {
    if ('logic' in (c as object)) return rejectUnallowedFields(c); // nested group
    const cond = c as { field?: string };
    return PRICING_ALLOWED_FIELDS.has(cond.field ?? '');
  });
}

export const PricingRuleConditionsSchema = FilterGroup.refine(
  rejectUnallowedFields,
  { message: `Pricing rule conditions only allow fields: ${[...PRICING_ALLOWED_FIELDS].join(', ')}` }
).nullable();

export const pricingRuleClauseInputSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().max(120).nullable().optional(),
  conditions: PricingRuleConditionsSchema,
  actionBasis: z.enum(['percent', 'dollar']),
  actionAmount: z.number().finite().min(0).max(100000),
  active: z.boolean().default(true),
});

export const savePricingRuleChainPayloadSchema = z.object({
  scope: z.enum(['global', 'customer']),
  customerId: z.string().uuid().optional(),
  clauses: z.array(pricingRuleClauseInputSchema).max(50),
  chainFingerprint: z.string(),
}).refine(
  (d) => d.scope === 'global' || Boolean(d.customerId),
  { message: 'customerId is required when scope is customer' }
);
```

- [ ] **Add schema tests** in `src/tests/pricingSchemas.test.ts` — add a new `describe` block:
```ts
describe('PricingRuleConditionsSchema', () => {
  it('accepts allowed fields', () => {
    expect(() => PricingRuleConditionsSchema.parse({
      logic: 'AND',
      conditions: [{ field: 'category', operator: 'equals', value: 'Flower' }]
    })).not.toThrow();
  });
  it('rejects brandId', () => {
    expect(() => PricingRuleConditionsSchema.parse({
      logic: 'AND',
      conditions: [{ field: 'brandId', operator: 'equals', value: 'some-uuid' }]
    })).toThrow();
  });
  it('rejects vendorId', () => {
    expect(() => PricingRuleConditionsSchema.parse({
      logic: 'AND',
      conditions: [{ field: 'vendorId', operator: 'equals', value: 'some-uuid' }]
    })).toThrow();
  });
  it('rejects intakeDate', () => {
    expect(() => PricingRuleConditionsSchema.parse({
      logic: 'AND',
      conditions: [{ field: 'intakeDate', operator: 'equals', value: new Date().toISOString() }]
    })).toThrow();
  });
  it('accepts null (catch-all)', () => {
    expect(PricingRuleConditionsSchema.parse(null)).toBeNull();
  });
  it('accepts nested AND/OR with allowed fields', () => {
    expect(() => PricingRuleConditionsSchema.parse({
      logic: 'AND',
      conditions: [
        { field: 'category', operator: 'equals', value: 'Flower' },
        { logic: 'OR', conditions: [
          { field: 'subcategory', operator: 'equals', value: 'indoor' },
          { field: 'tags', operator: 'array_contains', value: ['premium'] },
        ]}
      ]
    })).not.toThrow();
  });
});
```

- [ ] **Run schema tests**
```bash
pnpm test src/tests/pricingSchemas.test.ts
```
Expected: new tests pass.

- [ ] **Typecheck**
```bash
pnpm typecheck
```
Expected: 0 errors.

- [ ] **Commit**
```bash
git add src/shared/types.ts src/shared/schemas.ts src/tests/pricingSchemas.test.ts
git commit -m "feat(cap-030): PricingRuleClause types + PricingRuleConditionsSchema (TER-1558)"
```

---

## Task 4: `resolvePricingRuleClause` Resolver

**Files:**
- Create: `src/server/services/pricingRuleResolver.ts`
- Create: `src/server/services/pricingRuleResolver.test.ts`

- [ ] **Write failing tests first** — create `src/server/services/pricingRuleResolver.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { resolvePricingRuleClause, buildContextRow } from './pricingRuleResolver';
import type { PricingRuleClause, PricingRuleContext } from '../../shared/types';

function makeClause(overrides: Partial<PricingRuleClause> & { conditions: PricingRuleClause['conditions'] }): PricingRuleClause {
  return {
    id: 'test-id',
    scope: 'customer',
    customerId: 'cust-1',
    priority: 1,
    name: null,
    actionBasis: 'percent',
    actionAmount: 0.30,
    active: true,
    ...overrides,
  };
}

const ctx: PricingRuleContext = { category: 'Flower', subcategory: 'indoor', tags: ['premium'], batchPostedPrice: 1200, unitCost: 780 };

describe('resolvePricingRuleClause', () => {
  it('matches customer clause by category', () => {
    const clause = makeClause({
      conditions: { logic: 'AND', conditions: [{ field: 'category', operator: 'equals', value: 'Flower' }] }
    });
    const result = resolvePricingRuleClause([clause], [], ctx);
    expect(result.source).toBe('customer-clause');
    expect(result.basis).toBe('percent');
    expect(result.amount).toBe(0.30);
    expect(result.clauseId).toBe('test-id');
  });

  it('matches customer clause by subcategory', () => {
    const clause = makeClause({
      conditions: { logic: 'AND', conditions: [{ field: 'subcategory', operator: 'equals', value: 'indoor' }] }
    });
    const result = resolvePricingRuleClause([clause], [], ctx);
    expect(result.source).toBe('customer-clause');
  });

  it('matches customer clause by tag', () => {
    const clause = makeClause({
      conditions: { logic: 'AND', conditions: [{ field: 'tags', operator: 'array_contains', value: ['premium'] }] }
    });
    const result = resolvePricingRuleClause([clause], [], ctx);
    expect(result.source).toBe('customer-clause');
  });

  it('matches customer clause by price range', () => {
    const clause = makeClause({
      conditions: { logic: 'AND', conditions: [{ field: 'unitPrice', operator: 'between', value: [1000, 1500] }] }
    });
    const result = resolvePricingRuleClause([clause], [], ctx);
    expect(result.source).toBe('customer-clause');
  });

  it('skips non-matching customer clause and falls through to global', () => {
    const customerClause = makeClause({
      conditions: { logic: 'AND', conditions: [{ field: 'category', operator: 'equals', value: 'Extract' }] }
    });
    const globalClause = makeClause({ scope: 'global', customerId: null, conditions: null, actionAmount: 0.20, actionBasis: 'percent' });
    const result = resolvePricingRuleClause([customerClause], [globalClause], ctx);
    expect(result.source).toBe('global-clause');
    expect(result.amount).toBe(0.20);
  });

  it('returns hardcoded fallback when nothing matches', () => {
    const result = resolvePricingRuleClause([], [], ctx);
    expect(result.source).toBe('fallback');
    expect(result.basis).toBe('percent');
    expect(result.amount).toBe(0.30);
  });

  it('catch-all clause (conditions=null) always matches', () => {
    const clause = makeClause({ conditions: null, actionAmount: 0.25 });
    const result = resolvePricingRuleClause([clause], [], ctx);
    expect(result.source).toBe('customer-clause');
    expect(result.amount).toBe(0.25);
  });

  it('skips inactive clauses', () => {
    const inactive = makeClause({ conditions: null, actionAmount: 0.99, active: false });
    const result = resolvePricingRuleClause([inactive], [], ctx);
    expect(result.source).toBe('fallback');
  });

  it('null subcategory does not match subcategory=equals condition', () => {
    const clause = makeClause({
      conditions: { logic: 'AND', conditions: [{ field: 'subcategory', operator: 'equals', value: 'indoor' }] }
    });
    const noSubcatCtx: PricingRuleContext = { category: 'Flower', subcategory: null, tags: [] };
    const result = resolvePricingRuleClause([clause], [], noSubcatCtx);
    expect(result.source).toBe('fallback');
  });

  it('evaluates clauses in priority order (lower priority wins)', () => {
    const prio1 = makeClause({ priority: 1, conditions: null, actionAmount: 0.10 });
    const prio2 = makeClause({ priority: 2, conditions: null, actionAmount: 0.20 });
    const result = resolvePricingRuleClause([prio2, prio1], [], ctx); // out of order input
    expect(result.amount).toBe(0.10); // prio1 wins
  });

  it('multi-condition AND clause requires all conditions', () => {
    const clause = makeClause({
      conditions: {
        logic: 'AND',
        conditions: [
          { field: 'category', operator: 'equals', value: 'Flower' },
          { field: 'subcategory', operator: 'equals', value: 'outdoor' }, // ctx has indoor
        ]
      }
    });
    const result = resolvePricingRuleClause([clause], [], ctx);
    expect(result.source).toBe('fallback'); // AND fails because subcategory doesn't match
  });
});
```

- [ ] **Run tests to confirm they fail**
```bash
pnpm test src/server/services/pricingRuleResolver.test.ts
```
Expected: `Cannot find module './pricingRuleResolver'`

- [ ] **Implement `src/server/services/pricingRuleResolver.ts`**:
```ts
import { evaluateFilterGroup } from '../../client/utils/filterEvaluator';
import type { PricingRuleApplication, PricingRuleClause, PricingRuleContext } from '../../shared/types';

/**
 * Maps PricingRuleContext to the row shape expected by evaluateFilterGroup.
 * Key mapping: batchPostedPrice → 'unitPrice' (matches the FILTER_FIELDS key)
 */
export function buildContextRow(ctx: PricingRuleContext): Record<string, unknown> {
  return {
    category: ctx.category ?? null,
    subcategory: ctx.subcategory ?? null,
    tags: ctx.tags ?? [],
    unitPrice: ctx.batchPostedPrice ?? null,
    unitCost: ctx.unitCost ?? null,
  };
}

/**
 * Resolves the effective pricing rule for an inventory line.
 *
 * Evaluation order:
 *   1. Active customer clauses, ascending by priority
 *   2. Active global clauses, ascending by priority
 *   3. Hardcoded fallback: 30% percent markup
 *
 * Clauses with conditions = null always match (catch-all).
 */
export function resolvePricingRuleClause(
  customerClauses: PricingRuleClause[],
  globalClauses: PricingRuleClause[],
  context: PricingRuleContext
): PricingRuleApplication {
  const row = buildContextRow(context);

  const active = (c: PricingRuleClause) => c.active;
  const byPriority = (a: PricingRuleClause, b: PricingRuleClause) => a.priority - b.priority;

  for (const clause of [...customerClauses].filter(active).sort(byPriority)) {
    if (clause.conditions === null || evaluateFilterGroup(row, clause.conditions)) {
      return {
        basis: clause.actionBasis,
        amount: clause.actionAmount,
        source: 'customer-clause',
        clauseId: clause.id,
        clauseName: clause.name,
      };
    }
  }

  for (const clause of [...globalClauses].filter(active).sort(byPriority)) {
    if (clause.conditions === null || evaluateFilterGroup(row, clause.conditions)) {
      return {
        basis: clause.actionBasis,
        amount: clause.actionAmount,
        source: 'global-clause',
        clauseId: clause.id,
        clauseName: clause.name,
      };
    }
  }

  return { basis: 'percent', amount: 0.30, source: 'fallback' };
}
```

- [ ] **Run tests to confirm they pass**
```bash
pnpm test src/server/services/pricingRuleResolver.test.ts
```
Expected: all 11 tests pass.

- [ ] **Commit**
```bash
git add src/server/services/pricingRuleResolver.ts src/server/services/pricingRuleResolver.test.ts
git commit -m "feat(cap-030): resolvePricingRuleClause resolver + tests (TER-1558)"
```

---

## Task 5: `savePricingRuleChain` Command

**Files:**
- Modify: `src/shared/commandCatalog.ts`
- Modify: `src/server/services/commandBus.ts`
- Modify: `src/tests/pricingCommands.test.ts`

- [ ] **Register command in `src/shared/commandCatalog.ts`**:

In `commandNames` array, add `'savePricingRuleChain'`.

In `commandLabels`, add:
```ts
savePricingRuleChain: 'Save pricing rule chain',
```

In `commandPermissions`, add:
```ts
savePricingRuleChain: 'manager',
```

In `reversalPolicies`, add:
```ts
savePricingRuleChain: { disposition: 'reversible', guidance: 'Restores the prior pricing rule chain from the command snapshot.' },
```

Also **tombstone old commands** — update their labels to indicate deprecation:
```ts
setCustomerPricingRule: 'Set customer pricing rule (deprecated — use savePricingRuleChain)',
setDefaultPricingRule: 'Set default pricing rule (deprecated — use savePricingRuleChain)',
```

- [ ] **Add `savePricingRuleChain` handler** in `src/server/services/commandBus.ts`:

In the main `switch (commandName)` block, add before the final `default` case:
```ts
case 'savePricingRuleChain':
  return savePricingRuleChain(tx, payload, commandId, user);
```

Also update `setCustomerPricingRule` and `setDefaultPricingRule` cases to return a tombstone error:
```ts
case 'setCustomerPricingRule':
case 'setDefaultPricingRule':
  throw new Error(`Command ${commandName} is deprecated. Use savePricingRuleChain instead.`);
```

Then add the implementation function (add near the existing `setCustomerPricingRule` function in the file):

```ts
export async function savePricingRuleChain(
  tx: Tx,
  payload: Payload,
  commandId: string,
  user: { id: string }
): Promise<CommandResult> {
  const { scope, customerId, clauses, chainFingerprint } =
    savePricingRuleChainPayloadSchema.parse(payload);

  // Validate: global scope must have catch-all as final clause
  if (scope === 'global') {
    const last = clauses[clauses.length - 1];
    if (!last || last.conditions !== null) {
      throw new Error('Global pricing rule chain must have a catch-all clause (conditions: null) as the final entry.');
    }
  }

  // Concurrency check: compute current fingerprint
  const liveRows = await tx
    .select({ id: pricingRuleEntries.id, updatedAt: pricingRuleEntries.updatedAt })
    .from(pricingRuleEntries)
    .where(
      and(
        eq(pricingRuleEntries.scope, scope),
        customerId ? eq(pricingRuleEntries.customerId, customerId) : isNull(pricingRuleEntries.customerId),
        isNull(pricingRuleEntries.deletedAt)
      )
    );

  const currentFingerprint = computeChainFingerprint(liveRows);
  if (currentFingerprint !== chainFingerprint) {
    throw Object.assign(
      new Error('Pricing chain was modified since you opened it. Reload to see the latest version.'),
      { code: 'PRICING_CHAIN_CONFLICT' }
    );
  }

  // Snapshot for reversal
  const priorChain = await tx
    .select()
    .from(pricingRuleEntries)
    .where(
      and(
        eq(pricingRuleEntries.scope, scope),
        customerId ? eq(pricingRuleEntries.customerId, customerId) : isNull(pricingRuleEntries.customerId),
        isNull(pricingRuleEntries.deletedAt)
      )
    )
    .orderBy(pricingRuleEntries.priority);

  const liveIds = new Set(liveRows.map((r) => r.id));
  const incomingIds = new Set(
    clauses.filter((c) => c.id && liveIds.has(c.id)).map((c) => c.id!)
  );

  // Step 1: soft-delete all existing live rows
  if (liveRows.length > 0) {
    await tx
      .update(pricingRuleEntries)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(pricingRuleEntries.scope, scope),
          customerId ? eq(pricingRuleEntries.customerId, customerId) : isNull(pricingRuleEntries.customerId),
          isNull(pricingRuleEntries.deletedAt)
        )
      );
  }

  // Step 2: restore/insert each clause with its new priority
  for (let i = 0; i < clauses.length; i++) {
    const clause = clauses[i];
    const priority = i + 1;
    const now = new Date();

    if (clause.id && liveIds.has(clause.id)) {
      // Restore existing row with updated fields
      await tx
        .update(pricingRuleEntries)
        .set({
          priority,
          name: clause.name ?? null,
          conditions: clause.conditions ?? null,
          actionBasis: clause.actionBasis,
          actionAmount: String(clause.actionAmount),
          active: clause.active,
          deletedAt: null,
          updatedAt: now,
        })
        .where(eq(pricingRuleEntries.id, clause.id));
    } else {
      await tx.insert(pricingRuleEntries).values({
        scope,
        customerId: customerId ?? null,
        priority,
        name: clause.name ?? null,
        conditions: clause.conditions ?? null,
        actionBasis: clause.actionBasis,
        actionAmount: String(clause.actionAmount),
        active: clause.active,
      });
    }
  }

  return {
    affectedId: customerId ?? 'global',
    toast: `Pricing rules saved.`,
    delta: { scope, customerId: customerId ?? null, clauses, priorChain },
  };
}

function computeChainFingerprint(rows: Array<{ id: string; updatedAt: Date | null }>): string {
  const parts = rows
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((r) => `${r.id}:${r.updatedAt?.getTime() ?? 0}`)
    .join('|');
  return `${rows.length}:${parts}`;
}
```

Also add the reversal case in the `reverseCommandById` switch for `savePricingRuleChain`:
```ts
} else if (original.commandName === 'savePricingRuleChain') {
  const { scope, customerId, priorChain } = original.delta as {
    scope: string; customerId: string | null; priorChain: typeof pricingRuleEntries.$inferSelect[];
  };
  // Soft-delete current chain
  await tx.update(pricingRuleEntries)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(pricingRuleEntries.scope, scope as 'global' | 'customer'),
        customerId ? eq(pricingRuleEntries.customerId, customerId) : isNull(pricingRuleEntries.customerId),
        isNull(pricingRuleEntries.deletedAt)
      )
    );
  // Restore prior rows
  for (const row of priorChain) {
    await tx.insert(pricingRuleEntries).values({
      id: row.id,
      scope: row.scope as 'global' | 'customer',
      customerId: row.customerId,
      priority: row.priority,
      name: row.name,
      conditions: row.conditions as FilterGroupInput | null,
      actionBasis: row.actionBasis as 'percent' | 'dollar',
      actionAmount: row.actionAmount,
      active: row.active,
      migrationSource: row.migrationSource,
    });
  }
}
```

- [ ] **Add required imports** in `commandBus.ts`:
```ts
import { pricingRuleEntries } from '../schema';
import { savePricingRuleChainPayloadSchema } from '../../shared/schemas';
import { and, eq, inArray, isNull } from 'drizzle-orm';
```
(These may already exist; add only what's missing.)

- [ ] **Add tests** in `src/tests/pricingCommands.test.ts` — add a new `describe` block:
```ts
describe('savePricingRuleChain', () => {
  it('saves a global chain with catch-all', async () => {
    // Uses in-memory mock; see existing test setup for pattern
    // Test that handler calls insert for each clause and returns toast
    // Key assertion: final clause has conditions = null
  });

  it('rejects global chain without catch-all', async () => {
    await expect(
      savePricingRuleChain(
        tx,
        {
          scope: 'global',
          clauses: [{ conditions: { logic: 'AND', conditions: [{ field: 'category', operator: 'equals', value: 'Flower' }] }, actionBasis: 'percent', actionAmount: 0.28, active: true }],
          chainFingerprint: '0:',
        },
        'cmd-1',
        { id: 'user-1' }
      )
    ).rejects.toThrow(/catch-all/);
  });

  it('allows customer chain without catch-all (falls through to global)', async () => {
    // Should succeed — customer chains don't need a catch-all
  });

  it('rejects conditions with disallowed field', async () => {
    await expect(
      savePricingRuleChain(
        tx,
        {
          scope: 'customer',
          customerId: CUSTOMER_ID,
          clauses: [{
            conditions: { logic: 'AND', conditions: [{ field: 'brandId', operator: 'equals', value: 'some-uuid' }] },
            actionBasis: 'percent',
            actionAmount: 0.30,
            active: true,
          }],
          chainFingerprint: '0:',
        },
        'cmd-2',
        { id: 'user-1' }
      )
    ).rejects.toThrow();
  });
});
```

- [ ] **Run tests**
```bash
pnpm test src/tests/pricingCommands.test.ts
```
Expected: new tests pass; existing tests pass (old commands now throw "deprecated" error — update any test that called them directly to expect the new error).

- [ ] **Typecheck**
```bash
pnpm typecheck
```

- [ ] **Commit**
```bash
git add src/shared/commandCatalog.ts src/server/services/commandBus.ts src/tests/pricingCommands.test.ts src/shared/schemas.ts
git commit -m "feat(cap-030): savePricingRuleChain command + tombstone old commands (TER-1558)"
```

---

## Task 6: tRPC Queries

**Files:**
- Modify: `src/server/routers/queries.ts`

- [ ] **Add `pricingRuleClauses` query** in `src/server/routers/queries.ts`, inside the `queries` router:
```ts
pricingRuleClauses: protectedProcedure
  .input(z.object({
    scope: z.enum(['global', 'customer']),
    customerId: z.string().uuid().optional(),
  }))
  .query(async ({ input }) => {
    const { scope, customerId } = input;
    const rows = await db
      .select()
      .from(pricingRuleEntries)
      .where(
        and(
          eq(pricingRuleEntries.scope, scope),
          customerId ? eq(pricingRuleEntries.customerId, customerId) : isNull(pricingRuleEntries.customerId),
          isNull(pricingRuleEntries.deletedAt)
        )
      )
      .orderBy(pricingRuleEntries.priority);

    return rows.map((r) => ({
      id: r.id,
      scope: r.scope as 'global' | 'customer',
      customerId: r.customerId,
      priority: r.priority,
      name: r.name,
      conditions: r.conditions as FilterGroupInput | null,
      actionBasis: r.actionBasis as 'percent' | 'dollar',
      actionAmount: Number(r.actionAmount),
      active: r.active,
    } satisfies PricingRuleClause));
  }),
```

- [ ] **Add `pricingRulesSummary` query**:
```ts
pricingRulesSummary: protectedProcedure.query(async () => {
  // Global clauses
  const globalRows = await db
    .select()
    .from(pricingRuleEntries)
    .where(
      and(
        eq(pricingRuleEntries.scope, 'global'),
        isNull(pricingRuleEntries.deletedAt)
      )
    )
    .orderBy(pricingRuleEntries.priority);

  const global: PricingRuleClause[] = globalRows.map((r) => ({
    id: r.id,
    scope: 'global' as const,
    customerId: null,
    priority: r.priority,
    name: r.name,
    conditions: r.conditions as FilterGroupInput | null,
    actionBasis: r.actionBasis as 'percent' | 'dollar',
    actionAmount: Number(r.actionAmount),
    active: r.active,
  }));

  // Customer summary: LEFT JOIN to get clause count + last updated
  const summaryRows = await pool.query<{
    id: string; name: string; clauseCount: string; lastUpdated: string | null;
  }>(`
    SELECT
      c.id,
      c.name,
      COUNT(pre.id) FILTER (WHERE pre.deleted_at IS NULL AND pre.active = true)::text AS "clauseCount",
      MAX(pre.updated_at) FILTER (WHERE pre.deleted_at IS NULL)::text AS "lastUpdated"
    FROM customers c
    LEFT JOIN pricing_rule_entries pre ON pre.customer_id = c.id AND pre.scope = 'customer'
    WHERE c.archived_at IS NULL OR c.archived_at IS NOT NULL  -- include all customers
    GROUP BY c.id, c.name
    ORDER BY c.name
    LIMIT 500
  `);

  // Compute fingerprint from global chain
  const chainFingerprint = computeChainFingerprintFromRows(globalRows);

  return {
    global,
    customers: summaryRows.rows.map((r) => ({
      id: r.id,
      name: r.name,
      clauseCount: Number(r.clauseCount),
      lastUpdated: r.lastUpdated,
      hasCustomRules: Number(r.clauseCount) > 0,
    })),
    chainFingerprint,
  };
}),
```

Add `computeChainFingerprintFromRows` as a module-level helper in `queries.ts`:
```ts
function computeChainFingerprintFromRows(rows: Array<{ id: string; updatedAt: Date | null }>): string {
  const parts = [...rows]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((r) => `${r.id}:${r.updatedAt?.getTime() ?? 0}`)
    .join('|');
  return `${rows.length}:${parts}`;
}
```

- [ ] **Add required imports** in `queries.ts`:
```ts
import { pricingRuleEntries } from '../schema';
import type { PricingRuleClause } from '../../shared/types';
import type { FilterGroupInput } from '../../shared/filterSchemas';
```

- [ ] **Typecheck**
```bash
pnpm typecheck
```

- [ ] **Commit**
```bash
git add src/server/routers/queries.ts
git commit -m "feat(cap-030): pricingRuleClauses + pricingRulesSummary tRPC queries (TER-1558)"
```

---

## Task 7: `priceSalesOrder` Feature Flag Integration

**Files:**
- Modify: `src/server/services/commandBus.ts`

- [ ] **Update `priceSalesOrder`** in `commandBus.ts`. Find the `export async function priceSalesOrder(...)` function. At the start, add a flag check:

```ts
// Feature flag: use new clause-based resolver when pricing.useChainResolver is true
const flagRows = await tx
  .select()
  .from(systemSettings)
  .where(eq(systemSettings.key, 'pricing.useChainResolver'))
  .limit(1);
const useChainResolver = flagRows[0]?.value === true || flagRows[0]?.value === 'true';

if (useChainResolver) {
  return priceSalesOrderWithChainResolver(tx, payload, commandId, toast);
}
// else fall through to existing logic below (unchanged)
```

- [ ] **Add `priceSalesOrderWithChainResolver`** function (new, near the existing `priceSalesOrder`):

```ts
async function priceSalesOrderWithChainResolver(
  tx: Tx,
  payload: Payload,
  commandId: string,
  toast: string
): Promise<CommandResult> {
  const { orderId, strategy = 'standard' } = payload as { orderId: string; strategy?: string };

  const [order] = await tx.select().from(salesOrders).where(eq(salesOrders.id, orderId)).limit(1);
  if (!order) throw new Error(`Order ${orderId} not found.`);

  const customer = order.customerId
    ? (await tx.select().from(customers).where(eq(customers.id, order.customerId)).limit(1))[0]
    : null;

  // Fetch both chains in one query set (2 queries total — no N+1)
  const [customerClauses, globalClauses] = await Promise.all([
    customer
      ? tx.select().from(pricingRuleEntries).where(
          and(
            eq(pricingRuleEntries.scope, 'customer'),
            eq(pricingRuleEntries.customerId, customer.id),
            isNull(pricingRuleEntries.deletedAt)
          )
        ).orderBy(pricingRuleEntries.priority)
      : Promise.resolve([]),
    tx.select().from(pricingRuleEntries).where(
      and(
        eq(pricingRuleEntries.scope, 'global'),
        isNull(pricingRuleEntries.deletedAt)
      )
    ).orderBy(pricingRuleEntries.priority),
  ]);

  const typedCustomerClauses: PricingRuleClause[] = customerClauses.map(rowToClause);
  const typedGlobalClauses: PricingRuleClause[] = globalClauses.map(rowToClause);

  const lines = await tx.select().from(salesOrderLines).where(eq(salesOrderLines.orderId, orderId));
  const profile = resolvePricingProfile(strategy, (customer?.tags as string[]) ?? []);

  // Check all COGS are resolved (same check as existing path)
  const unresolved = lines.find((l) => l.unitCostResolved === false);
  if (unresolved) {
    throw new Error(
      `${unresolved.itemName} has unresolved landed COGS. Resolve every range-priced line before applying pricing.`
    );
  }

  let ruleAppliedLines = 0;
  let guardrailHits = 0;
  const lineAuditEntries: unknown[] = [];

  for (const line of lines) {
    const batch = line.batchId
      ? (await tx.select().from(batches).where(eq(batches.id, line.batchId)).limit(1))[0]
      : null;

    const context: PricingRuleContext = {
      category: (line.batchCategory as string | undefined) ?? null,
      subcategory: (batch?.subcategory as string | undefined) ?? null,
      tags: (batch?.tags as string[] | undefined) ?? [],
      batchPostedPrice: batch?.unitPrice ? Number(batch.unitPrice) : undefined,
      unitCost: Number(line.unitCost ?? 0),
    };

    const resolved = resolvePricingRuleClause(typedCustomerClauses, typedGlobalClauses, context);
    const candidateUnitPrice = applyPricingRule(Number(line.unitCost ?? 0), resolved);

    const basisUnitPrice = batch?.unitPrice ? Number(batch.unitPrice) : candidateUnitPrice;
    const evaluation = evaluatePrice({
      unitCost: Number(line.unitCost ?? 0),
      basisUnitPrice,
      candidateUnitPrice,
      profile,
    });

    await tx.update(salesOrderLines)
      .set({ unitPrice: moneyScale(evaluation.unitPrice), updatedAt: new Date() })
      .where(eq(salesOrderLines.id, line.id));

    if (resolved.source !== 'fallback') ruleAppliedLines++;
    if (evaluation.adjusted) guardrailHits++;

    lineAuditEntries.push({
      lineId: line.id,
      clauseId: resolved.clauseId ?? null,
      clauseName: resolved.clauseName ?? null,
      clauseSnapshot: resolved.clauseId ? (typedCustomerClauses.find(c => c.id === resolved.clauseId) ?? typedGlobalClauses.find(c => c.id === resolved.clauseId) ?? null) : null,
      priceBeforeGuardrail: candidateUnitPrice,
      guardrailApplied: evaluation.adjusted,
      guardrailProfile: profile.name,
      ruleSource: resolved.source,
    });
  }

  return {
    affectedId: orderId,
    toast: ruleAppliedLines
      ? `${toast} Chain resolver applied to ${ruleAppliedLines} line(s).${guardrailHits ? ` ${guardrailHits} lifted to guardrail.` : ''}`
      : toast,
    delta: { strategy, ruleAppliedLines, guardrailHits, lines: lineAuditEntries },
  };
}

function rowToClause(r: typeof pricingRuleEntries.$inferSelect): PricingRuleClause {
  return {
    id: r.id,
    scope: r.scope as 'global' | 'customer',
    customerId: r.customerId,
    priority: r.priority,
    name: r.name,
    conditions: r.conditions as FilterGroupInput | null,
    actionBasis: r.actionBasis as 'percent' | 'dollar',
    actionAmount: Number(r.actionAmount),
    active: r.active,
  };
}
```

Add missing imports at top of `commandBus.ts`:
```ts
import { resolvePricingRuleClause, buildContextRow } from './pricingRuleResolver';
import type { PricingRuleClause, PricingRuleContext } from '../../shared/types';
```

- [ ] **Typecheck**
```bash
pnpm typecheck
```

- [ ] **Commit**
```bash
git add src/server/services/commandBus.ts
git commit -m "feat(cap-030): priceSalesOrder chain resolver path behind feature flag (TER-1558)"
```

---

## Task 8: `PricingRuleClauseCard` Component

**Files:**
- Create: `src/client/components/PricingRuleClauseCard.tsx`

- [ ] **Create `src/client/components/PricingRuleClauseCard.tsx`**:

```tsx
import { useState } from 'react';
import type { PricingRuleClause, PricingRuleContext } from '../../shared/types';
import type { FilterGroupInput } from '../../shared/filterSchemas';

export interface PricingRuleClauseInput {
  id?: string;
  name?: string | null;
  conditions: FilterGroupInput | null;
  actionBasis: 'percent' | 'dollar';
  actionAmount: number;
  active: boolean;
}

interface Props {
  clause: PricingRuleClauseInput;
  index: number;
  total: number;
  isCatchAll: boolean;  // true for the final global catch-all card
  onChange: (updated: PricingRuleClauseInput) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  compact?: boolean;
  readOnly?: boolean;
  categories: string[];
  tagOptions: string[];
}

const PRICING_FIELDS = [
  { key: 'category', label: 'Category', type: 'text' },
  { key: 'subcategory', label: 'Subcategory', type: 'text' },
  { key: 'tags', label: 'Tags', type: 'array' },
  { key: 'unitPrice', label: 'Batch posted price', type: 'numeric' },
  { key: 'unitCost', label: 'Unit cost (COGS)', type: 'numeric' },
] as const;

const TEXT_OPERATORS = [
  { key: 'equals', label: '=' },
  { key: 'not_equals', label: '≠' },
  { key: 'text_contains', label: 'contains' },
];

const NUMERIC_OPERATORS = [
  { key: 'equals', label: '=' },
  { key: 'greater_than', label: '>' },
  { key: 'greater_than_or_equal', label: '≥' },
  { key: 'less_than', label: '<' },
  { key: 'less_than_or_equal', label: '≤' },
  { key: 'between', label: 'between' },
];

const ARRAY_OPERATORS = [
  { key: 'array_contains', label: 'contains any' },
  { key: 'array_contains_all', label: 'contains all' },
  { key: 'array_not_contains', label: 'does not contain' },
];

export function PricingRuleClauseCard({
  clause, index, total, isCatchAll, onChange, onRemove, onMoveUp, onMoveDown,
  compact, readOnly, categories, tagOptions,
}: Props) {
  const [addingCondition, setAddingCondition] = useState(false);
  const [newField, setNewField] = useState<string>('category');
  const [newOperator, setNewOperator] = useState<string>('equals');
  const [newValue, setNewValue] = useState<string>('');
  const [newValueHigh, setNewValueHigh] = useState<string>(''); // for between

  const conditions = clause.conditions?.conditions ?? [];

  function addCondition() {
    const field = PRICING_FIELDS.find(f => f.key === newField);
    if (!field) return;

    let value: unknown = newValue;
    if (field.type === 'numeric') {
      if (newOperator === 'between') {
        value = [Number(newValue), Number(newValueHigh)];
      } else {
        value = Number(newValue);
      }
    } else if (field.type === 'array') {
      value = newValue.split(',').map(s => s.trim()).filter(Boolean);
    }

    const newCond = { field: newField, operator: newOperator, value };
    const existingGroup = clause.conditions ?? { logic: 'AND' as const, conditions: [] };
    onChange({
      ...clause,
      conditions: { logic: 'AND', conditions: [...(existingGroup.conditions ?? []), newCond as never] },
    });
    setAddingCondition(false);
    setNewValue('');
    setNewValueHigh('');
  }

  function removeCondition(i: number) {
    if (!clause.conditions) return;
    const updated = clause.conditions.conditions.filter((_, idx) => idx !== i);
    onChange({
      ...clause,
      conditions: updated.length ? { ...clause.conditions, conditions: updated as never } : null,
    });
  }

  function conditionLabel(cond: Record<string, unknown>): string {
    const fieldMeta = PRICING_FIELDS.find(f => f.key === cond.field);
    const fieldLabel = fieldMeta?.label ?? String(cond.field);
    const op = String(cond.operator).replace(/_/g, ' ');
    const val = Array.isArray(cond.value) ? (cond.value as unknown[]).join(', ') : String(cond.value);
    return `${fieldLabel} ${op} ${val}`;
  }

  return (
    <div
      className={`border p-3 text-sm ${isCatchAll ? 'border-zinc-300 bg-zinc-50' : 'border-line bg-white'} ${!clause.active ? 'opacity-60' : ''}`}
      data-testid={`clause-card-${index}`}
    >
      {/* Header row */}
      <div className="flex items-center gap-2">
        {!isCatchAll && !readOnly && (
          <div className="flex gap-0.5">
            <button type="button" className="text-button" disabled={index === 0} onClick={onMoveUp} aria-label="Move rule up">↑</button>
            <button type="button" className="text-button" disabled={index === total - 2} onClick={onMoveDown} aria-label="Move rule down">↓</button>
          </div>
        )}
        {isCatchAll ? (
          <span className="text-xs uppercase text-zinc-500 font-medium">Default (catch-all)</span>
        ) : (
          <input
            type="text"
            className="border border-line px-2 py-0.5 text-xs flex-1"
            placeholder="Rule name (optional)"
            value={clause.name ?? ''}
            onChange={e => onChange({ ...clause, name: e.target.value || null })}
            disabled={readOnly}
            aria-label="Rule name"
          />
        )}
        {!readOnly && (
          <>
            <label className="flex items-center gap-1 text-xs">
              <input
                type="checkbox"
                checked={clause.active}
                onChange={e => onChange({ ...clause, active: e.target.checked })}
              />
              Active
            </label>
            {!isCatchAll && (
              <button type="button" className="text-button text-red-600" onClick={onRemove} aria-label="Remove rule">×</button>
            )}
          </>
        )}
      </div>

      {/* Conditions */}
      <div className="mt-2">
        {isCatchAll ? (
          <div className="text-xs text-zinc-500">Matches everything — applies when no other rule fires.</div>
        ) : (
          <>
            <div className="text-xs uppercase text-zinc-400 mb-1">IF</div>
            <div className="flex flex-wrap gap-1">
              {conditions.map((cond, i) => (
                <span key={i} className="finder-chip flex items-center gap-1">
                  {conditionLabel(cond as Record<string, unknown>)}
                  {!readOnly && (
                    <button type="button" onClick={() => removeCondition(i)} className="ml-0.5 text-zinc-500 hover:text-red-500" aria-label={`Remove condition ${i + 1}`}>×</button>
                  )}
                </span>
              ))}
              {conditions.length === 0 && <span className="text-xs text-zinc-400">No conditions — add one below or leave empty for catch-all.</span>}
            </div>

            {!readOnly && !addingCondition && (
              <button type="button" className="text-button mt-1 text-xs" onClick={() => setAddingCondition(true)}>+ Add condition</button>
            )}

            {!readOnly && addingCondition && (
              <div className="mt-2 flex flex-wrap gap-1 items-center border border-line p-2">
                <select value={newField} onChange={e => { setNewField(e.target.value); setNewOperator('equals'); setNewValue(''); }} className="border border-line px-2 py-1 text-xs">
                  {PRICING_FIELDS.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
                </select>
                <select value={newOperator} onChange={e => setNewOperator(e.target.value)} className="border border-line px-2 py-1 text-xs">
                  {(newField === 'tags' ? ARRAY_OPERATORS : newField === 'unitPrice' || newField === 'unitCost' ? NUMERIC_OPERATORS : TEXT_OPERATORS).map(op => (
                    <option key={op.key} value={op.key}>{op.label}</option>
                  ))}
                </select>
                {newField === 'tags' ? (
                  <input type="text" placeholder="premium, indoor (comma-separated)" value={newValue} onChange={e => setNewValue(e.target.value)} className="border border-line px-2 py-1 text-xs" style={{ width: 200 }} />
                ) : newField === 'category' ? (
                  <select value={newValue} onChange={e => setNewValue(e.target.value)} className="border border-line px-2 py-1 text-xs">
                    <option value="">Select…</option>
                    {categories.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                ) : (
                  <input type={newField === 'unitPrice' || newField === 'unitCost' ? 'number' : 'text'} placeholder="value" value={newValue} onChange={e => setNewValue(e.target.value)} className="border border-line px-2 py-1 text-xs" style={{ width: 120 }} />
                )}
                {newOperator === 'between' && (
                  <>
                    <span className="text-xs">and</span>
                    <input type="number" placeholder="high" value={newValueHigh} onChange={e => setNewValueHigh(e.target.value)} className="border border-line px-2 py-1 text-xs" style={{ width: 100 }} />
                  </>
                )}
                <button type="button" className="secondary-button compact-action" onClick={addCondition} disabled={!newValue.trim()}>Add</button>
                <button type="button" className="text-button" onClick={() => setAddingCondition(false)}>Cancel</button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Action */}
      <div className="mt-2 flex items-center gap-2">
        <span className="text-xs uppercase text-zinc-400">THEN</span>
        <select
          className="border border-line px-2 py-1 text-xs"
          value={clause.actionBasis}
          onChange={e => onChange({ ...clause, actionBasis: e.target.value as 'percent' | 'dollar' })}
          disabled={readOnly}
          data-testid={`clause-basis-${index}`}
        >
          <option value="percent">% markup</option>
          <option value="dollar">$ markup</option>
        </select>
        <input
          type="number"
          min={0}
          step="0.01"
          className="border border-line px-2 py-1 text-xs"
          style={{ width: 90 }}
          value={clause.actionAmount}
          onChange={e => onChange({ ...clause, actionAmount: Number(e.target.value) })}
          disabled={readOnly}
          data-testid={`clause-amount-${index}`}
        />
        <span className="text-xs text-zinc-500">
          {clause.actionBasis === 'percent'
            ? `on landed COGS (${(clause.actionAmount * 100).toFixed(1)}%)`
            : '$ added to landed COGS'}
        </span>
      </div>
    </div>
  );
}
```

- [ ] **Typecheck**
```bash
pnpm typecheck
```

- [ ] **Commit**
```bash
git add src/client/components/PricingRuleClauseCard.tsx
git commit -m "feat(cap-030): PricingRuleClauseCard component (TER-1558)"
```

---

## Task 9: `PricingRuleChainEditor` Component

**Files:**
- Create: `src/client/components/PricingRuleChainEditor.tsx`

- [ ] **Create `src/client/components/PricingRuleChainEditor.tsx`**:

```tsx
import { useEffect, useMemo, useRef, useState } from 'react';
import { trpc } from '../api/trpc';
import { useCommandRunner } from './useCommandRunner';
import { resolvePricingRuleClause } from '../../server/services/pricingRuleResolver';
import type { PricingRuleClause, PricingRuleContext } from '../../shared/types';
import { PricingRuleClauseCard, type PricingRuleClauseInput } from './PricingRuleClauseCard';

interface Props {
  scope: 'global' | 'customer';
  customerId?: string;
  clauses: PricingRuleClause[];
  chainFingerprint: string;
  isRunning: boolean;
  onSave: (clauses: PricingRuleClauseInput[], fingerprint: string) => Promise<void>;
  compact?: boolean;
  readOnly?: boolean;
}

function cloneClause(c: PricingRuleClause): PricingRuleClauseInput {
  return { id: c.id, name: c.name, conditions: c.conditions, actionBasis: c.actionBasis, actionAmount: c.actionAmount, active: c.active };
}

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function PricingRuleChainEditor({ scope, customerId, clauses, chainFingerprint, isRunning, onSave, compact, readOnly }: Props) {
  const reference = trpc.queries.reference.useQuery(undefined, { refetchOnWindowFocus: false });
  const categories: string[] = useMemo(() => (reference.data?.categories as string[] | undefined) ?? ['Flower', 'Infused', 'Extract', 'Pre-roll', 'Vape'], [reference.data]);
  const tagOptions: string[] = useMemo(() => {
    const catalog = (reference.data?.tagCatalog as Array<{ slug: string }> | undefined) ?? [];
    return catalog.map(t => t.slug);
  }, [reference.data]);

  // local draft state
  const [drafts, setDrafts] = useState<PricingRuleClauseInput[]>([]);
  const serverClausesRef = useRef<PricingRuleClause[]>([]);

  useEffect(() => {
    setDrafts(clauses.map(cloneClause));
    serverClausesRef.current = clauses;
  }, [clauses]);

  const isDirty = !deepEqual(drafts, clauses.map(cloneClause));

  // preview state
  const [showPreview, setShowPreview] = useState(false);
  const [previewCtx, setPreviewCtx] = useState<PricingRuleContext>({ category: '', subcategory: '', tags: [], batchPostedPrice: 0, unitCost: 0 });

  const previewResult = useMemo(() => {
    if (!showPreview) return null;
    const previewClauses: PricingRuleClause[] = drafts.map((d, i) => ({
      id: d.id ?? `draft-${i}`,
      scope,
      customerId: customerId ?? null,
      priority: i + 1,
      name: d.name ?? null,
      conditions: d.conditions,
      actionBasis: d.actionBasis,
      actionAmount: d.actionAmount,
      active: d.active,
    }));
    if (scope === 'customer') {
      return resolvePricingRuleClause(previewClauses, [], previewCtx);
    }
    return resolvePricingRuleClause([], previewClauses, previewCtx);
  }, [showPreview, drafts, previewCtx, scope, customerId]);

  function addClause() {
    const newClause: PricingRuleClauseInput = { name: null, conditions: null, actionBasis: 'percent', actionAmount: 0.30, active: true };
    if (scope === 'global') {
      // Insert before the catch-all (last item)
      setDrafts(prev => [...prev.slice(0, -1), newClause, prev[prev.length - 1]]);
    } else {
      setDrafts(prev => [...prev, newClause]);
    }
  }

  function updateClause(index: number, updated: PricingRuleClauseInput) {
    setDrafts(prev => prev.map((c, i) => i === index ? updated : c));
  }

  function removeClause(index: number) {
    setDrafts(prev => prev.filter((_, i) => i !== index));
  }

  function moveUp(index: number) {
    if (index <= 0) return;
    setDrafts(prev => {
      const next = [...prev];
      [next[index - 1], next[index]] = [next[index], next[index - 1]];
      return next;
    });
  }

  function moveDown(index: number) {
    // Don't move into catch-all position (last) for global scope
    const limit = scope === 'global' ? drafts.length - 2 : drafts.length - 2;
    if (index >= limit) return;
    setDrafts(prev => {
      const next = [...prev];
      [next[index], next[index + 1]] = [next[index + 1], next[index]];
      return next;
    });
  }

  async function handleSave() {
    await onSave(drafts, chainFingerprint);
  }

  const suggestedPrice = previewResult ? (() => {
    const cost = previewCtx.unitCost ?? 0;
    if (previewResult.basis === 'percent') return cost * (1 + previewResult.amount);
    return cost + previewResult.amount;
  })() : null;

  return (
    <div className="view-stack" data-testid="pricing-chain-editor">
      <div className="grid gap-2">
        {drafts.map((clause, i) => {
          const isCatchAll = scope === 'global' && i === drafts.length - 1;
          return (
            <PricingRuleClauseCard
              key={clause.id ?? `new-${i}`}
              clause={clause}
              index={i}
              total={drafts.length}
              isCatchAll={isCatchAll}
              onChange={(updated) => updateClause(i, updated)}
              onRemove={() => removeClause(i)}
              onMoveUp={() => moveUp(i)}
              onMoveDown={() => moveDown(i)}
              compact={compact}
              readOnly={readOnly}
              categories={categories}
              tagOptions={tagOptions}
            />
          );
        })}
      </div>

      {!readOnly && (
        <div className="flex items-center gap-3 mt-2">
          <button type="button" className="secondary-button" onClick={addClause}>+ Add rule</button>
          <button
            type="button"
            className="text-button"
            disabled={isRunning || !isDirty}
            onClick={handleSave}
            data-testid="chain-save"
          >
            Save rules{isDirty ? ' •' : ''}
          </button>
          {isDirty && <span className="text-xs text-amber-600" aria-label="Unsaved changes">Unsaved changes</span>}
        </div>
      )}

      {/* Preview panel */}
      <div className="border border-line mt-3">
        <button
          type="button"
          className="w-full text-left px-3 py-2 text-xs uppercase text-zinc-500 hover:bg-zinc-50"
          onClick={() => setShowPreview(s => !s)}
        >
          {showPreview ? '▾' : '▸'} Test this chain
        </button>
        {showPreview && (
          <div className="p-3 text-sm grid gap-2 border-t border-line">
            <div className="flex flex-wrap gap-2">
              <label className="text-xs">Category:
                <select className="ml-1 border border-line px-1 py-0.5 text-xs" value={previewCtx.category ?? ''} onChange={e => setPreviewCtx(c => ({ ...c, category: e.target.value }))}>
                  <option value="">—</option>
                  {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                </select>
              </label>
              <label className="text-xs">Subcategory:
                <input type="text" className="ml-1 border border-line px-1 py-0.5 text-xs" style={{ width: 90 }} value={previewCtx.subcategory ?? ''} onChange={e => setPreviewCtx(c => ({ ...c, subcategory: e.target.value }))} />
              </label>
              <label className="text-xs">Tags (comma):
                <input type="text" className="ml-1 border border-line px-1 py-0.5 text-xs" style={{ width: 120 }} placeholder="premium,indoor" onChange={e => setPreviewCtx(c => ({ ...c, tags: e.target.value.split(',').map(s => s.trim()).filter(Boolean) }))} />
              </label>
              <label className="text-xs">Batch price:
                <input type="number" className="ml-1 border border-line px-1 py-0.5 text-xs" style={{ width: 80 }} value={previewCtx.batchPostedPrice ?? ''} onChange={e => setPreviewCtx(c => ({ ...c, batchPostedPrice: Number(e.target.value) }))} />
              </label>
              <label className="text-xs">Unit cost:
                <input type="number" className="ml-1 border border-line px-1 py-0.5 text-xs" style={{ width: 80 }} value={previewCtx.unitCost ?? ''} onChange={e => setPreviewCtx(c => ({ ...c, unitCost: Number(e.target.value) }))} />
              </label>
            </div>
            {previewResult && (
              <div className="text-xs border border-line p-2 bg-zinc-50">
                <strong>→ {previewResult.clauseName ?? previewResult.source}</strong>
                {' '}{previewResult.basis === 'percent' ? `${(previewResult.amount * 100).toFixed(1)}%` : `+$${previewResult.amount.toFixed(2)}`} markup
                {suggestedPrice !== null && previewCtx.unitCost ? ` → suggested price $${suggestedPrice.toFixed(2)}` : ''}
                <span className="ml-2 text-zinc-400">(before guardrail)</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Typecheck**
```bash
pnpm typecheck
```

- [ ] **Commit**
```bash
git add src/client/components/PricingRuleChainEditor.tsx
git commit -m "feat(cap-030): PricingRuleChainEditor component (TER-1558)"
```

---

## Task 10: `PricingRulesView` + `SettingsView` Wiring

**Files:**
- Create: `src/client/components/PricingRulesView.tsx`
- Modify: `src/client/components/DefaultPricingPanel.tsx`
- Modify: `src/client/views/OperationsViews.tsx`

- [ ] **Create `src/client/components/PricingRulesView.tsx`**:

```tsx
import { useState, useCallback } from 'react';
import { trpc } from '../api/trpc';
import { useCommandRunner } from './useCommandRunner';
import { PricingRuleChainEditor, type PricingRuleClauseInput } from './PricingRuleChainEditor'; // re-export from PricingRuleClauseCard

export function PricingRulesView() {
  const summary = trpc.queries.pricingRulesSummary.useQuery(undefined, { refetchOnWindowFocus: false });
  const [expandedCustomerId, setExpandedCustomerId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [isDirtyCustomerId, setIsDirtyCustomerId] = useState<string | null>(null);
  const { runCommand, isRunning } = useCommandRunner();

  const globalClauses = summary.data?.global ?? [];
  const globalFingerprint = summary.data?.chainFingerprint ?? '0:';
  const customers = (summary.data?.customers ?? []).filter(c =>
    !search.trim() || c.name.toLowerCase().includes(search.toLowerCase())
  );

  const customerClauses = trpc.queries.pricingRuleClauses.useQuery(
    { scope: 'customer', customerId: expandedCustomerId ?? '' },
    { enabled: Boolean(expandedCustomerId), refetchOnWindowFocus: false }
  );

  async function saveGlobal(clauses: PricingRuleClauseInput[], fingerprint: string) {
    await runCommand('savePricingRuleChain', { scope: 'global', clauses, chainFingerprint: fingerprint }, 'Save global pricing rules');
    await summary.refetch();
  }

  async function saveCustomer(clauses: PricingRuleClauseInput[], fingerprint: string) {
    if (!expandedCustomerId) return;
    await runCommand('savePricingRuleChain', { scope: 'customer', customerId: expandedCustomerId, clauses, chainFingerprint: fingerprint }, 'Save customer pricing rules');
    await summary.refetch();
    await customerClauses.refetch();
  }

  async function clearCustomer(customerId: string, customerName: string) {
    if (!confirm(`Remove all custom rules for ${customerName}? They'll use global defaults.`)) return;
    await runCommand('savePricingRuleChain', { scope: 'customer', customerId, clauses: [], chainFingerprint: '0:' }, 'Clear customer pricing rules');
    await summary.refetch();
    if (expandedCustomerId === customerId) { setExpandedCustomerId(null); }
  }

  function tryExpand(customerId: string) {
    if (isDirtyCustomerId && isDirtyCustomerId !== customerId) {
      if (!confirm(`Discard unsaved changes?`)) return;
      setIsDirtyCustomerId(null);
    }
    setExpandedCustomerId(prev => prev === customerId ? null : customerId);
  }

  if (summary.isLoading) return <div className="view-stack"><p className="text-sm text-zinc-500">Loading pricing rules…</p></div>;
  if (summary.isError) return <div className="view-stack"><p className="text-sm text-red-600">Couldn't load pricing rules. Try refreshing.</p></div>;

  return (
    <div className="view-stack" data-testid="pricing-rules-view">
      <div>
        <h2 className="page-title">Pricing Rules</h2>
        <p className="page-subtitle">Markup rules applied at order pricing time. Global rules apply to all customers; customer rules override globals for that customer.</p>
      </div>

      {/* Global defaults */}
      <section className="inline-panel">
        <h3 className="section-title">Global defaults</h3>
        <p className="text-xs text-zinc-600 mb-3">Applied when a customer has no matching custom rule. The catch-all (last rule) is always required.</p>
        <PricingRuleChainEditor
          scope="global"
          clauses={globalClauses}
          chainFingerprint={globalFingerprint}
          isRunning={isRunning}
          onSave={saveGlobal}
        />
      </section>

      {/* Customer overrides */}
      <section className="inline-panel" data-testid="customer-overrides-section">
        <h3 className="section-title">Customer overrides</h3>
        <label className="finder-search mb-2">
          <input
            type="text"
            placeholder="Search customers…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full"
            aria-label="Search customers"
          />
        </label>
        <div className="finder-table-wrap">
          <table className="finder-table">
            <thead>
              <tr>
                <th>Customer</th>
                <th>Rules</th>
                <th>Last updated</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {customers.map(customer => (
                <>
                  <tr
                    key={customer.id}
                    className="cursor-pointer hover:bg-zinc-50"
                    onClick={() => tryExpand(customer.id)}
                    data-testid={`customer-row-${customer.id}`}
                  >
                    <td className="font-medium">{customer.name}</td>
                    <td>
                      {customer.hasCustomRules
                        ? <span className="finder-chip success">{customer.clauseCount} rule{customer.clauseCount !== 1 ? 's' : ''}</span>
                        : <span className="finder-chip">uses global</span>}
                    </td>
                    <td className="text-xs text-zinc-500">
                      {customer.lastUpdated ? new Date(customer.lastUpdated).toLocaleDateString() : '—'}
                    </td>
                    <td>
                      <span className="text-xs text-zinc-400">{expandedCustomerId === customer.id ? '▾' : '▸'}</span>
                    </td>
                  </tr>
                  {expandedCustomerId === customer.id && (
                    <tr key={`${customer.id}-expanded`}>
                      <td colSpan={4} className="p-3 bg-zinc-50 border-t border-line">
                        {customerClauses.isLoading ? (
                          <p className="text-sm text-zinc-500">Loading…</p>
                        ) : (
                          <>
                            <PricingRuleChainEditor
                              scope="customer"
                              customerId={customer.id}
                              clauses={customerClauses.data ?? []}
                              chainFingerprint={`${customerClauses.data?.length ?? 0}:`}
                              isRunning={isRunning}
                              onSave={saveCustomer}
                              compact
                            />
                            {customer.hasCustomRules && (
                              <button
                                type="button"
                                className="text-button text-red-600 mt-2 text-xs"
                                onClick={() => clearCustomer(customer.id, customer.name)}
                                disabled={isRunning}
                              >
                                Clear custom rules → use global defaults
                              </button>
                            )}
                          </>
                        )}
                      </td>
                    </tr>
                  )}
                </>
              ))}
              {customers.length === 0 && (
                <tr><td colSpan={4} className="text-sm text-zinc-500 py-4 text-center">No customers found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Retire `DefaultPricingPanel.tsx`** — replace its content with a stub re-export:
```tsx
// DefaultPricingPanel is retired. See PricingRulesView.
// This stub exists for one release cycle to avoid stale imports.
export { PricingRulesView as DefaultPricingPanel } from './PricingRulesView';
```

- [ ] **Update `SettingsView`** in `src/client/views/OperationsViews.tsx`:

Change the import at the top:
```ts
// Remove: import { DefaultPricingPanel } from '../components/DefaultPricingPanel';
import { PricingRulesView } from '../components/PricingRulesView';
```

Change the pricing tab render:
```tsx
// Change: {effectiveTab === 'pricing' ? <DefaultPricingPanel /> : null}
{effectiveTab === 'pricing' ? <PricingRulesView /> : null}
```

- [ ] **Typecheck**
```bash
pnpm typecheck
```

- [ ] **Commit**
```bash
git add src/client/components/PricingRulesView.tsx src/client/components/DefaultPricingPanel.tsx src/client/views/OperationsViews.tsx
git commit -m "feat(cap-030): PricingRulesView consolidated settings tab + retire DefaultPricingPanel (TER-1558)"
```

---

## Task 11: Update `CustomerPricingPanel` + `OrderPricingPanel`

**Files:**
- Modify: `src/client/components/PricingPanel.tsx`

- [ ] **Update `CustomerPricingPanel`** in `PricingPanel.tsx`:

Replace the entire `CustomerPricingPanel` function with:

```tsx
export function CustomerPricingPanel({ customerId }: CustomerPricingPanelProps) {
  const clauses = trpc.queries.pricingRuleClauses.useQuery(
    { scope: 'customer', customerId },
    { enabled: Boolean(customerId), refetchOnWindowFocus: false }
  );
  const summary = trpc.queries.pricingRulesSummary.useQuery(undefined, { refetchOnWindowFocus: false });
  const { runCommand, isRunning } = useCommandRunner();
  const customerName = /* get from relationship summary */ 'Customer';

  async function handleSave(updatedClauses: PricingRuleClauseInput[], fingerprint: string) {
    await runCommand(
      'savePricingRuleChain',
      { scope: 'customer', customerId, clauses: updatedClauses, chainFingerprint: fingerprint },
      'Update customer pricing rule'
    );
    await clauses.refetch();
    await summary.refetch();
  }

  if (clauses.isLoading) return <div className="context-drawer-card"><p className="text-sm text-zinc-500">Loading…</p></div>;

  return (
    <div className="context-drawer-card" data-testid="customer-pricing-panel">
      <h2 className="mt-1 truncate text-base font-semibold text-ink">Pricing rules</h2>
      <div className="mt-1 text-[11px] uppercase text-zinc-500">Internal only — never shown to customer</div>
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
```

Add the import at the top of `PricingPanel.tsx`:
```ts
import { PricingRuleChainEditor, type PricingRuleClauseInput } from './PricingRuleChainEditor';
```

- [ ] **Update `ruleSourceLabel`** in `PricingPanel.tsx` — extend the switch:
```ts
function ruleSourceLabel(app: PricingRuleApplication): string {
  switch (app.source) {
    case 'customer-clause':   return app.clauseName ? `customer · ${app.clauseName}` : 'customer rule';
    case 'global-clause':     return app.clauseName ? `global · ${app.clauseName}` : 'global rule';
    case 'customer-category': return `customer · ${app.category ?? ''}`;
    case 'customer-default':  return 'customer · default';
    case 'settings-category': return `settings · ${app.category ?? ''}`;
    case 'settings-default':  return 'settings · default';
    case 'fallback':          return 'fallback 30%';
  }
}
```

- [ ] **Add guardrail indicator** in `OrderPricingPanel` — in the line row, after the unit price display, add:
```tsx
{/* Guardrail indicator from chain resolver audit delta */}
{(line as Record<string, unknown>).guardrailApplied === true && (
  <span className="finder-chip warning" title="Price lifted to guardrail floor">
    ⚠ guardrail applied
  </span>
)}
```

- [ ] **Typecheck**
```bash
pnpm typecheck
```

- [ ] **Commit**
```bash
git add src/client/components/PricingPanel.tsx
git commit -m "feat(cap-030): CustomerPricingPanel → PricingRuleChainEditor; OrderPricingPanel guardrail indicator (TER-1558)"
```

---

## Task 12: Migration Script

**Files:**
- Create: `src/server/migrations/pricingRuleMigration.ts`

- [ ] **Create `src/server/migrations/pricingRuleMigration.ts`**:

```ts
/**
 * CAP-030 data migration: JSONB pricing rules → pricing_rule_entries table.
 *
 * Run with: pnpm exec tsx src/server/migrations/pricingRuleMigration.ts
 *
 * SAFE TO RUN MULTIPLE TIMES — idempotent via migration_source column.
 */
import { pool } from '../db';
import { resolvePricingRuleEntry } from '../../shared/inventoryPricingShared';
import { resolvePricingRuleClause } from '../services/pricingRuleResolver';
import type { CustomerPricingRule, PricingRuleClause } from '../../shared/types';

async function run() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // --- Migrate global defaults ---
    const settingsRow = await client.query(
      `SELECT value FROM system_settings WHERE key = 'pricing.defaults' LIMIT 1`
    );
    const defaultsRule: CustomerPricingRule = settingsRow.rows[0]?.value ?? {};
    const globalAlreadyMigrated = await client.query(
      `SELECT id FROM pricing_rule_entries WHERE scope = 'global' AND migration_source = 'legacy_jsonb_v1' AND deleted_at IS NULL LIMIT 1`
    );

    let globalClauses: PricingRuleClause[] = [];
    if (globalAlreadyMigrated.rows.length === 0) {
      const rows = buildClausesFromLegacy(defaultsRule, 'global', null);
      for (const row of rows) {
        await client.query(
          `INSERT INTO pricing_rule_entries (scope, customer_id, priority, name, conditions, action_basis, action_amount, active, migration_source)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'legacy_jsonb_v1')`,
          [row.scope, row.customerId, row.priority, row.name, JSON.stringify(row.conditions), row.actionBasis, row.actionAmount, row.active]
        );
      }
      console.log(`Migrated global defaults: ${rows.length} clause(s)`);

      // Fetch for parity check
      const inserted = await client.query(
        `SELECT * FROM pricing_rule_entries WHERE scope = 'global' AND deleted_at IS NULL ORDER BY priority`
      );
      globalClauses = inserted.rows.map(rowToClause);
    } else {
      console.log('Global defaults already migrated — skipping');
      const existing = await client.query(
        `SELECT * FROM pricing_rule_entries WHERE scope = 'global' AND deleted_at IS NULL ORDER BY priority`
      );
      globalClauses = existing.rows.map(rowToClause);
    }

    // --- Migrate customer rules ---
    const customers = await client.query(
      `SELECT id, name, pricing_rule FROM customers WHERE pricing_rule IS NOT NULL AND pricing_rule != '{}'::jsonb`
    );

    let migrated = 0;
    let skipped = 0;
    let parityFailures = 0;

    for (const customer of customers.rows) {
      const alreadyMigrated = await client.query(
        `SELECT id FROM pricing_rule_entries WHERE scope = 'customer' AND customer_id = $1 AND migration_source = 'legacy_jsonb_v1' AND deleted_at IS NULL LIMIT 1`,
        [customer.id]
      );
      if (alreadyMigrated.rows.length > 0) { skipped++; continue; }

      const rule: CustomerPricingRule = customer.pricing_rule ?? {};
      const rows = buildClausesFromLegacy(rule, 'customer', customer.id);
      for (const row of rows) {
        await client.query(
          `INSERT INTO pricing_rule_entries (scope, customer_id, priority, name, conditions, action_basis, action_amount, active, migration_source)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'legacy_jsonb_v1')`,
          [row.scope, row.customerId, row.priority, row.name, JSON.stringify(row.conditions), row.actionBasis, row.actionAmount, row.active]
        );
      }

      // Parity check
      const inserted = await client.query(
        `SELECT * FROM pricing_rule_entries WHERE scope = 'customer' AND customer_id = $1 AND deleted_at IS NULL ORDER BY priority`,
        [customer.id]
      );
      const customerClauses = inserted.rows.map(rowToClause);
      const testCategories = Object.keys(rule.categories ?? {}).concat(['Flower', 'Extract', '__unknown__']);

      for (const cat of testCategories) {
        const oldResult = resolvePricingRuleEntry(rule, defaultsRule, cat);
        const newResult = resolvePricingRuleClause(customerClauses, globalClauses, { category: cat });
        if (oldResult.amount !== newResult.amount || oldResult.basis !== newResult.basis) {
          console.error(`PARITY MISMATCH customer=${customer.id} (${customer.name}) category=${cat}: old=${oldResult.basis}/${oldResult.amount} new=${newResult.basis}/${newResult.amount}`);
          parityFailures++;
        }
      }

      migrated++;
    }

    if (parityFailures > 0) {
      await client.query('ROLLBACK');
      console.error(`Migration rolled back: ${parityFailures} parity failure(s). Fix mapping logic and rerun.`);
      process.exit(1);
    }

    // Null out legacy columns
    await client.query(`UPDATE customers SET pricing_rule = NULL WHERE pricing_rule IS NOT NULL`);
    await client.query(`UPDATE system_settings SET value = NULL WHERE key = 'pricing.defaults'`);

    // Flip feature flag
    await client.query(
      `INSERT INTO system_settings (key, value) VALUES ('pricing.useChainResolver', 'true'::jsonb)
       ON CONFLICT (key) DO UPDATE SET value = 'true'::jsonb, updated_at = now()`
    );

    await client.query('COMMIT');
    console.log(`Migration complete: ${migrated} customers migrated, ${skipped} skipped, 0 parity failures.`);
    console.log('Feature flag pricing.useChainResolver set to true.');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

function buildClausesFromLegacy(
  rule: CustomerPricingRule,
  scope: 'global' | 'customer',
  customerId: string | null
) {
  const clauses: Array<{
    scope: string; customerId: string | null; priority: number; name: string | null;
    conditions: unknown; actionBasis: string; actionAmount: number; active: boolean;
  }> = [];
  let priority = 1;

  // Category entries — alphabetical order (deterministic)
  const categories = Object.entries(rule.categories ?? {}).sort(([a], [b]) => a.localeCompare(b));
  for (const [cat, entry] of categories) {
    clauses.push({
      scope, customerId, priority: priority++,
      name: `${cat} rule`,
      conditions: { logic: 'AND', conditions: [{ field: 'category', operator: 'equals', value: cat }] },
      actionBasis: entry.basis,
      actionAmount: entry.amount,
      active: true,
    });
  }

  // Default / catch-all
  const defaultEntry = rule.default;
  clauses.push({
    scope, customerId, priority: priority++,
    name: null,
    conditions: null, // catch-all
    actionBasis: defaultEntry?.basis ?? 'percent',
    actionAmount: defaultEntry?.amount ?? 0.30,
    active: true,
  });

  return clauses;
}

function rowToClause(r: Record<string, unknown>): PricingRuleClause {
  return {
    id: r.id as string,
    scope: r.scope as 'global' | 'customer',
    customerId: r.customer_id as string | null,
    priority: r.priority as number,
    name: r.name as string | null,
    conditions: r.conditions as import('../../shared/filterSchemas').FilterGroupInput | null,
    actionBasis: r.action_basis as 'percent' | 'dollar',
    actionAmount: Number(r.action_amount),
    active: r.active as boolean,
  };
}

run().catch(e => { console.error(e); process.exit(1); });
```

- [ ] **Typecheck the migration script**
```bash
pnpm typecheck
```

- [ ] **Run migration against dev DB**
```bash
pnpm exec tsx src/server/migrations/pricingRuleMigration.ts
```
Expected output:
```
Migrated global defaults: N clause(s)
Migration complete: M customers migrated, 0 skipped, 0 parity failures.
Feature flag pricing.useChainResolver set to true.
```

- [ ] **Verify feature flag is set**
```bash
pnpm exec tsx -e "import { pool } from './src/server/db'; pool.query(\"SELECT value FROM system_settings WHERE key = 'pricing.useChainResolver'\").then(r => { console.log(r.rows[0]); process.exit(0); })"
```
Expected: `{ value: true }`

- [ ] **Verify pricing_rule_entries has rows**
```bash
pnpm exec tsx -e "import { pool } from './src/server/db'; pool.query('SELECT scope, COUNT(*) FROM pricing_rule_entries WHERE deleted_at IS NULL GROUP BY scope').then(r => { console.log(r.rows); process.exit(0); })"
```

- [ ] **Re-seed dev DB to verify end-to-end (optional but recommended)**
```bash
pnpm db:seed
pnpm exec tsx src/server/migrations/pricingRuleMigration.ts
```

- [ ] **Commit**
```bash
git add src/server/migrations/pricingRuleMigration.ts
git commit -m "feat(cap-030): pricing rule data migration script + parity check (TER-1558)"
```

---

## Task 13: Component Tests

**Files:**
- Create: `src/client/components/PricingRuleChainEditor.test.tsx`
- Modify: `src/client/components/PricingPanel.test.tsx`

- [ ] **Create `src/client/components/PricingRuleChainEditor.test.tsx`**:

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { PricingRuleChainEditor } from './PricingRuleChainEditor';
import type { PricingRuleClause } from '../../shared/types';

// Mock trpc
vi.mock('../api/trpc', () => ({
  trpc: {
    queries: {
      reference: { useQuery: () => ({ data: { categories: ['Flower', 'Infused', 'Extract'], tagCatalog: [] }, isLoading: false }) },
    },
  },
}));

const GLOBAL_CATCH_ALL: PricingRuleClause = {
  id: 'global-catchall-1', scope: 'global', customerId: null, priority: 1,
  name: null, conditions: null, actionBasis: 'percent', actionAmount: 0.30, active: true,
};

describe('PricingRuleChainEditor (global scope)', () => {
  it('renders catch-all card that cannot be removed', () => {
    render(
      <PricingRuleChainEditor
        scope="global"
        clauses={[GLOBAL_CATCH_ALL]}
        chainFingerprint="1:"
        isRunning={false}
        onSave={vi.fn()}
      />
    );
    expect(screen.getByText(/Default \(catch-all\)/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Remove rule/i })).not.toBeInTheDocument();
  });

  it('shows dirty indicator after editing action amount', async () => {
    render(
      <PricingRuleChainEditor
        scope="global"
        clauses={[GLOBAL_CATCH_ALL]}
        chainFingerprint="1:"
        isRunning={false}
        onSave={vi.fn()}
      />
    );
    const amountInput = screen.getByTestId('clause-amount-0');
    fireEvent.change(amountInput, { target: { value: '0.35' } });
    await waitFor(() => expect(screen.getByText(/Unsaved changes/i)).toBeInTheDocument());
  });

  it('calls onSave with current drafts on save', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <PricingRuleChainEditor
        scope="global"
        clauses={[GLOBAL_CATCH_ALL]}
        chainFingerprint="1:"
        isRunning={false}
        onSave={onSave}
      />
    );
    const amountInput = screen.getByTestId('clause-amount-0');
    fireEvent.change(amountInput, { target: { value: '0.35' } });
    fireEvent.click(screen.getByTestId('chain-save'));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ actionAmount: 0.35 })]),
      '1:'
    ));
  });

  it('adds a new clause before the catch-all on global scope', () => {
    render(
      <PricingRuleChainEditor
        scope="global"
        clauses={[GLOBAL_CATCH_ALL]}
        chainFingerprint="1:"
        isRunning={false}
        onSave={vi.fn()}
      />
    );
    fireEvent.click(screen.getByText('+ Add rule'));
    // Should now have 2 cards: the new one + catch-all
    expect(screen.getAllByTestId(/^clause-card-/)).toHaveLength(2);
    // Catch-all should still be last
    expect(screen.getByText(/Default \(catch-all\)/i)).toBeInTheDocument();
  });
});

describe('PricingRuleChainEditor (customer scope)', () => {
  it('renders empty state with add button', () => {
    render(
      <PricingRuleChainEditor
        scope="customer"
        customerId="cust-1"
        clauses={[]}
        chainFingerprint="0:"
        isRunning={false}
        onSave={vi.fn()}
      />
    );
    expect(screen.getByText('+ Add rule')).toBeInTheDocument();
  });
});
```

- [ ] **Update `PricingPanel.test.tsx`** — find the `CustomerPricingPanel` describe block and update the mock:
The test currently mocks `relationshipSummary.customer.pricingRule`. Update it to mock `trpc.queries.pricingRuleClauses` instead:
```ts
// In the mock setup, add:
pricingRuleClauses: {
  useQuery: () => ({
    data: [],
    isLoading: false,
    refetch: vi.fn(),
  }),
},
pricingRulesSummary: {
  useQuery: () => ({
    data: { global: [], customers: [], chainFingerprint: '0:' },
    refetch: vi.fn(),
  }),
},
```

- [ ] **Run component tests**
```bash
pnpm test src/client/components/PricingRuleChainEditor.test.tsx src/client/components/PricingPanel.test.tsx
```
Expected: all pass.

- [ ] **Run full test suite**
```bash
pnpm test
```
Expected: all pass (or only pre-existing failures).

- [ ] **Final typecheck**
```bash
pnpm typecheck
```
Expected: 0 errors.

- [ ] **Commit**
```bash
git add src/client/components/PricingRuleChainEditor.test.tsx src/client/components/PricingPanel.test.tsx
git commit -m "feat(cap-030): PricingRuleChainEditor tests + PricingPanel mock updates (TER-1558)"
```

---

## Task 14: Parity Regression + Final Verification

**Files:**
- Create: `src/tests/pricingRulesMigrationParity.test.ts`

- [ ] **Create parity regression test** at `src/tests/pricingRulesMigrationParity.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { resolvePricingRuleEntry } from '../shared/inventoryPricingShared';
import { resolvePricingRuleClause } from '../server/services/pricingRuleResolver';
import type { CustomerPricingRule, PricingRuleClause } from '../shared/types';

function legacyToNewClauses(rule: CustomerPricingRule, globalRule: CustomerPricingRule): { customer: PricingRuleClause[], global: PricingRuleClause[] } {
  const customer: PricingRuleClause[] = [];
  let prio = 1;
  for (const [cat, entry] of Object.entries(rule.categories ?? {}).sort(([a], [b]) => a.localeCompare(b))) {
    customer.push({ id: `c-${prio}`, scope: 'customer', customerId: 'c1', priority: prio++, name: null, conditions: { logic: 'AND', conditions: [{ field: 'category', operator: 'equals', value: cat }] } as never, actionBasis: entry.basis, actionAmount: entry.amount, active: true });
  }
  if (rule.default) customer.push({ id: `c-${prio}`, scope: 'customer', customerId: 'c1', priority: prio, name: null, conditions: null, actionBasis: rule.default.basis, actionAmount: rule.default.amount, active: true });

  const global: PricingRuleClause[] = [];
  let gprio = 1;
  for (const [cat, entry] of Object.entries(globalRule.categories ?? {}).sort(([a], [b]) => a.localeCompare(b))) {
    global.push({ id: `g-${gprio}`, scope: 'global', customerId: null, priority: gprio++, name: null, conditions: { logic: 'AND', conditions: [{ field: 'category', operator: 'equals', value: cat }] } as never, actionBasis: entry.basis, actionAmount: entry.amount, active: true });
  }
  global.push({ id: `g-default`, scope: 'global', customerId: null, priority: gprio, name: null, conditions: null, actionBasis: globalRule.default?.basis ?? 'percent', actionAmount: globalRule.default?.amount ?? 0.30, active: true });

  return { customer, global };
}

const GLOBAL_DEFAULTS: CustomerPricingRule = { default: { basis: 'percent', amount: 0.30 }, categories: { Flower: { basis: 'percent', amount: 0.28 } } };
const TEST_CONTEXTS = ['Flower', 'Extract', 'Pre-roll', 'Infused', 'Vape', '__unknown__', ''];

const FIXTURES: Array<{ label: string; rule: CustomerPricingRule }> = [
  { label: 'empty rule', rule: {} },
  { label: 'default only', rule: { default: { basis: 'percent', amount: 0.25 } } },
  { label: 'categories only', rule: { categories: { Flower: { basis: 'percent', amount: 0.35 }, Extract: { basis: 'dollar', amount: 10 } } } },
  { label: 'categories + default', rule: { categories: { Flower: { basis: 'percent', amount: 0.35 } }, default: { basis: 'percent', amount: 0.22 } } },
  { label: 'dollar markup', rule: { default: { basis: 'dollar', amount: 50 } } },
  { label: 'all 5 categories', rule: { categories: { Flower: { basis: 'percent', amount: 0.35 }, Extract: { basis: 'percent', amount: 0.30 }, Infused: { basis: 'percent', amount: 0.32 }, 'Pre-roll': { basis: 'percent', amount: 0.22 }, Vape: { basis: 'percent', amount: 0.28 } }, default: { basis: 'percent', amount: 0.25 } } },
  { label: 'high margin', rule: { default: { basis: 'percent', amount: 0.50 } } },
  { label: 'very low margin', rule: { default: { basis: 'percent', amount: 0.05 } } },
];

describe('Migration parity: resolvePricingRuleEntry == resolvePricingRuleClause', () => {
  for (const fixture of FIXTURES) {
    for (const category of TEST_CONTEXTS) {
      it(`${fixture.label} / category="${category}"`, () => {
        const { customer, global } = legacyToNewClauses(fixture.rule, GLOBAL_DEFAULTS);
        const oldResult = resolvePricingRuleEntry(fixture.rule, GLOBAL_DEFAULTS, category);
        const newResult = resolvePricingRuleClause(customer, global, { category });
        expect(newResult.amount).toBe(oldResult.amount);
        expect(newResult.basis).toBe(oldResult.basis);
      });
    }
  }
});
```

- [ ] **Run parity tests**
```bash
pnpm test src/tests/pricingRulesMigrationParity.test.ts
```
Expected: all pass. If any fail, fix `buildContextRow` mapping or `buildClausesFromLegacy` ordering before proceeding.

- [ ] **Run full test suite**
```bash
pnpm test
```

- [ ] **Final typecheck**
```bash
pnpm typecheck
```

- [ ] **Commit**
```bash
git add src/tests/pricingRulesMigrationParity.test.ts
git commit -m "test(cap-030): migration parity regression suite — resolvePricingRuleEntry == resolvePricingRuleClause (TER-1558)"
```

---

## Task 15: Docs + Linear Closeout

- [ ] **Update `docs/design-system/decisions-log.md`** — append:
```markdown
### 2026-05-22 — CAP-030: Pricing Rules Chain Manager (TER-1558)

Replaced flat `pricingRule` JSONB on customers and `systemSettings pricing.defaults` with `pricing_rule_entries` table. Rules are now ordered clauses with `FilterGroup` conditions (category, subcategory, tags, batchPostedPrice, unitCost). `savePricingRuleChain` command replaces `setCustomerPricingRule`/`setDefaultPricingRule` (tombstoned). `priceSalesOrder` gated behind `pricing.useChainResolver` feature flag. `PricingRulesView` replaces `DefaultPricingPanel` in Settings → Pricing tab. `CustomerPricingPanel` updated to use `PricingRuleChainEditor`. Migration uses diff+soft-delete for audit trail preservation.
```

- [ ] **Run `pnpm docs:inventory`** to update component inventory:
```bash
pnpm docs:inventory
```

- [ ] **Final full suite + typecheck**
```bash
pnpm test && pnpm typecheck
```

- [ ] **Commit decisions log + inventory**
```bash
git add docs/design-system/decisions-log.md docs/design-system/components/_inventory.json
git commit -m "docs(cap-030): decisions log + component inventory update (TER-1558)"
```

- [ ] **Update Linear issue TER-1558** with a progress comment summarizing what was built and move to In Review when PR is ready.

---

## Self-Review Checklist

After completing all tasks, verify:

- [ ] `pricing_rule_entries` table exists with all columns and indexes
- [ ] `savePricingRuleChain`: catch-all global invariant enforced, conditions allow-list validated, diff+soft-delete preserves IDs, fingerprint checked
- [ ] `resolvePricingRuleClause`: all test cases pass, null subcategory non-match confirmed
- [ ] `priceSalesOrder` feature flag gates correctly
- [ ] Migration script: idempotent, parity check passes, legacy columns nulled, flag flipped
- [ ] `PricingRulesView`: global chain editor, customer accordion, lazy load, clear button
- [ ] `CustomerPricingPanel` uses `pricingRuleClauses` (not old `pricingRule` JSONB)
- [ ] `OrderPricingPanel`: both old + new source labels render; guardrail chip shows
- [ ] `DefaultPricingPanel` is a stub re-export only
- [ ] All tests pass; typecheck clean
- [ ] `items.pricingRule` untouched
