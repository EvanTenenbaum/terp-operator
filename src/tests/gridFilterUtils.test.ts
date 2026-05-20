import { describe, expect, it } from 'vitest';
import type { ColDef } from 'ag-grid-community';
import {
  applyGridFilter,
  columnIdentities,
  columnStateToPrefs,
  filterChips,
  mergeColumnDefsWithPrefs,
  parseGridFilter,
  removeFilterChip,
  serializeGridFilter
} from '../client/components/gridFilterUtils';
import type { GridRow } from '../shared/types';

describe('parseGridFilter', () => {
  it('parses field:value pairs and free text', () => {
    const parsed = parseGridFilter('category:Flower vendor:Acme,Beta hello world');
    expect(parsed.fields.category).toEqual(['flower']);
    expect(parsed.fields.vendor).toEqual(['acme', 'beta']);
    expect(parsed.freeText).toBe('hello world');
  });

  it('returns empty fields for plain text', () => {
    const parsed = parseGridFilter('just text');
    expect(parsed.fields).toEqual({});
    expect(parsed.freeText).toBe('just text');
  });
});

describe('applyGridFilter', () => {
  const rows: GridRow[] = [
    { id: '1', category: 'Flower', vendor: 'Acme' },
    { id: '2', category: 'Vape', vendor: 'Acme' },
    { id: '3', category: 'Flower', vendor: 'Beta' }
  ];

  it('filters by single field', () => {
    const filtered = applyGridFilter(rows, parseGridFilter('category:Flower'));
    expect(filtered.map((r) => r.id)).toEqual(['1', '3']);
  });

  it('filters by multiple field constraints', () => {
    const filtered = applyGridFilter(rows, parseGridFilter('category:Flower vendor:Beta'));
    expect(filtered.map((r) => r.id)).toEqual(['3']);
  });

  it('uses OR semantics within a field', () => {
    const filtered = applyGridFilter(rows, parseGridFilter('vendor:Acme,Beta'));
    expect(filtered.map((r) => r.id).sort()).toEqual(['1', '2', '3']);
  });

  it('returns all rows when no field filters present', () => {
    const filtered = applyGridFilter(rows, parseGridFilter('plain text'));
    expect(filtered.length).toBe(3);
  });
});

describe('removeFilterChip', () => {
  it('removes a specific value from a multi-value field', () => {
    const filter = parseGridFilter('vendor:Acme,Beta category:Flower');
    const next = removeFilterChip(filter, 'vendor', 'Acme');
    expect(next.fields.vendor).toEqual(['beta']);
    expect(next.fields.category).toEqual(['flower']);
  });

  it('drops the field entirely when last value removed', () => {
    const filter = parseGridFilter('vendor:Acme category:Flower');
    const next = removeFilterChip(filter, 'vendor', 'Acme');
    expect(next.fields.vendor).toBeUndefined();
    expect(next.fields.category).toEqual(['flower']);
  });

  it('drops field when value omitted', () => {
    const filter = parseGridFilter('vendor:Acme,Beta category:Flower');
    const next = removeFilterChip(filter, 'vendor');
    expect(next.fields.vendor).toBeUndefined();
  });

  it('no-ops for unknown field', () => {
    const filter = parseGridFilter('vendor:Acme');
    const next = removeFilterChip(filter, 'category', 'Flower');
    expect(next).toBe(filter);
  });
});

describe('serializeGridFilter', () => {
  it('round-trips a parsed filter', () => {
    const filter = parseGridFilter('category:flower vendor:acme,beta hello');
    expect(serializeGridFilter(filter)).toContain('category:flower');
    expect(serializeGridFilter(filter)).toContain('vendor:acme,beta');
    expect(serializeGridFilter(filter)).toContain('hello');
  });
});

describe('filterChips', () => {
  it('expands fields to chips', () => {
    const chips = filterChips(parseGridFilter('vendor:Acme,Beta category:Flower'));
    expect(chips).toContainEqual({ field: 'vendor', value: 'acme' });
    expect(chips).toContainEqual({ field: 'vendor', value: 'beta' });
    expect(chips).toContainEqual({ field: 'category', value: 'flower' });
  });
});

describe('columnIdentities', () => {
  it('extracts ids and labels from column defs', () => {
    const cols: ColDef<GridRow>[] = [
      { field: 'name', headerName: 'Name' },
      { field: 'qty' },
      { colId: 'rowNumber', headerName: '#' }
    ];
    const ids = columnIdentities(cols);
    expect(ids).toEqual([
      { id: 'name', label: 'Name' },
      { id: 'qty', label: 'qty' }
    ]);
  });
});

describe('mergeColumnDefsWithPrefs', () => {
  const cols: ColDef<GridRow>[] = [
    { field: 'a', width: 100 },
    { field: 'b', width: 100 },
    { field: 'c', width: 100 }
  ];

  it('applies hide/width/pinned overrides', () => {
    const merged = mergeColumnDefsWithPrefs(cols, [
      { colId: 'a', hide: true, width: 200 },
      { colId: 'c', pinned: 'right' }
    ]);
    expect(merged.find((c) => c.field === 'a')?.hide).toBe(true);
    expect(merged.find((c) => c.field === 'a')?.width).toBe(200);
    expect(merged.find((c) => c.field === 'c')?.pinned).toBe('right');
  });

  it('reorders columns by prefs order', () => {
    const merged = mergeColumnDefsWithPrefs(cols, [
      { colId: 'c' },
      { colId: 'a' },
      { colId: 'b' }
    ]);
    expect(merged.map((c) => c.field)).toEqual(['c', 'a', 'b']);
  });

  it('returns input untouched when no prefs', () => {
    expect(mergeColumnDefsWithPrefs(cols, undefined)).toBe(cols);
    expect(mergeColumnDefsWithPrefs(cols, [])).toBe(cols);
  });
});

describe('columnStateToPrefs', () => {
  it('skips internal row-number/expansion columns', () => {
    const prefs = columnStateToPrefs([
      { colId: 'rowNumber', width: 50 },
      { colId: 'expansion-chevron', width: 48 },
      { colId: 'foo', hide: false, width: 200, pinned: null }
    ]);
    expect(prefs).toEqual([
      { colId: 'foo', hide: false, width: 200, pinned: null, sort: null, sortIndex: null }
    ]);
  });
});
