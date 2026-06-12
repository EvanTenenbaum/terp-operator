/**
 * UX-Q05 (Execution Decision 6b) — credit-engine admin commands are shipped.
 *
 * The #111 admin set (stance CRUD, per-customer stance/disable overrides, and
 * bulk revert) is surfaced in the owner-gated Settings → Credit Engine panel,
 * so these commands must no longer be internal-only or pending-frontend, and
 * every one of them must be owner-gated (conservative exposure).
 *
 * setCustomerEngineMax is the deliberate #111 remainder: it still has no
 * admin surface and stays internal-only.
 */
import { describe, it, expect } from 'vitest';
import {
  commandNames,
  commandMinRole,
  internalOnlyCommandNames,
  pendingFrontendCommandNames
} from './commandCatalog';

const shippedAdminCommands = [
  'setCustomerStance',
  'disableCreditEngineForCustomer',
  'createCreditEngineStance',
  'updateCreditEngineStance',
  'deleteCreditEngineStance',
  'bulkRevertCustomersToEngine'
] as const;

describe('UX-Q05 — credit-engine admin command exposure', () => {
  it.each(shippedAdminCommands)('%s is a registered command', (name) => {
    expect(commandNames).toContain(name);
  });

  it.each(shippedAdminCommands)('%s is no longer internal-only', (name) => {
    expect(internalOnlyCommandNames).not.toContain(name);
  });

  it.each(shippedAdminCommands)('%s is not pending-frontend', (name) => {
    expect(pendingFrontendCommandNames as readonly string[]).not.toContain(name);
  });

  it.each(shippedAdminCommands)('%s requires the owner role', (name) => {
    expect(commandMinRole[name]).toBe('owner');
  });

  it('setCustomerEngineMax stays internal-only (#111 remainder, no surface yet)', () => {
    expect(internalOnlyCommandNames).toContain('setCustomerEngineMax');
  });
});
