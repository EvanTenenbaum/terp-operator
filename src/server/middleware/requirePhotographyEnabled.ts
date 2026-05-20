import type { Request, Response, NextFunction } from 'express';

/**
 * Guard that returns 503 Service Unavailable when the photography feature
 * is disabled via the ENABLE_PHOTOGRAPHY environment variable.
 *
 * Contract:
 *   - Unset (undefined) → enabled (dev/production default-on)
 *   - 'true' (any case) → enabled
 *   - Anything else (e.g. 'false', '0', '') → disabled, returns 503
 *
 * Reads process.env at request time (not import time) so deployments and tests
 * can toggle the flag without re-importing the env module. This intentionally
 * differs from src/server/env.ts which parses once at boot — the runtime guard
 * needs to track live env changes for kill-switch behavior.
 */
export function requirePhotographyEnabled(
  _req: Request,
  res: Response,
  next: NextFunction
): void {
  const raw = process.env.ENABLE_PHOTOGRAPHY;
  const enabled = raw === undefined || raw.toLowerCase() === 'true';
  if (!enabled) {
    res
      .status(503)
      .json({ error: 'Photography feature is disabled' });
    return;
  }
  next();
}
