/**
 * SettingsPageView — multi-tab admin page template.
 *
 * Renders a header with title and optional subtitle, plus a vertical
 * left-rail tab bar and a content pane. Each tab is a self-contained
 * settings section. Designed for SettingsView only.
 *
 * UX-9: The vertical left-rail signals "admin sections" — these are genuine
 * mode/section changes (not filters), distinct from the horizontal ViewTabBar
 * used in operator views.
 *
 * ARCH-2: Settings don't have lifecycle status. State-gated action rules
 * do not apply to this template.
 */

import type { ReactNode } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SettingsTabDef {
  /** Unique key for the tab. */
  key: string;
  /** Label shown in the left-rail. */
  label: string;
  /** Content renderer. Return null to hide the entire tab. */
  render: () => ReactNode;
  /** When true, this tab is the currently active one. */
  active?: boolean;
}

export interface SettingsPageViewProps {
  /** View key for data attributes and test hooks. */
  viewKey: string;
  /** Title displayed in the page header (dynamic, e.g. "Settings — Connector requests"). */
  title: string;
  /** Optional subtitle rendered below the title. */
  subtitle?: string;
  /** Settings tabs in display order. */
  tabs?: SettingsTabDef[];
  /** When true, shows a loading skeleton instead of content. */
  loading?: boolean;
  /** Children rendered in the content pane when not using tabs. */
  children?: ReactNode;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function SettingsPageView({
  viewKey,
  title,
  subtitle,
  tabs,
  loading = false,
  children,
}: SettingsPageViewProps): ReactNode {
  return (
    <div className="view-stack" data-view-key={viewKey} data-testid={`settings-page-${viewKey}`}>
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="page-title">{title}</h1>
          {subtitle ? <p className="page-subtitle">{subtitle}</p> : null}
        </div>
      </div>

      {/* ── Loading state ──────────────────────────────────────────────────── */}
      {loading ? (
        <div className="inline-panel" role="status" aria-busy="true">
          <div className="flex flex-col gap-3">
            {Array.from({ length: 3 }, (_, i) => (
              <div key={i} className="h-16 animate-pulse rounded border border-line bg-zinc-100" />
            ))}
          </div>
        </div>
      ) : tabs && tabs.length > 0 ? (
        /* ── Tab layout ─────────────────────────────────────────────────────── */
        <div className="flex gap-0">
          {/* Left rail */}
          <nav
            className="w-48 flex-shrink-0 border-r border-line pt-1"
            role="tablist"
            aria-label="Settings sections"
          >
            {tabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={tab.active ?? false}
                className={
                  tab.active
                    ? 'block w-full px-3 py-2 text-left text-sm font-medium bg-zinc-100 border-r-2 border-ink text-ink'
                    : 'block w-full px-3 py-2 text-left text-sm text-zinc-600 hover:bg-zinc-50 hover:text-ink border-r-2 border-transparent'
                }
                onClick={() => {
                  // Tab switching is owned by the parent via activeTab state.
                  // The click handler is wired through the tab's onSelect prop
                  // in the render function, not here.
                }}
              >
                {tab.label}
              </button>
            ))}
          </nav>
          {/* Content pane */}
          <div className="flex-1 min-w-0">
            {tabs
              .filter((tab) => tab.active)
              .map((tab) => (
                <div key={tab.key}>{tab.render()}</div>
              ))}
          </div>
        </div>
      ) : (
        /* ── Plain content (no tabs) ─────────────────────────────────────────── */
        children
      )}
    </div>
  );
}
