# TERP Operator Persona Flow Registry

> **To run a specific flow:**
> Load the scenario file + `_shared/navigation-primer.md` + `_shared/seed-state-reference.md`,
> confirm seed state, then execute.
>
> **To run all Critical-tier flows:**
> Filter table below by Risk = Critical. Load and execute each in order.
>
> **To launch the QA environment automatically (recommended):**
> Tell any agent: **"run persona QA"** or **"run persona flows"**
> The agent reads AGENTS.md and spins up the full isolated environment via `pnpm qa:env:setup`.
>
> **Prerequisites for all flows:**
> Entities confirmed per `_shared/seed-state-reference.md`. App live at `http://127.0.0.1:5173` (or use QA_APP_URL from `pnpm qa:env:setup`).
>
> **To run manually:**
> Ensure `pnpm db:seed:realistic` has been run and app is live at `http://127.0.0.1:5173` (or use QA_APP_URL from `pnpm qa:env:setup`).
> Entities confirmed per `_shared/seed-state-reference.md`.

---

## Cross-Persona Flows ⚠️ Required for all ship decisions

| # | File | Type | Risk | Commands | Est. Time |
|---|------|------|------|----------|-----------|
| X1 | `_cross-persona/01-purchase-to-payment-lifecycle.md` | cross-persona | Critical | CMD-PO, CMD-INTAKE, CMD-SALES, CMD-FULFILLMENT, CMD-PAYMENTS | 25 min |
| X2 | `_cross-persona/02-intake-reversal-mid-sale.md` | cross-persona | Critical | CMD-INTAKE, CMD-SALES, CMD-RECOVERY | 20 min |

---

## Persona Flows

| # | Persona | File | Type | Risk | Commands | Est. Time | Last Validated |
|---|---------|------|------|------|----------|-----------|---------------|
| 1 | Owner / Main Manager | `owner-manager/01-morning-triage-normal.md` | normal | Normal | CMD-SALES, CMD-INTAKE | 10 min | 2026-05-22 ✅ |
| 2 | Owner / Main Manager | `owner-manager/02-exception-approval-edge.md` | edge-case | Deep QA | CMD-SALES, CMD-PAYMENTS | 12 min | not yet run |
| 3 | Owner / Main Manager | `owner-manager/03-period-closeout-full-lifecycle.md` | full-lifecycle | Deep QA | CMD-CLOSEOUT | 20 min | not yet run |
| 4 | Sales Operator | `sales-operator/01-instant-sale-normal.md` | normal | Normal | CMD-SALES | 8 min | not yet run |
| 5 | Sales Operator | `sales-operator/02-customer-credit-hold-edge.md` | edge-case | Deep QA | CMD-SALES, CMD-PAYMENTS | 10 min | not yet run |
| 6 | Sales Operator | `sales-operator/03-no-available-inventory-error.md` | error-path | Normal | CMD-SALES | 6 min | not yet run |
| 7 | Inventory Operator | `inventory-operator/01-receive-batch-normal.md` | normal | Normal | CMD-INTAKE, CMD-PO | 10 min | 2026-05-22 ✅ |
| 8 | Inventory Operator | `inventory-operator/02-flagged-batch-edge.md` | edge-case | Deep QA | CMD-INTAKE | 10 min | 2026-05-22 ✅ |
| 9 | Inventory Operator | `inventory-operator/03-reversal-after-bad-post-error.md` | error-path | Deep QA | CMD-INTAKE, CMD-RECOVERY | 12 min | not yet run |
| 10 | Payments / Accounting | `payments-accounting/01-log-and-allocate-payment-normal.md` | normal | Deep QA | CMD-PAYMENTS | 10 min | 2026-05-22 ✅ |
| 11 | Payments / Accounting | `payments-accounting/02-unapplied-balance-edge.md` | edge-case | Deep QA | CMD-PAYMENTS | 12 min | 2026-05-22 ✅ |
| 12 | Payments / Accounting | `payments-accounting/03-vendor-bill-payment-lifecycle.md` | full-lifecycle | Critical | CMD-VENDOR, CMD-PAYMENTS | 15 min | not yet run |
| 13 | Warehouse Operator | `warehouse-operator/01-pick-weigh-fulfill-normal.md` | normal | Normal | CMD-FULFILLMENT | 8 min | not yet run |
| 14 | Warehouse Operator | `warehouse-operator/02-weight-discrepancy-edge.md` | edge-case | Deep QA | CMD-FULFILLMENT | 10 min | not yet run |
| 15 | Warehouse Operator | `warehouse-operator/03-partial-fulfillment-error.md` | error-path | Deep QA | CMD-FULFILLMENT | 10 min | not yet run |
| 16 | Support Operator | `support-operator/01-trace-order-status-normal.md` | normal | Normal | — (read-only) | 6 min | not yet run |
| 17 | Support Operator | `support-operator/02-reconstruct-payment-history-edge.md` | edge-case | Normal | — (read-only) | 8 min | not yet run |
| 18 | Support Operator | `support-operator/03-missing-batch-investigation-error.md` | error-path | Normal | CMD-RECOVERY | 8 min | not yet run |
| 19 | Photographer / Readiness | `photographer-readiness/01-batch-photo-session-normal.md` | normal | Normal | CMD-INTAKE | 8 min | not yet run |
| 20 | Photographer / Readiness | `photographer-readiness/02-missing-media-blocker-edge.md` | edge-case | Normal | CMD-INTAKE | 8 min | not yet run |
| 21 | Photographer / Readiness | `photographer-readiness/03-catalog-readiness-sweep-normal.md` | normal | Normal | — (read-only) | 6 min | 2026-05-22 ✅ |
| 22 | Connector Actor | `connector-actor/01-submit-connector-request-normal.md` | normal | Normal | CMD-CONNECTOR | 8 min | 2026-05-22 ✅ |
| 23 | Connector Actor | `connector-actor/02-request-routing-edge.md` | edge-case | Normal | CMD-CONNECTOR | 8 min | 2026-05-22 ✅ |
| 24 | Connector Actor | `connector-actor/03-safe-default-no-ledger-write-error.md` | error-path | Deep QA | CMD-CONNECTOR | 10 min | 2026-05-22 ✅ |

