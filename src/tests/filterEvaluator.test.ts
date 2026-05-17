import { describe, it, expect } from 'vitest';
import { evaluateFilterGroup, calculateAgeDays } from '../client/utils/filterEvaluator';
import type { FilterGroupInput } from '../shared/filterSchemas';

describe('filterEvaluator', () => {

  // =========================================================================
  // NULL CHECK OPERATORS
  // =========================================================================

  describe('is_null operator', () => {
    it('should match null values', () => {
      const row = { category: null };
      const filter: FilterGroupInput = {
        logic: 'AND',
        conditions: [{ field: 'category', operator: 'is_null', value: null }]
      };
      expect(evaluateFilterGroup(row, filter)).toBe(true);
    });

    it('should match undefined values', () => {
      const row = {};
      const filter: FilterGroupInput = {
        logic: 'AND',
        conditions: [{ field: 'category', operator: 'is_null', value: null }]
      };
      expect(evaluateFilterGroup(row, filter)).toBe(true);
    });

    it('should not match non-null values', () => {
      const row = { category: 'Flower' };
      const filter: FilterGroupInput = {
        logic: 'AND',
        conditions: [{ field: 'category', operator: 'is_null', value: null }]
      };
      expect(evaluateFilterGroup(row, filter)).toBe(false);
    });
  });

  describe('is_not_null operator', () => {
    it('should match non-null values', () => {
      const row = { category: 'Flower' };
      const filter: FilterGroupInput = {
        logic: 'AND',
        conditions: [{ field: 'category', operator: 'is_not_null', value: null }]
      };
      expect(evaluateFilterGroup(row, filter)).toBe(true);
    });

    it('should not match null values', () => {
      const row = { category: null };
      const filter: FilterGroupInput = {
        logic: 'AND',
        conditions: [{ field: 'category', operator: 'is_not_null', value: null }]
      };
      expect(evaluateFilterGroup(row, filter)).toBe(false);
    });

    it('should not match undefined values', () => {
      const row = {};
      const filter: FilterGroupInput = {
        logic: 'AND',
        conditions: [{ field: 'category', operator: 'is_not_null', value: null }]
      };
      expect(evaluateFilterGroup(row, filter)).toBe(false);
    });
  });

  // =========================================================================
  // NUMERIC OPERATORS
  // =========================================================================

  describe('equals operator (numeric)', () => {
    it('should match exact numeric values', () => {
      const row = { unitPrice: 25.50 };
      const filter: FilterGroupInput = {
        logic: 'AND',
        conditions: [{ field: 'unitPrice', operator: 'equals', value: 25.50 }]
      };
      expect(evaluateFilterGroup(row, filter)).toBe(true);
    });

    it('should not match different numeric values', () => {
      const row = { unitPrice: 25.50 };
      const filter: FilterGroupInput = {
        logic: 'AND',
        conditions: [{ field: 'unitPrice', operator: 'equals', value: 30.00 }]
      };
      expect(evaluateFilterGroup(row, filter)).toBe(false);
    });

    it('should return false for null values', () => {
      const row = { unitPrice: null };
      const filter: FilterGroupInput = {
        logic: 'AND',
        conditions: [{ field: 'unitPrice', operator: 'equals', value: 25.50 }]
      };
      expect(evaluateFilterGroup(row, filter)).toBe(false);
    });
  });

  describe('not_equals operator (numeric)', () => {
    it('should match different numeric values', () => {
      const row = { unitPrice: 25.50 };
      const filter: FilterGroupInput = {
        logic: 'AND',
        conditions: [{ field: 'unitPrice', operator: 'not_equals', value: 30.00 }]
      };
      expect(evaluateFilterGroup(row, filter)).toBe(true);
    });

    it('should not match exact numeric values', () => {
      const row = { unitPrice: 25.50 };
      const filter: FilterGroupInput = {
        logic: 'AND',
        conditions: [{ field: 'unitPrice', operator: 'not_equals', value: 25.50 }]
      };
      expect(evaluateFilterGroup(row, filter)).toBe(false);
    });

    it('should return true for null values', () => {
      const row = { unitPrice: null };
      const filter: FilterGroupInput = {
        logic: 'AND',
        conditions: [{ field: 'unitPrice', operator: 'not_equals', value: 25.50 }]
      };
      expect(evaluateFilterGroup(row, filter)).toBe(true);
    });
  });

  describe('greater_than operator', () => {
    it('should match greater values', () => {
      const row = { unitPrice: 30 };
      const filter: FilterGroupInput = {
        logic: 'AND',
        conditions: [{ field: 'unitPrice', operator: 'greater_than', value: 25 }]
      };
      expect(evaluateFilterGroup(row, filter)).toBe(true);
    });

    it('should not match equal values', () => {
      const row = { unitPrice: 25 };
      const filter: FilterGroupInput = {
        logic: 'AND',
        conditions: [{ field: 'unitPrice', operator: 'greater_than', value: 25 }]
      };
      expect(evaluateFilterGroup(row, filter)).toBe(false);
    });

    it('should not match lesser values', () => {
      const row = { unitPrice: 20 };
      const filter: FilterGroupInput = {
        logic: 'AND',
        conditions: [{ field: 'unitPrice', operator: 'greater_than', value: 25 }]
      };
      expect(evaluateFilterGroup(row, filter)).toBe(false);
    });
  });

  describe('less_than operator', () => {
    it('should match lesser values', () => {
      const row = { unitPrice: 20 };
      const filter: FilterGroupInput = {
        logic: 'AND',
        conditions: [{ field: 'unitPrice', operator: 'less_than', value: 25 }]
      };
      expect(evaluateFilterGroup(row, filter)).toBe(true);
    });

    it('should not match equal values', () => {
      const row = { unitPrice: 25 };
      const filter: FilterGroupInput = {
        logic: 'AND',
        conditions: [{ field: 'unitPrice', operator: 'less_than', value: 25 }]
      };
      expect(evaluateFilterGroup(row, filter)).toBe(false);
    });

    it('should not match greater values', () => {
      const row = { unitPrice: 30 };
      const filter: FilterGroupInput = {
        logic: 'AND',
        conditions: [{ field: 'unitPrice', operator: 'less_than', value: 25 }]
      };
      expect(evaluateFilterGroup(row, filter)).toBe(false);
    });
  });

  describe('greater_than_or_equal operator', () => {
    it('should match greater values', () => {
      const row = { unitPrice: 30 };
      const filter: FilterGroupInput = {
        logic: 'AND',
        conditions: [{ field: 'unitPrice', operator: 'greater_than_or_equal', value: 25 }]
      };
      expect(evaluateFilterGroup(row, filter)).toBe(true);
    });

    it('should match equal values', () => {
      const row = { unitPrice: 25 };
      const filter: FilterGroupInput = {
        logic: 'AND',
        conditions: [{ field: 'unitPrice', operator: 'greater_than_or_equal', value: 25 }]
      };
      expect(evaluateFilterGroup(row, filter)).toBe(true);
    });

    it('should not match lesser values', () => {
      const row = { unitPrice: 20 };
      const filter: FilterGroupInput = {
        logic: 'AND',
        conditions: [{ field: 'unitPrice', operator: 'greater_than_or_equal', value: 25 }]
      };
      expect(evaluateFilterGroup(row, filter)).toBe(false);
    });
  });

  describe('less_than_or_equal operator', () => {
    it('should match lesser values', () => {
      const row = { unitPrice: 20 };
      const filter: FilterGroupInput = {
        logic: 'AND',
        conditions: [{ field: 'unitPrice', operator: 'less_than_or_equal', value: 25 }]
      };
      expect(evaluateFilterGroup(row, filter)).toBe(true);
    });

    it('should match equal values', () => {
      const row = { unitPrice: 25 };
      const filter: FilterGroupInput = {
        logic: 'AND',
        conditions: [{ field: 'unitPrice', operator: 'less_than_or_equal', value: 25 }]
      };
      expect(evaluateFilterGroup(row, filter)).toBe(true);
    });

    it('should not match greater values', () => {
      const row = { unitPrice: 30 };
      const filter: FilterGroupInput = {
        logic: 'AND',
        conditions: [{ field: 'unitPrice', operator: 'less_than_or_equal', value: 25 }]
      };
      expect(evaluateFilterGroup(row, filter)).toBe(false);
    });
  });

  describe('between operator', () => {
    it('should match values within range (inclusive)', () => {
      const row = { unitPrice: 25 };
      const filter: FilterGroupInput = {
        logic: 'AND',
        conditions: [{ field: 'unitPrice', operator: 'between', value: [20, 30] }]
      };
      expect(evaluateFilterGroup(row, filter)).toBe(true);
    });

    it('should match lower boundary', () => {
      const row = { unitPrice: 20 };
      const filter: FilterGroupInput = {
        logic: 'AND',
        conditions: [{ field: 'unitPrice', operator: 'between', value: [20, 30] }]
      };
      expect(evaluateFilterGroup(row, filter)).toBe(true);
    });

    it('should match upper boundary', () => {
      const row = { unitPrice: 30 };
      const filter: FilterGroupInput = {
        logic: 'AND',
        conditions: [{ field: 'unitPrice', operator: 'between', value: [20, 30] }]
      };
      expect(evaluateFilterGroup(row, filter)).toBe(true);
    });

    it('should not match values below range', () => {
      const row = { unitPrice: 15 };
      const filter: FilterGroupInput = {
        logic: 'AND',
        conditions: [{ field: 'unitPrice', operator: 'between', value: [20, 30] }]
      };
      expect(evaluateFilterGroup(row, filter)).toBe(false);
    });

    it('should not match values above range', () => {
      const row = { unitPrice: 35 };
      const filter: FilterGroupInput = {
        logic: 'AND',
        conditions: [{ field: 'unitPrice', operator: 'between', value: [20, 30] }]
      };
      expect(evaluateFilterGroup(row, filter)).toBe(false);
    });
  });

  // =========================================================================
  // TEXT OPERATORS
  // =========================================================================

  describe('text_contains operator', () => {
    it('should match substring (case-insensitive)', () => {
      const row = { category: 'Flower Premium' };
      const filter: FilterGroupInput = {
        logic: 'AND',
        conditions: [{ field: 'category', operator: 'text_contains', value: 'flower' }]
      };
      expect(evaluateFilterGroup(row, filter)).toBe(true);
    });

    it('should not match non-substring', () => {
      const row = { category: 'Extract' };
      const filter: FilterGroupInput = {
        logic: 'AND',
        conditions: [{ field: 'category', operator: 'text_contains', value: 'flower' }]
      };
      expect(evaluateFilterGroup(row, filter)).toBe(false);
    });

    it('should return false for null values', () => {
      const row = { category: null };
      const filter: FilterGroupInput = {
        logic: 'AND',
        conditions: [{ field: 'category', operator: 'text_contains', value: 'flower' }]
      };
      expect(evaluateFilterGroup(row, filter)).toBe(false);
    });
  });

  describe('text_not_contains operator', () => {
    it('should match when substring absent', () => {
      const row = { category: 'Extract' };
      const filter: FilterGroupInput = {
        logic: 'AND',
        conditions: [{ field: 'category', operator: 'text_not_contains', value: 'flower' }]
      };
      expect(evaluateFilterGroup(row, filter)).toBe(true);
    });

    it('should not match when substring present', () => {
      const row = { category: 'Flower Premium' };
      const filter: FilterGroupInput = {
        logic: 'AND',
        conditions: [{ field: 'category', operator: 'text_not_contains', value: 'flower' }]
      };
      expect(evaluateFilterGroup(row, filter)).toBe(false);
    });

    it('should return true for null values', () => {
      const row = { category: null };
      const filter: FilterGroupInput = {
        logic: 'AND',
        conditions: [{ field: 'category', operator: 'text_not_contains', value: 'flower' }]
      };
      expect(evaluateFilterGroup(row, filter)).toBe(true);
    });
  });

  describe('starts_with operator', () => {
    it('should match prefix (case-insensitive)', () => {
      const row = { category: 'Flower Premium' };
      const filter: FilterGroupInput = {
        logic: 'AND',
        conditions: [{ field: 'category', operator: 'starts_with', value: 'flower' }]
      };
      expect(evaluateFilterGroup(row, filter)).toBe(true);
    });

    it('should not match non-prefix', () => {
      const row = { category: 'Premium Flower' };
      const filter: FilterGroupInput = {
        logic: 'AND',
        conditions: [{ field: 'category', operator: 'starts_with', value: 'flower' }]
      };
      expect(evaluateFilterGroup(row, filter)).toBe(false);
    });
  });

  describe('ends_with operator', () => {
    it('should match suffix (case-insensitive)', () => {
      const row = { category: 'Premium Flower' };
      const filter: FilterGroupInput = {
        logic: 'AND',
        conditions: [{ field: 'category', operator: 'ends_with', value: 'flower' }]
      };
      expect(evaluateFilterGroup(row, filter)).toBe(true);
    });

    it('should not match non-suffix', () => {
      const row = { category: 'Flower Premium' };
      const filter: FilterGroupInput = {
        logic: 'AND',
        conditions: [{ field: 'category', operator: 'ends_with', value: 'flower' }]
      };
      expect(evaluateFilterGroup(row, filter)).toBe(false);
    });
  });

  // =========================================================================
  // ARRAY OPERATORS
  // =========================================================================

  describe('array_contains operator', () => {
    it('should match when array contains any value', () => {
      const row = { tags: ['organic', 'premium', 'indoor'] };
      const filter: FilterGroupInput = {
        logic: 'AND',
        conditions: [{ field: 'tags', operator: 'array_contains', value: ['organic', 'outdoor'] }]
      };
      expect(evaluateFilterGroup(row, filter)).toBe(true);
    });

    it('should not match when array contains none', () => {
      const row = { tags: ['organic', 'premium'] };
      const filter: FilterGroupInput = {
        logic: 'AND',
        conditions: [{ field: 'tags', operator: 'array_contains', value: ['outdoor', 'greenhouse'] }]
      };
      expect(evaluateFilterGroup(row, filter)).toBe(false);
    });

    it('should return false for non-array values', () => {
      const row = { tags: 'organic' };
      const filter: FilterGroupInput = {
        logic: 'AND',
        conditions: [{ field: 'tags', operator: 'array_contains', value: ['organic'] }]
      };
      expect(evaluateFilterGroup(row, filter)).toBe(false);
    });
  });

  describe('array_not_contains operator', () => {
    it('should match when array contains none', () => {
      const row = { tags: ['organic', 'premium'] };
      const filter: FilterGroupInput = {
        logic: 'AND',
        conditions: [{ field: 'tags', operator: 'array_not_contains', value: ['outdoor', 'greenhouse'] }]
      };
      expect(evaluateFilterGroup(row, filter)).toBe(true);
    });

    it('should not match when array contains any', () => {
      const row = { tags: ['organic', 'premium', 'indoor'] };
      const filter: FilterGroupInput = {
        logic: 'AND',
        conditions: [{ field: 'tags', operator: 'array_not_contains', value: ['organic', 'outdoor'] }]
      };
      expect(evaluateFilterGroup(row, filter)).toBe(false);
    });

    it('should return true for non-array values', () => {
      const row = { tags: 'organic' };
      const filter: FilterGroupInput = {
        logic: 'AND',
        conditions: [{ field: 'tags', operator: 'array_not_contains', value: ['organic'] }]
      };
      expect(evaluateFilterGroup(row, filter)).toBe(true);
    });
  });

  describe('array_contains_all operator', () => {
    it('should match when array contains all values', () => {
      const row = { tags: ['organic', 'premium', 'indoor'] };
      const filter: FilterGroupInput = {
        logic: 'AND',
        conditions: [{ field: 'tags', operator: 'array_contains_all', value: ['organic', 'premium'] }]
      };
      expect(evaluateFilterGroup(row, filter)).toBe(true);
    });

    it('should not match when array missing some values', () => {
      const row = { tags: ['organic', 'indoor'] };
      const filter: FilterGroupInput = {
        logic: 'AND',
        conditions: [{ field: 'tags', operator: 'array_contains_all', value: ['organic', 'premium', 'outdoor'] }]
      };
      expect(evaluateFilterGroup(row, filter)).toBe(false);
    });
  });

  // =========================================================================
  // UUID OPERATORS (in/not_in)
  // =========================================================================

  describe('in operator', () => {
    it('should match when value in list', () => {
      const row = { vendorId: 'uuid-123' };
      const filter: FilterGroupInput = {
        logic: 'AND',
        conditions: [{ field: 'vendorId', operator: 'in', value: ['uuid-123', 'uuid-456'] }]
      };
      expect(evaluateFilterGroup(row, filter)).toBe(true);
    });

    it('should not match when value not in list', () => {
      const row = { vendorId: 'uuid-789' };
      const filter: FilterGroupInput = {
        logic: 'AND',
        conditions: [{ field: 'vendorId', operator: 'in', value: ['uuid-123', 'uuid-456'] }]
      };
      expect(evaluateFilterGroup(row, filter)).toBe(false);
    });

    it('should return false for null values', () => {
      const row = { vendorId: null };
      const filter: FilterGroupInput = {
        logic: 'AND',
        conditions: [{ field: 'vendorId', operator: 'in', value: ['uuid-123', 'uuid-456'] }]
      };
      expect(evaluateFilterGroup(row, filter)).toBe(false);
    });
  });

  describe('not_in operator', () => {
    it('should match when value not in list', () => {
      const row = { vendorId: 'uuid-789' };
      const filter: FilterGroupInput = {
        logic: 'AND',
        conditions: [{ field: 'vendorId', operator: 'not_in', value: ['uuid-123', 'uuid-456'] }]
      };
      expect(evaluateFilterGroup(row, filter)).toBe(true);
    });

    it('should not match when value in list', () => {
      const row = { vendorId: 'uuid-123' };
      const filter: FilterGroupInput = {
        logic: 'AND',
        conditions: [{ field: 'vendorId', operator: 'not_in', value: ['uuid-123', 'uuid-456'] }]
      };
      expect(evaluateFilterGroup(row, filter)).toBe(false);
    });

    it('should return true for null values', () => {
      const row = { vendorId: null };
      const filter: FilterGroupInput = {
        logic: 'AND',
        conditions: [{ field: 'vendorId', operator: 'not_in', value: ['uuid-123', 'uuid-456'] }]
      };
      expect(evaluateFilterGroup(row, filter)).toBe(true);
    });
  });

  // =========================================================================
  // DATE OPERATORS
  // =========================================================================

  describe('before operator', () => {
    it('should match earlier dates', () => {
      const row = { intakeDate: '2026-01-15' };
      const filter: FilterGroupInput = {
        logic: 'AND',
        conditions: [{ field: 'intakeDate', operator: 'before', value: '2026-02-01' }]
      };
      expect(evaluateFilterGroup(row, filter)).toBe(true);
    });

    it('should not match later dates', () => {
      const row = { intakeDate: '2026-03-15' };
      const filter: FilterGroupInput = {
        logic: 'AND',
        conditions: [{ field: 'intakeDate', operator: 'before', value: '2026-02-01' }]
      };
      expect(evaluateFilterGroup(row, filter)).toBe(false);
    });
  });

  describe('after operator', () => {
    it('should match later dates', () => {
      const row = { intakeDate: '2026-03-15' };
      const filter: FilterGroupInput = {
        logic: 'AND',
        conditions: [{ field: 'intakeDate', operator: 'after', value: '2026-02-01' }]
      };
      expect(evaluateFilterGroup(row, filter)).toBe(true);
    });

    it('should not match earlier dates', () => {
      const row = { intakeDate: '2026-01-15' };
      const filter: FilterGroupInput = {
        logic: 'AND',
        conditions: [{ field: 'intakeDate', operator: 'after', value: '2026-02-01' }]
      };
      expect(evaluateFilterGroup(row, filter)).toBe(false);
    });
  });

  // =========================================================================
  // LOGIC OPERATORS (AND/OR)
  // =========================================================================

  describe('AND logic', () => {
    it('should match when all conditions true', () => {
      const row = { category: 'Flower', unitPrice: 25 };
      const filter: FilterGroupInput = {
        logic: 'AND',
        conditions: [
          { field: 'category', operator: 'equals', value: 'Flower' },
          { field: 'unitPrice', operator: 'less_than', value: 30 }
        ]
      };
      expect(evaluateFilterGroup(row, filter)).toBe(true);
    });

    it('should not match when any condition false', () => {
      const row = { category: 'Flower', unitPrice: 35 };
      const filter: FilterGroupInput = {
        logic: 'AND',
        conditions: [
          { field: 'category', operator: 'equals', value: 'Flower' },
          { field: 'unitPrice', operator: 'less_than', value: 30 }
        ]
      };
      expect(evaluateFilterGroup(row, filter)).toBe(false);
    });
  });

  describe('OR logic', () => {
    it('should match when any condition true', () => {
      const row = { category: 'Flower', unitPrice: 35 };
      const filter: FilterGroupInput = {
        logic: 'OR',
        conditions: [
          { field: 'category', operator: 'equals', value: 'Extract' },
          { field: 'unitPrice', operator: 'less_than', value: 30 },
          { field: 'category', operator: 'equals', value: 'Flower' }
        ]
      };
      expect(evaluateFilterGroup(row, filter)).toBe(true);
    });

    it('should not match when all conditions false', () => {
      const row = { category: 'Flower', unitPrice: 35 };
      const filter: FilterGroupInput = {
        logic: 'OR',
        conditions: [
          { field: 'category', operator: 'equals', value: 'Extract' },
          { field: 'unitPrice', operator: 'less_than', value: 30 }
        ]
      };
      expect(evaluateFilterGroup(row, filter)).toBe(false);
    });
  });

  // =========================================================================
  // NESTED GROUPS
  // =========================================================================

  describe('Nested filter groups', () => {
    it('should evaluate nested AND within OR', () => {
      const row = { category: 'Flower', unitPrice: 25, tags: ['organic'] };
      const filter: FilterGroupInput = {
        logic: 'OR',
        conditions: [
          {
            logic: 'AND',
            conditions: [
              { field: 'category', operator: 'equals', value: 'Flower' },
              { field: 'unitPrice', operator: 'less_than', value: 30 }
            ]
          },
          { field: 'tags', operator: 'array_contains', value: ['premium'] }
        ]
      };
      expect(evaluateFilterGroup(row, filter)).toBe(true);
    });

    it('should evaluate nested OR within AND', () => {
      const row = { category: 'Flower', unitPrice: 25 };
      const filter: FilterGroupInput = {
        logic: 'AND',
        conditions: [
          {
            logic: 'OR',
            conditions: [
              { field: 'category', operator: 'equals', value: 'Flower' },
              { field: 'category', operator: 'equals', value: 'Extract' }
            ]
          },
          { field: 'unitPrice', operator: 'less_than', value: 30 }
        ]
      };
      expect(evaluateFilterGroup(row, filter)).toBe(true);
    });

    it('should handle 3 levels of nesting', () => {
      const row = { category: 'Flower', unitPrice: 25, tags: ['organic'] };
      const filter: FilterGroupInput = {
        logic: 'AND',
        conditions: [
          {
            logic: 'OR',
            conditions: [
              {
                logic: 'AND',
                conditions: [
                  { field: 'category', operator: 'equals', value: 'Flower' },
                  { field: 'unitPrice', operator: 'less_than', value: 30 }
                ]
              },
              { field: 'tags', operator: 'array_contains', value: ['premium'] }
            ]
          }
        ]
      };
      expect(evaluateFilterGroup(row, filter)).toBe(true);
    });
  });

  // =========================================================================
  // FIELD WHITELIST PROTECTION
  // =========================================================================

  describe('Field whitelist protection', () => {
    it('should reject unauthorized fields', () => {
      const row = { category: 'Flower', __proto__: 'evil' };
      const filter: FilterGroupInput = {
        logic: 'AND',
        conditions: [{ field: '__proto__' as any, operator: 'equals', value: 'evil' }]
      };
      expect(evaluateFilterGroup(row, filter)).toBe(false);
    });

    it('should reject constructor field access', () => {
      const row = { category: 'Flower', constructor: 'evil' };
      const filter: FilterGroupInput = {
        logic: 'AND',
        conditions: [{ field: 'constructor' as any, operator: 'equals', value: 'evil' }]
      };
      expect(evaluateFilterGroup(row, filter)).toBe(false);
    });
  });

  // =========================================================================
  // RECURSION DEPTH PROTECTION
  // =========================================================================

  describe('Recursion depth protection', () => {
    it('should prevent deep recursion attacks', () => {
      // Build 101-level deep filter (exceeds MAX_CLIENT_RECURSION = 100)
      let filter: FilterGroupInput = {
        logic: 'AND',
        conditions: [{ field: 'category', operator: 'equals', value: 'Flower' }]
      };

      for (let i = 0; i < 101; i++) {
        filter = {
          logic: 'AND',
          conditions: [filter]
        };
      }

      const row = { category: 'Flower' };
      expect(evaluateFilterGroup(row, filter)).toBe(false);
    });
  });

  // =========================================================================
  // EDGE CASES
  // =========================================================================

  describe('Edge cases', () => {
    it('should handle empty conditions array', () => {
      const row = { category: 'Flower' };
      const filter: FilterGroupInput = {
        logic: 'AND',
        conditions: []
      };
      expect(evaluateFilterGroup(row, filter)).toBe(true);
    });

    it('should handle NaN values gracefully', () => {
      const row = { unitPrice: NaN };
      const filter: FilterGroupInput = {
        logic: 'AND',
        conditions: [{ field: 'unitPrice', operator: 'greater_than', value: 10 }]
      };
      expect(evaluateFilterGroup(row, filter)).toBe(false);
    });

    it('should handle invalid logic operator', () => {
      const row = { category: 'Flower' };
      const filter: any = {
        logic: 'XOR',
        conditions: [{ field: 'category', operator: 'equals', value: 'Flower' }]
      };
      expect(evaluateFilterGroup(row, filter)).toBe(false);
    });

    // TEST-CRIT-4: Additional NaN edge cases
    it('should return false when value is NaN for equals', () => {
      const row = { unitPrice: 'not-a-number' as any };
      const filter: FilterGroupInput = {
        logic: 'AND',
        conditions: [{ field: 'unitPrice', operator: 'equals', value: 25 }]
      };
      expect(evaluateFilterGroup(row, filter)).toBe(false);
    });

    it('should return false when value is NaN for between', () => {
      const row = { unitPrice: 'abc' as any };
      const filter: FilterGroupInput = {
        logic: 'AND',
        conditions: [{ field: 'unitPrice', operator: 'between', value: [10, 50] }]
      };
      expect(evaluateFilterGroup(row, filter)).toBe(false);
    });

    it('should return false when min/max are non-numeric in between', () => {
      const row = { unitPrice: 25 };
      const filter: any = {
        logic: 'AND',
        conditions: [{ field: 'unitPrice', operator: 'between', value: ['abc', 'def'] }]
      };
      expect(evaluateFilterGroup(row, filter)).toBe(false);
    });

    it('should handle empty array in array_contains', () => {
      const row = { tags: ['organic'] };
      const filter: any = {
        logic: 'AND',
        conditions: [{ field: 'tags', operator: 'array_contains', value: [] }]
      };
      // Empty search array means "does it contain any of []?" = false
      expect(evaluateFilterGroup(row, filter)).toBe(false);
    });

    it('should handle null in array fields', () => {
      const row = { tags: null };
      const filter: FilterGroupInput = {
        logic: 'AND',
        conditions: [{ field: 'tags', operator: 'array_contains', value: ['organic'] }]
      };
      expect(evaluateFilterGroup(row, filter)).toBe(false);
    });
  });

  // =========================================================================
  // calculateAgeDays UTILITY
  // =========================================================================

  describe('calculateAgeDays', () => {
    it('should calculate age correctly', () => {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const age = calculateAgeDays(thirtyDaysAgo.toISOString());
      expect(age).toBe(30);
    });

    it('should return null for null input', () => {
      expect(calculateAgeDays(null)).toBe(null);
    });

    it('should return 0 for today', () => {
      const today = new Date().toISOString();
      expect(calculateAgeDays(today)).toBe(0);
    });
  });
});
