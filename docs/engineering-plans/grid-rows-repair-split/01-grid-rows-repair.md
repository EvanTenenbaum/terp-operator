# Plan 1 — Grid Rows Repair (extract & land)

**Type:** Bug-fix + refactor bundle
**State:** ✅ Code already written and tested on `codex/grid-rows-repair-20260624`
**This plan:** extract the finished work to a clean branch, verify independently, PR.
**Registry anchor:** repo-level fixes (GitHub Issues, not Linear capabilities) — R-07, R-15, R-19 + grid ORDER BY defect.

---

## 1. What this is

Three contiguous commits at the base of the source branch fix real grid defects and
land two small refactors. They are **done** — the task is not to write them but to
separate them from the planning docs piled on top, re-verify them in isolation, and
ship them as one focused PR.

Source range (no docs in it):

```
32de87a (merge-base with main)
 └─ d5f6be6  [FIX] AG Grid module dedup (R-19) + DR-1 category tier (R-15)
     └─ 1d90ea1  [REF] DashboardView router-wire (R-07) + GridColDef unification
         └─ 59644c9  [FIX] subquery-scoped ORDER BY (20 views) + status enums + tests
```

34 `src/` files, +244/−181 lines. `git diff --stat 32de87a 59644c9` confirms no docs.

## 2. What each commit does

### `59644c9` — subquery-scoped ORDER BY (the real bug)
The defect: grid view SQL used table-aliased `ORDER BY` values (`so.created_at`) that
are **not visible** in the outer subquery scope, producing **500s** on sort.

- Replace all 17 table-aliased `defaultOrderBy` values with subquery-visible output
  aliases (`'"createdAt"'` not `'so.created_at'`).
- Remove the `VIEW_TO_ENTITY` normalization map from `gridInputSchema` —
  `gridSqlParts` expects **view** names, not entity types; the normalization itself
  caused 500s.
- Wrap legacy `matchmakingSql()` / `gridSql()` helpers in a subquery layer so
  `ORDER BY` can reference output aliases.
- `matchmaking.router.ts`: rename `description` → `notes` (actual DB column).
- Add missing `createdAt` to Orders and Fulfillment SELECTs; fix `contact_id` in the
  `contact_ledger_entries` CTE.
- Expand `PaymentStatus` (+`draft`, +`ready`) and `PhotographyQueueStatus`
  (+`in_progress`) to observed real-world states.
- **+111 lines of parameterized tests** (`queries.grid.v2.test.ts`) covering all 20
  grid views: builds SQL for every view, asserts subquery-visible ordering uses
  aliases, photography summary aliasing, combobox ordering, status-count acceptance,
  legacy row-helper source columns.

### `1d90ea1` — R-07 + GridColDef unification (refactor)
- **R-07:** delete the 11-line thin wrapper `views/DashboardView.tsx`; `App.tsx`
  imports the template directly from `./templates/DashboardView`.
- Export `GridColDef<T>` from `shared/grid-types.ts`; replace direct `ColDef` imports
  in 18 files (views/hooks/components/utils). Canonical wrappers (`OperatorGrid`,
  `GridView`) keep their direct imports; test files untouched.

### `d5f6be6` — R-19 + R-15 (fix + small data change)
- **R-19:** remove the redundant `ModuleRegistry.registerModules([ClipboardModule])`
  and bare `ag-grid-enterprise` import — the named `LicenseManager` import already
  auto-registers. Kills the "mixing modules" console error.
- **R-15:** move `item.category` Tier 0 → Tier 1 per DR-1 (subcategory > category
  ordering). All 29 entity schemas surveyed; only `itemSchema` needed the change.

## 3. Extraction steps

```bash
# from main, up to date
git fetch origin main codex/grid-rows-repair-20260624
git switch -c fix/grid-rows-repair origin/main

# the 3 code commits are a clean contiguous range, no docs
git cherry-pick 32de87a..59644c9
# (equivalently: cherry-pick d5f6be6 1d90ea1 59644c9 in order)
```

If `main` has advanced past `32de87a` and a conflict surfaces, the likely hot spots
are `src/server/routers/queries.ts` (ORDER BY strings) and `src/client/App.tsx`
(DashboardView import) — resolve toward the subquery-alias form and the direct
template import respectively.

## 4. Verification (BLOCKING — must run, not assume; per CLAUDE.md AQA)

| Gate | Command | Expected |
|---|---|---|
| Typecheck | `pnpm typecheck` | clean (TS strict, no `any`) |
| Grid view tests | `pnpm test src/server/routers/queries.grid.v2.test.ts` | all 20 views green |
| Dashboard tests | `pnpm test DashboardView` | 33 pass (1 pre-existing skip) |
| Grid component tests | `pnpm test OperatorGrid` + CSV export/filter chips/summary | 26 green |
| Parity | `pnpm agent:doctor` / `scripts/check-backend-frontend-parity.mjs` | passes (this file is modified in the bundle) |
| Coverage | `pnpm run test:coverage` against `.coverage-thresholds.json` | meets floor |
| Console | Load a grid view; confirm **no** "mixing modules" error (R-19) | clean console |

Capture actual output for each before any "done" claim. A 500-on-sort regression test
is the headline — confirm a previously-failing view (e.g. Orders sorted by createdAt)
now returns rows.

## 5. Risk & scope

- **Low risk, high confidence** — narrow, defensive changes with new test coverage.
- The status-enum widenings (`PaymentStatus`, `PhotographyQueueStatus`) are additive;
  confirm no exhaustive `switch` elsewhere now misses the new cases (grep
  `PaymentStatus` / `PhotographyQueueStatus` consumers).
- `GridColDef` unification touches 18 files but is type-only; the typecheck gate fully
  covers it.
- **QA level:** Checkpoint (multi-file, touches data-query flow) → per CLAUDE.md,
  invoke adversarial cross-review (`codex-review-broker`) before merge.

## 6. Definition of done

- [ ] Cherry-pick range applied to a branch off current `main`, no docs included.
- [ ] All gates in §4 pass with captured output.
- [ ] No "mixing modules" console error on any grid view.
- [ ] Sort-by-createdAt works on all 20 views (no 500s).
- [ ] PR opened referencing R-07/R-15/R-19 and the ORDER BY defect; adversarial review done.
