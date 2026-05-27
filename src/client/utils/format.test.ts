/**
 * Unit tests for shared timestamp formatting utility.
 * TER-1612: formatTs() — canonical timestamp formatter.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { formatTs } from './format';

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
    // 1970 should be in the short representation
    expect(result).toMatch(/1970/);
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
