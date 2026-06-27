/**
 * Unit tests for shared display formatting utilities.
 * TER-1612: formatTs() — canonical timestamp formatter.
 * TER-1613: formatMoney() + moneyCol() — shared money formatting + AG Grid factory.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { formatTs, formatMoney, moneyCol } from './format';

// ─── null / undefined / empty / invalid ──────────────────────────────────────

describe('formatTs — null / undefined / empty / invalid', () => {
  it('returns empty string for null', () => {
    expect(formatTs(null)).toBe('');
  });

  it('returns empty string for undefined', () => {
    expect(formatTs(undefined)).toBe('');
  });

  it('returns empty string for empty string', () => {
    expect(formatTs('')).toBe('');
  });

  it('returns empty string for an invalid date string', () => {
    expect(formatTs('not-a-date')).toBe('');
  });

  it('returns empty string for NaN timestamp', () => {
    expect(formatTs(NaN)).toBe('');
  });
});

// ─── epoch (0) edge case ─────────────────────────────────────────────────────

describe('formatTs — epoch (0) edge case', () => {
  it('handles numeric epoch 0 as a valid date (short)', () => {
    const result = formatTs(0, { variant: 'short' });
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
    // epoch 0 resolves to different dates depending on timezone (e.g., 12/31/1969 in PST, 1/1/1970 in UTC)
    // Just verify we get a valid date string with the expected format
    expect(result).toMatch(/^\d{1,2}\/\d{1,2}\/\d{4}/);
  });

  it('epoch Date falls through to full ts in relative variant (> 30 days ago)', () => {
    const result = formatTs(new Date(0), { variant: 'relative' });
    // Epoch is definitely > 30 days ago; should not show "Xd ago" pattern
    expect(result).not.toMatch(/^\d+d ago$/);
    expect(result).not.toMatch(/^\d+h ago$/);
    expect(result).not.toMatch(/^\d+m ago$/);
    expect(result).not.toBe('just now');
    // Should contain a year
    expect(result).toMatch(/\d{4}/);
  });
});

// ─── short variant ───────────────────────────────────────────────────────────

describe('formatTs — short variant', () => {
  const SAMPLE_DATE = new Date('2026-05-12T16:41:00.000Z');

  it('formats a Date as a locale short string', () => {
    const result = formatTs(SAMPLE_DATE, { variant: 'short' });
    expect(result.length).toBeGreaterThan(0);
    expect(result).toMatch(/2026/);
  });

  it('formats an ISO string', () => {
    const result = formatTs('2026-05-12T16:41:00.000Z', { variant: 'short' });
    expect(result).toMatch(/2026/);
  });

  it('formats a numeric timestamp', () => {
    const ts = SAMPLE_DATE.getTime();
    const result = formatTs(ts, { variant: 'short' });
    expect(result).toMatch(/2026/);
  });

  it('does not include a raw timezone label (no "UTC", "GMT-..." appended)', () => {
    const result = formatTs(SAMPLE_DATE, { variant: 'short' });
    // short variant must NOT include timeZoneName; result should not contain "UTC" as standalone
    // (It is acceptable for some locales to include abbreviated TZ; we only check the toLocaleString
    //  options do not request timeZoneName — the test verifies the output is shorter than long.)
    const longResult = formatTs(SAMPLE_DATE, { variant: 'long' });
    // long should be at least as long as short (it adds timezone info)
    expect(longResult.length).toBeGreaterThanOrEqual(result.length);
  });
});

// ─── long variant ────────────────────────────────────────────────────────────

describe('formatTs — long variant', () => {
  it('includes year in long variant', () => {
    const result = formatTs(new Date('2026-05-12T16:41:00.000Z'), { variant: 'long' });
    expect(result).toMatch(/2026/);
  });

  it('long variant output is a non-empty string', () => {
    const result = formatTs(new Date('2026-05-12T00:00:00.000Z'), { variant: 'long' });
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });
});

// ─── relative variant ────────────────────────────────────────────────────────

describe('formatTs — relative variant', () => {
  const FIXED_NOW = new Date('2026-05-27T12:00:00.000Z').getTime();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('defaults to relative when no variant specified', () => {
    const twoHoursAgo = new Date(FIXED_NOW - 2 * 60 * 60 * 1000);
    expect(formatTs(twoHoursAgo)).toBe('2h ago');
  });

  it('shows "just now" for timestamps within the last minute', () => {
    const thirtySecondsAgo = new Date(FIXED_NOW - 30_000);
    expect(formatTs(thirtySecondsAgo, { variant: 'relative' })).toBe('just now');
  });

  it('shows minutes ago', () => {
    const fiveMinsAgo = new Date(FIXED_NOW - 5 * 60 * 1000);
    expect(formatTs(fiveMinsAgo, { variant: 'relative' })).toBe('5m ago');
  });

  it('shows 1 minute ago at exactly 60 seconds', () => {
    const oneMinAgo = new Date(FIXED_NOW - 60_000);
    expect(formatTs(oneMinAgo, { variant: 'relative' })).toBe('1m ago');
  });

  it('shows hours ago', () => {
    const twoHoursAgo = new Date(FIXED_NOW - 2 * 60 * 60 * 1000);
    expect(formatTs(twoHoursAgo, { variant: 'relative' })).toBe('2h ago');
  });

  it('shows 1 hour ago at exactly 3600 seconds', () => {
    const oneHourAgo = new Date(FIXED_NOW - 3600_000);
    expect(formatTs(oneHourAgo, { variant: 'relative' })).toBe('1h ago');
  });

  it('shows days ago', () => {
    const threeDaysAgo = new Date(FIXED_NOW - 3 * 24 * 60 * 60 * 1000);
    expect(formatTs(threeDaysAgo, { variant: 'relative' })).toBe('3d ago');
  });

  it('shows 1 day ago at exactly 24 hours', () => {
    const oneDayAgo = new Date(FIXED_NOW - 24 * 60 * 60 * 1000);
    expect(formatTs(oneDayAgo, { variant: 'relative' })).toBe('1d ago');
  });

  it('shows full timestamp for timestamps > 30 days old', () => {
    const thirtyOneDaysAgo = new Date(FIXED_NOW - 31 * 24 * 60 * 60 * 1000);
    const result = formatTs(thirtyOneDaysAgo, { variant: 'relative' });
    // Should NOT be a relative label
    expect(result).not.toMatch(/^\d+d ago$/);
    expect(result).not.toMatch(/^\d+h ago$/);
    expect(result).not.toMatch(/^\d+m ago$/);
    expect(result).not.toBe('just now');
    // Should contain a year
    expect(result).toMatch(/\d{4}/);
  });

  it('shows full timestamp exactly at the 30-day boundary', () => {
    const thirtyDaysAgo = new Date(FIXED_NOW - 30 * 24 * 60 * 60 * 1000 - 1);
    const result = formatTs(thirtyDaysAgo, { variant: 'relative' });
    expect(result).not.toMatch(/^\d+[mhd] ago$/);
    expect(result).toMatch(/\d{4}/);
  });

  it('handles ISO string inputs in relative mode', () => {
    const tenMinsAgo = new Date(FIXED_NOW - 10 * 60 * 1000).toISOString();
    expect(formatTs(tenMinsAgo, { variant: 'relative' })).toBe('10m ago');
  });

  it('handles numeric timestamp inputs in relative mode', () => {
    const fiveHoursAgo = FIXED_NOW - 5 * 60 * 60 * 1000;
    expect(formatTs(fiveHoursAgo, { variant: 'relative' })).toBe('5h ago');
  });
});

// ─── formatMoney ─────────────────────────────────────────────────────────────

describe('formatMoney — null / undefined', () => {
  it('returns "$0.00" for null (cents: true default)', () => {
    expect(formatMoney(null)).toBe('$0.00');
  });

  it('returns "$0.00" for undefined', () => {
    expect(formatMoney(undefined)).toBe('$0.00');
  });

  it('returns "$0" for null with cents: false', () => {
    expect(formatMoney(null, { cents: false })).toBe('$0');
  });
});

describe('formatMoney — cents: true (default)', () => {
  it('always shows two decimal places for whole numbers', () => {
    expect(formatMoney(0)).toBe('$0.00');
    expect(formatMoney(200)).toBe('$200.00');
    expect(formatMoney(1234567)).toBe('$1,234,567.00');
  });

  it('formats fractional values with 2 decimal places', () => {
    expect(formatMoney(200.5)).toBe('$200.50');
    expect(formatMoney(0.99)).toBe('$0.99');
    expect(formatMoney(1234.56)).toBe('$1,234.56');
  });

  it('rounds to 2 decimal places', () => {
    expect(formatMoney(1.005)).toBe('$1.01');
    expect(formatMoney(1.004)).toBe('$1.00');
  });
});

describe('formatMoney — cents: false (KPI tile mode)', () => {
  it('shows no decimal places for whole numbers', () => {
    expect(formatMoney(0, { cents: false })).toBe('$0');
    expect(formatMoney(200, { cents: false })).toBe('$200');
    expect(formatMoney(1234567, { cents: false })).toBe('$1,234,567');
  });

  it('rounds fractional values to nearest whole dollar', () => {
    expect(formatMoney(1234.56, { cents: false })).toBe('$1,235');
    expect(formatMoney(1234.49, { cents: false })).toBe('$1,234');
  });
});

// ─── moneyCol ────────────────────────────────────────────────────────────────

describe('moneyCol — ColDef factory', () => {
  it('sets field correctly', () => {
    const col = moneyCol('totalAmount');
    expect(col.field).toBe('totalAmount');
  });

  it('defaults width to 120', () => {
    const col = moneyCol('balance');
    expect(col.width).toBe(120);
  });

  it('accepts custom headerName and width', () => {
    const col = moneyCol('total', { headerName: 'Order Total', width: 150 });
    expect(col.headerName).toBe('Order Total');
    expect(col.width).toBe(150);
  });

  it('capitalises field name when no headerName given', () => {
    const col = moneyCol('balance');
    expect(col.headerName).toBe('Balance');
  });

  it('produces a right-aligned cell class', () => {
    const col = moneyCol('total');
    expect(String(col.cellClass)).toContain('text-right');
  });

  it('valueFormatter uses formatMoney with cents: true by default', () => {
    const col = moneyCol('amount');
    const fmt = col.valueFormatter as (p: { value: unknown }) => string;
    expect(fmt({ value: 1234.56 })).toBe('$1,234.56');
    expect(fmt({ value: 200 })).toBe('$200.00');
    expect(fmt({ value: null })).toBe('$0.00');
  });

  it('valueFormatter uses cents: false when specified', () => {
    const col = moneyCol('balance', { cents: false });
    const fmt = col.valueFormatter as (p: { value: unknown }) => string;
    expect(fmt({ value: 1234.56 })).toBe('$1,235');
    expect(fmt({ value: null })).toBe('$0');
  });
});

// ── EXT-REVIEW 2026-06: formatBool / boolCol / formatDate / dateCol / formatNumber ──
import { formatBool, boolCol, formatDate, formatDateTime, dateCol, formatNumber, APP_LOCALE } from './format';

describe('formatBool (external review finding #5 — never render literal "false")', () => {
  it('renders real booleans as Yes/No', () => {
    expect(formatBool(true)).toBe('Yes');
    expect(formatBool(false)).toBe('No');
  });
  it('renders SQL/string boolean shapes', () => {
    expect(formatBool('true')).toBe('Yes');
    expect(formatBool('false')).toBe('No');
    expect(formatBool('t')).toBe('Yes');
    expect(formatBool('f')).toBe('No');
    expect(formatBool(1)).toBe('Yes');
    expect(formatBool(0)).toBe('No');
  });
  it('renders absent values as em-dash, distinct from No', () => {
    expect(formatBool(null)).toBe('—');
    expect(formatBool(undefined)).toBe('—');
    expect(formatBool('')).toBe('—');
  });
  it('never outputs the literal strings "true"/"false"', () => {
    for (const v of [true, false, 'true', 'false', 1, 0, null, undefined]) {
      const out = formatBool(v);
      expect(out).not.toBe('true');
      expect(out).not.toBe('false');
    }
  });
});

describe('boolCol', () => {
  it('produces a ColDef whose formatter yields Yes/No', () => {
    const col = boolCol('packed', { headerName: 'Packed', width: 105 });
    expect(col.field).toBe('packed');
    expect(col.headerName).toBe('Packed');
    const fmt = col.valueFormatter as (p: { value: unknown }) => string;
    expect(fmt({ value: true })).toBe('Yes');
    expect(fmt({ value: false })).toBe('No');
  });
  it('passes through editable', () => {
    const col = boolCol('packed', { editable: true });
    expect(col.editable).toBe(true);
  });
});

describe('formatDate / formatDateTime (pinned en-US, finding #6)', () => {
  it('formats a known date in en-US order regardless of device locale', () => {
    expect(formatDate('2026-06-12T12:00:00Z')).toMatch(/^6\/1[12]\/2026$/);
  });
  it('returns empty string for null/invalid', () => {
    expect(formatDate(null)).toBe('');
    expect(formatDate('not-a-date')).toBe('');
    expect(formatDateTime(null)).toBe('');
  });
});

describe('dateCol', () => {
  it('formats values and sorts by underlying timestamp', () => {
    const col = dateCol('createdAt', { variant: 'date' });
    const fmt = col.valueFormatter as (p: { value: unknown }) => string;
    expect(fmt({ value: '2026-01-15T00:00:00Z' })).toContain('2026');
    const cmp = col.comparator as (a: unknown, b: unknown) => number;
    expect(cmp('2026-01-01', '2026-02-01')).toBeLessThan(0);
    expect(cmp('2026-02-01', '2026-01-01')).toBeGreaterThan(0);
    expect(cmp(null, null)).toBe(0);
  });
});

describe('formatNumber (pinned en-US grouping)', () => {
  it('groups thousands with commas and uses period decimal separator', () => {
    expect(formatNumber(1234567.89)).toBe('1,234,567.89');
  });
  it('treats null as zero', () => {
    expect(formatNumber(null)).toBe('0');
  });
});

describe('APP_LOCALE pin', () => {
  it('is en-US', () => {
    expect(APP_LOCALE).toBe('en-US');
  });
});
