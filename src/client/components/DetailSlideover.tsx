import { useState, useEffect, useCallback } from 'react';
import { X, Maximize2, AlertTriangle } from 'lucide-react';
import clsx from 'clsx';
import { useFocusTrap } from '../hooks/useFocusTrap';
import type { GridRow, Role } from '../../shared/types';
import type { SlideOverTab, SlideOverTabProps } from './tabs/registry';
import { getTabs, getDefaultTab } from './tabs/registry';

// Re-export types for consumer convenience.
export type SlideoverState = 'closed' | 'peek' | 'standard' | 'wide';
export type { SlideOverTab, SlideOverTabProps } from './tabs/registry';

export interface DetailSlideoverProps {
  entityType: string;
  entityId: string | null;
  state: SlideoverState;
  onClose: () => void;
  onStateChange?: (s: SlideoverState) => void;
  onOpenFullView?: () => void;
  /** Override tabs from the registry (useful for testing / ad-hoc usage). */
  tabs?: SlideOverTab[];
  /** Grid row data passed to active tab. */
  row?: GridRow;
  /** User role for tab role-gating. */
  role?: Role;
  /** Whether the slideover content is in a loading state. */
  loading?: boolean;
  /** Error message to display instead of tab content. */
  error?: string | null;
}

const STATE_WIDTH_MAP: Record<SlideoverState, string> = {
  closed: '0',
  peek: 'var(--drawer-peek-width)',
  standard: 'var(--drawer-standard-width)',
  wide: 'var(--drawer-wide-width)',
};

const CYCLE_ORDER: readonly SlideoverState[] = ['peek', 'standard', 'wide'];

/**
 * DetailSlideover — a right-side slide-over panel that replaces ContextDrawer.
 *
 * States:
 * - closed: not rendered (returns null)
 * - peek (280px): minimal preview; backdrop overlay; click-outside closes
 * - standard (420px): full detail with tabs; focus trapped
 * - wide (60%): expanded
 *
 * The slideover is a SHELL: it renders a tab bar and delegates content to
 * registered tab components. No entity-specific logic lives here.
 */
