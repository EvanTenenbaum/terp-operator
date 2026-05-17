import { describe, it, expect } from 'vitest';
import { buildFilterSql } from '../server/utils/filterSqlBuilder';
import type { FilterGroupInput } from '../shared/filterSchemas';

describe('filterSqlBuilder', () => {

  // =========================================================================
  // NULL CHECK OPERATORS
  // =========================================================================

  describe('is_null operator', () => {
    it('should generate IS NULL SQL', () => {
      const params: any[] = [];
      const whereClauses: string[] = [];
      const filter: FilterGroupInput = {
        logic: 'AND',
        conditions: [{ field: 'category', operator: 'is_null', value: null }]
      };

      buildFilterSql(filter, params, whereClauses);

      expect(whereClauses).toHaveLength(1);
      expect(whereClauses[0]).toBe('(b.category IS NULL)');
      expect(params).toHaveLength(0); // No parameters for IS NULL
    });
  });

  describe('is_not_null operator', () => {
    it('should generate IS NOT NULL SQL', () => {
      const params: any[] = [];
      const whereClauses: string[] = [];
      const filter: FilterGroupInput = {
        logic: 'AND',
        conditions: [{ field: 'category', operator: 'is_not_null', value: null }]
      };

      buildFilterSql(filter, params, whereClauses);

      expect(whereClauses).toHaveLength(1);
      expect(whereClauses[0]).toBe('(b.category IS NOT NULL)');
      expect(params).toHaveLength(0);
    });
  });

  // =========================================================================
  // NUMERIC OPERATORS
  // =========================================================================

  describe('equals operator', () => {
    it('should generate parameterized = SQL', () => {
      const params: any[] = [];
      const whereClauses: string[] = [];
      const filter: FilterGroupInput = {
        logic: 'AND',
        conditions: [{ field: 'unitPrice', operator: 'equals', value: 25.50 }]
      };

      buildFilterSql(filter, params, whereClauses);

      expect(whereClauses).toHaveLength(1);
      expect(whereClauses[0]).toBe('(b.unit_price = $1)');
      expect(params).toEqual([25.50]);
    });
  });

  describe('not_equals operator', () => {
    it('should generate parameterized != SQL', () => {
      const params: any[] = [];
      const whereClauses: string[] = [];
      const filter: FilterGroupInput = {
        logic: 'AND',
        conditions: [{ field: 'unitPrice', operator: 'not_equals', value: 30 }]
      };

      buildFilterSql(filter, params, whereClauses);

      expect(whereClauses).toHaveLength(1);
      expect(whereClauses[0]).toBe('(b.unit_price != $1)');
      expect(params).toEqual([30]);
    });
  });

  describe('greater_than operator', () => {
    it('should generate parameterized > SQL', () => {
      const params: any[] = [];
      const whereClauses: string[] = [];
      const filter: FilterGroupInput = {
        logic: 'AND',
        conditions: [{ field: 'unitPrice', operator: 'greater_than', value: 20 }]
      };

      buildFilterSql(filter, params, whereClauses);

      expect(whereClauses).toHaveLength(1);
      expect(whereClauses[0]).toBe('(b.unit_price > $1)');
      expect(params).toEqual([20]);
    });
  });

  describe('less_than operator', () => {
    it('should generate parameterized < SQL', () => {
      const params: any[] = [];
      const whereClauses: string[] = [];
      const filter: FilterGroupInput = {
        logic: 'AND',
        conditions: [{ field: 'unitPrice', operator: 'less_than', value: 50 }]
      };

      buildFilterSql(filter, params, whereClauses);

      expect(whereClauses).toHaveLength(1);
      expect(whereClauses[0]).toBe('(b.unit_price < $1)');
      expect(params).toEqual([50]);
    });
  });

  describe('greater_than_or_equal operator', () => {
    it('should generate parameterized >= SQL', () => {
      const params: any[] = [];
      const whereClauses: string[] = [];
      const filter: FilterGroupInput = {
        logic: 'AND',
        conditions: [{ field: 'unitPrice', operator: 'greater_than_or_equal', value: 25 }]
      };

      buildFilterSql(filter, params, whereClauses);

      expect(whereClauses).toHaveLength(1);
      expect(whereClauses[0]).toBe('(b.unit_price >= $1)');
      expect(params).toEqual([25]);
    });
  });

  describe('less_than_or_equal operator', () => {
    it('should generate parameterized <= SQL', () => {
      const params: any[] = [];
      const whereClauses: string[] = [];
      const filter: FilterGroupInput = {
        logic: 'AND',
        conditions: [{ field: 'unitPrice', operator: 'less_than_or_equal', value: 100 }]
      };

      buildFilterSql(filter, params, whereClauses);

      expect(whereClauses).toHaveLength(1);
      expect(whereClauses[0]).toBe('(b.unit_price <= $1)');
      expect(params).toEqual([100]);
    });
  });

  describe('between operator (numeric)', () => {
    it('should generate parameterized BETWEEN SQL', () => {
      const params: any[] = [];
      const whereClauses: string[] = [];
      const filter: FilterGroupInput = {
        logic: 'AND',
        conditions: [{ field: 'unitPrice', operator: 'between', value: [20, 50] }]
      };

      buildFilterSql(filter, params, whereClauses);

      expect(whereClauses).toHaveLength(1);
      expect(whereClauses[0]).toBe('(b.unit_price BETWEEN $1 AND $2)');
      expect(params).toEqual([20, 50]);
    });
  });

  // =========================================================================
  // TEXT OPERATORS
  // =========================================================================

  describe('text_contains operator', () => {
    it('should generate parameterized ILIKE SQL with wildcards', () => {
      const params: any[] = [];
      const whereClauses: string[] = [];
      const filter: FilterGroupInput = {
        logic: 'AND',
        conditions: [{ field: 'category', operator: 'text_contains', value: 'flower' }]
      };

      buildFilterSql(filter, params, whereClauses);

      expect(whereClauses).toHaveLength(1);
      expect(whereClauses[0]).toBe('(b.category ILIKE $1)');
      expect(params).toEqual(['%flower%']);
    });

    it('should not allow SQL injection via wildcards', () => {
      const params: any[] = [];
      const whereClauses: string[] = [];
      const filter: FilterGroupInput = {
        logic: 'AND',
        conditions: [{ field: 'category', operator: 'text_contains', value: "\'; DROP TABLE batches; --" }]
      };

      buildFilterSql(filter, params, whereClauses);

      expect(whereClauses).toHaveLength(1);
      expect(whereClauses[0]).toBe('(b.category ILIKE $1)');
      expect(params).toEqual(["%'; DROP TABLE batches; --%"]);
    });

    // TEST-HIGH-5: Wildcard escaping
    it('should escape SQL wildcards (% and _) to prevent unintended pattern matching', () => {
      const params: any[] = [];
      const whereClauses: string[] = [];
      const filter: FilterGroupInput = {
        logic: 'AND',
        conditions: [{ field: 'category', operator: 'text_contains', value: '50%_discount' }]
      };

      buildFilterSql(filter, params, whereClauses);

      // Wildcards should be escaped as \% and \_
      expect(params[0]).toBe('%50\\%\\_discount%');
    });
  });

  describe('text_not_contains operator', () => {
    it('should generate parameterized NOT ILIKE SQL', () => {
      const params: any[] = [];
      const whereClauses: string[] = [];
      const filter: FilterGroupInput = {
        logic: 'AND',
        conditions: [{ field: 'category', operator: 'text_not_contains', value: 'extract' }]
      };

      buildFilterSql(filter, params, whereClauses);

      expect(whereClauses).toHaveLength(1);
      expect(whereClauses[0]).toBe('(b.category NOT ILIKE $1)');
      expect(params).toEqual(['%extract%']);
    });
  });

  describe('starts_with operator', () => {
    it('should generate ILIKE with trailing wildcard', () => {
      const params: any[] = [];
      const whereClauses: string[] = [];
      const filter: FilterGroupInput = {
        logic: 'AND',
        conditions: [{ field: 'category', operator: 'starts_with', value: 'flower' }]
      };

      buildFilterSql(filter, params, whereClauses);

      expect(whereClauses).toHaveLength(1);
      expect(whereClauses[0]).toBe('(b.category ILIKE $1)');
      expect(params).toEqual(['flower%']);
    });
  });

  describe('ends_with operator', () => {
    it('should generate ILIKE with leading wildcard', () => {
      const params: any[] = [];
      const whereClauses: string[] = [];
      const filter: FilterGroupInput = {
        logic: 'AND',
        conditions: [{ field: 'category', operator: 'ends_with', value: 'premium' }]
      };

      buildFilterSql(filter, params, whereClauses);

      expect(whereClauses).toHaveLength(1);
      expect(whereClauses[0]).toBe('(b.category ILIKE $1)');
      expect(params).toEqual(['%premium']);
    });
  });

  // =========================================================================
  // ARRAY OPERATORS
  // =========================================================================

  describe('array_contains operator', () => {
    it('should generate && (overlaps) operator for ANY semantics', () => {
      const params: any[] = [];
      const whereClauses: string[] = [];
      const filter: FilterGroupInput = {
        logic: 'AND',
        conditions: [{ field: 'tags', operator: 'array_contains', value: ['organic', 'premium'] }]
      };

      buildFilterSql(filter, params, whereClauses);

      expect(whereClauses).toHaveLength(1);
      expect(whereClauses[0]).toBe('(b.tags && $1::varchar[])'); // Changed from @> to && for ANY semantics
      expect(params).toEqual([['organic', 'premium']]);
    });
  });

  describe('array_not_contains operator', () => {
    it('should generate NOT (&&) operator for NOT ANY semantics', () => {
      const params: any[] = [];
      const whereClauses: string[] = [];
      const filter: FilterGroupInput = {
        logic: 'AND',
        conditions: [{ field: 'tags', operator: 'array_not_contains', value: ['outdoor'] }]
      };

      buildFilterSql(filter, params, whereClauses);

      expect(whereClauses).toHaveLength(1);
      expect(whereClauses[0]).toBe('(NOT (b.tags && $1::varchar[]))'); // Changed from @> to && for ANY semantics
      expect(params).toEqual([['outdoor']]);
    });
  });

  describe('array_contains_all operator', () => {
    it('should generate @> operator (same as array_contains)', () => {
      const params: any[] = [];
      const whereClauses: string[] = [];
      const filter: FilterGroupInput = {
        logic: 'AND',
        conditions: [{ field: 'tags', operator: 'array_contains_all', value: ['organic', 'premium', 'indoor'] }]
      };

      buildFilterSql(filter, params, whereClauses);

      expect(whereClauses).toHaveLength(1);
      expect(whereClauses[0]).toBe('(b.tags @> $1::varchar[])');
      expect(params).toEqual([['organic', 'premium', 'indoor']]);
    });
  });

  // =========================================================================
  // UUID OPERATORS
  // =========================================================================

  describe('in operator', () => {
    it('should generate IN clause to avoid array cast issues', () => {
      const params: any[] = [];
      const whereClauses: string[] = [];
      const filter: FilterGroupInput = {
        logic: 'AND',
        conditions: [{ field: 'vendorId', operator: 'in', value: ['uuid-123', 'uuid-456'] }]
      };

      buildFilterSql(filter, params, whereClauses);

      expect(whereClauses).toHaveLength(1);
      expect(whereClauses[0]).toBe('(b.vendor_id IN ($1, $2))'); // Changed from = ANY() to IN clause
      expect(params).toEqual(['uuid-123', 'uuid-456']); // Individual params, not array
    });
  });

  describe('not_in operator', () => {
    it('should generate NOT IN clause to avoid array cast issues', () => {
      const params: any[] = [];
      const whereClauses: string[] = [];
      const filter: FilterGroupInput = {
        logic: 'AND',
        conditions: [{ field: 'vendorId', operator: 'not_in', value: ['uuid-789'] }]
      };

      buildFilterSql(filter, params, whereClauses);

      expect(whereClauses).toHaveLength(1);
      expect(whereClauses[0]).toBe('(b.vendor_id NOT IN ($1))'); // Changed from != ALL() to NOT IN
      expect(params).toEqual(['uuid-789']); // Individual param, not array
    });
  });

  // =========================================================================
  // DATE OPERATORS
  // =========================================================================

  describe('before operator', () => {
    it('should generate < SQL with timestamptz cast', () => {
      const params: any[] = [];
      const whereClauses: string[] = [];
      const filter: FilterGroupInput = {
        logic: 'AND',
        conditions: [{ field: 'intakeDate', operator: 'before', value: '2026-02-01T00:00:00Z' }]
      };

      buildFilterSql(filter, params, whereClauses);

      expect(whereClauses).toHaveLength(1);
      expect(whereClauses[0]).toBe('(b.intake_date < $1::timestamptz)');
      expect(params).toEqual(['2026-02-01T00:00:00Z']);
    });
  });

  describe('after operator', () => {
    it('should generate > SQL with timestamptz cast', () => {
      const params: any[] = [];
      const whereClauses: string[] = [];
      const filter: FilterGroupInput = {
        logic: 'AND',
        conditions: [{ field: 'intakeDate', operator: 'after', value: '2026-01-01T00:00:00Z' }]
      };

      buildFilterSql(filter, params, whereClauses);

      expect(whereClauses).toHaveLength(1);
      expect(whereClauses[0]).toBe('(b.intake_date > $1::timestamptz)');
      expect(params).toEqual(['2026-01-01T00:00:00Z']);
    });
  });

  // =========================================================================
  // LOGIC OPERATORS (AND/OR)
  // =========================================================================

  describe('AND logic', () => {
    it('should join multiple conditions with AND', () => {
      const params: any[] = [];
      const whereClauses: string[] = [];
      const filter: FilterGroupInput = {
        logic: 'AND',
        conditions: [
          { field: 'category', operator: 'equals', value: 'Flower' },
          { field: 'unitPrice', operator: 'less_than', value: 30 }
        ]
      };

      buildFilterSql(filter, params, whereClauses);

      expect(whereClauses).toHaveLength(1);
      expect(whereClauses[0]).toBe('(b.category = $1 AND b.unit_price < $2)');
      expect(params).toEqual(['Flower', 30]);
    });
  });

  describe('OR logic', () => {
    it('should join multiple conditions with OR', () => {
      const params: any[] = [];
      const whereClauses: string[] = [];
      const filter: FilterGroupInput = {
        logic: 'OR',
        conditions: [
          { field: 'category', operator: 'equals', value: 'Flower' },
          { field: 'category', operator: 'equals', value: 'Extract' }
        ]
      };

      buildFilterSql(filter, params, whereClauses);

      expect(whereClauses).toHaveLength(1);
      expect(whereClauses[0]).toBe('(b.category = $1 OR b.category = $2)');
      expect(params).toEqual(['Flower', 'Extract']);
    });
  });

  // =========================================================================
  // NESTED GROUPS
  // =========================================================================

  describe('Nested filter groups', () => {
    it('should handle nested AND within OR', () => {
      const params: any[] = [];
      const whereClauses: string[] = [];
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

      buildFilterSql(filter, params, whereClauses);

      expect(whereClauses).toHaveLength(1);
      expect(whereClauses[0]).toBe('(((b.category = $1 AND b.unit_price < $2)) OR b.tags && $3::varchar[])'); // Changed @> to &&
      expect(params).toEqual(['Flower', 30, ['premium']]);
    });
  });

  // =========================================================================
  // SQL INJECTION PREVENTION
  // =========================================================================

  describe('SQL injection prevention', () => {
    it('should prevent injection via field values', () => {
      const params: any[] = [];
      const whereClauses: string[] = [];
      const filter: FilterGroupInput = {
        logic: 'AND',
        conditions: [
          { field: 'category', operator: 'equals', value: "'; DROP TABLE batches; --" as any }
        ]
      };

      buildFilterSql(filter, params, whereClauses);

      // Value is parameterized, not concatenated
      expect(whereClauses[0]).toBe("(b.category = $1)");
      expect(params).toEqual(["'; DROP TABLE batches; --"]);
    });

    it('should prevent injection via UNION attacks', () => {
      const params: any[] = [];
      const whereClauses: string[] = [];
      const filter: FilterGroupInput = {
        logic: 'AND',
        conditions: [
          { field: 'category', operator: 'text_contains', value: "' UNION SELECT * FROM users --" }
        ]
      };

      buildFilterSql(filter, params, whereClauses);

      // Value is parameterized with wildcards
      expect(whereClauses[0]).toBe('(b.category ILIKE $1)');
      expect(params).toEqual(["%' UNION SELECT * FROM users --%"]);
    });

    it('should reject unauthorized fields (prevents field injection)', () => {
      const params: any[] = [];
      const whereClauses: string[] = [];
      const filter: any = {
        logic: 'AND',
        conditions: [
          { field: 'password', operator: 'equals', value: 'hacked' }
        ]
      };

      // Should throw TRPCError
      expect(() => buildFilterSql(filter, params, whereClauses)).toThrow();
    });
  });

  // =========================================================================
  // RECURSION DEPTH PROTECTION
  // =========================================================================

  describe('Recursion depth protection', () => {
    it('should reject deeply nested filters (> 100 levels)', () => {
      // Build 101-level deep filter
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

      const params: any[] = [];
      const whereClauses: string[] = [];

      // Should throw TRPCError
      expect(() => buildFilterSql(filter, params, whereClauses)).toThrow('recursion');
    });
  });

  // =========================================================================
  // PARAMETER INDEXING
  // =========================================================================

  describe('Parameter indexing', () => {
    it('should correctly index parameters starting from existing params', () => {
      const params: any[] = ['existing-param-1', 'existing-param-2'];
      const whereClauses: string[] = [];
      const filter: FilterGroupInput = {
        logic: 'AND',
        conditions: [
          { field: 'category', operator: 'equals', value: 'Flower' },
          { field: 'unitPrice', operator: 'less_than', value: 30 }
        ]
      };

      buildFilterSql(filter, params, whereClauses);

      // Parameters should start at $3 (after existing 2 params)
      expect(whereClauses[0]).toBe('(b.category = $3 AND b.unit_price < $4)');
      expect(params).toEqual(['existing-param-1', 'existing-param-2', 'Flower', 30]);
    });
  });

  // =========================================================================
  // INVALID LOGIC OPERATOR
  // =========================================================================

  describe('Invalid logic operator', () => {
    it('should reject invalid logic operators', () => {
      const params: any[] = [];
      const whereClauses: string[] = [];
      const filter: any = {
        logic: 'XOR',
        conditions: [{ field: 'category', operator: 'equals', value: 'Flower' }]
      };

      // Should throw TRPCError
      expect(() => buildFilterSql(filter, params, whereClauses)).toThrow();
    });
  });
});
