import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import type { SessionUser } from '../../shared/types';

/**
 * CAP-030 / TER-1503: Route guard for the /pick view.
 *
 * Accessible to:
 *   - managers and owners unconditionally (they override work-loop restrictions)
 *   - operators whose `work_loop` is `'warehouse'` (the "Fulfill" lane in Linear labels)
 *
 * Sales-lane / intake-lane operators and viewers are redirected to the dashboard.
 */
export function usePickWorkLoopGuard(user: SessionUser | null | undefined) {
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) return;
    const role = user.role;
    // Managers and owners always have access.
    if (role === 'manager' || role === 'owner') return;
    // Viewers never have access.
    if (role === 'viewer') {
      navigate('/dashboard', { replace: true });
      return;
    }
    // Operators: only the warehouse (Fulfill) work loop has /pick access.
    const loop = user.workLoop ?? '';
    if (loop !== 'warehouse') {
      navigate('/dashboard', { replace: true });
    }
  }, [user, navigate]);
}
