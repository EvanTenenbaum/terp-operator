# Customer Credit Limits System — Design Spec (v4)

**Date:** 2026-05-18
**Status:** Draft v4 (incorporates third-round Design Review Gate findings)
**Pattern:** Adaptive credit engine derived from historical TERP credit engine, integrated into current TERP Operator architecture
**Supersedes:** Draft v1 (same date) — see §Changelog at bottom for what changed and why

---

## Problem

TERP Operator today carries a manually-set credit limit per customer (`customers.credit_limit`) and a one-off `credit_overrides` escalation safety valve. There is no engine that *derives* a credit limit from a customer's payment behavior, revenue contribution, or financial signals — operators must set every number by hand and remember to revisit it.

The historical TERP system included a credit engine that combined six behavioral signals into a creditworthiness score and translated that score into a recommended dollar limit. We want to bring that capability into TERP Operator with the following operator affordances layered on top:

1. **Stance** — a named bundle of signal weights (e.g., "Prioritize Cash", "Prioritize Revenue") chosen globally with optional per-customer override.
2. **Tunable weights** — weights live inside stance definitions and can be edited from a settings view.
3. **Manual override per customer** — operator can set a custom credit limit that sticks, with a stale-banner reminder after a configurable period.

The system must integrate seamlessly into the existing command-bus / row-native architecture: no new infrastructure, audit-trail preserved through the command journal, **recompute must not block primary commerce (sales, payments, ledger).**

---

## Solution

A new in-process **Credit Engine** service module (`src/server/services/creditEngine/`) computes a creditworthiness score for each customer from six behavioral signals, weighted according to the customer's effective stance, and converts that score into a dollar limit (base × multiplier).

**Recompute is asynchronous and queue-driven.** State-changing commands (invoices posted, payments recorded, ledger rows committed, stance edits, etc.) write a row to a `credit_recompute_queue` table inside the triggering transaction (~1ms). A background worker drains the queue, executing each recompute in its own short transaction. The sale-confirm hard-block continues to read the previous `customers.credit_limit`; eventual consistency on the order of seconds is acceptable for an adaptive limit.

Each compute produces a row in an append-only `customer_credit_assessments` table (full signal breakdown) and updates the denormalized `customers.credit_limit` field when the customer's limit source is `engine`.

**Rollout uses a mandatory shadow mode.** For the first two weeks (or until a divergence-tolerance KPI is hit), the engine writes assessments for every customer but does *not* write to `customers.credit_limit`. A divergence report drives operator opt-in via a journaled bulk-revert command.

Operators can:
- Pick a global stance and create/edit named stances with custom weights
- Override the stance on any individual customer
- Set a per-customer **engine max** that the engine cannot exceed
- Override the credit limit manually (with a free-text reason) — the customer's `credit_limit_source` flips to `manual` and the engine stops applying; engine still computes and stores recommendations
- Disable the engine per customer entirely (owner role, journaled)
- See full signal breakdown with plain-English labels, current vs. recommended limit, delta with risk framing, engine recommendation history, on the customer profile
- See stale-override warnings on the customer profile AND a dedicated "Credit Review Queue" view (NOT in the sales workspace)

The existing hard-block at sale confirm/post is preserved (`balance + order.total > credit_limit` → block, request `credit_override`). The change is in how `credit_limit` gets set, not in how it is enforced.

---

## Functional Requirements (Locked)

| Decision | Value |
|---|---|
| Signals | All 6: revenue momentum, cash collection, profitability, debt aging, repayment velocity, tenure depth |
| Math model | Weighted score → base × multiplier |
| Cold start | Operator-set until threshold; engine takes over when ALL of: ≥3 posted invoices, ≥60 days tenure, computed base > 0 |
| Engine max | Per-customer cap on engine output (renamed from "ceiling" for clarity) |
| Manual override | Operator overrides freely; reason field required and logged |
| Migration | Mandatory 2-week shadow mode; journaled bulk-revert command for opt-in |
| Recompute cadence | Queue-driven (event-enqueued) + nightly safety-net enqueue |
| Visibility | Plain-English signal labels with score-on-toggle on customer profile |
| Stance scope | Global default + per-customer override |
| Manual override reminder | Stale indicator on customer profile + dedicated "Credit Review Queue" view (NOT sales workspace) |

---

## 1. Signal Definitions

All six signals score from **0 to 100** (higher = better creditworthiness). Each signal is a pure function of base-table data. All signals are deterministic and idempotent. **Each signal's SQL must apply explicit input guards** (see §1.0).

### 1.0 Universal Signal Input Guards

Every signal query MUST apply these filters before aggregation:

```
invoices:        WHERE total >= 0 AND issued_at <= now() AND status != 'voided'
sales_orders:    WHERE total >= 0 AND posted_at <= now() AND status != 'voided'
sales_order_lines: WHERE qty > 0 AND unit_cost > 0
payments:        WHERE amount >= 0 AND created_at <= now() AND status = 'posted'
```

These guards prevent signal manipulation via data-entry errors (negative invoice totals, future-dated invoices, refunds-as-negative). Refund handling is explicit in each signal where relevant; refunds do not leak through `amount_paid`.

### 1.1 Revenue Momentum

**Intent:** Is this customer's purchasing trending up or down?

```
recent_revenue   = sum(invoices.total) where issued_at >= now() - 90d, guards applied
baseline_revenue = sum(invoices.total) where issued_at between now() - 270d and now() - 90d, guards applied

if baseline_revenue == 0 and recent_revenue == 0:
  score = 50
elif baseline_revenue == 0:
  score = 75
else:
  growth_ratio = (recent_revenue * 3) / baseline_revenue   # normalize 6-mo baseline to 90-day equivalent
  score = clamp(round(50 + (growth_ratio - 1) * 50), 0, 100)
```

### 1.2 Cash Collection

**Intent:** What share of invoiced dollars actually get paid?

```
window = invoices issued in last 365 days, guards applied, status != 'voided'
invoiced = sum(window.total)
paid     = sum(window.amount_paid)

if invoiced == 0:
  score = 50
else:
  collection_rate = paid / invoiced
  score = clamp(round(collection_rate * 100), 0, 100)
```

### 1.3 Profitability

**Intent:** What margin do we make on this customer?

**Data dependency confirmation required before implementation:** `sales_order_lines.unit_cost` is assumed present. If audit shows it is null for historical lines, fall back to `batches.unit_cost` resolved via the allocation. If even the fallback is incomplete (>20% null), this signal is **deferred to v1.1** rather than fabricated — operator UI shows `Profitability: data incomplete` until backfill is done.

```
window = sales_orders posted in last 365 days, guards applied
revenue = sum(sales_orders.total)
cogs    = sum(line.qty * line.unit_cost) across joined sales_order_lines

if revenue == 0:
  score = 50
else:
  margin_rate = (revenue - cogs) / revenue
  score = clamp(round(margin_rate * 200), 0, 100)   # 50% margin → 100
```

### 1.4 Debt Aging (revised: net-terms-aware, dispute-excluding)

**Intent:** How overdue is this customer's outstanding debt, *relative to their agreed payment terms*?

Net 30/45/60 customers paying *on schedule* should NOT be penalized. Aging is measured from `invoices.due_date`, not `invoices.issued_at`. Disputed invoices are excluded until resolved.

```
open_invoices = invoices where
  status in ('open','posted','partial')
  AND total > amount_paid                             -- has open balance
  AND NOT EXISTS (
    SELECT 1 FROM invoice_disputes d
    WHERE d.invoice_id = invoices.id AND d.status = 'open'
  )

For each open invoice:
  open_balance = total - amount_paid
  days_overdue = max(0, (now() - due_date) in days)   -- 0 if not yet due

total_open = sum(open_balance)
if total_open == 0:
  score = 100
else:
  weighted_days_overdue = sum(days_overdue * open_balance) / total_open
  # 0d overdue → 100, 15d → 70, 30d → 40, 60d+ → 10 (piecewise)
  if weighted_days_overdue == 0:           score = 100
  elif weighted_days_overdue < 15:         score = round(100 - weighted_days_overdue * 30/15)
  elif weighted_days_overdue < 30:         score = round(70 - (weighted_days_overdue - 15) * 30/15)
  elif weighted_days_overdue < 60:         score = round(40 - (weighted_days_overdue - 30) * 30/30)
  else:                                    score = 10
```

This change means a customer on Net 60 terms with a $10K invoice 30 days post-issue but 30 days before due date now scores 100 (not yet due) — correct. Same customer 30 days *past* their due date scores 40 — correctly penalized.

### 1.5 Repayment Velocity

**Intent:** How fast does this customer pay invoices once due?

Revised similarly to §1.4 — measure relative to due_date, not issue_at, so net-terms customers are not penalized for using their terms.

```
paid_invoices = invoices where
  status = 'paid', guards applied,
  issued_at within last 365 days

For each: days_late = max(0, (paid_at - due_date) in days)

if count(paid_invoices) == 0:
  score = 50
else:
  avg_days_late = avg(days_late)
  # 0 → 100, 10 → 60, 30 → 20, 60+ → 0
  score = clamp(round(100 - avg_days_late * (40/10)), 0, 100)
```

### 1.6 Tenure Depth

**Intent:** How long has this customer been with us?

```
days_active = (now() - customers.created_at) in days

if days_active < 180:        score = round(days_active * 50 / 180)
elif days_active < 365:      score = round(50 + (days_active - 180) * 25 / 185)
elif days_active < 730:      score = round(75 + (days_active - 365) * 15 / 365)
elif days_active < 1095:     score = round(90 + (days_active - 730) * 10 / 365)
else:                        score = 100
```

