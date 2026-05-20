import { ChevronDown, ChevronRight, Maximize2, Minimize2 } from 'lucide-react';
import { createElement, type ReactNode } from 'react';
import clsx from 'clsx';
import { useUiStore } from '../store/uiStore';

interface WorkspacePanelProps {
  panelId: string;
  title: string;
  subtitle?: string;
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

export function WorkspacePanel({ panelId, title, subtitle, actions, children, className, contentClassName, testId, headingLevel }: WorkspacePanelProps) {
  const collapsed = useUiStore((state) => Boolean(state.collapsedPanels[panelId]));
  const focusedPanelId = useUiStore((state) => state.focusedPanelId);
  const togglePanelCollapsed = useUiStore((state) => state.togglePanelCollapsed);
  const setFocusedPanel = useUiStore((state) => state.setFocusedPanel);
  const focused = focusedPanelId === panelId;
  const hiddenByFocus = Boolean(focusedPanelId && !focused);

  if (hiddenByFocus) return null;

  return (
    <section className={clsx('workspace-panel', focused && 'workspace-panel-focused', collapsed && 'workspace-panel-collapsed', className)} data-testid={testId}>
      <div className="workspace-panel-header">
        <button type="button" className="workspace-panel-title-button" onClick={() => togglePanelCollapsed(panelId)} aria-expanded={!collapsed}>
          {collapsed ? <ChevronRight className="h-4 w-4" aria-hidden="true" /> : <ChevronDown className="h-4 w-4" aria-hidden="true" />}
          <span>
            {headingLevel
              ? createElement(
                  `h${headingLevel}`,
                  { className: 'block text-base font-semibold text-ink m-0' },
                  title
                )
              : <span className="block text-base font-semibold text-ink">{title}</span>}
            {subtitle ? <span className="block text-xs font-normal text-zinc-600">{subtitle}</span> : null}
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
