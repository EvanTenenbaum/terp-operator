# TERP Operator Roadmap

This directory holds the **strategic kernel** and **phase-readiness** docs for TERP Operator.

## Quick Start

1. **Is the work a bug or problem?** → Use [GitHub Issues](../github-issue-tracking.md) with the `Known issue` template.
2. **Is the work a feature, capability, or command-family?** → Find or create a Linear issue under [project TERP Operator](https://linear.app/terpcorp/project/terp-operator-cea015fac801), anchored to a registry ID (`CAP-001`..`CAP-029`) or command family ID (`CMD-INTAKE`, `CMD-PO`, `CMD-SALES`, `CMD-POSTING`, `CMD-PAYMENTS`, `CMD-VENDOR`, `CMD-FULFILLMENT`, `CMD-CONNECTOR`, `CMD-RECOVERY`, `CMD-CLOSEOUT`, `CMD-TAGS`, `CMD-MATCHMAKING`). Update the relevant roadmap or phase-readiness doc if the phase milestone changes.
3. **Is the work a strategic kernel update?** → Edit the relevant doc in `docs/product/` (e.g., `capability-registry.md`, `north-stars.md`, `work-loops.md`).

**Linear is the product execution source of truth.** Phase milestones in Linear map 1:1 to `docs/roadmap/phase-readiness/{phase}.md`.

## How to add a roadmap doc

- Keep it small and agent-readable.
- Use the templates in `templates/` as a starting point.
- Name files descriptively: `2026-<area>-<topic>-roadmap.md` or `feature-<name>.md`.
- Link related Linear issues, GitHub Issues, or PRs when relevant.
- Update this README with a one-line link if the doc becomes a persistent initiative.

## Existing roadmaps

- [2026-finalization-receipts-roadmap.md](./2026-finalization-receipts-roadmap.md) — Shared document-snapshot foundation for PO, Sales, and money receipt finalization with server-side external projection allowlists.

Active roadmap files live in this directory. Use the templates in `templates/` when adding new persistent initiatives.
