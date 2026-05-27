import { useNavigate } from 'react-router-dom';
import { useUiStore } from '../store/uiStore';
import type { ViewKey } from '../../shared/types';

export interface CountPillProps {
  /** The numeric count to display. Renders even when 0. */
  count: number;
  /** Absolute path for navigate() — e.g. '/intake'. */
  route: string;
  /** uiStore ViewKey to call setGridFilter on, if a filter should be applied. */
  filterView?: ViewKey;
  /** Grid filter string, e.g. 'status:ready' or 'mediaStatus:open,in_progress'. */
  filterValue?: string;
  /** Accessible label for screen-readers. Defaults to "{count} items — click to view". */
  label?: string;
  /** Additional class names applied to the button element. */
  className?: string;
}

/**
 * CountPill — a navigable count badge.
 *
 * Renders a `selection-pill`-styled `<button>` that, on click:
 *  1. Applies an optional grid filter to the target view via uiStore.setGridFilter.
 *  2. Navigates to `route` via React Router — back button works normally.
 *
 * Reuses the existing `selection-pill` semantic CSS class (no new styles).
 *
 * Usage:
 *   <CountPill
 *     count={openCount}
 *     route="/inventory"
 *     filterView="inventory"
 *     filterValue="mediaStatus:open,in_progress"
 *     label="inventory items needing media"
 *   />
 */
export function CountPill({
  count,
  route,
  filterView,
  filterValue,
  label,
  className,
}: CountPillProps) {
  const navigate = useNavigate();
  const setGridFilter = useUiStore((state) => state.setGridFilter);

  function handleClick() {
    if (filterView !== undefined && filterValue !== undefined) {
      setGridFilter(filterView, filterValue);
    }
    navigate(route);
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={label ?? `${count} items — click to view`}
      className={[
        'selection-pill',
        'cursor-pointer',
        'hover:border-accent',
        'hover:text-accent',
        'focus:outline-none',
        'focus-visible:shadow-focus',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {count}
    </button>
  );
}
