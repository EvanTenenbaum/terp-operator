import { describe, it, expect } from 'vitest';
import { workLoopForUser, legacyWorkLoopFromSubstring } from './accessPolicy';
import type { SessionUser } from '../shared/types';

function makeUser(overrides: Partial<SessionUser> = {}): SessionUser {
  return {
    id: 'user-1',
    name: 'Generic User',
    email: 'user@example.com',
    role: 'operator',
    workLoop: null,
    ...overrides
  };
}

describe('workLoopForUser — explicit work_loop column (UX-01 #21 slice 1)', () => {
  describe('explicit workLoop column wins for non-owner roles', () => {
    it('reads workLoop=sales directly when set on an operator', () => {
      const user = makeUser({ role: 'operator', workLoop: 'sales', email: 'noise@example.com', name: 'Noise' });
      expect(workLoopForUser(user)).toBe('sales');
    });

    it('reads workLoop=intake directly when set on an operator', () => {
      const user = makeUser({ role: 'operator', workLoop: 'intake', email: 'noise@example.com' });
      expect(workLoopForUser(user)).toBe('intake');
    });

    it('reads workLoop=warehouse directly when set on an operator', () => {
      const user = makeUser({ role: 'operator', workLoop: 'warehouse', email: 'noise@example.com' });
      expect(workLoopForUser(user)).toBe('warehouse');
    });

    it('reads workLoop=operator directly when set', () => {
      const user = makeUser({ role: 'operator', workLoop: 'operator', email: 'salesperson@example.com' });
      // Explicit column wins over legacy substring (email contains "sales").
      expect(workLoopForUser(user)).toBe('operator');
    });

    it('manager role with explicit workLoop still returns manager (role takes precedence)', () => {
      const user = makeUser({ role: 'manager', workLoop: 'sales' });
      expect(workLoopForUser(user)).toBe('manager');
    });

    it('viewer role with explicit workLoop still returns viewer (role takes precedence)', () => {
      const user = makeUser({ role: 'viewer', workLoop: 'sales' });
      expect(workLoopForUser(user)).toBe('viewer');
    });
  });

  describe('owner role always wins', () => {
    it('returns "owner" regardless of workLoop value', () => {
      const user = makeUser({ role: 'owner', workLoop: 'sales' });
      expect(workLoopForUser(user)).toBe('owner');
    });

    it('returns "owner" even when workLoop is null', () => {
      const user = makeUser({ role: 'owner', workLoop: null });
      expect(workLoopForUser(user)).toBe('owner');
    });
  });

  describe('legacy substring fallback when workLoop is null/undefined', () => {
    it('falls back to legacy logic when workLoop is null on an operator', () => {
      const user = makeUser({ role: 'operator', workLoop: null, email: 'sales-person@example.com' });
      expect(workLoopForUser(user)).toBe('sales');
    });

    it('falls back to legacy logic when workLoop is undefined on an operator', () => {
      const user = { id: 'u', name: 'x', email: 'intake@example.com', role: 'operator' as const } as unknown as SessionUser;
      expect(workLoopForUser(user)).toBe('intake');
    });

    it('falls back to "operator" default when nothing matches', () => {
      const user = makeUser({ role: 'operator', workLoop: null, email: 'nothing@example.com', name: 'Plain' });
      expect(workLoopForUser(user)).toBe('operator');
    });
  });

  describe('null/undefined user', () => {
    it('returns null for null user', () => {
      expect(workLoopForUser(null)).toBe(null);
    });

    it('returns null for undefined user', () => {
      expect(workLoopForUser(undefined)).toBe(null);
    });
  });
});

