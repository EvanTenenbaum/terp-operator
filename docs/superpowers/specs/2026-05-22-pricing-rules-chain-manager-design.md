# Pricing Rules Chain Manager — Design Spec

**CAP-030**  
**Date:** 2026-05-22  
**Status:** Design approved — ready for implementation plan  
**Work loop:** Sell  
**Exposure:** control, context  
**Recipes:** R4 (action verb), R12 (cross-entity workflow), R15 (role/permission)  
**AQA score after repair loop:** 78/100 (6 BLOCKERs fixed, 10 HIGHs fixed; 16 MEDIUMs tracked below; 10 LOWs noted)

---

## 1. Problem Statement

Pricing rules are currently managed in three disconnected surfaces:
- **Settings → Pricing** — system-wide default markup (simple form, `DefaultPricingPanel`)
- **RelationshipDrawer → customer** — one customer's rule (`CustomerPricingPanel`)
- **RelationshipDrawer → order** — line-by-line COGS resolution and rule preview (`OrderPricingPanel`)

The current rule model is flat: a `{ default, categories }` JSONB map. It cannot express multi-condition rules (e.g., subcategory=Indoor + tag=premium + price range → 28% margin). There is no single surface to audit all rules across all customers at once.

This spec defines **CAP-030 Pricing Rules Chain Manager**: a new `pricing_rule_entries` table, an expressive clause-based rule model using the existing `FilterGroup` condition engine, and a consolidated Settings → Pricing view — without removing any existing edit surface.

---

## 2. Scope

**In scope:**
- New `pricing_rule_entries` DB table with Drizzle schema + migration
- New `resolvePricingRuleClause` resolver replacing `resolvePricingRuleEntry`
- New `savePricingRuleChain` command (replaces `setCustomerPricingRule` + `setDefaultPricingRule`)
- New `pricingRulesSummary` + `pricingRuleClauses` tRPC queries
- New `PricingRulesView` (consolidated Settings → Pricing tab)
- New `PricingRuleChainEditor` + `PricingRuleClauseCard` components
- Updated `CustomerPricingPanel` (same location, new data source)
- Updated `OrderPricingPanel` (backward-compat source labels)
- `priceSalesOrder` updated to use new resolver
- DB migration + idempotency + rollback strategy
- Simulation/preview panel in chain editor

**Explicitly out of scope:**
- `items.pricingRule` JSONB — per-item margin hint on the `items` table. Do NOT touch.
- Guardrail profile editing (standard/premium/clearance percentages) — already covered by CAP-013
- Drag-and-drop reorder — follow-up
- GIN index on `conditions` for rules-by-condition reporting — follow-up
- External API / webhook integration — not planned

---

## 3. Data Model

### 3.1 New table: `pricing_rule_entries`

```sql
CREATE TABLE pricing_rule_entries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope           TEXT NOT NULL CHECK (scope IN ('global', 'customer')),
  customer_id     UUID REFERENCES customers(id) ON DELETE CASCADE,
  priority        INTEGER NOT NULL,
  name            VARCHAR(120),
  conditions      JSONB,          -- FilterGroupInput | NULL (null = catch-all)
  action_basis    TEXT NOT NULL CHECK (action_basis IN ('percent', 'dollar')),
  action_amount   NUMERIC(12, 4) NOT NULL,
  active          BOOLEAN NOT NULL DEFAULT TRUE,
  deleted_at      TIMESTAMPTZ,    -- soft-delete; NULL = live
  migration_source TEXT,          -- 'legacy_jsonb_v1' for migrated rows; NULL for new
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT pricing_rule_entries_priority_unique UNIQUE (scope, customer_id, priority)
    DEFERRABLE INITIALLY DEFERRED
);

CREATE INDEX pricing_rule_entries_scope_customer_active_priority_idx
  ON pricing_rule_entries (scope, customer_id, active, priority)
  WHERE deleted_at IS NULL;

CREATE INDEX pricing_rule_entries_customer_id_idx
  ON pricing_rule_entries (customer_id)
  WHERE deleted_at IS NULL;
```

