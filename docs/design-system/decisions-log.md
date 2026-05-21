# Design System Decision Log

> **Append-only.** Add new entries at the **top**. Don't delete history.

## Format

```markdown
## YYYY-MM-DD: [Short Title]
**Decision:** What was decided
**Rationale:** Why (problem solved, tradeoff accepted)
**Example:** File path showing implementation (or "N/A" for meta-decisions)
**Author:** Agent name via Evan
**Related:** Optional — links to issues, prior decisions, audits
```

---

## 2026-05-21: #64 PR-3 — COGS exception correction journal entries at postSalesOrder
**Decision:** When `postSalesOrder` runs, insert one `correctionJournalEntries` row per posted line that carries a `belowFloorReason`. Variance = `max(0, (priceFloor - unitPrice) × qty)` — measures revenue shortfall; unitCost = priceFloor always (both set together by setLineLandedCost), so the gap that matters is between the floor and what we actually charged (unitPrice). This matches `computeOrderExceptionTotals.marginWaivedTotal`. Uses the `salesOrderLines.priceFloor` column pinned at set-time (not re-read from `batches.priceRange`) for audit reproducibility. The period check (`assertPeriodUnlocked`) runs once per posting on the first exception line. Entry IDs are added to `affectedIds` so they participate in the `afterSnapshot`. Reversal of `postSalesOrder` marks any snapshotted exception entries as `status = 'reversed'` rather than deleting them. For `vendor_approval_pending` lines, append a note to the vendor's open bill `discrepancyNotes` (text-only annotation, no dollar/status mutation, bill ID NOT added to `affectedIds`, and the annotation is NOT reversed on `postSalesOrder` reversal — it persists as AP audit). The vendor-bill read uses `SELECT ... FOR UPDATE SKIP LOCKED` so concurrent `postSalesOrder` calls for orders sharing the same vendor bill do not silently lose annotations OR deadlock — if the bill is locked, this call skips the annotation rather than blocking.
**Rationale:** PR-3 closes the accounting propagation gap for below-range COGS exceptions captured in PR-1/PR-2. Writing one correction journal entry per exceptional line keeps the audit trail line-grained and reuses the existing correction-journal infrastructure rather than introducing a new ledger. Pinning to the set-time `priceFloor` column (instead of re-reading the live `batches.priceRange`) means the entry remains reproducible even if the batch range is later edited. The `vendorBills.discrepancyNotes` append is an explicit override of the prior `saleLineCostExceptions.ts` "do not touch vendor bills" note, which was written before Evan approved this AP-visibility behavior on 2026-05-21. Using `FOR UPDATE SKIP LOCKED` (rather than plain `FOR UPDATE`) matches the read-modify-write locking discipline used for customers and batches elsewhere in `postSalesOrder` while preventing deadlocks across concurrent orders sharing a vendor bill.
**Example:** `src/server/services/commandBus.ts` (postSalesOrder exception-journal loop after `update(salesOrders)`; `reverseCommandById` postSalesOrder branch correction-journal reversal loop).
**Author:** OpenCode via Evan
**Related:** Issue #64; PR-1 (#137), PR-2 (#151); Issue #150 (snapshotByAffectedIds pool-vs-tx capture gap noted in reversal comment); Issue #154 (pre-existing test regex mismatch — separately addressed by upstream PR #141 / commit b78a786); migration baseline 0049 — no new migration for PR-3.

---

## 2026-05-21: Accessibility conventions for interactive components
**Decision:** Establish five accessibility patterns for icon-only buttons, bare `<select>` elements, sidenav current-page semantics, dialog accessible names, and disclosure toggles. All five were introduced in PRs #135 and #136 but were not recorded at merge time.

**Rationale:**
1. **Icon-only button accessible name** — `aria-label` (not `title`) provides the accessible name and must include an action verb so screen-reader users know what the control does.
2. **Bare `<select>` accessible name** — when no visible `<label>` is present, `aria-label` on the `<select>` itself is required for screen readers to announce the control's purpose.
3. **Sidenav current-page semantics** — `aria-current="page"` on the active nav item lets screen readers announce the current location; inactive items must use `undefined` (not `false`) so the attribute is omitted entirely.
4. **Dialog accessible name** — `aria-labelledby` must reference a co-located `<h2>` id inside the same component, giving the dialog a programmatic name tied to its visible title.
5. **Disclosure toggle state** — `aria-expanded` bound to the controlling state variable lets assistive tech announce whether the controlled region is open or closed.

