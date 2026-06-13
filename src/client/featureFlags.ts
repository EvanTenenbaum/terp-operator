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
