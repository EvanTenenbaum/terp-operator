import { z } from 'zod';
import { protectedProcedure, router } from '../trpc';
import { pool } from '../db';

export const detailQueriesRouter = router({
  connectorRequestDetail: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ input }) => {
      const result = await pool.query(
        `SELECT * FROM connector_requests WHERE id = $1`,
        [input.id]
      );
      return result.rows[0] || null;
    }),

  matchmakingMatchDetail: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ input }) => {
      const result = await pool.query(
        `SELECT * FROM matchmaking_matches WHERE id = $1`,
        [input.id]
      );
      return result.rows[0] || null;
    }),

  photographyQueueDetail: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ input }) => {
      const result = await pool.query(
        `SELECT * FROM photography_queue WHERE id = $1`,
        [input.id]
      );
      return result.rows[0] || null;
    }),

  fulfillmentLineDetail: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ input }) => {
      const result = await pool.query(
        `SELECT * FROM fulfillment_lines WHERE id = $1`,
        [input.id]
      );
      return result.rows[0] || null;
    }),
});
