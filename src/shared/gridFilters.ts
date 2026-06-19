import { z } from 'zod';

/**
 * gridFilters.ts — shared Zod schemas for filter/sort/paginate payloads.
 *
 * Imported by both `queries.grid` (grid-v2.md) and `queries.gridSummary`
 * (gridSummary.md) so the two procedures share the same wire format. All
 * allowlist enforcement lives server-side in `src/server/routers/gridWhere.ts`;  
 * this file only declares the shape.
 */

export const gridFiltersSchema = z.object({
  status: z.string().min(1).max(40).optional(),
  text: z.string().trim().max(120).optional(),
  eq: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
  dateRange: z.object({
    field: z.string().min(1).max(40),
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional()
  }).optional(),
  tags: z.array(z.string().min(1).max(64)).max(20).optional()
}).strict();

export const gridSortSchema = z.object({
  field: z.string().min(1).max(40),
  direction: z.enum(['asc', 'desc']).default('asc')
});

export type GridFilters = z.infer<typeof gridFiltersSchema>;
export type GridSort = z.infer<typeof gridSortSchema>;