### 1.7 Signal Confidence Indicator

In addition to a score (0–100), every signal returns a **confidence level** consumed by the UI:

| Confidence | Condition |
|---|---|
| `high` | ≥10 data points in the signal's window |
| `medium` | 3–9 data points |
| `low` | 1–2 data points |
| `none` | 0 data points (signal returns 50 / neutral) |

This drives the operator UI affordance "based on 47 invoices" vs "based on 2 invoices" so operators know how much to trust the score.

---

## 2. Math Model

### 2.1 Score Aggregation

```
weights = effective stance weights (must sum to 100, no single weight > 50 without ack)
overall_score = round(sum(signal[i].score * weights[i]) / 100)
```

### 2.2 Limit Calculation: Base × Multiplier

```
base = max(
  avg_monthly_revenue_last_6_months,   -- guards applied
  median_invoice_total_last_12_months
)

multiplier = map_score_to_multiplier(overall_score)
# Default piecewise (tunable per stance):
#   0-19   → 0.0
#   20-39  → 0.5
#   40-59  → 1.0
#   60-79  → 2.0
#   80-89  → 3.0
#   90-100 → 4.0

raw_limit = base * multiplier
final_limit = min(raw_limit, customer.engine_max ?? raw_limit)
# DB-enforced upper bound: multiplier <= 10.0, final_limit <= 100_000_000 (see §4)
```

### 2.3 Worked Example

Customer "Harbor Logistics" — 14 months tenure, $15K avg monthly revenue, paid 92% of invoices, avg 8 days late (on Net 30), 22% margin, slight growth, $3K open invoice, 8 days past due.

Using the default "Balanced" stance (weights 20/20/15/15/20/10):

| Signal | Score | Confidence | Weight | Contribution |
|---|---|---|---|---|
| Revenue momentum | 60 | high | 20 | 12.0 |
| Cash collection | 92 | high | 20 | 18.4 |
| Profitability | 44 | high | 15 | 6.6 |
| Debt aging | 84 | high | 15 | 12.6 |
| Repayment velocity | 68 | high | 20 | 13.6 |
| Tenure depth | 71 | high | 10 | 7.1 |
| **Overall** | — | — | 100 | **70** |

Multiplier for score 70 → 2.0. Base = $15,000. Raw limit = $30,000. No engine_max set → final limit = **$30,000**.

---

## 3. Stance System

A **stance** is a named bundle of signal weights. One stance is the global default; any customer can override which stance applies to them. Weights live in `credit_engine_stances`.

### 3.1 Default Seeded Stances

| Name | Description | Revenue | Cash | Profit | Debt | Velocity | Tenure |
|---|---|---|---|---|---|---|---|
| Balanced | Default; even-handed | 20 | 20 | 15 | 15 | 20 | 10 |
| Prioritize Cash | Reward customers who pay fast and pay in full | 5 | 35 | 5 | 20 | 30 | 5 |
| Prioritize Revenue | Reward growth and volume | 35 | 10 | 25 | 10 | 10 | 10 |
| Conservative | Penalize debt and slow payers heavily | 5 | 25 | 10 | 35 | 20 | 5 |
| Loyalty-Weighted | Reward long-term customers | 15 | 15 | 15 | 15 | 15 | 25 |

### 3.2 Effective Stance Resolution

```
effective_stance(customer) =
  customer.stance_id if customer.stance_id is not null
  else credit_engine_config.global_default_stance_id
```

### 3.3 Stance Edit Anti-Manipulation Guards

- DB CHECK: weights sum to 100, each weight 0–100
- **Application-level CHECK: no single weight may exceed 50** unless the command payload includes both `acknowledgeExtremeWeights: true` AND a non-empty `extremeWeightJustification` text field (min 12 chars). The justification is persisted in `credit_engine_stance_history.post_state` alongside the new weights so the audit trail records the operator's stated reason. Prevents drive-by edits that collapse the engine to one signal.
- **Stance edits do not recompute synchronously.** They enqueue a recompute for every customer using that stance. Operator UI shows "N customers will be re-evaluated; processing in background" rather than a slow synchronous request.
- **Dry-run preview** required before commit: operator UI calls `previewStanceEdit({ stanceId, newWeights })` which returns a sample of customers and the % delta in their final_limit under the new weights. Operator must explicitly confirm if any sampled customer's limit changes by >25%.
- Stance edits required role: **owner**, not manager (Security F2).
- Every stance edit is journaled with the pre/post weight set.

---

## 4. Data Model

### 4.1 New Tables

#### `credit_engine_stances`

```sql
CREATE TABLE credit_engine_stances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(80) NOT NULL UNIQUE,
  description text,
  weight_revenue_momentum    integer NOT NULL,
  weight_cash_collection     integer NOT NULL,
  weight_profitability       integer NOT NULL,
  weight_debt_aging          integer NOT NULL,
  weight_repayment_velocity  integer NOT NULL,
  weight_tenure_depth        integer NOT NULL,
  is_seeded boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT credit_engine_stances_weights_sum CHECK (
    weight_revenue_momentum + weight_cash_collection + weight_profitability +
    weight_debt_aging + weight_repayment_velocity + weight_tenure_depth = 100
  ),
  CONSTRAINT credit_engine_stances_weights_nonneg CHECK (
    weight_revenue_momentum >= 0 AND weight_cash_collection >= 0 AND
    weight_profitability >= 0 AND weight_debt_aging >= 0 AND
    weight_repayment_velocity >= 0 AND weight_tenure_depth >= 0
  )
);
```

#### `credit_engine_config`

Single-row config (single-row enforced in app code; table seeded with one row at migration).

```sql
CREATE TABLE credit_engine_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  global_default_stance_id uuid NOT NULL REFERENCES credit_engine_stances(id) ON DELETE RESTRICT,
  cold_start_min_posted_invoices integer NOT NULL DEFAULT 3,
  cold_start_min_tenure_days integer NOT NULL DEFAULT 60,
  manual_override_reminder_default_days integer NOT NULL DEFAULT 60,
  manual_override_snooze_cap_days integer NOT NULL DEFAULT 365,
  shadow_mode boolean NOT NULL DEFAULT true,        -- starts true at migration; flipped false post-rollout
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES users(id)
);
```

#### `credit_engine_config_history` — append-only audit (Security F1)

```sql
CREATE TABLE credit_engine_config_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  changed_at timestamptz NOT NULL DEFAULT now(),
  changed_by uuid NOT NULL REFERENCES users(id),
  command_id uuid REFERENCES command_journal(id),
  pre_state jsonb NOT NULL,
  post_state jsonb NOT NULL
);
```

`setCreditEngineConfig` is the only command that may write `credit_engine_config`, and it MUST also append a row here in the same transaction.

#### `credit_engine_stance_history` — append-only audit (Security F2)

```sql
CREATE TABLE credit_engine_stance_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stance_id uuid NOT NULL,                          -- not FK: preserve history through stance delete
  changed_at timestamptz NOT NULL DEFAULT now(),
  changed_by uuid NOT NULL REFERENCES users(id),
  command_id uuid REFERENCES command_journal(id),
  action varchar(16) NOT NULL CHECK (action IN ('create','update','delete')),
  pre_state jsonb,
  post_state jsonb,
  affected_customer_count integer                   -- materialized at edit time for forensic value
);
```

#### `customer_credit_assessments`

Append-only per compute.

```sql
CREATE TABLE customer_credit_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  stance_id uuid NOT NULL REFERENCES credit_engine_stances(id) ON DELETE RESTRICT,

  -- Signal scores (0–100 each)
  score_revenue_momentum   integer NOT NULL CHECK (score_revenue_momentum BETWEEN 0 AND 100),
  score_cash_collection    integer NOT NULL CHECK (score_cash_collection BETWEEN 0 AND 100),
  score_profitability      integer NOT NULL CHECK (score_profitability BETWEEN 0 AND 100),
  score_debt_aging         integer NOT NULL CHECK (score_debt_aging BETWEEN 0 AND 100),
  score_repayment_velocity integer NOT NULL CHECK (score_repayment_velocity BETWEEN 0 AND 100),
  score_tenure_depth       integer NOT NULL CHECK (score_tenure_depth BETWEEN 0 AND 100),

  -- Per-signal confidence (mirrors §1.7)
  confidence_revenue_momentum   varchar(8) NOT NULL,
  confidence_cash_collection    varchar(8) NOT NULL,
  confidence_profitability      varchar(8) NOT NULL,
  confidence_debt_aging         varchar(8) NOT NULL,
  confidence_repayment_velocity varchar(8) NOT NULL,
  confidence_tenure_depth       varchar(8) NOT NULL,

  -- Weighted output
  overall_score    integer NOT NULL CHECK (overall_score BETWEEN 0 AND 100),
  base_amount      numeric(12,2) NOT NULL CHECK (base_amount >= 0),
  multiplier       numeric(5,2)  NOT NULL CHECK (multiplier >= 0 AND multiplier <= 10.0),
  recommended_limit numeric(12,2) NOT NULL CHECK (recommended_limit >= 0 AND recommended_limit <= 100000000),
  engine_max_applied numeric(12,2),
  final_limit       numeric(12,2) NOT NULL CHECK (final_limit >= 0 AND final_limit <= 100000000),

  -- Provenance (Security F7)
  triggered_by varchar(32) NOT NULL CHECK (triggered_by IN (
    'event:postSalesOrder','event:confirmSalesOrder','event:recordPayment',
    'event:allocatePayment','event:postLedgerRow','event:voidInvoice',
    'event:reverseSalesOrder','event:disputeInvoice','event:resolveDispute',
    'event:setEngineMax','event:setStance','event:stanceEdited',
    'nightly','manualTrigger','shadowMode','bulkRevert','reconciliation'
  )),
  triggered_by_command_id uuid REFERENCES command_journal(id),

  applied boolean NOT NULL,                         -- false in shadow mode or when source='manual' or disabled

  -- Idempotency
  idempotency_key text UNIQUE,                      -- nullable; set by worker for retry safety

  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX customer_credit_assessments_customer_idx ON customer_credit_assessments(customer_id, created_at DESC);
CREATE INDEX customer_credit_assessments_stance_idx ON customer_credit_assessments(stance_id);
```

