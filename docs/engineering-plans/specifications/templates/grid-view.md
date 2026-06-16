# GridView — SUPERSEDED

**This spec is superseded by [`primary-grid-view.md`](./primary-grid-view.md) as of 2026-06-16.**

The earlier "GridView template" framing in this file was a CPO-audit miss (Finding F2): it described the template as a parallel build alongside the existing `GridJourney` factory at `src/client/views/operations/shared.tsx:247`, which would have produced two competing templates for the entire Phase 2–3D migration window. The corrected approach — refactor in place, no parallel build — is documented in:

- **Decision rationale:** `docs/design-system/decisions-log.md` entry "2026-06-16 — GridJourney → PrimaryGridView Refactor Decision".
- **Target spec:** [`primary-grid-view.md`](./primary-grid-view.md).
- **Authority:** `MERCURY-ARCHITECTURE-MANIFESTO.md` §2.1, §4 (migration map row "GridJourney"), §5.2.

This file is kept (not deleted) so outbound links from older planning documents resolve to a redirect rather than 404. Do not author against this file. Do not paste this file's content into agent prompts.
