# 2026 TERP Agro Product Integration Roadmap

Date: 2026-05-12
Status: active PM roadmap
Authority: integrates `docs/design/spec.md`, `docs/design/replication-playbook.md`, product north stars, backend coverage audit, TA/MR/UF/JY/J/GAP/S backlog context, and the TERP Numbers manifest concepts supplied in conversation.

## 1. Executive Summary

The product is entering the anti-sprawl phase. TERP Agro already has a working backend command spine, broad frontend coverage, and a design pass that fixes cohesion/hierarchy. The next product move is not "add every missing feature"; it is to integrate frontend and backend through a governed operating model.

What ships from this roadmap:

- A canvas-grammar frontend pass: Keel, Identity Ribbon, Context Drawer, status-aware primary actions, and Reports.
- Backend hardening packets for pricing, tags, inventory state transitions, connector lifecycle, closeout safety, and reversal completeness.
- A capability registry that classifies every capability before implementation.
- Phase readiness files requiring playbook recipes and smoke checks.
- Drift/audit tooling so new capabilities cannot bypass the framework.

North-star success: an operator can start New Sale, New PO, Receive Inventory, Money In, Money Out, Fulfillment, Recovery, and Closeout from row-native workflows with fewer always-visible buttons, stronger audit/reversal behavior, and no loss of spreadsheet speed.

## 2. Governing Framework

Every capability must pass this sequence:

1. Identify the operator moment.
2. Map to a work loop: Buy, Receive, Sell, Collect/Pay, Fulfill, Recover/Close, Decide, Support.
3. Classify exposure: `core_workflow`, `context`, `control`, `projection`, `infrastructure`, or `rejected`.
4. Apply the design placement law from `docs/design/spec.md`.
5. Reuse existing components and command/query surfaces before creating anything.
6. Make row/status behavior explicit.
7. Preserve operator vocabulary.
8. Cite the Replication Playbook recipe.
9. Run the phase smoke test.

The capability registry lives at `docs/product/capability-registry.md` and is the source of truth for future implementation scope.

## 3. Integrated Phase Sequence

The design spec phases remain the frontend execution unit. Backend packets are sequenced around them so the product becomes complete without turning the UI into a command dump.

| Phase | Product goal | Frontend scope | Backend scope | Gate evidence |
| --- | --- | --- | --- | --- |
| 0a | Foundation without public IA churn | WorkspacePanel focus revision, CommandPalette cleanup, Hotkeys groundwork | none | typecheck, build, parity, `audit:product-roadmap` |
| 0b | Canvas grammar behind flag | Keel chips, SideNav groups, drawer primitive, identity ribbon, Reports route shell | none | canvas E2E, focus E2E, no visible JSON default |
| A | Backend invariant hardening | no major UI | closeout blocker parity, reversal completeness matrix, archive control totals | command-contract tests |
| 1 | Customer-centered selling | Sales identity/drawer, customer tabs, output tab, below-floor warning UI | thin sales projection only if needed | AC-01, sales band-swap, customer-safe output |
| B | Commercial trust kernel | price context UI only | pricing profiles, guardrails, price basis snapshots, tag catalog, batch tags | pricing/tag unit and command tests |
| 2 | Procurement and global Finder | PO header/drawer, Intake drawer, Inventory split, Finder overlay | partial PO quantity receiving if needed | AC-02, AC-05, AC-09 |
| C | Inventory and connector kernel | connector routing UX stabilized | inventory status/location/ownership transfers; connector accepted-to-posted bridge | connector safety, inventory movement tests |
| 3 | Money loop | Payments and Vendor Payouts split, Quick Ledger draft persistence, allocation/payout drawer tabs | explicit payout/reversal matrix where missing | AC-04, payment allocation tests |
| 4 | Sell follow-through | Orders, Fulfillment, Connectors, Client Ledger split and drawerized | no new commands unless connector bridge accepted | AC-03, AC-11, AC-13, AC-14 |
| 5 | Recovery and closeout | Recovery and Closeout drawer tools, row-origin reversal, unsafe drilldowns | archive refusal parity complete | AC-07, AC-08, closeout blocker tests |
| 6 | Decide | Dashboard Today Focus, Reports route, report drawer tabs | client-side reports first; backend projection only if volume demands | AC-12 reports math |
| 7 | Polish and release | keyboard sweep, focus/drawer persistence, accessibility, vocabulary pass | final command/reversal audit | full smoke suite, all flags on |

