# 15 — Domain: The Credit Engine

> Developer-handoff bible for TERP Operator's **Credit Engine** — the automated
> customer credit-limit recommendation subsystem with manual override, shadow
> mode, divergence monitoring, and a nightly recompute safety-net.
>
> Ground truth is the **code**. Every claim below cites `file:line`. Where the
> spec is referenced (`§N`) it is the design doc
> `docs/superpowers/specs/2026-05-18-customer-credit-limits-system-design.md`; the
> operator explainer is `docs/credit-engine.md` and the alerting contract is
> `docs/credit-engine-alerts.md`.

---

## Orientation: the one-paragraph summary

The Credit Engine computes a **recommended credit limit per customer** from six
behavioral signals (revenue momentum, cash collection, profitability, debt
aging, repayment velocity, tenure depth). Each signal scores 0–100 with a
confidence bucket; signals are blended by a per-customer **stance** (a weight
bundle summing to 100) into an `overall_score`, which maps through a piecewise
**multiplier** curve and is applied to a **base amount** (max of 6-month avg
monthly revenue and 12-month median invoice total) to produce a `recommended_limit`,
optionally clamped by a per-customer `engine_max` to yield `final_limit`. Recompute
is **event-driven via a queue** (`credit_recompute_queue`): commands and domain
events enqueue a customer; a worker (`processOneRecompute`) claims one row at a
time, computes signals against base tables, writes an immutable assessment row,
and — only when the engine is live (not shadow mode), the customer is in engine
mode (`credit_limit_source='engine'`), the engine is not disabled, and the
cold-start gate has opened — writes the limit back to `customers.credit_limit`.
A **reaper** recovers stalled rows, a **nightly cron** re-runs everyone and
records a drift/stuck audit, a **divergence report** drives the shadow→live
decision, and a **reconciliation** scan detects denorm drift. Operators interact
through the Credit Review queue, the per-customer Customer Credit Panel, and
owner-gated admin surfaces (stances, config, bulk revert). Everything is
append-only and reversible through the command bus.

---

# SECTION A — JOURNEY MAP

This section follows an operator (manager or owner) through the credit-review
workflow end to end, calling out happy paths, branches, error states, recovery,
handoffs, feature combinations, and edge cases.

## A.0 Entry points and roles

| Surface | File | Min role | Notes |
|---|---|---|---|
| Credit Review queue (view) | `src/client/views/CreditReviewView.tsx` | manager | Owner-only extras: Divergence report toggle (`:80`), Enable-engine button (`:193`) |
| Customer Credit Panel (drawer) | `src/client/components/credit/CustomerCreditPanel.tsx` | manager | One-round-trip status; opened from queue row "Open profile" (`CreditReviewView.tsx:163`) |
| Edit Credit Limit modal | `src/client/components/credit/EditCreditLimitModal.tsx` | manager (owner for >1.5×) | Sets a **manual** limit |
| Divergence panel | `src/client/components/credit/CreditDivergencePanel.tsx` | owner | Portfolio-wide limit data is sensitive |
| Queue health widget | `src/client/components/credit/CreditQueueHealthWidget.tsx` | manager | Ops health |
| Shadow-mode banner | `src/client/components/credit/ShadowModeBanner.tsx` | manager | Renders only while `shadowMode=true` |

Role gating is enforced **server-side** in the router via `requireRole`
(`src/server/routers/credit.ts:37-45`) and in command handlers (catalog roles at
`src/shared/commandCatalog.ts:429-440`). Client checks (`me.data?.role`) are UX
only — never the security boundary (`CreditReviewView.tsx:34-35`).

## A.1 Assess a customer (the panel)

Operator opens a customer's credit drawer → `customerCreditStatus`
(`credit.ts:633-919`) returns **everything in one round-trip**: customer
snapshot, effective stance, latest assessment, cold-start gate progress,
reminder math, engine-vs-manual delta, and the global `shadowMode` flag.

The panel (`CustomerCreditPanel.tsx`) renders:
- **Credit limit + source** (engine | manual) and **balance/utilization**
  (`:200-227`). Utilization = `round(balance/creditLimit*100)`, 0 when limit is 0.
- **Latest assessment block** (`:245-287`): final limit, overall score, applied
  Yes/No, shadow On/Off, and six **signal chips** bucketed via `bucketSignal`
  (`creditPanelUtils.ts:13-28`) → `Cold-start` when confidence is `none`, else
  `Critical/Weak/OK/Strong/Excellent` by score band.
- **Cold-start warming block** (`:300-327`): shown only when `coldStart.isWarming`
  — progress glyphs for orders, tenure, base vs. their required thresholds.
- **Engine delta** (manual customers only, `:329-336`): `classifyDelta`
  (`creditPanelUtils.ts:55-82`) → "Matches engine", "$X above engine (+Y%)", etc.
- **Engine-disabled callout** (`:338-343`) when `engineEnabled === false`.
- **Reminder callouts** (`:345-369`): stale-override banner vs. near/at snooze-cap.

### Branches the panel resolves before any action
- **No assessment yet** → "No signals yet — engine recommendation is unavailable
  until orders appear" empty state (`:288-298`, `data-testid="credit-no-signals-empty-state"`).
