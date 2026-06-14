# Templates — the unified UX layer

> `src/client/components/templates/` holds the shared chrome for the five
> recurring UI jobs. **Reach for a template before hand-rolling chrome.**
> Every template reuses existing semantic classes and the green-accent system;
> none introduce new colors.

## The one-system rule

Every piece of UI in the operator console is one of six things. Each has
exactly one home:

| Job | Surface | Component |
|---|---|---|
| Global entity context (customer / vendor / lot / order / PO / bill) | Right-edge 5-state drawer, App-mounted | `ContextDrawer` (existing) |
| Row context for the selected grid row (history / relationship / issue / view-specific) | Right-edge tabbed inspector | `RowInspector` → `templates/InspectorDrawer` |
| Selection actions (the verbs for the selected rows) | Selection strip under the grid | `templates/StatusActionBar` (decision table per spec §10) |
| Pre-selection filters | Grid toolbar | `templates/FilterPresetStrip` |
| In-page work tools (forms used repeatedly across rows) | Collapsible panel above/below the grid | `WorkspacePanel` (existing) |
| One-shot form entry | Modal | `templates/FormDialog` |

**Decision rule — drawer vs panel vs dialog:**
- *Reading about* an entity or row → drawer (ContextDrawer for entities,
  RowInspector for rows).
- *Working through many rows* with the same tool (allocations, payouts) →
  in-page `WorkspacePanel`, gated on selection where the tool needs one.
- *Entering one record then leaving* → `FormDialog`.

Do **not** create a new `*Drawer.tsx` with its own backdrop/aside/header.
New row-context surfaces become inspector tabs via OperatorGrid's
`inspectorTabs` prop; new entity tabs register in `ContextDrawer`'s tab map.

## StatusActionBar

Implements the spec's status-aware primary law: ONE primary verb for the
selected rows' status; everything else in the "More ▾" tray.

```tsx
const table: StatusActionTable = {
  rules: [
    { when: 'draft', primary: act.confirm, tray: [act.reprice, act.cancel] },
    { when: (row) => row.status === 'posted' && !flag(row.packed),
      primary: act.markPacked, tray: [act.fulfillment] },
    { when: 'fulfilled', primary: null, tray: [act.pickList] },
    // Catch-all keeps every verb reachable for mixed/unknown states.
    { when: () => true, primary: null, tray: Object.values(act) }
  ]
};
<OperatorGrid … selectionActions={(rows) => (
  <StatusActionBar rows={rows} table={table} busy={isRunning} />
)} />
```

Rules evaluate top-down; the first rule where **every** selected row matches
wins. Always end with a catch-all rule listing the full verb set — that is the
no-functionality-loss guarantee. Note: with a catch-all present, mixed/unknown
selections resolve to the catch-all (full verb set in the tray) rather than
the mixed-selection reason pill; the pill only appears in tables without a
catch-all, which adopting views should not write.

Write rules against the REAL status values verified in `schema.ts` and
`commandBus.ts` — spec §10's status names predate schema changes and are
wrong in several views (see the 2026-06-11 adoption decision-log entry).

Adoptions: `OrdersView` (§10.4), `VendorPayablesView` (§10.6),
`FulfillmentView` (§10.7), `ConnectorsView` (§10.8), `RecoveryView` (§10.9),
`PaymentsView` (§10.5), `CloseoutView` (§10.10 — synthetic period row),
`SalesView` line grid (§10.1 — `needs_resolution` expressed as a
`validationIssues` predicate rule; real line statuses
`draft | reserved | allocated | posted | cancelled`).
`InventoryView` intentionally keeps its in-page form-bearing row tools
(§10.13: inline cells are the primary).

## FilterPresetStrip

Declarative GH #354 presets — toggle semantics, `aria-pressed`,
`role="group"` in one place. Dynamic presets take a function:

```tsx
<FilterPresetStrip view="orders" ariaLabel="Filter by status" presets={[
  { label: 'All Open', filter: 'status:draft,confirmed' },
  { key: 'today', label: 'Today', filter: () => `createdAt:${new Date().toISOString().slice(0, 10)}` }
]} />
```

Preset labels must match operator-facing column value semantics (2026-05-25
preset naming decision); use `title` to clarify.

