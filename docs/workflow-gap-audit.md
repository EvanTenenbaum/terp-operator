# TERP Agro Workflow Gap Audit

Source of truth:

- `../terp-numbers-command-system-roadmap/docs/control/OPERATOR_JOURNEYS.md`
- Supporting scope: `../terp-numbers-command-system-roadmap/docs/control/FEATURE_SCOPE_LEDGER.md`
- Supporting UX/control framing: `../terp-numbers-command-system-roadmap/docs/control/UI_UX_CONTROL_SURFACE_ARC_REPORT.md`

## Summary

TERP Agro already had the right architectural spine: dense grids, a typed command bus, idempotency keys, session auth, RBAC, Drizzle/Postgres, JSONL journaling, and all 46 command names. The main gaps were workflow fidelity: a few journeys exposed rows without the operator actions the bible requires, and several commands were missing guardrails or audit data needed for recovery.

This pass closes those gaps by making the bible visible in code: more spreadsheet columns, live work queues, explicit route/review controls, recovery search/retry/support packet, fulfillment line bagging, closeout adjustments, scheduled-only vendor payout recording, duplicate source-row refusal, replayable input payloads, and consignment depletion due signaling.

## Journey Comparison

| Journey | Bible expectation | Gap found | Fix shipped |
| --- | --- | --- | --- |
| J01 Owner Daily Decision View | KPI cards drill into source rows, pending queues, recent activity, health, decision/assignment flow | KPI drilldowns existed, but queues did not navigate to work and there was no unified source queue | Added dashboard work queue query and grid; queue cards route operators to the owning lane |
| J02 Fast Inventory Intake | Spreadsheet-like intake with code/date/source/category/shorthand/item/qty/ticket/range/notes/ownership/arrival; selected vendor receipt; immutable intake qty after posting | Intake grid missed several workbook-native columns and row metadata | Added schema/migration/query/UI columns for source code, intake date, ticket cost, price range, notes; duplicate rows preserve metadata |
| J03 Guided Selling / Sales Sheet | Customer-aware inventory filters, explainable suggestions, internal Sales Sheet with margin, customer Sales Catalog hiding cost/margin | Suggestions were customer-only and export was not real | Added category, vendor, tag, price bracket, aging filters; suggestion reasons include pricing logic; CSV export hides cost/margin in catalog mode |
| J04 Client Order Posting | Ready/confirm, validate inventory/credit/duplicate source row, no duplicate posting, reversal | Posting was guarded against duplicate order posting but not duplicate source rows; ready action was underexposed | Added Ready/confirm action, duplicate source-row refusal, sourceRowKey tracking, reprice action |
| J05 Payment Logging and Allocation | Payment rows include method/location/bucket/notes, invoice suggest, FIFO/partial/overpay, negative amount buyer credit | Command supported FIFO and negative amount, but UI did not expose invoice, bucket, notes, or reference | Added invoice selector, bucket, reference, notes, and allocation to selected invoice or FIFO |
| J06 Vendor Payable and Payout | Due/scheduled grouped by vendor; scheduled means real event; consignment depletion triggers due; payout traceable | Payout could be recorded before scheduling; consignment depletion was not surfaced | `recordVendorPayment` now refuses unscheduled payout; consigned depleted lots trigger/approve vendor bill due status |
| J07 Fulfillment and Bagging | Ready order queue, pick list, line-level weigh/pack, bag assignment, labels, manifest, tracking | Only pick-list header actions existed | Added fulfillment line query/grid, pack controls, manual/auto bag code, actual qty/weight, 4x6/2x1 labels, tracking, manifest CSV generation |
| J08 Connector Request Review | Approve/reject/route, connectors never directly mutate ledgers, review history, customer-facing hides internal margin | Approve/route existed but reject and operator notes were missing | Added reject, route selector, operator notes, routing defaults, persisted review history |
| J09 Mistake Recovery | Search commands/rows, preview reversal, reverse by ID, retry failed commands, support packet, correction journal, snapshot diff, restore preview | Reversal preview existed; retry impossible because payload was not stored; support packet and snapshot diff were missing | Command journal now stores input payload; added search UI, retry failed command, support packet export, correction journal entry, snapshot diff, restore preview controls |
| J10 Archive and Closeout | Eligibility, period review, adjustments, lock/archive, artifacts, control totals, unsafe rows refused | Lock/archive existed; adjustment and control-total visibility were thin | Added closeout adjustment controls and explicit control total display; existing archive writes CSV/JSONL/PDF and refuses unsafe rows |

## Backend Changes

- Migration `0002_workflow_gap_closure.sql` adds missing workflow columns.
- `command_journal.input_payload` stores original command payload for replay-safe retry.
- Sales posting refuses duplicate source rows and marks consignment vendor bills due/approved when consigned inventory is depleted.
- Vendor payouts require scheduled status unless an explicit command override is provided.
- Fulfillment writes deterministic bag manifest CSVs under `ARCHIVE_DIR/bag-manifests`.
- Queries now expose work queues, fulfillment lines, support packets, snapshot diffs, richer recovery rows, and richer sales suggestions.

## Adversarial QA Findings Closed

| Finding | Risk | Fix shipped | Evidence |
| --- | --- | --- | --- |
| `drizzle-orm` version was vulnerable to a high-severity SQL identifier escaping advisory | Security | Upgraded runtime `drizzle-orm` to `^0.45.2` and `drizzle-kit` to current | `pnpm audit --audit-level high --prod` reports no known vulnerabilities |
| Draft sales orders could be posted directly, bypassing confirm-time credit checks | Ledger integrity | `postSalesOrder` now requires `confirmed` status and rechecks credit immediately before posting | `adversarial-command-contracts.spec.ts` |
| Some commands were labeled reversible but `reverseCommandById` did not unwind their ledger consequences | Recovery/trust | Added real reversals for payment logs, allocations, vendor payouts, fulfillment marks, connector routing, correction entries, and stronger sales-post reversal balance handling | `adversarial-command-contracts.spec.ts` verifies buyer-credit reversal restores balance |
| Zero-dollar payments and over/early vendor payout attempts could create misleading ledger rows | Money controls | Zero payments are refused; vendor payouts must be scheduled, positive, and not exceed open bill balance | `adversarial-command-contracts.spec.ts` |
| Fulfillment lines could be marked packed without weight | Warehouse controls | Packing now requires positive actual quantity and positive actual weight | `adversarial-command-contracts.spec.ts` |
| Production could boot with the development session secret, and login did not regenerate session IDs | Auth hardening | Production now rejects the default secret; login regenerates session before storing `userId` | `pnpm typecheck`, E2E login |
| Mobile nav labels were visually hidden and lost accessible route names | Accessibility | Added explicit `aria-label` to navigation buttons | Mobile E2E route-name test |
| Object-valued AG Grid cells produced warnings on connector/archive payloads | Operator polish | Added safe object/array grid formatting and disabled noisy inferred cell type warnings | Hostile browser walk across desktop/tablet/mobile has clean console |

## Remaining Boundaries

- Full destructive restore remains intentionally read-only in app. The safe production alternative is restore preview in TERP Agro, then an offline maintenance restore by the owner/operator.
- Connector surfaces remain review queues only. They route into normal commands and do not mutate ledgers directly.
