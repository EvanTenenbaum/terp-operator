import type { ColDef } from 'ag-grid-community';
import type { GridRow } from '../../shared/types';

/**
 * Maps rule keys (short identifiers returned by the server or computed
 * client-side) to human-readable full descriptions shown in tooltips.
 */
export interface RuleMap {
  [ruleKey: string]: string;
}

/**
 * AG Grid column factory for a "Why shown" audit column.
 *
 * Renders the short rule key as a formatted label in the cell and shows the
 * full human-readable description from `ruleMap` as a tooltip on hover.
 *
 * Guardrails:
 * - Pure ColDef factory — no React components, no hooks.
 * - Pass `hide: true` on the returned object to keep visible column count ≤ 8.
 *   Example: `{ ...whyShownCol('signal', map), hide: true }`
 *
 * @param field   Row field whose value is a rule key present in `ruleMap`
 * @param ruleMap Mapping of rule key → full human-readable description
 *
 * @example
 * ```ts
 * const toMoveColumns: ColDef<GridRow>[] = [
 *   ...existingCols,
 *   whyShownCol('signal', TO_MOVE_SIGNAL_MAP),
 * ];
 * ```
 */
export function whyShownCol(field: string, ruleMap: RuleMap): ColDef<GridRow> {
  return {
    field,
    headerName: 'Why shown',
    width: 180,
    sortable: false,
    valueFormatter: (params) => {
      const val = String(params.value ?? '');
      if (!val) return '—';
      // Short label: format the key, e.g. 'history_match' → 'History Match'
      return val.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    },
    tooltipValueGetter: (params) => {
      const val = String(params.value ?? '');
      return ruleMap[val] ?? (val ? val.replace(/_/g, ' ') : '');
    },
  };
}

// ---------------------------------------------------------------------------
// InventoryFinder rule map
//
// InventoryFinderPanel uses a custom HTML <table> (not AG Grid), so
// whyShownCol() cannot be applied directly as a ColDef.  This map documents
// the match-reason label prefixes returned by matchReasons() and their plain-
// language descriptions.  It is consumed in the InventoryFinder <td> as a
// native `title` attribute tooltip — the functional equivalent of AG Grid's
// tooltipValueGetter in an HTML table context.
//
// Keys are the static prefix/full string for each reason type.
// ---------------------------------------------------------------------------

export const INVENTORY_FINDER_RULE_MAP: RuleMap = {
  'code match':                'Batch code contains your search text.',
  'source match':              'Source / lot code contains your search text.',
  'shorthand match':           'Shorthand identifier contains your search text.',
  'note match':                'Internal notes on this batch contain your search text.',
  'marker match':              'Legacy marker field matches your search text.',
  'tag match':                 'One or more tags on this batch match your search text.',
  'vendor match':              'Vendor name contains your search text.',
  'price match':               'Price range label contains your search text.',
  'aging':                     'Flagged as aging inventory (days on shelf exceeds threshold).',
  'owner':                     'Ownership status matches the selected filter.',
  'category':                  'Product category matches the selected filter.',
  'tag':                       'A batch tag matches the selected tag filter.',
  'qty':                       'Available quantity meets or exceeds the minimum qty filter.',
  'price':                     'Unit price is at or below the maximum price filter.',
  'catalog media not ready':   'This batch does not yet have catalog-ready photography.',
  'available posted lot':      'No specific filter matched — batch is posted and available.',
};
