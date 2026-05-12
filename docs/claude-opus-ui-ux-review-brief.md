# Claude Opus UI/UX Review Brief

Date: 2026-05-11
Purpose: ask Claude Opus for an independent second-pass review of TERP Agro's current UI/UX against prior screen-recording analysis documentation.

## Instruction

Act as a skeptical senior product architect and operator-workflow UX reviewer.

You are not reviewing the original videos. Review only the attached documentation created from those videos plus the current TERP Agro audit/docs. The goal is not to mirror the current Apple Numbers workbook. The goal is to preserve the operator paradigm where it creates comfort and speed, while making the system simpler, safer, more automated, and more reliable.

Produce a structured review with:

1. The current-system interaction paradigm you infer from the documentation.
2. The biggest mismatches between that paradigm and the current TERP Agro UI/UX.
3. A prioritized list of atomic recommendations for improving the current UI and user interaction surfaces.
4. For each recommendation: priority, operator moment, current failure, smallest viable change, acceptance criteria, and whether it is a visibility gap, workflow gap, output gap, trust/control gap, or structural gap.

Be specific and practical. Prefer small changes to current surfaces over broad redesign unless the evidence demands a structural change.

## Attached Documents

- `recording-paradigm-codex-audit.md`: Codex's first-pass audit to challenge.
- `comment_timeline.md`, `actionable_tasks.md`, `prd_draft.md`: 2026-04-27 current-system walkthrough analysis.
- `intake-flow-findings.md`: 2026-05-05 intake/receipt video analysis.
- `order-inventory-reconciliation-findings.md` and `refined-sheet-model-analysis.md`: 2026-05-05 order/inventory reconciliation analysis.
- `frontend-interaction-surface-audit.md` and `workflow-gap-audit.md`: current TERP Agro implementation audits.

## Review Bias

- Judge operator moments, not modules.
- Spreadsheet-native does not mean pixel-copying Numbers. It means row-first, visible, keyboard-fast, reversible, and comfortable.
- The most important moments are:
  - starting a new sale
  - starting a purchase/order or receiving inventory
  - receiving or paying money
  - searching/slicing inventory while building a sale
  - making room on the screen by minimizing/focusing panels
  - preserving raw shorthand and status markers until their meaning is confirmed

