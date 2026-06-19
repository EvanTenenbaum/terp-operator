import type { Request, Response, NextFunction } from 'express';
import { logger } from '../services/logger';
import { getSessionUser } from '../auth';
import { canRole } from '../rbac';
import { pool } from '../db';
import { verifyUploadToken } from '../services/photoUploadTokens';
import { validateBatchIdFormat } from '../services/mediaValidation';
import type { SessionUser } from '../../shared/types';

declare global {
  // Augment Express request with TERP-specific auth context.
  // Namespace merging is the canonical Express pattern for request augmentation;
  // there is no module-based alternative for `req.user` / `req.uploadContext`.
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: SessionUser;
      uploadContext?: {
        tokenId: string;
        batchId: string;
        issuedBy: string;
      };
    }
  }
}

/**
 * Auth middleware for `POST /api/upload/media` that accepts EITHER:
 *
 *   1. An operator-or-higher session cookie (existing flow), OR
 *   2. An `Authorization: Bearer <token>` header bound to a specific batch
 *      via the `photo_upload_tokens` table (issue #73 — tokenized share links
 *      for photographer mobile upload).
 *
 * The bearer-token path expects the client to also send the batch id as a
 * query parameter (`?batchId=...`). This is required because we need to
 * verify the token against the batch BEFORE the multipart body is parsed.
 * The form body MUST still contain the same `batchId` for multer's disk
 * storage destination logic; we re-check equality after multer parses (see
 * uploadRoute.ts).
 *
 * Security characteristics:
 *   - Token never logged: we read it from the header and pass straight to
 *     `verifyUploadToken`. We never echo it in responses.
 *   - Token is upload-only: this middleware is wired ONLY into the upload
 *     route, never into read/serve/delete endpoints.
 *   - Token is batch-scoped: `verifyUploadToken` throws if the batchId from
 *     the query string does not match the batchId the token was minted for.
 *   - Failure modes use coarse HTTP codes (401 for any token problem except
 *     wrong-batch which is 403) to avoid leaking why a token failed.
 */
export async function requireOperatorOrUploadToken(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.header('authorization') ?? req.header('Authorization');
  const bearer = parseBearer(authHeader);

  // Bearer-token path: takes precedence over session ONLY if a token is
  // explicitly presented. This lets photographers without an operator
  // session upload, while still letting authenticated operators continue
  // using the cookie-based path when no bearer is present.
  if (bearer) {
    const batchId = readBatchIdFromRequest(req);
    if (!batchId) {
      res.status(400).json({ error: 'batchId query parameter is required for token-authenticated uploads' });
      return;
    }
    try {
      validateBatchIdFormat(batchId);
    } catch {
      res.status(400).json({ error: 'Invalid batch ID format' });
      return;
    }

    try {
      const verified = await verifyUploadToken(pool, bearer, batchId);
      req.uploadContext = {
        tokenId: verified.tokenId,
        batchId: verified.batchId,
        issuedBy: verified.issuedBy
      };
      next();
      return;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Invalid upload token';
      if (/batch/i.test(message)) {
        res.status(403).json({ error: 'Upload token does not match this batch' });
        return;
      }
      // Generic 401 for all other token failures (expired/revoked/unknown/malformed).
      // We deliberately do NOT echo the upstream message so the raw token is
      // never reflected back.
      res.status(401).json({ error: 'Invalid or expired upload token' });
      return;
    }
  }

  // Cookie/session path (existing behavior — unchanged).
  try {
    const user = await getSessionUser(req);
    if (!user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    if (!canRole(user.role, 'operator')) {
      res.status(403).json({ error: 'Operator access required' });
      return;
    }
    req.user = user;
    next();
  } catch (error) {
    logger.error('Session auth failed', { module: 'requireOperatorOrUploadToken', error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: 'Authentication check failed' });
  }
}

function parseBearer(header: string | undefined): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!match) return null;
  return match[1].trim() || null;
}

/**
 * The batchId for token verification must be available BEFORE multer parses
 * the multipart body. We read it from (in order): query string, custom header.
 * Form-body batchId is verified later in the route handler for defense in
 * depth.
 */
function readBatchIdFromRequest(req: Request): string | null {
  const fromQuery = typeof req.query?.batchId === 'string' ? req.query.batchId : null;
  if (fromQuery) return fromQuery;
  const fromHeader = req.header('x-batch-id');
  if (fromHeader && fromHeader.trim()) return fromHeader.trim();
  return null;
}