export function DetailSlideover({
  entityType,
  entityId,
  state,
  onClose,
  onStateChange,
  onOpenFullView,
  tabs: explicitTabs,
  row,
  role,
  loading = false,
  error = null,
}: DetailSlideoverProps): JSX.Element | null {
  // Resolve tabs from registry or explicit prop.
  const resolvedTabs: SlideOverTab[] = explicitTabs ?? getTabs(entityType, role);
  const defaultTabKey = getDefaultTab(entityType);

  const [activeTabKey, setActiveTabKey] = useState<string>('');

  // Settle active tab when tabs change or become available.
  useEffect(() => {
    if (resolvedTabs.length === 0) {
      setActiveTabKey('');
      return;
    }
    // Keep current if still valid, otherwise fall back to default.
    const currentValid = resolvedTabs.some((t) => t.key === activeTabKey);
    if (!currentValid) {
      setActiveTabKey(defaultTabKey ?? resolvedTabs[0].key);
    }
  }, [resolvedTabs, defaultTabKey, activeTabKey]);

  const isOpen = state !== 'closed';

  // Focus trap: Tab cycles within slideover when open.
  const trapRef = useFocusTrap<HTMLDivElement>(isOpen, onClose);

  // Click outside to close — peek mode only.
  useEffect(() => {
    if (state !== 'peek') return;
    const handleClick = (e: MouseEvent) => {
      const panel = document.getElementById('detail-slideover-panel');
      if (panel && !panel.contains(e.target as Node)) {
        onClose();
      }
    };
    // Use a short delay so the row-click that opened peek doesn't
    // immediately register as a click-outside.
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClick);
    }, 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClick);
    };
  }, [state, onClose]);

  // Cycle width: peek → standard → wide → peek.
  const handleCycle = useCallback(() => {
    if (!onStateChange) return;
    const idx = CYCLE_ORDER.indexOf(state);
    const next = CYCLE_ORDER[(idx + 1) % CYCLE_ORDER.length];
    onStateChange(next);
  }, [state, onStateChange]);

  // Closed: nothing rendered (the reopen pill lives in the parent view).
  if (state === 'closed') {
    return null;
  }

  const activeTab = resolvedTabs.find((t) => t.key === activeTabKey);
  const hasTabs = resolvedTabs.length > 0;
  const showTabs = hasTabs && (state === 'standard' || state === 'wide');
  const entityIdStr = entityId ?? '';

  return (
    <>
      {/* Backdrop — only for peek mode (overlay, no content shift). */}
      {state === 'peek' && (
        <div
          className="slideover-backdrop"
          aria-hidden="true"
          data-testid="slideover-backdrop"
        />
      )}

      {/* Panel */}
      <aside
        id="detail-slideover-panel"
        ref={trapRef}
        className={clsx('slideover', `slideover--${state}`)}
        aria-label="Entity details"
        role="dialog"
        aria-modal="true"
        data-testid="slideover-panel"
      >
        {/* Header */}
        <div className="slideover-header">
          {/* Close button */}
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label="Close detail panel"
            data-testid="slideover-close-btn"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>

          {/* Title area */}
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-ink">
              {activeTab?.label ?? entityLabel(entityType)}
            </div>
            <div className="truncate text-[11px] uppercase text-zinc-500">
              {entityType}{entityIdStr ? ` · ${entityIdStr.slice(0, 8)}` : ''}
            </div>
          </div>

          {/* Cycle width button — standard/wide modes only */}
          {onStateChange && (state === 'standard' || state === 'wide') && (
            <button
              type="button"
              className="icon-button font-mono text-xs"
              onClick={handleCycle}
              title={`Resize panel (${state})`}
              aria-label={`Detail panel is ${state}. Click to cycle width.`}
              data-testid="slideover-cycle-btn"
            >
              <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          )}

          {/* Open in full view */}
          {onOpenFullView && state !== 'peek' && (
            <button
              type="button"
              className="text-button text-xs"
              onClick={onOpenFullView}
              aria-label="Open in full view"
              data-testid="slideover-full-view-btn"
            >
              Full
            </button>
          )}
        </div>

        {/* Tab bar — standard/wide modes only when tabs are registered */}
        {showTabs && (
          <div className="slideover-tabs" role="tablist" aria-label="Detail tabs">
            {resolvedTabs.map((tab, index) => (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={activeTabKey === tab.key}
                className={clsx(
                  'slideover-tab',
                  activeTabKey === tab.key && 'slideover-tab--active',
                )}
                onClick={() => setActiveTabKey(tab.key)}
                data-testid={`slideover-tab-${tab.key}`}
              >
                <span className="slideover-tab-index">{index + 1}</span>
                {tab.label}
                {tab.badge !== undefined && tab.badge > 0 && (
                  <span className="ml-1 rounded-full bg-amber/20 px-1.5 text-[10px] font-bold text-amber-800">
                    {tab.badge}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}

        {/* Body */}
        <div className="slideover-body">
          {renderBody({
            loading,
            error,
            hasTabs: showTabs,
            activeTab,
            activeTabKey,
            entityId: entityIdStr,
            entityType,
            row,
          })}
        </div>
      </aside>
    </>
  );
}

// ── Body rendering ──────────────────────────────────────────────────────────

interface BodyRenderInput {
  loading: boolean;
  error: string | null;
  hasTabs: boolean;
  activeTab: SlideOverTab | undefined;
  activeTabKey: string;
  entityId: string;
  entityType: string;
  row?: GridRow;
}

function renderBody(input: BodyRenderInput): JSX.Element {
  const { loading, error, hasTabs, activeTab, entityId, entityType, row } = input;

  // Slideover-level loading state.
  if (loading) {
    return <SlideoverSkeleton />;
  }

  // Slideover-level error state.
  if (error) {
    return (
      <div className="slideover-error" role="alert">
        <div className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <div className="min-w-0">
            <p className="font-semibold">Something went wrong</p>
            <p className="mt-1 text-zinc-700">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  // No tabs registered — empty state.
  if (!hasTabs || !activeTab) {
    return (
      <div className="slideover-empty" data-testid="slideover-empty">
        No details available for {entityLabel(entityType)}.
        {entityId ? ` (${entityId.slice(0, 8)})` : ''}
      </div>
    );
  }

  // Render the active tab component.
  if (!entityId) {
    return (
      <div className="slideover-empty" data-testid="slideover-empty">
        Select a row to view details.
      </div>
    );
  }

  const TabComponent = activeTab.component;
  return <TabComponent entityId={entityId} entityType={entityType} row={row} />;
}

// ── Skeleton ────────────────────────────────────────────────────────────────

function SlideoverSkeleton(): JSX.Element {
  return (
    <div className="space-y-3" aria-busy="true" data-testid="slideover-skeleton">
      <div className="slideover-skeleton h-5 w-2/3" />
      <div className="slideover-skeleton h-4 w-1/2" />
      <div className="slideover-skeleton h-4 w-3/4" />
      <div className="slideover-skeleton h-4 w-1/3" />
      <div className="slideover-skeleton mt-4 h-24 w-full" />
    </div>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function entityLabel(entityType: string): string {
  return entityType.replace(/-/g, ' ').replace(/([A-Z])/g, ' $1').replace(/^./, (l) => l.toUpperCase());
}
