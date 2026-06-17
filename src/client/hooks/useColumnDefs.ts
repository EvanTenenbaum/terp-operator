import { useMemo } from 'react';
import type { ColDef, ValueFormatterParams } from 'ag-grid-community';
import {
  entitySchemas,
  type FieldDefinition,
  type FieldType,
} from '../config/entity-schemas';
import { useUiStore } from '../store/uiStore';
import { formatMoney, formatTs, formatBool, formatNumber } from '../utils/format';
import ComboboxCellEditor from '../components/editors/ComboboxCellEditor';

// ── Type → filter mapping ────────────────────────────────────────────────────

const TYPE_FILTER: Record<FieldType, string | boolean> = {
  text: 'agTextColumnFilter',
  numeric: 'agNumberColumnFilter',
  currency: 'agNumberColumnFilter',
  date: 'agDateColumnFilter',
  boolean: 'agSetColumnFilter',
  enum: 'agTextColumnFilter',
  combobox: 'agTextColumnFilter',
  tags: 'agTextColumnFilter',
};

// ── Type → AG Grid column type ───────────────────────────────────────────────

const TYPE_GRID_TYPE: Partial<Record<FieldType, string>> = {
  numeric: 'numericColumn',
  currency: 'numericColumn',
  date: 'date',
};

// ── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Generates AG Grid ColDef arrays from entity schemas defined in
 * `src/client/config/entity-schemas.ts`.
 *
 * Replaces per-view ColDef arrays (ARCH-8: Table IS the view, UX-8: Every grid
 * column must originate in the schema registry). Persisted operator column
 * preferences (width, visibility, pin) are read from `useUiStore.gridColumnPrefs`
 * keyed by entityType.
 *
 * @param entityType Entity key matching an entry in {@link entitySchemas}
 *                   (e.g. 'purchaseOrder', 'sale', 'intake').
 * @param overrides  Partial ColDefs to merge by `field` or `colId` key. The
 *                   consumer is responsible for providing a stable reference
 *                   (e.g. via `useMemo`) to avoid unnecessary recomputation.
 * @returns AG Grid ColDef array ordered per the schema's {@link FieldDefinition}
 *          array. Returns empty array when the entityType is not found.
 *
 * @example
 * const columns = useColumnDefs('purchaseOrder', [
 *   { field: 'poNo', headerName: 'PO', width: 160 },
 * ]);
 */
export function useColumnDefs(
  entityType: string,
  overrides?: Partial<ColDef>[],
): ColDef[] {
  const prefs = useUiStore(
    (state) => state.gridColumnPrefs[entityType] ?? [],
  );

  return useMemo(() => {
    const schema = entitySchemas[entityType];
    if (!schema) return [];

    let defs: ColDef[] = schema.fields.map(fieldToColDef);

    // Apply view-level overrides by field or colId key.
    if (overrides?.length) {
      const overrideByKey = new Map<string, Partial<ColDef>>();
      for (const o of overrides) {
        const rawKey =
          (o as Record<string, unknown>).colId ??
          (o as Record<string, unknown>).field;
        if (typeof rawKey === 'string' && rawKey.length > 0) {
          overrideByKey.set(rawKey, o);
        }
      }
      for (const def of defs) {
        const key = (def.colId ?? def.field ?? '') as string;
        const override = overrideByKey.get(key);
        if (override) Object.assign(def, override);
      }
    }

    // Apply persisted operator column prefs (width, visibility, pin).
    if (prefs.length) {
      const prefByColId = new Map(prefs.map((p) => [p.colId, p]));
      for (const def of defs) {
        const colId = String(def.colId ?? def.field ?? '');
        const pref = prefByColId.get(colId);
        if (pref) {
          if (pref.hide !== undefined) def.hide = pref.hide;
          if (pref.width !== undefined) def.width = pref.width;
          if (pref.pinned !== undefined) {
            def.pinned = pref.pinned ?? undefined;
          }
        }
      }
    }

    return defs;
  }, [entityType, overrides, prefs]);
}

// ── FieldDefinition → ColDef mapper ──────────────────────────────────────────

