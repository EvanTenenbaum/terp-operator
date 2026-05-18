# Styling Guide

> TERP Operator uses a **hybrid styling system**. Tailwind v3 is the utility layer; a hand-written set of ~209 semantic classes in `src/client/styles.css` (composed with `@apply`) is the vocabulary layer. When you reach for a class, ask: "Is there already a semantic name for this?" before composing utilities.

## The two layers

### Layer 1: Tailwind utilities

Configured in `tailwind.config.ts`. Standard Tailwind v3, content globbed from `./index.html` + `./src/**/*.{ts,tsx}`. Theme extensions:

```ts
colors: {
  ink:    '#18211f',  // primary text
  panel:  '#f7f8f5',  // page/panel background
  field:  '#ffffff',  // input/field background
  line:   '#d8ded6',  // borders, dividers
  accent: '#216e4e',  // primary action color
  amber:  '#b06915',  // warnings, attention
  danger: '#b42318',  // destructive actions
},
boxShadow: { focus: '0 0 0 3px rgba(33, 110, 78, 0.25)' }
```

The standard Tailwind palette (`zinc-*`, `emerald-*`, `slate-*`, `red-*`, etc.) is also available. It's used heavily — `text-zinc-700`, `text-zinc-500`, `border-zinc-300`, `bg-zinc-50` show up everywhere. There's a tension between using `zinc-*` and the custom token colors (`ink`, `panel`) — see "Drift" below.

### Layer 2: Semantic classes

Defined in `src/client/styles.css` (953 lines, 209 classes). Each is `@apply`-composed from Tailwind utilities. Examples:

```css
.primary-button   { @apply border-accent bg-accent px-3 text-white hover:bg-emerald-800; }
.secondary-button { @apply border-line bg-white px-3 text-ink hover:border-accent; }
.field-inline     { @apply flex items-center gap-2 text-sm font-medium text-ink; }
.control-band     { @apply flex flex-wrap items-center gap-2 border border-line bg-panel p-2; }
.view-stack       { @apply flex min-h-full flex-col gap-3; }
```

**Use semantic classes for vocabulary nouns** (button, toolbar, view, panel, drawer, finder table, pill). **Use Tailwind utilities for one-off layout glue** (spacing, alignment, responsive breakpoints).

## When to compose vs. when to add a class

Rule of thumb:
- **Compose Tailwind inline** if the pattern appears 1–2 times and isn't part of the visual vocabulary.
- **Add a semantic class** to `styles.css` if you're about to write the same 5+ utilities for the third time, or if the pattern has a name an operator/agent would use ("toolbar", "ledger row").
- **Use an existing semantic class** if one matches your intent, even if you'd write the utilities slightly differently.

When adding a new semantic class, document the decision in `decisions-log.md`.

## Color reference

| Token | Hex | Where to use it |
|---|---|---|
| `bg-accent` / `text-accent` / `border-accent` | `#216e4e` | Primary actions, link/text accent, focus highlights |
| `bg-panel` | `#f7f8f5` | Page/panel backgrounds |
| `bg-field` / `bg-white` | `#ffffff` | Input/field backgrounds, dialog content |
| `text-ink` | `#18211f` | Primary text (headings, body) |
| `border-line` | `#d8ded6` | Borders, dividers |
| `text-amber` / `bg-amber/10` | `#b06915` | Warnings, attention, draft status |
| `text-danger` / `bg-danger/*` | `#b42318` | Errors, destructive actions |
| `shadow-focus` | accent @ 25% | Focus ring (used by button variants) |

The Tailwind `emerald-*` family is used for hover states on accent (`hover:bg-emerald-800` in `primary-button`). Status pills in `StatusPill.tsx` reach into the full Tailwind palette per status (`slate`, `amber`, `emerald`, `blue`, `red`, `sky`, `violet`, `indigo`, `stone`). Don't add more.

## Typography

