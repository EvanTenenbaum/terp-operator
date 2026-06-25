import { useState, useCallback, useRef, useEffect } from 'react';
import { ChevronDown, Check, Loader2, AlertTriangle, XCircle } from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────

export interface ChipEditField {
  /** Field key (matches schema and row property). */
  field: string;
  /** Human-readable label. */
  headerName: string;
  /** Available option values. */
  options: { value: string; label: string }[];
  /** The value shared by all selected rows, if any. */
  currentValue?: string | null;
}

export interface BulkChipEditResult {
  succeeded: number;
  failed: number;
  error?: string;
}

export interface BulkChipEditProps {
  /** Number of selected rows. */
  selectedCount: number;
  /** Chip fields available for bulk editing. */
  fields: ChipEditField[];
  /** Entity label for the reason stamp. */
  entityLabel?: string;
  /** Commit the bulk change. Returns per-field result. */
  onCommit: (field: string, value: string) => Promise<BulkChipEditResult>;
}

// ── Execution state ────────────────────────────────────────────────────────

type ChipExecState =
  | { phase: 'idle'; field?: string }
  | { phase: 'executing'; field: string }
  | { phase: 'success'; field: string }
  | { phase: 'partial'; field: string; succeeded: number; failed: number }
  | { phase: 'error'; field: string; message: string };

// ── Constants ──────────────────────────────────────────────────────────────

const OPTION_HEIGHT = 30;
const MAX_DROPDOWN_HEIGHT = 240;

// ── Component ──────────────────────────────────────────────────────────────

export function BulkChipEdit({
  selectedCount,
  fields,
  entityLabel = 'row',
  onCommit,
}: BulkChipEditProps) {
  if (fields.length === 0) return null;

  return (
    <div className="flex items-center gap-2 px-4 py-2 border-t border-zinc-100 bg-zinc-50/50">
      <span className="text-xs font-medium text-zinc-500 flex-shrink-0">
        Apply to {selectedCount} {entityLabel}:
      </span>
      <div className="flex items-center gap-2">
        {fields.map((f) => (
          <ChipEditDropdown
            key={f.field}
            field={f}
            selectedCount={selectedCount}
            entityLabel={entityLabel}
            onCommit={onCommit}
          />
        ))}
      </div>
    </div>
  );
}

// ── Individual chip dropdown ───────────────────────────────────────────────

