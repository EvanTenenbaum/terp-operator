/**
 * UX-C02 — TSV clipboard paste utilities.
 *
 * Contract:
 * 1. parseTsv splits on tabs and supports CR/LF, CRLF, and LF line endings.
 * 2. parseTsv skips empty/whitespace-only lines.
 * 3. mapTsvToFields handles optional header row detection.
 * 4. mapTsvToFields marks cells as invalid when validator returns false.
 * 5. pasteSummary returns "N rows pasted" with singular/plural forms.
 * 6. pasteSummary includes "M need fixes" when rows have errors.
 * 7. mapTsvToFields matches pasted values against optionSources and flags unmatched.
 * 8. pasteSummary includes "flagged for review" for rows with unmatched values.
 */
import { describe, it, expect } from 'vitest';
import { parseTsv, mapTsvToFields, pasteSummary, type PastedRow } from './clipboardPaste';

describe('parseTsv', () => {
  it('splits tab-delimited cells', () => {
    const result = parseTsv('a\tb\tc');
    expect(result).toEqual([['a', 'b', 'c']]);
  });

  it('handles multiple LF-separated rows', () => {
    const result = parseTsv('a\tb\ncc\tdd');
    expect(result).toEqual([['a', 'b'], ['cc', 'dd']]);
  });

  it('handles CRLF line endings', () => {
    const result = parseTsv('a\tb\r\ncc\tdd');
    expect(result).toEqual([['a', 'b'], ['cc', 'dd']]);
  });

  it('handles CR-only line endings', () => {
    const result = parseTsv('a\tb\rcc\tdd');
    expect(result).toEqual([['a', 'b'], ['cc', 'dd']]);
  });

  it('skips empty and whitespace-only lines', () => {
    const result = parseTsv('a\tb\n\n  \ncc\tdd');
    expect(result).toEqual([['a', 'b'], ['cc', 'dd']]);
  });

  it('returns empty array for empty string', () => {
    expect(parseTsv('')).toEqual([]);
  });

  it('returns empty array for whitespace-only string', () => {
    expect(parseTsv('   \n  ')).toEqual([]);
  });
});

