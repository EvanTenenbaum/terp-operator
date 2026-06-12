import { X } from 'lucide-react';
import { useId, type ReactNode } from 'react';
import { useFocusTrap } from '../../hooks/useFocusTrap';

/**
 * Template: unified right-edge inspector drawer.
 *
 * Before this template, every row-context surface was its own full drawer
 * component (RowCommandHistoryDrawer, RelationshipDrawer, IssueSidecar, ...),
 * each re-implementing the backdrop, aside, header, close button, scroll
 * body — with inconsistent focus traps (History trapped focus; Issue and
 * Relationship did not) and inconsistent heading markup. Operators had three
 * mutually-exclusive drawers for one selected row.
 *
 * InspectorDrawer owns the chrome ONCE:
 *  - `.row-history-backdrop` + `.row-history-drawer` (existing semantic CSS)
 *  - focus trap + Escape close (uniform across all tabs)
 *  - role="dialog" aria-modal with an accessible name
 *  - header: title · subtitle (row identity) · close icon-button
 *  - a tablist so switching context = switching tab, not closing one drawer
 *    and hunting for another icon
 *
 * Bodies render inside a role="tabpanel" scroll area and must not render
 * their own header/backdrop.
 */
export interface InspectorTab {
  key: string;
  label: string;
  icon?: ReactNode;
  /** Disabled tabs render greyed with `unavailableReason` as the tooltip. */
  available?: boolean;
  unavailableReason?: string;
  render: () => ReactNode;
}

export interface InspectorDrawerProps {
  open: boolean;
  title: string;
  /** Row identity line under the title, e.g. order number or customer. */
  subtitle?: string;
  ariaLabel?: string;
  tabs: InspectorTab[];
  activeTab: string;
  onTabChange: (key: string) => void;
  onClose: () => void;
}

export function InspectorDrawer({
  open,
  title,
  subtitle,
  ariaLabel,
  tabs,
  activeTab,
  onTabChange,
  onClose
}: InspectorDrawerProps) {
  const baseId = useId();
  const drawerRef = useFocusTrap<HTMLElement>(open, onClose);
  if (!open) return null;

  const visibleTabs = tabs;
  const active = visibleTabs.find((tab) => tab.key === activeTab && tab.available !== false) ?? visibleTabs.find((tab) => tab.available !== false);

  function onTabKeyDown(event: React.KeyboardEvent) {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    const enabled = visibleTabs.filter((tab) => tab.available !== false);
    if (!enabled.length || !active) return;
    const index = enabled.findIndex((tab) => tab.key === active.key);
    const next =
      event.key === 'ArrowRight'
        ? enabled[(index + 1) % enabled.length]
        : enabled[(index - 1 + enabled.length) % enabled.length];
    onTabChange(next.key);
  }

  return (
    <>
      <button className="row-history-backdrop" type="button" aria-label={`Close ${title}`} onClick={onClose} />
      <aside ref={drawerRef} className="row-history-drawer" role="dialog" aria-modal="true" aria-label={ariaLabel ?? title}>
        <div className="row-history-header">
          <div>
            <h2 className="text-sm font-semibold text-ink">{title}</h2>
            {subtitle ? <div className="text-xs text-zinc-600">{subtitle}</div> : null}
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label={`Close ${title}`}>
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        {visibleTabs.length > 1 ? (
          <div className="inspector-tabs" role="tablist" aria-label={`${title} sections`} onKeyDown={onTabKeyDown}>
            {visibleTabs.map((tab) => {
              const selected = tab.key === active?.key;
              const disabled = tab.available === false;
              return (
                <button
                  key={tab.key}
                  type="button"
                  role="tab"
                  id={`${baseId}-tab-${tab.key}`}
                  aria-selected={selected}
                  aria-controls={`${baseId}-panel-${tab.key}`}
                  className={`inspector-tab${selected ? ' active' : ''}`}
                  disabled={disabled}
                  title={disabled ? tab.unavailableReason : undefined}
                  tabIndex={selected ? 0 : -1}
                  onClick={() => onTabChange(tab.key)}
                >
                  {tab.icon}
                  {tab.label}
                </button>
              );
            })}
          </div>
        ) : null}
        <div
          className="row-history-list"
          role="tabpanel"
          id={active ? `${baseId}-panel-${active.key}` : undefined}
          aria-labelledby={active ? `${baseId}-tab-${active.key}` : undefined}
        >
          {active?.render()}
        </div>
      </aside>
    </>
  );
}
