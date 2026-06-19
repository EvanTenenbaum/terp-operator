# SalesView Refactor — Architecture Brief (Phase 3A)
**Date:** 2026-06-17 | **Architect:** Claude Opus 4.7 | **Risk:** T3 (money/credit, multi-step workflow)
See Claude dispatch for full plan. Key decisions:
- Two modes: Mode A (browsing, grid primary) + Mode B (building, draft lines primary)
- 3 slide-overs: Order Detail, Customer Detail, Inventory Finder
- Customer context: sticky 48px header (UX-7)
- Phase 3A = refactor in place (no UX change), Phase 3B = layout swap behind flag
- Margin toggles → context header, pricing overrides → Order Detail → Pricing tab
- Incremental rollout behind per-view feature flag
