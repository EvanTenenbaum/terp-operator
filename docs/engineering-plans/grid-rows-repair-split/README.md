# Branch split: `codex/grid-rows-repair-20260624`

**Date:** 2026-06-25
**Purpose:** The branch `codex/grid-rows-repair-20260624` accumulated four unrelated
work streams in one place — one of finished code and three of planning docs. This
folder splits them into **four independent, execution-ready implementation plans** so
each can be reviewed, sequenced, and shipped on its own PR instead of as one tangled
branch.

## What was on the source branch

`git log 32de87a..origin/codex/grid-rows-repair-20260624` (oldest first):

| Commit | Type | Stream |
|---|---|---|
| `d5f6be6` [FIX] AG Grid module dedup (R-19) + DR-1 category tier (R-15) | **code** | 1 |
| `1d90ea1` [REF] DashboardView router-wire (R-07) + GridColDef unification | **code** | 1 |
| `59644c9` [FIX] subquery-scoped ORDER BY (20 views) + status enums + tests | **code** | 1 |
| `ec4aef6` docs: product-as-monetary-instrument (barter) plan | doc | 3 |
| `ec59c91` docs: resolve barter open questions | doc | 3 |
| `e0a4529` docs(ux): smart-tables report | doc | 2 |
| `95b8ef2` docs(ux): smart-tables deep design | doc | 2 |
| `b096e59` docs(ux): smart-tables master plan | doc | 2 |
| `7866783` docs(ux): smart-tables AQA + corrections | doc | 2 |
| `aced16a` docs: backend evolvability assessment | doc | 4 |

**Key fact:** the three **code** commits are a contiguous range at the base of the
branch (`32de87a..59644c9`, 34 `src/` files, no docs). The seven **doc** commits sit
on top of them. So the code extracts cleanly with a single cherry-pick range and the
docs never have to move with it.

## The four plans

| # | Plan | Nature | State on source branch | First action |
|---|---|---|---|---|
| 1 | [`01-grid-rows-repair.md`](./01-grid-rows-repair.md) | Bug-fix + refactor bundle | ✅ **code written + tests** | Extract the commit range to a clean branch, verify, PR |
| 2 | [`02-smart-tables-order-entry.md`](./02-smart-tables-order-entry.md) | Large UX initiative (P1–P6) | 📄 design docs only | Build P1 (wire `comboboxOptions`) after design-review gate |
| 3 | [`03-barter-settlement.md`](./03-barter-settlement.md) | New money capability | 📄 engineering plan only | Phase 0 schema/migration after plan-review gate |
| 4 | [`04-backend-command-registry.md`](./04-backend-command-registry.md) | Architecture refactor | 📄 assessment only | Prototype `defineCommand` on purchase-orders domain |

The source design docs (smart-tables ×5, barter ×1, evolvability ×1) live on
`codex/grid-rows-repair-20260624` and are referenced by path in each plan. They should
be carried over to `main` **with** their respective work stream's first PR (so the
design lands atomically with the code it informs), not bundled here.

## Sequencing recommendation across streams

1. **Stream 1 first** — it's finished, low-risk, unblocks nothing but stops bit-rot. Land it.
2. **Stream 4 (command registry) next, prototype only** — it changes the seam every other
   feature is added through. Proving `defineCommand` on one domain before Stream 3 means
   barter can be the *first* feature authored the new way instead of the last bolted on the old way.
3. **Stream 3 (barter)** — high-value money capability; benefits from Stream 4's pattern but doesn't hard-depend on it.
4. **Stream 2 (smart-tables)** — largest, most independent; P1 ships visible value cheaply and can run in parallel with 3.

Each stream routes through the CLAUDE.md gates independently (design review → plan
review → execution-method choice). These documents are the *input* to those gates, not
a substitute for them.
