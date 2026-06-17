import { useMemo } from 'react';
import { entityActionConfigs } from '../config/entity-actions';
import type { BulkAction } from '../components/BulkActionBar';
import type { Role } from '../../shared/types';

// ─── Types ──────────────────────────────────────────────────────────────────

/** BulkAction without onAction — consumers add the execution handler. */
export type BulkActionDefinition = Omit<BulkAction, 'onAction'>;

// ─── Role rank ──────────────────────────────────────────────────────────────

const ROLE_RANK: Record<Role, number> = {
  viewer: 0,
  operator: 1,
  manager: 2,
  owner: 3,
};

// ─── Hook ───────────────────────────────────────────────────────────────────

/**
 * Resolve available bulk actions for selected rows based on entity state
 * machines, role gates, and multi-status intersection logic.
 *
 * Returns `BulkActionDefinition[]` — omit `onAction`. Consumers should add
 * `onAction: (inputValue?) => Promise<BulkActionResult>` before passing to
 * `BulkActionBar`.
 *
 * Behavior:
 * 1. Look up entity state machine from `entityActionConfigs`
 * 2. If no rows selected → return empty array
 * 3. If all rows share a status → return actions for that status
 * 4. If rows have mixed statuses → return only actions available to ALL
 *    statuses (intersection by `id`)
 * 5. Filter by role gate: hide actions where `minRole` outranks `userRole`
 * 6. Sort: primary action first, then alphabetically by label
 *
 * @param entityType - Entity key (e.g. 'purchaseOrder', 'salesOrder')
 * @param selectedRows - Selected rows with at least `id` and `status`
 * @param userRole - Current operator's role
 * @returns Resolved bulk action definitions (empty array if none applicable)
 */
export function useEntityActions(
  entityType: string,
  selectedRows: { id: string; status: string }[],
  userRole: Role,
): BulkActionDefinition[] {
  return useMemo(() => {
    if (selectedRows.length === 0) return [];

    const config = entityActionConfigs[entityType];
    if (!config) return [];

    // ── Unique statuses in selection ─────────────────────────────────────
    const statuses = [...new Set(selectedRows.map((r) => r.status))];

    // ── Allowed actions per status ───────────────────────────────────────
    const actionsPerStatus = statuses.map((status) => {
      return config.states[status] ?? [];
    });

    if (actionsPerStatus.length === 0) return [];

    // ── Intersect: actions available to ALL statuses ─────────────────────
    const commonActionIds = actionsPerStatus[0]
      .filter((a) =>
        actionsPerStatus.every((group) =>
          group.some((b) => b.id === a.id),
        ),
      )
      .map((a) => a.id);

    // ── Filter by role gate ──────────────────────────────────────────────
    const userRank = ROLE_RANK[userRole];
    const filtered = actionsPerStatus[0].filter((a) => {
      if (!commonActionIds.includes(a.id)) return false;
      const minRank = a.minRole ? (ROLE_RANK[a.minRole] ?? 0) : 0;
      return userRank >= minRank;
    });

    // ── Map EntityAction → BulkActionDefinition ──────────────────────────
    const mapped: BulkActionDefinition[] = filtered.map((a) => {
      const id = a.id.toLowerCase();

      const isDanger =
        id.includes('cancel') ||
        id.includes('void') ||
        id.includes('delete') ||
        id.includes('reject');
      const isWarning = id.includes('refund');

      let variant: BulkAction['variant'];
      if (isDanger) variant = 'danger';
      else if (isWarning) variant = 'warning';
      else variant = 'primary';

      return {
        key: a.id,
        label: a.label,
        primary: false,
        variant,
      };
    });

    // ── Mark first non-danger action as primary ──────────────────────────
    const primaryCandidate = mapped.find((a) => a.variant !== 'danger');
    if (primaryCandidate) {
      primaryCandidate.primary = true;
    }

    // ── Sort: primary first, then alphabetically by label ────────────────
    return mapped.sort((a, b) => {
      if (a.primary && !b.primary) return -1;
      if (!a.primary && b.primary) return 1;
      return a.label.localeCompare(b.label);
    });
  }, [entityType, selectedRows, userRole]);
}
