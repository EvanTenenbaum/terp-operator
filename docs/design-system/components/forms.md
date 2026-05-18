# Form Patterns

> Forms in TERP Operator fall into two shapes: **inline forms inside drawers and toolbars** (use the `field-inline` semantic class) and **standalone dialog forms** (currently use raw Tailwind utility classes — see Drift section). Both use native `<input>`, `<select>`, `<textarea>` — no custom Input/Select components.

## Inline form inside a panel (the common case)

Used heavily in `MatchmakingView.tsx`, `OperationsViews.tsx`, `IntakeView.tsx`. The `field-inline` class makes label+control sit on one row.

```tsx
<label className="field-inline">
  Vendor
  <input
    className="input compact"
    value={vendor}
    onChange={(event) => setVendor(event.target.value)}
    placeholder="Vendor name"
  />
</label>

<label className="field-inline grow">
  Need code
  <input className="input" value={needCode} onChange={(e) => setNeedCode(e.target.value)} />
</label>
```

CSS:
```css
.field-inline {
  @apply flex items-center gap-2 text-sm font-medium text-ink;
}
.field-inline .input, .field-inline .select { @apply mt-0; }
```

Notes:
- The `<label>` wraps the control so clicking the label focuses it without needing `htmlFor`.
- Add `grow` (a single-character utility from Tailwind) to a `.field-inline` to make it stretch in a flex toolbar.
- `.input` and `.select` are semantic classes defined in `src/client/styles.css` — use them for consistency with the rest of the app.

## Standalone form inside a dialog

Pattern from `RefereeRelationshipDialog.tsx`. Uses raw Tailwind utility classes today; this is **existing drift** (see Drift section below) — replicate it if you must, but the design-system direction is to use semantic classes.

```tsx
<form onSubmit={handleSubmit} className="space-y-4">
  <div>
    <label className="mb-1 block text-sm font-medium text-zinc-700">
      Entity Type
    </label>
    <select
      value={entityType}
      onChange={(e) => setEntityType(e.target.value as 'customer' | 'vendor')}
      className="w-full rounded border border-zinc-300 px-3 py-2"
    >
      <option value="customer">Customer</option>
      <option value="vendor">Vendor</option>
    </select>
  </div>

  {/* …more fields… */}

  <div className="flex justify-end gap-2 pt-2">
    <button type="button" className="secondary-button compact-action" onClick={onClose}>Cancel</button>
    <button type="submit" disabled={isRunning} className="primary-button compact-action">
      {isRunning ? 'Creating…' : 'Create'}
    </button>
  </div>
</form>
```

Notes:
- `space-y-4` for vertical spacing between field rows.
- `mb-1 block` on labels separates them from the control below.
- `w-full rounded border border-zinc-300 px-3 py-2` is the current standalone-form input recipe.

## Validation

The codebase mixes two validation strategies:

### Native HTML validation
```tsx
<input
  type="number"
  step="0.1"
  min="0"
  max="100"
  required
/>
```
Cheap, works without extra code, doesn't surface friendly errors.

### Imperative `alert()` (the existing drift)
```tsx
const pct = parseFloat(feePercentage);
if (!pct || pct <= 0 || pct > 100) {
  alert('Percentage must be between 0 and 100');
  return;
}
```
`RefereeRelationshipDialog.tsx` uses this. **Don't copy it for new code** — `alert()` blocks the event loop and the user. Prefer:

1. Native HTML constraints + `<form>` submit will skip on invalid.
2. Inline error text under the field (e.g., `<p className="mt-1 text-xs text-danger">…</p>`).
3. Disable submit when invalid.
4. Use Zod schemas from `src/shared/schemas.ts` if the validation logic is also enforced server-side — keeps client and server in lockstep.

### Server-side validation is the source of truth
The command handler validates the payload with Zod. The client validation is a UX aid. Don't trust client-only checks for money/inventory.

## Submitting a form via a command

```tsx
const { runCommand, isRunning } = useCommandRunner();

async function handleSubmit(e: React.FormEvent) {
  e.preventDefault();
  const result = await runCommand('addRefereeRelationship', payload);
  if (result.ok) {
    onClose();
  }
}
```

`useCommandRunner` already pushes a toast on success/error and invalidates queries — your `handleSubmit` doesn't need to do that.

## Controlled inputs

Always controlled. Use `useState` for form-local state — don't put form drafts in `useUiStore` or TanStack Query cache.

```tsx
const [entityType, setEntityType] = useState<'customer' | 'vendor'>('customer');
const [entityId, setEntityId] = useState('');
const [notes, setNotes] = useState('');
```

When a form is large enough to be tedious as discrete `useState` calls, use a single state object + a setter helper — but only if you're crossing ~6 fields. Don't reach for `react-hook-form` without a `decisions-log.md` entry; it's not in `dependencies`.

## Real examples

- **Inline form in a control band:** see `MatchmakingView.tsx` (Need code / Supply code form).
- **Dialog form:** `RefereeRelationshipDialog.tsx`.
- **Grid-driven inline editing:** `OperatorGrid` with `editable: true` columns + `onCellCommit` calling `runCommand`. See `components/grids.md`.
- **Search input pattern (special case):** `OperatorGrid`'s `<label className="flex h-8 items-center gap-2 border border-line bg-white px-2 text-sm">` — inline search with a leading `<Search />` icon. Currently a one-off; if you find yourself replicating it, propose a `search-input` semantic class.

## Drift to be aware of

- **`field-inline` vs raw Tailwind labels.** Most views use `field-inline`. Dialogs use raw Tailwind. The intended direction is `field-inline` everywhere; dialogs haven't been migrated.
- **`alert()` for validation.** Used in `RefereeRelationshipDialog`. Don't copy.
- **`text-zinc-700` vs `text-ink` for labels.** Mixed. `text-ink` is the design-token; `text-zinc-700` predates it.
- **`bg-primary`** is referenced in `RefereeRelationshipDialog.tsx` — that's a CSS custom property, not a Tailwind theme color. `bg-accent` is the Tailwind-theme equivalent.

## Don'ts

❌ Don't introduce a `<Input>` / `<Select>` React component. Native elements with `.input` / `.select` semantic classes is the convention.

❌ Don't block submit with `alert()`. Use inline error text + native HTML validation.

❌ Don't put form-draft state in `useUiStore` unless the draft needs to survive view switches (rare). Local `useState` is right.

❌ Don't call `trpc.<router>.<endpoint>.useMutation` directly to submit a state-changing form. Use `useCommandRunner` so the journal, idempotency key, and toast all flow correctly.

✅ Do use `field-inline` for forms inside views and drawers.

✅ Do mirror Zod schemas from `src/shared/schemas.ts` when client validation must match server-side rules.

✅ Do disable submit during `isRunning` from `useCommandRunner`.
