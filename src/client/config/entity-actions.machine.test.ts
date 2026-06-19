/**
 * T-B-11: Entity state machine validation test.
 *
 * Validates every state machine in entity-actions.ts is consistent with
 * the canonical status enums (statuses.ts) and command catalog (commandCatalog.ts).
 *
 * Acceptance criteria:
 *  1. Every source/target state key is in the canonical status enum (orphan states skipped).
 *  2. Every action's role gate matches or is stricter than commandMinRole.
 *  3. Unreachable status-enum values absent from the state machine are reported as warnings.
 *  4. No action references a command name that doesn't exist in commandCatalog.
 */

import { describe, it, expect } from 'vitest';
import * as statuses from '../../shared/statuses';
import { commandNames, commandMinRole } from '../../shared/commandCatalog';
import { entityActionConfigs, type EntityActionConfig } from './entity-actions';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Map camelCase entity name → PascalCase status enum export name in statuses.ts. */
const ENTITY_TO_STATUS_ENUM: Record<string, string> = {
  purchaseOrder: 'PurchaseOrderStatus',
  salesOrder: 'SalesOrderStatus',
  payment: 'PaymentStatus',
  invoice: 'InvoiceStatus',
  vendorBill: 'VendorBillStatus',
  purchaseReceipt: 'PurchaseReceiptStatus',
  vendorPayment: 'VendorPaymentStatus',
  batch: 'BatchStatus',
  fulfillmentLine: 'FulfillmentLineStatus',
  connectorRequest: 'ConnectorRequestStatus',
  pickList: 'PickListStatus',
};

/**
 * Known orphan / unreachable states that exist in entity-actions.ts state
 * machines but are NOT in the canonical status enum. Documented inline in
 * entity-actions.ts as intentionally unreachable at runtime.
 *
 * Format: `${entity}::${state}`
 */
const KNOWN_ORPHAN_STATES = new Set<string>([
  // PurchaseOrder: 'ordered' and 'posted' are documentation-only placeholders
  // (see entity-actions.ts lines 82-87, 174-198, 227-229). Command-bus sets
  // 'approved' when orderedAt is recorded; posting acts on batches, not the PO.
  'purchaseOrder::ordered',
  'purchaseOrder::posted',
]);

/** Role hierarchy for comparing strictness. Higher rank = more restrictive. */
const ROLE_RANK: Record<string, number> = {
  viewer: 0,
  operator: 1,
  manager: 2,
  owner: 3,
};

/**
 * When an EntityAction has no explicit minRole, the UI considers it visible
 * to all roles (getAllowedActions filters only when minRole is set). For the
 * role-gate test, absent minRole means the action is at the lowest rank
 * (viewer), which is the least restrictive gate.
 */
function minRoleRank(minRole: string | undefined): number {
  if (!minRole) return ROLE_RANK.viewer;
  return ROLE_RANK[minRole] ?? ROLE_RANK.viewer;
}

// ─── Test data ───────────────────────────────────────────────────────────────

/** All registered entity state machine configs. */
const machines: EntityActionConfig[] = Object.values(entityActionConfigs);

