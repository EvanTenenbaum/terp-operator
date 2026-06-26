import type { GridColDef } from '../../shared/grid-types';
import type { GridColumnPref } from '../store/uiStore';
import type { GridRow } from '../../shared/types';

export interface ParsedGridFilter {
  freeText: string;
  fields: Record<string, string[]>;
}

export function parseGridFilter(value: string): ParsedGridFilter {
  const fields: Record<string, string[]> = {};
  const freeText: string[] = [];
  for (const part of value.split(/\s+/).filter(Boolean)) {
    const [rawKey, ...rawRest] = part.split(':');
    const rest = rawRest.join(':');
    if (rawKey && rest) {
      fields[rawKey] = rest.split(',').map((entry) => entry.trim().toLowerCase()).filter(Boolean);
    } else {
      freeText.push(part);
    }
  }
  return { freeText: freeText.join(' '), fields };
}

export function applyGridFilter(rows: GridRow[], filter: ParsedGridFilter) {
  const entries = Object.entries(filter.fields);
  if (!entries.length) return rows;
  return rows.filter((row) =>
    entries.every(([field, allowed]) => {
      if (!allowed.length) return true;
      const value = String(row[field] ?? '').toLowerCase();
      return allowed.some((candidate) => value === candidate || value.includes(candidate));
    })
  );
}

export function serializeGridFilter(filter: ParsedGridFilter): string {
  const fieldParts = Object.entries(filter.fields)
    .filter(([, values]) => values.length)
    .map(([field, values]) => `${field}:${values.join(',')}`);
  const text = filter.freeText.trim();
  return [...fieldParts, ...(text ? [text] : [])].join(' ').trim();
}

export function removeFilterChip(filter: ParsedGridFilter, field: string, value?: string): ParsedGridFilter {
  const current = filter.fields[field];
  if (!current) return filter;
  if (value === undefined) {
    const { [field]: _drop, ...rest } = filter.fields;
    return { freeText: filter.freeText, fields: rest };
  }
  const next = current.filter((entry) => entry !== value.toLowerCase());
  if (!next.length) {
    const { [field]: _drop, ...rest } = filter.fields;
    return { freeText: filter.freeText, fields: rest };
  }
  return { freeText: filter.freeText, fields: { ...filter.fields, [field]: next } };
}

export interface FilterChip {
  field: string;
  value: string;
}

export function filterChips(filter: ParsedGridFilter): FilterChip[] {
  const chips: FilterChip[] = [];
  for (const [field, values] of Object.entries(filter.fields)) {
    for (const value of values) chips.push({ field, value });
  }
  return chips;
}

/**
 * Extract identifiers of columns: prefer field, fall back to colId.
 * Skips the row-number / chevron internal columns.
 */
export function columnIdentities(columns: GridColDef<GridRow>[]): Array<{ id: string; label: string }> {
  return columns
    .map((column) => {
      const id = column.colId ?? column.field;
      if (!id) return null;
      if (id === 'rowNumber' || id === 'expansion-chevron') return null;
      const label = column.headerName ?? String(column.field ?? id);
      return { id: String(id), label };
    })
    .filter((entry): entry is { id: string; label: string } => Boolean(entry));
}

export function mergeColumnDefsWithPrefs(
  columns: GridColDef<GridRow>[],
  prefs: GridColumnPref[] | undefined
): GridColDef<GridRow>[] {
  if (!prefs?.length) return columns;
  const byId = new Map(prefs.map((pref) => [pref.colId, pref]));
  const next = columns.map((column) => {
    const id = column.colId ?? column.field;
    if (!id) return column;
    const pref = byId.get(String(id));
    if (!pref) return column;
    return {
      ...column,
      hide: pref.hide ?? column.hide,
      width: pref.width ?? column.width,
      pinned: pref.pinned ?? column.pinned
    };
  });

  // Reorder columns by pref order when prefs include an order
  const orderIndex = new Map<string, number>();
  prefs.forEach((pref, index) => orderIndex.set(pref.colId, index));
  next.sort((a, b) => {
    const aId = String(a.colId ?? a.field ?? '');
    const bId = String(b.colId ?? b.field ?? '');
    const aHas = orderIndex.has(aId);
    const bHas = orderIndex.has(bId);
    if (aHas && bHas) return (orderIndex.get(aId) ?? 0) - (orderIndex.get(bId) ?? 0);
    if (aHas) return -1;
    if (bHas) return 1;
    return 0;
  });
  return next;
}

export interface ColumnStateLike {
  colId: string;
  hide?: boolean | null;
  width?: number | null;
  pinned?: 'left' | 'right' | null;
  sort?: 'asc' | 'desc' | null;
  sortIndex?: number | null;
}

export function columnStateToPrefs(state: ColumnStateLike[]): GridColumnPref[] {
  return state
    .filter((entry) => entry.colId && entry.colId !== 'rowNumber' && entry.colId !== 'expansion-chevron')
    .map((entry) => ({
      colId: entry.colId,
      hide: entry.hide ?? undefined,
      width: entry.width ?? undefined,
      pinned: entry.pinned ?? null,
      sort: entry.sort ?? null,
      sortIndex: entry.sortIndex ?? null
    }));
}