**Key design decisions (with AQA rationale):**

- `ON DELETE CASCADE` — customer deletion removes their clauses. Verify customer deletion model is soft-delete (archived) before relying on cascade; if soft-delete, add `WHERE customers.deleted_at IS NULL` to resolver query.
- `deleted_at` for soft-delete — `savePricingRuleChain` diffs incoming clauses against existing rows using `id`; removed clauses get `deleted_at = now()`. Historical audit `clauseId` references remain valid.
- `UNIQUE (scope, customer_id, priority)` DEFERRABLE — enforces no priority collisions. Deferrable allows bulk priority renumbering within a transaction.
- `migration_source` — idempotency: skip any (scope, customer_id) pair already having rows with `migration_source = 'legacy_jsonb_v1'`.

### 3.2 Drizzle schema

In `src/server/schema.ts`:

```ts
export const pricingRuleEntries = pgTable('pricing_rule_entries', {
  id: uuid('id').primaryKey().defaultRandom(),
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
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
```

### 3.3 Updated shared types (`src/shared/types.ts`)

```ts
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
 * Context passed to the clause resolver at price-application time.
 * All fields are from the RESOLVED inventory line — not the order line or batch header.
 * unitCost is the allocation-weighted landed COGS after COGS resolution.
 * batchPostedPrice is the batch's stored unit_price at the time of pricing (not the output price).
 */
export interface PricingRuleContext {
  category?: string | null;
  subcategory?: string | null;
  tags?: string[];
  /** Batch's stored unit_price column — NOT the computed output of the pricing rule. */
  batchPostedPrice?: number;
  /** Allocation-weighted average resolved landed COGS. Required when unitCost conditions are used. */
  unitCost?: number;
}

// Keep for backward compat in ruleSourceLabel rendering (old journal deltas)
export interface PricingRuleApplication {
  basis: PricingBasis;
  amount: number;
  source:
    | 'customer-category'   // legacy
    | 'customer-default'    // legacy
    | 'settings-category'   // legacy
    | 'settings-default'    // legacy
    | 'customer-clause'     // new
    | 'global-clause'       // new
    | 'fallback';
  category?: string;        // legacy: which category matched
  clauseId?: string;        // new: which clause matched
  clauseName?: string | null; // new: clause name for display
}
```

### 3.4 Allowed condition fields

A separate Zod schema `PricingRuleConditionsSchema` in `src/shared/schemas.ts` validates `FilterGroupInput` with only these five fields allowed. Any other field (e.g., `intakeDate`, `brandId`, `vendorId`) is rejected at the command boundary:

| Field | Type | Operators |
|---|---|---|
| `category` | text | `equals`, `not_equals` |
| `subcategory` | text | `equals`, `not_equals`, `text_contains` |
| `tags` | array | `array_contains` (any-of), `array_contains_all` (all-of), `array_not_contains` |
| `batchPostedPrice` | numeric | `equals`, `greater_than`, `less_than`, `greater_than_or_equal`, `less_than_or_equal`, `between` |
| `unitCost` | numeric | same as batchPostedPrice |

**Null handling:** a condition on `subcategory` where the batch has `subcategory = null` evaluates to `false` (non-match). This is consistent with `evaluateFilterGroup` behavior and must be tested.