## 4. Backend Product Packets

### Packet A: Safety and Closeout Parity

Purpose: stop backend drift before frontend simplification hides controls.

Atomic scope:

- Align `archivePeriod` blockers with `closeoutPreview`.
- Block archive on unsafe POs, open connector requests, open fulfillment, failed unretried commands, and unresolved drafts.
- Expand archive control totals to include POs, receipts, invoices, payments, vendor bills, connector requests, fulfillment, and commands.
- Create reversal completeness matrix for every posted consequence command.

Disposition: P0, before or alongside Phase 0/1.

### Packet B: Commercial Trust Kernel

Purpose: make pricing and inventory trust real rather than decorative.

Atomic scope:

- Add pricing profiles and customer assignments.
- Add resolver service for pricing basis.
- Add guardrails for min margin, max discount, and vendor floor.
- Snapshot price basis at confirmation.
- Add governed tag catalog and batch tags.
- Add reversible tag application/removal.

Disposition: P0 backend, UI can initially show warning-only until backend enforcement lands.

### Packet C: Inventory and Connector Kernel

Purpose: close the biggest conceptual backend gaps without adding visible clutter.

Atomic scope:

- Add inventory status transitions: held, damaged, returned, in transit.
- Add location transfer command.
- Add ownership transfer command.
- Write movement rows for each.
- Add connector statuses: pending review, accepted, routed, rejected, posting, posted, failed.
- Add accepted-to-posted bridge only after routing UX is stable.

Disposition: P1 backend, after Phase 2/4 surfaces prove placement.

### Packet D: Projection Kernel

Purpose: make search, suggestions, reports, and support powerful without letting them mutate truth.

Atomic scope:

- Keep `globalSearch` direct initially; add freshness/index only if runtime demands it.
- Convert sales suggestions into persisted advisory rows when accept/dismiss trace matters.
- Add report math fixtures and source-row definitions.
- Preserve customer-safe field allow-lists for all outputs.

Disposition: P1/P2; never blocks the daily workflow unless output safety is at risk.

## 5. Backlog Reconciliation

| Source set | Identifiers | Roadmap disposition | Notes |
| --- | --- | --- | --- |
| TA shipped drift ledger | TA-001 through TA-048 | Already covered; preserve and re-home | Design spec supersedes shape where it reduces button pressure, but TA behavior must remain. |
| Master recording recommendations | MR-001 through MR-052 | In-spec coverage or backend packet | P0/P1 MR items map to Phases 1-5 and Backend Packets A-C. P2 maps mostly to Phase 7 or deferred registry items. |
| Unactioned findings | UF-001 through UF-020 | Covered by phases/backends | UF items become capability registry rows or phase readiness scope. |
| Persona journeys | JY-01 through JY-20 | Covered by ACs and phases | Red/yellow journeys drive Phase 1, Phase 2, Phase 3, Phase 4, and Backend Packets B/C. |
| Original operator journeys | J01 through J10 | Covered; backend hardening remains | J01-J10 exist as product loops; J03/J08/J09/J10 need deeper backend trust and drawer exposure. |
| Additional conceptual journeys | J11 through J16 | Partial/defer | Tags, pricing, smart suggestions, search, cockpit refresh concepts become CAP-014 through CAP-016 and BE-001/002/006/007. Legacy marker preservation remains active. |
| Operational gaps | GAP-001 through GAP-028 | Split into keep/defer/reject | Critical inventory/pricing/search/reporting gaps are kept; mobile dashboard, bank/card/crypto integration, Excel export are deferred/out of scope. |
| Scenarios | S01 through S20 | Scenario QA backlog | Use as E2E/scenario packet inputs, not as page list. S02/S04 already have stronger coverage; S03/S05/S06/S07/S10/S12/S15/S17/S18 are priority QA. |
| Acceptance criteria | AC-01 through AC-15 | Phase gates | AC-01..10 from original spec; AC-11..15 from adversarial resolution. |

