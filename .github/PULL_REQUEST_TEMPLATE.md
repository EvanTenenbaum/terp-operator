## What
<!-- Brief description of the change -->

## Domain
<!-- Which domain module(s) does this touch? -->

## Checklist
- [ ] Typecheck passes (`pnpm typecheck`)
- [ ] Lint passes (`pnpm lint`)
- [ ] Tests pass (`pnpm test`)
- [ ] New code has tests
- [ ] No `as any`, `console.log`, or `eslint-disable` without documented justification
- [ ] No file >500 lines (except config registries)
- [ ] Imports use path aliases (`@/domains/*`, `@/client/*`, etc.)
- [ ] Error states handled for all data-fetching components
- [ ] New domain module has README.md with API contract
- [ ] Commit messages use semantic tags (`[FEAT]`, `[FIX]`, `[REF]`, etc.)
