interface MobileSearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export function MobileSearchInput({ value, onChange, placeholder = 'Search…', className }: MobileSearchInputProps) {
  return (
    <div className={`relative flex items-center ${className ?? ''}`}>
      {/* Magnifier icon */}
      <svg
        className="pointer-events-none absolute left-3 h-4 w-4 shrink-0 text-zinc-400"
        aria-hidden="true"
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="8.5" cy="8.5" r="5.25" />
        <line x1="12.5" y1="12.5" x2="16.5" y2="16.5" />
      </svg>
      <input aria-label="Value"
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-11 w-full rounded-xl py-0 pl-9 pr-9 text-sm"
        style={{ background: 'var(--m-search-bg)', border: 'none', outline: 'none', color: 'var(--m-ink)' }}
      />
      {value && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => onChange('')}
          className="absolute right-3 flex h-5 w-5 items-center justify-center rounded-full bg-zinc-300 text-zinc-600"
        >
          <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="h-3 w-3" aria-hidden="true">
            <line x1="2" y1="2" x2="10" y2="10" />
            <line x1="10" y1="2" x2="2" y2="10" />
          </svg>
        </button>
      )}
    </div>
  );
}
