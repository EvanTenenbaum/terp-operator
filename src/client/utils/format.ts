/**
 * Shared display formatting utilities for TERP Operator.
 *
 * TER-1612: formatTs() — canonical timestamp formatter.
 * Do NOT add formatMoney() here — that belongs in TER-1613 (separate branch).
 */

export type FormatTsVariant = 'relative' | 'short' | 'long';

export interface FormatTsOptions {
  variant?: FormatTsVariant;
}

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Format a timestamp value for display.
 *
 * @param value  Date, ISO string, or numeric timestamp (ms since epoch).
 *               Returns '' for null / undefined / invalid input.
 * @param opts.variant
 *   - 'relative' (default): "2m ago", "2h ago", "3d ago".
 *     Falls back to a short locale string when the timestamp is > 30 days old.
 *   - 'short': locale date + time without a timezone label (e.g. "5/12/2026, 4:41 PM").
 *   - 'long': full locale date + time string including timezone name
 *             (e.g. "5/12/2026, 4:41:00 PM GMT-7").
 */
export function formatTs(
  value: Date | string | number | null | undefined,
  opts?: FormatTsOptions,
): string {
  if (value == null || value === '') return '';

  const date = value instanceof Date ? value : new Date(value as string | number);

  if (isNaN(date.getTime())) return '';

  const variant = opts?.variant ?? 'relative';

  if (variant === 'short') {
    return date.toLocaleString(undefined, {
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  }

  if (variant === 'long') {
    return date.toLocaleString(undefined, {
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      timeZoneName: 'short',
    });
  }

  // relative
  const diffMs = Date.now() - date.getTime();

  if (diffMs > THIRTY_DAYS_MS) {
    // Older than 30 days — show full date+time so context is unambiguous
    return date.toLocaleString(undefined, {
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  }

  const absMs = Math.abs(diffMs);
  const seconds = Math.floor(absMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days >= 1) return `${days}d ago`;
  if (hours >= 1) return `${hours}h ago`;
  if (minutes >= 1) return `${minutes}m ago`;
  return 'just now';
}
