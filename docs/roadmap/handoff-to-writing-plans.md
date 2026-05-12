# Handoff To Writing-Plans Agent

Date: 2026-05-12
Status: ready for Phase 0a decomposition

## Required Reading

1. `docs/product/north-stars.md`
2. `docs/product/work-loops.md`
3. `docs/product/capability-registry.md`
4. `docs/design/spec.md`
5. `docs/design/replication-playbook.md`
6. `docs/roadmap/2026-frontend-direction-roadmap.md`
7. `docs/roadmap/phase-readiness/0a.md`

## First Scope

Decompose Phase 0a only:

- WorkspacePanel focus revision.
- CommandPalette default single-pane behavior.
- Hotkeys groundwork.
- No public IA churn.
- No backend schema changes.
- No production routing/library changes.

## Output Expected

Create implementation tickets/tasks that include:

- operator moment,
- files touched,
- capability registry row,
- Replication Playbook recipe,
- acceptance criteria,
- smoke test,
- rollback path.

## Non-Negotiables

- Do not modify `docs/design/spec.md`.
- Do not modify wireframes.
- Do not add a visible button without status-aware placement.
- Do not add a new route.
- Do not add a backend command.
- Do not introduce a modal wizard for routine work.
- Keep typecheck, build, parity, and product-roadmap audit green.

## Completion Evidence For Phase 0a

Minimum verification:

```bash
pnpm typecheck
pnpm audit:parity
pnpm audit:product-roadmap
pnpm build
```

If E2E is not run, record why and identify the first E2E to add in Phase 0b.