describe('legacyWorkLoopFromSubstring — preserved verbatim from pre-#21-slice-1 behaviour', () => {
  it('detects sales via email substring', () => {
    expect(legacyWorkLoopFromSubstring(makeUser({ email: 'salesperson@example.com', name: '' }))).toBe('sales');
  });

  it('detects sales via name substring', () => {
    expect(legacyWorkLoopFromSubstring(makeUser({ email: 'x@example.com', name: 'Sales Lead' }))).toBe('sales');
  });

  it('detects intake via "intake" substring', () => {
    expect(legacyWorkLoopFromSubstring(makeUser({ email: 'intake@example.com', name: '' }))).toBe('intake');
  });

  it('detects intake via "receiv" substring (covers receiving, receiver, etc.)', () => {
    expect(legacyWorkLoopFromSubstring(makeUser({ email: 'receiving@example.com', name: '' }))).toBe('intake');
    expect(legacyWorkLoopFromSubstring(makeUser({ email: 'receiver@example.com', name: '' }))).toBe('intake');
  });

  it('detects warehouse via "warehouse" substring', () => {
    expect(legacyWorkLoopFromSubstring(makeUser({ email: 'warehouse@example.com', name: '' }))).toBe('warehouse');
  });

  it('detects warehouse via "fulfill" substring', () => {
    expect(legacyWorkLoopFromSubstring(makeUser({ email: 'fulfillment@example.com', name: '' }))).toBe('warehouse');
  });

  it('detects warehouse via "pack" substring', () => {
    expect(legacyWorkLoopFromSubstring(makeUser({ email: 'packer@example.com', name: '' }))).toBe('warehouse');
  });

  it('defaults to "operator" when no substring matches', () => {
    expect(legacyWorkLoopFromSubstring(makeUser({ email: 'foo@example.com', name: 'Generic' }))).toBe('operator');
  });

  it('is case-insensitive', () => {
    expect(legacyWorkLoopFromSubstring(makeUser({ email: 'SALES@example.com', name: '' }))).toBe('sales');
    expect(legacyWorkLoopFromSubstring(makeUser({ email: 'x@example.com', name: 'PACK Team' }))).toBe('warehouse');
  });
});

describe('backfill SQL heuristic must exactly mirror legacyWorkLoopFromSubstring', () => {
  // This test documents the SQL backfill semantics. The migration 0044_users_work_loop.sql
  // updates rows in this priority order; we mirror that exact order here and assert
  // it produces the same WorkLoop value the TypeScript legacy code would.
  //
  // The migration writes one of these SQL-level values into work_loop:
  //   - 'sales' for lower(email|name) LIKE '%sales%'
  //   - 'intake' for '%intake%' OR '%receiv%'
  //   - 'warehouse' for '%warehouse%' OR '%fulfill%' OR '%pack%'
  // No backfill row → column stays NULL → runtime falls back to legacy code,
  // which would have returned 'operator'. By design the migration leaves the
  // operator default to the runtime fallback so we never burn the default into
  // the database.

  function backfillSimulation(email: string, name: string): string | null {
    const haystack = `${email} ${name}`.toLowerCase();
    if (haystack.includes('sales')) return 'sales';
    if (haystack.includes('intake') || haystack.includes('receiv')) return 'intake';
    if (haystack.includes('warehouse') || haystack.includes('fulfill') || haystack.includes('pack')) return 'warehouse';
    return null; // NULL — runtime falls back to legacy → 'operator'
  }

  const fixtures: Array<{ email: string; name: string }> = [
    { email: 'salesperson@example.com', name: '' },
    { email: 'intake@example.com', name: '' },
    { email: 'receiving@example.com', name: '' },
    { email: 'warehouse@example.com', name: '' },
    { email: 'fulfillment@example.com', name: '' },
    { email: 'packer@example.com', name: '' },
    { email: 'foo@example.com', name: 'Generic' },
    { email: 'x@example.com', name: 'Sales Lead' },
    { email: 'x@example.com', name: 'Pack Team' },
    { email: 'multi@example.com', name: 'sales-intake' }, // sales wins (declared first)
    { email: 'multi@example.com', name: 'intake-fulfill' } // intake wins (declared before warehouse)
  ];

  it.each(fixtures)('backfill($email,$name) === legacy($email,$name)', ({ email, name }) => {
    const backfilled = backfillSimulation(email, name);
    const legacy = legacyWorkLoopFromSubstring(makeUser({ email, name, role: 'operator', workLoop: null }));
    // For non-matching rows, backfill returns null and runtime would fall back to operator.
    // We verify that calling workLoopForUser with workLoop=backfilled gives the same answer
    // as the legacy function did on the unmigrated user.
    const migratedUser = makeUser({ email, name, role: 'operator', workLoop: backfilled as SessionUser['workLoop'] });
    expect(workLoopForUser(migratedUser)).toBe(legacy);
  });
});