#### `credit_recompute_queue` — replaces in-transaction recompute (Architect F1/F2/F3/F4)

```sql
CREATE TABLE credit_recompute_queue (
  id bigserial PRIMARY KEY,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  enqueued_at timestamptz NOT NULL DEFAULT now(),
  enqueued_by varchar(64) NOT NULL,                 -- e.g., 'event:postSalesOrder'
  command_id uuid REFERENCES command_journal(id),
  attempts integer NOT NULL DEFAULT 0,
  last_attempted_at timestamptz,
  last_error text,
  status varchar(16) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','processing','done','failed_terminal'))
);

-- Deduplication: at most one pending row per customer
CREATE UNIQUE INDEX credit_recompute_queue_pending_unique
  ON credit_recompute_queue(customer_id) WHERE status = 'pending';

CREATE INDEX credit_recompute_queue_status_idx ON credit_recompute_queue(status, enqueued_at);
```

The worker pulls `pending` rows ordered by `enqueued_at`, claims them by flipping to `processing` (with `SKIP LOCKED`), runs the recompute in its own tx, and updates status. Failed rows beyond N attempts (default 5) → `failed_terminal` with the error captured.

### 4.2 Modifications to Existing Tables

#### `customers`

```sql
ALTER TABLE customers
  ADD COLUMN engine_max numeric(12,2),               -- renamed from "credit_ceiling" for clarity
  ADD COLUMN stance_id uuid REFERENCES credit_engine_stances(id) ON DELETE SET NULL,
  ADD COLUMN credit_limit_source varchar(16) NOT NULL DEFAULT 'manual'
    CHECK (credit_limit_source IN ('engine', 'manual')),
  ADD COLUMN engine_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN engine_disabled_at timestamptz,         -- per-customer engine kill switch (CTO F8)
  ADD COLUMN engine_disabled_by uuid REFERENCES users(id),
  ADD COLUMN engine_disabled_reason text,
  ADD COLUMN last_assessment_id uuid REFERENCES customer_credit_assessments(id) ON DELETE SET NULL,
  ADD COLUMN credit_limit_manual_set_at timestamptz,
  ADD COLUMN credit_limit_manual_set_by uuid REFERENCES users(id),
  ADD COLUMN credit_limit_manual_reason text,        -- required when setting manual (Security F3)
  ADD COLUMN credit_limit_reminder_days integer,     -- per-customer override of config default
  ADD COLUMN credit_limit_last_reviewed_at timestamptz,
  ADD COLUMN credit_limit_snooze_count integer NOT NULL DEFAULT 0;
  -- Cumulative snooze cap = config.manual_override_snooze_cap_days from credit_limit_manual_set_at

CREATE INDEX customers_credit_limit_source_idx ON customers(credit_limit_source)
  WHERE credit_limit_source = 'manual';
CREATE INDEX customers_engine_disabled_idx ON customers(engine_disabled_at)
  WHERE engine_disabled_at IS NOT NULL;

-- Invariant guard (Architect F9): when source = engine, last_assessment must exist
ALTER TABLE customers
  ADD CONSTRAINT customers_engine_source_has_assessment CHECK (
    credit_limit_source = 'manual' OR last_assessment_id IS NOT NULL
  ) NOT VALID;
-- NOT VALID at migration time; VALIDATED post-rollout after shadow→engine transition completes
```

### 4.4 `user_dismissed_banners` (small new table)

Tracks per-user dismissal of one-time orientation banners (§11.4.1). Designed for reuse — future onboarding banners can share the same mechanism rather than each inventing its own persistence.

```sql
CREATE TABLE user_dismissed_banners (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  banner_key varchar(64) NOT NULL,
  dismissed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, banner_key)
);
```

Banner key for shadow-mode orientation: `'credit-engine-shadow-mode-orientation'`. Banner key for the shadow-exit follow-up: `'credit-engine-shadow-mode-exited'`.

### 4.5 Why Denormalized?

`customers.credit_limit` stays the canonical fast-read field used by the sale-confirm hard-block check. The previous-tick value is acceptable for that check; the queue worker brings it up to date within seconds of any triggering event.

---

## 5. Engine Service

### 5.1 Module Structure

Existing `src/server/services/` uses flat `*.ts` files. Credit engine deviates intentionally — the engine's surface area (signals, scoring, base, stance resolution, worker, reconciliation) warrants a subdirectory:

```
src/server/services/creditEngine/
  index.ts                  # public API
  signals/                  # one file per signal calculator
    revenueMomentum.ts
    cashCollection.ts
    profitability.ts
    debtAging.ts
    repaymentVelocity.ts
    tenureDepth.ts
    inputGuards.ts          # shared WHERE-clause helpers
  scoring.ts
  base.ts
  effectiveStance.ts
  coldStart.ts
  assessment.ts
  enqueue.ts                # event-side: write queue row
  worker.ts                 # drain logic
  reconciliation.ts         # drift detection query
  __tests__/                # parallel structure
```

This deviation is documented in `guides/coding-standards.md` as the "engine module" exception.

### 5.2 Public API

```typescript
// Event side — called inside the triggering command's transaction.
// Writes a queue row (~1ms). Idempotent: respects unique-pending index.
export async function enqueueCustomerRecompute(
  tx: Tx,
  customerId: string,
  source: TriggerSource,
  commandId: string | null
): Promise<void>;

// Worker side — own transaction per customer.
// Returns the new assessment id or null if skipped (e.g., engine disabled).
export async function processOneRecompute(
  queueRowId: number
): Promise<{ assessmentId: string | null; applied: boolean; finalLimit: number | null }>;

// Bulk paths
export async function enqueueAllCustomers(
  source: 'nightly' | 'manualBulk' | 'stanceEdit',
  filter?: { stanceId?: string }
): Promise<{ enqueued: number }>;

// Forensic
export async function reconcileLimitDrift(): Promise<DriftReport>;
```

### 5.3 Worker Flow

```
processOneRecompute(queueRowId):
  1. tx.begin
  2. UPDATE credit_recompute_queue SET status='processing', last_attempted_at=now(), attempts=attempts+1
     WHERE id=queueRowId AND status='pending'
     RETURNING customer_id, enqueued_by, command_id
     -- if no row returned (another worker grabbed it or already done), tx.rollback and exit
  2a. idempotency_key = sha256(customer_id::text || ':' || queueRowId::text)
      -- Stable across retries of the same queue row; assessment table's UNIQUE constraint
      -- prevents double-insert if step 9 commits but step 13 doesn't (partial-commit retry)
  3. SELECT customer FOR UPDATE   (safe: no outer caller holds this lock)
  4. If customer.engine_disabled_at is set:
       insert assessment row (applied=false, ...), update queue=done, tx.commit, return
  5. Cold-start gate: if not engine_enabled, check (≥3 invoices AND ≥60d tenure AND base>0)
     - If gate passes: set customer.engine_enabled=true
     - Else: insert assessment (applied=false), queue=done, tx.commit, return
  6. Compute 6 signals (with confidence levels) using input-guarded queries
  7. Compute overall_score = weighted sum from effective stance
  8. Compute base, multiplier, recommended_limit, final_limit (clamped to engine_max)
  9. Insert customer_credit_assessments row (with idempotency_key from step 2a):
     INSERT ... ON CONFLICT (idempotency_key) DO NOTHING RETURNING id
     - If RETURNING yields an id: this is a fresh insert; use that id in steps 10–12.
     - If RETURNING yields zero rows (a prior partial-commit retry already inserted):
         SELECT id FROM customer_credit_assessments WHERE idempotency_key = $1
       and use the existing id in steps 10–12 (so customers.last_assessment_id always
       points at a real assessment row and the customers_engine_source_has_assessment
       CHECK constraint is never violated).
 10. If credit_engine_config.shadow_mode = true:
       UPDATE customers SET last_assessment_id = new.id   -- engine recommendation visible, not applied
       assessment.applied = false
 11. Else if customer.credit_limit_source = 'engine':
       UPDATE customers SET credit_limit = final_limit, last_assessment_id = new.id
       assessment.applied = true
 12. Else (manual):
       UPDATE customers SET last_assessment_id = new.id
       assessment.applied = false
 13. UPDATE credit_recompute_queue SET status='done'
 14. tx.commit
```

Failures: caught, `last_error` recorded, status returns to `pending`. After `attempts >= 5`, status flips to `failed_terminal` and a structured-log alert fires (see §15).

### 5.3.1 Crashed-Worker Reaper

