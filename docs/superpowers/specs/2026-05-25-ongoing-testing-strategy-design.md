# Ongoing Testing Strategy Design

**Date:** 2026-05-25  
**AQA reviewed:** yes — report at `~/.codex-runs/claude-qa/20260525T195016Z-.../report.md`  
**Status:** Approved by Evan, proceeding to implementation

---

## Problem

TERP Operator has 26 Playwright e2e specs and ~90+ Vitest unit tests written and passing, but most of them run nowhere automatically. Live regressions during user testing rollout can go undetected until a user reports them.

## Goal

Catch failures as they happen — not after users report them. Post-deploy validation fires automatically after every staging deploy; a nightly sweep confirms the app is still healthy each morning.

## Constraints

- Use only tools already in the repo (Playwright, Vitest, GitHub Actions, `gh` CLI)
- No new npm dependencies
- Smoke tests must complete in < 3 min
- Alert must create or update a GitHub Issue (not create duplicates)
- Credentials must be rotatable without touching code

---

## Design: 3-Tier Pyramid

### Tier 1 — Smoke `tests/smoke/` (~2–3 min)

**When**: After every staging deploy AND nightly  
**What**: 5 purposely small Playwright specs — each independently logs in and asserts a single view is alive. No seed-data assertions, no multi-step commands.

| File | Assertion |
|------|-----------|
| `health.spec.ts` | `/api/health` → `{ok: true}` at HTTP 200 |
| `auth-shell.spec.ts` | Login works, nav shell renders |
| `intake-smoke.spec.ts` | IntakeView + AG Grid visible, command palette opens |
| `sales-smoke.spec.ts` | SalesView + AG Grid visible |
| `payments-smoke.spec.ts` | PaymentsView + Payment allocations heading visible |

Shared helper `_helpers.ts` provides `waitForBackend()` and `loginAsOwner()`. Credentials come from `process.env.PLAYWRIGHT_TEST_EMAIL / PLAYWRIGHT_TEST_PASSWORD` with hardcoded fallbacks.

**Location**: `tests/smoke/` — top-level, NOT inside `tests/e2e/`. Critical: Playwright's `testDir` is recursive; placing smoke inside `tests/e2e/smoke/` would cause the core project to double-execute them during the nightly sweep.

### Tier 2 — Core E2E `tests/e2e/` (~15–20 min)

**When**: Nightly only, after Tier 1 passes  
**What**: All 26 existing Playwright specs unchanged. No modifications to any existing test.

### Tier 3 — Unit `src/**/*.test.*` (~3–5 min)

**When**: Every PR in CI  
**What**: Full Vitest run. Currently only 3 files are pinned in `ci.yml`; this closes the gap. Uses the same DB-exclusion list as `deploy-staging.yml`.

---

## Files to Create

| Path | Purpose |
|------|---------|
| `tests/smoke/_helpers.ts` | `waitForBackend`, `loginAsOwner` shared helpers |
| `tests/smoke/health.spec.ts` | API health + shell load smoke |
| `tests/smoke/auth-shell.spec.ts` | Login + authenticated nav |
| `tests/smoke/intake-smoke.spec.ts` | IntakeView + AG Grid |
| `tests/smoke/sales-smoke.spec.ts` | SalesView + AG Grid |
| `tests/smoke/payments-smoke.spec.ts` | PaymentsView |
| `scripts/report-test-failure.sh` | GH issue create/de-dup helper |
| `.github/workflows/post-deploy-smoke.yml` | Fires after deploy-staging succeeds |
| `.github/workflows/nightly.yml` | Scheduled 6am ET: smoke + core-e2e + unit |

## Files to Modify

| Path | Change |
|------|--------|
| `playwright.config.ts` | Add `smoke` project (`testDir: ./tests/smoke`); add explicit `testDir: ./tests/e2e` to chromium project |
| `.github/workflows/ci.yml` | Add full Vitest run step (same exclusions as deploy-staging) |
| `docs/design-system/decisions-log.md` | Add testing convention entry |

---

## Alert Flow

```
Test fails
  → scripts/report-test-failure.sh <tier> <run-id>
    → gh issue list --label area:qa --label source:agent --search "[<tier>]... in:title"
      → if open issue found: append comment (recurrence)
      → if none: gh issue create with labels + repro commands
```

De-dup uses two separate `--label` flags (AND semantics), tier-scoped title search with `in:title`, and a jq filter that confirms the tier string is actually in the issue title.

---

## AQA Fixes Applied

| Severity | Issue | Fix |
|----------|-------|-----|
| 🔴 Critical | `report-failures` job skipped when smoke fails — no alert fires | `if: always()` + explicit per-job result conditions |
| 🟠 High | Smoke in `tests/e2e/smoke/` re-runs during chromium project | Smoke lives at `tests/smoke/` top-level |
| 🟠 High | `workflow_run` checkout tests `main`, not deployed commit | `ref: ${{ github.event.workflow_run.head_sha }}` |
| 🟠 High | `--label` comma-join is AND-ambiguous; wrong issues get comments | Two `--label` flags + `in:title` scoping |
| 🟡 Medium | Hardcoded credentials — rotation breaks all smoke silently | `process.env.PLAYWRIGHT_TEST_*` with fallback |

---

## Required One-Time GitHub Setup (Post-Implementation)

| Setting | Where | Value |
|---------|-------|-------|
| `STAGING_URL` | Repo → Settings → Variables (not secret) | Staging app URL |
| `STAGING_TEST_EMAIL` | Repo → Settings → Secrets | `owner@terpagro.local` |
| `STAGING_TEST_PASSWORD` | Repo → Settings → Secrets | `terp-demo` |

---

## Acceptance Criteria

- [ ] Post-deploy smoke fires within 5 min of a successful staging deploy
- [ ] Nightly runs at 6am ET regardless of whether a deploy happened
- [ ] A failing smoke test creates a GitHub Issue (or appends a comment to an existing one)
- [ ] Full Vitest suite passes on every PR
- [ ] Adding a new Playwright spec to `tests/e2e/` is automatically included in nightly — no workflow change needed
- [ ] Smoke completes in < 3 min
- [ ] Zero new npm dependencies
