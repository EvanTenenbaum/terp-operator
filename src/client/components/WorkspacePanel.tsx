import { ChevronDown, ChevronRight, Maximize2, Minimize2 } from 'lucide-react';
import { createElement, type ReactNode } from 'react';
import clsx from 'clsx';
import { useUiStore } from '../store/uiStore';

interface WorkspacePanelProps {
  panelId: string;
  title: string;
  subtitle?: string;
  /** Short summary shown inline next to the title when the panel is collapsed. */
  collapsedSummary?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  testId?: string;
  /**
   * Optional heading level used to wrap the panel title so screen readers
   * can navigate panels via heading hierarchy. When omitted the title stays
   * as a plain span (legacy behaviour). Dashboard sections opt in (#34 FE-M3).
   */
  headingLevel?: 2 | 3 | 4;
}

export function WorkspacePanel({ panelId, title, subtitle, collapsedSummary, actions, children, className, contentClassName, testId, headingLevel }: WorkspacePanelProps) {
  const collapsed = useUiStore((state) => Boolean(state.collapsedPanels[panelId]));
  const focusedPanelId = useUiStore((state) => state.focusedPanelId);
  const togglePanelCollapsed = useUiStore((state) => state.togglePanelCollapsed);
  const setFocusedPanel = useUiStore((state) => state.setFocusedPanel);
  const focused = focusedPanelId === panelId;
  const hiddenByFocus = Boolean(focusedPanelId && !focused);

  // Issue #60: sibling panels render a minimized orientation-preserving rail rather
  // than disappearing (old behaviour returned null here).
  if (hiddenByFocus) {
    return (
      <section
        className="workspace-panel workspace-panel-rail"
        aria-label={title}
        data-testid={testId}
      >
        <div className="workspace-panel-header">
          <span className="block text-base font-semibold text-ink">{title}</span>
          <button
            type="button"
            className="icon-button"
            aria-label={`Restore ${title}`}
            title="Restore workspace"
            onClick={() => setFocusedPanel(null)}
          >
            <Maximize2 className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className={clsx('workspace-panel', focused && 'workspace-panel-focused', collapsed && 'workspace-panel-collapsed', className)} aria-label={title} data-testid={testId}>
      <div className="workspace-panel-header">
        <button type="button" className="workspace-panel-title-button" onClick={() => togglePanelCollapsed(panelId)} aria-expanded={!collapsed}>
          {collapsed ? <ChevronRight className="h-4 w-4" aria-hidden="true" /> : <ChevronDown className="h-4 w-4" aria-hidden="true" />}
          <span>
          {/* GH #325: default heading level is h2 — avoids h1→h3 skip-level a11y issue; headingLevel prop overrides */}
          {createElement(
              `h${headingLevel ?? 2}` as 'h2' | 'h3' | 'h4',
              { className: 'block text-base font-semibold text-ink m-0' },
              title
            )}
            {subtitle ? <span className="block text-xs font-normal text-zinc-600">{subtitle}</span> : null}
            {collapsed && collapsedSummary ? <span className="ml-2 text-xs text-zinc-400 font-normal">{collapsedSummary}</span> : null}
          </span>
        </button>
        <div className="workspace-panel-actions">
          {!collapsed ? actions : null}
          <button
            type="button"
            className="icon-button"
            title={focused ? 'Restore workspace' : 'Expand this panel'}
            aria-label={focused ? `Restore workspace from ${title}` : `Expand ${title}`}
            onClick={() => setFocusedPanel(focused ? null : panelId)}
          >
            {focused ? <Minimize2 className="h-4 w-4" aria-hidden="true" /> : <Maximize2 className="h-4 w-4" aria-hidden="true" />}
          </button>
        </div>
      </div>
      {collapsed ? null : <div className={clsx('workspace-panel-content', contentClassName)}>{children}</div>}
    </section>
  );
}