If a worker process crashes mid-process (OS kill, OOM, network partition), the queue row is stranded in `processing` indefinitely. A small reaper job runs every 60 seconds:

```sql
UPDATE credit_recompute_queue
SET status = 'pending',
    last_error = COALESCE(last_error, '') || ' [reaped from stale processing]'
WHERE status = 'processing'
  AND last_attempted_at < now() - INTERVAL '10 minutes';
```

10 minutes is well above the worker's per-row latency budget (target ≤100ms) so a healthy worker never has its rows reaped. Stale-processing-row count is exposed as a metric (§15.1) and alerted (§15.3).

**Edge case — crash before step 2 commits:** If a worker process dies in the very narrow window between `tx.begin` (step 1) and the `UPDATE` (step 2), the row stays `pending` and never registers an attempt. The reaper does not touch this case. It is detectable via the same paged alert: stuck queue depth grows even though the queue row isn't `processing`. The narrow window makes this a recovery, not a steady-state, concern.

### 5.4 Why Queue, Not In-Transaction

Original v1 spec proposed in-tx recompute. Architect F1/F2/F3 showed this would:
- **Deadlock** against existing `FOR UPDATE` locks in `postSalesOrder` (commandBus.ts:1676) and `allocatePayment` (commandBus.ts:1917)
- Add 50–100ms of unrelated work to every sale/payment p99
- Roll back primary commerce on any signal-calculator bug

The queue model resolves all three: enqueue is ~1ms with one INSERT, worker holds its own brief locks without nesting, failures don't touch primary commerce. Eventual consistency on the order of seconds is acceptable because the hard-block uses the *previous* applied limit — which is always self-consistent with itself.

### 5.5 Worker Process Model

The worker is invoked in three ways:
1. **In-app polling loop** (production default): a single long-lived `setInterval` in the main Node process polls every 2 seconds for pending queue rows, claims via `SKIP LOCKED`, and processes one at a time. At worker startup, the process acquires `pg_advisory_lock(CREDIT_WORKER_LOCK_KEY)` (a constant 64-bit integer, e.g., hash of `'credit-engine-worker'`). Postgres releases advisory locks automatically when the holding session disconnects, so a crashed primary worker frees the lock and any standby Node process polling for it can take over on its next poll tick (≤2s gap). This is acceptable: brief unavailability of the worker does not affect primary commerce — only the recompute lag grows during the gap.
2. **`pnpm credit-engine:drain`** (operational): manually drain the queue to empty (useful for migrations or post-deploy).
3. **`pnpm credit-engine:nightly`** (scheduled): bulk-enqueue every customer, then drain.

Latency budget: end-to-end (enqueue → applied) target < 5 seconds at p95 under normal load. Queue depth and per-customer process time are exported as metrics (§15).

---

## 6. Event Hooks

Commands in `src/server/services/commandBus.ts` that change customer state get a single `enqueueCustomerRecompute` call appended after their existing logic, inside the same tx. This is ~1ms per call.

| Command | Source string |
|---|---|
| `postSalesOrder` / `confirmSalesOrder` | `event:confirmSalesOrder` |
| `recordPayment` / `allocatePayment` | `event:recordPayment` / `event:allocatePayment` |
| `postTransactionLedgerRow` (customer entity) | `event:postLedgerRow` |
| `voidInvoice` | `event:voidInvoice` |
| `reverseSalesOrder` | `event:reverseSalesOrder` |
| `disputeInvoice` / `resolveDispute` | `event:disputeInvoice` / `event:resolveDispute` |
| `setCustomerEngineMax` | `event:setEngineMax` |
| `setCustomerStance` | `event:setStance` |
| `updateCreditEngineStance` (bulk) | `event:stanceEdited` (enqueues all using-customers) |

A helper keeps call sites one-liners:

```typescript
async function enqueueCreditRecompute(
  tx: Tx, customerId: string, source: TriggerSource, commandId: string
): Promise<void> {
  await tx.insert(creditRecomputeQueue)
    .values({ customerId, enqueuedBy: source, commandId })
    .onConflictDoNothing();   // unique-pending index ensures dedup
}
```

**Reversal correctness (Architect F6):** signal filters already exclude `status='voided'` (§1.0). An integration test will assert: post invoice → enqueue → process → score X; void invoice → enqueue → process → score Y; Y matches a customer who never had the invoice (within rounding).

---

## 7. Nightly Safety Net

### 7.1 Why Nightly

Tenure and aging windows roll forward every day without an event. An idle customer's signals would drift indefinitely without a periodic full sweep.

### 7.2 Implementation

`pnpm credit-engine:nightly` calls `enqueueAllCustomers({ source: 'nightly' })` with dirty-row optimization:

```
For each customer:
  if customer.engine_disabled_at IS NOT NULL: skip
  if last_assessment within last 12h AND no signal-window crossing today: skip
  else: enqueue
```

Worker drains naturally. Estimated load on 5k customers: ~few thousand enqueued, processed over ~30 minutes given the 2s polling. Scaling beyond 10k customers may require parallelizing the worker — flagged in §15.

### 7.3 Scheduling

Initial recommendation: run via in-app scheduled task (single-process, last-run timestamp persisted to a config table). Falls back to a system cron or App Platform scheduled job; either invokes the same script. Either way: alerting (§15) catches a missed run within 24 hours.

---

## 8. Override Behavior

### 8.1 Setting a Manual Limit

`setCustomerCreditLimit({ customerId, amount, reason })`:

```
1. amount ≥ 0 validated
2. reason required (text, min 4 chars) — was optional in v1, now required (Security F3)
3. If amount > current engine recommendation * 1.5:
     Require role = owner   (Security F3)
   Else:
     Require role = manager
4. Update customers SET
     credit_limit = amount,
     credit_limit_source = 'manual',
     credit_limit_manual_set_at = now(),
     credit_limit_manual_set_by = user.id,
     credit_limit_manual_reason = reason,
     credit_limit_last_reviewed_at = now(),
     credit_limit_snooze_count = 0
   WHERE id = customerId
5. Insert command_journal row
6. Enqueue recompute (engine still computes recommendations; just doesn't apply)
```

### 8.2 Reverting to Engine

`revertCustomerCreditToEngine({ customerId })`:

```
1. Require role = manager
2. Update customers SET
     credit_limit_source = 'engine',
     credit_limit_manual_set_at = NULL,
     credit_limit_manual_set_by = NULL,
     credit_limit_manual_reason = NULL,
     credit_limit_last_reviewed_at = NULL,
     credit_limit_snooze_count = 0
   WHERE id = customerId
3. Enqueue recompute (worker will write the engine limit on next pass)
4. Insert command_journal row
```

### 8.3 Snoozing the Reminder

`snoozeCustomerCreditReminder({ customerId, newReminderDays? })`:

- **Required role: manager** (Security F4 — was sales)
- **Cumulative snooze cap (Security F4):** if `(now() - credit_limit_manual_set_at) > credit_engine_config.manual_override_snooze_cap_days`, the snooze is REJECTED with an explicit error directing the operator to revert to engine OR call `setCustomerCreditLimit` again (re-acknowledging the value).
- `credit_limit_last_reviewed_at = now()`
- `credit_limit_snooze_count += 1`
- Optional `newReminderDays` updates the per-customer reminder cadence
- Journaled

### 8.4 Disabling Engine Per Customer (new — CTO F8)

`disableCreditEngineForCustomer({ customerId, reason })`:

- **Required role: owner**
- `reason` required
- Sets `engine_disabled_at = now()`, `engine_disabled_by = user.id`, `engine_disabled_reason = reason`
- Flips `credit_limit_source = 'manual'` if not already
- Engine continues to compute assessments (so the operator can see what it *would* recommend) but `applied = false` always
- Re-enable via `enableCreditEngineForCustomer({ customerId })` (clears the three columns)

### 8.5 Reminder Computation

A customer's manual override is **stale** when:

```
customers.credit_limit_source = 'manual'
AND (now() - COALESCE(credit_limit_last_reviewed_at, credit_limit_manual_set_at)) >
    INTERVAL (COALESCE(credit_limit_reminder_days, credit_engine_config.manual_override_reminder_default_days)) DAYS
```

Computed at query time on the customer profile and the dedicated "Credit Review Queue" view. **Not surfaced in the sales workspace** (PM F2 / Designer F3 — operators reflexively dismiss interruptions at sale time).

---

## 9. Cold-Start Rules

The customer's `engine_enabled` flips from `false` to `true` on the first worker pass that meets **ALL** of:

```
count(invoices where customer_id = customer.id AND status IN ('posted','partial','paid')) >=
    credit_engine_config.cold_start_min_posted_invoices   (default 3)
AND
(now() - customers.created_at) >= INTERVAL credit_engine_config.cold_start_min_tenure_days DAYS   (default 60)
AND
computed_base > 0
```

The `base > 0` requirement (PM F3) prevents the "engine recommends $0" edge case where a customer has a few months on the books but no posted invoices.

Until the gate passes, the engine still writes assessment rows on every event (with `applied=false`) so operators can see what the engine *would* recommend — accompanied by an explicit UI label: "Engine warming up — needs N more posted invoices / M more days / first sale".

---

## 10. Shadow Mode + Rollout (NEW — CTO F1)

### 10.1 Mandatory Shadow Phase

After migration, `credit_engine_config.shadow_mode = true` is enforced. While shadow_mode is true:

