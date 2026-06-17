import {
  useState,
  useEffect,
  useCallback,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { CheckCircle, XCircle, AlertTriangle, Loader2, X } from 'lucide-react';

// ============================================================================
// TYPES
// ============================================================================

export interface BulkActionResult {
  succeeded: number;
  failed: number;
  error?: string;
}

export interface BulkAction {
  /** Command name (e.g. 'confirmSalesOrder') */
  key: string;
  /** Display label (e.g. 'Confirm') */
  label: string;
  /** Primary action — shown prominently, leftmost */
  primary?: boolean;
  /** Button variant */
  variant?: 'primary' | 'secondary' | 'danger' | 'warning';
  /** Disabled state */
  disabled?: boolean;
  /** Tooltip explaining why disabled */
  disabledReason?: string;
  /** Bespoke inline input (e.g. "Route to [input]") */
  requiresInput?: {
    field: string;
    placeholder: string;
    type?: 'text' | 'number';
  };
  /** Execute the action. Returns result for state display. */
  onAction: (inputValue?: string) => Promise<BulkActionResult>;
}

export interface BulkActionBarProps {
  /** Selection count */
  selectedCount: number;
  /** Formatted total (e.g. "$24,500.00") */
  selectedTotal?: string;
  /** Entity label for pluralization (e.g. "order", "PO") */
  entityLabel?: string;
  /** Available bulk actions */
  actions: BulkAction[];
  /** Clears selection, hides bar */
  onClear: () => void;
}

// ============================================================================
// EXECUTION STATE
// ============================================================================

type ExecutionState =
  | { phase: 'idle' }
  | { phase: 'executing'; actionKey: string }
  | { phase: 'success' }
  | { phase: 'partial'; succeeded: number; failed: number; actionKey: string }
  | { phase: 'error'; message: string; actionKey: string };

// ============================================================================
// HELPERS
// ============================================================================

/** Pluralize entity label ("order" → "orders", "PO" → "POs") */
function pluralize(label: string, count: number): string {
  if (count === 1) return label;
  // Simple English pluralization
  if (label.endsWith('s') || label.endsWith('x') || label.endsWith('z') ||
      label.endsWith('ch') || label.endsWith('sh')) {
    return `${label}es`;
  }
  if (label.endsWith('y') && !['a', 'e', 'i', 'o', 'u'].includes(label[label.length - 2] ?? '')) {
    return `${label.slice(0, -1)}ies`;
  }
  return `${label}s`;
}

/** Variant → Tailwind/semantic button classes */
const BUTTON_CLASSES: Record<string, string> = {
  primary: 'btn-primary',
  secondary: 'btn-secondary',
  danger: 'btn-danger',
  warning: 'btn-warning',
};

// ============================================================================
// COMPONENT
// ============================================================================

export function BulkActionBar({
  selectedCount,
  selectedTotal,
  entityLabel = 'row',
  actions,
  onClear,
}: BulkActionBarProps) {
  // ── Mount / animation state ───────────────────────────────────────────────
  // We always render a container; visibility is controlled via CSS transform
  // + opacity. When selectedCount hits 0, we play the exit animation then
  // collapse the container via a ref so it doesn't block pointer events.
  const [exitAnimating, setExitAnimating] = useState(false);
  const prevCountRef = useRef(selectedCount);

  useEffect(() => {
    if (prevCountRef.current > 0 && selectedCount === 0) {
      setExitAnimating(true);
      const timer = setTimeout(() => setExitAnimating(false), 200);
      return () => clearTimeout(timer);
    }
    if (selectedCount > 0 && prevCountRef.current === 0) {
      setExitAnimating(false);
    }
    prevCountRef.current = selectedCount;
  }, [selectedCount]);

  const isVisible = selectedCount > 0 || exitAnimating;

  // ── Execution state ──────────────────────────────────────────────────────
  const [execState, setExecState] = useState<ExecutionState>({ phase: 'idle' });
  // Track bespoke input values per action
  const [inputValues, setInputValues] = useState<Record<string, string>>({});
  // Focus ref for the first action button (primary or first)
  const primaryButtonRef = useRef<HTMLButtonElement>(null);

  // ── Focus primary button when bar becomes visible ────────────────────────
  useEffect(() => {
    if (selectedCount > 0 && prevCountRef.current === 0) {
      requestAnimationFrame(() => primaryButtonRef.current?.focus());
    }
    // Reset execution state when selection changes
    if (selectedCount !== prevCountRef.current) {
      setExecState({ phase: 'idle' });
      setInputValues({});
    }
  }, [selectedCount]);

  // ── Global Escape key handler ─────────────────────────────────────────────
  const onClearRef = useRef(onClear);
  onClearRef.current = onClear;

  useEffect(() => {
    if (!isVisible) return;

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClearRef.current();
      }
    };

    document.addEventListener('keydown', handleGlobalKeyDown);
    return () => document.removeEventListener('keydown', handleGlobalKeyDown);
  }, [isVisible]);

  // ── Handle local keyboard events on the bar ───────────────────────────────
  const handleKeyDown = useCallback(
    (e: ReactKeyboardEvent, action: BulkAction) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (execState.phase === 'idle' && !action.disabled) {
          executeAction(action);
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [execState.phase, actions],
  );

  // ── Execute action ──────────────────────────────────────────────────────
  const executeAction = useCallback(
    async (action: BulkAction) => {
      setExecState({ phase: 'executing', actionKey: action.key });

      try {
        const inputValue = action.requiresInput
          ? inputValues[action.key] ?? ''
          : undefined;
        const result = await action.onAction(inputValue);

        if (result.failed === 0 && result.succeeded > 0) {
          // All success
          setExecState({ phase: 'success' });
          setTimeout(() => {
            onClear();
          }, 700);
        } else if (result.succeeded === 0 && result.failed > 0) {
          // All failure
          setExecState({
            phase: 'error',
            message: result.error ?? 'Command failed',
            actionKey: action.key,
          });
        } else {
          // Partial success
          setExecState({
            phase: 'partial',
            succeeded: result.succeeded,
            failed: result.failed,
            actionKey: action.key,
          });
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'An unexpected error occurred';
        setExecState({
          phase: 'error',
          message,
          actionKey: action.key,
        });
      }
    },
    [inputValues, onClear],
  );

  // ── Auto-hide after success green flash ──────────────────────────────────
  useEffect(() => {
    if (execState.phase === 'success') {
      const timer = setTimeout(() => onClear(), 700);
      return () => clearTimeout(timer);
    }
  }, [execState.phase, onClear]);

  // ── Retry the failed action ─────────────────────────────────────────────
  const handleRetry = useCallback(() => {
    if (execState.phase !== 'error' && execState.phase !== 'partial') return;
    const actionKey = execState.actionKey;
    const action = actions.find((a) => a.key === actionKey);
    if (action) executeAction(action);
  }, [execState, actions, executeAction]);

  // ── Dismiss error state ──────────────────────────────────────────────────
  const handleDismiss = useCallback(() => {
    setExecState({ phase: 'idle' });
  }, []);

  // ── Dismiss and clear ────────────────────────────────────────────────────
  const handleDismissAndClear = useCallback(() => {
    onClear();
  }, [onClear]);

  // ── View failures (re-trigger onAction? or just keep selection visible) ──
  // The spec says "[View failures]" — keep selection visible, dismiss bar state.
  const handleViewFailures = useCallback(() => {
    // Keep selection active, just dismiss the execution state
    setExecState({ phase: 'idle' });
  }, []);

  // ── Render ──────────────────────────────────────────────────────────────

  // Hidden: nothing at all
  if (!isVisible) return null;

  const isExecuting = execState.phase === 'executing';
  const isError = execState.phase === 'error';
  const isPartial = execState.phase === 'partial';
  const isSuccess = execState.phase === 'success';
  const isIdle = execState.phase === 'idle';

  // Build entity label for the summary line
  const entityText = pluralize(entityLabel, selectedCount);

  // Build the summary line
  const summaryLine = selectedTotal
    ? `${selectedCount} ${entityText} selected \u00B7 ${selectedTotal}`
    : `${selectedCount} ${entityText} selected`;

  // Animation classes
  const animationClass = isVisible && !exitAnimating
    ? 'translate-y-0 opacity-100'
    : 'translate-y-full opacity-0';

  return (
    <div
      role="region"
      aria-label="Bulk actions"
      aria-live="polite"
      className={`sticky bottom-0 z-30 border-t border-line bg-white shadow-lg transition-transform duration-200 ease-out transition-opacity duration-200 ${animationClass}`}
    >
      {/* ── Summary row ───────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 px-4 py-2.5">
        {/* Left: summary text + clear button */}
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            className="flex-shrink-0 flex h-6 w-6 items-center justify-center rounded text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors focus:outline-none focus-visible:shadow-focus"
            onClick={onClear}
            aria-label="Clear selection"
          >
            <X className="h-4 w-4" />
          </button>
          <span className="text-sm font-medium text-zinc-800 truncate">
            {summaryLine}
          </span>
        </div>

        {/* Right: action buttons */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {actions.map((action) => {
            const isThisExecuting =
              isExecuting && execState.actionKey === action.key;
            const variant = action.variant ?? (action.primary ? 'primary' : 'secondary');

            // Determine if this button should be disabled
            const buttonDisabled =
              action.disabled ||
              (isExecuting && !isThisExecuting) ||
              isSuccess;

            return (
              <button
                key={action.key}
                ref={action.primary || actions.length === 1 ? primaryButtonRef : undefined}
                type="button"
                title={action.disabledReason}
                disabled={buttonDisabled}
                className={[
                  'inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium',
                  'transition-colors duration-150',
                  'focus:outline-none focus-visible:shadow-focus',
                  'disabled:cursor-not-allowed disabled:opacity-45',
                  BUTTON_CLASSES[variant] ?? 'btn-secondary',
                ].join(' ')}
                onClick={() => {
                  if (!buttonDisabled && execState.phase === 'idle') {
                    executeAction(action);
                  }
                }}
                onKeyDown={(e) => handleKeyDown(e, action)}
              >
                {isThisExecuting ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : null}
                {isThisExecuting ? `${action.label}...` : action.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Bespoke input row ──────────────────────────────────────────────── */}
      {isIdle &&
        actions
          .filter((a) => a.requiresInput)
          .map((action) => (
            <div
              key={`input-${action.key}`}
              className="flex items-center gap-2 px-4 pb-2.5"
            >
              <label className="text-xs text-zinc-500 flex-shrink-0">
                {action.requiresInput!.field}
              </label>
              <input
                type={action.requiresInput!.type ?? 'text'}
                placeholder={action.requiresInput!.placeholder}
                value={inputValues[action.key] ?? ''}
                onChange={(e) =>
                  setInputValues((prev) => ({
                    ...prev,
                    [action.key]: e.target.value,
                  }))
                }
                className="flex-1 h-7 rounded border border-line bg-white px-2 text-xs outline-none focus:shadow-focus"
              />
            </div>
          ))}

      {/* ── Success state ──────────────────────────────────────────────────── */}
      {isSuccess && (
        <div
          role="status"
          className="flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-50 border-t border-emerald-200 text-sm text-emerald-800"
        >
          <CheckCircle className="h-4 w-4" aria-hidden="true" />
          <span>
            {selectedCount} {pluralize(entityLabel, selectedCount)} updated
          </span>
        </div>
      )}

      {/* ── Partial success state ──────────────────────────────────────────── */}
      {isPartial && (
        <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-amber-50 border-t border-amber-200 text-sm">
          <div className="flex items-center gap-2 text-amber-800">
            <AlertTriangle className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
            <span>
              {execState.succeeded} succeeded &middot; {execState.failed} failed
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="text-xs font-medium text-amber-700 hover:text-amber-900 underline focus:outline-none focus-visible:shadow-focus"
              onClick={handleViewFailures}
            >
              View failures
            </button>
            <button
              type="button"
              className="text-xs px-2 py-0.5 rounded border border-zinc-300 text-zinc-600 hover:bg-zinc-50 focus:outline-none focus-visible:shadow-focus"
              onClick={handleDismissAndClear}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* ── Error state ────────────────────────────────────────────────────── */}
      {isError && (
        <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-red-50 border-t border-red-200 text-sm">
          <div className="flex items-center gap-2 text-red-800 min-w-0">
            <XCircle className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
            <span className="truncate">{execState.message}</span>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              type="button"
              className="text-xs px-2 py-0.5 rounded border border-red-300 text-red-700 hover:bg-red-100 focus:outline-none focus-visible:shadow-focus"
              onClick={handleRetry}
            >
              Retry
            </button>
            <button
              type="button"
              className="text-xs px-2 py-0.5 rounded border border-zinc-300 text-zinc-600 hover:bg-zinc-50 focus:outline-none focus-visible:shadow-focus"
              onClick={handleDismiss}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