**Example:**
- Icon-only button: `src/client/components/OperatorGrid.tsx:295` (`aria-label="Remove {field}:{value} filter"`)
- Bare select: `src/client/components/SavedFiltersDropdown.tsx:17` (`aria-label="Load saved filter"`)
- Sidenav current page: `src/client/components/Shell.tsx:137` (`aria-current={isActive ? "page" : undefined}`)
- Dialog name: `src/client/components/VoidRefereeCreditDialog.tsx:43` (`aria-labelledby="vrc-title"` paired with `<h2 id="vrc-title">`)
- Disclosure toggle: `src/client/components/QuickLedgerGrid.tsx:264` (`aria-expanded={!hidden}`); `src/client/components/CommandPalette.tsx:218` (`aria-expanded={advancedOpen}`)

**Author:** OpenCode via Evan
**Related:** `PR #135`, `PR #136`, `Issue #140`

---

## 2026-05-21: Below-range COGS exception chip shared by PricingPanel + SalesView (#64 PR-2)
**Decision:** Below-range `setLineLandedCost` exceptions (PR-1) are surfaced to operators via a shared `LandedCostExceptionChip` component + matching AG Grid `LandedCostExceptionCellRenderer`. Both reuse the existing `.selection-pill.warning` (amber border / amber/10 fill / amber text) — no new colors. The operator-vocabulary reason labels (`keep_margin`, `waive_margin`, `take_loss`, `vendor_approval_pending`, `renegotiate`) live in the chip module as `LANDED_COST_EXCEPTION_REASON_LABELS` and are imported by `PricingPanel` so the picker and the projected-state chip share a single vocabulary source. The chip data comes from a server-side projection (`projectLandedCostException`) over the latest successful `setLineLandedCost` command journal `result.delta.exceptionReason`, attached via a LATERAL join in `salesOrderLines` and a GIN array-contains lookup on `command_journal.affected_ids` (migration 0043). The `landedCostExceptionReason` column is gated behind the existing `showMargin` toggle (added to `MARGIN_COLUMN_FIELDS`) to prevent vendor/COGS relationship state from leaking during customer screen-share.
**Rationale:** PR-2 is vendor-UX only — no DB schema change, no PO/vendor-bill/accounting writes (those land in PR-3). The command-journal projection lets the operator see `vendor_approval_pending` and other below-range exceptions on the very next page render without touching the existing line table. Sharing the chip across `OrderPricingPanel` and the Customer Draft Lines grid keeps the warning vocabulary consistent across both surfaces.
**Example:** `src/client/components/LandedCostExceptionChip.tsx`, `src/server/projections/landedCostException.ts`, `src/server/projections/landedCostExceptionSql.ts`, `src/server/routers/queries.ts` `salesOrderLines`, `src/client/views/SalesView.tsx` lineColumns `COGS exception` column.
**Author:** OpenCode via Evan
**Related:** Issue #64 PR-2; reconciles PR #144 (kebab-case) onto snake_case vocab from PRs #137 and #145. `exceptionReason` in `setLineLandedCostPayloadSchema` is `z.enum(BELOW_FLOOR_REASONS)` (snake_case).

---

## 2026-05-20: Sales sheet/catalog export filenames use `terp-operator-*` prefix
**Decision:** Sales sheet and catalog CSV export filenames in `src/client/views/SalesView.tsx` now use the `terp-operator-*` prefix (e.g. `terp-operator-sales-sheet.csv`, `terp-operator-sales-catalog.csv`, `terp-operator-customer-offer.csv`) instead of the historical `terp-agro-*` prefix. The `OperatorGrid.csvExport.ts` filename helper already uses `terp-operator-*`.
**Rationale:** The product canonical name is TERP Operator. Aligning export filenames with the current branding reduces confusion for downstream consumers and prevents import scripts from breaking when they expect the new prefix.
**Example:** `src/client/views/SalesView.tsx` (link.download assignments); `src/client/components/OperatorGrid.csvExport.ts`.
**Author:** OpenCode via Evan
**Related:** TERP Operator canonical identity; downstream consumer/import scripts should be communicated this change.

---

