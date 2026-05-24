import type { CSSProperties } from 'react';

interface MobileFilterChipsProps {
  options: string[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

export function MobileFilterChips({ options, value, onChange, className }: MobileFilterChipsProps) {
  return (
    <div
      className={`flex gap-2 overflow-x-auto py-2 ${className ?? ''}`}
      style={{ scrollbarWidth: 'none' } as CSSProperties}
    >
      {options.map((option) => {
        const isActive = option === value;
        return (
          <button
            key={option}
            type="button"
            aria-pressed={isActive}
            onClick={() => { if (!isActive) onChange(option); }}
            className={`m-chip shrink-0 ${isActive ? 'm-chip-active' : ''}`}
          >
            {option}
          </button>
        );
      })}
    </div>
  );
}