- **No effective stance row** → stance block hidden (server leaves
  `effectiveStance=null` if the stance id can't be resolved, `credit.ts:734-764`).

## A.2 The four operator actions

From the panel / queue, an operator can:

### (1) Set a manual limit — "Edit"
`EditCreditLimitModal` → command `setCustomerCreditLimit`
(`commandBus.ts:5999-6045`).
- **Happy path**: amount ≥ 0, reason ≥ 4 chars → customer flips to
  `credit_limit_source='manual'`, records `manualSetAt/By/Reason`, resets
  `creditLimitLastReviewedAt=now` and `creditLimitSnoozeCount=0`, then **enqueues
  a recompute** (`manualTrigger`) so a fresh shadow assessment is written.
- **Owner-elevation branch**: if `amount > 1.5 × recommended_limit` and the caller
  is **not owner**, the command throws (`commandBus.ts:6023-6027`). The modal
  pre-warns when `amount > ownerElevationThreshold` (`EditCreditLimitModal.tsx:57,109-113`),
  but the server is authoritative. `recommended` is the **pre-clamp**
  `recommendedLimit` of the latest assessment (0 if none → threshold 0 → any
  positive amount needs owner).
- **Error states**: amount < 0 (`:6008`), reason < 4 chars (`:6010`), customer
  not found (`:6013`). Modal surfaces server error text in `submitError`
  (`EditCreditLimitModal.tsx:75-77`).

### (2) Revert to engine — "Revert"
Command `revertCustomerCreditToEngine` (`commandBus.ts:6047-6087`).
- Clears all manual metadata, sets `credit_limit_source='engine'`, enqueues
  recompute.
- **Critical precondition** (`:6061-6065`): rejects if `last_assessment_id IS NULL`
  with a friendly message, because the DB CHECK
  `customers_engine_source_has_assessment` (`migrations/0033:152-154`) forbids
  `source='engine'` without an assessment. This is the "you can't revert a
  customer the engine has never scored" guard.
- Available in panel (`CustomerCreditPanel.tsx:380-391`) and queue rows
  (`CreditReviewView.tsx:167-179`) for manual-source customers.

### (3) Snooze the review reminder — "Snooze 60 days"
Command `snoozeCustomerCreditReminder` (`commandBus.ts:6089-6137`).
- Bumps `creditLimitLastReviewedAt=now`, increments `creditLimitSnoozeCount`,
  optionally updates `creditLimitReminderDays` (positive integer).
- **Error states**: no manual override to snooze (`creditLimitManualSetAt` null,
  `:6112-6114`); override **older than the snooze cap** (`manualOverrideSnoozeCapDays`,
  `:6117-6121`) → operator must re-set the override or revert. `newReminderDays`
  must be a positive integer (`:6099-6101`).
- The panel only shows Snooze when `staleReminderActive && !nearSnoozeCap &&
  !snoozeCapReached` (`CustomerCreditPanel.tsx:205-208,392`).

### (4) Open profile / inspect history
"Show history" loads paginated assessment history via
`customerCreditAssessments` (`credit.ts:284-329`); 20/page, newest first
(`CustomerCreditPanel.tsx:451-515`).

## A.3 Stance & config (owner admin)

- **Per-customer stance override**: `setCustomerStance` (`commandBus.ts:6162-6185`)
  → validates stance exists, sets `customers.stance_id` (null = use global
  default), enqueues `event:setStance`. Effective stance = customer override ??
  global default (`effectiveStance.ts:6-11`).
- **Per-customer engine cap**: `setCustomerEngineMax` (`commandBus.ts:6139-6160`)
  → sets/clears `engine_max`, enqueues `event:setEngineMax`. Final limit is
  clamped to this cap.
- **Stance CRUD** (owner): `createCreditEngineStance`, `updateCreditEngineStance`,
  `deleteCreditEngineStance` (`commandBus.ts:6238-6428`). Editing weights triggers
  a **portfolio-wide recompute** of customers on that stance
  (`enqueueAllCustomers('event:stanceEdited')`, `:6365-6367`). Every change writes
  `credit_engine_stance_history` with pre/post state.
- **Global config** (owner): `setCreditEngineConfig` (`commandBus.ts:6430-6517`) —
  cold-start thresholds, reminder/snooze defaults, default stance, and the
  shadow-mode flag, with history rows.

## A.4 Shadow mode → live transition (the big lever)

Shadow mode (`credit_engine_config.shadow_mode`, default **true** at
`migrations/0033:37`) means the engine **computes but never applies**. The
`ShadowModeBanner` (`ShadowModeBanner.tsx`) tells operators recommendations are
advisory; dismissal persists per-shadow-session via `userDismissedBanners`
(banner endpoints `credit.ts:937-987`) and **reappears if shadow mode is
re-enabled** (cleared on transition off, `ShadowModeBanner.tsx:56-61`).

The transition workflow:
1. Operator (owner) reviews the **Divergence Report** (`CreditDivergencePanel.tsx`)
   comparing manual limits vs. engine recommendations across the portfolio.
2. The **shadow-mode KPI** says whether it's safe to flip (`passes`): ≥75% within
   tolerance, **zero** blockers, **zero** no-confidence-applied
   (`divergenceReport.ts:301-321`). Panel shows green "meets criteria" or red
   reasons list (`CreditDivergencePanel.tsx:89-102`).
3. Flip happens via `bulkRevertCustomersToEngine` (owner only,
   `commandBus.ts:6519-6623`): moves eligible manual customers to engine mode and,
   by default, **flips `shadowMode=false`** (`flipShadowMode` default true,
   `:6533,6582-6610`).

**One-way-down rule**: once shadow mode is off, `setCreditEngineConfig` **rejects**
re-enabling it (`commandBus.ts:6480-6482`). This protects the audit trail; the UI
mirrors with a disabled checkbox.

**Blocker edge case**: customers with an open invoice whose engine recommendation
is **$0** would be immediately blocked from new sales if flipped — the KPI counts
these (`divergenceReport.ts:270-272`) and the panel warns (`CreditDivergencePanel.tsx:82-87`).

## A.5 Divergence review

`divergenceReport` (`credit.ts:404-408` → `divergenceReport.ts:114-375`),
owner-only. Each customer row classifies as `engine_recommends_raise`,
`engine_recommends_lower`, `within_tolerance`, or `no_recommendation_yet`
(`divergenceReport.ts:246-266`). Tolerance defaults ±30%; pass threshold 75%
(`:118-119`). Auto-refreshes every 120s (`CreditDivergencePanel.tsx:43`).

## A.6 Queue health

`CreditQueueHealthWidget` polls `creditRecomputeQueueHealth`
(`credit.ts:593-623`) every 30s. Surfaces pending/processing counts, oldest
pending age, and turns amber/red when **stale processing** (>10 min) or
**failed_terminal** rows exist (`CreditQueueHealthWidget.tsx:11-13,27-32`).

## A.7 Handoff to Sales (credit holds)

The engine sets the **limit**; Sales **enforces** it. On `confirmSalesOrder`
(`commandBus.ts:3312-3314`) and on posting (`:3411`), if
`balance + order.total > creditLimit` the command throws *"{name} would exceed
credit limit. Request a credit override before confirming/posting."* This is the
operational handoff: the engine/operator owns the number, the sales flow blocks
against it. (`credit_overrides` table, `schema.ts:582-590`, backs the override
request path.) A client-side hint helper exists for manual-limit customers whose
order would exceed the **engine** recommendation but stay under the manual limit:
`shouldShowSalesCreditIndicator` (`creditPanelUtils.ts:84-102`).

## A.8 Edge cases & recovery (operator-visible)

- **Cold start**: brand-new customers don't get applied limits until ≥
  `coldStartMinPostedInvoices` posted invoices AND ≥ `coldStartMinTenureDays`
  tenure AND base > 0 (`coldStart.ts:13-22`). Until then the panel shows the
  warming block; the gate auto-flips `engine_enabled=true` the first time it
  opens (`worker.ts:199-204`).
- **Low/no confidence**: signals with no data still produce a score (neutral 50
  in most signals) but confidence `none` (`confidence.ts:10`). The chip shows
  "Cold-start". `applied=true` with all-`none` confidence is a divergence-KPI
  blocker (`divergenceReport.ts:274-277`).
- **Stale assessments**: reconciliation flags assessments > 7 days old
  (`reconciliation.ts:51-52`); nightly drift flags manual limits that drifted >25%
  from recommendation (`nightlyCron.ts:143-151`).
- **Stuck/stalled worker**: reaper resets `processing` rows older than 10 min back
  to `pending` (`reaper.ts:19-27`); nightly catches both long-pending and
  long-processing rows >30 min (`nightlyCron.ts:157-182`).
- **Reversal recovery**: every credit command is reversible via the command bus
  (`commandBus.ts:5029-5074`); reversal restores the prior snapshot and enqueues a
  recompute.

---

# SECTION B — BACKEND SPEC

## B.1 The scoring algorithm (end to end)

The full pipeline runs inside `processOneRecompute` (`worker.ts:68-368`). Order:

1. **Claim** a queue row (B.5).
2. **Load + row-lock** the customer `FOR UPDATE` (`worker.ts:110-133`).
3. **Load config** (`loadConfig`, `worker.ts:381-404`) and **resolve stance**
   (`resolveEffectiveStanceId`) then **load stance weights** (`loadStanceWeights`,
   `worker.ts:406-433`).
4. **Compute six signals** sequentially (single pg connection, `worker.ts:148-154`).
5. **Compute base** (`computeBaseFromDb`, `worker.ts:445-483`).
6. **Cold-start gate** (`worker.ts:159-204`).
7. **Decide `applied`** (B.7 precedence, `worker.ts:182-194`).
8. **Aggregate** score → multiplier → recommended → clamp (`worker.ts:206-219`).
9. **Insert assessment** idempotently (`worker.ts:221-272`).
10. **Write customer denorm** (`worker.ts:274-287`).
11. **Mark queue row done, COMMIT** (`worker.ts:289-295`); emit metrics/log
    post-commit (`worker.ts:301-335`).

### B.1.1 The six signals

All signals apply the **§1.0 universal input guards**
(`inputGuards.ts`): `total >= 0`, `created_at <= now()`, status NOT IN
(`reversed`,`voided`); sales-order lines need `qty > 0 AND unit_cost > 0`;
payments need `amount >= 0 AND status='posted'`. `reversed` is the app-level
cancellation marker; `voided` is tolerated defensively. Each returns
`{ score: int[0..100], confidence, dataCount }`.

| Signal | File | Window | Formula | Neutral / edge |
|---|---|---|---|---|
| **Revenue momentum** | `signals/revenueMomentum.ts:16-31` | recent 0–90d vs baseline 90–270d | `growthRatio = recent*3 / baseline`; `score = round(50 + (growthRatio-1)*50)` clamped 0–100 | both 0 → 50; baseline 0 & recent>0 → 75 |
| **Cash collection** | `signals/cashCollection.ts:11-22` | 365d | `rate = paid/invoiced`; `score = round(rate*100)` | invoiced 0 → 50 |
| **Profitability** | `signals/profitability.ts:11-23` | 365d (SO revenue vs SO-line COGS) | `margin = (rev-cogs)/rev`; `score = round(margin*200)` clamped | revenue 0 → 50 |
| **Debt aging** | `signals/debtAging.ts:15-43` | open/partial invoices, no active dispute | balance-weighted avg `daysOverdue`, piecewise (see below) | total balance 0 → **100** |
| **Repayment velocity** | `signals/repaymentVelocity.ts:10-21` | 365d paid invoices | `score = round(100 - avgDaysLate*4)` clamped; lateness `>= 0` | dataCount 0 → 50 |
| **Tenure depth** | `signals/tenureDepth.ts:8-20` | days on file | piecewise ramp 0→100 over ~3yr | always confidence `high`, dataCount 1 |

**Debt-aging piecewise** (`debtAging.ts:36-40`): weightedOverdue 0 → 100; <15 →
`100 - wo*2`; <30 → `70 - (wo-15)*2`; <60 → `40 - (wo-30)*1`; else 10. Active
disputes (`invoice_disputes.status IN ('open','investigating')`) **exclude** the
invoice (`debtAging.ts:78-82`).

**Tenure ramp** (`tenureDepth.ts:13-17`): <180d → `days*50/180`; <365 →
`50+(days-180)*25/185`; <730 → `75+(days-365)*15/365`; <1095 →
`90+(days-730)*10/365`; else 100.

### B.1.2 Confidence buckets

`bucketConfidence(dataCount)` (`confidence.ts:3-14`): 0 → `none`, 1–2 → `low`,
3–9 → `medium`, ≥10 → `high`. Throws on non-integer/negative.

### B.1.3 Aggregation → overall score

`aggregateOverallScore(scores, weights)` (`scoring.ts:25-47`): asserts each score
is integer 0–100, asserts **weights sum to exactly 100**, returns
`round(Σ(score[i]*weight[i]) / 100)`.

### B.1.4 Score → multiplier

`mapScoreToMultiplier` (`scoring.ts:49-59`): <20→0.0, <40→0.5, <60→1.0, <80→2.0,
<90→3.0, ≥90→4.0. (Matches `docs/credit-engine.md` table; DB caps multiplier ≤10.)

### B.1.5 Base amount

`computeBaseAmount` (`base.ts:13-21`): `max(avgMonthlyRevenue6mo,
median(invoiceTotals12mo))`. SQL in `computeBaseFromDb` (`worker.ts:445-483`):
6-month avg = `SUM(total over 180d)/6`; 12-month totals = `json_agg(total)` over
365d, all guarded. `median` at `base.ts:6-11`.

### B.1.6 Recommended & final limit

`worker.ts:216-219`:
```
rawRecommended = min(MAX_LIMIT, base * multiplier)   // MAX_LIMIT = 100_000_000
finalLimit     = engineMax != null ? min(rawRecommended, engineMax) : rawRecommended
```
`recommended_limit` is **pre-engine-max**; `final_limit` is post-cap. Owner
elevation in `setCustomerCreditLimit` gates on `recommended_limit` (pre-clamp).
The DB clamps both ≤ 100,000,000 and multiplier ≤ 10.0
(`migrations/0033:81-84`).

## B.2 Cold-start handling

`isColdStartReady` (`coldStart.ts:13-22`) — ready iff
`postedInvoiceCount >= minPostedInvoices && tenureDays >= minTenureDays &&
computedBase > 0`. Defaults: 3 invoices, 60 days (`config`, `migrations/0033:33-34`).
"Posted" = invoices with status IN (`open`,`partial`,`paid`), total ≥ 0,
created ≤ now (`countPostedInvoices`, `worker.ts:494-509`; mirrored in the router
at `credit.ts:772-781`). The worker auto-flips `engine_enabled=true` the **first**
time the gate opens for a non-disabled customer (`worker.ts:199-204`) — the only
place that auto-enables the engine.

## B.3 Tables (full column inventory)

### `customers` (credit columns) — `schema.ts:77-106`, `migrations/0033:129-154`
`engine_max numeric(12,2)`; `stance_id uuid → credit_engine_stances ON DELETE SET NULL`;
`credit_limit_source varchar(16) NOT NULL default 'manual'` CHECK IN ('engine','manual');
`engine_enabled bool NOT NULL default false`; `engine_disabled_at timestamptz`;
`engine_disabled_by uuid → users`; `engine_disabled_reason text`;
`last_assessment_id uuid → customer_credit_assessments ON DELETE SET NULL`;
`credit_limit_manual_set_at/by/reason`; `credit_limit_reminder_days int`;
`credit_limit_last_reviewed_at timestamptz`; `credit_limit_snooze_count int NOT NULL default 0`.
Plus base `credit_limit numeric(12,2)` and `balance`.
**CHECK** `customers_engine_source_has_assessment`: `source='manual' OR
last_assessment_id IS NOT NULL` (`migrations/0033:151-154`, NOT VALID). Named FKs
added in `migrations/0060`.

### `credit_engine_stances` — `schema.ts:1058-1071`, `migrations/0033:6-28`
`id`, `name` (unique, ≤80), `description`, six `weight_*` integers, `is_seeded
bool`. **CHECKs**: weights sum = 100; all weights ≥ 0.

### `credit_engine_config` — `schema.ts:1073-1085`, `migrations/0033:30-40`
Singleton. `global_default_stance_id uuid → stances ON DELETE RESTRICT`;
`cold_start_min_posted_invoices int default 3`; `cold_start_min_tenure_days int
default 60`; `manual_override_reminder_default_days int default 60`;
`manual_override_snooze_cap_days int default 365`; `shadow_mode bool default true`;
`updated_at`, `updated_by → users`.

### `customer_credit_assessments` — `schema.ts:1087-1114`, `migrations/0033:63-101`
Immutable, append-only. `customer_id → customers ON DELETE CASCADE`; `stance_id →
stances ON DELETE RESTRICT`; six `score_*` int (CHECK 0–100); six `confidence_*`
varchar(8); `overall_score` int (CHECK 0–100); `base_amount numeric(12,2)` (≥0);
`multiplier numeric(5,2)` (0–10); `recommended_limit numeric(12,2)` (0–1e8);
`engine_max_applied numeric(12,2)`; `final_limit numeric(12,2)` (0–1e8);
`triggered_by varchar(32)` (CHECK against the 17-value enum);
`triggered_by_command_id → command_journal`; `applied bool`; `idempotency_key text
UNIQUE`; `created_at`. Indexes on `(customer_id, created_at DESC)` and `stance_id`.

### `credit_recompute_queue` — `schema.ts:1116-1128`, `migrations/0033:103-120`
`id bigserial PK`; `customer_id → customers ON DELETE CASCADE`; `enqueued_at`;
`enqueued_by varchar(64)`; `command_id → command_journal`; `attempts int default
0`; `last_attempted_at`; `last_error text`; `status varchar(16) default 'pending'`
CHECK IN (`pending`,`processing`,`done`,`failed_terminal`). **Partial unique index**
`credit_recompute_queue_pending_unique` on `customer_id WHERE status='pending'` —
at most one pending row per customer. Index on `(status, enqueued_at)`.

### `credit_engine_config_history` — `schema.ts:1130-1137`, `migrations/0033:42-49`
`id`, `changed_at`, `changed_by → users`, `command_id`, `pre_state jsonb`,
`post_state jsonb`.

### `credit_engine_stance_history` — `schema.ts:1139-1149`, `migrations/0033:51-61`
`id`, `stance_id`, `changed_at`, `changed_by`, `command_id`, `action varchar(16)`
CHECK IN ('create','update','delete'), `pre_state jsonb`, `post_state jsonb`,
`affected_customer_count int`.

### `credit_engine_daily_audit` — `schema.ts:1164-1172`, `migrations/0040`
`day DATE PK`; `decisions_issued`, `customers_drifted`, `stuck_queue_items` ints;
`run_started_at`, `run_completed_at`; `summary jsonb` (full drift+stuck payload).
UPSERT keyed by `day`.

### `credit_overrides` — `schema.ts:582-590`
`id`, `customer_id → customers ON DELETE CASCADE`, `amount numeric(12,2)`,
`status varchar(32) default 'pending'`, `reason text`. Backs sales credit-override
requests (the engine itself does not write here).

## B.4 Enqueue layer

`enqueueCustomerRecompute` (`enqueue.ts:28-47`): single-customer INSERT with
`ON CONFLICT (customer_id) WHERE status='pending' DO NOTHING` → idempotent at the
pending level. **Unwraps Drizzle tx** to the raw `pg.PoolClient` at
`tx.session.client` (`:40`) so the enqueue stays in the command's transaction and
rolls back with it.
`enqueueAllCustomers` (`enqueue.ts:65-91`): bulk `INSERT ... SELECT` with optional
`stanceId` and `skipEngineDisabled` filters; returns rows actually inserted.
`TriggerSource` union (`enqueue.ts:3-10`) is the 17-value enum mirrored by the DB
`triggered_by` CHECK.

## B.5 Worker mechanics (`processOneRecompute`)

- **Two-transaction design** (`worker.ts:72-103` claim; `:104-368` work). The claim
  (`UPDATE ... SET status='processing', attempts=attempts+1 WHERE status='pending'`)
  commits **separately** so a failed work-txn rollback does **not** reset the
  attempts counter — otherwise rows would never reach `failed_terminal`.
- **Skip-if-not-pending**: `rowCount===0` → `{ skipped:true }` (already claimed,
  done, terminal, or missing).
- **Idempotency key** = `sha256(customerId:queueRowId)` (`worker.ts:99-102`). Insert
  uses `ON CONFLICT (idempotency_key) DO NOTHING RETURNING id`; on conflict it
  SELECTs the existing row (`worker.ts:255-272`) — protects against partial-commit
  retries (spec §5.3 step 9).
- **Customer deleted mid-flight** → mark queue row `done`, no assessment
  (`worker.ts:126-132`).
- **Denorm write** (`worker.ts:277-287`): `applied` → set `credit_limit` AND
  `last_assessment_id`; else set only `last_assessment_id` (required by the
  source-has-assessment CHECK).
- **Failure path** (`worker.ts:338-363`): ROLLBACK work txn, then on a fresh pool
  connection set status `failed_terminal` if `attempts >= MAX_ATTEMPTS (5)` else
  back to `pending`, capturing `last_error`; rethrow.
- **Observability** (`worker.ts:301-335`): post-commit, best-effort counters
  (`decision_issued`, `override_applied`, `shadow_mode_miss`) + structured
  `credit_engine.decision` log. Never throws.

**Orchestrator drain** (`orchestrator.ts:24-58`): `recomputeAllCustomers` bulk
enqueues then drains pending rows one at a time with
`SELECT ... FOR UPDATE SKIP LOCKED LIMIT 1` up to `maxRows` (default 10,000);
per-row errors are counted, not fatal. Used by nightly and `bulkRevertCustomersToEngine`.
(Note: a continuous polling worker loop / advisory locking is documented as a
later task in `worker.ts:65-66`; the shipped drain is the orchestrator loop.)

## B.6 Reaper

`reapStaleProcessingRows` (`reaper.ts:19-47`): single atomic UPDATE resetting
`processing` rows with `last_attempted_at < now() - 10min` back to `pending`,
appending `[reaped from stale processing]` to `last_error`. Emits
`credit_engine.worker_stalled`. Safe to run concurrently.

## B.7 Shadow mode & the `applied` precedence

`applied` is decided **before** insert with strict precedence
(`worker.ts:182-194`):
1. `engine_disabled_at != null` → false
2. `config.shadow_mode` → false
3. `credit_limit_source='manual'` → false (customer opted out)
4. `!engine_enabled && !coldStartReady` → false
5. else → true

So in shadow mode the engine writes a full assessment with `applied=false` but
never touches `credit_limit`. The cold-start auto-enable (`worker.ts:199-204`)
fires independently of `applied` whenever the gate opens for a non-disabled
customer. Shadow mode is **one-way-down** (`setCreditEngineConfig`,
`commandBus.ts:6480-6482`).

## B.8 Nightly cron

`runNightlyCreditEngineAudit` (`nightlyCron.ts:88-245`), entrypoint
`scripts/credit-engine-nightly-cron.ts` (`pnpm cron:credit-engine-nightly`):
1. `recomputeAllCustomers({ source:'nightly', skipEngineDisabled:true })`.
2. **Drift scan** (`nightlyCron.ts:112-151`): latest assessment per customer;
   `drift_pct = abs(credit_limit - recommended_limit)*100 / recommended_limit`;
   keep rows > `CREDIT_ENGINE_DRIFT_THRESHOLD_PCT` (default 25). Drift is computed
   vs **recommended_limit** (pre-clamp).
3. **Stuck-queue scan** (`nightlyCron.ts:157-191`): pending/processing rows whose
   `COALESCE(last_attempted_at, enqueued_at)` is older than
   `CREDIT_ENGINE_STUCK_AGE_MIN` (default 30), limit 100.
4. **UPSERT** one `credit_engine_daily_audit` row per UTC day
   (`nightlyCron.ts:209-232`); `summary` JSON carries drift+stuck+recompute+thresholds.
`toUtcDay` keys by UTC (`:73-78`); env parsing floors positive ints (`:80-86`).

## B.9 Divergence report math

`divergenceReport` (`divergenceReport.ts:114-375`). Per customer with the latest
assessment:
- `deltaAbs = currentLimit - engineRecommendation`;
  `deltaPct = deltaAbs / max(1, engineRecommendation) * 100` (`:251-252`).
- Within tolerance iff `|deltaPct| <= toleranceFraction*100` (default 30%); else
  raise/lower by sign (`:254-266`).
- **Blocker**: `engineRecommendation === 0 && has_open_invoice` (open invoice =
  not paid/reversed/void, `total > amount_paid`, `:175-186,270-272`).
- **No-confidence-applied**: `applied===true && all six confidences === 'none'`
  (`:274-277`).
- `pctWithinTolerance = within / max(1, withRecommendation) * 100` (`:297-299`).
- `passes = pctWithinTolerance >= passThreshold(75%) && blockerCount===0 &&
  noConfidenceApplied===0` (`:302-321`).
Confidence summary uses lower-bound counts per bucket
(`confidenceToCount`, `:84-95`). Excluding both sources returns an empty
all-pass population (`:131-149`). Emits `credit_engine.divergence_observed` +
`credit_engine.divergence_report` log, best-effort.

## B.10 Reconciliation

`reconcileLimitDrift` (`reconciliation.ts:26-82`), read-only (spec §15.4). For
`credit_limit_source='engine'` customers, flags three reasons:
- `missing_assessment` — `last_assessment_id IS NULL`,
- `stale_assessment` — latest assessment > 7 days old,
- `limit_mismatch` — `credit_limit <> latest final_limit`.
Returns `delta = credit_limit - final_limit` and `totalCustomersChecked`.

## B.11 Config versioning / history

Every stance and config mutation writes an append-only history row with full
`pre_state`/`post_state` JSON and the originating `command_id`:
- stance create/update/delete → `credit_engine_stance_history`
  (`commandBus.ts:6273-6281, 6355-6363, 6417-6425`), with `affected_customer_count`;
- config changes → `credit_engine_config_history`
  (`commandBus.ts:6509-6514`), including the shadow-flip during bulk revert
  (`:6589-6608`).
Reversal guidance in the catalog (`commandCatalog.ts:563-574`) points operators
back to the prior values via history.

## B.12 Router procedures (`src/server/routers/credit.ts`)

| Procedure | Kind | Role | Purpose | Lines |
|---|---|---|---|---|
| `customerCreditAssessments` | query | manager+ | Paginated per-customer assessment history (newest first) + total | `284-329` |
| `creditEngineStances` | query | manager+ | All stances (+ per-stance `customerCount`) + global config | `335-398` |
| `divergenceReport` | query | **owner** | Portfolio divergence + shadow KPI | `404-408` |
| `creditReviewQueue` | query | manager+ | Tabbed review queue (`stale_manual`/`engine_disabled`/`near_snooze_cap`) + counts; sortable | `424-586` |
| `creditRecomputeQueueHealth` | query | manager+ | Pending/processing/done/failed/stale counts + oldest-pending age | `593-623` |
| `customerCreditStatus` | query | manager+ | One-round-trip panel payload (snapshot, stance, latest assessment, cold-start, reminder, delta, shadow) | `633-919` |
| `isBannerDismissed` | query | manager+ | Per-user banner dismissal check (Drizzle) | `937-951` |
| `dismissBanner` | mutation | manager+ | Persist dismissal (idempotent `onConflictDoNothing`) | `958-966` |
| `clearBannerDismissal` | mutation | manager+ | Remove dismissal | `975-987` |

`requireRole` (`:37-45`) wraps `protectedProcedure` with `assertRole`. Review-queue
classification (`:494-521`): `near_snooze_cap` threshold = `cap - 30`, floored at 0
(`:453`) to defend against sub-30 caps. ORDER BY is whitelisted by zod enum
(`:457-463`) — no user SQL reaches the query.

## B.13 Commands (`src/server/services/commandBus.ts`)

Dispatch at `commandBus.ts:1014-1037`. Roles from `commandCatalog.ts:429-440`.

| Command | Role | Effect | Recompute trigger | Lines |
|---|---|---|---|---|
| `setCustomerCreditLimit` | manager (owner if >1.5× rec) | Manual limit; resets review/snooze | `manualTrigger` | `5999-6045` |
| `revertCustomerCreditToEngine` | manager | →engine; requires existing assessment | `manualTrigger` | `6047-6087` |
| `snoozeCustomerCreditReminder` | manager | Bump review date, ++snooze; cap-enforced | none | `6089-6137` |
| `setCustomerEngineMax` | manager | Set/clear `engine_max` | `event:setEngineMax` | `6139-6160` |
| `setCustomerStance` | manager | Set/clear `stance_id` | `event:setStance` | `6162-6185` |
| `disableCreditEngineForCustomer` | **owner** | Set `engine_disabled_*`; engine-source→manual | none | `6187-6214` |
| `enableCreditEngineForCustomer` | **owner** | Clear disabled flags | `manualTrigger` | `6216-6236` |
| `createCreditEngineStance` | **owner** | New stance + history | none | `6238-6284` |
| `updateCreditEngineStance` | **owner** | Edit; if weights change → enqueue all on stance | `event:stanceEdited` | `6286-6373` |
| `deleteCreditEngineStance` | **owner** | Delete if unused & not default | none | `6375-6428` |
| `setCreditEngineConfig` | **owner** | Config + history; snooze cap ≥30; shadow one-way | none | `6430-6517` |
| `bulkRevertCustomersToEngine` | **owner** | Bulk →engine (assessment-gated) + optional shadow flip | `bulkRevert` | `6519-6623` |

**Stance weight validation** (`commandBus.ts:5935-5986`): six integer weights in
0–100 summing to exactly 100; `maxWeight > 50` requires
`acknowledgeExtremeWeights=true` + ≥12-char justification.

**Reversibility** (`commandBus.ts:5029-5074`): `setCustomerCreditLimit`,
`revertCustomerCreditToEngine`, `snoozeCustomerCreditReminder` restore the prior
customer snapshot and (for the first two) enqueue a recompute
(`event:reverseSalesOrder`, `:5083-5085`). `deleteCreditEngineStance` and
`bulkRevertCustomersToEngine` are catalog-`terminal` (`commandCatalog.ts:572,574`).

## B.14 Metrics & observability

`metrics.ts` — in-process singleton counters (`creditEngineMetrics`,
`:43-104`) + `logCreditEngineEvent` JSON logger (`:110-121`). Phase 7a; no backend
yet (see `docs/credit-engine-alerts.md`). Counters: `decision_issued`,
`override_applied`, `shadow_mode_miss`, `divergence_observed`, `worker_stalled`.
All emit sites are best-effort try/catch so observability can never break the
worker, reaper, or report.

## B.15 Invariants (must always hold)

1. Stance weights sum to **exactly 100** — enforced in code (`scoring.ts:29-31`,
   `commandBus.ts:5962`) and DB CHECK (`migrations/0033:19-22`).
2. Every signal score is an integer in **[0,100]** — code asserts + DB CHECK.
3. `multiplier <= 10.0`, `recommended_limit`/`final_limit` in **[0, 1e8]** — DB CHECK
   (`migrations/0033:81-84`) + code clamp `MAX_LIMIT` (`worker.ts:43,217`).
4. A customer with `credit_limit_source='engine'` **must** have
   `last_assessment_id` set — DB CHECK `customers_engine_source_has_assessment`;
   enforced pre-emptively by revert (`commandBus.ts:6061-6065`) and bulk-revert
   eligibility (`:6536-6564`).
5. **At most one pending queue row per customer** — partial unique index
   (`migrations/0033:116-117`) + `ON CONFLICT DO NOTHING` (`enqueue.ts:44,87`).
6. Assessments are **immutable / append-only**; the customer denorm
   (`last_assessment_id`) points at the latest.
7. `final_limit <= recommended_limit` always (engine_max only lowers,
   `worker.ts:219`).
8. Shadow mode is **monotonic** true→false (`commandBus.ts:6480-6482`).
9. In shadow mode / manual / disabled / pre-cold-start, `credit_limit` is **never**
   written (`worker.ts:182-287`).
10. Idempotency: re-processing the same queue row yields the same assessment via
    `idempotency_key` uniqueness (`worker.ts:99-102,242`).

## B.16 Failure modes & recovery

| Failure | Detection | Recovery |
|---|---|---|
| Worker crash mid-txn | work-txn ROLLBACK; attempts already incremented | row →`pending` (retry) or `failed_terminal` at 5 attempts (`worker.ts:353-362`) |
| Worker wedged in `processing` | `last_attempted_at` age | reaper resets >10min (`reaper.ts`); nightly flags >30min |
| Partial-commit retry | duplicate `idempotency_key` | SELECT existing assessment (`worker.ts:255-272`) |
| Customer deleted between enqueue & process | customer not found | queue row →`done`, no assessment (`worker.ts:126-132`) |
| Missing config row | `loadConfig` throws | "run pnpm db:seed first" (`worker.ts:395-397`); router returns 500 |
| Stance row missing | `loadStanceWeights` throws | hard error (`worker.ts:421-423`) |
| Denorm drift (engine source) | `reconcileLimitDrift` + nightly drift scan | surface to operator; nightly recompute realigns applied rows |
| Sub-30 snooze cap (legacy) | router `nearCapThresholdDays` floor 0 (`credit.ts:453`) | graceful; `setCreditEngineConfig` blocks new <30 (`:6468-6473`) |

## B.17 Edge cases worth memorizing

- **Empty-data customer**: most signals return neutral 50 with confidence `none`;
  debt-aging returns **100** (no debt = good); base 0 ⇒ recommended 0 ⇒ cold-start
  not ready (`coldStart.ts:17-21`).
- **`recommended_limit = 0` with open invoices**: a divergence/KPI **blocker** —
  flipping live would block sales (`divergenceReport.ts:270-272`).
- **Manual limit reset on every `setCustomerCreditLimit`**: snooze count → 0,
  last-reviewed → now (`commandBus.ts:6037-6038`).
- **Stance weight edit cascades**: only when weights actually change
  (`weightsChanged`, `commandBus.ts:6319-6367`) — name/description edits do not
  recompute.
- **`disableCreditEngineForCustomer` flips engine-source to manual**
  (`commandBus.ts:6206-6208`) to preserve the source-has-assessment invariant and
  freeze the limit.
- **Bulk revert reports skips**: manual customers without an assessment are
  **counted as skipped**, not silently dropped (`commandBus.ts:6553-6564,6612-6615`).

---

## Module / command / table / proc / component checklist

**Engine modules (`src/server/services/creditEngine/`)**
- [x] `base.ts` — base amount + median
- [x] `scoring.ts` — `aggregateOverallScore`, `mapScoreToMultiplier`
- [x] `confidence.ts` — `bucketConfidence`
- [x] `coldStart.ts` — `isColdStartReady`
- [x] `effectiveStance.ts` — `resolveEffectiveStanceId`
- [x] `inputGuards.ts` — §1.0 guard clauses
- [x] `index.ts` — public exports
- [x] `orchestrator.ts` — `recomputeAllCustomers` (drain loop)
- [x] `worker.ts` — `processOneRecompute`
- [x] `reaper.ts` — `reapStaleProcessingRows`
- [x] `enqueue.ts` — `enqueueCustomerRecompute`, `enqueueAllCustomers`
- [x] `nightlyCron.ts` — `runNightlyCreditEngineAudit`
- [x] `divergenceReport.ts` — `divergenceReport` + KPI
- [x] `reconciliation.ts` — `reconcileLimitDrift`
- [x] `metrics.ts` — counters + structured log
- [x] `signals/` — revenueMomentum, cashCollection, profitability, debtAging, repaymentVelocity, tenureDepth

**Commands (commandBus.ts)**
- [x] setCustomerCreditLimit · revertCustomerCreditToEngine · snoozeCustomerCreditReminder
- [x] setCustomerEngineMax · setCustomerStance
- [x] disableCreditEngineForCustomer · enableCreditEngineForCustomer
- [x] createCreditEngineStance · updateCreditEngineStance · deleteCreditEngineStance
- [x] setCreditEngineConfig · bulkRevertCustomersToEngine
- [x] reversal handlers for the three reversible credit commands

**Tables (schema.ts / migrations 0033, 0040, 0060)**
- [x] customers (credit columns) · credit_engine_stances · credit_engine_config
- [x] customer_credit_assessments · credit_recompute_queue
- [x] credit_engine_config_history · credit_engine_stance_history
- [x] credit_engine_daily_audit · credit_overrides

**Router procedures (credit.ts)**
- [x] customerCreditAssessments · creditEngineStances · divergenceReport
- [x] creditReviewQueue · creditRecomputeQueueHealth · customerCreditStatus
- [x] isBannerDismissed · dismissBanner · clearBannerDismissal

**Components / UI**
- [x] views/CreditReviewView.tsx
- [x] credit/CustomerCreditPanel.tsx (+ AssessmentHistoryDrawer)
- [x] credit/EditCreditLimitModal.tsx
- [x] credit/ShadowModeBanner.tsx
- [x] credit/CreditDivergencePanel.tsx
- [x] credit/CreditQueueHealthWidget.tsx
- [x] credit/creditPanelUtils.ts (bucketSignal, classifyDelta, shouldShowSalesCreditIndicator)

**Ops / docs**
- [x] scripts/credit-engine-nightly-cron.ts
- [x] docs/credit-engine.md · docs/credit-engine-alerts.md
- [x] Sales handoff: confirm/post credit-limit gate (commandBus.ts:3312, 3411)
