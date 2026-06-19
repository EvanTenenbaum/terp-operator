import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import type { QueryResult } from 'pg';
import { protectedProcedure, router } from '../trpc';
import { pool } from '../db';
import {
  FilterGroup,
  SavedFilterInput,
  SavedFilterOutput,
  PaginationInput,
  FILTER_FIELDS
} from '../../shared/filterSchemas';
import { buildFilterSql } from '../utils/filterSqlBuilder';
import { ratelimit } from '../utils/ratelimit';
import { FILTER_CONFIG } from '../../shared/filterConfig';

export const filtersRouter = router({

  // =========================================================================
  // APPLY FILTERS TO BATCHES
  // =========================================================================

  applyBatchFilters: protectedProcedure
    .input(z.object({
      filter: FilterGroup,
      pagination: PaginationInput.optional(),
      role: z.enum(['operator', 'customer']).default('operator')
    }))
    .query(async ({ input, ctx }) => {
      // Rate limit: configurable filter queries per minute per user
      const { success } = await ratelimit.limit(
        `filter:${ctx.user.id}`,
        { limit: FILTER_CONFIG.RATE_LIMIT_REQUESTS, window: FILTER_CONFIG.RATE_LIMIT_WINDOW }
      );

      if (!success) {
        throw new TRPCError({
          code: 'TOO_MANY_REQUESTS',
          message: 'Filter query rate limit exceeded. Please wait before retrying.'
        });
      }

      const params: (string | number | boolean | null)[] = [];
      const whereClauses: string[] = [
        "b.archived_at IS NULL"
      ];

      // Customer role restrictions
      if (input.role === 'customer') {
        whereClauses.push("b.status = 'posted'");
        whereClauses.push("b.brand_alias IS NOT NULL");
        whereClauses.push("b.vendor_alias IS NOT NULL");
      }

      // Build filter SQL
      try {
        buildFilterSql(input.filter, params, whereClauses);
      } catch (err) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Invalid filter structure'
        });
      }

      // Cursor pagination
      if (input.pagination?.cursor !== undefined) {
        const cursor = input.pagination.cursor;

        // Validate cursor is safe integer
        if (!Number.isInteger(cursor) || cursor < 0 || cursor > Number.MAX_SAFE_INTEGER) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Invalid pagination cursor: must be a non-negative safe integer'
          });
        }

        params.push(cursor);
        whereClauses.push(`b.sort_id > $${params.length}`);
      }

      // Fetch limit+1 to detect if more pages exist
      const limit = input.pagination?.limit ?? FILTER_CONFIG.DEFAULT_PAGE_SIZE;
      params.push(limit + 1);

      // Select appropriate columns based on role
      const columns = input.role === 'customer'
        ? 'b.id, b.batch_code AS "batchCode", b.name, b.category, b.subcategory, b.tags, b.available_qty AS "availableQty", b.unit_price AS "unitPrice", b.location, b.intake_date AS "intakeDate", b.status, b.photo_url AS "photoUrl", b.media_status AS "mediaStatus", b.brand_alias AS "brandName", b.vendor_alias AS "vendorName", b.sort_id'
        : 'b.*, br.name AS "brandRealName", br.alias AS "brandAlias", v.name AS "vendorRealName", v.alias AS "vendorAlias"';

      const joins = input.role === 'operator'
        ? 'LEFT JOIN vendors v ON v.id = b.vendor_id LEFT JOIN brands br ON br.id = b.brand_id'
        : '';

      const query = `
        SELECT ${columns}
        FROM batches b
        ${joins}
        WHERE ${whereClauses.join(' AND ')}
        ORDER BY b.sort_id
        LIMIT $${params.length}
      `;

      // Query timeout: configurable (default 30 seconds)
      let timeoutHandle: NodeJS.Timeout | undefined;
      const timeoutPromise = new Promise((_, reject) => {
        timeoutHandle = setTimeout(() => reject(new Error('Query timeout')), FILTER_CONFIG.QUERY_TIMEOUT_MS);
      });

      let result;
      try {
        result = await Promise.race([
          pool.query(query, params),
          timeoutPromise
        ]) as QueryResult;
      } catch (err) {
        throw new TRPCError({
          code: 'TIMEOUT',
          message: 'Filter query timed out. Please simplify your filter or contact support.'
        });
      } finally {
        // Always clear timeout to prevent memory leak
        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
        }
      }

      // Check if more pages exist
      const hasMore = result.rows.length > limit;
      const batches = hasMore ? result.rows.slice(0, limit) : result.rows;

      return {
        batches,
        nextCursor: hasMore ? batches[batches.length - 1].sort_id : null,
        totalFetched: batches.length
      };
    }),

  // =========================================================================
  // SAVE FILTER
  // =========================================================================

  saveFilter: protectedProcedure
    .input(SavedFilterInput)
    .mutation(async ({ input, ctx }) => {
      // Permission check for global filters
      if (input.isGlobal && !['owner', 'manager'].includes(ctx.user.role)) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Only owners and managers can create global filters'
        });
      }

      // Re-validate filter definition to prevent invalid JSON storage
      try {
        FilterGroup.parse(input.filterDefinition);
      } catch (err) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Invalid filter definition structure'
        });
      }

      // Upsert pattern (handles duplicate names gracefully)
      const result = await pool.query(
        `INSERT INTO saved_filters (user_id, name, description, target_view, filter_definition, schema_version, is_global, created_by, updated_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)
         ON CONFLICT (user_id, name, target_view) DO UPDATE SET
           description = EXCLUDED.description,
           filter_definition = EXCLUDED.filter_definition,
           is_global = EXCLUDED.is_global,
           updated_by = EXCLUDED.updated_by,
           updated_at = now()
         RETURNING id, name, created_at, updated_at`,
        [
          ctx.user.id,
          input.name,
          input.description ?? null,
          input.targetView,
          JSON.stringify(input.filterDefinition),
          1, // schema_version
          input.isGlobal,
          ctx.user.id // created_by / updated_by
        ]
      );

      return result.rows[0];
    }),

  // =========================================================================
  // LIST SAVED FILTERS
  // =========================================================================

  listSavedFilters: protectedProcedure
    .input(z.object({
      targetView: z.enum(['inventory', 'items', 'purchase_orders', 'sales_orders', 'matchmaking', 'all']).optional()
    }).optional())
    .query(async ({ input, ctx }) => {
      const params: (string | number)[] = [ctx.user.id];
      const conditions = ['deleted_at IS NULL'];

      if (input?.targetView) {
        params.push(input.targetView);
        conditions.push(`(target_view = $${params.length} OR target_view = 'all')`);
      }

      // Fetch user's personal filters + global filters
      const query = `
        SELECT
          id,
          user_id AS "userId",
          name,
          description,
          target_view AS "targetView",
          filter_definition AS "filterDefinition",
          schema_version AS "schemaVersion",
          is_global AS "isGlobal",
          created_at AS "createdAt",
          updated_at AS "updatedAt",
          created_by AS "createdBy",
          updated_by AS "updatedBy"
        FROM saved_filters
        WHERE ${conditions.join(' AND ')}
          AND (user_id = $1 OR is_global = true)
        ORDER BY is_global DESC, name ASC
      `;

      const result = await pool.query(query, params);
      return result.rows as SavedFilterOutput[];
    }),

  // =========================================================================
  // UPDATE FILTER
  // =========================================================================

  updateFilter: protectedProcedure
    .input(z.object({
      id: z.string().uuid(),
      data: SavedFilterInput.partial()
    }))
    .mutation(async ({ input, ctx }) => {
      // Check ownership/permissions
      const existing = await pool.query(
        'SELECT user_id, is_global FROM saved_filters WHERE id = $1 AND deleted_at IS NULL',
        [input.id]
      );

      if (existing.rows.length === 0) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Filter not found' });
      }

      const filter = existing.rows[0];
      const isOwner = filter.user_id === ctx.user.id;
      const canManageGlobal = ['owner', 'manager'].includes(ctx.user.role);

      if (!isOwner && !(filter.is_global && canManageGlobal)) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to edit this filter'
        });
      }

      // Validate isGlobal permission if being changed
      if (input.data.isGlobal && !canManageGlobal) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Only owners and managers can create global filters'
        });
      }

      // Validate filter definition if provided
      if (input.data.filterDefinition) {
        try {
          FilterGroup.parse(input.data.filterDefinition);
        } catch (err) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Invalid filter definition structure'
          });
        }
      }

      // Build update query dynamically
      const updates: string[] = [];
      const params: any[] = [];

      if (input.data.name !== undefined) {
        params.push(input.data.name);
        updates.push(`name = $${params.length}`);
      }
      if (input.data.description !== undefined) {
        params.push(input.data.description);
        updates.push(`description = $${params.length}`);
      }
      if (input.data.targetView !== undefined) {
        params.push(input.data.targetView);
        updates.push(`target_view = $${params.length}`);
      }
      if (input.data.filterDefinition !== undefined) {
        params.push(JSON.stringify(input.data.filterDefinition));
        updates.push(`filter_definition = $${params.length}`);
      }
      if (input.data.isGlobal !== undefined) {
        params.push(input.data.isGlobal);
        updates.push(`is_global = $${params.length}`);
      }

      params.push(ctx.user.id); // updated_by
      updates.push(`updated_by = $${params.length}`);
      updates.push(`updated_at = now()`);

      params.push(input.id);

      const result = await pool.query(
        `UPDATE saved_filters
         SET ${updates.join(', ')}
         WHERE id = $${params.length}
         RETURNING id, name, updated_at`,
        params
      );

      return result.rows[0];
    }),

  // =========================================================================
  // DELETE FILTER (Soft Delete)
  // =========================================================================

  deleteFilter: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ input, ctx }) => {
      // Check ownership/permissions
      const existing = await pool.query(
        'SELECT user_id, is_global FROM saved_filters WHERE id = $1 AND deleted_at IS NULL',
        [input.id]
      );

      if (existing.rows.length === 0) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Filter not found' });
      }

      const filter = existing.rows[0];
      const isOwner = filter.user_id === ctx.user.id;
      const canManageGlobal = ['owner', 'manager'].includes(ctx.user.role);

      if (!isOwner && !(filter.is_global && canManageGlobal)) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to delete this filter'
        });
      }

      await pool.query(
        `UPDATE saved_filters
         SET deleted_at = now(), deleted_by = $1
         WHERE id = $2`,
        [ctx.user.id, input.id]
      );

      return { success: true };
    }),

  // =========================================================================
  // GET FACETS (for dropdown population)
  // =========================================================================

  getFacets: protectedProcedure
    .input(z.object({
      fields: z.array(z.enum(['category', 'subcategory', 'brandId', 'vendorId', 'location', 'status', 'tags'])).optional()
    }).optional())
    .query(async ({ input }) => {
      const requestedFields = input?.fields ?? ['category', 'subcategory', 'brandId', 'vendorId', 'tags'];

      // Single query with json_agg for all facets (eliminates N+1 queries)
      const result = await pool.query(
        `SELECT
          ${requestedFields.includes('category') ? "COALESCE(json_agg(DISTINCT category) FILTER (WHERE category IS NOT NULL), '[]'::json) AS categories," : "NULL AS categories,"}
          ${requestedFields.includes('subcategory') ? `
            (SELECT json_agg(DISTINCT jsonb_build_object('category', category, 'subcategory', subcategory))
             FROM batches
             WHERE subcategory IS NOT NULL AND archived_at IS NULL) AS subcategories,` : "NULL AS subcategories,"}
          ${requestedFields.includes('brandId') ? `
            (SELECT json_agg(json_build_object('id', id, 'name', name, 'alias', alias) ORDER BY name)
             FROM brands
             WHERE active = true
             LIMIT 1000) AS brands,` : "NULL AS brands,"}
          ${requestedFields.includes('vendorId') ? `
            (SELECT json_agg(json_build_object('id', id, 'name', name, 'alias', alias) ORDER BY name)
             FROM vendors
             WHERE active = true
             LIMIT 1000) AS vendors,` : "NULL AS vendors,"}
          ${requestedFields.includes('location') ? "COALESCE(json_agg(DISTINCT location) FILTER (WHERE location IS NOT NULL), '[]'::json) AS locations," : "NULL AS locations,"}
          ${requestedFields.includes('status') ? "COALESCE(json_agg(DISTINCT status) FILTER (WHERE status IS NOT NULL), '[]'::json) AS statuses," : "NULL AS statuses,"}
          ${requestedFields.includes('tags') ? `
            (SELECT json_agg(tag_with_count ORDER BY count DESC)
             FROM (
               SELECT json_build_object('tag', tag, 'count', count) AS tag_with_count
               FROM (
                 SELECT tag, COUNT(*) AS count
                 FROM batches, unnest(tags) AS tag
                 WHERE archived_at IS NULL
                 GROUP BY tag
                 ORDER BY count DESC
                 LIMIT 1000
               ) tag_counts
             ) tags_subquery) AS tags` : "NULL AS tags"}
        FROM batches
        WHERE archived_at IS NULL
        LIMIT 1`
      );

      const facets = result.rows[0] ?? {};

      // Clean up nulls and ensure arrays (coerce JSON null/empty to [])
      return {
        categories: Array.isArray(facets.categories) ? facets.categories : [],
        subcategories: Array.isArray(facets.subcategories) ? facets.subcategories : [],
        brands: facets.brands ?? [],
        vendors: facets.vendors ?? [],
        locations: facets.locations ?? [],
        statuses: facets.statuses ?? [],
        tags: facets.tags ?? []
      };
    })
});
