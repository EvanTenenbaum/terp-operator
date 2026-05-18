# Metaswarm Knowledge Base

This directory contains project-specific knowledge that metaswarm agents use for implementation and review.

## Structure

- **patterns/** - Code patterns and conventions
- **decisions/** - Architectural decisions and rationale
- **security/** - Security requirements and constraints
- **performance/** - Performance targets and optimization guidelines

## Current Implementation: Product Filtering System

### Key Specs
- V2 Design Spec: `/docs/superpowers/specs/2026-05-17-product-filtering-system-design-v2.md`
- Atomic Roadmap: `/docs/superpowers/specs/2026-05-17-atomic-implementation-roadmap.md`
- Handoff Prompt: `/docs/superpowers/specs/IMPLEMENTATION_HANDOFF_PROMPT.md`

### Critical Rules
1. Copy code EXACTLY from spec - no improvisation
2. Follow roadmap order strictly - dependencies matter
3. No stubs or TODOs - implement everything completely
4. Security is non-negotiable - parameterized queries only
5. Validate at every checkpoint before proceeding
