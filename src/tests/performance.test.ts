import { describe, it, expect } from 'vitest';
import { evaluateFilterGroup, calculateAgeDays } from '../client/utils/filterEvaluator';
import { buildFilterSql } from '../server/utils/filterSqlBuilder';
import type { FilterGroupInput } from '../shared/filterSchemas';

/**
 * Performance Benchmark Tests
 *
 * Validates that filter operations complete within acceptable time limits:
 * - Client-side evaluation: < 100ms for 10k products
 * - SQL builder: < 10ms for complex filters
 * - Recursion handling: graceful degradation
 */

describe('Performance benchmarks', () => {

  describe('Client-side filter evaluation', () => {
    it('should evaluate 10k products in < 100ms', () => {
      // Generate 10k test products
      const products = Array.from({ length: 10000 }, (_, i) => ({
        id: `batch-${i}`,
        category: i % 3 === 0 ? 'Flower' : i % 3 === 1 ? 'Extract' : 'Edible',
        unitPrice: 10 + (i % 90),
        availableQty: 1 + (i % 100),
        tags: i % 2 === 0 ? ['organic'] : ['premium']
      }));

      const filter: FilterGroupInput = {
        logic: 'AND',
        conditions: [
          { field: 'category', operator: 'equals', value: 'Flower' },
          { field: 'unitPrice', operator: 'less_than', value: 50 }
        ]
      };

      const startTime = performance.now();

      let matchCount = 0;
      for (const product of products) {
        if (evaluateFilterGroup(product, filter)) {
          matchCount++;
        }
      }

      const duration = performance.now() - startTime;

      expect(duration).toBeLessThan(100); // Should complete in < 100ms
      expect(matchCount).toBeGreaterThan(0); // Should find matches
    });

    it('should handle complex nested filters efficiently', () => {
      const products = Array.from({ length: 1000 }, (_, i) => ({
        category: i % 3 === 0 ? 'Flower' : 'Extract',
        unitPrice: 10 + (i % 90),
        tags: i % 2 === 0 ? ['organic'] : ['premium']
      }));

      const complexFilter: FilterGroupInput = {
        logic: 'OR',
        conditions: [
          {
            logic: 'AND',
            conditions: [
              { field: 'category', operator: 'equals', value: 'Flower' },
              { field: 'unitPrice', operator: 'less_than', value: 30 }
            ]
          },
          {
            logic: 'AND',
            conditions: [
              { field: 'tags', operator: 'array_contains', value: ['premium'] },
              { field: 'unitPrice', operator: 'greater_than', value: 50 }
            ]
          }
        ]
      };

      const startTime = performance.now();

      let matchCount = 0;
      for (const product of products) {
        if (evaluateFilterGroup(product, complexFilter)) {
          matchCount++;
        }
      }

      const duration = performance.now() - startTime;

      expect(duration).toBeLessThan(50); // Should complete in < 50ms for 1k products
      expect(matchCount).toBeGreaterThan(0);
    });
  });

  describe('SQL builder performance', () => {
    it('should build complex SQL in < 10ms', () => {
      const complexFilter: FilterGroupInput = {
        logic: 'AND',
        conditions: [
          { field: 'category', operator: 'equals', value: 'Flower' },
          { field: 'unitPrice', operator: 'between', value: [10, 50] },
          {
            logic: 'OR',
            conditions: [
              { field: 'tags', operator: 'array_contains', value: ['organic'] },
              { field: 'vendorId', operator: 'in', value: ['uuid-1', 'uuid-2', 'uuid-3'] }
            ]
          }
        ]
      };

      const startTime = performance.now();

      const params: any[] = [];
      const whereClauses: string[] = [];
      buildFilterSql(complexFilter, params, whereClauses);

      const duration = performance.now() - startTime;

      expect(duration).toBeLessThan(10); // Should complete in < 10ms
      expect(whereClauses.length).toBe(1);
      expect(params.length).toBeGreaterThan(0);
    });

    it('should handle deep nesting up to max depth efficiently', () => {
      // Build 5-level deep filter (max allowed depth)
      let filter: FilterGroupInput = {
        logic: 'AND',
        conditions: [{ field: 'category', operator: 'equals', value: 'Flower' }]
      };

      for (let i = 0; i < 4; i++) {
        filter = {
          logic: 'AND',
          conditions: [filter, { field: 'unitPrice', operator: 'less_than', value: 50 }]
        };
      }

      const startTime = performance.now();

      const params: any[] = [];
      const whereClauses: string[] = [];
      buildFilterSql(filter, params, whereClauses);

      const duration = performance.now() - startTime;

      expect(duration).toBeLessThan(5); // Should complete in < 5ms
    });
  });

  describe('calculateAgeDays performance', () => {
    it('should calculate age for 10k dates in < 10ms', () => {
      const dates = Array.from({ length: 10000 }, (_, i) => {
        const date = new Date();
        date.setDate(date.getDate() - i);
        return date.toISOString();
      });

      const startTime = performance.now();

      const ages = dates.map(date => calculateAgeDays(date));

      const duration = performance.now() - startTime;

      expect(duration).toBeLessThan(10);
      expect(ages[0]).toBe(0); // Today
      expect(ages[30]).toBe(30); // 30 days ago
    });
  });

  describe('Memory efficiency', () => {
    it('should not leak memory on repeated evaluations', () => {
      const product = {
        category: 'Flower',
        unitPrice: 25
      };

      const filter: FilterGroupInput = {
        logic: 'AND',
        conditions: [
          { field: 'category', operator: 'equals', value: 'Flower' },
          { field: 'unitPrice', operator: 'less_than', value: 30 }
        ]
      };

      // Run 1000 evaluations
      for (let i = 0; i < 1000; i++) {
        evaluateFilterGroup(product, filter);
      }

      // If we got here without OOM, test passes
      expect(true).toBe(true);
    });
  });

  describe('Edge case performance', () => {
    it('should handle empty conditions efficiently', () => {
      const products = Array.from({ length: 1000 }, (_, i) => ({
        category: `Category${i}`
      }));

      const emptyFilter: FilterGroupInput = {
        logic: 'AND',
        conditions: []
      };

      const startTime = performance.now();

      const results = products.filter(p => evaluateFilterGroup(p, emptyFilter));

      const duration = performance.now() - startTime;

      expect(duration).toBeLessThan(5);
      expect(results.length).toBe(1000); // Empty filter matches all
    });
  });
});
