# Credit Engine — Operator Guide

The credit engine is TERP's adaptive customer credit limit system. It watches how each customer actually behaves — what they buy, how they pay, how long they've been with us — and continuously recomputes a **recommended credit limit** for them. Operators stay in control: every recommendation can be overridden, frozen, or ignored, and during the initial shadow phase the engine doesn't change any limits at all.

This document is the operator-facing explainer. The full design spec — including SQL, command APIs, math, and rationale — lives in [`docs/superpowers/specs/2026-05-18-customer-credit-limits-system-design.md`](./superpowers/specs/2026-05-18-customer-credit-limits-system-design.md). Anything here that conflicts with the spec is a doc bug; the spec wins.

---

## What the engine does

The credit engine computes a **recommended credit limit per customer** from six behavioral signals — revenue momentum, cash collection, profitability, debt aging, repayment velocity, and tenure depth. Each signal scores from 0 to 100 (higher is better). The signals are blended into a single overall score using a weight bundle called a **stance** (e.g. "Balanced," "Prioritize Cash," "Conservative"). The overall score then maps to a **multiplier**, which is applied to a **base amount** drawn from the customer's recent revenue history. The result is a continuously updated credit limit that reflects what the customer is actually doing right now, not a number someone typed in months ago and forgot about.

The engine ships in **shadow mode** — it computes recommendations for every customer but does **not** change any existing manual limits. Operators see what the engine *would* recommend alongside the current manual value, compare them in the Divergence Report, and only opt customers in when they're comfortable. After rollout, individual customers can still be put back on manual at any time, and the engine can be disabled per customer with one click. The engine is an assistant, not an authority.

---

## How a recommended limit is computed

The math walks through in three steps: score each signal, blend them by stance weights, then turn the overall score into a dollar limit.

### Step 1: score each signal (0–100)

Each signal looks at a defined window of base-table data — invoices, sales orders, payments — applies the universal input guards (no negatives, no future-dated rows, no voided invoices), then returns a 0–100 score and a `high`/`medium`/`low`/`none` confidence value.

### Step 2: blend by stance weights

The customer's effective stance defines weights for the six signals that sum to 100.

```
overall_score = round( sum(signal[i].score * weights[i]) / 100 )
```

### Step 3: base × multiplier

```
base       = max( avg_monthly_revenue_last_6_months,
                  median_invoice_total_last_12_months )

multiplier = piecewise function of overall_score (table below)

final_limit = min( base * multiplier, customer.engine_max or no cap )
```

**Default multiplier curve (tunable per stance):**

| Overall score | Multiplier |
|---|---|
| 0–19 | 0.0 |
| 20–39 | 0.5 |
| 40–59 | 1.0 |
| 60–79 | 2.0 |
| 80–89 | 3.0 |
| 90–100 | 4.0 |

The engine enforces hard caps in the database: multiplier ≤ 10.0 and final_limit ≤ $100,000,000.

### Worked example: Harbor Logistics

From design spec §2.3:

> Customer "Harbor Logistics" — 14 months tenure, $15K avg monthly revenue, paid 92% of invoices, avg 8 days late (on Net 30), 22% margin, slight growth, $3K open invoice, 8 days past due.

Using the default **Balanced** stance (weights 20/20/15/15/20/10):

| Signal | Score | Confidence | Weight | Contribution |
|---|---|---|---|---|
| Revenue momentum | 60 | high | 20 | 12.0 |
| Cash collection | 92 | high | 20 | 18.4 |
| Profitability | 44 | high | 15 | 6.6 |
| Debt aging | 84 | high | 15 | 12.6 |
| Repayment velocity | 68 | high | 20 | 13.6 |
| Tenure depth | 71 | high | 10 | 7.1 |
| **Overall** | — | — | 100 | **70** |

Overall score 70 → multiplier **2.0**. Base = **$15,000**. Raw limit = $15,000 × 2.0 = **$30,000**. No `engine_max` is set, so final limit = **$30,000**.

