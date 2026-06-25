/**
 * Shared display formatting utilities for TERP Operator.
 *
 * TER-1612: formatTs() — canonical timestamp formatter.
 * TER-1613: formatMoney() + moneyCol() — shared money formatting + AG Grid factory.
 * EXT-REVIEW 2026-06 (locale): ALL formatting is pinned to the en-US locale.
 *   TERP Operator is a US-domestic business system; rendering dates/numbers in
 *   the device locale produced mixed-language UI and layout-breaking widths on
 *   non-US devices (external review finding #6). Every date/number that reaches
 *   the screen must flow through this module — never call `toLocaleString()` /
 *   `toLocaleDateString()` / `toLocaleTimeString()` directly in components.
 * EXT-REVIEW 2026-06 (raw booleans): formatBool() + boolCol() — boolean fields
 *   must never reach an AG Grid cell or JSX text node unformatted (finding #5:
 *   the literal word "false" rendered in grids).
 */

import type { GridColDef } from '../../shared/grid-types';

/** Single pinned locale for every user-visible date/number. See header note. */
export const APP_LOCALE = 'en-US';

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
    return date.toLocaleString(APP_LOCALE, {
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  }

  if (variant === 'long') {
    return date.toLocaleString(APP_LOCALE, {
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
    return date.toLocaleString(APP_LOCALE, {
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
 * AG Grid GridColDef factory for a right-aligned money column.
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
export function moneyCol(field: string, opts?: MoneyColOpts): GridColDef {
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

// ── Boolean formatting (EXT-REVIEW 2026-06 finding #5) ────────────────────────

/**
 * Format a boolean-ish value as "Yes" / "No".
 *
 * Accepts real booleans plus the string/number shapes that arrive from SQL
 * projections and superjson round-trips ('true'/'false'/'t'/'f'/1/0).
 * Null/undefined/empty render as '—' so absent data is visually distinct
 * from an explicit No.
 */
export function formatBool(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') return value !== 0 ? 'Yes' : 'No';
  if (typeof value === 'string') {
    const v = value.trim().toLowerCase();
    if (v === 'true' || v === 't' || v === 'yes' || v === '1') return 'Yes';
    if (v === 'false' || v === 'f' || v === 'no' || v === '0') return 'No';
    return value; // unknown string — pass through rather than misreport
  }
  return value ? 'Yes' : 'No';
}

export interface BoolColOpts {
  headerName?: string;
  width?: number;
  /** Pass through AG Grid editability (checkbox-style toggles elsewhere own writes). */
  editable?: GridColDef['editable'];
}

/**
 * AG Grid GridColDef factory for a boolean column. Guarantees the cell never
 * renders the literal text "true"/"false" (external review finding #5).
 */
export function boolCol(field: string, opts?: BoolColOpts): GridColDef {
  const { headerName, width = 100, editable } = opts ?? {};
  return {
    field,
    headerName: headerName ?? field.charAt(0).toUpperCase() + field.slice(1),
    width,
    ...(editable !== undefined ? { editable } : {}),
    valueFormatter: (params) => formatBool(params.value),
    cellClass: 'text-center',
    filter: 'agSetColumnFilter',
    filterParams: { valueFormatter: (params: { value: unknown }) => formatBool(params.value) }
  };
}

// ── Date formatting (EXT-REVIEW 2026-06 finding #6) ───────────────────────────

/** "6/12/2026" — pinned en-US date, '' for null/invalid. */
export function formatDate(value: Date | string | number | null | undefined): string {
  if (value == null || value === '') return '';
  const date = value instanceof Date ? value : new Date(value as string | number);
  if (isNaN(date.getTime())) return '';
  return date.toLocaleDateString(APP_LOCALE, { year: 'numeric', month: 'numeric', day: 'numeric' });
}

/** "6/12/2026, 4:41 PM" — pinned en-US date+time, '' for null/invalid. */
export function formatDateTime(value: Date | string | number | null | undefined): string {
  return formatTs(value, { variant: 'short' });
}

export interface DateColOpts {
  headerName?: string;
  width?: number;
  /** 'date' (default) renders date only; 'datetime' includes time; 'relative' uses formatTs relative. */
  variant?: 'date' | 'datetime' | 'relative';
}

/**
 * AG Grid GridColDef factory for a timestamp column. Replaces raw ISO strings /
 * device-locale renderings with pinned en-US output and keeps sorting correct
 * by comparing underlying values, not formatted text.
 */
export function dateCol(field: string, opts?: DateColOpts): GridColDef {
  const { headerName, width = 160, variant = 'date' } = opts ?? {};
  return {
    field,
    headerName: headerName ?? field.charAt(0).toUpperCase() + field.slice(1),
    width,
    valueFormatter: (params) =>
      variant === 'relative'
        ? formatTs(params.value)
        : variant === 'datetime'
          ? formatDateTime(params.value)
          : formatDate(params.value),
    comparator: (a: unknown, b: unknown) => {
      const ta = a == null ? 0 : new Date(a as string | number).getTime();
      const tb = b == null ? 0 : new Date(b as string | number).getTime();
      return (Number.isNaN(ta) ? 0 : ta) - (Number.isNaN(tb) ? 0 : tb);
    }
  };
}

// ── Number formatting (EXT-REVIEW 2026-06 finding #6) ─────────────────────────

/**
 * Pinned en-US thousands-grouped number. Use instead of `n.toLocaleString()`.
 */
export function formatNumber(
  value: number | null | undefined,
  opts?: { maximumFractionDigits?: number }
): string {
  const n = value == null || !Number.isFinite(value) ? 0 : value;
  return new Intl.NumberFormat(APP_LOCALE, {
    maximumFractionDigits: opts?.maximumFractionDigits ?? 2
  }).format(n);
}