/** Set of all valid command names from the catalog. */
const validCommands = new Set<string>(commandNames);

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('entity state machines', () => {
  // ── AC 1: Every state key is canonical ─────────────────────────────────────

  describe('state keys are canonical', () => {
    for (const machine of machines) {
      const statusEnumName = ENTITY_TO_STATUS_ENUM[machine.entity];
      if (!statusEnumName) {
        // Entity not in our mapping table — that's a configuration gap.
        it(`${machine.entity}: status enum not found in mapping`, () => {
          expect(statusEnumName).toBeDefined();
        });
        continue;
      }

      const statusEnum = (statuses as Record<string, unknown>)[statusEnumName];
      if (!statusEnum) {
        it(`${machine.entity}: ${statusEnumName} export not found in statuses`, () => {
          expect(statusEnum).toBeDefined();
        });
        continue;
      }

      // ZodEnum.enum is a value→value object, e.g. { draft: 'draft', finalized: 'finalized' }.
      // Extract the canonical status strings via Object.values().
      const zodEnum = statusEnum as { enum?: Record<string, string> };
      if (!zodEnum.enum || typeof zodEnum.enum !== 'object') {
        it(`${machine.entity}: ${statusEnumName} has no valid .enum property`, () => {
          expect(zodEnum.enum).toBeDefined();
          expect(typeof zodEnum.enum).toBe('object');
        });
        continue;
      }

      const validStatuses = Object.values(zodEnum.enum);

      it(`${machine.entity}: every state key is in ${statusEnumName}`, () => {
        const stateKeys = Object.keys(machine.states);
        expect(stateKeys.length).toBeGreaterThan(0);

        for (const state of stateKeys) {
          const orphanKey = `${machine.entity}::${state}`;
          if (KNOWN_ORPHAN_STATES.has(orphanKey)) continue;

          if (!validStatuses.includes(state)) {
            // Fail on unexpected missing statuses
            expect(validStatuses).toContain(state);
          }
        }
      });

      // AC 3: warn about canonical statuses absent from the state machine
      it(`${machine.entity}: canonical statuses absent from state machine (warning)`, () => {
        const stateKeys = new Set(Object.keys(machine.states));
        const missingFromMachine = validStatuses.filter((s) => !stateKeys.has(s));

        for (const missing of missingFromMachine) {
          // This is a warning, not a failure — but we surface it so it's visible.
          console.warn(
            `[state-machine-gap] ${machine.entity}: "${missing}" exists in ${statusEnumName} but is absent from the state machine`
          );
        }

        // No assertion — this is a diagnostic, not a gate.
        expect(true).toBe(true);
      });
    }
  });

  // ── AC 4: Every action id exists in the command catalog ────────────────────

  it('every action id exists in command catalog', () => {
    for (const machine of machines) {
      for (const [state, actions] of Object.entries(machine.states)) {
        for (const action of actions) {
          const orphanKey = `${machine.entity}::${state}`;
          if (KNOWN_ORPHAN_STATES.has(orphanKey)) continue;

          if (!validCommands.has(action.id)) {
            // Fail on unknown command references
            expect(validCommands).toContain(action.id);
          }
        }
      }
    }
  });

  // ── AC 2: Every action's role gate matches or is stricter than commandMinRole

  it('every action role gate is at least as strict as commandMinRole', () => {
    const mismatches: string[] = [];

    for (const machine of machines) {
      for (const [state, actions] of Object.entries(machine.states)) {
        const orphanKey = `${machine.entity}::${state}`;
        if (KNOWN_ORPHAN_STATES.has(orphanKey)) continue;

        for (const action of actions) {
          const cmdMinRole = commandMinRole[action.id as keyof typeof commandMinRole];

          if (cmdMinRole) {
            const actionRank = minRoleRank(action.minRole);
            const cmdRank = ROLE_RANK[cmdMinRole] ?? 0;

            if (actionRank < cmdRank) {
              // Entity-action gate is weaker than the command's required role
              const actionMinRole = action.minRole ?? '<none>';
              mismatches.push(
                `${machine.entity}::${state} action="${action.id}": ` +
                  `entity minRole=${actionMinRole} (rank ${actionRank}) ` +
                  `but commandMinRole=${cmdMinRole} (rank ${cmdRank})`
              );
            }
          }
        }
      }
    }

    if (mismatches.length > 0) {
      console.warn(
        `[role-gate-mismatch] ${mismatches.length} action(s) have weaker entity-gate than commandMinRole:\n` +
          mismatches.map((m) => `  - ${m}`).join('\n')
      );
    }

    expect(mismatches).toEqual([]);
  });

  // ── Sanity: every registered machine has at least one state ────────────────

  it('every machine has at least one state defined', () => {
    for (const machine of machines) {
      const stateCount = Object.keys(machine.states).length;
      expect(stateCount).toBeGreaterThan(0);
    }
  });

  // ── Sanity: entityActionConfigs matches expected entities ──────────────────

  it('entityActionConfigs includes all 11 registered entities', () => {
    const registered = Object.keys(entityActionConfigs).sort();
    expect(registered).toEqual([
      'batch',
      'connectorRequest',
      'fulfillmentLine',
      'invoice',
      'payment',
      'pickList',
      'purchaseOrder',
      'purchaseReceipt',
      'salesOrder',
      'vendorBill',
      'vendorPayment',
    ]);
  });
});