- All event hooks enqueue normally
- Worker computes and writes assessments for every customer
- Worker **never writes to** `customers.credit_limit` (assessment.applied = false always)
- Operators see engine recommendations on customer profiles labeled "Shadow — not applied"
- A **Divergence Report** view shows, for every customer:
  - Current manual limit
  - Engine recommendation
  - Delta (absolute + %)
  - Confidence summary
  - Suggested action (`Engine recommends raising`, `Engine recommends lowering`, `Within tolerance`)

### 10.2 "Engine Is Right" Criterion (CTO F3)

Shadow mode exits when a numerical KPI is met. **Proposed defaults (Evan to confirm):**

- 75% of customers with engine recommendation within ±30% of current manual limit
- Zero customers with confidence_overall = `none` and applied recommendation > $0
- Zero customers where engine recommends $0 but customer currently transacts (would block sales on enable)

The KPI evaluation lives in `reconciliation.ts` and is exposed via the Divergence Report. Going live is gated on operator review of this report.

### 10.3 Going Live

`bulkRevertCustomersToEngine({ filter? })` — **owner role, journaled** (Security F9, was an unauthenticated script in v1):

```
1. Validate caller role = owner
2. Read shadow_mode KPI — refuse if not met (unless force=true with explicit ack)
3. For each customer matching filter (default: all customers without engine_disabled_at set):
     a. credit_limit_source = 'engine'
     b. Enqueue recompute (each will pick up its latest assessment value)
     c. Journal a row per customer
4. Set credit_engine_config.shadow_mode = false
```

Single owner-level command, fully journaled. No standalone script.

### 10.4 Migration Itself

`migrations/0005_credit_engine.sql`:

1. Create all new tables (stances, config, config_history, stance_history, assessments, recompute_queue, user_dismissed_banners)
2. Add columns to `customers`
3. Seed the 5 default stances
4. Seed `credit_engine_config` with `shadow_mode = true`, Balanced as global default
5. For every existing customer: set `credit_limit_source = 'manual'` (preserves current value), enqueue a recompute row

**Backfill is NOT in the migration file** (Architect F10). The migration completes quickly; the recompute queue drains in background after deploy. Operators see assessments populate over the following minutes/hours.

---

## 11. UI/UX Integration

### 11.1 Customer Profile — Credit Section

```
┌─ Credit ─────────────────────────────────────────────┐
│ Limit:           $30,000                  [Edit ▾]  │
│ Source:          Engine • Balanced stance            │
│ Outstanding:     $4,200 (14% utilized)               │
│ Engine max:      (not set)              [Set max]   │
│ Stance override: (use global)            [Change]   │
│                                                      │
│ ┌─ Engine assessment ─────────────────────────────┐ │
│ │ Recommendation:   $30,000  (matches current)    │ │
│ │ Confidence:       High (47 invoices in window)  │ │
│ │ Last computed:    Up to date                    │ │
│ │                                                 │ │
│ │ Signal summary:                                 │ │
│ │   Revenue trend       Strong   ⓘ                │ │
│ │   Pays in full        Excellent ⓘ               │ │
│ │   Profit margin       OK       ⓘ                │ │
│ │   Debt overdue        Excellent ⓘ               │ │
│ │   Payment timing      OK       ⓘ                │ │
│ │   Customer tenure     Strong   ⓘ                │ │
│ │   [Show numeric scores]                         │ │
│ │   [View assessment history]                     │ │
│ └─────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────┘
```

**Plain-English labels (Designer F1):**

| Score | Label |
|---|---|
| 0–19 | Critical |
| 20–39 | Weak |
| 40–59 | OK |
| 60–79 | Strong |
| 80–100 | Excellent |
| (none confidence) | Cold-start |

Hovering ⓘ reveals: the numeric score, the confidence count, and a one-line plain-English interpretation (e.g., "Pays in full — 92% of invoiced dollars collected in last 365 days, based on 47 invoices").

**Engine-vs-manual delta with risk framing (Designer F2)** when source = manual:

```
│ Source:  Manual • $5,000 above engine recommendation (+20%)
│          Set 12 days ago by Alice, reason: "VIP buyer; new account exec"
│ Engine recommends: $25,000   [Revert to engine]   [Edit ▾]
```

**Stale state (≥reminder threshold, < snooze cap):**

```
│ ⚠ Manual limit • last reviewed 78 days ago, 12% above engine recommendation
│   [Use engine recommendation instead]
│   [Snooze 60 days]   [Adjust reminder cadence]
```

**Approaching snooze cap (e.g., > 300 days from set_at when cap = 365):**

```
│ ⚠ Manual override has been in place 340 days (cap: 365). Cannot snooze further —
│   re-confirm via Edit or revert to engine.
```

### 11.2 Edit Affordance Confirmation (Designer F6)

Clicking [Edit ▾] on a limit currently sourced from the engine opens:

```
┌─ Edit credit limit ──────────────────────────────┐
│ Editing this limit will switch this customer    │
│ to a MANUAL credit limit. The engine will keep  │
│ computing recommendations but won't apply them. │
│ A reason is required.                           │
│                                                 │
│ Current (engine): $30,000                       │
│ New limit:        [        ]                    │
│ Reason:           [______________________]      │
│                                                 │
│ [Cancel]                  [Save as manual]      │
└─────────────────────────────────────────────────┘
```

### 11.3 Cold-Start Profile State (Designer F7)

```
│ ┌─ Engine assessment ─────────────────────────────┐ │
│ │ Engine warming up.                              │ │
│ │   ✓ Customer tenure: 73 days                    │ │
│ │   ○ Posted invoices: 2 of 3 needed              │ │
│ │   ○ Computed base:   $0 — needs first sale      │ │
│ │ Until ready, limit is whatever you set.         │ │
│ │ Current shadow signals: [Show]                  │ │
│ └─────────────────────────────────────────────────┘ │
```

### 11.4 Settings → Credit Engine

- **Global default stance** dropdown
- **Cold start thresholds**, **default reminder cadence**, **snooze cap** (owner-only edits)
- **Shadow mode toggle** (owner-only; cannot flip back to true once disabled)
- **Stances grid:** name, description, weights summary, customer count, [Edit] [Delete]
- **Divergence Report** link (live during shadow mode; remains available post-rollout for spot checks)

### 11.4.1 Shadow-Mode Day-One Orientation (one-time)

The day the spec ships, every customer profile gains "Engine recommendation" sections that did not exist before. Without explanation, operators flood support with "what is this?" questions.

Add a one-time orientation banner displayed at the top of every operator's session **for the full duration of shadow mode** (auto-dismisses when shadow mode exits; Designer C2). Per-user dismiss is also available via a click and persisted in a new `user_dismissed_banners` table (added in migration 0005, see §4.4 below) — a deliberate small addition rather than overloading an unrelated feature_flag mechanism:

```
┌─ New: Credit engine in shadow mode ────────────────────────────┐
│ TERP is now computing engine credit recommendations alongside │
│ your manual limits. Nothing has changed yet — every customer's│
│ current limit is preserved. The engine is observing for ~2    │
│ weeks before recommendations are applied.                     │
│ [What does this mean?]  [Got it — don't show again]           │
└────────────────────────────────────────────────────────────────┘
```

The [What does this mean?] link routes to `docs/credit-engine.md` (Phase 8 deliverable). When shadow mode exits (`bulkRevertCustomersToEngine` runs successfully), a single follow-up banner fires once: "Engine is now applying recommendations to customers you've opted in. Manual limits remain manual until reverted."

### 11.5 Slider Affordances (Designer F4)

Stance create/edit modal:

```
┌─ Edit stance: Balanced ────────────────────────────┐
│                                                    │
│ Revenue momentum    [====●==========]    20  [-+]  │
│ Cash collection     [====●==========]    20  [-+]  │
│ Profitability       [===●===========]    15  [-+]  │
│ Debt aging          [===●===========]    15  [-+]  │
│ Repayment velocity  [====●==========]    20  [-+]  │
│ Tenure depth        [==●============]    10  [-+]  │
│                                                    │
│ Sum: 100 ✓     [Normalize to 100]                  │
│                                                    │
│ ☐ Auto-balance other weights when one changes      │
│                                                    │
│ ┌─ Preview impact ──────────────────────────────┐  │
│ │ 3 of 12 sampled customers see ±25% change     │  │
│ │   • Harbor Logistics: $30K → $24K (-20%)      │  │
│ │   • Coastal Co:       $18K → $26K (+44%)      │  │
│ │   • Pine Valley:      $5K  → $0   (-100%)     │  │
│ │ [View full preview (1,247 customers)]         │  │
│ └───────────────────────────────────────────────┘  │
│                                                    │
│ [Cancel]            [Save — re-evaluate book]      │
└────────────────────────────────────────────────────┘
```

- Live sum indicator (red when ≠100)
- "Normalize to 100" button auto-scales weights proportionally
- Auto-balance toggle (when on, increasing one weight reduces others proportionally)
- Preview pane fed by `previewStanceEdit` (owner-role command)
- Save disabled until sum=100 and (if any single weight > 50) extreme-weight ack is checked

### 11.6 Credit Review Queue (new view — replaces sales-workspace banner)

A dedicated route `/credit-review` listing customers needing attention. **Nav placement:** main left-side nav, under the Customers section, labeled "Credit Review" with a count badge showing the number of items currently surfaced (e.g., "Credit Review (12)"). Badge is owner/manager-visible only — sales role does not see the link.