/**
 * Converts a single {@link FieldDefinition} into an AG Grid {@link ColDef}.
 *
 * Mapping rules (type-driven):
 * - `text`       → `filter: 'agTextColumnFilter'`, no special grid type
 * - `numeric`    → `type: 'numericColumn'`, right-aligned, en-US number format
 * - `currency`   → `type: 'numericColumn'`, right-aligned, en-US currency format
 * - `date`       → `type: 'date'`, short date formatter, timestamp comparator
 * - `boolean`    → `filter: 'agSetColumnFilter'`, Yes/No formatter, centered
 * - `enum`       → `ComboboxCellEditor` when editable (status uses StatusPill
 *                  via OperatorGrid's `withStatusRenderer`)
 * - `combobox`   → `ComboboxCellEditor` when editable (options loaded via
 *                  `comboboxSource`)
 * - `tags`       → (cellRenderer downstream)
 *
 * Attention tier:
 * - Tier 0 → visible (`hide: false`)
 * - Tier 1 → visible (`hide: false`)
 * - Tier 2 → hidden by default (`hide: true`), reachable via Columns menu
 */
function fieldToColDef(f: FieldDefinition): ColDef {
  const base: ColDef = {
    colId: f.field,
    field: f.field,
    headerName: f.headerName,
    width: f.width,
    sortable: f.sortable,
    filter: f.filterable ? (TYPE_FILTER[f.type] ?? true) : false,
    editable: f.editable,
    hide: f.attentionTier === 2 ? true : false,
    cellDataType: false,
  };

  // AG Grid column type (drives built-in filter/sort/format behaviours).
  const gridType = TYPE_GRID_TYPE[f.type];
  if (gridType) {
    base.type = gridType;
  }

  // Pin position.
  if (f.pinned) {
    base.pinned = f.pinned;
  }

  // Minimum role — custom ColDef extension consumed by the Columns menu.
  if (f.minRole) {
    (base as Record<string, unknown>).minRole = f.minRole;
  }

  // ── Type-specific formatters, editors, renderers ──────────────────────────

  switch (f.type) {
    case 'currency':
      base.valueFormatter = (params: ValueFormatterParams) => {
        if (params.value == null) return '';
        return formatMoney(Number(params.value));
      };
      base.cellClass = 'text-right tabular-nums';
      break;

    case 'numeric':
      base.valueFormatter = (params: ValueFormatterParams) => {
        if (params.value == null) return '';
        return formatNumber(Number(params.value));
      };
      base.cellClass = 'text-right tabular-nums';
      break;

    case 'date':
      base.valueFormatter = (params: ValueFormatterParams) =>
        formatTs(params.value as Date | string | number | null, {
          variant: 'short',
        });
      base.comparator = (
        a: unknown,
        b: unknown,
      ): number => {
        const ta = a == null ? 0 : new Date(a as string | number).getTime();
        const tb = b == null ? 0 : new Date(b as string | number).getTime();
        return (Number.isNaN(ta) ? 0 : ta) - (Number.isNaN(tb) ? 0 : tb);
      };
      break;

    case 'boolean':
      base.valueFormatter = (params: ValueFormatterParams) =>
        formatBool(params.value);
      base.cellClass = 'text-center';
      break;

    case 'enum': {
      // Status columns are rendered via StatusPill by OperatorGrid's
      // `withStatusRenderer` — do not conflict with that enhancement.
      if (f.editable) {
        base.cellEditor = ComboboxCellEditor as unknown as ColDef['cellEditor'];
        base.cellEditorParams = {
          options: [],
          placeholder: `Select ${f.headerName.toLowerCase()}`,
        } as ColDef['cellEditorParams'];
      }
      break;
    }

    case 'combobox': {
      if (f.editable) {
        base.cellEditor = ComboboxCellEditor as unknown as ColDef['cellEditor'];
        base.cellEditorParams = {
          options: [],
          placeholder: `Select ${f.headerName.toLowerCase()}`,
          // async options loaded via comboboxSource trpc procedure (future).
        } as ColDef['cellEditorParams'];
      }
      break;
    }

    case 'tags':
      // Tag chip cellRenderer applied downstream by OperatorGrid enhancements.
      break;

    case 'text':
    default:
      break;
  }

  return base;
}