## 2026-05-20: Sale-line exception controls move from window.prompt to inline form; hide-margin posture hides cost-revealing UI
**Decision:** Introduce `src/client/components/SaleLineExceptionControls.tsx` to host the inline form for the `setLineLandedCost` / `setLineBelowFloorReason` / `resolveVendorApproval` commands inside the sale-line expansion row. The component reuses `BELOW_FLOOR_REASONS` and `LANDED_COST_BASIS_VALUES` from `src/shared/saleLineCostExceptions.ts` so prompt copy and server validation stay in lockstep. The whole strip — plus the "Range / Exceptions" badge column — is gated by the current `showMargin` value so a customer-facing screen-share posture cannot leak cost, floor, or vendor-approval context. Persistence behavior remains the existing #63 contract (`showMargin` is persisted via zustand `persist`).
**Rationale:** The previous `window.prompt` chain was hostile to keyboard-only operators, untestable in jsdom, and revealed cost context (range labels, basis vocabulary) even when the operator had toggled hide-margin. Splitting the action surface into its own component keeps `SalesView` lean and lets `showMargin` gate the entire strip with a single early return.
**Example:** `src/client/components/SaleLineExceptionControls.tsx`, `src/client/views/SalesView.tsx`.
**Author:** Claude Opus 4.7 via Evan
**Related:** Issues #60–#64; reviewer fix to skeptical frontend/system quality pass.

---

## 2026-05-20: Customer sheet snapshot reads are scoped + viewer-safe + re-sanitized
**Decision:** `queries.customerSheetSnapshotById` now requires both `id` and `customerId`, filters on both, and routes the row through a new `getViewerSafeSnapshot(snapshot, role)` helper in `src/shared/customerSheetSnapshot.ts`. The helper returns null when a `viewer`-role user requests an `internal` (operator) snapshot and re-runs `buildCustomerSheetSnapshotRows` on the way out so even historically-polluted `rows_json` cannot leak cost or margin to catalog reads.
**Rationale:** The previous endpoint accepted only `id`, which let any signed-in caller open any customer's snapshot — including internal-mode snapshots whose `rows_json` may carry cost/margin from older or hand-edited writes. Read-side privacy must not depend on the write-side sanitizer being perfect.
**Example:** `src/server/routers/queries.ts` (customerSheetSnapshotById), `src/shared/customerSheetSnapshot.ts` (`getViewerSafeSnapshot`).
**Author:** Claude Opus 4.7 via Evan
**Related:** Issues #62, #63.

---

## 2026-05-20: Finalization receipt workspaces use shared document renderer primitives and internal/external view labeling
**Decision:** Finalization receipt workspaces (PO vendor receipt, Sales customer confirmation, later payment/payout receipts) will be built on a shared `document_snapshots` table with per-type pure projection modules. The UI will use common receipt renderer primitives and explicit internal/external view labeling. External projection is server-side allowlisted; the client never hides internal fields via CSS or conditional rendering.
**Rationale:** A shared foundation prevents N per-domain receipt tables and fragmented security models. Server-side projection guarantees that a client bug or malicious request cannot expose `unitCost`, `internalMargin`, or `internalNotes` to vendors/customers. Internal/external labeling in the UI makes the boundary obvious to operators and supports the required `INTERNAL — DO NOT SEND` watermark on copy/print.
**Example:** `document_snapshots` table design, `poProjection.ts` module contract (`EXTERNAL_FIELDS`, `projectExternal`), receipt preview components inside `PurchaseOrdersView`. `SalesView` receipt integration is planned but not yet implemented.
**Author:** OpenCode documentation worker via Evan
**Related:** `docs/roadmap/2026-finalization-receipts-roadmap.md`, GitHub issue #113

---

## 2026-05-20: Photography MediaDetailPanel wires media lifecycle commands
**Decision:** The Photography route uses a dedicated `MediaDetailPanel` under the queue grid to show per-batch media rows and expose set-primary, publish, delete, and mobile-upload handoff actions through existing `useCommandRunner` and tRPC query patterns.
**Rationale:** Completing the feature required first-class UI for backend media commands instead of leaving curation in CommandPalette/JSON; panel keeps batch aggregate queue and per-media lifecycle in one operator workspace while preserving authenticated mobile upload route.
**Example:** `src/client/components/MediaDetailPanel.tsx`, `src/client/views/MediaView.tsx`
**Author:** `OpenCode PM + Claude/AQA via Evan`
**Related:** `PR #65`, `docs/superpowers/specs/2026-05-17-photography-upgrade-design.md`

---