**Badge freshness:** the count refetches on (a) route navigation, (b) a 60-second background poll while the operator's session is active, and (c) an in-app `credit-review-changed` event broadcast (via the existing subscription/SSE channel used elsewhere in TERP) whenever a worker writes a state change that affects queue membership — i.e., a manual override is set, reverted, snoozed, an engine is disabled/enabled, or a customer crosses the staleness threshold during a recompute. Operators never need to manually refresh to see an accurate count.

The queue surfaces three categories with separate filter tabs:

1. **Stale manual overrides** — `credit_limit_source = 'manual'` AND staleness conditions met (default tab)
2. **Engine disabled — manual frozen** — `engine_disabled_at IS NOT NULL` (Security N6: prevents disabled-engine customers from falling off review)
3. **Near snooze cap** — manual overrides where `(now() - credit_limit_manual_set_at)` is within 30 days of cap, prompting proactive review before forced re-confirmation

Sortable by: days since review, % delta vs engine recommendation, dollar impact. Action buttons per row: [Open profile] [Revert to engine] [Snooze]. The "Engine disabled" tab additionally surfaces the engine's *shadow* recommendation (kept current by the worker even while disabled) so an audit reviewer can see divergence at a glance.

This replaces the v1 sales-workspace stale banner (PM F2, Designer F3). The sales workspace shows a non-blocking inline indicator ONLY if the current order, given the current customer balance and the engine's recommendation, would now exceed the engine recommendation:

```
ⓘ Engine recommends a lower limit for this customer ($X). Order is OK against current manual limit ($Y).
```

Tiny inline notice, dismissible per session, no banner.

---

## 12. Validation & Business Rules

### Engine

- Signals return 50 for insufficient data, never NaN/null
- Overall score 0–100 (clamped)
- Multiplier 0–10 (DB CHECK)
- Final limit 0–100,000,000 (DB CHECK)
- Assessment rows append-only

### Stances

- Weights sum to 100 (DB CHECK)
- Each weight 0–100 integer (DB CHECK)
- No single weight > 50 without `acknowledgeExtremeWeights: true` flag (application CHECK)
- Stance edits require owner role
- Default stance cannot be deleted; stance with using-customers cannot be deleted without reassignment

### Manual Overrides

- `amount` ≥ 0
- `reason` required (≥4 chars)
- Owner role required if amount > 1.5× engine recommendation
- Engine max is an **engine cap only** — does not constrain operator manual override. Renamed from "ceiling" to make this scope explicit.
- Reminder days ≥ 7

### Snooze

- Manager role required
- Refuses if total days since `credit_limit_manual_set_at` exceeds cap (default 365)

### Engine

- `engine_enabled` flips on automatically once cold-start met
- `engine_disabled_at` set explicitly by `disableCreditEngineForCustomer` (owner)
- Engine disabled does NOT zero the existing `credit_limit` — customer keeps current value as manual

### Sales-Confirm Hard Block

- Unchanged. Reads `customers.credit_limit` (which is updated by worker, lagged by seconds at most under normal load).

---

## 13. Backend Commands

### 13.1 New Commands

| Command | Min role | Reversible | Notes |
|---|---|---|---|
| `setCustomerCreditLimit({ customerId, amount, reason })` | manager (owner if >1.5× engine rec) | yes (revert) | Sets manual; reason required |
| `revertCustomerCreditToEngine({ customerId })` | manager | yes | Source→engine; enqueue recompute |
| `snoozeCustomerCreditReminder({ customerId, newReminderDays? })` | manager | yes | Cumulative cap enforced |
| `setCustomerEngineMax({ customerId, engineMax })` | manager | yes | Per-customer engine cap; enqueue recompute |
| `setCustomerStance({ customerId, stanceId })` | manager | yes | Enqueue recompute |
| `disableCreditEngineForCustomer({ customerId, reason })` | owner | yes | Per-customer kill switch |
| `enableCreditEngineForCustomer({ customerId })` | owner | yes | Clears disable; enqueue recompute |
| `createCreditEngineStance({ name, description, weights, acknowledgeExtremeWeights? })` | owner | yes (delete) | |
| `updateCreditEngineStance({ stanceId, ...fields, acknowledgeExtremeWeights? })` | owner | yes | Enqueues all using-customers via `enqueueAllCustomers({stanceId})` |
| `deleteCreditEngineStance({ stanceId })` | owner | no (terminal) | Refuses if any customer or config references; refuses if default |
| `setCreditEngineConfig({ ... })` | owner | yes | Writes config_history row in same tx |
| `recomputeCustomerCredit({ customerId })` | manager | n/a | Enqueues manual recompute |
| `bulkRevertCustomersToEngine({ filter?, force? })` | owner | n/a | Shadow-mode exit (§10.3); journaled |
| `previewStanceEdit({ stanceId, newWeights, sampleSize? })` | owner (server-side check; not relying on UI gate) | n/a (query) | See §13.1.1 below for sampling and latency contract |
| `previewStanceEditFull({ stanceId, newWeights, page, pageSize })` | owner (server-side check) | n/a (query) | Paginated full-book preview |

### 13.1.1 `previewStanceEdit` Contract

**Sample preview (UI live preview):**

- Input: `stanceId`, `newWeights`, `sampleSize` (default 12, max 24)
- Sampling strategy: stratified-random. Take customers using this stance, bucket by current `overall_score` quintile (0–19, 20–39, 40–59, 60–79, 80–100), randomly select roughly equal counts per bucket up to `sampleSize`. Ensures the preview shows both winners and losers under the new weights, not just a random skew.
- Computation: in-process, no DB writes — replays each sampled customer's *latest assessment's per-signal scores* under the new weights to compute a projected `final_limit`. No actual recompute, so this is a pure transform of stored data. **Trade-off:** a customer whose underlying invoice/payment data has changed since their last assessment will show a projection slightly out-of-date with current reality. Acceptable because preview is for *relative weight comparison* (does this change move customers in the direction we expect?) not for absolute commitment of the final number. The post-save async cascade does compute against current data.
- Latency target: < 500ms for default `sampleSize`. Indexed lookup on `last_assessment_id` + a single round-trip.
- Returns: `[{ customerId, customerName, currentLimit, projectedLimit, deltaPct, deltaAbs, scoreBucket }, ...]`.

**Full preview (`previewStanceEditFull`):**

- Input: `stanceId`, `newWeights`, `page`, `pageSize` (default 50, max 200)
- Same computation, paginated over all using-customers. Sort default: `abs(deltaPct) DESC` so the biggest-impact rows surface first.
- Latency target: < 2s for `pageSize = 50` on 5k-customer stance. If queries exceed this on real data, an index on `customers(stance_id, last_assessment_id)` is added.

**Server-side authorization (Security N2):** both queries explicitly check `user.role === 'owner'` in the query resolver — not relying on UI gates. Failures return HTTP 403, not silently fall back to empty results.

### 13.2 Modified Commands

The following commands call `enqueueCreditRecompute(tx, customerId, source, commandId)` at the end of their existing logic (one new line each):

- `postSalesOrder` / `confirmSalesOrder`
- `recordPayment` / `allocatePayment`
- `postTransactionLedgerRow` (when entity is customer)
- `voidInvoice`
- `reverseSalesOrder`
- `disputeInvoice` / `resolveDispute`

### 13.3 Query Integration

Existing `customer` query returns additional fields:

```typescript
{
  // existing
  creditLimit: number,
  balance: number,

  // new
  engineMax: number | null,
  creditLimitSource: 'engine' | 'manual',
  engineEnabled: boolean,
  engineDisabledAt: string | null,
  stanceId: string | null,
  effectiveStanceName: string,
  manualSetAt: string | null,
  manualSetBy: { id, name } | null,
  manualReason: string | null,
  reminderDays: number | null,
  effectiveReminderDays: number,
  lastReviewedAt: string | null,
  snoozeCount: number,
  isStale: boolean,
  isSnoozeCapped: boolean,            // close to or past cap
  daysToSnoozeCap: number | null,
  lastAssessment: {
    id, createdAt,
    scores: { revenueMomentum, cashCollection, profitability, debtAging, repaymentVelocity, tenureDepth },
    confidences: { ... },
    overallScore, baseAmount, multiplier, recommendedLimit, finalLimit, applied,
    triggeredBy
  } | null,
}
```

