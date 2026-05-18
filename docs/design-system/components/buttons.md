# Button Patterns

> **There is no `Button` component.** Buttons in this codebase are `<button>` elements with one of four semantic CSS classes (`primary-button`, `secondary-button`, `text-button`, `icon-button`) and optional modifiers like `compact-action`. Classes are defined in `src/client/styles.css` using Tailwind `@apply`.

## The Four Variants

All variants share a shape baseline:

```css
.primary-button, .secondary-button, .text-button, .icon-button {
  /* h-8, inline-flex centered, border, text-sm font-medium, focus ring, disabled handling */
}
```

### `primary-button` — accent-colored, main action
```css
.primary-button {
  @apply border-accent bg-accent px-3 text-white hover:bg-emerald-800;
}
.primary-button:disabled {
  @apply border-zinc-300 bg-zinc-200 text-zinc-500 hover:bg-zinc-200;
}
```

**Use for:** the primary commit action in a flow (Post, Mark Ready, Save, Create Relationship).

```tsx
<button
  type="submit"
  disabled={isRunning}
  className="primary-button compact-action"
  onClick={() => runCommand('confirmSalesOrder', { orderId }, 'Confirm sales order from toolbar')}
>
  {isRunning ? 'Posting…' : 'Post Order'}
</button>
```

### `secondary-button` — outlined, medium emphasis
```css
.secondary-button {
  @apply border-line bg-white px-3 text-ink hover:border-accent;
}
```

**Use for:** Cancel, alternative actions, toolbar buttons that aren't the primary commit.

```tsx
<button type="button" className="secondary-button compact-action" onClick={onClose}>
  Cancel
</button>
```

### `text-button` — borderless accent text
```css
.text-button {
  @apply border-transparent bg-transparent px-2 text-accent hover:bg-panel;
}
```

**Use for:** tertiary actions, inline "View details," "Edit," "Reset filters."

### `icon-button` — square, icon-only
```css
.icon-button {
  @apply w-8 border-line bg-white text-ink hover:border-accent;
}
```

**Use for:** single-icon actions (Export CSV, Open drawer, Dismiss toast).

```tsx
<button
  type="button"
  className="icon-button"
  title="Export visible grid CSV"
  onClick={() => apiRef.current?.exportDataAsCsv({ fileName: `terp-agro-${view}.csv` })}
>
  <Download className="h-4 w-4" aria-hidden="true" />
  <span className="sr-only">Export visible grid CSV</span>
</button>
```

Note the `<span className="sr-only">` for screen readers — icon-only buttons must include accessible names. Audit issue #34 (a11y sweep) flags icon buttons that miss this.

## Modifiers

### `compact-action`
```css
.compact-action {
  @apply h-7 px-2 text-xs;
}
```

Shrinks any of the four button variants for use inside dense toolbars or grid rows. Stack it: `className="secondary-button compact-action"`. Common in `OperationsViews.tsx`, `IntakeView.tsx`, `SalesView.tsx`.

## Icons

Use `lucide-react` for icons (it's the only icon library in `dependencies`). Common pattern:

```tsx
<button className="secondary-button compact-action" onClick={onFlag}>
  <Flag className="h-4 w-4" aria-hidden="true" />
  Flag lot
</button>
```

- Icons are `h-4 w-4` for standard buttons, `h-3 w-3` for `compact-action` if you want them proportional.
- Use `aria-hidden="true"` on the icon if the button text already conveys the action.
- Add `<span className="sr-only">…</span>` if the button has only an icon.

## Loading States

The mutation hook exposes `isRunning`:

```tsx
const { runCommand, isRunning } = useCommandRunner();

<button
  type="submit"
  disabled={isRunning}
  className="primary-button compact-action"
>
  {isRunning ? 'Posting…' : 'Post'}
</button>
```

The variant's `:disabled` state handles the visual treatment automatically (zinc-300 border, zinc-200 background, zinc-500 text).

## Real Examples

### `OperatorGrid.tsx` — `icon-button` for CSV export
```tsx
<button
  type="button"
  className="icon-button"
  title="Export visible grid CSV"
  onClick={() => apiRef.current?.exportDataAsCsv({ fileName: `terp-agro-${view}.csv` })}
>
  <Download className="h-4 w-4" aria-hidden="true" />
  <span className="sr-only">Export visible grid CSV</span>
</button>
```

### `SalesView.tsx` — `secondary-button compact-action` in a toolbar
```tsx
<button className="secondary-button compact-action" onClick={handleDraft}>
  <PackagePlus className="h-4 w-4" aria-hidden="true" />
  Start sale shell
</button>
```

### `IntakeView.tsx` — `primary-button compact-action` for a commit action
```tsx
<button
  className="primary-button compact-action"
  disabled={busy}
  onClick={() => runCommand('verifyAllIntake', { poId }, 'Verify all intake lines')}
>
  Verify all
</button>
```

### `RefereeRelationshipDialog.tsx` — raw-Tailwind modal footer (note the deviation)
```tsx
<div className="flex justify-end gap-2 pt-2">
  <button type="button" onClick={onClose}
    className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50">
    Cancel
  </button>
  <button type="submit" disabled={isRunning}
    className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50">
    {isRunning ? 'Creating...' : 'Create Relationship'}
  </button>
</div>
```

**This is inconsistent with the design system.** The dialog should be using `secondary-button` + `primary-button` (with or without `compact-action`). This is an existing drift worth fixing rather than copying. If you build a new dialog, use the semantic classes.

## Don'ts

❌ **Don't create a `Button` component.** The design system uses semantic classes, not React abstractions. A `Button` component would have to recompute these mappings and would diverge.

❌ **Don't inline button styling from Tailwind utilities** when a semantic class exists:
```tsx
{/* bad — rebuilds primary-button by hand */}
<button className="border border-accent bg-accent px-3 text-white hover:bg-emerald-800">Post</button>

{/* good */}
<button className="primary-button">Post</button>
```

❌ **Don't use `bg-blue-600` / `bg-green-600` for action buttons** — those aren't in the palette. Use `primary-button` (which resolves to `bg-accent`).

❌ **Don't omit `aria-hidden` on decorative icons or `sr-only` text on icon-only buttons.** Audit #34 is open on this.

✅ **Do use modifiers compositionally:** `primary-button compact-action`, `icon-button` (modifiers are minimal — only `compact-action` is common).

✅ **Do gate destructive/elevated buttons** by `canWrite`:
```tsx
{canWrite ? <button className="primary-button compact-action">Post</button> : null}
```