---

## Coverage Summary

| Persona | Flows | Normal | Edge | Error/Lifecycle |
|---------|-------|--------|------|-----------------|
| _Cross-persona | 2 | — | — | 2 |
| Owner / Main Manager | 3 | 1 | 1 | 1 |
| Sales Operator | 3 | 1 | 1 | 1 |
| Inventory Operator | 3 | 1 | 1 | 1 |
| Payments / Accounting | 3 | 1 | 1 | 1 |
| Warehouse Operator | 3 | 1 | 1 | 1 |
| Support Operator | 3 | 1 | 1 | 1 |
| Photographer / Readiness | 3 | 2 | 1 | — |
| Connector Actor | 3 | 1 | 1 | 1 |
| **Total** | **26** | **9** | **8** | **9** |

---

## Adding a New Flow (5 steps)

1. Create the file in the correct persona directory with the next number prefix.
2. Use `_shared/scenario-template.md` as the base.
3. Add a row to the Persona Flows table above.
4. Update the Coverage Summary counts.
5. If the new flow introduces a command family that spans two persona domains, add a cross-persona flow too.

## Adding a New Persona (5 steps)

1. Create `docs/qa/persona-flows/<persona-slug>/` directory.
2. Write `_persona.md` using `_shared/persona-template.md`.
3. Write at least one scenario file.
4. Add the persona to the Coverage Summary table.
5. Note the addition in `docs/design-system/decisions-log.md`.

---

## Shared Resources

| File | Purpose |
|------|---------|
| `_shared/navigation-primer.md` | State-based routing, nav sequences, AG Grid patterns |
| `_shared/seed-state-reference.md` | Real entity names/IDs from the database |
| `_shared/scenario-template.md` | Blank scenario file for new flows |
| `_shared/persona-template.md` | Blank persona file for new personas |

---

## Ship Gate Rules

A QA run grade is **VALID FOR SHIP DECISION** only when:
1. Both cross-persona flows (X1 and X2) were run and passed or have an explicit N/A rationale.
2. All Critical-tier flows in this registry were run.

If either condition is unmet, the run report must show: `⚠️ SHIP GATE: INVALID — [reason]`
