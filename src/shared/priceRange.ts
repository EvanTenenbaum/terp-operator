export interface ParsedPriceRange {
  low: number;
  high: number;
}

export type LandedCostBasis = 'fixed' | 'pick-low' | 'pick-mid' | 'pick-high' | 'manual' | 'override';

const PRICE_RANGE_RE = /^(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)$/;

export function parsePriceRange(raw: string | null | undefined): ParsedPriceRange | null {
  if (raw == null) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;
  const match = PRICE_RANGE_RE.exec(trimmed);
  if (!match) return null;
  const low = Number(match[1]);
  const high = Number(match[2]);
  if (!Number.isFinite(low) || !Number.isFinite(high)) return null;
  if (low < 0 || high < 0) return null;
  if (low > high) return null;
  return { low, high };
}

export function isLandedCostInRange(landed: number, raw: string | null | undefined): boolean {
  const range = parsePriceRange(raw);
  if (!range) return false;
  if (!Number.isFinite(landed)) return false;
  return landed >= range.low && landed <= range.high;
}

export function pickFromRange(raw: string | null | undefined, basis: LandedCostBasis): number | null {
  const range = parsePriceRange(raw);
  if (!range) return null;
  switch (basis) {
    case 'pick-low':
      return range.low;
    case 'pick-high':
      return range.high;
    case 'pick-mid':
      return (range.low + range.high) / 2;
    default:
      return null;
  }
}

export function isPriceRangeWellFormed(raw: string | null | undefined): boolean {
  if (raw == null || String(raw).trim() === '') return true;
  return parsePriceRange(raw) !== null;
}

/**
 * Validate cost range from separate low/high numeric fields (for PO lines)
 * Returns true if: both null (no range) OR both valid with low <= high
 */
export function validateCostRange(low: number | null | undefined, high: number | null | undefined): boolean {
  if (low == null && high == null) return true; // No range is valid
  if (low == null || high == null) return false; // Partial range is invalid
  const lowNum = Number(low);
  const highNum = Number(high);
  if (!Number.isFinite(lowNum) || !Number.isFinite(highNum)) return false;
  if (lowNum < 0 || highNum < 0) return false;
  if (lowNum > highNum) return false;
  return true;
}

/**
 * Calculate midpoint from separate low/high fields
 */
export function rangeMidpoint(low: number | null | undefined, high: number | null | undefined): number | null {
  if (low == null || high == null) return null;
  const lowNum = Number(low);
  const highNum = Number(high);
  if (!Number.isFinite(lowNum) || !Number.isFinite(highNum)) return null;
  return (lowNum + highNum) / 2;
}
