import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { requireOperator } from '../server/middleware/requireOperator';

vi.mock('../server/auth', () => ({
  getSessionUser: vi.fn()
}));

import { getSessionUser } from '../server/auth';

describe('requireOperator middleware', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: NextFunction;

  beforeEach(() => {
    req = {};
    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis()
    };
    next = vi.fn();
    vi.mocked(getSessionUser).mockReset();
  });

  it('returns 401 when there is no session user', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null);

    await requireOperator(req as Request, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Authentication required' });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 403 when the user is below operator role', async () => {
    vi.mocked(getSessionUser).mockResolvedValue({
      id: 'u1', name: 'Viewer', email: 'v@example.com', role: 'viewer'
    });

    await requireOperator(req as Request, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'Operator access required' });
    expect(next).not.toHaveBeenCalled();
  });

  it('attaches the user to req and calls next() for an operator', async () => {
    vi.mocked(getSessionUser).mockResolvedValue({
      id: 'u2', name: 'Op', email: 'op@example.com', role: 'operator'
    });

    await requireOperator(req as Request, res as Response, next);

    expect((req as any).user).toEqual({
      id: 'u2', name: 'Op', email: 'op@example.com', role: 'operator'
    });
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('calls next() for roles above operator (manager, owner)', async () => {
    vi.mocked(getSessionUser).mockResolvedValue({
      id: 'u3', name: 'Mgr', email: 'm@example.com', role: 'manager'
    });

    await requireOperator(req as Request, res as Response, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('returns 500 when getSessionUser throws', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(getSessionUser).mockRejectedValue(new Error('DB down'));

    await requireOperator(req as Request, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Authentication check failed' });
    expect(next).not.toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'requireOperator auth check failed:',
      expect.any(Error)
    );

    consoleErrorSpy.mockRestore();
  });
});
