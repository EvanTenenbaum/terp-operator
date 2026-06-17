/**
 * Client-side feature flags.
 *
 * TER-1664 / UX-A12 (Execution Decision 4, docs/ux-audit-2026-06-12.md):
 * connector/processor surfaces are MVP-out. While this flag is `false`:
 *
 *   - the `/connectors` and `/processors` routes redirect to
 *     Settings → Requests (see App.tsx `SettingsRequestsRedirect`),
 *   - the `connectors` / `processors` lanes are removed from
 *     `defaultOperatorViews` (see accessPolicy.ts),
 *   - palette entity navigation keeps deep-linking connector requests to the
 *     Settings → Requests home rather than the standalone lane
 *     (see CommandPalette.tsx).
 *
 * ConnectorsView and ProcessorsView components are intact and still imported
 * by App.tsx — flip this constant to `true` to restore the standalone routes
 * and lane visibility when the connector program (U13) is picked back up.
 */
export const CONNECTOR_SURFACES_ENABLED = false;

/**
 * Phase 3B — SalesView Mercury UX retrofit (layout swap behind flag).
 *
 * When `false` (default): SalesView renders the legacy 1813-line monolithic
 * view unchanged. No operator impact.
 *
 * When `true`: SalesView becomes a mode router:
 *   - No customer selected → SalesBrowseMode (Mode A — browsing, same layout)
 *   - Customer selected via ?customer=<uuid> → SalesBuildMode (Mode B —
 *     sticky customer context header + primary draft lines grid)
 *
 * This flag gates ALL Phase 3B layout changes. Remove after Phase 4 closeout
 * when `salesViewMercury` is the canonical SalesView.
 *
 * @see docs/engineering-plans/specifications/views/sales-view-refactor-plan.md
 * @see docs/engineering-plans/MASTER-EXECUTION-DOCUMENT.md §Phase 3B
 */
export const SALES_VIEW_MERCURY = false;
