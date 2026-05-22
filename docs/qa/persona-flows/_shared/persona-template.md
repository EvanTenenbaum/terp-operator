# Persona: [Name]

## Who They Are
[2–3 sentences: background, what their job produces, what they care about.]

## Operating Style
- [How they interact with the app — keyboard-first, grid-native, etc.]
- [Tolerance for friction / interruption]
- [Trust signals they rely on — statuses, toasts, command history, etc.]

## Primary Views
- **[View name]** (`view: 'viewKey'`) — [why they're here]

## Command Families Used
- `CMD-XXX` — [what they use it for]

## What Good Looks Like
- [Concrete measurable signal of a smooth interaction]

## What Friction Looks Like
(Flag these as findings even when the flow technically completes.)
- [Concrete friction signal]

## Known System Constraints
(These are not bugs. Do not file findings for them.)
- State-based routing — see `_shared/navigation-primer.md`
- AG Grid virtualization — scroll or filter before interacting with off-screen rows
- Financial rounding — totals may vary ±$0.01–$0.26 from independent calculation

## Scenarios in This Directory
| File | Type | Covers |
|------|------|--------|
| `01-[name].md` | normal | [description] |
| `02-[name].md` | edge-case | [description] |
| `03-[name].md` | error-path | [description] |
