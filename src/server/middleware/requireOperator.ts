import type { Request, Response, NextFunction } from 'express';
import { logger } from '../services/logger';
import { getSessionUser } from '../auth';
import { canRole } from '../rbac';
import type { SessionUser } from '../../shared/types';

declare global {
  namespace Express {
    interface Request {
      user?: SessionUser;
    }
  }
}

export async function requireOperator(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
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
    logger.error('Auth check failed', { module: 'requireOperator', error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: 'Authentication check failed' });
  }
}
