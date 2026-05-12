# TERP Agro Integration Notes

Date: 2026-05-12
Status: running PM decision log

| Date | Decision | Rationale | Cross-refs |
| --- | --- | --- | --- |
| 2026-05-12 | Product scope is governed by work loops plus exposure class. | Prevents the conceptual manifest from becoming a feature dump. | `docs/product/north-stars.md`, `docs/product/work-loops.md` |
| 2026-05-12 | The TERP Numbers manifest is a coverage oracle, not a literal implementation blueprint. | AppleScript, Numbers cockpit adapters, Script Menu entries, and iCloud timing are old-platform implementation details. | `docs/product/capability-registry.md` REJ-* |
| 2026-05-12 | Design spec frontend phases remain the execution unit. | The spec has wireframes, placement law, decision tables, and playbook recipes; replacing them would create drift. | `docs/design/spec.md`, `docs/design/replication-playbook.md` |
| 2026-05-12 | Backend gaps are carried as packets, not as new visible controls. | Pricing, tags, search, suggestions, connector posting, and inventory transitions need kernel work before or alongside UI exposure. | Roadmap §4 |
| 2026-05-12 | Customer Workspace remains inside Sales, not a standalone route. | The design spec explicitly rejects the route; benchmark fallback protects speed. | OPEN-02, Phase 1 |
| 2026-05-12 | Below-floor remains warning-only in the frontend pass, while backend pricing guardrails remain required for product completeness. | Respects spec/user choice while preserving commercial trust north star. | OPEN-04, Backend Packet B |
| 2026-05-12 | Reports stays a dedicated route under Decide. | User/design explicitly requested it; reports are projections, not workflow engines. | OPEN-03, Phase 6 |
| 2026-05-12 | Connector accepted-to-posted bridge is deferred until routing UX stabilizes. | Connectors must remain inbox items that route into normal commands; direct ledger mutation is forbidden. | CAP-018, Backend Packet C |
| 2026-05-12 | Direct `globalSearch` remains acceptable until freshness/performance evidence says otherwise. | Avoids adding a generated search-index table prematurely. | CAP-015, BE-007 |
| 2026-05-12 | Archive command must be hardened to match preview blockers. | Closeout trust is backend-critical and should not wait for UI polish. | Backend Packet A |
