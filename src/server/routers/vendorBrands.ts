import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { pool } from '../db';
import { protectedProcedure, router } from '../trpc';
import { canRole } from '../rbac';

export const vendorBrandsRouter = router({
  list: protectedProcedure
    .input(z.object({ vendorId: z.string().uuid() }))
    .query(async ({ input }) => {
      const { rows } = await pool.query<{
        id: string;
        name: string;
        alias: string;
        active: boolean;
        createdAt: string;
        updatedAt: string;
      }>(
        `SELECT id, name, alias, active, created_at as "createdAt", updated_at as "updatedAt"
         FROM brands
         WHERE vendor_id = $1 AND deleted_at IS NULL
         ORDER BY name`,
        [input.vendorId]
      );
      return rows;
    }),

  add: protectedProcedure
    .input(z.object({ vendorId: z.string().uuid(), name: z.string().trim().min(1).max(80) }))
    .mutation(async ({ ctx, input }) => {
      if (!canRole(ctx.user.role, 'operator')) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Brand management requires operator or higher access.' });
      }

      // Auto-generate alias from name
      const alias = input.name.trim().slice(0, 80);

      const { rows } = await pool.query<{ id: string; name: string; alias: string; active: boolean; createdAt: string }>(
        `INSERT INTO brands (name, alias, vendor_id, created_by)
         VALUES ($1, $2, $3, $4)
         RETURNING id, name, alias, active, created_at as "createdAt"`,
        [input.name.trim(), alias, input.vendorId, ctx.user.id]
      );
      return rows[0];
    }),

  remove: protectedProcedure
    .input(z.object({ brandId: z.string().uuid(), vendorId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      if (!canRole(ctx.user.role, 'operator')) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Brand management requires operator or higher access.' });
      }

      // Unlink brand from vendor (set vendor_id = NULL) rather than deleting
      const result = await pool.query(
        `UPDATE brands SET vendor_id = NULL, updated_at = now(), updated_by = $1
         WHERE id = $2 AND vendor_id = $3 AND deleted_at IS NULL
         RETURNING id`,
        [ctx.user.id, input.brandId, input.vendorId]
      );

      if (result.rowCount === 0) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Brand not found for this vendor.' });
      }

      return { ok: true };
    }),

  rename: protectedProcedure
    .input(z.object({ brandId: z.string().uuid(), name: z.string().trim().min(1).max(80) }))
    .mutation(async ({ ctx, input }) => {
      if (!canRole(ctx.user.role, 'operator')) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Brand management requires operator or higher access.' });
      }

      const alias = input.name.trim().slice(0, 80);

      const { rows } = await pool.query<{ id: string; name: string; alias: string }>(
        `UPDATE brands SET name = $1, alias = $2, updated_at = now(), updated_by = $3
         WHERE id = $4 AND deleted_at IS NULL
         RETURNING id, name, alias`,
        [input.name.trim(), alias, ctx.user.id, input.brandId]
      );

      if (rows.length === 0) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Brand not found.' });
      }

      return rows[0];
    })
});
