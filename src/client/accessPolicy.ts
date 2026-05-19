import type { QuickLaunchMode, SessionUser, ViewKey } from '../shared/types';

type WorkLoop = 'owner' | 'manager' | 'sales' | 'intake' | 'warehouse' | 'operator' | 'viewer';

const defaultOperatorViews: readonly ViewKey[] = ['dashboard', 'reports', 'purchaseOrders', 'intake', 'sales', 'matchmaking', 'orders', 'payments', 'inventory', 'clients', 'vendors', 'fulfillment', 'referees', 'processors', 'photography'];

const viewsByLoop: Record<WorkLoop, readonly ViewKey[]> = {
  owner: [...defaultOperatorViews, 'settings'],
  manager: [...defaultOperatorViews, 'settings'],
  sales: ['dashboard', 'reports', 'sales', 'matchmaking', 'orders', 'inventory', 'clients', 'payments', 'referees'],
  intake: ['dashboard', 'purchaseOrders', 'intake', 'matchmaking', 'inventory', 'fulfillment', 'vendors'],
  warehouse: ['dashboard', 'orders', 'inventory', 'fulfillment'],
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

export function workLoopForUser(user: SessionUser): WorkLoop {
  if (user.role === 'owner') return 'owner';
  if (user.role === 'manager') return 'manager';
  if (user.role === 'viewer') return 'viewer';
  const haystack = `${user.email} ${user.name}`.toLowerCase();
  if (haystack.includes('sales')) return 'sales';
  if (haystack.includes('intake') || haystack.includes('receiv')) return 'intake';
  if (haystack.includes('warehouse') || haystack.includes('fulfill') || haystack.includes('pack')) return 'warehouse';
  return 'operator';
}

export function viewVisibleForUser(view: ViewKey, user: SessionUser) {
  if (['connectors', 'recovery', 'closeout'].includes(view)) return false;
  return viewsByLoop[workLoopForUser(user)].includes(view);
}

export function startVisibleForUser(launch: QuickLaunchMode, user: SessionUser) {
  return startsByLoop[workLoopForUser(user)].includes(launch);
}