Adoptions: `OrdersView`, `PaymentsView`, `InventoryView`, `FulfillmentView`
(GH #354 originals), `SalesView` orders grid (A8). Caveat: when several grids
share one `view` filter slot in mutually exclusive branches (SalesView), clear
the slot on branch switch so a preset cannot silently filter the other grid.

## InspectorDrawer / RowInspector

`InspectorDrawer` owns drawer chrome once: `.row-history-backdrop` +
`.row-history-drawer` (the canonical inspector chrome classes), focus trap,
Escape, `role="dialog"`, header, `.inspector-tabs` tablist with arrow-key
navigation. Tab bodies render in a `role="tabpanel"` scroll area and must not
render their own header or backdrop.

`RowInspector` is the grid-level instance: History · Relationship · Issue
tabs (the three former standalone drawers) plus view-specific tabs:

```tsx
<GridJourney view="payments" … inspectorTabs={(row) => [
  { key: 'receipt', label: 'Receipt',
    render: () => <ReceiptPanel kind="payment" paymentId={String(row.id)} /> }
]} />
```

`VendorContextDrawer` (PO authoring) also renders through InspectorDrawer —
its quick-add / brands functionality is unchanged; only chrome converged.
`MediaBatchDrawer` (batch media manager) renders through InspectorDrawer as a
single Media tab — upload, share-link, and delete-confirm behavior unchanged.
`ReceiptPreviewDrawer` deliberately stays on `.context-drawer` chrome (already
canonical; see the 2026-06-12 decision-log entry).

## FormDialog

Modal scaffold: overlay, focus trap, ESC, `aria-modal` + `aria-labelledby`
→ `<h2>`, close icon (`aria-label="Close"`), `role="alert"` error banner,
Cancel/Submit footer with pending state. Dialogs supply fields only
(`FormField` for the label+input rows). Pass `titleId` when an a11y test
pins a specific heading id. Reference adoption: `RecordPrepaymentDialog`.

Adoptions: `RecordPrepaymentDialog` (reference), `RefereeDialog`,
`UpdateRefereeRelationshipDialog`, `DeactivateRefereeRelationshipDialog`,
`VoidRefereeCreditDialog`, `ContactCreateModal`, `RefereeRelationshipDialog`,
`AddRefereeRelationshipDrawer` (form-not-context; two-step resilient flow
preserved). Known gap: no `tone` variant for destructive submits — reported
2026-06-12.

## Testing

Each template has a colocated `.test.tsx` locking its accessibility
contract. When adopting a template in a view, view-level tests should assert
behavior (commands fired, filters set), not template chrome.

## Page composition

These sections extend the six-job rule (above) with the page-composition question it
never answered: *given a page, which blocks may be present, in what order, and in what
default state?* Adopted from the 2026-06-12 UX simplicity review Part 1.

### Decision tree

For **any block** (panel, table, strip, banner, tile) a feature wants to put on a page,
walk this tree **in order** — the first match wins:

1. Is it the page's PRIMARY work object — the thing the route's persona came to act on
   (the queue, the grid, the builder)?
   → Inline, first content block, ≥60% of initial viewport. EXACTLY ONE primary block
   per route. Everything else yields.

2. Is it edited AS PART OF the primary document (line items, draft rows)?
   → Inline grid INSIDE the primary block.

3. Is it CONTEXT about an entity the operator is working — read-mostly, consulted not
   edited?
   → ContextDrawer tab (default), or the page's reserved context aside ONLY in an
   authoring workspace that already has a context column. Never both: one context home
   per route.

4. Is it a SECONDARY work surface the persona needs most visits, but never first
   (suggestions, recent sheets, registry grids)?
   → WorkspacePanel BELOW the primary, collapsed by default, with a live count/summary
   in the collapsed header. `collapsedSummary` is mandatory — a collapsed panel with
   no scent is a removal, and removal is forbidden.

5. Is it needed WEEKLY or less (diagnostics, divergence reports, admin tools, tuning
   knobs)?
   → Collapsed panel at the BOTTOM of the page, or a drawer tab, or Reports. Never
   above anything daily.

6. Does it serve a DIFFERENT PERSONA than the route's owner (photography readiness on
   Sales/Inventory)?
   → Its own route (it has one) plus, at most, a COUNT PILL or preset chip on the host
   route that deep-links. A persona's whole workstation never mounts expanded inside
   another persona's flow.

7. Is it CONFIGURATION (changes how the system behaves, not what work exists today)?
   → Settings. And the inverse holds: operational queues do not live in Settings.

### Page-composition invariants

These hold regardless of the tree:

- **I1 — One primary, nothing above it.** Above the primary block only: the page
  title/control band and blocking alerts (connection lost). A banner that doesn't
  block work is not a blocking alert.
- **I2 — A fact renders once per page.** If a number (payables total, customer
  balance) already shows in a page block, no other block on that page may show it
  as content — only reference it as a link.
- **I3 — No unbounded DOM.** Any block whose row count follows data volume must
  virtualize, paginate, or hard-cap with "View all N" — the page never scrolls
  because a *secondary* block grew.
- **I4 — Expanded panels are glanceable.** An expanded secondary panel ≤ ⅓ viewport;
  taller means it's either primary (rule 1) or needs internal scroll.
- **I5 — Collapsed ≠ hidden.** Every collapsed panel carries a live summary (count,
  total, last-activity) so the disclosure has scent. This is the
  zero-functionality-loss guarantee in collapsed form.
- **I6 — One door per job.** A related-records set gets ONE home per route (drawer
  tab OR inline section OR aside — never two simultaneously).

> Note: these rules extend the existing six-job rule in this file. The six-job rule
> answers "which container for this job?"; the page-composition rules answer "where
> on the page, and in what state?"
