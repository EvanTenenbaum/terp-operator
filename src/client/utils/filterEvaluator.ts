import { FilterGroupInput, FilterCondition, ALLOWED_FILTER_FIELDS } from '../../shared/filterSchemas';
import { FILTER_CONFIG } from '../../shared/filterConfig';
import { logger } from '../services/logger';

export function evaluateFilterGroup(
  row: Record<string, any>,
  group: FilterGroupInput,
  depth = 0
): boolean {
  // Input validation
  if (!group || typeof group !== 'object') {
    logger.warn('Invalid filter: not an object', { module: 'filterEvaluator' });
    return false;
  }

  if (!Array.isArray(group.conditions)) {
    logger.warn('Invalid filter: conditions is not an array', { module: 'filterEvaluator' });
    return false;
  }

  // Recursion protection
  if (depth > FILTER_CONFIG.MAX_CLIENT_RECURSION) {
    logger.error('Filter evaluation recursion limit exceeded', { module: 'filterEvaluator' });
    return false;
  }

  // Runtime validation of logic operator
  if (group.logic !== 'AND' && group.logic !== 'OR') {
    logger.error(`Invalid logic operator: ${group.logic}`, { module: 'filterEvaluator' });
    return false;
  }

  const { conditions, logic } = group;

  if (conditions.length === 0) {
    return logic === 'AND';
  }

  if (logic === 'AND') {
    for (const condition of conditions) {
      const result = 'field' in condition
        ? evaluateCondition(row, condition)
        : evaluateFilterGroup(row, condition, depth + 1);
      if (!result) return false;
    }
    return true;
  } else {
    for (const condition of conditions) {
      const result = 'field' in condition
        ? evaluateCondition(row, condition)
        : evaluateFilterGroup(row, condition, depth + 1);
      if (result) return true;
    }
    return false;
  }
}

function evaluateCondition(row: Record<string, any>, condition: FilterCondition): boolean {
  // Whitelist check (prevents prototype pollution)
  if (!ALLOWED_FILTER_FIELDS.has(condition.field)) {
    logger.warn('Unauthorized field access attempt', { module: 'filterEvaluator', field: condition.field });
    return false;
  }

  const value = row[condition.field];

  switch (condition.operator) {
    // Null checks
    case 'is_null':
      return value === null || value === undefined;
    case 'is_not_null':
      return value !== null && value !== undefined;

    // equals/not_equals operators (works for both numeric and text)
    case 'equals':
      if (value === null || value === undefined) return false;
      // Check if value is numeric or text
      if (typeof condition.value === 'number') {
        return Number(value) === Number(condition.value);
      }
      return String(value).toLowerCase() === String(condition.value).toLowerCase();
    case 'not_equals':
      if (value === null || value === undefined) return true;
      // Check if value is numeric or text
      if (typeof condition.value === 'number') {
        return Number(value) !== Number(condition.value);
      }
      return String(value).toLowerCase() !== String(condition.value).toLowerCase();
    case 'greater_than':
      if (value === null || value === undefined) return false;
      return Number(value) > Number(condition.value);
    case 'less_than':
      if (value === null || value === undefined) return false;
      return Number(value) < Number(condition.value);
    case 'greater_than_or_equal':
      if (value === null || value === undefined) return false;
      return Number(value) >= Number(condition.value);
    case 'less_than_or_equal':
      if (value === null || value === undefined) return false;
      return Number(value) <= Number(condition.value);
    case 'between':
      if (value === null || value === undefined) return false;
      if (!Array.isArray(condition.value) || condition.value.length !== 2) {
        return false;
      }
      const [min, max] = condition.value;

      // Validate min/max are numbers
      if (typeof min !== 'number' || typeof max !== 'number') {
        logger.warn('Between operator requires numeric min/max values');
        return false;
      }

      const numVal = Number(value);
      if (isNaN(numVal)) {
        return false;
      }

      return numVal >= min && numVal <= max;

    // Text operators
    case 'text_contains':
      if (value === null || value === undefined) return false;
      return String(value).toLowerCase().includes(String(condition.value).toLowerCase());
    case 'text_not_contains':
      if (value === null || value === undefined) return true;
      return !String(value).toLowerCase().includes(String(condition.value).toLowerCase());
    case 'starts_with':
      if (value === null || value === undefined) return false;
      return String(value).toLowerCase().startsWith(String(condition.value).toLowerCase());
    case 'ends_with':
      if (value === null || value === undefined) return false;
      return String(value).toLowerCase().endsWith(String(condition.value).toLowerCase());

    // Array operators
    case 'array_contains':
      if (!Array.isArray(value)) return false;
      if (!Array.isArray(condition.value)) return false;
      return condition.value.some(v => value.includes(v));
    case 'array_not_contains':
      if (!Array.isArray(value)) return true;
      if (!Array.isArray(condition.value)) return false;
      return !condition.value.some(v => value.includes(v));
    case 'array_contains_all':
      if (!Array.isArray(value)) return false;
      if (!Array.isArray(condition.value)) return false;
      return condition.value.every(v => value.includes(v));

    // UUID operators
    case 'in':
      if (value === null || value === undefined) return false;
      if (!Array.isArray(condition.value)) return false;
      return condition.value.includes(String(value));
    case 'not_in':
      if (value === null || value === undefined) return true;
      if (!Array.isArray(condition.value)) return false;
      return !condition.value.includes(String(value));

    // Date operators
    case 'before':
      if (value === null || value === undefined) return false;
      return new Date(value) < new Date(condition.value);
    case 'after':
      if (value === null || value === undefined) return false;
      return new Date(value) > new Date(condition.value);

    default:
      logger.warn('Unsupported filter operator', { operator: String((condition as FilterCondition).operator) });
      return false;
  }
}