## 6. Conflict Log

| Conflict | Position A | Position B | Resolved direction | Reversibility note |
| --- | --- | --- | --- | --- |
| Customer workspace route vs drawer | Some audits wanted a standalone customer workspace. | Design spec rejects new route and uses Sales + drawer. | Follow spec: Customer Workspace stays inside Sales with Identity Ribbon and Drawer tabs. | Revisit only if Phase 1 timing benchmark exceeds 2x old panel path. |
| QuickStartBar preservation vs Keel deletion | Earlier MR wanted compact global strip. | Design spec deletes QuickStartBar and absorbs chips into Keel. | Follow spec: Phase 0b Keel chips behind flag; focus mode keeps Keel. | Restore old component from git if flag rollback fails. |
| Below-floor warning vs hard approval gate | Pricing contract implies stronger guardrails. | Design spec says warning-only/no Manager+ gate for this frontend pass. | Split: frontend warning now; backend commercial trust packet adds guardrails/snapshots for product completeness. | If owner wants flat-org override, backend can allow override with reason instead of hard manager gate. |
| Reports as dedicated lane vs drawer projections | Some reports could be drawer tabs. | User/design explicitly request Reports lane. | Keep Reports under Decide group. | Remove only if usage shows reports are rarely opened and dashboard/drawer projections suffice. |
| Search index table vs direct global search | Manifest describes generated search index. | Current app has direct `globalSearch`. | Keep direct query until freshness/performance issues appear. | Add generated index later without changing operator surface. |
| Connector post bridge timing | Manifest wants post accepted connector request. | Current app only reviews/routes safely. | Stabilize review UX first; add accepted-to-posted bridge as Backend Packet C. | Bridge can be delayed indefinitely if routing to normal lanes is faster and safer. |

## 7. Explicit Gaps and Disposition

| Gap | Disposition | Reason |
| --- | --- | --- |
| Pricing profiles/guardrails/snapshots | Add in Backend Packet B | Required for margin trust, customer-safe output, and non-silent history. |
| Governed tag catalog/batch tags | Add in Backend Packet B | Required for scalable Finder/suggestions/pricing without free-text chaos. |
| Inventory status/location/ownership transfer | Add in Backend Packet C | Required for warehouse/inventory correctness and operator trust. |
| Connector accepted-to-posted lifecycle | Defer to Backend Packet C | Important, but review/routing safety must stabilize first. |
| Persisted smart suggestions | Defer to Packet D | Current query suggestions are enough until accept/dismiss trace becomes operationally important. |
| Generated search index | Defer to Packet D | Direct global search is simpler unless stale/perf problems appear. |
| Partial PO quantity receiving | Add after Phase 2 | Needed for real procurement edge cases; should stay grid-native. |
| Mobile dashboard | Reject/defer | Out of desktop operator-console scope. |
| Bank/card/crypto integration | Reject | Explicitly out of scope; log methods only. |
| Excel export | Defer | CSV is current deterministic export. Add xlsx only if operator need appears. |

## 8. OPEN-01 Through OPEN-08 Recommendations

| Open item | Recommendation |
| --- | --- |
| OPEN-01 5 drawer states | Keep all five; user requested max. Measure usage in Phase 7. |
| OPEN-02 Customer workspace as drawer tabs | Keep drawer route. Phase 1 benchmark protects against slowdown. |
| OPEN-03 Reports lane | Keep Reports lane under Decide. |
| OPEN-04 Below-floor warning-only | Accept frontend warning-only for this design pass; backend packet must still add audit/snapshot guardrails. |
| OPEN-05 5 business-day soak | Keep as default; recalibrate after Phase 0 baseline with commit failure and JS error data. |
| OPEN-06 Mobile/dark/design-system extraction | Reject for this roadmap. |
| OPEN-07 Reports math correctness | Require AC-12 seeded math test in Phase 6. |
| OPEN-08 Cross-route entity conflict | Use composite drawer key per spec; keep route-specific drawer state. |

## 9. Risk Register

