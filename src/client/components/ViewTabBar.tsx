import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { trpc } from '../api/trpc';
import type { StatusCountsEntityType } from '../../shared/schemas';

// ============================================================================
// TYPES
// ============================================================================

export interface TabDef {
  key: string;
  label: string;
  /** Optional badge count. Renders inline after the label. */
  count?: number;
}

export interface ViewTabBarProps {
  /** Entity type key (e.g. 'purchaseOrder'). Used by autoFetch. */
  entityType: string;
  /** Manual tab definitions. When provided, takes precedence over autoFetch. */
  tabs?: TabDef[];
  /** Controlled active tab key. Falls back to internal state if not provided. */
  activeKey?: string;
  /** Called when a tab is selected (click or keyboard). */
  onChange: (key: string) => void;
  /** External loading state (e.g. parent is loading grid data). */
  loading?: boolean;
  /**
   * Auto-generate tabs from the `queries.statusCounts` procedure.
   * When true and no `tabs` prop is provided, fetches status counts
   * from the backend and builds tabs in enum order with an "All" tab first.
   */
  autoFetch?: boolean;
}

// ============================================================================
// HELPERS
// ============================================================================

/** Capitalize status enum values into human-readable labels. */
export function formatStatusLabel(status: string): string {
  return status
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Generate tab definitions from a canonical status enum array.
 *
 * Usage:
 *   const tabs = generateStatusTabs(PURCHASE_ORDER_STATUSES);
 *   // → [{ key: 'all', label: 'All' }, { key: 'draft', label: 'Draft' }, ...]
 */
export function generateStatusTabs(
  statuses: readonly string[],
  allLabel = 'All',
): TabDef[] {
  return [
    { key: 'all', label: allLabel },
    ...statuses.map((status) => ({
      key: status,
      label: formatStatusLabel(status),
    })),
  ];
}

// ============================================================================
// COMPONENT
// ============================================================================

export function ViewTabBar({
  entityType,
  tabs: tabsProp,
  activeKey: activeKeyProp,
  onChange,
  loading: loadingProp = false,
  autoFetch = false,
}: ViewTabBarProps) {
  // ── Auto-fetch status counts when autoFetch is enabled and no manual tabs ──
  const shouldFetch = autoFetch && (!tabsProp || tabsProp.length === 0);

  const statusCountsQuery = trpc.queries.statusCounts.useQuery(
    { entityType: entityType as StatusCountsEntityType },
    { enabled: shouldFetch },
  );

  // ── Derive tab definitions ──────────────────────────────────────────────
  const tabs = useMemo<TabDef[]>(() => {
    // Manual tabs take absolute precedence
    if (tabsProp && tabsProp.length > 0) return tabsProp;

    // Auto-generated from statusCounts
    if (shouldFetch && statusCountsQuery.data) {
      const { statuses } = statusCountsQuery.data;
      const total = statuses.reduce((sum, s) => sum + s.count, 0);

      return [
        { key: 'all', label: 'All', count: total },
        ...statuses.map((s) => ({
          key: s.status,
          label: formatStatusLabel(s.status),
          count: s.count,
        })),
      ];
    }

    return [];
  }, [tabsProp, shouldFetch, statusCountsQuery.data]);

  // ── Active tab (controlled or internal) ──────────────────────────────────
  const [internalActiveKey, setInternalActiveKey] = useState<string>(
    activeKeyProp ?? tabs[0]?.key ?? 'all',
  );

  // Sync internal state when controlled prop changes or tabs load
  useEffect(() => {
    if (activeKeyProp !== undefined) return;
    if (tabs.length > 0 && !tabs.find((t) => t.key === internalActiveKey)) {
      setInternalActiveKey(tabs[0].key);
    }
  }, [activeKeyProp, tabs, internalActiveKey]);

  const activeKey = activeKeyProp ?? internalActiveKey;

  // ── Loading state ────────────────────────────────────────────────────────
  const isLoading = loadingProp || (shouldFetch && statusCountsQuery.isLoading);

  // ── Overflow detection ──────────────────────────────────────────────────
  const containerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const checkOverflow = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    checkOverflow();
    const onResize = () => checkOverflow();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [checkOverflow, tabs]);

  // ── Scroll handlers ─────────────────────────────────────────────────────
  const scroll = useCallback(
    (direction: 'left' | 'right') => {
      const el = containerRef.current;
      if (!el) return;
      const amount = direction === 'left' ? -200 : 200;
      el.scrollBy({ left: amount, behavior: 'smooth' });
      // Re-check after smooth scroll animation completes
      setTimeout(checkOverflow, 350);
    },
    [checkOverflow],
  );

  // ── Keyboard navigation ─────────────────────────────────────────────────
  const tabRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  const handleKeyDown = useCallback(
    (e: ReactKeyboardEvent) => {
      const currentIndex = tabs.findIndex((t) => t.key === activeKey);
      if (currentIndex === -1) return;

      let nextIndex = currentIndex;
      switch (e.key) {
        case 'ArrowRight':
          e.preventDefault();
          nextIndex = Math.min(currentIndex + 1, tabs.length - 1);
          break;
        case 'ArrowLeft':
          e.preventDefault();
          nextIndex = Math.max(currentIndex - 1, 0);
          break;
        case 'Home':
          e.preventDefault();
          nextIndex = 0;
          break;
        case 'End':
          e.preventDefault();
          nextIndex = tabs.length - 1;
          break;
        default:
          return;
      }

      const nextKey = tabs[nextIndex].key;
      const nextTab = tabRefs.current.get(nextKey);
      if (nextTab) {
        nextTab.focus();
        if (activeKeyProp === undefined) {
          setInternalActiveKey(nextKey);
        }
        onChange(nextKey);
      }
    },
    [activeKey, tabs, onChange, activeKeyProp],
  );

  // ── Tab click ───────────────────────────────────────────────────────────
  const handleTabClick = useCallback(
    (key: string) => {
      if (activeKeyProp === undefined) {
        setInternalActiveKey(key);
      }
      onChange(key);
    },
    [onChange, activeKeyProp],
  );

  // ── Scroll active tab into view on change ────────────────────────────────
  useEffect(() => {
    const activeTab = tabRefs.current.get(activeKey);
    if (activeTab && containerRef.current) {
      // Only scroll if the tab is not fully visible
      const containerRect = containerRef.current.getBoundingClientRect();
      const tabRect = activeTab.getBoundingClientRect();
      if (
        tabRect.left < containerRect.left ||
        tabRect.right > containerRect.right
      ) {
        activeTab.scrollIntoView({ inline: 'center', behavior: 'smooth' });
        setTimeout(checkOverflow, 350);
      }
    }
  }, [activeKey, checkOverflow]);

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <nav
      className="relative flex items-center h-10 bg-white border-b border-zinc-200"
      aria-label="Status filter tabs"
    >
      {/* Left scroll button */}
      <button
        type="button"
        className={[
          'flex-shrink-0 w-7 h-7 flex items-center justify-center',
          'bg-white hover:bg-zinc-100 transition-colors duration-150 ml-1 rounded',
          'focus:outline-none focus-visible:shadow-focus',
          !canScrollLeft && 'invisible',
        ].join(' ')}
        onClick={() => scroll('left')}
        aria-label="Scroll tabs left"
        aria-hidden={!canScrollLeft || undefined}
      >
        <ChevronLeft className="w-4 h-4 text-zinc-500" />
      </button>

      {/* Tab list */}
      <div
        ref={containerRef}
        role="tablist"
        aria-orientation="horizontal"
        className="flex-1 flex items-center overflow-x-auto scrollbar-none px-2 h-full"
        onScroll={checkOverflow}
        onKeyDown={handleKeyDown}
      >
        {isLoading ? (
          /* Loading skeleton */
          Array.from({ length: 5 }, (_, i) => (
            <div
              key={i}
              className="h-5 rounded bg-zinc-100 animate-pulse mx-1.5 flex-shrink-0"
              style={{ width: [72, 96, 84, 104, 68][i] ?? 80 }}
            />
          ))
        ) : tabs.length === 0 ? null : (
          tabs.map((tab) => {
            const isActive = tab.key === activeKey;
            return (
              <button
                key={tab.key}
                ref={(el) => {
                  if (el) tabRefs.current.set(tab.key, el);
                  else tabRefs.current.delete(tab.key);
                }}
                role="tab"
                aria-selected={isActive}
                aria-controls={`tabpanel-${tab.key}`}
                tabIndex={isActive ? 0 : -1}
                type="button"
                className={[
                  'flex-shrink-0 px-3 py-2 text-sm transition-colors duration-150',
                  'border-b-2 -mb-[1px]',
                  'focus:outline-none focus-visible:shadow-focus',
                  isActive
                    ? 'text-accent font-semibold border-accent'
                    : 'text-zinc-600 font-normal border-transparent hover:text-zinc-900 hover:bg-zinc-50',
                ].join(' ')}
                onClick={() => handleTabClick(tab.key)}
              >
                <span>{tab.label}</span>
                {tab.count !== undefined && (
                  <span className="ml-1.5 text-xs text-zinc-500 tabular-nums">
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })
        )}
      </div>

      {/* Right scroll button */}
      <button
        type="button"
        className={[
          'flex-shrink-0 w-7 h-7 flex items-center justify-center',
          'bg-white hover:bg-zinc-100 transition-colors duration-150 mr-1 rounded',
          'focus:outline-none focus-visible:shadow-focus',
          !canScrollRight && 'invisible',
        ].join(' ')}
        onClick={() => scroll('right')}
        aria-label="Scroll tabs right"
        aria-hidden={!canScrollRight || undefined}
      >
        <ChevronRight className="w-4 h-4 text-zinc-500" />
      </button>
    </nav>
  );
}
