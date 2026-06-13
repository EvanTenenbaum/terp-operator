import { X } from 'lucide-react';
import { useId, type ReactNode } from 'react';
import { useFocusTrap } from '../../hooks/useFocusTrap';

/**
 * Template: form dialog scaffold.
 *
 * Every form dialog in the app (RecordPrepaymentDialog, RefereeDialog,
 * ContactCreateModal, ...) hand-rolled the same chrome: fixed overlay,
 * focus trap, ESC/overlay-click close, aria-modal + aria-labelledby heading,
 * close icon button, error banner, Cancel/Submit footer with pending state.
 * FormDialog owns that chrome once; dialogs supply only their fields.
 *
 * Accessibility contract (locked by existing *.a11y tests):
 *  - role="dialog" aria-modal="true"
 *  - aria-labelledby points at an <h2> heading
 *  - close button has aria-label="Close"
 *  - error banner uses role="alert" with the .field-error class
 */
export interface FormDialogProps {
  title: string;
  /** Override the auto-generated heading id when tests pin a specific id. */
  titleId?: string;
  onClose: () => void;
  onSubmit: (event: React.FormEvent) => void | Promise<void>;
  submitLabel: string;
  /** Label shown while pending; defaults to submitLabel. */
  pendingLabel?: string;
  pending?: boolean;
  submitDisabled?: boolean;
  error?: string | null;
  /** Optional lead-in copy under the title. */
  description?: ReactNode;
  /** Tailwind max-width class. Default max-w-lg. */
  maxWidthClass?: string;
  /**
   * UX-Q03: submit button variant for destructive actions.
   * 'danger' → red (irreversible destructive, e.g. deactivate/void).
   * 'warning' → amber (cautionary, e.g. force-override).
   * Omit for standard primary (green).
   */
  tone?: 'danger' | 'warning';
  children: ReactNode;
}

export function FormDialog({
  title,
  titleId,
  onClose,
  onSubmit,
  submitLabel,
  pendingLabel,
  pending,
  submitDisabled,
  error,
  description,
  maxWidthClass = 'max-w-lg',
  tone,
  children
}: FormDialogProps) {
  const autoId = useId();
  const headingId = titleId ?? `${autoId}-title`;
  const dialogRef = useFocusTrap<HTMLDivElement>(true, onClose);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        className={`w-full ${maxWidthClass} rounded-lg bg-white p-6 shadow-xl`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 id={headingId} className="text-lg font-semibold text-zinc-900">
            {title}
          </h2>
          <button type="button" onClick={onClose} className="rounded p-1 hover:bg-zinc-100" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        {description ? <p className="mb-4 text-sm text-zinc-600">{description}</p> : null}
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          {children}
          {error ? (
            <div className="field-error" role="alert">
              {error}
            </div>
          ) : null}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={pending || submitDisabled}
              className={tone === 'danger' ? 'btn-danger' : tone === 'warning' ? 'btn-warning' : 'btn-primary'}
            >
              {pending ? pendingLabel ?? submitLabel : submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/** Labeled field wrapper matching the existing dialog field markup. */
export function FormField({
  id,
  label,
  children
}: {
  id: string;
  label: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-zinc-700" htmlFor={id}>
        {label}
      </label>
      {children}
    </div>
  );
}
