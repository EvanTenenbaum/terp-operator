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
      className="combobox-cell-editor"
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        width: '100%',
        height: '100%',
        border:
          status === 'error'
            ? '2px solid #ef4444'
            : '2px solid transparent',
        borderRadius: '4px',
        background: disabled ? '#f5f5f5' : '#fff',
        opacity: disabled ? 0.6 : 1,
        outline: 'none',
        boxSizing: 'border-box',
      }}
      data-status={status}
    >
      {/* Screen reader live region */}
      <span
        role="status"
        aria-live="polite"
        style={{
          position: 'absolute',
          width: '1px',
          height: '1px',
          padding: 0,
          margin: '-1px',
          overflow: 'hidden',
          clip: 'rect(0, 0, 0, 0)',
          whiteSpace: 'nowrap',
          border: 0,
        }}
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
        className="combobox-cell-editor-input"
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
        style={{
          flex: 1,
          height: '100%',
          border: 'none',
          outline: 'none',
          background: 'transparent',
          fontSize: '13px',
          color: disabled ? '#9ca3af' : '#18181b',
          padding: '0 8px',
          minWidth: 0,
          fontFamily: 'inherit',
        }}
      />

      {/* Action buttons container */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '2px',
          paddingRight: '4px',
          flexShrink: 0,
        }}
      >
        {/* Clear button */}
        {selectedValue && !disabled && status === 'idle' && (
          <button
            type="button"
            aria-label="Clear selection"
            className="combobox-cell-editor-clear"
            onClick={(e) => {
              e.stopPropagation();
              clearValue();
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '20px',
              height: '20px',
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              borderRadius: '3px',
              padding: 0,
              color: '#71717a',
            }}
          >
            <X size={14} />
          </button>
        )}

        {/* Status icons */}
        {status === 'saving' && (
          <Loader2
            size={14}
            className="animate-spin"
            style={{ color: '#71717a' }}
          />
        )}
        {savedFlash && <Check size={14} style={{ color: '#22c55e' }} />}
        {status === 'error' && (
          <AlertTriangle size={14} style={{ color: '#ef4444' }} />
        )}

        {/* Toggle button */}
        {!disabled && (
          <button
            type="button"
            aria-label="Open combobox menu"
            className="combobox-cell-editor-toggle"
            onClick={(e) => {
              e.stopPropagation();
              if (!disabled) {
                setIsOpen((prev) => !prev);
                if (!isOpen) inputRef.current?.focus();
              }
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '20px',
              height: '20px',
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              borderRadius: '3px',
              padding: 0,
              color: '#71717a',
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
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            zIndex: 60,
            background: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: '4px',
            padding: '4px 8px',
            fontSize: '11px',
            color: '#dc2626',
            whiteSpace: 'nowrap',
            marginTop: '2px',
          }}
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
          className="combobox-cell-editor-listbox"
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            zIndex: 50,
            minWidth: '200px',
            maxHeight: MAX_DROPDOWN_HEIGHT,
            overflowY: 'auto',
            background: '#fff',
            border: '1px solid #d4d4d8',
            borderRadius: '6px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
            margin: 0,
            padding: '4px 0',
            listStyle: 'none',
          }}
        >
          {/* Empty state */}
          {filteredOptions.length === 0 && !asyncLoading && !showCreate && (
            <li
              role="option"
              aria-selected={false}
              aria-disabled={true}
              style={{
                padding: '6px 12px',
                fontSize: '13px',
                color: '#a1a1aa',
              }}
            >
              {emptyMessage}
            </li>
          )}

          {/* Async loading indicator */}
          {usesAsync && asyncLoading && (
            <li
              role="option"
              aria-selected={false}
              style={{
                padding: '6px 12px',
                fontSize: '13px',
                color: '#a1a1aa',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
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
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  height: OPTION_HEIGHT,
                  padding: '0 12px',
                  fontSize: '13px',
                  color: option.disabled ? '#a1a1aa' : '#18181b',
                  cursor: option.disabled ? 'not-allowed' : 'pointer',
                  background: isHighlighted ? '#f4f4f5' : 'transparent',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                <span
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    overflow: 'hidden',
                  }}
                >
                  {option.icon && <span>{option.icon}</span>}
                  <span
                    style={{
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {option.label}
                    {option.description && (
                      <span
                        style={{
                          color: '#a1a1aa',
                          marginLeft: '6px',
                          fontSize: '12px',
                        }}
                      >
                        {option.description}
                      </span>
                    )}
                  </span>
                </span>
                {isSelected && (
                  <Check
                    size={14}
                    style={{
                      color: '#3b82f6',
                      flexShrink: 0,
                      marginLeft: '8px',
                    }}
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
              style={{
                display: 'flex',
                alignItems: 'center',
                height: OPTION_HEIGHT,
                padding: '0 12px',
                fontSize: '13px',
                color: '#3b82f6',
                cursor: 'pointer',
                background:
                  highlightIndex === filteredOptions.length
                    ? '#eff6ff'
                    : 'transparent',
                borderTop:
                  filteredOptions.length > 0
                    ? '1px solid #e4e4e7'
                    : 'none',
                fontWeight: 500,
              }}
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
