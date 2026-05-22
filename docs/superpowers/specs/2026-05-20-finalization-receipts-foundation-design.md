# Finalization Receipts — Shared Snapshot Foundation Design

| Field | Value |
| --- | --- |
| GitHub issue | [EvanTenenbaum/terp-operator#113](https://github.com/EvanTenenbaum/terp-operator/issues/113) — *Backlog: Finalization receipt workspace for PO, sales, and money documents* |
| Status | **Approved first slice** (shared foundation only; no vertical UI yet) |
| Date | 2026-05-20 |
| Worktree | `/Users/evantenenbaum/work/terp-operator-finalization-receipts-113-resume-20260520` |
| Branch | `plan/finalization-receipts-113-resume-20260520` |
| Implementation state | **None.** Design/spec only. No code, schema, migrations, or tests written. |
| Product surface | TERP Operator (canonical repo `EvanTenenbaum/terp-operator`) |
| QA tier | Deep QA at minimum; projection-leak surface escalates to Critical when external rendering lands |

---

## 1. Routing Plan

This is the spec-to-ship lane chart. Owners are written into the plan so each handoff has a named driver, model, permission posture, and proof gate.

| Phase | Work | Owner agent | Model / effort | Permissions | Proof gate | Handoff contract |
| --- | --- | --- | --- | --- | --- | --- |
| 0. Spec (this doc) | High-level design, data shape, boundaries | `pm` (coordinator) → delegated writer subagent | GPT-5.5 high → writer per dispatch | Docs-only, single file, no code | PM review for completeness vs issue #113 acceptance criteria | Spec merged or held; output is this file |
| 0a. Architecture review | Adversarial design review of this spec | `claude-architect` | Opus 4.7 xhigh | Read-only on repo; comment-only on doc | Written review: risks, missing affordances, schema critique | Review comment block appended to issue #113 |
| 1. Foundation impl | Schema + projection types + server services + fixture tests | `build` (default) or `opus-build` if migration risk grows | Sonnet 4.6 high / Opus 4.7 high | Code write in worktree only; migrations gated by review | `pnpm typecheck` + new fixture tests green; no UI route changes | PR with green checks; no client coupling |
| 1q. Foundation QA | First-pass QA + AQA on leak/projection tests | `qa-reviewer` then AQA via `aqa` skill | Sonnet 4.6 then Claude Opus 4.7 | Read repo + run tests | Adversarial score ≥ 95/100 or documented blocker; leak-vector tests pass | AQA report path + score in PR description |
| 2. PO vertical | Finalization workspace wiring for PO | `build` | Sonnet 4.6 high | Worktree write | Browser proof of finalize→external/internal split | New issue or sub-issue linked from #113 |
| 3. Sales vertical | Confirmation + invoice receipt workspaces | `build` or `opus-build` | per risk | Worktree write | Leak tests for `internalMargin`, `unitCost`, unresolved markers | Linked sub-issue |
| 4. Money vertical | Payment-received + vendor-payout receipts | `build` | Sonnet 4.6 high | Worktree write | Leak tests + audit trail proof | Linked sub-issue |
| 5. Hardening | Signal text renderer, print HTML, runtime proof loop | `build` + `risk-verifier` | Sonnet 4.6 / Opus 4.7 | Worktree + Playwright | Final AQA + Deep QA closeout checklist | Closeout doc under `docs/superpowers/completion/` |

Permission posture summary: **docs-only for Phase 0, worktree-scoped writes for Phases 1–5, no pushes from worker branches without integrator override** (per `~/AGENTS.md` worktree-push policy).

---

## 2. Goal vs Non-Goal Framing

**Operational records remain the source of truth.** `purchase_receipts`, `purchase_receipt_lines`, `sales_orders`, `invoices`, `payments`, `vendor_payments`, and the `command_journal` continue to be the canonical state. They are not replaced, wrapped, or shadowed by this work.

**Document snapshots are rendered/published artifacts.** A snapshot is a frozen, audience-projected, audit-trailed *view* of an operational record at the moment it was finalized for a vendor, customer, or operator. Snapshots:

- carry their own identity, audience, and projection version;
- are the only thing safe to copy into Signal, print, or hand to a counterparty;
- never replace the underlying record, and never become a query substrate for downstream computation.

The current `command_journal.beforeSnapshot` / `afterSnapshot` (`src/server/schema.ts` ~line 652–653) capture command IO for audit. They are **not** a document model: they are not audience-projected, not addressable as a counterparty-facing artifact, and the `afterSnapshot` payload may contain leak-risk fields. The foundation introduces the missing document layer alongside, not on top of, them.

---

## 3. Phase Boundaries

The approved first slice is Phase 1 only. The remaining phases are scoped here so reviewers can sanity-check that the foundation will carry the vertical work without rework.

### Phase 1 — Foundation (this slice)

- New `document_snapshots` table + supporting indexes.
- Projection type system: `ExternalReceiptProjection`, `InternalReceiptProjection`, `ProjectionVersion`.
- Server services: draft/finalize/void/get/render functions (signatures below).
- Fixture-driven unit tests using PO-shaped and sales-shaped inputs to exercise projection and leak guards.
- **No UI routes, no client wiring, no command-bus wiring to PO/sales finalization.** The foundation is dormant until Phase 2.

### Phase 2 — PO Finalization Workspace

- Wire `finalizePurchaseOrder` (`src/server/services/commandBus.ts` ~line 1068) to create a draft snapshot.
- Finalization workspace UI surfaces External and Internal projections.
- Finalize action emits the finalized snapshot. **`postPurchaseReceipt` (~line 676) is not auto-invoked.** Posting remains a separate operator command.

### Phase 3 — Sales Confirmation / Invoice Receipts

- Wire `confirmSalesOrder` (~line 2144) and `postSalesOrder` (~line 2180) to draft + finalize snapshots at the right transition points.
- Invoice receipt rendered from the same projection pipeline.
- Explicit leak guards for `internalMargin`, line `unitCost`, `unitCostResolved`, unresolved `sourceRowKey`, `legacyMarker` echoes, and candidate-source diagnostic text.

### Phase 4 — Money Receipts

- Payment-received and vendor-payout receipts use the same `document_snapshots` table with `kind = 'payment_received' | 'vendor_payout'`.
- No invoice/PO coupling beyond `sourceEntityId` references.

### Phase 5 — Hardening

- Signal-friendly text renderer (deterministic ordering, plain text, no HTML).
- Print HTML renderer with internal watermark.
- Playwright runtime proof for finalize → copy → print loop.
- Full AQA + closeout doc.

---

## 4. Data Model

New table `document_snapshots`. Field shape is normative; exact column names follow drizzle conventions used elsewhere in `src/server/schema.ts`.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` PK | new identity, not reused from source record |
| `kind` | `text` enum | `purchase_finalization`, `sales_confirmation`, `invoice`, `payment_received`, `vendor_payout` |
| `source_entity_type` | `text` enum | `purchase_order`, `sales_order`, `invoice`, `payment`, `vendor_payment` |
| `source_entity_id` | `uuid` | FK by convention; not enforced cross-table to allow future entity types |
| `command_id` | `uuid` | links to `command_journal.id` of the finalize call |
| `status` | `text` enum | `draft`, `finalized`, `voided` |
| `audience` | `text` enum | `external`, `internal`; one row per audience per finalized version. **Canonical name is `audience`.** There is no separate `projection_kind` column; "projection kind" is a synonym used informally in conversation and never appears in the schema, queries, or DTOs. |
| `snapshot_json` | `jsonb` | raw structural payload at finalize time, already audience-projected. **Does not persist type-level witnesses** (`__EXTERNAL_PROJECTED__`, `__INTERNAL_ONLY__`); see §5/§6. |
| `projection_version` | `int` | bumps when the projection contract changes; lets old snapshots stay readable. **Phase 1 projectors all emit `projection_version = 1`.** |
| `content_hash` | `text` | sha256 of canonicalized `snapshot_json`; used for de-dupe and tamper detection |
| `supersedes_id` | `uuid` nullable | points to the previous snapshot this amendment replaces |
| `created_by` | `uuid` | actor who created the draft |
| `finalized_by` | `uuid` nullable | actor who finalized; null while `draft` |
| `voided_by` | `uuid` nullable | actor who voided; null unless `voided` |
| `created_at` | `timestamptz` | |
| `finalized_at` | `timestamptz` nullable | |
| `voided_at` | `timestamptz` nullable | |

Index plan (initial):

- `(source_entity_type, source_entity_id, audience, status)` for "give me the live external/internal snapshot for this PO".
- `(command_id)` to walk back to the journaled command.
- `(source_entity_type, source_entity_id, audience, content_hash)` **unique partial index where `status = 'finalized'`** to prevent accidental double-finalize of identical content for the same entity+audience. Cross-entity hash collisions are deliberately allowed and not unique-constrained.
- `(supersedes_id)` to chain amendments.

Schema invariants (enforced in DB where practical, in service code otherwise; both layers asserted by tests):

- **Unique-head / live-snapshot invariant.** For every `(source_entity_type, source_entity_id, audience)` there is **at most one live snapshot**, where *live* means `status = 'finalized'` AND `voided_at IS NULL` AND the row is not pointed to by any other row's `supersedes_id`. Implemented either as a unique partial index on `(source_entity_type, source_entity_id, audience)` filtered to live rows, or as a serialized service-layer check under a row lock on the predecessor (see §7). Whichever path the implementation plan picks must be reflected by both a DB-level guard and a fixture test.
- **Same-entity / same-audience supersession.** When `supersedes_id` is non-null, the predecessor row's `source_entity_type`, `source_entity_id`, and `audience` must equal the new row's. A snapshot may not supersede a snapshot of a different entity or a different audience. Enforced by a service-layer check plus a fixture test; optionally a DB CHECK via a denormalized helper if cheap.

`snapshot_json` is **audience-projected at write time**, not at read time. An `external` row never contains internal-only fields on disk. This is the structural guarantee that defeats client-side hiding mistakes downstream.

---

## 5. Service / API Contract

All exports live under `src/server/services/documentSnapshots.ts` (new file in Phase 1). The router layer does not get raw DB rows; it gets typed DTOs.

### Types (sketch)

```ts
type SnapshotKind =
  | 'purchase_finalization'
  | 'sales_confirmation'
  | 'invoice'
  | 'payment_received'
  | 'vendor_payout';

type Audience = 'external' | 'internal';

interface ExternalReceiptProjection {
  kind: SnapshotKind;
  header: { title: string; counterparty: string; dateISO: string; documentNo: string };
  lines: Array<{ name: string; qty: number; unitPrice?: number; subtotal: number; notes?: string }>;
  totals: { subtotal: number; adjustments?: number; total: number };
  footer?: { terms?: string; reference?: string };
  projectionVersion: number;
  // Type-level witness that the external projector ran and stripped internal fields.
  // Mutually exclusive with __INTERNAL_ONLY__ at the type level.
  readonly __EXTERNAL_PROJECTED__: true;
}

interface InternalReceiptProjection extends Omit<ExternalReceiptProjection, '__EXTERNAL_PROJECTED__'> {
  internalNotes?: string;
  cogs?: { perLine: Array<{ name: string; unitCost?: number; landedCost?: number }>; total: number };
  margin?: { perLine: Array<{ name: string; marginAbs: number; marginPct: number }>; total: number };
  diagnostics?: { unresolvedSources?: string[]; legacyMarkers?: string[] };
  // Type-level witness; mutually exclusive with __EXTERNAL_PROJECTED__.
  readonly __INTERNAL_ONLY__: true;
}
```

**Witness exclusivity and persistence.** `__EXTERNAL_PROJECTED__` and `__INTERNAL_ONLY__` are mutually exclusive type-level witnesses. A value carrying one cannot structurally unify with the other (a TypeScript-level test in Phase 1 asserts this). **The markers are not persisted in `snapshot_json`.** The projection loader inside `getExternalReceipt` / `getInternalReceipt` first validates the on-disk shape against the audience-specific schema, then re-applies the appropriate witness in memory before returning. This keeps the on-disk payload free of synthetic discriminant fields and guarantees the witness reflects the read path actually taken, not whatever happened to be written.

### Functions (signatures)

```ts
createDraftSnapshot(input: {
  kind: SnapshotKind;
  sourceEntityType: SourceEntityType;
  sourceEntityId: string;
  commandId: string;
  audience: Audience;
  payload: unknown;
  supersedesId?: string; // optional; when set, marks this draft as an amendment of an existing finalized snapshot for the SAME entity+audience (see §7)
}): Promise<{ id: string; contentHash: string }>;

updateDraftSnapshot(input: { id, payload }): Promise<{ id: string; contentHash: string }>;

finalizeSnapshot(input: { id, finalizedBy }):
  Promise<{ id: string; status: 'finalized'; contentHash: string }>;

voidSnapshot(input: { id, voidedBy, reason }):
  Promise<{ id: string; status: 'voided' }>;

getExternalReceipt(sourceEntityType, sourceEntityId):
  Promise<ExternalReceiptProjection | null>;

getInternalReceipt(sourceEntityType, sourceEntityId):
  Promise<InternalReceiptProjection | null>;

renderSignalText(projection: ExternalReceiptProjection): string;
renderPrintHtml(projection: ExternalReceiptProjection | InternalReceiptProjection): string;
```

Contract rules:

- The router layer **must not** return `snapshot_json` directly to the client. It returns the typed DTO from `getExternalReceipt` / `getInternalReceipt`.
- `getExternalReceipt` is the only path used by counterparty-facing surfaces (copy-to-Signal, print, share link).
- **Live selection semantics.** Both `getExternalReceipt` and `getInternalReceipt` select the unique **live** snapshot for the given `(sourceEntityType, sourceEntityId, audience)`. *Live* is defined as: `status = 'finalized'` AND `voided_at IS NULL` AND not pointed to by any other row's `supersedes_id` (i.e., not superseded). If no such row exists — including the case of a finalized PO that predates this system and was never explicitly snapshotted — both functions return `null`. They never fall back to drafts, voided rows, or superseded predecessors.
- **Internal access gate.** `getInternalReceipt` requires an authenticated operator session and an explicit `assertRole(user, 'manager')` check (manager or higher) inside the service before any DB read. This is a **new gate** introduced with Phase 1; it does not reuse the ad-hoc role checks scattered across margin-visible views. The intent is to consolidate the internal-projection authorization surface in one place. Existing margin-bearing queries elsewhere in the codebase are **not retrofitted** to this gate in Phase 1; that consolidation is out of scope here.
- **Renderer purity.** Renderers are pure functions of the projection input. They do **not** re-query the database, and they do **not** call `Date.now`, `Math.random`, `Intl`, `toLocaleString`, or any other locale-/time-/randomness-dependent API directly. If a renderer needs current time or locale-specific formatting, the value must be injected via an explicit parameter (e.g., a formatter callback or a pre-computed `nowISO`). This keeps renderer output deterministic given the same input across machines, time zones, and runs.
- Projectors are written per-kind in `src/server/services/projections/<kind>.ts`. Each exports an `external` and `internal` projector and a `projectionVersion` constant (Phase 1: all equal `1`).

---

## 6. Security

The Phase 1 security posture is structural, not cosmetic.

1. **Server-side allowlisted external projection.** External payloads are built field-by-field through an allowlisted projector. There is no "take the internal record and delete a few keys" path. Adding a field requires editing the projector.
2. **No client-side hidden fields.** The client never receives internal fields on external paths. CSS `display: none` or conditional rendering is not an acceptable shield for cost/margin/internal notes.
3. **No `select *` on external projection paths.** Drizzle queries used by the external projector must enumerate columns explicitly. **This also applies to any raw SQL** used by external projectors: raw queries must list columns by name; `SELECT *` and equivalent star-expansions are forbidden on the external path. A lint rule and a code-review check are introduced with Phase 1 and cover both Drizzle and raw SQL call sites.
4. **No raw `command_journal.afterSnapshot` exposure in receipt contexts.** The journal payload may contain leak-risk fields. Receipts never bleed it through.
5. **Safe text/HTML rendering.** `renderSignalText` emits plain text only — no markdown that could render in third-party clients, no HTML. `renderPrintHtml` escapes all interpolations and **disallows `<script>`, `<style>`, all `on*` event attributes, `javascript:` URLs, and any unescaped user input**. User-supplied notes are HTML-escaped, never interpolated raw. The Phase 1 print HTML is a minimal well-formed escaped document; richer styling and the internal watermark are Phase 5 work.
6. **Mutually exclusive type witnesses.** `ExternalReceiptProjection.__EXTERNAL_PROJECTED__` and `InternalReceiptProjection.__INTERNAL_ONLY__` are structural witnesses with conflicting literal types. A value cannot carry both, and a value with one cannot be widened to the other without an explicit unsafe cast. Witnesses are **re-applied on read by the projection loader**, not persisted in `snapshot_json`. Phase 1 tests assert: (a) no external API path returns a type unifying with `InternalReceiptProjection`; (b) `renderSignalText` rejects `InternalReceiptProjection` at the type signature; (c) on-disk `snapshot_json` payloads contain neither witness key.
7. **Internal access gate.** Internal receipt reads go through an explicit `assertRole(user, 'manager')` (manager or higher) check, defined in this Phase. Existing margin-bearing queries elsewhere in the codebase are **not retrofitted** to this gate as part of Phase 1.

### PO-specific column discipline

PO projectors operate against operational tables that already separate audience-specific text. Projectors **must** route those columns to the matching audience and **must not** cross-project them:

- **External projector** reads only `purchase_orders.external_notes` and `purchase_order_lines.external_notes` for free-text note fields. It must not read `internal_notes` from either table, and must not read landed-cost, margin, vendor-terms-marked-internal, or diagnostic columns.
- **Internal projector** reads `purchase_orders.internal_notes`, `purchase_order_lines.internal_notes`, landed-cost components, vendor terms, and any operator-side diagnostic columns. It may also surface the external-notes fields for context.
- **External leak tests** for PO must use fixtures with **populated, non-empty `internal_notes` on both header and lines**, plus populated landed cost and margin where the schema supports them, so the absence test is meaningful. A fixture with empty internal columns proves nothing.

---

## 7. Reversibility and Amendment Semantics

- **Finalized snapshots are immutable.** `snapshot_json`, `content_hash`, `finalized_at`, and `finalized_by` cannot be updated after `status` becomes `finalized`.
- **All snapshots traverse `draft → finalized`.** There is **no create-and-finalize shortcut** API. Even an amendment goes: `createDraftSnapshot({ ..., supersedesId })` → optional `updateDraftSnapshot` → `finalizeSnapshot`. This keeps the lifecycle uniform and makes the command-journal trail symmetric across original and amended snapshots.
- **Amendments create a superseding snapshot.** Editing a finalized PO finalization writes a new `finalized` row with `supersedes_id` pointing at the prior one. The chain is the audit trail.
- **`supersedes_id` must point to the same entity and same audience.** A snapshot may only supersede a predecessor whose `source_entity_type`, `source_entity_id`, and `audience` are identical (see §4 invariants). Cross-entity or cross-audience supersession is rejected by the service and by a fixture test.
- **Amendment serialization.** The unique-head invariant (§4) is enforced at finalize time by **either** (a) a unique partial index on `(source_entity_type, source_entity_id, audience)` filtered to live rows, **or** (b) a transactional row lock taken on the predecessor row inside `finalizeSnapshot` before any new finalized row is inserted, plus an explicit "still live" recheck under the lock. The implementation plan must pick one and document the choice; the fixture suite must exercise the chosen path against concurrent finalize attempts (or simulate them deterministically) so the second loser fails rather than producing a parallel live head.
- **Reversals void, never delete.** Voiding sets `status = 'voided'`, records `voided_by` and `voided_at`, and does not delete the row. A new draft can be opened to produce a replacement.
- **No deletion.** Even `draft` snapshots are kept; an abandoned draft transitions to `voided` with reason `abandoned`. This preserves the workspace recovery story called out in issue #113.
- **`command_id` link to `command_journal`.** Every state-changing snapshot operation runs through the command bus and stores the command id. Walking back from a snapshot to the operator action and back-snapshot is always one join away.

---

## 8. TERP Workflow Notes

- **Finalize is not post.** PO finalization produces a document snapshot. It does **not** invoke `postPurchaseReceipt` (`commandBus.ts` ~line 676). Posting a purchase receipt remains an explicit operator command. This prevents double-posting and keeps the workspace reversible.
- **Sales finalize stays separate from confirm/post.** `confirmSalesOrder` and `postSalesOrder` (`commandBus.ts` ~lines 2144 / 2180) keep their existing semantics. A finalization snapshot is produced at the operator-visible "this is the customer artifact" moment, which Phase 3 will pin down precisely.
- **Return-to-table state preservation is a Phase 2+ client concern.** The foundation guarantees drafts survive page reloads via the DB row; how the workspace reopens to that draft is UI work, not foundation work.
- **Money receipts defer to Phase 4 but share the boundary.** Payment-received and vendor-payout snapshots use the same table, the same projector contract, and the same renderers. No parallel system.
- **Existing `receiptPreview` (`queries.ts` ~line 331) is unchanged.** It remains a pre-receipt preview for intake selection. It is not a document snapshot and does not move into this system.
- **No backfill in Phase 1.** Existing finalized POs (and any other historical records) that predate `document_snapshots` have **no** corresponding row in the new table. `getExternalReceipt` and `getInternalReceipt` therefore return `null` for those entities until an operator explicitly creates and finalizes a snapshot through the future Phase 2+ UI. This `null` return is the **expected, correct** Phase 1 behavior — not a bug, not a gap to paper over with a fallback to operational data. Any backfill is a separate decision in a future phase with its own QA tier.

---

## 9. Acceptance Criteria for Phase 1

These are the conditions for declaring the foundation done. Phase 1 lands no UI; acceptance is server-only.

1. **Migration with paired rollback.** `document_snapshots` table exists with the columns, indexes, and invariants from §4. The forward migration lives at `migrations/NNNN_*.sql` (sequence number assigned by the integrator at land time — see §12). Because this introduces a new table, a new unique partial index, and at least one CHECK or unique constraint expressing the live-head invariant, the migration is classified as risky and **must ship with a paired rollback file at `migrations/rollback/NNNN_*.sql`**, matching the repo convention for reversible schema changes.
2. **Service exports.** `src/server/services/documentSnapshots.ts` exports `createDraftSnapshot`, `updateDraftSnapshot`, `finalizeSnapshot`, `voidSnapshot`, `getExternalReceipt`, `getInternalReceipt`, `renderSignalText`, `renderPrintHtml` with the signatures in §5.
3. **PO external-leak fixture (enumerated).** Given a finalized PO snapshot built from a representative `purchaseOrders` + `purchaseOrderLines` payload **with non-empty internal data populated on both header and lines**, `getExternalReceipt` returns a projection that does **not** contain any of the following, enumerated explicitly:
   - `purchase_orders.internal_notes` or `purchase_order_lines.internal_notes` content (internal-notes / external-notes separation enforced; only `external_notes` may surface);
   - landed cost or any landed-cost component (freight, duty, broker fee, etc.);
   - margin in any form (absolute, percent, per-line, total);
   - diagnostic / unresolved-source / legacy-marker fields;
   - vendor terms or any vendor-facing field that is marked internal-only by the projector (e.g., internal payment terms, internal credit notes).
4. **Sales external-leak fixture.** Same audience-projection assertion against a sales-order payload, plus explicit absence of `internalMargin`, `unitCost`, `unitCostResolved`, unresolved `sourceRowKey`, `legacyMarker`, and `candidateSourceText`.
5. **Mutually exclusive type witnesses.** A TypeScript-level test asserts that `ExternalReceiptProjection` and `InternalReceiptProjection` are mutually exclusive at the type level: a value typed as one cannot be assigned to the other, the return type of `getExternalReceipt` does not unify with `InternalReceiptProjection`, and the return type of `getInternalReceipt` does not unify with `ExternalReceiptProjection`. A runtime assertion in each loader confirms the appropriate witness was applied. There is no shared "flag both" representation and no `allowInternalForPrintOnly`-style escape hatch in any signature.
6. **Signal renderer is external-only at the type signature.** `renderSignalText` is typed as `(projection: ExternalReceiptProjection) => string`. Passing an `InternalReceiptProjection` is a compile error, asserted by a TypeScript-level expect-error test. There is no runtime override.
7. **Persisted shape allowlist for external snapshots.** A fixture test loads each kind's external `snapshot_json` from disk (or from the in-memory equivalent the service writes) and asserts the top-level and nested key sets are a **subset of the kind's external allowlist**. Any unknown key, internal-only key, or persisted witness field (`__EXTERNAL_PROJECTED__`, `__INTERNAL_ONLY__`) fails the test. This catches drift between the projector and the schema independently of the read path.
8. **`renderSignalText` output.** For every valid `ExternalReceiptProjection` fixture, `renderSignalText` returns a **non-empty plain-text string** that contains **no HTML tags** (asserted by a regex that rejects `<[^>]+>`) and no `<script>`, `<style>`, or `on*=` substrings. Output is deterministic across runs (same input → identical bytes), reflecting the renderer-purity rule in §5.
9. **`renderPrintHtml` Phase 1 output.** Output is **minimal, well-formed, escaped HTML**: a valid document fragment with all user-supplied text HTML-escaped and no `<script>`, `<style>`, `on*` event attributes, or `javascript:` URLs. Phase 1 does **not** require an internal watermark, print-layout polish, or full-stylesheet rendering; those land in Phase 5. Asserted by a parse-and-walk test that flags forbidden tags/attributes and confirms escape of a fixture note containing `<`, `>`, `&`, `"`, and `'`.
10. **Immutability test.** Attempting `updateDraftSnapshot` on a `finalized` row throws and leaves the row unchanged (including `content_hash`, `snapshot_json`, `finalized_at`, `finalized_by`).
11. **Amendment chain test.** `createDraftSnapshot({ supersedesId })` then `finalizeSnapshot` on that draft, where the predecessor is a `finalized` row for the same `(source_entity_type, source_entity_id, audience)`, succeeds; the predecessor stays `finalized` (not `voided`); the new row is the unique live head; `supersedes_id` points to the predecessor. A negative test asserts that `supersedesId` pointing at a different entity or different audience is rejected.
12. **Unique-head test.** Two concurrent (or deterministically simulated concurrent) `finalizeSnapshot` calls for the same `(source_entity_type, source_entity_id, audience)` produce exactly one live head; the loser fails with a clear error and leaves the predecessor untouched.
13. **Void / abandon test.** `voidSnapshot` sets `status = 'voided'`, `voided_by`, `voided_at`, never deletes the row, and works for both `draft` (reason `abandoned`) and `finalized` predecessors.
14. **No-backfill test.** For a `purchaseOrders` row with no corresponding `document_snapshots` row, `getExternalReceipt` and `getInternalReceipt` both return `null`. No fallback to operational data.
15. **Disallowed-files check.** The PR diff does not touch `src/server/services/commandBus.ts`, any tRPC router file exposing `documentSnapshots`, anything under `src/client/views/**`, `OperationsViews.tsx`, `SalesView.tsx`, or `IntakeView.tsx` (see §10).
16. **`pnpm typecheck` passes.** New fixture tests pass on the runner used for foundation work.
17. **AQA scope and score.** AQA report attached to PR with adversarial score ≥ 95/100 or an explicit blocker rationale. **Phase 1 AQA scope is bounded** to: leak-vector tests (external projections, persisted-shape allowlist), type-safety assertions (mutually exclusive witnesses, Signal renderer signature), immutability of finalized rows, amendment chain integrity, unique-head behavior, and void/abandon lifecycle. **Explicitly out of AQA scope for Phase 1:** UI behavior (none exists), transport (Signal/email/SMS — none exists), print layout polish, watermarking, accessibility of rendered HTML, and end-to-end browser proof. Those gates apply at Phases 2–5.

---

## 10. Non-Goals (Phase 1)

- **No UI**. No new routes, no React components, no Tailwind/semantic-class work, no command palette entries.
- **No command-bus wiring** to PO or sales finalization actions. The functions exist but are unreferenced from `commandBus.ts`.
- **No Signal/email/SMS sending.** Renderers produce strings only; transport is out of scope.
- **No share-link tokens, attachments, or print styling system.** Phase 5 territory.
- **No retrofitting** of historical PO/sales/invoice/payment records into snapshots. Backfill, if ever desired, is a separate decision with its own QA tier.
- **No replacement of `command_journal`**. The journal stays the audit source for command IO.
- **No retrofitting of existing margin-visibility role checks.** The new `assertRole(user, 'manager')` gate covers `getInternalReceipt` only in Phase 1.

### Disallowed files in Phase 1

To make "no UI / no wiring" reviewable rather than aspirational, the Phase 1 diff **must not modify** any of the following:

- `src/server/services/commandBus.ts` — no calls into the new snapshot services are added here in Phase 1.
- Any new or existing tRPC router file under `src/server/routers/**` (or wherever the project's router files live) that would expose `documentSnapshots` to clients.
- `src/client/views/**` — no client views are added or modified.
- `OperationsViews.tsx`, `SalesView.tsx`, `IntakeView.tsx` — explicitly named here because they are the most likely accidental landing pads for a "let me just wire up a preview" change. They stay untouched.

A grep over the PR diff for paths matching these names is part of the Phase 1 QA checklist.

---

## 11. Open Questions (concrete decision points)

Each item is a decision the architecture reviewer should confirm or override. Defaults are recommended choices, not placeholders.

1. **One row per audience vs one row with both projections.**
   *Recommended default: one row per audience.* Eliminates accidental joint queries and makes the "no internal in external responses" rule a row-level fact, not a column-level one. Cost: two writes per finalize; acceptable.
2. **Canonical hashing of `snapshot_json`.**
   *Recommended default: JCS (RFC 8785) canonicalization, then sha256.* Avoids drift between Node JSON.stringify variants and lets the `content_hash` unique index actually prevent duplicates.
3. **Where projector code lives.**
   *Recommended default: `src/server/services/projections/<kind>.ts`, one file per kind, each exporting `external`, `internal`, and `projectionVersion`.* Keeps allowlists local and reviewable.
4. **`projection_version` bump policy.**
   *Recommended default: bump when an external field is added, removed, renamed, or its semantics change; do not bump for internal-only changes.* Old snapshots stay readable; new snapshots use the new shape.
5. **Draft lifetime and cleanup.**
   *Recommended default: drafts have no TTL in Phase 1; abandoned drafts are explicitly voided by operator action.* Avoids surprise data loss; cleanup policy can be added in Phase 5.
6. **Author identity source.**
   *Recommended default: existing operator session id used by the command bus; do not introduce a separate identity column.* Keeps `created_by` / `finalized_by` consistent with `command_journal.actorName`.
7. **Money receipt scope of "external".**
   *Recommended default: payment-received external = customer-safe receipt of money applied; vendor-payout external = vendor-safe acknowledgment.* Internal carries the operator-side reconciliation context. Phase 4 will pin the exact field list.
8. **Migration sequencing relative to other open finalization branches.**
   *Recommended default: this migration is additive (new table only) and can land independently of in-flight PO/sales work.* **The concrete migration sequence number is not claimed by this spec.** It is assigned by the integrator at land time against the then-current `migrations/` directory in the target branch, to avoid collisions with sibling worktrees. The implementation plan should leave the number as `NNNN` placeholders in code paths it cannot avoid and let the integrator finalize.

> **Gate before test scaffolding.** The implementation plan **must explicitly resolve or confirm Open Questions 1–8** before any test scaffolding is written. The plan should record, per question, either an accepted recommendation, a documented override, or a decision deferred with a named owner and a clear "decide-by" point in the work order. Test code that assumes a contested answer (one row per audience, JCS+sha256, per-kind projector layout, projection-version bump policy, draft TTL, identity source, money external scope, migration sequencing) is grounds to back the plan out and re-decide before continuing.

---

## 12. Next Steps

1. **Architecture review.** Dispatch `claude-architect` (Opus 4.7 xhigh) against this spec. Output is a written review comment on issue #113 covering: schema critique, projection contract critique, security/leak surface, missing affordances, migration risk relative to sibling worktrees. Hold Phase 1 until the review lands.
2. **Implementation plan.** After review, write `docs/superpowers/plans/2026-05-20-finalization-receipts-foundation.md` translating Phase 1 acceptance criteria into ordered work units with named owner agents, test files, and proof gates. The plan must (a) resolve or confirm Open Questions 1–8 from §11 *before* test scaffolding begins, and (b) treat the migration sequence number as integrator-controlled at land time rather than baked into the plan. That plan is what `build` or `opus-build` actually executes.
3. **Track verticals.** Open sub-issues linked from #113 for Phases 2, 3, 4, and 5 once the foundation plan is approved. Each sub-issue gets its own Deep QA acceptance section.
4. **Memory.** Save a single durable lesson once Phase 1 lands and the leak tests pass — "audience-projected snapshots at write time, not read time, are how we keep external paths leak-free." Do not save routine progress notes.
