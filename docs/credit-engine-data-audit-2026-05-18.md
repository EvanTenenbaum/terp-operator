# Credit Engine Data Audit — 2026-05-18

**Source:** `pnpm tsx scripts/credit-engine-data-audit.ts` run against the realistic_100d-seeded dev database on 2026-05-18.

**Note:** Dev DB had only 3 rows at first audit attempt; reseeded with `pnpm db:seed:realistic` (DEMO_SEED_SCENARIO=realistic_100d) before capturing the numbers below.

## 1. sales_order_lines.unit_cost coverage

| Metric | Value |
|---|---|
| Total lines | 615 |
| Null unit_cost | 0 (0.00%) |
| Zero unit_cost | 0 (0.00%) |
| Negative unit_cost | 0 |

## 2. invoices: terms distribution and data quality

`invoices.due_date` and `invoices.total` are both `NOT NULL` per schema — null-rate audits would always return 0 and don't tell us anything useful. The audit instead measures the *terms distribution* (`due_date − created_at` bucketed into typical net-term ranges) and flags data-quality anomalies (future-dated, negative totals, due-before-issued).

| Metric | Value |
|---|---|
| Total invoices | 513 |
| Future-dated created_at | 0 |
| Negative total | 0 |
| Due-before-issued (data quality red flag, expected 0) | 0 |
| Terms < 5 days | 0 |
| Terms 5–14 days | 100 |
| Terms 15–30 days | 413 |
| Terms 31–60 days | 0 |
| Terms 61+ days | 0 |
| Average terms (days) | 19.43 |

## 3. invoice_disputes.status taxonomy

| Status | Count |
|---|---|
| open | 3 |
| investigating | 3 |

## Decisions

### Profitability signal (§1.3 of design spec)

Spec gate:
- unit_cost coverage ≥80% (null + zero combined <20%) → ship in Phase 1
- 50–80% → ship with fallback chain, flag low-coverage assessments
- <50% → defer to v1.1; ship 5 signals in v1

**Decision:** **SHIP**
**Rationale:** 100% coverage on 615 sales_order_lines (zero null, zero zero, zero negative). No fallback chain needed. Profitability signal proceeds in Phase 1 as a first-class member of the 6-signal lineup.

### Net-terms aware debt aging (§1.4)

Spec assumes `invoices.due_date` is populated. Per the schema (NOT NULL), it always is — the real question is whether the *distribution* of terms looks realistic:

- If `due-before-issued > 0`: data quality red flag — backfill or correct the rows before shipping (engine will score them oddly otherwise)
- If the distribution clusters in 0-day terms: net-terms aware aging won't add value over issued-at aging — flag it but ship anyway
- If a healthy spread (some 14-day, 30-day, 60-day rows): ship as specified

**Decision:** **SHIP**
**Rationale:** Zero due-before-issued (no data quality red flag). Terms distribution is meaningful — 100 invoices at 5-14 days (likely Net-14 customers) and 413 invoices at 15-30 days (likely Net-30 customers), averaging 19.4 days. Net-terms-aware aging will produce materially different (and more accurate) scores than issued-at aging for these customers. Ship as specified. Caveat: no 31-60 or 61+ day terms in this seed; if real-world data includes longer terms, the existing piecewise scoring in §1.4 still applies — verify against staging/prod data before Phase 5 rollout.

### Dispute exclusion (§1.4)

Spec assumes `invoice_disputes.status = 'open'` is the canonical "active dispute" filter.
- If 'open' present in taxonomy: confirmed.
- If only 'new', 'pending', or other values appear: spec's exclusion filter needs to be updated.

**Decision:** **UPDATE-SPEC-FILTER (broaden to include `investigating`)**
**Active-dispute filter to use in signals:** `status IN ('open', 'investigating')`
**Rationale:** The seeded data shows two active dispute statuses: `open` (3 rows) and `investigating` (3 rows). The spec's `status = 'open'` filter would exclude only half of the actively-disputed invoices, leaving `investigating`-state disputes incorrectly counted in debt aging. Broadening to `IN ('open', 'investigating')` matches the spec's intent ("exclude active disputes from aging"). The spec text in §1.4 should be patched accordingly when Phase 2 implements the compose layer. Resolved disputes (presumably `resolved` / `closed` / etc.) remain included as normal aging — correct behavior because once resolved, the invoice's age is again meaningful.

## Next Steps

Phase 1 proceeds with the decisions above. All 6 signals will be implemented (profitability not deferred). The `invoice_disputes` exclusion filter in the Phase 2 compose layer must use `IN ('open', 'investigating')` and the spec patch tracking item is recorded here.