| Risk | Likelihood | Impact | Mitigation | Trigger |
| --- | --- | --- | --- | --- |
| Button bands reappear during implementation | High | High | Enforce capability registry + recipe citation. | New visible action lacks status/placement rationale. |
| Drawer tab sprawl | High | Medium | Use R1 and tab default order; lazy-load; keep read-only except PO Lines. | Entity gets more than 9 tabs without priority review. |
| Sales workspace gets slower | Medium | High | Phase 1 timing benchmark against old panel. | Any benchmark >2x old path. |
| Backend pricing complexity delays UI | Medium | High | Ship warning UI first; backend packet B behind separate tests. | Pricing migration touches sales posting/invoices. |
| OperationsViews split conflicts | Medium | Medium | Split by phase with re-export shim. | Concurrent edits to OperationsViews after Phase 2 starts. |
| Finder extraction regresses operator-loved behavior | Medium | High | Preserve current Finder tests and saved slices; one core, three frames. | Search result count or saved slice behavior changes unexpectedly. |
| Closeout archive unsafe gap persists | Medium | High | Backend Packet A before Phase 5. | `closeoutPreview` and `archivePeriod` disagree. |
| Connector bridge bypasses safety | Low | High | Review/routing first; bridge uses normal commands only. | Connector path writes inventory/payment directly. |
| Reports become chart clutter | Medium | Medium | R7: chip row, ≤6 grid columns, mini charts with values only. | Report proposes realtime/ornamental dashboard. |
| Role-hidden actions confuse operators | Medium | Medium | Show limited-access explanations, not silent disappearance. | Viewer/Operator sees teammate action missing without reason. |
| New backend command lacks frontend/registry home | Medium | High | `audit:parity` plus `audit:product-roadmap`. | Command catalog changes without registry update. |
| Customer-safe output leaks internal fields | Low | High | Field allow-list tests for every output. | Any output includes unitCost, margin, floor, internal notes. |

## 10. Route Cross-Reference Map

| Surface | Work loop | Phase | Key ACs | Capability IDs |
| --- | --- | --- | --- | --- |
| Dashboard | Decide | 6 | AC-12 support | CAP-021, CAP-025 |
| Reports | Decide | 6 | AC-12 | CAP-021 |
| Purchase Orders | Buy | 2 | AC-09 | CAP-002 |
| Intake | Receive | 2 | AC-05, AC-06 | CAP-003, CAP-011, CAP-028 |
| Inventory | Receive/Sell | 2 | AC-02 | CAP-005, CAP-019, CAP-023 |
| Sales | Sell | 1 | AC-01, AC-02 | CAP-001, CAP-005, CAP-012, CAP-013 |
| Orders | Sell/Fulfill | 4 | AC-03 | CAP-010, CAP-012 |
| Fulfillment | Fulfill | 4 | AC-13 | CAP-017, CAP-023 |
| Client Ledger | Collect/Pay/Support | 4 | AC-14 | CAP-022 |
| Payments | Collect/Pay | 3 | AC-04, AC-15 | CAP-004, CAP-024 |
| Vendor Payouts | Collect/Pay | 3 | payment/vendor tests | CAP-004, CAP-022 |
| Connectors | Support | 4 | AC-11 | CAP-017, CAP-018 |
| Recovery | Recover/Close | 5 | AC-07, AC-08 | CAP-009, CAP-010, CAP-026, CAP-027 |
| Closeout | Recover/Close | 5 | closeout blocker tests | CAP-020, CAP-025 |

## 11. Definition of Done

A phase is done only when:

1. Changed capabilities have registry rows.
2. Replication Playbook recipes are cited.
3. Typecheck passes.
4. Build passes.
5. `pnpm audit:parity` passes.
6. `pnpm audit:product-roadmap` passes.
7. Phase-specific E2E or documented blocker exists.
8. Customer-safe output checks pass where relevant.
9. No new routine workflow uses modal wizard.
10. The visible UI has fewer competing default buttons than before.

## 12. What To Build First

Start with:

1. Phase 0a.
2. Phase 0b.
3. Backend Packet A.
4. Phase 1.
5. Backend Packet B.

This order gives the app a coherent frame before deeper commercial logic lands, while preventing backend trust gaps from hiding behind a nicer interface.
