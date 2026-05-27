/**
 * Shared display formatting utilities for TERP Operator.
 *
 * TER-1612: formatTs() — canonical timestamp formatter.
 * TER-1613: formatMoney() + moneyCol() — shared money formatting + AG Grid factory.
 */

import type { ColDef } from 'ag-grid-community';

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

// ── Money formatting (TER-1613) ───────────────────────────────────────────────

export interface FormatMoneyOpts {
  /**
   * Whether to show cents (fractional digits).
   * Defaults to `true`.
   * Pass `false` for KPI tiles where whole-dollar display is preferred.
   */
  cents?: boolean;
}

/**
 * Format a numeric dollar value for display.
 *
 * @param value  Dollar amount (not cents). Null/undefined treated as zero.
 * @param opts.cents  Show fractional digits. Defaults to `true`.
 *
 * @example
 * formatMoney(1234.56)               // "$1,234.56"
 * formatMoney(1234.56, {cents:false}) // "$1,235"
 * formatMoney(null)                   // "$0.00"
 * formatMoney(null, {cents:false})    // "$0"
 */
export function formatMoney(
  value: number | null | undefined,
  opts?: FormatMoneyOpts,
): string {
  const showCents = opts?.cents !== false;
  const n = (value == null || !Number.isFinite(value)) ? 0 : value;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: showCents ? 2 : 0,
    maximumFractionDigits: showCents ? 2 : 0,
  }).format(n);
}

// ── AG Grid money column factory (TER-1613) ───────────────────────────────────

export interface MoneyColOpts extends FormatMoneyOpts {
  headerName?: string;
  width?: number;
}

/**
 * AG Grid ColDef factory for a right-aligned money column.
 *
 * @param field      Row field containing a numeric dollar value.
 * @param opts.headerName  Column header (defaults to capitalised field name).
 * @param opts.width       Column width in pixels (defaults to 120).
 * @param opts.cents       Show fractional digits (defaults to true).
 *
 * @example
 * moneyCol('total', { headerName: 'Total', width: 100 })
 * moneyCol('balance', { headerName: 'Balance', cents: false })
 */
export function moneyCol(field: string, opts?: MoneyColOpts): ColDef {
  const { headerName, width = 120, ...fmtOpts } = opts ?? {};
  return {
    field,
    headerName: headerName ?? field.charAt(0).toUpperCase() + field.slice(1),
    width,
    cellClass: 'text-right tabular-nums',
    headerClass: 'text-right',
    valueFormatter: (params) => formatMoney(
      params.value == null ? null : Number(params.value),
      fmtOpts,
    ),
  };
}
