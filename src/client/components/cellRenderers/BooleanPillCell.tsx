import type { ICellRendererParams } from 'ag-grid-community';
import clsx from 'clsx';

/**
 * Resolve AG Grid cell value to a boolean or null.
 *
 * Accepts:
 *  - boolean             → returned as-is
 *  - number              → 1 = true, 0 = false
 *  - string              → 'true'/'yes'/'1' = true, 'false'/'no'/'0' = false
 *  - null / undefined    → null (render nothing)
 *  - anything else       → null
 */
function resolveBoolean(value: unknown): boolean | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (value === 1) return true;
    if (value === 0) return false;
    return null;
  }
  if (typeof value === 'string') {
    const lower = value.trim().toLowerCase();
    if (lower === 'true' || lower === 'yes' || lower === '1') return true;
    if (lower === 'false' || lower === 'no' || lower === '0') return false;
  }
  return null;
}

/**
 * BooleanPillCell — AG Grid cell renderer that displays boolean values as pills.
 *
 * - `true`  → green "Yes" pill (accent bg at low opacity)
 * - `false` → gray "No" pill (zinc-400 bg at low opacity)
 * - `null` / `undefined` / unrecognized → renders nothing
 *
 * Compatible with AG Grid's `cellRenderer` property:
 * ```ts
 * { field: 'isActive', cellRenderer: BooleanPillCell }
 * ```
 */
export default function BooleanPillCell({ value }: ICellRendererParams) {
  const bool = resolveBoolean(value);

  if (bool === null) return null;

  return (
    <span
      className={clsx(
        'inline-flex items-center rounded px-2 text-[11px] font-medium leading-none',
        'min-h-[18px] h-[20px]',
        bool
          ? 'bg-accent/10 text-accent'
          : 'bg-zinc-400/10 text-zinc-600',
      )}
    >
      {bool ? 'Yes' : 'No'}
    </span>
  );
}