**Nesting depth:** AND/OR nesting limited to depth 3 (sufficient for the target use cases; `FilterGroup` allows 5 but pricing conditions don't need it).

**OR semantics within a clause:** multiple conditions in a single clause are implicitly AND. OR between different products/categories is expressed by creating additional clauses.

---

## 4. Pricing Pipeline

The explicit evaluation order for every sales order line:

```
(1) Allocate batch qty to order line
(2) Resolve landed COGS per allocation
    → Fixed-cost batch: unitCost = batch.unitCost
    → Range-priced batch: unitCost = allocation-weighted average of operator-chosen
      landed cost values (pick-low, pick-mid, pick-high, or manual)
    → COGS must be fully resolved before rule evaluation. priceSalesOrder
      throws if any line has unitCostResolved = false (existing check retained).
(3) Build PricingRuleContext:
    { category, subcategory, tags, batchPostedPrice: batch.unitPrice, unitCost }
(4) resolvePricingRuleClause(customerClauses, globalClauses, context)
    → Iterate customer clauses in ascending priority order (deleted_at IS NULL, active = true)
    → evaluateFilterGroup(context, clause.conditions) for each; first true match wins
    → If no customer clause matches, iterate global clauses the same way
    → If nothing matches, emit PricingRuleApplication { basis: 'percent', amount: 0.30, source: 'fallback' }
(5) applyPricingRule(unitCost, resolvedRule) → candidateUnitPrice
(6) evaluatePrice({ unitCost, basisUnitPrice: batch.unitPrice, candidateUnitPrice, profile })
    → Guardrail clamp (min margin, max discount, vendor floor)
    → Returns { unitPrice, adjusted, guardrails }
(7) Write line.unitPrice = guardrail output
(8) Audit delta includes:
    { clauseId, clauseName, clauseSnapshot (full clause JSONB at time of pricing),
      priceBeforeGuardrail (candidateUnitPrice), guardrailApplied (boolean),
      guardrailProfile (standard/premium/clearance) }
```

**Guardrail interaction:** clause output → guardrail clamp → final price. The guardrail always wins. If a clause output is clamped, `OrderPricingPanel` surfaces a yellow indicator showing both prices.

---

## 5. Backend

### 5.1 Rollback strategy (feature flag)

`systemSettings` key `pricing.useChainResolver` (boolean, default `false`). Migration flips this to `true` only after data parity check passes. `priceSalesOrder` reads this flag per-request:
- `false` → existing `resolvePricingRuleEntry` path (reads JSONB)
- `true` → new `resolvePricingRuleClause` path (reads `pricing_rule_entries`)

This allows a fast rollback by setting the flag to `false` without a code deploy.

### 5.2 tRPC queries

**`pricingRuleClauses({ scope, customerId? })`**  
Returns ordered live clauses for one scope/customer. Used by `PricingRuleChainEditor` in both the consolidated view and `CustomerPricingPanel`.

```ts
// Returns PricingRuleClause[] ordered by priority ASC
// Excludes deleted_at IS NOT NULL and active = false entries in UI query
// Resolver fetches including inactive (active=false) is still false — inactive clauses skip matching
```

**`pricingRulesSummary()`** (renamed from `pricingRuleConsolidated` per AQA finding #14)  
Returns global clauses + customer summary only — no customer clause arrays:

```ts
{
  global: PricingRuleClause[];
  customers: Array<{
    id: string;
    name: string;
    clauseCount: number;         // live, active clauses only
    lastUpdated: string | null;  // max(updated_at) of their clauses
    hasCustomRules: boolean;     // false if clauseCount = 0
  }>;
  chainFingerprint: string;      // hash for optimistic concurrency (see §5.3)
}
```

Implemented as a single SQL query with `LEFT JOIN pricing_rule_entries ... GROUP BY customers.id`. No N+1. Server-side limit: 500 customers. If workspace exceeds 500 customers, surface a paginated fallback.

### 5.3 Commands

**`savePricingRuleChain`**  
Replaces both `setCustomerPricingRule` and `setDefaultPricingRule`. Permission: `manager`.

Payload (Zod-validated):
```ts
{
  scope: 'global' | 'customer';
  customerId?: string;    // required when scope = 'customer'
  clauses: Array<{
    id?: string;          // existing clause ID to update; omit for new
    name?: string | null;
    conditions: FilterGroupInput | null;  // validated via PricingRuleConditionsSchema
    actionBasis: 'percent' | 'dollar';
    actionAmount: number;
    active: boolean;
  }>;
  chainFingerprint: string;  // optimistic concurrency token from last pricingRulesSummary fetch
}
```

**Server-side invariants enforced before write:**
1. `scope = 'global'` MUST have exactly one clause with `conditions = null` as the last element (highest priority value). Rejects otherwise.
2. `scope = 'customer'` may omit a catch-all (fall-through to global is intended).
3. `conditions` validated through `PricingRuleConditionsSchema` (field allow-list, depth ≤ 3).
4. Priorities renumbered to dense 1..N (input order = priority order).
5. Fingerprint checked against current `max(updated_at)` + count of live rows; mismatch → structured error `PRICING_CHAIN_CONFLICT`.

**Write pattern (diff + soft-delete, not delete + insert):**
```
For each incoming clause with an existing id:
  → UPDATE priority, name, conditions, action_basis, action_amount, active, updated_at
For each incoming clause without an id or with an unknown id:
  → INSERT new row
For each live row not referenced in the incoming list:
  → UPDATE deleted_at = now() (soft-delete)
```

This preserves historical `clauseId` values in audit deltas.

**Journal snapshot (reversal):** snapshots `{ scope, customerId, clauses: PricingRuleClause[] }` (the full prior chain). Reversal restores by re-running the same diff+soft-delete write with the prior chain. No shape mismatch — reversal uses the same `savePricingRuleChain` internals.

**`setCustomerPricingRule` and `setDefaultPricingRule`:** tombstoned in `commandCatalog.ts` as `deprecated`. They return a structured error: `"Command setCustomerPricingRule is deprecated. Use savePricingRuleChain."` They do NOT delegate — they reject at the command bus boundary. This avoids the alias reversal shape mismatch (AQA BLOCKER #4). Journal entries from old commands remain reversible via the existing reversal path (writes to JSONB columns, which remain read-ignored but non-null).

### 5.4 `priceSalesOrder` changes

```ts
// Fetch both chains in a single query
const [customerClauses, globalClauses] = await fetchPricingChains(tx, customerId);
// Per-line (no per-line DB fetch):
const context = buildPricingRuleContext(line, batch);
const resolved = resolvePricingRuleClause(customerClauses, globalClauses, context);
```

**Audit delta per line gains:**
```ts
clauseId: string | null;
clauseName: string | null;
clauseSnapshot: PricingRuleClause | null;   // full clause JSONB at pricing time
priceBeforeGuardrail: number;
guardrailApplied: boolean;
guardrailProfile: 'standard' | 'premium' | 'clearance';
```

No FK from audit rows to `pricing_rule_entries.id` — audits are append-only and must not break on future rule deletion.

---

## 6. Migration

### 6.1 Script: `src/server/migrations/XXXX_pricing_rule_entries.ts`

```
1. CREATE TABLE pricing_rule_entries (schema above)
2. For each customer with non-empty pricingRule JSONB:
   a. If pricing_rule_entries already has rows for this customer_id
      with migration_source = 'legacy_jsonb_v1' → SKIP (idempotency)
   b. For each category entry in pricingRule.categories:
      INSERT clause with conditions = { logic: 'AND', conditions: [
        { field: 'category', operator: 'equals', value: <category> }
      ]}, priority = alphabetical rank of category name (ascending, ASCII sort)
   c. If pricingRule.default exists:
      INSERT catch-all clause (conditions = null) at priority = last+1
   d. If pricingRule.categories exists but pricingRule.default does not:
      INSERT catch-all clause using the global default amount (or 0.30 fallback)
      to preserve old semantics (customer categories → fall-through to global default)
3. For systemSettings where key = 'pricing.defaults':
   Same pattern for scope = 'global'. If no catch-all row results, insert
   one with conditions = null, action_basis = 'percent', action_amount = 0.30.
4. For fresh installs (no systemSettings pricing.defaults AND no pricingRuleEntries rows):
   INSERT global catch-all: conditions = null, action_basis = 'percent', action_amount = 0.30
5. Null out legacy columns:
   UPDATE customers SET pricing_rule = NULL WHERE pricing_rule IS NOT NULL
   UPDATE system_settings SET value = NULL WHERE key = 'pricing.defaults'
6. Parity check (abort migration if any mismatch):
   For representative sample (all customers if ≤50; 50 random if more):
   → For each test context (each category in old map + one off-map category):
     oldResult = resolvePricingRuleEntry(old JSONB snapshot, old defaults snapshot, category)
     newResult = resolvePricingRuleClause(migrated customer clauses, migrated global clauses, {category})
     Assert oldResult.amount == newResult.amount AND oldResult.basis == newResult.basis
   → On mismatch: log customer ID + context, abort, leave pricing_rule_entries empty
7. Set systemSettings pricing.useChainResolver = true (flip feature flag)
8. Log summary: N customers migrated, M skipped, parity check passed/failed
```

**Category ordering rule:** categories are inserted in ascending ASCII order by category name. This is deterministic and documented. If an operator's old rule relied on map-insertion ordering semantics, they should review their chain after migration.

**Migration timing:** run in a maintenance window with the `pricing.useChainResolver` flag pre-set to `false`, so old write paths are still live. After migration succeeds and parity check passes, the script flips the flag to `true`. During the window, old JSONB reads are live; new table reads begin only after flag flip.

### 6.2 Dual-write during migration window

If a maintenance window is not practical, the old `setCustomerPricingRule` handler can temporarily dual-write to both `customers.pricingRule` (JSONB) and `pricing_rule_entries` (new table) during the migration period. The migration script's idempotency check (`migration_source`) handles any overlap. This is optional — the maintenance window approach is simpler and preferred.

### 6.3 Blast radius — files that read legacy columns

These files must be updated or explicitly confirmed as non-readers after migration:

| File | Current reference | Action |
|---|---|---|
| `src/server/services/commandBus.ts` | `customer.pricingRule`, `pricing.defaults` query | Update to new resolver path (behind flag) |
| `src/server/routers/queries.ts` | `pricing_rule as "pricingRule"` in customer query, `pricing.defaults` select | Remove `pricing_rule` from customer select; add new queries |
| `src/shared/commandCatalog.ts` | `setCustomerPricingRule`, `setDefaultPricingRule` | Mark deprecated |
| `src/shared/schemas.ts` | `pricingRuleEntrySchema`, `setCustomerPricingRulePayloadSchema` | Keep for legacy reversal; add new `PricingRuleConditionsSchema` |
| `src/client/components/PricingPanel.tsx` | `CustomerPricingPanel` reads `relationshipSummary.customer.pricingRule` | Update to `pricingRuleClauses` query |
| `src/client/components/DefaultPricingPanel.tsx` | Reads `reference.data.defaultPricingRule` | Retired; replaced by `PricingRulesView` |
| `src/tests/pricingCommands.test.ts` | Mock `pricingRule` JSONB | Update to mock new table rows |
| `src/tests/pricingSchemas.test.ts` | Schema tests | Add new schema tests |
| `src/tests/inventoryPricing.test.ts` | Old resolver tests | Add new resolver tests; keep old tests for legacy path |

`items.pricingRule` (line 79 of `schema.ts`) — **DO NOT TOUCH**. This is a per-item margin hint on the `items` table, unrelated to order pricing.

---

## 7. Frontend

### 7.1 `PricingRulesView` (replaces `DefaultPricingPanel`)

Rendered in `SettingsView` when `effectiveTab === 'pricing'`. Layout:

```
┌─ Pricing Rules ─────────────────────────────────────────┐
│ "Manage markup rules applied at order pricing time.     │
│  Global rules apply to all customers; customer rules   │
│  override globals for that customer."                  │
│                                                         │
│ ┌─ Global defaults ─────────────────────────────────┐  │
│ │ PricingRuleChainEditor (global scope)             │  │
│ └───────────────────────────────────────────────────┘  │
│                                                         │
│ ┌─ Customer overrides ──────────────────────────────┐  │
│ │ [search customers…]                               │  │
│ │                                                   │  │
│ │ ▶ Harbor Collective   3 rules  • custom           │  │
│ │ ▶ Sunset Dispensary   1 rule   • custom           │  │
│ │   Cobalt Health        —       • uses global      │  │
│ │   ...                                            │  │
│ │                                                   │  │
│ │ [expanded customer row shows PricingRuleChainEditor]  │
│ └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

**Customer list:** uses `finder-table` / `finder-chip` CSS classes. Columns: name, rule status chip (`custom` green / `uses global` zinc), clause count. Implemented with `pricingRulesSummary()` for the summary row; clause details loaded lazily on accordion open via `pricingRuleClauses({ scope: 'customer', customerId })`.

**Search:** client-side filter over the customer list. Acceptable for ≤500 customers (the documented cap for `pricingRulesSummary`). Search is debounced 150ms.

**Accordion:** one customer expanded at a time. Clicking a different row while dirty triggers confirm dialog: "Discard changes to [Customer Name]?" with Discard / Cancel. Navigation away (tab switch, route change) also triggers via `useBeforeUnload` + tRPC router's `useBlocker`.

**"Clear customer rules"** button (inside expanded accordion, destructive action): confirm inline — "Remove all custom rules for [Customer Name]? They'll use global defaults." Calls `savePricingRuleChain { scope: 'customer', customerId, clauses: [] }`.

**Read permissions:** `pricingRulesSummary` and `pricingRuleClauses` are available to all authenticated users. `PricingRuleChainEditor` renders `readOnly` for non-manager roles (save button hidden, all inputs disabled).

### 7.2 `PricingRuleChainEditor`

```ts
interface PricingRuleChainEditorProps {
  scope: 'global' | 'customer';
  customerId?: string;
  clauses: PricingRuleClause[];
  chainFingerprint: string;
  isRunning: boolean;
  onSave: (clauses: PricingRuleClauseInput[], fingerprint: string) => void;
  compact?: boolean;   // true in RelationshipDrawer context
  readOnly?: boolean;  // true for non-manager roles
}
```

Renders ordered clause cards. Local draft state (`useState`) manages reordering, additions, removals, and edits — no command fired per action. Single "Save rules" button fires `savePricingRuleChain` with full ordered chain + fingerprint.

**Dirty state:** `isDirty = !deepEqual(localDrafts, serverClauses)`. Amber dot indicator on Save button; `aria-label="Unsaved changes"` + screen-reader-only text.

**Catch-all card invariant (global scope only):** editor always renders a catch-all card as the final card. It cannot be moved or removed. If the user removes all explicit clauses, only the catch-all remains. The server also enforces this invariant on save.

**Empty state (customer scope):** if `clauses.length === 0`, render only the catch-all-equivalent prompt: "No custom rules — this customer uses global defaults." and a single "Add first rule" button.

**CONFLICT error handling:** if `savePricingRuleChain` returns `PRICING_CHAIN_CONFLICT`, show a modal: "This chain was modified since you opened it. Reload to see the latest version." Reload button re-fetches and resets local drafts.

### 7.3 `PricingRuleClauseCard`

```
┌──────────────────────────────────────────────────────────┐
│ ↑ ↓  [name: optional label…]              [active ●] [×] │
├──────────────────────────────────────────────────────────┤
│ IF                                                        │
│   [chip: category = Flower ×]  [chip: tags ∋ premium ×] │
│   [+ Add condition]                                       │
│                                                          │
│ THEN  [% markup ▾]  [0.28]  on landed COGS              │
│       "= 28% markup added to resolved cost"              │
│                                                          │
│ (no conditions on this card = matches everything)        │
└──────────────────────────────────────────────────────────┘
```

**Active toggle:** checkbox/toggle per card. Inactive clauses are saved to DB with `active = false`; they are skipped during resolution. Displayed as dimmed card with strike-through on name.

**Reorder:** ↑/↓ buttons; ↑ disabled on first explicit clause, ↓ disabled on last explicit clause. Catch-all card has no reorder buttons (always last).

**Condition chips:** each chip shows `[field label] [operator label] [value]`. Click chip → inline edit form. × removes the condition.

**"+ Add condition" inline form:**
```
Field: [category ▾]  Operator: [equals ▾]  Value: [Flower___]  [Add]
```

Per-field editor spec:
| Field | Value editor |
|---|---|
| `category` | Text input with autocomplete from reference categories |
| `subcategory` | Text input |
| `tags` | Chip multi-select from reference tag catalog |
| `batchPostedPrice` | Numeric input; shows operator dropdown (=, >, >=, <, <=, between) |
| `unitCost` | Same as batchPostedPrice |

Tag operator dropdown: "contains any" (`array_contains`), "contains all" (`array_contains_all`), "does not contain" (`array_not_contains`).

**Action row:** basis select (`% markup` / `$ markup`) + numeric amount input. Display hint: `0.28 = 28%` or `$50.00 added to landed COGS`.

**Catch-all card:** distinct styling (`border-zinc-300 bg-zinc-50`). Name fixed to "Default (catch-all)" (non-editable). Conditions display: "Matches everything." Action row is editable. If no amount set yet, shows: "Using fallback 30%" grayed.

### 7.4 Preview panel ("Test this chain")

Below the clause list, a collapsible "Test this chain" panel (collapsed by default):

```
┌─ Test this chain ────────────────────────────────────────┐
│ Category:      [Flower ▾]   Subcategory: [indoor____]  │
│ Tags:          [premium ×] [outdoor ×]  [+ tag]         │
│ Batch price:   [1200.00]   Unit cost:   [780.00]         │
│                                                          │
│ → Matched clause: "Premium indoor flower" (priority 2)  │
│   Markup: 28%  →  Suggested price: $1,076.40            │
│   (before guardrail; guardrail may adjust upward)        │
└──────────────────────────────────────────────────────────┘
```

Runs `resolvePricingRuleClause` client-side using the *local draft* clause list (not saved state). Updates on every input change. No network call — pure client-side evaluation.

### 7.5 Updated `CustomerPricingPanel` (RelationshipDrawer)

- Query changes from `relationshipSummary.customer.pricingRule` → `pricingRuleClauses({ scope: 'customer', customerId })`
- Form replaced by `<PricingRuleChainEditor compact scope="customer" customerId={customerId} />`
- Save calls `savePricingRuleChain` instead of `setCustomerPricingRule`
- Component retains its location in `RelationshipDrawer` — no relocation

### 7.6 Updated `OrderPricingPanel`

`ruleSourceLabel` extended to handle both old and new source values:

```ts
function ruleSourceLabel(app: PricingRuleApplication): string {
  switch (app.source) {
    // New
    case 'customer-clause': return app.clauseName ? `customer · ${app.clauseName}` : 'customer rule';
    case 'global-clause':   return app.clauseName ? `global · ${app.clauseName}` : 'global rule';
    // Legacy (old journal entries)
    case 'customer-category': return `customer · ${app.category ?? ''}`;
    case 'customer-default':  return 'customer · default';
    case 'settings-category': return `settings · ${app.category ?? ''}`;
    case 'settings-default':  return 'settings · default';
    case 'fallback':          return 'fallback 30%';
  }
}
```

Guardrail indicator: if `guardrailApplied`, show a yellow `⚠` chip beside the unit price showing `Lifted from $X → $Y (guardrail)`.

---

## 8. Test Requirements

### 8.1 New unit tests (required before merge)

- `resolvePricingRuleClause`: category match, subcategory match, tag match, price-range match, AND multi-condition match, customer-first priority, global fallback, no-match fallback 30%, null subcategory → non-match, inactive clause skipped, deleted clause skipped
- `PricingRuleConditionsSchema`: rejects `brandId`, `vendorId`, `intakeDate`; accepts all 5 allowed fields; rejects depth > 3
- `savePricingRuleChain`: global chain without catch-all rejected; priority uniqueness enforced; diff+soft-delete preserves existing IDs; fingerprint mismatch → CONFLICT error; reversal restores prior chain
- `PricingRuleChainEditor`: add condition, remove condition, reorder, save dirty check, catch-all card non-removable (global), CONFLICT modal
- `PricingRulesSummary` tRPC query: single SQL query, no N+1 (assert query count ≤ 2 for any customer count)
- `priceSalesOrder` N+1 guard: 50-line order fetches clauses in ≤ 2 DB queries

### 8.2 Migration parity test (required before migration merge)

20+ representative `CustomerPricingRule` fixtures: empty `{}`, default-only, categories-only, categories+default, categories-only-no-default, single-category, 5-categories+default. For each, assert `resolvePricingRuleEntry(old) == resolvePricingRuleClause(migrated)` across a grid of contexts. Abort migration if any assertion fails.

### 8.3 Blast-radius regression

Existing `pricingCommands.test.ts`, `pricingSchemas.test.ts`, `inventoryPricing.test.ts` must all continue to pass (they test the old code path; the flag keeps both paths active).

---

## 9. Tracked Non-Blockers (for follow-up)

| Finding | Tracking | Rationale |
|---|---|---|
| Drag-and-drop reorder | GitHub Issue | Low priority; up/down buttons sufficient for v1 chains |
| GIN index on `conditions` for rules-by-condition search | GitHub Issue | Needed only if cross-rule reporting workflow emerges |
| Client-side search > 500 customers | GitHub Issue | Document 500-customer cap; server-side pagination if needed |
| Storybook stories for PricingRuleClauseCard compact / readOnly | In-session note | Polish item |
| Performance budget: tab open <500ms, save <300ms p95 | In-session note | Verify post-implementation |

---

## 10. AQA Finding Disposition

| # | Severity | Finding | Status |
|---|---|---|---|
| 1 | BLOCKER | unitPrice circular in context | Fixed: renamed `batchPostedPrice` |
| 2 | BLOCKER | unitCost unresolved before rule fires | Fixed: explicit pipeline §4, COGS required |
| 3 | BLOCKER | Catch-all not enforced server-side | Fixed: Zod + command handler invariant |
| 4 | BLOCKER | Deprecated alias reversal shape mismatch | Fixed: aliases tombstoned, reject with error |
| 5 | BLOCKER | clauseId dangling after delete-then-insert | Fixed: diff+soft-delete preserves IDs |
| 6 | BLOCKER | Zod allow-list not enforced | Fixed: `PricingRuleConditionsSchema` |
| 7 | HIGH | Migration category ordering non-deterministic | Fixed: alphabetical ASCII |
| 8 | HIGH | Legacy JSONB drift | Fixed: nulled post-migration; blast radius table |
| 9 | HIGH | Guardrail interaction unspecified | Fixed: §4 pipeline, audit delta, yellow chip |
| 10 | HIGH | Concurrent saves silently overwrite | Fixed: chainFingerprint + CONFLICT error |
| 11 | HIGH | Priority collisions non-deterministic | Fixed: UNIQUE constraint + dense renumber |
| 12 | HIGH | reorderPricingRuleClause redundant | Fixed: deleted; reorder draft-only |
| 13 | HIGH | Old source enum backward compat | Fixed: union type preserved, both cases handled |
| 14 | HIGH | pricingRuleConsolidated unbounded | Fixed: renamed to pricingRulesSummary, summary-only + lazy load |
| 15 | HIGH | Fresh installs have no catch-all | Fixed: seed + migration ensure global catch-all |
| 16 | HIGH | Migration not idempotent | Fixed: migration_source column + skip-if-exists |
| 17–32 | MEDIUM | (16 findings) | All addressed in §§3-8 above |
| 33–42 | LOW | (10 findings) | All addressed in §§7-8 above |

