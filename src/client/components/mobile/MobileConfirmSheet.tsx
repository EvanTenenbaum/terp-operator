interface MobileConfirmSheetProps {
  open: boolean;
  summary: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function MobileConfirmSheet({
  open,
  summary,
  confirmLabel = 'Confirm',
  onConfirm,
  onCancel,
}: MobileConfirmSheetProps) {
  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        data-testid="confirm-sheet-backdrop"
        className="fixed inset-0 z-40"
        style={{ background: 'rgba(24,33,31,0.4)' }}
        onClick={onCancel}
        aria-hidden="true"
      />
      {/* Sheet */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Confirm action"
        className="fixed bottom-0 left-0 right-0 z-50 rounded-t-3xl bg-white px-4 pb-8 pt-3 shadow-2xl"
        style={{ animation: 'm-fade-slide-in 180ms ease-out' }}
      >
        {/* Drag handle */}
        <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-zinc-200" aria-hidden="true" />
        <h2 className="mb-2 text-base font-semibold" style={{ color: 'var(--m-ink)' }}>
          Review before confirming
        </h2>
        <p className="mb-6 text-sm" style={{ color: 'var(--m-muted)' }}>{summary}</p>
        <button type="button" onClick={onConfirm} className="m-btn-primary mb-3">
          {confirmLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="flex h-11 w-full items-center justify-center text-sm font-medium"
          style={{ color: 'var(--m-muted)' }}
        >
          Cancel
        </button>
      </div>
    </>
  );
}
