import {
  bulkCommandInputSchema,
  commandInputSchema,
  type BulkCommandRow,
  type BulkCommandRowResult,
} from '../../shared/schemas';
import { MONEY_MUTATING_COMMANDS } from '../../shared/commandCatalog';
import { executeCommand } from '../services/commandBus';
import { db } from '../db';
import { assertCommandAccess } from '../rbac';
import { protectedProcedure, router, scrubDatabaseError } from '../trpc';

export const commandsRouter = router({
  run: protectedProcedure.input(commandInputSchema).mutation(async ({ ctx, input }) => {
    return executeCommand(input, ctx.user, ctx.io);
  }),

  runBulk: protectedProcedure
    .input(bulkCommandInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { groupKey, reason, commands } = input;
      const { user, io } = ctx;

      // 1. Partition commands into money vs non-money cohorts
      const moneyRows: { index: number; row: BulkCommandRow }[] = [];
      const nonMoneyRows: { index: number; row: BulkCommandRow }[] = [];

      commands.forEach((cmd, i) => {
        if (MONEY_MUTATING_COMMANDS.has(cmd.commandName)) {
          moneyRows.push({ index: i, row: cmd });
        } else {
          nonMoneyRows.push({ index: i, row: cmd });
        }
      });

      const results: BulkCommandRowResult[] = new Array(commands.length);

      // 2. Process money cohort first inside an outer transaction.
      //    Each money command still runs in its own executeCommand transaction,
      //    but the outer db.transaction provides a guard rail: if any command
      //    throws (idempotency conflict, auth failure, or handler error that
      //    surfaces), the outer txn rolls back and all money rows are marked
      //    rolled_back. Commands that already ran inside their own inner txn
      //    remain committed — this is tradeoff documented in run-bulk.md §1.3.
      let moneyCohort: 'na' | 'committed' | 'rolled_back' = 'na';

      if (moneyRows.length > 0) {
        try {
          await db.transaction(async (_tx) => {
            for (const { index, row } of moneyRows) {
              assertCommandAccess(user, row.commandName);
              const result = await executeCommand(
                {
                  name: row.commandName,
                  idempotencyKey: row.idempotencyKey,
                  reason,
                  payload: row.payload,
                },
                user,
                io,
              );
              if (!result.ok) {
                throw new Error(
                  `Money command ${row.commandName} failed: ${result.toast ?? 'Unknown error'}`,
                );
              }
              results[index] = {
                idempotencyKey: row.idempotencyKey,
                status: 'success',
                bulkSequence: index,
                commandResult: result,
              };
            }
          });
          moneyCohort = 'committed';
        } catch (err) {
          moneyCohort = 'rolled_back';
          const { safeMessage } = scrubDatabaseError(err);
          for (const { index, row } of moneyRows) {
            // Only fill in rolled_back for rows that didn't already succeed
            if (!results[index]) {
              results[index] = {
                idempotencyKey: row.idempotencyKey,
                status: 'rolled_back',
                bulkSequence: index,
                error: { code: 'ROLLED_BACK', message: safeMessage },
              };
            }
          }
        }
      }

      // 3. Process non-money cohort — each row runs independently.
      //    executeCommand internally handles atomic claim, idempotency replay,
      //    transaction, journal, and broadcast.
      for (const { index, row } of nonMoneyRows) {
        try {
          assertCommandAccess(user, row.commandName);
          const result = await executeCommand(
            {
              name: row.commandName,
              idempotencyKey: row.idempotencyKey,
              reason,
              payload: row.payload,
            },
            user,
            io,
          );
          results[index] = {
            idempotencyKey: row.idempotencyKey,
            status: result.ok ? 'success' : 'failed',
            bulkSequence: index,
            commandResult: result.ok ? result : undefined,
            error: result.ok
              ? undefined
              : { code: 'COMMAND_FAILED' as const, message: result.toast ?? 'Command failed' },
          };
        } catch (err) {
          const { safeMessage } = scrubDatabaseError(err);
          results[index] = {
            idempotencyKey: row.idempotencyKey,
            status: 'failed',
            bulkSequence: index,
            error: { code: 'COMMAND_FAILED', message: safeMessage },
          };
        }
      }

      // 4. Compute aggregates
      const succeeded = results.filter((r) => r?.status === 'success').length;
      const failed = results.filter((r) => r?.status === 'failed').length;
      const skipped = results.filter((r) => r?.status === 'skipped').length;
      const rolledBack = results.filter((r) => r?.status === 'rolled_back').length;

      return {
        groupKey,
        totalCommands: commands.length,
        succeeded,
        failed,
        skipped,
        rolledBack,
        moneyCohort,
        results,
      };
    }),
});
