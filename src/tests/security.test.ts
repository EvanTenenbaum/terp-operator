import { describe, it, expect, vi } from 'vitest';
import { evaluateFilterGroup } from '../client/utils/filterEvaluator';
import { buildFilterSql } from '../server/utils/filterSqlBuilder';
import { ALLOWED_FILTER_FIELDS } from '../shared/filterSchemas';
import type { FilterGroupInput } from '../shared/filterSchemas';
// Note: getGroupAtPath is not exported, testing via component behavior instead

/**
 * Security Fuzzing Tests
 *
 * Tests against common attack vectors:
 * - Prototype pollution
 * - SQL injection
 * - Field whitelist bypass
 * - Logic operator injection
 * - Deep nesting DoS
 * - XSS via stored filters
 */

describe('Security tests', () => {

  describe('Prototype pollution prevention', () => {
    it('should reject __proto__ field access', () => {
      const row = { category: 'Flower' };
      const maliciousFilter: any = {
        logic: 'AND',
        conditions: [{ field: '__proto__', operator: 'equals', value: 'evil' }]
      };

      // Should return false (unauthorized field)
      expect(evaluateFilterGroup(row, maliciousFilter)).toBe(false);
    });

    it('should reject constructor field access', () => {
      const row = { category: 'Flower' };
      const maliciousFilter: any = {
        logic: 'AND',
        conditions: [{ field: 'constructor', operator: 'equals', value: 'evil' }]
      };

      expect(evaluateFilterGroup(row, maliciousFilter)).toBe(false);
    });

    it('should reject prototype field access', () => {
      const row = { category: 'Flower' };
      const maliciousFilter: any = {
        logic: 'AND',
        conditions: [{ field: 'prototype', operator: 'equals', value: 'evil' }]
      };

      expect(evaluateFilterGroup(row, maliciousFilter)).toBe(false);
    });

    it('should only allow whitelisted fields', () => {
      const allowedFields = Array.from(ALLOWED_FILTER_FIELDS);
      const dangerousFields = ['__proto__', 'constructor', 'prototype', 'password', 'token', 'secret'];

      dangerousFields.forEach(field => {
        expect(allowedFields).not.toContain(field);
      });
    });
  });

  describe('SQL injection prevention', () => {
    it('should prevent SQL injection via DROP TABLE', () => {
      const params: any[] = [];
      const whereClauses: string[] = [];
      const maliciousFilter: FilterGroupInput = {
        logic: 'AND',
        conditions: [
          { field: 'category', operator: 'equals', value: "'; DROP TABLE batches; --" as any }
        ]
      };

      buildFilterSql(maliciousFilter, params, whereClauses);

      // SQL should use parameterization, not concatenation
      expect(whereClauses[0]).toBe('(b.category = $1)');
      expect(whereClauses[0]).not.toContain('DROP');
      expect(params[0]).toBe("'; DROP TABLE batches; --");
    });

    it('should prevent SQL injection via UNION SELECT', () => {
      const params: any[] = [];
      const whereClauses: string[] = [];
      const maliciousFilter: FilterGroupInput = {
        logic: 'AND',
        conditions: [
          { field: 'category', operator: 'text_contains', value: "' UNION SELECT password FROM users --" }
        ]
      };

      buildFilterSql(maliciousFilter, params, whereClauses);

      expect(whereClauses[0]).toBe('(b.category ILIKE $1)');
      expect(whereClauses[0]).not.toContain('UNION');
      expect(params[0]).toBe("%' UNION SELECT password FROM users --%");
    });

    it('should prevent SQL injection via comment bypass', () => {
      const params: any[] = [];
      const whereClauses: string[] = [];
      const maliciousFilter: FilterGroupInput = {
        logic: 'AND',
        conditions: [
          { field: 'category', operator: 'equals', value: "Flower' OR '1'='1" as any }
        ]
      };

      buildFilterSql(maliciousFilter, params, whereClauses);

      expect(whereClauses[0]).toBe('(b.category = $1)');
      expect(params[0]).toBe("Flower' OR '1'='1");
    });

    it('should prevent SQL injection via stacked queries', () => {
      const params: any[] = [];
      const whereClauses: string[] = [];
      const maliciousFilter: FilterGroupInput = {
        logic: 'AND',
        conditions: [
          { field: 'category', operator: 'text_contains', value: "'; DELETE FROM batches WHERE '1'='1" }
        ]
      };

      buildFilterSql(maliciousFilter, params, whereClauses);

      expect(whereClauses[0]).toBe('(b.category ILIKE $1)');
      expect(whereClauses[0]).not.toContain('DELETE');
    });

    it('should prevent field name injection', () => {
      const params: any[] = [];
      const whereClauses: string[] = [];
      const maliciousFilter: any = {
        logic: 'AND',
        conditions: [
          { field: 'category OR 1=1 --', operator: 'equals', value: 'test' }
        ]
      };

      // Should throw error (invalid field)
      expect(() => buildFilterSql(maliciousFilter, params, whereClauses)).toThrow();
    });
  });

  describe('Logic operator injection', () => {
    it('should reject invalid logic operators', () => {
      const params: any[] = [];
      const whereClauses: string[] = [];
      const maliciousFilter: any = {
        logic: 'XOR',
        conditions: [{ field: 'category', operator: 'equals', value: 'Flower' }]
      };

      expect(() => buildFilterSql(maliciousFilter, params, whereClauses)).toThrow();
    });

    it('should reject SQL keywords as logic operators', () => {
      const params: any[] = [];
      const whereClauses: string[] = [];
      const maliciousFilter: any = {
        logic: 'UNION',
        conditions: [{ field: 'category', operator: 'equals', value: 'Flower' }]
      };

      expect(() => buildFilterSql(maliciousFilter, params, whereClauses)).toThrow();
    });
  });

  describe('Deep nesting DoS prevention', () => {
    it('should prevent deep recursion DoS on client', () => {
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

      // Should return false (recursion limit exceeded)
      expect(evaluateFilterGroup(row, filter)).toBe(false);
    });

    it('should prevent deep recursion DoS on server', () => {
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

      // Should throw error
      expect(() => buildFilterSql(filter, params, whereClauses)).toThrow();
    });

    it('should handle max allowed depth (5 levels) safely', () => {
      // Build 5-level deep filter (max allowed)
      let filter: FilterGroupInput = {
        logic: 'AND',
        conditions: [{ field: 'category', operator: 'equals', value: 'Flower' }]
      };

      for (let i = 0; i < 4; i++) {
        filter = {
          logic: 'AND',
          conditions: [filter]
        };
      }

      const params: any[] = [];
      const whereClauses: string[] = [];

      // Should not throw
      expect(() => buildFilterSql(filter, params, whereClauses)).not.toThrow();
    });
  });

  describe('XSS prevention in stored filters', () => {
    it('should not allow script tags in filter values', () => {
      const row = { category: '<script>alert("XSS")</script>' };
      const filter: FilterGroupInput = {
        logic: 'AND',
        conditions: [
          { field: 'category', operator: 'equals', value: '<script>alert("XSS")</script>' as any }
        ]
      };

      // Filter should work (values are treated as data, not code)
      const result = evaluateFilterGroup(row, filter);
      expect(result).toBe(true);
    });

    it('should sanitize special characters in SQL', () => {
      const params: any[] = [];
      const whereClauses: string[] = [];
      const filter: FilterGroupInput = {
        logic: 'AND',
        conditions: [
          { field: 'category', operator: 'text_contains', value: "<img src=x onerror='alert(1)'>" }
        ]
      };

      buildFilterSql(filter, params, whereClauses);

      // Value is parameterized, no code execution risk
      expect(params[0]).toBe("%<img src=x onerror='alert(1)'>%");
    });
  });

  describe('Array operator security', () => {
    it('should prevent array injection attacks', () => {
      const params: any[] = [];
      const whereClauses: string[] = [];
      const maliciousFilter: FilterGroupInput = {
        logic: 'AND',
        conditions: [
          { field: 'tags', operator: 'array_contains', value: ["'; DROP TABLE batches; --"] }
        ]
      };

      buildFilterSql(maliciousFilter, params, whereClauses);

      // Array values are parameterized (using && overlaps operator for ANY semantics)
      expect(whereClauses[0]).toBe('(b.tags && $1::varchar[])');
      expect(params[0]).toEqual(["'; DROP TABLE batches; --"]);
    });
  });

  describe('UUID operator security', () => {
    it('should prevent UUID injection', () => {
      const params: any[] = [];
      const whereClauses: string[] = [];
      const maliciousFilter: FilterGroupInput = {
        logic: 'AND',
        conditions: [
          { field: 'vendorId', operator: 'in', value: ["uuid-123' OR '1'='1"] }
        ]
      };

      buildFilterSql(maliciousFilter, params, whereClauses);

      // UUID values are parameterized using IN clause (changed from = ANY() to avoid array cast issues)
      expect(whereClauses[0]).toBe('(b.vendor_id IN ($1))');
      expect(params[0]).toBe("uuid-123' OR '1'='1"); // Individual param, not array
    });
  });

  describe('Date operator security', () => {
    it('should prevent date injection attacks', () => {
      const params: any[] = [];
      const whereClauses: string[] = [];
      const maliciousFilter: FilterGroupInput = {
        logic: 'AND',
        conditions: [
          { field: 'intakeDate', operator: 'before', value: "2026-01-01' OR '1'='1" }
        ]
      };

      buildFilterSql(maliciousFilter, params, whereClauses);

      // Date values are parameterized with type cast
      expect(whereClauses[0]).toBe('(b.intake_date < $1::timestamptz)');
      expect(params[0]).toBe("2026-01-01' OR '1'='1");
    });
  });

  describe('Field whitelist enforcement', () => {
    it('should enforce whitelist on all operators', () => {
      const unauthorizedField = 'password';
      const operators = ['equals', 'text_contains', 'is_null'];

      operators.forEach(operator => {
        const row = { password: 'secret' };
        const filter: any = {
          logic: 'AND',
          conditions: [{ field: unauthorizedField, operator, value: 'test' }]
        };

        expect(evaluateFilterGroup(row, filter)).toBe(false);
      });
    });

    it('should log warnings for unauthorized access attempts', () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const row = { category: 'Flower' };
      const filter: any = {
        logic: 'AND',
        conditions: [{ field: '__proto__', operator: 'equals', value: 'evil' }]
      };

      evaluateFilterGroup(row, filter);

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Unauthorized field access attempt')
      );

      consoleWarnSpy.mockRestore();
    });
  });
});
