# Feature Prioritization Decision: Photography Module → Pricing Rules v4

**Date:** 2026-05-18
**Status:** Drafted — awaiting written-form user review and design review gate
**Decision driver:** Photography Module (#40) has live security vulnerabilities in placeholder code that must be fixed regardless of feature work, and a battle-tested design spec already in the repo. Pricing Rules v4 (#39) has greater spec uncertainty and needs schema work + spec porting before it is plannable.

---

## Decision

Sequence the two open backlog features as follows:

1. **First:** Photography Module (GitHub issue #40)
2. **Second:** Pricing Rules v4 (GitHub issue #39)

Each feature's implementation plan includes its own unblocking work. Implementation plans are written one at a time — the Photography plan is written next (via the `writing-plans` skill); the Pricing Rules plan is deferred to a future session that begins after Photography fully ships.

---

## Why this order

### Photography first

- **Live security risk:** Issue #40's Phase 0 fixes close vulnerabilities that exist in the current placeholder code today: missing auth on upload/media routes, path traversal in multer, race condition in primary role assignment. These should be closed regardless of whether the feature ships.
- **Spec maturity:** A complete design spec and three companion plans already exist in `docs/superpowers/specs/` and `docs/superpowers/plans/`, reviewed by five specialist agents.
- **Concrete user pain:** 5-minute uploads → 30 seconds. Mobile field workflow that does not exist today.
- **Predictable scope:** ~10-12 hours Phase 0 + 2-3 weeks Phase 1-3.

### Pricing Rules second

- **Spec is not in the repo:** The full spec lives at `/tmp/pricing-rules-v4-native-prompt.md` — outside source control and at risk of being lost.
- **Schema work is a hard prerequisite:** Issue #39 explicitly states it is blocked until `items.subcategory` and `items.brand` columns are added (confirmed missing from `src/server/schema.ts`). Once added, the spec itself must be rewritten to use the new dimensions.
- **Doing this after Photography is cleaner:** Schema migration on the `items` table during business-critical pricing changes compounds risk. Doing Pricing Rules as a focused effort after Photography ships isolates that risk.

### Why not parallel

The user prefers sequential delivery. A hybrid option (Photography Phase 0 + Pricing Rules schema in parallel, then Pricing Rules implementation, then Photography Phase 1-3) was considered and rejected because it creates a 3-4 week context gap between Photography Phase 0 and Phase 1 — security fixes would land but the feature build that uses them would stall, which decays context and re-spawns review cost.

---

## Sequence

| Phase | Scope | Source of truth |
|---|---|---|
| 1. Photography Phase 0 | Security fixes (auth middleware, path traversal mitigation, race condition fix, dependency install, routes directory, migration renumbering 0016-0018) | `docs/superpowers/plans/2026-05-17-photography-module-phase-0-fixes.md` |
| 2. Photography Phase 1 | DB migrations, media validation + storage services, upload + serving routes, unit/integration tests | `docs/superpowers/plans/2026-05-17-photography-module.md` (Tasks 1-12) |
| 3. Photography Phase 2 | Backend commands (upload, setRole, publish, delete), MediaView + sidebar nav, MediaUploadMobile component, E2E tests | Same plan (Tasks 13-18) |
| 4. Photography Phase 3 | Monitoring (disk alerts, orphan detection), UX polish (offline queue, drag-drop, bulk ops), retention policies | Same plan (Phase 3 section) |
| 5. Pricing Rules unblock | Add `items.subcategory` + `items.brand` columns, backfill, port `/tmp/pricing-rules-v4-native-prompt.md` into repo, rewrite spec with new dimensions | NEW spec written in a future Pricing Rules brainstorming session |
| 6. Pricing Rules implementation | New tables (`pricing_rules`, `pricing_rule_conditions`, `customer_pricing_rules`), backend commands, `pricingRules` Admin view, sales line snapshot columns, below-floor warning UI | NEW plan written after the unblock work completes |

Phases 5-6 are intentionally not planned in this session because the schema additions change what the Pricing Rules spec needs to say. Committing to the sequence now is enough; the detailed Pricing Rules plan happens later.

---

## Phase transition gates

No phase advances until its predecessor's gate passes:

| Gate | Pass conditions |
|---|---|
| Phase 0 → 1 | All Phase 0 acceptance criteria met (auth middleware in place, deps installed, routes dir exists, migrations renumbered 0016-0018, TypeScript compiles clean, Phase 0 tests pass) |
| Phase 1 → 2 | Migrations applied; upload + serving routes have integration tests passing; security tests pass (path traversal, auth, file spoofing) |
| Phase 2 → 3 | Photographer flow works on real iPhone in <30s; office curation flow works; E2E suite passes |
| Phase 3 → Pricing Rules | Photography fully shipped (feature flag default-on for ≥7 days, no rollback triggers fired); `/self-reflect` ran and knowledge captured |

Phase 0 is a special case: if the larger Photography effort stalls, Phase 0 still merges as a standalone security PR. Security fixes do not wait for feature work.

---

## Deferral tracking (so Pricing Rules is not forgotten)

To ensure the deferral lives in GitHub and not just in this spec, the following tracking artifacts are produced as part of completing this brainstorming session:

1. **GitHub issue #39 updated** with:
   - Link to this prioritization spec
   - Explicit unblock checklist (subcategory column, brand column, backfill, port spec from `/tmp`, rewrite spec to use new dimensions)
   - Note that implementation is deferred until Photography Module (#40) ships
2. **New GitHub issue created:** "Pricing Rules v4 Unblock — Schema additions for subcategory/brand" — scoped tightly so it can be picked up independently if bandwidth opens up.
3. **`pricing-rules` label** added to #39 (and the new unblock issue) for discoverability.
4. **Photography Phase 3 completion checklist** gains a final item: "Update issue #39 with next-steps reminder and link to Pricing Rules planning session."

These four trigger points (issue #39 itself, the new unblock issue, the label filter, the Photography completion checklist) make the deferral hard to lose.

---

## Risks and mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Photography Phase 0 reveals more hidden issues than the 10-12hr estimate | Medium | Medium | Hard time-box Phase 0 to two weeks. If overrun, re-evaluate sequencing before Phase 1 — do not sunk-cost into a swamp. |
| Business pressure to ship Pricing Rules earlier | Medium | High | This decision is dated. If business need shifts, revisit this spec rather than silently flipping order. The `/tmp` spec port and schema work can be done in parallel by someone else without breaking the sequence. |
| `/tmp/pricing-rules-v4-native-prompt.md` is lost before Pricing Rules is picked up | **MATERIALIZED** (file not found at session resume on 2026-05-18) | High | The detailed spec is gone. The remaining source of truth is the body of GitHub issue #39 itself (overview, schema, backend, frontend sections — but not the 649-line implementation prompt that was referenced). Pricing Rules brainstorming will need to re-derive the missing detail from scratch or from operator interviews. The new unblock issue captures this gap explicitly. |
| Photography ships but Pricing Rules is forgotten | Low-Medium | Medium | Four GitHub tracking artifacts (see Deferral tracking section). |
| Photography Phase 0 security fixes are urgent enough to need hotfix treatment | Unknown | High | Phase 0 can ship as a standalone PR ahead of the rest of the feature. Treat it as security work that happens to also unblock a feature, not the other way around. |

---

## Definition of done for this prioritization decision

This brainstorming session is complete when these artifacts exist and are committed:

1. This design doc at `docs/superpowers/specs/2026-05-18-feature-prioritization-decision.md`
2. ~~`/tmp/pricing-rules-v4-native-prompt.md` copied into `docs/superpowers/specs/2026-05-18-pricing-rules-v4-source-prompt.md`~~ — **NOT POSSIBLE**: the file is already gone. The new unblock issue (item 4) records the loss explicitly so the future planner knows to re-derive missing spec detail.
3. GitHub issue #39 updated with handoff comment and `pricing-rules` label
4. New GitHub issue created for Pricing Rules v4 schema unblock work — must include note that `/tmp/pricing-rules-v4-native-prompt.md` was lost between the spec being written and Pricing Rules being picked up, so the planner cannot rely on it
5. Photography Module implementation plan written via the `writing-plans` skill (the next step after this design is approved)

---

## Out of scope for this design

- The Photography Module implementation plan itself — produced by `writing-plans` in the next step.
- The detailed Pricing Rules implementation plan — deferred to a future session after Photography ships.
- Decisions about other open issues (#38 Payment Processor, dynamic audit findings, etc.) — those remain in the backlog as-is.

---

## References

- GitHub issue #40 — Photography Module: Mobile upload, media management, retention policies
- GitHub issue #39 — Implement Customer Pricing Rules v4
- `docs/superpowers/specs/2026-05-17-photography-upgrade-design.md` — Photography design spec
- `docs/superpowers/plans/2026-05-17-photography-module.md` — Photography full implementation plan
- `docs/superpowers/plans/2026-05-17-photography-module-phase-0-fixes.md` — Photography Phase 0 fixes plan
- `docs/superpowers/plans/2026-05-17-photography-module-review-consolidated.md` — Photography multi-agent review findings
- ~~`/tmp/pricing-rules-v4-native-prompt.md`~~ — Pricing Rules v4 spec source. **Lost as of 2026-05-18** — file not found at session resume. The GitHub issue #39 body is the only remaining source of partial spec content.