New queries (with server-side authorization explicitly enforced in resolver):
- `customerCreditAssessments({ customerId, limit?, offset? })` — paginated history. Min role: **manager** (operator-visible per-customer view)
- `creditEngineStances()` — all stances + global config. Min role: **manager** (read-only)
- `divergenceReport({ filter? })` — shadow-mode driving view; remains available post-rollout. **Leaks portfolio-wide limit data, so min role: owner**
- `creditReviewQueue({ sort?, filterTab? })` — feed for §11.6 view. Min role: **manager** (the operators who'd act on it)
- `creditRecomputeQueueHealth()` — observability surface (pending count, oldest pending, failed_terminal count, stale_processing count). Min role: **manager**

For every query above, the role check runs in the resolver as the first line — not relying on UI route guards. A request from a `sales`-role user to `divergenceReport` returns HTTP 403, not a redacted result. Test coverage MUST include negative-role tests for each of these queries.

**Manager-tier portfolio visibility — explicit decision:** Manager role grants portfolio-wide visibility across all customers in the credit-review and assessments queries. This is a deliberate v1 design decision matching current brokerage operator reality (small team, every manager involved in every customer). Per-customer ACL (e.g., territory-scoped managers) is out of scope for v1 and will be revisited if a multi-territory model is adopted. Documented here to avoid an implicit IDOR-class assumption.

---

## 14. Audit

Every state-changing command journaled via existing `command_journal`. New audit-specific tables:

- `customer_credit_assessments` — append-only, every compute (event-driven, nightly, shadow, manual)
- `credit_engine_config_history` — append-only, every config change
- `credit_engine_stance_history` — append-only, every stance create/edit/delete

The intersection of these three tables answers: "Who changed what, when, and what was the effect across the customer book?"

---

## 15. Observability (NEW — Architect F10)

### 15.1 Metrics

Exported to existing metrics pipeline (`src/server/services/metrics.ts`):

- `credit_recompute_queue_depth` — gauge, pending count
- `credit_recompute_queue_oldest_age_seconds` — gauge
- `credit_recompute_processing_duration_ms` — histogram per processed row
- `credit_recompute_failures_total` — counter (label: terminal vs retried)
- `credit_recompute_failed_terminal_count` — gauge (paged if > 0 for > 1h)
- `credit_recompute_stale_processing_count` — gauge of rows reaped from `processing` (§5.3.1); paged if > 0 for any sustained period
- `credit_assessments_written_total` — counter (label: applied vs not)
- `credit_signal_distribution_*` — six histograms of signal scores across customers (sampled hourly)
- `credit_manual_override_near_owner_threshold_total` — counter incremented whenever `setCustomerCreditLimit` is called with `amount / engine_recommendation` in `[1.4, 1.5)` — feeds SIEM monitoring for "operator gaming the 1.5× ceiling" detection

### 15.2 Structured Logging

Every signal computation logs at debug level: `{ customerId, signal, score, confidence, dataCount, queryMs }`. Operator-facing "why did this number change?" debugging answered by the assessment row's stored scores — logs are for engineer-level diagnosis only.

**SIEM-grade events** (info level, structured, dimensions present for forensic analysis):

- `credit.manual_override.set` — `{ userId, customerId, oldLimit, newLimit, engineRecommendation, ratio, reason, role }`
- `credit.manual_override.near_threshold` — `{ userId, customerId, amount, engineRecommendation, ratio }` — fires when ratio ∈ [1.4, 1.5) (Security N5; counter from §15.1 is for paging, this log carries the dimensions for triage)
- `credit.engine.disabled` — `{ userId, customerId, reason, currentLimit, lastEngineRecommendation }`
- `credit.stance.edit` — `{ userId, stanceId, weightsBefore, weightsAfter, extremeWeightFlag, justification, affectedCustomerCount }`
- `credit.shadow_mode.exited` — `{ userId, kpiSnapshot, customersFlipped }`

### 15.3 Alerts

- **Page** if `credit_recompute_queue_oldest_age_seconds > 600` (10 min — worker stuck or process dead)
- **Page** if `credit_recompute_failed_terminal_count > 0` for > 1h
- **Page** if `credit_recompute_stale_processing_count > 0` after 2 consecutive reaper cycles (worker crash-loop)
- **Alert** (low priority) if nightly safety net hasn't run in 30 hours (missed cron)
- **Alert** (low priority) if `credit_manual_override_near_owner_threshold_total` increments > 3 times for the same customer in 30 days (gaming pattern detection)

### 15.4 Reconciliation Query

`reconcileLimitDrift()` (callable via `pnpm credit-engine:reconcile`) checks:

- Customers with `credit_limit_source = 'engine'` whose `customers.credit_limit` ≠ latest assessment's `final_limit`
- Customers with `credit_limit_source = 'engine'` and `last_assessment_id IS NULL`
- Customers whose latest assessment is > 7 days old (should be < 24h after nightly)

Returns a report; called manually for forensics or by an operator-triggered command (`recomputeAllCustomers`) for repair.

---

## 16. Implementation Sequence

### Phase 0: Data Audit Gate (P0 — must complete before Phase 1 begins)
- Audit `sales_order_lines.unit_cost` coverage across historical lines: % null, distribution, joinability to `batches.unit_cost` fallback.
- Audit `invoices.due_date` population on legacy invoices: are pre-feature invoices populated, or do we need a backfill so net-terms-aware aging works from day one?
- Audit `invoice_disputes.status` taxonomy: confirm `'open'` is the canonical filter value used in §1.4's dispute exclusion.
- **Decision gate:**
  - If `unit_cost` coverage ≥80%: implement profitability (§1.3) in Phase 1.
  - If 50–80%: implement with fallback chain, mark assessments where >20% of revenue uses fallback.
  - If <50%: defer profitability to v1.1, ship the engine with 5 signals, document the gap.
- Profile + write findings to `docs/credit-engine-data-audit-2026-05-XX.md` before Phase 1 implementation begins.

### Phase 1: Schema + Engine Core (P0)
- Migration 0005_credit_engine.sql
- Seed stances, config (shadow_mode = true), enqueue all customers
- Pure signal calculators with input guards (TDD; 6 files OR 5 per Phase 0 outcome)
- Confidence calculation
- Scoring, base, multiplier
- Cold-start gate

### Phase 2: Queue + Worker (P0)
- `credit_recompute_queue` table
- `enqueueCustomerRecompute` helper
- Worker (in-app polling loop)
- `processOneRecompute`
- `pnpm credit-engine:drain` script
- Integration tests: enqueue → process → assessment row → denormalized update
- **Reversal correctness integration test** (Architect F6)

### Phase 3: Event Hooks (P0)
- Wire all listed commands to enqueue
- One-line additions, journaled via existing command journal

### Phase 4: Commands + Override Flow (P0)
- All new commands per §13
- Snooze cap enforcement
- Manual reason validation
- Engine disable/enable per customer
- Stance lifecycle commands with extreme-weight ack

### Phase 5: Shadow Mode + Divergence Report (P0)
- Divergence report query + view
- `bulkRevertCustomersToEngine` command
- "Engine is right" KPI evaluation

### Phase 6: UI (P0)
- Customer profile credit panel (plain-English chips, delta framing, cold-start state)
- Edit confirmation modal
- Stance settings view with sliders + preview pane + extreme-weight ack
- Credit Review Queue view
- Sales workspace inline indicator (non-blocking)

### Phase 7: Observability + Security Test Gate (P0 — gates production launch)
- Metrics exports
- Structured logging including SIEM-grade events
- Reconciliation query + script
- Alert configuration
- **CI gate (Security #5):** no role-gated query or command in `src/server/services/creditEngine/` or in §13 commands ships without a corresponding negative-role test asserting HTTP 403 for under-privileged roles. CI pipeline check fails the build if a new resolver/command is added without its `*.negativeRole.test.ts` counterpart.

### Phase 8: Operator Documentation (P0 — gates production launch)
- `docs/credit-engine.md` operator-readable: worked example, "how to read an assessment row," "what does each signal label mean"

### Phase 9: Nightly Safety Net (P0)
- `pnpm credit-engine:nightly`
- In-app scheduled task with last-run timestamp
- Dirty-row optimization

### Phase 10: Polish (P1)
- Profile assessment-history paginated view
- Stance grid customer-count + delete-warning previews
- Manual operator trigger from profile
- Validation error UX

---

## 17. Open Questions / Decisions Needed (revised)

1. **Shadow-mode KPI thresholds (§10.2) — DECISION REQUIRED BEFORE PHASE 5:** Confirm or adjust the 75% / ±30% defaults. This is the gate between shadow and live; Evan signoff required before Phase 5 (Shadow Mode + Divergence Report) implementation begins, not at runtime. *Recommendation: 75% within ±30% AND zero customers where engine would block existing transacting customer.*

2. **Cold-start thresholds (§9):** 3 invoices AND 60 days AND base > 0. Confirm. *Recommendation: keep.*

3. **Profitability data dependency (§1.3):** Pre-implementation audit required to confirm `sales_order_lines.unit_cost` coverage. If insufficient, defer signal to v1.1. *Recommendation: audit, decide before Phase 1 implementation.*

4. **Snooze cap (§4.1 config, default 365):** Confirm. *Recommendation: 365 keeps annual books moving but forces yearly review.*

5. **Extreme-weight threshold (§3.3, currently >50):** Confirm. *Recommendation: 50 — any single signal dominating is a strong signal of stance misuse.*

6. **`engine_max` rename from `credit_ceiling`:** Confirm rename. *Recommendation: rename, since "ceiling" is misleading (operator can still set manual above it).*

7. **Sales-workspace inline indicator (§11.6, non-blocking, only on engine-recommended-lower-than-manual at order time):** Confirm or drop entirely. *Recommendation: ship as described — minimal footprint, only fires when actually relevant.*

8. **Owner role for stance edits vs manager (§13):** Confirm escalation. *Recommendation: owner, given fan-out impact.*

9. **Owner role for setCustomerCreditLimit > 1.5× engine recommendation:** Confirm threshold. *Recommendation: 1.5× — captures most "outside the engine's view" decisions while leaving small adjustments at manager level.*

---

## 18. Success Criteria

**Operator can:**
- See the engine's recommendation with plain-English signal labels on every customer profile
- See a delta from engine recommendation framed as risk ("$5K above engine, +20%")
- Switch a customer's stance and watch their limit recompute within seconds
- Edit a stance's weights with a dry-run preview before commit
- Set a manual override with required reason and see a stale indicator after 60 days
- Snooze a stale override (resets clock) up to a 1-year cumulative cap; then forced to re-confirm or revert
- Set an engine-max per customer that caps engine output (does not constrain manual)
- Disable the engine entirely for a problematic customer (owner only)
- Find every stale manual override in one Credit Review Queue view

**System guarantees:**
- Recompute never blocks primary commerce (sales, payments, ledger commits)
- Recompute latency: enqueue→applied p95 < 5 seconds under normal load
- Assessment row exists for every recompute, append-only, with provenance
- Reversal correctness verified by integration test
- Shadow mode KPI must pass before bulk engine enablement
- All weight sets sum to 100 (DB-enforced); no single weight > 50 without explicit ack
- Manual override reason captured; snooze capped; engine disable journaled with reason
- Tamper-evident audit: config history, stance history, assessment history all append-only

**Engine quality:**
- Recompute on a realistic customer ≤ 100ms in worker (no longer gating user-facing latency)
- Signal calculators 100% unit-test coverage
- Integration tests cover: cold-start gate, queue dedup, worker retry, reaper of stale `processing` rows, idempotency_key dedup on partial-commit retry, reversal correctness, stance edit cascade, shadow mode, bulk revert, ceiling/max behavior, snooze cap, engine disable, role-gated query 403s
- Observability metrics in place before production rollout
- Operator-facing 1-page doc committed alongside code

**Operator-behavior KPIs (measured starting Phase 5+):**
- ≥80% of stale manual overrides in the Credit Review Queue are acted on (revert, snooze, or re-confirm) within 14 days of becoming stale
- 100% of stance edits in the first month after rollout use the dry-run preview before commit (validated via stance_history pre/post comparison — if preview API was hit with the eventual weights at least once in the 5 minutes before commit, count as "used")
- Median time from engine-recommendation change >10% to operator action (revert, snooze, or accept) ≤ 30 days
- Zero unexplained limit drops: every `final_limit` decrease of >20% week-over-week traces to a specific journaled event (sale, payment, dispute, stance edit). Validated via reconciliation query monthly.

---

## Changelog from v1 (2026-05-18 same day)

| Section | v1 | v2 | Why |
|---|---|---|---|
| §5 Engine Service | In-tx recompute | Queue + worker | Architect F1/F2/F3: deadlocks, latency, primary-commerce risk |
| §6 Event Hooks | Direct call | Enqueue only | Same |
| §7 Nightly | Direct iterate+compute | Enqueue all → worker drains | Architect F5: scaling |
| §10 Migration | Replace immediately or post-migration script | Mandatory shadow mode + journaled bulk-revert command | CTO F1, Security F9 |
| §1.0 Input Guards | Implicit | Explicit guards section | Security F6 |
| §1.4 Debt Aging | Aging from issued_at | Aging from due_date, excludes disputes | PM F1: net-terms customers |
| §1.5 Repayment Velocity | Days from issued | Days late from due_date | PM F1 |
| §1.7 Confidence | Absent | Per-signal confidence enum | PM F5, Designer F1 |
| §3.3 Stance Guards | None | Owner role, extreme-weight ack, dry-run preview, async cascade | Security F2, PM F6 |
| §4 New tables | None | config_history, stance_history, recompute_queue | Security F1, Architect F1 |
| §4 Constraints | Weak | DB CHECKs on multiplier/final_limit/triggered_by enum | Security F7, F10, Architect F9 |
| §4 engine_max | Was ceiling | Renamed + scope clarified | PM F8, Security F8 |
| §8.3 Snooze | sales role, no cap | manager role, cumulative cap | Security F4 |
| §8.1 Manual override | No reason needed | Reason required + owner if >1.5× engine | Security F3 |
| §8.4 Engine disable | Out of scope | In scope | CTO F8 |
| §9 Cold start | 3 invoices OR 60d | ALL: 3 invoices AND 60d AND base>0 | PM F3 |
| §11.1 Profile | Raw numeric scores | Plain-English chips, numbers behind toggle | Designer F1 |
| §11.1 Manual delta | "Engine recommends $X" | Risk-framed delta "+20% above engine" | Designer F2 |
| §11.2 Sales workspace banner | Stale banner | Replaced by Credit Review Queue + non-blocking inline indicator | PM F2, Designer F3 |
| §11.3 Cold-start UI | Missing | Explicit cold-start panel | Designer F7 |
| §11.5 Slider UX | Bare sliders | Sum indicator, normalize button, auto-balance toggle, preview pane | Designer F4 |
| §15 Observability | Absent | Metrics, alerts, structured logging, reconciliation | Architect F10 |
| Phase 8 | Absent | Operator-facing 1-page doc gates launch | CTO F7 |

---

---

## Changelog from v2 → v3 (same day, post-second-review-gate)

Round 2 review yielded PM PASS, CTO PASS, Architect FAIL (2 blockers), Designer FAIL (3 blockers), Security FAIL (3 blockers). All v1 findings verified resolved; v3 patches address only the small spec-text gaps newly surfaced.

| Section | v2 | v3 | Why |
|---|---|---|---|
| §5.3 step 2a | Idempotency key absent | `sha256(customer_id || queue_row_id)` populated at worker tx start | Architect N5: retry-after-partial-commit safety |
| §5.3 step 9 | Plain INSERT | `ON CONFLICT (idempotency_key) DO NOTHING` | Same |
| §5.3.1 | Missing | Crashed-worker reaper section (10-min stale-processing reset) | Architect N2 |
| §5.5 | "Advisory-locked" vague | Explicit `pg_advisory_lock(CREDIT_WORKER_LOCK_KEY)` + ≤2s takeover gap | Architect N1 |
| §11.4.1 | Missing | One-time shadow-mode orientation banner section | Designer day-one orientation |
| §11.6 | Single route, no nav | Main-nav placement, count badge, 3 filter tabs (incl. engine-disabled visibility) | Designer nav, Security N6 |
| §13.1 | `previewStanceEdit` undertyped | Explicit contract: stratified sampling, latency targets, paginated full-view query | Designer preview perf, Security N2 |
| §13.3 | Queries listed, role unstated | Explicit per-query min-role with resolver-level enforcement requirement | Security N3 |
| §3.3 | Boolean `acknowledgeExtremeWeights` | + `extremeWeightJustification` text required, persisted in stance_history | Security N1 |
| §15.1 | Metrics list | Added `credit_recompute_stale_processing_count` + `credit_manual_override_near_owner_threshold_total` | Architect reaper + Security N5 |
| §15.3 | Alerts list | Added alerts for stale-processing and gaming-pattern detection | Same |
| Phase 0 (new) | Phase 1 directly | Data audit gate (unit_cost, due_date, dispute taxonomy) | PM/CTO non-blocking note |
| §17 Q1 | Open question | Marked "decision required before Phase 5" | PM follow-up |
| §18 Engine quality | Plain test list | Added test cases for reaper, idempotency, role-gated 403s | Architect + Security additions |
| §18 (new section) | Missing | "Operator-behavior KPIs" with 4 measurable targets | PM F7, CTO behavioral measurement |
| §11.3 cold-start UI | `✗` glyph | `○` glyph (neutral pending, not accusatory) | Designer minor |

---

## Changelog from v3 → v4 (same day, post-third-review-gate)

Round 3 review yielded Security PASS (with 5 P1 follow-ups absorbed below), Architect FAIL (1 new blocker), Designer FAIL (2 new blockers). All v2 findings verified resolved. v4 patches address final spec-text gaps; no architecture or scope changes.

| Section | v3 | v4 | Why |
|---|---|---|---|
| §5.3 step 9 | `ON CONFLICT DO NOTHING` left `new.id` undefined for steps 10–12 | `ON CONFLICT DO NOTHING RETURNING id` + explicit fallback `SELECT id WHERE idempotency_key=$1` so `last_assessment_id` is never NULL on the engine path | Architect A-N1 |
| §5.3.1 | Reaper logic | Added edge-case note: crash before step 2 commits prevents attempts increment; detectable via stuck-queue paged alert | Architect A-N2 nit |
| §11.6 | Count badge present, refresh unspecified | Refresh on route nav + 60s poll + `credit-review-changed` event broadcast | Designer C1 |
| §11.4.1 | "user_preferences or feature_flag" disjunctive | Explicit new `user_dismissed_banners` table (§4.4); banner persists for full shadow-mode duration; auto-dismiss on shadow exit | Designer C2, C3 |
| §4.4 (new) | Missing | `user_dismissed_banners` table definition added to migration | Designer C3 |
| §10.4 migration list | Existing tables only | + `user_dismissed_banners` | Same |
| §13.1.1 | Stale-data risk implicit | Explicit trade-off note: preview is for relative comparison, not absolute commitment | Designer C4 |
| §15.2 | Generic debug logs only | Added SIEM-grade structured events (`credit.manual_override.set`, `near_threshold`, `engine.disabled`, `stance.edit`, `shadow_mode.exited`) with dimensions for forensic analysis | Security #2 |
| Phase 7 | Observability gate | Added CI gate: no role-gated resolver ships without negativeRole test counterpart | Security #5 |
| §13.3 | Manager-tier visibility assumed | Documented as deliberate v1 decision; per-customer ACL flagged as out-of-scope for now | Security #4 |

## End of Design Document v4

**Next Steps:**
1. (Optional) Re-run a final Design Review Gate round 4 if user wants belt-and-suspenders confidence
2. User approval
3. Move to writing-plans (per CLAUDE.md, user picks execution method: metaswarm orchestrated / subagent-driven / parallel session)
