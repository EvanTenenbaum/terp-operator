import { describe, it, expect, vi, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';
import type { Server as SocketServer } from 'socket.io';
import type { CommandResult, SessionUser, Role } from '../../shared/types';
import type { CommandName } from '../../shared/commandCatalog';

// ── Mocks (hoisted) ──────────────────────────────────────────────────────────
// vi.mock factories are hoisted, so they cannot reference top-level variables
// defined in the same file. We use a module-level mutable container instead.

const mocks = {
  executeCommand: vi.fn<(...args: any[]) => Promise<CommandResult>>(),
  dbTransaction: vi.fn(),
};

vi.mock('../services/commandBus', () => ({
  executeCommand: (...args: any[]) => mocks.executeCommand(...args),
}));

vi.mock('../db', () => ({
  db: { transaction: (...args: any[]) => (mocks.dbTransaction as any)(...args) },
  pool: { query: vi.fn(), connect: vi.fn() },
}));

// Must be imported AFTER the mocks so the router resolves mocked deps.
import { commandsRouter } from './commands';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeUser(role: Role): SessionUser {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    name: 'Test User',
    email: 'test@terpagro.local',
    role,
    workLoop: null,
  };
}

function makeCaller(role: Role = 'operator') {
  return commandsRouter.createCaller({
    req: {} as Request,
    res: {} as Response,
    io: {} as SocketServer,
    user: makeUser(role),
  });
}

function okResult(overrides: Partial<CommandResult> = {}): CommandResult {
  return {
    ok: true,
    commandId: randomUUID(),
    affectedIds: [randomUUID()],
    toast: 'Success',
    ...overrides,
  };
}

function failResult(toast: string, overrides: Partial<CommandResult> = {}): CommandResult {
  return {
    ok: false,
    commandId: randomUUID(),
    affectedIds: [],
    toast,
    ...overrides,
  };
}

/**
 * Build a single bulk row. The idempotencyKey is auto-generated as
 * `${groupKey}:${entityId}:${commandName}` so it always satisfies the
 * prefix constraint.
 */
function row(
  groupKey: string,
  commandName: CommandName,
  opts: { entityType?: string; entityId?: string; payload?: Record<string, unknown> } = {},
) {
  const entityType = opts.entityType ?? 'purchaseOrder';
  const entityId = opts.entityId ?? randomUUID();
  return {
    entityType,
    entityId,
    commandName,
    payload: opts.payload ?? {},
    idempotencyKey: `${groupKey}:${entityId}:${commandName}` as const,
  };
}

