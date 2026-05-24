interface MobileEmptyStateProps {
  icon?: string;
  headline: string;
  body?: string;
  ctaLabel?: string;
  onCta?: () => void;
}

export function MobileEmptyState({ icon = '◻', headline, body, ctaLabel, onCta }: MobileEmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <span className="mb-3 text-4xl" aria-hidden="true">{icon}</span>
      <p className="text-base font-semibold" style={{ color: 'var(--m-ink)' }}>{headline}</p>
      {body && <p className="mt-1 text-sm" style={{ color: 'var(--m-muted)' }}>{body}</p>}
      {ctaLabel && onCta && (
        <button
          type="button"
          onClick={onCta}
          className="mt-4 m-btn-secondary"
          style={{ width: 'auto', paddingLeft: 20, paddingRight: 20 }}
        >
          {ctaLabel}
        </button>
      )}
    </div>
  );
}
