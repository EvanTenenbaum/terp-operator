import { createPortal } from 'react-dom';
import { useConfirmStore } from '../store/confirmStore';
import { useFocusTrap } from '../hooks/useFocusTrap';

/**
 * ConfirmRoot — portal-rendered confirmation dialog (TER-1614, F-11).
 *
 * Reads from the global confirmStore and renders a modal when a pending
 * confirmation exists. Mount once near the root of the component tree:
 *
 *   <ConfirmRoot />
 *
 * Features:
 * - Focus-trapped (useFocusTrap) with automatic focus on the primary action
 * - Escape → cancel (false)
 * - Backdrop click → cancel unless `persist: true`
 * - tone:'danger' → primary button rendered in danger color
 * - Accessible: role="dialog", aria-modal, aria-labelledby
 *
 * Does NOT render anything when there is no pending confirmation.
 */
export function ConfirmRoot() {
  const pending = useConfirmStore((state) => state.pending);
  const settle = useConfirmStore((state) => state.settle);

  const isOpen = Boolean(pending);

  // useFocusTrap handles:
  //   - initial focus on first focusable element in the container
  //   - Tab/Shift-Tab cycle within the container
  //   - Escape → calls onClose (which we wire to cancel)
  const containerRef = useFocusTrap<HTMLDivElement>(isOpen, () => settle(false));

  if (!pending) return null;

  const {
    title,
    body,
    tone = 'default',
    primaryLabel = 'Confirm',
    cancelLabel = 'Cancel',
    persist = false,
  } = pending;

  const handleBackdrop = () => {
    if (!persist) settle(false);
  };

  // Danger-tone primary button: use Tailwind danger token (bg-danger border-danger text-white).
  // Default: primary-button compact-action (green accent).
  const primaryBtnClass =
    tone === 'danger'
      ? 'inline-flex h-8 items-center justify-center gap-2 border border-danger bg-danger px-3 text-sm font-medium text-white transition focus:outline-none focus-visible:shadow-focus hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45'
      : 'primary-button compact-action';

  // Widen dialog when body is rich (ReactNode, not a plain string).
  const isRichBody = body !== undefined && typeof body !== 'string';
  const dialogClass = isRichBody
    ? 'w-full max-w-2xl bg-white p-6 shadow-xl'
    : 'w-full max-w-sm bg-white p-6 shadow-xl';

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50"
      onClick={handleBackdrop}
      data-testid="confirm-backdrop"
    >
      {/*
        Content card — stops propagation so clicks inside don't close.
        Confirm button is DOM-first so useFocusTrap auto-focuses it,
        then flex-row-reverse places it visually on the right.
      */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        ref={containerRef}
        className={dialogClass}
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          id="confirm-dialog-title"
          className="text-base font-semibold text-zinc-900"
        >
          {title}
        </h2>

        {body ? (
          isRichBody ? (
            <div className="mt-2">{body}</div>
          ) : (
            <p className="mt-2 text-sm text-zinc-600">{body as string}</p>
          )
        ) : null}

        {/* Flex-row-reverse: Confirm (DOM first) appears right, Cancel appears left */}
        <div className="mt-4 flex flex-row-reverse gap-2">
          <button
            type="button"
            className={primaryBtnClass}
            onClick={() => settle(true)}
            data-testid="confirm-primary"
          >
            {primaryLabel}
          </button>
          <button
            type="button"
            className="secondary-button compact-action"
            onClick={() => settle(false)}
            data-testid="confirm-cancel"
          >
            {cancelLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