## 2026-05-18: Documentation grounded in actual codebase, not aspirational spec
**Decision:** When the original 2026-05-18 spec for the agent-orientation/design-system docs referenced files and structures that didn't exist (a `Button` component, `ui/`/`grids/`/`forms/`/`layout/` subfolders, `@/` path aliases, `cn()` helper, `IntakeToolbar` / `StatusCellRenderer` / `CurrencyCellRenderer` components, raw TanStack mutation patterns), the docs were rewritten from the actual codebase rather than transcribed from the spec.
**Rationale:** Documentation that misrepresents the codebase is worse than no documentation — it teaches agents to write code that doesn't compile (`@/lib/utils`) or that bypasses the audit/journal contract (raw `useMutation` instead of `useCommandRunner`). The spec's value was its structural outline (which docs to write, what topics each should cover). The code is the source of truth for content.
**Example:** `docs/agent-orientation/*.md`, `docs/design-system/*.md` (all rewritten from `src/client/`, `src/server/`, `src/shared/`, `package.json`, `tailwind.config.ts`, `tsconfig.json` reads).
**Author:** Claude Opus 4.7 via Evan
**Related:** `docs/patterns/extracted-2026-05-18.md` (pattern extraction report that surfaced the spec/reality gap).

---

## 2026-05-18: Hybrid styling — Tailwind utilities + semantic classes via @apply
**Decision:** Continue the existing pattern: Tailwind v3 utility layer with custom theme tokens (`ink`, `panel`, `field`, `line`, `accent`, `amber`, `danger`) underneath ~209 semantic CSS classes in `src/client/styles.css` composed with `@apply`. Components reach for semantic classes (`primary-button`, `field-inline`, `control-band`, `view-stack`) for vocabulary nouns, and Tailwind utilities for one-off layout glue.
**Rationale:** Pure Tailwind would mean re-writing the same 5+ utility chain across the codebase for common shapes (buttons, toolbars, view stacks). Pure semantic CSS would mean rebuilding the utility flexibility Tailwind already provides. The hybrid lets vocabulary stay short and consistent, while leaving Tailwind utilities for the long tail.
**Example:** `src/client/styles.css` (`.primary-button`, `.field-inline`, `.control-band`, etc.); `tailwind.config.ts` for the token palette.
**Author:** Claude Opus 4.7 via Evan
**Related:** `docs/design-system/styling-guide.md`.

---

## 2026-05-18: useCommandRunner is the only mutation contract for business state
**Decision:** All state-changing operations on business data (intake, orders, payments, batches, vendors, fulfillment, etc.) must route through `useCommandRunner.runCommand(name, payload, reason)`. Direct `trpc.<router>.<endpoint>.useMutation` is reserved for auth (`trpc.auth.login.useMutation` in `LoginView.tsx`) and a tiny set of bookkeeping operations.
**Rationale:** `useCommandRunner` stamps the idempotency key, invokes `trpc.commands.run` which dispatches to the server-side command handler, writes the DB + JSONL command journal, broadcasts a Socket.io event, pushes the success/error toast, and invalidates all cached queries. Bypassing this hook bypasses the audit + reversibility contract that the entire product is built on.
**Example:** `src/client/components/useCommandRunner.ts` (27 lines, the contract); `RefereeRelationshipDialog.tsx`, `IntakeView.tsx`, `OperatorGrid.tsx`'s `onCellCommit` consumer pattern.
**Author:** Claude Opus 4.7 via Evan
**Related:** Audit #23 (idempotency-key payload binding gap), audit #13 (Socket.io auth gap), `docs/design-system/state-patterns.md`.

---

## 2026-05-18: One Zustand store (useUiStore), not many
**Decision:** All UI state shared across components lives in a single `useUiStore` at `src/client/store/uiStore.ts`. Do not create additional Zustand stores.
**Rationale:** A single store keeps the UI state surface auditable and lets the `persist` middleware partialize a single shape. Multiple stores would fragment the persisted state and obscure where to look for cross-cutting state (drawer state, palette state, route history, toasts).
**Example:** `src/client/store/uiStore.ts` (~350 lines, ~30 state fields + actions, `persist` + `immer`).
**Author:** Claude Opus 4.7 via Evan
**Related:** `docs/design-system/state-patterns.md`.

---

## 2026-05-18: Initial design system documentation created
**Decision:** Establish a living documentation system under `docs/agent-orientation/` and `docs/design-system/` to reduce Evan's per-prompt context overhead and prevent frontend drift.
**Rationale:** Repeating architectural patterns, component locations, styling conventions, and state-management approaches in every agent prompt wastes Evan's time and produces inconsistent results. Living docs that agents read at session start solve this without ongoing manual effort.
**Example:** `docs/agent-orientation/START_HERE.md`, `docs/design-system/INDEX.md`.
**Author:** Claude Opus 4.7 via Evan
**Related:** `docs/superpowers/specs/2026-05-18-agent-orientation-design-system-design.md` (original spec), `docs/superpowers/plans/2026-05-18-agent-orientation-design-system.md` (implementation plan).

---

[Future decisions append above this line, in reverse chronological order.]