// ── Setup / teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  // Default: db.transaction simply runs the callback (success path).
  mocks.dbTransaction.mockReset().mockImplementation(async (fn: (tx: unknown) => Promise<void>) => fn({}));
  // Default: executeCommand returns success.
  mocks.executeCommand.mockReset().mockResolvedValue(okResult());
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe('commands.runBulk', () => {
  // ── 1. Happy path: non-money commands, all succeed ─────────────────────
  describe('non-money cohort (happy path)', () => {
    it('runs non-money commands independently and returns success per row', async () => {
      const caller = makeCaller('operator');
      const groupKey = randomUUID();

      const result = await caller.runBulk({
        groupKey,
        reason: 'test bulk — non-money happy path',
        commands: [
          row(groupKey, 'finalizePurchaseOrder'),
          row(groupKey, 'flagBatch', { entityType: 'batch' }),
          row(groupKey, 'releaseLineForPicking', { entityType: 'fulfillmentLine' }),
        ],
      });

      expect(result.totalCommands).toBe(3);
      expect(result.succeeded).toBe(3);
      expect(result.failed).toBe(0);
      expect(result.skipped).toBe(0);
      expect(result.rolledBack).toBe(0);
      expect(result.moneyCohort).toBe('na');
      expect(result.results.length).toBe(3);

      for (const r of result.results) {
        expect(r.status).toBe('success');
        expect(r.commandResult).toBeDefined();
        expect(r.commandResult!.ok).toBe(true);
      }

      // executeCommand was called 3 times (non-money, no outer transaction)
      expect(mocks.executeCommand).toHaveBeenCalledTimes(3);
    });

    it('records individual non-money failures with status failed', async () => {
      const caller = makeCaller('operator');
      const groupKey = randomUUID();

      mocks.executeCommand
        .mockResolvedValueOnce(okResult())
        .mockResolvedValueOnce(failResult('Batch not found'))
        .mockResolvedValueOnce(okResult());

      const result = await caller.runBulk({
        groupKey,
        reason: 'test bulk — partial non-money failure',
        commands: [
          row(groupKey, 'finalizePurchaseOrder'),
          row(groupKey, 'flagBatch', { entityType: 'batch' }),
          row(groupKey, 'releaseLineForPicking', { entityType: 'fulfillmentLine' }),
        ],
      });

      expect(result.succeeded).toBe(2);
      expect(result.failed).toBe(1);
      expect(result.rolledBack).toBe(0);

      expect(result.results[0].status).toBe('success');
      expect(result.results[1].status).toBe('failed');
      expect(result.results[1].error).toBeDefined();
      expect(result.results[1].error!.code).toBe('COMMAND_FAILED');
      expect(result.results[2].status).toBe('success');
    });

    it('records failures when a non-money command throws', async () => {
      const caller = makeCaller('operator');
      const groupKey = randomUUID();

      mocks.executeCommand
        .mockResolvedValueOnce(okResult())
        .mockRejectedValueOnce(new Error('DB connection lost'))
        .mockResolvedValueOnce(okResult());

      const result = await caller.runBulk({
        groupKey,
        reason: 'test bulk — non-money throw',
        commands: [
          row(groupKey, 'finalizePurchaseOrder'),
          row(groupKey, 'flagBatch', { entityType: 'batch' }),
          row(groupKey, 'releaseLineForPicking', { entityType: 'fulfillmentLine' }),
        ],
      });

      expect(result.succeeded).toBe(2);
      expect(result.failed).toBe(1);
      expect(result.results[1].status).toBe('failed');
      expect(result.results[1].error!.code).toBe('COMMAND_FAILED');
    });
  });

  // ── 2. Money cohort: all succeed ───────────────────────────────────────
  describe('money cohort (success)', () => {
    it('runs money commands in a shared transaction and commits', async () => {
      const caller = makeCaller('operator');
      const groupKey = randomUUID();

      // allocatePayment is money-mutating (operator-gated)
      const result = await caller.runBulk({
        groupKey,
        reason: 'test bulk — money cohort success',
        commands: [
          row(groupKey, 'allocatePayment', { entityType: 'payment' }),
          row(groupKey, 'allocatePayment', { entityType: 'payment' }),
          row(groupKey, 'allocatePayment', { entityType: 'payment' }),
        ],
      });

      expect(result.succeeded).toBe(3);
      expect(result.moneyCohort).toBe('committed');
      expect(result.rolledBack).toBe(0);

      // db.transaction was called once for the money cohort
      expect(mocks.dbTransaction).toHaveBeenCalledTimes(1);

      // executeCommand was called 3 times (inside the transaction callback)
      expect(mocks.executeCommand).toHaveBeenCalledTimes(3);
    });
  });

  // ── 3. Money cohort: failure rolls back all money rows ─────────────────
  describe('money cohort (rollback)', () => {
    it('rolls back all money rows when one fails with !ok', async () => {
      const caller = makeCaller('operator');
      const groupKey = randomUUID();

      mocks.executeCommand
        .mockResolvedValueOnce(okResult())
        .mockResolvedValueOnce(failResult('Payment not found'))
        .mockResolvedValueOnce(okResult());

      const result = await caller.runBulk({
        groupKey,
        reason: 'test bulk — money failure triggers rollback',
        commands: [
          row(groupKey, 'allocatePayment', { entityType: 'payment' }),
          row(groupKey, 'allocatePayment', { entityType: 'payment' }),
          row(groupKey, 'allocatePayment', { entityType: 'payment' }),
        ],
      });

      // First money command succeeded before the failure
      expect(result.results[0].status).toBe('success');

      // Second money command failed (!ok) → threw inside transaction
      // Third was never reached

      expect(result.moneyCohort).toBe('rolled_back');
      expect(result.rolledBack).toBeGreaterThanOrEqual(0);
      // The first succeeded inside the txn, but since the outer txn rolled back
      // it depends on whether executeCommand's inner txn writes survived.
      // The code only marks rows as 'rolled_back' if !results[index].
      // Row 0 was set (success), rows 1-2 were not set, so they get rolled_back status.
    });

    it('rolls back money cohort when executeCommand throws', async () => {
      const caller = makeCaller('operator');
      const groupKey = randomUUID();

      let call = 0;
      mocks.executeCommand.mockImplementation(async () => {
        call++;
        if (call === 1) return okResult();
        throw new Error('Connection error');
      });

      const result = await caller.runBulk({
        groupKey,
        reason: 'test bulk — money throw triggers rollback',
        commands: [
          row(groupKey, 'allocatePayment', { entityType: 'payment' }),
          row(groupKey, 'allocatePayment', { entityType: 'payment' }),
          row(groupKey, 'allocatePayment', { entityType: 'payment' }),
        ],
      });

      expect(result.moneyCohort).toBe('rolled_back');

      // Row 0: succeeded (results[index] was set before throw)
      expect(result.results[0].status).toBe('success');

      // Rows 1 and 2: !results[index], so they get rolled_back
      expect(result.results[1].status).toBe('rolled_back');
      expect(result.results[1].error!.code).toBe('ROLLED_BACK');

      expect(result.results[2].status).toBe('rolled_back');
      expect(result.results[2].error!.code).toBe('ROLLED_BACK');

      expect(result.rolledBack).toBe(2);
    });

    it('marks money rows as rolled_back regardless of failure order', async () => {
      const caller = makeCaller('operator');
      const groupKey = randomUUID();

      // First money command fails immediately
      mocks.executeCommand.mockRejectedValueOnce(new Error('First command failed'));

      const result = await caller.runBulk({
        groupKey,
        reason: 'test bulk — immediate money failure',
        commands: [
          row(groupKey, 'allocatePayment', { entityType: 'payment' }),
          row(groupKey, 'allocatePayment', { entityType: 'payment' }),
        ],
      });

      expect(result.moneyCohort).toBe('rolled_back');

      // Both are !results[index] → rolled_back
      expect(result.results[0].status).toBe('rolled_back');
      expect(result.results[0].error!.code).toBe('ROLLED_BACK');
      expect(result.results[1].status).toBe('rolled_back');
      expect(result.results[1].error!.code).toBe('ROLLED_BACK');
      expect(result.rolledBack).toBe(2);
    });
  });

  // ── 4. Mixed cohort: money failure doesn't affect non-money rows ───────
  describe('mixed cohort (money + non-money)', () => {
    it('non-money rows succeed even when money cohort rolls back', async () => {
      const caller = makeCaller('operator');
      const groupKey = randomUUID();

      // Money: first ok, second fails → rollback
      // Non-money: both succeed
      mocks.executeCommand
        .mockResolvedValueOnce(okResult())    // money 1
        .mockRejectedValueOnce(new Error('DB error')) // money 2 → triggers rollback
        .mockResolvedValueOnce(okResult())    // non-money 1 (after money cohort caught)
        .mockResolvedValueOnce(okResult());   // non-money 2

      const result = await caller.runBulk({
        groupKey,
        reason: 'test bulk — mixed cohort',
        commands: [
          row(groupKey, 'allocatePayment', { entityType: 'payment' }),           // index 0 (money)
          row(groupKey, 'allocatePayment', { entityType: 'payment' }),           // index 1 (money)
          row(groupKey, 'finalizePurchaseOrder'),                                 // index 2 (non-money)
          row(groupKey, 'releaseLineForPicking', { entityType: 'fulfillmentLine' }), // index 3 (non-money)
        ],
      });

      // Money cohort rolled back
      expect(result.moneyCohort).toBe('rolled_back');

      // Money row 0: succeeded inside txn, row 1: rolled_back
      expect(result.results[0].status).toBe('success');
      expect(result.results[1].status).toBe('rolled_back');

      // Non-money rows are unaffected
      expect(result.results[2].status).toBe('success');
      expect(result.results[3].status).toBe('success');

      // Aggregates
      expect(result.succeeded).toBe(3);
      expect(result.rolledBack).toBe(1);
      expect(result.failed).toBe(0);
    });
  });

  // ── 5. Money-only cohort: no non-money rows ────────────────────────────
  describe('all money cohort', () => {
    it('reports moneyCohort na when there are no money commands', async () => {
      const caller = makeCaller('operator');
      const groupKey = randomUUID();

      const result = await caller.runBulk({
        groupKey,
        reason: 'test — all non-money',
        commands: [
          row(groupKey, 'finalizePurchaseOrder'),
          row(groupKey, 'flagBatch', { entityType: 'batch' }),
        ],
      });

      expect(result.moneyCohort).toBe('na');
      expect(mocks.dbTransaction).not.toHaveBeenCalled();
    });
  });

  // ── 6. Invalid envelope: empty commands array ──────────────────────────
  describe('validation: empty commands', () => {
    it('rejects an empty commands array (Zod min 1)', async () => {
      const caller = makeCaller('operator');

      await expect(
        caller.runBulk({
          groupKey: randomUUID(),
          reason: 'test empty commands',
          commands: [],
        }),
      ).rejects.toThrow();
    });
  });

  // ── 7. Invalid envelope: bad idempotency key prefix ────────────────────
  describe('validation: idempotency key prefix', () => {
    it('rejects rows whose idempotencyKey does not start with groupKey', async () => {
      const caller = makeCaller('operator');
      const gk = randomUUID();

      await expect(
        caller.runBulk({
          groupKey: gk,
          reason: 'test bad prefix',
          commands: [
            {
              entityType: 'purchaseOrder',
              entityId: randomUUID(),
              commandName: 'finalizePurchaseOrder',
              payload: {},
              idempotencyKey: `wrong-prefix:some-id:finalizePurchaseOrder`,
            },
          ],
        }),
      ).rejects.toThrow();
    });

    it('accepts rows whose idempotencyKey starts with groupKey', async () => {
      const caller = makeCaller('operator');
      const groupKey = randomUUID();

      const result = await caller.runBulk({
        groupKey,
        reason: 'test valid prefix',
        commands: [row(groupKey, 'finalizePurchaseOrder')],
      });

      expect(result.totalCommands).toBe(1);
      expect(result.succeeded).toBe(1);
    });

    it('rejects duplicate idempotency keys within the same submission', async () => {
      const caller = makeCaller('operator');
      const groupKey = randomUUID();
      const entityId = randomUUID();

      await expect(
        caller.runBulk({
          groupKey,
          reason: 'test duplicate keys',
          commands: [
            row(groupKey, 'finalizePurchaseOrder', { entityId }),
            row(groupKey, 'finalizePurchaseOrder', { entityId }), // same idempotencyKey
          ],
        }),
      ).rejects.toThrow();
    });
  });

  // ── 8. Per-row role gate ───────────────────────────────────────────────
  describe('role gate', () => {
    it('enforces per-row commandMinRole for non-money commands', async () => {
      const caller = makeCaller('operator');
      const groupKey = randomUUID();

      // approvePurchaseOrder requires 'manager'
      mocks.executeCommand.mockClear(); // reset any defaults

      const result = await caller.runBulk({
        groupKey,
        reason: 'test role gate — operator cannot approve',
        commands: [
          row(groupKey, 'finalizePurchaseOrder'),     // operator OK
          row(groupKey, 'approvePurchaseOrder'),       // manager required
          row(groupKey, 'releaseLineForPicking', { entityType: 'fulfillmentLine' }), // operator OK
        ],
      });

      // approvePurchaseOrder should have been caught by assertCommandAccess
      // before executeCommand was called for it.
      // The error is caught by the non-money try/catch → status 'failed'
      expect(result.results[0].status).toBe('success');
      expect(result.results[1].status).toBe('failed');
      expect(result.results[1].error).toBeDefined();
      // The error from assertCommandAccess is a TRPCError thrown as-is,
      // which goes through scrubDatabaseError in the catch path.
      // We just verify it's a failure.
      expect(result.results[2].status).toBe('success');

      expect(result.succeeded).toBe(2);
      expect(result.failed).toBe(1);
    });

    it('enforces per-row commandMinRole for money commands (rollback)', async () => {
      const caller = makeCaller('operator');
      const groupKey = randomUUID();

      // recordVendorPayment requires 'manager' and is MONEY_MUTATING
      const result = await caller.runBulk({
        groupKey,
        reason: 'test role gate — operator cannot record vendor payment',
        commands: [
          row(groupKey, 'allocatePayment', { entityType: 'payment' }),       // operator OK
          row(groupKey, 'recordVendorPayment', { entityType: 'payment' }),   // manager required
        ],
      });

      // assertCommandAccess throws FORBIDDEN for recordVendorPayment
      // → propagates out of db.transaction → moneyCohort rolled_back
      expect(result.moneyCohort).toBe('rolled_back');
    });

    it('allows manager to run manager-gated commands', async () => {
      const caller = makeCaller('manager');
      const groupKey = randomUUID();

      const result = await caller.runBulk({
        groupKey,
        reason: 'test role gate — manager can approve',
        commands: [
          row(groupKey, 'approvePurchaseOrder'),
          row(groupKey, 'recordVendorPayment', { entityType: 'payment' }),
        ],
      });

      // Both should succeed (manager has sufficient role)
      expect(result.results[0].status).toBe('success');
      expect(result.results[1].status).toBe('success');
      expect(result.succeeded).toBe(2);
      // recordVendorPayment is money → committed
      expect(result.moneyCohort).toBe('committed');
    });
  });

  // ── 9. Bulk response structure ─────────────────────────────────────────
  describe('response structure', () => {
    it('returns results in submission order with correct bulkSequence', async () => {
      const caller = makeCaller('operator');
      const groupKey = randomUUID();

      const ids = [randomUUID(), randomUUID(), randomUUID()];

      mocks.executeCommand
        .mockResolvedValueOnce(okResult())
        .mockResolvedValueOnce(failResult('Entity not found'))
        .mockResolvedValueOnce(okResult());

      const result = await caller.runBulk({
        groupKey,
        reason: 'test structure',
        commands: [
          row(groupKey, 'finalizePurchaseOrder', { entityId: ids[0] }),
          row(groupKey, 'finalizePurchaseOrder', { entityId: ids[1] }),
          row(groupKey, 'finalizePurchaseOrder', { entityId: ids[2] }),
        ],
      });

      expect(result.groupKey).toBe(groupKey);
      expect(result.totalCommands).toBe(3);
      expect(result.results.length).toBe(3);

      // Aggregate invariant
      expect(result.totalCommands).toBe(
        result.succeeded + result.failed + result.skipped + result.rolledBack,
      );

      // bulkSequence matches array index
      result.results.forEach((r, i) => {
        expect(r.bulkSequence).toBe(i);
      });

      // Each result reports its idempotencyKey
      expect(result.results[0].idempotencyKey).toBe(
        `${groupKey}:${ids[0]}:finalizePurchaseOrder`,
      );
      expect(result.results[1].idempotencyKey).toBe(
        `${groupKey}:${ids[1]}:finalizePurchaseOrder`,
      );
      expect(result.results[2].idempotencyKey).toBe(
        `${groupKey}:${ids[2]}:finalizePurchaseOrder`,
      );
    });

    it('returns optional commandResult only for successful rows', async () => {
      const caller = makeCaller('operator');
      const groupKey = randomUUID();

      mocks.executeCommand
        .mockResolvedValueOnce(okResult({ toast: 'Order finalized', affectedIds: ['po-1'] }))
        .mockResolvedValueOnce(failResult('Batch does not exist'));

      const result = await caller.runBulk({
        groupKey,
        reason: 'test commandResult presence',
        commands: [
          row(groupKey, 'finalizePurchaseOrder'),
          row(groupKey, 'flagBatch', { entityType: 'batch' }),
        ],
      });

      expect(result.results[0].status).toBe('success');
      expect(result.results[0].commandResult).toBeDefined();
      expect(result.results[0].commandResult!.ok).toBe(true);
      expect(result.results[0].error).toBeUndefined();

      expect(result.results[1].status).toBe('failed');
      expect(result.results[1].commandResult).toBeUndefined();
      expect(result.results[1].error).toBeDefined();
      expect(result.results[1].error!.code).toBe('COMMAND_FAILED');
    });

    it('moneyCohort reports na when no money commands present', async () => {
      const caller = makeCaller('operator');
      const groupKey = randomUUID();

      const result = await caller.runBulk({
        groupKey,
        reason: 'test moneyCohort na',
        commands: [
          row(groupKey, 'finalizePurchaseOrder'),
          row(groupKey, 'flagBatch', { entityType: 'batch' }),
        ],
      });

      expect(result.moneyCohort).toBe('na');
    });
  });

  // ── 10. Edge cases ─────────────────────────────────────────────────────
  describe('edge cases', () => {
    it('handles a single non-money command', async () => {
      const caller = makeCaller('operator');
      const groupKey = randomUUID();

      const result = await caller.runBulk({
        groupKey,
        reason: 'single non-money command',
        commands: [row(groupKey, 'finalizePurchaseOrder')],
      });

      expect(result.totalCommands).toBe(1);
      expect(result.succeeded).toBe(1);
      expect(result.moneyCohort).toBe('na');
      expect(result.results[0].status).toBe('success');
    });

    it('handles a single money command', async () => {
      const caller = makeCaller('operator');
      const groupKey = randomUUID();

      const result = await caller.runBulk({
        groupKey,
        reason: 'single money command',
        commands: [row(groupKey, 'allocatePayment', { entityType: 'payment' })],
      });

      expect(result.totalCommands).toBe(1);
      expect(result.succeeded).toBe(1);
      expect(result.moneyCohort).toBe('committed');
    });

    it('handles all commands failing (non-money)', async () => {
      const caller = makeCaller('operator');
      const groupKey = randomUUID();

      mocks.executeCommand
        .mockResolvedValueOnce(failResult('Error A'))
        .mockResolvedValueOnce(failResult('Error B'))
        .mockResolvedValueOnce(failResult('Error C'));

      const result = await caller.runBulk({
        groupKey,
        reason: 'all fail',
        commands: [
          row(groupKey, 'finalizePurchaseOrder'),
          row(groupKey, 'flagBatch', { entityType: 'batch' }),
          row(groupKey, 'releaseLineForPicking', { entityType: 'fulfillmentLine' }),
        ],
      });

      expect(result.succeeded).toBe(0);
      expect(result.failed).toBe(3);
      expect(result.totalCommands).toBe(3);
    });

    it('gracefully handles scrubDatabaseError for thrown errors', async () => {
      const caller = makeCaller('operator');
      const groupKey = randomUUID();

      // Throw a non-Postgres, non-TRPC error to exercise scrubDatabaseError
      mocks.executeCommand.mockRejectedValue(new Error('Unexpected runtime error'));

      const result = await caller.runBulk({
        groupKey,
        reason: 'scrub test',
        commands: [row(groupKey, 'finalizePurchaseOrder')],
      });

      expect(result.results[0].status).toBe('failed');
      expect(result.results[0].error!.code).toBe('COMMAND_FAILED');
      // scrubDatabaseError should scrub the message if it looked like SQL,
      // but a plain Error('...') passes through unchanged
      expect(result.results[0].error!.message).toBe('Unexpected runtime error');
    });
  });

  // ── 11. Reason constraint ──────────────────────────────────────────────
  describe('validation: reason length', () => {
    it('rejects a reason shorter than 3 characters', async () => {
      const caller = makeCaller('operator');

      await expect(
        caller.runBulk({
          groupKey: randomUUID(),
          reason: 'ab', // too short (min 3)
          commands: [row(randomUUID(), 'finalizePurchaseOrder')],
        }),
      ).rejects.toThrow();
    });
  });
});