function ChipEditDropdown({
  field,
  selectedCount,
  entityLabel,
  onCommit,
}: {
  field: ChipEditField;
  selectedCount: number;
  entityLabel: string;
  onCommit: (field: string, value: string) => Promise<BulkChipEditResult>;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [execState, setExecState] = useState<ChipExecState>({ phase: 'idle' });
  const [highlightIndex, setHighlightIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const listboxRef = useRef<HTMLUListElement>(null);

  // ── Close on click outside ────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler, true);
    return () => document.removeEventListener('mousedown', handler, true);
  }, [isOpen]);

  // ── Reset highlight on open ──────────────────────────────────────────
  useEffect(() => {
    setHighlightIndex(0);
  }, [isOpen]);

  // ── Scroll highlighted option into view ──────────────────────────────
  useEffect(() => {
    if (!isOpen || !listboxRef.current) return;
    const children = listboxRef.current.children;
    if (children[highlightIndex]) {
      (children[highlightIndex] as HTMLElement).scrollIntoView({ block: 'nearest' });
    }
  }, [highlightIndex, isOpen]);

  // ── Commit handler ───────────────────────────────────────────────────
  const handleCommit = useCallback(
    async (value: string) => {
      setIsOpen(false);
      setExecState({ phase: 'executing', field: field.field });

      try {
        const result = await onCommit(field.field, value);

        if (result.failed === 0 && result.succeeded > 0) {
          setExecState({ phase: 'success', field: field.field });
          setTimeout(() => setExecState({ phase: 'idle' }), 1500);
        } else if (result.succeeded === 0 && result.failed > 0) {
          setExecState({
            phase: 'error',
            field: field.field,
            message: result.error ?? 'Bulk update failed',
          });
        } else {
          setExecState({
            phase: 'partial',
            field: field.field,
            succeeded: result.succeeded,
            failed: result.failed,
          });
        }
      } catch (err) {
        setExecState({
          phase: 'error',
          field: field.field,
          message: err instanceof Error ? err.message : 'An unexpected error occurred',
        });
      }
    },
    [field.field, onCommit],
  );

  // ── Keyboard handler ─────────────────────────────────────────────────
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!isOpen) return;
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setHighlightIndex((prev) => Math.min(prev + 1, field.options.length - 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setHighlightIndex((prev) => Math.max(prev - 1, 0));
          break;
        case 'Enter':
          e.preventDefault();
          if (field.options[highlightIndex]) {
            handleCommit(field.options[highlightIndex].value);
          }
          break;
        case 'Escape':
          e.preventDefault();
          setIsOpen(false);
          break;
      }
    },
    [isOpen, highlightIndex, field.options, handleCommit],
  );

  // ── Find display label for current value ─────────────────────────────
  const currentLabel = field.currentValue
    ? (field.options.find((o) => o.value === field.currentValue)?.label ?? field.currentValue)
    : null;

  const isIdle = execState.phase === 'idle' || (execState.phase === 'success' && execState.field === field.field);
  const isExecuting = execState.phase === 'executing' && execState.field === field.field;
  const isError = execState.phase === 'error' && execState.field === field.field;
  const isPartial = execState.phase === 'partial' && execState.field === field.field;

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger chip */}
      <button
        type="button"
        className={[
          'inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium',
          'border border-zinc-300 bg-white hover:bg-zinc-50',
          'focus:outline-none focus-visible:shadow-focus',
          'transition-colors duration-100',
          isExecuting ? 'opacity-60 cursor-wait' : 'cursor-pointer',
        ].join(' ')}
        onClick={() => {
          if (!isExecuting) setIsOpen((prev) => !prev);
        }}
        onKeyDown={handleKeyDown}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={`Edit ${field.headerName}`}
        disabled={isExecuting}
      >
        <span className="text-zinc-500">{field.headerName}:</span>
        <span className="text-zinc-800 max-w-[120px] truncate">
          {currentLabel ?? '(none)'}
        </span>
        {isExecuting ? (
          <Loader2 className="h-3 w-3 animate-spin text-zinc-400" />
        ) : isError || isPartial ? (
          <AlertTriangle className="h-3 w-3 text-amber-500" />
        ) : (
          <ChevronDown className="h-3 w-3 text-zinc-400" />
        )}
      </button>

      {/* Dropdown listbox */}
      {isOpen && (
        <ul
          ref={listboxRef}
          role="listbox"
          className="absolute bottom-full left-0 z-50 min-w-[180px] mb-1 overflow-y-auto bg-white border border-zinc-300 rounded-lg shadow-lg py-1 list-none"
          style={{ maxHeight: MAX_DROPDOWN_HEIGHT }}
        >
          {field.options.map((option, index) => {
            const isHighlighted = index === highlightIndex;
            const isSelected = option.value === field.currentValue;
            return (
              <li
                key={option.value}
                role="option"
                aria-selected={isSelected}
                onClick={() => handleCommit(option.value)}
                onMouseEnter={() => setHighlightIndex(index)}
                className={[
                  'flex items-center justify-between px-3 text-xs whitespace-nowrap overflow-hidden text-ellipsis cursor-pointer',
                  isHighlighted ? 'bg-zinc-100 text-zinc-900' : 'text-zinc-700',
                  isSelected ? 'font-medium' : '',
                ].join(' ')}
                style={{ height: OPTION_HEIGHT }}
              >
                <span className="overflow-hidden text-ellipsis">
                  {option.label}
                </span>
                {isSelected && (
                  <Check className="h-3 w-3 text-blue-500 shrink-0 ml-2" />
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* Success flash */}
      {execState.phase === 'success' && execState.field === field.field && (
        <div className="absolute -left-0.5 top-1/2 -translate-y-1/2 -translate-x-full mr-1 flex items-center gap-1 text-[11px] text-emerald-600 whitespace-nowrap">
          <Check className="h-3 w-3" />
          {selectedCount} updated
        </div>
      )}

      {/* Error inline */}
      {isError && (
        <div className="absolute bottom-full left-0 z-50 mb-1 flex items-center gap-1 px-2 py-1 bg-red-50 border border-red-200 rounded text-[11px] text-red-700 whitespace-nowrap">
          <XCircle className="h-3 w-3 flex-shrink-0" />
          <span className="truncate max-w-[200px]">{execState.message}</span>
          <button
            type="button"
            className="ml-1 text-red-500 hover:text-red-700 underline"
            onClick={() => setExecState({ phase: 'idle' })}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Partial inline */}
      {isPartial && (
        <div className="absolute bottom-full left-0 z-50 mb-1 flex items-center gap-1 px-2 py-1 bg-amber-50 border border-amber-200 rounded text-[11px] text-amber-700 whitespace-nowrap">
          <AlertTriangle className="h-3 w-3 flex-shrink-0" />
          <span>{execState.succeeded} ok, {execState.failed} failed</span>
          <button
            type="button"
            className="ml-1 text-amber-600 hover:text-amber-800 underline"
            onClick={() => setExecState({ phase: 'idle' })}
          >
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}
