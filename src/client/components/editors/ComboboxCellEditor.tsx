import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import type { ICellEditorParams } from 'ag-grid-community';
import { ChevronDown, X, Loader2, Check, AlertTriangle } from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────────────

export interface ComboboxOption {
  label: string;
  value: string;
  description?: string;
  group?: string;
  disabled?: boolean;
  icon?: string;
}

/**
 * Props passed via `cellEditorParams` in the AG Grid ColDef.
 * AG Grid React passes these as the React component's props.
 * Grid lifecycle params (value, stopEditing, etc.) arrive through the
 * `init()` method exposed via `useImperativeHandle`.
 */
export interface ComboboxCellEditorProps {
  /** Dropdown options (static list). Use onSearch for async. */
  options: ComboboxOption[];
  /** Placeholder text when no value selected */
  placeholder?: string;
  /** Whether to show a "Create new" option when typeahead has no matches */
  allowCreate?: boolean;
  /** Label for the create option. Default: 'Create "{value}"' */
  createLabel?: string;
  /** Called when user commits a value. Must return Promise for save/error states. */
  onCommit?: (value: string | null) => Promise<void>;
  /** Read-only mode */
  disabled?: boolean;
  /** Max options before switching to async. Default 500. */
  maxOptions?: number;
  /** Async search callback. Called when options.length > maxOptions. */
  onSearch?: (query: string) => Promise<ComboboxOption[]>;
  /** Message shown when options array is empty */
  emptyMessage?: string;
}

// ── Ref interface exposed to AG Grid ─────────────────────────────────────────

export interface ComboboxCellEditorRef {
  getValue(): string | null | undefined;
  isPopup(): boolean;
  focusIn(): void;
  focusOut(): void;
  afterGuiAttached(): void;
  destroy(): void;
  refresh(params: ICellEditorParams<Record<string, unknown>, string>): void;
  isCancelBeforeStart(): boolean;
  isCancelAfterEnd(): boolean;
}

// ── Constants ────────────────────────────────────────────────────────────────

const OPTION_HEIGHT = 32;
const MAX_DROPDOWN_HEIGHT = 280;

// ── Component ────────────────────────────────────────────────────────────────

const ComboboxCellEditor = forwardRef<
  ComboboxCellEditorRef,
  ComboboxCellEditorProps