---

## The six signals — plain English

Every signal applies the universal guards (`total >= 0`, `posted_at <= now()`, `status != 'voided'`, etc.) before measuring anything. That keeps a stray negative invoice or future-dated row from skewing a customer's score.

- **Revenue momentum** — Is this customer buying more or less than they used to? Compares the last 90 days of invoiced revenue against the prior 6 months (normalized for the window difference). Growth pushes the score above 50; decline pulls it below.
- **Cash collection** — What share of invoiced dollars do they actually pay? Looks at every invoice issued in the last 365 days and divides paid by invoiced. A customer who pays 92% of what we bill them scores 92.
- **Profitability** — How much margin we make on their orders. Revenue minus COGS over the last 365 days, divided by revenue. A 50% margin scores 100; lower margin pulls the score down proportionally.
- **Debt aging** — How long their unpaid invoices have been past due? Measured against the invoice **due date**, not the issue date — a Net-30 customer 5 days post-issue is **not yet due** and isn't penalized. Disputed invoices are excluded until resolved.
- **Repayment velocity** — How many days late they typically pay invoices, measured from due date, not issue date. Paying on time scores 100; an average of 30 days late drops the score to roughly 20.
- **Tenure depth** — How long they've been a customer. Rewards loyalty on a tiered curve: 50 at 6 months, 75 at 1 year, 90 at 2 years, 100 at 3+ years.

### Signal confidence

Each signal also returns a confidence level so operators know how much to trust the number:

| Confidence | Condition |
|---|---|
| `high` | ≥10 data points in the window |
| `medium` | 3–9 data points |
| `low` | 1–2 data points |
| `none` | 0 data points (signal falls back to a neutral 50) |

The UI surfaces this as "based on 47 invoices" vs "based on 2 invoices" so a high score from thin data doesn't get mistaken for a high score from rich data.

---

## Stances and weights

