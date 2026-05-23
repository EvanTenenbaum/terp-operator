import type { QuickLaunchMode, SessionUser, ViewKey } from '../shared/types';

type WorkLoop = 'owner' | 'manager' | 'sales' | 'intake' | 'warehouse' | 'operator' | 'viewer';

const defaultOperatorViews: readonly ViewKey[] = ['dashboard', 'reports', 'purchaseOrders', 'intake', 'sales', 'matchmaking', 'orders', 'payments', 'inventory', 'clients', 'vendors', 'fulfillment', 'referees', 'contacts', 'processors', 'photography'];

const managerPlusViews: readonly ViewKey[] = [...defaultOperatorViews, 'settings', 'credit-review'];

const viewsByLoop: Record<WorkLoop, readonly ViewKey[]> = {
  owner: managerPlusViews,
  manager: managerPlusViews,
  sales: ['dashboard', 'reports', 'sales', 'matchmaking', 'orders', 'inventory', 'clients', 'payments', 'referees'],
  intake: ['dashboard', 'purchaseOrders', 'intake', 'matchmaking', 'inventory', 'fulfillment', 'vendors'],
  warehouse: ['dashboard', 'orders', 'inventory', 'fulfillment', 'pick'],
  operator: defaultOperatorViews,
  viewer: ['dashboard', 'reports', 'purchaseOrders', 'sales', 'matchmaking', 'orders', 'payments', 'inventory', 'clients', 'vendors', 'fulfillment', 'referees']
};

const startsByLoop: Record<WorkLoop, readonly QuickLaunchMode[]> = {
  owner: ['sale', 'purchaseOrder', 'receiving', 'moneyIn', 'moneyOut', 'customerNeed', 'vendorSupply'],
  manager: ['sale', 'purchaseOrder', 'receiving', 'moneyIn', 'moneyOut', 'customerNeed', 'vendorSupply'],
  sales: ['sale', 'moneyIn', 'customerNeed'],
  intake: ['purchaseOrder', 'receiving', 'moneyOut', 'vendorSupply'],
  warehouse: ['receiving'],
  operator: ['sale', 'purchaseOrder', 'receiving', 'moneyIn', 'moneyOut', 'customerNeed', 'vendorSupply'],
  viewer: []
};

const VALID_SUBSTRING_LOOPS: ReadonlySet<WorkLoop> = new Set(['sales', 'intake', 'warehouse', 'operator']);

/**
 * Legacy substring-derived work-loop assignment.
 *
 * Pre-#21-slice-1 this WAS the only way the client decided which navigation
 * lane to show an operator. Two users with the same `role` could see entirely
 * different navigation based purely on whether their `email` or `name`
 * contained `"sales"`, `"intake"`, `"receiv"`, `"warehouse"`, `"fulfill"`, or
 * `"pack"`. This is fragile and surprising — issue #21 (UX-01) introduced an
 * explicit `users.work_loop` column and the backfill migration
 * `0044_users_work_loop.sql` writes legacy-equivalent values into it.
 *
 * This function is kept as a defensive fallback for any user row where the
 * backfill did not produce a value (e.g. users created during the deploy
 * window, or users whose names/emails contained none of the keywords). It
 * MUST NOT be edited without coordinating with the SQL backfill in
 * `migrations/0044_users_work_loop.sql` — the two heuristics must remain
 * byte-for-byte equivalent so no operator's lane changes after the deploy.
 *
 * Returns one of: `'sales' | 'intake' | 'warehouse' | 'operator'`. Note that
 * `'receiving'`, `'fulfillment'`, and `'pack'` are NOT distinct loops in the
 * legacy heuristic — they fold into `'intake'` and `'warehouse'` respectively.
 */
export function legacyWorkLoopFromSubstring(user: SessionUser): WorkLoop {
  const haystack = `${user.email} ${user.name}`.toLowerCase();
  if (haystack.includes('sales')) return 'sales';
  if (haystack.includes('intake') || haystack.includes('receiv')) return 'intake';
  if (haystack.includes('warehouse') || haystack.includes('fulfill') || haystack.includes('pack')) return 'warehouse';
  return 'operator';
}

/**
 * Derive the work-loop lane for a session user.
 *
 * Resolution order (issue #21 UX-01):
 *   1. No user → `null` (caller is responsible for short-circuiting).
 *   2. `owner` role → always `'owner'` (sees every lane regardless of column).
 *   3. `manager` role → always `'manager'`.
 *   4. `viewer` role → always `'viewer'`.
 *   5. `user.workLoop` column is set and is a recognized lane → use it.
 *   6. Otherwise fall back to the legacy substring heuristic
 *      (`legacyWorkLoopFromSubstring`).
 *
 * Step 5 is the new behaviour introduced by this slice — pre-#21-slice-1 the
 * code went straight from step 4 to step 6.
 */
export function workLoopForUser(user: SessionUser | null | undefined): WorkLoop | null {
  if (!user) return null;
  if (user.role === 'owner') return 'owner';
  if (user.role === 'manager') return 'manager';
  if (user.role === 'viewer') return 'viewer';
  if (user.workLoop && VALID_SUBSTRING_LOOPS.has(user.workLoop as WorkLoop)) {
    return user.workLoop as WorkLoop;
  }
  return legacyWorkLoopFromSubstring(user);
}

export function viewVisibleForUser(view: ViewKey, user: SessionUser) {
  if (['connectors', 'recovery', 'closeout'].includes(view)) return false;
  const loop = workLoopForUser(user);
  if (!loop) return false;
  return viewsByLoop[loop].includes(view);
}

export function startVisibleForUser(launch: QuickLaunchMode, user: SessionUser) {
  const loop = workLoopForUser(user);
  if (!loop) return false;
  return startsByLoop[loop].includes(launch);
}