describe('mapTsvToFields', () => {
  it('maps columns left-to-right when no header row detected', () => {
    const rows = parseTsv('2026-01-01\t100\tcash');
    const result = mapTsvToFields(rows, ['date', 'amount', 'method']);
    expect(result).toHaveLength(1);
    expect(result[0].fields).toEqual([
      { key: 'date', value: '2026-01-01', invalid: false },
      { key: 'amount', value: '100', invalid: false },
      { key: 'method', value: 'cash', invalid: false },
    ]);
  });

  it('detects header row when first row contains known field names', () => {
    const rows = parseTsv('date\tamount\tmethod\n2026-01-01\t100\tcash');
    const result = mapTsvToFields(rows, ['date', 'amount', 'method']);
    expect(result).toHaveLength(1);
    expect(result[0].fields[0].value).toBe('2026-01-01');
  });

  it('marks cells as invalid when validator returns false', () => {
    const rows = parseTsv('2026-01-01\tnot-a-number\tcash');
    const result = mapTsvToFields(rows, ['date', 'amount', 'method'], {
      amount: (v) => /^\d+(\.\d+)?$/.test(v),
    });
    expect(result[0].fields[1].invalid).toBe(true);
    expect(result[0].hasErrors).toBe(true);
  });

  it('hasErrors is false when no validators fail', () => {
    const rows = parseTsv('2026-01-01\t100\tcash');
    const result = mapTsvToFields(rows, ['date', 'amount', 'method'], {
      amount: (v) => /^\d+(\.\d+)?$/.test(v),
    });
    expect(result[0].hasErrors).toBe(false);
  });

  it('handles fewer cells than fields (missing cells default to empty string)', () => {
    const rows = parseTsv('2026-01-01\t100');
    const result = mapTsvToFields(rows, ['date', 'amount', 'method']);
    expect(result[0].fields).toHaveLength(2); // only headers mapped to data
  });

  // ── Smart paste: optionSource matching ────────────────────────────────
  it('matches pasted values against optionSources and marks unmatched', () => {
    const rows = parseTsv('net30\tcod\tbadval');
    const optionSources = {
      terms: {
        kind: 'enum',
        values: [
          { value: 'net30', label: 'Net 30' },
          { value: 'net15', label: 'Net 15' },
          { value: 'cod', label: 'COD' },
        ],
      },
    };
    const result = mapTsvToFields(
      rows,
      ['terms', 'terms', 'terms'],
      undefined,
      optionSources,
    );
    expect(result[0].fields[0]).toEqual({ key: 'terms', value: 'net30', invalid: false, unmatched: undefined });
    expect(result[0].fields[1]).toEqual({ key: 'terms', value: 'cod', invalid: false, unmatched: undefined });
    expect(result[0].fields[2].unmatched).toBe(true);
    expect(result[0].fields[2].value).toBe('badval'); // value kept, not rejected
    expect(result[0].hasErrors).toBe(false); // unmatched is not an error
    expect(result[0].hasUnmatched).toBe(true);
  });

  it('matches by label as well as value', () => {
    const rows = parseTsv('Net 30');
    const optionSources = {
      terms: {
        kind: 'enum',
        values: [{ value: 'net30', label: 'Net 30' }],
      },
    };
    const result = mapTsvToFields(
      rows,
      ['terms'],
      undefined,
      optionSources,
    );
    expect(result[0].fields[0].unmatched).toBeUndefined(); // matched by label
    expect(result[0].fields[0].value).toBe('Net 30');
  });

  it('does not flag unmatched when optionSources.kind is not enum/status', () => {
    const rows = parseTsv('anything');
    const optionSources = {
      field: { kind: 'combobox', entityType: 'thing' },
    };
    const result = mapTsvToFields(
      rows,
      ['field'],
      undefined,
      optionSources as any,
    );
    expect(result[0].fields[0].unmatched).toBeUndefined();
  });

  it('does not flag empty values', () => {
    // Tab character between values: first field has text, second is empty
    const rows = parseTsv('net30\t');
    const optionSources = {
      terms: {
        kind: 'enum',
        values: [{ value: 'net30', label: 'Net 30' }],
      },
    };
    const result = mapTsvToFields(
      rows,
      ['terms', 'other'],
      undefined,
      optionSources,
    );
    expect(result[0].fields[0].unmatched).toBeUndefined(); // matched
    expect(result[0].fields[1].unmatched).toBeUndefined(); // empty value, not flagged
  });
});

describe('pasteSummary', () => {
  it('returns singular "1 row pasted" for a single no-error row', () => {
    const rows: PastedRow[] = [{ fields: [], hasErrors: false }];
    expect(pasteSummary(rows)).toBe('1 row pasted');
  });

  it('returns plural "3 rows pasted" for three no-error rows', () => {
    const rows: PastedRow[] = [
      { fields: [], hasErrors: false },
      { fields: [], hasErrors: false },
      { fields: [], hasErrors: false },
    ];
    expect(pasteSummary(rows)).toBe('3 rows pasted');
  });

  it('includes "needs fixes" message when rows have errors', () => {
    const rows: PastedRow[] = [
      { fields: [], hasErrors: false },
      { fields: [], hasErrors: true },
      { fields: [], hasErrors: true },
    ];
    expect(pasteSummary(rows)).toBe('3 rows pasted, 2 need fixes');
  });

  it('singular "needs" when exactly 1 error row', () => {
    const rows: PastedRow[] = [
      { fields: [], hasErrors: false },
      { fields: [], hasErrors: true },
    ];
    expect(pasteSummary(rows)).toBe('2 rows pasted, 1 needs fixes');
  });

  it('includes "flagged for review" for unmatched (not error) rows', () => {
    const rows: PastedRow[] = [
      { fields: [], hasErrors: false, hasUnmatched: false },
      { fields: [], hasErrors: false, hasUnmatched: true },
      { fields: [], hasErrors: false, hasUnmatched: true },
    ];
    expect(pasteSummary(rows)).toBe('3 rows pasted, 2 flagged for review');
  });

  it('error rows with unmatched are not double-counted in review count', () => {
    const rows: PastedRow[] = [
      { fields: [], hasErrors: true, hasUnmatched: true },
    ];
    // hasErrors takes priority — unmatched counted only when !hasErrors
    expect(pasteSummary(rows)).toBe('1 row pasted, 1 needs fixes');
  });
});