const _MS_PER_DAY = 86400000;

// Cumulative day-of-year offsets for each month start (non-leap year, 0-indexed).
const _MDAY = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];

// Epoch days since 1970-01-01 for dates in 1970-2099.
// Uses right-shift and bitwise AND — no Math.floor, no Date.UTC, no allocations.
// Correctness note: treats any year where (y & 3) === 0 as a leap year; this is
// accurate for 1970-2099 (2100 is the next non-leap century year, outside typical range).
function _epochDay(y: number, m: number, d: number): number {
  const leapAdj = (m > 2 && (y & 3) === 0) ? 1 : 0;
  return (y - 1970) * 365 + ((y - 1969) >> 2) + _MDAY[m - 1] + leapAdj + d - 1;
}

// Today's UTC epoch day, cached at module load.
// Refreshed lazily when Date.now() crosses the next UTC midnight boundary.
// Hot path reads _todayEpochDay directly — no Date.now() per call.
let _todayEpochDay = (Date.now() / _MS_PER_DAY) | 0;
let _nextMidnightMs = (_todayEpochDay + 1) * _MS_PER_DAY;

// Refresh the today cache; call after midnight in long-lived server processes.
export function _refreshTodayEpochDay(): void {
  const now = Date.now();
  if (now >= _nextMidnightMs) {
    _todayEpochDay = (now / _MS_PER_DAY) | 0;
    _nextMidnightMs = (_todayEpochDay + 1) * _MS_PER_DAY;
  }
}

// Calculate age in days for client-side evaluation
export function calculateAgeDays(intakeDate: string | Date | null): number | null {
  if (!intakeDate) return null;
  let intakeEpochDay: number;
  if (intakeDate instanceof Date) {
    intakeEpochDay = (intakeDate.getTime() / _MS_PER_DAY) | 0;
  } else {
    const s = intakeDate;
    if (s.length >= 10 && s.charCodeAt(4) === 45 && s.charCodeAt(7) === 45) {
      // Fast path: YYYY-MM-DD or ISO string — pure integer arithmetic, no Date.UTC
      const y = (s.charCodeAt(0) - 48) * 1000 + (s.charCodeAt(1) - 48) * 100 +
                (s.charCodeAt(2) - 48) * 10  + (s.charCodeAt(3) - 48);
      const m = (s.charCodeAt(5) - 48) * 10 + (s.charCodeAt(6) - 48);
      const d = (s.charCodeAt(8) - 48) * 10 + (s.charCodeAt(9) - 48);
      intakeEpochDay = _epochDay(y, m, d);
    } else {
      const ms = Date.parse(s);
      if (isNaN(ms)) return null;
      intakeEpochDay = (ms / _MS_PER_DAY) | 0;
    }
  }
  return _todayEpochDay - intakeEpochDay;
}
