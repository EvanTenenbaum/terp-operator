import type { ViewKey } from '../../../shared/types';
import { useUiStore } from '../../store/uiStore';

/**
 * Template: declarative grid-filter preset strip.
 *
 * Replaces the hand-rolled `togglePreset / storedGridFilter` pattern that was
 * copy-pasted across OrdersView, PaymentsView, InventoryView, and
 * FulfillmentView (GH #354). One source of truth for:
 *   - toggle semantics (clicking the active preset clears the filter)
 *   - aria-pressed state
 *   - role="group" labeling
 *   - dynamic filters (e.g. "Today" computes the date at render/click time)
 *
 * Filters use the `field:val1,val2` string format consumed by
 * `gridFilterUtils` via `uiStore.setGridFilter`.
 */
export interface FilterPreset {
  /** Stable key; defaults to label. */
  key?: string;
  label: string;
  /** Static filter string, or a function for time-relative presets. */
  filter: string | (() => string);
  /** Optional tooltip clarifying preset semantics (GH #354 naming rule). */
  title?: string;
}

export interface FilterPresetStripProps {
  view: ViewKey;
  presets: FilterPreset[];
  /** Accessible group label, e.g. "Filter by status". */
  ariaLabel: string;
}

function presetFilterValue(preset: FilterPreset): string {
  return typeof preset.filter === 'function' ? preset.filter() : preset.filter;
}

export function FilterPresetStrip({ view, presets, ariaLabel }: FilterPresetStripProps) {
  const setGridFilter = useUiStore((state) => state.setGridFilter);
  const storedGridFilter = useUiStore((state) => state.gridFilters?.[view] ?? '');

  if (!presets.length) return null;

  return (
    <div role="group" aria-label={ariaLabel}>
      {presets.map((preset) => {
        const value = presetFilterValue(preset);
        const active = storedGridFilter === value;
        return (
          <button
            key={preset.key ?? preset.label}
            type="button"
            className="secondary-button compact-action"
            title={preset.title}
            aria-pressed={active}
            onClick={() => setGridFilter(view, active ? '' : value)}
          >
            {preset.label}
          </button>
        );
      })}
    </div>
  );
}
