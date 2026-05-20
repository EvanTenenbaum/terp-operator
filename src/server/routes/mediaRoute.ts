import express, { type Request, type Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';

import { pool } from '../db';
import { requireOperator } from '../middleware/requireOperator';
import { mediaServeRateLimiter } from '../middleware/httpRateLimiters';
import { requirePhotographyEnabled } from '../middleware/requirePhotographyEnabled';

const router = express.Router();

interface MediaRecord {
  id: string;
  file_path: string;
  thumbnail_path: string | null;
  mime_type: string;
}

interface ThumbRecord {
  thumbnail_path: string | null;
}

function parseRangeHeader(
  rangeHeader: string,
  totalSize: number
): { start: number; end: number } | null {
  const match = /^bytes=(\d+)-(\d+)?$/.exec(rangeHeader);
  if (!match) return null;
  const start = Number.parseInt(match[1], 10);
  const end = match[2] ? Number.parseInt(match[2], 10) : totalSize - 1;
  if (Number.isNaN(start) || Number.isNaN(end)) return null;
  if (start < 0 || end >= totalSize || start > end) return null;
  return { start, end };
}

router.get(
  '/api/media/:id',
  requirePhotographyEnabled,
  requireOperator,
  mediaServeRateLimiter,
  async (req: Request, res: Response) => {
    try {
      const result = await pool.query<MediaRecord>(
        'SELECT id, file_path, thumbnail_path, mime_type FROM batch_media WHERE id = $1',
        [req.params.id]
      );
      const record = result.rows[0];
      if (!record) {
        return res.status(404).json({ error: 'Media not found' });
      }
      if (!fs.existsSync(record.file_path)) {
        return res.status(404).json({ error: 'File not found on disk' });
      }

      const isVideo = record.mime_type.startsWith('video/');
      res.setHeader('Content-Type', record.mime_type);
      res.setHeader('Content-Disposition', isVideo ? 'attachment' : 'inline');
      res.setHeader('X-Content-Type-Options', 'nosniff');

      if (isVideo) {
        const stat = fs.statSync(record.file_path);
        const rangeHeader = req.headers.range;
        if (rangeHeader) {
          const range = parseRangeHeader(rangeHeader, stat.size);
          if (!range) {
            res.status(416);
            res.setHeader('Content-Range', `bytes */${stat.size}`);
            return res.end();
          }
          res.status(206);
          res.setHeader(
            'Content-Range',
            `bytes ${range.start}-${range.end}/${stat.size}`
          );
          res.setHeader('Accept-Ranges', 'bytes');
          res.setHeader('Content-Length', String(range.end - range.start + 1));
          fs.createReadStream(record.file_path, {
            start: range.start,
            end: range.end
          }).pipe(res);
          return;
        }
        res.setHeader('Content-Length', String(stat.size));
        fs.createReadStream(record.file_path).pipe(res);
        return;
      }

      return res.sendFile(path.resolve(record.file_path));
    } catch (error) {
      console.error('Media serving error:', error);
      return res.status(500).json({ error: 'Failed to serve media' });
    }
  }
);

router.get(
  '/api/media/:id/thumb',
  requirePhotographyEnabled,
  requireOperator,
  mediaServeRateLimiter,
  async (req: Request, res: Response) => {
    try {
      const result = await pool.query<ThumbRecord>(
        'SELECT thumbnail_path FROM batch_media WHERE id = $1',
        [req.params.id]
      );
      const thumb = result.rows[0]?.thumbnail_path;
      if (!thumb) {
        return res.status(404).json({ error: 'Thumbnail not found' });
      }
      if (!fs.existsSync(thumb)) {
        return res.status(404).json({ error: 'Thumbnail file not found on disk' });
      }
      res.setHeader('X-Content-Type-Options', 'nosniff');
      return res.sendFile(path.resolve(thumb));
    } catch (error) {
      console.error('Thumbnail serving error:', error);
      return res.status(500).json({ error: 'Failed to serve thumbnail' });
    }
  }
);

export default router;