| Use | Class composition |
|---|---|
| Page title | `text-2xl font-bold text-ink` (or use the `.page-title` semantic class) |
| Section heading | `text-base font-semibold text-ink` |
| Subsection / panel subtitle | `text-xs text-zinc-600` |
| Body | `text-sm text-zinc-700` |
| Label (form) | `text-sm font-medium text-zinc-700` (or wrap with `.field-inline`) |
| Caption / meta | `text-xs text-zinc-500` |
| Status pill | `text-[11px] font-semibold uppercase` (handled by `StatusPill`) |
| Monospace (IDs, codes) | `font-mono text-sm` |

There's no custom font-family configured — system fonts via Tailwind's default.

## Spacing

Tailwind's default 4px scale. Common patterns:

| Pattern | Class |
|---|---|
| Panel→panel vertical gap (inside `view-stack`) | `gap-3` (12px) baked into `.view-stack` |
| Toolbar item gap | `gap-2` (8px) baked into `.control-band` |
| Form field vertical gap | `space-y-4` (16px) inside `<form>` |
| Section vertical gap | `space-y-3` to `space-y-4` |
| Card padding | `p-6` for dialogs, `p-4` for inline cards |
| Compact button padding | `compact-action` modifier (`h-7 px-2 text-xs`) |

Prefer `gap` over `margin` inside flex/grid containers. Margins between siblings break when you reorder.

## Layout idioms

| Need | Class composition |
|---|---|
| Vertical stack of panels | `.view-stack` (single class) |
| Toolbar | `.control-band` (or `.subtle-band` for nested) |
| Header row (title left, actions right) | `flex items-center justify-between gap-4` |
| Inline label + control | `.field-inline` |
| Right-aligned button group | `flex justify-end gap-2` |
| Two-column responsive grid | `grid grid-cols-1 xl:grid-cols-2 gap-3` (or arbitrary fractions: `xl:grid-cols-[0.9fr_1.1fr]`) |
| Modal backdrop | `fixed inset-0 z-50 flex items-center justify-center bg-black/50` |
| Modal content | `w-full max-w-lg rounded-lg bg-white p-6 shadow-xl` |

## Don'ts

❌ **Don't use `style={{...}}` inline styles.** The codebase has a few legacy uses (e.g., `style={{ color: '#eab308' }}` in cell renderers — a yellow alias-active dot). Don't grow the count. Add a semantic class or a Tailwind utility.

❌ **Don't introduce new theme colors** without a decision-log entry. The 7 tokens (`ink`, `panel`, `field`, `line`, `accent`, `amber`, `danger`) are the palette.

❌ **Don't use arbitrary values** like `p-[13px]` or `bg-[#abcdef]` without a reason. Round to the scale.

❌ **Don't fight Tailwind purge.** Class names must be statically determinable. `clsx('text-' + tone)` won't work — Tailwind can't see `text-amber` and will purge it.

❌ **Don't use `!important` (`!`-prefixed Tailwind classes) to override semantic classes.** If the semantic class is wrong, fix it; if you need a one-off, write the utilities directly.

## Drift to be aware of

- **`text-zinc-*` vs `text-ink`.** Most files use `text-zinc-700`/`text-zinc-900`. The token `text-ink` is the design-system answer but predates much of the code. New code should prefer `text-ink` for primary text; keep `text-zinc-*` for secondary/tertiary.
- **Dialog buttons use raw `rounded-md` Tailwind classes** instead of `.primary-button` / `.secondary-button`. See `components/buttons.md`.
- **`bg-primary` (a CSS custom property) is used in one place** (`RefereeRelationshipDialog`) — not in `tailwind.config.ts`. Prefer `bg-accent`.
- **`StatusPill` reaches into 9 Tailwind color families.** That's the canonical exception to the "use the 7 tokens" rule because status semantics need disambiguation.

## When to update this file

When you:
- Add a new semantic class to `styles.css` → add a row above or update the relevant table.
- Add a new design token to `tailwind.config.ts` → update the Color reference.
- Establish a new layout idiom that other devs/agents will copy → add it to Layout idioms.

Every update should also have a `decisions-log.md` entry with rationale.
