import { X } from 'lucide-react';
import { useUiStore } from '../store/uiStore';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { shortcutsByScope } from './registry';

/**
 * UX-C01 — keyboard shortcuts help overlay.
 *
 * Opened by '?' (Hotkeys.tsx) or the store action setShortcutsOverlayOpen
 * (palette entry). Generated entirely from the UX-T07 shortcuts registry,
 * grouped by scope, so it can never drift from the real bindings.
 *
 * Accessibility contract (matches the FormDialog template conventions):
 *  - role="dialog" aria-modal="true", aria-labelledby points at the <h2>
 *  - focus-trapped via useFocusTrap (Esc closes, focus returns on close)
 *  - backdrop click closes; inner click does not
 *  - close button has aria-label="Close"
 */
export function ShortcutsOverlay() {
  const open = useUiStore((state) => state.shortcutsOverlayOpen);
  const setOpen = useUiStore((state) => state.setShortcutsOverlayOpen);
  const dialogRef = useFocusTrap<HTMLDivElement>(open, () => setOpen(false));

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4"
      data-testid="shortcuts-overlay-backdrop"
      onClick={() => setOpen(false)}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortcuts-overlay-title"
        className="my-12 w-full max-w-2xl rounded-lg bg-white p-6 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 id="shortcuts-overlay-title" className="text-lg font-semibold text-zinc-900">
            Keyboard shortcuts
          </h2>
          <button type="button" onClick={() => setOpen(false)} className="rounded p-1 hover:bg-zinc-100" aria-label="Close">
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          {shortcutsByScope().map(({ scope, shortcuts }) => (
            <section key={scope} aria-label={scope}>
              <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500">{scope}</h3>
              <ul className="space-y-1">
                {shortcuts.map((shortcut) => (
                  <li key={shortcut.id} className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 text-sm text-zinc-700">{shortcut.description}</span>
                    <kbd className="shrink-0">{shortcut.combo}</kbd>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
        <p className="mt-5 text-xs text-zinc-500">
          Press <kbd>Esc</kbd> or click outside to close. Shortcuts skip text fields while you are typing.
        </p>
      </div>
    </div>
  );
}