A **stance** is a named bundle of six weights — one per signal — that sum to 100. The active stance is what blends the signal scores into the overall score. There is one global default stance, and any customer can be opted into a different stance (e.g., a chronically slow-paying customer who's strategically important might be put on **Conservative**).

### The five seeded stances

| Name | Description | Revenue | Cash | Profit | Debt | Velocity | Tenure |
|---|---|---|---|---|---|---|---|
| **Balanced** | Default; even-handed | 20 | 20 | 15 | 15 | 20 | 10 |
| **Prioritize Cash** | Reward customers who pay fast and pay in full | 5 | 35 | 5 | 20 | 30 | 5 |
| **Prioritize Revenue** | Reward growth and volume | 35 | 10 | 25 | 10 | 10 | 10 |
| **Conservative** | Penalize debt and slow payers heavily | 5 | 25 | 10 | 35 | 20 | 5 |
| **Loyalty-Weighted** | Reward long-term customers | 15 | 15 | 15 | 15 | 15 | 25 |

### Changing the global default

Settings → Credit Engine → **Global default stance** dropdown. Owner-only edit. Changing the global default enqueues a recompute for every customer who is currently inheriting the global stance (i.e., has no per-customer stance override). The UI shows "N customers will be re-evaluated; processing in background" rather than blocking on a slow synchronous request.

### Per-customer override

On a customer profile, **Stance override → [Change]** picks any stance for that one customer. Their effective stance becomes the override; the global default no longer applies to them.

### Anti-misuse guard: the 50-weight rule

**No single weight in a stance can exceed 50 without an explicit acknowledgment.** Editing a stance to push one weight above 50 requires the operator to (a) check **"I acknowledge this is an extreme weight"** and (b) type a non-empty justification (12+ characters). The justification is persisted to the stance edit audit trail. This prevents drive-by edits that collapse the engine into a one-signal proxy. Stance edits are also **owner-role only** (not manager), and require a dry-run preview confirming whether any sampled customer's limit shifts by more than 25% before the change takes effect.

---

## Manual override workflow

The operator can override the engine value freely at any time. Manual overrides preserve operator authority while keeping the engine running in the background.

### Setting a manual limit

Customer profile → **[Edit ▾]** on the limit row. A confirmation modal explains that editing will switch the customer to a **MANUAL** credit limit and that the engine will keep computing recommendations but won't apply them.

- **Reason required** — minimum 4 characters; persists as `credit_limit_manual_reason`
- **Amount ≥ 0** — validated
- **Role gate** — manager role for amounts ≤ 1.5× the engine recommendation; **owner** role required for amounts above that threshold
- All fields journaled in `command_journal`

### Stale-reminder workflow

After **60 days** (default `manual_override_reminder_default_days`, owner-configurable) the customer profile shows:

```
⚠ Manual limit • last reviewed 78 days ago, 12% above engine recommendation
  [Use engine recommendation instead]
  [Snooze 60 days]   [Adjust reminder cadence]
```

Three available actions:

1. **Revert to engine** — flips `credit_limit_source` back to `'engine'`, clears manual override fields, enqueues a recompute that will write the engine value on the next worker pass
2. **Snooze** — resets `credit_limit_last_reviewed_at = now()` and increments the snooze count; manager-role required
3. **Re-confirm via Edit** — opening the Edit modal again and resaving counts as a fresh manual decision and resets the clock

The stale reminder is **only shown on the customer profile and in the Credit Review Queue.** It is deliberately **not** shown in the sales workspace — operators reflexively dismiss interruptions at sale time, so we don't put it there.

### Hard cap: 365 cumulative days

The cumulative snooze cap is **365 days** from `credit_limit_manual_set_at` (default `manual_override_snooze_cap_days`). Past that point:

```
⚠ Manual override has been in place 340 days (cap: 365). Cannot snooze further —
  re-confirm via Edit or revert to engine.
```

Snooze attempts past the cap are rejected with an explicit error pointing the operator to either revert or call `setCustomerCreditLimit` again (which counts as re-acknowledging the value and resets the clock).

---

## Per-customer engine kill switch

`disableCreditEngineForCustomer({ customerId, reason })` — **owner-only**, reason required — freezes a specific customer's credit limit at its current manual value. Use this when a customer's situation is unusual enough that you don't want the engine touching them at all (legal hold, special arrangement, dispute under review).

While disabled:

- `engine_disabled_at`, `engine_disabled_by`, and `engine_disabled_reason` are set on the customer row
- `credit_limit_source` is forced to `'manual'`
- The engine **still computes** assessments on every event hook, so audit reviewers can see what it *would* recommend — but `applied = false` on every assessment
- The customer surfaces in the Credit Review Queue under the **"Engine disabled — manual frozen"** tab, with the shadow recommendation visible alongside the frozen manual value

Re-enable via `enableCreditEngineForCustomer({ customerId })` which clears the three columns and resumes normal engine behavior.

---

## Shadow mode

At rollout, `credit_engine_config.shadow_mode = true` is enforced and every existing customer is set to `credit_limit_source = 'manual'`. The migration preserves every current manual limit verbatim — nothing changes from the operator's day-of-rollout perspective.

While shadow mode is on:

- Event hooks enqueue normally — every invoice, payment, ledger row, stance edit, etc. fires a recompute
- The worker drains the queue and **writes assessments** for every customer
- The worker **never writes** to `customers.credit_limit` — `assessment.applied = false` for every row
- Operators see engine recommendations on customer profiles labeled "Shadow — not applied"
- A **Divergence Report** view shows, for every customer:
  - Current manual limit
  - Engine recommendation
  - Delta (absolute + %)
  - Confidence summary
  - Suggested action ("Engine recommends raising," "Engine recommends lowering," "Within tolerance")

### Going live

`bulkRevertCustomersToEngine({ filter? })` — **owner-role, journaled** — is the single command that exits shadow mode. It is typically gated on a KPI check first:

- ≥75% of customers with engine recommendation within ±30% of current manual limit
- Zero customers with overall confidence `none` and applied recommendation > $0
- Zero customers where engine recommends $0 but customer currently transacts

If the KPI isn't met, the command refuses to run unless the operator passes `force=true` with explicit acknowledgment. Once it runs, every matching customer flips to `credit_limit_source = 'engine'` and the next worker pass writes the engine value. `shadow_mode` is then set to `false` and cannot be flipped back to true.

---

## Credit Review Queue

A dedicated route — `/credit-review`, surfaced in the main nav under Customers as **"Credit Review (N)"** with a count badge — lists customers needing operator attention. The badge is visible to **owner and manager roles only**; sales role doesn't see the link.

**Three filter tabs:**

1. **Stale manual overrides** (default tab) — `credit_limit_source = 'manual'` AND the stale-reminder condition is met
2. **Engine disabled — manual frozen** — `engine_disabled_at IS NOT NULL`; shows the shadow recommendation alongside the frozen value so audit reviewers can see divergence
3. **Near snooze cap** — manual overrides where `(now() - credit_limit_manual_set_at)` is within 30 days of the 365-day cap, prompting proactive re-confirmation

**Sortable by:** days since review, % delta vs engine recommendation, dollar impact.

**Action buttons per row:** [Open profile] [Revert to engine] [Snooze].

The badge count refetches on route navigation, on a 60-second background poll while the operator is active, and on an in-app `credit-review-changed` event whenever a worker writes a state change that affects queue membership. Operators never have to manually refresh.

This view replaces the v1 sales-workspace stale banner. The sales workspace only shows a tiny dismissible inline notice when the **current order** would exceed the **engine's** recommendation (even if it fits within the current manual limit):

```
ⓘ Engine recommends a lower limit for this customer ($X). Order is OK against current manual limit ($Y).
```

No banner, no interruption.

---

## How to read an assessment row

Every recompute writes one row to `customer_credit_assessments`. The table is append-only — you can see the complete history of every recompute for any customer.

| Field | Meaning |
|---|---|
| `customer_id` | The customer this assessment is for |
| `stance_id` | The stance used to weight the signals (effective stance at compute time) |
| `triggered_by` | What fired this recompute — e.g., `event:postSalesOrder`, `event:recordPayment`, `event:stanceEdited`, `nightly`, `manualTrigger`, `bulkRevert`, `reconciliation`, `shadowMode` |
| `triggered_by_command_id` | Link back to the command in `command_journal` that caused the recompute |
| `score_revenue_momentum` … `score_tenure_depth` | The six signal scores, 0–100 |
| `confidence_revenue_momentum` … `confidence_tenure_depth` | The six confidence values (`high`/`medium`/`low`/`none`) |
| `overall_score` | Weighted blend (0–100) |
| `base_amount` | The base dollar amount that went into the multiplier |
| `multiplier` | The multiplier the overall score mapped to |
| `recommended_limit` | `base_amount × multiplier`, pre-engine_max clamp |
| `engine_max_applied` | The per-customer engine_max cap if one was set (null if not) |
| `final_limit` | What the engine would write (or did write) |
| `applied` | **`true`** if this row was written to `customers.credit_limit`; **`false`** if it was shadow mode, source = manual, engine disabled, or cold-start gate not met |
| `idempotency_key` | Set by the worker for retry safety |
| `created_at` | When the assessment row was inserted |

### Quick read: "did anything actually change?"

- `applied = true` → the engine wrote this value to `customers.credit_limit`
- `applied = false` → this is a shadow / advisory recommendation; the operator's manual value (or the frozen disabled value) stayed in place

Example query — show the most recent assessment per customer along with whether it was applied:

```sql
SELECT customer_id, overall_score, final_limit, applied, triggered_by, created_at
FROM customer_credit_assessments
WHERE id IN (
  SELECT DISTINCT ON (customer_id) id
  FROM customer_credit_assessments
  ORDER BY customer_id, created_at DESC
)
ORDER BY created_at DESC;
```

---

## Auditing changes

Every state-changing surface in the credit engine is journaled. Nothing about a customer's limit can move without leaving a trail.

- **`command_journal`** — every state-changing command (set, revert, snooze, disable, enable, stance edit, config edit, bulk revert) writes a row. This is the same journal used everywhere else in TERP.
- **`customer_credit_assessments`** — append-only history of every recompute. Includes the full input/output (signal scores, confidence, weights via `stance_id`, base, multiplier, final limit), the trigger, and whether it was applied.
- **`credit_engine_stance_history`** — append-only audit of every stance edit. Records the pre-state weights, post-state weights, the operator, the linked `command_id`, the count of affected customers, and (when an extreme weight > 50 was used) the operator's typed justification.
- **`credit_engine_config_history`** — append-only audit of every engine config change (cold-start thresholds, reminder defaults, snooze cap, global default stance, shadow_mode toggle). Same pre/post pattern.

Example: who edited the Balanced stance last month and why?

```sql
SELECT changed_at, changed_by_user_id, pre_state, post_state, command_id
FROM credit_engine_stance_history
WHERE stance_id = '<balanced-stance-uuid>'
  AND changed_at >= now() - interval '30 days'
ORDER BY changed_at DESC;
```

---

## Troubleshooting

**"Customer's engine recommendation is $0."**
Almost always a cold-start case. The engine doesn't enable for a customer until **all three** are true: 3+ posted invoices, 60+ days tenure, and a computed base > 0. The customer profile shows a "Engine warming up" panel listing which gate is still pending. Until then, the limit is whatever the operator set.

**"Limit didn't update after a sale was posted."**
Check `credit_recompute_queue` for that customer:

```sql
SELECT id, status, attempts, last_error, enqueued_at, last_attempted_at
FROM credit_recompute_queue
WHERE customer_id = '<id>'
ORDER BY enqueued_at DESC
LIMIT 5;
```

- `pending` → worker hasn't picked it up yet; check worker health
- `processing` → if stuck more than 10 minutes, the crashed-worker reaper resets it back to `pending` automatically
- `failed_terminal` → see `last_error`; the worker retried 5 times before giving up
- `done` → recompute completed; check `customer_credit_assessments` for the most recent row and look at `applied` — if `false`, the customer is on manual, in shadow mode, or has the engine disabled

**"Stance edit didn't take effect on customers' limits."**
Stance edits don't recompute synchronously — they enqueue a recompute for every customer using that stance. The UI shows "N customers will be re-evaluated; processing in background." Check queue depth and worker progress; large stance changes can take a few minutes to drain.

**"Manual override stayed in place even after I clicked Revert to engine."**
Revert flips `credit_limit_source` to `'engine'` and enqueues a recompute, but the actual `customers.credit_limit` value isn't rewritten until the worker processes that recompute. Allow a few seconds. If it persists, check `credit_recompute_queue` per the second troubleshoot above.

**"Sales workspace shows an engine warning but the order goes through."**
That's by design. The hard-block at sale-confirm time reads the **applied** `customers.credit_limit`. The inline notice only flags when the order would exceed the **engine's** recommendation, even if it fits the current manual limit. It's informational, not blocking.

---

## What's not in v1

The following pieces are planned but not part of the initial credit engine release. The engine functions correctly without them; they ship in later phases.

- **Live UI components for the Credit Review Queue and Settings → Credit Engine** — planned; the routes and components ship in Phase 6 of the credit engine rollout
- **Nightly safety-net cron wiring** — planned for Phase 9; the engine recomputes on event hooks today, with the nightly pass being a backstop for customers who never trigger an event
- **Observability metrics** — planned for Phase 7 (queue depth, p95 end-to-end latency, applied-vs-shadow assessment counts, signal confidence distribution)
- **Per-territory customer ACL** — out of scope for v1; documented in §13 of the design spec for a future iteration
