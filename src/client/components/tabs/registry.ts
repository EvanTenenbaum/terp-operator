import type { GridRow, Role } from '../../../shared/types';

export interface SlideOverTabProps {
  entityId: string;
  entityType: string;
  row?: GridRow;
}

export interface SlideOverTab {
  /** Unique within entity type. Used in URL `?tab=<key>`. */
  key: string;
  /** Display name. */
  label: string;
  /** Optional lucide-react icon name. */
  icon?: string;
  /** Tab content component. Mounted only when this tab is active. */
  component: React.ComponentType<SlideOverTabProps>;
  /** Optional badge count. */
  badge?: number;
  /** Role-gating. Tab is filtered from `getTabs` output when user role < required. */
  requiresRole?: Role;
  /** Entity types where this tab should be the default (first) tab. */
  defaultFor?: string[];
}

const tabRegistry = new Map<string, SlideOverTab[]>();

/**
 * Register tabs for an entity type. Idempotent — calling twice for the same
 * entity type with different tabs REPLACES the previous registration.
 */
export function registerTabs(entityType: string, tabs: SlideOverTab[]): void {
  tabRegistry.set(entityType, tabs);
}

/**
 * Return the registered tabs for an entity type, optionally filtered by role.
 * Role-gating: a tab with `requiresRole` is excluded unless the user's role
 * meets or exceeds the required role level.
 */
export function getTabs(entityType: string, role?: Role): SlideOverTab[] {
  const tabs = tabRegistry.get(entityType);
  if (!tabs || tabs.length === 0) {
    return [];
  }
  if (!role) {
    return tabs;
  }
  return tabs.filter((tab) => {
    if (!tab.requiresRole) return true;
    return roleMeetsOrExceeds(role, tab.requiresRole);
  });
}

/**
 * Return the default tab key for an entity type. Resolves:
 * 1. First tab with `defaultFor` containing the entity type.
 * 2. Falls back to the first registered tab.
 * 3. Returns undefined if no tabs are registered.
 */
export function getDefaultTab(entityType: string): string | undefined {
  const tabs = tabRegistry.get(entityType);
  if (!tabs || tabs.length === 0) {
    return undefined;
  }
  const prioritized = tabs.find((t) => t.defaultFor?.includes(entityType));
  if (prioritized) {
    return prioritized.key;
  }
  return tabs[0].key;
}

const ROLE_HIERARCHY: Record<Role, number> = {
  viewer: 0,
  operator: 1,
  manager: 2,
  owner: 3,
};

function roleMeetsOrExceeds(userRole: Role, required: Role): boolean {
  return (ROLE_HIERARCHY[userRole] ?? 0) >= (ROLE_HIERARCHY[required] ?? 0);
}
