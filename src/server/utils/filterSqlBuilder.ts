import { TRPCError } from '@trpc/server';
import { FilterCondition, FILTER_FIELDS, FilterFieldName, FilterGroupInput } from '../../shared/filterSchemas';
import { FILTER_CONFIG } from '../../shared/filterConfig';

type SqlParams = (string | number | boolean | null | string[])[];

export function buildFilterSql(
  group: FilterGroupInput,
  params: SqlParams,
  whereClauses: string[],
  depth = 0
): void {
  // Stack overflow protection
  if (depth > FILTER_CONFIG.MAX_RECURSION_DEPTH) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Filter recursion depth exceeded'
    });
  }

  // Runtime validation of logic operator (defense in depth)
  if (group.logic !== 'AND' && group.logic !== 'OR') {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Invalid logic operator - must be AND or OR'
    });
  }

  const groupClauses: string[] = [];

  for (const condition of group.conditions) {
    if ('field' in condition) {
      // Leaf condition
      const sql = buildConditionSql(condition, params);
      if (sql === null) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Failed to build SQL for condition: ${JSON.stringify(condition)}`
        });
      }
      groupClauses.push(sql);
    } else {
      // Nested group
      const nestedClauses: string[] = [];
      buildFilterSql(condition, params, nestedClauses, depth + 1);
      if (nestedClauses.length > 0) {
        groupClauses.push(`(${nestedClauses.join(` ${condition.logic} `)})`);
      }
    }
  }

  if (groupClauses.length > 0) {
    whereClauses.push(`(${groupClauses.join(` ${group.logic} `)})`);
  }
}

function buildConditionSql(condition: FilterCondition, params: SqlParams): string | null {
  // Validate field exists in whitelist
  const fieldConfig = FILTER_FIELDS[condition.field];
  if (!fieldConfig) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: `Invalid field: ${condition.field}`
    });
  }

  const sqlField = fieldConfig.sql;

  switch (condition.operator) {
    // Null checks
    case 'is_null':
      return `${sqlField} IS NULL`;
    case 'is_not_null':
      return `${sqlField} IS NOT NULL`;

    // Numeric operators
    case 'equals':
      params.push(condition.value);
      return `${sqlField} = $${params.length}`;
    case 'not_equals':
      params.push(condition.value);
      return `${sqlField} != $${params.length}`;
    case 'greater_than':
      params.push(condition.value);
      return `${sqlField} > $${params.length}`;
    case 'less_than':
      params.push(condition.value);
      return `${sqlField} < $${params.length}`;
    case 'greater_than_or_equal':
      params.push(condition.value);
      return `${sqlField} >= $${params.length}`;
    case 'less_than_or_equal':
      params.push(condition.value);
      return `${sqlField} <= $${params.length}`;
    case 'between':
      if (Array.isArray(condition.value) && condition.value.length === 2) {
        params.push(condition.value[0], condition.value[1]);
        return `${sqlField} BETWEEN $${params.length - 1} AND $${params.length}`;
      }
      return null;

    // Text operators
    case 'text_contains':
      // Escape SQL wildcards (%, _) to prevent unintended pattern matching
      params.push(`%${condition.value.replace(/[%_]/g, '\\$&')}%`);
      return `${sqlField} ILIKE $${params.length}`;
    case 'text_not_contains':
      params.push(`%${condition.value.replace(/[%_]/g, '\\$&')}%`);
      return `${sqlField} NOT ILIKE $${params.length}`;
    case 'starts_with':
      params.push(`${condition.value.replace(/[%_]/g, '\\$&')}%`);
      return `${sqlField} ILIKE $${params.length}`;
    case 'ends_with':
      params.push(`%${condition.value.replace(/[%_]/g, '\\$&')}`);
      return `${sqlField} ILIKE $${params.length}`;

    // Array operators
    case 'array_contains':
      // Use && (overlaps) operator for "contains ANY" semantics (matches client .some() logic)
      params.push(condition.value);
      return `${sqlField} && $${params.length}::varchar[]`;
    case 'array_not_contains':
      // NOT overlaps = does not contain ANY of the specified values
      params.push(condition.value);
      return `NOT (${sqlField} && $${params.length}::varchar[])`;
    case 'array_contains_all':
      // Use @> (contains) operator for "contains ALL" semantics
      params.push(condition.value);
      return `${sqlField} @> $${params.length}::varchar[]`;

    // UUID operators
    case 'in':
      if (!Array.isArray(condition.value) || condition.value.length === 0) {
        return 'FALSE'; // Empty array = no matches
      }
      // Expand to IN clause to avoid array cast issues
      const inPlaceholders = condition.value.map((val, i) => {
        params.push(val);
        return `$${params.length}`;
      }).join(', ');
      return `${sqlField} IN (${inPlaceholders})`;

    case 'not_in':
      if (!Array.isArray(condition.value) || condition.value.length === 0) {
        return 'TRUE'; // Empty exclusion list = all match
      }
      // Expand to NOT IN clause
      const notInPlaceholders = condition.value.map((val, i) => {
        params.push(val);
        return `$${params.length}`;
      }).join(', ');
      return `${sqlField} NOT IN (${notInPlaceholders})`;

    // Date operators
    case 'before':
      params.push(condition.value);
      return `${sqlField} < $${params.length}::timestamptz`;
    case 'after':
      params.push(condition.value);
      return `${sqlField} > $${params.length}::timestamptz`;

    default:
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `Unsupported operator: ${(condition as any).operator}`
      });
  }
}
