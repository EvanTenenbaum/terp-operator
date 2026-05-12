# PM Integration State — Documentation

Date: 2026-05-12
Status: active

## How To Use This Packet

Start with `docs/roadmap/2026-frontend-direction-roadmap.md`, then open the phase-readiness file for the implementation phase being planned.

For Phase 0a, use:

- `docs/roadmap/phase-readiness/0a.md`
- `docs/roadmap/handoff-to-writing-plans.md`

For any feature, check:

1. Does `docs/product/capability-registry.md` already cover it?
2. Which work loop in `docs/product/work-loops.md` owns it?
3. Which Replication Playbook recipe applies?
4. Which phase-readiness file gives the gate?
5. Which audit/test proves it did not drift?

## Required Closeout Commands

```bash
pnpm audit:product-roadmap
pnpm audit:parity
pnpm typecheck
pnpm build
```

Run E2E when production code changes or a phase-readiness file requires it.
