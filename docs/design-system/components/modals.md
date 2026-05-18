# Modal & Dialog Patterns

> The codebase has two overlay UI shapes: **dialogs** (centered modal forms — `RefereeRelationshipDialog`) and **the command palette** (`CommandPalette`, top-center spotlight). There is **no `Modal` component**; dialogs are inline JSX with a backdrop + content `<div>`. Focus-trap support is recent (commit `b786f21`, audit issue #30) and is currently only wired into `CommandPalette` via `useFocusTrap`.

## Dialog (centered modal form)

Reference: `RefereeRelationshipDialog.tsx`. The basic shape:

```tsx
<div
  className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
  onClick={onClose}                               // click-outside closes
>
  <div
    className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl"
    onClick={(e) => e.stopPropagation()}          // clicks inside don't close
  >
    <div className="mb-4 flex items-center justify-between">
      <h2 className="text-lg font-semibold text-zinc-900">Add Referee Relationship</h2>
      <button onClick={onClose} className="rounded p-1 hover:bg-zinc-100" aria-label="Close">
        <X className="h-5 w-5" />
      </button>
    </div>

    {/* …content / form… */}
  </div>
</div>
```

Anatomy:
- **Backdrop:** `fixed inset-0 z-50 flex items-center justify-center bg-black/50`. The 50% black scrim + flex-center positions the dialog.
- **Content card:** `w-full max-w-lg rounded-lg bg-white p-6 shadow-xl`. Adjust `max-w-*` for content density (`max-w-sm` for confirmation, `max-w-lg` for forms, `max-w-2xl` for richer dialogs).
- **Header:** title + close button (`<X />` icon from lucide). `aria-label="Close"` is non-negotiable.
- **Body:** form fields (`<form className="space-y-4">`) or content.
- **Footer:** action buttons aligned right with `flex justify-end gap-2 pt-2`. Cancel = `secondary-button compact-action`, primary action = `primary-button compact-action`.

## Focus trap (do this for new dialogs)

`CommandPalette` uses `useFocusTrap` (`src/client/hooks/useFocusTrap.ts`). Dialogs should adopt this too — audit issue #30 was specific to `CommandPalette` but the principle applies. Until other dialogs migrate, focus can escape an open dialog with Tab.

When you add a new dialog, wire `useFocusTrap` on the content `<div>`. The hook signature lives in `useFocusTrap.ts` — read it for the current API.

## Click-outside-to-close

The pattern is the backdrop's `onClick={onClose}` + the content's `onClick={(e) => e.stopPropagation()}`. Simple, no extra hook.

If your dialog has a destructive or in-progress action, you may want to disable click-outside while `isRunning`:

```tsx
<div
  className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
  onClick={isRunning ? undefined : onClose}
>
```

## Closing via Escape

There is no shared "close on Escape" hook today. Add one if you build the third dialog that needs it — until then it's per-dialog (or absent; `RefereeRelationshipDialog` doesn't handle Escape, which is an a11y gap).

## Command Palette (special case)

The Command Palette is not a "modal form" — it's a Cmd+K spotlight overlay with a search input, results list, and keyboard navigation. Its shape is different:

- Positioned top-center, not modal-center.
- Has focus trap (`useFocusTrap`).
- Driven by `useUiStore.setCommandPaletteOpen` (toggled via Cmd+K in `Hotkeys.tsx`).
- Renders search input + filtered command list.

Don't copy its structure for forms. Use the `RefereeRelationshipDialog` shape instead.

## Confirmation dialogs

There isn't a confirmation-dialog component today. Patterns observed in the codebase:
- Inline confirmation buttons (Undo within the row toolbar).
- Browser `confirm()` (used sparingly, not great UX — don't copy if you can avoid it).
- Status changes that themselves serve as confirmation (Mark Ready, Post).

If you need a real confirmation dialog, follow the `RefereeRelationshipDialog` shape with a `max-w-sm` content card and only two buttons (Cancel + Confirm). Don't reach for a third-party dialog library.

## Toasts (not modals, but related)

For ephemeral success/error feedback, **don't open a dialog** — use `useUiStore.pushToast` (which `useCommandRunner` already calls on success/error). `ToastCenter` renders them.

```ts
const pushToast = useUiStore((state) => state.pushToast);
pushToast('Inventory updated.', 'success');
```

Tones: `'success' | 'error' | 'info'`.

## Drawers vs Dialogs

If you're showing context for a selected row, use the **Context Drawer** (`useUiStore.toggleDrawer`), not a dialog. Drawers persist across selection changes; dialogs interrupt.

If the action requires the operator to fill in a multi-field form unrelated to a selected row (e.g., add a referee relationship), a dialog is correct.

## Drift to be aware of

- **No focus trap on `RefereeRelationshipDialog`.** Audit-trail-style fix coming; until then, Tab can escape.
- **`bg-primary` in the dialog footer button** is a CSS custom property; the design-token equivalent is `bg-accent`. Use semantic button classes (`primary-button`) instead.
- **`alert()`-based validation** inside the dialog (see `components/forms.md`).
- **Different border-radius** between the dialog (`rounded-lg`, `rounded-md` on buttons) and the rest of the app (mostly squared off via `border` only, no `rounded-*`). The dialog stands out — by accident, not by design.

## Don'ts

❌ Don't introduce a `<Modal>` component. The inline JSX shape is intentional and the surface area is too small to justify the abstraction.

❌ Don't use `window.confirm()` for new code (the codebase has a few; don't grow the count).

❌ Don't position dialogs anywhere except center-screen. The Command Palette's top-center placement is specific to it.

❌ Don't use `z-50` for non-overlay UI. Reserve high z-indexes for overlays.

✅ Do close on backdrop click + add a visible close button.

✅ Do gate the primary action by `isRunning` from `useCommandRunner`.

✅ Do wire `useFocusTrap` when you create a new dialog.

✅ Do prefer toasts over dialogs for transient success/error feedback.
