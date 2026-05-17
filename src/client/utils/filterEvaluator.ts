import { FilterGroupInput, FilterCondition, ALLOWED_FILTER_FIELDS } from '../../shared/filterSchemas';
import { FILTER_CONFIG } from '../../shared/filterConfig';

export function evaluateFilterGroup(
  row: Record<string, any>,
  group: FilterGroupInput,
  depth = 0
): boolean {
  // Input validation
  if (!group || typeof group !== 'object') {
    console.warn('Invalid filter: not an object');
    return false;
  }

  if (!Array.isArray(group.conditions)) {
    console.warn('Invalid filter: conditions is not an array');
    return false;
  }

  // Recursion protection
  if (depth > FILTER_CONFIG.MAX_CLIENT_RECURSION) {
    console.error('Filter evaluation recursion limit exceeded');
    return false;
  }

  // Runtime validation of logic operator
  if (group.logic !== 'AND' && group.logic !== 'OR') {
    console.error(`Invalid logic operator: ${group.logic}`);
    return false;
  }

  const results = group.conditions.map(condition => {
    if ('field' in condition) {
      return evaluateCondition(row, condition);
    } else {
      return evaluateFilterGroup(row, condition, depth + 1);
    }
  });

  return group.logic === 'AND'
    ? results.every(Boolean)
    : results.some(Boolean);
}

function evaluateCondition(row: Record<string, any>, condition: FilterCondition): boolean {
  // Whitelist check (prevents prototype pollution)
  if (!ALLOWED_FILTER_FIELDS.has(condition.field)) {
    console.warn(`Unauthorized field access attempt: ${condition.field}`);
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
        console.warn('Between operator requires numeric min/max values');
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
      console.warn(`Unsupported operator: ${(condition as any).operator}`);
      return false;
  }
}

// Calculate age in days for client-side evaluation
export function calculateAgeDays(intakeDate: string | Date | null): number | null {
  if (!intakeDate) return null;
  const intake = new Date(intakeDate);
  const now = new Date();
  const diffMs = now.getTime() - intake.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}
