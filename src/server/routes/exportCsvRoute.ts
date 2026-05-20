import express, { type Request, type Response } from 'express';

import { pool } from '../db';
import { rowsToCsv } from '../services/csv';
import { requireOperator } from '../middleware/requireOperator';
import {
  viewSchema,
  gridSql,
  deterministicHeaders
} from '../routers/queries';

/**
 * [#35 FE-M1] GET /api/export/:view.csv
 *
 * Issue:
 *   The tRPC `queries.csvExport` mutation returns a JSON envelope
 *   (`{result:{data:{json:{filename, csv}}}}`). Pasting the URL into a
 *   browser dumped that JSON instead of triggering a CSV download — no
 *   `Content-Type: text/csv`, no `Content-Disposition: attachment`.
 *
 * Fix:
 *   A real HTTP route that:
 *     - Requires an operator session (`requireOperator`).
 *     - Validates `:view` against the same whitelist the tRPC export uses.
 *     - Runs the same SQL (`gridSql`) and header set
 *       (`deterministicHeaders`) so the two surfaces stay aligned.
 *     - Streams the CSV body with the headers a browser needs to
 *       auto-download:
 *         Content-Type: text/csv; charset=utf-8
 *         Content-Disposition: attachment; filename="terp-${view}-${YYYY-MM-DD}.csv"
 *
 *   The existing tRPC path (`queries.csvExport`) is intentionally left in
 *   place: in-app downloads use it because they want the structured envelope
 *   for client-side filename handling.
 */
const router = express.Router();

function formatDate(now: Date): string {
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(now.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

router.get(
  '/api/export/:view.csv',
  requireOperator,
  async (req: Request, res: Response) => {
    const parsed = viewSchema.safeParse(req.params.view);
    if (!parsed.success) {
      res.status(400).json({ error: 'Unknown view.' });
      return;
    }
    const view = parsed.data;
    try {
      const result = await pool.query(gridSql(view));
      const headers = deterministicHeaders(view);
      const csv = rowsToCsv(result.rows, headers);
      const filename = `terp-${view}-${formatDate(new Date())}.csv`;

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${filename}"`
      );
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.status(200).send(csv);
    } catch (error) {
      console.error('CSV export error:', error);
      res.status(500).json({ error: 'Failed to build CSV export.' });
    }
  }
);

export default router;