>(function ComboboxCellEditor(props, ref) {
  // ── Destructure custom props (from cellEditorParams) ─────────────────────
  const {
    options: staticOptions = [],
    placeholder = 'Select...',
    allowCreate = false,
    createLabel = 'Create "{value}"',
    onCommit,
    disabled = false,
    maxOptions = 500,
    onSearch,
    emptyMessage = 'No options available',
  } = props;

  // ── AG Grid params (set via init()) ──────────────────────────────────────
  const [gridParams, setGridParams] =
    useState<ICellEditorParams<Record<string, unknown>, string> | null>(null);

  const value = (gridParams?.value as string | null | undefined) ?? null;
  const stopEditing = gridParams?.stopEditing;

  // ── Refs ─────────────────────────────────────────────────────────────────
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listboxRef = useRef<HTMLUListElement>(null);
  const optionRefs = useRef<Map<number, HTMLLIElement>>(new Map());
  const onCommitRef = useRef(onCommit);
  onCommitRef.current = onCommit;

  // ── State ────────────────────────────────────────────────────────────────
  const [isOpen, setIsOpen] = useState(false);
  const [filterText, setFilterText] = useState('');
  const [highlightIndex, setHighlightIndex] = useState(0);
  const [status, setStatus] = useState<
    'idle' | 'saving' | 'saved' | 'error'
  >('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedValue, setSelectedValue] = useState<string | null>(value);
  const [asyncOptions, setAsyncOptions] = useState<ComboboxOption[]>([]);
  const [asyncLoading, setAsyncLoading] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  // ── Sync selectedValue when grid value changes externally ────────────────
  useEffect(() => {
    setSelectedValue(value);
  }, [value]);

  // ── Derived ──────────────────────────────────────────────────────────────
  const usesAsync = staticOptions.length === 0 && onSearch != null;

  const staticFiltered = useMemo(() => {
    if (usesAsync) return [];
    if (!filterText) return staticOptions;
    const lower = filterText.toLowerCase();
    return staticOptions.filter(
      (opt) =>
        opt.label.toLowerCase().includes(lower) ||
        opt.value.toLowerCase().includes(lower) ||
        (opt.description?.toLowerCase().includes(lower) ?? false)
    );
  }, [staticOptions, filterText, usesAsync]);

  const filteredOptions = usesAsync ? asyncOptions : staticFiltered;

  const showCreate =
    allowCreate &&
    filterText.length > 0 &&
    !filteredOptions.some(
      (opt) => opt.label.toLowerCase() === filterText.toLowerCase()
    );

  // ── Announcements for screen readers ─────────────────────────────────────
  const [srAnnouncement, setSrAnnouncement] = useState('');

  useEffect(() => {
    if (isOpen) {
      const total = filteredOptions.length + (showCreate ? 1 : 0);
      setSrAnnouncement(`${total} option${total === 1 ? '' : 's'} available`);
    }
  }, [isOpen, filteredOptions.length, showCreate]);

  // ── Async search (debounced) ─────────────────────────────────────────────
  useEffect(() => {
    if (!usesAsync || !onSearch) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      setAsyncLoading(true);
      try {
        const results = await onSearch(filterText);
        if (!cancelled) setAsyncOptions(results);
      } catch {
        if (!cancelled) setAsyncOptions([]);
      } finally {
        if (!cancelled) setAsyncLoading(false);
      }
    }, 150);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [filterText, usesAsync, onSearch]);

  // ── Reset highlight when filtered options change ─────────────────────────
  useEffect(() => {
    setHighlightIndex(0);
  }, [filteredOptions.length]);

  // ── Saved flash → close editor ───────────────────────────────────────────
  useEffect(() => {
    if (!savedFlash) return;
    const timer = setTimeout(() => {
      setSavedFlash(false);
      setStatus('idle');
      stopEditing?.(true);
    }, 800);
    return () => clearTimeout(timer);
  }, [savedFlash, stopEditing]);

  // ── Scroll highlighted option into view ──────────────────────────────────
  useEffect(() => {
    if (!isOpen || !listboxRef.current) return;
    const optionEl = optionRefs.current.get(highlightIndex);
    if (optionEl) {
      optionEl.scrollIntoView({ block: 'nearest' });
    }
  }, [highlightIndex, isOpen]);

  // ── Commit value ─────────────────────────────────────────────────────────
  const commitValue = useCallback(
    async (newValue: string | null) => {
      setSelectedValue(newValue);
      setFilterText('');
      setIsOpen(false);

      if (!onCommitRef.current) {
        stopEditing?.(false);
        return;
      }

      setStatus('saving');
      try {
        await onCommitRef.current(newValue);
        setStatus('saved');
        setSavedFlash(true);
        setSrAnnouncement(
          newValue ? `Selected ${newValue}` : 'Selection cleared'
        );
      } catch (err) {
        setStatus('error');
        const message =
          err instanceof Error ? err.message : 'Save failed';
        setErrorMessage(message);
        setSrAnnouncement(`Error: ${message}`);
      }
    },
    [stopEditing]
  );

  // ── Clear value ──────────────────────────────────────────────────────────
  const clearValue = useCallback(async () => {
    await commitValue(null);
  }, [commitValue]);

  // ── Keyboard handler ─────────────────────────────────────────────────────
  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (disabled) return;

      switch (e.key) {
        case 'ArrowDown': {
          e.preventDefault();
          if (!isOpen) {
            setIsOpen(true);
            setHighlightIndex(0);
          } else {
            const max =
              filteredOptions.length + (showCreate ? 1 : 0) - 1;
            setHighlightIndex((prev) => Math.min(prev + 1, max));
          }
          break;
        }
        case 'ArrowUp': {
          e.preventDefault();
          if (isOpen) {
            setHighlightIndex((prev) => Math.max(prev - 1, 0));
          }
          break;
        }
        case 'Enter': {
          e.preventDefault();
          if (!isOpen) {
            setIsOpen(true);
            return;
          }
          if (showCreate && highlightIndex === filteredOptions.length) {
            commitValue(filterText);
          } else if (filteredOptions[highlightIndex]) {
            commitValue(filteredOptions[highlightIndex].value);
          }
          break;
        }
        case 'Escape': {
          if (isOpen) {
            e.preventDefault();
            e.stopPropagation();
            setIsOpen(false);
            setFilterText('');
          } else {
            // Let AG Grid handle Escape to stop editing
            stopEditing?.(false);
          }
          break;
        }
        case 'Tab': {
          if (isOpen) {
            e.preventDefault();
            setIsOpen(false);
            setFilterText('');
            stopEditing?.(!e.shiftKey);
          }
          break;
        }
        case 'Backspace': {
          if (!filterText && selectedValue) {
            e.preventDefault();
            clearValue();
          }
          break;
        }
        default: {
          // Printable characters open the dropdown and start filtering
          if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
            if (!isOpen) {
              setIsOpen(true);
            }
          }
          break;
        }
      }
    },
    [
      isOpen,
      disabled,
      filteredOptions,
      showCreate,
      highlightIndex,
      filterText,
      commitValue,
      clearValue,
      selectedValue,
      stopEditing,
    ]
  );

  // ── Input change handler ─────────────────────────────────────────────────
  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setFilterText(e.target.value);
      if (!isOpen) setIsOpen(true);
    },
    [isOpen]
  );

  // ── Option click ─────────────────────────────────────────────────────────
  const handleOptionClick = useCallback(
    (option: ComboboxOption) => {
      if (option.disabled) return;
      commitValue(option.value);
    },
    [commitValue]
  );

  // ── Create new click ─────────────────────────────────────────────────────
  const handleCreateClick = useCallback(() => {
    commitValue(filterText);
  }, [filterText, commitValue]);

  // ── Click outside handler ────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
        setFilterText('');
      }
    };
    document.addEventListener('mousedown', handler, true);
    return () => document.removeEventListener('mousedown', handler, true);
  }, [isOpen]);

  // ── Single option auto-select ────────────────────────────────────────────
  useEffect(() => {
    if (
      isOpen &&
      filteredOptions.length === 1 &&
      !showCreate &&
      filterText === ''
    ) {
      const timer = setTimeout(() => {
        commitValue(filteredOptions[0].value);
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [isOpen, filteredOptions, showCreate, filterText, commitValue]);

  // ── Auto-open the dropdown on mount ──────────────────────────────────────
  useEffect(() => {
    if (!disabled && staticOptions.length > 0) {
      // Open dropdown immediately when editor activates
      const timer = setTimeout(() => setIsOpen(true), 50);
      return () => clearTimeout(timer);
    }
  }, [disabled, staticOptions.length]);

  // ── Imperative handle for AG Grid lifecycle ──────────────────────────────
  useImperativeHandle(
    ref,
    () => ({
      init(
        params: ICellEditorParams<Record<string, unknown>, string>
      ): void {
        setGridParams(params);
        // Sync initial value
        setSelectedValue((params.value as string | null) ?? null);
      },
      getValue(): string | null | undefined {
        return selectedValue;
      },
      isPopup(): boolean {
        return false;
      },
      focusIn(): void {
        inputRef.current?.focus();
      },
      focusOut(): void {
        setIsOpen(false);
        setFilterText('');
      },
      afterGuiAttached(): void {
        // Focus input when the editor DOM is ready
        requestAnimationFrame(() => {
          inputRef.current?.focus();
        });
      },
      destroy(): void {
        // React unmount handles cleanup
      },
      refresh(
        _params: ICellEditorParams<Record<string, unknown>, string>
      ): void {
        // Called when grid params change while editor is active
      },
      isCancelBeforeStart(): boolean {
        return disabled;
      },
      isCancelAfterEnd(): boolean {
        return false;
      },
    }),
    [selectedValue, disabled]
  );

  // ── ARIA active descendant ───────────────────────────────────────────────
  const activeDescendant =
    isOpen && filteredOptions[highlightIndex]
      ? `combobox-option-${highlightIndex}`
      : undefined;

  // ── Display value in the input ───────────────────────────────────────────
  const matchedOption = staticOptions.find((o) => o.value === selectedValue);
  const displayValue = isOpen
    ? filterText
    : matchedOption?.label ?? selectedValue ?? '';

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div
      ref={containerRef}
      className={[
        'combobox-cell-editor relative flex items-center w-full h-full rounded outline-none box-border',
        status === 'error' ? 'border-2 border-red-500' : 'border-2 border-transparent',
        disabled ? 'bg-zinc-100 opacity-60' : 'bg-white',
      ].join(' ')}
      data-status={status}
    >
      {/* Screen reader live region */}
      <span
        role="status"
        aria-live="polite"
        className="sr-only"
      >
        {srAnnouncement}
      </span>

      {/* Input field */}
      <input
        ref={inputRef}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-autocomplete="list"
        aria-activedescendant={activeDescendant}
        aria-label={placeholder}
        type="text"
        className={[
          'combobox-cell-editor-input flex-1 h-full border-none outline-none bg-transparent text-[13px] px-2 min-w-0 font-[inherit]',
          disabled ? 'text-zinc-400' : 'text-zinc-900',
        ].join(' ')}
        value={displayValue}
        placeholder={!selectedValue && !isOpen ? placeholder : ''}
        disabled={disabled}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        onFocus={() => {
          if (!isOpen && !disabled) {
            setIsOpen(true);
          }
        }}
        onClick={() => {
          if (!isOpen && !disabled) {
            setIsOpen(true);
          }
        }}
      />

      {/* Action buttons container */}
      <div
        className="flex items-center gap-0.5 pr-1 shrink-0"
      >
        {/* Clear button */}
        {selectedValue && !disabled && status === 'idle' && (
          <button
            type="button"
            aria-label="Clear selection"
            className="combobox-cell-editor-clear flex items-center justify-center w-5 h-5 border-none bg-transparent cursor-pointer rounded-sm p-0 text-zinc-500"
            onClick={(e) => {
              e.stopPropagation();
              clearValue();
            }}
          >
            <X size={14} />
          </button>
        )}

        {/* Status icons */}
        {status === 'saving' && (
          <Loader2
            size={14}
            className="animate-spin text-zinc-500"
          />
        )}
        {savedFlash && <Check size={14} className="text-green-500" />}
        {status === 'error' && (
          <AlertTriangle size={14} className="text-red-500" />
        )}

        {/* Toggle button */}
        {!disabled && (
          <button
            type="button"
            aria-label="Open combobox menu"
            className="combobox-cell-editor-toggle flex items-center justify-center w-5 h-5 border-none bg-transparent cursor-pointer rounded-sm p-0 text-zinc-500"
            onClick={(e) => {
              e.stopPropagation();
              if (!disabled) {
                setIsOpen((prev) => !prev);
                if (!isOpen) inputRef.current?.focus();
              }
            }}
          >
            <ChevronDown size={14} />
          </button>
        )}
      </div>

      {/* Error tooltip */}
      {status === 'error' && errorMessage && (
        <div
          role="alert"
          className="absolute top-full left-0 z-[60] mt-0.5 bg-red-50 border border-red-200 rounded px-2 py-1 text-[11px] text-red-600 whitespace-nowrap"
        >
          {errorMessage}
        </div>
      )}

      {/* Dropdown listbox */}
      {isOpen && !disabled && (
        <ul
          ref={listboxRef}
          role="listbox"
          id="combobox-listbox"
          className="combobox-cell-editor-listbox absolute top-full left-0 z-50 min-w-[200px] overflow-y-auto bg-white border border-zinc-300 rounded-lg shadow-lg m-0 py-1 list-none"
          style={{ maxHeight: MAX_DROPDOWN_HEIGHT }}
        >
          {/* Empty state */}
          {filteredOptions.length === 0 && !asyncLoading && !showCreate && (
            <li
              role="option"
              aria-selected={false}
              aria-disabled={true}
              className="px-3 py-1.5 text-[13px] text-zinc-400"
            >
              {emptyMessage}
            </li>
          )}

          {/* Async loading indicator */}
          {usesAsync && asyncLoading && (
            <li
              role="option"
              aria-selected={false}
              className="px-3 py-1.5 text-[13px] text-zinc-400 flex items-center gap-1.5"
            >
              <Loader2 size={12} className="animate-spin" />
              Loading...
            </li>
          )}

          {/* Options */}
          {filteredOptions.map((option, index) => {
            const isHighlighted = index === highlightIndex;
            const isSelected = option.value === selectedValue;
            return (
              <li
                key={option.value}
                ref={(el) => {
                  if (el) optionRefs.current.set(index, el);
                  else optionRefs.current.delete(index);
                }}
                id={`combobox-option-${index}`}
                role="option"
                aria-selected={isSelected}
                aria-disabled={option.disabled ?? false}
                onClick={() => handleOptionClick(option)}
                onMouseEnter={() => setHighlightIndex(index)}
                className={[
                  'flex items-center justify-between px-3 text-[13px] whitespace-nowrap overflow-hidden text-ellipsis',
                  option.disabled ? 'text-zinc-400 cursor-not-allowed' : 'text-zinc-900 cursor-pointer',
                  isHighlighted ? 'bg-zinc-100' : 'bg-transparent',
                ].join(' ')}
                style={{ height: OPTION_HEIGHT }}
              >
                <span
                  className="flex items-center gap-1.5 overflow-hidden"
                >
                  {option.icon && <span>{option.icon}</span>}
                  <span
                    className="overflow-hidden text-ellipsis"
                  >
                    {option.label}
                    {option.description && (
                      <span
                        className="text-zinc-400 ml-1.5 text-xs"
                      >
                        {option.description}
                      </span>
                    )}
                  </span>
                </span>
                {isSelected && (
                  <Check
                    size={14}
                    className="text-blue-500 shrink-0 ml-2"
                  />
                )}
              </li>
            );
          })}

          {/* Create new option */}
          {showCreate && (
            <li
              ref={(el) => {
                if (el)
                  optionRefs.current.set(filteredOptions.length, el);
                else optionRefs.current.delete(filteredOptions.length);
              }}
              id={`combobox-option-${filteredOptions.length}`}
              role="option"
              aria-selected={highlightIndex === filteredOptions.length}
              onClick={handleCreateClick}
              onMouseEnter={() => setHighlightIndex(filteredOptions.length)}
              className={[
                'flex items-center px-3 text-[13px] text-blue-500 cursor-pointer font-medium',
                filteredOptions.length > 0 ? 'border-t border-zinc-200' : '',
                highlightIndex === filteredOptions.length ? 'bg-blue-50' : 'bg-transparent',
              ].join(' ')}
              style={{ height: OPTION_HEIGHT }}
            >
              {createLabel.replace('{value}', filterText)}
            </li>
          )}
        </ul>
      )}
    </div>
  );
});

export default ComboboxCellEditor;
